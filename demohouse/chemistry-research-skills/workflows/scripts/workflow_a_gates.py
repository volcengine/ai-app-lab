"""Human-gated nodes for Workflow A."""

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
    "workflow_a_gates_context",
)
HUMAN = _load_local_module(
    "human_gate.py",
    "workflow_a_gates_human",
)


def _write_gate_request(
    context: Any,
    gate: dict[str, Any],
) -> dict[str, Any]:
    relative_path = f"gates/{gate['gate_id']}/request.json"
    CTX.write_json(context.run_dir / relative_path, gate)
    return {
        "gate_id": gate["gate_id"],
        "gate_type": gate["gate_type"],
        "request_path": relative_path,
        "gate_request_fingerprint": CTX.CONTRACTS.sha256_json(gate),
        "source_artifact_id": gate["source_artifact_id"],
        "source_artifact_sha256": gate["source_artifact_sha256"],
    }


def _decision(
    context: Any,
    logical_name: str,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    entry = context.artifacts.get(logical_name)
    if entry is None:
        return None, None
    value = CTX.read_json(context.run_dir / entry["relative_path"])
    return entry, value


def _commit_authorized_structures(
    context: Any,
    value: Any,
    decision_entry: dict[str, Any] | None,
) -> Any:
    node_id = "identity-gate"
    path = CTX.attempt_dir(context, node_id) / "authorized-structure-input.json"
    document = value.as_json()
    CTX.write_json(path, document)
    upstream = ["identity-result"]
    if decision_entry is not None:
        upstream.append("identity-human-decision")
    key = CTX.execution_key(
        context,
        node_id,
        {
            "decision_artifact_id": (
                decision_entry["artifact_id"] if decision_entry is not None else None
            )
        },
        tuple(upstream),
    )
    entry = CTX.commit(
        context,
        node_id=node_id,
        logical_name="authorized-structure-input",
        path=path,
        media_type="application/json",
        execution_key_value=key,
        validation_artifact_id=None,
        domain_state=(
            "review_required" if document["excluded_request_ids"] else "completed"
        ),
    )
    state = (
        "blocked"
        if document["abort_run"] or not document["structures"]
        else (
            "succeeded_with_review" if document["excluded_request_ids"] else "succeeded"
        )
    )
    return CTX.NodeOutcome(
        node_id,
        state,
        entry["domain_state"],
        (entry["artifact_id"],),
    )


def identity_gate(context: Any) -> Any:
    source = context.artifacts["identity-result"]
    identity = CTX.read_json(context.run_dir / source["relative_path"])
    unresolved = HUMAN.DECISIONS.unresolved_request_ids(identity)
    decision_entry, decision = _decision(
        context,
        "identity-human-decision",
    )
    if unresolved and decision_entry is None:
        gate = HUMAN.build_identity_gate_request(
            run_id=context.run_id,
            request_fingerprint=CTX.CONTRACTS.sha256_json(context.request),
            source_artifact=source,
            identity_artifact=identity,
        )
        return CTX.NodeOutcome(
            "identity-gate",
            "awaiting_human",
            "review_required",
            event_payload=_write_gate_request(context, gate),
        )
    authorized = HUMAN.apply_identity_decision(
        identity,
        decision,
        source_artifact_id=source["artifact_id"],
        decision_artifact_id=(
            decision_entry["artifact_id"] if decision_entry is not None else None
        ),
    )
    return _commit_authorized_structures(
        context,
        authorized,
        decision_entry,
    )


def _selection_document(
    source: dict[str, Any],
    view: str,
    decision: dict[str, Any] | None,
) -> dict[str, Any]:
    return {
        "schema_version": "1.0.0",
        "workflow": "calculation-view-selection",
        "calculation_view": view,
        "source_artifact_id": source["artifact_id"],
        "source_artifact_sha256": source["sha256"],
        "decision_artifact_id": (
            decision["artifact_id"] if decision is not None else None
        ),
        "decision_artifact_sha256": (
            decision["sha256"] if decision is not None else None
        ),
    }


def _commit_selection(
    context: Any,
    source: dict[str, Any],
    view: str,
    decision: dict[str, Any] | None,
) -> Any:
    node_id = "calculation-view-gate"
    path = CTX.attempt_dir(context, node_id) / "calculation-view-selection.json"
    document = _selection_document(source, view, decision)
    CTX.write_json(path, document)
    upstream = ["standardized-structures"]
    if decision is not None:
        upstream.append("calculation-view-human-decision")
    key = CTX.execution_key(
        context,
        node_id,
        {
            "calculation_view": view,
            "decision_artifact_id": document["decision_artifact_id"],
        },
        tuple(upstream),
    )
    entry = CTX.commit(
        context,
        node_id=node_id,
        logical_name="calculation-view-selection",
        path=path,
        media_type="application/json",
        execution_key_value=key,
        validation_artifact_id=None,
        domain_state="completed",
    )
    return CTX.NodeOutcome(
        node_id,
        "succeeded",
        "completed",
        (entry["artifact_id"],),
    )


def calculation_view_gate(context: Any) -> Any:
    source = context.artifacts["standardized-structures"]
    standardized = CTX.read_json(context.run_dir / source["relative_path"])
    requested = context.request["inputs"]["features"]["calculation_view"]
    decision_entry, decision = _decision(
        context,
        "calculation-view-human-decision",
    )
    if requested is None and decision_entry is None:
        gate = HUMAN.build_view_gate_request(
            run_id=context.run_id,
            request_fingerprint=CTX.CONTRACTS.sha256_json(context.request),
            source_artifact=source,
            standardize_artifact=standardized,
        )
        return CTX.NodeOutcome(
            "calculation-view-gate",
            "awaiting_human",
            "review_required",
            event_payload=_write_gate_request(context, gate),
        )
    selected = (
        HUMAN.selected_calculation_view(decision) if decision is not None else requested
    )
    if selected is None:
        return CTX.NodeOutcome(
            "calculation-view-gate",
            "blocked",
            "blocked",
        )
    return _commit_selection(
        context,
        source,
        selected,
        decision_entry,
    )
