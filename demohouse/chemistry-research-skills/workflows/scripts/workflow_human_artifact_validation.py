"""Semantic reconstruction for Human Gate derived Artifacts."""

from __future__ import annotations

import csv
import importlib.util
import io
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
    "workflow_human_artifacts_contracts",
)
REGISTRY = _load_local_module(
    "artifact_registry.py",
    "workflow_human_artifacts_registry",
)
HUMAN = _load_local_module(
    "human_gate.py",
    "workflow_human_artifacts_gate",
)
AUTHORIZED_FIELDS = {
    "request_id",
    "structure",
    "source_type",
    "source_candidate_id",
    "source_inchikey",
    "source_artifact_id",
    "decision_artifact_id",
    "record_selection_status",
}
SELECTION_FIELDS = {
    "schema_version",
    "workflow",
    "calculation_view",
    "source_artifact_id",
    "source_artifact_sha256",
    "decision_artifact_id",
    "decision_artifact_sha256",
}


def _exact(value: dict[str, Any], fields: set[str], label: str) -> None:
    CONTRACTS.require_exact_fields(value, fields, set(), label)


def _read(
    run_dir: Path,
    entry: dict[str, Any],
    label: str,
) -> dict[str, Any]:
    path = REGISTRY.validate_run_relative_path(
        run_dir,
        entry["relative_path"],
    )
    return CONTRACTS.read_json_object(path, label)


def _expected_authorized(
    run_dir: Path,
    by_name: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    source = by_name["identity-result"]
    identity = _read(run_dir, source, "identity Artifact")
    decision_entry = by_name.get("identity-human-decision")
    decision = (
        _read(run_dir, decision_entry, "identity HumanDecision")
        if decision_entry is not None
        else None
    )
    return HUMAN.apply_identity_decision(
        identity,
        decision,
        source_artifact_id=source["artifact_id"],
        decision_artifact_id=(
            decision_entry["artifact_id"] if decision_entry is not None else None
        ),
    ).as_json()


def _authorization_errors(
    run_dir: Path,
    by_name: dict[str, dict[str, Any]],
) -> list[str]:
    entry = by_name.get("authorized-structure-input")
    if entry is None:
        return []
    try:
        value = _read(run_dir, entry, "authorized structure input")
        _exact(
            value,
            {
                "schema_version",
                "workflow",
                "structures",
                "excluded_request_ids",
                "abort_run",
            },
            "authorized structure input",
        )
        if (
            value["schema_version"] != "1.0.0"
            or value["workflow"] != "authorized-structure-set"
            or not isinstance(value["structures"], list)
        ):
            raise CONTRACTS.ContractError("authorized structure envelope is invalid")
        for item in value["structures"]:
            _exact(item, AUTHORIZED_FIELDS, "authorized structure")
        if value != _expected_authorized(run_dir, by_name):
            raise CONTRACTS.ContractError(
                "authorized structure does not match identity decision"
            )
    except (
        KeyError,
        TypeError,
        CONTRACTS.ContractError,
        REGISTRY.ArtifactError,
        HUMAN.HumanDecisionError,
    ) as error:
        return [f"authorized structure validation failed: {error}"]
    return []


def _expected_view(
    run_dir: Path,
    request: dict[str, Any],
    by_name: dict[str, dict[str, Any]],
) -> str | None:
    decision = by_name.get("calculation-view-human-decision")
    if decision is None:
        return request["inputs"]["features"]["calculation_view"]
    return HUMAN.selected_calculation_view(
        _read(run_dir, decision, "calculation view HumanDecision")
    )


def _selection_errors(
    run_dir: Path,
    request: dict[str, Any],
    by_name: dict[str, dict[str, Any]],
) -> list[str]:
    entry = by_name.get("calculation-view-selection")
    if entry is None:
        return []
    try:
        value = _read(run_dir, entry, "calculation view selection")
        _exact(value, SELECTION_FIELDS, "calculation view selection")
        expected_view = _expected_view(run_dir, request, by_name)
        if expected_view not in {"standardized", "parent"}:
            raise CONTRACTS.ContractError("calculation view is unsupported")
        source = by_name["standardized-structures"]
        decision = by_name.get("calculation-view-human-decision")
        expected = {
            "schema_version": "1.0.0",
            "workflow": "calculation-view-selection",
            "calculation_view": expected_view,
            "source_artifact_id": source["artifact_id"],
            "source_artifact_sha256": source["sha256"],
            "decision_artifact_id": (
                decision["artifact_id"] if decision is not None else None
            ),
            "decision_artifact_sha256": (
                decision["sha256"] if decision is not None else None
            ),
        }
        if value != expected:
            raise CONTRACTS.ContractError(
                "calculation view does not match request or decision"
            )
    except (
        KeyError,
        TypeError,
        CONTRACTS.ContractError,
        REGISTRY.ArtifactError,
    ) as error:
        return [f"calculation view validation failed: {error}"]
    return []


def _expected_rows(
    authorized: dict[str, Any],
    by_id: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    rows = []
    for record in authorized["structures"]:
        source = by_id[record["source_artifact_id"]]
        decision = by_id.get(record["decision_artifact_id"])
        rows.append(
            {
                "row_index": len(rows),
                "record_id": record["request_id"],
                "source_type": record["source_type"],
                "source_artifact_id": source["artifact_id"],
                "source_artifact_sha256": source["sha256"],
                "source_candidate_id": record["source_candidate_id"],
                "decision_artifact_id": (
                    decision["artifact_id"] if decision is not None else None
                ),
                "decision_artifact_sha256": (
                    decision["sha256"] if decision is not None else None
                ),
            }
        )
    return rows


def _standardization_errors(
    run_dir: Path,
    by_name: dict[str, dict[str, Any]],
    by_id: dict[str, dict[str, Any]],
) -> list[str]:
    binding_entry = by_name.get("standardization-input-binding")
    input_entry = by_name.get("standardization-input")
    if binding_entry is None and input_entry is None:
        return []
    try:
        authorized = _expected_authorized(run_dir, by_name)
        expected_rows = _expected_rows(authorized, by_id)
        binding = _read(run_dir, binding_entry, "standardization input binding")
        expected_binding = {
            "schema_version": "1.0.0",
            "workflow": "compound-standardization-input-binding",
            "rows": expected_rows,
        }
        if binding != expected_binding:
            raise CONTRACTS.ContractError(
                "standardization binding does not match authorized structures"
            )
        input_path = REGISTRY.validate_run_relative_path(
            run_dir,
            input_entry["relative_path"],
        )
        reader = csv.DictReader(io.StringIO(input_path.read_text(encoding="utf-8")))
        actual_csv = list(reader)
        expected_csv = [
            {
                "id": item["request_id"],
                "structure": item["structure"],
                "source": item["source_type"],
            }
            for item in authorized["structures"]
        ]
        if (
            reader.fieldnames != ["id", "structure", "source"]
            or actual_csv != expected_csv
        ):
            raise CONTRACTS.ContractError(
                "standardization CSV does not match authorized structures"
            )
    except (
        KeyError,
        OSError,
        UnicodeError,
        CONTRACTS.ContractError,
        REGISTRY.ArtifactError,
        HUMAN.HumanDecisionError,
    ) as error:
        return [f"standardization binding validation failed: {error}"]
    return []


def derived_artifact_errors(
    run_dir: Path,
    request: dict[str, Any],
    artifacts: list[dict[str, Any]],
) -> list[str]:
    by_name = {item["logical_name"]: item for item in artifacts}
    by_id = {item["artifact_id"]: item for item in artifacts}
    errors = _authorization_errors(run_dir, by_name)
    errors.extend(_selection_errors(run_dir, request, by_name))
    errors.extend(_standardization_errors(run_dir, by_name, by_id))
    return errors
