"""Load the fixed Route Catalog and bounded chain definitions."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any


class RouteCatalogError(ValueError):
    """Raised when a Route Catalog or chain definition is invalid."""


def _load_sibling(name: str, filename: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(
        name,
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


CONTRACTS = _load_sibling("router_catalog_contracts", "router_contracts.py")
SPEC = _load_sibling("router_catalog_spec", "route_catalog_spec.py")
CATALOG_PATH = SPEC.CATALOG_PATH
DEFINITION_ROOT = SPEC.DEFINITION_ROOT
CATALOG_FIELDS = SPEC.CATALOG_FIELDS
TARGET_FIELDS = SPEC.TARGET_FIELDS
CHAIN_FIELDS = SPEC.CHAIN_FIELDS
NODE_FIELDS = SPEC.NODE_FIELDS
EXPECTED_SAFE_DEFAULTS = SPEC.EXPECTED_SAFE_DEFAULTS
TARGET_TYPES = SPEC.TARGET_TYPES
ALLOWED_GOALS = SPEC.ALLOWED_GOALS
ALLOWED_OBJECT_TYPES = SPEC.ALLOWED_OBJECT_TYPES
ALLOWED_INPUT_ROLES = SPEC.ALLOWED_INPUT_ROLES
ALLOWED_OPERATIONS = SPEC.ALLOWED_OPERATIONS
FORBIDDEN_GOALS = SPEC.FORBIDDEN_GOALS
EXPECTED_CHAIN_EDGES = SPEC.EXPECTED_CHAIN_EDGES
EXPECTED_GATE_POLICIES = SPEC.EXPECTED_GATE_POLICIES


def _require_fields(
    value: dict[str, Any],
    fields: set[str],
    label: str,
) -> None:
    if set(value) != fields:
        raise RouteCatalogError(f"{label} fields mismatch")


def _require_string_list(
    value: Any,
    allowed: set[str],
    label: str,
    *,
    allow_empty: bool = True,
) -> list[str]:
    if (
        not isinstance(value, list)
        or (not allow_empty and not value)
        or not all(isinstance(item, str) and item in allowed for item in value)
        or len(value) != len(set(value))
    ):
        raise RouteCatalogError(f"{label} is invalid")
    return value


def _validate_target_identity(entry: dict[str, Any]) -> str:
    target_id = entry["target_id"]
    if not isinstance(target_id, str):
        raise RouteCatalogError("catalog target ID must be a string")
    expected_type = TARGET_TYPES.get(target_id)
    if expected_type is None or entry["target_type"] != expected_type:
        raise RouteCatalogError("catalog target type mismatch")
    expected_policy = (
        "offline_risk_free_only" if expected_type == "direct_skill" else "never"
    )
    if entry["direct_entry_policy"] != expected_policy:
        raise RouteCatalogError("catalog direct entry policy mismatch")
    if entry["catalog_version"] != "1.0.0":
        raise RouteCatalogError("catalog target version mismatch")
    expected_priority = 10 if expected_type == "direct_skill" else 20
    if expected_type in {"workflow_a", "workflow_b"}:
        expected_priority = 30
    if entry["priority"] != expected_priority:
        raise RouteCatalogError("catalog priority mismatch")
    return expected_type


def _validate_target(entry: Any) -> None:
    if not isinstance(entry, dict):
        raise RouteCatalogError("catalog target must be an object")
    _require_fields(entry, TARGET_FIELDS, "catalog target")
    _validate_target_identity(entry)
    _require_string_list(
        entry["accepted_goal_types"],
        ALLOWED_GOALS,
        "accepted_goal_types",
        allow_empty=False,
    )
    _require_string_list(
        entry["required_object_types"],
        ALLOWED_OBJECT_TYPES,
        "required_object_types",
    )
    _require_string_list(
        entry["required_input_roles"],
        ALLOWED_INPUT_ROLES,
        "required_input_roles",
    )
    _require_string_list(
        entry["required_operations"],
        ALLOWED_OPERATIONS,
        "required_operations",
    )
    if entry["forbidden_goals"] != FORBIDDEN_GOALS:
        raise RouteCatalogError("catalog forbidden goals mismatch")
    if entry["allowed_execution_modes"] != [
        "auto_execute",
        "confirmation_required",
    ]:
        raise RouteCatalogError("catalog execution modes mismatch")
    defaults = entry["safe_defaults"]
    if not isinstance(defaults, dict) or any(
        key not in EXPECTED_SAFE_DEFAULTS or value != EXPECTED_SAFE_DEFAULTS[key]
        for key, value in defaults.items()
    ):
        raise RouteCatalogError("catalog target safe defaults mismatch")


def validate_catalog_shape(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise RouteCatalogError("route catalog must be an object")
    _require_fields(value, CATALOG_FIELDS, "route catalog")
    if value["schema_version"] != "1.0.0" or value["catalog_version"] != "1.0.0":
        raise RouteCatalogError("route catalog version mismatch")
    if value["safe_defaults"] != EXPECTED_SAFE_DEFAULTS:
        raise RouteCatalogError("route catalog safe defaults mismatch")
    targets = value["targets"]
    if not isinstance(targets, list):
        raise RouteCatalogError("route catalog targets must be an array")
    for entry in targets:
        _validate_target(entry)
    target_ids = [entry["target_id"] for entry in targets]
    if len(target_ids) != len(set(target_ids)) or set(target_ids) != set(TARGET_TYPES):
        raise RouteCatalogError("route catalog target set mismatch")
    return value


def catalog_fingerprint(value: dict[str, Any]) -> str:
    return CONTRACTS.sha256_json(value, "catalog_fingerprint")


def load_route_catalog(repository_root: Path) -> dict[str, Any]:
    try:
        value = CONTRACTS.read_json_object(
            repository_root / CATALOG_PATH,
            "route catalog",
        )
    except CONTRACTS.RouterContractError as error:
        raise RouteCatalogError(str(error)) from error
    catalog = validate_catalog_shape(value)
    if catalog["catalog_fingerprint"] != catalog_fingerprint(catalog):
        raise RouteCatalogError("catalog_fingerprint mismatch")
    return catalog


def route_entry(
    catalog: dict[str, Any],
    target_id: str,
) -> dict[str, Any]:
    for entry in catalog["targets"]:
        if entry["target_id"] == target_id:
            return entry
    raise RouteCatalogError(f"unknown target: {target_id}")


def _validate_chain_nodes(
    value: dict[str, Any],
    expected_edges: list[list[str]],
) -> None:
    nodes = value["nodes"]
    if not isinstance(nodes, list) or not nodes:
        raise RouteCatalogError("chain nodes must be a non-empty array")
    expected_needs: dict[str, list[str]] = {}
    for source, target in expected_edges:
        expected_needs.setdefault(source, [])
        expected_needs.setdefault(target, []).append(source)
    node_ids: list[str] = []
    for node in nodes:
        if not isinstance(node, dict):
            raise RouteCatalogError("chain node must be an object")
        _require_fields(node, NODE_FIELDS, "chain node")
        node_id = node["node_id"]
        if (
            not isinstance(node_id, str)
            or node["handler_id"] != node_id
            or node.get("needs") != expected_needs.get(node_id)
        ):
            raise RouteCatalogError("chain node contract mismatch")
        node_ids.append(node_id)
    if node_ids != list(expected_needs):
        raise RouteCatalogError("chain node order mismatch")
    if len(node_ids) != len(set(node_ids)) or set(node_ids) != set(expected_needs):
        raise RouteCatalogError("chain node set mismatch")


def _validate_chain_definition(
    value: Any,
    chain_id: str,
) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise RouteCatalogError("chain definition must be an object")
    _require_fields(value, CHAIN_FIELDS, "chain definition")
    if (
        value["schema_version"] != "1.0.0"
        or value["chain_id"] != chain_id
        or value["definition_version"] != "1.0.0"
        or value["runtime_contract_version"] != "1.0.0"
    ):
        raise RouteCatalogError("chain definition version mismatch")
    expected_edges = EXPECTED_CHAIN_EDGES[chain_id]
    if value["edges"] != expected_edges:
        raise RouteCatalogError("chain definition edges mismatch")
    if value["gate_policies"] != EXPECTED_GATE_POLICIES[chain_id]:
        raise RouteCatalogError("chain gate policies mismatch")
    _validate_chain_nodes(value, expected_edges)
    expected = CONTRACTS.sha256_json(value, "definition_fingerprint")
    if value["definition_fingerprint"] != expected:
        raise RouteCatalogError("definition_fingerprint mismatch")
    return value


def load_chain_definition(
    chain_id: str,
    repository_root: Path,
) -> dict[str, Any]:
    if chain_id not in EXPECTED_CHAIN_EDGES:
        raise RouteCatalogError(f"unknown chain: {chain_id}")
    path = repository_root / DEFINITION_ROOT / f"{chain_id}.json"
    try:
        value = CONTRACTS.read_json_object(path, f"chain definition {chain_id}")
    except CONTRACTS.RouterContractError as error:
        raise RouteCatalogError(str(error)) from error
    return _validate_chain_definition(value, chain_id)
