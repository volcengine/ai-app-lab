from __future__ import annotations

import pytest

from workflow_test_support import (
    REPOSITORY_ROOT,
    RUNNER,
    completed_workflow_a,
    load_json,
)


def _identity_artifact_path(run_dir):
    index = load_json(run_dir / "artifacts/index.json")
    entry = next(
        item for item in index["artifacts"] if item["logical_name"] == "identity-result"
    )
    return run_dir / entry["relative_path"]


@pytest.mark.parametrize("mutation", ["tamper", "delete"])
def test_committed_artifact_damage_is_failed_integrity(tmp_path, mutation):
    run_dir = completed_workflow_a(tmp_path)
    artifact = _identity_artifact_path(run_dir)
    if mutation == "tamper":
        artifact.write_text('{"tampered":true}', encoding="utf-8")
    else:
        artifact.unlink()

    result = RUNNER.resume_run(run_dir, REPOSITORY_ROOT)

    assert result.status == "failed_integrity"
    assert result.exit_code == 4
    manifest = load_json(run_dir / "run_manifest.json")
    assert manifest["run_status"] == "failed_integrity"
    event_count = manifest["event_count"]

    repeated = RUNNER.resume_run(run_dir, REPOSITORY_ROOT)

    assert repeated.status == "failed_integrity"
    assert load_json(run_dir / "run_manifest.json")["event_count"] == event_count


def test_final_package_tamper_is_failed_integrity(tmp_path):
    run_dir = completed_workflow_a(tmp_path)
    claim_ledger = run_dir / "claim_ledger.json"
    claim_ledger.write_text(
        claim_ledger.read_text(encoding="utf-8") + " ",
        encoding="utf-8",
    )

    result = RUNNER.resume_run(run_dir, REPOSITORY_ROOT)

    assert result.status == "failed_integrity"
    assert result.exit_code == 4


def test_validator_failure_prevents_completed_node_reuse(tmp_path, monkeypatch):
    run_dir = completed_workflow_a(tmp_path)
    recovery = getattr(RUNNER, "RECOVERY", None)
    assert recovery is not None

    def reject_validator(*_args, **_kwargs):
        raise recovery.ADAPTERS.AdapterError("simulated Validator drift")

    monkeypatch.setattr(
        recovery.ADAPTERS,
        "run_validator",
        reject_validator,
    )

    result = RUNNER.resume_run(run_dir, REPOSITORY_ROOT)

    assert result.status == "failed_integrity"
    assert result.exit_code == 4
