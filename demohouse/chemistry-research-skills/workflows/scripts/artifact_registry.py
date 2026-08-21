"""File-backed artifact registry derived from committed ledger events."""

from __future__ import annotations

import hashlib
import importlib.util
import os
import tempfile
from pathlib import Path
from typing import Any


def _load_local_module(filename: str, module_name: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


CONTRACTS = _load_local_module(
    "workflow_contracts.py",
    "artifact_registry_contracts",
)
LEDGER = _load_local_module(
    "event_ledger.py",
    "artifact_registry_ledger",
)
ARTIFACT_FIELDS = {
    "artifact_id",
    "logical_name",
    "relative_path",
    "sha256",
    "size_bytes",
    "media_type",
    "producer_node_id",
    "producer_attempt",
    "execution_key",
    "validation_artifact_id",
    "domain_state",
}


class ArtifactError(ValueError):
    """Raised when an artifact cannot be registered."""


class ArtifactIntegrityError(ArtifactError):
    """Raised when a registered artifact fails integrity validation."""


def _fsync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def atomic_write_bytes(path: Path, data: bytes) -> None:
    if path.parent.is_symlink():
        raise ArtifactError("atomic write parent must not be a symlink")
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.parent.is_symlink():
        raise ArtifactError("atomic write parent must not be a symlink")
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        _fsync_directory(path.parent)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


def _validate_declared_path(value: Any) -> Path:
    if not isinstance(value, str) or not value:
        raise ArtifactError("artifact path must be a non-empty string")
    declared = Path(value)
    if declared.is_absolute() or ".." in declared.parts:
        raise ArtifactError("artifact path escapes run directory")
    if declared == Path("."):
        raise ArtifactError("artifact path must name a file")
    return declared


def _reject_symlink_components(run_dir: Path, declared: Path) -> None:
    current = run_dir
    for part in declared.parts:
        current = current / part
        if current.is_symlink():
            raise ArtifactError("artifact path contains a symlink")


def validate_run_relative_path(run_dir: Path, value: Any) -> Path:
    declared = _validate_declared_path(value)
    if run_dir.is_symlink():
        raise ArtifactError("run directory must not be a symlink")
    try:
        root = run_dir.resolve(strict=True)
        resolved = (root / declared).resolve(strict=True)
    except OSError as error:
        raise ArtifactError("artifact path is missing") from error
    _reject_symlink_components(root, declared)
    try:
        resolved.relative_to(root)
    except ValueError as error:
        raise ArtifactError("artifact path escapes run") from error
    if not resolved.is_file():
        raise ArtifactError("artifact must be a regular file")
    if resolved.stat().st_nlink != 1:
        raise ArtifactError("artifact hardlink is forbidden")
    return resolved


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _validate_artifact_entry(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ArtifactIntegrityError("artifact entry must be an object")
    missing = sorted(ARTIFACT_FIELDS - value.keys())
    unknown = sorted(value.keys() - ARTIFACT_FIELDS)
    if missing or unknown:
        raise ArtifactIntegrityError(
            f"artifact entry missing={missing}, unknown={unknown}"
        )
    try:
        CONTRACTS.require_controlled_id(
            value["artifact_id"],
            "artifact_id",
        )
        CONTRACTS.require_controlled_id(
            value["logical_name"],
            "artifact.logical_name",
        )
        CONTRACTS.require_controlled_id(
            value["producer_node_id"],
            "artifact.producer_node_id",
        )
        CONTRACTS.require_controlled_id(
            value["domain_state"],
            "artifact.domain_state",
        )
        CONTRACTS.require_sha256(value["sha256"], "artifact.sha256")
        CONTRACTS.require_sha256(
            value["execution_key"],
            "artifact.execution_key",
        )
    except CONTRACTS.ContractError as error:
        raise ArtifactIntegrityError(str(error)) from error
    _validate_declared_path(value["relative_path"])
    if (
        isinstance(value["size_bytes"], bool)
        or not isinstance(value["size_bytes"], int)
        or value["size_bytes"] < 0
    ):
        raise ArtifactIntegrityError(
            "artifact.size_bytes must be a non-negative integer"
        )
    if not isinstance(value["media_type"], str) or not value["media_type"]:
        raise ArtifactIntegrityError("artifact.media_type must be a non-empty string")
    attempt = value["producer_attempt"]
    if isinstance(attempt, bool) or not isinstance(attempt, int) or attempt < 1:
        raise ArtifactIntegrityError(
            "artifact.producer_attempt must be a positive integer"
        )
    validation_id = value["validation_artifact_id"]
    if validation_id is not None:
        try:
            CONTRACTS.require_controlled_id(
                validation_id,
                "artifact.validation_artifact_id",
            )
        except CONTRACTS.ContractError as error:
            raise ArtifactIntegrityError(str(error)) from error
    return value


def verify_artifact(run_dir: Path, entry: Any) -> Path:
    value = _validate_artifact_entry(entry)
    try:
        path = validate_run_relative_path(run_dir, value["relative_path"])
    except ArtifactError as error:
        raise ArtifactIntegrityError(f"artifact missing or unsafe: {error}") from error
    if path.stat().st_size != value["size_bytes"]:
        raise ArtifactIntegrityError("artifact size mismatch")
    if _sha256_file(path) != value["sha256"]:
        raise ArtifactIntegrityError("artifact SHA-256 mismatch")
    return path


def rebuild_artifact_index(
    events: list[dict[str, Any]],
) -> dict[str, Any]:
    artifacts: list[dict[str, Any]] = []
    artifact_ids: set[str] = set()
    for event in events:
        if event.get("event_type") != "artifact_committed":
            continue
        payload = event.get("payload")
        artifact = payload.get("artifact") if isinstance(payload, dict) else None
        value = _validate_artifact_entry(artifact)
        if value["artifact_id"] in artifact_ids:
            raise ArtifactIntegrityError("duplicate committed artifact ID")
        artifacts.append(value)
        artifact_ids.add(value["artifact_id"])
    return {
        "schema_version": CONTRACTS.SCHEMA_VERSION,
        "artifacts": artifacts,
    }


def _artifact_entry(
    *,
    path: Path,
    node_id: str,
    attempt: int,
    logical_name: str,
    relative_path: str,
    media_type: str,
    execution_key: str,
    validation_artifact_id: str | None,
    domain_state: str,
) -> dict[str, Any]:
    sha256 = _sha256_file(path)
    return {
        "artifact_id": f"artifact-{node_id}-{attempt:04d}-{sha256[:12]}",
        "logical_name": logical_name,
        "relative_path": relative_path,
        "sha256": sha256,
        "size_bytes": path.stat().st_size,
        "media_type": media_type,
        "producer_node_id": node_id,
        "producer_attempt": attempt,
        "execution_key": execution_key,
        "validation_artifact_id": validation_artifact_id,
        "domain_state": domain_state,
    }


def _validate_commit_arguments(
    *,
    node_id: str,
    attempt: int,
    logical_name: str,
    media_type: str,
    execution_key: str,
    domain_state: str,
) -> None:
    try:
        CONTRACTS.require_controlled_id(node_id, "node_id")
        CONTRACTS.require_controlled_id(logical_name, "logical_name")
        CONTRACTS.require_controlled_id(domain_state, "domain_state")
        CONTRACTS.require_sha256(execution_key, "execution_key")
    except CONTRACTS.ContractError as error:
        raise ArtifactError(str(error)) from error
    if isinstance(attempt, bool) or not isinstance(attempt, int) or attempt < 1:
        raise ArtifactError("attempt must be a positive integer")
    if not isinstance(media_type, str) or not media_type:
        raise ArtifactError("media_type must be a non-empty string")


def commit_artifact(
    *,
    run_dir: Path,
    ledger_path: Path,
    run_id: str,
    node_id: str,
    attempt: int,
    logical_name: str,
    relative_path: str,
    media_type: str,
    execution_key: str,
    validation_artifact_id: str | None,
    domain_state: str,
    recorded_at_utc: str,
) -> dict[str, Any]:
    _validate_commit_arguments(
        node_id=node_id,
        attempt=attempt,
        logical_name=logical_name,
        media_type=media_type,
        execution_key=execution_key,
        domain_state=domain_state,
    )
    path = validate_run_relative_path(run_dir, relative_path)
    entry = _artifact_entry(
        path=path,
        node_id=node_id,
        attempt=attempt,
        logical_name=logical_name,
        relative_path=relative_path,
        media_type=media_type,
        execution_key=execution_key,
        validation_artifact_id=validation_artifact_id,
        domain_state=domain_state,
    )
    entry = _validate_artifact_entry(entry)
    LEDGER.append_event(
        ledger_path,
        {
            "schema_version": CONTRACTS.SCHEMA_VERSION,
            "run_id": run_id,
            "event_type": "artifact_committed",
            "node_id": node_id,
            "attempt": attempt,
            "recorded_at_utc": recorded_at_utc,
            "payload": {"artifact": entry},
        },
    )
    events = LEDGER.read_verified_events(ledger_path, run_id)
    index = rebuild_artifact_index(events)
    atomic_write_bytes(
        run_dir / "artifacts" / "index.json",
        (CONTRACTS.canonical_json(index) + "\n").encode("utf-8"),
    )
    return entry
