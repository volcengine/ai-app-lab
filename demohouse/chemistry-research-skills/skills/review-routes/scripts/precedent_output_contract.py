#!/usr/bin/env python3
"""Pure consistency checks for review-routes precedent evidence."""

import re
from typing import Any

REQUIRED = set(
    "provider_status match_level operation provider query_fingerprint profile_ids "
    "reported_condition_evidence reported_yield_evidence sources licenses "
    "artifact_fingerprint corpus_artifact_fingerprint result_ids result_hashes "
    "review_required_result_ids binding_status".split()
)
ARRAY_FIELDS = tuple(
    "profile_ids reported_condition_evidence reported_yield_evidence sources "
    "licenses result_ids result_hashes review_required_result_ids".split()
)
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
PRECEDENT_LEVELS = {
    *LEVEL_BY_OPERATION.values(),
    *LEVEL_BY_STATUS.values(),
    "not_run",
}
PROVIDER_STATUSES = set(
    "completed completed_zero_hits partial blocked source_timeout source_error "
    "not_run".split()
)
FAILURE_CODES = set("E-PRECEDENT-ARTIFACT-CONTRACT-001 E-PRECEDENT-BINDING-001".split())
STATE_CODES = {
    "completed_zero_hits": "W-PRECEDENT-ZERO-001",
    "partial": "W-PRECEDENT-PARTIAL-001",
    "source_timeout": "W-PRECEDENT-TIMEOUT-001",
    "source_error": "W-PRECEDENT-ERROR-001",
    "blocked": "E-PRECEDENT-BLOCKED-001",
}


def is_sha256(value: Any) -> bool:
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) is not None


def _unbound_errors(value: dict[str, Any]) -> list[str]:
    errors = []
    for field in (
        "operation",
        "provider",
        "query_fingerprint",
        "artifact_fingerprint",
        "corpus_artifact_fingerprint",
    ):
        if value.get(field) is not None:
            errors.append(f"{field} 未绑定时必须为 null")
    for field in ARRAY_FIELDS:
        if value.get(field) != []:
            errors.append(f"{field} 未绑定时必须为空")
    if (value.get("provider_status"), value.get("match_level")) != (
        "not_run",
        "not_run",
    ):
        errors.append("未绑定 precedent 必须为 not_run/not_run")
    return errors


def _bound_errors(value: dict[str, Any]) -> list[str]:
    status = value.get("provider_status")
    expected = LEVEL_BY_STATUS.get(
        status, LEVEL_BY_OPERATION.get(value.get("operation"))
    )
    result_ids = (
        value.get("result_ids") if isinstance(value.get("result_ids"), list) else []
    )
    result_hashes = (
        value.get("result_hashes")
        if isinstance(value.get("result_hashes"), list)
        else []
    )
    review_ids = (
        value.get("review_required_result_ids")
        if isinstance(value.get("review_required_result_ids"), list)
        else []
    )
    corpus_hash = value.get("corpus_artifact_fingerprint")
    checks = (
        (
            not is_sha256(value.get("artifact_fingerprint"))
            or not is_sha256(value.get("query_fingerprint")),
            "artifact/query fingerprint bound 时必须为 SHA-256",
        ),
        (
            value.get("match_level") != expected,
            "match_level 与 operation/provider_status 不一致",
        ),
        (len(result_ids) != len(result_hashes), "result IDs/hash 数量不一致"),
        (len(result_ids) != len(set(result_ids)), "result_ids 重复"),
        (
            any(not isinstance(item, str) or not item for item in result_ids),
            "result_ids 必须是非空字符串",
        ),
        (
            any(not is_sha256(item) for item in result_hashes),
            "result_hashes 必须是 SHA-256",
        ),
        (
            status in {"completed", "partial"} and not result_ids,
            f"{status} 必须保留 result provenance",
        ),
        (not set(review_ids).issubset(result_ids), "review result IDs 不属于 results"),
        (
            value.get("provider") == "local_curated_corpus"
            and not is_sha256(corpus_hash),
            "local corpus fingerprint 必须为 SHA-256",
        ),
        (
            value.get("provider") == "ord_public_api" and corpus_hash is not None,
            "ORD corpus fingerprint 必须为 null",
        ),
    )
    return [message for invalid, message in checks if invalid]


def validate_precedent_evidence(value: Any) -> list[str]:
    if not isinstance(value, dict):
        return ["precedent evidence 必须是 object"]
    missing = REQUIRED - set(value)
    errors = [f"precedent evidence 缺少字段：{sorted(missing)!r}"] if missing else []
    binding = value.get("binding_status")
    if binding not in {"not_provided", "bound", "failed"}:
        errors.append("precedent binding_status 不受控")
    if value.get("provider_status") not in PROVIDER_STATUSES:
        errors.append("precedent provider_status 不受控")
    if value.get("match_level") not in PRECEDENT_LEVELS:
        errors.append("precedent match_level 不受控")
    errors.extend(
        f"precedent {field} 必须是 array"
        for field in ARRAY_FIELDS
        if not isinstance(value.get(field), list)
    )
    if binding == "bound":
        errors.extend(_bound_errors(value))
    elif binding in {"not_provided", "failed"}:
        errors.extend(_unbound_errors(value))
    return errors


def _codes(value: Any) -> set[str]:
    return (
        {
            item["code"]
            for item in value
            if isinstance(item, dict) and isinstance(item.get("code"), str)
        }
        if isinstance(value, list)
        else set()
    )


def _step_errors(precedent: dict[str, Any], codes: set[str]) -> list[str]:
    errors = []
    binding = precedent.get("binding_status")
    status = precedent.get("provider_status")
    level = precedent.get("match_level")
    if binding == "not_provided" and "W-PRECEDENT-NOT-RUN-001" not in codes:
        errors.append("not_provided precedent 未保留 W-PRECEDENT-NOT-RUN-001")
    if binding == "failed" and not codes & FAILURE_CODES:
        errors.append("failed precedent 未保留 contract/binding error")
    if binding == "bound" and STATE_CODES.get(status) not in {None, *codes}:
        errors.append(f"{status} precedent 未保留状态 finding")
    level_code = {
        "similar_reaction": "W-PRECEDENT-SIMILAR-001",
        "component_only": "W-PRECEDENT-COMPONENT-001",
    }.get(level)
    if binding == "bound" and level_code not in {None, *codes}:
        errors.append(f"{level} precedent 未保留 level finding")
    if precedent.get("review_required_result_ids") and (
        "W-PRECEDENT-RESULT-REVIEW-001" not in codes
    ):
        errors.append("review result 未保留 review finding")
    if "W-PRECEDENT-RESULT-REVIEW-001" in codes and not precedent.get(
        "review_required_result_ids"
    ):
        errors.append("review finding 缺少 review_required_result_ids")
    return errors


def validate_route_precedent_state(route: Any) -> list[str]:
    if not isinstance(route, dict) or not isinstance(route.get("step_reviews"), list):
        return ["route/step_reviews 形状非法"]
    errors = []
    requires_review = False
    requires_block = False
    route_codes = _codes(route.get("findings"))
    for index, step in enumerate(route["step_reviews"]):
        if not isinstance(step, dict):
            errors.append(f"step_reviews[{index}] 必须是 object")
            continue
        precedent = step.get("precedent")
        errors.extend(
            f"step_reviews[{index}]: {item}"
            for item in validate_precedent_evidence(precedent)
        )
        if not isinstance(precedent, dict):
            continue
        step_codes = _codes(step.get("findings"))
        errors.extend(_step_errors(precedent, step_codes))
        if not step_codes.issubset(route_codes):
            errors.append(f"step_reviews[{index}] findings 未传播到 route")
        binding = precedent.get("binding_status")
        status = precedent.get("provider_status")
        level = precedent.get("match_level")
        requires_block |= binding == "failed" or status == "blocked"
        requires_review |= (
            binding == "not_provided"
            or status
            in {"completed_zero_hits", "partial", "source_timeout", "source_error"}
            or level in {"similar_reaction", "component_only"}
            or bool(precedent.get("review_required_result_ids"))
        )
    if requires_block and route.get("disposition") != "blocked":
        errors.append("failed/blocked precedent 要求 route blocked")
    if requires_review and route.get("disposition") == "ready_for_expert_review":
        errors.append("weak/missing precedent 不得进入 ready")
    return errors


def validate_precedent_coverage(route: Any, path: str) -> list[str]:
    if not isinstance(route, dict):
        return [f"{path} 必须是 object"]
    coverage = route.get("precedent_coverage_by_level")
    if not isinstance(coverage, dict):
        return [f"{path}.precedent_coverage_by_level 必须是 object"]
    errors = []
    if set(coverage) != PRECEDENT_LEVELS:
        errors.append(f"{path}.precedent_coverage_by_level 枚举不完整")
    if any(type(item) is not int or item < 0 for item in coverage.values()):
        errors.append(f"{path}.precedent_coverage_by_level 必须是非负整数")
    elif sum(coverage.values()) != len(route.get("step_reviews") or []):
        errors.append(f"{path}.precedent coverage 计数不守恒")
    return errors
