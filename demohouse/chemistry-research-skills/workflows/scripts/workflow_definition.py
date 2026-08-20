"""Load and validate built-in chemistry workflow definitions."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any


def _load_contracts() -> Any:
    path = Path(__file__).with_name("workflow_contracts.py")
    spec = importlib.util.spec_from_file_location(
        "workflow_definition_contracts",
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load workflow_contracts.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


CONTRACTS = _load_contracts()
DEFINITION_FILENAMES = {
    "compound-evidence-v1": "compound-evidence-v1.json",
    "route-evidence-review-v1": "route-evidence-review-v1.json",
}
DEFINITION_FIELDS = {
    "schema_version",
    "workflow_id",
    "definition_version",
    "runtime_contract_version",
    "nodes",
    "edges",
    "gate_policies",
    "definition_fingerprint",
}
NODE_REQUIRED_FIELDS = {"node_id", "handler_id", "needs"}
NODE_OPTIONAL_FIELDS = {"condition_id"}
HANDLER_IDS = {
    "workflow-a-resolve",
    "workflow-a-identity-gate",
    "workflow-a-standardization-input",
    "workflow-a-standardize",
    "workflow-a-view-gate",
    "workflow-a-features",
    "workflow-a-library",
    "workflow-a-package",
    "workflow-b-prepare",
    "workflow-b-curate",
    "workflow-b-discover",
    "workflow-b-bind-curation",
    "workflow-b-expand-search",
    "workflow-b-search",
    "workflow-b-assemble",
    "workflow-b-review",
    "workflow-b-package",
    "validate-workflow",
}
CONDITION_IDS = {"library-operation-present"}
GATE_POLICY_FIELDS = {"gate_type"}
GATE_HANDLER_TYPES = {
    "workflow-a-identity-gate": "identity_resolution",
    "workflow-a-view-gate": "calculation_view",
}
WORKFLOW_HANDLER_IDS = {
    "compound-evidence-v1": {
        item for item in HANDLER_IDS if item.startswith("workflow-a-")
    }
    | {"validate-workflow"},
    "route-evidence-review-v1": {
        item for item in HANDLER_IDS if item.startswith("workflow-b-")
    }
    | {"validate-workflow"},
}
HANDLER_CONDITIONS = {
    "workflow-a-library": "library-operation-present",
}


class DefinitionError(ValueError):
    """Raised when a built-in definition is invalid."""


def definition_fingerprint(value: dict[str, Any]) -> str:
    payload = {
        key: item for key, item in value.items() if key != "definition_fingerprint"
    }
    return CONTRACTS.sha256_json(payload)


def _validate_node(value: Any, position: int) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise DefinitionError(f"nodes[{position}]: must be an object")
    try:
        CONTRACTS.require_exact_fields(
            value,
            NODE_REQUIRED_FIELDS,
            NODE_OPTIONAL_FIELDS,
            f"nodes[{position}]",
        )
        node_id = CONTRACTS.require_controlled_id(
            value["node_id"],
            f"nodes[{position}].node_id",
        )
    except CONTRACTS.ContractError as error:
        raise DefinitionError(str(error)) from error
    handler_id = value["handler_id"]
    if not isinstance(handler_id, str) or handler_id not in HANDLER_IDS:
        raise DefinitionError(f"nodes[{position}]: unsupported handler")
    needs = value["needs"]
    if (
        not isinstance(needs, list)
        or not all(isinstance(item, str) for item in needs)
        or len(needs) != len(set(needs))
    ):
        raise DefinitionError(f"nodes[{position}].needs: invalid dependencies")
    condition = value.get("condition_id")
    if condition is not None and (
        not isinstance(condition, str) or condition not in CONDITION_IDS
    ):
        raise DefinitionError(f"nodes[{position}]: unsupported condition")
    return {
        "node_id": node_id,
        "handler_id": handler_id,
        "needs": list(needs),
        **({"condition_id": condition} if condition is not None else {}),
    }


def _expected_edges(nodes: list[dict[str, Any]]) -> list[list[str]]:
    return [
        [dependency, node["node_id"]] for node in nodes for dependency in node["needs"]
    ]


def _validate_acyclic(nodes: list[dict[str, Any]]) -> None:
    dependencies = {node["node_id"]: set(node["needs"]) for node in nodes}
    visited: set[str] = set()
    while len(visited) < len(nodes):
        ready = sorted(
            node_id
            for node_id, needs in dependencies.items()
            if node_id not in visited and needs <= visited
        )
        if not ready:
            raise DefinitionError("definition graph contains a cycle")
        visited.update(ready)


def _validate_graph(
    nodes: list[dict[str, Any]],
    edges: Any,
) -> None:
    node_ids = [node["node_id"] for node in nodes]
    if len(node_ids) != len(set(node_ids)):
        raise DefinitionError("definition contains duplicate node ID")
    known = set(node_ids)
    for node in nodes:
        if node["node_id"] in node["needs"]:
            raise DefinitionError("definition graph contains a cycle")
        unknown = sorted(set(node["needs"]) - known)
        if unknown:
            raise DefinitionError(f"definition has unknown dependencies: {unknown}")
    if edges != _expected_edges(nodes):
        raise DefinitionError("definition edges do not match node dependencies")
    _validate_acyclic(nodes)
    roots = [node["node_id"] for node in nodes if not node["needs"]]
    if len(roots) != 1:
        raise DefinitionError("definition graph must have a single root")


def _validate_gate_policies(
    value: Any,
    nodes: list[dict[str, Any]],
) -> dict[str, dict[str, str]]:
    if not isinstance(value, dict):
        raise DefinitionError("gate_policies must be an object")
    expected = {
        node["node_id"]: GATE_HANDLER_TYPES[node["handler_id"]]
        for node in nodes
        if node["handler_id"] in GATE_HANDLER_TYPES
    }
    if set(value) != set(expected):
        raise DefinitionError("gate policy nodes do not match gate handlers")
    normalized: dict[str, dict[str, str]] = {}
    for node_id, expected_type in expected.items():
        policy = value[node_id]
        if not isinstance(policy, dict):
            raise DefinitionError(f"gate policy {node_id}: must be an object")
        try:
            CONTRACTS.require_exact_fields(
                policy,
                GATE_POLICY_FIELDS,
                set(),
                f"gate policy {node_id}",
            )
        except CONTRACTS.ContractError as error:
            raise DefinitionError(str(error)) from error
        gate_type = policy["gate_type"]
        if not isinstance(gate_type, str) or gate_type != expected_type:
            raise DefinitionError(f"gate policy {node_id}: unsupported gate_type")
        normalized[node_id] = {"gate_type": gate_type}
    return normalized


def _validate_node_ownership(
    workflow_id: str,
    nodes: list[dict[str, Any]],
) -> None:
    allowed_handlers = WORKFLOW_HANDLER_IDS[workflow_id]
    for node in nodes:
        handler_id = node["handler_id"]
        if handler_id not in allowed_handlers:
            raise DefinitionError(
                f"node handler is not allowed for workflow {workflow_id}"
            )
        if node.get("condition_id") != HANDLER_CONDITIONS.get(handler_id):
            raise DefinitionError(f"node condition does not match handler {handler_id}")


def validate_definition(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise DefinitionError("definition: top level must be an object")
    try:
        CONTRACTS.require_exact_fields(
            value,
            DEFINITION_FIELDS,
            set(),
            "definition",
        )
    except CONTRACTS.ContractError as error:
        raise DefinitionError(str(error)) from error
    if value["schema_version"] != CONTRACTS.SCHEMA_VERSION:
        raise DefinitionError("definition schema_version must be 1.0.0")
    if (
        not isinstance(value["workflow_id"], str)
        or value["workflow_id"] not in DEFINITION_FILENAMES
    ):
        raise DefinitionError("definition has unsupported workflow_id")
    if value["definition_version"] != "1.0.0":
        raise DefinitionError("definition_version must be 1.0.0")
    if value["runtime_contract_version"] != "1.0.0":
        raise DefinitionError("runtime_contract_version must be 1.0.0")
    if not isinstance(value["nodes"], list) or not value["nodes"]:
        raise DefinitionError("definition nodes must be a non-empty array")
    nodes = [_validate_node(item, index) for index, item in enumerate(value["nodes"])]
    _validate_graph(nodes, value["edges"])
    _validate_node_ownership(value["workflow_id"], nodes)
    gate_policies = _validate_gate_policies(value["gate_policies"], nodes)
    if value["definition_fingerprint"] != definition_fingerprint(value):
        raise DefinitionError("definition fingerprint mismatch")
    return {
        **value,
        "nodes": nodes,
        "gate_policies": gate_policies,
    }


def load_definition(
    workflow_id: str,
    repository_root: Path,
) -> dict[str, Any]:
    filename = DEFINITION_FILENAMES.get(workflow_id)
    if filename is None:
        raise DefinitionError(f"unsupported workflow_id: {workflow_id}")
    path = repository_root / "workflows" / "definitions" / filename
    try:
        value = CONTRACTS.read_json_object(path, "workflow definition")
    except CONTRACTS.ContractError as error:
        raise DefinitionError(str(error)) from error
    return validate_definition(value)
