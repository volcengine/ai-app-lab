from __future__ import annotations

import copy
from typing import Any

import pytest

import router_test_support as support


EXPECTED_TEMPLATES = {
    "request_research_object": ("research_object", "text"),
    "request_input_artifact": ("input_artifact", "file_reference"),
    "request_route_file": ("route_input", "file_reference"),
    "request_reaction_file": ("reaction_input", "file_reference"),
    "choose_calculation_view": ("calculation_view", "controlled_choice"),
    "choose_search_strategy": ("search_strategy", "controlled_choice"),
    "resolve_reaction_molecule_ambiguity": (
        "chemical_object_type",
        "controlled_choice",
    ),
    "choose_direct_or_evidence_workflow": (
        "workflow_scope",
        "controlled_choice",
    ),
}


def load_decisions() -> Any:
    return support.load_router_module(
        "router_decision_contracts_under_test",
        "decision_contracts.py",
    )


def resign_decision(value: dict[str, Any]) -> dict[str, Any]:
    value["decision_fingerprint"] = support.sha256_json(
        value,
        "decision_fingerprint",
    )
    return value


def valid_route_decision() -> dict[str, Any]:
    return resign_decision(
        {
            "schema_version": "1.0.0",
            "decision_id": "decision-test-001",
            "intent_id": "intent-test-001",
            "intent_fingerprint": support.SHA256_A,
            "catalog_fingerprint": support.SHA256_B,
            "policy_fingerprint": support.SHA256_C,
            "decision_status": "ready",
            "route_type": "workflow_a",
            "targets": ["compound-evidence-v1"],
            "required_inputs": ["compound_query"],
            "missing_inputs": [],
            "applied_defaults": [],
            "execution_mode": "auto_execute",
            "execution_authorized": True,
            "confirmation_reasons": [],
            "policy_findings": [],
            "decision_fingerprint": "",
        }
    )


def resign_clarification(value: dict[str, Any]) -> dict[str, Any]:
    value["clarification_fingerprint"] = support.sha256_json(
        value,
        "clarification_fingerprint",
    )
    return value


def valid_clarification_request() -> dict[str, Any]:
    return resign_clarification(
        {
            "schema_version": "1.0.0",
            "clarification_id": "clarification-test-001",
            "intent_id": "intent-test-001",
            "intent_fingerprint": support.SHA256_A,
            "reason_codes": ["missing_route_input"],
            "questions": [
                {
                    "question_id": "q-001",
                    "field_id": "route_input",
                    "template_id": "request_route_file",
                    "response_type": "file_reference",
                }
            ],
            "status": "awaiting_user",
            "clarification_fingerprint": "",
        }
    )


def test_valid_route_decision_passes() -> None:
    decisions = load_decisions()
    value = valid_route_decision()

    assert decisions.validate_route_decision(value) == value


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("command", ["python", "unsafe.py"]),
        ("entrypoint", "scripts/unsafe.py"),
        ("url", "https://example.invalid"),
        ("api_key", "secret"),
    ],
)
def test_route_decision_rejects_execution_material(
    field: str,
    value: Any,
) -> None:
    decisions = load_decisions()
    decision = valid_route_decision()
    decision[field] = value
    resign_decision(decision)

    with pytest.raises(decisions.DecisionContractError, match=field):
        decisions.validate_route_decision(decision)


@pytest.mark.parametrize(
    ("execution_mode", "execution_authorized"),
    [
        ("auto_execute", False),
        ("confirmation_required", True),
        ("manual_target_required", True),
        ("not_executable", True),
    ],
)
def test_execution_mode_controls_authorization(
    execution_mode: str,
    execution_authorized: bool,
) -> None:
    decisions = load_decisions()
    decision = valid_route_decision()
    decision["execution_mode"] = execution_mode
    decision["execution_authorized"] = execution_authorized
    resign_decision(decision)

    with pytest.raises(
        decisions.DecisionContractError,
        match="execution_authorized",
    ):
        decisions.validate_route_decision(decision)


@pytest.mark.parametrize(
    ("updates", "error_field"),
    [
        ({"targets": []}, "targets"),
        (
            {
                "route_type": "clarification_required",
                "decision_status": "clarification_required",
                "targets": [],
                "execution_mode": "auto_execute",
                "execution_authorized": True,
            },
            "execution_mode",
        ),
        (
            {
                "route_type": "unsupported",
                "decision_status": "ready",
                "targets": [],
                "execution_mode": "not_executable",
                "execution_authorized": False,
            },
            "decision_status",
        ),
    ],
)
def test_route_type_controls_status_targets_and_execution(
    updates: dict[str, Any],
    error_field: str,
) -> None:
    decisions = load_decisions()
    decision = valid_route_decision()
    decision.update(updates)
    resign_decision(decision)

    with pytest.raises(decisions.DecisionContractError, match=error_field):
        decisions.validate_route_decision(decision)


def test_route_decision_rejects_unregistered_target() -> None:
    decisions = load_decisions()
    decision = valid_route_decision()
    decision["targets"] = ["https://example.invalid/unsafe"]
    resign_decision(decision)

    with pytest.raises(decisions.DecisionContractError, match="targets"):
        decisions.validate_route_decision(decision)


def test_route_decision_rejects_fingerprint_tamper() -> None:
    decisions = load_decisions()
    decision = valid_route_decision()
    decision["required_inputs"] = ["route_input"]

    with pytest.raises(decisions.DecisionContractError, match="fingerprint"):
        decisions.validate_route_decision(decision)


def test_route_decision_rejects_unregistered_catalog_default() -> None:
    decisions = load_decisions()
    decision = valid_route_decision()
    decision["applied_defaults"] = [
        {
            "field_id": "unsafe_default",
            "value": "unsafe",
            "provenance": "catalog_default",
        }
    ]
    resign_decision(decision)

    with pytest.raises(decisions.DecisionContractError, match="field_id"):
        decisions.validate_route_decision(decision)


def test_clarification_catalog_has_exact_registered_templates() -> None:
    decisions = load_decisions()
    catalog = decisions.load_clarification_templates()

    assert {
        item["template_id"]: (item["field_id"], item["response_type"])
        for item in catalog["templates"]
    } == EXPECTED_TEMPLATES


def test_valid_clarification_request_passes() -> None:
    decisions = load_decisions()
    value = valid_clarification_request()

    assert decisions.validate_clarification_request(value) == value


def test_clarification_question_uses_registered_template() -> None:
    decisions = load_decisions()
    request = valid_clarification_request()
    request["questions"][0]["template_id"] = "free-form-agent-question"
    resign_clarification(request)

    with pytest.raises(decisions.DecisionContractError, match="template"):
        decisions.validate_clarification_request(request)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("field_id", "reaction_input"),
        ("response_type", "text"),
    ],
)
def test_clarification_question_matches_template_contract(
    field: str,
    value: str,
) -> None:
    decisions = load_decisions()
    request = valid_clarification_request()
    request["questions"][0][field] = value
    resign_clarification(request)

    with pytest.raises(decisions.DecisionContractError, match=field):
        decisions.validate_clarification_request(request)


def test_clarification_reason_matches_question_template() -> None:
    decisions = load_decisions()
    request = valid_clarification_request()
    request["questions"][0] = {
        "question_id": "q-001",
        "field_id": "reaction_input",
        "template_id": "request_reaction_file",
        "response_type": "file_reference",
    }
    resign_clarification(request)

    with pytest.raises(decisions.DecisionContractError, match="reason.*template"):
        decisions.validate_clarification_request(request)


def test_clarification_rejects_unknown_question_field() -> None:
    decisions = load_decisions()
    request = valid_clarification_request()
    request["questions"][0]["prompt"] = "Upload the route"
    resign_clarification(request)

    with pytest.raises(decisions.DecisionContractError, match="prompt"):
        decisions.validate_clarification_request(request)


def test_clarification_rejects_duplicate_question_ids() -> None:
    decisions = load_decisions()
    request = valid_clarification_request()
    request["questions"].append(
        {
            "question_id": "q-001",
            "field_id": "reaction_input",
            "template_id": "request_reaction_file",
            "response_type": "file_reference",
        }
    )
    resign_clarification(request)

    with pytest.raises(decisions.DecisionContractError, match="duplicate question_id"):
        decisions.validate_clarification_request(request)


def test_clarification_rejects_fingerprint_tamper() -> None:
    decisions = load_decisions()
    request = valid_clarification_request()
    request["intent_fingerprint"] = support.SHA256_B

    with pytest.raises(decisions.DecisionContractError, match="fingerprint"):
        decisions.validate_clarification_request(request)


def test_validators_do_not_mutate_inputs() -> None:
    decisions = load_decisions()
    decision = valid_route_decision()
    clarification = valid_clarification_request()
    before_decision = copy.deepcopy(decision)
    before_clarification = copy.deepcopy(clarification)

    decisions.validate_route_decision(decision)
    decisions.validate_clarification_request(clarification)

    assert decision == before_decision
    assert clarification == before_clarification
