from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path

import pytest


SCRIPTS_ROOT = Path(__file__).resolve().parents[1] / "workflows" / "scripts"
RUN_ID = "run-20260817T120000Z-abcdef123456-a1b2c3d4"


def load_module(name: str, filename: str):
    path = SCRIPTS_ROOT / filename
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


LEDGER = load_module("event_ledger_test", "event_ledger.py")


def event(event_type: str, recorded_at: str) -> dict:
    return {
        "schema_version": "1.0.0",
        "run_id": RUN_ID,
        "event_type": event_type,
        "node_id": None,
        "attempt": None,
        "recorded_at_utc": recorded_at,
        "payload": {},
    }


def test_append_builds_contiguous_hash_chain(tmp_path):
    path = tmp_path / "events.jsonl"
    first = LEDGER.append_event(
        path,
        event("run_created", "2026-08-17T12:00:00Z"),
    )
    second = LEDGER.append_event(
        path,
        event("run_started", "2026-08-17T12:00:01Z"),
    )

    events = LEDGER.read_verified_events(path, RUN_ID)

    assert [item["sequence"] for item in events] == [1, 2]
    assert first["previous_event_hash"] is None
    assert second["previous_event_hash"] == first["event_hash"]


def test_event_chain_detects_payload_tampering(tmp_path):
    path = tmp_path / "events.jsonl"
    LEDGER.append_event(
        path,
        event("run_created", "2026-08-17T12:00:00Z"),
    )
    LEDGER.append_event(
        path,
        event("run_started", "2026-08-17T12:00:01Z"),
    )
    rows = path.read_text(encoding="utf-8").splitlines()
    second = json.loads(rows[1])
    second["payload"]["tampered"] = True
    rows[1] = json.dumps(second)
    path.write_text("\n".join(rows) + "\n", encoding="utf-8")

    with pytest.raises(LEDGER.LedgerIntegrityError, match="hash"):
        LEDGER.read_verified_events(path, RUN_ID)


def test_event_sequence_must_be_contiguous(tmp_path):
    path = tmp_path / "events.jsonl"
    LEDGER.append_event(
        path,
        event("run_created", "2026-08-17T12:00:00Z"),
    )
    row = json.loads(path.read_text(encoding="utf-8"))
    row["sequence"] = 3
    row["event_hash"] = LEDGER.event_hash(row)
    path.write_text(json.dumps(row) + "\n", encoding="utf-8")

    with pytest.raises(LEDGER.LedgerIntegrityError, match="sequence"):
        LEDGER.read_verified_events(path, RUN_ID)


def test_event_sequence_rejects_boolean_metadata(tmp_path):
    path = tmp_path / "events.jsonl"
    LEDGER.append_event(
        path,
        event("run_created", "2026-08-17T12:00:00Z"),
    )
    row = json.loads(path.read_text(encoding="utf-8"))
    row["sequence"] = True
    row["event_hash"] = LEDGER.event_hash(row)
    path.write_text(json.dumps(row) + "\n", encoding="utf-8")

    with pytest.raises(LEDGER.LedgerIntegrityError, match="sequence"):
        LEDGER.read_verified_events(path, RUN_ID)


def test_non_finite_stored_event_is_integrity_failure(tmp_path):
    path = tmp_path / "events.jsonl"
    LEDGER.append_event(
        path,
        event("run_created", "2026-08-17T12:00:00Z"),
    )
    line = path.read_text(encoding="utf-8").replace(
        '"payload":{}',
        '"payload":{"score":NaN}',
    )
    path.write_text(line, encoding="utf-8")

    with pytest.raises(LEDGER.LedgerIntegrityError, match="non-finite"):
        LEDGER.read_verified_events(path, RUN_ID)


def test_stored_event_rejects_duplicate_object_keys(tmp_path):
    path = tmp_path / "events.jsonl"
    LEDGER.append_event(
        path,
        event("run_created", "2026-08-17T12:00:00Z"),
    )
    line = path.read_text(encoding="utf-8").replace(
        '"event_type":"run_created"',
        '"event_type":"run_started","event_type":"run_created"',
    )
    path.write_text(line, encoding="utf-8")

    with pytest.raises(LEDGER.LedgerIntegrityError, match="duplicate"):
        LEDGER.read_verified_events(path, RUN_ID)


def test_event_rejects_impossible_utc_timestamp(tmp_path):
    value = event("run_created", "2026-99-99T99:99:99Z")

    with pytest.raises(LEDGER.LedgerError, match="recorded_at_utc"):
        LEDGER.append_event(tmp_path / "events.jsonl", value)


def test_append_rejects_symlink_ledger_without_touching_target(tmp_path):
    outside = tmp_path / "outside.jsonl"
    outside.write_text("", encoding="utf-8")
    path = tmp_path / "events.jsonl"
    path.symlink_to(outside)

    with pytest.raises(LEDGER.LedgerError, match="unsafe"):
        LEDGER.append_event(
            path,
            event("run_created", "2026-08-17T12:00:00Z"),
        )

    assert outside.read_text(encoding="utf-8") == ""


def test_append_rejects_hardlink_ledger_without_touching_target(tmp_path):
    outside = tmp_path / "outside.jsonl"
    outside.write_text("", encoding="utf-8")
    path = tmp_path / "events.jsonl"
    os.link(outside, path)

    with pytest.raises(LEDGER.LedgerError, match="unsafe"):
        LEDGER.append_event(
            path,
            event("run_created", "2026-08-17T12:00:00Z"),
        )

    assert outside.read_text(encoding="utf-8") == ""


def test_ledger_rejects_wrong_run_id(tmp_path):
    path = tmp_path / "events.jsonl"
    LEDGER.append_event(
        path,
        event("run_created", "2026-08-17T12:00:00Z"),
    )

    with pytest.raises(LEDGER.LedgerIntegrityError, match="run_id"):
        LEDGER.read_verified_events(path, "run-other")


def test_append_rejects_run_id_outside_versioned_format(tmp_path):
    value = event("run_created", "2026-08-17T12:00:00Z")
    value["run_id"] = "run-other"

    with pytest.raises(LEDGER.LedgerError, match="run_id"):
        LEDGER.append_event(tmp_path / "events.jsonl", value)
