"""Integrity checks and interrupted-attempt recovery for Workflow runs."""

from __future__ import annotations

import importlib.util
import sys
from dataclasses import dataclass
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
    "workflow_recovery_contracts",
)
LEDGER = _load_local_module(
    "event_ledger.py",
    "workflow_recovery_ledger",
)
REGISTRY = _load_local_module(
    "artifact_registry.py",
    "workflow_recovery_registry",
)
ADAPTERS = _load_local_module(
    "skill_adapters.py",
    "workflow_recovery_adapters",
)
EXECUTION_KEYS = _load_local_module(
    "workflow_execution_key_validation.py",
    "workflow_recovery_execution_key_validation",
)
OUTPUT_ADAPTERS = {
    "identity-result": "resolve-chemical-identities-v1",
    "standardized-structures": "standardize-chemical-structures-v1",
    "molecular-features": "compute-molecular-features-v1",
    "library-operation": "search-and-curate-chemical-libraries-v1",
}
SUCCESS_EVENTS = {"node_succeeded", "node_review_required", "node_skipped"}


@dataclass(frozen=True)
class ReuseDecision:
    reusable: bool
    reasons: tuple[str, ...]


class RecoveryError(ValueError):
    """Raised when persisted recovery state is ambiguous or unsafe."""


def _artifact_document(
    run_dir: Path,
    entry: dict[str, Any],
    label: str,
) -> dict[str, Any]:
    return CONTRACTS.read_json_object(
        run_dir / entry["relative_path"],
        label,
    )


def _validation_errors(
    run_dir: Path,
    repository_root: Path,
    artifacts: list[dict[str, Any]],
) -> list[str]:
    by_id = {item["artifact_id"]: item for item in artifacts}
    errors: list[str] = []
    for item in artifacts:
        adapter_id = OUTPUT_ADAPTERS.get(item["logical_name"])
        if adapter_id is None:
            continue
        validation = by_id.get(item["validation_artifact_id"])
        if validation is None:
            errors.append(f"{item['artifact_id']}: Validator binding is missing")
            continue
        try:
            adapter = ADAPTERS.ADAPTERS[adapter_id]
            path = REGISTRY.verify_artifact(run_dir, item)
            report = ADAPTERS.run_validator(
                adapter,
                path,
                repository_root=repository_root,
                timeout_seconds=180,
            )
            saved = _artifact_document(
                run_dir,
                validation,
                "saved Validator report",
            )
            document = _artifact_document(run_dir, item, "Skill Artifact")
            state = ADAPTERS.extract_domain_state(adapter, document)
        except (
            ADAPTERS.AdapterError,
            CONTRACTS.ContractError,
            REGISTRY.ArtifactError,
        ) as error:
            errors.append(f"{item['artifact_id']}: Validator failed: {error}")
            continue
        if saved != report:
            errors.append(f"{item['artifact_id']}: Validator report drift")
        if state != item["domain_state"]:
            errors.append(f"{item['artifact_id']}: domain state drift")
    return errors


def committed_artifact_errors(
    *,
    run_dir: Path,
    repository_root: Path,
    request: dict[str, Any],
    definition: dict[str, Any],
    events: list[dict[str, Any]],
) -> list[str]:
    try:
        artifacts = REGISTRY.rebuild_artifact_index(events)["artifacts"]
    except REGISTRY.ArtifactError as error:
        return [str(error)]
    errors: list[str] = []
    for item in artifacts:
        try:
            REGISTRY.verify_artifact(run_dir, item)
        except REGISTRY.ArtifactError as error:
            errors.append(f"{item['artifact_id']}: {error}")
    if errors:
        return errors
    errors.extend(
        EXECUTION_KEYS.execution_key_errors(
            run_dir,
            repository_root,
            request,
            definition,
            artifacts,
        )
    )
    errors.extend(_validation_errors(run_dir, repository_root, artifacts))
    return errors


def incomplete_commit_errors(
    manifest: dict[str, Any],
    events: list[dict[str, Any]],
) -> list[str]:
    errors = []
    for node_id, state in manifest["node_states"].items():
        if state != "running":
            continue
        attempts = [
            event["attempt"]
            for event in events
            if event.get("event_type") == "node_started"
            and event.get("node_id") == node_id
        ]
        if not attempts:
            continue
        attempt = attempts[-1]
        if any(
            event.get("event_type") == "artifact_committed"
            and event.get("node_id") == node_id
            and event.get("attempt") == attempt
            for event in events
        ):
            errors.append(f"{node_id} incomplete attempt has committed Artifacts")
    return errors


def can_reuse_node(
    *,
    node_id: str,
    manifest: dict[str, Any],
    events: list[dict[str, Any]],
    errors: list[str],
) -> ReuseDecision:
    reasons = list(errors)
    state = manifest["node_states"].get(node_id)
    if state not in {"succeeded", "succeeded_with_review", "skipped"}:
        reasons.append("node has no successful terminal state")
    terminal = any(
        event.get("node_id") == node_id and event.get("event_type") in SUCCESS_EVENTS
        for event in events
    )
    if not terminal:
        reasons.append("node has no successful terminal event")
    return ReuseDecision(not reasons, tuple(reasons))


def completed_run_reuse_errors(
    *,
    run_dir: Path,
    repository_root: Path,
    request: dict[str, Any],
    definition: dict[str, Any],
    manifest: dict[str, Any],
    events: list[dict[str, Any]],
) -> list[str]:
    errors = committed_artifact_errors(
        run_dir=run_dir,
        repository_root=repository_root,
        request=request,
        definition=definition,
        events=events,
    )
    for node in definition["nodes"]:
        decision = can_reuse_node(
            node_id=node["node_id"],
            manifest=manifest,
            events=events,
            errors=[],
        )
        errors.extend(decision.reasons)
    return errors


def reconcile_orphan_attempts(
    run_dir: Path,
    events: list[dict[str, Any]],
) -> list[Path]:
    committed = {
        (event["node_id"], event["attempt"])
        for event in events
        if event.get("event_type") == "artifact_committed"
    }
    orphans = []
    nodes_dir = run_dir / "nodes"
    if not nodes_dir.is_dir():
        return orphans
    for path in sorted(nodes_dir.glob("*/attempt-*")):
        try:
            attempt = int(path.name.removeprefix("attempt-"))
        except ValueError:
            continue
        if (path.parent.name, attempt) not in committed:
            orphans.append(path)
    return orphans


def running_node(manifest: dict[str, Any]) -> tuple[str, str] | None:
    recoverable = [
        (node_id, state)
        for node_id, state in manifest["node_states"].items()
        if state in {"ready", "running"}
    ]
    if not recoverable:
        return None
    if len(recoverable) != 1:
        raise RecoveryError("run has multiple incomplete nodes")
    return recoverable[0]


def is_external_node(node_id: str, request: dict[str, Any]) -> bool:
    return (
        node_id == "resolve-identities"
        and request["execution_policy"]["network_mode"] == "public_http"
        and bool(request["inputs"]["identity"]["sources"])
    )


def _latest_attempt(
    events: list[dict[str, Any]],
    node_id: str,
) -> int:
    attempts = [
        event["attempt"]
        for event in events
        if event.get("event_type") == "node_started" and event.get("node_id") == node_id
    ]
    if not attempts or not isinstance(attempts[-1], int):
        raise RecoveryError("incomplete node has no valid attempt")
    return attempts[-1]


def pause_external_retry(
    *,
    run_dir: Path,
    manifest: dict[str, Any],
    events: list[dict[str, Any]],
    node_id: str,
) -> None:
    attempt = _latest_attempt(events, node_id)
    gate_id = f"gate-retry-{node_id}-{attempt:04d}"
    gate = {
        "schema_version": "1.0.0",
        "workflow": "workflow-retry-gate-request",
        "run_id": manifest["run_id"],
        "gate_id": gate_id,
        "gate_type": "external_retry",
        "node_id": node_id,
        "interrupted_attempt": attempt,
        "request_fingerprint": manifest["request_fingerprint"],
        "definition_fingerprint": manifest["definition_fingerprint"],
        "execution_class": "external",
    }
    relative_path = f"gates/{gate_id}/request.json"
    REGISTRY.atomic_write_bytes(
        run_dir / relative_path,
        (CONTRACTS.canonical_json(gate) + "\n").encode("utf-8"),
    )
    LEDGER.append_event(
        run_dir / "events.jsonl",
        {
            "schema_version": "1.0.0",
            "run_id": manifest["run_id"],
            "event_type": "gate_requested",
            "node_id": node_id,
            "attempt": attempt,
            "recorded_at_utc": events[-1]["recorded_at_utc"],
            "payload": {
                "gate_id": gate_id,
                "gate_type": "external_retry",
                "request_path": relative_path,
                "gate_request_fingerprint": CONTRACTS.sha256_json(gate),
                "interrupted_attempt": attempt,
            },
        },
    )


def authorize_offline_retry(
    *,
    run_dir: Path,
    manifest: dict[str, Any],
    events: list[dict[str, Any]],
    node_id: str,
) -> None:
    attempt = _latest_attempt(events, node_id)
    LEDGER.append_event(
        run_dir / "events.jsonl",
        {
            "schema_version": "1.0.0",
            "run_id": manifest["run_id"],
            "event_type": "node_retry_authorized",
            "node_id": node_id,
            "attempt": attempt,
            "recorded_at_utc": events[-1]["recorded_at_utc"],
            "payload": {
                "authorization": "offline_deterministic",
                "previous_attempt": attempt,
            },
        },
    )
