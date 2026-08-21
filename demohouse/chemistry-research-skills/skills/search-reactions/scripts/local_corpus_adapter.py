#!/usr/bin/env python3
"""Load validated curate Artifacts into the local search provider."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, TypedDict


class LocalCorpusLoad(TypedDict):
    candidates: list[dict[str, Any]]
    excluded: list[dict[str, Any]]
    warnings: list[dict[str, Any]]
    provenance: dict[str, Any]
    contract_errors: list[dict[str, Any]]
    input_records: int


def blocked_corpus_manifest(artifact: Any) -> list[dict[str, Any]]:
    records = artifact.get("records") if isinstance(artifact, dict) else None
    if not isinstance(records, list):
        return []
    result = []
    for index, record in enumerate(records):
        reaction_id = (
            record.get("record_id")
            if isinstance(record, dict) and isinstance(record.get("record_id"), str)
            else None
        )
        result.append(
            {
                "index": index,
                "reaction_id": reaction_id,
                "reason": "upstream_artifact_contract_invalid",
            }
        )
    return result


def _contract_failure(
    artifact: Any,
    issues: list[dict[str, Any]],
    contract_module: Any,
    issue_factory: Callable,
) -> LocalCorpusLoad:
    manifest = blocked_corpus_manifest(artifact)
    return {
        "candidates": [],
        "excluded": manifest,
        "warnings": [],
        "provenance": contract_module.build_corpus_provenance(
            artifact,
            "invalid",
        ),
        "contract_errors": [
            issue_factory(
                "E-CURATED-ARTIFACT-CONTRACT-001",
                "curate Artifact 未通过 search 输入合同。",
                contract_errors=issues,
            )
        ],
        "input_records": len(manifest),
    }


def _source_record(
    artifact: dict[str, Any],
    record: dict[str, Any],
) -> dict[str, Any]:
    candidate = dict(record)
    source_record = artifact.get("source_record")
    source_record = source_record if isinstance(source_record, dict) else {}
    if candidate.get("license") is None:
        candidate["license"] = source_record.get("license")
    if (
        candidate.get("source") is None
        and candidate.get("source_locator") is None
        and source_record
    ):
        candidate["source"] = {
            "source_locator": {
                "identifier": source_record.get("identifier"),
                "content_sha256": source_record.get("content_sha256"),
            },
            "provenance": {
                "workflow": artifact["workflow"],
                "result_fingerprint": artifact["result_fingerprint"],
            },
        }
    return candidate


def _reaction_contract_issues(
    records: list[dict[str, Any]],
    toolkit: dict[str, Any],
    canonical_reaction: Callable,
) -> list[dict[str, Any]]:
    issues = []
    for index, record in enumerate(records):
        if record["disposition"] == "rejected":
            continue
        reaction = record["reaction_smiles"]
        reported = reaction.get("reported")
        canonical = reaction.get("canonical_unmapped")
        try:
            expected = (
                canonical_reaction(reported, toolkit)
                if isinstance(reported, str) and reported
                else None
            )
        except Exception:
            expected = None
        if not isinstance(canonical, str) or expected != canonical:
            issues.append(
                {
                    "code": "E-CURATE-REACTION-STRUCTURE-001",
                    "field_path": (
                        f"corpus_artifact.records[{index}]"
                        ".reaction_smiles.canonical_unmapped"
                    ),
                    "detail": "reported and canonical reaction diverge",
                }
            )
    return issues


def load_local_corpus(
    artifact: Any,
    include_review_required: bool,
    toolkit: dict[str, Any],
    *,
    contract_module: Any,
    canonical_reaction: Callable,
    normalize_candidate: Callable,
    issue_factory: Callable,
    max_records: int,
) -> LocalCorpusLoad:
    issues = contract_module.validate_curated_artifact(artifact)
    if issues:
        return _contract_failure(
            artifact,
            issues,
            contract_module,
            issue_factory,
        )
    records = artifact["records"]
    if len(records) > max_records:
        return _contract_failure(
            artifact,
            [
                {
                    "code": "E-CURATE-CORPUS-LIMIT-001",
                    "field_path": "corpus_artifact.records",
                    "detail": f"record count exceeds {max_records}",
                }
            ],
            contract_module,
            issue_factory,
        )
    structure_issues = _reaction_contract_issues(
        records,
        toolkit,
        canonical_reaction,
    )
    if structure_issues:
        return _contract_failure(
            artifact,
            structure_issues,
            contract_module,
            issue_factory,
        )
    included, excluded, warnings = [], [], []
    for index, record in enumerate(records):
        disposition = record["disposition"]
        reaction_id = record["record_id"]
        if disposition == "rejected":
            excluded.append({"reaction_id": reaction_id, "reason": "rejected"})
            continue
        if disposition == "review_required" and not include_review_required:
            excluded.append(
                {
                    "reaction_id": reaction_id,
                    "reason": "review_required_excluded",
                }
            )
            continue
        candidate, reason = normalize_candidate(
            _source_record(artifact, record),
            "local_curated_corpus",
            toolkit,
        )
        if candidate is None:
            return _contract_failure(
                artifact,
                [
                    {
                        "code": "E-CURATE-CANDIDATE-001",
                        "field_path": f"corpus_artifact.records[{index}]",
                        "detail": str(reason),
                    }
                ],
                contract_module,
                issue_factory,
            )
        if disposition == "review_required":
            warnings.append(
                issue_factory(
                    "W-CANDIDATE-REVIEW-001",
                    "人工复核候选按显式选项纳入。",
                    reaction_id=reaction_id,
                )
            )
        included.append(candidate)
    return {
        "candidates": included,
        "excluded": excluded,
        "warnings": warnings,
        "provenance": contract_module.build_corpus_provenance(
            artifact,
            "valid",
        ),
        "contract_errors": [],
        "input_records": len(records),
    }
