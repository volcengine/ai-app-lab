"""Strict Evidence Index and Claim Ledger validation."""

from __future__ import annotations

from typing import Any


EVIDENCE_FIELDS = {
    "evidence_id",
    "artifact_id",
    "evidence_type",
    "producer_node_id",
    "sha256",
    "validator_status",
    "domain_state",
    "upstream_evidence_ids",
}
EVIDENCE_INDEX_FIELDS = {"schema_version", "workflow", "evidence"}
CLAIM_LEDGER_FIELDS = {
    "schema_version",
    "workflow",
    "workflow_id",
    "claims",
}
CLAIM_FIELDS = {
    "claim_id",
    "claim_type",
    "status",
    "subject_id",
    "evidence_ids",
    "limitations",
}
EVIDENCE_TYPES = {
    "validated_skill_artifact",
    "validator_report",
    "workflow_derived_artifact",
}
CLAIM_TYPES = {
    "identity_record_selected",
    "structure_standardized",
    "structure_requires_review",
    "feature_calculation_completed",
    "feature_calculation_partial",
    "library_operation_completed",
    "reaction_curated",
    "precedent_exact_record_found",
    "precedent_transformation_found",
    "precedent_similarity_found",
    "precedent_component_found",
    "precedent_zero_hits",
    "precedent_search_incomplete",
    "route_ready_for_expert_review",
    "route_review_required",
    "route_blocked",
}
CLAIM_STATUSES = {"supported", "review_required", "blocked"}
LIMITATIONS = {
    "not_physical_sample_identity",
    "not_experimental_confirmation",
    "not_property_prediction",
    "not_experimental_safety_assessment",
    "not_ready_for_experiment",
    "not_safety_approval",
}


def _exact(
    value: dict[str, Any],
    fields: set[str],
    label: str,
) -> list[str]:
    missing = sorted(fields - value.keys())
    unknown = sorted(value.keys() - fields)
    return (
        [f"{label}: missing={missing}, unknown fields={unknown}"]
        if missing or unknown
        else []
    )


def _validate_evidence_item(
    item: dict[str, Any],
    index: int,
    identifiers: set[str],
) -> list[str]:
    errors: list[str] = []
    errors.extend(_exact(item, EVIDENCE_FIELDS, f"evidence[{index}]"))
    identifier = item.get("evidence_id")
    if not isinstance(identifier, str) or identifier in identifiers:
        errors.append(f"evidence[{index}].evidence_id is invalid or duplicate")
    else:
        identifiers.add(identifier)
    if item.get("evidence_type") not in EVIDENCE_TYPES:
        errors.append(f"evidence[{index}].evidence_type is unsupported")
    for field in ("artifact_id", "producer_node_id", "domain_state"):
        if not isinstance(item.get(field), str) or not item[field].strip():
            errors.append(f"evidence[{index}].{field} is invalid")
    sha256 = item.get("sha256")
    if (
        not isinstance(sha256, str)
        or len(sha256) != 64
        or any(character not in "0123456789abcdef" for character in sha256)
    ):
        errors.append(f"evidence[{index}].sha256 is invalid")
    upstream = item.get("upstream_evidence_ids")
    if (
        not isinstance(upstream, list)
        or not all(isinstance(identifier, str) for identifier in upstream)
        or len(upstream) != len(set(upstream))
    ):
        errors.append(f"evidence[{index}].upstream_evidence_ids must be an array")
    return errors


def _validate_evidence(value: Any) -> tuple[list[str], set[str]]:
    if not isinstance(value, list):
        return ["evidence_index.evidence must be an array"], set()
    errors: list[str] = []
    identifiers: set[str] = set()
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            errors.append(f"evidence[{index}] must be an object")
            continue
        errors.extend(_validate_evidence_item(item, index, identifiers))
    for index, item in enumerate(value):
        if isinstance(item, dict):
            upstream = item.get("upstream_evidence_ids")
            unknown = (
                set(upstream) - identifiers
                if isinstance(upstream, list)
                and all(isinstance(identifier, str) for identifier in upstream)
                else set()
            )
            if unknown:
                errors.append(f"evidence[{index}] has unknown upstream evidence")
    return errors, identifiers


def _validate_claim_item(
    item: dict[str, Any],
    index: int,
    identifiers: set[str],
    evidence_ids: set[str],
) -> list[str]:
    errors = _exact(item, CLAIM_FIELDS, f"claims[{index}]")
    claim_id = item.get("claim_id")
    if not isinstance(claim_id, str) or claim_id in identifiers:
        errors.append(f"claims[{index}].claim_id is invalid or duplicate")
    else:
        identifiers.add(claim_id)
    if item.get("claim_type") not in CLAIM_TYPES:
        errors.append(f"claims[{index}].claim_type is unsupported")
    if item.get("status") not in CLAIM_STATUSES:
        errors.append(f"claims[{index}].status is unsupported")
    references = item.get("evidence_ids")
    if (
        not isinstance(references, list)
        or not references
        or not all(isinstance(identifier, str) for identifier in references)
        or len(references) != len(set(references))
    ):
        errors.append(f"claims[{index}].evidence_ids must be non-empty")
    elif set(references) - evidence_ids:
        errors.append(f"claims[{index}] references unknown evidence")
    limitations = item.get("limitations")
    if (
        not isinstance(limitations, list)
        or not all(isinstance(limitation, str) for limitation in limitations)
        or len(limitations) != len(set(limitations))
        or any(limitation not in LIMITATIONS for limitation in limitations)
    ):
        errors.append(f"claims[{index}].limitations is invalid")
    if not isinstance(item.get("subject_id"), str) or not item["subject_id"].strip():
        errors.append(f"claims[{index}].subject_id is invalid")
    return errors


def _validate_claims(value: Any, evidence_ids: set[str]) -> list[str]:
    if not isinstance(value, list):
        return ["claim_ledger.claims must be an array"]
    errors: list[str] = []
    identifiers: set[str] = set()
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            errors.append(f"claims[{index}] must be an object")
            continue
        errors.extend(
            _validate_claim_item(
                item,
                index,
                identifiers,
                evidence_ids,
            )
        )
    return errors


def validate_package(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {
            "valid": False,
            "errors": ["package must be an object"],
            "warnings": [],
        }
    evidence_index = value.get("evidence_index")
    claim_ledger = value.get("claim_ledger")
    if not isinstance(evidence_index, dict) or not isinstance(claim_ledger, dict):
        return {
            "valid": False,
            "errors": ["evidence_index and claim_ledger are required"],
            "warnings": [],
        }
    errors = _exact(evidence_index, EVIDENCE_INDEX_FIELDS, "evidence_index")
    errors.extend(_exact(claim_ledger, CLAIM_LEDGER_FIELDS, "claim_ledger"))
    if (
        evidence_index.get("schema_version") != "1.0.0"
        or evidence_index.get("workflow") != "workflow-evidence-index"
    ):
        errors.append("evidence_index envelope is invalid")
    if (
        claim_ledger.get("schema_version") != "1.0.0"
        or claim_ledger.get("workflow") != "workflow-claim-ledger"
        or not isinstance(claim_ledger.get("workflow_id"), str)
    ):
        errors.append("claim_ledger envelope is invalid")
    evidence_errors, evidence_ids = _validate_evidence(evidence_index.get("evidence"))
    errors.extend(evidence_errors)
    errors.extend(_validate_claims(claim_ledger.get("claims"), evidence_ids))
    return {"valid": not errors, "errors": errors, "warnings": []}
