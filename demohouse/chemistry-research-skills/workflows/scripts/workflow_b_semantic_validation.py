"""Independently rebuild Workflow B derived Artifact semantics."""

from __future__ import annotations

import importlib.util
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any


def _load_local_module(filename: str, module_name: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(
        module_name,
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


CONTRACTS = _load_local_module(
    "workflow_contracts.py",
    "workflow_b_semantic_contracts",
)
STANDARDIZATION = _load_local_module(
    "workflow_b_standardization_validation.py",
    "workflow_b_standardization_validation",
)


def _indexes(
    artifacts: list[dict[str, Any]],
    documents: dict[str, dict[str, Any]],
) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    by_name = {item["logical_name"]: item for item in artifacts}
    docs = {
        name: documents[item["artifact_id"]]
        for name, item in by_name.items()
        if item["artifact_id"] in documents
    }
    return by_name, docs


def _discovered_steps(document: dict[str, Any]) -> list[dict[str, str]]:
    output = []
    for route in document.get("route_summaries", []):
        for step in route.get("step_reviews", []):
            output.append(
                {
                    "route_id": route.get("route_id"),
                    "step_id": step.get("step_id"),
                    "step_reaction_hash": step.get("step_reaction_hash"),
                    "canonical_reaction": step.get("canonical_reaction"),
                }
            )
    return sorted(output, key=lambda item: (item["route_id"], item["step_id"]))


def _discovery_errors(docs: dict[str, dict[str, Any]]) -> list[str]:
    expected = _discovered_steps(docs["route-discovery"])
    stored = docs["route-steps"].get("steps")
    return ["route steps do not match discovery Artifact"] if stored != expected else []


def _binding_for_step(
    step: dict[str, Any],
    curated: dict[str, Any],
) -> dict[str, Any]:
    matches = [
        item
        for item in curated.get("records", [])
        if isinstance(item, dict)
        and isinstance(item.get("reaction_smiles"), dict)
        and item["reaction_smiles"].get("canonical_unmapped")
        == step["canonical_reaction"]
    ]
    record = matches[0] if len(matches) == 1 else None
    return {
        "route_id": step["route_id"],
        "step_id": step["step_id"],
        "step_reaction_hash": step["step_reaction_hash"],
        "binding_status": (
            "bound" if record is not None else "missing" if not matches else "ambiguous"
        ),
        "curation_record_id": (record.get("record_id") if record is not None else None),
        "original_record_hash": (
            record.get("original_record_hash") if record is not None else None
        ),
    }


def _curation_errors(docs: dict[str, dict[str, Any]]) -> list[str]:
    expected = [
        _binding_for_step(step, docs["curated-reactions"])
        for step in docs["route-steps"]["steps"]
    ]
    return (
        ["curation bindings do not match exact curated records"]
        if docs["curation-bindings"].get("bindings") != expected
        else []
    )


def _reaction_sides(value: str) -> tuple[list[str], list[str]]:
    if value.count(">>") == 1:
        left, right = value.split(">>")
    else:
        left, _, right = value.split(">")
    return (
        [item for item in left.split(".") if item],
        [item for item in right.split(".") if item],
    )


def _expected_search_query(
    step: dict[str, Any],
    operation: str,
    record_id: str | None,
) -> dict[str, Any]:
    if operation == "lookup_reaction":
        return {"reaction_id": record_id}
    if operation == "search_transformations":
        return {"reaction_smarts": step["canonical_reaction"]}
    if operation == "search_similar_reactions":
        return {
            "reaction_smiles": step["canonical_reaction"],
            "reaction_record_id": record_id,
        }
    inputs, outputs = _reaction_sides(step["canonical_reaction"])
    return {
        "component_predicates": [
            {
                "target": target,
                "mode": "exact",
                "pattern": structure,
                "threshold": None,
            }
            for target, structures in (("input", inputs), ("output", outputs))
            for structure in structures
        ]
    }


def _plan_errors(
    request: dict[str, Any],
    docs: dict[str, dict[str, Any]],
) -> list[str]:
    plan = docs["step-search-plan"]
    strategy = request["inputs"]["search_strategy"]
    fingerprint = CONTRACTS.sha256_json(strategy)
    steps = {
        (item["route_id"], item["step_id"]): item
        for item in docs["route-steps"]["steps"]
    }
    bindings = {
        (item["route_id"], item["step_id"]): item
        for item in docs["curation-bindings"]["bindings"]
    }
    errors = []
    if (
        plan.get("strategy") != strategy
        or plan.get("strategy_fingerprint") != fingerprint
        or plan.get("curation_artifact_fingerprint")
        != docs["curated-reactions"].get("result_fingerprint")
    ):
        errors.append("step search plan provenance is invalid")
    plans = plan.get("plans")
    if not isinstance(plans, list) or len(plans) != len(steps):
        return [*errors, "step search plan coverage is invalid"]
    for item in plans:
        key = (item.get("route_id"), item.get("step_id"))
        step = steps.get(key)
        binding = bindings.get(key)
        query = item.get("query")
        if step is None or binding is None or not isinstance(query, dict):
            errors.append("step search plan binding is invalid")
            continue
        expected_query = {
            "route_id": step["route_id"],
            "step_id": step["step_id"],
            "step_reaction_hash": step["step_reaction_hash"],
            "strategy_fingerprint": fingerprint,
            "curation_artifact_fingerprint": docs["curated-reactions"][
                "result_fingerprint"
            ],
            "curation_record_id": binding["curation_record_id"],
            "curation_binding_status": binding["binding_status"],
            "search_query": _expected_search_query(
                step,
                strategy["operation"],
                binding["curation_record_id"],
            ),
        }
        if (
            item.get("step_reaction_hash") != step["step_reaction_hash"]
            or item.get("strategy_fingerprint") != fingerprint
            or query != expected_query
        ):
            errors.append("step search plan binding is invalid")
    return errors


def _actual_search_binding(
    plan: dict[str, Any],
    strategy: dict[str, Any],
    document: dict[str, Any],
) -> str:
    interpretation = document.get("query_interpretation")
    provenance = document.get("corpus_provenance")
    if (
        document.get("operation") != strategy["operation"]
        or document.get("provider") != strategy["provider"]
        or not isinstance(interpretation, dict)
        or interpretation.get("query") != plan["query"]["search_query"]
    ):
        return "wrong_step"
    if strategy["provider"] == "local_curated_corpus" and (
        not isinstance(provenance, dict)
        or provenance.get("artifact_fingerprint")
        != plan["query"]["curation_artifact_fingerprint"]
    ):
        return "wrong_step"
    return "bound"


def _result_errors(
    docs: dict[str, dict[str, Any]],
    documents: dict[str, dict[str, Any]],
) -> list[str]:
    plan_document = docs["step-search-plan"]
    plans = plan_document["plans"]
    results = docs["step-search-results"].get("results")
    if not isinstance(results, list) or len(results) != len(plans):
        return ["step search result coverage is invalid"]
    errors = []
    for plan, result in zip(plans, results, strict=True):
        if any(
            result.get(field) != plan.get(field)
            for field in ("route_id", "step_id", "step_reaction_hash")
        ):
            errors.append("step search result does not match plan")
            continue
        artifact_id = result.get("artifact_id")
        document = documents.get(artifact_id)
        if document is None:
            if result.get("provider_status") != "not_run":
                errors.append("step search result missing Artifact is invalid")
            continue
        expected_binding = _actual_search_binding(
            plan,
            plan_document["strategy"],
            document,
        )
        if (
            result.get("provider_status") != document.get("provider_status")
            or result.get("binding_status") != expected_binding
        ):
            errors.append("step search result binding is invalid")
    return errors


def _route_binding_rows(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_route: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in results:
        by_route[item["route_id"]].append(item)
    return [
        {
            "route_id": route_id,
            "binding_status": (
                "bound"
                if all(item["binding_status"] == "bound" for item in rows)
                else "blocked"
            ),
            "step_results": sorted(rows, key=lambda item: item["step_id"]),
        }
        for route_id, rows in sorted(by_route.items())
    ]


def _assembly_errors(
    docs: dict[str, dict[str, Any]],
    documents: dict[str, dict[str, Any]],
) -> list[str]:
    assembled = docs["assembled-step-artifacts"]
    results = docs["step-search-results"]["results"]
    bindings = {
        (item["route_id"], item["step_id"]): item
        for item in docs["curation-bindings"]["bindings"]
    }
    expected_steps = []
    errors = []
    for result in results:
        binding = bindings.get((result["route_id"], result["step_id"]))
        if binding is None:
            errors.append("assembled step Artifact binding is missing")
            continue
        expected_steps.append(
            {
                "route_id": result["route_id"],
                "step_id": result["step_id"],
                "step_reaction_hash": result["step_reaction_hash"],
                "curation_record_id": binding["curation_record_id"],
                "curation_artifact": (
                    docs["curated-reactions"]
                    if binding["binding_status"] == "bound"
                    else None
                ),
                "precedent_artifact": documents.get(result["artifact_id"]),
            }
        )
    if assembled.get("step_artifacts") != expected_steps:
        errors.append("assembled step Artifacts do not match search results")
    if assembled.get("route_bindings") != _route_binding_rows(results):
        errors.append("assembled route bindings do not match search results")
    return errors


def _review_errors(
    request: dict[str, Any],
    by_name: dict[str, dict[str, Any]],
    docs: dict[str, dict[str, Any]],
) -> list[str]:
    expected_request = dict(docs["route-input"])
    expected_request["step_artifacts"] = docs["assembled-step-artifacts"][
        "step_artifacts"
    ]
    if request["inputs"]["inventory_snapshot"] is not None:
        expected_request["inventory_snapshot"] = docs["inventory-snapshot"]
    if request["inputs"]["constraints"]:
        expected_request["constraints"] = request["inputs"]["constraints"]
    errors = []
    if docs["route-review-request"] != expected_request:
        errors.append("final route review request is not reproducible")
    review_entry = by_name["route-review"]
    review = docs["route-review"]
    expert = docs["expert-review-package"]
    expected_routes = [
        {
            "route_id": route.get("route_id"),
            "route_signature": route.get("route_signature"),
            "review_status": route.get("review_status"),
            "disposition": route.get("disposition"),
            "step_count": route.get("step_count"),
            "weakest_step_count": len(route.get("weakest_steps") or []),
        }
        for route in review.get("route_summaries", [])
    ]
    if (
        expert.get("route_review_artifact_id") != review_entry["artifact_id"]
        or expert.get("route_review_artifact_sha256") != review_entry["sha256"]
        or expert.get("routes") != expected_routes
        or expert.get("limitations")
        != ["not_ready_for_experiment", "not_safety_approval"]
    ):
        errors.append("expert review package binding is invalid")
    return errors


def semantic_errors(
    request: dict[str, Any],
    artifacts: list[dict[str, Any]],
    documents: dict[str, dict[str, Any]],
) -> list[str]:
    by_name, docs = _indexes(artifacts, documents)
    required = {
        "curated-reactions",
        "route-discovery",
        "route-steps",
        "curation-bindings",
        "step-search-plan",
        "step-search-results",
        "assembled-step-artifacts",
        "route-input",
        "route-review-request",
        "route-review",
        "expert-review-package",
    }
    missing = sorted(required - docs.keys())
    if missing:
        return [f"Workflow B semantic Artifacts missing: {missing}"]
    errors = _discovery_errors(docs)
    errors.extend(STANDARDIZATION.standardization_errors(request, docs))
    errors.extend(_curation_errors(docs))
    errors.extend(_plan_errors(request, docs))
    errors.extend(_result_errors(docs, documents))
    errors.extend(_assembly_errors(docs, documents))
    errors.extend(_review_errors(request, by_name, docs))
    return errors
