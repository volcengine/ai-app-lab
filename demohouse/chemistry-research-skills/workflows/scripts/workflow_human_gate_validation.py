"""Independent gate, HumanDecision, and authorization checks."""

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
    "workflow_human_validation_contracts",
)
REGISTRY = _load_local_module(
    "artifact_registry.py",
    "workflow_human_validation_registry",
)
HUMAN = _load_local_module(
    "human_gate.py",
    "workflow_human_validation_gate",
)
RETRY_GATE = _load_local_module(
    "workflow_retry_gate.py",
    "workflow_human_validation_retry_gate",
)
DERIVED = _load_local_module(
    "workflow_human_artifact_validation.py",
    "workflow_human_validation_artifacts",
)
REQUEST_PAYLOAD_FIELDS = {
    "gate_id",
    "gate_type",
    "request_path",
    "gate_request_fingerprint",
    "source_artifact_id",
    "source_artifact_sha256",
}
GATE_COMMON_FIELDS = {
    "schema_version",
    "workflow",
    "run_id",
    "gate_id",
    "gate_type",
    "node_id",
    "request_fingerprint",
    "source_artifact_id",
    "source_artifact_sha256",
}
GATE_FIELDS = {
    "identity_resolution": GATE_COMMON_FIELDS | {"unresolved_requests"},
    "calculation_view": GATE_COMMON_FIELDS
    | {"available_views", "parent_missing_record_ids"},
}
DECISION_NAMES = {
    "identity_resolution": "identity-human-decision",
    "calculation_view": "calculation-view-human-decision",
}


def _exact(value: dict[str, Any], fields: set[str], label: str) -> None:
    CONTRACTS.require_exact_fields(value, fields, set(), label)


def _read_relative(
    run_dir: Path,
    relative_path: str,
    label: str,
) -> dict[str, Any]:
    path = REGISTRY.validate_run_relative_path(run_dir, relative_path)
    return CONTRACTS.read_json_object(path, label)


def _gate_request(
    run_dir: Path,
    manifest: dict[str, Any],
    event: dict[str, Any],
    by_id: dict[str, dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    payload = event["payload"]
    _exact(payload, REQUEST_PAYLOAD_FIELDS, "gate_requested payload")
    gate = _read_relative(run_dir, payload["request_path"], "gate request")
    gate_type = payload["gate_type"]
    if gate_type not in GATE_FIELDS:
        raise CONTRACTS.ContractError("gate type is unsupported")
    _exact(gate, GATE_FIELDS[gate_type], "gate request")
    expected = {
        "schema_version": "1.0.0",
        "workflow": "workflow-human-gate-request",
        "run_id": manifest["run_id"],
        "request_fingerprint": manifest["request_fingerprint"],
        "node_id": event["node_id"],
        "gate_id": payload["gate_id"],
        "gate_type": gate_type,
        "source_artifact_id": payload["source_artifact_id"],
        "source_artifact_sha256": payload["source_artifact_sha256"],
    }
    if any(gate.get(field) != value for field, value in expected.items()):
        raise CONTRACTS.ContractError("gate request binding mismatch")
    if payload["gate_request_fingerprint"] != CONTRACTS.sha256_json(gate):
        raise CONTRACTS.ContractError("gate request fingerprint mismatch")
    source = by_id.get(gate["source_artifact_id"])
    if source is None or source["sha256"] != gate["source_artifact_sha256"]:
        raise CONTRACTS.ContractError("gate source Artifact binding mismatch")
    return gate, source


def _resolution_event(
    events: list[dict[str, Any]],
    request: dict[str, Any],
) -> dict[str, Any] | None:
    matches = [
        event
        for event in events
        if event.get("event_type") == "gate_resolved"
        and event.get("node_id") == request["node_id"]
        and event.get("attempt") == request["attempt"]
        and event.get("sequence", 0) > request.get("sequence", 0)
    ]
    if len(matches) > 1:
        raise CONTRACTS.ContractError("gate has multiple resolutions")
    return matches[0] if matches else None


def _validate_resolution(
    run_dir: Path,
    gate: dict[str, Any],
    source: dict[str, Any],
    resolved: dict[str, Any],
    by_id: dict[str, dict[str, Any]],
) -> str:
    payload = resolved.get("payload")
    _exact(
        payload,
        {"gate_id", "decision_artifact_id", "decision_fingerprint"},
        "gate_resolved payload",
    )
    if payload["gate_id"] != gate["gate_id"]:
        raise CONTRACTS.ContractError("resolved gate ID mismatch")
    decision_entry = by_id.get(payload["decision_artifact_id"])
    expected_name = DECISION_NAMES[gate["gate_type"]]
    if decision_entry is None or decision_entry["logical_name"] != expected_name:
        raise CONTRACTS.ContractError("resolved decision Artifact is missing")
    decision = _read_relative(
        run_dir,
        decision_entry["relative_path"],
        "HumanDecision",
    )
    source_document = _read_relative(
        run_dir,
        source["relative_path"],
        "gate source Artifact",
    )
    HUMAN.validate_human_decision(decision, gate, source_document)
    if payload["decision_fingerprint"] != decision["decision_fingerprint"]:
        raise CONTRACTS.ContractError("resolved decision fingerprint mismatch")
    return decision_entry["artifact_id"]


def _gate_event_errors(
    run_dir: Path,
    manifest: dict[str, Any],
    events: list[dict[str, Any]],
    by_id: dict[str, dict[str, Any]],
) -> tuple[list[str], set[str]]:
    errors: list[str] = []
    bound_decisions: set[str] = set()
    requests = [
        event for event in events if event.get("event_type") == "gate_requested"
    ]
    for event in requests:
        if event.get("payload", {}).get("gate_type") == "external_retry":
            errors.extend(
                RETRY_GATE.retry_gate_errors(
                    run_dir=run_dir,
                    manifest=manifest,
                    events=events,
                    event=event,
                )
            )
            continue
        try:
            gate, source = _gate_request(run_dir, manifest, event, by_id)
            resolved = _resolution_event(events, event)
            if resolved is None:
                if manifest["node_states"].get(event["node_id"]) != "awaiting_human":
                    raise CONTRACTS.ContractError("unresolved gate state mismatch")
            else:
                bound_decisions.add(
                    _validate_resolution(
                        run_dir,
                        gate,
                        source,
                        resolved,
                        by_id,
                    )
                )
        except (
            KeyError,
            TypeError,
            CONTRACTS.ContractError,
            REGISTRY.ArtifactError,
            HUMAN.HumanDecisionError,
        ) as error:
            errors.append(f"human gate validation failed: {error}")
    decision_ids = {
        item["artifact_id"]
        for item in by_id.values()
        if item["logical_name"] in set(DECISION_NAMES.values())
    }
    if decision_ids != bound_decisions:
        errors.append("HumanDecision Artifacts do not match resolved gates")
    return errors, bound_decisions


def human_gate_errors(
    run_dir: Path,
    request: dict[str, Any],
    manifest: dict[str, Any],
    events: list[dict[str, Any]],
    artifacts: list[dict[str, Any]],
) -> list[str]:
    by_id = {item["artifact_id"]: item for item in artifacts}
    errors, _ = _gate_event_errors(
        run_dir,
        manifest,
        events,
        by_id,
    )
    errors.extend(
        DERIVED.derived_artifact_errors(
            run_dir,
            request,
            artifacts,
        )
    )
    return errors
