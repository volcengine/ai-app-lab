"""Shared JSON Artifact operations for Workflow B nodes."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Any


def _load_context() -> Any:
    path = Path(__file__).with_name("workflow_a_context.py")
    spec = importlib.util.spec_from_file_location(
        "workflow_b_node_support_context",
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load workflow_a_context.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


CTX = _load_context()


def document(context: Any, logical_name: str) -> dict[str, Any]:
    entry = context.artifacts[logical_name]
    return CTX.read_json(context.run_dir / entry["relative_path"])


def commit_json(
    context: Any,
    *,
    node_id: str,
    logical_name: str,
    filename: str,
    value: dict[str, Any],
    parameters: dict[str, Any],
    upstream_names: tuple[str, ...],
    domain_state: str,
) -> dict[str, Any]:
    path = CTX.attempt_dir(context, node_id) / filename
    CTX.write_json(path, value)
    execution_key = CTX.execution_key(
        context,
        node_id,
        parameters,
        upstream_names,
    )
    return CTX.commit(
        context,
        node_id=node_id,
        logical_name=logical_name,
        path=path,
        media_type="application/json",
        execution_key_value=execution_key,
        validation_artifact_id=None,
        domain_state=domain_state,
    )
