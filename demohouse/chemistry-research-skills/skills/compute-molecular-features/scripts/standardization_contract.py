#!/usr/bin/env python3
"""Validate the standardize-to-features data contract."""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any


STANDARDIZATION_SCHEMA_VERSION = "1.0.0"
STANDARDIZATION_WORKFLOW = "chemical-structure-standardization-qc"
STANDARDIZATION_PARSE_STATUSES = {"success", "error"}
STANDARDIZATION_STATUSES = {"completed", "not_run", "error"}
STANDARDIZATION_DISPOSITIONS = {
    "ready_for_downstream",
    "review_required",
    "rejected",
}
STANDARDIZATION_REQUIRED_TOP_LEVEL = {
    "schema_version",
    "workflow",
    "tool_versions",
    "options",
    "records",
    "duplicate_groups",
    "result_fingerprint",
}
STANDARDIZATION_REQUIRED_RECORD_FIELDS = {
    "id",
    "record_index",
    "source",
    "original_structure",
    "standardized_structure",
    "parent_structure",
    "inchikey",
    "parent_inchikey",
    "parse_status",
    "standardization_status",
    "disposition",
    "human_review_required",
}
ARTIFACT_MARKERS = {"workflow", "result_fingerprint"}
VALIDATED_MARKER = "_validated_standardization_artifact"


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def claims_standardization_artifact(payload: dict[str, Any]) -> bool:
    return bool(ARTIFACT_MARKERS & set(payload))


def standardization_artifact_fingerprint(
    payload: dict[str, Any],
) -> str:
    normalized = {
        key: value
        for key, value in payload.items()
        if key not in {"generated_at_utc", "result_fingerprint"}
    }
    return sha256_text(canonical_json(normalized))


def _missing_fields(
    value: dict[str, Any],
    required: set[str],
) -> list[str]:
    return sorted(required - set(value))


def _validate_envelope(payload: dict[str, Any]) -> list[str]:
    errors = []
    missing = _missing_fields(
        payload,
        STANDARDIZATION_REQUIRED_TOP_LEVEL,
    )
    if missing:
        errors.append("standardization Artifact missing fields: " + ", ".join(missing))
    if payload.get("schema_version") != STANDARDIZATION_SCHEMA_VERSION:
        errors.append("standardization Artifact schema_version is invalid")
    if payload.get("workflow") != STANDARDIZATION_WORKFLOW:
        errors.append("standardization Artifact workflow is invalid")
    if not isinstance(payload.get("tool_versions"), dict):
        errors.append("standardization Artifact tool_versions must be object")
    options = payload.get("options")
    if (
        not isinstance(options, dict)
        or not isinstance(options.get("profile"), str)
        or not options.get("profile").strip()
    ):
        errors.append("standardization Artifact options.profile is invalid")
    if not isinstance(payload.get("duplicate_groups"), list):
        errors.append("standardization Artifact duplicate_groups must be array")
    fingerprint = payload.get("result_fingerprint")
    if not isinstance(fingerprint, str) or not re.fullmatch(
        r"[0-9a-f]{64}",
        fingerprint,
    ):
        errors.append("standardization Artifact result_fingerprint is invalid")
    elif fingerprint != standardization_artifact_fingerprint(payload):
        errors.append("standardization Artifact fingerprint mismatch")
    return errors


def _valid_enum(value: Any, allowed: set[str]) -> bool:
    return isinstance(value, str) and value in allowed


def _validate_scalar_fields(
    record: dict[str, Any],
    index: int,
) -> list[str]:
    path = f"records[{index}]"
    errors = []
    if not isinstance(record["id"], str) or not record["id"].strip():
        errors.append(f"{path}.id must be non-empty string")
    if record["record_index"] != index:
        errors.append(f"{path}.record_index must preserve input order")
    if not isinstance(record["source"], str):
        errors.append(f"{path}.source must be string")
    if not isinstance(record["original_structure"], str):
        errors.append(f"{path}.original_structure must be string")
    for field in (
        "standardized_structure",
        "parent_structure",
        "inchikey",
        "parent_inchikey",
    ):
        if record[field] is not None and not isinstance(record[field], str):
            errors.append(f"{path}.{field} must be string or null")
    return errors


def _validate_record_enums(
    record: dict[str, Any],
    index: int,
) -> list[str]:
    path = f"records[{index}]"
    errors = []
    enum_fields = (
        ("parse_status", STANDARDIZATION_PARSE_STATUSES),
        ("standardization_status", STANDARDIZATION_STATUSES),
        ("disposition", STANDARDIZATION_DISPOSITIONS),
    )
    for field, allowed in enum_fields:
        if not _valid_enum(record[field], allowed):
            errors.append(f"{path}.{field} is invalid")
    if not isinstance(record["human_review_required"], list):
        errors.append(f"{path}.human_review_required must be array")
    return errors


def _validate_record_fields(
    record: dict[str, Any],
    index: int,
) -> list[str]:
    path = f"records[{index}]"
    missing = _missing_fields(
        record,
        STANDARDIZATION_REQUIRED_RECORD_FIELDS,
    )
    if missing:
        return [f"{path} missing fields: {', '.join(missing)}"]
    return _validate_scalar_fields(
        record,
        index,
    ) + _validate_record_enums(record, index)


def _validate_parse_failure(
    record: dict[str, Any],
    path: str,
) -> list[str]:
    if record["parse_status"] != "error":
        return []
    errors = []
    if record["standardization_status"] != "not_run":
        errors.append(f"{path} parse error must be not_run")
    if record["disposition"] != "rejected":
        errors.append(f"{path} parse error must be rejected")
    for field in (
        "standardized_structure",
        "parent_structure",
        "inchikey",
        "parent_inchikey",
    ):
        if record[field] is not None:
            errors.append(f"{path} parse error requires null {field}")
    return errors


def _validate_standardization_failure(
    record: dict[str, Any],
    path: str,
) -> list[str]:
    if (
        record["standardization_status"] in {"error", "not_run"}
        and record["disposition"] != "rejected"
    ):
        return [f"{path} non-completed standardization must be rejected"]
    return []


def _validate_ready(
    record: dict[str, Any],
    path: str,
) -> list[str]:
    if record["disposition"] != "ready_for_downstream":
        return []
    errors = []
    calculable = (
        record["parse_status"] == "success"
        and record["standardization_status"] == "completed"
        and isinstance(record["standardized_structure"], str)
        and bool(record["standardized_structure"].strip())
    )
    if not calculable:
        errors.append(f"{path} ready record is not calculable")
    if record["human_review_required"]:
        errors.append(f"{path} review reasons cannot be ready_for_downstream")
    return errors


def _validate_parent_binding(
    record: dict[str, Any],
    path: str,
) -> list[str]:
    if record["parent_inchikey"] and not record["parent_structure"]:
        return [f"{path} parent_inchikey requires parent_structure"]
    return []


def _validate_record_state(
    record: dict[str, Any],
    index: int,
) -> list[str]:
    path = f"records[{index}]"
    return (
        _validate_parse_failure(record, path)
        + _validate_standardization_failure(record, path)
        + _validate_ready(record, path)
        + _validate_parent_binding(record, path)
    )


def _validate_records(payload: dict[str, Any]) -> list[str]:
    records = payload.get("records")
    if not isinstance(records, list) or not records:
        return ["standardization Artifact records must be non-empty array"]
    errors = []
    for index, record in enumerate(records):
        if not isinstance(record, dict):
            errors.append(f"records[{index}] must be object")
            continue
        field_errors = _validate_record_fields(record, index)
        errors.extend(field_errors)
        if not field_errors:
            errors.extend(_validate_record_state(record, index))
    return errors


def build_standardization_context(
    payload: dict[str, Any],
    source: str,
) -> dict[str, Any]:
    return {
        "schema_version": payload["schema_version"],
        "workflow": payload["workflow"],
        "result_fingerprint": payload["result_fingerprint"],
        "tool_versions": payload["tool_versions"],
        "profile": payload["options"]["profile"],
        "duplicate_groups": payload["duplicate_groups"],
        "source": source,
        "input_format": "json",
        VALIDATED_MARKER: True,
    }


def build_direct_context(
    payload: dict[str, Any],
    source: str,
    input_format: str,
) -> dict[str, Any]:
    return {
        "schema_version": payload.get("schema_version"),
        "workflow": None,
        "result_fingerprint": None,
        "tool_versions": None,
        "profile": None,
        "duplicate_groups": [],
        "source": source,
        "input_format": input_format,
        VALIDATED_MARKER: False,
    }


def record_upstream_provenance(
    upstream: dict[str, Any],
) -> dict[str, Any]:
    if upstream.get(VALIDATED_MARKER) is True:
        return {
            "tool_versions": upstream.get("tool_versions"),
            "profile": upstream.get("profile"),
            "upstream_workflow": upstream.get("workflow"),
            "upstream_fingerprint": upstream.get("result_fingerprint"),
        }
    return {
        "tool_versions": None,
        "profile": None,
        "upstream_workflow": None,
        "upstream_fingerprint": None,
    }


def _validate_upstream_envelope(
    upstream: dict[str, Any],
) -> tuple[list[str], bool]:
    errors = []
    workflow = upstream.get("workflow")
    fingerprint = upstream.get("result_fingerprint")
    claimed = workflow is not None or fingerprint is not None
    if claimed and (workflow is None or fingerprint is None):
        errors.append("partial upstream provenance is not allowed")
        return errors, False
    if not claimed:
        for field in ("tool_versions", "profile"):
            if upstream.get(field) is not None:
                errors.append(f"direct input upstream.{field} must be null")
        return errors, False
    if workflow != STANDARDIZATION_WORKFLOW:
        errors.append("upstream.workflow is invalid")
    if upstream.get("schema_version") != STANDARDIZATION_SCHEMA_VERSION:
        errors.append("upstream.schema_version is invalid")
    if not isinstance(fingerprint, str) or not re.fullmatch(
        r"[0-9a-f]{64}",
        fingerprint,
    ):
        errors.append("upstream.result_fingerprint is invalid")
    if not isinstance(upstream.get("tool_versions"), dict):
        errors.append("upstream.tool_versions must be object")
    profile = upstream.get("profile")
    if not isinstance(profile, str) or not profile.strip():
        errors.append("upstream.profile is invalid")
    return errors, True


def validate_feature_upstream_binding(
    upstream: Any,
    records: list[Any],
) -> list[str]:
    if not isinstance(upstream, dict):
        return ["upstream must be object"]
    errors, official = _validate_upstream_envelope(upstream)
    expected = {
        "upstream_workflow": upstream.get("workflow"),
        "upstream_fingerprint": upstream.get("result_fingerprint"),
        "upstream_tool_versions": upstream.get("tool_versions"),
        "upstream_profile": upstream.get("profile"),
    }
    if not official:
        expected = {key: None for key in expected}
    for index, record in enumerate(records):
        if not isinstance(record, dict):
            continue
        for field, value in expected.items():
            if record.get(field) != value:
                errors.append(f"records[{index}].{field} does not match upstream")
    return errors


def validate_standardization_artifact(payload: Any) -> list[str]:
    if not isinstance(payload, dict):
        return ["standardization Artifact must be object"]
    errors = _validate_envelope(payload)
    errors.extend(_validate_records(payload))
    return errors
