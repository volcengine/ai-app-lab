"""Derive controlled Workflow B claims from verified Artifact documents."""

from __future__ import annotations

from typing import Any, Iterable


SEARCH_CLAIM_TYPES = {
    "lookup_reaction": "precedent_exact_record_found",
    "search_transformations": "precedent_transformation_found",
    "search_similar_reactions": "precedent_similarity_found",
    "search_components": "precedent_component_found",
}
LIMITATIONS = [
    "not_experimental_confirmation",
    "not_ready_for_experiment",
    "not_safety_approval",
]


def _field(item: Any, name: str, default: Any = None) -> Any:
    if isinstance(item, dict):
        return item.get(name, default)
    return getattr(item, name, default)


def _search_claim_type(
    provider_status: Any,
    artifact: dict[str, Any] | None,
) -> str:
    if provider_status == "completed_zero_hits":
        return "precedent_zero_hits"
    if provider_status in {
        "source_timeout",
        "source_error",
        "partial",
        "blocked",
        "not_run",
    }:
        return "precedent_search_incomplete"
    operation = artifact.get("operation") if isinstance(artifact, dict) else None
    return SEARCH_CLAIM_TYPES.get(operation, "precedent_search_incomplete")


def _search_claim_status(item: Any) -> str:
    if _field(item, "binding_status") != "bound":
        return "blocked"
    provider_status = _field(item, "provider_status")
    if provider_status in {"source_timeout", "source_error", "partial", "not_run"}:
        return "review_required"
    if provider_status == "blocked":
        return "blocked"
    return "supported"


def claims_for_step_searches(
    results: Iterable[Any],
    *,
    evidence_by_artifact: dict[str, str] | None = None,
    search_documents: dict[str, dict[str, Any]] | None = None,
    fallback_evidence_id: str | None = None,
) -> list[dict[str, Any]]:
    evidence_by_artifact = evidence_by_artifact or {}
    search_documents = search_documents or {}
    claims = []
    for item in results:
        artifact_id = _field(item, "artifact_id")
        evidence_id = (
            evidence_by_artifact.get(artifact_id)
            if isinstance(artifact_id, str)
            else None
        )
        evidence_id = evidence_id or fallback_evidence_id or artifact_id
        if not isinstance(evidence_id, str) or not evidence_id:
            continue
        claim_type = (
            "precedent_search_incomplete"
            if _field(item, "binding_status") != "bound"
            else _search_claim_type(
                _field(item, "provider_status"),
                search_documents.get(artifact_id),
            )
        )
        claims.append(
            {
                "claim_id": f"claim-step-{len(claims) + 1:04d}",
                "claim_type": claim_type,
                "status": _search_claim_status(item),
                "subject_id": _field(item, "step_id", artifact_id),
                "evidence_ids": [evidence_id],
                "limitations": list(LIMITATIONS),
            }
        )
    return claims


def _evidence_maps(
    evidence: dict[str, Any],
) -> tuple[dict[str, str], dict[str, dict[str, Any]]]:
    rows = [item for item in evidence.get("evidence", []) if isinstance(item, dict)]
    return (
        {item["artifact_id"]: item["evidence_id"] for item in rows},
        {item["artifact_id"]: item for item in rows},
    )


def _curation_claims(
    documents: dict[str, dict[str, Any]],
    evidence_ids: dict[str, str],
    evidence_rows: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    claims = []
    for artifact_id, document in documents.items():
        row = evidence_rows.get(artifact_id)
        if (
            document.get("workflow") != "curate-reactions"
            or row is None
            or row["producer_node_id"] != "curate-reactions"
        ):
            continue
        domain_state = row["domain_state"]
        claims.append(
            {
                "claim_id": "claim-reaction-curated",
                "claim_type": "reaction_curated",
                "status": (
                    "supported"
                    if domain_state == "completed"
                    else "review_required"
                    if domain_state == "review_required"
                    else "blocked"
                ),
                "subject_id": artifact_id,
                "evidence_ids": [evidence_ids[artifact_id]],
                "limitations": list(LIMITATIONS),
            }
        )
    return claims


def _step_search_claims(
    documents: dict[str, dict[str, Any]],
    evidence_ids: dict[str, str],
) -> list[dict[str, Any]]:
    result_entry = next(
        (
            (artifact_id, document)
            for artifact_id, document in documents.items()
            if document.get("workflow") == "route-step-search-results"
        ),
        None,
    )
    if result_entry is None:
        return []
    result_artifact_id, result_document = result_entry
    search_documents = {
        artifact_id: document
        for artifact_id, document in documents.items()
        if document.get("workflow") == "search-reactions"
    }
    return claims_for_step_searches(
        result_document.get("results", []),
        evidence_by_artifact=evidence_ids,
        search_documents=search_documents,
        fallback_evidence_id=evidence_ids.get(result_artifact_id),
    )


def _route_claims(
    documents: dict[str, dict[str, Any]],
    evidence_ids: dict[str, str],
    evidence_rows: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    claims = []
    for artifact_id, document in documents.items():
        row = evidence_rows.get(artifact_id)
        if (
            document.get("workflow") != "review-routes"
            or row is None
            or row["producer_node_id"] != "review-routes"
        ):
            continue
        for route in document.get("route_summaries", []):
            disposition = route.get("disposition")
            claim_type = {
                "ready_for_expert_review": "route_ready_for_expert_review",
                "review_required": "route_review_required",
                "blocked": "route_blocked",
            }.get(disposition)
            if claim_type is None:
                continue
            claims.append(
                {
                    "claim_id": f"claim-route-{len(claims) + 1:04d}",
                    "claim_type": claim_type,
                    "status": (
                        "supported"
                        if disposition == "ready_for_expert_review"
                        else "review_required"
                        if disposition == "review_required"
                        else "blocked"
                    ),
                    "subject_id": route["route_id"],
                    "evidence_ids": [evidence_ids[artifact_id]],
                    "limitations": list(LIMITATIONS),
                }
            )
    return claims


def build_claims(
    evidence: dict[str, Any],
    documents: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    evidence_ids, evidence_rows = _evidence_maps(evidence)
    claims = _curation_claims(
        documents,
        evidence_ids,
        evidence_rows,
    )
    claims.extend(_step_search_claims(documents, evidence_ids))
    claims.extend(_route_claims(documents, evidence_ids, evidence_rows))
    return claims
