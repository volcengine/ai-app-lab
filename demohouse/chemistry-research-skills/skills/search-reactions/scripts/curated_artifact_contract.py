#!/usr/bin/env python3
"""Validate curate-reactions Artifacts consumed by local search."""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any, TypedDict


CURATE_SCHEMA_VERSION = "1.0.0"
CURATE_WORKFLOW = "curate-reactions"
CURATE_RULESET_VERSION = "1.1.0"
CURATE_STATUSES = {"completed", "partial", "not_run", "error"}
CURATE_DISPOSITIONS = {"ready_for_search", "review_required", "rejected"}
BINDING_STATUSES = {"not_requested", "bound", "failed"}
FINDING_SEVERITIES = {"error", "warning", "human_review"}
REQUIRED_TOP_LEVEL = set(
    "schema_version workflow ruleset_version tool_versions options "
    "source_record records result_fingerprint".split()
)
REQUIRED_RECORD_FIELDS = set(
    "record_id source_locator original_record_hash ord_record "
    "reaction_smiles participant_assessments role_assessment "
    "yield_assessment balance_assessment mapping_assessment "
    "duplicate_memberships curation_status findings disposition "
    "human_review_required".split()
)
REQUIRED_PARTICIPANT_FIELDS = set(
    "participant_id side reported_role reported_form standardized_form "
    "parent_form upstream_record_id upstream_binding_status "
    "upstream_disposition upstream_human_review_required "
    "participation_status role_status findings".split()
)
ARTIFACT_CODE = "E-CURATE-ARTIFACT-CONTRACT-001"
FINGERPRINT_CODE = "E-CURATE-FINGERPRINT-001"
RECORD_ID_CODE = "E-CURATE-RECORD-ID-001"


class CuratedContractIssue(TypedDict):
    code: str
    field_path: str
    detail: str


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def curated_artifact_fingerprint(
    artifact: dict[str, Any],
) -> str:
    payload = {
        key: value
        for key, value in artifact.items()
        if key
        not in {
            "generated_at_utc",
            "runtime_seconds",
            "result_fingerprint",
        }
    }
    return hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()


def _issue(
    path: str,
    detail: str,
    code: str = ARTIFACT_CODE,
) -> CuratedContractIssue:
    return {"code": code, "field_path": path, "detail": detail}


def _validate_envelope(artifact: dict[str, Any]) -> list[CuratedContractIssue]:
    issues = []
    missing = sorted(REQUIRED_TOP_LEVEL - set(artifact))
    if missing:
        issues.append(_issue("corpus_artifact", "missing: " + ", ".join(missing)))
    checks = (
        (
            artifact.get("schema_version") != CURATE_SCHEMA_VERSION,
            "schema_version",
            "schema_version must be 1.0.0",
        ),
        (
            artifact.get("workflow") != CURATE_WORKFLOW,
            "workflow",
            "workflow must be curate-reactions",
        ),
        (
            artifact.get("ruleset_version") != CURATE_RULESET_VERSION,
            "ruleset_version",
            "ruleset_version must be 1.1.0",
        ),
        (
            not isinstance(artifact.get("tool_versions"), dict),
            "tool_versions",
            "tool_versions must be object",
        ),
        (
            not isinstance(artifact.get("options"), dict),
            "options",
            "options must be object",
        ),
        (
            not isinstance(artifact.get("source_record"), dict),
            "source_record",
            "source_record must be object",
        ),
    )
    for failed, field, detail in checks:
        if failed:
            issues.append(_issue(f"corpus_artifact.{field}", detail))
    fingerprint = artifact.get("result_fingerprint")
    if not isinstance(fingerprint, str) or not re.fullmatch(
        r"[0-9a-f]{64}", fingerprint
    ):
        issues.append(
            _issue(
                "corpus_artifact.result_fingerprint",
                "result_fingerprint must be lowercase SHA-256",
                FINGERPRINT_CODE,
            )
        )
    elif fingerprint != curated_artifact_fingerprint(artifact):
        issues.append(
            _issue(
                "corpus_artifact.result_fingerprint",
                "result_fingerprint does not match Artifact",
                FINGERPRINT_CODE,
            )
        )
    return issues


def _finding_codes(
    findings: Any,
    path: str,
) -> tuple[list[CuratedContractIssue], set[str], set[str]]:
    if not isinstance(findings, list):
        return [_issue(path, "findings must be array")], set(), set()
    issues = []
    codes: set[str] = set()
    human_codes: set[str] = set()
    severities: set[str] = set()
    for index, finding in enumerate(findings):
        item_path = f"{path}[{index}]"
        if not isinstance(finding, dict):
            issues.append(_issue(item_path, "finding must be object"))
            continue
        code = finding.get("code")
        severity = finding.get("severity")
        if not isinstance(code, str) or not code:
            issues.append(_issue(f"{item_path}.code", "code is invalid"))
        else:
            codes.add(code)
        if severity not in FINDING_SEVERITIES:
            issues.append(_issue(f"{item_path}.severity", "severity is invalid"))
        else:
            severities.add(severity)
            if severity == "human_review" and isinstance(code, str):
                human_codes.add(code)
        if not isinstance(finding.get("field_path"), str):
            issues.append(_issue(f"{item_path}.field_path", "field_path is invalid"))
        if not isinstance(finding.get("evidence"), list):
            issues.append(_issue(f"{item_path}.evidence", "evidence must be array"))
    return issues, severities, human_codes


def _validate_unrequested(
    participant: dict[str, Any],
    path: str,
) -> list[CuratedContractIssue]:
    if (
        participant["upstream_record_id"] is not None
        or participant["upstream_disposition"] is not None
    ):
        return [_issue(path, "not_requested must not claim upstream")]
    return []


def _validate_failed(
    path: str,
    record_codes: set[str],
    record_disposition: str,
) -> list[CuratedContractIssue]:
    issues = []
    if "E-UPSTREAM-BINDING-001" not in record_codes:
        issues.append(_issue(path, "failed binding reason was not propagated"))
    if record_disposition != "rejected":
        issues.append(_issue(path, "failed binding requires rejected record"))
    return issues


def _validate_participant(
    participant: Any,
    path: str,
    record_codes: set[str],
    record_disposition: str,
) -> list[CuratedContractIssue]:
    if not isinstance(participant, dict):
        return [_issue(path, "participant must be object")]
    missing = sorted(REQUIRED_PARTICIPANT_FIELDS - set(participant))
    if missing:
        return [_issue(path, "missing: " + ", ".join(missing))]
    status = participant["upstream_binding_status"]
    if not isinstance(status, str) or status not in BINDING_STATUSES:
        return [_issue(f"{path}.upstream_binding_status", "binding status is invalid")]
    upstream_id = participant["upstream_record_id"]
    disposition = participant["upstream_disposition"]
    if status == "not_requested":
        return _validate_unrequested(participant, path)
    if status == "failed":
        return _validate_failed(path, record_codes, record_disposition)
    issues = []
    if not isinstance(upstream_id, str) or not upstream_id:
        issues.append(_issue(f"{path}.upstream_record_id", "bound id is invalid"))
    if not isinstance(disposition, str) or disposition not in {
        "ready_for_downstream",
        "review_required",
        "rejected",
    }:
        issues.append(_issue(f"{path}.upstream_disposition", "invalid disposition"))
    expected = (
        {
            "review_required": "H-UPSTREAM-REVIEW-001",
            "rejected": "E-UPSTREAM-REJECTED-001",
        }.get(disposition)
        if isinstance(disposition, str)
        else None
    )
    if expected and expected not in record_codes:
        issues.append(_issue(path, f"{disposition} was not propagated"))
    return issues


def _validate_record_shape(
    record: dict[str, Any],
    index: int,
) -> list[CuratedContractIssue]:
    path = f"corpus_artifact.records[{index}]"
    issues = []
    missing = sorted(REQUIRED_RECORD_FIELDS - set(record))
    if missing:
        return [_issue(path, "missing: " + ", ".join(missing))]
    record_id = record["record_id"]
    if not isinstance(record_id, str) or not record_id:
        issues.append(
            _issue(f"{path}.record_id", "record_id is invalid", RECORD_ID_CODE)
        )
    if not re.fullmatch(r"[0-9a-f]{64}", str(record["original_record_hash"])):
        issues.append(_issue(f"{path}.original_record_hash", "hash is invalid"))
    if not isinstance(record["reaction_smiles"], dict):
        issues.append(_issue(f"{path}.reaction_smiles", "must be object"))
    for field in (
        "participant_assessments",
        "duplicate_memberships",
        "findings",
        "human_review_required",
    ):
        if not isinstance(record[field], list):
            issues.append(_issue(f"{path}.{field}", f"{field} must be array"))
    status = record["curation_status"]
    if not isinstance(status, str) or status not in CURATE_STATUSES:
        issues.append(_issue(f"{path}.curation_status", "status is invalid"))
    disposition = record["disposition"]
    if not isinstance(disposition, str) or disposition not in CURATE_DISPOSITIONS:
        issues.append(_issue(f"{path}.disposition", "disposition is invalid"))
    return issues


def _validate_record(
    record: Any,
    index: int,
) -> list[CuratedContractIssue]:
    path = f"corpus_artifact.records[{index}]"
    if not isinstance(record, dict):
        return [_issue(path, "record must be object")]
    issues = _validate_record_shape(record, index)
    if issues:
        return issues
    finding_issues, severities, human_codes = _finding_codes(
        record["findings"], f"{path}.findings"
    )
    issues.extend(finding_issues)
    expected = (
        ("error", "rejected")
        if "error" in severities
        else ("partial", "review_required")
        if record["findings"]
        else ("completed", "ready_for_search")
    )
    if (record["curation_status"], record["disposition"]) != expected:
        issues.append(_issue(path, f"record state must be {expected!r}"))
    review = record["human_review_required"]
    if not all(isinstance(value, str) for value in review):
        issues.append(_issue(f"{path}.human_review_required", "must contain strings"))
    elif sorted(set(review)) != sorted(human_codes):
        issues.append(_issue(f"{path}.human_review_required", "review codes mismatch"))
    record_codes = {
        finding.get("code")
        for finding in record["findings"]
        if isinstance(finding, dict) and isinstance(finding.get("code"), str)
    }
    for participant_index, participant in enumerate(record["participant_assessments"]):
        issues.extend(
            _validate_participant(
                participant,
                f"{path}.participant_assessments[{participant_index}]",
                record_codes,
                record["disposition"],
            )
        )
    return issues


def validate_curated_artifact(artifact: Any) -> list[CuratedContractIssue]:
    if not isinstance(artifact, dict):
        return [_issue("corpus_artifact", "Artifact must be object")]
    issues = _validate_envelope(artifact)
    records = artifact.get("records")
    if not isinstance(records, list):
        issues.append(_issue("corpus_artifact.records", "records must be array"))
        return issues
    seen: set[str] = set()
    duplicates: set[str] = set()
    for index, record in enumerate(records):
        issues.extend(_validate_record(record, index))
        if isinstance(record, dict) and isinstance(record.get("record_id"), str):
            record_id = record["record_id"]
            if record_id in seen:
                duplicates.add(record_id)
            else:
                seen.add(record_id)
    for record_id in sorted(duplicates):
        issues.append(
            _issue(
                "corpus_artifact.records",
                f"duplicate record_id: {record_id}",
                RECORD_ID_CODE,
            )
        )
    return issues


def build_corpus_provenance(
    artifact: Any,
    contract_status: str,
) -> dict[str, Any]:
    value = artifact if isinstance(artifact, dict) else {}
    records = value.get("records")
    return {
        "provider": "local_curated_corpus",
        "workflow": value.get("workflow"),
        "schema_version": value.get("schema_version"),
        "ruleset_version": value.get("ruleset_version"),
        "artifact_fingerprint": value.get("result_fingerprint"),
        "record_count": len(records) if isinstance(records, list) else 0,
        "contract_status": contract_status,
    }
