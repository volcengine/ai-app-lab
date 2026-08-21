"""File-backed workflow run initialization and recovery facade."""

from __future__ import annotations

import fcntl
import importlib.util
import os
import sys
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterator


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
    "workflow_runner_contracts",
)
DEFINITIONS = _load_local_module(
    "workflow_definition.py",
    "workflow_runner_definitions",
)
STATE = _load_local_module(
    "workflow_state.py",
    "workflow_runner_state",
)
LEDGER = _load_local_module(
    "event_ledger.py",
    "workflow_runner_ledger",
)
REGISTRY = _load_local_module(
    "artifact_registry.py",
    "workflow_runner_registry",
)
DISPATCH = _load_local_module(
    "workflow_dispatch.py",
    "workflow_runner_dispatch",
)
WORKFLOW_A = DISPATCH.WORKFLOW_A
RESUME = _load_local_module(
    "workflow_resume.py",
    "workflow_runner_resume",
)
RECOVERY = RESUME.RECOVERY
EXECUTION = _load_local_module(
    "workflow_execution_key.py",
    "workflow_runner_execution_key",
)


@dataclass(frozen=True)
class RunResult:
    status: str
    exit_code: int
    run_id: str
    run_dir: Path


class RunnerError(ValueError):
    """Raised when a run cannot be initialized or resumed."""


class RunnerBusyError(RunnerError):
    """Raised when another process owns the run lock."""


class RunnerIntegrityError(RunnerError):
    """Raised when persisted run state does not match the ledger."""


class HumanDecisionError(RunnerError):
    """Raised when a HumanDecision cannot resolve the active gate."""


def _format_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def make_run_id(
    request_fingerprint: str,
    now: datetime,
    random_hex: str,
) -> str:
    timestamp = now.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"run-{timestamp}-{request_fingerprint[:12]}-{random_hex[:8]}"


def _write_json(path: Path, value: dict[str, Any]) -> None:
    REGISTRY.atomic_write_bytes(
        path,
        (CONTRACTS.canonical_json(value) + "\n").encode("utf-8"),
    )


def _validated_request(path: Path) -> dict[str, Any]:
    try:
        value = CONTRACTS.read_json_object(path, "workflow request")
        return CONTRACTS.validate_common_request(value)
    except CONTRACTS.ContractError as error:
        raise RunnerError(str(error)) from error


def _validated_start_request(path: Path) -> dict[str, Any]:
    request = _validated_request(path)
    try:
        return DISPATCH.validate_request(request)
    except DISPATCH.WorkflowDispatchError as error:
        raise RunnerError(str(error)) from error


def _load_builtin_definition(
    workflow_id: str,
    repository_root: Path,
) -> dict[str, Any]:
    try:
        return DEFINITIONS.load_definition(workflow_id, repository_root)
    except DEFINITIONS.DefinitionError as error:
        raise RunnerError(str(error)) from error


def _create_run_directory(run_dir: Path) -> None:
    if run_dir.exists() or run_dir.is_symlink():
        raise RunnerError("run directory already exists")
    run_dir.parent.mkdir(parents=True, exist_ok=True)
    try:
        run_dir.mkdir()
    except FileExistsError as error:
        raise RunnerError("run directory already exists") from error


def _run_created_event(
    *,
    run_id: str,
    request: dict[str, Any],
    request_fingerprint: str,
    definition: dict[str, Any],
    recorded_at_utc: str,
) -> dict[str, Any]:
    return {
        "schema_version": CONTRACTS.SCHEMA_VERSION,
        "run_id": run_id,
        "event_type": "run_created",
        "node_id": None,
        "attempt": None,
        "recorded_at_utc": recorded_at_utc,
        "payload": {
            "workflow_id": request["workflow_id"],
            "request_fingerprint": request_fingerprint,
            "definition_fingerprint": definition["definition_fingerprint"],
        },
    }


def _run_started_event(run_id: str, recorded_at_utc: str) -> dict[str, Any]:
    return {
        "schema_version": CONTRACTS.SCHEMA_VERSION,
        "run_id": run_id,
        "event_type": "run_started",
        "node_id": None,
        "attempt": None,
        "recorded_at_utc": recorded_at_utc,
        "payload": {},
    }


def _initialize_validated_run(
    request: dict[str, Any],
    run_dir: Path,
    repository_root: Path,
) -> dict[str, Any]:
    definition = _load_builtin_definition(
        request["workflow_id"],
        repository_root,
    )
    request_fingerprint = CONTRACTS.sha256_json(request)
    now = datetime.now(timezone.utc)
    run_id = make_run_id(request_fingerprint, now, uuid.uuid4().hex)
    _create_run_directory(run_dir)
    with acquire_run_lock(run_dir):
        _write_json(run_dir / "workflow_request.json", request)
        _write_json(run_dir / "workflow_definition.json", definition)
        ledger_path = run_dir / "events.jsonl"
        recorded_at = _format_utc(now)
        LEDGER.append_event(
            ledger_path,
            _run_created_event(
                run_id=run_id,
                request=request,
                request_fingerprint=request_fingerprint,
                definition=definition,
                recorded_at_utc=recorded_at,
            ),
        )
        LEDGER.append_event(
            ledger_path,
            _run_started_event(run_id, recorded_at),
        )
        events = LEDGER.read_verified_events(ledger_path, run_id)
        manifest = STATE.rebuild_run_manifest(events, definition)
        _write_json(run_dir / "run_manifest.json", manifest)
    return manifest


def initialize_run(
    request_path: Path,
    run_dir: Path,
    repository_root: Path,
) -> dict[str, Any]:
    return _initialize_validated_run(
        _validated_request(request_path),
        run_dir,
        repository_root,
    )


@contextmanager
def acquire_run_lock(run_dir: Path) -> Iterator[None]:
    if not run_dir.is_dir() or run_dir.is_symlink():
        raise RunnerError("run directory is missing or unsafe")
    lock_path = run_dir / "run.lock"
    flags = os.O_APPEND | os.O_CREAT | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(lock_path, flags, 0o600)
    except OSError as error:
        raise RunnerError(f"run lock file is unsafe: {error}") from error
    handle = os.fdopen(descriptor, "a+", encoding="utf-8")
    try:
        if os.fstat(handle.fileno()).st_nlink != 1:
            raise RunnerError("run lock file is unsafe: hardlink is forbidden")
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RunnerBusyError("run directory is busy") from error
        yield
    finally:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        finally:
            handle.close()


def _load_stored_definition(run_dir: Path) -> dict[str, Any]:
    try:
        value = CONTRACTS.read_json_object(
            run_dir / "workflow_definition.json",
            "stored workflow definition",
        )
        return DEFINITIONS.validate_definition(value)
    except (CONTRACTS.ContractError, DEFINITIONS.DefinitionError) as error:
        raise RunnerIntegrityError(str(error)) from error


def load_or_rebuild_manifest(
    run_dir: Path,
    definition: dict[str, Any],
) -> dict[str, Any]:
    stored_definition = _load_stored_definition(run_dir)
    if (
        stored_definition["definition_fingerprint"]
        != definition["definition_fingerprint"]
    ):
        raise RunnerIntegrityError("built-in and stored definition differ")
    request = _validated_request(run_dir / "workflow_request.json")
    request_fingerprint = CONTRACTS.sha256_json(request)
    ledger_path = run_dir / "events.jsonl"
    try:
        run_id = LEDGER.read_declared_run_id(ledger_path)
        events = LEDGER.read_verified_events(ledger_path, run_id)
        manifest = STATE.rebuild_run_manifest(events, definition)
    except (LEDGER.LedgerIntegrityError, STATE.StateTransitionError) as error:
        raise RunnerIntegrityError(str(error)) from error
    if manifest["request_fingerprint"] != request_fingerprint:
        raise RunnerIntegrityError("request fingerprint does not match ledger")
    if manifest["workflow_id"] != request["workflow_id"]:
        raise RunnerIntegrityError("workflow_id does not match request")
    _write_json(run_dir / "run_manifest.json", manifest)
    return manifest


def _exit_code(status: str) -> int:
    return {
        "completed": 0,
        "completed_with_review": 0,
        "blocked": 2,
        "failed_integrity": 4,
        "failed_execution": 5,
        "awaiting_human": 10,
        "running": 3,
    }.get(status, 3)


def start_run(
    request_path: Path,
    run_dir: Path,
    repository_root: Path,
    executor: Callable[..., Any] | None = None,
    after_node: Callable[[str], None] | None = None,
) -> RunResult:
    if run_dir.exists() or run_dir.is_symlink():
        raise RunnerError("run directory already exists")
    request = _validated_start_request(request_path)
    try:
        DISPATCH.validate_declared_inputs(
            request,
            request_path.parent,
        )
    except DISPATCH.WorkflowDispatchError as error:
        raise RunnerError(str(error)) from error
    manifest = _initialize_validated_run(request, run_dir, repository_root)
    definition = _load_builtin_definition(
        request["workflow_id"],
        repository_root,
    )
    try:
        with acquire_run_lock(run_dir):
            DISPATCH.stage_inputs(
                request,
                request_path.parent,
                run_dir,
            )
            manifest = DISPATCH.run_workflow(
                run_dir=run_dir,
                repository_root=repository_root,
                request=request,
                definition=definition,
                run_id=manifest["run_id"],
                executor=executor,
                after_node=after_node,
            )
    except DISPATCH.WorkflowDispatchError as error:
        raise RunnerError(str(error)) from error
    return RunResult(
        status=manifest["run_status"],
        exit_code=_exit_code(manifest["run_status"]),
        run_id=manifest["run_id"],
        run_dir=run_dir,
    )


def resume_run(
    run_dir: Path,
    repository_root: Path,
    decision_path: Path | None = None,
    executor: Callable[..., Any] | None = None,
    after_node: Callable[[str], None] | None = None,
) -> RunResult:
    with acquire_run_lock(run_dir):
        request = _validated_request(run_dir / "workflow_request.json")
        definition = _load_builtin_definition(
            request["workflow_id"],
            repository_root,
        )
        manifest = load_or_rebuild_manifest(run_dir, definition)
        try:
            manifest = RESUME.resume_manifest(
                run_dir=run_dir,
                repository_root=repository_root,
                request=request,
                definition=definition,
                manifest=manifest,
                decision_path=decision_path,
                executor=executor,
                after_node=after_node,
            )
        except RESUME.ResumeDecisionError as error:
            raise HumanDecisionError(str(error)) from error
        except RESUME.ResumeError as error:
            raise RunnerError(str(error)) from error
    return RunResult(
        status=manifest["run_status"],
        exit_code=_exit_code(manifest["run_status"]),
        run_id=manifest["run_id"],
        run_dir=run_dir,
    )


rebuild_run_manifest = STATE.rebuild_run_manifest
compute_execution_key = EXECUTION.compute_execution_key
