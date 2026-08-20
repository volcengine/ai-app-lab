"""Identity resolution orchestration over isolated domain modules."""

from __future__ import annotations

import importlib.util
import json
import re
from pathlib import Path
from typing import Any, Iterable, Optional, Sequence


SCHEMA_VERSION = "1.0.0"
WORKFLOW = "chemical-identity-resolution"
DEFAULT_SOURCES = ("opsin", "pubchem", "chembl", "unichem")
SUPPORTED_SOURCES = frozenset(DEFAULT_SOURCES)
SECRET_RE = re.compile(
    r"(?i)(authorization\s*:|bearer\s+[A-Za-z0-9._~+/=-]{12,}|"
    r"api[_ -]?key\s*[:=]|cookie\s*:|ark-[A-Za-z0-9_-]{16,})"
)


def _load_local(filename: str, module_name: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


REQUEST = _load_local(
    "identity_request_contract.py",
    "identity_pipeline_request",
)
PRIMARY = _load_local(
    "identity_sources_primary.py",
    "identity_pipeline_primary",
)
SOURCES = _load_local(
    "identity_source_pipeline.py",
    "identity_pipeline_sources",
)
CANDIDATES = _load_local(
    "identity_candidates.py",
    "identity_pipeline_candidates",
)
STANDARDIZATION = _load_local(
    "identity_standardization.py",
    "identity_pipeline_standardization",
)
ALIGNMENT = _load_local(
    "identity_alignment.py",
    "identity_pipeline_alignment",
)
OUTPUT = _load_local(
    "identity_output_contract.py",
    "identity_pipeline_output",
)
RUNTIME = _load_local(
    "identity_runtime.py",
    "identity_pipeline_runtime",
)

InputFailure = REQUEST.InputFailure


def _request_view(validated: dict[str, Any]) -> dict[str, Any]:
    return {
        key: validated.get(key)
        for key in (
            "id",
            "query",
            "normalized_query",
            "requested_input_type",
            "detected_input_type",
            "context",
            "expected_form",
        )
    }


def _invalid_resolution(validated: dict[str, Any]) -> dict[str, Any]:
    return {
        "request": _request_view(validated),
        "input_status": "invalid_input",
        "retrieval_status": "not_run",
        "record_alignment_status": "not_assessed",
        "record_alignment_scope": "database_records_only",
        "sample_identity_status": "not_assessed",
        "disposition": "rejected",
        "candidates": [],
        "unresolved_source_records": [],
        "source_record_conflicts": [],
        "source_queries": [],
        "relationship_evidence": [],
        "confirmation_questions": [],
        "findings": validated["findings"],
        "standardization_comparison": {
            "status": "not_run",
            "reason": "输入无效。",
            "target_skill": "standardize-chemical-structures",
        },
        "standardization_handoff": {
            "status": "blocked_invalid_input",
            "target_skill": "standardize-chemical-structures",
            "records": [],
        },
    }


def _expected_form_disposition(
    validated: dict[str, Any],
    candidates: list[dict[str, Any]],
    disposition: str,
    questions: list[dict[str, Any]],
) -> str:
    if not validated.get("expected_form") or disposition != (
        "ready_for_standardization"
    ):
        return disposition
    expected_form = str(validated["expected_form"]).strip().lower()
    component_count = candidates[0].get("component_count") or 1
    if expected_form not in {"neutral", "single_component"}:
        return disposition
    if component_count <= 1:
        return disposition
    questions.append(
        {
            "code": "Q-EXPECTED-FORM-MISMATCH",
            "question": ("用户期望单一中性形式，但候选包含多个组分；请确认具体形式。"),
        }
    )
    return "review_required"


def _retrieval_findings(status: str) -> list[dict[str, Any]]:
    definitions = {
        "partial": (
            "R-PARTIAL-SOURCE-RETRIEVAL",
            "review",
            "至少一个来源成功且至少一个来源故障；不能把故障当成无记录。",
        ),
        "source_error": (
            "R-SOURCE-ERROR",
            "review",
            "来源查询失败；当前结果不能表述为 not_found。",
        ),
        "not_found": (
            "E-NOT-FOUND",
            "error",
            "已查询来源均明确未返回记录。",
        ),
    }
    definition = definitions.get(status)
    if definition is None:
        return []
    code, severity, message = definition
    return [{"code": code, "severity": severity, "message": message}]


def _finalize_resolution(
    validated: dict[str, Any],
    candidates: list[dict[str, Any]],
    unresolved: list[dict[str, Any]],
    integrity_conflicts: list[dict[str, Any]],
    source_queries: list[dict[str, Any]],
    relationship_evidence: list[dict[str, Any]],
    standardization_comparison: dict[str, Any],
) -> dict[str, Any]:
    retrieval_status = ALIGNMENT.aggregate_retrieval_status(source_queries)
    alignment, disposition, questions = ALIGNMENT.determine_alignment(
        validated,
        candidates,
        unresolved,
        integrity_conflicts,
        retrieval_status,
    )
    disposition = _expected_form_disposition(
        validated,
        candidates,
        disposition,
        questions,
    )
    handoff = ALIGNMENT.build_handoff(
        validated,
        candidates,
        alignment,
        disposition,
    )
    return {
        "request": _request_view(validated),
        "input_status": validated["input_status"],
        "retrieval_status": retrieval_status,
        "record_alignment_status": alignment,
        "record_alignment_scope": "database_records_only",
        "sample_identity_status": "not_assessed",
        "disposition": disposition,
        "candidates": candidates,
        "unresolved_source_records": unresolved,
        "source_record_conflicts": integrity_conflicts,
        "source_queries": source_queries,
        "relationship_evidence": relationship_evidence,
        "confirmation_questions": questions,
        "findings": [
            *validated["findings"],
            *_retrieval_findings(retrieval_status),
        ],
        "standardization_comparison": standardization_comparison,
        "standardization_handoff": handoff,
    }


def resolve_one(
    item: dict[str, Any],
    toolkit: dict[str, Any],
    transport: Any,
    enabled_sources: set[str],
    include_related: bool,
    standardizer_script: Optional[Path],
    standardization_profile: str,
    generated_at_utc: str,
) -> dict[str, Any]:
    validated = REQUEST.validate_request(item, toolkit)
    if validated["input_status"] == "invalid_input":
        return _invalid_resolution(validated)
    records, source_queries = PRIMARY.collect_initial_sources(
        validated,
        transport,
        enabled_sources,
    )
    enriched, enrichment_logs, relationships = SOURCES.collect_enrichment_sources(
        validated,
        records,
        transport,
        enabled_sources,
        include_related,
        toolkit,
        CANDIDATES.aggregate_candidates,
    )
    records.extend(enriched)
    source_queries.extend(enrichment_logs)
    candidates, unresolved, conflicts = CANDIDATES.aggregate_candidates(
        records,
        toolkit,
    )
    comparison = STANDARDIZATION.apply_standardization_views(
        candidates,
        standardizer_script,
        standardization_profile,
        generated_at_utc,
    )
    return _finalize_resolution(
        validated,
        candidates,
        unresolved,
        conflicts,
        source_queries,
        relationships,
        comparison,
    )


def _document(
    resolutions: list[dict[str, Any]],
    source_set: set[str],
    source_metadata: dict[str, Any],
    toolkit: dict[str, Any],
    standardizer_script: Optional[Path],
    standardization_profile: str,
    include_related: bool,
    use_standardizer: bool,
    generated_at: str,
) -> dict[str, Any]:
    counts = {
        status: sum(resolution["disposition"] == status for resolution in resolutions)
        for status in (
            "ready_for_standardization",
            "review_required",
            "rejected",
        )
    }
    return {
        "schema_version": SCHEMA_VERSION,
        "workflow": WORKFLOW,
        "generated_at_utc": generated_at,
        "tool_versions": RUNTIME.toolkit_versions(toolkit),
        "source_metadata": source_metadata,
        "options": {
            "enabled_sources": sorted(source_set),
            "include_unichem_connectivity": include_related,
            "standardization_profile": standardization_profile,
            "use_standardizer": use_standardizer,
            "standardizer_script": (
                STANDARDIZATION.standardizer_identifier(standardizer_script)
            ),
            "no_model_generated_structures": True,
            "automatic_tie_breaking": False,
        },
        "input_summary": {
            "total_requests": len(resolutions),
            **counts,
        },
        "resolutions": resolutions,
        "cross_query_relationships": (
            ALIGNMENT.build_cross_query_relationships(resolutions)
        ),
        "notices": [
            (
                "record_alignment_status 只描述输入与数字来源记录的结构关系，"
                "不确认用户实物样品。"
            ),
            (
                "sample_identity_status 默认 not_assessed；数据库数量、评分或"
                "首选记录不能自动升级该状态。"
            ),
            (
                "comparison_view 和 parent 是派生比较口径，不覆盖来源结构，"
                "也不表示同一物理样品。"
            ),
            "本工作流不判断活性、药效、毒性、可合成性或实验安全。",
        ],
    }


def process_requests(
    requests: Sequence[dict[str, Any]],
    *,
    transport: Any,
    enabled_sources: Iterable[str] = DEFAULT_SOURCES,
    include_related: bool = False,
    use_standardizer: bool = True,
    standardizer_script: Optional[Path] = None,
    standardization_profile: str = "chembl-pipeline",
    generated_at_utc: Optional[str] = None,
) -> dict[str, Any]:
    if not requests:
        raise InputFailure("至少需要一个 query。")
    toolkit = RUNTIME.load_toolkit()
    source_set = {source.strip().lower() for source in enabled_sources if source}
    unsupported = source_set - SUPPORTED_SOURCES
    if unsupported:
        raise InputFailure(f"不支持的来源：{', '.join(sorted(unsupported))}")
    generated_at = generated_at_utc or RUNTIME.now_utc()
    if use_standardizer and standardizer_script is None:
        standardizer_script = STANDARDIZATION.default_standardizer_path()
    elif not use_standardizer:
        standardizer_script = None
    source_metadata = RUNTIME.fetch_source_metadata(source_set, transport)
    resolutions = [
        resolve_one(
            dict(item),
            toolkit,
            transport,
            source_set,
            include_related,
            standardizer_script,
            standardization_profile,
            generated_at,
        )
        for item in requests
    ]
    document = _document(
        resolutions,
        source_set,
        source_metadata,
        toolkit,
        standardizer_script,
        standardization_profile,
        include_related,
        use_standardizer,
        generated_at,
    )
    document["result_fingerprint"] = OUTPUT.output_fingerprint(document)
    if SECRET_RE.search(json.dumps(document, ensure_ascii=False)):
        raise RuntimeError("输出中检测到疑似凭证，已停止写出。")
    return document
