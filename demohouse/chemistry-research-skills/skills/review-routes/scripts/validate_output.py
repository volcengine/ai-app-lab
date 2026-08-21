#!/usr/bin/env python3
"""Validate review-routes output and scientific boundaries."""

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any, Sequence

from review_routes import (
    DISPOSITIONS,
    REVIEW_STATUSES,
    REQUEST_SECTIONS,
    RULESET_VERSION,
    RULE_MESSAGES,
    SCHEMA_VERSION,
    SECRET_RE,
    WORKFLOW,
    load_local_module,
    stable_document_fingerprint,
)

FORBIDDEN_KEYS = {
    "route_is_feasible",
    "safe_to_execute",
    "optimal_route",
    "recommended_route",
    "success_probability",
    "ready_for_experiment",
    "overall_yield",
    "decision_score",
    "total_score",
}
FORBIDDEN_CLAIMS = {
    "该路线可行",
    "路线安全",
    "最佳路线",
    "可直接实验",
    "route is feasible",
    "safe to execute",
    "optimal route",
    "ready to run",
}
PARTIAL_CODES = {
    "W-CURATION-NOT-RUN-001",
    "W-CURATION-REVIEW-001",
    "W-PRECEDENT-TIMEOUT-001",
    "W-PRECEDENT-ERROR-001",
    "W-PRECEDENT-NOT-RUN-001",
    "W-PRECEDENT-PARTIAL-001",
    "W-PRECEDENT-RESULT-REVIEW-001",
}


OUTPUT_CONTRACT = load_local_module(
    "review_output_contract.py", "review_output_validator"
)
PRECEDENT_OUTPUT = load_local_module(
    "precedent_output_contract.py", "precedent_output_validator"
)


def walk(value: Any, path: str = "$") -> list[tuple[str, str, Any]]:
    output = []
    if isinstance(value, dict):
        for key, item in value.items():
            current = f"{path}.{key}"
            output.append((current, str(key), item))
            output.extend(walk(item, current))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            output.extend(walk(item, f"{path}[{index}]"))
    return output


def validate_finding(value: Any, path: str) -> list[str]:
    errors = []
    if not isinstance(value, dict):
        return [f"{path} 必须是 object"]
    if value.get("code") not in RULE_MESSAGES:
        errors.append(f"{path}.code 未登记")
    if value.get("severity") not in {"error", "warning"}:
        errors.append(f"{path}.severity 不受控")
    if value.get("message") != RULE_MESSAGES.get(value.get("code")):
        errors.append(f"{path}.message 与规则目录不一致")
    if not isinstance(value.get("field_path"), str) or not value["field_path"]:
        errors.append(f"{path}.field_path 为空")
    if not isinstance(value.get("evidence"), list):
        errors.append(f"{path}.evidence 必须是 array")
    return errors


def _missing_errors(value: dict[str, Any], required: set[str], path: str) -> list[str]:
    return [f"{path}.{key} 缺失" for key in sorted(required - set(value))]


def _array_errors(
    value: dict[str, Any], fields: tuple[str, ...], path: str
) -> list[str]:
    return [
        f"{path}.{field} 必须是 array"
        for field in fields
        if not isinstance(value.get(field), list)
    ]


def _step_shape_errors(
    value: dict[str, Any], path: str, allow_missing_hash: bool
) -> list[str]:
    errors = []
    if not isinstance(value.get("step_id"), str) or not value.get("step_id"):
        errors.append(f"{path}.step_id 非法")
    if not (
        allow_missing_hash and value.get("step_reaction_hash") is None
    ) and not OUTPUT_CONTRACT.is_sha256(value.get("step_reaction_hash")):
        errors.append(f"{path}.step_reaction_hash 非 SHA-256")
    errors.extend(
        _array_errors(
            value,
            ("path", "precursors", "agents", "findings", "review_required"),
            path,
        )
    )
    curation = value.get("curation")
    errors.extend(
        f"{path}.curation: {item}"
        for item in OUTPUT_CONTRACT.validate_curation_evidence(curation)
    )
    precedent = value.get("precedent")
    errors.extend(
        f"{path}.precedent: {item}"
        for item in PRECEDENT_OUTPUT.validate_precedent_evidence(precedent)
    )
    return errors


def validate_step(
    value: Any, path: str, *, allow_missing_hash: bool = False
) -> list[str]:
    if not isinstance(value, dict):
        return [f"{path} 必须是 object"]
    required = set(
        "step_id step_reaction_hash path reported_reaction canonical_reaction "
        "product precursors agents backend_metadata curation precedent findings "
        "review_required".split()
    )
    errors = _missing_errors(value, required, path)
    errors.extend(_step_shape_errors(value, path, allow_missing_hash))
    findings = value.get("findings") or []
    for index, item in enumerate(findings):
        errors.extend(validate_finding(item, f"{path}.findings[{index}]"))
    expected = sorted(
        item.get("code")
        for item in findings
        if isinstance(item, dict) and item.get("code")
    )
    if value.get("review_required") != expected:
        errors.append(f"{path}.review_required 与 findings 不一致")
    return errors


def _route_shape_errors(value: dict[str, Any], path: str) -> list[str]:
    errors = []
    if not isinstance(value.get("route_id"), str) or not value.get("route_id"):
        errors.append(f"{path}.route_id 非法")
    if not OUTPUT_CONTRACT.is_sha256(value.get("source_route_hash")):
        errors.append(f"{path}.source_route_hash 非 SHA-256")
    if not re.fullmatch(r"route:[0-9a-f]{24}", str(value.get("route_signature", ""))):
        errors.append(f"{path}.route_signature 非受控格式")
    for field, allowed in (
        ("topology_status", {"valid", "invalid"}),
        ("review_status", REVIEW_STATUSES),
        ("disposition", DISPOSITIONS),
    ):
        if value.get(field) not in allowed:
            errors.append(f"{path}.{field} 不受控")
    errors.extend(
        _array_errors(
            value,
            (
                "terminal_precursors",
                "weakest_steps",
                "constraint_results",
                "step_reviews",
                "findings",
                "human_review_required",
                "duplicate_memberships",
            ),
            path,
        )
    )
    return errors


def _route_step_errors(value: dict[str, Any], path: str) -> list[str]:
    steps = value.get("step_reviews") or []
    errors = []
    if value.get("step_count") != len(steps):
        errors.append(f"{path}.step_count 与 step_reviews 不一致")
    route_findings = value.get("findings") or []
    allow_missing = any(
        isinstance(item, dict)
        and item.get("code") == "E-STEP-REACTION-001"
        and item.get("severity") == "error"
        for item in route_findings
    )
    step_ids = []
    for index, step in enumerate(steps):
        errors.extend(
            validate_step(
                step,
                f"{path}.step_reviews[{index}]",
                allow_missing_hash=allow_missing,
            )
        )
        if isinstance(step, dict):
            step_ids.append(step.get("step_id"))
    if len(step_ids) != len(set(step_ids)):
        errors.append(f"{path}.step_id 批内重复")
    return errors


def _route_state_errors(value: dict[str, Any], path: str) -> list[str]:
    findings = value.get("findings") or []
    errors = []
    for index, item in enumerate(findings):
        errors.extend(validate_finding(item, f"{path}.findings[{index}]"))
    severities = {item.get("severity") for item in findings if isinstance(item, dict)}
    codes = sorted(
        {
            item.get("code")
            for item in findings
            if isinstance(item, dict) and item.get("code")
        }
    )
    expected_status = (
        "error"
        if "error" in severities
        else "partial"
        if any(code in PARTIAL_CODES for code in codes)
        else "completed"
    )
    expected_disposition = (
        "blocked"
        if "error" in severities
        else "review_required"
        if findings
        else "ready_for_expert_review"
    )
    if value.get("review_status") != expected_status:
        errors.append(f"{path}.review_status 应为 {expected_status}")
    if value.get("disposition") != expected_disposition:
        errors.append(f"{path}.disposition 应为 {expected_disposition}")
    if value.get("human_review_required") != [
        code for code in codes if code.startswith("W-")
    ]:
        errors.append(f"{path}.human_review_required 与 findings 不一致")
    errors.extend(
        f"{path}: {item}"
        for item in OUTPUT_CONTRACT.validate_route_curation_state(value)
    )
    errors.extend(
        f"{path}: {item}"
        for item in PRECEDENT_OUTPUT.validate_route_precedent_state(value)
    )
    return errors


def validate_route(value: Any, path: str) -> list[str]:
    if not isinstance(value, dict):
        return [f"{path} 必须是 object"]
    required = set(
        "route_id source_route_hash backend_metadata route_signature target_structure "
        "topology_status node_count step_count longest_linear_sequence branch_count "
        "terminal_precursors inventory_snapshot inventory_coverage "
        "precedent_coverage_by_level exact_or_transformation_coverage weakest_steps "
        "constraint_results step_reviews findings review_status disposition "
        "human_review_required duplicate_memberships".split()
    )
    errors = _missing_errors(value, required, path)
    errors.extend(_route_shape_errors(value, path))
    errors.extend(_route_step_errors(value, path))
    errors.extend(PRECEDENT_OUTPUT.validate_precedent_coverage(value, path))
    errors.extend(OUTPUT_CONTRACT.validate_ratios(value, path))
    errors.extend(_route_state_errors(value, path))
    return errors


def _output_shape_errors(document: dict[str, Any]) -> list[str]:
    required = set(
        "schema_version workflow ruleset_version generated_at_utc tool_versions "
        "source_record routes_fingerprint options constraints target_assessment "
        "input_summary route_summaries duplicate_route_groups comparison_dimensions "
        "review_queue errors warnings notices result_fingerprint".split()
    )
    errors = _missing_errors(document, required, "$")
    if document.get("schema_version") != SCHEMA_VERSION:
        errors.append("schema_version 不匹配")
    if (document.get("workflow"), document.get("ruleset_version")) != (
        WORKFLOW,
        RULESET_VERSION,
    ):
        errors.append("workflow/ruleset_version 不匹配")
    versions = document.get("tool_versions")
    if not isinstance(versions, dict) or versions.get("rdkit") not in {
        "2025.9.2",
        "2025.09.2",
    }:
        errors.append("rdkit 必须固定 2025.9.2")
    expected_options = {
        "comparison_mode": "dimensions_only",
        "preserve_backend_order": True,
        "automatic_route_ranking": False,
        "network_access": False,
        "pickle_allowed": False,
    }
    options = document.get("options")
    if not isinstance(options, dict):
        errors.append("options 必须是 object")
    else:
        errors.extend(
            f"options.{key} 必须是 {expected!r}"
            for key, expected in expected_options.items()
            if options.get(key) != expected
        )
    errors.extend(
        _array_errors(
            document,
            (
                "route_summaries",
                "duplicate_route_groups",
                "comparison_dimensions",
                "review_queue",
                "errors",
                "warnings",
                "notices",
            ),
            "$",
        )
    )
    return errors


def _routes_errors(document: dict[str, Any]) -> tuple[list[str], list[Any]]:
    routes = document.get("route_summaries") or []
    errors = []
    route_ids = []
    for index, route in enumerate(routes):
        errors.extend(validate_route(route, f"route_summaries[{index}]"))
        if isinstance(route, dict):
            route_ids.append(route.get("route_id"))
    if len(route_ids) != len(set(route_ids)):
        errors.append("route_id 输出重复")
    if document.get("review_queue") != REQUEST_SECTIONS.build_review_queue(routes):
        errors.append("review_queue 与 route/step findings 不一致")
    return errors, route_ids


def _duplicate_errors(document: dict[str, Any], routes: list[Any]) -> list[str]:
    memberships = defaultdict(set)
    errors = []
    for index, group in enumerate(document.get("duplicate_route_groups") or []):
        if not isinstance(group, dict):
            errors.append(f"duplicate_route_groups[{index}] 必须是 object")
            continue
        members = group.get("route_ids")
        if not isinstance(members, list) or len(members) < 2:
            errors.append(f"duplicate_route_groups[{index}].route_ids 非重复组")
            continue
        for route_id in members:
            memberships[route_id].add(group.get("group_id"))
    for route in routes:
        if isinstance(route, dict) and set(
            route.get("duplicate_memberships") or []
        ) != memberships.get(route.get("route_id"), set()):
            errors.append(f"route {route.get('route_id')} duplicate_memberships 不一致")
    return errors


def _content_errors(document: dict[str, Any]) -> list[str]:
    errors = [
        f"{path} 是禁止字段" for path, key, _ in walk(document) if key in FORBIDDEN_KEYS
    ]
    serialized = json.dumps(document, ensure_ascii=False)
    if SECRET_RE.search(serialized):
        errors.append("输出含疑似凭证")
    errors.extend(
        f"输出含禁止科学结论：{claim}"
        for claim in FORBIDDEN_CLAIMS
        if re.search(re.escape(claim), serialized, flags=re.IGNORECASE)
    )
    if document.get("result_fingerprint") != stable_document_fingerprint(document):
        errors.append("result_fingerprint 不匹配")
    return errors


def validate_output(document: Any) -> list[str]:
    if not isinstance(document, dict):
        return ["输出顶层必须是 object"]
    errors = _output_shape_errors(document)
    routes = document.get("route_summaries") or []
    route_errors, route_ids = _routes_errors(document)
    errors.extend(route_errors)
    errors.extend(
        OUTPUT_CONTRACT.validate_summary(
            document.get("input_summary"),
            len(routes),
            DISPOSITIONS,
        )
    )
    errors.extend(
        OUTPUT_CONTRACT.validate_comparisons(
            document.get("comparison_dimensions"),
            route_ids,
        )
    )
    errors.extend(_duplicate_errors(document, routes))
    errors.extend(_content_errors(document))
    return errors


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args(argv)
    try:
        document = json.loads(args.output.read_text(encoding="utf-8"))
    except Exception as error:
        print(json.dumps({"valid": False, "errors": [str(error)]}, ensure_ascii=False))
        return 2
    errors = validate_output(document)
    print(
        json.dumps(
            {"valid": not errors, "errors": errors},
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
