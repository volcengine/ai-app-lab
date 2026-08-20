"""Candidate and standardization handoff output invariants."""

from __future__ import annotations

from typing import Any


HANDOFF_STATUSES = {
    "ready",
    "blocked_pending_resolution",
    "blocked_missing_structure",
    "blocked_invalid_input",
}


def missing_errors(
    value: dict[str, Any],
    keys: set[str],
    path: str,
) -> list[str]:
    absent = sorted(keys - set(value))
    return [f"{path} missing keys: {', '.join(absent)}"] if absent else []


def enum_errors(value: Any, allowed: set[str], path: str) -> list[str]:
    if isinstance(value, str) and value in allowed:
        return []
    return [f"{path} has invalid value: {value!r}"]


def candidate_errors(
    candidate: Any,
    path: str,
) -> tuple[list[str], list[str]]:
    if not isinstance(candidate, dict):
        return [f"{path} must be an object"], []
    errors = missing_errors(
        candidate,
        {
            "candidate_id",
            "canonical_smiles",
            "inchi",
            "inchikey",
            "connectivity_block",
            "names",
            "evidence",
            "source_families",
            "quality_findings",
            "comparison_view",
        },
        path,
    )
    warnings = []
    inchikey = candidate.get("inchikey")
    if not isinstance(inchikey, str) or len(inchikey) != 27:
        errors.append(f"{path}.inchikey must be a full InChIKey")
    if not isinstance(candidate.get("evidence"), list) or not candidate.get("evidence"):
        errors.append(f"{path}.evidence must be a non-empty list")
    if not isinstance(candidate.get("source_families"), list):
        errors.append(f"{path}.source_families must be a list")
    view = candidate.get("comparison_view")
    if view is not None and not isinstance(view, dict):
        errors.append(f"{path}.comparison_view must be null or an object")
    if isinstance(view, dict):
        if view.get("parent_inchikey") and not view.get("parent_structure"):
            errors.append(
                f"{path}.comparison_view parent_inchikey requires parent_structure"
            )
        if view.get("status") == "completed" and not view.get("standardized_structure"):
            errors.append(
                f"{path}.comparison_view completed without standardized_structure"
            )
    if not candidate.get("canonical_smiles"):
        warnings.append(f"{path} has no locally reconstructed canonical SMILES")
    return errors, warnings


def _ready_errors(
    handoff: dict[str, Any],
    request: Any,
    candidates: list[Any],
    disposition: Any,
    path: str,
) -> list[str]:
    handoff_path = f"{path}.standardization_handoff"
    records = handoff["records"]
    errors = []
    if disposition != "ready_for_standardization" or len(candidates) != 1:
        errors.append(f"{path} ready handoff requires one ready candidate")
    if len(records) != 1:
        errors.append(f"{handoff_path} ready handoff requires exactly one record")
    errors.extend(
        enum_errors(
            handoff.get("alignment_scope"),
            {"input_structure_only", "database_records_only"},
            f"{handoff_path}.alignment_scope",
        )
    )
    if not isinstance(handoff.get("notice"), str) or not handoff["notice"].strip():
        errors.append(f"{handoff_path}.notice must be a non-empty string")
    if len(records) != 1:
        return errors
    record = records[0]
    record_path = f"{handoff_path}.records[0]"
    if not isinstance(record, dict):
        return [*errors, f"{record_path} must be an object"]
    fields = {"id", "structure", "source_candidate_id", "source_inchikey"}
    errors.extend(missing_errors(record, fields, record_path))
    errors.extend(
        f"{record_path}.{field} must be a non-empty string"
        for field in fields
        if not isinstance(record.get(field), str) or not record[field].strip()
    )
    request_id = request.get("id") if isinstance(request, dict) else None
    if record.get("id") != request_id:
        errors.append(f"{record_path}.id must match request.id")
    candidate = candidates[0] if len(candidates) == 1 else None
    if isinstance(candidate, dict):
        comparisons = {
            "source_candidate_id": "candidate_id",
            "structure": "canonical_smiles",
            "source_inchikey": "inchikey",
        }
        errors.extend(
            f"{record_path}.{field} must match candidate.{candidate_field}"
            for field, candidate_field in comparisons.items()
            if record.get(field) != candidate.get(candidate_field)
        )
    return errors


def _blocked_errors(
    handoff: dict[str, Any],
    input_status: Any,
    candidates: list[Any],
    disposition: Any,
    path: str,
) -> list[str]:
    handoff_path = f"{path}.standardization_handoff"
    status = handoff.get("status")
    errors = []
    if handoff["records"]:
        errors.append(f"{path} blocked handoff must not contain records")
    if status == "blocked_invalid_input" and (
        input_status != "invalid_input" or disposition != "rejected"
    ):
        errors.append(
            f"{handoff_path} blocked_invalid_input requires invalid rejected input"
        )
    candidate = candidates[0] if len(candidates) == 1 else None
    if (
        status == "blocked_pending_resolution"
        and disposition == "ready_for_standardization"
        and isinstance(candidate, dict)
        and candidate.get("canonical_smiles")
    ):
        errors.append(
            f"{handoff_path} blocked_pending_resolution conflicts with ready candidate"
        )
    if status == "blocked_missing_structure" and (
        disposition != "ready_for_standardization"
        or not isinstance(candidate, dict)
        or candidate.get("canonical_smiles")
    ):
        errors.append(
            f"{handoff_path} blocked_missing_structure requires "
            "missing candidate structure"
        )
    return errors


def handoff_errors(
    handoff: Any,
    request: Any,
    candidates: list[Any],
    input_status: Any,
    disposition: Any,
    path: str,
) -> list[str]:
    handoff_path = f"{path}.standardization_handoff"
    if not isinstance(handoff, dict):
        return [f"{handoff_path} must be an object"]
    errors = enum_errors(
        handoff.get("status"),
        HANDOFF_STATUSES,
        f"{handoff_path}.status",
    )
    if handoff.get("target_skill") != "standardize-chemical-structures":
        errors.append(
            f"{handoff_path}.target_skill must be standardize-chemical-structures"
        )
    records = handoff.get("records")
    if not isinstance(records, list):
        return [*errors, f"{handoff_path}.records must be a list"]
    if (
        input_status == "invalid_input"
        and handoff.get("status") != "blocked_invalid_input"
    ):
        errors.append(f"{handoff_path} invalid input requires blocked_invalid_input")
    state_errors = (
        _ready_errors(handoff, request, candidates, disposition, path)
        if handoff.get("status") == "ready"
        else _blocked_errors(
            handoff,
            input_status,
            candidates,
            disposition,
            path,
        )
    )
    return [*errors, *state_errors]
