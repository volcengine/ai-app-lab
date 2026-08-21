from __future__ import annotations

import importlib.util
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_ROOT = REPOSITORY_ROOT / "workflows" / "scripts"


def load_module(name: str, filename: str):
    path = SCRIPTS_ROOT / filename
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


RUNNER = load_module("workflow_runner_test", "workflow_runner.py")
DEFINITIONS = load_module(
    "workflow_definition_runner_test",
    "workflow_definition.py",
)
VALIDATOR = load_module(
    "validate_workflow_runner_test",
    "validate_workflow.py",
)


def write_request(path: Path, request_id: str = "runner-test-001") -> Path:
    path.write_text(
        json.dumps(
            {
                "schema_version": "1.0.0",
                "workflow_id": "compound-evidence-v1",
                "request_id": request_id,
                "inputs": {},
                "execution_policy": {
                    "network_mode": "offline",
                    "external_retry": "manual",
                },
            }
        ),
        encoding="utf-8",
    )
    return path


def initialized_run(tmp_path: Path) -> Path:
    request_path = write_request(tmp_path / "request.json")
    run_dir = tmp_path / "run"
    RUNNER.initialize_run(request_path, run_dir, REPOSITORY_ROOT)
    return run_dir


def test_start_refuses_existing_run_directory(tmp_path):
    request_path = write_request(tmp_path / "request.json")
    run_dir = tmp_path / "run"
    run_dir.mkdir()

    with pytest.raises(RUNNER.RunnerError, match="already exists"):
        RUNNER.start_run(request_path, run_dir, REPOSITORY_ROOT)


def test_second_runner_lock_is_rejected(tmp_path):
    run_dir = initialized_run(tmp_path)

    with RUNNER.acquire_run_lock(run_dir):
        with pytest.raises(RUNNER.RunnerBusyError):
            with RUNNER.acquire_run_lock(run_dir):
                pass


def test_runner_lock_rejects_symlink_file(tmp_path):
    run_dir = initialized_run(tmp_path)
    lock_path = run_dir / "run.lock"
    lock_path.unlink()
    outside = tmp_path / "outside.lock"
    outside.write_text("", encoding="utf-8")
    lock_path.symlink_to(outside)

    with pytest.raises(RUNNER.RunnerError, match="lock file is unsafe"):
        with RUNNER.acquire_run_lock(run_dir):
            pass


def test_initialization_holds_lock_while_writing(tmp_path, monkeypatch):
    request_path = write_request(tmp_path / "request.json")
    run_dir = tmp_path / "run"
    original = RUNNER._write_json
    probes = []

    def write_with_lock_probe(path, value):
        if path.name == "workflow_request.json":
            with pytest.raises(RUNNER.RunnerBusyError):
                with RUNNER.acquire_run_lock(run_dir):
                    pass
            probes.append(path.name)
        original(path, value)

    monkeypatch.setattr(RUNNER, "_write_json", write_with_lock_probe)

    RUNNER.initialize_run(request_path, run_dir, REPOSITORY_ROOT)

    assert probes == ["workflow_request.json"]


def test_resume_acquires_lock_before_reading_request(tmp_path, monkeypatch):
    run_dir = initialized_run(tmp_path)
    original = RUNNER._validated_request
    probes = []

    def read_with_lock_probe(path):
        if path.parent == run_dir:
            with pytest.raises(RUNNER.RunnerBusyError):
                with RUNNER.acquire_run_lock(run_dir):
                    pass
            probes.append(path.name)
        return original(path)

    monkeypatch.setattr(RUNNER, "_validated_request", read_with_lock_probe)

    RUNNER.resume_run(run_dir, REPOSITORY_ROOT)

    assert probes == ["workflow_request.json", "workflow_request.json"]


def test_resume_wraps_builtin_definition_failure(tmp_path, monkeypatch):
    run_dir = initialized_run(tmp_path)

    def fail_definition(*_args, **_kwargs):
        raise RUNNER.DEFINITIONS.DefinitionError("broken built-in definition")

    monkeypatch.setattr(RUNNER.DEFINITIONS, "load_definition", fail_definition)

    with pytest.raises(RUNNER.RunnerError, match="broken built-in definition"):
        RUNNER.resume_run(run_dir, REPOSITORY_ROOT)


def test_manifest_is_rebuilt_from_events(tmp_path):
    run_dir = initialized_run(tmp_path)
    expected_run_id = json.loads(
        (run_dir / "run_manifest.json").read_text(encoding="utf-8")
    )["run_id"]
    (run_dir / "run_manifest.json").write_text("{bad", encoding="utf-8")
    definition = DEFINITIONS.load_definition(
        "compound-evidence-v1",
        REPOSITORY_ROOT,
    )

    rebuilt = RUNNER.load_or_rebuild_manifest(run_dir, definition)

    assert rebuilt["run_id"] == expected_run_id
    assert rebuilt["event_count"] == 2
    assert rebuilt["run_status"] == "running"


def test_make_run_id_uses_fixed_time_fingerprint_and_random_hex():
    value = RUNNER.make_run_id(
        "abcdef1234567890",
        datetime(2026, 8, 17, 12, 0, tzinfo=timezone.utc),
        "a1b2c3d4e5f6",
    )

    assert value == "run-20260817T120000Z-abcdef123456-a1b2c3d4"
    assert re.fullmatch(
        r"run-\d{8}T\d{6}Z-[0-9a-f]{12}-[0-9a-f]{8}",
        value,
    )


def test_validator_accepts_initialized_run(tmp_path):
    run_dir = initialized_run(tmp_path)

    report = VALIDATOR.validate_run_directory(run_dir, REPOSITORY_ROOT)

    assert report == {"valid": True, "errors": [], "warnings": []}


def test_validator_rejects_manifest_tampering(tmp_path):
    run_dir = initialized_run(tmp_path)
    manifest_path = run_dir / "run_manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["event_count"] = 99
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    report = VALIDATOR.validate_run_directory(run_dir, REPOSITORY_ROOT)

    assert not report["valid"]
    assert "manifest does not match ledger" in report["errors"]


def test_validator_reports_malformed_policy_without_crashing(tmp_path):
    run_dir = initialized_run(tmp_path)
    request_path = run_dir / "workflow_request.json"
    request = json.loads(request_path.read_text(encoding="utf-8"))
    request["execution_policy"]["network_mode"] = []
    request_path.write_text(json.dumps(request), encoding="utf-8")

    report = VALIDATOR.validate_run_directory(run_dir, REPOSITORY_ROOT)

    assert not report["valid"]
    assert report["errors"]


def test_validator_rejects_rehashed_workflow_id_mismatch(tmp_path):
    run_dir = initialized_run(tmp_path)
    manifest = json.loads((run_dir / "run_manifest.json").read_text(encoding="utf-8"))
    events = RUNNER.LEDGER.read_verified_events(
        run_dir / "events.jsonl",
        manifest["run_id"],
    )
    events[0]["payload"]["workflow_id"] = "route-evidence-review-v1"
    previous_hash = None
    for event in events:
        event["previous_event_hash"] = previous_hash
        event["event_hash"] = RUNNER.LEDGER.event_hash(event)
        previous_hash = event["event_hash"]
    (run_dir / "events.jsonl").write_text(
        "\n".join(RUNNER.CONTRACTS.canonical_json(event) for event in events) + "\n",
        encoding="utf-8",
    )
    definition = DEFINITIONS.load_definition(
        "compound-evidence-v1",
        REPOSITORY_ROOT,
    )
    rebuilt = RUNNER.STATE.rebuild_run_manifest(events, definition)
    (run_dir / "run_manifest.json").write_text(
        RUNNER.CONTRACTS.canonical_json(rebuilt) + "\n",
        encoding="utf-8",
    )

    report = VALIDATOR.validate_run_directory(run_dir, REPOSITORY_ROOT)

    assert not report["valid"]
    assert "workflow_id does not match request" in report["errors"]
