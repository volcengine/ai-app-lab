"""Independent execution-key reconstruction for Workflow A Artifacts."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Any


def _load_contracts() -> Any:
    path = Path(__file__).with_name("workflow_contracts.py")
    spec = importlib.util.spec_from_file_location(
        "workflow_execution_key_contracts",
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load workflow_contracts.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _load_local_module(filename: str, module_name: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


CONTRACTS = _load_contracts()
EXECUTION = _load_local_module(
    "workflow_execution_key.py",
    "workflow_execution_key_validation_runtime",
)
ADAPTERS = _load_local_module(
    "skill_adapters.py",
    "workflow_execution_key_validation_adapters",
)
SPECS = _load_local_module(
    "workflow_execution_key_specs.py",
    "workflow_execution_key_validation_specs",
)
WORKFLOW_B = _load_local_module(
    "workflow_b_execution_key_validation.py",
    "workflow_b_execution_key_validation",
)


def _node_key(
    repository_root: Path,
    definition_fingerprint: str,
    node_id: str,
    parameters: dict[str, Any],
    upstream: list[dict[str, str]],
) -> str:
    adapter_id = SPECS.NODE_ADAPTERS.get(node_id)
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
        upstream_artifacts=upstream,
    )


def _upstream(
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


def _binding_row_count(
    run_dir: Path,
    by_name: dict[str, dict[str, Any]],
) -> int:
    entry = by_name["standardization-input-binding"]
    value = CONTRACTS.read_json_object(
        run_dir / entry["relative_path"],
        "standardization input binding",
    )
    rows = value.get("rows")
    if not isinstance(rows, list) or not rows:
        raise CONTRACTS.ContractError("standardization binding rows are invalid")
    return len(rows)


def _artifact_document(
    run_dir: Path,
    entry: dict[str, Any],
    label: str,
) -> dict[str, Any]:
    return CONTRACTS.read_json_object(
        run_dir / entry["relative_path"],
        label,
    )


def _identity_keys(
    run_dir: Path,
    repository_root: Path,
    inputs: dict[str, Any],
    fingerprint: str,
    by_name: dict[str, dict[str, Any]],
) -> dict[str, str]:
    keys: dict[str, str] = {}
    if "identity-result" in by_name:
        keys["identity-result"] = _node_key(
            repository_root,
            fingerprint,
            "resolve-identities",
            {"identity": inputs["identity"], "queries": inputs["queries"]},
            [],
        )
    if "identity-human-decision" in by_name:
        decision = _artifact_document(
            run_dir,
            by_name["identity-human-decision"],
            "identity HumanDecision",
        )
        keys["identity-human-decision"] = _node_key(
            repository_root,
            fingerprint,
            "identity-gate",
            {
                "gate_id": decision["gate_id"],
                "decision_fingerprint": decision["decision_fingerprint"],
            },
            _upstream(by_name, ("identity-result",)),
        )
    if "authorized-structure-input" in by_name:
        authorized = _artifact_document(
            run_dir,
            by_name["authorized-structure-input"],
            "authorized structure input",
        )
        decision_id = (
            by_name["identity-human-decision"]["artifact_id"]
            if "identity-human-decision" in by_name
            else None
        )
        upstream = ["identity-result"]
        if decision_id is not None:
            upstream.append("identity-human-decision")
        if any(
            item.get("decision_artifact_id") != decision_id
            for item in authorized.get("structures", [])
            if isinstance(item, dict) and item.get("source_type") != "identity_handoff"
        ):
            raise CONTRACTS.ContractError(
                "authorized structure decision binding is invalid"
            )
        keys["authorized-structure-input"] = _node_key(
            repository_root,
            fingerprint,
            "identity-gate",
            {"decision_artifact_id": decision_id},
            _upstream(by_name, tuple(upstream)),
        )
    return keys


def _standardization_keys(
    run_dir: Path,
    repository_root: Path,
    inputs: dict[str, Any],
    fingerprint: str,
    by_name: dict[str, dict[str, Any]],
) -> dict[str, str]:
    keys: dict[str, str] = {}
    if "standardization-input-binding" in by_name:
        bridge = _node_key(
            repository_root,
            fingerprint,
            "build-standardization-input",
            {"rows": _binding_row_count(run_dir, by_name)},
            _upstream(by_name, ("authorized-structure-input",)),
        )
        keys["standardization-input"] = bridge
        keys["standardization-input-binding"] = bridge
    if "standardized-structures" in by_name:
        keys["standardized-structures"] = _node_key(
            repository_root,
            fingerprint,
            "standardize-structures",
            inputs["standardization"],
            _upstream(
                by_name,
                ("standardization-input", "standardization-input-binding"),
            ),
        )
    return keys


def _feature_keys(
    run_dir: Path,
    repository_root: Path,
    _inputs: dict[str, Any],
    fingerprint: str,
    by_name: dict[str, dict[str, Any]],
) -> dict[str, str]:
    keys: dict[str, str] = {}
    if "calculation-view-human-decision" in by_name:
        decision = _artifact_document(
            run_dir,
            by_name["calculation-view-human-decision"],
            "calculation view HumanDecision",
        )
        keys["calculation-view-human-decision"] = _node_key(
            repository_root,
            fingerprint,
            "calculation-view-gate",
            {
                "gate_id": decision["gate_id"],
                "decision_fingerprint": decision["decision_fingerprint"],
            },
            _upstream(by_name, ("standardized-structures",)),
        )
    if "calculation-view-selection" in by_name:
        selection = _artifact_document(
            run_dir,
            by_name["calculation-view-selection"],
            "calculation view selection",
        )
        upstream = ["standardized-structures"]
        if "calculation-view-human-decision" in by_name:
            upstream.append("calculation-view-human-decision")
        keys["calculation-view-selection"] = _node_key(
            repository_root,
            fingerprint,
            "calculation-view-gate",
            {
                "calculation_view": selection["calculation_view"],
                "decision_artifact_id": selection["decision_artifact_id"],
            },
            _upstream(by_name, tuple(upstream)),
        )
    if "molecular-features" in by_name:
        selection = _artifact_document(
            run_dir,
            by_name["calculation-view-selection"],
            "calculation view selection",
        )
        keys["molecular-features"] = _node_key(
            repository_root,
            fingerprint,
            "compute-features",
            {"calculation_view": selection["calculation_view"]},
            _upstream(
                by_name,
                ("standardized-structures", "calculation-view-selection"),
            ),
        )
    return keys


def _library_keys(
    _run_dir: Path,
    repository_root: Path,
    inputs: dict[str, Any],
    fingerprint: str,
    by_name: dict[str, dict[str, Any]],
) -> dict[str, str]:
    keys: dict[str, str] = {}
    if "library-operation" in by_name:
        keys["library-operation"] = _node_key(
            repository_root,
            fingerprint,
            "optional-library-operation",
            inputs["library_operation"],
            _upstream(by_name, ("molecular-features",)),
        )
    return keys


def _base_keys(
    run_dir: Path,
    repository_root: Path,
    request: dict[str, Any],
    definition: dict[str, Any],
    by_name: dict[str, dict[str, Any]],
) -> dict[str, str]:
    inputs = request["inputs"]
    fingerprint = definition["definition_fingerprint"]
    keys: dict[str, str] = {}
    for builder in (
        _identity_keys,
        _standardization_keys,
        _feature_keys,
        _library_keys,
    ):
        keys.update(
            builder(
                run_dir,
                repository_root,
                inputs,
                fingerprint,
                by_name,
            )
        )
    return keys


def _validation_keys(
    repository_root: Path,
    definition_fingerprint: str,
    by_name: dict[str, dict[str, Any]],
    output_keys: dict[str, str],
) -> dict[str, str]:
    keys: dict[str, str] = {}
    for validation_name, (output_name, _validator) in SPECS.VALIDATORS.items():
        if validation_name not in by_name or output_name not in output_keys:
            continue
        node_id = by_name[validation_name]["producer_node_id"]
        keys[validation_name] = _node_key(
            repository_root,
            definition_fingerprint,
            node_id,
            {
                "artifact_role": "validator_report",
                "output_execution_key": output_keys[output_name],
            },
            _upstream(by_name, SPECS.NODE_UPSTREAM[node_id]),
        )
    return keys


def execution_key_errors(
    run_dir: Path,
    repository_root: Path,
    request: dict[str, Any],
    definition: dict[str, Any],
    artifacts: list[dict[str, Any]],
) -> list[str]:
    logical_names = [item["logical_name"] for item in artifacts]
    if len(logical_names) != len(set(logical_names)):
        return ["duplicate logical Artifact name"]
    by_name = {item["logical_name"]: item for item in artifacts}
    if request["workflow_id"] == "route-evidence-review-v1":
        return WORKFLOW_B.execution_key_errors(
            run_dir,
            repository_root,
            request,
            definition,
            artifacts,
        )
    try:
        expected = _base_keys(
            run_dir,
            repository_root,
            request,
            definition,
            by_name,
        )
        expected.update(
            _validation_keys(
                repository_root,
                definition["definition_fingerprint"],
                by_name,
                expected,
            )
        )
    except (
        KeyError,
        CONTRACTS.ContractError,
        EXECUTION.ExecutionKeyError,
    ) as error:
        return [f"execution key inputs are invalid: {error}"]
    unknown = set(by_name) - set(expected)
    errors = (
        [f"unexpected Workflow A logical Artifacts: {sorted(unknown)}"]
        if unknown
        else []
    )
    errors.extend(
        f"artifact {item['artifact_id']} execution key mismatch"
        for item in artifacts
        if expected.get(item["logical_name"]) != item["execution_key"]
    )
    return errors
