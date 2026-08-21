from __future__ import annotations

import importlib.util
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable


class ChainRunnerError(ValueError):
    """Raised when a bounded chain cannot execute safely."""


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


DEFINITIONS = _load_sibling("router_chain_runtime_definitions", "chain_definitions.py")
NODES = _load_sibling("router_chain_runtime_nodes", "chain_nodes.py")
CHAIN_LOCK = _load_sibling("router_chain_runtime_lock", "chain_lock.py")
VALIDATION = _load_sibling(
    "router_chain_runtime_validation",
    "chain_validation.py",
)
HANDOFFS = NODES.HANDOFFS
CONTRACTS = NODES.CONTRACTS
LEDGER = NODES.LEDGER
REGISTRY = NODES.REGISTRY
STATE = NODES.STATE
CTX = NODES.CTX
validate_chain_run = VALIDATION.validate_chain_run


@dataclass(frozen=True)
class ChainRunResult:
    status: str
    exit_code: int
    run_id: str
    run_dir: Path


def _write_json(path: Path, value: dict[str, Any]) -> None:
    REGISTRY.atomic_write_bytes(
        path,
        (CONTRACTS.canonical_json(value) + "\n").encode("utf-8"),
    )


def _append(
    run_dir: Path,
    run_id: str,
    recorded_at: str,
    event_type: str,
    node_id: str | None,
    attempt: int | None,
    payload: dict[str, Any],
) -> None:
    LEDGER.append_event(
        run_dir / "events.jsonl",
        {
            "schema_version": "1.0.0",
            "run_id": run_id,
            "event_type": event_type,
            "node_id": node_id,
            "attempt": attempt,
            "recorded_at_utc": recorded_at,
            "payload": payload,
        },
    )


def _snapshot(
    run_dir: Path,
    run_id: str,
    definition: dict[str, Any],
) -> dict[str, Any]:
    events = LEDGER.read_verified_events(run_dir / "events.jsonl", run_id)
    manifest = STATE.rebuild_run_manifest(events, definition)
    index = REGISTRY.rebuild_artifact_index(events)
    _write_json(run_dir / "run_manifest.json", manifest)
    _write_json(run_dir / "artifacts" / "index.json", index)
    return manifest


def _terminal_node_event(state: str) -> str:
    return {
        "succeeded": "node_succeeded",
        "succeeded_with_review": "node_review_required",
        "blocked": "node_blocked",
    }[state]


def _bind_gate_to_chain(
    context: Any,
    payload: dict[str, Any],
    chain_request: dict[str, Any],
) -> dict[str, Any]:
    try:
        path = REGISTRY.validate_run_relative_path(
            context.run_dir,
            payload["request_path"],
        )
        gate = CONTRACTS.read_json_object(path, "chain gate request")
    except (KeyError, REGISTRY.ArtifactError, CONTRACTS.ContractError) as error:
        raise ChainRunnerError(f"chain gate request is invalid: {error}") from error
    gate["request_fingerprint"] = CONTRACTS.sha256_json(chain_request)
    _write_json(path, gate)
    return {
        **payload,
        "gate_request_fingerprint": CONTRACTS.sha256_json(gate),
    }


def _run_nodes(
    context: Any,
    chain_request: dict[str, Any],
) -> dict[str, Any]:
    events = LEDGER.read_verified_events(
        context.run_dir / "events.jsonl",
        context.run_id,
    )
    manifest = STATE.rebuild_run_manifest(events, context.definition)
    review = "succeeded_with_review" in manifest["node_states"].values()
    for node in context.definition["nodes"]:
        node_id = node["node_id"]
        current = manifest["node_states"].get(node_id, "pending")
        if current in {"succeeded", "succeeded_with_review", "skipped"}:
            continue
        if current == "awaiting_human":
            return _snapshot(context.run_dir, context.run_id, context.definition)
        if current not in {"pending", "ready"}:
            raise ChainRunnerError(f"chain node cannot resume from {node_id}={current}")
        attempt = (
            sum(
                event["event_type"] == "node_started" and event["node_id"] == node_id
                for event in events
            )
            + 1
        )
        context.attempts[node_id] = attempt
        if current == "pending":
            context.append_event("node_ready", node_id, attempt, {})
        context.append_event("node_started", node_id, attempt, {})
        try:
            outcome = NODES.execute_node(node_id, context, chain_request)
        except Exception as error:
            context.append_event(
                "node_failed_execution",
                node_id,
                attempt,
                {"error_type": type(error).__name__},
            )
            context.append_event("run_failed_execution", None, None, {})
            return _snapshot(context.run_dir, context.run_id, context.definition)
        if outcome.state == "awaiting_human":
            context.append_event(
                "gate_requested",
                node_id,
                attempt,
                _bind_gate_to_chain(
                    context,
                    outcome.event_payload or {},
                    chain_request,
                ),
            )
            return _snapshot(context.run_dir, context.run_id, context.definition)
        context.append_event(
            _terminal_node_event(outcome.state),
            node_id,
            attempt,
            {"domain_state": outcome.domain_state},
        )
        if outcome.state == "blocked":
            context.append_event("run_blocked", None, None, {})
            return _snapshot(context.run_dir, context.run_id, context.definition)
        review = review or outcome.state == "succeeded_with_review"
    context.append_event(
        "run_completed_with_review" if review else "run_completed",
        None,
        None,
        {},
    )
    return _snapshot(context.run_dir, context.run_id, context.definition)


def _workflow_request(chain_request: dict[str, Any]) -> dict[str, Any]:
    if chain_request["target_id"] == "reaction-precedent-v1":
        return {"request_id": chain_request["request_id"]}
    return HANDOFFS.workflow_a_request(chain_request)


def _context(
    *,
    run_dir: Path,
    repository_root: Path,
    chain_request: dict[str, Any],
    definition: dict[str, Any],
    run_id: str,
    executor: Callable[..., Any] | None,
) -> Any:
    recorded_at = NODES.recorded_at()
    events = LEDGER.read_verified_events(run_dir / "events.jsonl", run_id)
    artifacts = REGISTRY.rebuild_artifact_index(events)["artifacts"]
    context = CTX.ExecutionContext(
        run_dir=run_dir,
        repository_root=repository_root,
        request=_workflow_request(chain_request),
        definition=definition,
        run_id=run_id,
        recorded_at_utc=recorded_at,
        append_event=lambda event_type, node_id, attempt, payload: _append(
            run_dir,
            run_id,
            recorded_at,
            event_type,
            node_id,
            attempt,
            payload,
        ),
        executor=executor,
        artifacts={item["logical_name"]: item for item in artifacts},
    )
    return context


def start_chain(
    request: dict[str, Any],
    run_dir: Path,
    repository_root: Path,
    executor: Callable[..., Any] | None = None,
) -> ChainRunResult:
    """Start a new fixed chain in a non-existing run directory."""
    try:
        chain_request = DEFINITIONS.validate_chain_request(request)
        definition = DEFINITIONS.load_chain_definition(
            chain_request["target_id"],
            repository_root,
        )
        _workflow_request(chain_request)
    except (
        DEFINITIONS.ChainDefinitionError,
        HANDOFFS.ChainHandoffError,
    ) as error:
        raise ChainRunnerError(str(error)) from error
    try:
        NODES.create_run_directory(run_dir)
    except NODES.ChainNodeError as error:
        raise ChainRunnerError(str(error)) from error
    request_fingerprint = CONTRACTS.sha256_json(chain_request)
    run_id = NODES.make_run_id(request_fingerprint)
    recorded_at = NODES.recorded_at()
    _write_json(run_dir / "chain_request.json", chain_request)
    _write_json(run_dir / "chain_definition.json", definition)
    _append(
        run_dir,
        run_id,
        recorded_at,
        "run_created",
        None,
        None,
        {
            "workflow_id": chain_request["target_id"],
            "request_fingerprint": request_fingerprint,
            "definition_fingerprint": definition["definition_fingerprint"],
        },
    )
    _append(run_dir, run_id, recorded_at, "run_started", None, None, {})
    context = _context(
        run_dir=run_dir,
        repository_root=repository_root,
        chain_request=chain_request,
        definition=definition,
        run_id=run_id,
        executor=executor,
    )
    NODES.stage_chain_inputs(context, chain_request)
    try:
        with CHAIN_LOCK.acquire_run_lock(run_dir):
            manifest = _run_nodes(context, chain_request)
    except CHAIN_LOCK.ChainLockError as error:
        raise ChainRunnerError(str(error)) from error
    report = validate_chain_run(run_dir, repository_root)
    _write_json(run_dir / "chain_report.json", report)
    status = manifest["run_status"] if report["valid"] else "failed_integrity"
    return ChainRunResult(status, NODES.exit_code(status), run_id, run_dir)


def _resume_chain_unlocked(
    run_dir: Path,
    repository_root: Path,
    decision_path: Path | None = None,
    executor: Callable[..., Any] | None = None,
) -> ChainRunResult:
    """Validate persisted state, resolve an optional gate, and continue."""
    report = validate_chain_run(run_dir, repository_root)
    _write_json(run_dir / "chain_report.json", report)
    if not report["valid"]:
        return ChainRunResult(
            "failed_integrity",
            NODES.exit_code("failed_integrity"),
            report["run_id"],
            run_dir,
        )
    try:
        chain_request = DEFINITIONS.validate_chain_request(
            CONTRACTS.read_json_object(
                run_dir / "chain_request.json",
                "chain request",
            )
        )
        definition = DEFINITIONS.load_chain_definition(
            chain_request["target_id"],
            repository_root,
        )
        run_id = report["run_id"]
        events = LEDGER.read_verified_events(run_dir / "events.jsonl", run_id)
        manifest = STATE.rebuild_run_manifest(events, definition)
        if decision_path is not None:
            if manifest["run_status"] != "awaiting_human":
                raise ChainRunnerError("chain is not awaiting a HumanDecision")
            NODES.GATE_RESUME.resolve_active_gate(
                run_dir=run_dir,
                decision_path=decision_path,
                manifest=manifest,
                repository_root=repository_root,
            )
            manifest = _snapshot(run_dir, run_id, definition)
    except (
        DEFINITIONS.ChainDefinitionError,
        CONTRACTS.ContractError,
        LEDGER.LedgerError,
        STATE.StateTransitionError,
        NODES.GATE_RESUME.GateResumeError,
    ) as error:
        raise ChainRunnerError(str(error)) from error
    if manifest["run_status"] in {
        "awaiting_human",
        "completed",
        "completed_with_review",
        "blocked",
        "failed_execution",
        "failed_integrity",
    }:
        return ChainRunResult(
            manifest["run_status"],
            NODES.exit_code(manifest["run_status"]),
            run_id,
            run_dir,
        )
    context = _context(
        run_dir=run_dir,
        repository_root=repository_root,
        chain_request=chain_request,
        definition=definition,
        run_id=run_id,
        executor=executor,
    )
    manifest = _run_nodes(context, chain_request)
    report = validate_chain_run(run_dir, repository_root)
    _write_json(run_dir / "chain_report.json", report)
    status = manifest["run_status"] if report["valid"] else "failed_integrity"
    return ChainRunResult(status, NODES.exit_code(status), run_id, run_dir)


def resume_chain(
    run_dir: Path,
    repository_root: Path,
    decision_path: Path | None = None,
    executor: Callable[..., Any] | None = None,
) -> ChainRunResult:
    """Resume one chain while holding its non-blocking run lock."""
    try:
        with CHAIN_LOCK.acquire_run_lock(run_dir):
            return _resume_chain_unlocked(
                run_dir,
                repository_root,
                decision_path,
                executor,
            )
    except CHAIN_LOCK.ChainLockError as error:
        raise ChainRunnerError(str(error)) from error
