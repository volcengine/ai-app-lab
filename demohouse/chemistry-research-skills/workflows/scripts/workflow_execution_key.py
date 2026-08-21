"""Complete execution keys for Workflow node attempts."""

from __future__ import annotations

import hashlib
import importlib.metadata
import importlib.util
import platform
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence


def _load_contracts() -> Any:
    path = Path(__file__).with_name("workflow_contracts.py")
    spec = importlib.util.spec_from_file_location(
        "workflow_execution_key_contracts",
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load workflow_contracts.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


CONTRACTS = _load_contracts()
DEPENDENCIES = (
    "chembl-structure-pipeline",
    "ord-schema",
    "PyYAML",
    "rdkit",
)


@dataclass(frozen=True)
class InternalAdapterSpec:
    adapter_id: str
    adapter_version: str
    entrypoint: str
    validator: str


class ExecutionKeyError(ValueError):
    """Raised when executable provenance cannot be fingerprinted."""


def compute_execution_key(
    *,
    definition_fingerprint: str,
    node_id: str,
    adapter: Any,
    parameters: dict[str, Any],
    upstream_artifacts: Sequence[dict[str, Any]],
    entrypoint_sha256: str,
    validator_sha256: str,
    python_version: str,
    dependency_versions: dict[str, str],
) -> str:
    return CONTRACTS.sha256_json(
        {
            "definition_fingerprint": definition_fingerprint,
            "node_id": node_id,
            "adapter_id": adapter.adapter_id,
            "adapter_version": adapter.adapter_version,
            "parameters": parameters,
            "upstream_artifacts": [
                [item["artifact_id"], item["sha256"]] for item in upstream_artifacts
            ],
            "entrypoint_sha256": entrypoint_sha256,
            "validator_sha256": validator_sha256,
            "python_version": python_version,
            "dependency_versions": dependency_versions,
        }
    )


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _controlled_file(repository_root: Path, declared: str) -> Path:
    try:
        root = repository_root.resolve(strict=True)
        path = (root / declared).resolve(strict=True)
        path.relative_to(root)
    except (OSError, ValueError) as error:
        raise ExecutionKeyError("execution key file is missing or unsafe") from error
    if not path.is_file() or path.is_symlink():
        raise ExecutionKeyError("execution key file must be regular")
    return path


def dependency_versions() -> dict[str, str]:
    versions: dict[str, str] = {}
    for distribution in DEPENDENCIES:
        try:
            versions[distribution] = importlib.metadata.version(distribution)
        except importlib.metadata.PackageNotFoundError:
            versions[distribution] = "missing"
    return versions


def internal_adapter(node_id: str) -> InternalAdapterSpec:
    gate_nodes = {"identity-gate", "calculation-view-gate"}
    workflow_b_task10_nodes = {
        "prepare-reaction-input",
        "discover-route-steps",
        "bind-curation-records",
    }
    workflow_b_task11_nodes = {
        "expand-search-plan",
        "search-precedents-per-step",
        "assemble-step-artifacts",
        "review-routes",
        "build-expert-review-package",
    }
    entrypoint = (
        "workflows/scripts/workflow_a_gates.py"
        if node_id in gate_nodes
        else "workflows/scripts/workflow_a_nodes.py"
    )
    if node_id in workflow_b_task10_nodes:
        entrypoint = "workflows/scripts/workflow_b_nodes.py"
    if node_id in workflow_b_task11_nodes:
        entrypoint = "workflows/scripts/workflow_b_task11_nodes.py"
    if node_id == "validate-workflow":
        entrypoint = "workflows/scripts/validate_workflow.py"
    return InternalAdapterSpec(
        adapter_id=f"workflow-internal-{node_id}-v1",
        adapter_version="1.0.0",
        entrypoint=entrypoint,
        validator="workflows/scripts/validate_workflow.py",
    )


def compute_repository_execution_key(
    *,
    repository_root: Path,
    definition_fingerprint: str,
    node_id: str,
    adapter: Any,
    parameters: dict[str, Any],
    upstream_artifacts: Sequence[dict[str, Any]],
) -> str:
    return compute_execution_key(
        definition_fingerprint=definition_fingerprint,
        node_id=node_id,
        adapter=adapter,
        parameters=parameters,
        upstream_artifacts=upstream_artifacts,
        entrypoint_sha256=_sha256_file(
            _controlled_file(repository_root, adapter.entrypoint)
        ),
        validator_sha256=_sha256_file(
            _controlled_file(repository_root, adapter.validator)
        ),
        python_version=platform.python_version(),
        dependency_versions=dependency_versions(),
    )
