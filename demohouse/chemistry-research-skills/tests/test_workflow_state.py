from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest


SCRIPTS_ROOT = Path(__file__).resolve().parents[1] / "workflows" / "scripts"


def load_module(name: str, filename: str):
    path = SCRIPTS_ROOT / filename
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


STATE = load_module("workflow_state_test", "workflow_state.py")


def test_illegal_node_transition_is_rejected():
    with pytest.raises(STATE.StateTransitionError):
        STATE.transition_node("pending", "node_succeeded")


def test_node_and_run_follow_legal_transitions():
    assert (
        STATE.transition_node(
            "pending",
            "dependencies_satisfied",
        )
        == "ready"
    )
    assert STATE.transition_node("ready", "node_started") == "running"
    assert STATE.transition_run("created", "run_started") == "running"
    assert STATE.transition_run("running", "run_completed") == "completed"


def test_integrity_failure_is_terminal():
    assert STATE.transition_node("running", "integrity_failed") == ("failed_integrity")
    assert STATE.transition_run("completed", "integrity_failed") == "failed_integrity"
    assert STATE.transition_node("blocked", "integrity_failed") == "failed_integrity"
    with pytest.raises(STATE.StateTransitionError, match="terminal"):
        STATE.transition_node("failed_integrity", "node_started")


def test_manifest_replay_rejects_node_outside_definition():
    definition = {
        "definition_fingerprint": "a" * 64,
        "nodes": [{"node_id": "known-node"}],
    }
    events = [
        {
            "event_type": "run_created",
            "run_id": "run-20260817T120000Z-abcdef123456-a1b2c3d4",
            "payload": {
                "workflow_id": "compound-evidence-v1",
                "request_fingerprint": "b" * 64,
                "definition_fingerprint": "a" * 64,
            },
        },
        {"event_type": "run_started"},
        {
            "event_type": "node_ready",
            "node_id": "unknown-node",
        },
    ]

    with pytest.raises(STATE.StateTransitionError, match="unknown node"):
        STATE.rebuild_run_manifest(events, definition)
