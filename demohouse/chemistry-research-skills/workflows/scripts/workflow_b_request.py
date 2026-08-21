"""Strict request contract for route-evidence-review-v1."""

from __future__ import annotations

import importlib.util
import math
import sys
from pathlib import Path
from typing import Any


def _load_contracts() -> Any:
    path = Path(__file__).with_name("workflow_contracts.py")
    spec = importlib.util.spec_from_file_location(
        "workflow_b_request_contracts",
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load workflow_contracts.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


CONTRACTS = _load_contracts()
INPUT_FIELDS = {
    "reaction_input",
    "route_input",
    "standardization_artifacts",
    "search_strategy",
    "inventory_snapshot",
    "constraints",
}
FILE_REF_FIELDS = {"path", "sha256"}
ROUTE_REF_FIELDS = FILE_REF_FIELDS | {"input_profile"}
STRATEGY_FIELDS = {
    "provider",
    "operation",
    "top_k",
    "include_review_required",
    "use_stereochemistry",
    "fingerprint_profile_id",
    "threshold",
}
PROVIDERS = {"local_curated_corpus", "ord_public_api"}
OPERATIONS = {
    "lookup_reaction",
    "search_components",
    "search_transformations",
    "search_similar_reactions",
}
FINGERPRINT_PROFILES = {
    "rdkit-difference-atompair-v1",
    "rdkit-structural-atompair-v1",
}


class WorkflowBRequestError(ValueError):
    """Raised when a Workflow B request is not exact and executable."""


def _object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise WorkflowBRequestError(f"{label} must be an object")
    return value


def _exact(
    value: dict[str, Any],
    fields: set[str],
    label: str,
) -> None:
    try:
        CONTRACTS.require_exact_fields(value, fields, set(), label)
    except CONTRACTS.ContractError as error:
        raise WorkflowBRequestError(str(error)) from error


def _file_ref(
    value: Any,
    label: str,
    *,
    route: bool = False,
) -> dict[str, str]:
    item = _object(value, label)
    _exact(item, ROUTE_REF_FIELDS if route else FILE_REF_FIELDS, label)
    try:
        path = CONTRACTS.validate_relative_input_path(item["path"])
        sha256 = CONTRACTS.require_sha256(item["sha256"], f"{label}.sha256")
    except CONTRACTS.ContractError as error:
        raise WorkflowBRequestError(str(error)) from error
    output = {"path": path.as_posix(), "sha256": sha256}
    if route:
        profile = item["input_profile"]
        if profile != "normalized_route_v1":
            raise WorkflowBRequestError(f"{label}.input_profile is unsupported")
        output["input_profile"] = profile
    return output


def _standardization_refs(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        raise WorkflowBRequestError("inputs.standardization_artifacts must be an array")
    output = [
        _file_ref(item, f"inputs.standardization_artifacts[{index}]")
        for index, item in enumerate(value)
    ]
    paths = [item["path"] for item in output]
    if len(paths) != len(set(paths)):
        raise WorkflowBRequestError(
            "inputs.standardization_artifacts paths must be unique"
        )
    return output


def _bounded_int(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 100:
        raise WorkflowBRequestError(f"{label} must be an integer from 1 to 100")
    return value


def _optional_threshold(value: Any) -> int | float | None:
    if value is None:
        return None
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(float(value))
        or not 0 <= float(value) <= 1
    ):
        raise WorkflowBRequestError(
            "inputs.search_strategy.threshold must be null or 0-1"
        )
    return value


def _fingerprint_profile(operation: str, value: Any) -> str | None:
    if value is not None and (not isinstance(value, str) or not value.strip()):
        raise WorkflowBRequestError(
            "inputs.search_strategy.fingerprint_profile_id is invalid"
        )
    if operation == "search_similar_reactions":
        if value not in FINGERPRINT_PROFILES:
            raise WorkflowBRequestError(
                "inputs.search_strategy fingerprint profile is required"
            )
    elif value is not None:
        raise WorkflowBRequestError(
            "inputs.search_strategy fingerprint profile is forbidden"
        )
    return value


def _strategy(
    value: Any,
    network_mode: str,
) -> dict[str, Any]:
    item = _object(value, "inputs.search_strategy")
    _exact(item, STRATEGY_FIELDS, "inputs.search_strategy")
    provider = item["provider"]
    operation = item["operation"]
    if provider not in PROVIDERS:
        raise WorkflowBRequestError("inputs.search_strategy.provider is unsupported")
    if operation not in OPERATIONS:
        raise WorkflowBRequestError("inputs.search_strategy.operation is unsupported")
    if provider == "ord_public_api" and network_mode != "public_http":
        raise WorkflowBRequestError(
            "inputs.search_strategy provider requires public_http network"
        )
    if provider == "local_curated_corpus" and network_mode != "offline":
        raise WorkflowBRequestError(
            "inputs.search_strategy local provider requires offline network"
        )
    if provider == "ord_public_api" and operation not in {
        "search_components",
        "search_transformations",
    }:
        raise WorkflowBRequestError(
            "inputs.search_strategy provider and operation are incompatible"
        )
    for field in ("include_review_required", "use_stereochemistry"):
        if not isinstance(item[field], bool):
            raise WorkflowBRequestError(
                f"inputs.search_strategy.{field} must be boolean"
            )
    profile = _fingerprint_profile(
        operation,
        item["fingerprint_profile_id"],
    )
    return {
        "provider": provider,
        "operation": operation,
        "top_k": _bounded_int(
            item["top_k"],
            "inputs.search_strategy.top_k",
        ),
        "include_review_required": item["include_review_required"],
        "use_stereochemistry": item["use_stereochemistry"],
        "fingerprint_profile_id": profile,
        "threshold": _optional_threshold(item["threshold"]),
    }


def validate_workflow_b_request(value: Any) -> dict[str, Any]:
    try:
        request = CONTRACTS.validate_common_request(value)
    except CONTRACTS.ContractError as error:
        raise WorkflowBRequestError(str(error)) from error
    if request["workflow_id"] != "route-evidence-review-v1":
        raise WorkflowBRequestError("workflow_id must be route-evidence-review-v1")
    inputs = _object(request["inputs"], "inputs")
    _exact(inputs, INPUT_FIELDS, "inputs")
    inventory = inputs["inventory_snapshot"]
    if inventory is not None:
        inventory = _file_ref(inventory, "inputs.inventory_snapshot")
    constraints = _object(inputs["constraints"], "inputs.constraints")
    return {
        **request,
        "inputs": {
            "reaction_input": _file_ref(
                inputs["reaction_input"],
                "inputs.reaction_input",
            ),
            "route_input": _file_ref(
                inputs["route_input"],
                "inputs.route_input",
                route=True,
            ),
            "standardization_artifacts": _standardization_refs(
                inputs["standardization_artifacts"]
            ),
            "search_strategy": _strategy(
                inputs["search_strategy"],
                request["execution_policy"]["network_mode"],
            ),
            "inventory_snapshot": inventory,
            "constraints": dict(constraints),
        },
    }
