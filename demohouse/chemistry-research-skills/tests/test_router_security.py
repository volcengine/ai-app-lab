from __future__ import annotations

import copy
import json
import socket
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

import router_test_support as support
import test_route_engine as route_support
import test_router_request_builders as builder_support


def load_module(name: str, filename: str) -> Any:
    return support.load_router_module(name, filename)


def external_request() -> tuple[dict[str, Any], dict[str, Any]]:
    catalog = route_support.catalog()
    intent = route_support.compound_evidence_intent()
    decision = builder_support.route(intent, catalog)
    request = load_module(
        "router_security_builder",
        "request_builders.py",
    ).build_execution_request(
        intent,
        decision,
        catalog,
        Path("."),
    )
    return decision, request


def test_external_target_stops_before_network_without_confirmation(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    target_runner = load_module(
        "router_security_target_runner",
        "target_runner.py",
    )
    decision, request = external_request()
    calls: list[Any] = []
    monkeypatch.setattr(
        socket,
        "create_connection",
        lambda *args, **kwargs: calls.append((args, kwargs)),
    )

    with pytest.raises(
        target_runner.RouterExecutionError,
        match="confirmation",
    ):
        target_runner.run_target(
            request,
            tmp_path / "run",
            support.REPOSITORY_ROOT,
            decision=decision,
            confirmation=None,
        )

    assert calls == []
    assert not (tmp_path / "run").exists()


def test_target_runner_rejects_existing_run_directory(tmp_path: Path) -> None:
    target_runner = load_module(
        "router_security_existing_run",
        "target_runner.py",
    )
    decision, request = external_request()
    run_dir = tmp_path / "run"
    run_dir.mkdir()

    with pytest.raises(target_runner.RouterExecutionError, match="exists"):
        target_runner.run_target(
            request,
            run_dir,
            support.REPOSITORY_ROOT,
            decision=decision,
            confirmation=None,
        )


def test_offline_target_requires_authorized_decision(tmp_path: Path) -> None:
    target_runner = load_module(
        "router_security_decision_gate",
        "target_runner.py",
    )
    catalog = route_support.catalog()
    intent = route_support.standardize_intent()
    decision = builder_support.route(intent, catalog)
    request = load_module(
        "router_security_decision_builder",
        "request_builders.py",
    ).build_execution_request(
        intent,
        decision,
        catalog,
        tmp_path,
    )

    with pytest.raises(target_runner.RouterExecutionError, match="decision"):
        target_runner.run_target(
            request,
            tmp_path / "run",
            support.REPOSITORY_ROOT,
            decision=None,
        )

    assert not (tmp_path / "run").exists()


def route_confirmation(
    decision: dict[str, Any],
    request: dict[str, Any],
) -> dict[str, Any]:
    value = {
        "schema_version": "1.0.0",
        "confirmation_id": "confirmation-security-001",
        "decision_id": decision["decision_id"],
        "decision_fingerprint": decision["decision_fingerprint"],
        "request_fingerprint": request["request_fingerprint"],
        "confirmation_reasons": list(request["risk_reasons"]),
        "actor_type": "user",
        "decided_at_utc": "2026-08-19T12:00:00Z",
        "confirmation_fingerprint": "",
    }
    value["confirmation_fingerprint"] = support.sha256_json(
        value,
        "confirmation_fingerprint",
    )
    return value


def test_confirmation_cannot_upgrade_manual_target_mode(
    tmp_path: Path,
) -> None:
    target_runner = load_module(
        "router_security_manual_confirmation",
        "target_runner.py",
    )
    decision, request = external_request()
    manual = copy.deepcopy(decision)
    manual["execution_mode"] = "manual_target_required"
    manual["confirmation_reasons"] = []
    manual["decision_fingerprint"] = support.sha256_json(
        manual,
        "decision_fingerprint",
    )
    request["decision_fingerprint"] = manual["decision_fingerprint"]
    request["request_fingerprint"] = support.sha256_json(
        request,
        "request_fingerprint",
    )

    with pytest.raises(target_runner.RouterExecutionError, match="manual"):
        target_runner.run_target(
            request,
            tmp_path / "run",
            support.REPOSITORY_ROOT,
            route_confirmation(manual, request),
            decision=manual,
        )

    assert not (tmp_path / "run").exists()


def test_confirmation_reasons_must_match_decision(
    tmp_path: Path,
) -> None:
    target_runner = load_module(
        "router_security_reason_binding",
        "target_runner.py",
    )
    catalog = route_support.catalog()
    intent = route_support.standardize_intent()
    decision = builder_support.route(intent, catalog)
    request = load_module(
        "router_security_reason_builder",
        "request_builders.py",
    ).build_execution_request(
        intent,
        decision,
        catalog,
        tmp_path,
    )
    request["risk_reasons"] = ["fees_possible"]
    request["request_fingerprint"] = support.sha256_json(
        request,
        "request_fingerprint",
    )

    with pytest.raises(target_runner.RouterExecutionError, match="reason"):
        target_runner.run_target(
            request,
            tmp_path / "run",
            support.REPOSITORY_ROOT,
            route_confirmation(decision, request),
            decision=decision,
        )

    assert not (tmp_path / "run").exists()


def test_direct_target_rejects_symlinked_run_parent(
    tmp_path: Path,
) -> None:
    target_runner = load_module(
        "router_security_direct_symlink",
        "target_runner.py",
    )
    catalog = route_support.catalog()
    intent = route_support.standardize_intent()
    decision = builder_support.route(intent, catalog)
    request = load_module(
        "router_security_direct_symlink_builder",
        "request_builders.py",
    ).build_execution_request(
        intent,
        decision,
        catalog,
        tmp_path,
    )
    real_parent = tmp_path / "real"
    real_parent.mkdir()
    linked_parent = tmp_path / "linked"
    linked_parent.symlink_to(real_parent, target_is_directory=True)

    with pytest.raises(target_runner.RouterExecutionError, match="symlink"):
        target_runner.run_target(
            request,
            linked_parent / "run",
            support.REPOSITORY_ROOT,
            decision=decision,
        )

    assert not (real_parent / "run").exists()


def test_execute_cli_returns_twelve_before_unconfirmed_risk(
    tmp_path: Path,
) -> None:
    decision, request = external_request()
    decision_path = tmp_path / "decision.json"
    request_path = tmp_path / "request.json"
    decision_path.write_text(json.dumps(decision), encoding="utf-8")
    request_path.write_text(json.dumps(request), encoding="utf-8")
    run_dir = tmp_path / "run"
    script, receipt_path = support.install_router_bundle(tmp_path / "installed-project")

    completed = subprocess.run(
        [
            sys.executable,
            str(script),
            "execute",
            "--request",
            str(request_path),
            "--decision",
            str(decision_path),
            "--run-dir",
            str(run_dir),
            "--installation-receipt",
            str(receipt_path),
        ],
        cwd=script.parents[3],
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 12
    assert not run_dir.exists()


def test_execute_cli_requires_installation_receipt(tmp_path: Path) -> None:
    decision, request = external_request()
    decision_path = tmp_path / "decision.json"
    request_path = tmp_path / "request.json"
    decision_path.write_text(json.dumps(decision), encoding="utf-8")
    request_path.write_text(json.dumps(request), encoding="utf-8")
    run_dir = tmp_path / "run"
    script = (
        support.REPOSITORY_ROOT
        / "skills"
        / "chemistry-research-router"
        / "scripts"
        / "run_router.py"
    )

    completed = subprocess.run(
        [
            sys.executable,
            str(script),
            "execute",
            "--request",
            str(request_path),
            "--decision",
            str(decision_path),
            "--run-dir",
            str(run_dir),
        ],
        cwd=support.REPOSITORY_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 2
    assert not run_dir.exists()
