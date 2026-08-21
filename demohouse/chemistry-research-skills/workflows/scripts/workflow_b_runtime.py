"""Execution runtime for route-evidence-review-v1."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Any, Callable


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
    "workflow_b_runtime_context",
)
NODES = _load_local_module(
    "workflow_b_nodes.py",
    "workflow_b_runtime_nodes",
)
TASK11 = _load_local_module(
    "workflow_b_task11_nodes.py",
    "workflow_b_runtime_task11_nodes",
)
LEDGER = _load_local_module(
    "event_ledger.py",
    "workflow_b_runtime_ledger",
)
STATE = _load_local_module(
    "workflow_state.py",
    "workflow_b_runtime_state",
)
REGISTRY = _load_local_module(
    "artifact_registry.py",
    "workflow_b_runtime_registry",
)
EVIDENCE = _load_local_module(
    "evidence_package.py",
    "workflow_b_runtime_evidence",
)
TASK10_NODES = {
    "prepare-reaction-input",
    "curate-reactions",
    "discover-route-steps",
    "bind-curation-records",
}
TASK11_NODES = {
    "expand-search-plan",
    "search-precedents-per-step",
    "assemble-step-artifacts",
    "review-routes",
    "build-expert-review-package",
    "validate-workflow",
}


class WorkflowBRuntimeError(ValueError):
    """Raised when Workflow B cannot execute safely."""


def _stored_event(
    context: Any,
    event_type: str,
    node_id: str | None,
    attempt: int | None,
    payload: dict[str, Any],
) -> None:
    LEDGER.append_event(
        context.run_dir / "events.jsonl",
        {
            "schema_version": "1.0.0",
            "run_id": context.run_id,
            "event_type": event_type,
            "node_id": node_id,
            "attempt": attempt,
            "recorded_at_utc": context.recorded_at_utc,
            "payload": payload,
        },
    )


def _write_manifest(context: Any) -> dict[str, Any]:
    events = LEDGER.read_verified_events(
        context.run_dir / "events.jsonl",
        context.run_id,
    )
    manifest = STATE.rebuild_run_manifest(events, context.definition)
    CTX.write_json(context.run_dir / "run_manifest.json", manifest)
    return manifest


def _snapshot(context: Any, with_checksums: bool) -> dict[str, Any]:
    manifest = _write_manifest(context)
    events = LEDGER.read_verified_events(
        context.run_dir / "events.jsonl",
        context.run_id,
    )
    index = REGISTRY.rebuild_artifact_index(events)
    CTX.write_json(context.run_dir / "artifacts/index.json", index)
    EVIDENCE.write_workflow_package(
        run_dir=context.run_dir,
        workflow_id="route-evidence-review-v1",
        run_status=manifest["run_status"],
        events=events,
        artifacts=index["artifacts"],
        with_checksums=with_checksums,
    )
    return manifest


def _finish(context: Any, event_type: str) -> dict[str, Any]:
    context.append_event(event_type, None, None, {})
    try:
        return _snapshot(context, True)
    except Exception as error:
        context.append_event(
            "integrity_failed",
            None,
            None,
            {"error_type": type(error).__name__},
        )
        return _write_manifest(context)


def _terminal_event(state: str) -> str:
    return {
        "succeeded": "node_succeeded",
        "succeeded_with_review": "node_review_required",
        "blocked": "node_blocked",
    }[state]


def _execute_node(
    domain: Any,
    node_id: str,
    context: Any,
    after_node: Callable[[str], None] | None,
) -> Any:
    context.attempts[node_id] = 1
    context.append_event("node_ready", node_id, 1, {})
    context.append_event("node_started", node_id, 1, {})
    try:
        outcome = (
            NODES.execute_task10_node(domain, node_id, context)
            if node_id in TASK10_NODES
            else TASK11.execute_task11_node(domain, node_id, context)
        )
    except Exception as error:
        context.append_event(
            "node_failed_execution",
            node_id,
            1,
            {"error_type": type(error).__name__},
        )
        if after_node is not None:
            after_node(node_id)
        return None
    context.append_event(
        _terminal_event(outcome.state),
        node_id,
        1,
        {"domain_state": outcome.domain_state},
    )
    if after_node is not None:
        after_node(node_id)
    return outcome


def _run_nodes(
    domain: Any,
    context: Any,
    after_node: Callable[[str], None] | None,
) -> dict[str, Any]:
    requires_review = False
    final_review_blocked = False
    for node in context.definition["nodes"]:
        node_id = node["node_id"]
        if node_id not in TASK10_NODES | TASK11_NODES:
            raise WorkflowBRuntimeError(f"unsupported Workflow B node: {node_id}")
        outcome = _execute_node(domain, node_id, context, after_node)
        if outcome is None:
            return _finish(context, "run_failed_execution")
        if outcome.state == "blocked":
            if node_id != "review-routes":
                return _finish(context, "run_blocked")
            final_review_blocked = True
        requires_review |= outcome.state == "succeeded_with_review"
    if final_review_blocked:
        return _finish(context, "run_blocked")
    return _finish(
        context,
        "run_completed_with_review" if requires_review else "run_completed",
    )


def run_workflow_b(
    *,
    domain: Any,
    run_dir: Path,
    repository_root: Path,
    request: dict[str, Any],
    definition: dict[str, Any],
    run_id: str,
    executor: Callable[..., Any] | None,
    after_node: Callable[[str], None] | None,
) -> dict[str, Any]:
    events = LEDGER.read_verified_events(run_dir / "events.jsonl", run_id)
    if not events:
        raise WorkflowBRuntimeError("Workflow B ledger is empty")
    context = CTX.ExecutionContext(
        run_dir=run_dir,
        repository_root=repository_root,
        request=request,
        definition=definition,
        run_id=run_id,
        recorded_at_utc=events[0]["recorded_at_utc"],
        append_event=lambda event_type, node_id, attempt, payload: _stored_event(
            context,
            event_type,
            node_id,
            attempt,
            payload,
        ),
        executor=executor,
    )
    return _run_nodes(domain, context, after_node)
