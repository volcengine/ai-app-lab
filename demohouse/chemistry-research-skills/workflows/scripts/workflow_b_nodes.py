"""Task 10 node handlers for Workflow B."""

from __future__ import annotations

import importlib.util
import sys
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
    "workflow_b_nodes_context",
)
ADAPTER_NODES = _load_local_module(
    "workflow_a_adapters.py",
    "workflow_b_nodes_adapters",
)


class WorkflowBNodeError(ValueError):
    """Raised when a Task 10 node cannot execute safely."""


def _commit_prepared_input(
    context: Any,
    logical_name: str,
    path: Path,
    reference: dict[str, Any],
) -> dict[str, Any]:
    key = CTX.execution_key(
        context,
        "prepare-reaction-input",
        {"logical_name": logical_name, "reference": reference},
        (),
    )
    return CTX.commit(
        context,
        node_id="prepare-reaction-input",
        logical_name=logical_name,
        path=path,
        media_type="application/json",
        execution_key_value=key,
        validation_artifact_id=None,
        domain_state="completed",
    )


def _prepare_inputs(domain: Any, context: Any) -> Any:
    paths = domain.staged_input_paths(context.request, context.run_dir)
    inputs = context.request["inputs"]
    committed = [
        _commit_prepared_input(
            context,
            "reaction-input",
            paths["reaction_input"],
            inputs["reaction_input"],
        ),
        _commit_prepared_input(
            context,
            "route-input",
            paths["route_input"],
            inputs["route_input"],
        ),
    ]
    for index, reference in enumerate(
        inputs["standardization_artifacts"],
        start=1,
    ):
        committed.append(
            _commit_prepared_input(
                context,
                f"standardization-input-{index:04d}",
                paths[f"standardization_{index:04d}"],
                reference,
            )
        )
    if inputs["inventory_snapshot"] is not None:
        committed.append(
            _commit_prepared_input(
                context,
                "inventory-snapshot",
                paths["inventory_snapshot"],
                inputs["inventory_snapshot"],
            )
        )
    return CTX.NodeOutcome(
        "prepare-reaction-input",
        "succeeded",
        "completed",
        tuple(item["artifact_id"] for item in committed),
    )


def _adapter_input(
    context: Any,
    *,
    node_id: str,
    adapter_id: str,
    source_name: str,
    output_name: str,
    logical_name: str,
    validation_name: str,
) -> Any:
    attempt = CTX.attempt_dir(context, node_id)
    source = context.artifacts[source_name]
    return ADAPTER_NODES.NodeInput(
        node_id=node_id,
        adapter_id=adapter_id,
        command_context={
            "input_path": str(context.run_dir / source["relative_path"]),
            "output_path": str(attempt / f".{output_name}.tmp"),
        },
        output_path=attempt / output_name,
        logical_name=logical_name,
        validation_logical_name=validation_name,
        key_parameters={"source_artifact_id": source["artifact_id"]},
        upstream_names=(source_name,),
    )


def _curate(context: Any) -> Any:
    node_input = _adapter_input(
        context,
        node_id="curate-reactions",
        adapter_id="curate-reactions-v1",
        source_name="reaction-input",
        output_name="curated-reactions.json",
        logical_name="curated-reactions",
        validation_name="curate-validation",
    )
    return ADAPTER_NODES.execute_adapter_node(node_input, context)


def _discover(domain: Any, context: Any) -> Any:
    node_input = _adapter_input(
        context,
        node_id="discover-route-steps",
        adapter_id="review-routes-v1",
        source_name="route-input",
        output_name="route-discovery.json",
        logical_name="route-discovery",
        validation_name="route-discovery-validation",
    )
    adapter_outcome = ADAPTER_NODES.execute_adapter_node(
        node_input,
        context,
    )
    entry = context.artifacts["route-discovery"]
    document = CTX.read_json(context.run_dir / entry["relative_path"])
    steps = domain.discover_route_steps(document)
    path = CTX.attempt_dir(context, "discover-route-steps") / "route-steps.json"
    CTX.write_json(
        path,
        {
            "schema_version": "1.0.0",
            "workflow": "route-step-discovery",
            "source_artifact_id": entry["artifact_id"],
            "source_artifact_sha256": entry["sha256"],
            "steps": [item.as_json() for item in steps],
        },
    )
    key = CTX.execution_key(
        context,
        "discover-route-steps",
        {"step_count": len(steps)},
        ("route-discovery",),
    )
    derived = CTX.commit(
        context,
        node_id="discover-route-steps",
        logical_name="route-steps",
        path=path,
        media_type="application/json",
        execution_key_value=key,
        validation_artifact_id=None,
        domain_state="completed",
    )
    return CTX.NodeOutcome(
        "discover-route-steps",
        adapter_outcome.state,
        adapter_outcome.domain_state,
        (*adapter_outcome.artifact_ids, derived["artifact_id"]),
    )


def _bind(domain: Any, context: Any) -> Any:
    steps_entry = context.artifacts["route-steps"]
    curated_entry = context.artifacts["curated-reactions"]
    steps_document = CTX.read_json(context.run_dir / steps_entry["relative_path"])
    curated = CTX.read_json(context.run_dir / curated_entry["relative_path"])
    steps = [domain.RouteStep(**item) for item in steps_document["steps"]]
    bindings = domain.bind_curation_records(steps, curated)
    path = CTX.attempt_dir(context, "bind-curation-records") / (
        "curation-bindings.json"
    )
    CTX.write_json(
        path,
        {
            "schema_version": "1.0.0",
            "workflow": "route-curation-bindings",
            "route_steps_artifact_id": steps_entry["artifact_id"],
            "curation_artifact_id": curated_entry["artifact_id"],
            "bindings": [item.as_json() for item in bindings],
        },
    )
    key = CTX.execution_key(
        context,
        "bind-curation-records",
        {"binding_count": len(bindings)},
        ("route-steps", "curated-reactions"),
    )
    all_bound = all(item.binding_status == "bound" for item in bindings)
    entry = CTX.commit(
        context,
        node_id="bind-curation-records",
        logical_name="curation-bindings",
        path=path,
        media_type="application/json",
        execution_key_value=key,
        validation_artifact_id=None,
        domain_state="completed" if all_bound else "review_required",
    )
    return CTX.NodeOutcome(
        "bind-curation-records",
        "succeeded" if all_bound else "succeeded_with_review",
        entry["domain_state"],
        (entry["artifact_id"],),
    )


def execute_task10_node(domain: Any, node_id: str, context: Any) -> Any:
    if node_id == "prepare-reaction-input":
        return _prepare_inputs(domain, context)
    if node_id == "curate-reactions":
        return _curate(context)
    if node_id == "discover-route-steps":
        return _discover(domain, context)
    if node_id == "bind-curation-records":
        return _bind(domain, context)
    raise WorkflowBNodeError(f"unsupported Task 10 node: {node_id}")
