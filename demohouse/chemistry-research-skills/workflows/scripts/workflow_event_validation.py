"""Cross-event semantic checks for Workflow node execution."""

from __future__ import annotations

from typing import Any


NODE_ADAPTERS = {
    "resolve-identities": "resolve-chemical-identities-v1",
    "standardize-structures": "standardize-chemical-structures-v1",
    "compute-features": "compute-molecular-features-v1",
    "optional-library-operation": "search-and-curate-chemical-libraries-v1",
    "curate-reactions": "curate-reactions-v1",
    "discover-route-steps": "review-routes-v1",
    "review-routes": "review-routes-v1",
}
NODE_TERMINALS = {
    "node_succeeded",
    "node_review_required",
    "node_blocked",
    "node_failed_execution",
}


def _indices(
    events: list[dict[str, Any]],
    node_id: str,
    event_type: str,
    attempt: int,
) -> list[int]:
    return [
        index
        for index, event in enumerate(events)
        if event.get("node_id") == node_id
        and event.get("event_type") == event_type
        and event.get("attempt") == attempt
    ]


def _terminal_indices(
    events: list[dict[str, Any]],
    node_id: str,
    attempt: int,
) -> list[int]:
    return [
        index
        for index, event in enumerate(events)
        if event.get("node_id") == node_id
        and event.get("event_type") in NODE_TERMINALS
        and event.get("attempt") == attempt
    ]


def _interrupted_attempt_errors(
    events: list[dict[str, Any]],
    node_id: str,
    attempt: int,
    *,
    awaiting: bool,
) -> list[str]:
    starts = _indices(events, node_id, "node_started", attempt)
    processes = _indices(events, node_id, "process_finished", attempt)
    validations = _indices(events, node_id, "validation_finished", attempt)
    terminals = _terminal_indices(events, node_id, attempt)
    marker_types = (
        {"gate_requested"} if awaiting else {"node_retry_authorized", "gate_resolved"}
    )
    markers = [
        index
        for index, event in enumerate(events)
        if event.get("node_id") == node_id
        and event.get("event_type") in marker_types
        and event.get("attempt") == attempt
    ]
    invalid = (
        len(starts) != 1
        or processes
        or validations
        or terminals
        or len(markers) != 1
        or starts[0] >= markers[0]
    )
    return [f"{node_id} interrupted attempt is invalid"] if invalid else []


def _completed_attempt_errors(
    events: list[dict[str, Any]],
    node_id: str,
    state: str,
    adapter: Any,
    attempt: int,
) -> list[str]:
    errors: list[str] = []
    starts = _indices(events, node_id, "node_started", attempt)
    processes = _indices(events, node_id, "process_finished", attempt)
    validations = _indices(events, node_id, "validation_finished", attempt)
    terminals = _terminal_indices(events, node_id, attempt)
    if (
        state == "failed_execution"
        and len(starts) == 1
        and not processes
        and len(terminals) == 1
    ):
        return (
            [f"{node_id} failure event order is invalid"]
            if starts[0] >= terminals[0]
            else []
        )
    if len(starts) != 1 or len(processes) != 1 or len(terminals) != 1:
        return [f"{node_id} process event cardinality is invalid"]
    process = events[processes[0]]
    returncode = process.get("payload", {}).get("returncode")
    if state == "failed_execution":
        if isinstance(returncode, bool) or not isinstance(returncode, int):
            errors.append(f"{node_id} failed process exit code is invalid")
        if not starts[0] < processes[0] < terminals[0]:
            errors.append(f"{node_id} failure event order is invalid")
        return errors
    if (
        isinstance(returncode, bool)
        or not isinstance(returncode, int)
        or returncode not in adapter.accepted_completion_codes
    ):
        errors.append(f"{node_id} process exit code is not accepted")
    if len(validations) != 1:
        errors.append(f"{node_id} validation event cardinality is invalid")
    else:
        validation = events[validations[0]]
        if validation.get("payload", {}).get("valid") is not True:
            errors.append(f"{node_id} validation event is not successful")
        if not starts[0] < processes[0] < validations[0] < terminals[0]:
            errors.append(f"{node_id} process/validation event order is invalid")
    return errors


def _node_process_errors(
    events: list[dict[str, Any]],
    node_id: str,
    state: str,
    adapter: Any,
) -> list[str]:
    attempts = sorted(
        {
            event["attempt"]
            for event in events
            if event.get("event_type") == "node_started"
            and event.get("node_id") == node_id
            and isinstance(event.get("attempt"), int)
        }
    )
    if not attempts:
        return [f"{node_id} process event cardinality is invalid"]
    errors = []
    for attempt in attempts[:-1]:
        errors.extend(
            _interrupted_attempt_errors(
                events,
                node_id,
                attempt,
                awaiting=False,
            )
        )
    if state == "awaiting_human":
        errors.extend(
            _interrupted_attempt_errors(
                events,
                node_id,
                attempts[-1],
                awaiting=True,
            )
        )
        return errors
    errors.extend(
        _completed_attempt_errors(
            events,
            node_id,
            state,
            adapter,
            attempts[-1],
        )
    )
    return errors


def process_errors(
    events: list[dict[str, Any]],
    node_states: dict[str, str],
    adapters: dict[str, Any],
) -> list[str]:
    errors: list[str] = []
    for node_id, adapter_id in NODE_ADAPTERS.items():
        if node_id not in node_states or node_states[node_id] == "skipped":
            continue
        errors.extend(
            _node_process_errors(
                events,
                node_id,
                node_states[node_id],
                adapters[adapter_id],
            )
        )
    if "search-precedents-per-step" in node_states:
        errors.extend(
            _fanout_process_errors(
                events,
                node_states["search-precedents-per-step"],
                adapters["search-reactions-v1"],
            )
        )
    return errors


def _step_event_key(event: dict[str, Any]) -> tuple[Any, Any, Any]:
    payload = event.get("payload")
    payload = payload if isinstance(payload, dict) else {}
    return (
        payload.get("route_id"),
        payload.get("step_id"),
        payload.get("step_reaction_hash"),
    )


def _valid_step_key(key: tuple[Any, Any, Any]) -> bool:
    route_id, step_id, reaction_hash = key
    return (
        isinstance(route_id, str)
        and bool(route_id)
        and isinstance(step_id, str)
        and bool(step_id)
        and isinstance(reaction_hash, str)
        and len(reaction_hash) == 64
        and all(character in "0123456789abcdef" for character in reaction_hash)
    )


def _fanout_process_errors(
    events: list[dict[str, Any]],
    state: str,
    adapter: Any,
) -> list[str]:
    node_id = "search-precedents-per-step"
    starts = _indices(events, node_id, "node_started", 1)
    terminals = _terminal_indices(events, node_id, 1)
    processes = _indices(events, node_id, "process_finished", 1)
    validations = _indices(events, node_id, "validation_finished", 1)
    if len(starts) != 1 or len(terminals) != 1:
        return ["search fan-out node event cardinality is invalid"]
    if state == "failed_execution":
        return (
            []
            if starts[0] < terminals[0]
            else ["search fan-out failure event order is invalid"]
        )
    if len(processes) != len(validations):
        return ["search fan-out process/validation cardinality mismatch"]
    errors = []
    seen: set[tuple[Any, Any, Any]] = set()
    for process_index, validation_index in zip(processes, validations, strict=True):
        process = events[process_index]
        validation = events[validation_index]
        process_key = _step_event_key(process)
        validation_key = _step_event_key(validation)
        if (
            not _valid_step_key(process_key)
            or process_key != validation_key
            or process_key in seen
        ):
            errors.append("search fan-out step event binding is invalid")
        seen.add(process_key)
        returncode = process.get("payload", {}).get("returncode")
        valid = validation.get("payload", {}).get("valid")
        if isinstance(returncode, bool) or not isinstance(returncode, int):
            errors.append("search fan-out process exit code is invalid")
        elif valid is True and returncode not in adapter.accepted_completion_codes:
            errors.append("search fan-out process exit code is not accepted")
        if not isinstance(valid, bool):
            errors.append("search fan-out validation status is invalid")
        if not (starts[0] < process_index < validation_index < terminals[0]):
            errors.append("search fan-out event order is invalid")
    return errors
