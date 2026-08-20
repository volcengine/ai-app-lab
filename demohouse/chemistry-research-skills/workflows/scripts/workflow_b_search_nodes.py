"""Workflow B search-plan, serial search, and assembly nodes."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Any


def _load_local_module(filename: str, module_name: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


CTX = _load_local_module(
    "workflow_a_context.py",
    "workflow_b_search_nodes_context",
)
ADAPTER_NODES = _load_local_module(
    "workflow_a_adapters.py",
    "workflow_b_search_nodes_adapters",
)
SUPPORT = _load_local_module(
    "workflow_b_node_support.py",
    "workflow_b_search_node_support",
)
EVENTS = _load_local_module(
    "workflow_b_search_events.py",
    "workflow_b_search_nodes_events",
)


class WorkflowBSearchNodeError(ValueError):
    """Raised when a Workflow B search node cannot execute safely."""


_document = SUPPORT.document
_commit_json = SUPPORT.commit_json


def expand_search_plan(domain: Any, context: Any) -> Any:
    steps_document = _document(context, "route-steps")
    bindings_document = _document(context, "curation-bindings")
    curated = _document(context, "curated-reactions")
    steps = [domain.RouteStep(**item) for item in steps_document["steps"]]
    bindings = [
        domain.CurationBinding(**item) for item in bindings_document["bindings"]
    ]
    fingerprint = curated.get("result_fingerprint")
    try:
        domain.CONTRACTS.require_sha256(
            fingerprint,
            "curation artifact fingerprint",
        )
    except domain.CONTRACTS.ContractError as error:
        raise WorkflowBSearchNodeError(str(error)) from error
    strategy = context.request["inputs"]["search_strategy"]
    plans = domain.expand_search_plan(
        steps=steps,
        strategy=strategy,
        bindings=bindings,
        curation_artifact_fingerprint=fingerprint,
    )
    value = {
        "schema_version": "1.0.0",
        "workflow": "route-step-search-plan",
        "strategy": strategy,
        "strategy_fingerprint": domain.CONTRACTS.sha256_json(strategy),
        "curation_artifact_id": context.artifacts["curated-reactions"]["artifact_id"],
        "curation_artifact_fingerprint": fingerprint,
        "plans": [item.as_json() for item in plans],
    }
    entry = _commit_json(
        context,
        node_id="expand-search-plan",
        logical_name="step-search-plan",
        filename="step-search-plan.json",
        value=value,
        parameters={
            "plan_count": len(plans),
            "strategy_fingerprint": value["strategy_fingerprint"],
        },
        upstream_names=(
            "route-steps",
            "curation-bindings",
            "curated-reactions",
        ),
        domain_state="completed",
    )
    return CTX.NodeOutcome(
        "expand-search-plan",
        "succeeded",
        "completed",
        (entry["artifact_id"],),
    )


def _search_request(
    plan: Any,
    strategy: dict[str, Any],
    curated: dict[str, Any],
) -> dict[str, Any]:
    request = {
        "schema_version": "1.0.0",
        "workflow": "search-reactions",
        "operation": strategy["operation"],
        "provider": strategy["provider"],
        "query": plan.query["search_query"],
        "options": {
            "fingerprint_profile_id": strategy["fingerprint_profile_id"],
            "top_k": strategy["top_k"],
            "threshold": strategy["threshold"],
            "candidate_limit": max(100, strategy["top_k"]),
            "include_review_required": strategy["include_review_required"],
            "use_stereochemistry": strategy["use_stereochemistry"],
        },
    }
    if strategy["provider"] == "local_curated_corpus":
        request["corpus_artifact"] = curated
    else:
        request["provider_config"] = {
            "base_url": "https://open-reaction-database.org/api",
            "timeout_seconds": 30,
        }
    return request


def _commit_search_request(
    context: Any,
    plan: Any,
    request: dict[str, Any],
    position: int,
) -> str:
    logical_name = f"precedent-search-request-{position:04d}"
    attempt = CTX.attempt_dir(context, "search-precedents-per-step")
    CTX.write_json(
        attempt / f"step-{position:04d}/search-request.json",
        request,
    )
    binding = {
        "schema_version": "1.0.0",
        "workflow": "route-step-search-request",
        "route_id": plan.route_id,
        "step_id": plan.step_id,
        "step_reaction_hash": plan.step_reaction_hash,
        "strategy_fingerprint": plan.strategy_fingerprint,
        "search_request": request,
    }
    entry = _commit_json(
        context,
        node_id="search-precedents-per-step",
        logical_name=logical_name,
        filename=f"step-{position:04d}/search-request-binding.json",
        value=binding,
        parameters={
            "plan": plan.as_json(),
            "search_request_fingerprint": CTX.CONTRACTS.sha256_json(request),
        },
        upstream_names=("step-search-plan", "curated-reactions"),
        domain_state="completed",
    )
    return entry["artifact_id"]


def _adapter_input(
    context: Any,
    plan: Any,
    request_name: str,
    position: int,
) -> Any:
    attempt = CTX.attempt_dir(context, "search-precedents-per-step")
    step_dir = attempt / f"step-{position:04d}"
    event_payload = {
        "route_id": plan.route_id,
        "step_id": plan.step_id,
        "step_reaction_hash": plan.step_reaction_hash,
    }
    return ADAPTER_NODES.NodeInput(
        node_id="search-precedents-per-step",
        adapter_id="search-reactions-v1",
        command_context={
            "input_path": str(step_dir / "search-request.json"),
            "output_path": str(step_dir / ".precedent-search.json.tmp"),
        },
        output_path=step_dir / "precedent-search.json",
        logical_name=f"precedent-search-{position:04d}",
        validation_logical_name=(f"precedent-search-validation-{position:04d}"),
        key_parameters={
            "plan": plan.as_json(),
            "request_artifact_id": context.artifacts[request_name]["artifact_id"],
        },
        upstream_names=(request_name, "curated-reactions"),
        event_payload=event_payload,
        producer_attempt=position,
    )


def _binding_status(
    plan: Any,
    strategy: dict[str, Any],
    artifact: dict[str, Any],
) -> str:
    interpretation = artifact.get("query_interpretation")
    provenance = artifact.get("corpus_provenance")
    if (
        artifact.get("operation") != strategy["operation"]
        or artifact.get("provider") != strategy["provider"]
        or not isinstance(interpretation, dict)
        or interpretation.get("query") != plan.query["search_query"]
    ):
        return "wrong_step"
    if strategy["provider"] == "local_curated_corpus" and (
        not isinstance(provenance, dict)
        or provenance.get("artifact_fingerprint")
        != plan.query["curation_artifact_fingerprint"]
    ):
        return "wrong_step"
    return "bound"


def _search_one(
    domain: Any,
    context: Any,
    plan: Any,
    strategy: dict[str, Any],
    curated: dict[str, Any],
    position: int,
) -> Any:
    if plan.query["curation_binding_status"] != "bound":
        return domain.StepSearchResult(
            plan.route_id,
            plan.step_id,
            plan.step_reaction_hash,
            "not_run",
            None,
            plan.query["curation_binding_status"],
        )
    request = _search_request(plan, strategy, curated)
    request_name = f"precedent-search-request-{position:04d}"
    _commit_search_request(context, plan, request, position)
    try:
        ADAPTER_NODES.execute_adapter_node(
            _adapter_input(context, plan, request_name, position),
            context,
        )
    except ADAPTER_NODES.ADAPTERS.AdapterError:
        EVENTS.record_search_failure(context, plan)
        return domain.StepSearchResult(
            plan.route_id,
            plan.step_id,
            plan.step_reaction_hash,
            "not_run",
            None,
            "execution_failed",
        )
    output_name = f"precedent-search-{position:04d}"
    artifact = _document(context, output_name)
    return domain.StepSearchResult(
        plan.route_id,
        plan.step_id,
        plan.step_reaction_hash,
        artifact["provider_status"],
        context.artifacts[output_name]["artifact_id"],
        _binding_status(plan, strategy, artifact),
    )


def search_precedents(domain: Any, context: Any) -> Any:
    plan_document = _document(context, "step-search-plan")
    curated = _document(context, "curated-reactions")
    strategy = plan_document["strategy"]
    plans = [domain.StepSearchPlan(**item) for item in plan_document["plans"]]
    results = [
        _search_one(
            domain,
            context,
            plan,
            strategy,
            curated,
            position,
        )
        for position, plan in enumerate(plans, start=1)
    ]
    output_names = tuple(
        f"precedent-search-{position:04d}"
        for position, result in enumerate(results, start=1)
        if result.artifact_id is not None
    )
    review = any(
        item.provider_status not in {"completed", "completed_zero_hits"}
        or item.binding_status != "bound"
        for item in results
    )
    entry = _commit_json(
        context,
        node_id="search-precedents-per-step",
        logical_name="step-search-results",
        filename="step-search-results.json",
        value={
            "schema_version": "1.0.0",
            "workflow": "route-step-search-results",
            "strategy_fingerprint": plan_document["strategy_fingerprint"],
            "results": [item.as_json() for item in results],
        },
        parameters={"result_count": len(results)},
        upstream_names=("step-search-plan", *output_names),
        domain_state="review_required" if review else "completed",
    )
    return CTX.NodeOutcome(
        "search-precedents-per-step",
        "succeeded_with_review" if review else "succeeded",
        entry["domain_state"],
        (entry["artifact_id"],),
    )


def assemble_step_artifacts(domain: Any, context: Any) -> Any:
    results_document = _document(context, "step-search-results")
    bindings_document = _document(context, "curation-bindings")
    curated = _document(context, "curated-reactions")
    results = [domain.StepSearchResult(**item) for item in results_document["results"]]
    bindings = {
        (item["route_id"], item["step_id"]): item
        for item in bindings_document["bindings"]
    }
    by_artifact_id = {item["artifact_id"]: item for item in context.artifacts.values()}
    step_artifacts = []
    for result in results:
        binding = bindings[(result.route_id, result.step_id)]
        precedent_entry = by_artifact_id.get(result.artifact_id)
        precedent = (
            CTX.read_json(context.run_dir / precedent_entry["relative_path"])
            if precedent_entry is not None
            else None
        )
        step_artifacts.append(
            {
                "route_id": result.route_id,
                "step_id": result.step_id,
                "step_reaction_hash": result.step_reaction_hash,
                "curation_record_id": binding["curation_record_id"],
                "curation_artifact": (
                    curated if binding["binding_status"] == "bound" else None
                ),
                "precedent_artifact": precedent,
            }
        )
    route_bindings = domain.assemble_step_artifacts(results)
    review = any(item["binding_status"] == "blocked" for item in route_bindings)
    entry = _commit_json(
        context,
        node_id="assemble-step-artifacts",
        logical_name="assembled-step-artifacts",
        filename="assembled-step-artifacts.json",
        value={
            "schema_version": "1.0.0",
            "workflow": "route-step-artifacts",
            "route_bindings": route_bindings,
            "step_artifacts": step_artifacts,
        },
        parameters={"step_artifact_count": len(step_artifacts)},
        upstream_names=(
            "step-search-results",
            "curation-bindings",
            "curated-reactions",
        ),
        domain_state="review_required" if review else "completed",
    )
    return CTX.NodeOutcome(
        "assemble-step-artifacts",
        "succeeded_with_review" if review else "succeeded",
        entry["domain_state"],
        (entry["artifact_id"],),
    )
