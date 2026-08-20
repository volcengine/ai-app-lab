"""Workflow B request, input staging, discovery, and binding facade."""

from __future__ import annotations

import hashlib
import importlib.util
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Callable


def _load_local_module(filename: str, module_name: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


CONTRACTS = _load_local_module(
    "workflow_contracts.py",
    "workflow_b_contracts",
)
REQUEST = _load_local_module(
    "workflow_b_request.py",
    "workflow_b_request_contract",
)
REGISTRY = _load_local_module(
    "artifact_registry.py",
    "workflow_b_registry",
)
ADAPTERS = _load_local_module(
    "skill_adapters.py",
    "workflow_b_adapters",
)
SEARCH = _load_local_module(
    "workflow_b_search.py",
    "workflow_b_search",
)


class WorkflowBError(ValueError):
    """Raised when Workflow B cannot execute safely."""


@dataclass(frozen=True)
class RouteStep:
    route_id: str
    step_id: str
    step_reaction_hash: str
    canonical_reaction: str

    def as_json(self) -> dict[str, str]:
        return asdict(self)


@dataclass(frozen=True)
class CurationBinding:
    route_id: str
    step_id: str
    step_reaction_hash: str
    binding_status: str
    curation_record_id: str | None
    original_record_hash: str | None

    def as_json(self) -> dict[str, Any]:
        return asdict(self)


StepSearchPlan = SEARCH.StepSearchPlan
StepSearchResult = SEARCH.StepSearchResult
expand_search_plan = SEARCH.expand_search_plan
assemble_step_artifacts = SEARCH.assemble_step_artifacts


def validate_workflow_b_request(value: Any) -> dict[str, Any]:
    try:
        return REQUEST.validate_workflow_b_request(value)
    except REQUEST.WorkflowBRequestError as error:
        raise WorkflowBError(str(error)) from error


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _verified_source(
    request_base: Path,
    reference: dict[str, str],
) -> Path:
    try:
        source = CONTRACTS.resolve_declared_input(
            request_base,
            reference["path"],
        )
        if source.stat().st_nlink != 1:
            raise CONTRACTS.ContractError("input path: hardlink is forbidden")
        if _sha256_file(source) != reference["sha256"]:
            raise CONTRACTS.ContractError("input file SHA-256 mismatch")
        CONTRACTS.read_json_object(source, "Workflow B declared input")
    except (OSError, CONTRACTS.ContractError) as error:
        raise WorkflowBError(str(error)) from error
    return source


def _stage_one(
    *,
    request_base: Path,
    run_dir: Path,
    reference: dict[str, str],
    relative_path: str,
) -> Path:
    source = _verified_source(request_base, reference)
    target = run_dir / relative_path
    REGISTRY.atomic_write_bytes(target, source.read_bytes())
    return target


def validate_declared_inputs(
    request: dict[str, Any],
    request_base: Path,
) -> None:
    inputs = request["inputs"]
    references = [
        inputs["reaction_input"],
        inputs["route_input"],
        *inputs["standardization_artifacts"],
    ]
    if inputs["inventory_snapshot"] is not None:
        references.append(inputs["inventory_snapshot"])
    for reference in references:
        _verified_source(request_base, reference)
    standardization = inputs["standardization_artifacts"]
    if standardization:
        reaction_path = _verified_source(
            request_base,
            inputs["reaction_input"],
        )
        reaction = CONTRACTS.read_json_object(
            reaction_path,
            "Workflow B reaction input",
        )
        upstream = reaction.get("upstream_artifacts")
        if not isinstance(upstream, list) or len(upstream) != len(standardization):
            raise WorkflowBError(
                "declared standardization Artifacts do not match reaction input"
            )
        adapter = ADAPTERS.ADAPTERS["standardize-chemical-structures-v1"]
        repository_root = Path(__file__).resolve().parents[2]
        for index, reference in enumerate(standardization):
            source = _verified_source(request_base, reference)
            document = CONTRACTS.read_json_object(
                source,
                f"standardization Artifact {index + 1}",
            )
            if document != upstream[index]:
                raise WorkflowBError(
                    "declared standardization Artifact does not match reaction input"
                )
            try:
                ADAPTERS.run_validator(
                    adapter,
                    source,
                    repository_root=repository_root,
                    timeout_seconds=180,
                )
            except ADAPTERS.AdapterError as error:
                raise WorkflowBError(
                    f"standardization Artifact validation failed: {error}"
                ) from error


def stage_declared_inputs(
    request: dict[str, Any],
    request_base: Path,
    run_dir: Path,
) -> dict[str, Path]:
    inputs = request["inputs"]
    staged = {
        "reaction_input": _stage_one(
            request_base=request_base,
            run_dir=run_dir,
            reference=inputs["reaction_input"],
            relative_path="inputs/reactions.json",
        ),
        "route_input": _stage_one(
            request_base=request_base,
            run_dir=run_dir,
            reference=inputs["route_input"],
            relative_path="inputs/routes.json",
        ),
    }
    for index, reference in enumerate(
        inputs["standardization_artifacts"],
        start=1,
    ):
        staged[f"standardization_{index:04d}"] = _stage_one(
            request_base=request_base,
            run_dir=run_dir,
            reference=reference,
            relative_path=f"inputs/standardization-{index:04d}.json",
        )
    if inputs["inventory_snapshot"] is not None:
        staged["inventory_snapshot"] = _stage_one(
            request_base=request_base,
            run_dir=run_dir,
            reference=inputs["inventory_snapshot"],
            relative_path="inputs/inventory.json",
        )
    return staged


def staged_input_paths(
    request: dict[str, Any],
    run_dir: Path,
) -> dict[str, Path]:
    paths = {
        "reaction_input": run_dir / "inputs/reactions.json",
        "route_input": run_dir / "inputs/routes.json",
    }
    for index, _ in enumerate(
        request["inputs"]["standardization_artifacts"],
        start=1,
    ):
        paths[f"standardization_{index:04d}"] = (
            run_dir / f"inputs/standardization-{index:04d}.json"
        )
    if request["inputs"]["inventory_snapshot"] is not None:
        paths["inventory_snapshot"] = run_dir / "inputs/inventory.json"
    return paths


def discover_route_steps(document: dict[str, Any]) -> list[RouteStep]:
    summaries = document.get("route_summaries")
    if not isinstance(summaries, list) or not summaries:
        raise WorkflowBError("route discovery has no route summaries")
    output: list[RouteStep] = []
    seen: set[tuple[str, str]] = set()
    for route in summaries:
        if not isinstance(route, dict):
            raise WorkflowBError("route discovery summary is invalid")
        route_id = route.get("route_id")
        reviews = route.get("step_reviews")
        if not isinstance(route_id, str) or not isinstance(reviews, list):
            raise WorkflowBError("route discovery route binding is invalid")
        for item in reviews:
            if not isinstance(item, dict):
                raise WorkflowBError("route discovery step is invalid")
            step_id = item.get("step_id")
            reaction_hash = item.get("step_reaction_hash")
            canonical = item.get("canonical_reaction")
            if (
                not isinstance(step_id, str)
                or not isinstance(canonical, str)
                or not canonical
            ):
                raise WorkflowBError("route discovery step fields are invalid")
            try:
                CONTRACTS.require_sha256(
                    reaction_hash,
                    "step_reaction_hash",
                )
            except CONTRACTS.ContractError as error:
                raise WorkflowBError(str(error)) from error
            key = (route_id, step_id)
            if key in seen:
                raise WorkflowBError("route discovery has duplicate steps")
            seen.add(key)
            output.append(
                RouteStep(
                    route_id=route_id,
                    step_id=step_id,
                    step_reaction_hash=reaction_hash,
                    canonical_reaction=canonical,
                )
            )
    return sorted(output, key=lambda item: (item.route_id, item.step_id))


def _curation_matches(
    step: RouteStep,
    curated: dict[str, Any],
) -> list[dict[str, Any]]:
    return [
        item
        for item in curated.get("records", [])
        if isinstance(item, dict)
        and isinstance(item.get("reaction_smiles"), dict)
        and item["reaction_smiles"].get("canonical_unmapped") == step.canonical_reaction
    ]


def bind_curation_records(
    steps: list[RouteStep],
    curated: dict[str, Any],
) -> list[CurationBinding]:
    output = []
    for step in sorted(steps, key=lambda item: (item.route_id, item.step_id)):
        matches = _curation_matches(step, curated)
        record = matches[0] if len(matches) == 1 else None
        output.append(
            CurationBinding(
                route_id=step.route_id,
                step_id=step.step_id,
                step_reaction_hash=step.step_reaction_hash,
                binding_status=(
                    "bound"
                    if record is not None
                    else ("missing" if not matches else "ambiguous")
                ),
                curation_record_id=(
                    record.get("record_id") if record is not None else None
                ),
                original_record_hash=(
                    record.get("original_record_hash") if record is not None else None
                ),
            )
        )
    return output


RUNTIME = _load_local_module(
    "workflow_b_runtime.py",
    "workflow_b_runtime",
)


def run_workflow_b(
    *,
    run_dir: Path,
    repository_root: Path,
    request: dict[str, Any],
    definition: dict[str, Any],
    run_id: str,
    executor: Callable[..., Any] | None,
    after_node: Callable[[str], None] | None,
) -> dict[str, Any]:
    return RUNTIME.run_workflow_b(
        domain=sys.modules[__name__],
        run_dir=run_dir,
        repository_root=repository_root,
        request=request,
        definition=definition,
        run_id=run_id,
        executor=executor,
        after_node=after_node,
    )
