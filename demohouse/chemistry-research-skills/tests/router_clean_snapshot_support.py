from __future__ import annotations

import importlib.util
import json
import os
import shutil
import socket
import sys
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator


CHAIN_IDS = (
    "identity-standardization-v1",
    "reaction-precedent-v1",
    "structure-features-v1",
    "structure-library-v1",
)
SUCCESS_STATUSES = {"completed", "completed_with_review"}
NETWORK_GUARD = """\
import os
import socket

_log = os.environ.get("CHEMISTRY_CLEAN_SNAPSHOT_NETWORK_LOG")

def _blocked(*_args, **_kwargs):
    if _log:
        with open(_log, "a", encoding="utf-8") as handle:
            handle.write("network_attempt\\n")
    raise RuntimeError("network disabled by clean snapshot acceptance")

socket.create_connection = _blocked
socket.socket.connect = _blocked
socket.socket.connect_ex = _blocked
"""


def _load(path: Path, name: str) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def _copy_clean_source(repository_root: Path, snapshot: Path) -> dict[str, Any]:
    manifest_path = repository_root / "orchestration/chemistry-agent-bundle-v1.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    snapshot.mkdir()
    for item in manifest["distributable_files"]:
        source = repository_root / item["path"]
        destination = snapshot / item["path"]
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
    destination = snapshot / "orchestration/chemistry-agent-bundle-v1.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(manifest_path, destination)
    assert not (snapshot / "tests").exists()
    assert not (snapshot / ".git").exists()
    return manifest


@contextmanager
def _blocked_network(root: Path) -> Iterator[Path]:
    guard = root / "network-guard"
    guard.mkdir()
    (guard / "sitecustomize.py").write_text(NETWORK_GUARD, encoding="utf-8")
    log_path = root / "network-attempts.log"
    previous_pythonpath = os.environ.get("PYTHONPATH")
    previous_log = os.environ.get("CHEMISTRY_CLEAN_SNAPSHOT_NETWORK_LOG")
    os.environ["PYTHONPATH"] = (
        str(guard)
        if not previous_pythonpath
        else os.pathsep.join((str(guard), previous_pythonpath))
    )
    os.environ["CHEMISTRY_CLEAN_SNAPSHOT_NETWORK_LOG"] = str(log_path)
    original = (
        socket.create_connection,
        socket.socket.connect,
        socket.socket.connect_ex,
    )

    def blocked(*_args: Any, **_kwargs: Any) -> Any:
        log_path.write_text("network_attempt\n", encoding="utf-8")
        raise RuntimeError("network disabled by clean snapshot acceptance")

    socket.create_connection = blocked
    socket.socket.connect = blocked
    socket.socket.connect_ex = blocked
    try:
        yield log_path
    finally:
        socket.create_connection, socket.socket.connect, socket.socket.connect_ex = (
            original
        )
        if previous_pythonpath is None:
            os.environ.pop("PYTHONPATH", None)
        else:
            os.environ["PYTHONPATH"] = previous_pythonpath
        if previous_log is None:
            os.environ.pop("CHEMISTRY_CLEAN_SNAPSHOT_NETWORK_LOG", None)
        else:
            os.environ["CHEMISTRY_CLEAN_SNAPSHOT_NETWORK_LOG"] = previous_log


def _install(snapshot: Path, project: Path) -> tuple[Path, dict[str, Any]]:
    installer_path = (
        snapshot / "skills/chemistry-research-router/scripts/install_bundle.py"
    )
    installer = _load(installer_path, "clean_snapshot_installer")
    project.mkdir()
    receipt = installer.install_bundle("trae", "project", snapshot, project)
    return Path(receipt["runtime_root"]), receipt


def _parameters() -> list[dict[str, Any]]:
    return [
        {"field_id": "network_mode", "value": "offline"},
        {"field_id": "external_retry", "value": "manual"},
        {"field_id": "standardization_profile", "value": "chembl-pipeline"},
        {"field_id": "calculation_view", "value": "standardized"},
        {"field_id": "reaction_provider", "value": "local_curated_corpus"},
        {"field_id": "reaction_operation", "value": "lookup_reaction"},
        {"field_id": "reaction_top_k", "value": 20},
        {"field_id": "reaction_include_review_required", "value": False},
        {"field_id": "reaction_use_stereochemistry", "value": True},
    ]


def _operation(kind: str, index: int) -> dict[str, Any]:
    return {
        "operation_id": f"operation-{index:03d}",
        "operation_type": kind,
        "sequence": index,
    }


def _chain_request(chain_id: str) -> dict[str, Any]:
    operations = {
        "identity-standardization-v1": [
            "resolve_identity",
            "standardize_structure",
        ],
        "structure-features-v1": [
            "standardize_structure",
            "compute_fingerprint",
        ],
        "structure-library-v1": [
            "standardize_structure",
            "compute_fingerprint",
            "curate_library",
        ],
        "reaction-precedent-v1": [
            "curate_reaction",
            "search_reaction_precedent",
        ],
    }[chain_id]
    object_type = (
        "reaction_record"
        if chain_id == "reaction-precedent-v1"
        else "chemical_structure"
    )
    representation = "CCO>>CC=O" if object_type == "reaction_record" else "CCO"
    return {
        "schema_version": "1.0.0",
        "request_id": f"clean-snapshot-{chain_id}",
        "target_id": chain_id,
        "inputs": {
            "research_objects": [
                {
                    "object_id": "object-001",
                    "object_type": object_type,
                    "representation": representation,
                }
            ],
            "artifacts": [],
            "operations": [
                _operation(kind, index)
                for index, kind in enumerate(operations, start=1)
            ],
        },
        "parameters": _parameters(),
        "execution_policy": {
            "network_mode": "offline",
            "external_retry": "manual",
        },
    }


def _run_direct(runtime: Path, runs: Path) -> dict[str, Any]:
    script = runtime / "skills/chemistry-research-router/scripts/direct_runner.py"
    direct = _load(script, "clean_snapshot_direct")
    request = {
        "schema_version": "1.0.0",
        "request_id": "clean-snapshot-direct",
        "target_id": "standardize-chemical-structures",
        "inputs": {
            "research_objects": [
                {
                    "object_id": "ethanol",
                    "object_type": "chemical_structure",
                    "representation": "CCO",
                }
            ],
            "artifacts": [],
            "operations": [_operation("standardize_structure", 1)],
        },
        "parameters": _parameters(),
        "execution_policy": {
            "network_mode": "offline",
            "external_retry": "manual",
        },
    }
    result = direct.start_direct(request, runs / "direct", runtime)
    validation = direct.validate_direct_run(result.run_dir, runtime)
    return {
        "status": result.status,
        "validator_valid": validation["valid"],
    }


def _run_chains(runtime: Path, runs: Path) -> dict[str, Any]:
    script = runtime / "skills/chemistry-research-router/scripts/chain_runner.py"
    runner = _load(script, "clean_snapshot_chains")
    results = {}
    for chain_id in CHAIN_IDS:
        result = runner.start_chain(
            _chain_request(chain_id),
            runs / chain_id,
            runtime,
        )
        validation = runner.validate_chain_run(result.run_dir, runtime)
        results[chain_id] = {
            "status": result.status,
            "validator_valid": validation["valid"],
        }
    return results


def _workflow_inputs(repository_root: Path, destination: Path) -> Path:
    source = repository_root / "examples/workflow-a-b-e2e"
    shutil.copytree(source, destination)
    return destination


def _run_workflows(
    repository_root: Path,
    runtime: Path,
    runs: Path,
    data: Path,
) -> dict[str, Any]:
    scripts = runtime / "workflows/scripts"
    runner = _load(scripts / "workflow_runner.py", "clean_snapshot_workflows")
    validator = _load(scripts / "validate_workflow.py", "clean_snapshot_validator")
    requests = {
        "compound-evidence-v1": data / "workflow-a-request.json",
        "route-evidence-review-v1": data / "workflow-b-request.json",
    }
    results = {}
    for workflow_id, request_path in requests.items():
        result = runner.start_run(
            request_path,
            runs / workflow_id,
            runtime,
        )
        validation = validator.validate_run_directory(result.run_dir, runtime)
        results[workflow_id] = {
            "status": result.status,
            "validator_valid": validation["valid"],
        }
    return results


def run_clean_snapshot_acceptance(
    repository_root: Path,
    temporary_root: Path,
) -> dict[str, Any]:
    snapshot = temporary_root / "clean-source"
    project = temporary_root / "installed-project"
    runs = temporary_root / "runs"
    workflow_data = temporary_root / "workflow-data"
    runs.mkdir()
    _copy_clean_source(repository_root, snapshot)
    _workflow_inputs(repository_root, workflow_data)
    with _blocked_network(temporary_root) as network_log:
        runtime, receipt = _install(snapshot, project)
        direct = _run_direct(runtime, runs)
        chains = _run_chains(runtime, runs)
        workflows = _run_workflows(
            repository_root,
            runtime,
            runs,
            workflow_data,
        )
    network_used = network_log.exists() and network_log.stat().st_size > 0
    smoke_validator = _load(
        runtime / "skills/chemistry-research-router/scripts/validate_installation.py",
        "clean_snapshot_installation_validation",
    )
    receipt_path = project / ".chemistry-agent-bundle/installation-receipt.json"
    smoke = smoke_validator.run_installation_smoke(receipt_path)
    valid = (
        direct["validator_valid"]
        and all(item["validator_valid"] for item in chains.values())
        and all(item["validator_valid"] for item in workflows.values())
        and all(item["status"] in SUCCESS_STATUSES for item in chains.values())
        and all(item["status"] in SUCCESS_STATUSES for item in workflows.values())
        and direct["status"] in SUCCESS_STATUSES
        and smoke["failed"] == 0
        and not network_used
    )
    return {
        "valid": valid,
        "agent_required": False,
        "network_used": network_used,
        "fees_incurred": False,
        "snapshot_contains_tests": (snapshot / "tests").exists(),
        "bundle_fingerprint": receipt["bundle_fingerprint"],
        "installation_smoke": smoke,
        "direct": direct,
        "chains": chains,
        "workflows": workflows,
    }
