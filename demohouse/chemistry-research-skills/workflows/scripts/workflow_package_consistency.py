"""Compare stored Workflow evidence package with independently rebuilt values."""

from __future__ import annotations

from typing import Any


def package_consistency_errors(
    manifest: dict[str, Any],
    artifacts: list[dict[str, Any]],
    evidence: dict[str, Any],
    claims: dict[str, Any],
    report: dict[str, Any],
    expected_evidence: dict[str, Any],
    expected_claims: dict[str, Any],
    expected_report: dict[str, Any],
) -> list[str]:
    errors = []
    if evidence != expected_evidence:
        errors.append("evidence index does not match verified artifacts")
    if claims != expected_claims:
        errors.append("claim ledger does not match verified evidence")
    if report != expected_report:
        errors.append("workflow report does not match verified package")
    artifact_ids = [item["artifact_id"] for item in artifacts]
    evidence_ids = [item.get("artifact_id") for item in evidence.get("evidence", [])]
    if evidence_ids != artifact_ids:
        errors.append("evidence index does not conserve committed artifacts")
    if report.get("artifact_ids") != artifact_ids:
        errors.append("workflow report artifact IDs do not match registry")
    if report.get("run_status") != manifest["run_status"]:
        errors.append("workflow report run status does not match manifest")
    if report.get("evidence_count") != len(evidence.get("evidence", [])):
        errors.append("workflow report evidence count mismatch")
    if report.get("claim_count") != len(claims.get("claims", [])):
        errors.append("workflow report claim count mismatch")
    return errors
