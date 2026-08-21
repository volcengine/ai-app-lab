"""Validate bounded-chain requests and load fixed chain definitions."""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path
from typing import Any


class ChainDefinitionError(ValueError):
    """Raised when a chain request or definition is not controlled."""


def _load_sibling(name: str, filename: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


CATALOG = _load_sibling("router_chain_catalog", "route_catalog.py")
CONTRACTS = _load_sibling("router_chain_contracts", "router_contracts.py")
CHAIN_IDS = {
    "identity-standardization-v1",
    "structure-features-v1",
    "structure-library-v1",
    "reaction-precedent-v1",
}
REQUEST_FIELDS = {
    "schema_version",
    "request_id",
    "target_id",
    "inputs",
    "parameters",
    "execution_policy",
}
INPUT_FIELDS = {"research_objects", "artifacts", "operations"}
OBJECT_FIELDS = {"object_id", "object_type", "representation"}
ARTIFACT_FIELDS = {"artifact_ref", "role", "path", "media_type", "sha256"}
OPERATION_FIELDS = {"operation_id", "operation_type", "sequence"}
PARAMETER_FIELDS = {"field_id", "value"}
POLICY_FIELDS = {"network_mode", "external_retry"}
NODE_ADAPTERS = {
    "resolve-identities": "resolve-chemical-identities-v1",
    "standardize-structures": "standardize-chemical-structures-v1",
    "compute-features": "compute-molecular-features-v1",
    "library-operation": "search-and-curate-chemical-libraries-v1",
    "curate-reactions": "curate-reactions-v1",
    "search-reactions": "search-reactions-v1",
}
CONTROLLED_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
EXPECTED_OPERATIONS = {
    "identity-standardization-v1": [
        "resolve_identity",
        "standardize_structure",
    ],
    "structure-features-v1": [
        "standardize_structure",
        "compute_fingerprint",
    ],
    "reaction-precedent-v1": [
        "curate_reaction",
        "search_reaction_precedent",
    ],
}
LIBRARY_OPERATIONS = {
    "search_similarity",
    "search_substructure",
    "cluster_library",
    "select_diverse_compounds",
    "curate_library",
}
EXPECTED_OBJECT_TYPES = {
    "identity-standardization-v1": {
        "compound_name",
        "compound_identifier",
        "chemical_structure",
    },
    "structure-features-v1": {"chemical_structure"},
    "structure-library-v1": {"chemical_structure"},
    "reaction-precedent-v1": {"reaction_record", "reaction_query"},
}


def _exact(value: Any, fields: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != fields:
        raise ChainDefinitionError(f"{label} fields mismatch")
    return value


def _controlled_id(value: Any, label: str) -> str:
    if not isinstance(value, str) or not CONTROLLED_ID_RE.fullmatch(value):
        raise ChainDefinitionError(f"{label} is invalid")
    return value


def _unique_ids(items: list[dict[str, Any]], field: str, label: str) -> None:
    values = [_controlled_id(item[field], f"{label}.{field}") for item in items]
    if len(values) != len(set(values)):
        raise ChainDefinitionError(f"{label} IDs must be unique")


def _validate_operation_sequence(
    chain_id: str,
    operations: list[dict[str, Any]],
) -> None:
    ordered = sorted(operations, key=lambda item: item["sequence"])
    if [item["sequence"] for item in ordered] != list(range(1, len(ordered) + 1)):
        raise ChainDefinitionError("chain operations sequence is not contiguous")
    operation_types = [item["operation_type"] for item in ordered]
    if chain_id == "structure-library-v1":
        valid = (
            len(operation_types) == 3
            and operation_types[:2] == ["standardize_structure", "compute_fingerprint"]
            and operation_types[2] in LIBRARY_OPERATIONS
        )
    else:
        valid = operation_types == EXPECTED_OPERATIONS[chain_id]
    if not valid:
        raise ChainDefinitionError("chain operations do not match definition")


def _validate_inputs(value: Any, chain_id: str) -> None:
    inputs = _exact(value, INPUT_FIELDS, "chain inputs")
    objects = inputs["research_objects"]
    artifacts = inputs["artifacts"]
    operations = inputs["operations"]
    if not isinstance(objects, list) or not isinstance(artifacts, list):
        raise ChainDefinitionError("chain input arrays are invalid")
    if artifacts:
        raise ChainDefinitionError("chain input artifacts are not supported")
    if not isinstance(operations, list) or not operations:
        raise ChainDefinitionError("chain operations must be non-empty")
    for item in objects:
        _exact(item, OBJECT_FIELDS, "research object")
        if not isinstance(item["representation"], str) or not item["representation"]:
            raise ChainDefinitionError("research object representation is invalid")
        if item["object_type"] not in EXPECTED_OBJECT_TYPES[chain_id]:
            raise ChainDefinitionError(
                "research object type does not match chain definition"
            )
    for item in artifacts:
        _exact(item, ARTIFACT_FIELDS, "input artifact")
    for item in operations:
        _exact(item, OPERATION_FIELDS, "requested operation")
        if (
            isinstance(item["sequence"], bool)
            or not isinstance(item["sequence"], int)
            or item["sequence"] < 1
        ):
            raise ChainDefinitionError("operation sequence is invalid")
    _unique_ids(objects, "object_id", "research object")
    _unique_ids(artifacts, "artifact_ref", "input artifact")
    _unique_ids(operations, "operation_id", "requested operation")
    _validate_operation_sequence(chain_id, operations)


def _validate_parameters(value: Any) -> None:
    if not isinstance(value, list):
        raise ChainDefinitionError("chain parameters must be an array")
    for item in value:
        _exact(item, PARAMETER_FIELDS, "chain parameter")
    _unique_ids(value, "field_id", "chain parameter")


def validate_chain_request(value: Any) -> dict[str, Any]:
    """Validate the target request consumed by the chain runtime."""
    request = _exact(value, REQUEST_FIELDS, "chain request")
    if request["schema_version"] != "1.0.0":
        raise ChainDefinitionError("chain request version mismatch")
    _controlled_id(request["request_id"], "chain request_id")
    target_id = request["target_id"]
    if target_id not in CHAIN_IDS:
        raise ChainDefinitionError(f"unsupported chain: {target_id}")
    _validate_inputs(request["inputs"], target_id)
    _validate_parameters(request["parameters"])
    policy = _exact(
        request["execution_policy"],
        POLICY_FIELDS,
        "execution policy",
    )
    if policy != {"network_mode": "offline", "external_retry": "manual"}:
        raise ChainDefinitionError("chain execution policy must be offline/manual")
    try:
        CONTRACTS.canonical_json(request)
    except CONTRACTS.RouterContractError as error:
        raise ChainDefinitionError(str(error)) from error
    return request


def load_chain_definition(
    chain_id: str,
    repository_root: Path,
) -> dict[str, Any]:
    """Load one of the four fixed definitions through the Catalog contract."""
    if chain_id not in CHAIN_IDS:
        raise ChainDefinitionError(f"unsupported chain: {chain_id}")
    try:
        definition = CATALOG.load_chain_definition(chain_id, repository_root)
    except CATALOG.RouteCatalogError as error:
        raise ChainDefinitionError(str(error)) from error
    adapter_nodes = {
        node["node_id"]
        for node in definition["nodes"]
        if node["node_id"] in NODE_ADAPTERS
    }
    if adapter_nodes != {
        node
        for node in NODE_ADAPTERS
        if any(item[0] == node or item[1] == node for item in definition["edges"])
    }:
        raise ChainDefinitionError("chain adapter node set mismatch")
    return definition
