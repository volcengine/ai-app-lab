from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from typing import Any

import pytest

import router_test_support as support
import test_route_engine as route_support


def load_router_module(name: str, filename: str) -> Any:
    return support.load_router_module(name, filename)


def load_workflow_module(name: str, filename: str) -> Any:
    path = support.REPOSITORY_ROOT / "workflows" / "scripts" / filename
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


ADAPTERS = load_workflow_module(
    "router_chain_test_adapters",
    "skill_adapters.py",
)


class CountingExecutor:
    def __init__(self) -> None:
        self.calls: list[str] = []

    def __call__(
        self,
        adapter: Any,
        argv: list[str],
        *,
        repository_root: Path,
        timeout_seconds: float | None,
    ) -> Any:
        self.calls.append(adapter.adapter_id)
        return ADAPTERS.execute_adapter(
            adapter,
            argv,
            repository_root=repository_root,
            timeout_seconds=timeout_seconds,
        )


def operation(
    operation_id: str,
    operation_type: str,
    sequence: int,
) -> dict[str, Any]:
    return {
        "operation_id": operation_id,
        "operation_type": operation_type,
        "sequence": sequence,
    }


def parameter(field_id: str, value: Any) -> dict[str, Any]:
    return {"field_id": field_id, "value": value}


def chain_request(chain_id: str) -> dict[str, Any]:
    structures = [
        {
            "object_id": "ethanol",
            "object_type": "chemical_structure",
            "representation": "CCO",
        }
    ]
    operations = {
        "identity-standardization-v1": [
            operation("operation-001", "resolve_identity", 1),
            operation("operation-002", "standardize_structure", 2),
        ],
        "structure-features-v1": [
            operation("operation-001", "standardize_structure", 1),
            operation("operation-002", "compute_fingerprint", 2),
        ],
        "structure-library-v1": [
            operation("operation-001", "standardize_structure", 1),
            operation("operation-002", "compute_fingerprint", 2),
            operation("operation-003", "curate_library", 3),
        ],
        "reaction-precedent-v1": [
            operation("operation-001", "curate_reaction", 1),
            operation("operation-002", "search_reaction_precedent", 2),
        ],
    }
    objects = structures
    if chain_id == "reaction-precedent-v1":
        objects = [
            {
                "object_id": "reaction-001",
                "object_type": "reaction_record",
                "representation": "CCO>>CC=O",
            }
        ]
    return {
        "schema_version": "1.0.0",
        "request_id": f"chain-request-{chain_id}",
        "target_id": chain_id,
        "inputs": {
            "research_objects": objects,
            "artifacts": [],
            "operations": operations.get(chain_id, []),
        },
        "parameters": [
            parameter("network_mode", "offline"),
            parameter("external_retry", "manual"),
            parameter("standardization_profile", "chembl-pipeline"),
            parameter("calculation_view", "standardized"),
            parameter("reaction_provider", "local_curated_corpus"),
            parameter("reaction_operation", "lookup_reaction"),
            parameter("reaction_top_k", 20),
            parameter("reaction_include_review_required", False),
            parameter("reaction_use_stereochemistry", True),
        ],
        "execution_policy": {
            "network_mode": "offline",
            "external_retry": "manual",
        },
    }


def route_decision(
    intent: dict[str, Any],
    catalog: dict[str, Any],
) -> dict[str, Any]:
    route_support.align_catalog(intent, catalog)
    certificate = route_support.verified_certificate(intent, catalog)
    policy = route_support.load_policy().evaluate_policy(
        intent,
        catalog,
        certificate,
    )
    return route_support.load_engine().route_intent(
        intent,
        catalog,
        policy,
        certificate,
    )


def test_task7_chain_request_is_directly_consumable() -> None:
    definitions = load_router_module(
        "router_chain_definitions_task7",
        "chain_definitions.py",
    )
    builder = load_router_module(
        "router_chain_builder_task7",
        "request_builders.py",
    )
    catalog = route_support.catalog()
    intent = route_support.structure_library_intent()
    decision = route_decision(intent, catalog)

    request = builder.build_chain_request(
        intent,
        decision,
        catalog,
        Path("."),
    )

    assert definitions.validate_chain_request(request) == request
    assert [item["operation_type"] for item in request["inputs"]["operations"]] == [
        "standardize_structure",
        "compute_fingerprint",
        "search_substructure",
    ]


def test_chain_runner_accepts_only_four_built_in_definitions(
    tmp_path: Path,
) -> None:
    runner = load_router_module("router_chain_runner_unknown", "chain_runner.py")
    request = chain_request("unregistered-chain-v1")

    with pytest.raises(runner.ChainRunnerError, match="unsupported"):
        runner.start_chain(
            request,
            tmp_path / "run",
            support.REPOSITORY_ROOT,
        )


def test_chain_request_rejects_command_override() -> None:
    definitions = load_router_module(
        "router_chain_definitions_command",
        "chain_definitions.py",
    )
    request = chain_request("structure-features-v1")
    request["command"] = ["python", "unsafe.py"]

    with pytest.raises(definitions.ChainDefinitionError, match="fields"):
        definitions.validate_chain_request(request)


def test_chain_request_rejects_unconsumed_artifact() -> None:
    definitions = load_router_module(
        "router_chain_definitions_artifact",
        "chain_definitions.py",
    )
    request = chain_request("structure-features-v1")
    request["inputs"]["artifacts"] = [
        {
            "artifact_ref": "input.json",
            "role": "standardization_input",
            "path": "input.json",
            "media_type": "application/json",
            "sha256": "a" * 64,
        }
    ]

    with pytest.raises(definitions.ChainDefinitionError, match="artifacts"):
        definitions.validate_chain_request(request)


def test_chain_request_rejects_wrong_operation_sequence() -> None:
    definitions = load_router_module(
        "router_chain_definitions_operations",
        "chain_definitions.py",
    )
    request = chain_request("structure-features-v1")
    request["inputs"]["operations"] = [
        operation("operation-001", "resolve_identity", 1),
        operation("operation-002", "standardize_structure", 2),
    ]

    with pytest.raises(definitions.ChainDefinitionError, match="operations"):
        definitions.validate_chain_request(request)


def test_chain_request_rejects_wrong_research_object_type() -> None:
    definitions = load_router_module(
        "router_chain_definitions_object_type",
        "chain_definitions.py",
    )
    request = chain_request("reaction-precedent-v1")
    request["inputs"]["research_objects"][0]["object_type"] = "chemical_structure"

    with pytest.raises(definitions.ChainDefinitionError, match="object"):
        definitions.validate_chain_request(request)


def test_chain_rejects_symlinked_run_parent(tmp_path: Path) -> None:
    runner = load_router_module(
        "router_chain_runner_symlink_parent",
        "chain_runner.py",
    )
    real_parent = tmp_path / "real"
    real_parent.mkdir()
    linked_parent = tmp_path / "linked"
    linked_parent.symlink_to(real_parent, target_is_directory=True)

    with pytest.raises(runner.ChainRunnerError, match="symlink"):
        runner.start_chain(
            chain_request("structure-features-v1"),
            linked_parent / "run",
            support.REPOSITORY_ROOT,
        )


@pytest.mark.parametrize(
    ("chain_id", "expected_adapters"),
    [
        (
            "identity-standardization-v1",
            [
                "resolve-chemical-identities-v1",
                "standardize-chemical-structures-v1",
            ],
        ),
        (
            "structure-features-v1",
            [
                "standardize-chemical-structures-v1",
                "compute-molecular-features-v1",
            ],
        ),
        (
            "structure-library-v1",
            [
                "standardize-chemical-structures-v1",
                "compute-molecular-features-v1",
                "search-and-curate-chemical-libraries-v1",
            ],
        ),
        (
            "reaction-precedent-v1",
            [
                "curate-reactions-v1",
                "search-reactions-v1",
            ],
        ),
    ],
)
def test_chain_executes_exact_registered_adapters(
    tmp_path: Path,
    chain_id: str,
    expected_adapters: list[str],
) -> None:
    runner = load_router_module(
        f"router_chain_runner_{chain_id}",
        "chain_runner.py",
    )
    executor = CountingExecutor()

    result = runner.start_chain(
        chain_request(chain_id),
        tmp_path / chain_id,
        support.REPOSITORY_ROOT,
        executor,
    )

    assert result.status in {"completed", "completed_with_review"}
    assert executor.calls == expected_adapters
    report = runner.validate_chain_run(
        result.run_dir,
        support.REPOSITORY_ROOT,
    )
    assert report["valid"] is True, report


def test_chain_validator_detects_committed_artifact_tamper(
    tmp_path: Path,
) -> None:
    runner = load_router_module(
        "router_chain_runner_tamper",
        "chain_runner.py",
    )
    result = runner.start_chain(
        chain_request("structure-features-v1"),
        tmp_path / "run",
        support.REPOSITORY_ROOT,
    )
    index = runner.CONTRACTS.read_json_object(
        result.run_dir / "artifacts" / "index.json",
        "artifact index",
    )
    output = next(
        item
        for item in index["artifacts"]
        if item["logical_name"] == "molecular-features"
    )
    output_path = result.run_dir / output["relative_path"]
    tampered = bytearray(output_path.read_bytes())
    tampered[0] = ord("[")
    output_path.write_bytes(tampered)

    report = runner.validate_chain_run(
        result.run_dir,
        support.REPOSITORY_ROOT,
    )

    assert report["valid"] is False
    assert any("SHA-256" in error for error in report["errors"])


def test_chain_calculation_view_gate_resumes_without_rerunning(
    tmp_path: Path,
) -> None:
    runner = load_router_module(
        "router_chain_runner_human_gate",
        "chain_runner.py",
    )
    request = chain_request("structure-features-v1")
    next(
        item for item in request["parameters"] if item["field_id"] == "calculation_view"
    )["value"] = None
    first_executor = CountingExecutor()

    paused = runner.start_chain(
        request,
        tmp_path / "run",
        support.REPOSITORY_ROOT,
        first_executor,
    )

    assert paused.status == "awaiting_human"
    assert paused.exit_code == 10
    assert first_executor.calls == ["standardize-chemical-structures-v1"]
    events = runner.LEDGER.read_verified_events(
        paused.run_dir / "events.jsonl",
        paused.run_id,
    )
    gate_event = next(
        item for item in reversed(events) if item["event_type"] == "gate_requested"
    )
    gate = runner.CONTRACTS.read_json_object(
        paused.run_dir / gate_event["payload"]["request_path"],
        "gate request",
    )
    decision = {
        "schema_version": "1.0.0",
        "run_id": gate["run_id"],
        "gate_id": gate["gate_id"],
        "gate_type": gate["gate_type"],
        "request_fingerprint": gate["request_fingerprint"],
        "source_artifact_id": gate["source_artifact_id"],
        "source_artifact_sha256": gate["source_artifact_sha256"],
        "actor_type": "user",
        "decided_at_utc": "2026-08-19T12:00:00Z",
        "decisions": [
            {
                "decision": "use_standardized",
                "decision_scope": "workflow_calculation_view",
            }
        ],
        "decision_fingerprint": "",
    }
    decision["decision_fingerprint"] = runner.CONTRACTS.sha256_json(
        {key: value for key, value in decision.items() if key != "decision_fingerprint"}
    )
    decision_path = tmp_path / "view-decision.json"
    decision_path.write_text(
        runner.CONTRACTS.canonical_json(decision) + "\n",
        encoding="utf-8",
    )
    resumed_executor = CountingExecutor()

    resumed = runner.resume_chain(
        paused.run_dir,
        support.REPOSITORY_ROOT,
        decision_path,
        resumed_executor,
    )

    assert resumed.status in {"completed", "completed_with_review"}
    assert resumed_executor.calls == ["compute-molecular-features-v1"]
    assert (
        runner.validate_chain_run(
            resumed.run_dir,
            support.REPOSITORY_ROOT,
        )["valid"]
        is True
    )


@pytest.mark.parametrize(
    ("chain_id", "request_name", "binding_name", "source_name"),
    [
        (
            "structure-library-v1",
            "library-request",
            "library-request-binding",
            "molecular-features",
        ),
        (
            "reaction-precedent-v1",
            "search-request",
            "search-request-binding",
            "curated-reactions",
        ),
    ],
)
def test_chain_handoff_artifact_binds_upstream_id_and_hash(
    tmp_path: Path,
    chain_id: str,
    request_name: str,
    binding_name: str,
    source_name: str,
) -> None:
    runner = load_router_module(
        f"router_chain_runner_handoff_{chain_id}",
        "chain_runner.py",
    )
    result = runner.start_chain(
        chain_request(chain_id),
        tmp_path / chain_id,
        support.REPOSITORY_ROOT,
    )
    artifacts = runner.CONTRACTS.read_json_object(
        result.run_dir / "artifacts" / "index.json",
        "artifact index",
    )["artifacts"]
    by_name = {item["logical_name"]: item for item in artifacts}

    binding = runner.CONTRACTS.read_json_object(
        result.run_dir / by_name[binding_name]["relative_path"],
        "handoff binding",
    )

    assert binding == {
        "schema_version": "1.0.0",
        "request_artifact_id": by_name[request_name]["artifact_id"],
        "request_artifact_sha256": by_name[request_name]["sha256"],
        "upstream_artifact_id": by_name[source_name]["artifact_id"],
        "upstream_artifact_sha256": by_name[source_name]["sha256"],
    }


def test_chain_resume_fails_integrity_without_rerunning(
    tmp_path: Path,
) -> None:
    runner = load_router_module(
        "router_chain_runner_resume_integrity",
        "chain_runner.py",
    )
    completed = runner.start_chain(
        chain_request("structure-features-v1"),
        tmp_path / "run",
        support.REPOSITORY_ROOT,
    )
    artifacts = runner.CONTRACTS.read_json_object(
        completed.run_dir / "artifacts" / "index.json",
        "artifact index",
    )["artifacts"]
    output = next(
        item for item in artifacts if item["logical_name"] == "molecular-features"
    )
    output_path = completed.run_dir / output["relative_path"]
    tampered = bytearray(output_path.read_bytes())
    tampered[0] = ord("[")
    output_path.write_bytes(tampered)
    executor = CountingExecutor()

    resumed = runner.resume_chain(
        completed.run_dir,
        support.REPOSITORY_ROOT,
        executor=executor,
    )

    assert resumed.status == "failed_integrity"
    assert resumed.exit_code == 4
    assert executor.calls == []


def test_chain_validator_rejects_resigned_domain_state_drift(
    tmp_path: Path,
) -> None:
    runner = load_router_module(
        "router_chain_runner_domain_drift",
        "chain_runner.py",
    )
    completed = runner.start_chain(
        chain_request("structure-features-v1"),
        tmp_path / "run",
        support.REPOSITORY_ROOT,
    )
    ledger_path = completed.run_dir / "events.jsonl"
    events = [
        json.loads(line)
        for line in ledger_path.read_text(encoding="utf-8").splitlines()
    ]
    changed = False
    previous_hash = None
    for event in events:
        artifact = event.get("payload", {}).get("artifact")
        if (
            isinstance(artifact, dict)
            and artifact.get("logical_name") == "molecular-features"
        ):
            artifact["domain_state"] = "blocked"
            changed = True
        event["previous_event_hash"] = previous_hash
        event["event_hash"] = runner.LEDGER.event_hash(event)
        previous_hash = event["event_hash"]
    assert changed is True
    ledger_path.write_text(
        "".join(runner.CONTRACTS.canonical_json(item) + "\n" for item in events),
        encoding="utf-8",
    )

    report = runner.validate_chain_run(
        completed.run_dir,
        support.REPOSITORY_ROOT,
    )

    assert report["valid"] is False
    assert any("domain state drift" in error for error in report["errors"])


def test_chain_resume_rejects_concurrent_lock_owner(
    tmp_path: Path,
) -> None:
    runner = load_router_module(
        "router_chain_runner_lock",
        "chain_runner.py",
    )
    completed = runner.start_chain(
        chain_request("structure-features-v1"),
        tmp_path / "run",
        support.REPOSITORY_ROOT,
    )

    with runner.CHAIN_LOCK.acquire_run_lock(completed.run_dir):
        with pytest.raises(runner.ChainRunnerError, match="busy"):
            runner.resume_chain(
                completed.run_dir,
                support.REPOSITORY_ROOT,
            )
