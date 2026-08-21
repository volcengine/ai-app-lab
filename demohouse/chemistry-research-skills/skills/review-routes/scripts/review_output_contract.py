#!/usr/bin/env python3
"""Pure consistency checks for review-routes curation evidence."""

from __future__ import annotations

import re
from typing import Any

REQUIRED_EVIDENCE = {
    "status",
    "disposition",
    "findings",
    "artifact_fingerprint",
    "curation_record_id",
    "original_record_hash",
    "binding_status",
}
STATUSES = {"completed", "partial", "not_run", "error"}
DISPOSITIONS = {"ready_for_search", "review_required", "rejected"}
BINDING_STATUSES = {"not_provided", "bound", "failed"}
FAILURE_CODES = {
    "E-CURATION-ARTIFACT-CONTRACT-001",
    "E-CURATION-BINDING-001",
    "E-STEP-HASH-MISMATCH-001",
}
CURATION_STATE_CODES = {
    "W-CURATION-NOT-RUN-001",
    "W-CURATION-REVIEW-001",
    "E-CURATION-REJECTED-001",
}


def is_sha256(value: Any) -> bool:
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) is not None


def _expected_record_state(findings: list[Any]) -> tuple[str, str]:
    severities = {item.get("severity") for item in findings if isinstance(item, dict)}
    if "error" in severities:
        return "error", "rejected"
    if findings:
        return "partial", "review_required"
    return "completed", "ready_for_search"


def _unbound_provenance_errors(value: dict[str, Any]) -> list[str]:
    errors = []
    for field in (
        "artifact_fingerprint",
        "curation_record_id",
        "original_record_hash",
    ):
        if value.get(field) is not None:
            errors.append(f"{field} 未绑定时必须为 null")
    if value.get("status") != "not_run":
        errors.append("未绑定 curation status 必须为 not_run")
    if value.get("disposition") is not None:
        errors.append("未绑定 curation disposition 必须为 null")
    if value.get("findings") != []:
        errors.append("未绑定 curation findings 必须为空")
    return errors


def _bound_provenance_errors(value: dict[str, Any]) -> list[str]:
    errors = []
    for field in ("artifact_fingerprint", "original_record_hash"):
        if not is_sha256(value.get(field)):
            errors.append(f"{field} bound 时必须为 SHA-256")
    record_id = value.get("curation_record_id")
    if not isinstance(record_id, str) or not record_id:
        errors.append("curation_record_id bound 时必须为非空字符串")
    findings = value.get("findings")
    if isinstance(findings, list):
        expected = _expected_record_state(findings)
        if (value.get("status"), value.get("disposition")) != expected:
            errors.append("bound curation state 与 findings 不一致")
    return errors


def validate_curation_evidence(value: Any) -> list[str]:
    if not isinstance(value, dict):
        return ["curation evidence 必须是 object"]
    missing = REQUIRED_EVIDENCE - set(value)
    errors = [f"curation evidence 缺少字段：{sorted(missing)!r}"] if missing else []
    status = value.get("status")
    disposition = value.get("disposition")
    binding_status = value.get("binding_status")
    if status not in STATUSES:
        errors.append("curation status 不受控")
    if disposition is not None and disposition not in DISPOSITIONS:
        errors.append("curation disposition 不受控")
    if not isinstance(value.get("findings"), list):
        errors.append("curation findings 必须是 array")
    if binding_status not in BINDING_STATUSES:
        errors.append("curation binding_status 不受控")
    elif binding_status == "bound":
        errors.extend(_bound_provenance_errors(value))
    else:
        errors.extend(_unbound_provenance_errors(value))
    return errors


def _finding_codes(value: Any) -> set[str]:
    if not isinstance(value, list):
        return set()
    return {
        item["code"]
        for item in value
        if isinstance(item, dict) and isinstance(item.get("code"), str)
    }


def _binding_code_errors(curation: dict[str, Any], codes: set[str]) -> list[str]:
    binding = curation.get("binding_status")
    disposition = curation.get("disposition")
    if binding == "not_provided":
        return (
            []
            if "W-CURATION-NOT-RUN-001" in codes
            else ["not_provided curation 未保留 W-CURATION-NOT-RUN-001"]
        )
    if binding == "failed":
        return (
            []
            if codes & FAILURE_CODES
            else ["failed curation 未保留 binding/contract/hash error"]
        )
    expected = {
        "review_required": "W-CURATION-REVIEW-001",
        "rejected": "E-CURATION-REJECTED-001",
    }.get(disposition)
    if expected and expected not in codes:
        return [f"{disposition} curation 未保留 {expected}"]
    if disposition == "ready_for_search" and codes & CURATION_STATE_CODES:
        return ["ready curation 保留了矛盾的 curation gate finding"]
    return []


def validate_route_curation_state(route: Any) -> list[str]:
    if not isinstance(route, dict):
        return ["route 必须是 object"]
    steps = route.get("step_reviews")
    if not isinstance(steps, list):
        return ["route.step_reviews 必须是 array"]
    errors = []
    requires_review = False
    requires_block = False
    route_codes = _finding_codes(route.get("findings"))
    for index, step in enumerate(steps):
        if not isinstance(step, dict):
            errors.append(f"step_reviews[{index}] 必须是 object")
            continue
        curation = step.get("curation")
        evidence_errors = validate_curation_evidence(curation)
        errors.extend(f"step_reviews[{index}]: {item}" for item in evidence_errors)
        if not isinstance(curation, dict):
            continue
        step_codes = _finding_codes(step.get("findings"))
        errors.extend(_binding_code_errors(curation, step_codes))
        if not step_codes.issubset(route_codes):
            errors.append(f"step_reviews[{index}] findings 未传播到 route")
        binding = curation.get("binding_status")
        disposition = curation.get("disposition")
        requires_block |= binding == "failed" or disposition == "rejected"
        requires_review |= binding == "not_provided" or disposition == "review_required"
    if requires_block and route.get("disposition") != "blocked":
        errors.append("failed/rejected curation 要求 route blocked")
    if requires_review and route.get("disposition") == "ready_for_expert_review":
        errors.append("missing/review curation 不得进入 ready")
    return errors


def validate_ratios(value: dict[str, Any], path: str) -> list[str]:
    errors = []
    for field in ("exact_or_transformation_coverage", "inventory_coverage"):
        ratio = value.get(field)
        valid = (
            isinstance(ratio, (int, float))
            and not isinstance(ratio, bool)
            and 0 <= ratio <= 1
        )
        if not valid:
            errors.append(f"{path}.{field} 非 0–1")
    return errors


def validate_summary(
    summary: Any,
    route_count: int,
    dispositions: set[str],
) -> list[str]:
    if not isinstance(summary, dict):
        return ["input_summary 必须是 object"]
    errors = []
    if summary.get("output_routes") != route_count:
        errors.append("input_summary.output_routes 不一致")
    conserved = summary.get("input_routes") == summary.get("output_routes")
    if summary.get("record_count_conserved") != conserved:
        errors.append("input_summary.record_count_conserved 不一致")
    counts = summary.get("disposition_counts")
    if not isinstance(counts, dict) or set(counts) != dispositions:
        errors.append("input_summary.disposition_counts 不完整")
    elif any(type(value) is not int or value < 0 for value in counts.values()):
        errors.append("input_summary.disposition_counts 必须是非负整数")
    elif sum(counts.values()) != route_count:
        errors.append("input_summary.disposition_counts 不守恒")
    return errors


def validate_comparisons(comparisons: Any, route_ids: list[Any]) -> list[str]:
    if not isinstance(comparisons, list):
        return ["comparison_dimensions 必须是 array"]
    errors = []
    if len(comparisons) != len(route_ids):
        errors.append("comparison_dimensions 与 routes 数量不一致")
    ids = {item.get("route_id") for item in comparisons if isinstance(item, dict)}
    if ids != set(route_ids):
        errors.append("comparison_dimensions route_id 不一致")
    return errors
