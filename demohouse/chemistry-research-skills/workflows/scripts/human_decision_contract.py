"""Strict validation for persisted HumanDecision documents."""

from __future__ import annotations

from datetime import datetime
from typing import Any


DECISION_FIELDS = {
    "schema_version",
    "run_id",
    "gate_id",
    "gate_type",
    "request_fingerprint",
    "source_artifact_id",
    "source_artifact_sha256",
    "actor_type",
    "decided_at_utc",
    "decisions",
    "decision_fingerprint",
}
GATE_TYPES = {"identity_resolution", "calculation_view"}
IDENTITY_DECISIONS = {
    "authorize_candidate_for_standardization",
    "supply_structure",
    "exclude_record",
    "abort_run",
}
VIEW_DECISIONS = {"use_standardized", "use_parent", "abort_run"}
STRUCTURE_TYPES = {"smiles", "inchi", "molblock"}


class HumanDecisionError(ValueError):
    """Raised when a HumanDecision is stale, malformed, or unbound."""


def _exact(
    contracts: Any,
    value: dict[str, Any],
    fields: set[str],
    label: str,
) -> None:
    try:
        contracts.require_exact_fields(value, fields, set(), label)
    except contracts.ContractError as error:
        raise HumanDecisionError(str(error)) from error


def _require_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise HumanDecisionError(f"{label} must be a non-empty string")
    return value


def _require_utc(value: Any) -> str:
    text = _require_string(value, "decided_at_utc")
    if not text.endswith("Z"):
        raise HumanDecisionError("decided_at_utc must be UTC")
    try:
        datetime.fromisoformat(text.removesuffix("Z") + "+00:00")
    except ValueError as error:
        raise HumanDecisionError("decided_at_utc is invalid") from error
    return text


def candidate_map(
    identity: dict[str, Any],
) -> dict[tuple[str, str], dict[str, Any]]:
    candidates: dict[tuple[str, str], dict[str, Any]] = {}
    for resolution in identity.get("resolutions", []):
        if not isinstance(resolution, dict):
            continue
        request = resolution.get("request")
        request_id = request.get("id") if isinstance(request, dict) else None
        if not isinstance(request_id, str):
            continue
        for candidate in resolution.get("candidates", []):
            if isinstance(candidate, dict) and isinstance(
                candidate.get("candidate_id"),
                str,
            ):
                candidates[(request_id, candidate["candidate_id"])] = candidate
    return candidates


def unresolved_request_ids(identity: dict[str, Any]) -> list[str]:
    output = []
    for resolution in identity.get("resolutions", []):
        if not isinstance(resolution, dict):
            continue
        handoff = resolution.get("standardization_handoff")
        request = resolution.get("request")
        if (
            isinstance(handoff, dict)
            and handoff.get("status") != "ready"
            and isinstance(request, dict)
            and isinstance(request.get("id"), str)
        ):
            output.append(request["id"])
    return output


def _validate_envelope(
    contracts: Any,
    value: Any,
    gate: dict[str, Any],
) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise HumanDecisionError("HumanDecision must be an object")
    _exact(contracts, value, DECISION_FIELDS, "HumanDecision")
    if value["schema_version"] != "1.0.0":
        raise HumanDecisionError("schema_version must be 1.0.0")
    for field in (
        "run_id",
        "gate_id",
        "gate_type",
        "request_fingerprint",
        "source_artifact_id",
        "source_artifact_sha256",
    ):
        if value[field] != gate[field]:
            raise HumanDecisionError(f"{field} does not match gate")
    if value["gate_type"] not in GATE_TYPES:
        raise HumanDecisionError("gate_type is unsupported")
    if value["actor_type"] not in {"user", "expert"}:
        raise HumanDecisionError("actor_type is unsupported")
    _require_utc(value["decided_at_utc"])
    decisions = value["decisions"]
    if not isinstance(decisions, list) or not decisions:
        raise HumanDecisionError("decisions must be a non-empty array")
    fingerprint_value = {
        key: item for key, item in value.items() if key != "decision_fingerprint"
    }
    if value["decision_fingerprint"] != contracts.sha256_json(fingerprint_value):
        raise HumanDecisionError("decision_fingerprint mismatch")
    return dict(value)


def _validate_authorize(
    contracts: Any,
    value: dict[str, Any],
    candidates: dict[tuple[str, str], dict[str, Any]],
) -> None:
    fields = {
        "request_id",
        "decision",
        "decision_scope",
        "candidate_id",
        "candidate_sha256",
    }
    _exact(contracts, value, fields, "authorize decision")
    if value["decision_scope"] != "record_candidate":
        raise HumanDecisionError("decision_scope is invalid")
    candidate = candidates.get((value["request_id"], value["candidate_id"]))
    if candidate is None:
        raise HumanDecisionError("candidate does not exist")
    if value["candidate_sha256"] != contracts.sha256_json(candidate):
        raise HumanDecisionError("candidate_sha256 mismatch")
    if not isinstance(candidate.get("canonical_smiles"), str):
        raise HumanDecisionError("candidate has no usable structure")


def _validate_supply(contracts: Any, value: dict[str, Any]) -> None:
    fields = {
        "request_id",
        "decision",
        "decision_scope",
        "structure_type",
        "structure",
        "structure_sha256",
    }
    _exact(contracts, value, fields, "supply structure decision")
    if value["decision_scope"] != "record_structure":
        raise HumanDecisionError("supply decision_scope is invalid")
    if value["structure_type"] not in STRUCTURE_TYPES:
        raise HumanDecisionError("structure_type is unsupported")
    structure = _require_string(value["structure"], "structure")
    if value["structure_sha256"] != contracts.sha256_text(structure):
        raise HumanDecisionError("structure_sha256 mismatch")


def _validate_identity_item(
    contracts: Any,
    item: Any,
    candidates: dict[tuple[str, str], dict[str, Any]],
    seen: set[str],
) -> bool:
    if not isinstance(item, dict) or item.get("decision") not in IDENTITY_DECISIONS:
        raise HumanDecisionError("identity decision is unsupported")
    decision = item["decision"]
    if decision == "abort_run":
        _exact(
            contracts,
            item,
            {"decision", "decision_scope"},
            "abort decision",
        )
        if item["decision_scope"] != "workflow":
            raise HumanDecisionError("abort decision_scope is invalid")
        return True
    request_id = _require_string(item.get("request_id"), "request_id")
    if request_id in seen:
        raise HumanDecisionError("duplicate request_id decision")
    seen.add(request_id)
    if decision == "authorize_candidate_for_standardization":
        _validate_authorize(contracts, item, candidates)
    elif decision == "supply_structure":
        _validate_supply(contracts, item)
    else:
        _exact(
            contracts,
            item,
            {"request_id", "decision", "decision_scope"},
            "exclude decision",
        )
        if item["decision_scope"] != "record":
            raise HumanDecisionError("exclude decision_scope is invalid")
    return False


def _validate_identity_decisions(
    contracts: Any,
    value: dict[str, Any],
    gate: dict[str, Any],
    identity: dict[str, Any],
) -> None:
    candidates = candidate_map(identity)
    seen: set[str] = set()
    abort_count = sum(
        _validate_identity_item(contracts, item, candidates, seen)
        for item in value["decisions"]
    )
    unresolved = set(unresolved_request_ids(identity))
    if abort_count:
        if abort_count != 1 or len(value["decisions"]) != 1:
            raise HumanDecisionError("abort_run must be the only decision")
    elif seen != unresolved:
        raise HumanDecisionError("decisions do not cover unresolved requests")
    gate_ids = {
        item["request_id"]
        for item in gate["unresolved_requests"]
        if isinstance(item, dict)
    }
    if unresolved != gate_ids:
        raise HumanDecisionError("gate unresolved requests are stale")


def _validate_view_decisions(
    contracts: Any,
    value: dict[str, Any],
) -> None:
    if len(value["decisions"]) != 1:
        raise HumanDecisionError("calculation view requires one decision")
    item = value["decisions"][0]
    if not isinstance(item, dict):
        raise HumanDecisionError("calculation view decision must be an object")
    _exact(
        contracts,
        item,
        {"decision", "decision_scope"},
        "calculation view decision",
    )
    if item["decision"] not in VIEW_DECISIONS:
        raise HumanDecisionError("calculation view decision is unsupported")
    if item["decision_scope"] not in {"workflow", "workflow_calculation_view"}:
        raise HumanDecisionError("calculation view decision_scope is invalid")


def validate_human_decision(
    contracts: Any,
    value: Any,
    gate: dict[str, Any],
    source_artifact: dict[str, Any],
) -> dict[str, Any]:
    validated = _validate_envelope(contracts, value, gate)
    if validated["gate_type"] == "identity_resolution":
        _validate_identity_decisions(
            contracts,
            validated,
            gate,
            source_artifact,
        )
    else:
        _validate_view_decisions(contracts, validated)
    return validated
