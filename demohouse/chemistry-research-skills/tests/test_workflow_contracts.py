from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_ROOT = REPOSITORY_ROOT / "workflows" / "scripts"


def load_module(name: str, filename: str):
    path = SCRIPTS_ROOT / filename
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


CONTRACTS = load_module("workflow_contracts_test", "workflow_contracts.py")
DEFINITIONS = load_module("workflow_definition_test", "workflow_definition.py")


def common_request() -> dict:
    return {
        "schema_version": "1.0.0",
        "workflow_id": "compound-evidence-v1",
        "request_id": "contract-test-001",
        "inputs": {},
        "execution_policy": {
            "network_mode": "offline",
            "external_retry": "manual",
        },
    }


def test_common_request_rejects_unknown_fields():
    request = common_request()
    request["command"] = ["python", "unsafe.py"]

    with pytest.raises(CONTRACTS.ContractError, match="unknown fields"):
        CONTRACTS.validate_common_request(request)


@pytest.mark.parametrize("field", ["network_mode", "external_retry"])
def test_common_request_rejects_non_string_policy_enum(field):
    request = common_request()
    request["execution_policy"][field] = []

    with pytest.raises(CONTRACTS.ContractError, match=field):
        CONTRACTS.validate_common_request(request)


def test_non_finite_json_is_rejected_before_fingerprinting(tmp_path):
    path = tmp_path / "request.json"
    path.write_text('{"value":NaN}', encoding="utf-8")

    with pytest.raises(CONTRACTS.ContractError, match="non-finite"):
        CONTRACTS.read_json_object(path, "request")
    with pytest.raises(CONTRACTS.ContractError, match="non-finite"):
        CONTRACTS.canonical_json({"value": float("inf")})


def test_json_reader_rejects_duplicate_object_keys(tmp_path):
    path = tmp_path / "request.json"
    path.write_text(
        '{"workflow_id":"compound-evidence-v1",'
        '"workflow_id":"route-evidence-review-v1"}',
        encoding="utf-8",
    )

    with pytest.raises(CONTRACTS.ContractError, match="duplicate"):
        CONTRACTS.read_json_object(path, "request")


def test_definition_fingerprint_detects_tampering():
    definition = DEFINITIONS.load_definition(
        "compound-evidence-v1",
        REPOSITORY_ROOT,
    )
    original = definition["definition_fingerprint"]

    definition["nodes"][0]["handler_id"] = "untrusted-handler"

    assert DEFINITIONS.definition_fingerprint(definition) != original


def test_definition_rejects_unknown_handler_and_cycle():
    definition = DEFINITIONS.load_definition(
        "compound-evidence-v1",
        REPOSITORY_ROOT,
    )
    definition["nodes"][0]["handler_id"] = "untrusted-handler"
    definition["definition_fingerprint"] = DEFINITIONS.definition_fingerprint(
        definition
    )

    with pytest.raises(DEFINITIONS.DefinitionError, match="handler"):
        DEFINITIONS.validate_definition(definition)

    definition = DEFINITIONS.load_definition(
        "compound-evidence-v1",
        REPOSITORY_ROOT,
    )
    definition["nodes"][0]["needs"] = ["validate-workflow"]
    definition["edges"] = [
        [dependency, node["node_id"]]
        for node in definition["nodes"]
        for dependency in node["needs"]
    ]
    definition["definition_fingerprint"] = DEFINITIONS.definition_fingerprint(
        definition
    )

    with pytest.raises(DEFINITIONS.DefinitionError, match="cycle"):
        DEFINITIONS.validate_definition(definition)


def test_definition_rejects_disconnected_root():
    definition = DEFINITIONS.load_definition(
        "compound-evidence-v1",
        REPOSITORY_ROOT,
    )
    definition["nodes"].append(
        {
            "node_id": "disconnected-root",
            "handler_id": "validate-workflow",
            "needs": [],
        }
    )
    definition["definition_fingerprint"] = DEFINITIONS.definition_fingerprint(
        definition
    )

    with pytest.raises(DEFINITIONS.DefinitionError, match="single root"):
        DEFINITIONS.validate_definition(definition)


def test_definition_rejects_non_string_handler():
    definition = DEFINITIONS.load_definition(
        "compound-evidence-v1",
        REPOSITORY_ROOT,
    )
    definition["nodes"][0]["handler_id"] = []
    definition["definition_fingerprint"] = DEFINITIONS.definition_fingerprint(
        definition
    )

    with pytest.raises(DEFINITIONS.DefinitionError, match="handler"):
        DEFINITIONS.validate_definition(definition)


def test_definition_rejects_uncontrolled_gate_policy():
    definition = DEFINITIONS.load_definition(
        "compound-evidence-v1",
        REPOSITORY_ROOT,
    )
    definition["gate_policies"]["identity-gate"]["command"] = "unsafe"
    definition["definition_fingerprint"] = DEFINITIONS.definition_fingerprint(
        definition
    )

    with pytest.raises(DEFINITIONS.DefinitionError, match="gate policy"):
        DEFINITIONS.validate_definition(definition)


def test_definition_rejects_handler_from_other_workflow():
    definition = DEFINITIONS.load_definition(
        "compound-evidence-v1",
        REPOSITORY_ROOT,
    )
    definition["nodes"][0]["handler_id"] = "workflow-b-prepare"
    definition["definition_fingerprint"] = DEFINITIONS.definition_fingerprint(
        definition
    )

    with pytest.raises(DEFINITIONS.DefinitionError, match="workflow"):
        DEFINITIONS.validate_definition(definition)


def test_definition_rejects_condition_on_wrong_handler():
    definition = DEFINITIONS.load_definition(
        "compound-evidence-v1",
        REPOSITORY_ROOT,
    )
    definition["nodes"][0]["condition_id"] = "library-operation-present"
    definition["definition_fingerprint"] = DEFINITIONS.definition_fingerprint(
        definition
    )

    with pytest.raises(DEFINITIONS.DefinitionError, match="condition"):
        DEFINITIONS.validate_definition(definition)


def test_request_path_rejects_absolute_parent_and_symlink(tmp_path):
    for value in ("/private/input.json", "../input.json"):
        with pytest.raises(CONTRACTS.ContractError):
            CONTRACTS.validate_relative_input_path(value)

    target = tmp_path / "target.json"
    target.write_text("{}", encoding="utf-8")
    link = tmp_path / "link.json"
    link.symlink_to(target)

    with pytest.raises(CONTRACTS.ContractError, match="symlink"):
        CONTRACTS.resolve_declared_input(tmp_path, "link.json")
