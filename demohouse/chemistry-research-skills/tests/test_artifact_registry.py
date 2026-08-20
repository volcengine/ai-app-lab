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


REGISTRY = load_module("artifact_registry_test", "artifact_registry.py")


def commit_fixture(
    run_dir: Path,
    validation_artifact_id: str | None = None,
) -> dict:
    output = run_dir / "nodes" / "n1" / "attempt-0001" / "output.json"
    output.parent.mkdir(parents=True)
    output.write_text('{"ok":true}', encoding="utf-8")
    return REGISTRY.commit_artifact(
        run_dir=run_dir,
        ledger_path=run_dir / "events.jsonl",
        run_id=RUN_ID,
        node_id="n1",
        attempt=1,
        logical_name="output",
        relative_path="nodes/n1/attempt-0001/output.json",
        media_type="application/json",
        execution_key="a" * 64,
        validation_artifact_id=validation_artifact_id,
        domain_state="completed",
        recorded_at_utc="2026-08-17T12:00:00Z",
    )


def test_registry_rejects_escape_absolute_symlink_and_hardlink(tmp_path):
    run_dir = tmp_path / "run"
    run_dir.mkdir()
    outside = tmp_path / "outside.json"
    outside.write_text("{}", encoding="utf-8")
    link = run_dir / "link.json"
    link.symlink_to(outside)
    hard = run_dir / "hard.json"
    os.link(outside, hard)

    for value in ("../outside.json", str(outside), "link.json", "hard.json"):
        with pytest.raises(REGISTRY.ArtifactError):
            REGISTRY.validate_run_relative_path(run_dir, value)


def test_registry_rejects_symlink_parent(tmp_path):
    run_dir = tmp_path / "run"
    run_dir.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "output.json").write_text("{}", encoding="utf-8")
    (run_dir / "nodes").symlink_to(outside, target_is_directory=True)

    with pytest.raises(REGISTRY.ArtifactError, match="symlink"):
        REGISTRY.validate_run_relative_path(run_dir, "nodes/output.json")


def test_atomic_write_does_not_follow_precreated_temporary_symlink(tmp_path):
    output = tmp_path / "result.json"
    outside = tmp_path / "outside.json"
    outside.write_text("original", encoding="utf-8")
    output.with_name(output.name + ".tmp").symlink_to(outside)

    REGISTRY.atomic_write_bytes(output, b"replacement")

    assert output.read_bytes() == b"replacement"
    assert outside.read_text(encoding="utf-8") == "original"


def test_atomic_write_rejects_symlink_parent(tmp_path):
    outside = tmp_path / "outside"
    outside.mkdir()
    linked_parent = tmp_path / "artifacts"
    linked_parent.symlink_to(outside, target_is_directory=True)

    with pytest.raises(REGISTRY.ArtifactError, match="symlink"):
        REGISTRY.atomic_write_bytes(linked_parent / "index.json", b"unsafe")

    assert not (outside / "index.json").exists()


def test_committed_missing_artifact_is_integrity_failure(tmp_path):
    run_dir = tmp_path / "run"
    entry = commit_fixture(run_dir)
    (run_dir / entry["relative_path"]).unlink()

    with pytest.raises(REGISTRY.ArtifactIntegrityError, match="missing"):
        REGISTRY.verify_artifact(run_dir, entry)


def test_committed_tampered_artifact_is_integrity_failure(tmp_path):
    run_dir = tmp_path / "run"
    entry = commit_fixture(run_dir)
    (run_dir / entry["relative_path"]).write_text(
        '{"no":true}',
        encoding="utf-8",
    )

    with pytest.raises(REGISTRY.ArtifactIntegrityError, match="SHA-256"):
        REGISTRY.verify_artifact(run_dir, entry)


def test_artifact_entry_rejects_boolean_attempt_metadata(tmp_path):
    run_dir = tmp_path / "run"
    entry = commit_fixture(run_dir)
    entry["producer_attempt"] = True

    with pytest.raises(REGISTRY.ArtifactIntegrityError, match="producer_attempt"):
        REGISTRY.verify_artifact(run_dir, entry)


def test_commit_validates_complete_entry_before_appending_event(tmp_path):
    run_dir = tmp_path / "run"

    with pytest.raises(REGISTRY.ArtifactIntegrityError, match="validation_artifact_id"):
        commit_fixture(run_dir, validation_artifact_id="")

    assert not (run_dir / "events.jsonl").exists()


def test_index_is_rebuilt_from_committed_events():
    def event(artifact_id: str) -> dict:
        return {
            "event_type": "artifact_committed",
            "payload": {
                "artifact": {
                    "artifact_id": artifact_id,
                    "logical_name": artifact_id,
                    "relative_path": f"artifacts/{artifact_id}.json",
                    "sha256": "a" * 64,
                    "size_bytes": 2,
                    "media_type": "application/json",
                    "producer_node_id": "n1",
                    "producer_attempt": 1,
                    "execution_key": "b" * 64,
                    "validation_artifact_id": None,
                    "domain_state": "completed",
                }
            },
        }

    events = [event("a1"), {"event_type": "run_started", "payload": {}}, event("a2")]
    index = REGISTRY.rebuild_artifact_index(events)

    assert [item["artifact_id"] for item in index["artifacts"]] == ["a1", "a2"]


def test_commit_writes_rebuildable_index(tmp_path):
    run_dir = tmp_path / "run"
    entry = commit_fixture(run_dir)

    index = json.loads(
        (run_dir / "artifacts" / "index.json").read_text(encoding="utf-8")
    )

    assert index == {
        "schema_version": "1.0.0",
        "artifacts": [entry],
    }
