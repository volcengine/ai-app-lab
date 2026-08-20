"""Validate persisted workflow run foundations independently of the runner."""

from __future__ import annotations

import argparse
import importlib.util
import json
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
    "validate_workflow_contracts",
)
DEFINITIONS = _load_local_module(
    "workflow_definition.py",
    "validate_workflow_definitions",
)
STATE = _load_local_module(
    "workflow_state.py",
    "validate_workflow_state",
)
LEDGER = _load_local_module(
    "event_ledger.py",
    "validate_workflow_ledger",
)
REGISTRY = _load_local_module(
    "artifact_registry.py",
    "validate_workflow_registry",
)
ADAPTERS = _load_local_module(
    "skill_adapters.py",
    "validate_workflow_adapters",
)
EVIDENCE = _load_local_module(
    "evidence_package.py",
    "validate_workflow_evidence",
)
WORKFLOW_A_REQUEST = _load_local_module(
    "workflow_a_request.py",
    "validate_workflow_a_request",
)
WORKFLOW_B_REQUEST = _load_local_module(
    "workflow_b_request.py",
    "validate_workflow_b_request",
)
SECURITY = _load_local_module(
    "workflow_package_security.py",
    "validate_workflow_security",
)
EVENT_VALIDATION = _load_local_module(
    "workflow_event_validation.py",
    "validate_workflow_events",
)
CHECKSUMS = _load_local_module(
    "workflow_checksum_validation.py",
    "validate_workflow_checksums",
)
ARTIFACT_VALIDATION = _load_local_module(
    "workflow_artifact_validation.py",
    "validate_workflow_artifacts",
)
EXECUTION_KEYS = _load_local_module(
    "workflow_execution_key_validation.py",
    "validate_workflow_execution_keys",
)
HUMAN_GATES = _load_local_module(
    "workflow_human_gate_validation.py",
    "validate_workflow_human_gates",
)
WORKFLOW_B_SEMANTICS = _load_local_module(
    "workflow_b_semantic_validation.py",
    "validate_workflow_b_semantics",
)
PACKAGE_CONSISTENCY = _load_local_module(
    "workflow_package_consistency.py",
    "validate_workflow_package_consistency",
)


def _read_request(run_dir: Path) -> dict[str, Any]:
    value = CONTRACTS.read_json_object(
        run_dir / "workflow_request.json",
        "workflow request",
    )
    return CONTRACTS.validate_common_request(value)


def _read_definition(run_dir: Path) -> dict[str, Any]:
    value = CONTRACTS.read_json_object(
        run_dir / "workflow_definition.json",
        "workflow definition",
    )
    return DEFINITIONS.validate_definition(value)


def _validate_foundations(
    run_dir: Path,
    repository_root: Path,
) -> list[str]:
    errors: list[str] = []
    try:
        request = _read_request(run_dir)
        definition = _read_definition(run_dir)
        built_in = DEFINITIONS.load_definition(
            request["workflow_id"],
            repository_root,
        )
    except (
        CONTRACTS.ContractError,
        DEFINITIONS.DefinitionError,
    ) as error:
        return [str(error)]
    if definition["definition_fingerprint"] != built_in["definition_fingerprint"]:
        errors.append("stored definition does not match built-in definition")
    ledger_path = run_dir / "events.jsonl"
    try:
        run_id = LEDGER.read_declared_run_id(ledger_path)
        events = LEDGER.read_verified_events(ledger_path, run_id)
        rebuilt = STATE.rebuild_run_manifest(events, definition)
    except (LEDGER.LedgerIntegrityError, STATE.StateTransitionError) as error:
        return [*errors, str(error)]
    if rebuilt["request_fingerprint"] != CONTRACTS.sha256_json(request):
        errors.append("request fingerprint does not match ledger")
    if rebuilt["workflow_id"] != request["workflow_id"]:
        errors.append("workflow_id does not match request")
    try:
        manifest = CONTRACTS.read_json_object(
            run_dir / "run_manifest.json",
            "run manifest",
        )
    except CONTRACTS.ContractError as error:
        return [*errors, str(error)]
    if manifest != rebuilt:
        errors.append("manifest does not match ledger")
    return errors


def _package_errors(
    run_dir: Path,
    manifest: dict[str, Any],
    events: list[dict[str, Any]],
    artifacts: list[dict[str, Any]],
) -> list[str]:
    errors: list[str] = []
    try:
        evidence = CONTRACTS.read_json_object(
            run_dir / "evidence_index.json",
            "evidence index",
        )
        claims = CONTRACTS.read_json_object(
            run_dir / "claim_ledger.json",
            "claim ledger",
        )
        report = CONTRACTS.read_json_object(
            run_dir / "workflow_report.json",
            "workflow report",
        )
    except CONTRACTS.ContractError as error:
        return [str(error)]
    package_report = EVIDENCE.validate_package(
        {"evidence_index": evidence, "claim_ledger": claims}
    )
    errors.extend(package_report["errors"])
    try:
        expected_evidence, expected_claims, expected_report = _expected_package(
            run_dir,
            manifest,
            events,
            artifacts,
        )
    except EVIDENCE.CONTRACTS.ContractError as error:
        return [*errors, str(error)]
    errors.extend(
        PACKAGE_CONSISTENCY.package_consistency_errors(
            manifest,
            artifacts,
            evidence,
            claims,
            report,
            expected_evidence,
            expected_claims,
            expected_report,
        )
    )
    return errors


def _expected_package(
    run_dir: Path,
    manifest: dict[str, Any],
    events: list[dict[str, Any]],
    artifacts: list[dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    expected_evidence = EVIDENCE.build_evidence_index(events, artifacts)
    artifact_documents = None
    if manifest["workflow_id"] == "route-evidence-review-v1":
        artifact_documents = EVIDENCE.load_artifact_documents(
            run_dir,
            artifacts,
        )
    expected_claims = EVIDENCE.build_claim_ledger(
        manifest["workflow_id"],
        expected_evidence,
        artifact_documents,
    )
    expected_report = EVIDENCE.build_workflow_report(
        workflow_id=manifest["workflow_id"],
        run_status=manifest["run_status"],
        artifacts=artifacts,
        evidence=expected_evidence,
        claims=expected_claims,
    )
    return expected_evidence, expected_claims, expected_report


def _terminal_errors(
    manifest: dict[str, Any],
    definition: dict[str, Any],
) -> list[str]:
    run_status = manifest.get("run_status")
    expected = {item["node_id"] for item in definition["nodes"]}
    states = manifest.get("node_states")
    if not isinstance(states, dict) or not all(
        isinstance(node_id, str) and isinstance(state, str)
        for node_id, state in states.items()
    ):
        return ["run manifest node_states is invalid"]
    if set(states) - expected:
        return ["run manifest contains unknown node state"]
    values = set(states.values())
    if run_status in {"completed", "completed_with_review"} and set(states) != expected:
        return ["terminal run does not contain every definition node"]
    if run_status == "completed" and not values <= {"succeeded", "skipped"}:
        return ["completed run contains review or failure node"]
    if run_status == "completed_with_review" and (
        not values <= {"succeeded", "succeeded_with_review", "skipped"}
        or "succeeded_with_review" not in values
    ):
        return ["completed_with_review run has inconsistent node states"]
    if run_status == "blocked" and (
        "blocked" not in values or values & {"failed_execution", "failed_integrity"}
    ):
        return ["blocked run has inconsistent node states"]
    if run_status == "failed_execution" and "failed_execution" not in values:
        return ["failed_execution run has no failed node"]
    if run_status == "awaiting_human" and (
        list(states.values()).count("awaiting_human") != 1
        or values & {"blocked", "failed_execution", "failed_integrity"}
    ):
        return ["awaiting_human run has inconsistent node states"]
    return []


def _validate_execution_outputs(
    run_dir: Path,
    repository_root: Path,
) -> list[str]:
    request = _read_request(run_dir)
    definition = _read_definition(run_dir)
    manifest = CONTRACTS.read_json_object(
        run_dir / "run_manifest.json",
        "run manifest",
    )
    if (
        manifest["run_status"] == "running"
        and not (run_dir / "artifacts" / "index.json").exists()
    ):
        return []
    errors: list[str] = []
    if request["workflow_id"] == "compound-evidence-v1":
        try:
            WORKFLOW_A_REQUEST.validate_workflow_a_request(request)
        except WORKFLOW_A_REQUEST.WorkflowARequestError as error:
            errors.append(str(error))
    elif request["workflow_id"] == "route-evidence-review-v1":
        try:
            WORKFLOW_B_REQUEST.validate_workflow_b_request(request)
        except WORKFLOW_B_REQUEST.WorkflowBRequestError as error:
            errors.append(str(error))
    run_id = LEDGER.read_declared_run_id(run_dir / "events.jsonl")
    events = LEDGER.read_verified_events(run_dir / "events.jsonl", run_id)
    artifact_errors, artifacts = ARTIFACT_VALIDATION.artifact_errors(
        run_dir,
        events,
        repository_root,
    )
    errors.extend(artifact_errors)
    if request["workflow_id"] == "route-evidence-review-v1" and not artifact_errors:
        errors.extend(
            WORKFLOW_B_SEMANTICS.semantic_errors(
                request,
                artifacts,
                EVIDENCE.load_artifact_documents(run_dir, artifacts),
            )
        )
    errors.extend(
        EXECUTION_KEYS.execution_key_errors(
            run_dir,
            repository_root,
            request,
            definition,
            artifacts,
        )
    )
    errors.extend(
        HUMAN_GATES.human_gate_errors(
            run_dir,
            request,
            manifest,
            events,
            artifacts,
        )
    )
    errors.extend(_package_errors(run_dir, manifest, events, artifacts))
    errors.extend(CHECKSUMS.checksum_errors(run_dir))
    errors.extend(_terminal_errors(manifest, definition))
    errors.extend(
        EVENT_VALIDATION.process_errors(
            events,
            manifest["node_states"],
            ADAPTERS.ADAPTERS,
        )
    )
    errors.extend(SECURITY.content_errors(run_dir, artifacts))
    return errors


validate_package = EVIDENCE.validate_package


def validate_run_directory(
    run_dir: Path,
    repository_root: Path,
) -> dict[str, Any]:
    errors: list[str] = []
    if run_dir.is_symlink() or not run_dir.is_dir():
        errors.append("run directory is missing or unsafe")
    else:
        errors.extend(_validate_foundations(run_dir, repository_root))
        if not errors:
            try:
                errors.extend(_validate_execution_outputs(run_dir, repository_root))
            except (
                CONTRACTS.ContractError,
                LEDGER.LedgerIntegrityError,
                REGISTRY.ArtifactError,
                STATE.StateTransitionError,
            ) as error:
                errors.append(str(error))
    return {
        "valid": not errors,
        "errors": errors,
        "warnings": [],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_dir", type=Path)
    args = parser.parse_args()
    repository_root = Path(__file__).resolve().parents[2]
    report = validate_run_directory(args.run_dir, repository_root)
    print(json.dumps(report, ensure_ascii=False, sort_keys=True))
    return 0 if report["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
