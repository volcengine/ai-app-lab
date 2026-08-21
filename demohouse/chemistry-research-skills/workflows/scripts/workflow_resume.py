"""Locked resume orchestration for persisted Workflow A runs."""

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


CONTRACTS = _load_local_module(
    "workflow_contracts.py",
    "workflow_resume_contracts",
)
LEDGER = _load_local_module(
    "event_ledger.py",
    "workflow_resume_ledger",
)
REGISTRY = _load_local_module(
    "artifact_registry.py",
    "workflow_resume_registry",
)
STATE = _load_local_module(
    "workflow_state.py",
    "workflow_resume_state",
)
RECOVERY = _load_local_module(
    "workflow_recovery.py",
    "workflow_resume_recovery",
)
RUNNER_GATES = _load_local_module(
    "workflow_runner_gates.py",
    "workflow_resume_runner_gates",
)
RETRY_GATE = _load_local_module(
    "workflow_retry_gate.py",
    "workflow_resume_retry_gate",
)
WORKFLOW_A = _load_local_module(
    "workflow_a.py",
    "workflow_resume_a",
)
EVIDENCE = _load_local_module(
    "evidence_package.py",
    "workflow_resume_evidence",
)
VALIDATOR = _load_local_module(
    "validate_workflow.py",
    "workflow_resume_validator",
)
SUCCESS_RUN_STATES = {"completed", "completed_with_review"}
TERMINAL_RUN_STATES = SUCCESS_RUN_STATES | {
    "blocked",
    "failed_execution",
    "failed_integrity",
}


class ResumeError(ValueError):
    """Raised when a persisted run cannot resume safely."""


class ResumeDecisionError(ResumeError):
    """Raised when a supplied decision does not bind to the active gate."""


def _write_json(path: Path, value: dict[str, Any]) -> None:
    REGISTRY.atomic_write_bytes(
        path,
        (CONTRACTS.canonical_json(value) + "\n").encode("utf-8"),
    )


def _events(run_dir: Path, run_id: str) -> list[dict[str, Any]]:
    return LEDGER.read_verified_events(run_dir / "events.jsonl", run_id)


def _rebuild(
    run_dir: Path,
    run_id: str,
    definition: dict[str, Any],
) -> dict[str, Any]:
    manifest = STATE.rebuild_run_manifest(
        _events(run_dir, run_id),
        definition,
    )
    _write_json(run_dir / "run_manifest.json", manifest)
    return manifest


def _checkpoint(
    run_dir: Path,
    run_id: str,
    definition: dict[str, Any],
) -> dict[str, Any]:
    manifest = _rebuild(run_dir, run_id, definition)
    events = _events(run_dir, run_id)
    index = REGISTRY.rebuild_artifact_index(events)
    _write_json(run_dir / "artifacts/index.json", index)
    EVIDENCE.write_workflow_package(
        run_dir=run_dir,
        workflow_id=manifest["workflow_id"],
        run_status=manifest["run_status"],
        events=events,
        artifacts=index["artifacts"],
        with_checksums=True,
    )
    return manifest


def _integrity_errors(
    *,
    run_dir: Path,
    repository_root: Path,
    request: dict[str, Any],
    definition: dict[str, Any],
    manifest: dict[str, Any],
    events: list[dict[str, Any]],
) -> list[str]:
    if manifest["run_status"] in SUCCESS_RUN_STATES:
        errors = RECOVERY.completed_run_reuse_errors(
            run_dir=run_dir,
            repository_root=repository_root,
            request=request,
            definition=definition,
            manifest=manifest,
            events=events,
        )
    else:
        errors = RECOVERY.committed_artifact_errors(
            run_dir=run_dir,
            repository_root=repository_root,
            request=request,
            definition=definition,
            events=events,
        )
    errors.extend(
        RECOVERY.incomplete_commit_errors(
            manifest,
            events,
        )
    )
    if (run_dir / "workflow_report.json").is_file():
        report = VALIDATOR.validate_run_directory(
            run_dir,
            repository_root,
        )
        errors.extend(report["errors"])
    return list(dict.fromkeys(errors))


def _fail_integrity(
    run_dir: Path,
    manifest: dict[str, Any],
    definition: dict[str, Any],
    events: list[dict[str, Any]],
    errors: list[str],
) -> dict[str, Any]:
    LEDGER.append_event(
        run_dir / "events.jsonl",
        {
            "schema_version": "1.0.0",
            "run_id": manifest["run_id"],
            "event_type": "integrity_failed",
            "node_id": None,
            "attempt": None,
            "recorded_at_utc": events[-1]["recorded_at_utc"],
            "payload": {"error_count": len(errors)},
        },
    )
    return _rebuild(
        run_dir,
        manifest["run_id"],
        definition,
    )


def _run_workflow(
    *,
    run_dir: Path,
    repository_root: Path,
    request: dict[str, Any],
    definition: dict[str, Any],
    manifest: dict[str, Any],
    executor: Callable[..., Any] | None,
    after_node: Callable[[str], None] | None,
) -> dict[str, Any]:
    try:
        return WORKFLOW_A.run_workflow_a(
            run_dir=run_dir,
            repository_root=repository_root,
            request=request,
            definition=definition,
            run_id=manifest["run_id"],
            executor=executor,
            after_node=after_node,
        )
    except WORKFLOW_A.WorkflowAError as error:
        raise ResumeError(str(error)) from error


def _resolve_human_gate(
    *,
    run_dir: Path,
    repository_root: Path,
    manifest: dict[str, Any],
    decision_path: Path,
) -> None:
    if manifest["run_status"] != "awaiting_human":
        raise ResumeDecisionError("run is not awaiting a HumanDecision")
    events = _events(run_dir, manifest["run_id"])
    active = [
        event
        for event in events
        if event.get("event_type") == "gate_requested"
        and manifest["node_states"].get(event.get("node_id")) == "awaiting_human"
    ]
    if active and active[-1].get("payload", {}).get("gate_type") == "external_retry":
        try:
            RETRY_GATE.resolve_retry_gate(
                run_dir=run_dir,
                manifest=manifest,
                decision_path=decision_path,
            )
        except RETRY_GATE.RetryDecisionError as error:
            raise ResumeDecisionError(str(error)) from error
        return
    try:
        RUNNER_GATES.resolve_active_gate(
            run_dir=run_dir,
            decision_path=decision_path,
            manifest=manifest,
            repository_root=repository_root,
        )
    except RUNNER_GATES.GateResumeError as error:
        raise ResumeDecisionError(str(error)) from error


def _prepare_incomplete_node(
    *,
    run_dir: Path,
    request: dict[str, Any],
    definition: dict[str, Any],
    manifest: dict[str, Any],
    events: list[dict[str, Any]],
) -> tuple[dict[str, Any], bool]:
    recoverable = RECOVERY.running_node(manifest)
    if recoverable is None:
        return manifest, False
    node_id, state = recoverable
    if state == "ready":
        return manifest, True
    RECOVERY.reconcile_orphan_attempts(run_dir, events)
    if RECOVERY.is_external_node(node_id, request):
        RECOVERY.pause_external_retry(
            run_dir=run_dir,
            manifest=manifest,
            events=events,
            node_id=node_id,
        )
        return _checkpoint(
            run_dir,
            manifest["run_id"],
            definition,
        ), False
    RECOVERY.authorize_offline_retry(
        run_dir=run_dir,
        manifest=manifest,
        events=events,
        node_id=node_id,
    )
    return _rebuild(run_dir, manifest["run_id"], definition), True


def resume_manifest(
    *,
    run_dir: Path,
    repository_root: Path,
    request: dict[str, Any],
    definition: dict[str, Any],
    manifest: dict[str, Any],
    decision_path: Path | None,
    executor: Callable[..., Any] | None,
    after_node: Callable[[str], None] | None,
) -> dict[str, Any]:
    if manifest["run_status"] == "failed_integrity":
        return manifest
    if (
        manifest["run_status"] == "running"
        and "ready" in manifest["node_states"].values()
    ):
        manifest = _checkpoint(
            run_dir,
            manifest["run_id"],
            definition,
        )
    events = _events(run_dir, manifest["run_id"])
    errors = _integrity_errors(
        run_dir=run_dir,
        repository_root=repository_root,
        request=request,
        definition=definition,
        manifest=manifest,
        events=events,
    )
    if errors:
        return _fail_integrity(run_dir, manifest, definition, events, errors)
    if decision_path is not None:
        _resolve_human_gate(
            run_dir=run_dir,
            repository_root=repository_root,
            manifest=manifest,
            decision_path=decision_path,
        )
        manifest = _checkpoint(
            run_dir,
            manifest["run_id"],
            definition,
        )
        return _run_workflow(
            run_dir=run_dir,
            repository_root=repository_root,
            request=request,
            definition=definition,
            manifest=manifest,
            executor=executor,
            after_node=after_node,
        )
    if manifest["run_status"] in TERMINAL_RUN_STATES | {"awaiting_human"}:
        return manifest
    manifest, should_run = _prepare_incomplete_node(
        run_dir=run_dir,
        request=request,
        definition=definition,
        manifest=manifest,
        events=events,
    )
    if not should_run:
        return manifest
    return _run_workflow(
        run_dir=run_dir,
        repository_root=repository_root,
        request=request,
        definition=definition,
        manifest=manifest,
        executor=executor,
        after_node=after_node,
    )
