"""Strict authorization contract for retrying interrupted external nodes."""

from __future__ import annotations

import importlib.util
import sys
from datetime import datetime
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
    "workflow_retry_gate_contracts",
)
LEDGER = _load_local_module(
    "event_ledger.py",
    "workflow_retry_gate_ledger",
)
REGISTRY = _load_local_module(
    "artifact_registry.py",
    "workflow_retry_gate_registry",
)
GATE_FIELDS = {
    "schema_version",
    "workflow",
    "run_id",
    "gate_id",
    "gate_type",
    "node_id",
    "interrupted_attempt",
    "request_fingerprint",
    "definition_fingerprint",
    "execution_class",
}
DECISION_FIELDS = {
    "schema_version",
    "run_id",
    "gate_id",
    "gate_type",
    "request_fingerprint",
    "definition_fingerprint",
    "node_id",
    "interrupted_attempt",
    "actor_type",
    "decided_at_utc",
    "action",
    "decision_fingerprint",
}


class RetryDecisionError(ValueError):
    """Raised when an external retry authorization is stale or malformed."""


def _exact(value: dict[str, Any], fields: set[str], label: str) -> None:
    try:
        CONTRACTS.require_exact_fields(value, fields, set(), label)
    except CONTRACTS.ContractError as error:
        raise RetryDecisionError(str(error)) from error


def _active_event(
    events: list[dict[str, Any]],
    manifest: dict[str, Any],
) -> dict[str, Any]:
    awaiting = {
        node_id
        for node_id, state in manifest["node_states"].items()
        if state == "awaiting_human"
    }
    matches = [
        event
        for event in events
        if event.get("event_type") == "gate_requested"
        and event.get("node_id") in awaiting
        and event.get("payload", {}).get("gate_type") == "external_retry"
    ]
    if len(awaiting) != 1 or not matches:
        raise RetryDecisionError("run has no unique external retry gate")
    return matches[-1]


def _read_gate(
    run_dir: Path,
    event: dict[str, Any],
    manifest: dict[str, Any],
) -> dict[str, Any]:
    payload = event["payload"]
    try:
        path = REGISTRY.validate_run_relative_path(
            run_dir,
            payload["request_path"],
        )
        gate = CONTRACTS.read_json_object(path, "retry gate request")
    except (
        KeyError,
        REGISTRY.ArtifactError,
        CONTRACTS.ContractError,
    ) as error:
        raise RetryDecisionError(f"retry gate request is invalid: {error}") from error
    _exact(gate, GATE_FIELDS, "retry gate request")
    attempt = gate["interrupted_attempt"]
    if isinstance(attempt, bool) or not isinstance(attempt, int) or attempt < 1:
        raise RetryDecisionError("interrupted_attempt must be a positive integer")
    if payload.get("gate_request_fingerprint") != CONTRACTS.sha256_json(gate):
        raise RetryDecisionError("retry gate request fingerprint mismatch")
    expected = {
        "run_id": manifest["run_id"],
        "request_fingerprint": manifest["request_fingerprint"],
        "definition_fingerprint": manifest["definition_fingerprint"],
        "node_id": event["node_id"],
        "interrupted_attempt": event["attempt"],
        "gate_id": payload.get("gate_id"),
        "gate_type": "external_retry",
    }
    for field, value in expected.items():
        if gate.get(field) != value:
            raise RetryDecisionError(f"{field} does not match retry gate")
    return gate


def _read_decision(
    decision_path: Path,
    gate: dict[str, Any],
) -> dict[str, Any]:
    try:
        value = CONTRACTS.read_json_object(
            decision_path,
            "retry authorization",
        )
    except CONTRACTS.ContractError as error:
        raise RetryDecisionError(str(error)) from error
    _exact(value, DECISION_FIELDS, "retry authorization")
    if value["schema_version"] != "1.0.0":
        raise RetryDecisionError("schema_version must be 1.0.0")
    attempt = value["interrupted_attempt"]
    if isinstance(attempt, bool) or not isinstance(attempt, int) or attempt < 1:
        raise RetryDecisionError("interrupted_attempt must be a positive integer")
    for field in (
        "run_id",
        "gate_id",
        "gate_type",
        "request_fingerprint",
        "definition_fingerprint",
        "node_id",
        "interrupted_attempt",
    ):
        if value[field] != gate[field]:
            raise RetryDecisionError(f"{field} does not match retry gate")
    _validate_decision_metadata(value)
    return value


def _validate_decision_metadata(value: dict[str, Any]) -> None:
    if value["actor_type"] not in {"user", "expert"}:
        raise RetryDecisionError("actor_type is unsupported")
    if value["action"] != "authorize_retry":
        raise RetryDecisionError("retry action is unsupported")
    decided_at = value["decided_at_utc"]
    try:
        if not isinstance(decided_at, str) or not decided_at.endswith("Z"):
            raise ValueError
        datetime.fromisoformat(decided_at.removesuffix("Z") + "+00:00")
    except ValueError as error:
        raise RetryDecisionError("decided_at_utc is invalid") from error
    fingerprint_value = {
        key: item for key, item in value.items() if key != "decision_fingerprint"
    }
    if value["decision_fingerprint"] != CONTRACTS.sha256_json(fingerprint_value):
        raise RetryDecisionError("decision_fingerprint mismatch")


def resolve_retry_gate(
    *,
    run_dir: Path,
    manifest: dict[str, Any],
    decision_path: Path,
) -> dict[str, Any]:
    events = LEDGER.read_verified_events(
        run_dir / "events.jsonl",
        manifest["run_id"],
    )
    event = _active_event(events, manifest)
    gate = _read_gate(run_dir, event, manifest)
    decision = _read_decision(decision_path, gate)
    relative_path = f"gates/{gate['gate_id']}/decision.json"
    REGISTRY.atomic_write_bytes(
        run_dir / relative_path,
        (CONTRACTS.canonical_json(decision) + "\n").encode("utf-8"),
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
                "authorization": "external_retry",
                "decision_fingerprint": decision["decision_fingerprint"],
            },
        },
    )
    return decision


def retry_gate_errors(
    *,
    run_dir: Path,
    manifest: dict[str, Any],
    events: list[dict[str, Any]],
    event: dict[str, Any],
) -> list[str]:
    try:
        gate = _read_gate(run_dir, event, manifest)
        resolved = [
            item
            for item in events
            if item.get("event_type") == "gate_resolved"
            and item.get("node_id") == event["node_id"]
            and item.get("attempt") == event["attempt"]
            and item.get("sequence", 0) > event.get("sequence", 0)
        ]
        if not resolved:
            if manifest["node_states"].get(event["node_id"]) != "awaiting_human":
                raise RetryDecisionError("unresolved retry gate state mismatch")
            return []
        if len(resolved) != 1:
            raise RetryDecisionError("retry gate has multiple resolutions")
        payload = resolved[0].get("payload")
        _exact(
            payload,
            {"gate_id", "authorization", "decision_fingerprint"},
            "retry gate_resolved payload",
        )
        if (
            payload["gate_id"] != gate["gate_id"]
            or payload["authorization"] != "external_retry"
        ):
            raise RetryDecisionError("retry resolution binding mismatch")
        decision = _read_decision(
            run_dir / f"gates/{gate['gate_id']}/decision.json",
            gate,
        )
        if payload["decision_fingerprint"] != decision["decision_fingerprint"]:
            raise RetryDecisionError("retry decision fingerprint mismatch")
    except (
        KeyError,
        TypeError,
        RetryDecisionError,
    ) as error:
        return [f"retry gate validation failed: {error}"]
    return []
