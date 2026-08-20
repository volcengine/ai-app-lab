"""Validate RouteDecision and ClarificationRequest contracts."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any


class DecisionContractError(ValueError):
    """Raised when a decision or clarification contract is invalid."""


def _load_sibling(name: str, filename: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


CONTRACTS = _load_sibling("router_decision_contracts", "router_contracts.py")
SCHEMAS = _load_sibling("router_decision_schemas", "schema_validation.py")
EXPECTED_TEMPLATES = (
    {
        "template_id": "request_research_object",
        "field_id": "research_object",
        "response_type": "text",
    },
    {
        "template_id": "request_input_artifact",
        "field_id": "input_artifact",
        "response_type": "file_reference",
    },
    {
        "template_id": "request_route_file",
        "field_id": "route_input",
        "response_type": "file_reference",
    },
    {
        "template_id": "request_reaction_file",
        "field_id": "reaction_input",
        "response_type": "file_reference",
    },
    {
        "template_id": "choose_calculation_view",
        "field_id": "calculation_view",
        "response_type": "controlled_choice",
    },
    {
        "template_id": "choose_search_strategy",
        "field_id": "search_strategy",
        "response_type": "controlled_choice",
    },
    {
        "template_id": "resolve_reaction_molecule_ambiguity",
        "field_id": "chemical_object_type",
        "response_type": "controlled_choice",
    },
    {
        "template_id": "choose_direct_or_evidence_workflow",
        "field_id": "workflow_scope",
        "response_type": "controlled_choice",
    },
)
REASON_TEMPLATES = {
    "missing_research_object": "request_research_object",
    "missing_input_artifact": "request_input_artifact",
    "missing_route_input": "request_route_file",
    "missing_reaction_input": "request_reaction_file",
    "missing_calculation_view": "choose_calculation_view",
    "missing_search_strategy": "choose_search_strategy",
    "ambiguous_reaction_vs_molecule": "resolve_reaction_molecule_ambiguity",
    "ambiguous_direct_vs_workflow": "choose_direct_or_evidence_workflow",
}


def load_clarification_templates() -> dict[str, Any]:
    """Load the exact built-in clarification template catalog."""
    path = (
        Path(__file__).resolve().parents[1]
        / "assets"
        / ("clarification-templates-v1.json")
    )
    try:
        value = CONTRACTS.read_json_object(path, "clarification templates")
    except CONTRACTS.RouterContractError as error:
        raise DecisionContractError(str(error)) from error
    if set(value) != {"schema_version", "templates"}:
        raise DecisionContractError("clarification template catalog fields mismatch")
    if value["schema_version"] != "1.0.0":
        raise DecisionContractError("clarification template version mismatch")
    templates = value["templates"]
    if not isinstance(templates, list) or tuple(templates) != EXPECTED_TEMPLATES:
        raise DecisionContractError("clarification template catalog mismatch")
    return value


def _validate_schema(value: Any, schema_name: str) -> dict[str, Any]:
    try:
        return SCHEMAS.validate_schema_instance(value, schema_name)
    except SCHEMAS.SchemaContractError as error:
        raise DecisionContractError(str(error)) from error


def validate_route_decision(value: Any) -> dict[str, Any]:
    """Validate RouteDecision shape and integrity fingerprint."""
    decision = _validate_schema(value, "route-decision-v1")
    expected = CONTRACTS.sha256_json(decision, "decision_fingerprint")
    if decision["decision_fingerprint"] != expected:
        raise DecisionContractError("decision_fingerprint mismatch")
    return decision


def _template_map() -> dict[str, dict[str, str]]:
    catalog = load_clarification_templates()
    return {item["template_id"]: item for item in catalog["templates"]}


def _validate_questions(clarification: dict[str, Any]) -> None:
    templates = _template_map()
    question_ids: set[str] = set()
    template_ids: list[str] = []
    for question in clarification["questions"]:
        question_id = question["question_id"]
        if question_id in question_ids:
            raise DecisionContractError("duplicate question_id")
        question_ids.add(question_id)
        template = templates.get(question["template_id"])
        if template is None:
            raise DecisionContractError("unregistered clarification template")
        template_ids.append(question["template_id"])
        for field in ("field_id", "response_type"):
            if question[field] != template[field]:
                raise DecisionContractError(
                    f"clarification {field} does not match template"
                )
    expected = {REASON_TEMPLATES[reason] for reason in clarification["reason_codes"]}
    if len(template_ids) != len(set(template_ids)) or set(template_ids) != expected:
        raise DecisionContractError("clarification reason codes do not match templates")


def validate_clarification_request(value: Any) -> dict[str, Any]:
    """Validate ClarificationRequest shape, templates, and fingerprint."""
    clarification = _validate_schema(value, "clarification-request-v1")
    _validate_questions(clarification)
    expected = CONTRACTS.sha256_json(
        clarification,
        "clarification_fingerprint",
    )
    if clarification["clarification_fingerprint"] != expected:
        raise DecisionContractError("clarification_fingerprint mismatch")
    return clarification
