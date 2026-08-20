#!/usr/bin/env python3
"""Result-level checks for a search-reactions Artifact."""

from __future__ import annotations

import hashlib
import json
import math
from typing import Any

RESULT_ERROR = "E-SEARCH-RESULT-001"
RESULT_ID_ERROR = "E-SEARCH-RESULT-ID-001"
MODE_BY_OPERATION = {
    "lookup_reaction": "exact_id",
    "search_components": "component_and_filter",
    "search_transformations": "reaction_smarts",
    "search_similar_reactions": "whole_reaction_similarity",
}
SCOPE_BY_OPERATION = {
    "lookup_reaction": "exact_identifier",
    "search_components": "best_component_match_per_predicate",
    "search_transformations": "reaction_substructure_match",
    "search_similar_reactions": "whole_reaction",
}
PROFILE_METRICS = {
    "rdkit-difference-atompair-v1": "dice",
    "rdkit-structural-atompair-v1": "tanimoto",
}
REQUIRED_RESULT = set(
    "rank reaction_id dataset_id provider reaction_smiles retrieval_mode "
    "fingerprint_profile raw_score score_scope matched_constraints participants "
    "reported_condition_evidence yield_measurements source license "
    "curation_disposition quality_findings result_hash".split()
)


def _sha256_json(value: Any) -> str:
    text = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _issue(code: str, path: str, detail: str) -> dict[str, str]:
    return {"code": code, "field_path": path, "detail": detail}


def _issues(
    code: str,
    checks: tuple[tuple[str, bool, str], ...],
) -> list[dict[str, str]]:
    return [_issue(code, path, detail) for path, invalid, detail in checks if invalid]


def _finite_number(value: Any) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def _shape_checks(
    result: dict[str, Any],
    path: str,
    provider: Any,
) -> list[dict[str, str]]:
    raw_score = result.get("raw_score")
    missing = REQUIRED_RESULT - set(result)
    checks = (
        (path, bool(missing), f"missing {sorted(missing)}"),
        (
            f"{path}.rank",
            type(result.get("rank")) is not int or result.get("rank", 0) < 1,
            "invalid",
        ),
        (f"{path}.provider", result.get("provider") != provider, "mismatch"),
        (
            f"{path}.raw_score",
            raw_score is not None
            and (not _finite_number(raw_score) or not 0 <= raw_score <= 1),
            "invalid",
        ),
        (
            f"{path}.curation_disposition",
            result.get("curation_disposition")
            not in {"ready_for_search", "review_required"},
            "invalid",
        ),
        *tuple(
            (
                f"{path}.{field}",
                not isinstance(result.get(field), str) or not result.get(field),
                "invalid",
            )
            for field in ("reaction_id", "reaction_smiles")
        ),
        *tuple(
            (
                f"{path}.{field}",
                not isinstance(result.get(field), list),
                "must be array",
            )
            for field in (
                "matched_constraints",
                "participants",
                "reported_condition_evidence",
                "yield_measurements",
                "quality_findings",
            )
        ),
    )
    return _issues(RESULT_ERROR, checks)


def _mode_checks(
    result: dict[str, Any],
    path: str,
    operation: Any,
    options: dict[str, Any],
) -> list[dict[str, str]]:
    profile = result.get("fingerprint_profile")
    if operation == "search_similar_reactions" and isinstance(profile, dict):
        profile_id = profile.get("profile_id")
        invalid_profile = profile_id != options.get(
            "fingerprint_profile_id"
        ) or profile.get("metric") != PROFILE_METRICS.get(profile_id)
    else:
        invalid_profile = (
            not isinstance(profile, dict)
            if operation == "search_similar_reactions"
            else profile is not None
        )
    payload = {
        key: value
        for key, value in result.items()
        if key not in {"rank", "result_hash"}
    }
    checks = (
        (
            f"{path}.retrieval_mode",
            result.get("retrieval_mode") != MODE_BY_OPERATION.get(operation),
            "mismatch",
        ),
        (
            f"{path}.score_scope",
            result.get("score_scope") != SCOPE_BY_OPERATION.get(operation),
            "mismatch",
        ),
        (f"{path}.fingerprint_profile", invalid_profile, "mismatch"),
        (
            f"{path}.result_hash",
            result.get("result_hash") != _sha256_json(payload),
            "mismatch",
        ),
    )
    return _issues(RESULT_ERROR, checks)


def _evidence_checks(
    result: dict[str, Any],
    path: str,
) -> list[dict[str, str]]:
    findings = result.get("quality_findings")
    findings = findings if isinstance(findings, list) else []
    checks = (
        (
            f"{path}.source",
            not isinstance(result.get("source"), dict),
            "must be object",
        ),
        (
            f"{path}.license",
            result.get("license") is not None
            and (
                not isinstance(result.get("license"), str) or not result.get("license")
            ),
            "must be null or non-empty string",
        ),
        (
            f"{path}.quality_findings",
            any(
                not isinstance(item, dict)
                or not isinstance(item.get("code"), str)
                or not item.get("code")
                for item in findings
            ),
            "invalid finding",
        ),
        (
            f"{path}.curation_disposition",
            bool(findings) and result.get("curation_disposition") != "review_required",
            "findings require review_required",
        ),
    )
    issues = _issues(RESULT_ERROR, checks)
    participants = result.get("participants")
    participants = participants if isinstance(participants, list) else []
    issues.extend(
        _issue(
            RESULT_ERROR,
            f"{path}.participants[{index}].upstream_binding_status",
            "invalid",
        )
        for index, participant in enumerate(participants)
        if not isinstance(participant, dict)
        or participant.get("upstream_binding_status") not in {"not_requested", "bound"}
    )
    return issues


def validate_results(artifact: dict[str, Any]) -> list[dict[str, str]]:
    results = artifact.get("results")
    if not isinstance(results, list):
        return []
    options = artifact.get("options")
    options = options if isinstance(options, dict) else {}
    issues = []
    seen: set[str] = set()
    for index, result in enumerate(results):
        path = f"results[{index}]"
        if not isinstance(result, dict):
            issues.append(_issue(RESULT_ERROR, path, "must be object"))
            continue
        issues.extend(_shape_checks(result, path, artifact.get("provider")))
        issues.extend(_mode_checks(result, path, artifact.get("operation"), options))
        issues.extend(_evidence_checks(result, path))
        result_id = result.get("reaction_id")
        if isinstance(result_id, str) and result_id in seen:
            issues.append(_issue(RESULT_ID_ERROR, f"{path}.reaction_id", "duplicate"))
        if isinstance(result_id, str):
            seen.add(result_id)
    ranks = [result.get("rank") for result in results if isinstance(result, dict)]
    if ranks != list(range(1, len(results) + 1)):
        issues.append(_issue(RESULT_ERROR, "results.rank", "must be contiguous"))
    top_k = options.get("top_k")
    if type(top_k) is int and len(results) > top_k:
        issues.append(_issue(RESULT_ERROR, "results", "exceeds top_k"))
    return issues
