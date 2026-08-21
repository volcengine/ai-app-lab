from __future__ import annotations

from pathlib import Path

import router_clean_snapshot_support as clean_support


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]


def test_clean_snapshot_runs_all_local_orchestration_targets(
    tmp_path: Path,
) -> None:
    report = clean_support.run_clean_snapshot_acceptance(
        REPOSITORY_ROOT,
        tmp_path,
    )

    assert report["valid"] is True
    assert report["agent_required"] is False
    assert report["network_used"] is False
    assert report["fees_incurred"] is False
    assert report["snapshot_contains_tests"] is False
    assert report["installation_smoke"]["total"] == 12
    assert report["installation_smoke"]["failed"] == 0
    assert report["direct"]["validator_valid"] is True
    assert set(report["chains"]) == {
        "identity-standardization-v1",
        "reaction-precedent-v1",
        "structure-features-v1",
        "structure-library-v1",
    }
    assert all(item["validator_valid"] for item in report["chains"].values())
    assert set(report["workflows"]) == {
        "compound-evidence-v1",
        "route-evidence-review-v1",
    }
    assert all(item["validator_valid"] for item in report["workflows"].values())
