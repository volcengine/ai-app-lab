"""Workflow B final review, expert package, and package validation nodes."""

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
    "workflow_b_review_nodes_context",
)
ADAPTER_NODES = _load_local_module(
    "workflow_a_adapters.py",
    "workflow_b_review_nodes_adapters",
)
EVIDENCE = _load_local_module(
    "evidence_package.py",
    "workflow_b_review_nodes_evidence",
)
LEDGER = _load_local_module(
    "event_ledger.py",
    "workflow_b_review_nodes_ledger",
)


class WorkflowBReviewNodeError(ValueError):
    """Raised when final route review cannot complete safely."""


def _document(context: Any, logical_name: str) -> dict[str, Any]:
    entry = context.artifacts[logical_name]
    return CTX.read_json(context.run_dir / entry["relative_path"])


def _commit_json(
    context: Any,
    *,
    node_id: str,
    logical_name: str,
    filename: str,
    value: dict[str, Any],
    parameters: dict[str, Any],
    upstream_names: tuple[str, ...],
    domain_state: str,
) -> dict[str, Any]:
    path = CTX.attempt_dir(context, node_id) / filename
    CTX.write_json(path, value)
    key = CTX.execution_key(
        context,
        node_id,
        parameters,
        upstream_names,
    )
    return CTX.commit(
        context,
        node_id=node_id,
        logical_name=logical_name,
        path=path,
        media_type="application/json",
        execution_key_value=key,
        validation_artifact_id=None,
        domain_state=domain_state,
    )


def _final_review_request(context: Any) -> dict[str, Any]:
    request = _document(context, "route-input")
    assembled = _document(context, "assembled-step-artifacts")
    request["step_artifacts"] = assembled["step_artifacts"]
    workflow_inputs = context.request["inputs"]
    if workflow_inputs["inventory_snapshot"] is not None:
        request["inventory_snapshot"] = _document(
            context,
            "inventory-snapshot",
        )
    if workflow_inputs["constraints"]:
        request["constraints"] = workflow_inputs["constraints"]
    return request


def review_routes(_domain: Any, context: Any) -> Any:
    request = _final_review_request(context)
    request_entry = _commit_json(
        context,
        node_id="review-routes",
        logical_name="route-review-request",
        filename="route-review-request.json",
        value=request,
        parameters={
            "request_fingerprint": CTX.CONTRACTS.sha256_json(request),
        },
        upstream_names=("route-input", "assembled-step-artifacts"),
        domain_state="completed",
    )
    attempt = CTX.attempt_dir(context, "review-routes")
    node_input = ADAPTER_NODES.NodeInput(
        node_id="review-routes",
        adapter_id="review-routes-v1",
        command_context={
            "input_path": str(attempt / "route-review-request.json"),
            "output_path": str(attempt / ".route-review.json.tmp"),
        },
        output_path=attempt / "route-review.json",
        logical_name="route-review",
        validation_logical_name="route-review-validation",
        key_parameters={
            "request_artifact_id": request_entry["artifact_id"],
            "request_fingerprint": CTX.CONTRACTS.sha256_json(request),
        },
        upstream_names=("route-review-request", "assembled-step-artifacts"),
    )
    return ADAPTER_NODES.execute_adapter_node(node_input, context)


def _route_summaries(review: dict[str, Any]) -> list[dict[str, Any]]:
    output = []
    for route in review.get("route_summaries", []):
        if not isinstance(route, dict):
            raise WorkflowBReviewNodeError("route review summary is invalid")
        output.append(
            {
                "route_id": route.get("route_id"),
                "route_signature": route.get("route_signature"),
                "review_status": route.get("review_status"),
                "disposition": route.get("disposition"),
                "step_count": route.get("step_count"),
                "weakest_step_count": len(route.get("weakest_steps") or []),
            }
        )
    if not output:
        raise WorkflowBReviewNodeError("route review has no route summaries")
    return output


def _write_running_package(context: Any) -> None:
    events = LEDGER.read_verified_events(
        context.run_dir / "events.jsonl",
        context.run_id,
    )
    artifacts = CTX.REGISTRY.rebuild_artifact_index(events)["artifacts"]
    EVIDENCE.write_workflow_package(
        run_dir=context.run_dir,
        workflow_id="route-evidence-review-v1",
        run_status="running",
        events=events,
        artifacts=artifacts,
        with_checksums=False,
    )


def build_expert_package(_domain: Any, context: Any) -> Any:
    review_entry = context.artifacts["route-review"]
    review = _document(context, "route-review")
    routes = _route_summaries(review)
    review_required = any(
        item["disposition"] != "ready_for_expert_review" for item in routes
    )
    entry = _commit_json(
        context,
        node_id="build-expert-review-package",
        logical_name="expert-review-package",
        filename="expert-review-package.json",
        value={
            "schema_version": "1.0.0",
            "workflow": "route-expert-review-package",
            "route_review_artifact_id": review_entry["artifact_id"],
            "route_review_artifact_sha256": review_entry["sha256"],
            "routes": routes,
            "limitations": [
                "not_ready_for_experiment",
                "not_safety_approval",
            ],
        },
        parameters={"route_count": len(routes)},
        upstream_names=("route-review",),
        domain_state="review_required" if review_required else "completed",
    )
    _write_running_package(context)
    return CTX.NodeOutcome(
        "build-expert-review-package",
        "succeeded_with_review" if review_required else "succeeded",
        entry["domain_state"],
        (entry["artifact_id"],),
    )


def validate_package(_domain: Any, context: Any) -> Any:
    package = {
        "evidence_index": CTX.read_json(context.run_dir / "evidence_index.json"),
        "claim_ledger": CTX.read_json(context.run_dir / "claim_ledger.json"),
    }
    report = EVIDENCE.validate_package(package)
    if report["valid"] is not True:
        raise WorkflowBReviewNodeError("workflow evidence package is invalid")
    return CTX.NodeOutcome(
        "validate-workflow",
        "succeeded",
        "completed",
    )
