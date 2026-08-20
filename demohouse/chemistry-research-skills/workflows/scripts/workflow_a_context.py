"""Shared execution context and Artifact operations for Workflow A nodes."""

from __future__ import annotations

import importlib.util
import json
import sys
from dataclasses import dataclass, field
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
    "workflow_a_context_contracts",
)
REGISTRY = _load_local_module(
    "artifact_registry.py",
    "workflow_a_context_registry",
)
EXECUTION = _load_local_module(
    "workflow_execution_key.py",
    "workflow_a_context_execution_key",
)


class WorkflowANodeError(ValueError):
    """Raised when a Workflow A node cannot complete safely."""


@dataclass(frozen=True)
class NodeOutcome:
    node_id: str
    state: str
    domain_state: str
    artifact_ids: tuple[str, ...] = ()
    event_payload: dict[str, Any] | None = None


@dataclass
class ExecutionContext:
    run_dir: Path
    repository_root: Path
    request: dict[str, Any]
    definition: dict[str, Any]
    run_id: str
    recorded_at_utc: str
    append_event: Callable[[str, str | None, int | None, dict[str, Any]], None]
    executor: Callable[..., Any] | None = None
    artifacts: dict[str, dict[str, Any]] = field(default_factory=dict)
    attempts: dict[str, int] = field(default_factory=dict)


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise WorkflowANodeError(f"node JSON is unreadable: {path.name}") from error
    if not isinstance(value, dict):
        raise WorkflowANodeError(f"node JSON must be an object: {path.name}")
    return value


def write_json(path: Path, value: dict[str, Any]) -> None:
    REGISTRY.atomic_write_bytes(
        path,
        (CONTRACTS.canonical_json(value) + "\n").encode("utf-8"),
    )


def attempt_dir(context: ExecutionContext, node_id: str) -> Path:
    attempt = context.attempts.get(node_id, 1)
    path = context.run_dir / "nodes" / node_id / f"attempt-{attempt:04d}"
    path.mkdir(parents=True, exist_ok=True)
    return path


def execution_key(
    context: ExecutionContext,
    node_id: str,
    parameters: dict[str, Any],
    upstream_names: tuple[str, ...],
    adapter: Any | None = None,
) -> str:
    upstream = [
        {
            "artifact_id": context.artifacts[name]["artifact_id"],
            "sha256": context.artifacts[name]["sha256"],
        }
        for name in upstream_names
    ]
    return EXECUTION.compute_repository_execution_key(
        repository_root=context.repository_root,
        definition_fingerprint=context.definition["definition_fingerprint"],
        node_id=node_id,
        adapter=adapter or EXECUTION.internal_adapter(node_id),
        parameters=parameters,
        upstream_artifacts=upstream,
    )


def commit(
    context: ExecutionContext,
    *,
    node_id: str,
    logical_name: str,
    path: Path,
    media_type: str,
    execution_key_value: str,
    validation_artifact_id: str | None,
    domain_state: str,
    producer_attempt: int | None = None,
) -> dict[str, Any]:
    try:
        relative_path = path.relative_to(context.run_dir).as_posix()
    except ValueError as error:
        raise WorkflowANodeError("node output escapes run directory") from error
    entry = REGISTRY.commit_artifact(
        run_dir=context.run_dir,
        ledger_path=context.run_dir / "events.jsonl",
        run_id=context.run_id,
        node_id=node_id,
        attempt=producer_attempt or context.attempts.get(node_id, 1),
        logical_name=logical_name,
        relative_path=relative_path,
        media_type=media_type,
        execution_key=execution_key_value,
        validation_artifact_id=validation_artifact_id,
        domain_state=domain_state,
        recorded_at_utc=context.recorded_at_utc,
    )
    context.artifacts[logical_name] = entry
    return entry
