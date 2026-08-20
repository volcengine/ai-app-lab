#!/usr/bin/env python3
"""Search curated reaction precedents with explicit providers and profiles."""

from __future__ import annotations

import argparse
import base64
import hashlib
import importlib.util
import json
import platform
import re
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Sequence

SCHEMA_VERSION = "1.0.0"
WORKFLOW = "search-reactions"
RULESET_VERSION = "1.1.0"
OPERATIONS = {
    "lookup_reaction",
    "search_components",
    "search_transformations",
    "search_similar_reactions",
}
PROVIDERS = {"local_curated_corpus", "ord_public_api"}
PROVIDER_STATUSES = {
    "completed",
    "completed_zero_hits",
    "partial",
    "blocked",
    "source_timeout",
    "source_error",
}
PROFILE_DEFINITIONS = {
    "rdkit-difference-atompair-v1": {
        "kind": "difference",
        "fpSize": 2048,
        "fpType": "AtomPairFP",
        "includeAgents": False,
        "metric": "dice",
    },
    "rdkit-structural-atompair-v1": {
        "kind": "structural",
        "fpSize": 2048,
        "fpType": "AtomPairFP",
        "includeAgents": False,
        "metric": "tanimoto",
    },
}
COMPONENT_MODES = {"exact", "substructure", "smarts", "similar"}
COMPONENT_TARGETS = {"input", "output"}
MAX_LOCAL_RECORDS = 50_000
MAX_REMOTE_CANDIDATES = 1_000
MAX_TOP_K = 100
ORD_API_BASE = "https://open-reaction-database.org/api"
TEMPORAL_KEYS = {
    "generated_at_utc",
    "retrieved_at_utc",
    "runtime_seconds",
    "elapsed_seconds",
    "result_fingerprint",
}
SECRET_RE = re.compile(
    r"ark-[A-Za-z0-9_-]{12,}|"
    r"Bearer\s+[A-Za-z0-9._~+/=-]{12,}|"
    r"(?:Authorization|Cookie|Token|Api[_ -]?Key)\s*[:=]\s*\S{12,}",
    re.IGNORECASE,
)


class DependencyFailure(RuntimeError):
    """Fixed chemistry dependencies are unavailable."""


class InputFailure(ValueError):
    """The request cannot be executed under the frozen contract."""


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
    "search_curated_artifact_contract",
)
LOCAL_CORPUS_ADAPTER = load_local_module(
    "local_corpus_adapter.py",
    "search_local_corpus_adapter",
)
SEARCH_OUTPUT_CONTRACT = load_local_module(
    "search_output_contract.py",
    "search_output_contract",
)


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


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


curated_artifact_fingerprint = CURATED_CONTRACT.curated_artifact_fingerprint


def load_toolkit() -> dict[str, Any]:
    try:
        import rdkit
        from google.protobuf.json_format import MessageToDict
        from ord_schema import message_helpers
        from ord_schema.proto import reaction_pb2
        from rdkit import Chem, DataStructs, rdBase
        from rdkit.Chem import rdChemReactions, rdFingerprintGenerator
    except ImportError as error:
        raise DependencyFailure(
            "需要 rdkit==2025.9.2 和 ord-schema==0.8.3；"
            "请在隔离环境安装 scripts/requirements.txt。"
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
        "reaction_pb2": reaction_pb2,
        "message_helpers": message_helpers,
        "MessageToDict": MessageToDict,
    }


def tool_versions(toolkit: dict[str, Any]) -> dict[str, str]:
    try:
        import importlib.metadata

        ord_version = importlib.metadata.version("ord-schema")
    except Exception:
        ord_version = "unknown"
    return {
        "python": platform.python_version(),
        "rdkit": toolkit["rdkit"].__version__,
        "ord-schema": ord_version,
        "search-reactions": RULESET_VERSION,
    }


def issue(code: str, message: str, **details: Any) -> dict[str, Any]:
    value = {"code": code, "message": message}
    if details:
        value["details"] = details
    return value


def split_reaction_smiles(value: Any) -> tuple[list[str], list[str], list[str]]:
    if not isinstance(value, str) or not value.strip():
        raise InputFailure("reaction_smiles 必须是非空字符串。")
    text = value.strip()
    if ">>" in text:
        if text.count(">>") != 1:
            raise InputFailure("reaction_smiles 必须是单步两段或三段形式。")
        left, right = text.split(">>")
        middle = ""
    else:
        parts = text.split(">")
        if len(parts) != 3:
            raise InputFailure("reaction_smiles 必须是单步两段或三段形式。")
        left, middle, right = parts
    inputs = [item for item in left.split(".") if item]
    agents = [item for item in middle.split(".") if item]
    outputs = [item for item in right.split(".") if item]
    if not inputs or not outputs:
        raise InputFailure("reaction_smiles 必须同时包含输入和输出。")
    return inputs, agents, outputs


def parse_molecule(value: str, toolkit: dict[str, Any], *, smarts: bool = False) -> Any:
    parser = toolkit["Chem"].MolFromSmarts if smarts else toolkit["Chem"].MolFromSmiles
    try:
        with toolkit["rdBase"].BlockLogs():
            molecule = parser(value)
    except Exception:
        molecule = None
    if molecule is None:
        kind = "SMARTS" if smarts else "SMILES"
        raise InputFailure(f"无法解析{kind}：{value!r}")
    return molecule


def canonical_component(value: str, toolkit: dict[str, Any]) -> str:
    molecule = parse_molecule(value, toolkit)
    return toolkit["Chem"].MolToSmiles(molecule, canonical=True, isomericSmiles=True)


def canonical_reaction_smiles(value: str, toolkit: dict[str, Any]) -> str:
    inputs, agents, outputs = split_reaction_smiles(value)
    sides = [
        ".".join(sorted(canonical_component(item, toolkit) for item in inputs)),
        ".".join(sorted(canonical_component(item, toolkit) for item in agents)),
        ".".join(sorted(canonical_component(item, toolkit) for item in outputs)),
    ]
    return ">".join(sides)


def reaction_object(value: str, toolkit: dict[str, Any]) -> Any:
    canonical = canonical_reaction_smiles(value, toolkit)
    reaction = toolkit["rdChemReactions"].ReactionFromSmarts(canonical, useSmiles=True)
    if reaction is None:
        raise InputFailure("RDKit 无法生成 reaction object。")
    return reaction


def remove_reaction_stereochemistry(reaction: Any, toolkit: dict[str, Any]) -> None:
    for count_method, template_method in (
        ("GetNumReactantTemplates", "GetReactantTemplate"),
        ("GetNumAgentTemplates", "GetAgentTemplate"),
        ("GetNumProductTemplates", "GetProductTemplate"),
    ):
        for index in range(getattr(reaction, count_method)()):
            template = getattr(reaction, template_method)(index)
            toolkit["Chem"].RemoveStereochemistry(template)
            template.UpdatePropertyCache(strict=False)


def prepare_reaction_templates(reaction: Any) -> None:
    for count_method, template_method in (
        ("GetNumReactantTemplates", "GetReactantTemplate"),
        ("GetNumAgentTemplates", "GetAgentTemplate"),
        ("GetNumProductTemplates", "GetProductTemplate"),
    ):
        for index in range(getattr(reaction, count_method)()):
            getattr(reaction, template_method)(index).UpdatePropertyCache(strict=False)


def reaction_stereo_match(candidate: Any, query: Any) -> bool:
    for count_method, template_method in (
        ("GetNumReactantTemplates", "GetReactantTemplate"),
        ("GetNumProductTemplates", "GetProductTemplate"),
    ):
        candidate_templates = [
            getattr(candidate, template_method)(index)
            for index in range(getattr(candidate, count_method)())
        ]
        for index in range(getattr(query, count_method)()):
            query_template = getattr(query, template_method)(index)
            if not any(
                candidate_template.HasSubstructMatch(query_template, useChirality=True)
                for candidate_template in candidate_templates
            ):
                return False
    return True


def reaction_fingerprint(
    value: str, profile_id: str, toolkit: dict[str, Any]
) -> tuple[Any, dict[str, Any]]:
    definition = PROFILE_DEFINITIONS.get(profile_id)
    if definition is None:
        raise InputFailure(f"不支持的 fingerprint_profile_id：{profile_id!r}")
    params = toolkit["rdChemReactions"].ReactionFingerprintParams()
    params.fpSize = definition["fpSize"]
    params.fpType = toolkit["rdChemReactions"].FingerprintType.AtomPairFP
    params.includeAgents = definition["includeAgents"]
    reaction = reaction_object(value, toolkit)
    if definition["kind"] == "difference":
        fingerprint = toolkit["rdChemReactions"].CreateDifferenceFingerprintForReaction(
            reaction, params
        )
    else:
        fingerprint = toolkit["rdChemReactions"].CreateStructuralFingerprintForReaction(
            reaction, params
        )
    metadata = {
        "profile_id": profile_id,
        "tool": "RDKit",
        "version": toolkit["rdkit"].__version__,
        "parameters": {
            "fpSize": definition["fpSize"],
            "fpType": definition["fpType"],
            "includeAgents": definition["includeAgents"],
        },
        "metric": definition["metric"],
    }
    return fingerprint, metadata


def fingerprint_similarity(
    left: Any, right: Any, metric: str, toolkit: dict[str, Any]
) -> float:
    if metric == "dice":
        return float(toolkit["DataStructs"].DiceSimilarity(left, right))
    if metric == "tanimoto":
        return float(toolkit["DataStructs"].TanimotoSimilarity(left, right))
    raise InputFailure(f"不支持的 metric：{metric}")


def build_similarity_index(
    candidates: list[dict[str, Any]],
    profile_id: str,
    toolkit: dict[str, Any],
) -> tuple[list[Any], dict[str, Any]]:
    fingerprints = []
    metadata = None
    for candidate in candidates:
        fingerprint, current_metadata = reaction_fingerprint(
            candidate["reaction_smiles"], profile_id, toolkit
        )
        fingerprints.append(fingerprint)
        if metadata is None:
            metadata = current_metadata
    if metadata is None:
        definition = PROFILE_DEFINITIONS[profile_id]
        metadata = {
            "profile_id": profile_id,
            "tool": "RDKit",
            "version": toolkit["rdkit"].__version__,
            "parameters": {
                "fpSize": definition["fpSize"],
                "fpType": definition["fpType"],
                "includeAgents": definition["includeAgents"],
            },
            "metric": definition["metric"],
        }
    return fingerprints, metadata


def bulk_similarity(
    query_fingerprint: Any,
    candidate_fingerprints: list[Any],
    metric: str,
    toolkit: dict[str, Any],
) -> list[float]:
    if metric == "dice":
        values = toolkit["DataStructs"].BulkDiceSimilarity(
            query_fingerprint, candidate_fingerprints
        )
    elif metric == "tanimoto":
        values = toolkit["DataStructs"].BulkTanimotoSimilarity(
            query_fingerprint, candidate_fingerprints
        )
    else:
        raise InputFailure(f"不支持的 metric：{metric}")
    return [float(value) for value in values]


def extract_reaction_smiles(record: dict[str, Any]) -> str | None:
    value = record.get("reaction_smiles")
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in ("canonical_unmapped", "reported"):
            if isinstance(value.get(key), str) and value[key]:
                return value[key]
    return None


def participant_table(
    reaction_smiles: str, record: dict[str, Any], toolkit: dict[str, Any]
) -> list[dict[str, Any]]:
    existing = record.get("participant_assessments")
    if isinstance(existing, list) and existing:
        return [
            {
                "participant_id": item.get("participant_id"),
                "side": item.get("side"),
                "reported_role": item.get("reported_role"),
                "structure": item.get("standardized_form") or item.get("reported_form"),
                "upstream_record_id": item.get("upstream_record_id"),
                "upstream_binding_status": item.get("upstream_binding_status"),
                "upstream_disposition": item.get("upstream_disposition"),
            }
            for item in existing
            if isinstance(item, dict)
        ]
    inputs, agents, outputs = split_reaction_smiles(reaction_smiles)
    result = []
    for side, values in (("input", inputs), ("agent", agents), ("output", outputs)):
        for index, value in enumerate(values):
            result.append(
                {
                    "participant_id": f"{side}-{index + 1}",
                    "side": side,
                    "reported_role": "product" if side == "output" else "unknown",
                    "structure": canonical_component(value, toolkit),
                    "upstream_record_id": None,
                    "upstream_binding_status": "not_requested",
                    "upstream_disposition": None,
                }
            )
    return result


def ord_yield_measurements(ord_record: Any) -> list[dict[str, Any]]:
    if not isinstance(ord_record, dict):
        return []
    measurements = []
    for outcome_index, outcome in enumerate(ord_record.get("outcomes") or []):
        if not isinstance(outcome, dict):
            continue
        for product_index, product in enumerate(outcome.get("products") or []):
            if not isinstance(product, dict):
                continue
            product_id = f"outcome-{outcome_index + 1}-product-{product_index + 1}"
            for identifier in product.get("identifiers") or []:
                if (
                    isinstance(identifier, dict)
                    and identifier.get("type") == "SMILES"
                    and identifier.get("value")
                ):
                    product_id = str(identifier["value"])
                    break
            for measurement in product.get("measurements") or []:
                if (
                    not isinstance(measurement, dict)
                    or measurement.get("type") != "YIELD"
                ):
                    continue
                percentage = measurement.get("percentage")
                measurements.append(
                    {
                        "value": (
                            percentage.get("value")
                            if isinstance(percentage, dict)
                            else None
                        ),
                        "units": "PERCENT",
                        "type": "reported",
                        "product_id": product_id,
                        "analysis_key": measurement.get("analysis_key"),
                    }
                )
    return measurements


def normalize_candidate(
    record: dict[str, Any],
    provider: str,
    toolkit: dict[str, Any],
) -> tuple[dict[str, Any] | None, str | None]:
    reaction_smiles = extract_reaction_smiles(record)
    if not reaction_smiles:
        return None, "missing_reaction_smiles"
    try:
        canonical = canonical_reaction_smiles(reaction_smiles, toolkit)
        participants = participant_table(canonical, record, toolkit)
    except InputFailure:
        return None, "invalid_reaction_smiles"
    reaction_id = (
        record.get("record_id") or record.get("reaction_id") or record.get("id")
    )
    if not isinstance(reaction_id, str) or not reaction_id:
        return None, "missing_reaction_id"
    disposition = record.get("disposition") or record.get("curation_disposition")
    if disposition is None:
        disposition = "review_required"
    ord_record = record.get("ord_record")
    if not isinstance(ord_record, dict):
        ord_record = {}
    source_locator = record.get("source_locator")
    source = record.get("source")
    if not isinstance(source, dict):
        source = {
            "source_locator": source_locator,
            "provenance": ord_record.get("provenance") or {},
        }
    license_value = record.get("license")
    if license_value is None and provider == "ord_public_api":
        license_value = "CC-BY-SA-4.0"
    return (
        {
            "reaction_id": reaction_id,
            "dataset_id": record.get("dataset_id"),
            "provider": provider,
            "reaction_smiles": canonical,
            "participants": participants,
            "conditions": (
                record.get("conditions")
                or record.get("reported_condition_evidence")
                or ord_record.get("conditions")
                or []
            ),
            "yield_measurements": (
                record.get("yield_measurements")
                or (record.get("yield_assessment") or {}).get("measurements")
                or ord_yield_measurements(ord_record)
                or []
            ),
            "source": source,
            "license": license_value,
            "curation_disposition": disposition,
            "quality_findings": record.get("findings")
            or record.get("quality_findings")
            or [],
            "raw_record_hash": sha256_json(record),
        },
        None,
    )


def load_local_candidates(
    artifact: Any,
    *,
    include_review_required: bool,
    toolkit: dict[str, Any],
) -> dict[str, Any]:
    return LOCAL_CORPUS_ADAPTER.load_local_corpus(
        artifact,
        include_review_required,
        toolkit,
        contract_module=CURATED_CONTRACT,
        canonical_reaction=canonical_reaction_smiles,
        normalize_candidate=normalize_candidate,
        issue_factory=issue,
        max_records=MAX_LOCAL_RECORDS,
    )


def validate_component_predicates(
    predicates: Any, toolkit: dict[str, Any]
) -> list[dict[str, Any]]:
    if not isinstance(predicates, list) or not predicates:
        raise InputFailure("search_components 必须提供非空 component_predicates。")
    normalized = []
    for index, item in enumerate(predicates):
        if not isinstance(item, dict):
            raise InputFailure(f"component_predicates[{index}] 必须是 object。")
        target = item.get("target")
        mode = item.get("mode")
        pattern = item.get("pattern")
        if target not in COMPONENT_TARGETS or mode not in COMPONENT_MODES:
            raise InputFailure(f"component_predicates[{index}] target/mode 不受控。")
        if not isinstance(pattern, str) or not pattern:
            raise InputFailure(f"component_predicates[{index}].pattern 不得为空。")
        parse_molecule(pattern, toolkit, smarts=mode == "smarts")
        threshold = item.get("threshold")
        if mode == "similar":
            if (
                not isinstance(threshold, (int, float))
                or isinstance(threshold, bool)
                or not 0 <= threshold <= 1
            ):
                raise InputFailure(
                    "similar component predicate 必须显式提供 0–1 threshold。"
                )
        elif threshold is not None:
            raise InputFailure("只有 similar component predicate 可设置 threshold。")
        normalized.append(
            {
                "target": target,
                "mode": mode,
                "pattern": pattern,
                "threshold": float(threshold) if threshold is not None else None,
            }
        )
    return normalized


def component_match(
    candidate: dict[str, Any],
    predicate: dict[str, Any],
    *,
    use_chirality: bool,
    toolkit: dict[str, Any],
) -> tuple[bool, float | None]:
    candidates = [
        item["structure"]
        for item in candidate["participants"]
        if item.get("side") == predicate["target"]
        and isinstance(item.get("structure"), str)
    ]
    query = parse_molecule(
        predicate["pattern"], toolkit, smarts=predicate["mode"] == "smarts"
    )
    query_canonical = (
        None
        if predicate["mode"] == "smarts"
        else toolkit["Chem"].MolToSmiles(
            query, canonical=True, isomericSmiles=use_chirality
        )
    )
    best_score: float | None = None
    for value in candidates:
        molecule = parse_molecule(value, toolkit)
        if predicate["mode"] == "exact":
            current = toolkit["Chem"].MolToSmiles(
                molecule, canonical=True, isomericSmiles=use_chirality
            )
            if current == query_canonical:
                return True, 1.0
        elif predicate["mode"] in {"substructure", "smarts"}:
            if molecule.HasSubstructMatch(query, useChirality=use_chirality):
                return True, 1.0
        else:
            generator = toolkit["rdFingerprintGenerator"].GetMorganGenerator(
                radius=2, fpSize=2048, includeChirality=use_chirality
            )
            score = float(
                toolkit["DataStructs"].TanimotoSimilarity(
                    generator.GetFingerprint(query),
                    generator.GetFingerprint(molecule),
                )
            )
            best_score = score if best_score is None else max(best_score, score)
    if predicate["mode"] == "similar":
        return bool(
            best_score is not None and best_score >= predicate["threshold"]
        ), best_score
    return False, None


def result_from_candidate(
    candidate: dict[str, Any],
    *,
    retrieval_mode: str,
    raw_score: float | None,
    score_scope: str | None,
    matched_constraints: list[dict[str, Any]],
    fingerprint_profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    result = {
        "rank": None,
        "reaction_id": candidate["reaction_id"],
        "dataset_id": candidate.get("dataset_id"),
        "provider": candidate["provider"],
        "reaction_smiles": candidate["reaction_smiles"],
        "retrieval_mode": retrieval_mode,
        "fingerprint_profile": fingerprint_profile,
        "raw_score": raw_score,
        "score_scope": score_scope,
        "matched_constraints": matched_constraints,
        "participants": candidate["participants"],
        "reported_condition_evidence": candidate["conditions"],
        "yield_measurements": candidate["yield_measurements"],
        "source": candidate["source"],
        "license": candidate["license"],
        "curation_disposition": candidate["curation_disposition"],
        "quality_findings": candidate["quality_findings"],
    }
    result["result_hash"] = sha256_json(
        {
            key: value
            for key, value in result.items()
            if key not in {"rank", "result_hash"}
        }
    )
    return result


def stable_rank(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    results.sort(
        key=lambda item: (
            -int(
                any(
                    constraint.get("exact_target_reaction") is True
                    for constraint in item["matched_constraints"]
                    if isinstance(constraint, dict)
                )
            ),
            -(item["raw_score"] if item["raw_score"] is not None else 1.0),
            item["provider"],
            item.get("dataset_id") or "",
            item["reaction_id"],
        )
    )
    for rank, item in enumerate(results, start=1):
        item["rank"] = rank
    return results


def search_local(
    operation: str,
    query: dict[str, Any],
    options: dict[str, Any],
    candidates: list[dict[str, Any]],
    toolkit: dict[str, Any],
) -> list[dict[str, Any]]:
    if operation == "lookup_reaction":
        reaction_id = query.get("reaction_id")
        if not isinstance(reaction_id, str) or not reaction_id:
            raise InputFailure("lookup_reaction 必须提供 query.reaction_id。")
        results = [
            result_from_candidate(
                item,
                retrieval_mode="exact_id",
                raw_score=1.0,
                score_scope="exact_identifier",
                matched_constraints=[{"reaction_id": reaction_id}],
            )
            for item in candidates
            if item["reaction_id"] == reaction_id
            and (
                not query.get("dataset_id")
                or item.get("dataset_id") == query.get("dataset_id")
            )
        ]
        return stable_rank(results)
    if operation == "search_components":
        predicates = validate_component_predicates(
            query.get("component_predicates"), toolkit
        )
        results = []
        for candidate in candidates:
            matches = [
                component_match(
                    candidate,
                    predicate,
                    use_chirality=options["use_stereochemistry"],
                    toolkit=toolkit,
                )
                for predicate in predicates
            ]
            if all(matched for matched, _ in matches):
                scores = [score for _, score in matches if score is not None]
                raw_score = (
                    min(scores)
                    if any(item["mode"] == "similar" for item in predicates)
                    else 1.0
                )
                results.append(
                    result_from_candidate(
                        candidate,
                        retrieval_mode="component_and_filter",
                        raw_score=raw_score,
                        score_scope="best_component_match_per_predicate",
                        matched_constraints=predicates,
                    )
                )
        return stable_rank(results)
    if operation == "search_transformations":
        smarts = query.get("reaction_smarts")
        if not isinstance(smarts, str) or not smarts:
            raise InputFailure(
                "search_transformations 必须提供 query.reaction_smarts。"
            )
        try:
            query_reaction = toolkit["rdChemReactions"].ReactionFromSmarts(smarts)
        except Exception as error:
            raise InputFailure("query.reaction_smarts 无法解析。") from error
        if query_reaction is None:
            raise InputFailure("query.reaction_smarts 无法解析。")
        if not options["use_stereochemistry"]:
            remove_reaction_stereochemistry(query_reaction, toolkit)
        else:
            prepare_reaction_templates(query_reaction)
        results = []
        for candidate in candidates:
            reaction = reaction_object(candidate["reaction_smiles"], toolkit)
            if not options["use_stereochemistry"]:
                remove_reaction_stereochemistry(reaction, toolkit)
            else:
                prepare_reaction_templates(reaction)
            try:
                matched = toolkit["rdChemReactions"].HasReactionSubstructMatch(
                    reaction,
                    query_reaction,
                    includeAgents=False,
                )
            except Exception:
                matched = False
            if matched and (
                not options["use_stereochemistry"]
                or reaction_stereo_match(reaction, query_reaction)
            ):
                results.append(
                    result_from_candidate(
                        candidate,
                        retrieval_mode="reaction_smarts",
                        raw_score=1.0,
                        score_scope="reaction_substructure_match",
                        matched_constraints=[{"reaction_smarts": smarts}],
                    )
                )
        return stable_rank(results)
    target_smiles = query.get("reaction_smiles")
    if not isinstance(target_smiles, str) or not target_smiles:
        record_id = query.get("reaction_record_id")
        target = next(
            (item for item in candidates if item["reaction_id"] == record_id), None
        )
        if target is None:
            raise InputFailure(
                "相似反应查询必须提供可解析 reaction_smiles 或 corpus record ID。"
            )
        target_smiles = target["reaction_smiles"]
    profile_id = options["fingerprint_profile_id"]
    target_canonical = canonical_reaction_smiles(target_smiles, toolkit)
    query_fp, metadata = reaction_fingerprint(target_smiles, profile_id, toolkit)
    candidate_fingerprints, metadata = build_similarity_index(
        candidates, profile_id, toolkit
    )
    scores = bulk_similarity(
        query_fp, candidate_fingerprints, metadata["metric"], toolkit
    )
    results = []
    for candidate, score in zip(candidates, scores, strict=True):
        if options["threshold"] is None or score >= options["threshold"]:
            exact_target = candidate["reaction_smiles"] == target_canonical
            results.append(
                result_from_candidate(
                    candidate,
                    retrieval_mode="whole_reaction_similarity",
                    raw_score=score,
                    score_scope="whole_reaction",
                    matched_constraints=[{"exact_target_reaction": exact_target}],
                    fingerprint_profile=metadata,
                )
            )
    return stable_rank(results)[: options["top_k"]]


def ord_record_from_payload(
    item: dict[str, Any], toolkit: dict[str, Any]
) -> dict[str, Any]:
    try:
        reaction = toolkit["reaction_pb2"].Reaction.FromString(
            base64.b64decode(item["proto"])
        )
        reaction_smiles = toolkit["message_helpers"].get_reaction_smiles(reaction)
        if not reaction_smiles:
            reactants: list[str] = []
            agents: list[str] = []
            products: list[str] = []

            def smiles_identifiers(compound: Any) -> list[str]:
                values = []
                field = compound.DESCRIPTOR.fields_by_name["identifiers"]
                type_field = field.message_type.fields_by_name["type"]
                for identifier in compound.identifiers:
                    descriptor = type_field.enum_type.values_by_number.get(
                        identifier.type
                    )
                    if (
                        descriptor is not None
                        and descriptor.name == "SMILES"
                        and identifier.value
                    ):
                        values.append(identifier.value)
                return values

            role_field = (
                next(iter(reaction.inputs.values()))
                .DESCRIPTOR.fields_by_name["components"]
                .message_type.fields_by_name["reaction_role"]
                if reaction.inputs
                else None
            )
            for reaction_input in reaction.inputs.values():
                for component in reaction_input.components:
                    role = (
                        role_field.enum_type.values_by_number[
                            component.reaction_role
                        ].name
                        if role_field is not None
                        else "UNSPECIFIED"
                    )
                    target = reactants if role == "REACTANT" else agents
                    target.extend(smiles_identifiers(component))
            for outcome in reaction.outcomes:
                for product in outcome.products:
                    products.extend(smiles_identifiers(product))
            if not reactants and agents:
                reactants, agents = agents, []
            if reactants and products:
                reaction_smiles = (
                    f"{'.'.join(reactants)}>{'.'.join(agents)}>{'.'.join(products)}"
                )
        record = toolkit["MessageToDict"](reaction, preserving_proto_field_name=True)
    except Exception as error:
        raise InputFailure(f"ORD proto 无法解析：{error}") from error
    return {
        "reaction_id": item.get("reaction_id"),
        "dataset_id": item.get("dataset_id"),
        "reaction_smiles": reaction_smiles,
        "conditions": record.get("conditions") or {},
        "yield_measurements": record.get("outcomes") or [],
        "source": {
            "provider": "Open Reaction Database",
            "provenance": record.get("provenance") or {},
        },
        "license": "CC-BY-SA-4.0",
        "curation_disposition": "review_required",
        "quality_findings": [
            issue(
                "W-REMOTE-NOT-CURATED-001",
                "远程 ORD 候选未通过本地 curate-reactions 全量审查。",
            )
        ],
    }


def default_http_get(url: str, timeout: float) -> tuple[int, Any]:
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": "search-reactions/1.0"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
            return response.status, json.loads(raw.decode("utf-8"))
    except urllib.error.HTTPError as error:
        raw = error.read()
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            payload = None
        return int(error.code), payload


def ord_query_params(
    operation: str,
    query: dict[str, Any],
    options: dict[str, Any],
    toolkit: dict[str, Any],
) -> dict[str, Any]:
    if operation == "lookup_reaction":
        reaction_id = query.get("reaction_id")
        if not isinstance(reaction_id, str) or not reaction_id:
            raise InputFailure("lookup_reaction 必须提供 query.reaction_id。")
        return {"reaction_id": reaction_id}
    if operation == "search_components":
        predicates = validate_component_predicates(
            query.get("component_predicates"), toolkit
        )
        similar_thresholds = {
            item["threshold"] for item in predicates if item["mode"] == "similar"
        }
        if len(similar_thresholds) > 1:
            raise InputFailure(
                "ORD provider 的多个 similar predicate 必须共享 threshold。"
            )
        params: dict[str, Any] = {
            "component": [
                canonical_json(
                    {
                        "pattern": item["pattern"],
                        "target": item["target"],
                        "mode": item["mode"],
                    }
                )
                for item in predicates
            ],
            "use_stereochemistry": str(options["use_stereochemistry"]).lower(),
            "limit": min(options["candidate_limit"], MAX_REMOTE_CANDIDATES),
        }
        if similar_thresholds:
            params["similarity"] = next(iter(similar_thresholds))
        return params
    if operation == "search_transformations":
        smarts = query.get("reaction_smarts")
        if not isinstance(smarts, str) or not smarts:
            raise InputFailure("search_transformations 必须提供 reaction_smarts。")
        try:
            parsed = toolkit["rdChemReactions"].ReactionFromSmarts(smarts)
        except Exception as error:
            raise InputFailure("query.reaction_smarts 无法解析。") from error
        if parsed is None:
            raise InputFailure("query.reaction_smarts 无法解析。")
        return {
            "reaction_smarts": smarts,
            "limit": min(options["candidate_limit"], MAX_REMOTE_CANDIDATES),
        }
    raise InputFailure(
        "ORD 不支持无候选约束的 whole-reaction 全库扫描；"
        "search_similar_reactions 必须提供 component_predicates 或 reaction_smarts 召回约束。"
    )


def search_ord(
    operation: str,
    query: dict[str, Any],
    options: dict[str, Any],
    provider_config: dict[str, Any],
    toolkit: dict[str, Any],
    http_get: Callable[[str, float], tuple[int, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    base_url = provider_config.get("base_url", ORD_API_BASE)
    if base_url != ORD_API_BASE:
        raise InputFailure("ORD provider base_url 不在固定 allowlist。")
    timeout = provider_config.get("timeout_seconds", 30)
    if not isinstance(timeout, (int, float)) or not 1 <= timeout <= 60:
        raise InputFailure("timeout_seconds 必须在 1–60 秒。")
    endpoint = "/reaction" if operation == "lookup_reaction" else "/query"
    effective_operation = operation
    effective_query = query
    if operation == "search_similar_reactions":
        if query.get("component_predicates"):
            effective_operation = "search_components"
        elif query.get("reaction_smarts"):
            effective_operation = "search_transformations"
        else:
            raise InputFailure(
                "ORD 相似检索必须提供 component_predicates 或 reaction_smarts。"
            )
    params = ord_query_params(effective_operation, effective_query, options, toolkit)
    url = f"{base_url}{endpoint}?{urllib.parse.urlencode(params, doseq=True)}"
    status, payload = http_get(url, float(timeout))
    if status == 404 and operation == "lookup_reaction":
        return [], []
    if status < 200 or status >= 300:
        raise RuntimeError(f"ORD HTTP {status}")
    items = [payload] if isinstance(payload, dict) else payload
    if not isinstance(items, list):
        raise RuntimeError("ORD response 顶层不是 object/array。")
    candidates, excluded = [], []
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            excluded.append({"index": index, "reason": "remote_item_not_object"})
            continue
        try:
            record = ord_record_from_payload(item, toolkit)
            candidate, reason = normalize_candidate(record, "ord_public_api", toolkit)
        except InputFailure as error:
            candidate, reason = None, f"remote_parse_error:{error}"
        if candidate is None:
            excluded.append({"reaction_id": item.get("reaction_id"), "reason": reason})
        else:
            candidates.append(candidate)
    if items and not candidates and excluded:
        raise RuntimeError("ORD 候选 proto/schema 全部无法解析。")
    if operation == "lookup_reaction":
        results = search_local(operation, query, options, candidates, toolkit)
    elif operation == "search_similar_reactions":
        results = search_local(operation, query, options, candidates, toolkit)
    else:
        results = search_local(
            effective_operation, effective_query, options, candidates, toolkit
        )
        results = results[: options["top_k"]]
    return results, excluded


def normalize_options(request: dict[str, Any]) -> dict[str, Any]:
    options = request.get("options")
    if not isinstance(options, dict):
        raise InputFailure("options 必须是 object。")
    required = {"top_k", "include_review_required", "use_stereochemistry"}
    missing = sorted(required - options.keys())
    if missing:
        raise InputFailure(f"options 缺少显式字段：{', '.join(missing)}")
    top_k = options["top_k"]
    if (
        not isinstance(top_k, int)
        or isinstance(top_k, bool)
        or not 1 <= top_k <= MAX_TOP_K
    ):
        raise InputFailure(f"options.top_k 必须为 1–{MAX_TOP_K}。")
    if not isinstance(options["include_review_required"], bool):
        raise InputFailure("include_review_required 必须是 boolean。")
    if not isinstance(options["use_stereochemistry"], bool):
        raise InputFailure("use_stereochemistry 必须是 boolean。")
    threshold = options.get("threshold")
    if threshold is not None and (
        not isinstance(threshold, (int, float))
        or isinstance(threshold, bool)
        or not 0 <= threshold <= 1
    ):
        raise InputFailure("options.threshold 必须是 null 或 0–1。")
    candidate_limit = options.get("candidate_limit", min(1000, max(top_k, 100)))
    if (
        not isinstance(candidate_limit, int)
        or isinstance(candidate_limit, bool)
        or not 1 <= candidate_limit <= MAX_REMOTE_CANDIDATES
    ):
        raise InputFailure("candidate_limit 必须为 1–1000。")
    return {
        "fingerprint_profile_id": options.get("fingerprint_profile_id"),
        "top_k": top_k,
        "threshold": float(threshold) if threshold is not None else None,
        "candidate_limit": candidate_limit,
        "include_review_required": options["include_review_required"],
        "use_stereochemistry": options["use_stereochemistry"],
    }


def validate_search_request(
    request: dict[str, Any],
    operation: Any,
    provider: Any,
) -> dict[str, Any]:
    if request.get("schema_version") != SCHEMA_VERSION:
        raise InputFailure("schema_version 必须为 1.0.0。")
    if request.get("workflow") != WORKFLOW:
        raise InputFailure("workflow 必须为 search-reactions。")
    if operation not in OPERATIONS:
        raise InputFailure(f"不支持的 operation：{operation!r}")
    if provider not in PROVIDERS:
        raise InputFailure(f"不支持的 provider：{provider!r}")
    options = normalize_options(request)
    if operation == "search_similar_reactions":
        if options["fingerprint_profile_id"] not in PROFILE_DEFINITIONS:
            raise InputFailure("相似反应检索必须显式选择受控 fingerprint profile。")
    elif options["fingerprint_profile_id"] is not None:
        raise InputFailure("非相似反应 operation 不得设置 fingerprint profile。")
    if SECRET_RE.search(canonical_json(request)):
        raise InputFailure("请求中检测到疑似凭证，已停止处理。")
    return options


def process_request(
    request: dict[str, Any],
    *,
    generated_at_utc: str | None = None,
    http_get: Callable[[str, float], tuple[int, Any]] | None = None,
) -> dict[str, Any]:
    started = time.perf_counter()
    toolkit = load_toolkit()
    errors: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    notices = [
        "0 hit 仅表示当前 provider/query 无命中，不表示不存在反应先例。",
        "reported_condition_evidence 是来源报告，不是条件推荐。",
    ]
    operation = request.get("operation")
    provider = request.get("provider")
    query = request.get("query")
    if not isinstance(query, dict):
        query = {}
    excluded: list[dict[str, Any]] = []
    results: list[dict[str, Any]] = []
    corpus_summary = {
        "input_records": 0,
        "searchable_records": 0,
        "excluded_records": 0,
    }
    corpus_provenance = (
        SEARCH_OUTPUT_CONTRACT.ord_corpus_provenance()
        if provider == "ord_public_api"
        else {
            "provider": provider,
            "workflow": None,
            "schema_version": None,
            "ruleset_version": None,
            "artifact_fingerprint": None,
            "record_count": 0,
            "contract_status": "not_assessed",
        }
    )
    provider_status = "blocked"
    normalized_options = {
        "fingerprint_profile_id": None,
        "top_k": 20,
        "threshold": None,
        "candidate_limit": 100,
        "include_review_required": False,
        "use_stereochemistry": False,
    }
    try:
        normalized_options = validate_search_request(
            request,
            operation,
            provider,
        )
        if provider == "local_curated_corpus":
            local = load_local_candidates(
                request.get("corpus_artifact"),
                include_review_required=normalized_options["include_review_required"],
                toolkit=toolkit,
            )
            candidates = local["candidates"]
            excluded = local["excluded"]
            warnings.extend(local["warnings"])
            errors.extend(local["contract_errors"])
            corpus_provenance = local["provenance"]
            corpus_summary = {
                "input_records": local["input_records"],
                "searchable_records": len(candidates),
                "excluded_records": len(excluded),
            }
            if local["contract_errors"]:
                provider_status = "blocked"
            else:
                results = search_local(
                    operation, query, normalized_options, candidates, toolkit
                )[: normalized_options["top_k"]]
                provider_status = "completed" if results else "completed_zero_hits"
        else:
            results, excluded = search_ord(
                operation,
                query,
                normalized_options,
                request.get("provider_config") or {},
                toolkit,
                http_get or default_http_get,
            )
            corpus_summary = {
                "input_records": len(results) + len(excluded),
                "searchable_records": len(results),
                "excluded_records": len(excluded),
            }
            provider_status = "completed" if results else "completed_zero_hits"
    except (socket.timeout, TimeoutError, urllib.error.URLError) as error:
        reason = getattr(error, "reason", None)
        if isinstance(error, (socket.timeout, TimeoutError)) or isinstance(
            reason, (socket.timeout, TimeoutError)
        ):
            provider_status = "source_timeout"
            errors.append(issue("E-SOURCE-TIMEOUT-001", "远程 provider 请求超时。"))
        else:
            provider_status = "source_error"
            errors.append(issue("E-SOURCE-HTTP-001", f"远程 provider 错误：{error}"))
    except RuntimeError as error:
        provider_status = "source_error"
        errors.append(issue("E-SOURCE-HTTP-001", str(error)))
    except (InputFailure, DependencyFailure) as error:
        provider_status = "blocked"
        errors.append(issue("E-REQUEST-BLOCKED-001", str(error)))
    review_queue = [
        {
            "reaction_id": item["reaction_id"],
            "reason_codes": sorted(
                {
                    finding.get("code")
                    for finding in item["quality_findings"]
                    if isinstance(finding, dict) and finding.get("code")
                }
            )
            or ["W-CANDIDATE-REVIEW-001"],
        }
        for item in results
        if item["curation_disposition"] == "review_required"
    ]
    document = {
        "schema_version": SCHEMA_VERSION,
        "workflow": WORKFLOW,
        "ruleset_version": RULESET_VERSION,
        "generated_at_utc": generated_at_utc or now_utc(),
        "operation": operation,
        "provider": provider,
        "provider_status": provider_status,
        "tool_versions": tool_versions(toolkit),
        "query_interpretation": SEARCH_OUTPUT_CONTRACT.query_interpretation(
            operation, provider, query, normalized_options
        ),
        "options": normalized_options,
        "corpus_provenance": corpus_provenance,
        "corpus_summary": corpus_summary,
        "results": results,
        "excluded_records": excluded,
        "review_queue": review_queue,
        "errors": errors,
        "warnings": warnings,
        "notices": notices,
        "runtime_seconds": round(time.perf_counter() - started, 6),
    }
    document["result_fingerprint"] = stable_document_fingerprint(document)
    return document


def read_request(path: Path) -> dict[str, Any]:
    raw = path.read_text(encoding="utf-8")
    if SECRET_RE.search(raw):
        raise InputFailure("输入文件中检测到疑似凭证。")
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise InputFailure("输入顶层必须是 JSON object。")
    artifact_path = value.get("corpus_artifact_path")
    if artifact_path is not None:
        if value.get("corpus_artifact") is not None:
            raise InputFailure("corpus_artifact 与 corpus_artifact_path 不得同时提供。")
        if not isinstance(artifact_path, str) or not artifact_path:
            raise InputFailure("corpus_artifact_path 必须是非空字符串。")
        resolved = Path(artifact_path)
        if not resolved.is_absolute():
            resolved = path.parent / resolved
        artifact_raw = resolved.read_text(encoding="utf-8")
        if SECRET_RE.search(artifact_raw):
            raise InputFailure("corpus artifact 中检测到疑似凭证。")
        value["corpus_artifact"] = json.loads(artifact_raw)
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
            if document["provider_status"]
            in {"completed", "completed_zero_hits", "partial"}
            else 1
        )
    except Exception as error:
        print(f"search-reactions failed: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
