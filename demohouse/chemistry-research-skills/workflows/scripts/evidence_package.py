"""Build and validate deterministic Workflow evidence packages."""

from __future__ import annotations

import hashlib
import importlib.util
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
    "evidence_package_contracts",
)
REGISTRY = _load_local_module(
    "artifact_registry.py",
    "evidence_package_registry",
)
VALIDATION = _load_local_module(
    "workflow_evidence_contract.py",
    "evidence_package_validation",
)
WORKFLOW_B_CLAIMS = _load_local_module(
    "workflow_b_claims.py",
    "evidence_package_workflow_b_claims",
)
WORKFLOW_B_EVIDENCE = _load_local_module(
    "workflow_b_evidence.py",
    "evidence_package_workflow_b_evidence",
)
VALIDATOR_LOGICAL_NAMES = {
    "identity-validation",
    "standardize-validation",
    "features-validation",
    "library-validation",
}
SKILL_LOGICAL_NAMES = {
    "identity-result",
    "standardized-structures",
    "molecular-features",
    "library-operation",
}
UPSTREAM_LOGICAL_NAMES = {
    "identity-result": ("identity-validation",),
    "identity-human-decision": ("identity-result",),
    "authorized-structure-input": (
        "identity-result",
        "identity-human-decision",
    ),
    "standardization-input": ("authorized-structure-input",),
    "standardization-input-binding": ("authorized-structure-input",),
    "standardize-validation": (
        "standardization-input",
        "standardization-input-binding",
    ),
    "standardized-structures": (
        "standardize-validation",
        "standardization-input",
        "standardization-input-binding",
    ),
    "calculation-view-human-decision": ("standardized-structures",),
    "calculation-view-selection": (
        "standardized-structures",
        "calculation-view-human-decision",
    ),
    "features-validation": (
        "standardized-structures",
        "calculation-view-selection",
    ),
    "molecular-features": (
        "features-validation",
        "standardized-structures",
        "calculation-view-selection",
    ),
    "library-validation": ("molecular-features",),
    "library-operation": (
        "library-validation",
        "molecular-features",
    ),
}
CLAIM_BY_NODE = {
    "resolve-identities": (
        "identity_record_selected",
        "identity_record_selected",
    ),
    "standardize-structures": (
        "structure_standardized",
        "structure_requires_review",
    ),
    "compute-features": (
        "feature_calculation_completed",
        "feature_calculation_partial",
    ),
    "optional-library-operation": (
        "library_operation_completed",
        "library_operation_completed",
    ),
}


claims_for_step_searches = WORKFLOW_B_CLAIMS.claims_for_step_searches


def _evidence_type(logical_name: str) -> str:
    workflow_b_type = WORKFLOW_B_EVIDENCE.evidence_type(logical_name)
    if workflow_b_type is not None:
        return workflow_b_type
    if logical_name in VALIDATOR_LOGICAL_NAMES:
        return "validator_report"
    if logical_name in SKILL_LOGICAL_NAMES:
        return "validated_skill_artifact"
    return "workflow_derived_artifact"


def _committed_artifacts(
    events: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    output = []
    for event in events:
        if event.get("event_type") != "artifact_committed":
            continue
        payload = event.get("payload")
        artifact = payload.get("artifact") if isinstance(payload, dict) else None
        if isinstance(artifact, dict):
            output.append(artifact)
    return output


def build_evidence_index(
    events: list[dict[str, Any]],
    artifacts: list[dict[str, Any]],
) -> dict[str, Any]:
    declared = {item["artifact_id"]: item for item in artifacts}
    ordered = [
        item
        for item in _committed_artifacts(events)
        if item.get("artifact_id") in declared
    ]
    evidence_ids = {
        item["artifact_id"]: f"evidence-{index:04d}"
        for index, item in enumerate(ordered, start=1)
    }
    by_logical = {item["logical_name"]: item for item in ordered}
    logical_names = set(by_logical)
    evidence = []
    for item in ordered:
        upstream_names = UPSTREAM_LOGICAL_NAMES.get(
            item["logical_name"],
            WORKFLOW_B_EVIDENCE.upstream_names(
                item["logical_name"],
                logical_names,
            ),
        )
        upstream = [
            evidence_ids[by_logical[name]["artifact_id"]]
            for name in upstream_names
            if name in by_logical
        ]
        evidence.append(
            {
                "evidence_id": evidence_ids[item["artifact_id"]],
                "artifact_id": item["artifact_id"],
                "evidence_type": _evidence_type(item["logical_name"]),
                "producer_node_id": item["producer_node_id"],
                "sha256": item["sha256"],
                "validator_status": (
                    "passed"
                    if item["validation_artifact_id"] is not None
                    or item["logical_name"] in VALIDATOR_LOGICAL_NAMES
                    else "not_applicable"
                ),
                "domain_state": item["domain_state"],
                "upstream_evidence_ids": upstream,
            }
        )
    return {
        "schema_version": "1.0.0",
        "workflow": "workflow-evidence-index",
        "evidence": evidence,
    }


def _claim_type(item: dict[str, Any]) -> str | None:
    pair = CLAIM_BY_NODE.get(item["producer_node_id"])
    if pair is None or item["evidence_type"] != "validated_skill_artifact":
        return None
    return (
        pair[0]
        if item["domain_state"] in {"completed", "ready_for_standardization"}
        else pair[1]
    )


def _claim_status(domain_state: str) -> str:
    if domain_state in {"completed", "ready_for_standardization"}:
        return "supported"
    if domain_state == "review_required":
        return "review_required"
    return "blocked"


def build_claim_ledger(
    workflow_id: str,
    evidence: dict[str, Any],
    artifact_documents: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    claims = []
    for item in evidence.get("evidence", []):
        claim_type = _claim_type(item)
        if claim_type is None:
            continue
        limitations = [
            "not_physical_sample_identity",
            "not_experimental_confirmation",
        ]
        if item["producer_node_id"] == "compute-features":
            limitations.append("not_property_prediction")
        if item["producer_node_id"] == "optional-library-operation":
            limitations.append("not_experimental_safety_assessment")
        claims.append(
            {
                "claim_id": f"claim-{len(claims) + 1:04d}",
                "claim_type": claim_type,
                "status": _claim_status(item["domain_state"]),
                "subject_id": item["artifact_id"],
                "evidence_ids": [item["evidence_id"]],
                "limitations": limitations,
            }
        )
    if workflow_id == "route-evidence-review-v1":
        claims.extend(
            WORKFLOW_B_CLAIMS.build_claims(
                evidence,
                artifact_documents or {},
            )
        )
    for index, claim in enumerate(claims, start=1):
        claim["claim_id"] = f"claim-{index:04d}"
    return {
        "schema_version": "1.0.0",
        "workflow": "workflow-claim-ledger",
        "workflow_id": workflow_id,
        "claims": claims,
    }


def build_workflow_report(
    *,
    workflow_id: str,
    run_status: str,
    artifacts: list[dict[str, Any]],
    evidence: dict[str, Any],
    claims: dict[str, Any],
) -> dict[str, Any]:
    return {
        "schema_version": "1.0.0",
        "workflow_id": workflow_id,
        "run_status": run_status,
        "artifact_ids": [item["artifact_id"] for item in artifacts],
        "evidence_count": len(evidence["evidence"]),
        "claim_count": len(claims["claims"]),
    }


validate_package = VALIDATION.validate_package


def load_artifact_documents(
    run_dir: Path,
    artifacts: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    return {
        item["artifact_id"]: CONTRACTS.read_json_object(
            run_dir / item["relative_path"],
            item["logical_name"],
        )
        for item in artifacts
        if item["media_type"] == "application/json"
    }


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_checksums(run_dir: Path) -> None:
    paths = sorted(
        path
        for path in run_dir.rglob("*")
        if path.is_file() and path.name not in {"checksums.sha256", "run.lock"}
    )
    lines = [
        f"{_sha256_file(path)}  {path.relative_to(run_dir).as_posix()}"
        for path in paths
    ]
    REGISTRY.atomic_write_bytes(
        run_dir / "checksums.sha256",
        ("\n".join(lines) + "\n").encode("utf-8"),
    )


def write_workflow_package(
    *,
    run_dir: Path,
    workflow_id: str,
    run_status: str,
    events: list[dict[str, Any]],
    artifacts: list[dict[str, Any]],
    with_checksums: bool,
) -> dict[str, Any]:
    evidence = build_evidence_index(events, artifacts)
    claims = build_claim_ledger(
        workflow_id,
        evidence,
        load_artifact_documents(run_dir, artifacts),
    )
    report = build_workflow_report(
        workflow_id=workflow_id,
        run_status=run_status,
        artifacts=artifacts,
        evidence=evidence,
        claims=claims,
    )
    for name, value in (
        ("evidence_index.json", evidence),
        ("claim_ledger.json", claims),
        ("workflow_report.json", report),
    ):
        REGISTRY.atomic_write_bytes(
            run_dir / name,
            (CONTRACTS.canonical_json(value) + "\n").encode("utf-8"),
        )
    if with_checksums:
        write_checksums(run_dir)
    return {
        "evidence_index": evidence,
        "claim_ledger": claims,
        "workflow_report": report,
    }
