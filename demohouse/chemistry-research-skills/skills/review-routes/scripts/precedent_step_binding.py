#!/usr/bin/env python3
"""Bind one Search Artifact to one review route step."""

from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path
from typing import Any

ARTIFACT_PATH = "step_artifacts.precedent_artifact"
LEVEL_BY_OPERATION = {
    "lookup_reaction": "exact_record",
    "search_transformations": "exact_transformation",
    "search_similar_reactions": "similar_reaction",
    "search_components": "component_only",
}
LEVEL_BY_STATUS = {
    "completed_zero_hits": "completed_zero_hits",
    "source_timeout": "source_timeout",
    "source_error": "source_error",
    "blocked": "blocked",
}


def _load_query_match() -> Any:
    path = Path(__file__).with_name("precedent_query_match.py")
    spec = importlib.util.spec_from_file_location("precedent_query_match", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load precedent query matcher: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


QUERY_MATCH = _load_query_match()


def precedent_evidence_result(
    *,
    provider_status: str = "not_run",
    match_level: str = "not_run",
    operation: str | None = None,
    provider: str | None = None,
    query_fingerprint: str | None = None,
    profile_ids: list[str] | None = None,
    conditions: list[Any] | None = None,
    yields: list[Any] | None = None,
    sources: list[Any] | None = None,
    licenses: list[str] | None = None,
    artifact_fingerprint: str | None = None,
    corpus_artifact_fingerprint: str | None = None,
    result_ids: list[str] | None = None,
    result_hashes: list[str] | None = None,
    review_required_result_ids: list[str] | None = None,
    binding_status: str = "not_provided",
) -> dict[str, Any]:
    return {
        "provider_status": provider_status,
        "match_level": match_level,
        "operation": operation,
        "provider": provider,
        "query_fingerprint": query_fingerprint,
        "profile_ids": list(profile_ids or []),
        "reported_condition_evidence": list(conditions or []),
        "reported_yield_evidence": list(yields or []),
        "sources": list(sources or []),
        "licenses": list(licenses or []),
        "artifact_fingerprint": artifact_fingerprint,
        "corpus_artifact_fingerprint": corpus_artifact_fingerprint,
        "result_ids": list(result_ids or []),
        "result_hashes": list(result_hashes or []),
        "review_required_result_ids": list(review_required_result_ids or []),
        "binding_status": binding_status,
    }


def failed_precedent_evidence() -> dict[str, Any]:
    return precedent_evidence_result(binding_status="failed")


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
    evidence: Any = None,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    return failed_precedent_evidence(), [_issue(code, ARTIFACT_PATH, evidence)]


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
    sides = tuple(
        [item for item in side.split(".") if item] for side in (left, middle, right)
    )
    return sides if sides[0] and sides[2] else None


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


def _reaction_matches_step(
    value: Any,
    step_hash: Any,
    toolkit: dict[str, Any],
) -> bool:
    canonical = _canonical_reaction(value, toolkit)
    return (
        canonical is not None
        and hashlib.sha256(canonical.encode("utf-8")).hexdigest() == step_hash
    )


def _lookup_bound(
    artifact: dict[str, Any],
    step: dict[str, Any],
    toolkit: dict[str, Any],
) -> bool:
    if artifact["provider_status"] not in {"completed", "partial"}:
        return False
    query_id = artifact["query_interpretation"]["query"].get("reaction_id")
    results = artifact["results"]
    return bool(results) and all(
        result["reaction_id"] == query_id
        and _reaction_matches_step(
            result["reaction_smiles"],
            step["step_reaction_hash"],
            toolkit,
        )
        for result in results
    )


def _exact_target_result_bound(
    results: list[dict[str, Any]],
    step: dict[str, Any],
    toolkit: dict[str, Any],
) -> bool:
    return any(
        any(
            constraint.get("exact_target_reaction") is True
            for constraint in result["matched_constraints"]
            if isinstance(constraint, dict)
        )
        and _reaction_matches_step(
            result["reaction_smiles"],
            step["step_reaction_hash"],
            toolkit,
        )
        for result in results
    )


def _similarity_bound(
    artifact: dict[str, Any],
    step: dict[str, Any],
    toolkit: dict[str, Any],
) -> bool:
    if artifact["provider_status"] not in {"completed", "partial"}:
        return False
    query = artifact["query_interpretation"]["query"]
    reaction_smiles = query.get("reaction_smiles")
    if isinstance(reaction_smiles, str) and reaction_smiles:
        return _reaction_matches_step(
            reaction_smiles,
            step["step_reaction_hash"],
            toolkit,
        )
    if isinstance(query.get("reaction_record_id"), str):
        return _exact_target_result_bound(artifact["results"], step, toolkit)
    return False


def _profiles(results: list[dict[str, Any]]) -> list[str]:
    return sorted(
        {
            profile["profile_id"]
            for result in results
            if isinstance((profile := result.get("fingerprint_profile")), dict)
            and isinstance(profile.get("profile_id"), str)
        }
    )


def _bound_result(
    artifact: dict[str, Any],
    contract: Any,
) -> dict[str, Any]:
    results = artifact["results"]
    provenance = artifact["corpus_provenance"]
    return precedent_evidence_result(
        provider_status=artifact["provider_status"],
        match_level=LEVEL_BY_STATUS.get(
            artifact["provider_status"],
            LEVEL_BY_OPERATION[artifact["operation"]],
        ),
        operation=artifact["operation"],
        provider=artifact["provider"],
        query_fingerprint=contract.query_fingerprint(artifact),
        profile_ids=_profiles(results),
        conditions=[
            result["reported_condition_evidence"]
            for result in results
            if result["reported_condition_evidence"]
        ],
        yields=[
            result["yield_measurements"]
            for result in results
            if result["yield_measurements"]
        ],
        sources=[
            result["source"] for result in results if isinstance(result["source"], dict)
        ],
        licenses=sorted(
            {str(result["license"]) for result in results if result["license"]}
        ),
        artifact_fingerprint=artifact["result_fingerprint"],
        corpus_artifact_fingerprint=provenance.get("artifact_fingerprint"),
        result_ids=[result["reaction_id"] for result in results],
        result_hashes=[result["result_hash"] for result in results],
        review_required_result_ids=[
            result["reaction_id"]
            for result in results
            if result["curation_disposition"] == "review_required"
        ],
        binding_status="bound",
    )


def _state_findings(evidence: dict[str, Any]) -> list[dict[str, Any]]:
    findings = []
    status_codes = {
        "completed_zero_hits": "W-PRECEDENT-ZERO-001",
        "partial": "W-PRECEDENT-PARTIAL-001",
        "source_timeout": "W-PRECEDENT-TIMEOUT-001",
        "source_error": "W-PRECEDENT-ERROR-001",
        "blocked": "E-PRECEDENT-BLOCKED-001",
    }
    status_code = status_codes.get(evidence["provider_status"])
    if status_code:
        findings.append(_issue(status_code, ARTIFACT_PATH))
    if evidence["match_level"] == "similar_reaction":
        findings.append(_issue("W-PRECEDENT-SIMILAR-001", ARTIFACT_PATH))
    if evidence["match_level"] == "component_only":
        findings.append(_issue("W-PRECEDENT-COMPONENT-001", ARTIFACT_PATH))
    if evidence["review_required_result_ids"]:
        findings.append(_issue("W-PRECEDENT-RESULT-REVIEW-001", ARTIFACT_PATH))
    return findings


def bind_precedent_evidence(
    artifact: Any,
    step: dict[str, Any],
    toolkit: dict[str, Any],
    contract: Any,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    if artifact is None:
        return precedent_evidence_result(), [
            _issue("W-PRECEDENT-NOT-RUN-001", ARTIFACT_PATH)
        ]
    issues = contract.validate_searched_artifact(artifact)
    if issues:
        return _failed("E-PRECEDENT-ARTIFACT-CONTRACT-001", issues)
    if artifact["provider_status"] in {
        "blocked",
        "source_timeout",
        "source_error",
    }:
        evidence = _bound_result(artifact, contract)
        return evidence, _state_findings(evidence)
    operation = artifact["operation"]
    if operation == "lookup_reaction":
        bound = _lookup_bound(artifact, step, toolkit)
    elif operation == "search_similar_reactions":
        bound = _similarity_bound(artifact, step, toolkit)
    elif operation == "search_transformations":
        bound = QUERY_MATCH.transformation_matches(artifact, step, toolkit)
    elif operation == "search_components":
        bound = QUERY_MATCH.components_match(artifact, step, toolkit)
    else:
        return _failed("E-PRECEDENT-BINDING-001", operation)
    if not bound:
        return _failed("E-PRECEDENT-BINDING-001", operation)
    evidence = _bound_result(artifact, contract)
    return evidence, _state_findings(evidence)
