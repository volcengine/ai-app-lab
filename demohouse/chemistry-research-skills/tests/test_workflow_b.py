from __future__ import annotations

import copy
import hashlib
import shutil
from pathlib import Path

import pytest

from workflow_test_support import (
    FIXTURES,
    REPOSITORY_ROOT,
    RUNNER,
    artifact_by_logical_name,
    load_json,
    load_local_module,
    write_json,
)


FIXTURE_ROOT = FIXTURES / "workflow_b" / "single"


def _workflow_b():
    return load_local_module(
        "workflow_b_test_module",
        REPOSITORY_ROOT / "workflows" / "scripts" / "workflow_b.py",
    )


def test_single_step_discovers_and_binds_one_curation_record(tmp_path):
    run_dir = tmp_path / "run-b"

    result = RUNNER.start_run(
        FIXTURE_ROOT / "request.json",
        run_dir,
        REPOSITORY_ROOT,
    )

    assert result.status in {"completed", "completed_with_review"}
    steps = artifact_by_logical_name(run_dir, "route-steps")
    assert [(item["route_id"], item["step_id"]) for item in steps["steps"]] == [
        ("aspirin-route-1", "step-4b51e0d401df2a53"),
    ]
    assert (
        steps["steps"][0]["step_reaction_hash"]
        == "40078a1003eba6c3c7bc2c7985a10fd236ca42921fd0db6a7c9e9266501f6026"
    )
    bindings = artifact_by_logical_name(run_dir, "curation-bindings")
    assert bindings["bindings"][0]["binding_status"] == "bound"
    assert bindings["bindings"][0]["curation_record_id"] == "aspirin-acetylation"


def test_single_step_searches_reviews_and_validates_package(tmp_path):
    run_dir = tmp_path / "run-b-complete"

    result = RUNNER.start_run(
        FIXTURE_ROOT / "request.json",
        run_dir,
        REPOSITORY_ROOT,
    )

    assert result.status in {"completed", "completed_with_review"}
    index = load_json(run_dir / "artifacts" / "index.json")
    logical_names = {item["logical_name"] for item in index["artifacts"]}
    assert {
        "step-search-plan",
        "precedent-search-0001",
        "precedent-search-validation-0001",
        "step-search-results",
        "assembled-step-artifacts",
        "route-review",
        "route-review-validation",
        "expert-review-package",
    } <= logical_names

    search_results = artifact_by_logical_name(run_dir, "step-search-results")
    assert search_results["results"] == [
        {
            "artifact_id": next(
                item["artifact_id"]
                for item in index["artifacts"]
                if item["logical_name"] == "precedent-search-0001"
            ),
            "binding_status": "bound",
            "provider_status": "completed",
            "route_id": "aspirin-route-1",
            "step_id": "step-4b51e0d401df2a53",
            "step_reaction_hash": (
                "40078a1003eba6c3c7bc2c7985a10fd236ca42921fd0db6a7c9e9266501f6026"
            ),
        }
    ]
    run_id = load_json(run_dir / "run_manifest.json")["run_id"]
    events = RUNNER.LEDGER.read_verified_events(
        run_dir / "events.jsonl",
        run_id,
    )
    process = next(
        item
        for item in events
        if item["event_type"] == "process_finished"
        and item["node_id"] == "search-precedents-per-step"
    )
    assert process["payload"] == {
        "returncode": 0,
        "route_id": "aspirin-route-1",
        "step_id": "step-4b51e0d401df2a53",
        "step_reaction_hash": (
            "40078a1003eba6c3c7bc2c7985a10fd236ca42921fd0db6a7c9e9266501f6026"
        ),
    }
    validation = next(
        item
        for item in events
        if item["event_type"] == "validation_finished"
        and item["node_id"] == "search-precedents-per-step"
    )
    assert validation["payload"] == {
        "valid": True,
        "route_id": "aspirin-route-1",
        "step_id": "step-4b51e0d401df2a53",
        "step_reaction_hash": (
            "40078a1003eba6c3c7bc2c7985a10fd236ca42921fd0db6a7c9e9266501f6026"
        ),
    }
    review = artifact_by_logical_name(run_dir, "route-review")
    assert review["route_summaries"][0]["disposition"] == ("ready_for_expert_review")
    expert = artifact_by_logical_name(run_dir, "expert-review-package")
    assert expert["limitations"] == [
        "not_ready_for_experiment",
        "not_safety_approval",
    ]
    claims = load_json(run_dir / "claim_ledger.json")["claims"]
    by_type = {item["claim_type"]: item for item in claims}
    assert by_type["reaction_curated"]["status"] == "supported"
    assert by_type["precedent_exact_record_found"]["status"] == "supported"
    route_claim = by_type["route_ready_for_expert_review"]
    assert route_claim["status"] == "supported"
    assert route_claim["limitations"] == [
        "not_experimental_confirmation",
        "not_ready_for_experiment",
        "not_safety_approval",
    ]
    evidence = load_json(run_dir / "evidence_index.json")["evidence"]
    evidence_by_artifact = {item["artifact_id"]: item for item in evidence}
    search_entry = next(
        item
        for item in index["artifacts"]
        if item["logical_name"] == "precedent-search-0001"
    )
    search_evidence = evidence_by_artifact[search_entry["artifact_id"]]
    assert search_evidence["evidence_type"] == "validated_skill_artifact"
    assert len(search_evidence["upstream_evidence_ids"]) == 3

    validator = load_local_module(
        "workflow_b_complete_validator",
        REPOSITORY_ROOT / "workflows" / "scripts" / "validate_workflow.py",
    )
    report = validator.validate_run_directory(run_dir, REPOSITORY_ROOT)
    assert report["valid"] is True, report["errors"]
    semantic = load_local_module(
        "workflow_b_semantic_validator_test",
        REPOSITORY_ROOT / "workflows" / "scripts" / "workflow_b_semantic_validation.py",
    )
    documents = validator.EVIDENCE.load_artifact_documents(
        run_dir,
        index["artifacts"],
    )
    tampered = copy.deepcopy(documents)
    results_entry = next(
        item
        for item in index["artifacts"]
        if item["logical_name"] == "step-search-results"
    )
    tampered[results_entry["artifact_id"]]["results"][0]["step_id"] = "wrong-step"
    semantic_errors = semantic.semantic_errors(
        load_json(run_dir / "workflow_request.json"),
        index["artifacts"],
        tampered,
    )
    assert "step search result does not match plan" in semantic_errors
    results_path = run_dir / results_entry["relative_path"]
    results_path.unlink()
    damaged_report = validator.validate_run_directory(
        run_dir,
        REPOSITORY_ROOT,
    )
    assert damaged_report["valid"] is False
    assert damaged_report["errors"]


def test_zero_and_multiple_exact_matches_are_not_guessed():
    workflow_b = _workflow_b()
    step = workflow_b.RouteStep(
        route_id="route-1",
        step_id="step-1",
        step_reaction_hash="a" * 64,
        canonical_reaction="CCO>>CC=O",
    )
    missing = workflow_b.bind_curation_records(
        [step],
        {"records": []},
    )
    duplicate = workflow_b.bind_curation_records(
        [step],
        {
            "records": [
                {
                    "record_id": "r1",
                    "original_record_hash": "b" * 64,
                    "reaction_smiles": {
                        "canonical_unmapped": "CCO>>CC=O",
                    },
                },
                {
                    "record_id": "r2",
                    "original_record_hash": "c" * 64,
                    "reaction_smiles": {
                        "canonical_unmapped": "CCO>>CC=O",
                    },
                },
            ]
        },
    )

    assert missing[0].binding_status == "missing"
    assert missing[0].curation_record_id is None
    assert duplicate[0].binding_status == "ambiguous"
    assert duplicate[0].curation_record_id is None


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("reaction_input", {"path": "../escape.json", "sha256": "a" * 64}, "path"),
        (
            "route_input",
            {
                "path": str(Path(Path.cwd().anchor) / "outside-route.json"),
                "sha256": "b" * 64,
                "input_profile": "normalized_route_v1",
            },
            "path",
        ),
    ],
)
def test_workflow_b_request_rejects_unsafe_paths(field, value, message):
    workflow_b = _workflow_b()
    request = load_json(FIXTURE_ROOT / "request.json")
    request["inputs"][field] = value

    with pytest.raises(workflow_b.WorkflowBError, match=message):
        workflow_b.validate_workflow_b_request(request)


def test_workflow_b_request_rejects_network_provider_mismatch():
    workflow_b = _workflow_b()
    request = copy.deepcopy(load_json(FIXTURE_ROOT / "request.json"))
    request["inputs"]["search_strategy"]["provider"] = "ord_public_api"

    with pytest.raises(workflow_b.WorkflowBError, match="network"):
        workflow_b.validate_workflow_b_request(request)


@pytest.mark.parametrize(
    ("operation", "profile"),
    [
        ("search_similar_reactions", None),
        ("lookup_reaction", "rdkit-difference-atompair-v1"),
    ],
)
def test_workflow_b_request_rejects_fingerprint_profile_mismatch(
    operation,
    profile,
):
    workflow_b = _workflow_b()
    request = copy.deepcopy(load_json(FIXTURE_ROOT / "request.json"))
    strategy = request["inputs"]["search_strategy"]
    strategy["operation"] = operation
    strategy["fingerprint_profile_id"] = profile

    with pytest.raises(workflow_b.WorkflowBError, match="fingerprint"):
        workflow_b.validate_workflow_b_request(request)


@pytest.mark.parametrize(
    ("operation", "profile"),
    [
        ("lookup_reaction", None),
        ("search_similar_reactions", "rdkit-difference-atompair-v1"),
    ],
)
def test_workflow_b_request_rejects_unsupported_ord_query_derivation(
    operation,
    profile,
):
    workflow_b = _workflow_b()
    request = copy.deepcopy(load_json(FIXTURE_ROOT / "request.json"))
    request["execution_policy"]["network_mode"] = "public_http"
    strategy = request["inputs"]["search_strategy"]
    strategy["provider"] = "ord_public_api"
    strategy["operation"] = operation
    strategy["fingerprint_profile_id"] = profile

    with pytest.raises(workflow_b.WorkflowBError, match="provider.*operation"):
        workflow_b.validate_workflow_b_request(request)


def _local_request_fixture(tmp_path):
    request = load_json(FIXTURE_ROOT / "request.json")
    shutil.copy2(FIXTURE_ROOT / "reactions.json", tmp_path / "reactions.json")
    shutil.copy2(FIXTURE_ROOT / "routes.json", tmp_path / "routes.json")
    request_path = tmp_path / "request.json"
    write_json(request_path, request)
    return request, request_path


def _sha256_file(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_declared_standardization_artifact_is_validated_and_bound(tmp_path):
    request, request_path = _local_request_fixture(tmp_path)
    reactions = load_json(tmp_path / "reactions.json")
    standardization_path = tmp_path / "standardization.json"
    write_json(standardization_path, reactions["upstream_artifacts"][0])
    request["inputs"]["standardization_artifacts"] = [
        {
            "path": "standardization.json",
            "sha256": _sha256_file(standardization_path),
        }
    ]
    write_json(request_path, request)
    run_dir = tmp_path / "run"

    result = RUNNER.start_run(request_path, run_dir, REPOSITORY_ROOT)

    assert result.status in {"completed", "completed_with_review"}
    index = load_json(run_dir / "artifacts" / "index.json")
    assert any(
        item["logical_name"] == "standardization-input-0001"
        for item in index["artifacts"]
    )
    validator = load_local_module(
        "workflow_b_standardization_validator",
        REPOSITORY_ROOT / "workflows" / "scripts" / "validate_workflow.py",
    )
    report = validator.validate_run_directory(run_dir, REPOSITORY_ROOT)
    assert report["valid"] is True, report["errors"]


def test_declared_standardization_mismatch_fails_before_run_creation(tmp_path):
    request, request_path = _local_request_fixture(tmp_path)
    standardization_path = tmp_path / "standardization.json"
    write_json(standardization_path, {"schema_version": "1.0.0"})
    request["inputs"]["standardization_artifacts"] = [
        {
            "path": "standardization.json",
            "sha256": _sha256_file(standardization_path),
        }
    ]
    write_json(request_path, request)
    run_dir = tmp_path / "run"

    with pytest.raises(RUNNER.RunnerError, match="standardization"):
        RUNNER.start_run(request_path, run_dir, REPOSITORY_ROOT)

    assert not run_dir.exists()


def test_declared_hash_mismatch_fails_before_run_creation(tmp_path):
    request, request_path = _local_request_fixture(tmp_path)
    request["inputs"]["reaction_input"]["sha256"] = "0" * 64
    write_json(request_path, request)
    run_dir = tmp_path / "run"

    with pytest.raises(RUNNER.RunnerError, match="SHA-256"):
        RUNNER.start_run(request_path, run_dir, REPOSITORY_ROOT)

    assert not run_dir.exists()


def test_declared_symlink_fails_before_run_creation(tmp_path):
    request, request_path = _local_request_fixture(tmp_path)
    reaction = tmp_path / "reactions.json"
    reaction.unlink()
    reaction.symlink_to(FIXTURE_ROOT / "reactions.json")
    write_json(request_path, request)
    run_dir = tmp_path / "run"

    with pytest.raises(RUNNER.RunnerError, match="symlink"):
        RUNNER.start_run(request_path, run_dir, REPOSITORY_ROOT)

    assert not run_dir.exists()
