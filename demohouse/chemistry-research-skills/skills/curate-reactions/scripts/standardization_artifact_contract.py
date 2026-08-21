#!/usr/bin/env python3
"""Validate the standardize-to-curate Artifact contract."""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any, TypedDict


STANDARDIZATION_SCHEMA_VERSION = "1.0.0"
STANDARDIZATION_WORKFLOW = "chemical-structure-standardization-qc"
STANDARDIZATION_PROFILES = {"rdkit-basic", "chembl-pipeline"}
STANDARDIZATION_PARSE_STATUSES = {"success", "error"}
STANDARDIZATION_STATUSES = {"completed", "not_run", "error"}
STANDARDIZATION_DISPOSITIONS = {"ready_for_downstream", "review_required", "rejected"}
STANDARDIZATION_INPUT_FORMATS = {"smiles", "sdf", "molblock"}
STANDARDIZATION_FINDING_SEVERITIES = {"error", "warning", "review"}
REQUIRED_TOP_LEVEL = set(
    "schema_version workflow tool_versions options records duplicate_groups "
    "result_fingerprint".split()
)
REQUIRED_RECORD_FIELDS = set(
    "id record_index source input_format original_structure parse_status "
    "standardization_status standardized_structure parent_structure inchikey "
    "parent_inchikey qc_findings disposition human_review_required".split()
)
DERIVED_STRUCTURE_FIELDS = (
    "standardized_structure",
    "parent_structure",
    "inchikey",
    "parent_inchikey",
)
CONTRACT_CODE = "E-UPSTREAM-ARTIFACT-CONTRACT-001"
FINGERPRINT_CODE = "E-UPSTREAM-FINGERPRINT-001"
RECORD_ID_CODE = "E-UPSTREAM-RECORD-ID-001"


class ContractIssue(TypedDict):
    code: str
    field_path: str
    detail: str
    artifact_index: int | None


def standardization_artifact_fingerprint(
    artifact: dict[str, Any],
) -> str:
    payload = {
        key: value
        for key, value in artifact.items()
        if key not in {"generated_at_utc", "result_fingerprint"}
    }
    encoded = json.dumps(
        payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _issue(
    code: str,
    field_path: str,
    detail: str,
    artifact_index: int | None,
) -> ContractIssue:
    return {
        "code": code,
        "field_path": field_path,
        "detail": detail,
        "artifact_index": artifact_index,
    }


def _add_issue(
    issues: list[ContractIssue],
    path: str,
    detail: str,
    position: int | None,
    code: str = CONTRACT_CODE,
) -> None:
    issues.append(_issue(code, path, detail, position))


def _validate_envelope(
    artifact: dict[str, Any],
    position: int,
) -> list[ContractIssue]:
    base = f"upstream_artifacts[{position}]"
    issues: list[ContractIssue] = []
    missing = sorted(REQUIRED_TOP_LEVEL - set(artifact))
    if missing:
        _add_issue(issues, base, "missing fields: " + ", ".join(missing), position)
    options = artifact.get("options")
    checks = (
        (
            artifact.get("schema_version") != STANDARDIZATION_SCHEMA_VERSION,
            "schema_version",
            "schema_version must be 1.0.0",
        ),
        (
            artifact.get("workflow") != STANDARDIZATION_WORKFLOW,
            "workflow",
            f"workflow must be {STANDARDIZATION_WORKFLOW}",
        ),
        (
            not isinstance(options, dict)
            or options.get("profile") not in STANDARDIZATION_PROFILES,
            "options.profile",
            "profile is invalid",
        ),
        (
            not isinstance(artifact.get("tool_versions"), dict),
            "tool_versions",
            "tool_versions has invalid type",
        ),
        (
            not isinstance(artifact.get("duplicate_groups"), list),
            "duplicate_groups",
            "duplicate_groups has invalid type",
        ),
    )
    for failed, field, detail in checks:
        if failed:
            _add_issue(issues, f"{base}.{field}", detail, position)
    fingerprint = artifact.get("result_fingerprint")
    fingerprint_detail = (
        "result_fingerprint must be lowercase SHA-256"
        if not isinstance(fingerprint, str)
        or not re.fullmatch(r"[0-9a-f]{64}", fingerprint)
        else (
            "result_fingerprint does not match Artifact content"
            if fingerprint != standardization_artifact_fingerprint(artifact)
            else None
        )
    )
    if fingerprint_detail:
        _add_issue(
            issues,
            f"{base}.result_fingerprint",
            fingerprint_detail,
            position,
            FINGERPRINT_CODE,
        )
    return issues


def _validate_scalar_fields(
    record: dict[str, Any],
    record_index: int,
    artifact_index: int,
) -> list[ContractIssue]:
    path = f"upstream_artifacts[{artifact_index}].records[{record_index}]"
    issues: list[ContractIssue] = []
    string_fields = ("id", "source", "original_structure")
    checks = [
        (
            not isinstance(record[field], str) or (field == "id" and not record[field]),
            field,
            f"{field} must be string",
            RECORD_ID_CODE if field == "id" else CONTRACT_CODE,
        )
        for field in string_fields
    ]
    checks.extend(
        [
            (
                not isinstance(record["input_format"], str)
                or record["input_format"] not in STANDARDIZATION_INPUT_FORMATS,
                "input_format",
                "input_format is invalid",
                CONTRACT_CODE,
            ),
            (
                not isinstance(record["record_index"], int)
                or isinstance(record["record_index"], bool)
                or record["record_index"] != record_index,
                "record_index",
                "record_index must equal input order",
                CONTRACT_CODE,
            ),
        ]
    )
    checks.extend(
        (
            record[field] is not None and not isinstance(record[field], str),
            field,
            f"{field} must be string or null",
            CONTRACT_CODE,
        )
        for field in DERIVED_STRUCTURE_FIELDS
    )
    enums = (
        ("parse_status", STANDARDIZATION_PARSE_STATUSES),
        ("standardization_status", STANDARDIZATION_STATUSES),
        ("disposition", STANDARDIZATION_DISPOSITIONS),
    )
    checks.extend(
        (
            not isinstance(record[field], str) or record[field] not in allowed,
            field,
            f"{field} is invalid",
            CONTRACT_CODE,
        )
        for field, allowed in enums
    )
    checks.extend(
        (
            not isinstance(record[field], list),
            field,
            f"{field} must be array",
            CONTRACT_CODE,
        )
        for field in ("qc_findings", "human_review_required")
    )
    for failed, field, detail, code in checks:
        if failed:
            _add_issue(issues, f"{path}.{field}", detail, artifact_index, code)
    return issues


def _validate_findings(
    record: dict[str, Any],
    record_index: int,
    artifact_index: int,
) -> tuple[list[ContractIssue], set[str]]:
    path = f"upstream_artifacts[{artifact_index}].records[{record_index}]"
    issues: list[ContractIssue] = []
    severities: set[str] = set()
    review_codes: set[str] = set()

    def add(field: str, detail: str) -> None:
        _add_issue(issues, f"{path}.{field}", detail, artifact_index)

    for finding_index, value in enumerate(record["qc_findings"]):
        field = f"qc_findings[{finding_index}]"
        if not isinstance(value, dict):
            add(field, "finding must be object")
            continue
        code = value.get("code")
        severity = value.get("severity")
        if (
            not isinstance(code, str)
            or severity not in STANDARDIZATION_FINDING_SEVERITIES
        ):
            add(field, "finding code or severity is invalid")
            continue
        severities.add(severity)
        if severity == "review":
            review_codes.add(code)
    review_reasons = record["human_review_required"]
    if not all(isinstance(value, str) for value in review_reasons):
        add("human_review_required", "review reasons must be strings")
    elif set(review_reasons) != review_codes:
        add("human_review_required", "review reasons must match review findings")
    return issues, severities


def _validate_record_state(
    record: dict[str, Any],
    record_index: int,
    artifact_index: int,
    severities: set[str],
) -> list[ContractIssue]:
    path = f"upstream_artifacts[{artifact_index}].records[{record_index}]"
    issues: list[ContractIssue] = []

    def add(field: str, detail: str) -> None:
        _add_issue(issues, f"{path}.{field}", detail, artifact_index)

    if record["parse_status"] == "error":
        if record["standardization_status"] != "not_run":
            add(
                "standardization_status",
                "parse error requires standardization not_run",
            )
        for field in DERIVED_STRUCTURE_FIELDS:
            if record[field] is not None:
                add(field, "parse error requires null derived field")
    failed = (
        record["parse_status"] == "error"
        or record["standardization_status"] in {"not_run", "error"}
        or "error" in severities
    )
    expected = (
        "rejected"
        if failed
        else "review_required"
        if "review" in severities
        else "ready_for_downstream"
    )
    if record["disposition"] != expected:
        add("disposition", f"disposition must be {expected}")
    if record["disposition"] == "ready_for_downstream" and (
        record["parse_status"] != "success"
        or record["standardization_status"] != "completed"
        or not isinstance(record["standardized_structure"], str)
        or not record["standardized_structure"]
    ):
        add("disposition", "ready record must be successfully standardized")
    if record["parent_inchikey"] and not record["parent_structure"]:
        add("parent_inchikey", "parent_inchikey requires parent_structure")
    return issues


def _validate_record(
    record: Any,
    record_index: int,
    artifact_index: int,
) -> list[ContractIssue]:
    path = f"upstream_artifacts[{artifact_index}].records[{record_index}]"
    if not isinstance(record, dict):
        return [
            _issue(
                "E-UPSTREAM-ARTIFACT-CONTRACT-001",
                path,
                "record must be object",
                artifact_index,
            )
        ]
    missing = sorted(REQUIRED_RECORD_FIELDS - set(record))
    if missing:
        return [
            _issue(
                "E-UPSTREAM-ARTIFACT-CONTRACT-001",
                path,
                "missing fields: " + ", ".join(missing),
                artifact_index,
            )
        ]
    issues = _validate_scalar_fields(record, record_index, artifact_index)
    if issues:
        return issues
    finding_issues, severities = _validate_findings(
        record,
        record_index,
        artifact_index,
    )
    issues.extend(finding_issues)
    issues.extend(
        _validate_record_state(
            record,
            record_index,
            artifact_index,
            severities,
        )
    )
    return issues


def validate_standardization_artifact(
    artifact: Any,
    artifact_index: int,
) -> list[ContractIssue]:
    if not isinstance(artifact, dict):
        return [
            _issue(
                "E-UPSTREAM-ARTIFACT-CONTRACT-001",
                f"upstream_artifacts[{artifact_index}]",
                "Artifact must be object",
                artifact_index,
            )
        ]
    issues = _validate_envelope(artifact, artifact_index)
    records = artifact.get("records")
    if not isinstance(records, list) or not records:
        issues.append(
            _issue(
                "E-UPSTREAM-ARTIFACT-CONTRACT-001",
                f"upstream_artifacts[{artifact_index}].records",
                "records must be non-empty array",
                artifact_index,
            )
        )
        return issues
    for record_index, record in enumerate(records):
        issues.extend(_validate_record(record, record_index, artifact_index))
    return issues


def build_upstream_contract(
    artifacts: Any,
) -> tuple[
    dict[str, dict[str, Any]],
    list[dict[str, Any]],
    list[ContractIssue],
]:
    if not isinstance(artifacts, list):
        return (
            {},
            [],
            [
                _issue(
                    "E-UPSTREAM-ARTIFACT-CONTRACT-001",
                    "upstream_artifacts",
                    "upstream_artifacts must be array",
                    None,
                )
            ],
        )
    issues: list[ContractIssue] = []
    for position, artifact in enumerate(artifacts):
        issues.extend(validate_standardization_artifact(artifact, position))
    owners: dict[str, list[int]] = {}
    for position, artifact in enumerate(artifacts):
        records = artifact.get("records") if isinstance(artifact, dict) else None
        for record in records if isinstance(records, list) else []:
            record_id = record.get("id") if isinstance(record, dict) else None
            if isinstance(record_id, str) and record_id:
                owners.setdefault(record_id, []).append(position)
    duplicate_positions: set[int] = set()
    for record_id, positions in owners.items():
        if len(positions) < 2:
            continue
        duplicate_positions.update(positions)
        issues.append(
            _issue(
                "E-UPSTREAM-RECORD-ID-001",
                "upstream_artifacts",
                f"duplicate record id: {record_id}",
                None,
            )
        )
    invalid_positions = {
        item["artifact_index"] for item in issues if item["artifact_index"] is not None
    } | duplicate_positions
    metadata = []
    for position, artifact in enumerate(artifacts):
        value = artifact if isinstance(artifact, dict) else {}
        records = value.get("records")
        metadata.append(
            {
                "workflow": value.get("workflow"),
                "schema_version": value.get("schema_version"),
                "result_fingerprint": value.get("result_fingerprint"),
                "record_count": len(records) if isinstance(records, list) else 0,
                "contract_status": (
                    "invalid" if position in invalid_positions else "valid"
                ),
            }
        )
    if issues:
        return {}, metadata, issues
    index = {
        record["id"]: record for artifact in artifacts for record in artifact["records"]
    }
    return index, metadata, []
