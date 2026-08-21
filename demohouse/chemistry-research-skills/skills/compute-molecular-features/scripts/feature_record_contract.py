"""Record-level invariants for molecular feature artifacts."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any


CALCULATION_STATUSES = {"completed", "partial", "not_run", "error"}
DISPOSITIONS = {"ready_for_downstream", "review_required", "rejected"}
FINGERPRINT_NAMES = {"morgan", "rdkit_topological", "maccs"}
REQUIRED_RECORD_FIELDS = {
    "id",
    "record_index",
    "original_structure",
    "standardized_structure",
    "parent_structure",
    "source_structure",
    "calculation_view",
    "calculation_status",
    "descriptors",
    "fingerprints",
    "missing_features",
    "qc_findings",
    "upstream_parse_status",
    "upstream_standardization_status",
    "upstream_disposition",
    "upstream_human_review_required",
    "upstream_workflow",
    "upstream_fingerprint",
    "upstream_tool_versions",
    "upstream_profile",
    "input_record_fingerprint",
    "disposition",
    "human_review_required",
}


def _load_fingerprint_contract() -> Any:
    path = Path(__file__).with_name("feature_fingerprint_contract.py")
    spec = importlib.util.spec_from_file_location(
        "feature_record_fingerprint_contract",
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load feature_fingerprint_contract.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


FINGERPRINT = _load_fingerprint_contract()
sha256_json = FINGERPRINT.sha256_json
validate_profile = FINGERPRINT.validate_profile


def missing_errors(
    value: dict[str, Any],
    required: set[str],
    path: str,
) -> list[str]:
    return FINGERPRINT.missing_errors(value, required, path)


def finding_errors(item: Any, path: str) -> list[str]:
    if not isinstance(item, dict):
        return [f"{path} must be an object"]
    errors = [
        f"{path}.{field} is required"
        for field in ("code", "severity", "message", "source")
        if not item.get(field)
    ]
    if item.get("severity") not in {"error", "warning", "review", "notice"}:
        errors.append(f"{path}.severity is invalid")
    return errors


def _shape_errors(
    record: dict[str, Any],
    index: int,
    calculation_view: str,
    path: str,
) -> list[str]:
    expected_source = (
        record["standardized_structure"]
        if calculation_view == "standardized"
        else record["parent_structure"]
    )
    checks = (
        (
            not isinstance(record["id"], str) or not record["id"],
            f"{path}.id must be a non-empty string",
        ),
        (
            isinstance(record["record_index"], bool)
            or not isinstance(record["record_index"], int)
            or record["record_index"] != index,
            f"{path}.record_index must preserve input order",
        ),
        (
            not isinstance(record["original_structure"], str),
            f"{path}.original_structure must be a string",
        ),
        (
            record["calculation_view"] != calculation_view,
            f"{path}.calculation_view does not match options",
        ),
        (
            record["calculation_status"] not in CALCULATION_STATUSES,
            f"{path}.calculation_status is invalid",
        ),
        (
            record["disposition"] not in DISPOSITIONS,
            f"{path}.disposition is invalid",
        ),
        (
            record["source_structure"] != expected_source,
            f"{path}.source_structure mixes calculation views",
        ),
    )
    errors = [message for invalid, message in checks if invalid]
    errors.extend(
        f"{path}.{field} must be an object"
        for field in ("descriptors", "fingerprints")
        if not isinstance(record[field], dict)
    )
    errors.extend(
        f"{path}.{field} must be a list"
        for field in (
            "missing_features",
            "qc_findings",
            "upstream_human_review_required",
            "human_review_required",
        )
        if not isinstance(record[field], list)
    )
    return errors


def _upstream_errors(record: dict[str, Any], path: str) -> list[str]:
    errors = []
    upstream_blocks = (
        record["upstream_disposition"] == "rejected"
        or record["upstream_parse_status"] == "error"
        or record["upstream_standardization_status"] in {"error", "not_run"}
    )
    if upstream_blocks:
        checks = (
            (
                record["calculation_status"] != "not_run",
                f"{path} rejected upstream record must not run",
            ),
            (
                bool(record["descriptors"] or record["fingerprints"]),
                f"{path} rejected upstream record emitted features",
            ),
            (
                record["disposition"] != "rejected",
                f"{path} rejected upstream record must stay rejected",
            ),
        )
        errors.extend(message for invalid, message in checks if invalid)
    upstream_review = {
        (
            str(item["code"])
            if isinstance(item, dict) and item.get("code")
            else sha256_json(item)
            if isinstance(item, dict)
            else str(item)
        )
        for item in record["upstream_human_review_required"]
    }
    if (
        record["upstream_disposition"] == "review_required"
        and record["disposition"] == "ready_for_downstream"
    ):
        errors.append(f"{path} lost upstream review_required disposition")
    if upstream_review and not upstream_review <= set(record["human_review_required"]):
        errors.append(f"{path} lost upstream human review reasons")
    return errors


def _calculated_payload_errors(
    record: dict[str, Any],
    descriptor_names: set[str],
    profiles: dict[str, Any],
    path: str,
) -> list[str]:
    checks = (
        (
            not isinstance(record["source_structure"], str)
            or not record["source_structure"],
            f"{path} calculated without a source structure",
        ),
        (
            set(record["descriptors"]) != descriptor_names,
            f"{path}.descriptors does not match descriptor_set",
        ),
        (
            set(record["fingerprints"]) != FINGERPRINT_NAMES,
            f"{path}.fingerprints does not match fingerprint_profiles",
        ),
    )
    errors = [message for invalid, message in checks if invalid]
    for name, profile in profiles.items():
        fingerprint = record["fingerprints"].get(name)
        if fingerprint is not None:
            errors.extend(
                FINGERPRINT.validate_fingerprint(
                    fingerprint,
                    profile,
                    f"{path}.fingerprints.{name}",
                )
            )
    return errors


def _calculation_state_errors(
    record: dict[str, Any],
    path: str,
) -> list[str]:
    status = record["calculation_status"]
    checks = (
        (
            status == "completed" and bool(record["missing_features"]),
            f"{path} completed record cannot have missing_features",
        ),
        (
            status == "partial" and not record["missing_features"],
            f"{path} partial record must list missing_features",
        ),
        (
            status in {"not_run", "error"}
            and bool(record["descriptors"] or record["fingerprints"]),
            f"{path} non-calculated record emitted features",
        ),
        (
            status == "error" and record["disposition"] != "rejected",
            f"{path} calculation error must be rejected",
        ),
        (
            record["disposition"] == "ready_for_downstream" and status != "completed",
            f"{path} ready record must be completed",
        ),
        (
            record["disposition"] == "ready_for_downstream"
            and bool(record["human_review_required"]),
            f"{path} ready record cannot require human review",
        ),
    )
    return [message for invalid, message in checks if invalid]


def _calculation_errors(
    record: dict[str, Any],
    descriptor_names: set[str],
    profiles: dict[str, Any],
    path: str,
) -> list[str]:
    errors = []
    if record["calculation_status"] in {"completed", "partial"}:
        errors.extend(
            _calculated_payload_errors(
                record,
                descriptor_names,
                profiles,
                path,
            )
        )
    errors.extend(_calculation_state_errors(record, path))
    return errors


def validate_record(
    record: Any,
    index: int,
    descriptor_names: set[str],
    profiles: dict[str, Any],
    calculation_view: str,
) -> tuple[list[str], list[str]]:
    path = f"records[{index}]"
    if not isinstance(record, dict):
        return [f"{path} must be an object"], []
    errors = missing_errors(record, REQUIRED_RECORD_FIELDS, path)
    if not REQUIRED_RECORD_FIELDS <= set(record):
        return errors, []
    errors.extend(_shape_errors(record, index, calculation_view, path))
    valid_containers = (
        isinstance(record["descriptors"], dict)
        and isinstance(record["fingerprints"], dict)
        and isinstance(record["qc_findings"], list)
        and isinstance(record["upstream_human_review_required"], list)
        and isinstance(record["human_review_required"], list)
    )
    if not valid_containers:
        return errors, []
    for finding_index, item in enumerate(record["qc_findings"]):
        errors.extend(finding_errors(item, f"{path}.qc_findings[{finding_index}]"))
    errors.extend(_upstream_errors(record, path))
    errors.extend(_calculation_errors(record, descriptor_names, profiles, path))
    warnings = (
        [f"{path} disposition is {record['disposition']}"]
        if record["disposition"] != "ready_for_downstream"
        else []
    )
    return errors, warnings
