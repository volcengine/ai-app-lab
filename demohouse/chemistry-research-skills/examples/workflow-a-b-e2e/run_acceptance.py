#!/usr/bin/env python3
"""Run deterministic offline acceptance for Workflow A and Workflow B."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
EXAMPLE_ROOT = Path(__file__).resolve().parent
RUNNER = REPOSITORY_ROOT / "workflows" / "scripts" / "run_workflow.py"
VALIDATOR = REPOSITORY_ROOT / "workflows" / "scripts" / "validate_workflow.py"
SUCCESS_STATUSES = {"completed", "completed_with_review"}
SKILL_OUTPUTS = {
    "workflow_a": (
        "identity-result",
        "standardized-structures",
        "molecular-features",
    ),
    "workflow_b": (
        "curated-reactions",
        "route-discovery",
        "precedent-search-0001",
        "route-review",
    ),
}
NETWORK_GUARD = """\
import os
import socket

_log_path = os.environ.get("WORKFLOW_ACCEPTANCE_NETWORK_LOG")


def _blocked(*_args, **_kwargs):
    if _log_path:
        with open(_log_path, "a", encoding="utf-8") as handle:
            handle.write("network_attempt\\n")
    raise RuntimeError("network disabled by Workflow acceptance")


socket.create_connection = _blocked
socket.socket.connect = _blocked
socket.socket.connect_ex = _blocked
"""


class AcceptanceError(RuntimeError):
    """Raised when an acceptance invariant is not met."""


def _canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )


def _fingerprint(value: Any) -> str:
    return hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


def _read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(
            path.read_text(encoding="utf-8"),
            parse_constant=lambda value: (_ for _ in ()).throw(
                ValueError(f"non-finite JSON value: {value}")
            ),
        )
    except (OSError, ValueError, json.JSONDecodeError) as error:
        raise AcceptanceError(f"unreadable JSON: {path.name}") from error
    if not isinstance(value, dict):
        raise AcceptanceError(f"JSON must be an object: {path.name}")
    return value


def _write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(_canonical_json(value) + "\n", encoding="utf-8")


def _run_checked(
    arguments: list[str],
    *,
    environment: dict[str, str],
) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(
        arguments,
        cwd=REPOSITORY_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        command = Path(arguments[1]).name if len(arguments) > 1 else arguments[0]
        raise AcceptanceError(
            f"{command} failed with exit code {completed.returncode}: "
            f"{completed.stderr.strip()}"
        )
    return completed


def _network_environment(
    output_dir: Path,
    network_disabled: bool,
) -> tuple[dict[str, str], Path]:
    environment = dict(os.environ)
    log_path = output_dir / ".network-attempts.log"
    if not network_disabled:
        return environment, log_path
    guard_dir = output_dir / ".network-guard"
    guard_dir.mkdir()
    (guard_dir / "sitecustomize.py").write_text(
        NETWORK_GUARD,
        encoding="utf-8",
    )
    existing = environment.get("PYTHONPATH")
    environment["PYTHONPATH"] = (
        str(guard_dir) if not existing else os.pathsep.join((str(guard_dir), existing))
    )
    environment["WORKFLOW_ACCEPTANCE_NETWORK_LOG"] = str(log_path)
    return environment, log_path


def _artifact_index(run_dir: Path) -> list[dict[str, Any]]:
    value = _read_json(run_dir / "artifacts" / "index.json")
    artifacts = value.get("artifacts")
    if not isinstance(artifacts, list):
        raise AcceptanceError("Artifact index is invalid")
    return artifacts


def _skill_fingerprints(
    workflow_name: str,
    run_dir: Path,
    artifacts: list[dict[str, Any]],
) -> dict[str, str]:
    by_name = {
        item["logical_name"]: item
        for item in artifacts
        if isinstance(item, dict) and isinstance(item.get("logical_name"), str)
    }
    output = {}
    for logical_name in SKILL_OUTPUTS[workflow_name]:
        entry = by_name.get(logical_name)
        if entry is None:
            raise AcceptanceError(f"missing Skill Artifact: {logical_name}")
        document = _read_json(run_dir / entry["relative_path"])
        fingerprint = document.get("result_fingerprint")
        if (
            not isinstance(fingerprint, str)
            or len(fingerprint) != 64
            or any(character not in "0123456789abcdef" for character in fingerprint)
        ):
            raise AcceptanceError(f"invalid Skill fingerprint: {logical_name}")
        output[logical_name] = fingerprint
    return output


def _normalized_package(
    run_dir: Path,
    artifacts: list[dict[str, Any]],
) -> dict[str, Any]:
    logical_by_id = {
        item["artifact_id"]: item["logical_name"]
        for item in artifacts
        if isinstance(item, dict)
    }
    evidence = _read_json(run_dir / "evidence_index.json")
    normalized_evidence = []
    for item in evidence.get("evidence", []):
        row = dict(item)
        artifact_id = row.get("artifact_id")
        if artifact_id not in logical_by_id:
            raise AcceptanceError("Evidence references an unknown Artifact")
        row["artifact_id"] = logical_by_id[artifact_id]
        row.pop("sha256", None)
        normalized_evidence.append(row)
    claims = _read_json(run_dir / "claim_ledger.json")
    normalized_claims = []
    for item in claims.get("claims", []):
        row = dict(item)
        subject = row.get("subject_id")
        if subject in logical_by_id:
            row["subject_id"] = logical_by_id[subject]
        normalized_claims.append(row)
    return {
        "evidence": normalized_evidence,
        "claims": normalized_claims,
    }


def _run_once(
    workflow_name: str,
    request_path: Path,
    run_dir: Path,
    environment: dict[str, str],
) -> dict[str, Any]:
    _run_checked(
        [
            sys.executable,
            str(RUNNER),
            "start",
            "--request",
            str(request_path),
            "--run-dir",
            str(run_dir),
        ],
        environment=environment,
    )
    _run_checked(
        [sys.executable, str(VALIDATOR), str(run_dir)],
        environment=environment,
    )
    manifest = _read_json(run_dir / "run_manifest.json")
    status = manifest.get("run_status")
    if status not in SUCCESS_STATUSES:
        raise AcceptanceError(f"{workflow_name} ended with status: {status}")
    artifacts = _artifact_index(run_dir)
    return {
        "status": status,
        "request_fingerprint": manifest["request_fingerprint"],
        "definition_fingerprint": manifest["definition_fingerprint"],
        "skill_artifact_fingerprints": _skill_fingerprints(
            workflow_name,
            run_dir,
            artifacts,
        ),
        "package_semantic_fingerprint": _fingerprint(
            _normalized_package(run_dir, artifacts)
        ),
        "validator_status": "passed",
    }


def _workflow_gold(
    workflow_name: str,
    request_path: Path,
    output_dir: Path,
    environment: dict[str, str],
) -> dict[str, Any]:
    runs = [
        _run_once(
            workflow_name,
            request_path,
            output_dir / f"{workflow_name}-run-{position}",
            environment,
        )
        for position in (1, 2)
    ]
    reproducible = runs[0] == runs[1]
    return {
        "schema_version": "1.0.0",
        "workflow": workflow_name,
        "status": runs[0]["status"],
        "run_count": len(runs),
        "reproducible": reproducible,
        "request_fingerprint": runs[0]["request_fingerprint"],
        "definition_fingerprint": runs[0]["definition_fingerprint"],
        "skill_artifact_fingerprints": runs[0]["skill_artifact_fingerprints"],
        "package_semantic_fingerprint": runs[0]["package_semantic_fingerprint"],
        "validator_statuses": [item["validator_status"] for item in runs],
    }


def run_acceptance(
    output_dir: Path,
    *,
    network_disabled: bool,
) -> dict[str, Any]:
    if output_dir.exists() or output_dir.is_symlink():
        raise AcceptanceError("output directory already exists")
    output_dir.mkdir(parents=True)
    environment, network_log = _network_environment(
        output_dir,
        network_disabled,
    )
    workflow_a = _workflow_gold(
        "workflow_a",
        EXAMPLE_ROOT / "workflow-a-request.json",
        output_dir,
        environment,
    )
    workflow_b = _workflow_gold(
        "workflow_b",
        EXAMPLE_ROOT / "workflow-b-request.json",
        output_dir,
        environment,
    )
    network_used = network_log.exists() and network_log.stat().st_size > 0
    report = {
        "schema_version": "1.0.0",
        "workflow_a": workflow_a,
        "workflow_b": workflow_b,
        "network_guard_enabled": network_disabled,
        "network_used": network_used,
        "fees_incurred": False,
        "agent_required": False,
        "valid": (
            workflow_a["reproducible"]
            and workflow_b["reproducible"]
            and not network_used
        ),
    }
    _write_json(output_dir / "workflow-a-gold-report.json", workflow_a)
    _write_json(output_dir / "workflow-b-gold-report.json", workflow_b)
    _write_json(output_dir / "gold_report.json", report)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--network-disabled", action="store_true")
    args = parser.parse_args()
    try:
        report = run_acceptance(
            args.output_dir,
            network_disabled=args.network_disabled,
        )
    except AcceptanceError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(_canonical_json(report))
    return 0 if report["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
