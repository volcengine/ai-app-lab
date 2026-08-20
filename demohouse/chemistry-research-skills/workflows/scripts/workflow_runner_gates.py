"""Persist and bind HumanDecision documents during workflow resume."""

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


CONTRACTS = _load_local_module(
    "workflow_contracts.py",
    "workflow_runner_gates_contracts",
)
LEDGER = _load_local_module(
    "event_ledger.py",
    "workflow_runner_gates_ledger",
)
REGISTRY = _load_local_module(
    "artifact_registry.py",
    "workflow_runner_gates_registry",
)
HUMAN = _load_local_module(
    "human_gate.py",
    "workflow_runner_gates_human",
)
EXECUTION = _load_local_module(
    "workflow_execution_key.py",
    "workflow_runner_gates_execution_key",
)


class GateResumeError(ValueError):
    """Raised when a decision cannot safely resolve the active gate."""


def _active_gate_event(
    events: list[dict[str, Any]],
    manifest: dict[str, Any],
) -> dict[str, Any]:
    awaiting = {
        node_id
        for node_id, state in manifest["node_states"].items()
        if state == "awaiting_human"
    }
    if len(awaiting) != 1:
        raise GateResumeError("run must have exactly one active human gate")
    node_id = next(iter(awaiting))
    matches = [
        event
        for event in events
        if event.get("event_type") == "gate_requested"
        and event.get("node_id") == node_id
    ]
    if not matches:
        raise GateResumeError("active gate has no gate_requested event")
    return matches[-1]


def _read_gate(
    run_dir: Path,
    event: dict[str, Any],
    manifest: dict[str, Any],
) -> dict[str, Any]:
    payload = event.get("payload")
    if not isinstance(payload, dict):
        raise GateResumeError("gate_requested payload is invalid")
    try:
        path = REGISTRY.validate_run_relative_path(
            run_dir,
            payload["request_path"],
        )
        gate = CONTRACTS.read_json_object(path, "gate request")
    except (
        KeyError,
        REGISTRY.ArtifactError,
        CONTRACTS.ContractError,
    ) as error:
        raise GateResumeError(f"gate request is invalid: {error}") from error
    if payload.get("gate_request_fingerprint") != CONTRACTS.sha256_json(gate):
        raise GateResumeError("gate request fingerprint mismatch")
    expected = {
        "run_id": manifest["run_id"],
        "request_fingerprint": manifest["request_fingerprint"],
        "node_id": event["node_id"],
        "gate_id": payload.get("gate_id"),
        "gate_type": payload.get("gate_type"),
        "source_artifact_id": payload.get("source_artifact_id"),
        "source_artifact_sha256": payload.get("source_artifact_sha256"),
    }
    for field, value in expected.items():
        if gate.get(field) != value:
            raise GateResumeError(f"{field} does not match active gate")
    return gate


def _source_artifact(
    run_dir: Path,
    events: list[dict[str, Any]],
    gate: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    artifacts = REGISTRY.rebuild_artifact_index(events)["artifacts"]
    entry = next(
        (
            item
            for item in artifacts
            if item["artifact_id"] == gate["source_artifact_id"]
        ),
        None,
    )
    if entry is None or entry["sha256"] != gate["source_artifact_sha256"]:
        raise GateResumeError("source Artifact does not match active gate")
    try:
        path = REGISTRY.verify_artifact(run_dir, entry)
        document = CONTRACTS.read_json_object(path, "gate source Artifact")
    except (
        REGISTRY.ArtifactError,
        CONTRACTS.ContractError,
    ) as error:
        raise GateResumeError(f"source Artifact is invalid: {error}") from error
    return entry, document


def _read_decision(
    decision_path: Path,
    gate: dict[str, Any],
    source_document: dict[str, Any],
) -> dict[str, Any]:
    try:
        value = CONTRACTS.read_json_object(
            decision_path,
            "HumanDecision",
        )
        return HUMAN.validate_human_decision(
            value,
            gate,
            source_document,
        )
    except (
        CONTRACTS.ContractError,
        HUMAN.HumanDecisionError,
    ) as error:
        raise GateResumeError(str(error)) from error


def _execution_key(
    repository_root: Path,
    manifest: dict[str, Any],
    event: dict[str, Any],
    gate: dict[str, Any],
    decision: dict[str, Any],
    source: dict[str, Any],
) -> str:
    return EXECUTION.compute_repository_execution_key(
        repository_root=repository_root,
        definition_fingerprint=manifest["definition_fingerprint"],
        node_id=event["node_id"],
        adapter=EXECUTION.internal_adapter(event["node_id"]),
        parameters={
            "gate_id": gate["gate_id"],
            "decision_fingerprint": decision["decision_fingerprint"],
        },
        upstream_artifacts=[
            {
                "artifact_id": source["artifact_id"],
                "sha256": source["sha256"],
            }
        ],
    )


def _decision_logical_name(gate_type: str) -> str:
    return {
        "identity_resolution": "identity-human-decision",
        "calculation_view": "calculation-view-human-decision",
    }[gate_type]


def resolve_active_gate(
    *,
    run_dir: Path,
    decision_path: Path,
    manifest: dict[str, Any],
    repository_root: Path,
) -> dict[str, Any]:
    events = LEDGER.read_verified_events(
        run_dir / "events.jsonl",
        manifest["run_id"],
    )
    event = _active_gate_event(events, manifest)
    gate = _read_gate(run_dir, event, manifest)
    source, source_document = _source_artifact(run_dir, events, gate)
    decision = _read_decision(decision_path, gate, source_document)
    relative_path = f"gates/{gate['gate_id']}/decision.json"
    REGISTRY.atomic_write_bytes(
        run_dir / relative_path,
        (CONTRACTS.canonical_json(decision) + "\n").encode("utf-8"),
    )
    entry = REGISTRY.commit_artifact(
        run_dir=run_dir,
        ledger_path=run_dir / "events.jsonl",
        run_id=manifest["run_id"],
        node_id=event["node_id"],
        attempt=event["attempt"],
        logical_name=_decision_logical_name(gate["gate_type"]),
        relative_path=relative_path,
        media_type="application/json",
        execution_key=_execution_key(
            repository_root,
            manifest,
            event,
            gate,
            decision,
            source,
        ),
        validation_artifact_id=None,
        domain_state="authorized",
        recorded_at_utc=decision["decided_at_utc"],
    )
    LEDGER.append_event(
        run_dir / "events.jsonl",
        {
            "schema_version": "1.0.0",
            "run_id": manifest["run_id"],
            "event_type": "gate_resolved",
            "node_id": event["node_id"],
            "attempt": event["attempt"],
            "recorded_at_utc": decision["decided_at_utc"],
            "payload": {
                "gate_id": gate["gate_id"],
                "decision_artifact_id": entry["artifact_id"],
                "decision_fingerprint": decision["decision_fingerprint"],
            },
        },
    )
    return entry
