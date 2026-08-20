"""Per-step process and validation event recording for Workflow B."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Any


def _load_ledger() -> Any:
    path = Path(__file__).with_name("event_ledger.py")
    spec = importlib.util.spec_from_file_location(
        "workflow_b_search_events_ledger",
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load event_ledger.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


LEDGER = _load_ledger()


def _payload(plan: Any) -> dict[str, str]:
    return {
        "route_id": plan.route_id,
        "step_id": plan.step_id,
        "step_reaction_hash": plan.step_reaction_hash,
    }


def record_search_failure(context: Any, plan: Any) -> None:
    payload = _payload(plan)
    events = LEDGER.read_verified_events(
        context.run_dir / "events.jsonl",
        context.run_id,
    )
    process_recorded = any(
        item["event_type"] == "process_finished"
        and item["node_id"] == "search-precedents-per-step"
        and all(item["payload"].get(key) == value for key, value in payload.items())
        for item in events
    )
    if not process_recorded:
        context.append_event(
            "process_finished",
            "search-precedents-per-step",
            1,
            {"returncode": -1, **payload},
        )
    context.append_event(
        "validation_finished",
        "search-precedents-per-step",
        1,
        {"valid": False, **payload},
    )
