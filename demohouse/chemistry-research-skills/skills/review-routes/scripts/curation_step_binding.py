#!/usr/bin/env python3
"""Bind one review route step to one validated curate record."""

from __future__ import annotations

import hashlib
from typing import Any

ARTIFACT_PATH = "step_artifacts.curation_artifact"


def curation_evidence_result(
    *,
    status: str = "not_run",
    disposition: str | None = None,
    findings: list[Any] | None = None,
    artifact_fingerprint: str | None = None,
    curation_record_id: str | None = None,
    original_record_hash: str | None = None,
    binding_status: str = "not_provided",
) -> dict[str, Any]:
    return {
        "status": status,
        "disposition": disposition,
        "findings": list(findings or []),
        "artifact_fingerprint": artifact_fingerprint,
        "curation_record_id": curation_record_id,
        "original_record_hash": original_record_hash,
        "binding_status": binding_status,
    }


def _issue(
    code: str,
    field_path: str,
    evidence: Any = None,
) -> dict[str, Any]:
    return {
        "code": code,
        "severity": "warning" if code.startswith("W-") else "error",
        "field_path": field_path,
        "evidence": [] if evidence is None else [evidence],
    }


def _failed(
    code: str,
    field_path: str,
    evidence: Any = None,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    result = curation_evidence_result(binding_status="failed")
    return result, [_issue(code, field_path, evidence)]


def failed_curation_evidence() -> dict[str, Any]:
    return curation_evidence_result(binding_status="failed")


def _split_reaction(value: Any) -> tuple[list[str], list[str], list[str]] | None:
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    if text.count(">>") == 1:
        left, right = text.split(">>")
        middle = ""
    else:
        parts = text.split(">")
        if len(parts) != 3:
            return None
        left, middle, right = parts
    inputs = [item for item in left.split(".") if item]
    agents = [item for item in middle.split(".") if item]
    outputs = [item for item in right.split(".") if item]
    return (inputs, agents, outputs) if inputs and outputs else None


def _canonical_molecule(value: str, toolkit: dict[str, Any]) -> str | None:
    try:
        with toolkit["rdBase"].BlockLogs():
            molecule = toolkit["Chem"].MolFromSmiles(value)
    except Exception:
        return None
    if molecule is None:
        return None
    for atom in molecule.GetAtoms():
        atom.SetAtomMapNum(0)
    return toolkit["Chem"].MolToSmiles(
        molecule,
        canonical=True,
        isomericSmiles=True,
    )


def _canonical_reaction(value: Any, toolkit: dict[str, Any]) -> str | None:
    sides = _split_reaction(value)
    if sides is None:
        return None
    canonical_sides = []
    for side in sides:
        canonical = [_canonical_molecule(item, toolkit) for item in side]
        if any(item is None for item in canonical):
            return None
        canonical_sides.append(".".join(sorted(canonical)))
    return ">".join(canonical_sides)


def _record_reaction_matches(
    record: dict[str, Any],
    step_hash: Any,
    toolkit: dict[str, Any],
) -> bool:
    reaction = record.get("reaction_smiles")
    if not isinstance(reaction, dict):
        return False
    reported = _canonical_reaction(reaction.get("reported"), toolkit)
    stored = reaction.get("canonical_unmapped")
    canonical = _canonical_reaction(stored, toolkit)
    if reported is None or canonical is None:
        return False
    if reported != stored or canonical != stored:
        return False
    return hashlib.sha256(stored.encode("utf-8")).hexdigest() == step_hash


def _bound_result(
    artifact: dict[str, Any],
    record: dict[str, Any],
) -> dict[str, Any]:
    return curation_evidence_result(
        status=record["curation_status"],
        disposition=record["disposition"],
        findings=record["findings"],
        artifact_fingerprint=artifact["result_fingerprint"],
        curation_record_id=record["record_id"],
        original_record_hash=record["original_record_hash"],
        binding_status="bound",
    )


def _state_finding(disposition: str) -> list[dict[str, Any]]:
    if disposition == "review_required":
        return [
            _issue(
                "W-CURATION-REVIEW-001",
                ARTIFACT_PATH,
            )
        ]
    if disposition == "rejected":
        return [
            _issue(
                "E-CURATION-REJECTED-001",
                ARTIFACT_PATH,
            )
        ]
    return []


def bind_curation_evidence(
    artifact: Any,
    record_id: Any,
    step_hash: Any,
    toolkit: dict[str, Any],
    contract: Any,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    if artifact is None and record_id is None:
        return curation_evidence_result(), [
            _issue(
                "W-CURATION-NOT-RUN-001",
                ARTIFACT_PATH,
            )
        ]
    if artifact is None or not isinstance(record_id, str) or not record_id:
        return _failed(
            "E-CURATION-BINDING-001",
            "step_artifacts.curation_record_id",
            "curation artifact and record id must be provided together",
        )
    issues = contract.validate_curated_artifact(artifact)
    if issues:
        return _failed(
            "E-CURATION-ARTIFACT-CONTRACT-001",
            ARTIFACT_PATH,
            issues,
        )
    records = {record["record_id"]: record for record in artifact["records"]}
    record = records.get(record_id)
    if record is None:
        return _failed(
            "E-CURATION-BINDING-001",
            "step_artifacts.curation_record_id",
            record_id,
        )
    result = _bound_result(artifact, record)
    if record["disposition"] == "rejected":
        return result, _state_finding("rejected")
    if not _record_reaction_matches(record, step_hash, toolkit):
        return _failed(
            "E-STEP-HASH-MISMATCH-001",
            "step_artifacts.step_reaction_hash",
            step_hash,
        )
    return result, _state_finding(record["disposition"])
