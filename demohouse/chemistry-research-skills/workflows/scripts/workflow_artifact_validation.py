"""Artifact, Validator report, and domain-state checks for Workflow runs."""

from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path
from typing import Any


def _load_local_module(filename: str, module_name: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


CONTRACTS = _load_local_module(
    "workflow_contracts.py",
    "workflow_artifact_validation_contracts",
)
REGISTRY = _load_local_module(
    "artifact_registry.py",
    "workflow_artifact_validation_registry",
)
ADAPTERS = _load_local_module(
    "skill_adapters.py",
    "workflow_artifact_validation_adapters",
)
OUTPUT_ADAPTERS = {
    "identity-result": "resolve-chemical-identities-v1",
    "standardized-structures": "standardize-chemical-structures-v1",
    "molecular-features": "compute-molecular-features-v1",
    "library-operation": "search-and-curate-chemical-libraries-v1",
    "curated-reactions": "curate-reactions-v1",
    "route-discovery": "review-routes-v1",
    "route-review": "review-routes-v1",
}


def _adapter_id(logical_name: str) -> str | None:
    if re.fullmatch(r"precedent-search-\d{4}", logical_name):
        return "search-reactions-v1"
    return OUTPUT_ADAPTERS.get(logical_name)


def _input_adapter_id(logical_name: str) -> str | None:
    if re.fullmatch(r"standardization-input-\d{4}", logical_name):
        return "standardize-chemical-structures-v1"
    return None


def _load_artifacts(
    run_dir: Path,
    events: list[dict[str, Any]],
) -> tuple[list[str], list[dict[str, Any]]]:
    try:
        rebuilt = REGISTRY.rebuild_artifact_index(events)
        stored = CONTRACTS.read_json_object(
            run_dir / "artifacts" / "index.json",
            "artifact index",
        )
    except (REGISTRY.ArtifactError, CONTRACTS.ContractError) as error:
        return [f"artifact index: {error}"], []
    errors = ["artifact index does not match ledger"] if stored != rebuilt else []
    return errors, rebuilt["artifacts"]


def _validation_binding_error(
    item: dict[str, Any],
    by_id: dict[str, dict[str, Any]],
) -> str | None:
    validation_id = item["validation_artifact_id"]
    if validation_id is None:
        return (
            f"artifact {item['artifact_id']} validation binding is required"
            if _adapter_id(item["logical_name"]) is not None
            else None
        )
    validation = by_id.get(validation_id)
    invalid = (
        validation is None
        or validation["producer_node_id"] != item["producer_node_id"]
        or validation["producer_attempt"] != item["producer_attempt"]
        or validation["domain_state"] != "passed"
    )
    return (
        f"artifact {item['artifact_id']} validation binding invalid"
        if invalid
        else None
    )


def _saved_report_errors(
    run_dir: Path,
    item: dict[str, Any],
    validation: dict[str, Any],
    rerun_report: dict[str, Any],
) -> list[str]:
    try:
        saved_report = CONTRACTS.read_json_object(
            run_dir / validation["relative_path"],
            "saved Validator report",
        )
    except CONTRACTS.ContractError as error:
        return [f"artifact {item['artifact_id']} Validator report: {error}"]
    errors = []
    if saved_report.get("valid") is not True:
        errors.append(f"artifact {item['artifact_id']} Validator report invalid")
    if saved_report != rerun_report:
        errors.append(f"artifact {item['artifact_id']} Validator report mismatch")
    return errors


def _skill_artifact_errors(
    run_dir: Path,
    item: dict[str, Any],
    path: Path,
    by_id: dict[str, dict[str, Any]],
    repository_root: Path,
) -> list[str]:
    adapter_id = _adapter_id(item["logical_name"])
    if adapter_id is None:
        return []
    adapter = ADAPTERS.ADAPTERS[adapter_id]
    try:
        rerun_report = ADAPTERS.run_validator(
            adapter,
            path,
            repository_root=repository_root,
            timeout_seconds=180,
        )
        document = CONTRACTS.read_json_object(path, "Skill artifact")
        domain_state = ADAPTERS.extract_domain_state(adapter, document)
    except (ADAPTERS.AdapterError, CONTRACTS.ContractError) as error:
        return [f"artifact {item['artifact_id']} Validator failed: {error}"]
    errors = []
    if domain_state != item["domain_state"]:
        errors.append(f"artifact {item['artifact_id']} domain state mismatch")
    validation = by_id.get(item["validation_artifact_id"])
    if validation is not None:
        errors.extend(_saved_report_errors(run_dir, item, validation, rerun_report))
    return errors


def _input_artifact_errors(
    item: dict[str, Any],
    path: Path,
    repository_root: Path,
) -> list[str]:
    adapter_id = _input_adapter_id(item["logical_name"])
    if adapter_id is None:
        return []
    try:
        ADAPTERS.run_validator(
            ADAPTERS.ADAPTERS[adapter_id],
            path,
            repository_root=repository_root,
            timeout_seconds=180,
        )
    except ADAPTERS.AdapterError as error:
        return [f"artifact {item['artifact_id']} input Validator failed: {error}"]
    return []


def artifact_errors(
    run_dir: Path,
    events: list[dict[str, Any]],
    repository_root: Path,
) -> tuple[list[str], list[dict[str, Any]]]:
    errors, artifacts = _load_artifacts(run_dir, events)
    if not artifacts:
        return errors, artifacts
    by_id = {item["artifact_id"]: item for item in artifacts}
    for item in artifacts:
        try:
            path = REGISTRY.verify_artifact(run_dir, item)
        except REGISTRY.ArtifactError as error:
            errors.append(f"artifact {item['artifact_id']}: {error}")
            continue
        binding_error = _validation_binding_error(item, by_id)
        if binding_error is not None:
            errors.append(binding_error)
        errors.extend(
            _input_artifact_errors(
                item,
                path,
                repository_root,
            )
        )
        errors.extend(
            _skill_artifact_errors(
                run_dir,
                item,
                path,
                by_id,
                repository_root,
            )
        )
    return errors, artifacts
