"""Construct validated target-specific requests and staged input records."""

from __future__ import annotations

import hashlib
import importlib.util
import stat
from pathlib import Path
from typing import Any


class RequestBuilderError(ValueError):
    """Raised when a safe target request cannot be constructed."""


def _load_sibling(name: str, filename: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


CONTRACTS = _load_sibling("router_target_contracts", "router_contracts.py")
REQUESTS = _load_sibling("router_target_request_contracts", "request_contracts.py")
LIBRARY = _load_sibling(
    "router_target_library_builder",
    "request_library_builder.py",
)
IDENTITY_TARGETS = {
    "resolve-chemical-identities",
    "identity-standardization-v1",
    "compound-evidence-v1",
}
EXTERNAL_OBJECT_TYPES = {"compound_name", "compound_identifier"}
INPUT_TYPES = {
    "compound_name": "name",
    "compound_identifier": "auto",
    "chemical_structure": "auto",
}


def request_id(
    intent: dict[str, Any],
    decision: dict[str, Any],
    target_id: str,
) -> str:
    payload = {
        "intent_fingerprint": intent["intent_fingerprint"],
        "decision_fingerprint": decision["decision_fingerprint"],
        "target_id": target_id,
    }
    return "router-request-" + CONTRACTS.sha256_json(payload)[:24]


def effective_parameters(
    intent: dict[str, Any],
    decision: dict[str, Any],
) -> dict[str, tuple[Any, str]]:
    values = {
        item["field_id"]: (item["value"], "catalog_default")
        for item in decision["applied_defaults"]
    }
    for item in intent["user_parameters"]:
        values[item["field_id"]] = (item["value"], "user_explicit")
    return values


def _value(
    parameters: dict[str, tuple[Any, str]],
    field_id: str,
    fallback: Any = None,
) -> Any:
    item = parameters.get(field_id)
    return fallback if item is None else item[0]


def _uses_external_identity(
    intent: dict[str, Any],
    target_id: str,
) -> bool:
    return target_id in IDENTITY_TARGETS and any(
        item["object_type"] in EXTERNAL_OBJECT_TYPES
        for item in intent["research_objects"]
    )


def _execution_policy(
    parameters: dict[str, tuple[Any, str]],
    public_http: bool,
) -> dict[str, str]:
    network_mode = "public_http" if public_http else "offline"
    parameters["network_mode"] = (network_mode, "catalog_default")
    return {
        "network_mode": network_mode,
        "external_retry": _value(parameters, "external_retry", "manual"),
    }


def _compound_queries(intent: dict[str, Any]) -> list[dict[str, str]]:
    queries = []
    for item in intent["research_objects"]:
        input_type = INPUT_TYPES.get(item["object_type"])
        if input_type is not None:
            queries.append(
                {
                    "id": item["object_id"],
                    "query": item["representation"],
                    "input_type": input_type,
                }
            )
    if not queries:
        raise RequestBuilderError("Workflow A requires a compound query")
    return queries


def workflow_a_components(
    intent: dict[str, Any],
    decision: dict[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, tuple[Any, str]]]:
    parameters = effective_parameters(intent, decision)
    target_id = decision["targets"][0]
    public_http = _uses_external_identity(intent, target_id)
    sources = _value(
        parameters,
        "public_identity_sources" if public_http else "offline_identity_sources",
        [],
    )
    try:
        library_operation = LIBRARY.build_library_operation(intent, parameters)
    except LIBRARY.LibraryRequestError as error:
        raise RequestBuilderError(
            f"Workflow A library request is invalid: {error}"
        ) from error
    request = {
        "schema_version": "1.0.0",
        "workflow_id": target_id,
        "request_id": request_id(intent, decision, target_id),
        "inputs": {
            "queries": _compound_queries(intent),
            "identity": {
                "sources": list(sources),
                "include_related": _value(
                    parameters,
                    "identity_include_related",
                    False,
                ),
                "timeout_seconds": _value(
                    parameters,
                    "identity_timeout_seconds",
                    20,
                ),
                "retries": _value(parameters, "identity_retries", 0),
            },
            "standardization": {
                "profile": _value(
                    parameters,
                    "standardization_profile",
                    "chembl-pipeline",
                )
            },
            "features": {
                "calculation_view": _value(
                    parameters,
                    "calculation_view",
                    "standardized",
                )
            },
            "library_operation": library_operation,
        },
        "execution_policy": _execution_policy(parameters, public_http),
    }
    try:
        validated = REQUESTS.WORKFLOW_A.validate_workflow_a_request(request)
    except REQUESTS.WORKFLOW_A.WorkflowARequestError as error:
        raise RequestBuilderError(f"Workflow A request is invalid: {error}") from error
    return validated, [], parameters


def _safe_staged_file(
    staging_root: Path,
    artifact: dict[str, Any],
) -> dict[str, Any]:
    if staging_root.is_symlink() or not staging_root.is_dir():
        raise RequestBuilderError("staging root must be a real directory")
    declared = Path(artifact["artifact_ref"])
    if declared.is_absolute() or declared == Path(".") or ".." in declared.parts:
        raise RequestBuilderError("staged input path is unsafe")
    current = staging_root
    for part in declared.parts:
        current = current / part
        if current.is_symlink():
            raise RequestBuilderError("staged input symlink is forbidden")
    try:
        resolved = current.resolve(strict=True)
        resolved.relative_to(staging_root.resolve(strict=True))
    except (OSError, ValueError) as error:
        raise RequestBuilderError("staged input is missing or escapes root") from error
    file_stat = resolved.stat()
    if not stat.S_ISREG(file_stat.st_mode):
        raise RequestBuilderError("staged input must be a regular file")
    if file_stat.st_nlink != 1:
        raise RequestBuilderError("staged input hardlink is forbidden")
    actual_hash = hashlib.sha256(resolved.read_bytes()).hexdigest()
    if actual_hash != artifact["sha256"]:
        raise RequestBuilderError("staged input hash mismatch")
    return {
        "artifact_ref": artifact["artifact_ref"],
        "role": artifact["role"],
        "path": declared.as_posix(),
        "media_type": artifact["media_type"],
        "sha256": actual_hash,
        "provenance": "validated_attachment",
    }


def stage_inputs(
    intent: dict[str, Any],
    staging_root: Path,
) -> list[dict[str, Any]]:
    staged = [
        _safe_staged_file(staging_root, item) for item in intent["input_artifacts"]
    ]
    paths = [item["path"] for item in staged]
    if len(paths) != len(set(paths)):
        raise RequestBuilderError("staged input paths must be unique")
    return staged


def _one_role(
    staged: list[dict[str, Any]],
    role: str,
) -> dict[str, Any]:
    matches = [item for item in staged if item["role"] == role]
    if len(matches) != 1:
        raise RequestBuilderError(f"Workflow B requires exactly one {role}")
    return matches[0]


def _file_reference(item: dict[str, Any]) -> dict[str, str]:
    return {"path": item["path"], "sha256": item["sha256"]}


def _reject_unmapped_workflow_b_parameters(
    intent: dict[str, Any],
) -> None:
    unsupported = {
        item["field_id"]
        for item in intent["user_parameters"]
        if item["field_id"]
        in {"route_constraints", "inventory_snapshot", "calculation_view", "seed"}
    }
    if unsupported:
        raise RequestBuilderError(
            "Workflow B cannot map user parameters: " + ", ".join(sorted(unsupported))
        )


def _workflow_b_strategy(
    parameters: dict[str, tuple[Any, str]],
) -> dict[str, Any]:
    provider = _value(parameters, "reaction_provider", "local_curated_corpus")
    profile = _value(parameters, "fingerprint_profile_id")
    threshold = _value(parameters, "similarity_threshold")
    if provider == "ord_public_api":
        raise RequestBuilderError(
            "reaction_provider ord_public_api requires search strategy clarification"
        )
    operation = _value(parameters, "reaction_operation", "lookup_reaction")
    if profile is not None or threshold is not None:
        if profile is None:
            raise RequestBuilderError(
                "similar reaction search requires fingerprint_profile_id"
            )
        operation = "search_similar_reactions"
        parameters["reaction_operation"] = (operation, "user_explicit")
    return {
        "provider": provider,
        "operation": operation,
        "top_k": _value(
            parameters,
            "top_k",
            _value(parameters, "reaction_top_k", 20),
        ),
        "include_review_required": _value(
            parameters,
            "reaction_include_review_required",
            False,
        ),
        "use_stereochemistry": _value(
            parameters,
            "reaction_use_stereochemistry",
            True,
        ),
        "fingerprint_profile_id": profile
        if operation == "search_similar_reactions"
        else None,
        "threshold": threshold if operation == "search_similar_reactions" else None,
    }


def workflow_b_components(
    intent: dict[str, Any],
    decision: dict[str, Any],
    staging_root: Path,
) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, tuple[Any, str]]]:
    _reject_unmapped_workflow_b_parameters(intent)
    parameters = effective_parameters(intent, decision)
    if "retry_policy" in parameters:
        parameters["external_retry"] = parameters["retry_policy"]
    staged = stage_inputs(intent, staging_root)
    reaction = _one_role(staged, "reaction_input")
    route = _one_role(staged, "route_input")
    strategy = _workflow_b_strategy(parameters)
    standardization = [
        _file_reference(item)
        for item in staged
        if item["role"] == "standardization_input"
    ]
    request = {
        "schema_version": "1.0.0",
        "workflow_id": decision["targets"][0],
        "request_id": request_id(intent, decision, decision["targets"][0]),
        "inputs": {
            "reaction_input": _file_reference(reaction),
            "route_input": {
                **_file_reference(route),
                "input_profile": "normalized_route_v1",
            },
            "standardization_artifacts": standardization,
            "search_strategy": strategy,
            "inventory_snapshot": None,
            "constraints": {},
        },
        "execution_policy": _execution_policy(
            parameters,
            strategy["provider"] == "ord_public_api",
        ),
    }
    try:
        validated = REQUESTS.WORKFLOW_B.validate_workflow_b_request(request)
    except REQUESTS.WORKFLOW_B.WorkflowBRequestError as error:
        raise RequestBuilderError(f"Workflow B request is invalid: {error}") from error
    return validated, staged, parameters


def generic_components(
    intent: dict[str, Any],
    decision: dict[str, Any],
    staging_root: Path,
) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, tuple[Any, str]]]:
    parameters = effective_parameters(intent, decision)
    staged = stage_inputs(intent, staging_root) if intent["input_artifacts"] else []
    target_id = decision["targets"][0]
    execution_policy = _execution_policy(
        parameters,
        _uses_external_identity(intent, target_id),
    )
    request = {
        "schema_version": "1.0.0",
        "request_id": request_id(intent, decision, target_id),
        "target_id": target_id,
        "inputs": {
            "research_objects": [
                {
                    "object_id": item["object_id"],
                    "object_type": item["object_type"],
                    "representation": item["representation"],
                }
                for item in intent["research_objects"]
            ],
            "artifacts": [
                {key: value for key, value in item.items() if key != "provenance"}
                for item in staged
            ],
            "operations": [
                {
                    "operation_id": item["operation_id"],
                    "operation_type": item["operation_type"],
                    "sequence": item["sequence"],
                }
                for item in intent["requested_operations"]
                if item["negated"] is False
            ],
        },
        "parameters": [
            {"field_id": field_id, "value": value}
            for field_id, (value, _) in sorted(parameters.items())
        ],
        "execution_policy": execution_policy,
    }
    return request, staged, parameters
