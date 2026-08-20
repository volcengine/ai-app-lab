from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

from workflow_test_support import (
    REPOSITORY_ROOT,
    artifact_by_logical_name,
    explicit_workflow_a_request,
    load_json,
    load_local_module,
    run_direct_compound_chain,
    run_workflow_a,
    start_request,
    workflow_fingerprints,
)


def load_runner():
    path = REPOSITORY_ROOT / "workflows" / "scripts" / "workflow_runner.py"
    spec = importlib.util.spec_from_file_location("workflow_a_runner_test", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


RUNNER = load_runner()
VALIDATOR = load_local_module(
    "workflow_a_validator_test",
    REPOSITORY_ROOT / "workflows" / "scripts" / "validate_workflow.py",
)


def test_explicit_structure_runs_identity_standardize_and_features(tmp_path):
    request_path = (
        REPOSITORY_ROOT / "tests" / "fixtures" / "workflow_a_explicit_structure.json"
    )
    run_dir = tmp_path / "run-a"

    result = RUNNER.start_run(request_path, run_dir, REPOSITORY_ROOT)

    assert result.status == "completed"
    assert result.exit_code == 0
    manifest = load_json(run_dir / "run_manifest.json")
    assert manifest["run_status"] == "completed"
    assert manifest["node_states"]["compute-features"] == "succeeded"
    report = VALIDATOR.validate_run_directory(run_dir, REPOSITORY_ROOT)
    assert report["valid"], report


def test_final_package_write_failure_becomes_failed_integrity(
    tmp_path,
    monkeypatch,
):
    request_path = (
        REPOSITORY_ROOT / "tests" / "fixtures" / "workflow_a_explicit_structure.json"
    )
    run_dir = tmp_path / "run-a"

    def fail_package_write(**_kwargs):
        raise OSError("simulated final package write failure")

    monkeypatch.setattr(
        RUNNER.WORKFLOW_A.EVIDENCE,
        "write_workflow_package",
        fail_package_write,
    )

    result = RUNNER.start_run(request_path, run_dir, REPOSITORY_ROOT)

    assert result.status == "failed_integrity"
    assert result.exit_code == 4
    manifest = load_json(run_dir / "run_manifest.json")
    assert manifest["run_status"] == "failed_integrity"


def test_workflow_artifacts_match_direct_cli_fingerprints(tmp_path):
    direct = run_direct_compound_chain(tmp_path / "direct")
    run_dir, completed = run_workflow_a(tmp_path / "workflow")
    assert completed.returncode == 0, completed.stderr

    assert workflow_fingerprints(run_dir) == direct


def test_ready_handoff_builds_bound_standardization_input(tmp_path):
    run_dir, completed = run_workflow_a(tmp_path)
    assert completed.returncode == 0, completed.stderr

    binding = artifact_by_logical_name(
        run_dir,
        "standardization-input-binding",
    )
    assert binding["rows"] == [
        {
            "row_index": 0,
            "record_id": "aspirin",
            "source_type": "identity_handoff",
            "source_artifact_id": binding["rows"][0]["source_artifact_id"],
            "source_artifact_sha256": binding["rows"][0]["source_artifact_sha256"],
            "source_candidate_id": "candidate-001",
            "decision_artifact_id": None,
            "decision_artifact_sha256": None,
        }
    ]
    assert binding["rows"][0]["source_artifact_id"].startswith(
        "artifact-resolve-identities-"
    )
    assert len(binding["rows"][0]["source_artifact_sha256"]) == 64


def test_null_library_operation_is_skipped_without_fake_artifact(tmp_path):
    run_dir, completed = run_workflow_a(tmp_path)
    assert completed.returncode == 0, completed.stderr

    manifest = load_json(run_dir / "run_manifest.json")
    assert manifest["node_states"]["optional-library-operation"] == "skipped"
    index = load_json(run_dir / "artifacts" / "index.json")
    assert not any(
        item["producer_node_id"] == "optional-library-operation"
        for item in index["artifacts"]
    )


def test_audit_library_operation_executes_public_skill(tmp_path):
    request = explicit_workflow_a_request()
    request["inputs"]["library_operation"] = {
        "operation": "audit_library",
        "options": {
            "calculation_view": "standardized",
            "include_review_required": False,
        },
    }

    run_dir, completed = start_request(tmp_path, request)

    assert completed.returncode == 0, completed.stderr
    library = artifact_by_logical_name(run_dir, "library-operation")
    assert library["operation"] == "audit_library"
    assert library["operation_status"] == "completed"


def test_audit_library_package_contains_no_absolute_machine_path(tmp_path):
    request = explicit_workflow_a_request()
    request["inputs"]["library_operation"] = {
        "operation": "audit_library",
        "options": {
            "calculation_view": "standardized",
            "include_review_required": False,
        },
    }

    run_dir, completed = start_request(tmp_path, request)

    assert completed.returncode == 0, completed.stderr
    for path in run_dir.rglob("*"):
        if path.is_file() and path.suffix in {".json", ".jsonl"}:
            text = path.read_text(encoding="utf-8")
            assert str(run_dir) not in text, path
            for directory in ("Users", "home", "private", "tmp", "var"):
                marker = (Path(tmp_path.anchor) / directory).as_posix() + "/"
                assert marker not in text, path


@pytest.mark.parametrize(
    "mutate",
    [
        lambda request: request["inputs"].update({"command": ["sh"]}),
        lambda request: request["inputs"]["queries"].append(
            dict(request["inputs"]["queries"][0])
        ),
        lambda request: request["inputs"]["identity"].update({"sources": ["pubchem"]}),
        lambda request: request["inputs"].update(
            {
                "library_operation": {
                    "operation": "audit_library",
                    "options": {},
                }
            }
        ),
        lambda request: request["inputs"].update(
            {
                "library_operation": {
                    "operation": "similarity_search",
                    "queries": [{"id": "missing-record-reference"}],
                    "options": {
                        "calculation_view": "standardized",
                        "include_review_required": False,
                        "fingerprint_profile_id": "profile-001",
                        "metric": "tanimoto",
                        "include_self": False,
                        "top_k": 1,
                    },
                }
            }
        ),
    ],
)
def test_invalid_workflow_a_request_fails_before_run_creation(tmp_path, mutate):
    request = explicit_workflow_a_request()
    mutate(request)

    run_dir, completed = start_request(tmp_path, request)

    assert completed.returncode == 3
    assert "workflow failed" in completed.stderr
    assert not run_dir.exists()
