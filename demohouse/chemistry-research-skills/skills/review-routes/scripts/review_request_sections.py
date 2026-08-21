#!/usr/bin/env python3
"""Pure output sections for review-routes request processing."""

from __future__ import annotations

from typing import Any


def collect_findings(
    top_findings: list[dict[str, Any]],
    routes: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    output = list(top_findings)
    for route in routes:
        output.extend(
            {"route_id": route["route_id"], **item} for item in route["findings"]
        )
    return output


def build_review_queue(routes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    output = []
    for route in routes:
        if route["disposition"] != "ready_for_expert_review":
            error_codes = sorted(
                item["code"]
                for item in route["findings"]
                if item["severity"] == "error"
            )
            output.append(
                {
                    "route_id": route["route_id"],
                    "step_id": None,
                    "reason_codes": sorted(
                        set(route["human_review_required"]) | set(error_codes)
                    ),
                }
            )
        output.extend(
            {
                "route_id": route["route_id"],
                "step_id": step["step_id"],
                "reason_codes": step["review_required"],
            }
            for step in route["step_reviews"]
            if step["review_required"]
        )
    return output


def build_comparison_dimensions(
    routes: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    return [
        {
            "route_id": route["route_id"],
            "backend_rank": route["backend_metadata"]["backend_rank"],
            "backend_score": route["backend_metadata"]["backend_score"],
            "topology_status": route["topology_status"],
            "step_count": route["step_count"],
            "longest_linear_sequence": route["longest_linear_sequence"],
            "branch_count": route["branch_count"],
            "terminal_precursor_count": len(route["terminal_precursors"]),
            "inventory_coverage": route["inventory_coverage"],
            "precedent_coverage_by_level": route["precedent_coverage_by_level"],
            "exact_or_transformation_coverage": route[
                "exact_or_transformation_coverage"
            ],
            "weakest_step_count": len(route["weakest_steps"]),
            "disposition": route["disposition"],
        }
        for route in routes
    ]


def _input_summary(
    request: dict[str, Any],
    routes: list[dict[str, Any]],
    dispositions: set[str],
) -> dict[str, Any]:
    input_routes = request.get("routes")
    return {
        "input_routes": len(input_routes) if isinstance(input_routes, list) else 0,
        "output_routes": len(routes),
        "total_nodes": sum(route["node_count"] for route in routes),
        "total_steps": sum(route["step_count"] for route in routes),
        "disposition_counts": {
            value: sum(route["disposition"] == value for route in routes)
            for value in sorted(dispositions)
        },
        "record_count_conserved": (
            isinstance(input_routes, list) and len(input_routes) == len(routes)
        ),
    }


def build_document(
    *,
    request: dict[str, Any],
    context: dict[str, Any],
    routes: list[dict[str, Any]],
    duplicates: list[dict[str, Any]],
    top_findings: list[dict[str, Any]],
    generated_at_utc: str,
    runtime_seconds: float,
    metadata: dict[str, Any],
    dispositions: set[str],
) -> dict[str, Any]:
    all_findings = collect_findings(top_findings, routes)
    target_structure = context["target_structure"]
    target = request.get("target")
    return {
        **metadata,
        "generated_at_utc": generated_at_utc,
        "source_record": context["public_source"],
        "routes_fingerprint": context["routes_fingerprint"],
        "options": context["normalized_options"],
        "constraints": context["constraints"],
        "target_assessment": {
            "reported": target if isinstance(target, dict) else None,
            "canonical_structure": target_structure,
            "route_root_structures": sorted(
                route["target_structure"]
                for route in routes
                if route["target_structure"]
            ),
        },
        "input_summary": _input_summary(request, routes, dispositions),
        "route_summaries": routes,
        "duplicate_route_groups": duplicates,
        "comparison_dimensions": build_comparison_dimensions(routes),
        "review_queue": build_review_queue(routes),
        "errors": [item for item in all_findings if item["severity"] == "error"],
        "warnings": [item for item in all_findings if item["severity"] == "warning"],
        "notices": [
            "本输出是路线证据评审，不是可行性、安全、最优性或实验执行批准。",
            "backend score、库存声明、相似先例、条件和产率按各自来源保留，不生成默认综合总分。",
        ],
        "runtime_seconds": runtime_seconds,
    }
