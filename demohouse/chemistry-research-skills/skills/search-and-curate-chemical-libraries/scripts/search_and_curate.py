#!/usr/bin/env python3
"""对已标准化本地化合物库执行只读结构检索、聚类和治理审查。"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import importlib.util
import json
import math
import platform
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional, Sequence


SCHEMA_VERSION = "1.0.0"
WORKFLOW = "chemical-library-search-and-curation"
CALCULATOR_VERSION = "1.0.0"
OPERATIONS = {
    "audit_library",
    "similarity_search",
    "substructure_search",
    "cluster_library",
    "select_diverse_subset",
}
CALCULATION_VIEWS = {"standardized", "parent"}
LIBRARY_STATUSES = {"ready", "partial", "blocked"}
OPERATION_STATUSES = {"completed", "partial", "not_run", "error"}
INDEX_STATUSES = {"indexed", "not_indexed", "incompatible", "error"}
MAX_SEARCH_RECORDS = 5000
MAX_CLUSTER_RECORDS = 2000
TEMPORAL_KEYS = {
    "generated_at_utc",
    "retrieved_at_utc",
    "requested_at_utc",
    "runtime_seconds",
}
SECRET_RE = re.compile(
    r"ark-[A-Za-z0-9_-]{12,}|"
    r"Bearer\s+[A-Za-z0-9._~+/=-]{12,}|"
    r"(?:Authorization|Cookie|Token|Api[_ -]?Key)\s*[:=]\s*\S{12,}",
    re.IGNORECASE,
)


def load_feature_artifact_contract() -> Any:
    path = Path(__file__).with_name("feature_artifact_contract.py")
    spec = importlib.util.spec_from_file_location(
        "_library_feature_artifact_contract",
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载 feature artifact contract：{path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


FEATURE_ARTIFACT_CONTRACT = load_feature_artifact_contract()


class DependencyFailure(RuntimeError):
    """固定版本化学工具不可加载。"""


class InputFailure(ValueError):
    """请求或上游产物无法安全加载。"""


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_json(value: Any) -> str:
    return sha256_text(canonical_json(value))


def _without_temporal_fields(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: _without_temporal_fields(item)
            for key, item in value.items()
            if key not in TEMPORAL_KEYS and key != "result_fingerprint"
        }
    if isinstance(value, list):
        return [_without_temporal_fields(item) for item in value]
    return value


def output_fingerprint(document: dict[str, Any]) -> str:
    return sha256_json(_without_temporal_fields(document))


def load_toolkit() -> dict[str, Any]:
    try:
        import rdkit
        from rdkit import Chem, DataStructs, rdBase
        from rdkit.Chem import rdSubstructLibrary
        from rdkit.ML.Cluster import Butina
        from rdkit.SimDivFilters.rdSimDivPickers import MaxMinPicker
    except ImportError as error:
        raise DependencyFailure(
            "需要 rdkit==2025.9.2；请在隔离环境安装 scripts/requirements.txt。"
        ) from error
    if rdkit.__version__ not in {"2025.9.2", "2025.09.2"}:
        raise DependencyFailure(
            f"需要 rdkit==2025.9.2，当前版本为 {rdkit.__version__}。"
        )
    return {
        "rdkit": rdkit,
        "Chem": Chem,
        "DataStructs": DataStructs,
        "rdBase": rdBase,
        "rdSubstructLibrary": rdSubstructLibrary,
        "Butina": Butina,
        "MaxMinPicker": MaxMinPicker,
    }


def dependency_metadata() -> dict[str, Any]:
    try:
        metadata = importlib.metadata.metadata("rdkit")
        return {
            "package": "rdkit",
            "version": importlib.metadata.version("rdkit"),
            "license": metadata.get("License") or "BSD-3-Clause",
        }
    except importlib.metadata.PackageNotFoundError:
        return {"package": "rdkit", "version": None, "license": None}


def tool_versions(toolkit: dict[str, Any]) -> dict[str, Any]:
    return {
        "python": platform.python_version(),
        "rdkit": toolkit["rdkit"].__version__,
        "library_search_calculator": CALCULATOR_VERSION,
    }


def finding(
    code: str,
    severity: str,
    message: str,
    source: str,
    **details: Any,
) -> dict[str, Any]:
    result = {
        "code": code,
        "severity": severity,
        "message": message,
        "source": source,
    }
    if details:
        result["details"] = details
    return result


def read_json_file(path: Path, label: str) -> tuple[dict[str, Any], bytes]:
    try:
        raw = path.read_bytes()
    except OSError as error:
        raise InputFailure(f"无法读取{label}：{error}") from error
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise InputFailure(f"{label}必须是 UTF-8：{error}") from error
    if SECRET_RE.search(text):
        raise InputFailure(f"{label}中检测到疑似凭证，已停止处理。")
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as error:
        raise InputFailure(f"{label} JSON 无法解析：{error}") from error
    if not isinstance(payload, dict):
        raise InputFailure(f"{label}顶层必须是 JSON object。")
    return payload, raw


def load_request(path: Path) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    request, request_raw = read_json_file(path, "请求文件")
    operation = request.get("operation")
    if operation not in OPERATIONS:
        raise InputFailure(f"不支持的 operation：{operation!r}")
    library_artifact = request.get("library_artifact")
    if not isinstance(library_artifact, str) or not library_artifact.strip():
        raise InputFailure("library_artifact 必须是非空相对或绝对路径。")
    declared_library_path = Path(library_artifact)
    safe_declared_path = (
        declared_library_path.name
        if declared_library_path.is_absolute()
        else declared_library_path.as_posix()
    )
    library_path = declared_library_path
    if not library_path.is_absolute():
        library_path = path.parent / library_path
    library_path = library_path.resolve()
    library, library_raw = read_json_file(library_path, "library artifact")
    context = {
        "request_path": path.resolve(),
        "request_sha256": sha256_bytes(request_raw),
        "library_path": library_path,
        "library_path_declared": safe_declared_path,
        "library_sha256": sha256_bytes(library_raw),
    }
    return request, library, context


def validate_common_options(
    request: dict[str, Any],
) -> tuple[str, bool, dict[str, Any]]:
    options = request.get("options")
    if not isinstance(options, dict):
        raise InputFailure("options 必须是 JSON object。")
    calculation_view = options.get("calculation_view")
    if calculation_view not in CALCULATION_VIEWS:
        raise InputFailure(
            "options.calculation_view 必须显式为 standardized 或 parent。"
        )
    if "include_review_required" not in options or not isinstance(
        options["include_review_required"], bool
    ):
        raise InputFailure("options.include_review_required 必须显式为 boolean。")
    return calculation_view, options["include_review_required"], dict(options)


def parse_structure(
    structure: Any, toolkit: dict[str, Any]
) -> tuple[Optional[Any], Optional[str], Optional[str]]:
    if not isinstance(structure, str) or not structure.strip():
        return None, None, "结构为空"
    Chem = toolkit["Chem"]
    try:
        with toolkit["rdBase"].BlockLogs():
            molecule = Chem.MolFromSmiles(structure, sanitize=False)
            if molecule is None:
                return None, None, "RDKit 未生成分子对象"
            Chem.SanitizeMol(molecule)
        canonical = Chem.MolToSmiles(molecule, canonical=True, isomericSmiles=True)
        return molecule, canonical, None
    except Exception as error:
        return None, None, str(error)


def normalize_review_reasons(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    output = []
    for item in value:
        if isinstance(item, str):
            output.append(item)
        elif isinstance(item, dict):
            output.append(str(item.get("code") or sha256_json(item)))
        else:
            output.append(str(item))
    return output


def normalize_library_records(
    library: dict[str, Any],
    calculation_view: str,
    toolkit: dict[str, Any],
) -> tuple[list[dict[str, Any]], str, list[dict[str, Any]], list[dict[str, Any]]]:
    workflow = library.get("workflow")
    if workflow != "molecular-feature-computation":
        raise InputFailure("library artifact 必须来自 compute-molecular-features。")
    raw_records = library.get("records")
    if not isinstance(raw_records, list) or not raw_records:
        raise InputFailure("library artifact.records 必须是非空数组。")
    if not all(isinstance(item, dict) for item in raw_records):
        raise InputFailure("library artifact.records 只能包含 object。")

    normalized = []
    errors = []
    warnings = []
    artifact_view = (library.get("options") or {}).get("calculation_view")
    if artifact_view != calculation_view:
        errors.append(
            finding(
                "E-CALCULATION-VIEW-MISMATCH",
                "error",
                "请求视图与第三 Skill artifact 视图不一致，禁止跨视图比较。",
                "upstream-contract",
                requested_view=calculation_view,
                artifact_view=artifact_view,
            )
        )
    for index, raw in enumerate(raw_records):
        source_structure = raw.get("source_structure")
        molecule, canonical, parse_error = parse_structure(
            source_structure,
            toolkit,
        )
        if parse_error is None and raw.get("calculation_canonical_smiles") != canonical:
            errors.append(
                finding(
                    "E-CANONICAL-STRUCTURE-MISMATCH",
                    "error",
                    "calculation_canonical_smiles 与 source_structure 不一致。",
                    "upstream-contract",
                    record_index=index,
                )
            )
        normalized.append(
            {
                "id": str(raw.get("id") or f"record-{index + 1:04d}"),
                "record_index": raw.get("record_index", index),
                "source_structure": source_structure,
                "canonical_structure": canonical,
                "molecule": molecule,
                "parse_error": parse_error,
                "calculation_view": raw.get("calculation_view"),
                "calculation_status": raw.get("calculation_status"),
                "disposition": raw.get("disposition"),
                "human_review_required": normalize_review_reasons(
                    raw.get("human_review_required")
                ),
                "fingerprints": raw.get("fingerprints") or {},
                "upstream_record": raw,
            }
        )
    return normalized, workflow, errors, warnings


def validate_profile_definition(profile: Any) -> Optional[str]:
    if not isinstance(profile, dict):
        return "fingerprint profile 必须是 object"
    fingerprint = profile.get("profile_fingerprint")
    if not isinstance(fingerprint, str):
        return "fingerprint profile 缺少 profile_fingerprint"
    expected = sha256_json(
        {key: value for key, value in profile.items() if key != "profile_fingerprint"}
    )
    if fingerprint != expected:
        return "fingerprint profile fingerprint 不匹配"
    return None


def find_profile(
    library: dict[str, Any], profile_id: str
) -> tuple[Optional[str], Optional[dict[str, Any]], Optional[str]]:
    profiles = library.get("fingerprint_profiles")
    if not isinstance(profiles, dict):
        return None, None, "library artifact 缺少 fingerprint_profiles"
    matches = [
        (name, profile)
        for name, profile in profiles.items()
        if isinstance(profile, dict) and profile.get("profile_id") == profile_id
    ]
    if len(matches) != 1:
        return (
            None,
            None,
            (f"fingerprint_profile_id={profile_id!r} 必须唯一匹配第三 Skill profile"),
        )
    name, profile = matches[0]
    error = validate_profile_definition(profile)
    return name, profile, error


def reconstruct_fingerprint(
    value: Any,
    profile: dict[str, Any],
    toolkit: dict[str, Any],
) -> tuple[Optional[Any], Optional[str]]:
    errors = FEATURE_ARTIFACT_CONTRACT.validate_fingerprint(
        value,
        profile,
        "fingerprint",
    )
    if errors:
        return None, "; ".join(errors)
    size = value["size"]
    on_bits = value["on_bits"]
    if not on_bits:
        return None, "空 fingerprint 不进入相似性计算"
    bitvector = toolkit["DataStructs"].ExplicitBitVect(size)
    bitvector.SetBitsFromList(on_bits)
    return bitvector, None


def manifest_item(
    record: dict[str, Any],
    status: str,
    reason: Optional[str],
) -> dict[str, Any]:
    return {
        "id": record["id"],
        "record_index": record["record_index"],
        "source_structure": record["source_structure"],
        "canonical_structure": record["canonical_structure"],
        "calculation_view": record["calculation_view"],
        "upstream_calculation_status": record["calculation_status"],
        "upstream_disposition": record["disposition"],
        "upstream_human_review_required": record["human_review_required"],
        "index_status": status,
        "reason": reason,
    }


def prepare_records(
    records: list[dict[str, Any]],
    *,
    operation: str,
    include_review_required: bool,
    profile_name: Optional[str],
    profile: Optional[dict[str, Any]],
    toolkit: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    indexed = []
    manifest = []
    review_queue = []
    needs_fingerprint = operation in {
        "similarity_search",
        "cluster_library",
        "select_diverse_subset",
    }
    for record in records:
        status = "indexed"
        reason = None
        if record["parse_error"] or record["molecule"] is None:
            status = "error"
            reason = "structure_parse_error"
        elif record["disposition"] == "rejected" or record["calculation_status"] in {
            "not_run",
            "error",
        }:
            status = "not_indexed"
            reason = "upstream_rejected_or_not_calculated"
        elif record["disposition"] == "review_required" and not include_review_required:
            status = "not_indexed"
            reason = "review_required_excluded_by_default"
        elif record["disposition"] not in {
            "ready_for_downstream",
            "review_required",
        }:
            status = "incompatible"
            reason = "unknown_upstream_disposition"

        bitvector = None
        if status == "indexed" and needs_fingerprint:
            if not profile_name or not profile:
                status = "incompatible"
                reason = "fingerprint_profile_unavailable"
            else:
                bitvector, fp_error = reconstruct_fingerprint(
                    record["fingerprints"].get(profile_name),
                    profile,
                    toolkit,
                )
                if fp_error:
                    status = "incompatible"
                    reason = fp_error
        record["bitvector"] = bitvector
        manifest.append(manifest_item(record, status, reason))
        if status == "indexed":
            indexed.append(record)
            if record["disposition"] == "review_required":
                review_queue.append(
                    {
                        "queue_id": f"upstream-review:{record['record_index']}",
                        "type": "upstream_review_required",
                        "record_ids": [record["id"]],
                        "record_indices": [record["record_index"]],
                        "required_action": "human_review",
                        "automatic_mutation": False,
                        "reasons": record["human_review_required"],
                    }
                )
        elif reason:
            review_queue.append(
                {
                    "queue_id": f"excluded:{record['record_index']}",
                    "type": "excluded_record",
                    "record_ids": [record["id"]],
                    "record_indices": [record["record_index"]],
                    "required_action": "human_review",
                    "automatic_mutation": False,
                    "reasons": [reason],
                }
            )
    return indexed, manifest, review_queue


def duplicate_review_groups(
    records: Sequence[dict[str, Any]],
) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        canonical = record.get("canonical_structure")
        if canonical:
            groups[canonical].append(record)
    queue = []
    for canonical in sorted(groups):
        members = groups[canonical]
        if len(members) < 2:
            continue
        indices = sorted(item["record_index"] for item in members)
        by_index = {item["record_index"]: item for item in members}
        queue.append(
            {
                "queue_id": "exact-structure:" + sha256_text(canonical),
                "type": "exact_structure_duplicates",
                "record_ids": [by_index[index]["id"] for index in indices],
                "record_indices": indices,
                "calculation_view": members[0]["calculation_view"],
                "relationship": "same_calculation_view_structure",
                "required_action": "human_review",
                "automatic_mutation": False,
                "questions": [
                    "这些记录是否为独立样品、批次、盐型来源或应保留的不同业务记录？"
                ],
            }
        )
    return queue


def find_query_record(
    query: dict[str, Any],
    indexed: Sequence[dict[str, Any]],
) -> tuple[Optional[dict[str, Any]], Optional[str]]:
    if "record_index" in query:
        record_index = query.get("record_index")
        matches = [item for item in indexed if item["record_index"] == record_index]
    elif "record_id" in query:
        record_id = query.get("record_id")
        matches = [item for item in indexed if item["id"] == record_id]
    else:
        return None, "query 必须提供 record_index 或 record_id"
    if len(matches) != 1:
        return None, f"query 必须唯一匹配一个已索引记录，实际为 {len(matches)}"
    return matches[0], None


def similarity_search(
    queries: Any,
    indexed: Sequence[dict[str, Any]],
    options: dict[str, Any],
    profile: dict[str, Any],
    toolkit: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    errors = []
    if not isinstance(queries, list) or not queries:
        return [], [
            finding(
                "E-QUERIES-REQUIRED",
                "error",
                "similarity_search 需要非空 queries。",
                "request",
            )
        ]
    if options.get("metric") != "tanimoto":
        return [], [
            finding(
                "E-METRIC-UNSUPPORTED",
                "error",
                "首版 metric 只允许 tanimoto。",
                "request",
            )
        ]
    top_k = options.get("top_k")
    threshold = options.get("threshold")
    if top_k is None and threshold is None:
        return [], [
            finding(
                "E-TOPK-OR-THRESHOLD-REQUIRED",
                "error",
                "top_k 和 threshold 至少提供一个。",
                "request",
            )
        ]
    if top_k is not None and (
        not isinstance(top_k, int)
        or isinstance(top_k, bool)
        or top_k <= 0
        or top_k > MAX_SEARCH_RECORDS
    ):
        errors.append(
            finding(
                "E-TOPK-INVALID",
                "error",
                f"top_k 必须是 1..{MAX_SEARCH_RECORDS} 的整数。",
                "request",
            )
        )
    if threshold is not None and (
        not isinstance(threshold, (int, float))
        or isinstance(threshold, bool)
        or not math.isfinite(float(threshold))
        or not 0 <= float(threshold) <= 1
    ):
        errors.append(
            finding(
                "E-THRESHOLD-INVALID",
                "error",
                "threshold 必须是 [0,1] 的有限数值。",
                "request",
            )
        )
    if not isinstance(options.get("include_self"), bool):
        errors.append(
            finding(
                "E-INCLUDE-SELF-REQUIRED",
                "error",
                "include_self 必须显式为 boolean。",
                "request",
            )
        )
    if errors:
        return [], errors

    DataStructs = toolkit["DataStructs"]
    results = []
    for query_index, raw_query in enumerate(queries):
        query_id = (
            str(raw_query.get("id") or f"query-{query_index + 1:04d}")
            if isinstance(raw_query, dict)
            else f"query-{query_index + 1:04d}"
        )
        if not isinstance(raw_query, dict):
            results.append(
                {
                    "query_id": query_id,
                    "query_status": "invalid",
                    "error": "query 必须是 object",
                    "hits": [],
                }
            )
            continue
        query_record, query_error = find_query_record(raw_query, indexed)
        if query_error or query_record is None:
            results.append(
                {
                    "query_id": query_id,
                    "query_status": "invalid",
                    "error": query_error,
                    "hits": [],
                }
            )
            continue
        candidates = []
        for target in indexed:
            if (
                not options["include_self"]
                and target["record_index"] == query_record["record_index"]
            ):
                continue
            score = float(
                DataStructs.TanimotoSimilarity(
                    query_record["bitvector"], target["bitvector"]
                )
            )
            if threshold is not None and score < float(threshold):
                continue
            candidates.append((target, score))
        candidates.sort(key=lambda item: (-item[1], item[0]["record_index"]))
        total_after_threshold = len(candidates)
        boundary_tie_count = 0
        truncated_equal_score_count = 0
        if top_k is not None and len(candidates) > top_k:
            boundary_score = candidates[top_k - 1][1]
            boundary_tie_count = sum(
                math.isclose(item[1], boundary_score, rel_tol=0.0, abs_tol=0.0)
                for item in candidates
            )
            truncated_equal_score_count = sum(
                math.isclose(item[1], boundary_score, rel_tol=0.0, abs_tol=0.0)
                for item in candidates[top_k:]
            )
            candidates = candidates[:top_k]
        hits = []
        for rank, (target, score) in enumerate(candidates, start=1):
            hits.append(
                {
                    "rank": rank,
                    "query_id": query_record["id"],
                    "query_record_index": query_record["record_index"],
                    "hit_id": target["id"],
                    "hit_record_index": target["record_index"],
                    "query_structure": query_record["source_structure"],
                    "hit_structure": target["source_structure"],
                    "calculation_view": query_record["calculation_view"],
                    "fingerprint_profile_id": profile["profile_id"],
                    "profile_fingerprint": profile["profile_fingerprint"],
                    "metric": "tanimoto",
                    "similarity": score,
                    "exact_structure_match": (
                        query_record["canonical_structure"]
                        == target["canonical_structure"]
                    ),
                    "upstream_disposition": target["disposition"],
                    "upstream_human_review_required": target["human_review_required"],
                }
            )
        results.append(
            {
                "query_id": query_id,
                "query_status": "completed",
                "query_record_id": query_record["id"],
                "query_record_index": query_record["record_index"],
                "total_after_threshold": total_after_threshold,
                "returned_count": len(hits),
                "boundary_tie_count": boundary_tie_count,
                "truncated_equal_score_count": truncated_equal_score_count,
                "tie_break": "score_desc_then_record_index_asc",
                "hits": hits,
            }
        )
    return results, []


def build_substructure_library(
    indexed: Sequence[dict[str, Any]],
    toolkit: dict[str, Any],
) -> tuple[Any, list[dict[str, Any]]]:
    module = toolkit["rdSubstructLibrary"]
    holder = module.CachedSmilesMolHolder()
    patterns = module.PatternHolder()
    mapped = []
    for record in indexed:
        holder.AddSmiles(record["canonical_structure"])
        patterns.AddFingerprint(patterns.MakeFingerprint(record["molecule"]))
        mapped.append(record)
    return module.SubstructLibrary(holder, patterns), mapped


def make_substructure_parameters(use_chirality: bool, toolkit: dict[str, Any]) -> Any:
    params = toolkit["Chem"].SubstructMatchParameters()
    params.useChirality = use_chirality
    params.useEnhancedStereo = False
    params.aromaticMatchesConjugated = False
    params.aromaticMatchesSingleOrDouble = False
    params.useQueryQueryMatches = False
    params.useGenericMatchers = False
    params.recursionPossible = False
    params.uniquify = True
    params.maxMatches = 1
    params.maxRecursiveMatches = 0
    params.specifiedStereoQueryMatchesUnspecified = False
    params.numThreads = 1
    return params


def substructure_search(
    queries: Any,
    indexed: Sequence[dict[str, Any]],
    toolkit: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if not isinstance(queries, list) or not queries:
        return [], [
            finding(
                "E-QUERIES-REQUIRED",
                "error",
                "substructure_search 需要非空 queries。",
                "request",
            )
        ]
    library, mapped = build_substructure_library(indexed, toolkit)
    Chem = toolkit["Chem"]
    results = []
    for query_index, raw_query in enumerate(queries):
        query_id = (
            str(raw_query.get("id") or f"query-{query_index + 1:04d}")
            if isinstance(raw_query, dict)
            else f"query-{query_index + 1:04d}"
        )
        base = {
            "query_id": query_id,
            "query_status": "invalid",
            "query_type": None,
            "query": None,
            "query_sha256": None,
            "use_chirality": None,
            "match_engine": "rdkit_full_subgraph_isomorphism",
            "prefilter": "rdkit_pattern_fingerprint",
            "total_match_count": 0,
            "returned_count": 0,
            "truncated": False,
            "hits": [],
        }
        if not isinstance(raw_query, dict):
            base["error"] = "query 必须是 object"
            results.append(base)
            continue
        query_type = raw_query.get("query_type")
        query_text = raw_query.get("query")
        use_chirality = raw_query.get("use_chirality")
        max_results = raw_query.get("max_results")
        base.update(
            {
                "query_type": query_type,
                "query": query_text,
                "query_sha256": (
                    sha256_text(query_text) if isinstance(query_text, str) else None
                ),
                "use_chirality": use_chirality,
            }
        )
        if query_type not in {"smarts", "smiles"}:
            base["error"] = "query_type 必须显式为 smarts 或 smiles"
            results.append(base)
            continue
        if not isinstance(query_text, str) or not query_text.strip():
            base["error"] = "query 不能为空"
            results.append(base)
            continue
        if "$(" in query_text:
            base["error"] = "首版拒绝 recursive SMARTS"
            base["error_code"] = "E-RECURSIVE-SMARTS-UNSUPPORTED"
            results.append(base)
            continue
        if not isinstance(use_chirality, bool):
            base["error"] = "use_chirality 必须显式为 boolean"
            results.append(base)
            continue
        if (
            not isinstance(max_results, int)
            or isinstance(max_results, bool)
            or max_results <= 0
            or max_results > MAX_SEARCH_RECORDS
        ):
            base["error"] = f"max_results 必须是 1..{MAX_SEARCH_RECORDS} 的整数"
            results.append(base)
            continue
        try:
            with toolkit["rdBase"].BlockLogs():
                query_mol = (
                    Chem.MolFromSmarts(query_text)
                    if query_type == "smarts"
                    else Chem.MolFromSmiles(query_text)
                )
        except Exception:
            query_mol = None
        if query_mol is None:
            base["error"] = "RDKit 无法解析查询"
            results.append(base)
            continue
        params = make_substructure_parameters(use_chirality, toolkit)
        total_count = int(library.CountMatches(query_mol, params, numThreads=1))
        match_indices = list(
            library.GetMatches(
                query_mol,
                params,
                numThreads=1,
                maxResults=max_results,
            )
        )
        hits = []
        for rank, internal_index in enumerate(match_indices, start=1):
            target = mapped[internal_index]
            atom_indices = tuple(
                target["molecule"].GetSubstructMatch(query_mol, params)
            )
            if not atom_indices:
                continue
            hits.append(
                {
                    "rank": rank,
                    "hit_id": target["id"],
                    "hit_record_index": target["record_index"],
                    "hit_structure": target["source_structure"],
                    "calculation_view": target["calculation_view"],
                    "match_atom_indices": list(atom_indices),
                    "matched_atom_count": len(atom_indices),
                    "match_engine": "rdkit_full_subgraph_isomorphism",
                    "upstream_disposition": target["disposition"],
                    "upstream_human_review_required": target["human_review_required"],
                }
            )
        base.update(
            {
                "query_status": "completed",
                "normalized_query": Chem.MolToSmarts(query_mol),
                "parameters": {
                    "useChirality": use_chirality,
                    "useEnhancedStereo": False,
                    "aromaticMatchesConjugated": False,
                    "aromaticMatchesSingleOrDouble": False,
                    "useQueryQueryMatches": False,
                    "useGenericMatchers": False,
                    "recursionPossible": False,
                    "uniquify": True,
                    "maxMatches": 1,
                    "maxRecursiveMatches": 0,
                    "numThreads": 1,
                },
                "total_match_count": total_count,
                "returned_count": len(hits),
                "truncated": total_count > len(hits),
                "hits": hits,
            }
        )
        results.append(base)
    return results, []


def cluster_library(
    indexed: Sequence[dict[str, Any]],
    options: dict[str, Any],
    profile: dict[str, Any],
    toolkit: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if options.get("metric") != "tanimoto":
        return [], [
            finding(
                "E-METRIC-UNSUPPORTED",
                "error",
                "首版 metric 只允许 tanimoto。",
                "request",
            )
        ]
    threshold = options.get("similarity_threshold")
    if (
        not isinstance(threshold, (int, float))
        or isinstance(threshold, bool)
        or not math.isfinite(float(threshold))
        or not 0 <= float(threshold) <= 1
    ):
        return [], [
            finding(
                "E-THRESHOLD-INVALID",
                "error",
                "similarity_threshold 必须是 [0,1] 的有限数值。",
                "request",
            )
        ]
    fps = [record["bitvector"] for record in indexed]
    DataStructs = toolkit["DataStructs"]
    distances = []
    for index in range(1, len(fps)):
        similarities = DataStructs.BulkTanimotoSimilarity(fps[index], fps[:index])
        distances.extend(1.0 - float(value) for value in similarities)
    raw_clusters = toolkit["Butina"].ClusterData(
        distances,
        len(fps),
        1.0 - float(threshold),
        isDistData=True,
        reordering=True,
    )
    clusters = []
    for cluster_index, internal_indices in enumerate(raw_clusters, start=1):
        centroid = indexed[internal_indices[0]]
        members = [indexed[item] for item in internal_indices]
        similarities = [
            float(
                DataStructs.TanimotoSimilarity(
                    centroid["bitvector"], member["bitvector"]
                )
            )
            for member in members
        ]
        clusters.append(
            {
                "cluster_id": f"cluster-{cluster_index:04d}",
                "centroid_id": centroid["id"],
                "centroid_record_index": centroid["record_index"],
                "member_ids": [member["id"] for member in members],
                "member_record_indices": [member["record_index"] for member in members],
                "size": len(members),
                "singleton": len(members) == 1,
                "calculation_view": centroid["calculation_view"],
                "fingerprint_profile_id": profile["profile_id"],
                "profile_fingerprint": profile["profile_fingerprint"],
                "metric": "tanimoto",
                "similarity_threshold": float(threshold),
                "distance_threshold": 1.0 - float(threshold),
                "reordering": True,
                "centroid_to_member_similarity": {
                    "min": min(similarities),
                    "max": max(similarities),
                },
                "interpretation": (
                    "当前 fingerprint/阈值下的结构分组，不表示活性、机制或样品身份相同。"
                ),
            }
        )
    return clusters, []


def select_diverse_subset(
    indexed: Sequence[dict[str, Any]],
    options: dict[str, Any],
    profile: dict[str, Any],
    toolkit: dict[str, Any],
) -> tuple[Optional[dict[str, Any]], list[dict[str, Any]]]:
    if options.get("metric") != "tanimoto":
        return None, [
            finding(
                "E-METRIC-UNSUPPORTED",
                "error",
                "首版 metric 只允许 tanimoto。",
                "request",
            )
        ]
    pick_size = options.get("pick_size")
    seed = options.get("seed")
    first_picks = options.get("first_picks", [])
    if (
        not isinstance(pick_size, int)
        or isinstance(pick_size, bool)
        or pick_size <= 0
        or pick_size > len(indexed)
    ):
        return None, [
            finding(
                "E-PICK-SIZE-INVALID",
                "error",
                "pick_size 必须是 1..indexed_count 的整数。",
                "request",
            )
        ]
    if not isinstance(seed, int) or isinstance(seed, bool) or seed < 0:
        return None, [
            finding(
                "E-SEED-INVALID",
                "error",
                "seed 必须是非负整数。",
                "request",
            )
        ]
    if not isinstance(first_picks, list) or not all(
        isinstance(item, int) and not isinstance(item, bool) for item in first_picks
    ):
        return None, [
            finding(
                "E-FIRST-PICKS-INVALID",
                "error",
                "first_picks 必须是 record_index 整数数组。",
                "request",
            )
        ]
    if len(first_picks) != len(set(first_picks)):
        return None, [
            finding(
                "E-FIRST-PICKS-DUPLICATE",
                "error",
                "first_picks 不能重复。",
                "request",
            )
        ]
    internal_by_record_index = {
        record["record_index"]: index for index, record in enumerate(indexed)
    }
    if any(item not in internal_by_record_index for item in first_picks):
        return None, [
            finding(
                "E-FIRST-PICKS-UNKNOWN",
                "error",
                "first_picks 必须引用已索引 record_index。",
                "request",
            )
        ]
    if len(first_picks) > pick_size:
        return None, [
            finding(
                "E-FIRST-PICKS-TOO-MANY",
                "error",
                "first_picks 数量不能超过 pick_size。",
                "request",
            )
        ]
    first_internal = tuple(internal_by_record_index[item] for item in first_picks)
    fps = [record["bitvector"] for record in indexed]
    picked_internal = list(
        toolkit["MaxMinPicker"]().LazyBitVectorPick(
            fps,
            len(fps),
            pick_size,
            first_internal,
            seed,
        )
    )
    DataStructs = toolkit["DataStructs"]
    picks = []
    prior = []
    for pick_order, internal_index in enumerate(picked_internal, start=1):
        record = indexed[internal_index]
        if prior:
            similarities = [
                float(DataStructs.TanimotoSimilarity(record["bitvector"], fps[item]))
                for item in prior
            ]
            min_distance = min(1.0 - value for value in similarities)
        else:
            min_distance = None
        picks.append(
            {
                "pick_order": pick_order,
                "id": record["id"],
                "record_index": record["record_index"],
                "source_structure": record["source_structure"],
                "min_tanimoto_distance_to_prior_picks": min_distance,
                "upstream_disposition": record["disposition"],
                "upstream_human_review_required": record["human_review_required"],
            }
        )
        prior.append(internal_index)
    return {
        "method": "rdkit_maxmin_lazy_bitvector",
        "metric": "tanimoto_distance",
        "pick_size": pick_size,
        "seed": seed,
        "first_picks_record_indices": first_picks,
        "fingerprint_profile_id": profile["profile_id"],
        "profile_fingerprint": profile["profile_fingerprint"],
        "picks": picks,
        "interpretation": (
            "只表示当前 fingerprint 下的结构多样性选择，不代表实验或合成优先级。"
        ),
    }, []


def blocked_contract_manifest(
    artifact: dict[str, Any],
    calculation_view: str,
) -> list[dict[str, Any]]:
    raw_records = artifact.get("records")
    if not isinstance(raw_records, list):
        return []
    manifest = []
    for index, raw in enumerate(raw_records):
        record = raw if isinstance(raw, dict) else {}
        manifest.append(
            {
                "id": str(record.get("id") or f"record-{index + 1:04d}"),
                "record_index": index,
                "source_structure": record.get("source_structure"),
                "canonical_structure": record.get("calculation_canonical_smiles"),
                "calculation_view": record.get(
                    "calculation_view",
                    calculation_view,
                ),
                "upstream_calculation_status": record.get("calculation_status"),
                "upstream_disposition": record.get("disposition"),
                "upstream_human_review_required": normalize_review_reasons(
                    record.get("human_review_required")
                ),
                "index_status": "incompatible",
                "reason": "upstream_artifact_contract_invalid",
            }
        )
    return manifest


def validate_upstream_contract(
    artifact: dict[str, Any],
) -> list[str]:
    return FEATURE_ARTIFACT_CONTRACT.validate_feature_artifact(artifact)


def base_document(
    request: dict[str, Any],
    library: dict[str, Any],
    context: dict[str, Any],
    options: dict[str, Any],
    toolkit: dict[str, Any],
    generated_at_utc: Optional[str],
) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "workflow": WORKFLOW,
        "generated_at_utc": generated_at_utc or now_utc(),
        "operation": request["operation"],
        "library_status": "blocked",
        "operation_status": "not_run",
        "tool_versions": tool_versions(toolkit),
        "dependency_metadata": dependency_metadata(),
        "options": options,
        "upstream_artifact": {
            "declared_path": context["library_path_declared"],
            "file_sha256": context["library_sha256"],
            "schema_version": library.get("schema_version"),
            "workflow": library.get("workflow"),
            "result_fingerprint": library.get("result_fingerprint"),
        },
        "request_provenance": {
            "request_sha256": context["request_sha256"],
        },
        "library_summary": {},
        "index_metadata": {
            "backend": "rdkit_in_memory",
            "persistent_index": False,
            "network_access": False,
            "automatic_backend_fallback": False,
            "fingerprint_profile_id": None,
            "profile_fingerprint": None,
        },
        "record_manifest": [],
        "query_results": [],
        "clusters": [],
        "selection": None,
        "curation_review_queue": [],
        "excluded_records": [],
        "errors": [],
        "warnings": [],
        "notices": [
            "结构相似性只描述当前 fingerprint/metric，不证明活性、功能、机制或可合成性相同。",
            "子结构命中只表示查询子图匹配，不证明样品身份、性质或实验结论。",
            "聚类和多样性选择只描述当前 profile/参数下的结构关系。",
            "本工作流只读运行，不删除、合并、覆盖或写回用户化合物库。",
            "parent 是派生视图；相同 parent 不表示相同盐型或物理样品。",
        ],
        "human_review_required": [],
    }


def finalize_document(document: dict[str, Any]) -> dict[str, Any]:
    manifest = document["record_manifest"]
    counts = {
        status: sum(item["index_status"] == status for item in manifest)
        for status in INDEX_STATUSES
    }
    document["library_summary"] = {
        "total_records": len(manifest),
        "index_status_counts": counts,
        "indexed_records": counts["indexed"],
        "excluded_records": len(manifest) - counts["indexed"],
        "record_count_conserved": len(manifest) == sum(counts.values()),
    }
    document["excluded_records"] = [
        item for item in manifest if item["index_status"] != "indexed"
    ]
    review_findings = []
    for queue_item in document["curation_review_queue"]:
        review_findings.append(
            {
                "code": "R-CURATION-REVIEW-QUEUE",
                "severity": "review",
                "message": "库治理项需要人工复核；本工具未执行数据修改。",
                "source": "library-curation",
                "details": {
                    "queue_id": queue_item["queue_id"],
                    "type": queue_item["type"],
                },
            }
        )
    document["human_review_required"] = review_findings
    if document["errors"]:
        if document["operation_status"] == "completed":
            document["operation_status"] = "partial"
        elif document["operation_status"] not in {"partial", "error"}:
            document["operation_status"] = "not_run"
    contract_invalid = any(
        isinstance(item, dict) and item.get("code") == "E-FEATURE-ARTIFACT-CONTRACT"
        for item in document["errors"]
    )
    if contract_invalid:
        document["library_status"] = "blocked"
    elif not manifest or counts["indexed"] == 0:
        document["library_status"] = "blocked"
    elif counts["indexed"] == len(manifest):
        document["library_status"] = "ready"
    else:
        document["library_status"] = "partial"
    document["result_fingerprint"] = output_fingerprint(document)
    serialized = json.dumps(document, ensure_ascii=False)
    if SECRET_RE.search(serialized):
        raise RuntimeError("输出中检测到疑似凭证，已停止写出。")
    return document


def resolve_fingerprint_profile(
    operation: str,
    options: dict[str, Any],
    artifact: dict[str, Any],
    document: dict[str, Any],
) -> tuple[Optional[str], Optional[dict[str, Any]]]:
    needs_profile = operation in {
        "similarity_search",
        "cluster_library",
        "select_diverse_subset",
    }
    if not needs_profile:
        return None, None
    profile_id = options.get("fingerprint_profile_id")
    if not isinstance(profile_id, str) or not profile_id:
        document["errors"].append(
            finding(
                "E-FINGERPRINT-PROFILE-REQUIRED",
                "error",
                "该 operation 必须显式提供 fingerprint_profile_id。",
                "request",
            )
        )
        return None, None
    name, profile, error = find_profile(artifact, profile_id)
    if error:
        document["errors"].append(
            finding(
                "E-FINGERPRINT-PROFILE-INCOMPATIBLE",
                "error",
                error,
                "upstream-contract",
            )
        )
        return None, None
    document["index_metadata"].update(
        {
            "fingerprint_profile_id": profile["profile_id"],
            "profile_fingerprint": profile["profile_fingerprint"],
        }
    )
    return name, profile


def dispatch_operation(
    operation: str,
    request: dict[str, Any],
    indexed: Sequence[dict[str, Any]],
    options: dict[str, Any],
    profile: Optional[dict[str, Any]],
    toolkit: dict[str, Any],
    document: dict[str, Any],
) -> list[dict[str, Any]]:
    operation_errors = []
    if operation == "audit_library":
        return operation_errors
    if operation == "similarity_search":
        assert profile is not None
        document["query_results"], operation_errors = similarity_search(
            request.get("queries"),
            indexed,
            options,
            profile,
            toolkit,
        )
    elif operation == "substructure_search":
        document["query_results"], operation_errors = substructure_search(
            request.get("queries"),
            indexed,
            toolkit,
        )
    elif operation == "cluster_library":
        assert profile is not None
        document["clusters"], operation_errors = cluster_library(
            indexed,
            options,
            profile,
            toolkit,
        )
    elif operation == "select_diverse_subset":
        assert profile is not None
        document["selection"], operation_errors = select_diverse_subset(
            indexed,
            options,
            profile,
            toolkit,
        )
    return operation_errors


def update_operation_status(
    operation: str,
    operation_errors: list[dict[str, Any]],
    document: dict[str, Any],
) -> None:
    if operation_errors:
        document["operation_status"] = "not_run"
        return
    if operation not in {"similarity_search", "substructure_search"}:
        document["operation_status"] = "completed"
        return
    invalid = sum(
        item.get("query_status") != "completed" for item in document["query_results"]
    )
    if invalid == len(document["query_results"]):
        document["operation_status"] = "error"
    elif invalid:
        document["operation_status"] = "partial"
    else:
        document["operation_status"] = "completed"


def process_request(
    request: dict[str, Any],
    library: dict[str, Any],
    context: dict[str, Any],
    *,
    generated_at_utc: Optional[str] = None,
) -> dict[str, Any]:
    toolkit = load_toolkit()
    calculation_view, include_review_required, options = validate_common_options(
        request
    )
    operation = request["operation"]
    document = base_document(
        request,
        library,
        context,
        options,
        toolkit,
        generated_at_utc,
    )
    contract_errors = validate_upstream_contract(library)
    if contract_errors:
        document["errors"].append(
            finding(
                "E-FEATURE-ARTIFACT-CONTRACT",
                "error",
                "features Artifact 未通过 library 输入合同。",
                "upstream-contract",
                contract_errors=contract_errors,
            )
        )
        document["record_manifest"] = blocked_contract_manifest(
            library,
            calculation_view,
        )
        document["operation_status"] = "not_run"
        return finalize_document(document)
    records, _, normalization_errors, normalization_warnings = (
        normalize_library_records(library, calculation_view, toolkit)
    )
    document["errors"].extend(normalization_errors)
    document["warnings"].extend(normalization_warnings)
    canonical_contract_invalid = any(
        item.get("code") == "E-CANONICAL-STRUCTURE-MISMATCH"
        for item in normalization_errors
    )
    if canonical_contract_invalid:
        document["record_manifest"] = blocked_contract_manifest(
            library,
            calculation_view,
        )
        document["operation_status"] = "not_run"
        return finalize_document(document)

    profile_name, profile = resolve_fingerprint_profile(
        operation,
        options,
        library,
        document,
    )

    indexed, manifest, review_queue = prepare_records(
        records,
        operation=operation,
        include_review_required=include_review_required,
        profile_name=profile_name,
        profile=profile,
        toolkit=toolkit,
    )
    document["record_manifest"] = manifest
    document["curation_review_queue"].extend(review_queue)
    document["curation_review_queue"].extend(duplicate_review_groups(records))

    limit = (
        MAX_CLUSTER_RECORDS if operation == "cluster_library" else MAX_SEARCH_RECORDS
    )
    if len(indexed) > limit:
        document["errors"].append(
            finding(
                "E-RESOURCE-LIMIT",
                "error",
                f"{operation} 首版最多处理 {limit} 个可检索记录。",
                "resource-guard",
                indexed_records=len(indexed),
                limit=limit,
            )
        )
        document["operation_status"] = "not_run"
        return finalize_document(document)
    if document["errors"]:
        return finalize_document(document)
    if not indexed:
        document["errors"].append(
            finding(
                "E-NO-INDEXED-RECORDS",
                "error",
                "没有可执行 operation 的已索引记录。",
                "library",
            )
        )
        return finalize_document(document)

    operation_errors = dispatch_operation(
        operation,
        request,
        indexed,
        options,
        profile,
        toolkit,
        document,
    )
    document["errors"].extend(operation_errors)
    update_operation_status(
        operation,
        operation_errors,
        document,
    )
    return finalize_document(document)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument(
        "--generated-at",
        help="固定 UTC 时间，仅用于可重复验收；默认取当前时间",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        request, library, context = load_request(args.request)
        document = process_request(
            request,
            library,
            context,
            generated_at_utc=args.generated_at,
        )
    except (
        DependencyFailure,
        InputFailure,
        OSError,
        ValueError,
        json.JSONDecodeError,
    ) as error:
        sys.stderr.write(f"error: {error}\n")
        return 3
    serialized = json.dumps(document, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(serialized, encoding="utf-8")
    else:
        sys.stdout.write(serialized)
    return 0 if document["operation_status"] == "completed" else 2


if __name__ == "__main__":
    raise SystemExit(main())
