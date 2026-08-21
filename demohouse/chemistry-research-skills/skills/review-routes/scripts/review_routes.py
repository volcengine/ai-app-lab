#!/usr/bin/env python3
"""Review existing synthesis routes with deterministic evidence contracts."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import platform
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence

SCHEMA_VERSION = "1.0.0"
WORKFLOW = "review-routes"
RULESET_VERSION = "1.1.0"
INPUT_PROFILES = {
    "normalized_route_v1",
    "aizynthfinder_json",
    "paroutes_v2_json",
}
REVIEW_STATUSES = {"completed", "partial", "not_run", "error"}
DISPOSITIONS = {"ready_for_expert_review", "review_required", "blocked"}
PRECEDENT_LEVELS = {
    "exact_record",
    "exact_transformation",
    "similar_reaction",
    "component_only",
    "completed_zero_hits",
    "source_timeout",
    "source_error",
    "blocked",
    "not_run",
}
MAX_ROUTES = 20
MAX_STEPS_PER_ROUTE = 50
MAX_TOTAL_NODES = 5000
MAX_STEP_ARTIFACTS = MAX_ROUTES * MAX_STEPS_PER_ROUTE
TEMPORAL_KEYS = {
    "generated_at_utc",
    "runtime_seconds",
    "retrieved_at_utc",
    "elapsed_seconds",
    "result_fingerprint",
}
SECRET_RE = re.compile(
    r"(?-i:ark-)[A-Za-z0-9_-]{12,}|"
    r"Bearer\s+[A-Za-z0-9._~+/=-]{12,}|"
    r"(?:Authorization|Cookie|Token|Api[_ -]?Key)\s*[:=]\s*\S{12,}",
    re.IGNORECASE,
)

RULE_MESSAGES = {
    "E-INPUT-SCHEMA-001": "输入字段、枚举或显式选项不符合冻结合同。",
    "E-INPUT-HASH-001": "来源或路线缺少有效 SHA-256。",
    "E-RESOURCE-LIMIT-001": "路线、步骤、节点或 artifact 超过首版资源上限。",
    "E-ROUTE-ID-001": "route_id 缺失或批内重复。",
    "E-ROUTE-TOPOLOGY-001": "路线不是单根、连通、无环的 mol/reaction 交替树。",
    "E-MOLECULE-STRUCTURE-001": "路线分子结构缺失或 RDKit 无法解析。",
    "E-STEP-REACTION-001": "路线步骤无法形成与父产品一致的单步反应。",
    "E-ARTIFACT-FINGERPRINT-001": "上游 artifact 指纹缺失、类型错误或内容不匹配。",
    "E-STEP-HASH-MISMATCH-001": "step artifact 未绑定到当前 step reaction hash。",
    "E-CURATION-ARTIFACT-CONTRACT-001": "curate-reactions artifact 不符合冻结消费合同。",
    "E-CURATION-BINDING-001": "curation_record_id 无法精确绑定唯一 curate record。",
    "E-CURATION-REJECTED-001": "步骤被 curate-reactions 拒绝，路线不得进入 ready 状态。",
    "E-PRECEDENT-ARTIFACT-CONTRACT-001": "search-reactions artifact 不符合冻结消费合同。",
    "E-PRECEDENT-BINDING-001": "Search query/results 无法绑定当前路线步骤。",
    "E-PRECEDENT-BLOCKED-001": "先例搜索请求或上游语料合同已被 Search 正式阻断。",
    "E-PROFILE-MISMATCH-001": "同一步先例 artifact 混入多个不可比 fingerprint profile。",
    "E-PICKLE-INPUT-001": "禁止读取 pickle 或其他可执行反序列化格式。",
    "W-TARGET-MISMATCH-001": "请求目标与路线根分子不一致。",
    "W-CURATION-NOT-RUN-001": "步骤尚未提供 curate-reactions 证据。",
    "W-CURATION-REVIEW-001": "步骤继承 curate-reactions 人工复核状态。",
    "W-PRECEDENT-SIMILAR-001": "步骤只有相似反应先例，不证明该步骤可行。",
    "W-PRECEDENT-COMPONENT-001": "步骤只有组分级命中，不等于转化先例。",
    "W-PRECEDENT-ZERO-001": "当前 provider/query 返回 0 hit，不代表不存在先例。",
    "W-PRECEDENT-TIMEOUT-001": "先例 provider 超时，不能解释为 0 hit。",
    "W-PRECEDENT-ERROR-001": "先例 provider 错误，不能解释为 0 hit。",
    "W-PRECEDENT-NOT-RUN-001": "步骤尚未执行先例检索。",
    "W-PRECEDENT-PARTIAL-001": "先例搜索仅部分完成，结果必须人工复核。",
    "W-PRECEDENT-RESULT-REVIEW-001": "至少一条先例结果继承上游人工复核状态。",
    "W-INVENTORY-MISSING-001": "缺少可审计库存快照或终端前体状态。",
    "W-INVENTORY-LICENSE-001": "库存快照缺少明确许可。",
    "W-SOURCE-LICENSE-001": "路线或先例来源缺少明确许可。",
    "W-CONSTRAINT-VIOLATION-001": "路线违反用户显式提供的项目约束。",
    "W-ROUTE-DUPLICATE-001": "路线与其他候选具有相同结构签名，仅分组不删除。",
}


class DependencyFailure(RuntimeError):
    """Fixed chemistry dependency is unavailable."""


class InputFailure(ValueError):
    """Input cannot be processed under the frozen contract."""


class ResourceFailure(InputFailure):
    """Input exceeds a frozen resource limit."""


def load_local_module(filename: str, module_name: str) -> Any:
    spec = importlib.util.spec_from_file_location(
        module_name,
        Path(__file__).with_name(filename),
    )
    module = importlib.util.module_from_spec(spec)
    if spec.loader is None:
        raise RuntimeError(f"cannot load local module: {filename}")
    spec.loader.exec_module(module)
    return module


CURATED_CONTRACT = load_local_module(
    "curated_artifact_contract.py",
    "review_curated_artifact_contract",
)
CURATION_STEP_BINDING = load_local_module(
    "curation_step_binding.py",
    "review_curation_step_binding",
)
SEARCHED_CONTRACT = load_local_module(
    "searched_artifact_contract.py",
    "review_searched_artifact_contract",
)
PRECEDENT_BINDING = load_local_module(
    "precedent_step_binding.py",
    "review_precedent_step_binding",
)
REQUEST_SECTIONS = load_local_module(
    "review_request_sections.py",
    "review_request_sections",
)


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def valid_sha256(value: Any) -> bool:
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) is not None


def without_temporal(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: without_temporal(item)
            for key, item in value.items()
            if key not in TEMPORAL_KEYS
        }
    if isinstance(value, list):
        return [without_temporal(item) for item in value]
    return value


def stable_document_fingerprint(document: dict[str, Any]) -> str:
    return sha256_json(without_temporal(document))


def artifact_fingerprint(artifact: dict[str, Any]) -> str:
    workflow = artifact.get("workflow")
    if workflow == "curate-reactions":
        return sha256_json(
            {
                key: value
                for key, value in artifact.items()
                if key
                not in {"generated_at_utc", "runtime_seconds", "result_fingerprint"}
            }
        )
    return stable_document_fingerprint(artifact)


def load_toolkit() -> dict[str, Any]:
    try:
        import rdkit
        from rdkit import Chem, DataStructs, rdBase
        from rdkit.Chem import rdChemReactions, rdFingerprintGenerator
    except ImportError as error:
        raise DependencyFailure(
            "需要 rdkit==2025.9.2；请在隔离环境安装 scripts/requirements.txt。"
        ) from error
    if rdkit.__version__ not in {"2025.9.2", "2025.09.2"}:
        raise DependencyFailure(f"需要 rdkit==2025.9.2，当前为 {rdkit.__version__}。")
    return {
        "rdkit": rdkit,
        "Chem": Chem,
        "DataStructs": DataStructs,
        "rdBase": rdBase,
        "rdChemReactions": rdChemReactions,
        "rdFingerprintGenerator": rdFingerprintGenerator,
    }


def tool_versions(toolkit: dict[str, Any]) -> dict[str, str]:
    return {
        "python": platform.python_version(),
        "rdkit": toolkit["rdkit"].__version__,
        "review-routes": RULESET_VERSION,
    }


def finding(
    code: str,
    severity: str,
    field_path: str,
    *,
    evidence: Any = None,
) -> dict[str, Any]:
    item = {
        "code": code,
        "severity": severity,
        "field_path": field_path,
        "message": RULE_MESSAGES[code],
        "evidence": []
        if evidence is None
        else evidence
        if isinstance(evidence, list)
        else [evidence],
    }
    return item


def parse_molecule(
    value: Any, toolkit: dict[str, Any]
) -> tuple[Any | None, str | None]:
    if not isinstance(value, str) or not value.strip():
        return None, None
    try:
        with toolkit["rdBase"].BlockLogs():
            molecule = toolkit["Chem"].MolFromSmiles(value)
    except Exception:
        molecule = None
    if molecule is None:
        return None, None
    for atom in molecule.GetAtoms():
        atom.SetAtomMapNum(0)
    canonical = toolkit["Chem"].MolToSmiles(
        molecule, canonical=True, isomericSmiles=True
    )
    return molecule, canonical


def split_reaction_smiles(value: Any) -> tuple[list[str], list[str], list[str]]:
    if not isinstance(value, str) or not value.strip():
        raise InputFailure("reaction SMILES 为空。")
    text = value.strip()
    if ">>" in text:
        if text.count(">>") != 1:
            raise InputFailure("reaction SMILES 不是单步两段或三段形式。")
        left, right = text.split(">>")
        middle = ""
    else:
        parts = text.split(">")
        if len(parts) != 3:
            raise InputFailure("reaction SMILES 不是单步两段或三段形式。")
        left, middle, right = parts
    inputs = [item for item in left.split(".") if item]
    agents = [item for item in middle.split(".") if item]
    outputs = [item for item in right.split(".") if item]
    if not inputs or not outputs:
        raise InputFailure("reaction SMILES 缺少输入或输出。")
    return inputs, agents, outputs


def canonical_reaction_smiles(value: str, toolkit: dict[str, Any]) -> str:
    inputs, agents, outputs = split_reaction_smiles(value)

    def canonical_side(side: list[str]) -> list[str]:
        result = []
        for structure in side:
            _, canonical = parse_molecule(structure, toolkit)
            if canonical is None:
                raise InputFailure(f"reaction component 无法解析：{structure!r}")
            result.append(canonical)
        return sorted(result)

    return ">".join(
        (
            ".".join(canonical_side(inputs)),
            ".".join(canonical_side(agents)),
            ".".join(canonical_side(outputs)),
        )
    )


def node_kind(node: Any) -> str | None:
    if not isinstance(node, dict):
        return None
    value = str(node.get("type") or node.get("kind") or "").strip().lower()
    if value in {"mol", "molecule"}:
        return "mol"
    if value in {"reaction", "rxn"} or node.get("is_reaction") is True:
        return "reaction"
    return None


def child_nodes(node: dict[str, Any]) -> list[Any]:
    value = node.get("children")
    return value if isinstance(value, list) else []


def reaction_text(node: dict[str, Any]) -> str | None:
    metadata = node.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {}
    for value in (
        node.get("reaction_smiles"),
        metadata.get("reaction_smiles"),
        metadata.get("mapped_reaction"),
        metadata.get("smiles"),
        metadata.get("rsmi"),
        node.get("smiles"),
    ):
        if isinstance(value, str) and (">>" in value or value.count(">") == 2):
            return value
    return None


def normalize_routes(
    request: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    profile = request.get("input_profile")
    values = request.get("routes")
    if not isinstance(values, list):
        raise InputFailure("routes 必须是 array。")
    if len(values) > MAX_ROUTES:
        raise ResourceFailure(f"routes 不得超过 {MAX_ROUTES} 条。")
    normalized = []
    errors = []
    seen: set[str] = set()
    for index, value in enumerate(values):
        if not isinstance(value, dict):
            errors.append(
                finding(
                    "E-INPUT-SCHEMA-001",
                    "error",
                    f"routes[{index}]",
                )
            )
            continue
        if profile == "paroutes_v2_json":
            tree = value
            route_id = value.get("route_id") or f"paroutes-{sha256_json(value)[:16]}"
            backend = "paroutes"
            backend_rank = index + 1
            backend_score = None
        else:
            tree = value.get("tree")
            route_id = value.get("route_id")
            if not route_id and profile == "aizynthfinder_json":
                route_id = f"aizynth-{sha256_json(value)[:16]}"
            backend = value.get("backend") or (
                "aizynthfinder" if profile == "aizynthfinder_json" else None
            )
            backend_rank = value.get("backend_rank", value.get("rank"))
            backend_score = value.get("backend_score", value.get("score"))
        if not isinstance(route_id, str) or not route_id or route_id in seen:
            errors.append(
                finding(
                    "E-ROUTE-ID-001",
                    "error",
                    f"routes[{index}].route_id",
                    evidence=route_id,
                )
            )
            continue
        seen.add(route_id)
        normalized.append(
            {
                "route_id": route_id,
                "backend": backend,
                "backend_rank": backend_rank,
                "backend_score": backend_score,
                "source_route_hash": sha256_json(value),
                "tree": tree,
                "source_index": index,
            }
        )
    return normalized, errors


def analyze_route_tree(
    route: dict[str, Any],
    toolkit: dict[str, Any],
) -> dict[str, Any]:
    route_id = route["route_id"]
    findings: list[dict[str, Any]] = []
    steps: list[dict[str, Any]] = []
    leaves: list[dict[str, Any]] = []
    node_count = 0
    active: set[int] = set()

    def walk_molecule(node: Any, path: tuple[int, ...]) -> tuple[str | None, int]:
        nonlocal node_count
        node_count += 1
        field_path = f"routes[{route['source_index']}].tree" + "".join(
            f".children[{index}]" for index in path
        )
        if not isinstance(node, dict) or node_kind(node) != "mol":
            findings.append(finding("E-ROUTE-TOPOLOGY-001", "error", field_path))
            return None, 0
        identity = id(node)
        if identity in active:
            findings.append(
                finding(
                    "E-ROUTE-TOPOLOGY-001",
                    "error",
                    field_path,
                    evidence="cycle",
                )
            )
            return None, 0
        active.add(identity)
        _, canonical = parse_molecule(node.get("smiles"), toolkit)
        if canonical is None:
            findings.append(
                finding(
                    "E-MOLECULE-STRUCTURE-001",
                    "error",
                    f"{field_path}.smiles",
                    evidence=node.get("smiles"),
                )
            )
        children = child_nodes(node)
        if not children:
            leaves.append(
                {
                    "structure": canonical,
                    "reported_structure": node.get("smiles"),
                    "reported_in_stock": (
                        node.get("in_stock")
                        if isinstance(node.get("in_stock"), bool)
                        else None
                    ),
                    "path": list(path),
                }
            )
            active.remove(identity)
            return canonical, 0
        if len(children) != 1 or node_kind(children[0]) != "reaction":
            findings.append(
                finding(
                    "E-ROUTE-TOPOLOGY-001",
                    "error",
                    f"{field_path}.children",
                    evidence=f"expected one reaction child, got {len(children)}",
                )
            )
            active.remove(identity)
            return canonical, 0
        reaction = children[0]
        node_count += 1
        reaction_path = (*path, 0)
        reaction_field = f"{field_path}.children[0]"
        reaction_identity = id(reaction)
        if reaction_identity in active:
            findings.append(
                finding(
                    "E-ROUTE-TOPOLOGY-001",
                    "error",
                    reaction_field,
                    evidence="cycle",
                )
            )
            active.remove(identity)
            return canonical, 0
        active.add(reaction_identity)
        precursors = child_nodes(reaction)
        if not precursors or any(node_kind(item) != "mol" for item in precursors):
            findings.append(
                finding(
                    "E-ROUTE-TOPOLOGY-001",
                    "error",
                    f"{reaction_field}.children",
                    evidence="reaction requires molecule precursor children",
                )
            )
        precursor_values = []
        child_depths = []
        for child_index, precursor in enumerate(precursors):
            value, depth = walk_molecule(precursor, (*reaction_path, child_index))
            if value:
                precursor_values.append(value)
            child_depths.append(depth)
        reported_reaction = reaction_text(reaction)
        if reported_reaction is None and canonical and precursor_values:
            reported_reaction = f"{'.'.join(precursor_values)}>>{canonical}"
        canonical_reaction = None
        agents: list[str] = []
        if reported_reaction:
            try:
                canonical_reaction = canonical_reaction_smiles(
                    reported_reaction, toolkit
                )
                inputs, agents, outputs = split_reaction_smiles(canonical_reaction)
                if canonical not in outputs:
                    findings.append(
                        finding(
                            "E-STEP-REACTION-001",
                            "error",
                            reaction_field,
                            evidence="reaction output does not match parent product",
                        )
                    )
                available = set(inputs) | set(agents)
                missing = sorted(set(precursor_values) - available)
                if missing:
                    findings.append(
                        finding(
                            "E-STEP-REACTION-001",
                            "error",
                            reaction_field,
                            evidence={"precursors_missing_from_reaction": missing},
                        )
                    )
            except InputFailure as error:
                findings.append(
                    finding(
                        "E-STEP-REACTION-001",
                        "error",
                        reaction_field,
                        evidence=str(error),
                    )
                )
        else:
            findings.append(finding("E-STEP-REACTION-001", "error", reaction_field))
        step_hash = (
            hashlib.sha256(canonical_reaction.encode("utf-8")).hexdigest()
            if canonical_reaction
            else None
        )
        step_id = (
            "step-"
            + hashlib.sha256(
                f"{route_id}:{reaction_path}:{step_hash}".encode("utf-8")
            ).hexdigest()[:16]
        )
        metadata = reaction.get("metadata")
        steps.append(
            {
                "step_id": step_id,
                "step_reaction_hash": step_hash,
                "path": list(reaction_path),
                "reported_reaction": reported_reaction,
                "canonical_reaction": canonical_reaction,
                "product": canonical,
                "precursors": sorted(precursor_values),
                "agents": agents,
                "backend_metadata": metadata if isinstance(metadata, dict) else {},
            }
        )
        active.remove(reaction_identity)
        active.remove(identity)
        return canonical, 1 + max(child_depths, default=0)

    tree = route.get("tree")
    if node_kind(tree) != "mol":
        findings.append(
            finding(
                "E-ROUTE-TOPOLOGY-001",
                "error",
                f"routes[{route['source_index']}].tree",
                evidence="root must be a molecule",
            )
        )
        root_structure, longest = None, 0
    else:
        root_structure, longest = walk_molecule(tree, ())
    if len(steps) > MAX_STEPS_PER_ROUTE:
        findings.append(
            finding(
                "E-RESOURCE-LIMIT-001",
                "error",
                f"routes[{route['source_index']}].tree",
                evidence={"steps": len(steps)},
            )
        )
    return {
        "root_structure": root_structure,
        "steps": steps,
        "leaves": leaves,
        "node_count": node_count,
        "longest_linear_sequence": longest,
        "branch_count": sum(max(0, len(step["precursors"]) - 1) for step in steps),
        "findings": findings,
    }


def validate_artifact(
    artifact: Any, workflow: str
) -> tuple[dict[str, Any] | None, str | None]:
    if not isinstance(artifact, dict) or artifact.get("workflow") != workflow:
        return None, "workflow_or_type"
    actual = artifact.get("result_fingerprint")
    if not valid_sha256(actual) or actual != artifact_fingerprint(artifact):
        return None, "fingerprint"
    return artifact, None


def curation_evidence(
    artifact: Any,
    record_id: Any,
    step: dict[str, Any],
    toolkit: dict[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    result, issue_specs = CURATION_STEP_BINDING.bind_curation_evidence(
        artifact,
        record_id,
        step["step_reaction_hash"],
        toolkit,
        CURATED_CONTRACT,
    )
    return result, [
        finding(
            item["code"],
            item["severity"],
            item["field_path"],
            evidence=item["evidence"],
        )
        for item in issue_specs
    ]


def precedent_evidence(
    artifact: Any,
    step: dict[str, Any],
    toolkit: dict[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    result, issue_specs = PRECEDENT_BINDING.bind_precedent_evidence(
        artifact,
        step,
        toolkit,
        SEARCHED_CONTRACT,
    )
    findings = [
        finding(
            item["code"],
            item["severity"],
            item["field_path"],
            evidence=item["evidence"],
        )
        for item in issue_specs
    ]
    if result["binding_status"] == "bound" and not result["licenses"]:
        findings.append(
            finding(
                "W-SOURCE-LICENSE-001",
                "warning",
                "step_artifacts.precedent_artifact.results.license",
            )
        )
    if len(result["profile_ids"]) > 1:
        findings.append(
            finding(
                "E-PROFILE-MISMATCH-001",
                "error",
                "step_artifacts.precedent_artifact.results.fingerprint_profile",
                evidence=result["profile_ids"],
            )
        )
    return result, findings


def build_artifact_index(
    entries: Any,
) -> tuple[dict[tuple[str, str], dict[str, Any]], list[dict[str, Any]]]:
    if entries is None:
        return {}, []
    if not isinstance(entries, list):
        return {}, [finding("E-INPUT-SCHEMA-001", "error", "step_artifacts")]
    if len(entries) > MAX_STEP_ARTIFACTS:
        return {}, [finding("E-RESOURCE-LIMIT-001", "error", "step_artifacts")]
    index = {}
    errors = []
    for position, entry in enumerate(entries):
        if not isinstance(entry, dict):
            errors.append(
                finding(
                    "E-INPUT-SCHEMA-001",
                    "error",
                    f"step_artifacts[{position}]",
                )
            )
            continue
        key = (entry.get("route_id"), entry.get("step_id"))
        if not all(isinstance(item, str) and item for item in key):
            errors.append(
                finding(
                    "E-INPUT-SCHEMA-001",
                    "error",
                    f"step_artifacts[{position}]",
                    evidence="invalid route_id/step_id",
                )
            )
            continue
        if key in index:
            index[key] = {
                **index[key],
                "_step_artifact_duplicate": "duplicate route_id/step_id",
            }
            continue
        index[key] = entry
    return index, errors


def normalize_inventory(
    value: Any,
    toolkit: dict[str, Any],
) -> tuple[dict[str, Any] | None, dict[str, dict[str, Any]], list[dict[str, Any]]]:
    if value is None:
        return (
            None,
            {},
            [finding("W-INVENTORY-MISSING-001", "warning", "inventory_snapshot")],
        )
    if not isinstance(value, dict):
        return None, {}, [finding("E-INPUT-SCHEMA-001", "error", "inventory_snapshot")]
    required = ("snapshot_id", "captured_at_utc", "source", "records")
    if any(not value.get(key) for key in required) or not isinstance(
        value.get("records"), list
    ):
        return (
            value,
            {},
            [finding("W-INVENTORY-MISSING-001", "warning", "inventory_snapshot")],
        )
    findings = []
    if not value.get("license"):
        findings.append(
            finding(
                "W-INVENTORY-LICENSE-001",
                "warning",
                "inventory_snapshot.license",
            )
        )
    index = {}
    for position, record in enumerate(value["records"]):
        if not isinstance(record, dict):
            continue
        _, canonical = parse_molecule(record.get("structure"), toolkit)
        status = record.get("status")
        if canonical and status in {"in_stock", "not_in_stock", "unknown"}:
            index[canonical] = {
                "status": status,
                "source_record": record,
                "position": position,
            }
    return value, index, findings


def normalize_constraints(value: Any, toolkit: dict[str, Any]) -> dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise InputFailure("constraints 必须是 object。")
    allowed = {
        "max_steps",
        "max_precursors",
        "require_all_leaves_in_stock",
        "minimum_exact_or_transformation_coverage",
        "forbidden_starting_materials",
    }
    unknown = sorted(set(value) - allowed)
    if unknown:
        raise InputFailure(f"不支持的 constraints：{unknown}")
    result = {}
    for key in ("max_steps", "max_precursors"):
        if key in value:
            item = value[key]
            if not isinstance(item, int) or isinstance(item, bool) or item < 0:
                raise InputFailure(f"constraints.{key} 必须是非负整数。")
            result[key] = item
    key = "minimum_exact_or_transformation_coverage"
    if key in value:
        item = value[key]
        if (
            not isinstance(item, (int, float))
            or isinstance(item, bool)
            or not 0 <= item <= 1
        ):
            raise InputFailure(f"constraints.{key} 必须为 0–1。")
        result[key] = float(item)
    if "require_all_leaves_in_stock" in value:
        if not isinstance(value["require_all_leaves_in_stock"], bool):
            raise InputFailure("require_all_leaves_in_stock 必须是 boolean。")
        result["require_all_leaves_in_stock"] = value["require_all_leaves_in_stock"]
    if "forbidden_starting_materials" in value:
        values = value["forbidden_starting_materials"]
        if not isinstance(values, list) or not all(
            isinstance(item, str) for item in values
        ):
            raise InputFailure("forbidden_starting_materials 必须是 string array。")
        canonical_values = []
        for item in values:
            _, canonical = parse_molecule(item, toolkit)
            if canonical is None:
                raise InputFailure(f"禁用前体无法解析：{item!r}")
            canonical_values.append(canonical)
        result["forbidden_starting_materials"] = sorted(set(canonical_values))
    return result


def route_signature(route: dict[str, Any]) -> str:
    payload = {
        "target": route.get("target_structure"),
        "steps": sorted(
            (
                {
                    "reaction": item.get("canonical_reaction"),
                    "product": item.get("product"),
                    "precursors": item.get("precursors"),
                }
                for item in route.get("step_reviews") or []
            ),
            key=canonical_json,
        ),
        "leaves": sorted(
            item.get("structure")
            for item in route.get("terminal_precursors") or []
            if item.get("structure")
        ),
    }
    return "route:" + sha256_json(payload)[:24]


def finalize_route(route: dict[str, Any]) -> None:
    findings = route["findings"]
    severities = {item["severity"] for item in findings}
    codes = sorted({item["code"] for item in findings})
    if "error" in severities:
        route["review_status"] = "error"
        route["disposition"] = "blocked"
    else:
        partial_codes = {
            "W-CURATION-NOT-RUN-001",
            "W-CURATION-REVIEW-001",
            "W-PRECEDENT-TIMEOUT-001",
            "W-PRECEDENT-ERROR-001",
            "W-PRECEDENT-NOT-RUN-001",
            "W-PRECEDENT-PARTIAL-001",
            "W-PRECEDENT-RESULT-REVIEW-001",
        }
        route["review_status"] = (
            "partial" if any(code in partial_codes for code in codes) else "completed"
        )
        route["disposition"] = (
            "review_required" if findings else "ready_for_expert_review"
        )
    route["human_review_required"] = [code for code in codes if code.startswith("W-")]


def _step_hash_findings(
    entry: dict[str, Any] | None,
    step: dict[str, Any],
) -> list[dict[str, Any]]:
    findings = []
    if entry and entry.get("_step_artifact_duplicate"):
        detail = entry["_step_artifact_duplicate"]
        findings.extend(
            (
                finding(
                    "E-CURATION-BINDING-001",
                    "error",
                    "step_artifacts.curation_record_id",
                    evidence=detail,
                ),
                finding(
                    "E-PRECEDENT-BINDING-001",
                    "error",
                    "step_artifacts.precedent_artifact",
                    evidence=detail,
                ),
            )
        )
    if entry and entry.get("step_reaction_hash") != step["step_reaction_hash"]:
        findings.append(
            finding(
                "E-STEP-HASH-MISMATCH-001",
                "error",
                "step_artifacts.step_reaction_hash",
                evidence={
                    "expected": step["step_reaction_hash"],
                    "actual": entry.get("step_reaction_hash"),
                },
            )
        )
    return findings


def _review_steps(
    route_id: str,
    steps: list[dict[str, Any]],
    artifact_index: dict[tuple[str, str], dict[str, Any]],
    toolkit: dict[str, Any],
) -> tuple[list[dict[str, Any]], Counter[str], list[dict[str, Any]]]:
    reviews = []
    coverage: Counter[str] = Counter()
    route_findings = []
    for step in steps:
        entry = artifact_index.get((route_id, step["step_id"]))
        step_findings = _step_hash_findings(entry, step)
        if entry and entry.get("_step_artifact_duplicate"):
            curation = CURATION_STEP_BINDING.failed_curation_evidence()
            artifact = entry.get("curation_artifact")
            contract_issues = (
                CURATED_CONTRACT.validate_curated_artifact(artifact)
                if artifact is not None
                else []
            )
            curation_findings = (
                [
                    finding(
                        "E-CURATION-ARTIFACT-CONTRACT-001",
                        "error",
                        "step_artifacts.curation_artifact",
                        evidence=contract_issues,
                    )
                ]
                if contract_issues
                else []
            )
            precedent = PRECEDENT_BINDING.failed_precedent_evidence()
            precedent_findings = []
        else:
            curation, curation_findings = curation_evidence(
                entry.get("curation_artifact") if entry else None,
                entry.get("curation_record_id") if entry else None,
                step,
                toolkit,
            )
            precedent, precedent_findings = precedent_evidence(
                entry.get("precedent_artifact") if entry else None,
                step,
                toolkit,
            )
        step_findings.extend(curation_findings + precedent_findings)
        coverage[precedent["match_level"]] += 1
        route_findings.extend(
            {
                **item,
                "evidence": [{"step_id": step["step_id"]}, *item.get("evidence", [])],
            }
            for item in step_findings
        )
        reviews.append(
            {
                **step,
                "curation": curation,
                "precedent": precedent,
                "findings": step_findings,
                "review_required": sorted({item["code"] for item in step_findings}),
            }
        )
    return reviews, coverage, route_findings


def _terminal_precursors(
    leaves: list[dict[str, Any]],
    inventory_index: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    output = []
    for leaf in leaves:
        inventory_record = inventory_index.get(leaf["structure"])
        if inventory_record:
            status, source = inventory_record["status"], "inventory_snapshot"
        elif leaf["reported_in_stock"] is True:
            status, source = "reported_in_stock", "route_export"
        elif leaf["reported_in_stock"] is False:
            status, source = "reported_not_in_stock", "route_export"
        else:
            status, source = "unknown", None
        output.append(
            {
                **leaf,
                "inventory_status": status,
                "inventory_source": source,
            }
        )
    return output


def _evaluate_constraints(
    constraints: dict[str, Any],
    terminal_precursors: list[dict[str, Any]],
    step_count: int,
    exact_coverage: float,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    results = []
    findings = []

    def evaluate(name: str, passed: bool, observed: Any, expected: Any) -> None:
        results.append(
            {
                "constraint": name,
                "passed": passed,
                "observed": observed,
                "expected": expected,
            }
        )
        if not passed:
            findings.append(
                finding(
                    "W-CONSTRAINT-VIOLATION-001",
                    "warning",
                    f"constraints.{name}",
                    evidence={"observed": observed, "expected": expected},
                )
            )

    if "max_steps" in constraints:
        maximum = constraints["max_steps"]
        evaluate("max_steps", step_count <= maximum, step_count, maximum)
    if "max_precursors" in constraints:
        maximum = constraints["max_precursors"]
        count = len(terminal_precursors)
        evaluate("max_precursors", count <= maximum, count, maximum)
    if constraints.get("require_all_leaves_in_stock"):
        in_stock = bool(terminal_precursors) and all(
            item["inventory_status"] in {"in_stock", "reported_in_stock"}
            for item in terminal_precursors
        )
        evaluate("require_all_leaves_in_stock", in_stock, in_stock, True)
    if "minimum_exact_or_transformation_coverage" in constraints:
        minimum = constraints["minimum_exact_or_transformation_coverage"]
        evaluate(
            "minimum_exact_or_transformation_coverage",
            exact_coverage >= minimum,
            exact_coverage,
            minimum,
        )
    forbidden = set(constraints.get("forbidden_starting_materials") or [])
    if forbidden:
        present = sorted(
            item["structure"]
            for item in terminal_precursors
            if item["structure"] in forbidden
        )
        evaluate("forbidden_starting_materials", not present, present, [])
    return results, findings


def _build_route_output(
    route: dict[str, Any],
    analysis: dict[str, Any],
    step_reviews: list[dict[str, Any]],
    coverage: Counter[str],
    terminal_precursors: list[dict[str, Any]],
    inventory: dict[str, Any] | None,
    constraint_results: list[dict[str, Any]],
    findings: list[dict[str, Any]],
    exact_coverage: float,
) -> dict[str, Any]:
    return {
        "route_id": route["route_id"],
        "source_route_hash": route["source_route_hash"],
        "backend_metadata": {
            "backend": route.get("backend"),
            "backend_rank": route.get("backend_rank"),
            "backend_score": route.get("backend_score"),
        },
        "route_signature": None,
        "target_structure": analysis["root_structure"],
        "topology_status": (
            "invalid"
            if any(item["severity"] == "error" for item in analysis["findings"])
            else "valid"
        ),
        "node_count": analysis["node_count"],
        "step_count": len(step_reviews),
        "longest_linear_sequence": analysis["longest_linear_sequence"],
        "branch_count": analysis["branch_count"],
        "terminal_precursors": terminal_precursors,
        "inventory_snapshot": (
            {
                key: inventory.get(key)
                for key in ("snapshot_id", "captured_at_utc", "source", "license")
            }
            if isinstance(inventory, dict)
            else None
        ),
        "inventory_coverage": (
            sum(
                item["inventory_status"] in {"in_stock", "not_in_stock"}
                for item in terminal_precursors
            )
            / len(terminal_precursors)
            if terminal_precursors
            else 0.0
        ),
        "precedent_coverage_by_level": {
            level: coverage.get(level, 0) for level in sorted(PRECEDENT_LEVELS)
        },
        "exact_or_transformation_coverage": exact_coverage,
        "weakest_steps": [
            item["step_id"]
            for item in step_reviews
            if item["precedent"]["match_level"]
            not in {"exact_record", "exact_transformation"}
            or item["curation"]["disposition"] != "ready_for_search"
        ],
        "constraint_results": constraint_results,
        "step_reviews": step_reviews,
        "findings": findings,
        "review_status": None,
        "disposition": None,
        "human_review_required": [],
        "duplicate_memberships": [],
    }


def process_route(
    route: dict[str, Any],
    *,
    target_structure: str | None,
    artifact_index: dict[tuple[str, str], dict[str, Any]],
    inventory: dict[str, Any] | None,
    inventory_index: dict[str, dict[str, Any]],
    inventory_findings: list[dict[str, Any]],
    constraints: dict[str, Any],
    source_license: Any,
    toolkit: dict[str, Any],
) -> dict[str, Any]:
    analysis = analyze_route_tree(route, toolkit)
    findings = list(analysis["findings"])
    if target_structure and analysis["root_structure"] != target_structure:
        findings.append(
            finding(
                "W-TARGET-MISMATCH-001",
                "warning",
                f"routes[{route['source_index']}].tree.smiles",
                evidence={
                    "request": target_structure,
                    "route": analysis["root_structure"],
                },
            )
        )
    if not source_license:
        findings.append(finding("W-SOURCE-LICENSE-001", "warning", "source.license"))
    step_reviews, coverage, step_findings = _review_steps(
        route["route_id"],
        analysis["steps"],
        artifact_index,
        toolkit,
    )
    findings.extend(step_findings + inventory_findings)
    terminal_precursors = _terminal_precursors(analysis["leaves"], inventory_index)
    missing_inventory = not inventory_index or any(
        item["inventory_status"] in {"unknown", "reported_not_in_stock"}
        for item in terminal_precursors
    )
    if missing_inventory:
        findings.append(
            finding("W-INVENTORY-MISSING-001", "warning", "inventory_snapshot")
        )
    step_count = len(step_reviews)
    exact_count = coverage["exact_record"] + coverage["exact_transformation"]
    exact_coverage = exact_count / step_count if step_count else 0.0
    constraint_results, constraint_findings = _evaluate_constraints(
        constraints,
        terminal_precursors,
        step_count,
        exact_coverage,
    )
    findings.extend(constraint_findings)
    output = _build_route_output(
        route,
        analysis,
        step_reviews,
        coverage,
        terminal_precursors,
        inventory,
        constraint_results,
        findings,
        exact_coverage,
    )
    output["route_signature"] = route_signature(output)
    finalize_route(output)
    return output


def duplicate_groups(routes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups = defaultdict(list)
    for route in routes:
        groups[route["route_signature"]].append(route)
    output = []
    for signature, members in sorted(groups.items()):
        if len(members) < 2:
            continue
        group_id = (
            "duplicate-" + hashlib.sha256(signature.encode("utf-8")).hexdigest()[:12]
        )
        route_ids = sorted(item["route_id"] for item in members)
        output.append(
            {
                "group_id": group_id,
                "route_signature": signature,
                "route_ids": route_ids,
                "member_count": len(route_ids),
            }
        )
        for route in members:
            route["duplicate_memberships"].append(group_id)
            route["findings"].append(
                finding(
                    "W-ROUTE-DUPLICATE-001",
                    "warning",
                    "route_signature",
                    evidence={"group_id": group_id, "route_ids": route_ids},
                )
            )
            finalize_route(route)
    return output


def _request_context(request: dict[str, Any]) -> dict[str, Any]:
    source = request.get("source")
    source = source if isinstance(source, dict) else {}
    options = request.get("options")
    if not isinstance(options, dict):
        options = {}
    return {
        "source": source,
        "public_source": {
            key: source.get(key) for key in ("identifier", "content_sha256", "license")
        },
        "options": options,
        "normalized_options": {
            "comparison_mode": options.get("comparison_mode"),
            "preserve_backend_order": options.get("preserve_backend_order"),
            "automatic_route_ranking": False,
            "network_access": False,
            "pickle_allowed": False,
        },
        "routes_fingerprint": request.get("routes_fingerprint"),
        "normalized_routes": [],
        "constraints": {},
        "target_structure": None,
        "artifact_index": {},
        "inventory": None,
        "inventory_index": {},
        "inventory_findings": [],
    }


def validate_request_contract(
    request: dict[str, Any],
    toolkit: dict[str, Any],
    context: dict[str, Any],
    findings: list[dict[str, Any]],
) -> None:
    if (
        request.get("schema_version") != SCHEMA_VERSION
        or request.get("workflow") != WORKFLOW
    ):
        raise InputFailure("schema_version/workflow 不匹配。")
    profile = request.get("input_profile")
    if profile not in INPUT_PROFILES:
        if str(profile).lower() in {"pickle", "pkl"}:
            findings.append(finding("E-PICKLE-INPUT-001", "error", "input_profile"))
        else:
            raise InputFailure("input_profile 不受控。")
    options = context["options"]
    if (
        options.get("comparison_mode") != "dimensions_only"
        or options.get("preserve_backend_order") is not True
    ):
        raise InputFailure(
            "首版必须显式使用 dimensions_only 和 preserve_backend_order=true。"
        )
    if not valid_sha256(context["source"].get("content_sha256")):
        findings.append(finding("E-INPUT-HASH-001", "error", "source.content_sha256"))
    if SECRET_RE.search(canonical_json(request)):
        raise InputFailure("请求中检测到疑似凭证。")
    routes, route_findings = normalize_routes(request)
    context["normalized_routes"] = routes
    findings.extend(route_findings)
    if context["routes_fingerprint"] != sha256_json(request.get("routes")):
        findings.append(finding("E-INPUT-HASH-001", "error", "routes_fingerprint"))
    context["constraints"] = normalize_constraints(request.get("constraints"), toolkit)
    target = request.get("target")
    if isinstance(target, dict):
        reported = target.get("standardized_structure") or target.get(
            "reported_structure"
        )
        _, context["target_structure"] = parse_molecule(reported, toolkit)
        if reported and context["target_structure"] is None:
            findings.append(finding("E-MOLECULE-STRUCTURE-001", "error", "target"))
    context["artifact_index"], artifact_findings = build_artifact_index(
        request.get("step_artifacts")
    )
    findings.extend(artifact_findings)
    (
        context["inventory"],
        context["inventory_index"],
        context["inventory_findings"],
    ) = normalize_inventory(request.get("inventory_snapshot"), toolkit)


def process_routes(
    context: dict[str, Any],
    findings: list[dict[str, Any]],
    toolkit: dict[str, Any],
) -> list[dict[str, Any]]:
    if any(item["severity"] == "error" for item in findings):
        return []
    routes = [
        process_route(
            route,
            target_structure=context["target_structure"],
            artifact_index=context["artifact_index"],
            inventory=context["inventory"],
            inventory_index=context["inventory_index"],
            inventory_findings=context["inventory_findings"],
            constraints=context["constraints"],
            source_license=context["source"].get("license"),
            toolkit=toolkit,
        )
        for route in context["normalized_routes"]
    ]
    total_nodes = sum(route["node_count"] for route in routes)
    if total_nodes > MAX_TOTAL_NODES:
        resource_finding = finding(
            "E-RESOURCE-LIMIT-001",
            "error",
            "routes",
            evidence={"total_nodes": total_nodes},
        )
        findings.append(resource_finding)
        for route in routes:
            route["findings"].append(resource_finding)
            finalize_route(route)
    actual_keys = {
        (route["route_id"], step["step_id"])
        for route in routes
        for step in route["step_reviews"]
    }
    for route_id, step_id in sorted(set(context["artifact_index"]) - actual_keys):
        findings.append(
            finding(
                "E-STEP-HASH-MISMATCH-001",
                "error",
                "step_artifacts",
                evidence={"route_id": route_id, "step_id": step_id},
            )
        )
    return routes


def process_request(
    request: dict[str, Any],
    *,
    generated_at_utc: str | None = None,
) -> dict[str, Any]:
    started = time.perf_counter()
    toolkit = load_toolkit()
    findings: list[dict[str, Any]] = []
    context = _request_context(request)
    routes = []
    try:
        validate_request_contract(request, toolkit, context, findings)
        routes = process_routes(context, findings, toolkit)
    except ResourceFailure as error:
        findings.append(
            finding("E-RESOURCE-LIMIT-001", "error", "$", evidence=str(error))
        )
    except (InputFailure, DependencyFailure) as error:
        findings.append(
            finding("E-INPUT-SCHEMA-001", "error", "$", evidence=str(error))
        )
    document = REQUEST_SECTIONS.build_document(
        request=request,
        context=context,
        routes=routes,
        duplicates=duplicate_groups(routes),
        top_findings=findings,
        generated_at_utc=generated_at_utc or now_utc(),
        runtime_seconds=round(time.perf_counter() - started, 6),
        metadata={
            "schema_version": SCHEMA_VERSION,
            "workflow": WORKFLOW,
            "ruleset_version": RULESET_VERSION,
            "tool_versions": tool_versions(toolkit),
        },
        dispositions=DISPOSITIONS,
    )
    document["result_fingerprint"] = stable_document_fingerprint(document)
    return document


def read_request(path: Path) -> dict[str, Any]:
    if path.suffix.lower() in {".pkl", ".pickle"}:
        raise InputFailure(RULE_MESSAGES["E-PICKLE-INPUT-001"])
    raw = path.read_text(encoding="utf-8")
    if SECRET_RE.search(raw):
        raise InputFailure("输入文件中检测到疑似凭证。")
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise InputFailure("输入顶层必须是 JSON object。")
    return value


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args(argv)
    try:
        request = read_request(args.input)
        document = process_request(request)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(
            json.dumps(document, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        return (
            0
            if not document["errors"]
            and all(
                route["disposition"] != "blocked"
                for route in document["route_summaries"]
            )
            else 1
        )
    except Exception as error:
        print(f"review-routes failed: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
