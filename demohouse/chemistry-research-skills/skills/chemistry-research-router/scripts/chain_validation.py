"""Independent integrity and Adapter validation for bounded-chain runs."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Any


def _load_module(name: str, path: Path) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def _load_sibling(name: str, filename: str) -> Any:
    return _load_module(name, Path(__file__).with_name(filename))


DEFINITIONS = _load_sibling(
    "router_chain_validation_definitions",
    "chain_definitions.py",
)
NODES = _load_sibling("router_chain_validation_nodes", "chain_nodes.py")
CONTRACTS = NODES.CONTRACTS
LEDGER = NODES.LEDGER
REGISTRY = NODES.REGISTRY
STATE = NODES.STATE
ADAPTERS = NODES.ADAPTERS
OUTPUT_ADAPTERS = {
    "identity-result": "resolve-chemical-identities-v1",
    "standardized-structures": "standardize-chemical-structures-v1",
    "molecular-features": "compute-molecular-features-v1",
    "library-operation": "search-and-curate-chemical-libraries-v1",
    "curated-reactions": "curate-reactions-v1",
    "reaction-precedents": "search-reactions-v1",
}


def _artifact_errors(
    run_dir: Path,
    repository_root: Path,
    artifacts: list[dict[str, Any]],
) -> list[str]:
    errors = []
    by_id = {item["artifact_id"]: item for item in artifacts}
    for item in artifacts:
        try:
            path = REGISTRY.verify_artifact(run_dir, item)
            adapter_id = OUTPUT_ADAPTERS.get(item["logical_name"])
            if adapter_id is None:
                continue
            report = ADAPTERS.run_validator(
                ADAPTERS.ADAPTERS[adapter_id],
                path,
                repository_root=repository_root,
                timeout_seconds=180,
            )
            validation = by_id.get(item["validation_artifact_id"])
            if validation is None:
                errors.append(f"{item['artifact_id']}: validation binding missing")
                continue
            saved = CONTRACTS.read_json_object(
                REGISTRY.verify_artifact(run_dir, validation),
                "saved validation report",
            )
            if saved != report:
                errors.append(f"{item['artifact_id']}: validation report drift")
            document = CONTRACTS.read_json_object(path, "Skill Artifact")
            domain_state = ADAPTERS.extract_domain_state(
                ADAPTERS.ADAPTERS[adapter_id],
                document,
            )
            if item["domain_state"] != domain_state:
                errors.append(f"{item['artifact_id']}: domain state drift")
        except (
            ADAPTERS.AdapterError,
            CONTRACTS.ContractError,
            REGISTRY.ArtifactError,
        ) as error:
            errors.append(f"{item['artifact_id']}: {error}")
    return errors


def _adapter_order_errors(
    events: list[dict[str, Any]],
    definition: dict[str, Any],
    run_status: str,
) -> list[str]:
    started = [
        event["node_id"]
        for event in events
        if event["event_type"] == "node_started"
        and event["node_id"] in DEFINITIONS.NODE_ADAPTERS
    ]
    expected = [
        node["node_id"]
        for node in definition["nodes"]
        if node["node_id"] in DEFINITIONS.NODE_ADAPTERS
    ]
    errors = []
    if started != expected[: len(started)]:
        errors.append("adapter node order mismatch")
    if run_status in {"completed", "completed_with_review"} and started != expected:
        errors.append("completed chain adapter cardinality mismatch")
    return errors


def _handoff_errors(
    run_dir: Path,
    artifacts: list[dict[str, Any]],
) -> list[str]:
    by_name = {item["logical_name"]: item for item in artifacts}
    errors = []
    for request_name, binding_name, source_name in (
        (
            "library-request",
            "library-request-binding",
            "molecular-features",
        ),
        ("search-request", "search-request-binding", "curated-reactions"),
    ):
        handoff_present = {
            name for name in (request_name, binding_name) if name in by_name
        }
        if not handoff_present:
            continue
        present = {
            name
            for name in (request_name, binding_name, source_name)
            if name in by_name
        }
        if len(present) != 3:
            errors.append(f"{binding_name}: handoff Artifact set is incomplete")
            continue
        request_entry = by_name[request_name]
        binding_entry = by_name[binding_name]
        source_entry = by_name[source_name]
        try:
            request = CONTRACTS.read_json_object(
                REGISTRY.verify_artifact(run_dir, request_entry),
                request_name,
            )
            binding = CONTRACTS.read_json_object(
                REGISTRY.verify_artifact(run_dir, binding_entry),
                binding_name,
            )
            source = CONTRACTS.read_json_object(
                REGISTRY.verify_artifact(run_dir, source_entry),
                source_name,
            )
        except (CONTRACTS.ContractError, REGISTRY.ArtifactError) as error:
            errors.append(f"{binding_name}: {error}")
            continue
        expected = {
            "schema_version": "1.0.0",
            "request_artifact_id": request_entry["artifact_id"],
            "request_artifact_sha256": request_entry["sha256"],
            "upstream_artifact_id": source_entry["artifact_id"],
            "upstream_artifact_sha256": source_entry["sha256"],
        }
        if binding != expected:
            errors.append(f"{binding_name}: handoff binding mismatch")
        if request_name == "library-request":
            if request.get("library_artifact") != source_entry["relative_path"]:
                errors.append(f"{request_name}: upstream path mismatch")
        elif request.get("corpus_artifact") != source:
            errors.append(f"{request_name}: upstream document mismatch")
    return errors


def validate_chain_run(
    run_dir: Path,
    repository_root: Path,
) -> dict[str, Any]:
    """Rebuild chain state and independently revalidate committed outputs."""
    errors: list[str] = []
    try:
        request = DEFINITIONS.validate_chain_request(
            CONTRACTS.read_json_object(
                run_dir / "chain_request.json",
                "chain request",
            )
        )
        definition = DEFINITIONS.load_chain_definition(
            request["target_id"],
            repository_root,
        )
        stored = CONTRACTS.read_json_object(
            run_dir / "chain_definition.json",
            "stored chain definition",
        )
        if stored != definition:
            errors.append("stored chain definition drift")
        run_id = LEDGER.read_declared_run_id(run_dir / "events.jsonl")
        events = LEDGER.read_verified_events(run_dir / "events.jsonl", run_id)
        manifest = STATE.rebuild_run_manifest(events, definition)
        if manifest["request_fingerprint"] != CONTRACTS.sha256_json(request):
            errors.append("chain request fingerprint mismatch")
        artifacts = REGISTRY.rebuild_artifact_index(events)["artifacts"]
        errors.extend(_artifact_errors(run_dir, repository_root, artifacts))
        errors.extend(_handoff_errors(run_dir, artifacts))
        errors.extend(
            _adapter_order_errors(
                events,
                definition,
                manifest["run_status"],
            )
        )
    except (
        DEFINITIONS.ChainDefinitionError,
        CONTRACTS.ContractError,
        LEDGER.LedgerError,
        STATE.StateTransitionError,
        REGISTRY.ArtifactError,
    ) as error:
        errors.append(str(error))
        manifest = {"run_status": "failed_integrity"}
        run_id = "unknown"
    return {
        "schema_version": "1.0.0",
        "valid": not errors,
        "run_id": run_id,
        "chain_id": request["target_id"] if "request" in locals() else None,
        "run_status": manifest["run_status"],
        "errors": errors,
    }
