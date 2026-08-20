"""Shared execution-key reconstruction helpers for Workflow B."""

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


CONTRACTS = _load_local_module(
    "workflow_contracts.py",
    "workflow_b_key_base_contracts",
)
EXECUTION = _load_local_module(
    "workflow_execution_key.py",
    "workflow_b_key_base_execution",
)
ADAPTERS = _load_local_module(
    "skill_adapters.py",
    "workflow_b_key_base_adapters",
)


def document(
    run_dir: Path,
    by_name: dict[str, dict[str, Any]],
    logical_name: str,
) -> dict[str, Any]:
    return CONTRACTS.read_json_object(
        run_dir / by_name[logical_name]["relative_path"],
        logical_name,
    )


def upstream(
    by_name: dict[str, dict[str, Any]],
    names: tuple[str, ...],
) -> list[dict[str, str]]:
    return [
        {
            "artifact_id": by_name[name]["artifact_id"],
            "sha256": by_name[name]["sha256"],
        }
        for name in names
    ]


def key(
    repository_root: Path,
    definition_fingerprint: str,
    node_id: str,
    parameters: dict[str, Any],
    by_name: dict[str, dict[str, Any]],
    upstream_names: tuple[str, ...],
    adapter_id: str | None = None,
) -> str:
    adapter = (
        ADAPTERS.ADAPTERS[adapter_id]
        if adapter_id is not None
        else EXECUTION.internal_adapter(node_id)
    )
    return EXECUTION.compute_repository_execution_key(
        repository_root=repository_root,
        definition_fingerprint=definition_fingerprint,
        node_id=node_id,
        adapter=adapter,
        parameters=parameters,
        upstream_artifacts=upstream(by_name, upstream_names),
    )


def validation_key(
    repository_root: Path,
    definition_fingerprint: str,
    *,
    node_id: str,
    output_key: str,
    by_name: dict[str, dict[str, Any]],
    upstream_names: tuple[str, ...],
    adapter_id: str,
) -> str:
    return key(
        repository_root,
        definition_fingerprint,
        node_id,
        {
            "artifact_role": "validator_report",
            "output_execution_key": output_key,
        },
        by_name,
        upstream_names,
        adapter_id,
    )


def adapter_pair(
    repository_root: Path,
    fingerprint: str,
    by_name: dict[str, dict[str, Any]],
    *,
    node_id: str,
    output_name: str,
    validation_name: str,
    adapter_id: str,
    parameters: dict[str, Any],
    upstream_names: tuple[str, ...],
) -> dict[str, str]:
    if output_name not in by_name:
        return {}
    output_key = key(
        repository_root,
        fingerprint,
        node_id,
        parameters,
        by_name,
        upstream_names,
        adapter_id,
    )
    output = {output_name: output_key}
    if validation_name in by_name:
        output[validation_name] = validation_key(
            repository_root,
            fingerprint,
            node_id=node_id,
            output_key=output_key,
            by_name=by_name,
            upstream_names=upstream_names,
            adapter_id=adapter_id,
        )
    return output


def prepared_keys(
    repository_root: Path,
    fingerprint: str,
    inputs: dict[str, Any],
    by_name: dict[str, dict[str, Any]],
) -> dict[str, str]:
    references = {
        "reaction-input": inputs["reaction_input"],
        "route-input": inputs["route_input"],
    }
    references.update(
        {
            f"standardization-input-{index:04d}": reference
            for index, reference in enumerate(
                inputs["standardization_artifacts"],
                start=1,
            )
        }
    )
    if inputs["inventory_snapshot"] is not None:
        references["inventory-snapshot"] = inputs["inventory_snapshot"]
    return {
        name: key(
            repository_root,
            fingerprint,
            "prepare-reaction-input",
            {"logical_name": name, "reference": reference},
            by_name,
            (),
        )
        for name, reference in references.items()
        if name in by_name
    }


def task10_keys(
    run_dir: Path,
    repository_root: Path,
    fingerprint: str,
    by_name: dict[str, dict[str, Any]],
) -> dict[str, str]:
    keys = adapter_pair(
        repository_root,
        fingerprint,
        by_name,
        node_id="curate-reactions",
        output_name="curated-reactions",
        validation_name="curate-validation",
        adapter_id="curate-reactions-v1",
        parameters={"source_artifact_id": by_name["reaction-input"]["artifact_id"]},
        upstream_names=("reaction-input",),
    )
    keys.update(
        adapter_pair(
            repository_root,
            fingerprint,
            by_name,
            node_id="discover-route-steps",
            output_name="route-discovery",
            validation_name="route-discovery-validation",
            adapter_id="review-routes-v1",
            parameters={"source_artifact_id": by_name["route-input"]["artifact_id"]},
            upstream_names=("route-input",),
        )
    )
    if "route-steps" in by_name:
        value = document(run_dir, by_name, "route-steps")
        keys["route-steps"] = key(
            repository_root,
            fingerprint,
            "discover-route-steps",
            {"step_count": len(value["steps"])},
            by_name,
            ("route-discovery",),
        )
    if "curation-bindings" in by_name:
        value = document(run_dir, by_name, "curation-bindings")
        keys["curation-bindings"] = key(
            repository_root,
            fingerprint,
            "bind-curation-records",
            {"binding_count": len(value["bindings"])},
            by_name,
            ("route-steps", "curated-reactions"),
        )
    return keys
