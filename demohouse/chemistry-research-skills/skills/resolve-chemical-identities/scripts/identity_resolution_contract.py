"""Resolution-level output invariants."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any


INPUT_STATUSES = {"valid", "invalid_input"}
RETRIEVAL_STATUSES = {
    "completed",
    "partial",
    "not_found",
    "source_error",
    "not_run",
}
ALIGNMENT_STATUSES = {
    "exact",
    "related_forms",
    "ambiguous",
    "conflict",
    "not_assessed",
}
SAMPLE_STATUSES = {"not_assessed", "user_confirmed", "expert_confirmed"}
DISPOSITIONS = {
    "ready_for_standardization",
    "review_required",
    "rejected",
}
SOURCE_QUERY_STATUSES = {"success", "not_found", "source_error"}


def _load_handoff_contract() -> Any:
    path = Path(__file__).with_name("identity_handoff_contract.py")
    spec = importlib.util.spec_from_file_location(
        "identity_resolution_handoff_contract",
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load identity_handoff_contract.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


HANDOFF = _load_handoff_contract()


def _source_query_errors(
    source_queries: Any,
    path: str,
) -> tuple[list[str], list[str], list[Any]]:
    if not isinstance(source_queries, list):
        return [f"{path}.source_queries must be a list"], [], []
    errors = []
    warnings = []
    statuses = []
    for index, query in enumerate(source_queries):
        query_path = f"{path}.source_queries[{index}]"
        if not isinstance(query, dict):
            errors.append(f"{query_path} must be an object")
            continue
        status = query.get("status")
        statuses.append(status)
        errors.extend(
            HANDOFF.enum_errors(
                status,
                SOURCE_QUERY_STATUSES,
                f"{query_path}.status",
            )
        )
        if status == "source_error" and not query.get("error_kind"):
            errors.append(f"{query_path} source_error requires error_kind")
        if status == "not_found" and query.get("http_status") not in {
            None,
            200,
            404,
        }:
            warnings.append(
                f"{query_path} not_found did not originate from HTTP 404 "
                "or an empty 200 response"
            )
    return errors, warnings, statuses


def _alignment_errors(
    resolution: dict[str, Any],
    request: Any,
    candidates: list[Any],
    path: str,
) -> list[str]:
    alignment = resolution.get("record_alignment_status")
    disposition = resolution.get("disposition")
    errors = []
    if alignment == "exact" and len(candidates) != 1:
        errors.append(f"{path}.exact requires exactly one complete candidate")
    if alignment in {"ambiguous", "conflict", "related_forms"}:
        if disposition != "review_required":
            errors.append(f"{path}.{alignment} must require review")
        if not resolution.get("confirmation_questions"):
            errors.append(f"{path}.{alignment} requires a confirmation question")
    if alignment == "exact" and candidates:
        input_type = (request or {}).get("detected_input_type")
        families = set(candidates[0].get("source_families") or [])
        independent = families - {"local_input", "unichem"}
        if input_type == "name" and len(independent) < 2:
            errors.append(
                f"{path}.exact name requires at least two independent external sources"
            )
    if resolution.get("source_record_conflicts") and alignment != "conflict":
        errors.append(f"{path} source record conflict must set alignment=conflict")
    return errors


def _state_errors(
    resolution: dict[str, Any],
    request: Any,
    candidates: list[Any],
    statuses: list[Any],
    path: str,
) -> list[str]:
    retrieval = resolution.get("retrieval_status")
    errors = []
    if retrieval == "not_found" and "source_error" in statuses:
        errors.append(f"{path} misclassifies source_error as not_found")
    if retrieval == "source_error" and "success" in statuses:
        errors.append(f"{path} must use partial when success and source_error coexist")
    if retrieval == "partial" and not {
        "success",
        "source_error",
    } <= set(statuses):
        errors.append(f"{path}.partial requires both success and source_error")
    errors.extend(_alignment_errors(resolution, request, candidates, path))
    if resolution.get("input_status") == "invalid_input":
        if retrieval != "not_run" or candidates:
            errors.append(
                f"{path} invalid input must not query sources or emit candidates"
            )
        if resolution.get("disposition") != "rejected":
            errors.append(f"{path} invalid input must be rejected")
    return errors


def _shape_errors(
    resolution: dict[str, Any],
    path: str,
) -> list[str]:
    errors = HANDOFF.missing_errors(
        resolution,
        {
            "request",
            "input_status",
            "retrieval_status",
            "record_alignment_status",
            "record_alignment_scope",
            "sample_identity_status",
            "disposition",
            "candidates",
            "unresolved_source_records",
            "source_record_conflicts",
            "source_queries",
            "relationship_evidence",
            "confirmation_questions",
            "findings",
            "standardization_comparison",
            "standardization_handoff",
        },
        path,
    )
    for field, allowed in (
        ("input_status", INPUT_STATUSES),
        ("retrieval_status", RETRIEVAL_STATUSES),
        ("record_alignment_status", ALIGNMENT_STATUSES),
        ("sample_identity_status", SAMPLE_STATUSES),
        ("disposition", DISPOSITIONS),
    ):
        errors.extend(
            HANDOFF.enum_errors(
                resolution.get(field),
                allowed,
                f"{path}.{field}",
            )
        )
    request = resolution.get("request")
    if not isinstance(request, dict) or not isinstance(
        request.get("query"),
        str,
    ):
        errors.append(f"{path}.request.query must preserve the original string")
    if resolution.get("record_alignment_scope") != "database_records_only":
        errors.append(f"{path}.record_alignment_scope must be database_records_only")
    if resolution.get("sample_identity_status") != "not_assessed":
        errors.append(f"{path}.sample_identity_status cannot be automatically upgraded")
    return errors


def validate_resolution(
    resolution: Any,
    index: int,
) -> tuple[list[str], list[str]]:
    path = f"resolutions[{index}]"
    if not isinstance(resolution, dict):
        return [f"{path} must be an object"], []
    errors = _shape_errors(resolution, path)
    warnings = []
    request = resolution.get("request")
    candidates = resolution.get("candidates")
    if not isinstance(candidates, list):
        errors.append(f"{path}.candidates must be a list")
        candidates = []
    for candidate_index, candidate in enumerate(candidates):
        candidate_errors, candidate_warnings = HANDOFF.candidate_errors(
            candidate,
            f"{path}.candidates[{candidate_index}]",
        )
        errors.extend(candidate_errors)
        warnings.extend(candidate_warnings)
    query_errors, query_warnings, statuses = _source_query_errors(
        resolution.get("source_queries"),
        path,
    )
    errors.extend(query_errors)
    warnings.extend(query_warnings)
    errors.extend(
        _state_errors(
            resolution,
            request,
            candidates,
            statuses,
            path,
        )
    )
    errors.extend(
        HANDOFF.handoff_errors(
            resolution.get("standardization_handoff"),
            request,
            candidates,
            resolution.get("input_status"),
            resolution.get("disposition"),
            path,
        )
    )
    return errors, warnings
