"""Workflow A request and execution facade."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Any, Callable


def _load_local_module(filename: str, module_name: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(
        module_name,
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


REQUEST = _load_local_module(
    "workflow_a_request.py",
    "workflow_a_request_contract",
)
NODES = _load_local_module(
    "workflow_a_nodes.py",
    "workflow_a_node_handlers",
)
LEDGER = _load_local_module(
    "event_ledger.py",
    "workflow_a_ledger",
)
STATE = _load_local_module(
    "workflow_state.py",
    "workflow_a_state",
)
REGISTRY = _load_local_module(
    "artifact_registry.py",
    "workflow_a_registry",
)
EVIDENCE = _load_local_module(
    "evidence_package.py",
    "workflow_a_evidence",
)


class WorkflowAError(ValueError):
    """Raised when Workflow A cannot execute safely."""


def validate_workflow_a_request(value: Any) -> dict[str, Any]:
    try:
        return REQUEST.validate_workflow_a_request(value)
    except REQUEST.WorkflowARequestError as error:
        raise WorkflowAError(str(error)) from error


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
    NODES.CTX.write_json(context.run_dir / "run_manifest.json", manifest)
    return manifest


def _terminal_event(state: str) -> str:
    return {
        "succeeded": "node_succeeded",
        "succeeded_with_review": "node_review_required",
        "blocked": "node_blocked",
    }[state]


def _write_snapshot(
    context: Any,
    *,
    with_checksums: bool,
) -> dict[str, Any]:
    manifest = _write_manifest(context)
    events = LEDGER.read_verified_events(
        context.run_dir / "events.jsonl",
        context.run_id,
    )
    index = REGISTRY.rebuild_artifact_index(events)
    NODES.CTX.write_json(
        context.run_dir / "artifacts" / "index.json",
        index,
    )
    artifacts = index["artifacts"]
    EVIDENCE.write_workflow_package(
        run_dir=context.run_dir,
        workflow_id="compound-evidence-v1",
        run_status=manifest["run_status"],
        events=events,
        artifacts=artifacts,
        with_checksums=with_checksums,
    )
    return manifest


def _finish_run(context: Any, event_type: str) -> dict[str, Any]:
    context.append_event(event_type, None, None, {})
    try:
        manifest = _write_snapshot(context, with_checksums=True)
    except Exception as error:
        context.append_event(
            "integrity_failed",
            None,
            None,
            {"error_type": type(error).__name__},
        )
        manifest = _write_manifest(context)
    return manifest


def _checkpoint_run(context: Any) -> dict[str, Any]:
    try:
        return _write_snapshot(context, with_checksums=True)
    except Exception as error:
        context.append_event(
            "integrity_failed",
            None,
            None,
            {"error_type": type(error).__name__},
        )
        return _write_manifest(context)


def _execute_node(
    node_id: str,
    context: Any,
    after_node: Callable[[str], None] | None,
    current_state: str,
    attempt: int,
) -> Any:
    context.attempts[node_id] = attempt
    if current_state == "pending":
        context.append_event("node_ready", node_id, attempt, {})
    context.append_event("node_started", node_id, attempt, {})
    try:
        outcome = NODES.execute_workflow_a_node(node_id, context)
    except Exception as error:
        context.append_event(
            "node_failed_execution",
            node_id,
            attempt,
            {"error_type": type(error).__name__},
        )
        if after_node is not None:
            after_node(node_id)
        return None
    if outcome.state == "awaiting_human":
        context.append_event(
            "gate_requested",
            node_id,
            attempt,
            outcome.event_payload or {},
        )
    else:
        context.append_event(
            _terminal_event(outcome.state),
            node_id,
            attempt,
            {"domain_state": outcome.domain_state},
        )
    if after_node is not None:
        after_node(node_id)
    return outcome


def _next_attempt(
    events: list[dict[str, Any]],
    node_id: str,
) -> int:
    return (
        sum(
            event.get("event_type") == "node_started"
            and event.get("node_id") == node_id
            for event in events
        )
        + 1
    )


def _skip_optional_library(
    context: Any,
    node_id: str,
    current_state: str,
    after_node: Callable[[str], None] | None,
) -> bool:
    if (
        node_id != "optional-library-operation"
        or context.request["inputs"]["library_operation"] is not None
    ):
        return False
    if current_state != "pending":
        raise WorkflowAError("library skip node is not pending")
    context.append_event(
        "node_skipped",
        node_id,
        None,
        {"condition_id": "library-operation-present"},
    )
    if after_node is not None:
        after_node(node_id)
    return True


def _run_definition_nodes(
    context: Any,
    events: list[dict[str, Any]],
    manifest: dict[str, Any],
    after_node: Callable[[str], None] | None,
) -> dict[str, Any]:
    requires_review = "succeeded_with_review" in set(manifest["node_states"].values())
    for node in context.definition["nodes"]:
        node_id = node["node_id"]
        current_state = manifest["node_states"].get(node_id, "pending")
        if current_state in {"succeeded", "succeeded_with_review", "skipped"}:
            continue
        if current_state == "awaiting_human":
            return _checkpoint_run(context)
        if _skip_optional_library(
            context,
            node_id,
            current_state,
            after_node,
        ):
            continue
        if current_state not in {"pending", "ready"}:
            raise WorkflowAError(
                f"node cannot execute from state: {node_id}={current_state}"
            )
        outcome = _execute_node(
            node_id,
            context,
            after_node,
            current_state,
            _next_attempt(events, node_id),
        )
        if outcome is None:
            return _finish_run(context, "run_failed_execution")
        if outcome.state == "awaiting_human":
            return _checkpoint_run(context)
        if outcome.state == "blocked":
            return _finish_run(context, "run_blocked")
        requires_review = requires_review or outcome.state == "succeeded_with_review"
    return _finish_run(
        context,
        "run_completed_with_review" if requires_review else "run_completed",
    )


def run_workflow_a(
    *,
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
        raise WorkflowAError("Workflow A ledger is empty")
    index = REGISTRY.rebuild_artifact_index(events)
    context = NODES.CTX.ExecutionContext(
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
        artifacts={item["logical_name"]: item for item in index["artifacts"]},
    )
    manifest = STATE.rebuild_run_manifest(events, definition)
    return _run_definition_nodes(
        context,
        events,
        manifest,
        after_node,
    )


NodeInput = NODES.ADAPTER_NODES.NodeInput
NodeOutcome = NODES.CTX.NodeOutcome
build_workflow_a_node_input = NODES.build_workflow_a_node_input
execute_workflow_a_node = NODES.execute_workflow_a_node
