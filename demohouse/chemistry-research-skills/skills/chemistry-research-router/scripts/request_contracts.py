"""Validate RouterExecutionRequest shape and target request integrity."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Any, Iterator


class RequestContractError(ValueError):
    """Raised when an execution request is unsafe or internally inconsistent."""


def _load_module(name: str, path: Path) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def _load_sibling(name: str, filename: str) -> Any:
    return _load_module(name, Path(__file__).with_name(filename))


def _load_workflow(name: str, filename: str) -> Any:
    repository_root = LAYOUT.repository_root(Path(__file__))
    return _load_module(
        name,
        repository_root / "workflows" / "scripts" / filename,
    )


CONTRACTS = _load_sibling("router_request_contracts_core", "router_contracts.py")
SCHEMAS = _load_sibling("router_request_contracts_schemas", "schema_validation.py")
LAYOUT = _load_sibling("router_request_contracts_layout", "runtime_layout.py")
WORKFLOW_A = _load_workflow(
    "router_request_contracts_workflow_a",
    "workflow_a_request.py",
)
WORKFLOW_B = _load_workflow(
    "router_request_contracts_workflow_b",
    "workflow_b_request.py",
)
TARGET_IDS = {
    "direct_skill": {
        "resolve-chemical-identities",
        "standardize-chemical-structures",
        "compute-molecular-features",
        "search-and-curate-chemical-libraries",
        "curate-reactions",
        "search-reactions",
        "review-routes",
    },
    "direct_skill_chain": {
        "identity-standardization-v1",
        "structure-features-v1",
        "structure-library-v1",
        "reaction-precedent-v1",
    },
    "workflow_a": {"compound-evidence-v1"},
    "workflow_b": {"route-evidence-review-v1"},
}
FORBIDDEN_KEYS = {
    "api_key",
    "command",
    "credential",
    "credentials",
    "entrypoint",
    "secret",
    "token",
    "url",
    "validator",
    "validator_path",
}


def _nested_items(
    value: Any,
    path: str = "$",
) -> Iterator[tuple[str, str]]:
    if isinstance(value, dict):
        for key, item in value.items():
            item_path = f"{path}.{key}"
            yield key, item_path
            yield from _nested_items(item, item_path)
    elif isinstance(value, list):
        for index, item in enumerate(value):
            yield from _nested_items(item, f"{path}[{index}]")


def _reject_execution_material(value: Any) -> None:
    for key, path in _nested_items(value):
        if key.lower() in FORBIDDEN_KEYS:
            raise RequestContractError(
                f"target_request contains forbidden execution material at {path}"
            )


def _validate_schema(value: Any) -> dict[str, Any]:
    try:
        return SCHEMAS.validate_schema_instance(
            value,
            "router-execution-request-v1",
        )
    except SCHEMAS.SchemaContractError as error:
        raise RequestContractError(str(error)) from error


def _relative_path(value: str) -> Path:
    declared = Path(value)
    if declared.is_absolute() or declared == Path(".") or ".." in declared.parts:
        raise RequestContractError("staged input path is unsafe")
    return declared


def _validate_staged_inputs(request: dict[str, Any]) -> None:
    artifact_refs: set[str] = set()
    paths: set[str] = set()
    for item in request["staged_inputs"]:
        artifact_ref = item["artifact_ref"]
        path = _relative_path(item["path"]).as_posix()
        if artifact_ref in artifact_refs:
            raise RequestContractError("staged input artifact_ref must be unique")
        if path in paths:
            raise RequestContractError("staged input path must be unique")
        artifact_refs.add(artifact_ref)
        paths.add(path)


def _validate_parameter_bindings(request: dict[str, Any]) -> None:
    field_ids = [item["field_id"] for item in request["parameter_bindings"]]
    if len(field_ids) != len(set(field_ids)):
        raise RequestContractError("parameter binding field_id must be unique")


def _binding_values(request: dict[str, Any]) -> dict[str, Any]:
    return {item["field_id"]: item["value"] for item in request["parameter_bindings"]}


def _validate_policy_binding(request: dict[str, Any]) -> None:
    bindings = _binding_values(request)
    policy = request["target_request"]["execution_policy"]
    for field_id, value in policy.items():
        if bindings.get(field_id) != value:
            raise RequestContractError(
                f"parameter binding does not match execution_policy.{field_id}"
            )


def _validate_direct_parameters(request: dict[str, Any]) -> None:
    if request["target_type"] not in {"direct_skill", "direct_skill_chain"}:
        return
    parameters = request["target_request"]["parameters"]
    field_ids = [item["field_id"] for item in parameters]
    if len(field_ids) != len(set(field_ids)):
        raise RequestContractError("target parameter field_id must be unique")
    target_values = {item["field_id"]: item["value"] for item in parameters}
    source_values = {
        item["field_id"]: item["value"]
        for item in request["parameter_bindings"]
        if item["provenance"] in {"catalog_default", "user_explicit", "human_decision"}
    }
    if target_values != source_values:
        raise RequestContractError("target parameters do not match parameter bindings")


def _staged_key(item: dict[str, Any]) -> tuple[str, str, str]:
    return item["role"], _relative_path(item["path"]).as_posix(), item["sha256"]


def _workflow_b_staged_keys(
    request: dict[str, Any],
) -> list[tuple[str, str, str]]:
    inputs = request["target_request"]["inputs"]
    output = [
        (
            "reaction_input",
            inputs["reaction_input"]["path"],
            inputs["reaction_input"]["sha256"],
        ),
        ("route_input", inputs["route_input"]["path"], inputs["route_input"]["sha256"]),
    ]
    output.extend(
        ("standardization_input", item["path"], item["sha256"])
        for item in inputs["standardization_artifacts"]
    )
    inventory = inputs["inventory_snapshot"]
    if inventory is not None:
        matches = [
            item
            for item in request["staged_inputs"]
            if item["path"] == inventory["path"]
            and item["sha256"] == inventory["sha256"]
        ]
        if len(matches) != 1:
            raise RequestContractError("inventory input is not uniquely staged")
        output.append(_staged_key(matches[0]))
    return output


def _validate_staged_binding(request: dict[str, Any]) -> None:
    target_type = request["target_type"]
    if target_type in {"direct_skill", "direct_skill_chain"}:
        target = request["target_request"]["inputs"]["artifacts"]
        expected = [
            {key: value for key, value in item.items() if key != "provenance"}
            for item in request["staged_inputs"]
        ]
        if target != expected:
            raise RequestContractError("target artifacts do not match staged inputs")
        return
    actual = sorted(_staged_key(item) for item in request["staged_inputs"])
    expected = (
        sorted(_workflow_b_staged_keys(request)) if target_type == "workflow_b" else []
    )
    if actual != expected:
        raise RequestContractError("target file references do not match staged inputs")


def _validate_risk_binding(request: dict[str, Any]) -> None:
    policy = request["target_request"]["execution_policy"]
    if (
        policy["network_mode"] == "public_http"
        and "external_data_disclosure" not in request["risk_reasons"]
    ):
        raise RequestContractError("public_http requires external data disclosure risk")


def _validate_target_binding(request: dict[str, Any]) -> None:
    target_type = request["target_type"]
    target_id = request["target_id"]
    if target_id not in TARGET_IDS[target_type]:
        raise RequestContractError("target_id does not match target_type")
    target_request = request["target_request"]
    target_field = "workflow_id" if target_type.startswith("workflow_") else "target_id"
    if target_field not in target_request:
        raise RequestContractError("target_request shape does not match target_type")
    embedded_target = target_request[target_field]
    if embedded_target != target_id:
        raise RequestContractError("target_request target does not match wrapper")
    if target_request["request_id"] != request["request_id"]:
        raise RequestContractError("target_request request_id does not match wrapper")


def _validate_target_request(request: dict[str, Any]) -> None:
    target_type = request["target_type"]
    target_request = request["target_request"]
    try:
        if target_type == "workflow_a":
            WORKFLOW_A.validate_workflow_a_request(target_request)
        elif target_type == "workflow_b":
            WORKFLOW_B.validate_workflow_b_request(target_request)
    except (
        WORKFLOW_A.WorkflowARequestError,
        WORKFLOW_B.WorkflowBRequestError,
    ) as error:
        raise RequestContractError(f"target_request is invalid: {error}") from error


def validate_execution_request(value: Any) -> dict[str, Any]:
    """Validate an execution request without executing its target."""
    _reject_execution_material(value)
    request = _validate_schema(value)
    _validate_target_binding(request)
    _validate_staged_inputs(request)
    _validate_parameter_bindings(request)
    _validate_target_request(request)
    _validate_policy_binding(request)
    _validate_direct_parameters(request)
    _validate_staged_binding(request)
    _validate_risk_binding(request)
    expected = CONTRACTS.sha256_json(request, "request_fingerprint")
    if request["request_fingerprint"] != expected:
        raise RequestContractError("request_fingerprint mismatch")
    return request
