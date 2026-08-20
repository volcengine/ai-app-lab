from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
INSTALLER = (
    REPOSITORY_ROOT
    / "skills"
    / "chemistry-research-router"
    / "scripts"
    / "install_bundle.py"
)


def test_install_bundle_cli_creates_valid_project_installation(
    tmp_path: Path,
) -> None:
    project = tmp_path / "project"
    project.mkdir()

    completed = subprocess.run(
        [
            sys.executable,
            str(INSTALLER),
            "--host",
            "trae",
            "--scope",
            "project",
            "--source-root",
            str(REPOSITORY_ROOT),
            "--target-root",
            str(project),
        ],
        cwd=REPOSITORY_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr
    summary = json.loads(completed.stdout)
    assert summary["status"] == "installed"
    assert summary["host_id"] == "trae"
    assert summary["scope"] == "project"
    assert len(summary["bundle_fingerprint"]) == 64
    assert (project / ".chemistry-agent-bundle" / "installation-receipt.json").is_file()
