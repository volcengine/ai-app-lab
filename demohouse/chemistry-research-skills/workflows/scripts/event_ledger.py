"""Append-only hash-chained event ledger for workflow runs."""

from __future__ import annotations

import importlib.util
import json
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any


def _load_contracts() -> Any:
    path = Path(__file__).with_name("workflow_contracts.py")
    spec = importlib.util.spec_from_file_location(
        "event_ledger_contracts",
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load workflow_contracts.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


CONTRACTS = _load_contracts()
INPUT_EVENT_FIELDS = {
    "schema_version",
    "run_id",
    "event_type",
    "node_id",
    "attempt",
    "recorded_at_utc",
    "payload",
}
STORED_EVENT_FIELDS = INPUT_EVENT_FIELDS | {
    "sequence",
    "event_id",
    "previous_event_hash",
    "event_hash",
}
EVENT_TYPES = {
    "run_created",
    "run_started",
    "node_ready",
    "node_started",
    "node_skipped",
    "process_finished",
    "artifact_committed",
    "validation_finished",
    "node_succeeded",
    "node_review_required",
    "node_blocked",
    "node_failed_execution",
    "node_skipped",
    "gate_requested",
    "gate_resolved",
    "node_retry_authorized",
    "run_completed",
    "run_completed_with_review",
    "run_blocked",
    "run_failed_execution",
    "integrity_failed",
}
UTC_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$")


class LedgerError(ValueError):
    """Raised when an event cannot be appended."""


class LedgerIntegrityError(LedgerError):
    """Raised when a stored ledger fails integrity validation."""


def _reject_non_finite(value: str) -> Any:
    raise LedgerIntegrityError(f"non-finite JSON value is forbidden: {value}")


def _validate_recorded_at(value: Any) -> None:
    if not isinstance(value, str) or not UTC_RE.fullmatch(value):
        raise LedgerError("event.recorded_at_utc must be UTC RFC 3339")
    try:
        datetime.fromisoformat(value.removesuffix("Z") + "+00:00")
    except ValueError as error:
        raise LedgerError("event.recorded_at_utc must be UTC RFC 3339") from error


def event_hash(event: dict[str, Any]) -> str:
    payload = {key: value for key, value in event.items() if key != "event_hash"}
    return CONTRACTS.sha256_json(payload)


def _validate_input_event(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise LedgerError("event must be an object")
    try:
        CONTRACTS.require_exact_fields(
            value,
            INPUT_EVENT_FIELDS,
            set(),
            "event",
        )
        CONTRACTS.require_run_id(value["run_id"], "event.run_id")
    except CONTRACTS.ContractError as error:
        raise LedgerError(str(error)) from error
    if value["schema_version"] != CONTRACTS.SCHEMA_VERSION:
        raise LedgerError("event schema_version must be 1.0.0")
    if (
        not isinstance(value["event_type"], str)
        or value["event_type"] not in EVENT_TYPES
    ):
        raise LedgerError("event_type is unsupported")
    node_id = value["node_id"]
    if node_id is not None:
        try:
            CONTRACTS.require_controlled_id(node_id, "event.node_id")
        except CONTRACTS.ContractError as error:
            raise LedgerError(str(error)) from error
    attempt = value["attempt"]
    if attempt is not None and (
        isinstance(attempt, bool) or not isinstance(attempt, int) or attempt < 1
    ):
        raise LedgerError("event.attempt must be a positive integer or null")
    _validate_recorded_at(value["recorded_at_utc"])
    if not isinstance(value["payload"], dict):
        raise LedgerError("event.payload must be an object")
    try:
        CONTRACTS.canonical_json(value)
    except CONTRACTS.ContractError as error:
        raise LedgerError(str(error)) from error
    return dict(value)


def _parse_line(line: str, line_number: int) -> dict[str, Any]:
    try:
        value = json.loads(
            line,
            parse_constant=_reject_non_finite,
            object_pairs_hook=CONTRACTS.unique_json_object,
        )
    except LedgerIntegrityError:
        raise
    except CONTRACTS.ContractError as error:
        raise LedgerIntegrityError(f"line {line_number}: {error}") from error
    except json.JSONDecodeError as error:
        raise LedgerIntegrityError(f"line {line_number}: invalid JSON") from error
    if not isinstance(value, dict):
        raise LedgerIntegrityError(f"line {line_number}: event is not an object")
    missing = sorted(STORED_EVENT_FIELDS - value.keys())
    unknown = sorted(value.keys() - STORED_EVENT_FIELDS)
    if missing or unknown:
        raise LedgerIntegrityError(
            f"line {line_number}: missing={missing}, unknown={unknown}"
        )
    try:
        _validate_input_event({key: value[key] for key in INPUT_EVENT_FIELDS})
    except LedgerError as error:
        raise LedgerIntegrityError(f"line {line_number}: {error}") from error
    return value


def _verify_event(
    value: dict[str, Any],
    *,
    run_id: str,
    expected_sequence: int,
    previous_hash: str | None,
) -> None:
    if value["run_id"] != run_id:
        raise LedgerIntegrityError("ledger run_id mismatch")
    sequence = value["sequence"]
    if (
        isinstance(sequence, bool)
        or not isinstance(sequence, int)
        or sequence != expected_sequence
    ):
        raise LedgerIntegrityError("ledger sequence is not contiguous")
    if value["event_id"] != f"event-{expected_sequence:06d}":
        raise LedgerIntegrityError("ledger event_id mismatch")
    if value["previous_event_hash"] != previous_hash:
        raise LedgerIntegrityError("ledger previous hash mismatch")
    try:
        CONTRACTS.require_sha256(value["event_hash"], "event.event_hash")
        expected_hash = event_hash(value)
    except CONTRACTS.ContractError as error:
        raise LedgerIntegrityError(str(error)) from error
    if value["event_hash"] != expected_hash:
        raise LedgerIntegrityError("ledger event hash mismatch")


def _read_ledger_text(path: Path) -> str | None:
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
    except FileNotFoundError:
        return None
    except OSError as error:
        raise LedgerIntegrityError(
            f"ledger is unsafe or unreadable: {error}"
        ) from error
    try:
        with os.fdopen(descriptor, "r", encoding="utf-8") as handle:
            if os.fstat(handle.fileno()).st_nlink != 1:
                raise LedgerIntegrityError("ledger is unsafe: hardlink is forbidden")
            return handle.read()
    except (OSError, UnicodeError) as error:
        raise LedgerIntegrityError(f"ledger is unreadable: {error}") from error


def read_verified_events(
    path: Path,
    run_id: str,
) -> list[dict[str, Any]]:
    text = _read_ledger_text(path)
    if text is None:
        return []
    lines = text.splitlines()
    events: list[dict[str, Any]] = []
    previous_hash: str | None = None
    for line_number, line in enumerate(lines, start=1):
        if not line:
            raise LedgerIntegrityError(f"line {line_number}: blank event")
        value = _parse_line(line, line_number)
        _verify_event(
            value,
            run_id=run_id,
            expected_sequence=line_number,
            previous_hash=previous_hash,
        )
        events.append(value)
        previous_hash = value["event_hash"]
    return events


def read_declared_run_id(path: Path) -> str:
    try:
        text = _read_ledger_text(path)
        first_line = text.splitlines()[0] if text is not None else ""
        value = json.loads(
            first_line,
            parse_constant=_reject_non_finite,
            object_pairs_hook=CONTRACTS.unique_json_object,
        )
        run_id = value["run_id"]
        return CONTRACTS.require_run_id(run_id, "ledger.run_id")
    except (
        OSError,
        UnicodeError,
        IndexError,
        KeyError,
        TypeError,
        json.JSONDecodeError,
        CONTRACTS.ContractError,
        LedgerIntegrityError,
    ) as error:
        raise LedgerIntegrityError("ledger has no valid declared run_id") from error


def _append_line(path: Path, line: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    flags = os.O_APPEND | os.O_CREAT | os.O_WRONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags, 0o600)
    except OSError as error:
        raise LedgerError(f"ledger is unsafe or unwritable: {error}") from error
    try:
        with os.fdopen(descriptor, "a", encoding="utf-8") as handle:
            if os.fstat(handle.fileno()).st_nlink != 1:
                raise LedgerError("ledger is unsafe: hardlink is forbidden")
            handle.write(line)
            handle.flush()
            os.fsync(handle.fileno())
    except (OSError, UnicodeError) as error:
        raise LedgerError(f"ledger append failed: {error}") from error


def append_event(path: Path, event: dict[str, Any]) -> dict[str, Any]:
    value = _validate_input_event(event)
    events = read_verified_events(path, value["run_id"])
    sequence = len(events) + 1
    value.update(
        {
            "sequence": sequence,
            "event_id": f"event-{sequence:06d}",
            "previous_event_hash": (events[-1]["event_hash"] if events else None),
        }
    )
    value["event_hash"] = event_hash(value)
    _append_line(path, CONTRACTS.canonical_json(value) + "\n")
    return value
