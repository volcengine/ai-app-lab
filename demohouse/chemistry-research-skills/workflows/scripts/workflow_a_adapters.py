"""Public Skill adapter nodes for Workflow A."""

from __future__ import annotations

import importlib.util
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


def _load_local_module(filename: str, module_name: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


CTX = _load_local_module(
    "workflow_a_context.py",
    "workflow_a_adapters_context",
)
ADAPTERS = _load_local_module(
    "skill_adapters.py",
    "workflow_a_adapters_registry",
)


@dataclass(frozen=True)
class NodeInput:
    node_id: str
    adapter_id: str
    command_context: dict[str, Any]
    output_path: Path
    logical_name: str
    validation_logical_name: str
    key_parameters: dict[str, Any]
    upstream_names: tuple[str, ...]
    event_payload: dict[str, Any] | None = None
    producer_attempt: int | None = None


def _identity_request(context: Any, path: Path) -> None:
    inputs = context.request["inputs"]
    identity = inputs["identity"]
    CTX.write_json(
        path,
        {
            "requests": inputs["queries"],
            "options": {
                "sources": identity["sources"],
                "include_related": identity["include_related"],
                "standardization_profile": inputs["standardization"]["profile"],
            },
        },
    )


def _library_request(context: Any, path: Path) -> None:
    operation = context.request["inputs"]["library_operation"]
    if not isinstance(operation, dict):
        raise CTX.WorkflowANodeError("library operation is missing")
    features = context.artifacts["molecular-features"]
    request = {
        "schema_version": "1.0.0",
        "operation": operation["operation"],
        "library_artifact": features["relative_path"],
        "options": operation["options"],
    }
    if "queries" in operation:
        request["queries"] = operation["queries"]
    CTX.write_json(path, request)


def _identity_node(context: Any, attempt: Path) -> NodeInput:
    inputs = context.request["inputs"]
    identity = inputs["identity"]
    request_path = attempt / "request.json"
    output = attempt / "identity-result.json"
    temporary = attempt / ".identity-result.json.tmp"
    _identity_request(context, request_path)
    return NodeInput(
        "resolve-identities",
        "resolve-chemical-identities-v1",
        {
            "request_path": str(request_path),
            "sources": identity["sources"],
            "include_related": identity["include_related"],
            "use_standardizer": True,
            "standardization_profile": inputs["standardization"]["profile"],
            "timeout_seconds": identity["timeout_seconds"],
            "retries": identity["retries"],
            "generated_at_utc": context.recorded_at_utc,
            "output_path": str(temporary),
        },
        output,
        "identity-result",
        "identity-validation",
        {"identity": identity, "queries": inputs["queries"]},
        (),
    )


def _standardize_node(context: Any, attempt: Path) -> NodeInput:
    inputs = context.request["inputs"]
    source = context.artifacts["standardization-input"]
    output = attempt / "standardized-structures.json"
    return NodeInput(
        "standardize-structures",
        "standardize-chemical-structures-v1",
        {
            "input_path": str(context.run_dir / source["relative_path"]),
            "input_format": "csv",
            "profile": inputs["standardization"]["profile"],
            "generated_at_utc": context.recorded_at_utc,
            "output_path": str(attempt / ".standardized-structures.json.tmp"),
        },
        output,
        "standardized-structures",
        "standardize-validation",
        inputs["standardization"],
        ("standardization-input", "standardization-input-binding"),
    )


def _features_node(context: Any, attempt: Path) -> NodeInput:
    source = context.artifacts["standardized-structures"]
    selection_entry = context.artifacts["calculation-view-selection"]
    selection = CTX.read_json(context.run_dir / selection_entry["relative_path"])
    calculation_view = selection["calculation_view"]
    output = attempt / "molecular-features.json"
    return NodeInput(
        "compute-features",
        "compute-molecular-features-v1",
        {
            "input_path": str(context.run_dir / source["relative_path"]),
            "input_format": "json",
            "calculation_view": calculation_view,
            "generated_at_utc": context.recorded_at_utc,
            "output_path": str(attempt / ".molecular-features.json.tmp"),
        },
        output,
        "molecular-features",
        "features-validation",
        {"calculation_view": calculation_view},
        ("standardized-structures", "calculation-view-selection"),
    )


def _library_node(context: Any, attempt: Path) -> NodeInput:
    inputs = context.request["inputs"]
    request_path = context.run_dir / "library-operation-request.json"
    output = attempt / "library-operation.json"
    _library_request(context, request_path)
    return NodeInput(
        "optional-library-operation",
        "search-and-curate-chemical-libraries-v1",
        {
            "request_path": str(request_path),
            "generated_at_utc": context.recorded_at_utc,
            "output_path": str(attempt / ".library-operation.json.tmp"),
        },
        output,
        "library-operation",
        "library-validation",
        inputs["library_operation"],
        ("molecular-features",),
    )


def build_workflow_a_node_input(
    node_id: str,
    context: Any,
) -> NodeInput:
    attempt = CTX.attempt_dir(context, node_id)
    if node_id == "resolve-identities":
        return _identity_node(context, attempt)
    if node_id == "standardize-structures":
        return _standardize_node(context, attempt)
    if node_id == "compute-features":
        return _features_node(context, attempt)
    if node_id == "optional-library-operation":
        return _library_node(context, attempt)
    raise CTX.WorkflowANodeError(f"node has no Skill adapter: {node_id}")


def _outcome_state(domain_state: str) -> str:
    if domain_state in {"ready_for_standardization", "completed"}:
        return "succeeded"
    if domain_state == "review_required":
        return "succeeded_with_review"
    return "blocked"


def _commit_validation_report(
    node_input: NodeInput,
    context: Any,
    adapter: Any,
    report: dict[str, Any],
    output_key: str,
) -> dict[str, Any]:
    report_path = node_input.output_path.with_name("validation.json")
    CTX.write_json(report_path, report)
    return CTX.commit(
        context,
        node_id=node_input.node_id,
        logical_name=node_input.validation_logical_name,
        path=report_path,
        media_type="application/json",
        execution_key_value=CTX.execution_key(
            context,
            node_input.node_id,
            {
                "artifact_role": "validator_report",
                "output_execution_key": output_key,
            },
            node_input.upstream_names,
            adapter,
        ),
        validation_artifact_id=None,
        domain_state="passed",
        producer_attempt=node_input.producer_attempt,
    )


def execute_adapter_node(
    node_input: NodeInput,
    context: Any,
) -> Any:
    adapter = ADAPTERS.ADAPTERS[node_input.adapter_id]
    attempt = context.attempts.get(node_input.node_id, 1)
    argv = ADAPTERS.build_command(node_input.adapter_id, node_input.command_context)
    execute = context.executor or ADAPTERS.execute_adapter
    result = execute(
        adapter,
        argv,
        repository_root=context.repository_root,
        timeout_seconds=180,
    )
    context.append_event(
        "process_finished",
        node_input.node_id,
        attempt,
        {
            "returncode": result.returncode,
            **(node_input.event_payload or {}),
        },
    )
    temporary = Path(node_input.command_context["output_path"])
    ADAPTERS.accept_process_result(adapter, result, temporary)
    CTX.REGISTRY.atomic_write_bytes(node_input.output_path, temporary.read_bytes())
    temporary.unlink(missing_ok=True)
    report = ADAPTERS.run_validator(
        adapter,
        node_input.output_path,
        repository_root=context.repository_root,
        timeout_seconds=180,
    )
    context.append_event(
        "validation_finished",
        node_input.node_id,
        attempt,
        {
            "valid": True,
            **(node_input.event_payload or {}),
        },
    )
    key = CTX.execution_key(
        context,
        node_input.node_id,
        node_input.key_parameters,
        node_input.upstream_names,
        adapter,
    )
    validation = _commit_validation_report(
        node_input,
        context,
        adapter,
        report,
        key,
    )
    artifact = CTX.read_json(node_input.output_path)
    domain_state = ADAPTERS.extract_domain_state(adapter, artifact)
    output = CTX.commit(
        context,
        node_id=node_input.node_id,
        logical_name=node_input.logical_name,
        path=node_input.output_path,
        media_type="application/json",
        execution_key_value=key,
        validation_artifact_id=validation["artifact_id"],
        domain_state=domain_state,
        producer_attempt=node_input.producer_attempt,
    )
    return CTX.NodeOutcome(
        node_input.node_id,
        _outcome_state(domain_state),
        domain_state,
        (validation["artifact_id"], output["artifact_id"]),
    )
