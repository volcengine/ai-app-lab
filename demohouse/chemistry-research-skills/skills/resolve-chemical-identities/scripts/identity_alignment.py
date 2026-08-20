"""Candidate alignment, handoff, and cross-query relationships."""

from __future__ import annotations

from typing import Any, Sequence


def aggregate_retrieval_status(
    source_queries: Sequence[dict[str, Any]],
) -> str:
    if not source_queries:
        return "not_run"
    statuses = [item["status"] for item in source_queries]
    successes = statuses.count("success")
    errors = statuses.count("source_error")
    if successes and errors:
        return "partial"
    if errors and not successes:
        return "source_error"
    if successes:
        return "completed"
    if all(status == "not_found" for status in statuses):
        return "not_found"
    return "source_error"


def has_review_findings(candidate: dict[str, Any]) -> bool:
    if any(
        finding.get("severity") in {"review", "error"}
        for finding in candidate.get("quality_findings", [])
    ):
        return True
    comparison = candidate.get("comparison_view") or {}
    return comparison.get("disposition") in {"review_required", "rejected"}


def _question(code: str, question: str) -> list[dict[str, Any]]:
    return [{"code": code, "question": question}]


def _multiple_candidate_alignment(
    candidates: Sequence[dict[str, Any]],
    input_type: str,
) -> tuple[str, str, list[dict[str, Any]]]:
    parent_keys = [
        (candidate.get("comparison_view") or {}).get("parent_inchikey")
        for candidate in candidates
    ]
    if all(parent_keys) and len(set(parent_keys)) == 1:
        return (
            "related_forms",
            "review_required",
            _question(
                "Q-RELATED-FORM-SELECTION",
                (
                    "候选共享派生 parent，但完整结构不同；"
                    "请确认需要哪一种盐型、质子化形式、立体或同位素形式。"
                ),
            ),
        )
    if input_type == "name":
        return (
            "ambiguous",
            "review_required",
            _question(
                "Q-AMBIGUOUS-NAME",
                "该名称对应多个完整结构；请提供盐型、立体、用途或稳定标识符。",
            ),
        )
    return (
        "conflict",
        "review_required",
        _question(
            "Q-STABLE-ID-CONFLICT",
            "同一结构或稳定标识符返回多个不一致的完整结构，请人工核对来源。",
        ),
    )


def _single_candidate_alignment(
    candidate: dict[str, Any],
    input_type: str,
    unresolved: Sequence[dict[str, Any]],
    retrieval_status: str,
) -> tuple[str, str, list[dict[str, Any]]]:
    if unresolved and input_type == "name":
        return (
            "ambiguous",
            "review_required",
            _question(
                "Q-STRUCTURELESS-NAME-RECORD",
                (
                    "至少一个精确名称记录没有完整结构，可能代表家族或未指定形式；"
                    "请确认具体化学形式。"
                ),
            ),
        )
    external = set(candidate["source_families"]) - {"local_input", "unichem"}
    if input_type == "name" and len(external) < 2:
        return (
            "ambiguous",
            "review_required",
            _question(
                "Q-SINGLE-SOURCE-NAME",
                "名称目前只有一个独立证据源支持，是否能提供更多上下文或稳定 ID？",
            ),
        )
    alignment = (
        "not_assessed"
        if input_type in {"smiles", "inchi"} and not external
        else "exact"
    )
    if retrieval_status in {"partial", "source_error"}:
        return (
            alignment,
            "review_required",
            _question(
                "Q-RETRY-SOURCE-ERROR",
                "至少一个来源查询失败；是否在服务恢复后重试再确认记录对齐？",
            ),
        )
    if has_review_findings(candidate):
        return (
            alignment,
            "review_required",
            _question(
                "Q-CANDIDATE-QUALITY-REVIEW",
                "候选包含多组分、未指定立体或标准化复核项，请确认是否适合目标用途。",
            ),
        )
    if alignment in {"not_assessed", "exact"}:
        return alignment, "ready_for_standardization", []
    return alignment, "review_required", []


def determine_alignment(
    validated: dict[str, Any],
    candidates: Sequence[dict[str, Any]],
    unresolved: Sequence[dict[str, Any]],
    integrity_conflicts: Sequence[dict[str, Any]],
    retrieval_status: str,
) -> tuple[str, str, list[dict[str, Any]]]:
    if validated["input_status"] == "invalid_input":
        return "not_assessed", "rejected", []
    if integrity_conflicts:
        return (
            "conflict",
            "review_required",
            _question(
                "Q-SOURCE-INTEGRITY-CONFLICT",
                "来源结构与来源 InChIKey 冲突，应以哪个经人工核验的记录为准？",
            ),
        )
    if not candidates:
        if retrieval_status == "not_found":
            return "not_assessed", "rejected", []
        return (
            "not_assessed",
            "review_required",
            _question(
                "Q-NO-RESOLVED-STRUCTURE",
                "当前没有可核对的完整结构；是否能提供结构、稳定 ID 或更多上下文？",
            ),
        )
    input_type = validated["detected_input_type"]
    if len(candidates) > 1:
        return _multiple_candidate_alignment(candidates, input_type)
    return _single_candidate_alignment(
        candidates[0],
        input_type,
        unresolved,
        retrieval_status,
    )


def build_handoff(
    validated: dict[str, Any],
    candidates: Sequence[dict[str, Any]],
    alignment: str,
    disposition: str,
) -> dict[str, Any]:
    if disposition != "ready_for_standardization" or len(candidates) != 1:
        return {
            "status": "blocked_pending_resolution",
            "target_skill": "standardize-chemical-structures",
            "records": [],
            "reason": (
                "只有唯一候选且当前处置为 ready_for_standardization 时才生成下游输入。"
            ),
        }
    candidate = candidates[0]
    structure = candidate.get("canonical_smiles")
    if not structure:
        return {
            "status": "blocked_missing_structure",
            "target_skill": "standardize-chemical-structures",
            "records": [],
            "reason": "唯一候选没有可交付的结构。",
        }
    return {
        "status": "ready",
        "target_skill": "standardize-chemical-structures",
        "records": [
            {
                "id": validated["id"],
                "structure": structure,
                "source_candidate_id": candidate["candidate_id"],
                "source_inchikey": candidate["inchikey"],
            }
        ],
        "alignment_scope": (
            "input_structure_only"
            if alignment == "not_assessed"
            else "database_records_only"
        ),
        "notice": (
            "该交接不确认物理样品身份；第一个 Skill 仍须保留此处来源结构和候选证据。"
        ),
    }


def _relationship(
    left: dict[str, Any],
    right: dict[str, Any],
) -> dict[str, Any]:
    left_candidate = left["candidates"][0]
    right_candidate = right["candidates"][0]
    left_key = left_candidate.get("inchikey")
    right_key = right_candidate.get("inchikey")
    left_parent = (left_candidate.get("comparison_view") or {}).get("parent_inchikey")
    right_parent = (right_candidate.get("comparison_view") or {}).get("parent_inchikey")
    if left_key and left_key == right_key:
        relationship = "exact"
        explanation = "两个查询解析到相同完整 InChIKey，仅表示数字记录结构一致。"
    elif left_parent and left_parent == right_parent:
        relationship = "related_forms"
        explanation = (
            "两个完整结构不同但共享派生 parent；"
            "可能是盐型或其他相关形式，不是同一物理样品。"
        )
    else:
        relationship = "different_or_unresolved"
        explanation = "当前确定性规则未证明两个查询为相同记录或相关形式。"
    return {
        "left_request_id": left["request"]["id"],
        "right_request_id": right["request"]["id"],
        "relationship": relationship,
        "left_inchikey": left_key,
        "right_inchikey": right_key,
        "left_parent_inchikey": left_parent,
        "right_parent_inchikey": right_parent,
        "explanation": explanation,
    }


def build_cross_query_relationships(
    resolutions: Sequence[dict[str, Any]],
) -> list[dict[str, Any]]:
    relationships = []
    for left_index, left in enumerate(resolutions):
        if len(left["candidates"]) != 1:
            continue
        for right in resolutions[left_index + 1 :]:
            if len(right["candidates"]) == 1:
                relationships.append(_relationship(left, right))
    return relationships
