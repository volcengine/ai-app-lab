from __future__ import annotations

import hashlib

import pytest

from workflow_test_support import (
    CONTRACTS,
    REPOSITORY_ROOT,
    artifact_by_logical_name,
    awaiting_identity_gate,
    explicit_workflow_a_request,
    load_json,
    load_local_module,
    start_request,
    valid_identity_decision,
    valid_view_decision,
    write_json,
)


RUNNER = load_local_module(
    "workflow_human_gate_runner_test",
    REPOSITORY_ROOT / "workflows" / "scripts" / "workflow_runner.py",
)
VALIDATOR = load_local_module(
    "workflow_human_gate_validator_test",
    REPOSITORY_ROOT / "workflows" / "scripts" / "validate_workflow.py",
)


def test_multicomponent_identity_pauses_without_modifying_artifact(tmp_path):
    run_dir = awaiting_identity_gate(tmp_path)

    manifest = load_json(run_dir / "run_manifest.json")
    identity_path = next(
        run_dir / item["relative_path"]
        for item in load_json(run_dir / "artifacts" / "index.json")["artifacts"]
        if item["logical_name"] == "identity-result"
    )
    identity = load_json(identity_path)

    assert manifest["run_status"] == "awaiting_human"
    assert manifest["node_states"]["identity-gate"] == "awaiting_human"
    assert identity["resolutions"][0]["sample_identity_status"] == "not_assessed"
    assert hashlib.sha256(identity_path.read_bytes()).hexdigest() == next(
        item["sha256"]
        for item in load_json(run_dir / "artifacts" / "index.json")["artifacts"]
        if item["logical_name"] == "identity-result"
    )
    report = VALIDATOR.validate_run_directory(run_dir, REPOSITORY_ROOT)
    assert report["valid"], report


def test_candidate_hash_mismatch_is_rejected(tmp_path):
    run_dir = awaiting_identity_gate(tmp_path)
    decision = valid_identity_decision(run_dir)
    decision["decisions"][0]["candidate_sha256"] = "0" * 64
    decision["decision_fingerprint"] = CONTRACTS.sha256_json(
        {key: value for key, value in decision.items() if key != "decision_fingerprint"}
    )
    decision_path = tmp_path / "decision.json"
    write_json(decision_path, decision)

    with pytest.raises(RUNNER.HumanDecisionError, match="candidate"):
        RUNNER.resume_run(run_dir, REPOSITORY_ROOT, decision_path)


def test_identity_decision_resumes_without_upgrading_sample_identity(tmp_path):
    run_dir = awaiting_identity_gate(tmp_path)
    identity_before = artifact_by_logical_name(run_dir, "identity-result")
    decision_path = tmp_path / "decision.json"
    write_json(decision_path, valid_identity_decision(run_dir))

    result = RUNNER.resume_run(run_dir, REPOSITORY_ROOT, decision_path)

    assert result.status in {"completed", "completed_with_review"}
    assert artifact_by_logical_name(run_dir, "identity-result") == identity_before
    claims = load_json(run_dir / "claim_ledger.json")["claims"]
    claim = next(
        item for item in claims if item["claim_type"] == "identity_record_selected"
    )
    assert "not_physical_sample_identity" in claim["limitations"]
    binding = artifact_by_logical_name(
        run_dir,
        "standardization-input-binding",
    )
    assert binding["rows"][0]["decision_artifact_id"] is not None
    assert len(binding["rows"][0]["decision_artifact_sha256"]) == 64
    report = VALIDATOR.validate_run_directory(run_dir, REPOSITORY_ROOT)
    assert report["valid"], report
    with pytest.raises(RUNNER.HumanDecisionError, match="not awaiting"):
        RUNNER.resume_run(run_dir, REPOSITORY_ROOT, decision_path)


def test_excluding_all_identity_records_builds_valid_blocked_package(tmp_path):
    run_dir = awaiting_identity_gate(tmp_path)
    identity_before = artifact_by_logical_name(run_dir, "identity-result")
    decision = valid_identity_decision(run_dir)
    decision["decisions"] = [
        {
            "request_id": "q1",
            "decision": "exclude_record",
            "decision_scope": "record",
        }
    ]
    decision["decision_fingerprint"] = CONTRACTS.sha256_json(
        {key: value for key, value in decision.items() if key != "decision_fingerprint"}
    )
    decision_path = tmp_path / "exclude-decision.json"
    write_json(decision_path, decision)

    result = RUNNER.resume_run(run_dir, REPOSITORY_ROOT, decision_path)

    assert result.status == "blocked"
    assert result.exit_code == 2
    assert artifact_by_logical_name(run_dir, "identity-result") == identity_before
    authorized = artifact_by_logical_name(
        run_dir,
        "authorized-structure-input",
    )
    assert authorized["structures"] == []
    assert authorized["excluded_request_ids"] == ["q1"]
    report = VALIDATOR.validate_run_directory(run_dir, REPOSITORY_ROOT)
    assert report["valid"], report


@pytest.mark.parametrize(
    "field",
    ["run_id", "request_fingerprint", "source_artifact_sha256"],
)
def test_stale_or_cross_run_decision_is_rejected(tmp_path, field):
    run_dir = awaiting_identity_gate(tmp_path)
    decision = valid_identity_decision(run_dir)
    decision[field] = "0" * 64
    decision["decision_fingerprint"] = CONTRACTS.sha256_json(
        {key: value for key, value in decision.items() if key != "decision_fingerprint"}
    )
    decision_path = tmp_path / "decision.json"
    write_json(decision_path, decision)

    with pytest.raises(RUNNER.HumanDecisionError, match=field):
        RUNNER.resume_run(run_dir, REPOSITORY_ROOT, decision_path)


def test_null_calculation_view_pauses_and_resumes(tmp_path):
    request = explicit_workflow_a_request()
    request["inputs"]["features"]["calculation_view"] = None
    run_dir, completed = start_request(tmp_path, request)
    assert completed.returncode == 10, completed.stderr
    manifest = load_json(run_dir / "run_manifest.json")
    assert manifest["node_states"]["calculation-view-gate"] == "awaiting_human"
    decision_path = tmp_path / "view-decision.json"
    write_json(decision_path, valid_view_decision(run_dir, "use_standardized"))

    result = RUNNER.resume_run(run_dir, REPOSITORY_ROOT, decision_path)

    assert result.status in {"completed", "completed_with_review"}
    features = artifact_by_logical_name(run_dir, "molecular-features")
    assert features["options"]["calculation_view"] == "standardized"
    report = VALIDATOR.validate_run_directory(run_dir, REPOSITORY_ROOT)
    assert report["valid"], report


def _human_gate_semantic_errors(run_dir):
    manifest = load_json(run_dir / "run_manifest.json")
    events = VALIDATOR.LEDGER.read_verified_events(
        run_dir / "events.jsonl",
        manifest["run_id"],
    )
    artifacts = VALIDATOR.REGISTRY.rebuild_artifact_index(events)["artifacts"]
    request = load_json(run_dir / "workflow_request.json")
    return VALIDATOR.HUMAN_GATES.human_gate_errors(
        run_dir,
        request,
        manifest,
        events,
        artifacts,
    )


def test_derived_gate_artifacts_are_semantically_reconstructed(tmp_path):
    run_dir = awaiting_identity_gate(tmp_path)
    decision_path = tmp_path / "decision.json"
    write_json(decision_path, valid_identity_decision(run_dir))
    result = RUNNER.resume_run(run_dir, REPOSITORY_ROOT, decision_path)
    assert result.status in {"completed", "completed_with_review"}
    index = load_json(run_dir / "artifacts/index.json")["artifacts"]
    paths = {item["logical_name"]: run_dir / item["relative_path"] for item in index}

    authorized_path = paths["authorized-structure-input"]
    original_authorized = authorized_path.read_text(encoding="utf-8")
    authorized = load_json(authorized_path)
    authorized["structures"][0]["structure"] = "C"
    write_json(authorized_path, authorized)
    assert "authorized structure" in " ".join(_human_gate_semantic_errors(run_dir))

    authorized_path.write_text(original_authorized, encoding="utf-8")
    selection_path = paths["calculation-view-selection"]
    original_selection = selection_path.read_text(encoding="utf-8")
    selection = load_json(selection_path)
    selection["calculation_view"] = "parent"
    write_json(selection_path, selection)
    assert "calculation view" in " ".join(_human_gate_semantic_errors(run_dir))

    selection_path.write_text(original_selection, encoding="utf-8")
    binding_path = paths["standardization-input-binding"]
    binding = load_json(binding_path)
    binding["rows"][0]["decision_artifact_sha256"] = "0" * 64
    write_json(binding_path, binding)
    assert "standardization binding" in " ".join(_human_gate_semantic_errors(run_dir))
