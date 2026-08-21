"""Independent execution-key reconstruction for Workflow B Artifacts."""

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


BASE = _load_local_module(
    "workflow_b_key_validation_base.py",
    "workflow_b_key_validation_base",
)
CONTRACTS = BASE.CONTRACTS
_document = BASE.document
_key = BASE.key
_adapter_pair = BASE.adapter_pair


def _search_keys(
    run_dir: Path,
    repository_root: Path,
    fingerprint: str,
    by_name: dict[str, dict[str, Any]],
) -> dict[str, str]:
    keys: dict[str, str] = {}
    plan_document = _document(run_dir, by_name, "step-search-plan")
    keys["step-search-plan"] = _key(
        repository_root,
        fingerprint,
        "expand-search-plan",
        {
            "plan_count": len(plan_document["plans"]),
            "strategy_fingerprint": plan_document["strategy_fingerprint"],
        },
        by_name,
        ("route-steps", "curation-bindings", "curated-reactions"),
    )
    for position, plan in enumerate(plan_document["plans"], start=1):
        request_name = f"precedent-search-request-{position:04d}"
        output_name = f"precedent-search-{position:04d}"
        validation_name = f"precedent-search-validation-{position:04d}"
        if request_name not in by_name:
            continue
        binding = _document(run_dir, by_name, request_name)
        request = binding["search_request"]
        keys[request_name] = _key(
            repository_root,
            fingerprint,
            "search-precedents-per-step",
            {
                "plan": plan,
                "search_request_fingerprint": CONTRACTS.sha256_json(request),
            },
            by_name,
            ("step-search-plan", "curated-reactions"),
        )
        keys.update(
            _adapter_pair(
                repository_root,
                fingerprint,
                by_name,
                node_id="search-precedents-per-step",
                output_name=output_name,
                validation_name=validation_name,
                adapter_id="search-reactions-v1",
                parameters={
                    "plan": plan,
                    "request_artifact_id": by_name[request_name]["artifact_id"],
                },
                upstream_names=(request_name, "curated-reactions"),
            )
        )
    results = _document(run_dir, by_name, "step-search-results")
    output_by_id = {
        item["artifact_id"]: item["logical_name"]
        for item in by_name.values()
        if item["logical_name"].startswith("precedent-search-")
        and not item["logical_name"].startswith(
            ("precedent-search-request-", "precedent-search-validation-")
        )
    }
    output_names = tuple(
        output_by_id[item["artifact_id"]]
        for item in results["results"]
        if item.get("artifact_id") in output_by_id
    )
    keys["step-search-results"] = _key(
        repository_root,
        fingerprint,
        "search-precedents-per-step",
        {"result_count": len(results["results"])},
        by_name,
        ("step-search-plan", *output_names),
    )
    return keys


def _review_keys(
    run_dir: Path,
    repository_root: Path,
    fingerprint: str,
    by_name: dict[str, dict[str, Any]],
) -> dict[str, str]:
    keys: dict[str, str] = {}
    assembled = _document(run_dir, by_name, "assembled-step-artifacts")
    keys["assembled-step-artifacts"] = _key(
        repository_root,
        fingerprint,
        "assemble-step-artifacts",
        {"step_artifact_count": len(assembled["step_artifacts"])},
        by_name,
        ("step-search-results", "curation-bindings", "curated-reactions"),
    )
    request = _document(run_dir, by_name, "route-review-request")
    request_fingerprint = CONTRACTS.sha256_json(request)
    keys["route-review-request"] = _key(
        repository_root,
        fingerprint,
        "review-routes",
        {"request_fingerprint": request_fingerprint},
        by_name,
        ("route-input", "assembled-step-artifacts"),
    )
    keys.update(
        _adapter_pair(
            repository_root,
            fingerprint,
            by_name,
            node_id="review-routes",
            output_name="route-review",
            validation_name="route-review-validation",
            adapter_id="review-routes-v1",
            parameters={
                "request_artifact_id": by_name["route-review-request"]["artifact_id"],
                "request_fingerprint": request_fingerprint,
            },
            upstream_names=("route-review-request", "assembled-step-artifacts"),
        )
    )
    expert = _document(run_dir, by_name, "expert-review-package")
    keys["expert-review-package"] = _key(
        repository_root,
        fingerprint,
        "build-expert-review-package",
        {"route_count": len(expert["routes"])},
        by_name,
        ("route-review",),
    )
    return keys


def expected_keys(
    run_dir: Path,
    repository_root: Path,
    request: dict[str, Any],
    definition: dict[str, Any],
    by_name: dict[str, dict[str, Any]],
) -> dict[str, str]:
    fingerprint = definition["definition_fingerprint"]
    keys = BASE.prepared_keys(
        repository_root,
        fingerprint,
        request["inputs"],
        by_name,
    )
    keys.update(
        BASE.task10_keys(
            run_dir,
            repository_root,
            fingerprint,
            by_name,
        )
    )
    keys.update(
        _search_keys(
            run_dir,
            repository_root,
            fingerprint,
            by_name,
        )
    )
    keys.update(
        _review_keys(
            run_dir,
            repository_root,
            fingerprint,
            by_name,
        )
    )
    return keys


def execution_key_errors(
    run_dir: Path,
    repository_root: Path,
    request: dict[str, Any],
    definition: dict[str, Any],
    artifacts: list[dict[str, Any]],
) -> list[str]:
    by_name = {item["logical_name"]: item for item in artifacts}
    try:
        expected = expected_keys(
            run_dir,
            repository_root,
            request,
            definition,
            by_name,
        )
    except (
        KeyError,
        CONTRACTS.ContractError,
        BASE.EXECUTION.ExecutionKeyError,
    ) as error:
        return [f"Workflow B execution key inputs are invalid: {error}"]
    unknown = set(by_name) - set(expected)
    errors = (
        [f"unexpected Workflow B logical Artifacts: {sorted(unknown)}"]
        if unknown
        else []
    )
    errors.extend(
        f"artifact {item['artifact_id']} execution key mismatch"
        for item in artifacts
        if expected.get(item["logical_name"]) != item["execution_key"]
    )
    return errors
