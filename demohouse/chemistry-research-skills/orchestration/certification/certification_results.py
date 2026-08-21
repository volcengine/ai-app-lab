"""Validate evaluated routing and safety records before certification scoring."""

from __future__ import annotations

from datetime import datetime
from typing import Any


ROUTE_TYPES = {
    "direct_skill",
    "direct_skill_chain",
    "workflow_a",
    "workflow_b",
    "clarification_required",
    "unsupported",
}
ENTRY_MODES = {
    "atomic_or_router_direct",
    "router_required",
    "no_chemistry_entry",
}
EXECUTION_MODES = {
    "auto_execute",
    "confirmation_required",
    "manual_target_required",
    "not_executable",
}
SAFETY_TYPES = {
    "auto_offline",
    "clarification",
    "unsupported",
    "external_confirmation",
}
ROUTING_FIELDS = {
    "case_id",
    "session_id",
    "expected_entry_mode",
    "expected_route_type",
    "expected_targets",
    "expected_chain_order",
    "special_case",
    "entrypoint_selected",
    "router_triggered",
    "intent_valid",
    "actual_route_type",
    "actual_targets",
    "actual_chain_order",
    "execution_mode",
    "network_before_confirmation",
    "parameter_hallucinations",
    "raw_output_sha256",
    "recorded_at_utc",
}
SAFETY_FIELDS = {
    "case_id",
    "session_id",
    "safety_type",
    "expected_execution_mode",
    "actual_execution_mode",
    "installation_integrity",
    "wrong_auto_execution",
    "network_before_confirmation",
    "parameter_hallucinations",
    "raw_output_sha256",
    "recorded_at_utc",
}


class CertificationResultError(ValueError):
    """Raised when one evaluated certification result is malformed."""


def timestamp(value: Any, label: str) -> datetime:
    if not isinstance(value, str) or not value.endswith("Z"):
        raise CertificationResultError(f"{label} must be UTC")
    try:
        return datetime.fromisoformat(value.removesuffix("Z") + "+00:00")
    except ValueError as error:
        raise CertificationResultError(f"{label} is invalid") from error


def string_list(value: Any, label: str) -> list[str]:
    if (
        not isinstance(value, list)
        or not all(isinstance(item, str) and item for item in value)
        or len(value) != len(set(value))
    ):
        raise CertificationResultError(f"{label} must be unique strings")
    return value


def require_sha256(value: Any, label: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != 64
        or any(character not in "0123456789abcdef" for character in value)
    ):
        raise CertificationResultError(f"{label} must be SHA-256")
    return value


def _validate_route_values(value: dict[str, Any]) -> None:
    if value["expected_entry_mode"] not in ENTRY_MODES:
        raise CertificationResultError("routing expected entry mode is invalid")
    for field in ("expected_route_type", "actual_route_type"):
        if value[field] is not None and value[field] not in ROUTE_TYPES:
            raise CertificationResultError(f"routing {field} is invalid")
    for field in (
        "expected_targets",
        "expected_chain_order",
        "actual_targets",
        "actual_chain_order",
        "parameter_hallucinations",
    ):
        string_list(value[field], f"routing {field}")


def _validate_route_provenance(value: dict[str, Any]) -> None:
    for field in (
        "special_case",
        "router_triggered",
        "network_before_confirmation",
    ):
        if not isinstance(value[field], bool):
            raise CertificationResultError(f"routing {field} must be boolean")
    if value["router_triggered"] and not isinstance(value["intent_valid"], bool):
        raise CertificationResultError("Router result requires intent_valid")
    if not value["router_triggered"] and value["intent_valid"] is not None:
        raise CertificationResultError("direct result intent_valid must be null")
    if value["entrypoint_selected"] is not None and not isinstance(
        value["entrypoint_selected"], str
    ):
        raise CertificationResultError("routing entrypoint is invalid")


def validate_routing_result(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != ROUTING_FIELDS:
        raise CertificationResultError("routing result fields mismatch")
    _validate_route_values(value)
    _validate_route_provenance(value)
    if value["execution_mode"] is not None and value["execution_mode"] not in (
        EXECUTION_MODES
    ):
        raise CertificationResultError("routing execution mode is invalid")
    require_sha256(value["raw_output_sha256"], "routing raw output")
    timestamp(value["recorded_at_utc"], "routing recorded_at_utc")
    return dict(value)


def validate_safety_result(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != SAFETY_FIELDS:
        raise CertificationResultError("safety result fields mismatch")
    if value["safety_type"] not in SAFETY_TYPES:
        raise CertificationResultError("safety type is invalid")
    for field in ("expected_execution_mode", "actual_execution_mode"):
        if value[field] not in EXECUTION_MODES:
            raise CertificationResultError(f"safety {field} is invalid")
    for field in (
        "installation_integrity",
        "wrong_auto_execution",
        "network_before_confirmation",
    ):
        if not isinstance(value[field], bool):
            raise CertificationResultError(f"safety {field} must be boolean")
    derived_wrong_auto = (
        value["actual_execution_mode"] == "auto_execute"
        and value["expected_execution_mode"] != "auto_execute"
    )
    if value["wrong_auto_execution"] is not derived_wrong_auto:
        raise CertificationResultError("safety wrong_auto_execution mismatch")
    string_list(value["parameter_hallucinations"], "safety parameter_hallucinations")
    require_sha256(value["raw_output_sha256"], "safety raw output")
    timestamp(value["recorded_at_utc"], "safety recorded_at_utc")
    return dict(value)
