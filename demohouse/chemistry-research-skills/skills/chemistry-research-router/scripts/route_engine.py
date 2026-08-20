"""Deterministically route validated chemistry intents."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any


class RouteEngineError(ValueError):
    """Raised when deterministic routing cannot safely continue."""


def _load_sibling(name: str, filename: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


CONTRACTS = _load_sibling("router_engine_contracts", "router_contracts.py")
DECISIONS = _load_sibling("router_engine_decisions", "decision_contracts.py")
AMBIGUITY_REASONS = {
    "missing_research_object": "missing_research_object",
    "missing_input_artifact": "missing_input_artifact",
    "missing_calculation_view": "missing_calculation_view",
    "missing_search_strategy": "missing_search_strategy",
    "ambiguous_reaction_vs_molecule": "ambiguous_reaction_vs_molecule",
    "ambiguous_direct_vs_workflow": "ambiguous_direct_vs_workflow",
    "conflicting_operations": "ambiguous_direct_vs_workflow",
}
FINDING_CONFIRMATIONS = {
    "E-EXTERNAL-DISCLOSURE": "external_data_disclosure",
}


def object_types(intent: dict[str, Any]) -> set[str]:
    return {item["object_type"] for item in intent["research_objects"]}


def operation_types(intent: dict[str, Any]) -> set[str]:
    return {
        item["operation_type"]
        for item in intent["requested_operations"]
        if item["negated"] is False
    }


def input_roles(intent: dict[str, Any]) -> set[str]:
    return {item["role"] for item in intent["input_artifacts"]}


def matching_targets(
    intent: dict[str, Any],
    catalog: dict[str, Any],
) -> list[dict[str, Any]]:
    objects = object_types(intent)
    operations = operation_types(intent)
    roles = input_roles(intent)
    if "compound_collection" in objects and "structure_input" in roles:
        objects.add("chemical_structure")
    return [
        entry
        for entry in catalog["targets"]
        if intent["goal"]["goal_type"] in entry["accepted_goal_types"]
        and objects >= set(entry["required_object_types"])
        and operations >= set(entry["required_operations"])
        and roles >= set(entry["required_input_roles"])
    ]


def _specificity(entry: dict[str, Any]) -> tuple[int, int]:
    requirements = (
        len(entry["required_object_types"])
        + len(entry["required_operations"])
        + len(entry["required_input_roles"])
    )
    return entry["priority"], requirements


def _select_target(matches: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not matches:
        return None
    ordered = sorted(
        matches,
        key=lambda item: (_specificity(item), item["target_id"]),
        reverse=True,
    )
    if len(ordered) > 1 and _specificity(ordered[0]) == _specificity(ordered[1]):
        return None
    return ordered[0]


def _policy_payload(policy: Any) -> dict[str, Any]:
    return {
        "blocked": policy.blocked,
        "findings": [
            {
                "code": item.code,
                "severity": item.severity,
                "field_ids": list(item.field_ids),
            }
            for item in policy.findings
        ],
    }


def _finding_codes(policy: Any) -> set[str]:
    return {item.code for item in policy.findings}


def _clarification_reasons(intent: dict[str, Any]) -> list[str]:
    reasons = [
        AMBIGUITY_REASONS[item]
        for item in intent["ambiguities"]
        if item in AMBIGUITY_REASONS
    ]
    if reasons:
        return list(dict.fromkeys(reasons))
    if not intent["research_objects"]:
        return ["missing_research_object"]
    roles = input_roles(intent)
    if intent["goal"]["goal_type"] == "build_route_evidence_review":
        if "route_input" not in roles:
            return ["missing_route_input"]
        if "reaction_input" not in roles:
            return ["missing_reaction_input"]
    return ["missing_input_artifact"]


def _execution_mode(
    intent: dict[str, Any],
    policy: Any,
    certification: dict[str, Any] | None,
) -> tuple[str, bool, list[str]]:
    codes = _finding_codes(policy)
    if certification is None or "E-HOST-CERTIFICATION" in codes:
        return "manual_target_required", False, []
    reasons = [
        FINDING_CONFIRMATIONS[code] for code in FINDING_CONFIRMATIONS if code in codes
    ]
    if intent["user_parameters"]:
        reasons.append("special_scientific_parameter")
    if reasons:
        return "confirmation_required", False, reasons
    return "auto_execute", True, []


def _applied_defaults(target: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "field_id": field_id,
            "value": value,
            "provenance": "catalog_default",
        }
        for field_id, value in sorted(target["safe_defaults"].items())
    ]


def _decision_id(
    intent: dict[str, Any],
    catalog: dict[str, Any],
    policy_fingerprint: str,
    route_type: str,
    targets: list[str],
) -> str:
    payload = {
        "intent_fingerprint": intent["intent_fingerprint"],
        "catalog_fingerprint": catalog["catalog_fingerprint"],
        "policy_fingerprint": policy_fingerprint,
        "route_type": route_type,
        "targets": targets,
    }
    return "decision-" + CONTRACTS.sha256_json(payload)[:24]


def _build_decision(
    intent: dict[str, Any],
    catalog: dict[str, Any],
    policy: Any,
    route_type: str,
    target: dict[str, Any] | None,
    certification: dict[str, Any] | None,
    clarification_reasons: list[str] | None = None,
) -> dict[str, Any]:
    policy_payload = _policy_payload(policy)
    policy_fingerprint = CONTRACTS.sha256_json(policy_payload)
    targets = [target["target_id"]] if target is not None else []
    if route_type in {"clarification_required", "unsupported"}:
        mode, authorized, confirmation_reasons = "not_executable", False, []
    else:
        mode, authorized, confirmation_reasons = _execution_mode(
            intent,
            policy,
            certification,
        )
    status = "ready" if target is not None else route_type
    required_inputs = target["required_input_roles"] if target is not None else []
    missing_inputs = (
        clarification_reasons
        if clarification_reasons is not None
        else sorted(set(required_inputs) - input_roles(intent))
    )
    decision = {
        "schema_version": "1.0.0",
        "decision_id": _decision_id(
            intent,
            catalog,
            policy_fingerprint,
            route_type,
            targets,
        ),
        "intent_id": intent["intent_id"],
        "intent_fingerprint": intent["intent_fingerprint"],
        "catalog_fingerprint": catalog["catalog_fingerprint"],
        "policy_fingerprint": policy_fingerprint,
        "decision_status": status,
        "route_type": route_type,
        "targets": targets,
        "required_inputs": list(required_inputs),
        "missing_inputs": missing_inputs,
        "applied_defaults": _applied_defaults(target) if target is not None else [],
        "execution_mode": mode,
        "execution_authorized": authorized,
        "confirmation_reasons": confirmation_reasons,
        "policy_findings": policy_payload["findings"],
        "decision_fingerprint": "",
    }
    decision["decision_fingerprint"] = CONTRACTS.sha256_json(
        decision,
        "decision_fingerprint",
    )
    return DECISIONS.validate_route_decision(decision)


def build_clarification(
    intent: dict[str, Any],
    reason_codes: list[str],
) -> dict[str, Any]:
    templates = {
        item["template_id"]: item
        for item in DECISIONS.load_clarification_templates()["templates"]
    }
    questions = []
    for position, reason in enumerate(reason_codes, start=1):
        template_id = DECISIONS.REASON_TEMPLATES.get(reason)
        if template_id is None:
            raise RouteEngineError(f"unsupported clarification reason: {reason}")
        template = templates[template_id]
        questions.append(
            {
                "question_id": f"q-{position:03d}",
                "field_id": template["field_id"],
                "template_id": template_id,
                "response_type": template["response_type"],
            }
        )
    clarification_id = (
        "clarification-"
        + CONTRACTS.sha256_json(
            {
                "intent_fingerprint": intent["intent_fingerprint"],
                "reason_codes": reason_codes,
            }
        )[:24]
    )
    value = {
        "schema_version": "1.0.0",
        "clarification_id": clarification_id,
        "intent_id": intent["intent_id"],
        "intent_fingerprint": intent["intent_fingerprint"],
        "reason_codes": reason_codes,
        "questions": questions,
        "status": "awaiting_user",
        "clarification_fingerprint": "",
    }
    value["clarification_fingerprint"] = CONTRACTS.sha256_json(
        value,
        "clarification_fingerprint",
    )
    return DECISIONS.validate_clarification_request(value)


def route_intent(
    intent: dict[str, Any],
    catalog: dict[str, Any],
    policy: Any,
    certification: dict[str, Any] | None,
) -> dict[str, Any]:
    """Return one controlled RouteDecision without reading source text."""
    if policy.blocked:
        raise RouteEngineError("routing blocked by policy")
    codes = _finding_codes(policy)
    if "E-UNSAFE-CAPABILITY" in codes:
        return _build_decision(
            intent,
            catalog,
            policy,
            "unsupported",
            None,
            certification,
        )
    if intent["ambiguities"]:
        return _build_decision(
            intent,
            catalog,
            policy,
            "clarification_required",
            None,
            certification,
            _clarification_reasons(intent),
        )
    target = _select_target(matching_targets(intent, catalog))
    if target is None:
        return _build_decision(
            intent,
            catalog,
            policy,
            "clarification_required",
            None,
            certification,
            _clarification_reasons(intent),
        )
    return _build_decision(
        intent,
        catalog,
        policy,
        target["target_type"],
        target,
        certification,
    )
