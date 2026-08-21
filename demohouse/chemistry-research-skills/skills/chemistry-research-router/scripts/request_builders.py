"""Build controlled target requests from validated Router decisions."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any


def _load_sibling(name: str, filename: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


CONTRACTS = _load_sibling("router_builder_contracts", "router_contracts.py")
DECISIONS = _load_sibling("router_builder_decisions", "decision_contracts.py")
REQUESTS = _load_sibling("router_builder_requests", "request_contracts.py")
TARGETS = _load_sibling(
    "router_builder_targets",
    "request_target_builders.py",
)
RequestBuilderError = TARGETS.RequestBuilderError


def _target_entry(
    catalog: dict[str, Any],
    target_id: str,
) -> dict[str, Any]:
    for entry in catalog.get("targets", []):
        if entry.get("target_id") == target_id:
            return entry
    raise RequestBuilderError(f"decision target is not in catalog: {target_id}")


def _validate_bindings(
    intent: dict[str, Any],
    decision: dict[str, Any],
    catalog: dict[str, Any],
) -> dict[str, Any]:
    expected_intent = CONTRACTS.sha256_json(intent, "intent_fingerprint")
    expected_catalog = CONTRACTS.sha256_json(catalog, "catalog_fingerprint")
    if intent.get("intent_fingerprint") != expected_intent:
        raise RequestBuilderError("intent fingerprint is invalid")
    if catalog.get("catalog_fingerprint") != expected_catalog:
        raise RequestBuilderError("catalog fingerprint is invalid")
    try:
        DECISIONS.validate_route_decision(decision)
    except DECISIONS.DecisionContractError as error:
        raise RequestBuilderError(f"decision is invalid: {error}") from error
    if (
        decision["intent_id"] != intent["intent_id"]
        or decision["intent_fingerprint"] != intent["intent_fingerprint"]
        or decision["catalog_fingerprint"] != catalog["catalog_fingerprint"]
    ):
        raise RequestBuilderError("decision binding does not match intent or catalog")
    if decision["decision_status"] != "ready" or len(decision["targets"]) != 1:
        raise RequestBuilderError("decision is not executable")
    entry = _target_entry(catalog, decision["targets"][0])
    if entry["target_type"] != decision["route_type"]:
        raise RequestBuilderError("decision route type does not match catalog")
    return entry


def build_workflow_a_request(
    intent: dict[str, Any],
    decision: dict[str, Any],
    catalog: dict[str, Any],
) -> dict[str, Any]:
    """Build and validate the public Workflow A request."""
    _validate_bindings(intent, decision, catalog)
    return TARGETS.workflow_a_components(intent, decision)[0]


def build_workflow_b_request(
    intent: dict[str, Any],
    decision: dict[str, Any],
    catalog: dict[str, Any],
    staging_root: Path,
) -> dict[str, Any]:
    """Build and validate the public Workflow B request."""
    _validate_bindings(intent, decision, catalog)
    return TARGETS.workflow_b_components(intent, decision, staging_root)[0]


def build_direct_skill_request(
    intent: dict[str, Any],
    decision: dict[str, Any],
    catalog: dict[str, Any],
    staging_root: Path,
) -> dict[str, Any]:
    """Build a controlled direct Skill request envelope."""
    entry = _validate_bindings(intent, decision, catalog)
    if entry["target_type"] != "direct_skill":
        raise RequestBuilderError("decision does not target a direct Skill")
    return TARGETS.generic_components(intent, decision, staging_root)[0]


def build_chain_request(
    intent: dict[str, Any],
    decision: dict[str, Any],
    catalog: dict[str, Any],
    staging_root: Path,
) -> dict[str, Any]:
    """Build a controlled bounded-chain request envelope."""
    entry = _validate_bindings(intent, decision, catalog)
    if entry["target_type"] != "direct_skill_chain":
        raise RequestBuilderError("decision does not target a bounded chain")
    return TARGETS.generic_components(intent, decision, staging_root)[0]


def _parameter_bindings(
    parameters: dict[str, tuple[Any, str]],
    staged: list[dict[str, Any]],
    request_id: str,
) -> list[dict[str, Any]]:
    bindings = [
        {"field_id": field_id, "value": value, "provenance": provenance}
        for field_id, (value, provenance) in sorted(parameters.items())
    ]
    bindings.append(
        {
            "field_id": "request_id",
            "value": request_id,
            "provenance": "derived_integrity_value",
        }
    )
    for index, item in enumerate(staged, start=1):
        prefix = f"staged.{index:03d}"
        bindings.extend(
            [
                {
                    "field_id": f"{prefix}.artifact",
                    "value": item["artifact_ref"],
                    "provenance": "validated_attachment",
                },
                {
                    "field_id": f"{prefix}.path",
                    "value": item["path"],
                    "provenance": "derived_integrity_value",
                },
                {
                    "field_id": f"{prefix}.sha256",
                    "value": item["sha256"],
                    "provenance": "derived_integrity_value",
                },
            ]
        )
    return bindings


def build_execution_request(
    intent: dict[str, Any],
    decision: dict[str, Any],
    catalog: dict[str, Any],
    staging_root: Path,
) -> dict[str, Any]:
    """Build one signed RouterExecutionRequest without executing it."""
    entry = _validate_bindings(intent, decision, catalog)
    target_type = entry["target_type"]
    if target_type == "workflow_a":
        target_request, staged, parameters = TARGETS.workflow_a_components(
            intent,
            decision,
        )
    elif target_type == "workflow_b":
        target_request, staged, parameters = TARGETS.workflow_b_components(
            intent,
            decision,
            staging_root,
        )
    else:
        target_request, staged, parameters = TARGETS.generic_components(
            intent,
            decision,
            staging_root,
        )
    risk_reasons = list(decision["confirmation_reasons"])
    if target_request["execution_policy"]["network_mode"] == "public_http":
        risk_reasons.append("external_data_disclosure")
    risk_reasons = list(dict.fromkeys(risk_reasons))
    request_id = target_request["request_id"]
    request = {
        "schema_version": "1.0.0",
        "request_id": request_id,
        "intent_id": intent["intent_id"],
        "intent_fingerprint": intent["intent_fingerprint"],
        "decision_id": decision["decision_id"],
        "decision_fingerprint": decision["decision_fingerprint"],
        "target_type": target_type,
        "target_id": entry["target_id"],
        "target_request": target_request,
        "parameter_bindings": _parameter_bindings(
            parameters,
            staged,
            request_id,
        ),
        "staged_inputs": staged,
        "risk_reasons": risk_reasons,
        "request_fingerprint": "",
    }
    request["request_fingerprint"] = CONTRACTS.sha256_json(
        request,
        "request_fingerprint",
    )
    try:
        return REQUESTS.validate_execution_request(request)
    except REQUESTS.RequestContractError as error:
        raise RequestBuilderError(f"execution request is invalid: {error}") from error
