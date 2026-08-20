from __future__ import annotations

import copy
import inspect
import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Callable

import pytest

import router_test_support as support


def load_engine() -> Any:
    return support.load_router_module(
        "router_engine_under_test",
        "route_engine.py",
    )


def load_policy() -> Any:
    return support.load_router_module(
        "router_engine_policy",
        "policy_guard.py",
    )


def load_catalog_module() -> Any:
    return support.load_router_module(
        "router_engine_catalog",
        "route_catalog.py",
    )


def load_decisions() -> Any:
    return support.load_router_module(
        "router_engine_decisions",
        "decision_contracts.py",
    )


def catalog() -> dict[str, Any]:
    return load_catalog_module().load_route_catalog(support.REPOSITORY_ROOT)


def align_catalog(intent: dict[str, Any], route_catalog: dict[str, Any]) -> None:
    intent["recognizer"]["catalog_fingerprint"] = route_catalog["catalog_fingerprint"]
    support.resign(intent)


def verified_certificate(
    intent: dict[str, Any],
    route_catalog: dict[str, Any],
) -> dict[str, Any]:
    return {
        "status": "verified_auto",
        "host_id": intent["recognizer"]["host_id"],
        "host_version": intent["recognizer"]["host_version"],
        "model_id": intent["recognizer"]["model_id"],
        "model_mode": intent["recognizer"]["model_mode"],
        "router_skill_fingerprint": intent["recognizer"]["router_skill_fingerprint"],
        "catalog_fingerprint": route_catalog["catalog_fingerprint"],
        "schema_fingerprint": intent["recognizer"]["schema_fingerprint"],
        "bundle_integrity": True,
    }


def operation(
    operation_id: str,
    operation_type: str,
    sequence: int,
) -> dict[str, Any]:
    return {
        "operation_id": operation_id,
        "operation_type": operation_type,
        "sequence": sequence,
        "negated": False,
        "source_refs": ["span-001"],
    }


def standardize_intent() -> dict[str, Any]:
    intent = support.valid_intent()
    intent["goal"] = {
        "goal_type": "standardize_structure",
        "chain_requirement": "single_operation",
        "source_refs": ["span-001"],
    }
    intent["research_objects"][0]["object_type"] = "chemical_structure"
    intent["research_objects"][0]["representation"] = "CC(=O)OC1=CC=CC=C1C(=O)O"
    intent["requested_operations"] = [
        operation("operation-001", "standardize_structure", 1)
    ]
    intent["candidate_targets"] = ["standardize-chemical-structures"]
    return support.resign(intent)


def resolve_then_standardize_intent() -> dict[str, Any]:
    intent = support.valid_intent()
    intent["goal"] = {
        "goal_type": "standardize_structure",
        "chain_requirement": "explicit_bounded_chain",
        "source_refs": ["span-001"],
    }
    intent["requested_operations"] = [
        operation("operation-001", "resolve_identity", 1),
        operation("operation-002", "standardize_structure", 2),
    ]
    intent["candidate_targets"] = ["identity-standardization-v1"]
    return support.resign(intent)


def compound_evidence_intent() -> dict[str, Any]:
    intent = support.valid_intent()
    intent["requested_operations"] = [
        operation("operation-001", "resolve_identity", 1),
        operation("operation-002", "standardize_structure", 2),
        operation("operation-003", "compute_fingerprint", 3),
    ]
    return support.resign(intent)


def route_evidence_intent() -> dict[str, Any]:
    intent, _ = support.valid_attachment_case()
    intent["input_artifacts"].append(
        {
            "artifact_ref": "attachment-001",
            "role": "reaction_input",
            "media_type": "application/json",
            "sha256": support.SHA256_A,
            "source_refs": ["attachment-ref-001"],
        }
    )
    intent["requested_operations"] = [
        operation("operation-001", "curate_reaction", 1),
        operation("operation-002", "search_reaction_precedent", 2),
        operation("operation-003", "review_existing_routes", 3),
    ]
    return support.resign(intent)


def ambiguous_intent() -> dict[str, Any]:
    intent = standardize_intent()
    intent["ambiguities"] = ["ambiguous_direct_vs_workflow"]
    return support.resign(intent)


def toxicity_intent() -> dict[str, Any]:
    intent = support.valid_intent()
    intent["goal"]["goal_type"] = "unsupported_scientific_goal"
    intent["unsupported_goals"] = ["toxicity_prediction"]
    intent["candidate_targets"] = []
    return support.resign(intent)


def reaction_search_intent() -> dict[str, Any]:
    intent = support.valid_intent("查找 aspirin reaction fingerprint profile")
    intent["goal"] = {
        "goal_type": "search_reaction_precedent",
        "chain_requirement": "single_operation",
        "source_refs": ["span-001"],
    }
    intent["research_objects"][0]["object_type"] = "reaction_query"
    intent["research_objects"][0]["representation"] = "reaction fingerprint profile"
    intent["requested_operations"] = [
        operation("operation-001", "search_reaction_precedent", 1)
    ]
    intent["candidate_targets"] = ["search-reactions"]
    return support.resign(intent)


def structure_library_intent() -> dict[str, Any]:
    intent = standardize_intent()
    intent["goal"] = {
        "goal_type": "search_or_curate_library",
        "chain_requirement": "explicit_bounded_chain",
        "source_refs": ["span-001"],
    }
    intent["requested_operations"] = [
        operation("operation-001", "standardize_structure", 1),
        operation("operation-002", "compute_fingerprint", 2),
        operation("operation-003", "search_substructure", 3),
    ]
    intent["candidate_targets"] = ["structure-library-v1"]
    return support.resign(intent)


@pytest.mark.parametrize(
    ("intent_factory", "route_type", "targets"),
    [
        (
            standardize_intent,
            "direct_skill",
            ["standardize-chemical-structures"],
        ),
        (
            resolve_then_standardize_intent,
            "direct_skill_chain",
            ["identity-standardization-v1"],
        ),
        (
            compound_evidence_intent,
            "workflow_a",
            ["compound-evidence-v1"],
        ),
        (
            route_evidence_intent,
            "workflow_b",
            ["route-evidence-review-v1"],
        ),
        (ambiguous_intent, "clarification_required", []),
        (toxicity_intent, "unsupported", []),
    ],
)
def test_router_returns_one_controlled_route(
    intent_factory: Callable[[], dict[str, Any]],
    route_type: str,
    targets: list[str],
) -> None:
    engine = load_engine()
    policy_module = load_policy()
    route_catalog = catalog()
    intent = intent_factory()
    align_catalog(intent, route_catalog)
    certificate = verified_certificate(intent, route_catalog)
    policy = policy_module.evaluate_policy(intent, route_catalog, certificate)

    decision = engine.route_intent(
        intent,
        route_catalog,
        policy,
        certificate,
    )

    assert decision["route_type"] == route_type
    assert decision["targets"] == targets
    load_decisions().validate_route_decision(decision)


@pytest.mark.parametrize(
    ("intent_factory", "route_type", "targets"),
    [
        (reaction_search_intent, "direct_skill", ["search-reactions"]),
        (compound_evidence_intent, "workflow_a", ["compound-evidence-v1"]),
        (
            route_evidence_intent,
            "workflow_b",
            ["route-evidence-review-v1"],
        ),
        (
            structure_library_intent,
            "direct_skill_chain",
            ["structure-library-v1"],
        ),
    ],
)
def test_router_preserves_key_gold_migrations(
    intent_factory: Callable[[], dict[str, Any]],
    route_type: str,
    targets: list[str],
) -> None:
    engine = load_engine()
    policy_module = load_policy()
    route_catalog = catalog()
    intent = intent_factory()
    align_catalog(intent, route_catalog)
    certificate = verified_certificate(intent, route_catalog)
    policy = policy_module.evaluate_policy(intent, route_catalog, certificate)

    decision = engine.route_intent(intent, route_catalog, policy, certificate)

    assert (decision["route_type"], decision["targets"]) == (route_type, targets)


def test_router_result_is_deterministic_and_does_not_read_source_text() -> None:
    engine = load_engine()
    policy_module = load_policy()
    route_catalog = catalog()
    intent = compound_evidence_intent()
    align_catalog(intent, route_catalog)
    certificate = verified_certificate(intent, route_catalog)
    policy = policy_module.evaluate_policy(intent, route_catalog, certificate)

    first = engine.route_intent(intent, route_catalog, policy, certificate)
    second = engine.route_intent(
        copy.deepcopy(intent),
        copy.deepcopy(route_catalog),
        policy,
        copy.deepcopy(certificate),
    )

    assert "source_text" not in inspect.signature(engine.route_intent).parameters
    assert first == second


def test_unverified_host_gets_manual_target_mode() -> None:
    engine = load_engine()
    policy_module = load_policy()
    route_catalog = catalog()
    intent = standardize_intent()
    align_catalog(intent, route_catalog)
    policy = policy_module.evaluate_policy(intent, route_catalog, None)

    decision = engine.route_intent(intent, route_catalog, policy, None)

    assert decision["route_type"] == "direct_skill"
    assert decision["execution_mode"] == "manual_target_required"
    assert decision["execution_authorized"] is False


def test_external_identity_resolution_requires_confirmation() -> None:
    engine = load_engine()
    policy_module = load_policy()
    route_catalog = catalog()
    intent = support.valid_intent()
    intent["goal"]["goal_type"] = "resolve_identity"
    intent["goal"]["chain_requirement"] = "single_operation"
    intent["requested_operations"] = [operation("operation-001", "resolve_identity", 1)]
    intent["candidate_targets"] = ["resolve-chemical-identities"]
    align_catalog(intent, route_catalog)
    certificate = verified_certificate(intent, route_catalog)
    policy = policy_module.evaluate_policy(intent, route_catalog, certificate)

    decision = engine.route_intent(intent, route_catalog, policy, certificate)

    assert decision["execution_mode"] == "confirmation_required"
    assert decision["confirmation_reasons"] == ["external_data_disclosure"]
    assert decision["execution_authorized"] is False


def test_blocked_policy_never_produces_business_route() -> None:
    engine = load_engine()
    policy_module = load_policy()
    route_catalog = catalog()
    intent = structure_library_intent()
    intent["research_objects"][0]["object_type"] = "reaction_query"
    intent["candidate_targets"] = ["search-and-curate-chemical-libraries"]
    align_catalog(intent, route_catalog)
    certificate = verified_certificate(intent, route_catalog)
    policy = policy_module.evaluate_policy(intent, route_catalog, certificate)
    assert policy.blocked is True

    with pytest.raises(engine.RouteEngineError, match="blocked"):
        engine.route_intent(intent, route_catalog, policy, certificate)


def test_build_clarification_uses_controlled_template() -> None:
    engine = load_engine()
    intent = ambiguous_intent()

    clarification = engine.build_clarification(
        intent,
        ["ambiguous_direct_vs_workflow"],
    )

    assert clarification["questions"][0]["template_id"] == (
        "choose_direct_or_evidence_workflow"
    )
    load_decisions().validate_clarification_request(clarification)


def test_clarification_decision_carries_reason_for_next_user_turn() -> None:
    engine = load_engine()
    policy_module = load_policy()
    route_catalog = catalog()
    intent = ambiguous_intent()
    align_catalog(intent, route_catalog)
    certificate = verified_certificate(intent, route_catalog)
    policy = policy_module.evaluate_policy(intent, route_catalog, certificate)

    decision = engine.route_intent(intent, route_catalog, policy, certificate)
    clarification = engine.build_clarification(intent, decision["missing_inputs"])

    assert decision["missing_inputs"] == ["ambiguous_direct_vs_workflow"]
    assert clarification["questions"][0]["template_id"] == (
        "choose_direct_or_evidence_workflow"
    )


def test_route_intent_cli_writes_valid_decision_without_source_leak(
    tmp_path: Path,
) -> None:
    route_catalog = catalog()
    intent = standardize_intent()
    align_catalog(intent, route_catalog)
    certificate = verified_certificate(intent, route_catalog)
    source_text = "把 aspirin 解析、标准化并计算指纹"
    intent_path = tmp_path / "intent.json"
    source_path = tmp_path / "source.txt"
    attachments_path = tmp_path / "attachments.json"
    certificate_path = tmp_path / "certificate.json"
    output_path = tmp_path / "decision.json"
    for path, value in (
        (intent_path, intent),
        (attachments_path, support.empty_attachments()),
        (certificate_path, certificate),
    ):
        path.write_text(
            json.dumps(value, ensure_ascii=False, sort_keys=True),
            encoding="utf-8",
        )
    source_path.write_text(source_text, encoding="utf-8")

    completed = subprocess.run(
        [
            sys.executable,
            str(support.ROUTER_SCRIPTS / "route_intent.py"),
            "--intent",
            str(intent_path),
            "--source",
            str(source_path),
            "--attachments",
            str(attachments_path),
            "--certificate",
            str(certificate_path),
            "--output",
            str(output_path),
        ],
        cwd=support.REPOSITORY_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr
    decision = json.loads(output_path.read_text(encoding="utf-8"))
    assert decision["targets"] == ["standardize-chemical-structures"]
    load_decisions().validate_route_decision(decision)
    assert source_text not in completed.stdout
    assert source_text not in completed.stderr
