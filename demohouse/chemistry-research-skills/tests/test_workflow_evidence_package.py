from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
from typing import Any

from workflow_test_support import (
    REPOSITORY_ROOT,
    explicit_workflow_a_request,
    load_json,
    start_request,
)


def load_module(name: str, path: Path) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


VALIDATOR = load_module(
    "workflow_evidence_validator_test",
    REPOSITORY_ROOT / "workflows" / "scripts" / "validate_workflow.py",
)
EVIDENCE = load_module(
    "workflow_evidence_builder_test",
    REPOSITORY_ROOT / "workflows" / "scripts" / "evidence_package.py",
)


def test_claim_without_evidence_is_rejected():
    package = {
        "evidence_index": {"evidence": []},
        "claim_ledger": {
            "claims": [
                {
                    "claim_id": "claim-0001",
                    "claim_type": "structure_standardized",
                    "status": "supported",
                    "subject_id": "q1",
                    "evidence_ids": ["missing"],
                    "limitations": [],
                }
            ]
        },
    }

    report = VALIDATOR.validate_package(package)

    assert not report["valid"]
    assert "unknown evidence" in " ".join(report["errors"])


def test_free_text_scientific_claim_is_rejected():
    package = {
        "evidence_index": {
            "evidence": [
                {
                    "evidence_id": "evidence-0001",
                    "artifact_id": "artifact-0001",
                }
            ]
        },
        "claim_ledger": {
            "claims": [
                {
                    "claim_id": "claim-0001",
                    "claim_type": "compound is safe",
                    "status": "supported",
                    "subject_id": "q1",
                    "evidence_ids": ["evidence-0001"],
                    "limitations": [],
                }
            ]
        },
    }

    report = VALIDATOR.validate_package(package)

    assert not report["valid"]
    assert "claim_type" in " ".join(report["errors"])


def completed_workflow_a(root: Path) -> Path:
    run_dir, completed = start_request(
        root,
        explicit_workflow_a_request(),
    )
    assert completed.returncode == 0, completed.stderr
    return run_dir


def test_workflow_a_package_contains_required_files(tmp_path):
    run_dir = completed_workflow_a(tmp_path)
    required = (
        "workflow_request.json",
        "workflow_definition.json",
        "run_manifest.json",
        "events.jsonl",
        "artifacts/index.json",
        "evidence_index.json",
        "claim_ledger.json",
        "workflow_report.json",
        "checksums.sha256",
    )

    for relative in required:
        assert (run_dir / relative).is_file(), relative


def test_evidence_and_claim_references_are_closed(tmp_path):
    run_dir = completed_workflow_a(tmp_path)
    evidence = load_json(run_dir / "evidence_index.json")["evidence"]
    claims = load_json(run_dir / "claim_ledger.json")["claims"]
    evidence_ids = {item["evidence_id"] for item in evidence}
    expected_evidence_fields = {
        "evidence_id",
        "artifact_id",
        "evidence_type",
        "producer_node_id",
        "sha256",
        "validator_status",
        "domain_state",
        "upstream_evidence_ids",
    }

    assert evidence
    assert claims
    assert all(set(item) == expected_evidence_fields for item in evidence)
    assert all(set(item["evidence_ids"]) <= evidence_ids for item in claims)
    assert {
        "identity_record_selected",
        "structure_standardized",
        "feature_calculation_completed",
    } <= {item["claim_type"] for item in claims}


def test_checksum_tampering_is_rejected(tmp_path):
    run_dir = completed_workflow_a(tmp_path)
    report_path = run_dir / "workflow_report.json"
    report_path.write_text(
        report_path.read_text(encoding="utf-8") + " ",
        encoding="utf-8",
    )

    report = VALIDATOR.validate_run_directory(run_dir, REPOSITORY_ROOT)

    assert not report["valid"]
    assert "checksum" in " ".join(report["errors"]).lower()


def test_committed_artifact_tampering_is_rejected(tmp_path):
    run_dir = completed_workflow_a(tmp_path)
    index = load_json(run_dir / "artifacts" / "index.json")
    identity = next(
        item for item in index["artifacts"] if item["logical_name"] == "identity-result"
    )
    artifact = run_dir / identity["relative_path"]
    artifact.write_text('{"tampered":true}', encoding="utf-8")

    report = VALIDATOR.validate_run_directory(run_dir, REPOSITORY_ROOT)

    assert not report["valid"]
    assert "artifact" in " ".join(report["errors"]).lower()


def test_evidence_and_claim_semantic_tampering_is_rejected(tmp_path):
    run_dir = completed_workflow_a(tmp_path)
    evidence_path = run_dir / "evidence_index.json"
    claim_path = run_dir / "claim_ledger.json"
    evidence = load_json(evidence_path)
    claims = load_json(claim_path)
    evidence["evidence"][1]["sha256"] = "0" * 64
    evidence["evidence"][1]["producer_node_id"] = "review-routes"
    claims["claims"][0]["claim_type"] = "route_ready_for_expert_review"
    claims["claims"][0]["subject_id"] = "unrelated-route"
    evidence_path.write_text(
        VALIDATOR.CONTRACTS.canonical_json(evidence) + "\n",
        encoding="utf-8",
    )
    claim_path.write_text(
        VALIDATOR.CONTRACTS.canonical_json(claims) + "\n",
        encoding="utf-8",
    )
    EVIDENCE.write_checksums(run_dir)

    report = VALIDATOR.validate_run_directory(run_dir, REPOSITORY_ROOT)

    assert not report["valid"]
    assert "evidence" in " ".join(report["errors"]).lower()


def test_completed_with_review_rejects_failed_node_state():
    manifest = {
        "run_status": "completed_with_review",
        "node_states": {"compute-features": "failed_execution"},
    }
    definition = {"nodes": [{"node_id": "compute-features"}]}

    errors = VALIDATOR._terminal_errors(manifest, definition)

    assert errors


def test_abnormal_process_exit_is_rejected_after_rehash(tmp_path):
    run_dir = completed_workflow_a(tmp_path)
    manifest = load_json(run_dir / "run_manifest.json")
    ledger_path = run_dir / "events.jsonl"
    events = VALIDATOR.LEDGER.read_verified_events(
        ledger_path,
        manifest["run_id"],
    )
    process = next(
        item
        for item in events
        if item["event_type"] == "process_finished"
        and item["node_id"] == "resolve-identities"
    )
    process["payload"]["returncode"] = 3
    previous_hash = None
    for event in events:
        event["previous_event_hash"] = previous_hash
        event["event_hash"] = VALIDATOR.LEDGER.event_hash(event)
        previous_hash = event["event_hash"]
    ledger_path.write_text(
        "\n".join(VALIDATOR.CONTRACTS.canonical_json(event) for event in events) + "\n",
        encoding="utf-8",
    )
    EVIDENCE.write_checksums(run_dir)

    report = VALIDATOR.validate_run_directory(run_dir, REPOSITORY_ROOT)

    assert not report["valid"]
    assert "exit code" in " ".join(report["errors"]).lower()


def test_failed_process_without_returncode_is_valid_execution_failure():
    events = [
        {
            "event_type": "node_started",
            "node_id": "resolve-identities",
            "attempt": 1,
        },
        {
            "event_type": "node_failed_execution",
            "node_id": "resolve-identities",
            "attempt": 1,
        },
    ]

    errors = VALIDATOR.EVENT_VALIDATION.process_errors(
        events,
        {"resolve-identities": "failed_execution"},
        VALIDATOR.ADAPTERS.ADAPTERS,
    )

    assert errors == []


def test_failed_process_with_abnormal_exit_is_valid_execution_failure():
    events = [
        {
            "event_type": "node_started",
            "node_id": "resolve-identities",
            "attempt": 1,
        },
        {
            "event_type": "process_finished",
            "node_id": "resolve-identities",
            "attempt": 1,
            "payload": {"returncode": 3},
        },
        {
            "event_type": "node_failed_execution",
            "node_id": "resolve-identities",
            "attempt": 1,
        },
    ]

    errors = VALIDATOR.EVENT_VALIDATION.process_errors(
        events,
        {"resolve-identities": "failed_execution"},
        VALIDATOR.ADAPTERS.ADAPTERS,
    )

    assert errors == []


def test_first_node_execution_failure_builds_valid_failure_package(tmp_path):
    request_path = (
        REPOSITORY_ROOT / "tests" / "fixtures" / "workflow_a_explicit_structure.json"
    )
    run_dir = tmp_path / "run"

    def fail_before_process(*_args, **_kwargs):
        raise OSError("simulated process launch failure")

    result = VALIDATOR._load_local_module(
        "workflow_runner.py",
        "workflow_failure_package_runner_test",
    ).start_run(
        request_path,
        run_dir,
        REPOSITORY_ROOT,
        executor=fail_before_process,
    )

    assert result.status == "failed_execution"
    assert (run_dir / "artifacts" / "index.json").is_file()
    report = VALIDATOR.validate_run_directory(run_dir, REPOSITORY_ROOT)
    assert report["valid"], report


def _rehash_artifact_commit(
    run_dir: Path,
    logical_name: str,
    content: dict[str, Any],
) -> None:
    manifest = load_json(run_dir / "run_manifest.json")
    ledger_path = run_dir / "events.jsonl"
    events = VALIDATOR.LEDGER.read_verified_events(
        ledger_path,
        manifest["run_id"],
    )
    event = next(
        item
        for item in events
        if item["event_type"] == "artifact_committed"
        and item["payload"]["artifact"]["logical_name"] == logical_name
    )
    entry = event["payload"]["artifact"]
    path = run_dir / entry["relative_path"]
    serialized = VALIDATOR.CONTRACTS.canonical_json(content) + "\n"
    path.write_text(serialized, encoding="utf-8")
    entry["size_bytes"] = len(serialized.encode("utf-8"))
    entry["sha256"] = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    previous_hash = None
    for item in events:
        item["previous_event_hash"] = previous_hash
        item["event_hash"] = VALIDATOR.LEDGER.event_hash(item)
        previous_hash = item["event_hash"]
    ledger_path.write_text(
        "\n".join(VALIDATOR.CONTRACTS.canonical_json(item) for item in events) + "\n",
        encoding="utf-8",
    )
    rebuilt = VALIDATOR.REGISTRY.rebuild_artifact_index(events)
    (run_dir / "artifacts" / "index.json").write_text(
        VALIDATOR.CONTRACTS.canonical_json(rebuilt) + "\n",
        encoding="utf-8",
    )
    evidence = EVIDENCE.build_evidence_index(events, rebuilt["artifacts"])
    claims = EVIDENCE.build_claim_ledger("compound-evidence-v1", evidence)
    report = EVIDENCE.build_workflow_report(
        workflow_id="compound-evidence-v1",
        run_status=manifest["run_status"],
        artifacts=rebuilt["artifacts"],
        evidence=evidence,
        claims=claims,
    )
    for name, value in (
        ("evidence_index.json", evidence),
        ("claim_ledger.json", claims),
        ("workflow_report.json", report),
    ):
        (run_dir / name).write_text(
            VALIDATOR.CONTRACTS.canonical_json(value) + "\n",
            encoding="utf-8",
        )
    EVIDENCE.write_checksums(run_dir)


def _persist_rehashed_events_and_package(
    run_dir: Path,
    events: list[dict[str, Any]],
) -> None:
    manifest = load_json(run_dir / "run_manifest.json")
    previous_hash = None
    for item in events:
        item["previous_event_hash"] = previous_hash
        item["event_hash"] = VALIDATOR.LEDGER.event_hash(item)
        previous_hash = item["event_hash"]
    (run_dir / "events.jsonl").write_text(
        "\n".join(VALIDATOR.CONTRACTS.canonical_json(item) for item in events) + "\n",
        encoding="utf-8",
    )
    rebuilt = VALIDATOR.REGISTRY.rebuild_artifact_index(events)
    (run_dir / "artifacts" / "index.json").write_text(
        VALIDATOR.CONTRACTS.canonical_json(rebuilt) + "\n",
        encoding="utf-8",
    )
    evidence = EVIDENCE.build_evidence_index(events, rebuilt["artifacts"])
    claims = EVIDENCE.build_claim_ledger("compound-evidence-v1", evidence)
    report = EVIDENCE.build_workflow_report(
        workflow_id="compound-evidence-v1",
        run_status=manifest["run_status"],
        artifacts=rebuilt["artifacts"],
        evidence=evidence,
        claims=claims,
    )
    for name, value in (
        ("evidence_index.json", evidence),
        ("claim_ledger.json", claims),
        ("workflow_report.json", report),
    ):
        (run_dir / name).write_text(
            VALIDATOR.CONTRACTS.canonical_json(value) + "\n",
            encoding="utf-8",
        )
    EVIDENCE.write_checksums(run_dir)


def test_saved_validator_report_must_match_rerun(tmp_path):
    run_dir = completed_workflow_a(tmp_path)
    _rehash_artifact_commit(
        run_dir,
        "identity-validation",
        {"valid": False, "errors": ["tampered"], "warnings": []},
    )

    report = VALIDATOR.validate_run_directory(run_dir, REPOSITORY_ROOT)

    assert not report["valid"]
    assert "validator report" in " ".join(report["errors"]).lower()


def test_skill_output_requires_validator_artifact_binding(tmp_path):
    run_dir = completed_workflow_a(tmp_path)
    manifest = load_json(run_dir / "run_manifest.json")
    events = VALIDATOR.LEDGER.read_verified_events(
        run_dir / "events.jsonl",
        manifest["run_id"],
    )
    output = next(
        item["payload"]["artifact"]
        for item in events
        if item["event_type"] == "artifact_committed"
        and item["payload"]["artifact"]["logical_name"] == "identity-result"
    )
    output["validation_artifact_id"] = None
    _persist_rehashed_events_and_package(run_dir, events)

    report = VALIDATOR.validate_run_directory(run_dir, REPOSITORY_ROOT)

    assert not report["valid"]
    assert "validation binding" in " ".join(report["errors"]).lower()


def test_validation_finished_requires_true_payload(tmp_path):
    run_dir = completed_workflow_a(tmp_path)
    manifest = load_json(run_dir / "run_manifest.json")
    events = VALIDATOR.LEDGER.read_verified_events(
        run_dir / "events.jsonl",
        manifest["run_id"],
    )
    validation = next(
        item
        for item in events
        if item["event_type"] == "validation_finished"
        and item["node_id"] == "resolve-identities"
    )
    validation["payload"]["valid"] = False
    _persist_rehashed_events_and_package(run_dir, events)

    report = VALIDATOR.validate_run_directory(run_dir, REPOSITORY_ROOT)

    assert not report["valid"]
    assert "validation event" in " ".join(report["errors"]).lower()


def test_execution_key_tampering_is_rejected(tmp_path):
    run_dir = completed_workflow_a(tmp_path)
    manifest = load_json(run_dir / "run_manifest.json")
    events = VALIDATOR.LEDGER.read_verified_events(
        run_dir / "events.jsonl",
        manifest["run_id"],
    )
    output = next(
        item["payload"]["artifact"]
        for item in events
        if item["event_type"] == "artifact_committed"
        and item["payload"]["artifact"]["logical_name"] == "identity-result"
    )
    output["execution_key"] = "0" * 64
    _persist_rehashed_events_and_package(run_dir, events)

    report = VALIDATOR.validate_run_directory(run_dir, REPOSITORY_ROOT)

    assert not report["valid"]
    assert "execution key" in " ".join(report["errors"]).lower()


def test_jsonl_machine_path_is_scanned(tmp_path):
    path = tmp_path / "workflow-security-jsonl-test"
    path.mkdir(exist_ok=True)
    try:
        machine_path = (
            Path(tmp_path.anchor) / "Users" / "example" / "private.json"
        ).as_posix()
        (path / "events.jsonl").write_text(
            json.dumps({"path": machine_path}) + "\n",
            encoding="utf-8",
        )

        errors = VALIDATOR.SECURITY.content_errors(path, [])

        assert errors
    finally:
        (path / "events.jsonl").unlink(missing_ok=True)
        path.rmdir()
