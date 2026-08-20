"""Authorize and dispatch one registered Router target."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Any


class RouterExecutionError(ValueError):
    """Raised before an unauthorized or unsafe target can execute."""


def _load_sibling(name: str, filename: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


REQUESTS = _load_sibling("router_target_requests", "request_contracts.py")
DECISIONS = _load_sibling("router_target_decisions", "decision_contracts.py")
CONFIRMATIONS = _load_sibling(
    "router_target_confirmations",
    "confirmation_contract.py",
)
CHAIN = _load_sibling("router_target_chain", "chain_runner.py")
DIRECT = _load_sibling("router_target_direct", "direct_runner.py")
STAGING = _load_sibling("router_target_staging", "target_staging.py")
WORKFLOW = DIRECT._load_module(
    "router_target_workflow",
    DIRECT.WORKFLOW_SCRIPTS / "workflow_runner.py",
)


def _write_workflow_request(
    run_dir: Path,
    execution_request: dict[str, Any],
    request_base: Path | None,
) -> Path:
    CHAIN.NODES.create_run_directory(run_dir)
    STAGING.stage_inputs(
        execution_request,
        request_base,
        run_dir,
        DIRECT.REGISTRY.atomic_write_bytes,
    )
    path = run_dir / "target-request.json"
    DIRECT.REGISTRY.atomic_write_bytes(
        path,
        (
            DIRECT.CONTRACTS.canonical_json(
                execution_request["target_request"],
            )
            + "\n"
        ).encode("utf-8"),
    )
    return path


def _validated_inputs(
    request: dict[str, Any],
    run_dir: Path,
    decision: dict[str, Any] | None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    if run_dir.exists() or run_dir.is_symlink():
        raise RouterExecutionError("run directory already exists")
    try:
        validated = REQUESTS.validate_execution_request(request)
    except REQUESTS.RequestContractError as error:
        raise RouterExecutionError(str(error)) from error
    if decision is None:
        raise RouterExecutionError("an authorized route decision is required")
    try:
        validated_decision = DECISIONS.validate_route_decision(decision)
    except DECISIONS.DecisionContractError as error:
        raise RouterExecutionError(str(error)) from error
    if (
        validated["decision_id"] != validated_decision["decision_id"]
        or validated["decision_fingerprint"]
        != validated_decision["decision_fingerprint"]
        or validated["target_id"] not in validated_decision["targets"]
    ):
        raise RouterExecutionError("request and decision binding mismatch")
    return validated, validated_decision


def _authorize(
    request: dict[str, Any],
    decision: dict[str, Any],
    confirmation: dict[str, Any] | None,
) -> dict[str, Any] | None:
    reasons = request["risk_reasons"]
    if not reasons:
        if (
            decision["execution_mode"] != "auto_execute"
            or decision["execution_authorized"] is not True
        ):
            raise RouterExecutionError("RouteDecision does not authorize execution")
        return None
    if decision["execution_mode"] == "manual_target_required":
        raise RouterExecutionError("manual target mode is not executable")
    if decision["execution_mode"] != "confirmation_required" or set(reasons) != set(
        decision["confirmation_reasons"]
    ):
        raise RouterExecutionError("request risk reasons do not match decision reasons")
    if confirmation is None:
        raise RouterExecutionError("route confirmation is required")
    try:
        return CONFIRMATIONS.validate_route_confirmation(
            confirmation,
            decision,
            request,
        )
    except CONFIRMATIONS.ConfirmationContractError as error:
        raise RouterExecutionError(str(error)) from error


def _dispatch(
    request: dict[str, Any],
    run_dir: Path,
    repository_root: Path,
    request_base: Path | None,
) -> Any:
    target_type = request["target_type"]
    try:
        if target_type == "direct_skill_chain":
            return CHAIN.start_chain(
                request["target_request"],
                run_dir,
                repository_root,
            )
        if target_type == "direct_skill":
            return DIRECT.start_direct(
                request["target_request"],
                run_dir,
                repository_root,
                execution_request=request,
                request_base=request_base,
            )
        if target_type in {"workflow_a", "workflow_b"}:
            request_path = _write_workflow_request(
                run_dir,
                request,
                request_base,
            )
            return WORKFLOW.start_run(
                request_path,
                run_dir / "workflow-run",
                repository_root,
            )
    except (
        CHAIN.ChainRunnerError,
        DIRECT.DirectRunnerError,
        WORKFLOW.RunnerError,
        STAGING.TargetStagingError,
        CHAIN.NODES.ChainNodeError,
    ) as error:
        raise RouterExecutionError(str(error)) from error
    raise RouterExecutionError("target dispatch is not implemented")


def _persist_router_artifacts(
    artifact_dir: Path,
    request: dict[str, Any],
    decision: dict[str, Any],
    confirmation: dict[str, Any] | None,
) -> None:
    values = {
        "route_decision.json": decision,
        "router_execution_request.json": request,
    }
    if confirmation is not None:
        values["route_confirmation.json"] = confirmation
    for filename, value in values.items():
        DIRECT.REGISTRY.atomic_write_bytes(
            artifact_dir / filename,
            (DIRECT.CONTRACTS.canonical_json(value) + "\n").encode("utf-8"),
        )


def run_target(
    request: dict[str, Any],
    run_dir: Path,
    repository_root: Path,
    confirmation: dict[str, Any] | None = None,
    *,
    decision: dict[str, Any] | None = None,
    request_base: Path | None = None,
) -> Any:
    """Stop unauthorized requests before creating files or opening sockets."""
    validated, validated_decision = _validated_inputs(
        request,
        run_dir,
        decision,
    )
    validated_confirmation = _authorize(
        validated,
        validated_decision,
        confirmation,
    )
    result = _dispatch(
        validated,
        run_dir,
        repository_root,
        request_base,
    )
    _persist_router_artifacts(
        run_dir,
        validated,
        validated_decision,
        validated_confirmation,
    )
    return result
