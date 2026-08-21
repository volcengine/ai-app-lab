from __future__ import annotations

from dataclasses import replace

import pytest

from workflow_test_support import (
    ADAPTERS,
    REPOSITORY_ROOT,
    RUNNER,
    CountingExecutor,
    awaiting_identity_gate,
    completed_workflow_a,
    load_json,
    load_local_module,
    node_start_counts,
    synthetic_running_node,
    valid_retry_decision,
    valid_identity_decision,
    write_json,
)


VALIDATOR = load_local_module(
    "workflow_resume_validator_test",
    REPOSITORY_ROOT / "workflows" / "scripts" / "validate_workflow.py",
)
RETRY_GATE = load_local_module(
    "workflow_resume_retry_gate_test",
    REPOSITORY_ROOT / "workflows" / "scripts" / "workflow_retry_gate.py",
)


def test_completed_nodes_are_not_reexecuted_on_resume(tmp_path):
    run_dir = completed_workflow_a(tmp_path)
    before = node_start_counts(run_dir)
    executor = CountingExecutor(ADAPTERS.execute_adapter)

    result = RUNNER.resume_run(
        run_dir,
        REPOSITORY_ROOT,
        executor=executor,
    )

    assert result.status == "completed"
    assert node_start_counts(run_dir) == before
    assert executor.calls == {}


def test_ready_gate_resumes_after_decision_commit_crash_window(tmp_path):
    run_dir = awaiting_identity_gate(tmp_path)
    decision_path = tmp_path / "identity-decision.json"
    write_json(decision_path, valid_identity_decision(run_dir))
    manifest = load_json(run_dir / "run_manifest.json")
    RUNNER.RESUME.RUNNER_GATES.resolve_active_gate(
        run_dir=run_dir,
        decision_path=decision_path,
        manifest=manifest,
        repository_root=REPOSITORY_ROOT,
    )

    result = RUNNER.resume_run(run_dir, REPOSITORY_ROOT)

    assert result.status in {"completed", "completed_with_review"}


def test_offline_incomplete_node_uses_new_attempt_and_keeps_orphan(tmp_path):
    run_dir = synthetic_running_node(tmp_path, external=False)
    orphan = run_dir / "nodes/resolve-identities/attempt-0001/orphan.json"
    orphan.parent.mkdir(parents=True)
    orphan.write_text('{"orphan":true}', encoding="utf-8")

    result = RUNNER.resume_run(run_dir, REPOSITORY_ROOT)

    assert result.status == "completed"
    assert node_start_counts(run_dir)["resolve-identities"] == 2
    assert orphan.read_text(encoding="utf-8") == '{"orphan":true}'
    assert (
        run_dir / "nodes/resolve-identities/attempt-0002/identity-result.json"
    ).is_file()
    report = VALIDATOR.validate_run_directory(run_dir, REPOSITORY_ROOT)
    assert report["valid"], report


def test_network_incomplete_node_requires_retry_authorization(tmp_path):
    run_dir = synthetic_running_node(tmp_path, external=True)
    before = node_start_counts(run_dir)

    result = RUNNER.resume_run(run_dir, REPOSITORY_ROOT)

    assert result.status == "awaiting_human"
    assert result.exit_code == 10
    assert node_start_counts(run_dir) == before
    assert (run_dir / "gates/gate-retry-resolve-identities-0001/request.json").is_file()
    report = VALIDATOR.validate_run_directory(run_dir, REPOSITORY_ROOT)
    assert report["valid"], report


def test_retry_authorization_rejects_wrong_interrupted_attempt(tmp_path):
    run_dir = synthetic_running_node(tmp_path, external=True)
    first = RUNNER.resume_run(run_dir, REPOSITORY_ROOT)
    assert first.status == "awaiting_human"
    decision = valid_retry_decision(run_dir)
    decision["interrupted_attempt"] = 2
    decision["decision_fingerprint"] = RUNNER.CONTRACTS.sha256_json(
        {key: value for key, value in decision.items() if key != "decision_fingerprint"}
    )
    decision_path = tmp_path / "wrong-retry.json"
    write_json(decision_path, decision)

    with pytest.raises(
        RUNNER.HumanDecisionError,
        match="interrupted_attempt",
    ):
        RUNNER.resume_run(
            run_dir,
            REPOSITORY_ROOT,
            decision_path,
        )


def test_retry_authorization_rejects_boolean_attempt(tmp_path):
    run_dir = synthetic_running_node(tmp_path, external=True)
    first = RUNNER.resume_run(run_dir, REPOSITORY_ROOT)
    assert first.status == "awaiting_human"
    decision = valid_retry_decision(run_dir)
    decision["interrupted_attempt"] = True
    decision["decision_fingerprint"] = RUNNER.CONTRACTS.sha256_json(
        {key: value for key, value in decision.items() if key != "decision_fingerprint"}
    )
    decision_path = tmp_path / "boolean-retry.json"
    write_json(decision_path, decision)
    manifest = VALIDATOR.CONTRACTS.read_json_object(
        run_dir / "run_manifest.json",
        "run manifest",
    )

    with pytest.raises(
        RETRY_GATE.RetryDecisionError,
        match="interrupted_attempt",
    ):
        RETRY_GATE.resolve_retry_gate(
            run_dir=run_dir,
            manifest=manifest,
            decision_path=decision_path,
        )


def test_repeated_retry_gate_selects_latest_attempt():
    manifest = {
        "node_states": {"resolve-identities": "awaiting_human"},
    }
    events = [
        {
            "event_type": "gate_requested",
            "node_id": "resolve-identities",
            "attempt": 1,
            "payload": {"gate_type": "external_retry"},
        },
        {
            "event_type": "gate_resolved",
            "node_id": "resolve-identities",
            "attempt": 1,
            "payload": {},
        },
        {
            "event_type": "gate_requested",
            "node_id": "resolve-identities",
            "attempt": 2,
            "payload": {"gate_type": "external_retry"},
        },
    ]

    active = RETRY_GATE._active_event(events, manifest)

    assert active["attempt"] == 2


def test_authorized_external_retry_uses_new_attempt(tmp_path):
    run_dir = synthetic_running_node(tmp_path, external=True)
    first = RUNNER.resume_run(run_dir, REPOSITORY_ROOT)
    assert first.status == "awaiting_human"
    decision_path = tmp_path / "retry.json"
    write_json(decision_path, valid_retry_decision(run_dir))

    def execute_without_network(
        adapter,
        argv,
        *,
        repository_root,
        timeout_seconds,
    ):
        controlled = list(argv)
        if adapter.extractor_id == "identity":
            sources = controlled.index("--sources") + 1
            controlled[sources] = ""
        return ADAPTERS.execute_adapter(
            adapter,
            controlled,
            repository_root=repository_root,
            timeout_seconds=timeout_seconds,
        )

    result = RUNNER.resume_run(
        run_dir,
        REPOSITORY_ROOT,
        decision_path,
        executor=execute_without_network,
    )

    assert result.status == "completed"
    assert node_start_counts(run_dir)["resolve-identities"] == 2
    report = VALIDATOR.validate_run_directory(run_dir, REPOSITORY_ROOT)
    assert report["valid"], report


def test_execution_key_binds_code_runtime_and_dependencies():
    adapter = ADAPTERS.ADAPTERS["resolve-chemical-identities-v1"]
    base = {
        "definition_fingerprint": "a" * 64,
        "node_id": "resolve-identities",
        "adapter": adapter,
        "parameters": {"sources": []},
        "upstream_artifacts": [
            {"artifact_id": "artifact-input-0001", "sha256": "b" * 64}
        ],
        "entrypoint_sha256": "c" * 64,
        "validator_sha256": "d" * 64,
        "python_version": "3.11.9",
        "dependency_versions": {"rdkit": "2025.9.2"},
    }
    variants = [
        {},
        {"definition_fingerprint": "e" * 64},
        {"adapter": replace(adapter, adapter_version="1.0.1")},
        {"parameters": {"sources": ["pubchem"]}},
        {"upstream_artifacts": []},
        {"entrypoint_sha256": "f" * 64},
        {"validator_sha256": "0" * 64},
        {"python_version": "3.12.3"},
        {"dependency_versions": {"rdkit": "2026.1.0"}},
    ]

    keys = {RUNNER.compute_execution_key(**(base | variant)) for variant in variants}

    assert len(keys) == len(variants)
