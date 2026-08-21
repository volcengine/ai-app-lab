from __future__ import annotations

import copy
import hashlib
import importlib.util
import os
import sys
from pathlib import Path
from typing import Any

import pytest

import router_test_support as support
import test_route_engine as route_support


def load_builder() -> Any:
    return support.load_router_module(
        "router_request_builders_under_test",
        "request_builders.py",
    )


def load_request_contracts() -> Any:
    return support.load_router_module(
        "router_request_contracts_under_test",
        "request_contracts.py",
    )


def load_workflow_module(name: str, filename: str) -> Any:
    path = support.REPOSITORY_ROOT / "workflows" / "scripts" / filename
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


WORKFLOW_A = load_workflow_module(
    "router_builder_workflow_a",
    "workflow_a_request.py",
)
WORKFLOW_B = load_workflow_module(
    "router_builder_workflow_b",
    "workflow_b_request.py",
)


def route(
    intent: dict[str, Any],
    route_catalog: dict[str, Any],
) -> dict[str, Any]:
    route_support.align_catalog(intent, route_catalog)
    certificate = route_support.verified_certificate(intent, route_catalog)
    policy = route_support.load_policy().evaluate_policy(
        intent,
        route_catalog,
        certificate,
    )
    return route_support.load_engine().route_intent(
        intent,
        route_catalog,
        policy,
        certificate,
    )


def structure_compound_evidence_intent() -> dict[str, Any]:
    intent = route_support.compound_evidence_intent()
    intent["research_objects"][0]["object_type"] = "chemical_structure"
    intent["research_objects"][0]["representation"] = "CC(=O)OC1=CC=CC=C1C(=O)O"
    return support.resign(intent)


def similarity_compound_evidence_intent() -> dict[str, Any]:
    intent = structure_compound_evidence_intent()
    intent["requested_operations"].append(
        route_support.operation(
            "operation-004",
            "search_similarity",
            4,
        )
    )
    return support.resign(intent)


def substructure_inchi_evidence_intent() -> dict[str, Any]:
    intent = structure_compound_evidence_intent()
    intent["research_objects"][0]["representation"] = (
        "InChI=1S/C2H6O/c1-2-3/h3H,2H2,1H3"
    )
    intent["requested_operations"].append(
        route_support.operation(
            "operation-004",
            "search_substructure",
            4,
        )
    )
    return support.resign(intent)


def add_user_parameter(
    intent: dict[str, Any],
    field_id: str,
    value: Any,
) -> None:
    position = len(intent["user_parameters"]) + 1
    intent["user_parameters"].append(
        {
            "parameter_id": f"parameter-{position:03d}",
            "field_id": field_id,
            "value": value,
            "provenance": "user_explicit",
            "source_refs": ["span-001"],
        }
    )
    support.resign(intent)


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def stage_workflow_b_inputs(
    tmp_path: Path,
) -> tuple[dict[str, Any], Path]:
    staging_root = tmp_path / "stage"
    staging_root.mkdir()
    reaction = staging_root / "reaction.json"
    route = staging_root / "route.json"
    reaction.write_text('{"records":[]}', encoding="utf-8")
    route.write_text('{"routes":[]}', encoding="utf-8")
    intent = route_support.route_evidence_intent()
    intent["input_artifacts"] = [
        {
            "artifact_ref": "reaction.json",
            "role": "reaction_input",
            "media_type": "application/json",
            "sha256": sha256_file(reaction),
            "source_refs": ["attachment-ref-001"],
        },
        {
            "artifact_ref": "route.json",
            "role": "route_input",
            "media_type": "application/json",
            "sha256": sha256_file(route),
            "source_refs": ["attachment-ref-001"],
        },
    ]
    return support.resign(intent), staging_root


def test_builder_records_every_parameter_source(tmp_path: Path) -> None:
    builder = load_builder()
    route_catalog = route_support.catalog()
    intent = structure_compound_evidence_intent()
    decision = route(intent, route_catalog)

    request = builder.build_execution_request(
        intent,
        decision,
        route_catalog,
        tmp_path,
    )

    assert {item["provenance"] for item in request["parameter_bindings"]} <= {
        "user_explicit",
        "validated_attachment",
        "catalog_default",
        "human_decision",
        "derived_integrity_value",
    }
    assert request["target_request"]["execution_policy"] == {
        "network_mode": "offline",
        "external_retry": "manual",
    }
    assert load_request_contracts().validate_execution_request(request) == request


def test_workflow_a_builder_output_passes_existing_validator(
    tmp_path: Path,
) -> None:
    builder = load_builder()
    route_catalog = route_support.catalog()
    intent = structure_compound_evidence_intent()
    decision = route(intent, route_catalog)

    request = builder.build_execution_request(
        intent,
        decision,
        route_catalog,
        tmp_path,
    )["target_request"]

    assert WORKFLOW_A.validate_workflow_a_request(request) == request


def test_name_input_builds_public_identity_request_requiring_confirmation(
    tmp_path: Path,
) -> None:
    builder = load_builder()
    route_catalog = route_support.catalog()
    intent = route_support.compound_evidence_intent()
    decision = route(intent, route_catalog)

    built = builder.build_execution_request(
        intent,
        decision,
        route_catalog,
        tmp_path,
    )

    assert built["target_request"]["inputs"]["identity"]["sources"] == [
        "opsin",
        "pubchem",
        "chembl",
        "unichem",
    ]
    assert built["target_request"]["execution_policy"]["network_mode"] == (
        "public_http"
    )
    assert "external_data_disclosure" in built["risk_reasons"]


def test_explicit_structure_builds_offline_identity_request(
    tmp_path: Path,
) -> None:
    builder = load_builder()
    route_catalog = route_support.catalog()
    intent = structure_compound_evidence_intent()
    decision = route(intent, route_catalog)

    built = builder.build_execution_request(
        intent,
        decision,
        route_catalog,
        tmp_path,
    )

    assert built["target_request"]["inputs"]["identity"]["sources"] == []
    assert built["target_request"]["execution_policy"]["network_mode"] == "offline"
    assert built["risk_reasons"] == []


def test_workflow_a_preserves_requested_similarity_operation(
    tmp_path: Path,
) -> None:
    builder = load_builder()
    route_catalog = route_support.catalog()
    intent = similarity_compound_evidence_intent()
    decision = route(intent, route_catalog)

    target_request = builder.build_execution_request(
        intent,
        decision,
        route_catalog,
        tmp_path,
    )["target_request"]

    assert target_request["inputs"]["library_operation"] == {
        "operation": "similarity_search",
        "options": {
            "calculation_view": "standardized",
            "include_review_required": False,
            "fingerprint_profile_id": ("rdkit-morgan-r2-2048-chiral1-bit-v1"),
            "metric": "tanimoto",
            "include_self": False,
            "top_k": 20,
        },
        "queries": [{"id": "object-001", "record_index": 0}],
    }


def test_workflow_a_rejects_inchi_as_substructure_smiles(
    tmp_path: Path,
) -> None:
    builder = load_builder()
    route_catalog = route_support.catalog()
    intent = substructure_inchi_evidence_intent()
    decision = route(intent, route_catalog)

    with pytest.raises(builder.RequestBuilderError, match="SMILES"):
        builder.build_execution_request(
            intent,
            decision,
            route_catalog,
            tmp_path,
        )


def test_workflow_b_builder_output_passes_existing_validator(
    tmp_path: Path,
) -> None:
    builder = load_builder()
    route_catalog = route_support.catalog()
    intent, staging_root = stage_workflow_b_inputs(tmp_path)
    decision = route(intent, route_catalog)

    request = builder.build_execution_request(
        intent,
        decision,
        route_catalog,
        staging_root,
    )["target_request"]

    assert WORKFLOW_B.validate_workflow_b_request(request) == request


def test_workflow_b_maps_explicit_similarity_parameters(
    tmp_path: Path,
) -> None:
    builder = load_builder()
    route_catalog = route_support.catalog()
    intent, staging_root = stage_workflow_b_inputs(tmp_path)
    add_user_parameter(
        intent,
        "fingerprint_profile_id",
        "rdkit-difference-atompair-v1",
    )
    add_user_parameter(intent, "similarity_threshold", 0.75)
    decision = route(intent, route_catalog)

    strategy = builder.build_execution_request(
        intent,
        decision,
        route_catalog,
        staging_root,
    )["target_request"]["inputs"]["search_strategy"]

    assert strategy["operation"] == "search_similar_reactions"
    assert strategy["fingerprint_profile_id"] == ("rdkit-difference-atompair-v1")
    assert strategy["threshold"] == 0.75


@pytest.mark.parametrize(
    ("field_id", "value"),
    [
        ("route_constraints", ["max_steps"]),
        ("inventory_snapshot", "inventory-001"),
    ],
)
def test_workflow_b_rejects_unmapped_user_parameter(
    tmp_path: Path,
    field_id: str,
    value: Any,
) -> None:
    builder = load_builder()
    route_catalog = route_support.catalog()
    intent, staging_root = stage_workflow_b_inputs(tmp_path)
    add_user_parameter(intent, field_id, value)
    decision = route(intent, route_catalog)

    with pytest.raises(builder.RequestBuilderError, match=field_id):
        builder.build_execution_request(
            intent,
            decision,
            route_catalog,
            staging_root,
        )


def test_workflow_b_rejects_staged_hash_tamper(tmp_path: Path) -> None:
    builder = load_builder()
    route_catalog = route_support.catalog()
    intent, staging_root = stage_workflow_b_inputs(tmp_path)
    decision = route(intent, route_catalog)
    (staging_root / "reaction.json").write_text("tampered", encoding="utf-8")

    with pytest.raises(builder.RequestBuilderError, match="hash"):
        builder.build_execution_request(
            intent,
            decision,
            route_catalog,
            staging_root,
        )


@pytest.mark.parametrize("unsafe_kind", ["symlink", "hardlink"])
def test_workflow_b_rejects_unsafe_staged_files(
    tmp_path: Path,
    unsafe_kind: str,
) -> None:
    builder = load_builder()
    route_catalog = route_support.catalog()
    intent, staging_root = stage_workflow_b_inputs(tmp_path)
    original = staging_root / "reaction.json"
    unsafe = staging_root / "unsafe-reaction.json"
    if unsafe_kind == "symlink":
        unsafe.symlink_to(original.name)
    else:
        os.link(original, unsafe)
    intent["input_artifacts"][0]["artifact_ref"] = unsafe.name
    intent["input_artifacts"][0]["sha256"] = sha256_file(unsafe)
    support.resign(intent)
    decision = route(intent, route_catalog)

    with pytest.raises(builder.RequestBuilderError, match=unsafe_kind):
        builder.build_execution_request(
            intent,
            decision,
            route_catalog,
            staging_root,
        )


@pytest.mark.parametrize(
    ("intent_factory", "target_type"),
    [
        (route_support.standardize_intent, "direct_skill"),
        (route_support.resolve_then_standardize_intent, "direct_skill_chain"),
    ],
)
def test_direct_and_chain_requests_have_controlled_envelopes(
    intent_factory: Any,
    target_type: str,
    tmp_path: Path,
) -> None:
    builder = load_builder()
    route_catalog = route_support.catalog()
    intent = intent_factory()
    decision = route(intent, route_catalog)

    request = builder.build_execution_request(
        intent,
        decision,
        route_catalog,
        tmp_path,
    )

    assert request["target_type"] == target_type
    assert set(request["target_request"]) == {
        "schema_version",
        "request_id",
        "target_id",
        "inputs",
        "parameters",
        "execution_policy",
    }
    assert not {
        "command",
        "entrypoint",
        "validator",
        "url",
        "api_key",
    } & set(request["target_request"])


def test_name_chain_network_parameter_matches_execution_policy(
    tmp_path: Path,
) -> None:
    builder = load_builder()
    route_catalog = route_support.catalog()
    intent = route_support.resolve_then_standardize_intent()
    decision = route(intent, route_catalog)

    target_request = builder.build_execution_request(
        intent,
        decision,
        route_catalog,
        tmp_path,
    )["target_request"]
    parameters = {
        item["field_id"]: item["value"] for item in target_request["parameters"]
    }

    assert target_request["execution_policy"]["network_mode"] == "public_http"
    assert parameters["network_mode"] == "public_http"


def test_execution_request_rejects_nested_execution_material(
    tmp_path: Path,
) -> None:
    builder = load_builder()
    contracts = load_request_contracts()
    route_catalog = route_support.catalog()
    intent = route_support.standardize_intent()
    decision = route(intent, route_catalog)
    request = builder.build_execution_request(
        intent,
        decision,
        route_catalog,
        tmp_path,
    )
    tampered = copy.deepcopy(request)
    tampered["target_request"]["command"] = ["python", "unsafe.py"]
    tampered["request_fingerprint"] = support.sha256_json(
        tampered,
        "request_fingerprint",
    )

    with pytest.raises(contracts.RequestContractError, match="target_request"):
        contracts.validate_execution_request(tampered)


def test_execution_request_rejects_fingerprint_tamper(
    tmp_path: Path,
) -> None:
    builder = load_builder()
    contracts = load_request_contracts()
    route_catalog = route_support.catalog()
    intent = route_support.standardize_intent()
    decision = route(intent, route_catalog)
    request = builder.build_execution_request(
        intent,
        decision,
        route_catalog,
        tmp_path,
    )
    request["risk_reasons"] = ["fees_possible"]

    with pytest.raises(contracts.RequestContractError, match="fingerprint"):
        contracts.validate_execution_request(request)


def test_execution_request_rejects_target_artifact_not_in_staged_inputs(
    tmp_path: Path,
) -> None:
    builder = load_builder()
    contracts = load_request_contracts()
    route_catalog = route_support.catalog()
    intent, staging_root = stage_workflow_b_inputs(tmp_path)
    decision = route(intent, route_catalog)
    request = builder.build_execution_request(
        intent,
        decision,
        route_catalog,
        staging_root,
    )
    request["target_request"]["inputs"]["reaction_input"]["path"] = "other.json"
    request["request_fingerprint"] = support.sha256_json(
        request,
        "request_fingerprint",
    )

    with pytest.raises(contracts.RequestContractError, match="staged"):
        contracts.validate_execution_request(request)


def test_execution_request_rejects_parameter_provenance_mismatch(
    tmp_path: Path,
) -> None:
    builder = load_builder()
    contracts = load_request_contracts()
    route_catalog = route_support.catalog()
    intent = route_support.standardize_intent()
    decision = route(intent, route_catalog)
    request = builder.build_execution_request(
        intent,
        decision,
        route_catalog,
        tmp_path,
    )
    parameter = next(
        item
        for item in request["target_request"]["parameters"]
        if item["field_id"] == "network_mode"
    )
    parameter["value"] = "public_http"
    request["request_fingerprint"] = support.sha256_json(
        request,
        "request_fingerprint",
    )

    with pytest.raises(contracts.RequestContractError, match="parameter binding"):
        contracts.validate_execution_request(request)


def test_execution_request_requires_external_disclosure_risk(
    tmp_path: Path,
) -> None:
    builder = load_builder()
    contracts = load_request_contracts()
    route_catalog = route_support.catalog()
    intent = route_support.compound_evidence_intent()
    decision = route(intent, route_catalog)
    request = builder.build_execution_request(
        intent,
        decision,
        route_catalog,
        tmp_path,
    )
    request["risk_reasons"] = []
    request["request_fingerprint"] = support.sha256_json(
        request,
        "request_fingerprint",
    )

    with pytest.raises(contracts.RequestContractError, match="disclosure"):
        contracts.validate_execution_request(request)


def test_execution_request_rejects_target_request_shape_mismatch(
    tmp_path: Path,
) -> None:
    builder = load_builder()
    contracts = load_request_contracts()
    route_catalog = route_support.catalog()
    direct_intent = route_support.standardize_intent()
    direct_decision = route(direct_intent, route_catalog)
    request = builder.build_execution_request(
        direct_intent,
        direct_decision,
        route_catalog,
        tmp_path,
    )
    workflow_intent = structure_compound_evidence_intent()
    workflow_decision = route(workflow_intent, route_catalog)
    request["target_request"] = builder.build_workflow_a_request(
        workflow_intent,
        workflow_decision,
        route_catalog,
    )
    request["target_request"]["request_id"] = request["request_id"]
    request["request_fingerprint"] = support.sha256_json(
        request,
        "request_fingerprint",
    )

    with pytest.raises(contracts.RequestContractError, match="target_request"):
        contracts.validate_execution_request(request)


def test_builder_rejects_decision_binding_mismatch(tmp_path: Path) -> None:
    builder = load_builder()
    route_catalog = route_support.catalog()
    intent = route_support.standardize_intent()
    decision = route(intent, route_catalog)
    decision["intent_fingerprint"] = "0" * 64

    with pytest.raises(builder.RequestBuilderError, match="decision"):
        builder.build_execution_request(
            intent,
            decision,
            route_catalog,
            tmp_path,
        )
