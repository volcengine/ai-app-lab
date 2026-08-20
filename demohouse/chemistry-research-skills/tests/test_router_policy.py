from __future__ import annotations

import copy
from typing import Any

import router_test_support as support


def load_policy() -> Any:
    return support.load_router_module(
        "router_policy_under_test",
        "policy_guard.py",
    )


def load_catalog_module() -> Any:
    return support.load_router_module(
        "router_policy_catalog",
        "route_catalog.py",
    )


def catalog() -> dict[str, Any]:
    return load_catalog_module().load_route_catalog(support.REPOSITORY_ROOT)


def align_catalog(intent: dict[str, Any], value: dict[str, Any]) -> None:
    intent["recognizer"]["catalog_fingerprint"] = value["catalog_fingerprint"]
    support.resign(intent)


def verified_certificate(
    intent: dict[str, Any],
    value: dict[str, Any],
) -> dict[str, Any]:
    return {
        "status": "verified_auto",
        "host_id": intent["recognizer"]["host_id"],
        "host_version": intent["recognizer"]["host_version"],
        "model_id": intent["recognizer"]["model_id"],
        "model_mode": intent["recognizer"]["model_mode"],
        "router_skill_fingerprint": intent["recognizer"]["router_skill_fingerprint"],
        "catalog_fingerprint": value["catalog_fingerprint"],
        "schema_fingerprint": intent["recognizer"]["schema_fingerprint"],
        "bundle_integrity": True,
    }


def reaction_library_intent() -> dict[str, Any]:
    source = "比较 aspirin reaction fingerprint profile"
    intent = support.valid_intent(source)
    intent["goal"] = {
        "goal_type": "search_or_curate_library",
        "chain_requirement": "single_operation",
        "source_refs": ["span-001"],
    }
    intent["research_objects"] = [
        {
            "object_id": "object-001",
            "object_type": "reaction_query",
            "representation": "reaction fingerprint profile",
            "source_refs": ["span-001"],
        }
    ]
    intent["requested_operations"] = [
        {
            "operation_id": "operation-001",
            "operation_type": "compute_fingerprint",
            "sequence": 1,
            "negated": False,
            "source_refs": ["span-001"],
        }
    ]
    intent["candidate_targets"] = ["search-and-curate-chemical-libraries"]
    return support.resign(intent)


def name_to_features_intent() -> dict[str, Any]:
    intent = support.valid_intent()
    intent["goal"] = {
        "goal_type": "compute_molecular_features",
        "chain_requirement": "explicit_bounded_chain",
        "source_refs": ["span-001"],
    }
    intent["requested_operations"] = [
        {
            "operation_id": "operation-001",
            "operation_type": "standardize_structure",
            "sequence": 1,
            "negated": False,
            "source_refs": ["span-001"],
        },
        {
            "operation_id": "operation-002",
            "operation_type": "compute_fingerprint",
            "sequence": 2,
            "negated": False,
            "source_refs": ["span-001"],
        },
    ]
    intent["candidate_targets"] = ["structure-features-v1"]
    return support.resign(intent)


def offline_structure_intent() -> dict[str, Any]:
    intent = support.valid_intent()
    intent["goal"] = {
        "goal_type": "standardize_structure",
        "chain_requirement": "single_operation",
        "source_refs": ["span-001"],
    }
    intent["research_objects"][0]["object_type"] = "chemical_structure"
    intent["research_objects"][0]["representation"] = "CC(=O)OC1=CC=CC=C1C(=O)O"
    intent["requested_operations"] = [
        {
            "operation_id": "operation-001",
            "operation_type": "standardize_structure",
            "sequence": 1,
            "negated": False,
            "source_refs": ["span-001"],
        }
    ]
    intent["candidate_targets"] = ["standardize-chemical-structures"]
    return support.resign(intent)


def test_policy_blocks_reaction_fingerprint_from_molecule_library() -> None:
    policy = load_policy()
    route_catalog = catalog()
    intent = reaction_library_intent()
    align_catalog(intent, route_catalog)

    result = policy.evaluate_policy(
        intent,
        route_catalog,
        verified_certificate(intent, route_catalog),
    )

    assert result.blocked is True
    assert [item.code for item in result.findings] == ["E-REACTION-MOLECULE-CONFLICT"]


def test_policy_blocks_name_to_features_without_identity() -> None:
    policy = load_policy()
    route_catalog = catalog()
    intent = name_to_features_intent()
    align_catalog(intent, route_catalog)

    result = policy.evaluate_policy(
        intent,
        route_catalog,
        verified_certificate(intent, route_catalog),
    )

    assert result.blocked is True
    assert "E-MISSING-PREREQUISITE" in {item.code for item in result.findings}


def test_policy_blocks_agent_inferred_scientific_parameter() -> None:
    policy = load_policy()
    route_catalog = catalog()
    source = "查找 aspirin 的相似分子，阈值 0.7"
    intent = support.valid_library_intent(source)
    align_catalog(intent, route_catalog)
    intent["user_parameters"][0]["provenance"] = "agent_inferred"

    result = policy.evaluate_policy(
        intent,
        route_catalog,
        verified_certificate(intent, route_catalog),
    )

    assert result.blocked is True
    assert result.findings[0].code == "E-UNDECLARED-PARAMETER"


def test_policy_requires_features_artifact_for_direct_library() -> None:
    policy = load_policy()
    route_catalog = catalog()
    source = "查找 aspirin 的相似分子，阈值 0.7"
    intent = support.valid_library_intent(source)
    align_catalog(intent, route_catalog)

    result = policy.evaluate_policy(
        intent,
        route_catalog,
        verified_certificate(intent, route_catalog),
    )

    assert result.blocked is True
    assert "E-MISSING-PREREQUISITE" in {item.code for item in result.findings}


def test_policy_requires_reaction_and_route_inputs_for_workflow_b() -> None:
    policy = load_policy()
    route_catalog = catalog()
    intent, _ = support.valid_attachment_case()
    align_catalog(intent, route_catalog)

    result = policy.evaluate_policy(
        intent,
        route_catalog,
        verified_certificate(intent, route_catalog),
    )

    assert result.blocked is True
    assert result.findings[0].code == "E-MISSING-PREREQUISITE"
    assert result.findings[0].field_ids == ("reaction_input",)


def test_unsupported_goal_is_not_blocked_policy() -> None:
    policy = load_policy()
    route_catalog = catalog()
    intent = support.valid_intent()
    intent["goal"]["goal_type"] = "unsupported_scientific_goal"
    intent["unsupported_goals"] = ["toxicity_prediction"]
    intent["candidate_targets"] = []
    align_catalog(intent, route_catalog)

    result = policy.evaluate_policy(
        intent,
        route_catalog,
        verified_certificate(intent, route_catalog),
    )

    assert result.blocked is False
    assert [item.code for item in result.findings] == ["E-UNSAFE-CAPABILITY"]


def test_unverified_host_requires_manual_mode_but_is_not_blocked() -> None:
    policy = load_policy()
    route_catalog = catalog()
    intent = offline_structure_intent()
    align_catalog(intent, route_catalog)

    result = policy.evaluate_policy(intent, route_catalog, None)

    assert result.blocked is False
    assert [item.code for item in result.findings] == ["E-HOST-CERTIFICATION"]


def test_catalog_and_schema_drift_block_execution() -> None:
    policy = load_policy()
    route_catalog = catalog()
    intent = offline_structure_intent()
    certificate = verified_certificate(intent, route_catalog)
    certificate["schema_fingerprint"] = support.SHA256_B

    result = policy.evaluate_policy(intent, route_catalog, certificate)

    assert result.blocked is True
    assert [item.code for item in result.findings] == [
        "E-CATALOG-MISMATCH",
        "E-SCHEMA-MISMATCH",
    ]


def test_name_resolution_declares_external_disclosure_without_blocking() -> None:
    policy = load_policy()
    route_catalog = catalog()
    intent = support.valid_intent()
    intent["goal"]["goal_type"] = "resolve_identity"
    intent["goal"]["chain_requirement"] = "single_operation"
    intent["candidate_targets"] = ["resolve-chemical-identities"]
    align_catalog(intent, route_catalog)

    result = policy.evaluate_policy(
        intent,
        route_catalog,
        verified_certificate(intent, route_catalog),
    )

    assert result.blocked is False
    assert [item.code for item in result.findings] == ["E-EXTERNAL-DISCLOSURE"]


def test_policy_does_not_mutate_intent_catalog_or_certificate() -> None:
    policy = load_policy()
    route_catalog = catalog()
    intent = name_to_features_intent()
    align_catalog(intent, route_catalog)
    certificate = verified_certificate(intent, route_catalog)
    before = (
        copy.deepcopy(intent),
        copy.deepcopy(route_catalog),
        copy.deepcopy(certificate),
    )

    policy.evaluate_policy(intent, route_catalog, certificate)

    assert intent == before[0]
    assert route_catalog == before[1]
    assert certificate == before[2]
