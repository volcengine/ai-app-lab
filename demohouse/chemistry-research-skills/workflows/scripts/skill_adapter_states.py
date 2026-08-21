"""Domain-state extraction for validated Skill artifacts."""

from __future__ import annotations

from typing import Any


class DomainStateError(ValueError):
    """Raised when a registered extractor cannot classify an artifact."""


def _disposition_state(records: Any, ready_value: str) -> str:
    if not isinstance(records, list) or not records:
        return "blocked"
    dispositions = {
        item.get("disposition") for item in records if isinstance(item, dict)
    }
    if dispositions == {ready_value}:
        return "completed"
    if ready_value in dispositions or "review_required" in dispositions:
        return "review_required"
    return "blocked"


def _extract_identity(artifact: dict[str, Any]) -> str:
    resolutions = artifact.get("resolutions")
    if not isinstance(resolutions, list) or not resolutions:
        return "blocked"
    statuses = set()
    reviewable = False
    for item in resolutions:
        if not isinstance(item, dict):
            continue
        status = item.get("standardization_handoff", {}).get("status")
        statuses.add(status)
        candidates = item.get("candidates")
        if status == "blocked_pending_resolution" and isinstance(candidates, list):
            reviewable = reviewable or bool(candidates)
    if statuses == {"ready"}:
        return "ready_for_standardization"
    if "review_required" in statuses or "not_ready" in statuses or reviewable:
        return "review_required"
    return "blocked"


def _extract_library(artifact: dict[str, Any]) -> str:
    if (
        artifact.get("library_status") == "ready"
        and artifact.get("operation_status") == "completed"
    ):
        return "completed"
    if artifact.get("library_status") == "blocked":
        return "blocked"
    return "review_required"


def _extract_search(artifact: dict[str, Any]) -> str:
    status = artifact.get("provider_status")
    if status in {"completed", "completed_zero_hits"}:
        return "completed"
    if status == "blocked":
        return "blocked"
    return "review_required"


def extract_domain_state(adapter: Any, artifact: Any) -> str:
    if not isinstance(artifact, dict):
        raise DomainStateError("artifact must be an object")
    extractor = adapter.extractor_id
    if extractor == "identity":
        return _extract_identity(artifact)
    if extractor in {"standardize", "features"}:
        return _disposition_state(
            artifact.get("records"),
            "ready_for_downstream",
        )
    if extractor == "curate":
        return _disposition_state(
            artifact.get("records"),
            "ready_for_search",
        )
    if extractor == "library":
        return _extract_library(artifact)
    if extractor == "search":
        return _extract_search(artifact)
    if extractor == "review":
        return _disposition_state(
            artifact.get("route_summaries"),
            "ready_for_expert_review",
        )
    raise DomainStateError(f"unsupported extractor: {extractor}")
