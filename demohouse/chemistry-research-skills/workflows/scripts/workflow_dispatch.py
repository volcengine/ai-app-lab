"""Dispatch built-in workflow requests without exposing arbitrary handlers."""

from __future__ import annotations

import importlib.util
import sys
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


WORKFLOW_A = _load_local_module(
    "workflow_a.py",
    "workflow_dispatch_a",
)
WORKFLOW_B = _load_local_module(
    "workflow_b.py",
    "workflow_dispatch_b",
)


class WorkflowDispatchError(ValueError):
    """Raised when a built-in workflow cannot be dispatched safely."""


def validate_request(request: dict[str, Any]) -> dict[str, Any]:
    try:
        if request["workflow_id"] == "compound-evidence-v1":
            return WORKFLOW_A.validate_workflow_a_request(request)
        if request["workflow_id"] == "route-evidence-review-v1":
            return WORKFLOW_B.validate_workflow_b_request(request)
    except (
        WORKFLOW_A.WorkflowAError,
        WORKFLOW_B.WorkflowBError,
    ) as error:
        raise WorkflowDispatchError(str(error)) from error
    raise WorkflowDispatchError("workflow_id is not dispatchable")


def stage_inputs(
    request: dict[str, Any],
    request_base: Path,
    run_dir: Path,
) -> None:
    if request["workflow_id"] != "route-evidence-review-v1":
        return
    try:
        WORKFLOW_B.stage_declared_inputs(
            request,
            request_base,
            run_dir,
        )
    except WORKFLOW_B.WorkflowBError as error:
        raise WorkflowDispatchError(str(error)) from error


def validate_declared_inputs(
    request: dict[str, Any],
    request_base: Path,
) -> None:
    if request["workflow_id"] != "route-evidence-review-v1":
        return
    try:
        WORKFLOW_B.validate_declared_inputs(request, request_base)
    except WORKFLOW_B.WorkflowBError as error:
        raise WorkflowDispatchError(str(error)) from error


def run_workflow(
    *,
    run_dir: Path,
    repository_root: Path,
    request: dict[str, Any],
    definition: dict[str, Any],
    run_id: str,
    executor: Callable[..., Any] | None,
    after_node: Callable[[str], None] | None,
) -> dict[str, Any]:
    workflow = (
        WORKFLOW_A.run_workflow_a
        if request["workflow_id"] == "compound-evidence-v1"
        else WORKFLOW_B.run_workflow_b
    )
    try:
        return workflow(
            run_dir=run_dir,
            repository_root=repository_root,
            request=request,
            definition=definition,
            run_id=run_id,
            executor=executor,
            after_node=after_node,
        )
    except (
        WORKFLOW_A.WorkflowAError,
        WORKFLOW_B.WorkflowBError,
        WORKFLOW_B.RUNTIME.WorkflowBRuntimeError,
    ) as error:
        raise WorkflowDispatchError(str(error)) from error
