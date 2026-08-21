"""Stable per-step search planning and route-local result assembly."""

from __future__ import annotations

import importlib.util
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Sequence


def _load_contracts() -> Any:
    path = Path(__file__).with_name("workflow_contracts.py")
    spec = importlib.util.spec_from_file_location(
        "workflow_b_search_contracts",
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load workflow_contracts.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


CONTRACTS = _load_contracts()


class WorkflowBSearchError(ValueError):
    """Raised when a per-step search plan cannot be built safely."""


@dataclass(frozen=True)
class StepSearchPlan:
    route_id: str
    step_id: str
    step_reaction_hash: str
    query: dict[str, Any]
    strategy_fingerprint: str

    def as_json(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class StepSearchResult:
    route_id: str
    step_id: str
    step_reaction_hash: str
    provider_status: str
    artifact_id: str | None
    binding_status: str

    def as_json(self) -> dict[str, Any]:
        return asdict(self)


def _binding_index(
    bindings: Sequence[Any] | None,
) -> dict[tuple[str, str], Any]:
    output: dict[tuple[str, str], Any] = {}
    for item in bindings or ():
        route_id = getattr(item, "route_id", None)
        step_id = getattr(item, "step_id", None)
        key = (route_id, step_id)
        if not all(isinstance(value, str) and value for value in key):
            raise WorkflowBSearchError("curation binding key is invalid")
        if key in output:
            raise WorkflowBSearchError("curation binding key is duplicated")
        output[key] = item
    return output


def _reaction_parts(value: str) -> tuple[list[str], list[str]]:
    if value.count(">>") == 1:
        left, right = value.split(">>")
    else:
        parts = value.split(">")
        if len(parts) != 3:
            raise WorkflowBSearchError("canonical reaction is invalid")
        left, _, right = parts
    inputs = [item for item in left.split(".") if item]
    outputs = [item for item in right.split(".") if item]
    if not inputs or not outputs:
        raise WorkflowBSearchError("canonical reaction has empty reaction side")
    return inputs, outputs


def _operation_query(
    step: Any,
    operation: str,
    curation_record_id: str | None,
) -> dict[str, Any]:
    if operation == "lookup_reaction":
        return {"reaction_id": curation_record_id}
    if operation == "search_transformations":
        return {"reaction_smarts": step.canonical_reaction}
    if operation == "search_similar_reactions":
        return {
            "reaction_smiles": step.canonical_reaction,
            "reaction_record_id": curation_record_id,
        }
    if operation == "search_components":
        inputs, outputs = _reaction_parts(step.canonical_reaction)
        predicates = [
            {
                "target": target,
                "mode": "exact",
                "pattern": structure,
                "threshold": None,
            }
            for target, structures in (("input", inputs), ("output", outputs))
            for structure in structures
        ]
        return {"component_predicates": predicates}
    raise WorkflowBSearchError(f"unsupported search operation: {operation}")


def expand_search_plan(
    *,
    steps: Sequence[Any],
    strategy: dict[str, Any],
    bindings: Sequence[Any] | None = None,
    curation_artifact_fingerprint: str | None = None,
) -> list[StepSearchPlan]:
    operation = strategy.get("operation")
    if not isinstance(operation, str):
        raise WorkflowBSearchError("search strategy operation is invalid")
    strategy_fingerprint = CONTRACTS.sha256_json(strategy)
    by_step = _binding_index(bindings)
    output = []
    for step in sorted(steps, key=lambda item: (item.route_id, item.step_id)):
        binding = by_step.get((step.route_id, step.step_id))
        binding_status = getattr(binding, "binding_status", "not_provided")
        record_id = getattr(binding, "curation_record_id", None)
        output.append(
            StepSearchPlan(
                route_id=step.route_id,
                step_id=step.step_id,
                step_reaction_hash=step.step_reaction_hash,
                query={
                    "route_id": step.route_id,
                    "step_id": step.step_id,
                    "step_reaction_hash": step.step_reaction_hash,
                    "strategy_fingerprint": strategy_fingerprint,
                    "curation_artifact_fingerprint": (curation_artifact_fingerprint),
                    "curation_record_id": record_id,
                    "curation_binding_status": binding_status,
                    "search_query": _operation_query(
                        step,
                        operation,
                        record_id,
                    ),
                },
                strategy_fingerprint=strategy_fingerprint,
            )
        )
    return output


def assemble_step_artifacts(
    results: Sequence[StepSearchResult],
) -> list[dict[str, Any]]:
    by_route: dict[str, list[StepSearchResult]] = {}
    for item in sorted(results, key=lambda value: (value.route_id, value.step_id)):
        by_route.setdefault(item.route_id, []).append(item)
    return [
        {
            "route_id": route_id,
            "binding_status": (
                "bound"
                if all(item.binding_status == "bound" for item in route_results)
                else "blocked"
            ),
            "step_results": [item.as_json() for item in route_results],
        }
        for route_id, route_results in sorted(by_route.items())
    ]
