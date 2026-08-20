#!/usr/bin/env python3
"""Curate Artifact contract consumed by review-routes."""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any

SCHEMA = "1.0.0"
WORKFLOW = "curate-reactions"
RULESET = "1.1.0"
STATUSES = {"completed", "partial", "not_run", "error"}
DISPOSITIONS = {"ready_for_search", "review_required", "rejected"}
BINDINGS = {"not_requested", "bound", "failed"}
REQUIRED_TOP = {
    "schema_version",
    "workflow",
    "ruleset_version",
    "tool_versions",
    "options",
    "source_record",
    "records",
    "result_fingerprint",
}
REQUIRED_RECORD = {
    "record_id",
    "original_record_hash",
    "reaction_smiles",
    "participant_assessments",
    "curation_status",
    "findings",
    "disposition",
    "human_review_required",
}


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def curated_artifact_fingerprint(artifact: dict[str, Any]) -> str:
    payload = {
        key: value
        for key, value in artifact.items()
        if key not in {"generated_at_utc", "runtime_seconds", "result_fingerprint"}
    }
    return hashlib.sha256(_json(payload).encode("utf-8")).hexdigest()


def _issue(code: str, path: str, detail: str) -> dict[str, str]:
    return {"code": code, "field_path": path, "detail": detail}


def _validate_envelope(value: dict[str, Any]) -> list[dict[str, str]]:
    issues = []
    missing = REQUIRED_TOP - set(value)
    if missing:
        issues.append(
            _issue("E-CURATE-CONTRACT-001", "$", f"missing {sorted(missing)}")
        )
    for failed, path, detail in (
        (value.get("schema_version") != SCHEMA, "schema_version", "must be 1.0.0"),
        (value.get("workflow") != WORKFLOW, "workflow", "must be curate-reactions"),
        (value.get("ruleset_version") != RULESET, "ruleset_version", "must be 1.1.0"),
        (
            not isinstance(value.get("tool_versions"), dict),
            "tool_versions",
            "must be object",
        ),
        (not isinstance(value.get("options"), dict), "options", "must be object"),
        (
            not isinstance(value.get("source_record"), dict),
            "source_record",
            "must be object",
        ),
    ):
        if failed:
            issues.append(_issue("E-CURATE-CONTRACT-001", path, detail))
    fingerprint = value.get("result_fingerprint")
    if (
        not isinstance(fingerprint, str)
        or not re.fullmatch(r"[0-9a-f]{64}", fingerprint)
        or fingerprint != curated_artifact_fingerprint(value)
    ):
        issues.append(
            _issue("E-CURATE-FINGERPRINT-001", "result_fingerprint", "mismatch")
        )
    return issues


def _finding_state(findings: list[Any]) -> tuple[str, str]:
    severities = {item.get("severity") for item in findings if isinstance(item, dict)}
    if "error" in severities:
        return "error", "rejected"
    if findings:
        return "partial", "review_required"
    return "completed", "ready_for_search"


def _validate_participant(
    value: Any, path: str, record_codes: set[str], disposition: str
) -> list[dict[str, str]]:
    if not isinstance(value, dict):
        return [_issue("E-CURATE-PARTICIPANT-001", path, "must be object")]
    status = value.get("upstream_binding_status")
    if not isinstance(status, str) or status not in BINDINGS:
        return [_issue("E-CURATE-PARTICIPANT-001", path, "invalid binding status")]
    upstream_id = value.get("upstream_record_id")
    upstream_disposition = value.get("upstream_disposition")
    if status == "not_requested":
        if upstream_id is not None or upstream_disposition is not None:
            return [_issue("E-CURATE-PARTICIPANT-001", path, "unexpected upstream")]
        return []
    if status == "failed":
        if "E-UPSTREAM-BINDING-001" not in record_codes or disposition != "rejected":
            return [_issue("E-CURATE-PARTICIPANT-001", path, "failed not propagated")]
        return []
    if not isinstance(upstream_id, str) or not upstream_id:
        return [_issue("E-CURATE-PARTICIPANT-001", path, "bound id missing")]
    if upstream_disposition not in {
        "ready_for_downstream",
        "review_required",
        "rejected",
    }:
        return [_issue("E-CURATE-PARTICIPANT-001", path, "invalid upstream state")]
    expected = {
        "review_required": "H-UPSTREAM-REVIEW-001",
        "rejected": "E-UPSTREAM-REJECTED-001",
    }.get(upstream_disposition)
    if expected and expected not in record_codes:
        return [_issue("E-CURATE-PARTICIPANT-001", path, "state not propagated")]
    return []


def _validate_record_metadata(value: dict[str, Any], path: str) -> list[dict[str, str]]:
    issues = []
    record_id = value.get("record_id")
    if not isinstance(record_id, str) or not record_id:
        issues.append(_issue("E-CURATE-RECORD-ID-001", f"{path}.record_id", "invalid"))
    original_hash = value.get("original_record_hash")
    if not isinstance(original_hash, str) or not re.fullmatch(
        r"[0-9a-f]{64}", original_hash
    ):
        issues.append(
            _issue("E-CURATE-RECORD-001", f"{path}.original_record_hash", "invalid")
        )
    status = value.get("curation_status")
    if not isinstance(status, str) or status not in STATUSES:
        issues.append(
            _issue("E-CURATE-RECORD-001", f"{path}.curation_status", "invalid")
        )
    disposition = value.get("disposition")
    if not isinstance(disposition, str) or disposition not in DISPOSITIONS:
        issues.append(_issue("E-CURATE-RECORD-001", f"{path}.disposition", "invalid"))
    return issues


def _validate_record(value: Any, index: int) -> list[dict[str, str]]:
    path = f"records[{index}]"
    if not isinstance(value, dict):
        return [_issue("E-CURATE-RECORD-001", path, "must be object")]
    missing = REQUIRED_RECORD - set(value)
    if missing:
        return [_issue("E-CURATE-RECORD-001", path, f"missing {sorted(missing)}")]
    issues = _validate_record_metadata(value, path)
    findings = value.get("findings")
    status = value.get("curation_status")
    disposition = value.get("disposition")
    if not isinstance(findings, list):
        return issues + [
            _issue("E-CURATE-RECORD-001", f"{path}.findings", "must be array")
        ]
    if issues:
        return issues
    if (status, disposition) != _finding_state(findings):
        issues.append(_issue("E-CURATE-RECORD-STATE-001", path, "state mismatch"))
    codes = {
        item.get("code")
        for item in findings
        if isinstance(item, dict) and isinstance(item.get("code"), str)
    }
    participants = value.get("participant_assessments")
    if not isinstance(participants, list):
        return issues + [
            _issue("E-CURATE-RECORD-001", path, "participants must be array")
        ]
    for position, participant in enumerate(participants):
        issues.extend(
            _validate_participant(
                participant,
                f"{path}.participant_assessments[{position}]",
                codes,
                disposition,
            )
        )
    return issues


def validate_curated_artifact(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, dict):
        return [_issue("E-CURATE-CONTRACT-001", "$", "must be object")]
    issues = _validate_envelope(value)
    records = value.get("records")
    if not isinstance(records, list):
        return issues + [_issue("E-CURATE-CONTRACT-001", "records", "must be array")]
    seen: set[str] = set()
    duplicates: set[str] = set()
    for index, record in enumerate(records):
        issues.extend(_validate_record(record, index))
        if isinstance(record, dict) and isinstance(record.get("record_id"), str):
            record_id = record["record_id"]
            if record_id in seen:
                duplicates.add(record_id)
            seen.add(record_id)
    for record_id in sorted(duplicates):
        issues.append(
            _issue("E-CURATE-RECORD-ID-001", "records", f"duplicate {record_id}")
        )
    return issues
