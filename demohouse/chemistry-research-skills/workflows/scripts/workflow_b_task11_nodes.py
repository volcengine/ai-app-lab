"""Task 11 node dispatch for Workflow B."""

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


SEARCH = _load_local_module(
    "workflow_b_search_nodes.py",
    "workflow_b_task11_search_nodes",
)
REVIEW = _load_local_module(
    "workflow_b_review_nodes.py",
    "workflow_b_task11_review_nodes",
)


class WorkflowBTask11NodeError(ValueError):
    """Raised when Task 11 receives an unsupported node."""


def execute_task11_node(domain: Any, node_id: str, context: Any) -> Any:
    handlers = {
        "expand-search-plan": SEARCH.expand_search_plan,
        "search-precedents-per-step": SEARCH.search_precedents,
        "assemble-step-artifacts": SEARCH.assemble_step_artifacts,
        "review-routes": REVIEW.review_routes,
        "build-expert-review-package": REVIEW.build_expert_package,
        "validate-workflow": REVIEW.validate_package,
    }
    handler = handlers.get(node_id)
    if handler is None:
        raise WorkflowBTask11NodeError(f"unsupported Task 11 node: {node_id}")
    return handler(domain, context)
