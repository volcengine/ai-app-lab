from __future__ import annotations

import copy
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

import router_test_support as support
import test_route_engine as route_support
import test_router_chain_runner as chain_support
import test_router_request_builders as builder_support


def load_module(name: str, filename: str) -> Any:
    return support.load_router_module(name, filename)


def execution_case() -> tuple[
    dict[str, Any],
    dict[str, Any],
    dict[str, Any],
    dict[str, Any],
]:
    catalog = route_support.catalog()
    intent = route_support.standardize_intent()
    decision = builder_support.route(intent, catalog)
    request = load_module(
        "router_execution_builder",
        "request_builders.py",
    ).build_execution_request(
        intent,
        decision,
        catalog,
        Path("."),
    )
    certificate = {
        "schema_version": "1.0.0",
        "certification_id": "cert-test-001",
        "status": "verified_auto",
        "host_id": intent["recognizer"]["host_id"],
        "host_version": intent["recognizer"]["host_version"],
        "model_id": intent["recognizer"]["model_id"],
        "model_mode": intent["recognizer"]["model_mode"],
        "router_skill_fingerprint": intent["recognizer"]["router_skill_fingerprint"],
        "catalog_fingerprint": catalog["catalog_fingerprint"],
        "schema_fingerprint": intent["recognizer"]["schema_fingerprint"],
        "bundle_integrity": True,
        "certificate_fingerprint": "",
    }
    certificate["certificate_fingerprint"] = support.sha256_json(
        certificate,
        "certificate_fingerprint",
    )
    return intent, decision, request, certificate


def test_verified_offline_request_auto_executes() -> None:
    authorize = load_module(
        "router_execution_authorization_auto",
        "execution_authorization.py",
    )
    intent, decision, request, certificate = execution_case()

    authorization = authorize.authorize_execution(
        intent,
        decision,
        certificate,
        request,
    )

    assert authorization == {
        "execution_mode": "auto_execute",
        "execution_authorized": True,
        "confirmation_reasons": [],
    }


@pytest.mark.parametrize(
    "reason",
    [
        "external_data_disclosure",
        "fees_possible",
        "sensitive_attachment",
        "special_scientific_parameter",
    ],
)
def test_risky_request_requires_confirmation(reason: str) -> None:
    authorize = load_module(
        f"router_execution_authorization_{reason}",
        "execution_authorization.py",
    )
    intent, decision, request, certificate = execution_case()
    request["risk_reasons"] = [reason]
    request["request_fingerprint"] = support.sha256_json(
        request,
        "request_fingerprint",
    )

    authorization = authorize.authorize_execution(
        intent,
        decision,
        certificate,
        request,
    )

    assert authorization == {
        "execution_mode": "confirmation_required",
        "execution_authorized": False,
        "confirmation_reasons": [reason],
    }


def test_unverified_host_cannot_auto_execute() -> None:
    authorize = load_module(
        "router_execution_authorization_manual",
        "execution_authorization.py",
    )
    intent, decision, request, _ = execution_case()

    authorization = authorize.authorize_execution(
        intent,
        decision,
        None,
        request,
    )

    assert authorization["execution_mode"] == "manual_target_required"
    assert authorization["execution_authorized"] is False


@pytest.mark.parametrize("tamper", ["certificate", "request"])
def test_integrity_tamper_is_not_executable(tamper: str) -> None:
    authorize = load_module(
        f"router_execution_authorization_tamper_{tamper}",
        "execution_authorization.py",
    )
    intent, decision, request, certificate = execution_case()
    if tamper == "certificate":
        certificate["certificate_fingerprint"] = "0" * 64
    else:
        request["request_fingerprint"] = "0" * 64

    authorization = authorize.authorize_execution(
        intent,
        decision,
        certificate,
        request,
    )

    assert authorization == {
        "execution_mode": "not_executable",
        "execution_authorized": False,
        "confirmation_reasons": [],
    }


def test_certification_contract_rejects_catalog_drift() -> None:
    certificates = load_module(
        "router_execution_certificate",
        "certification_contract.py",
    )
    _, _, _, certificate = execution_case()
    current = {
        "router_skill_fingerprint": certificate["router_skill_fingerprint"],
        "catalog_fingerprint": certificate["catalog_fingerprint"],
        "schema_fingerprint": certificate["schema_fingerprint"],
    }

    assert (
        certificates.validate_certification_record(certificate, current) == certificate
    )
    current["catalog_fingerprint"] = "0" * 64

    with pytest.raises(
        certificates.CertificationContractError,
        match="catalog",
    ):
        certificates.validate_certification_record(certificate, current)


@pytest.mark.parametrize("status", ["verified_confirm_only", "unverified"])
def test_certification_contract_preserves_non_auto_status(status: str) -> None:
    certificates = load_module(
        f"router_execution_certificate_{status}",
        "certification_contract.py",
    )
    _, _, _, certificate = execution_case()
    certificate["status"] = status
    certificate["certificate_fingerprint"] = support.sha256_json(
        certificate,
        "certificate_fingerprint",
    )
    current = {
        "router_skill_fingerprint": certificate["router_skill_fingerprint"],
        "catalog_fingerprint": certificate["catalog_fingerprint"],
        "schema_fingerprint": certificate["schema_fingerprint"],
    }

    assert (
        certificates.validate_certification_record(
            certificate,
            current,
        )["status"]
        == status
    )


@pytest.mark.parametrize(
    ("status", "expected_mode", "expected_reasons"),
    [
        (
            "verified_confirm_only",
            "confirmation_required",
            ["unverified_host"],
        ),
        ("unverified", "manual_target_required", []),
        ("revoked", "not_executable", []),
    ],
)
def test_authorization_respects_certification_status(
    status: str,
    expected_mode: str,
    expected_reasons: list[str],
) -> None:
    authorize = load_module(
        f"router_execution_authorization_status_{status}",
        "execution_authorization.py",
    )
    intent, decision, request, certificate = execution_case()
    certificate["status"] = status
    certificate["certificate_fingerprint"] = support.sha256_json(
        certificate,
        "certificate_fingerprint",
    )

    authorization = authorize.authorize_execution(
        intent,
        decision,
        certificate,
        request,
    )

    assert authorization == {
        "execution_mode": expected_mode,
        "execution_authorized": False,
        "confirmation_reasons": expected_reasons,
    }


def test_confirmation_cannot_replay_to_another_request() -> None:
    confirmations = load_module(
        "router_execution_confirmation",
        "confirmation_contract.py",
    )
    _, decision, request, _ = execution_case()
    confirmation = {
        "schema_version": "1.0.0",
        "confirmation_id": "confirmation-test-001",
        "decision_id": decision["decision_id"],
        "decision_fingerprint": decision["decision_fingerprint"],
        "request_fingerprint": request["request_fingerprint"],
        "confirmation_reasons": ["external_data_disclosure"],
        "actor_type": "user",
        "decided_at_utc": "2026-08-19T12:00:00Z",
        "confirmation_fingerprint": "",
    }
    confirmation["confirmation_fingerprint"] = support.sha256_json(
        confirmation,
        "confirmation_fingerprint",
    )
    replayed = copy.deepcopy(request)
    replayed["request_id"] = "router-request-replayed"
    replayed["target_request"]["request_id"] = replayed["request_id"]
    replayed["request_fingerprint"] = support.sha256_json(
        replayed,
        "request_fingerprint",
    )

    with pytest.raises(confirmations.ConfirmationContractError, match="request"):
        confirmations.validate_route_confirmation(
            confirmation,
            decision,
            replayed,
        )


def test_confirmation_rejects_impossible_utc_date() -> None:
    confirmations = load_module(
        "router_execution_confirmation_date",
        "confirmation_contract.py",
    )
    _, decision, request, _ = execution_case()
    request["risk_reasons"] = ["fees_possible"]
    request["request_fingerprint"] = support.sha256_json(
        request,
        "request_fingerprint",
    )
    decision["execution_mode"] = "confirmation_required"
    decision["execution_authorized"] = False
    decision["confirmation_reasons"] = ["fees_possible"]
    decision["decision_fingerprint"] = support.sha256_json(
        decision,
        "decision_fingerprint",
    )
    request["decision_fingerprint"] = decision["decision_fingerprint"]
    request["request_fingerprint"] = support.sha256_json(
        request,
        "request_fingerprint",
    )
    confirmation = {
        "schema_version": "1.0.0",
        "confirmation_id": "confirmation-date-001",
        "decision_id": decision["decision_id"],
        "decision_fingerprint": decision["decision_fingerprint"],
        "request_fingerprint": request["request_fingerprint"],
        "confirmation_reasons": ["fees_possible"],
        "actor_type": "user",
        "decided_at_utc": "2026-99-99T12:00:00Z",
        "confirmation_fingerprint": "",
    }
    confirmation["confirmation_fingerprint"] = support.sha256_json(
        confirmation,
        "confirmation_fingerprint",
    )

    with pytest.raises(confirmations.ConfirmationContractError, match="UTC"):
        confirmations.validate_route_confirmation(
            confirmation,
            decision,
            request,
        )


def test_target_runner_executes_registered_offline_chain(
    tmp_path: Path,
) -> None:
    target_runner = load_module(
        "router_execution_target_chain",
        "target_runner.py",
    )
    catalog = route_support.catalog()
    intent = route_support.structure_library_intent()
    decision = builder_support.route(intent, catalog)
    request = load_module(
        "router_execution_chain_builder",
        "request_builders.py",
    ).build_execution_request(
        intent,
        decision,
        catalog,
        tmp_path,
    )

    result = target_runner.run_target(
        request,
        tmp_path / "run",
        support.REPOSITORY_ROOT,
        decision=decision,
    )

    assert result.status in {"completed", "completed_with_review"}
    assert (
        target_runner.CHAIN.validate_chain_run(
            result.run_dir,
            support.REPOSITORY_ROOT,
        )["valid"]
        is True
    )
    assert (
        json.loads((result.run_dir / "route_decision.json").read_text(encoding="utf-8"))
        == decision
    )
    assert (
        json.loads(
            (result.run_dir / "router_execution_request.json").read_text(
                encoding="utf-8"
            )
        )
        == request
    )


def test_target_runner_executes_registered_direct_skill(
    tmp_path: Path,
) -> None:
    target_runner = load_module(
        "router_execution_target_direct",
        "target_runner.py",
    )
    catalog = route_support.catalog()
    intent = route_support.standardize_intent()
    decision = builder_support.route(intent, catalog)
    request = load_module(
        "router_execution_direct_builder",
        "request_builders.py",
    ).build_execution_request(
        intent,
        decision,
        catalog,
        tmp_path,
    )

    result = target_runner.run_target(
        request,
        tmp_path / "run",
        support.REPOSITORY_ROOT,
        decision=decision,
    )

    assert result.status in {"completed", "completed_with_review"}
    assert result.target_id == "standardize-chemical-structures"
    assert result.output_path.is_file()
    report = target_runner.DIRECT.validate_direct_run(
        result.run_dir,
        support.REPOSITORY_ROOT,
    )
    assert report["valid"] is True, report

    direct_request = json.loads(
        (result.run_dir / "direct_request.json").read_text(encoding="utf-8")
    )
    direct_request["request_id"] = "tampered-request"
    (result.run_dir / "direct_request.json").write_text(
        json.dumps(direct_request),
        encoding="utf-8",
    )
    tampered = target_runner.DIRECT.validate_direct_run(
        result.run_dir,
        support.REPOSITORY_ROOT,
    )
    assert tampered["valid"] is False
    assert any("request" in error for error in tampered["errors"])


def test_valid_confirmation_executes_offline_direct_skill(
    tmp_path: Path,
) -> None:
    target_runner = load_module(
        "router_execution_target_confirmed",
        "target_runner.py",
    )
    catalog = route_support.catalog()
    intent = route_support.standardize_intent()
    intent["user_parameters"] = [
        {
            "parameter_id": "parameter-001",
            "field_id": "calculation_view",
            "value": "standardized",
            "provenance": "user_explicit",
            "source_refs": ["span-001"],
        }
    ]
    support.resign(intent)
    decision = builder_support.route(intent, catalog)
    request = load_module(
        "router_execution_confirmed_builder",
        "request_builders.py",
    ).build_execution_request(
        intent,
        decision,
        catalog,
        tmp_path,
    )
    confirmation = {
        "schema_version": "1.0.0",
        "confirmation_id": "confirmation-execute-001",
        "decision_id": decision["decision_id"],
        "decision_fingerprint": decision["decision_fingerprint"],
        "request_fingerprint": request["request_fingerprint"],
        "confirmation_reasons": ["special_scientific_parameter"],
        "actor_type": "user",
        "decided_at_utc": "2026-08-19T12:00:00Z",
        "confirmation_fingerprint": "",
    }
    confirmation["confirmation_fingerprint"] = support.sha256_json(
        confirmation,
        "confirmation_fingerprint",
    )

    result = target_runner.run_target(
        request,
        tmp_path / "run",
        support.REPOSITORY_ROOT,
        confirmation,
        decision=decision,
    )

    assert decision["execution_mode"] == "confirmation_required"
    assert result.status in {"completed", "completed_with_review"}
    persisted = json.loads(
        (result.run_dir / "route_confirmation.json").read_text(encoding="utf-8")
    )
    assert persisted == confirmation


def test_target_runner_executes_registered_workflow_a(
    tmp_path: Path,
) -> None:
    target_runner = load_module(
        "router_execution_target_workflow",
        "target_runner.py",
    )
    catalog = route_support.catalog()
    intent = builder_support.structure_compound_evidence_intent()
    decision = builder_support.route(intent, catalog)
    request = load_module(
        "router_execution_workflow_builder",
        "request_builders.py",
    ).build_execution_request(
        intent,
        decision,
        catalog,
        tmp_path,
    )

    result = target_runner.run_target(
        request,
        tmp_path / "run",
        support.REPOSITORY_ROOT,
        decision=decision,
    )

    assert result.status in {"completed", "completed_with_review"}
    assert (result.run_dir / "workflow_report.json").is_file()


def test_run_router_resume_accepts_workflow_wrapper_directory(
    tmp_path: Path,
) -> None:
    target_runner = load_module(
        "router_execution_target_workflow_resume",
        "target_runner.py",
    )
    catalog = route_support.catalog()
    intent = builder_support.structure_compound_evidence_intent()
    decision = builder_support.route(intent, catalog)
    request = load_module(
        "router_execution_workflow_resume_builder",
        "request_builders.py",
    ).build_execution_request(
        intent,
        decision,
        catalog,
        tmp_path,
    )
    wrapper_dir = tmp_path / "run"
    result = target_runner.run_target(
        request,
        wrapper_dir,
        support.REPOSITORY_ROOT,
        decision=decision,
    )
    assert result.status in {"completed", "completed_with_review"}
    script, receipt_path = support.install_router_bundle(tmp_path / "installed-project")

    resumed = subprocess.run(
        [
            sys.executable,
            str(script),
            "resume",
            "--run-dir",
            str(wrapper_dir),
            "--installation-receipt",
            str(receipt_path),
        ],
        cwd=script.parents[3],
        capture_output=True,
        text=True,
        check=False,
    )

    assert resumed.returncode == 0, resumed.stderr
    assert json.loads(resumed.stdout)["status"] in {
        "completed",
        "completed_with_review",
    }


def test_target_runner_executes_registered_workflow_b(
    tmp_path: Path,
) -> None:
    target_runner = load_module(
        "router_execution_target_workflow_b",
        "target_runner.py",
    )
    catalog = route_support.catalog()
    fixture_root = (
        support.REPOSITORY_ROOT / "tests" / "fixtures" / "workflow_b" / "single"
    )
    intent = route_support.route_evidence_intent()
    intent["input_artifacts"] = [
        {
            "artifact_ref": filename,
            "role": role,
            "media_type": "application/json",
            "sha256": hashlib.sha256(
                (fixture_root / filename).read_bytes()
            ).hexdigest(),
            "source_refs": ["attachment-ref-001"],
        }
        for filename, role in (
            ("reactions.json", "reaction_input"),
            ("routes.json", "route_input"),
        )
    ]
    support.resign(intent)
    decision = builder_support.route(intent, catalog)
    request = load_module(
        "router_execution_workflow_b_builder",
        "request_builders.py",
    ).build_execution_request(
        intent,
        decision,
        catalog,
        fixture_root,
    )

    result = target_runner.run_target(
        request,
        tmp_path / "run",
        support.REPOSITORY_ROOT,
        decision=decision,
        request_base=fixture_root,
    )

    assert result.status in {"completed", "completed_with_review"}
    assert (result.run_dir / "workflow_report.json").is_file()


def test_run_router_execute_cli_runs_offline_chain(tmp_path: Path) -> None:
    catalog = route_support.catalog()
    intent = route_support.structure_library_intent()
    decision = builder_support.route(intent, catalog)
    request = load_module(
        "router_execution_cli_builder",
        "request_builders.py",
    ).build_execution_request(
        intent,
        decision,
        catalog,
        tmp_path,
    )
    decision_path = tmp_path / "decision.json"
    request_path = tmp_path / "request.json"
    decision_path.write_text(
        json.dumps(decision, ensure_ascii=False),
        encoding="utf-8",
    )
    request_path.write_text(
        json.dumps(request, ensure_ascii=False),
        encoding="utf-8",
    )
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

    assert completed.returncode == 0, completed.stderr
    summary = json.loads(completed.stdout)
    assert summary["status"] in {"completed", "completed_with_review"}
    assert summary["target_id"] == "structure-library-v1"
    assert (run_dir / "chain_report.json").is_file()


def test_run_router_route_cli_writes_decision_and_request(
    tmp_path: Path,
) -> None:
    catalog = route_support.catalog()
    intent = route_support.structure_library_intent()
    route_support.align_catalog(intent, catalog)
    certificate = route_support.verified_certificate(intent, catalog)
    certificate.update(
        {
            "schema_version": "1.0.0",
            "certification_id": "cert-cli-001",
            "certificate_fingerprint": "",
        }
    )
    certificate["certificate_fingerprint"] = support.sha256_json(
        certificate,
        "certificate_fingerprint",
    )
    source_text = "把 aspirin 解析、标准化并计算指纹"
    intent_path = tmp_path / "intent.json"
    source_path = tmp_path / "source.txt"
    attachments_path = tmp_path / "attachments.json"
    certificate_path = tmp_path / "certificate.json"
    decision_path = tmp_path / "decision.json"
    request_path = tmp_path / "request.json"
    intent_path.write_text(json.dumps(intent), encoding="utf-8")
    source_path.write_text(source_text, encoding="utf-8")
    attachments_path.write_text(
        json.dumps(support.empty_attachments()),
        encoding="utf-8",
    )
    certificate_path.write_text(json.dumps(certificate), encoding="utf-8")
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
            "route",
            "--intent",
            str(intent_path),
            "--source",
            str(source_path),
            "--attachments",
            str(attachments_path),
            "--certificate",
            str(certificate_path),
            "--decision",
            str(decision_path),
            "--request",
            str(request_path),
        ],
        cwd=support.REPOSITORY_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr
    assert source_text not in completed.stdout
    decision = json.loads(decision_path.read_text(encoding="utf-8"))
    request = json.loads(request_path.read_text(encoding="utf-8"))
    assert decision["targets"] == ["structure-library-v1"]
    assert request["target_id"] == "structure-library-v1"


def test_run_router_route_cli_persists_clarification_without_request(
    tmp_path: Path,
) -> None:
    catalog = route_support.catalog()
    intent = route_support.ambiguous_intent()
    route_support.align_catalog(intent, catalog)
    certificate = route_support.verified_certificate(intent, catalog)
    certificate.update(
        {
            "schema_version": "1.0.0",
            "certification_id": "cert-clarify-001",
            "certificate_fingerprint": "",
        }
    )
    certificate["certificate_fingerprint"] = support.sha256_json(
        certificate,
        "certificate_fingerprint",
    )
    paths = {
        "intent": tmp_path / "intent.json",
        "source": tmp_path / "source.txt",
        "attachments": tmp_path / "attachments.json",
        "certificate": tmp_path / "certificate.json",
        "decision": tmp_path / "decision.json",
        "request": tmp_path / "request.json",
    }
    paths["intent"].write_text(json.dumps(intent), encoding="utf-8")
    paths["source"].write_text(
        "把 aspirin 解析、标准化并计算指纹",
        encoding="utf-8",
    )
    paths["attachments"].write_text(
        json.dumps(support.empty_attachments()),
        encoding="utf-8",
    )
    paths["certificate"].write_text(
        json.dumps(certificate),
        encoding="utf-8",
    )
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
            "route",
            "--intent",
            str(paths["intent"]),
            "--source",
            str(paths["source"]),
            "--attachments",
            str(paths["attachments"]),
            "--certificate",
            str(paths["certificate"]),
            "--decision",
            str(paths["decision"]),
            "--request",
            str(paths["request"]),
        ],
        cwd=support.REPOSITORY_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 10, completed.stderr
    decision = json.loads(paths["decision"].read_text(encoding="utf-8"))
    assert decision["route_type"] == "clarification_required"
    assert not paths["request"].exists()


def test_run_router_route_cli_applies_confirm_only_authorization(
    tmp_path: Path,
) -> None:
    catalog = route_support.catalog()
    intent = route_support.standardize_intent()
    route_support.align_catalog(intent, catalog)
    certificate = route_support.verified_certificate(intent, catalog)
    certificate.update(
        {
            "schema_version": "1.0.0",
            "certification_id": "cert-confirm-only-001",
            "status": "verified_confirm_only",
            "certificate_fingerprint": "",
        }
    )
    certificate["certificate_fingerprint"] = support.sha256_json(
        certificate,
        "certificate_fingerprint",
    )
    paths = {
        "intent": tmp_path / "intent.json",
        "source": tmp_path / "source.txt",
        "attachments": tmp_path / "attachments.json",
        "certificate": tmp_path / "certificate.json",
        "decision": tmp_path / "decision.json",
        "request": tmp_path / "request.json",
    }
    paths["intent"].write_text(json.dumps(intent), encoding="utf-8")
    paths["source"].write_text(
        "把 aspirin 解析、标准化并计算指纹",
        encoding="utf-8",
    )
    paths["attachments"].write_text(
        json.dumps(support.empty_attachments()),
        encoding="utf-8",
    )
    paths["certificate"].write_text(
        json.dumps(certificate),
        encoding="utf-8",
    )
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
            "route",
            "--intent",
            str(paths["intent"]),
            "--source",
            str(paths["source"]),
            "--attachments",
            str(paths["attachments"]),
            "--certificate",
            str(paths["certificate"]),
            "--decision",
            str(paths["decision"]),
            "--request",
            str(paths["request"]),
        ],
        cwd=support.REPOSITORY_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr
    decision = json.loads(paths["decision"].read_text(encoding="utf-8"))
    request = json.loads(paths["request"].read_text(encoding="utf-8"))
    assert decision["execution_mode"] == "confirmation_required"
    assert decision["confirmation_reasons"] == ["unverified_host"]
    assert request["risk_reasons"] == ["unverified_host"]
    assert request["decision_fingerprint"] == decision["decision_fingerprint"]
    expected_request_id = (
        "router-request-"
        + support.sha256_json(
            {
                "intent_fingerprint": intent["intent_fingerprint"],
                "decision_fingerprint": decision["decision_fingerprint"],
                "target_id": request["target_id"],
            }
        )[:24]
    )
    assert request["request_id"] == expected_request_id
    assert request["target_request"]["request_id"] == expected_request_id


def test_run_router_resume_cli_continues_chain_gate(
    tmp_path: Path,
) -> None:
    chain_runner = load_module(
        "router_execution_resume_chain",
        "chain_runner.py",
    )
    request = chain_support.chain_request("structure-features-v1")
    next(
        item for item in request["parameters"] if item["field_id"] == "calculation_view"
    )["value"] = None
    run_dir = tmp_path / "run"
    paused = chain_runner.start_chain(
        request,
        run_dir,
        support.REPOSITORY_ROOT,
    )
    assert paused.status == "awaiting_human"
    events = chain_runner.LEDGER.read_verified_events(
        run_dir / "events.jsonl",
        paused.run_id,
    )
    gate_event = next(
        item for item in reversed(events) if item["event_type"] == "gate_requested"
    )
    gate = chain_runner.CONTRACTS.read_json_object(
        run_dir / gate_event["payload"]["request_path"],
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
    decision["decision_fingerprint"] = support.sha256_json(
        decision,
        "decision_fingerprint",
    )
    decision_path = tmp_path / "human-decision.json"
    decision_path.write_text(json.dumps(decision), encoding="utf-8")
    script, receipt_path = support.install_router_bundle(tmp_path / "installed-project")

    completed = subprocess.run(
        [
            sys.executable,
            str(script),
            "resume",
            "--run-dir",
            str(run_dir),
            "--decision",
            str(decision_path),
            "--installation-receipt",
            str(receipt_path),
        ],
        cwd=script.parents[3],
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr
    summary = json.loads(completed.stdout)
    assert summary["status"] in {"completed", "completed_with_review"}
    assert (
        chain_runner.validate_chain_run(
            run_dir,
            support.REPOSITORY_ROOT,
        )["valid"]
        is True
    )


@pytest.mark.parametrize(
    ("target_id", "object_type", "representation", "artifact_role"),
    [
        ("resolve-chemical-identities", "chemical_structure", "CCO", None),
        ("standardize-chemical-structures", "chemical_structure", "CCO", None),
        (
            "compute-molecular-features",
            "compound_collection",
            "standardized-input",
            "standardization_input",
        ),
        (
            "search-and-curate-chemical-libraries",
            "compound_collection",
            "features-input",
            "features_input",
        ),
        ("curate-reactions", "reaction_record", "CCO>>CC=O", None),
        (
            "search-reactions",
            "reaction_query",
            "reaction-001",
            "curation_input",
        ),
        ("review-routes", "route_record", "route-input", "route_input"),
    ],
)
def test_direct_runner_prepares_all_registered_adapters(
    tmp_path: Path,
    target_id: str,
    object_type: str,
    representation: str,
    artifact_role: str | None,
) -> None:
    direct = load_module(
        f"router_execution_direct_prepare_{target_id}",
        "direct_runner.py",
    )
    work_dir = tmp_path / target_id
    work_dir.mkdir()
    artifacts = []
    if artifact_role is not None:
        input_path = work_dir / "nested" / "input.json"
        input_path.parent.mkdir()
        input_path.write_text("{}\n", encoding="utf-8")
        artifacts.append(
            {
                "artifact_ref": "nested/input.json",
                "role": artifact_role,
                "path": "nested/input.json",
                "media_type": "application/json",
                "sha256": hashlib.sha256(input_path.read_bytes()).hexdigest(),
            }
        )
    operation_types = {
        "resolve-chemical-identities": ["resolve_identity"],
        "standardize-chemical-structures": ["standardize_structure"],
        "compute-molecular-features": ["compute_fingerprint"],
        "search-and-curate-chemical-libraries": ["curate_library"],
        "curate-reactions": ["curate_reaction"],
        "search-reactions": ["search_reaction_precedent"],
        "review-routes": ["review_existing_routes"],
    }
    request = {
        "schema_version": "1.0.0",
        "request_id": f"direct-{target_id}",
        "target_id": target_id,
        "inputs": {
            "research_objects": [
                {
                    "object_id": "object-001",
                    "object_type": object_type,
                    "representation": representation,
                }
            ],
            "artifacts": artifacts,
            "operations": [
                {
                    "operation_id": f"operation-{index:03d}",
                    "operation_type": operation_type,
                    "sequence": index,
                }
                for index, operation_type in enumerate(
                    operation_types[target_id],
                    start=1,
                )
            ],
        },
        "parameters": [
            {"field_id": "network_mode", "value": "offline"},
            {"field_id": "external_retry", "value": "manual"},
            {
                "field_id": "standardization_profile",
                "value": "chembl-pipeline",
            },
            {"field_id": "calculation_view", "value": "standardized"},
            {
                "field_id": "reaction_provider",
                "value": "local_curated_corpus",
            },
            {"field_id": "reaction_operation", "value": "lookup_reaction"},
            {"field_id": "reaction_top_k", "value": 20},
            {
                "field_id": "reaction_include_review_required",
                "value": False,
            },
            {
                "field_id": "reaction_use_stereochemistry",
                "value": True,
            },
        ],
        "execution_policy": {
            "network_mode": "offline",
            "external_retry": "manual",
        },
    }

    prepared = direct.prepare_direct(request, work_dir)
    command = direct.ADAPTERS.build_command(
        prepared.adapter_id,
        prepared.command_context,
    )

    assert prepared.adapter_id == direct.TARGET_ADAPTERS[target_id]
    assert command[1] == direct.ADAPTERS.ADAPTERS[prepared.adapter_id].entrypoint
    if target_id == "search-and-curate-chemical-libraries":
        payload = json.loads(
            Path(prepared.command_context["request_path"]).read_text(encoding="utf-8")
        )
        assert payload["library_artifact"] == "nested/input.json"
    if target_id == "search-reactions":
        payload = json.loads(
            Path(prepared.command_context["input_path"]).read_text(encoding="utf-8")
        )
        assert payload["corpus_artifact_path"] == "nested/input.json"


def test_target_runner_executes_staged_direct_features(
    tmp_path: Path,
) -> None:
    target_runner = load_module(
        "router_execution_target_staged_direct",
        "target_runner.py",
    )
    catalog = route_support.catalog()
    standardize_intent = route_support.standardize_intent()
    standardize_decision = builder_support.route(standardize_intent, catalog)
    standardize_request = load_module(
        "router_execution_staged_standardize_builder",
        "request_builders.py",
    ).build_execution_request(
        standardize_intent,
        standardize_decision,
        catalog,
        tmp_path,
    )
    standardized = target_runner.run_target(
        standardize_request,
        tmp_path / "standardize-run",
        support.REPOSITORY_ROOT,
        decision=standardize_decision,
    )
    stage = tmp_path / "stage"
    stage.mkdir()
    staged_input = stage / "standardized.json"
    shutil.copyfile(standardized.output_path, staged_input)
    intent = support.valid_intent()
    intent["goal"] = {
        "goal_type": "compute_molecular_features",
        "chain_requirement": "single_operation",
        "source_refs": ["span-001"],
    }
    intent["research_objects"] = []
    intent["requested_operations"] = [
        route_support.operation(
            "operation-001",
            "compute_fingerprint",
            1,
        )
    ]
    intent["input_artifacts"] = [
        {
            "artifact_ref": staged_input.name,
            "role": "standardization_input",
            "media_type": "application/json",
            "sha256": hashlib.sha256(staged_input.read_bytes()).hexdigest(),
            "source_refs": ["span-001"],
        }
    ]
    intent["candidate_targets"] = ["compute-molecular-features"]
    support.resign(intent)
    decision = builder_support.route(intent, catalog)
    request = load_module(
        "router_execution_staged_features_builder",
        "request_builders.py",
    ).build_execution_request(
        intent,
        decision,
        catalog,
        stage,
    )

    result = target_runner.run_target(
        request,
        tmp_path / "features-run",
        support.REPOSITORY_ROOT,
        decision=decision,
        request_base=stage,
    )

    assert result.status in {"completed", "completed_with_review"}
    assert result.target_id == "compute-molecular-features"
    staged_copy = result.run_dir / "standardized.json"
    tampered = bytearray(staged_copy.read_bytes())
    tampered[0] = ord("[")
    staged_copy.write_bytes(tampered)
    report = target_runner.DIRECT.validate_direct_run(
        result.run_dir,
        support.REPOSITORY_ROOT,
    )
    assert report["valid"] is False
    assert any("input" in error for error in report["errors"])
