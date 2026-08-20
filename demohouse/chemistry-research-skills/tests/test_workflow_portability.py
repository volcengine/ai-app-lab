from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
WORKFLOW_ROOT = REPOSITORY_ROOT / "workflows"
ACCEPTANCE_RUNNER = (
    REPOSITORY_ROOT / "examples" / "workflow-a-b-e2e" / "run_acceptance.py"
)


def test_workflows_use_no_machine_absolute_paths():
    user_home_marker = "/" + "Users" + "/"
    internal_path_marker = "byte" + "dance" + "/"
    for path in WORKFLOW_ROOT.rglob("*"):
        if path.is_file() and path.suffix in {".py", ".json", ".md"}:
            text = path.read_text(encoding="utf-8")
            assert user_home_marker not in text
            assert internal_path_marker not in text


def test_acceptance_runs_both_workflows_twice_without_network(tmp_path):
    output = tmp_path / "acceptance"
    home = tmp_path / "home"
    home.mkdir()

    completed = subprocess.run(
        [
            sys.executable,
            str(ACCEPTANCE_RUNNER),
            "--output-dir",
            str(output),
            "--network-disabled",
        ],
        cwd=REPOSITORY_ROOT,
        capture_output=True,
        text=True,
        check=False,
        env={"PATH": os.environ["PATH"], "HOME": str(home)},
    )

    assert completed.returncode == 0, completed.stderr
    report = json.loads((output / "gold_report.json").read_text(encoding="utf-8"))
    assert report["schema_version"] == "1.0.0"
    assert report["workflow_a"]["status"] in {
        "completed",
        "completed_with_review",
    }
    assert report["workflow_b"]["status"] in {
        "completed",
        "completed_with_review",
    }
    assert report["workflow_a"]["run_count"] == 2
    assert report["workflow_b"]["run_count"] == 2
    assert report["workflow_a"]["reproducible"] is True
    assert report["workflow_b"]["reproducible"] is True
    assert report["network_used"] is False
    assert report["fees_incurred"] is False
