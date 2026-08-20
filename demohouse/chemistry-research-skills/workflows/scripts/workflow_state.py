"""Authoritative state transitions for workflow runs and nodes."""

from __future__ import annotations

from typing import Any


NODE_STATES = {
    "pending",
    "ready",
    "running",
    "succeeded",
    "succeeded_with_review",
    "awaiting_human",
    "blocked",
    "failed_execution",
    "failed_integrity",
    "skipped",
}
RUN_STATES = {
    "created",
    "running",
    "awaiting_human",
    "completed",
    "completed_with_review",
    "blocked",
    "failed_execution",
    "failed_integrity",
}
NODE_TERMINAL_STATES = {
    "succeeded",
    "succeeded_with_review",
    "blocked",
    "failed_execution",
    "failed_integrity",
    "skipped",
}
RUN_TERMINAL_STATES = {
    "completed",
    "completed_with_review",
    "blocked",
    "failed_execution",
    "failed_integrity",
}
NODE_TRANSITIONS = {
    ("pending", "dependencies_satisfied"): "ready",
    ("pending", "condition_false"): "skipped",
    ("ready", "node_started"): "running",
    ("running", "node_succeeded"): "succeeded",
    ("running", "node_review_required"): "succeeded_with_review",
    ("running", "gate_requested"): "awaiting_human",
    ("running", "retry_authorized"): "ready",
    ("running", "node_blocked"): "blocked",
    ("running", "node_failed_execution"): "failed_execution",
    ("awaiting_human", "gate_resolved_continue"): "ready",
    ("awaiting_human", "gate_resolved_block"): "blocked",
}
RUN_TRANSITIONS = {
    ("created", "run_started"): "running",
    ("running", "gate_requested"): "awaiting_human",
    ("awaiting_human", "gate_resolved"): "running",
    ("running", "run_completed"): "completed",
    ("running", "run_completed_with_review"): "completed_with_review",
    ("running", "run_blocked"): "blocked",
    ("running", "run_failed_execution"): "failed_execution",
}


class StateTransitionError(ValueError):
    """Raised when a workflow state transition is illegal."""


def _transition(
    current: str,
    event_type: str,
    *,
    states: set[str],
    terminal_states: set[str],
    transitions: dict[tuple[str, str], str],
    label: str,
) -> str:
    if current not in states:
        raise StateTransitionError(f"unknown {label} state: {current}")
    if event_type == "integrity_failed" and current != "failed_integrity":
        return "failed_integrity"
    if current in terminal_states:
        raise StateTransitionError(f"{label} state is terminal: {current}")
    target = transitions.get((current, event_type))
    if target is None:
        raise StateTransitionError(
            f"illegal {label} transition: {current} + {event_type}"
        )
    return target


def transition_node(current: str, event_type: str) -> str:
    return _transition(
        current,
        event_type,
        states=NODE_STATES,
        terminal_states=NODE_TERMINAL_STATES,
        transitions=NODE_TRANSITIONS,
        label="node",
    )


def transition_run(current: str, event_type: str) -> str:
    return _transition(
        current,
        event_type,
        states=RUN_STATES,
        terminal_states=RUN_TERMINAL_STATES,
        transitions=RUN_TRANSITIONS,
        label="run",
    )


NODE_EVENT_TRANSITIONS = {
    "node_ready": "dependencies_satisfied",
    "node_started": "node_started",
    "node_skipped": "condition_false",
    "node_succeeded": "node_succeeded",
    "node_review_required": "node_review_required",
    "node_blocked": "node_blocked",
    "node_failed_execution": "node_failed_execution",
    "node_retry_authorized": "retry_authorized",
    "gate_requested": "gate_requested",
    "gate_resolved": "gate_resolved_continue",
}
RUN_EVENT_TRANSITIONS = {
    "run_started": "run_started",
    "gate_requested": "gate_requested",
    "gate_resolved": "gate_resolved",
    "run_completed": "run_completed",
    "run_completed_with_review": "run_completed_with_review",
    "run_blocked": "run_blocked",
    "run_failed_execution": "run_failed_execution",
}


def _apply_node_event(
    states: dict[str, str],
    event: dict[str, Any],
    known_node_ids: set[str],
) -> None:
    node_id = event.get("node_id")
    if not isinstance(node_id, str):
        raise StateTransitionError("node event requires node_id")
    if node_id not in known_node_ids:
        raise StateTransitionError(f"node event references unknown node: {node_id}")
    current = states.get(node_id, "pending")
    transition_event = NODE_EVENT_TRANSITIONS[event["event_type"]]
    states[node_id] = transition_node(current, transition_event)


def rebuild_run_manifest(
    events: list[dict[str, Any]],
    definition: dict[str, Any],
) -> dict[str, Any]:
    if not events or events[0].get("event_type") != "run_created":
        raise StateTransitionError("ledger must begin with run_created")
    created = events[0]
    payload = created.get("payload")
    if not isinstance(payload, dict):
        raise StateTransitionError("run_created payload must be an object")
    run_status = "created"
    node_states: dict[str, str] = {}
    known_node_ids = {
        node["node_id"]
        for node in definition.get("nodes", [])
        if isinstance(node, dict) and isinstance(node.get("node_id"), str)
    }
    for event in events[1:]:
        event_type = event["event_type"]
        if event_type in NODE_EVENT_TRANSITIONS:
            _apply_node_event(node_states, event, known_node_ids)
        if event_type in RUN_EVENT_TRANSITIONS:
            run_status = transition_run(
                run_status,
                RUN_EVENT_TRANSITIONS[event_type],
            )
        if event_type == "integrity_failed":
            run_status = transition_run(run_status, "integrity_failed")
    definition_fingerprint = definition.get("definition_fingerprint")
    if payload.get("definition_fingerprint") != definition_fingerprint:
        raise StateTransitionError("definition fingerprint does not match ledger")
    return {
        "schema_version": "1.0.0",
        "run_id": created["run_id"],
        "workflow_id": payload.get("workflow_id"),
        "request_fingerprint": payload.get("request_fingerprint"),
        "definition_fingerprint": definition_fingerprint,
        "run_status": run_status,
        "node_states": node_states,
        "event_count": len(events),
    }
