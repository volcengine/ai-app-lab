from __future__ import annotations

import copy
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

import router_test_support as support


SOURCE_TEXT = (
    "对 inputs/structures.csv 中的结构先标准化，再计算 Morgan、RDKit 和 MACCS 指纹。"
)


def load_builder() -> Any:
    return support.load_router_module(
        "router_intent_builder_under_test",
        "intent_builder.py",
    )


def load_cli() -> Any:
    return support.load_router_module(
        "router_intent_builder_cli_under_test",
        "build_intent.py",
    )


def load_validator() -> Any:
    return support.load_router_module(
        "router_intent_builder_validator",
        "validate_intent.py",
    )


def certificate() -> dict[str, Any]:
    value = {
        "schema_version": "1.0.0",
        "certification_id": "precert-test-001",
        "status": "unverified",
        "host_id": "claude-code",
        "host_version": "2.1.226",
        "model_id": "opus",
        "model_mode": "host_auto",
        "router_skill_fingerprint": support.SHA256_A,
        "catalog_fingerprint": support.SHA256_B,
        "schema_fingerprint": support.SHA256_C,
        "bundle_integrity": True,
        "certificate_fingerprint": "",
    }
    value["certificate_fingerprint"] = support.sha256_json(
        value,
        "certificate_fingerprint",
    )
    return value


def attachments() -> dict[str, Any]:
    return support.attachment_manifest(
        [
            {
                "attachment_id": "structures-csv",
                "display_name": "structures.csv",
                "media_type": "text/csv",
                "sha256": support.SHA256_A,
                "size_bytes": 45,
            }
        ]
    )


def chain_draft() -> dict[str, Any]:
    return {
        "schema_version": "1.0.0",
        "language": "zh-CN",
        "goal": {
            "goal_type": "compute_molecular_features",
            "chain_requirement": "explicit_bounded_chain",
            "evidence_text": SOURCE_TEXT,
        },
        "research_objects": [
            {
                "object_type": "compound_collection",
                "evidence": {
                    "source_kind": "attachment",
                    "attachment_id": "structures-csv",
                },
            }
        ],
        "requested_operations": [
            {
                "operation_type": "standardize_structure",
                "negated": False,
                "evidence_text": "标准化",
            },
            {
                "operation_type": "compute_fingerprint",
                "negated": False,
                "evidence_text": "计算 Morgan、RDKit 和 MACCS 指纹",
            },
        ],
        "input_artifacts": [
            {
                "attachment_id": "structures-csv",
                "role": "structure_input",
            }
        ],
        "user_parameters": [],
        "candidate_targets": ["structure-features-v1"],
        "ambiguities": [],
        "unsupported_goals": [],
    }


def test_builder_creates_a_fully_valid_source_bound_chain_intent() -> None:
    builder = load_builder()
    intent = builder.build_research_intent(
        chain_draft(),
        SOURCE_TEXT,
        attachments(),
        certificate(),
    )

    assert (
        load_validator().validate_research_intent(
            intent,
            SOURCE_TEXT,
            attachments(),
        )
        == intent
    )
    assert intent["recognizer"] == {
        "host_id": "claude-code",
        "host_version": "2.1.226",
        "model_id": "opus",
        "model_mode": "host_auto",
        "router_skill_fingerprint": support.SHA256_A,
        "catalog_fingerprint": support.SHA256_B,
        "schema_fingerprint": support.SHA256_C,
    }
    assert [item["operation_id"] for item in intent["requested_operations"]] == [
        "operation-001",
        "operation-002",
    ]
    assert [item["sequence"] for item in intent["requested_operations"]] == [1, 2]
    assert intent["research_objects"][0]["representation"] == "structures-csv"
    assert intent["input_artifacts"][0] == {
        "artifact_ref": "structures-csv",
        "role": "structure_input",
        "media_type": "text/csv",
        "sha256": support.SHA256_A,
        "source_refs": ["attachment-ref-001"],
    }
    assert intent["user_parameters"] == []


def test_builder_is_deterministic_for_the_same_evidence() -> None:
    builder = load_builder()
    first = builder.build_research_intent(
        chain_draft(),
        SOURCE_TEXT,
        attachments(),
        certificate(),
    )
    second = builder.build_research_intent(
        chain_draft(),
        SOURCE_TEXT,
        attachments(),
        certificate(),
    )

    assert first == second
    assert first["intent_id"].startswith("intent-")


def test_built_intent_preserves_router_target_and_unverified_safety_mode() -> None:
    catalog_module = support.load_router_module(
        "router_intent_builder_catalog",
        "route_catalog.py",
    )
    policy_module = support.load_router_module(
        "router_intent_builder_policy",
        "policy_guard.py",
    )
    engine = support.load_router_module(
        "router_intent_builder_engine",
        "route_engine.py",
    )
    catalog = catalog_module.load_route_catalog(support.REPOSITORY_ROOT)
    unverified = certificate()
    unverified["catalog_fingerprint"] = catalog["catalog_fingerprint"]
    unverified["certificate_fingerprint"] = support.sha256_json(
        unverified,
        "certificate_fingerprint",
    )
    intent = load_builder().build_research_intent(
        chain_draft(),
        SOURCE_TEXT,
        attachments(),
        unverified,
    )
    policy = policy_module.evaluate_policy(intent, catalog, unverified)
    decision = engine.route_intent(intent, catalog, policy, unverified)

    assert decision["route_type"] == "direct_skill_chain"
    assert decision["targets"] == ["structure-features-v1"]
    assert decision["execution_mode"] == "manual_target_required"
    assert decision["execution_authorized"] is False
    assert [item["code"] for item in decision["policy_findings"]] == [
        "E-HOST-CERTIFICATION"
    ]


def test_builder_rejects_non_unique_message_evidence() -> None:
    builder = load_builder()
    source = "先标准化，然后再次标准化"
    draft = chain_draft()
    draft["goal"]["evidence_text"] = source
    draft["requested_operations"] = [
        {
            "operation_type": "standardize_structure",
            "negated": False,
            "evidence_text": "标准化",
        }
    ]

    with pytest.raises(builder.IntentBuildError, match="unique"):
        builder.build_research_intent(
            draft,
            source,
            attachments(),
            certificate(),
        )


def test_builder_copies_only_explicit_user_parameters() -> None:
    builder = load_builder()
    source = SOURCE_TEXT + " 使用 standardized 视图。"
    draft = chain_draft()
    draft["goal"]["evidence_text"] = SOURCE_TEXT
    draft["user_parameters"] = [
        {
            "field_id": "calculation_view",
            "value": "standardized",
            "evidence_text": "standardized",
        }
    ]
    intent = builder.build_research_intent(
        draft,
        source,
        attachments(),
        certificate(),
    )

    assert intent["user_parameters"] == [
        {
            "parameter_id": "parameter-001",
            "field_id": "calculation_view",
            "value": "standardized",
            "provenance": "user_explicit",
            "source_refs": ["span-004"],
        }
    ]

    without_parameter = copy.deepcopy(draft)
    without_parameter["user_parameters"] = []
    assert (
        builder.build_research_intent(
            without_parameter,
            source,
            attachments(),
            certificate(),
        )["user_parameters"]
        == []
    )


def test_builder_rejects_unknown_fields_and_missing_attachments() -> None:
    builder = load_builder()
    unknown = chain_draft()
    unknown["intent_id"] = "agent-forged-id"
    with pytest.raises(builder.IntentBuildError, match="fields"):
        builder.build_research_intent(
            unknown,
            SOURCE_TEXT,
            attachments(),
            certificate(),
        )

    missing = chain_draft()
    missing["input_artifacts"][0]["attachment_id"] = "missing"
    with pytest.raises(builder.IntentBuildError, match="attachment"):
        builder.build_research_intent(
            missing,
            SOURCE_TEXT,
            attachments(),
            certificate(),
        )


def test_builder_rejects_unknown_object_evidence_kind() -> None:
    builder = load_builder()
    draft = chain_draft()
    draft["research_objects"][0]["evidence"]["source_kind"] = "agent_guess"

    with pytest.raises(builder.IntentBuildError, match="source_kind"):
        builder.build_research_intent(
            draft,
            SOURCE_TEXT,
            attachments(),
            certificate(),
        )


def test_build_intent_cli_writes_only_validated_intent(
    tmp_path: Path,
) -> None:
    run_path = tmp_path / "run"
    run_path.mkdir()
    source_path = tmp_path / "source.txt"
    draft_path = tmp_path / "draft.json"
    attachments_path = tmp_path / "attachments.json"
    certificate_path = tmp_path / "certificate.json"
    intent_path = run_path / "intent.json"
    attachment_path = tmp_path / "structures.csv"
    attachment_bytes = b"id,structure\nethanol,CCO\n"
    attachment_path.write_bytes(attachment_bytes)
    cli_attachments = support.attachment_manifest(
        [
            {
                "attachment_id": "structures-csv",
                "display_name": "structures.csv",
                "media_type": "text/csv",
                "sha256": hashlib.sha256(attachment_bytes).hexdigest(),
                "size_bytes": len(attachment_bytes),
            }
        ]
    )
    cli_certificate = certificate()
    catalog = support.load_router_module(
        "router_intent_builder_cli_catalog",
        "route_catalog.py",
    ).load_route_catalog(support.REPOSITORY_ROOT)
    cli_certificate["catalog_fingerprint"] = catalog["catalog_fingerprint"]
    cli_certificate["certificate_fingerprint"] = support.sha256_json(
        cli_certificate,
        "certificate_fingerprint",
    )
    source_path.write_text(SOURCE_TEXT, encoding="utf-8")
    draft_path.write_text(
        json.dumps(chain_draft(), ensure_ascii=False),
        encoding="utf-8",
    )
    attachments_path.write_text(
        json.dumps(cli_attachments),
        encoding="utf-8",
    )
    certificate_path.write_text(
        json.dumps(cli_certificate),
        encoding="utf-8",
    )

    completed = subprocess.run(
        [
            sys.executable,
            str(support.ROUTER_SCRIPTS / "build_intent.py"),
            "--draft",
            str(draft_path),
            "--source",
            str(source_path),
            "--attachments",
            str(attachments_path),
            "--attachment-root",
            str(tmp_path),
            "--certificate",
            str(certificate_path),
            "--intent",
            str(intent_path),
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    assert completed.returncode == 0
    summary = json.loads(completed.stdout)
    assert summary == {
        "built": True,
        "intent_fingerprint": json.loads(intent_path.read_text(encoding="utf-8"))[
            "intent_fingerprint"
        ],
        "intent_id": json.loads(intent_path.read_text(encoding="utf-8"))["intent_id"],
        "valid": True,
    }
    assert SOURCE_TEXT not in completed.stdout
    assert (run_path / "structures-csv").read_bytes() == attachment_bytes

    routed = subprocess.run(
        [
            sys.executable,
            str(support.ROUTER_SCRIPTS / "run_router.py"),
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
            str(run_path / "decision.json"),
            "--request",
            str(run_path / "request.json"),
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    assert routed.returncode == 0, routed.stderr
    decision = json.loads((run_path / "decision.json").read_text(encoding="utf-8"))
    request = json.loads((run_path / "request.json").read_text(encoding="utf-8"))
    assert decision["execution_mode"] == "manual_target_required"
    assert decision["targets"] == ["structure-features-v1"]
    assert request["target_id"] == "structure-features-v1"
    assert request["staged_inputs"][0]["path"] == "structures-csv"


def test_build_intent_cli_rejects_attachment_hash_mismatch(
    tmp_path: Path,
) -> None:
    run_path = tmp_path / "run"
    run_path.mkdir()
    (tmp_path / "source.txt").write_text(SOURCE_TEXT, encoding="utf-8")
    (tmp_path / "structures.csv").write_text("tampered", encoding="utf-8")
    (tmp_path / "draft.json").write_text(
        json.dumps(chain_draft(), ensure_ascii=False),
        encoding="utf-8",
    )
    (tmp_path / "attachments.json").write_text(
        json.dumps(attachments()),
        encoding="utf-8",
    )
    (tmp_path / "certificate.json").write_text(
        json.dumps(certificate()),
        encoding="utf-8",
    )

    completed = subprocess.run(
        [
            sys.executable,
            str(support.ROUTER_SCRIPTS / "build_intent.py"),
            "--draft",
            str(tmp_path / "draft.json"),
            "--source",
            str(tmp_path / "source.txt"),
            "--attachments",
            str(tmp_path / "attachments.json"),
            "--attachment-root",
            str(tmp_path),
            "--certificate",
            str(tmp_path / "certificate.json"),
            "--intent",
            str(run_path / "intent.json"),
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    assert completed.returncode == 2
    assert "unrecognized arguments" not in completed.stderr
    assert not (run_path / "intent.json").exists()
    assert not (run_path / "structures-csv").exists()


def test_stage_attachments_removes_partial_target_on_write_failure(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cli = load_cli()
    run_path = tmp_path / "run"
    run_path.mkdir()
    attachment_bytes = b"id,structure\nethanol,CCO\n"
    (tmp_path / "structures.csv").write_bytes(attachment_bytes)
    manifest = support.attachment_manifest(
        [
            {
                "attachment_id": "structures-csv",
                "display_name": "structures.csv",
                "media_type": "text/csv",
                "sha256": hashlib.sha256(attachment_bytes).hexdigest(),
                "size_bytes": len(attachment_bytes),
            }
        ]
    )
    target = run_path / "structures-csv"
    original_open = Path.open

    class PartialWriter:
        def __init__(self) -> None:
            self.handle = original_open(target, "xb")

        def __enter__(self) -> PartialWriter:
            return self

        def __exit__(self, *_args: object) -> None:
            self.handle.close()

        def write(self, data: bytes) -> int:
            self.handle.write(data[:1])
            self.handle.flush()
            raise OSError("simulated disk full")

    def failing_open(path: Path, mode: str = "r", *args: Any, **kwargs: Any) -> Any:
        if path == target and mode == "xb":
            return PartialWriter()
        return original_open(path, mode, *args, **kwargs)

    monkeypatch.setattr(Path, "open", failing_open)

    with pytest.raises(cli.BuildIntentCliError, match="cannot stage"):
        cli._stage_attachments(
            manifest,
            tmp_path,
            run_path / "intent.json",
        )

    assert not target.exists()


def test_write_new_removes_partial_intent_on_write_failure(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cli = load_cli()
    intent_path = tmp_path / "intent.json"
    original_open = Path.open

    class PartialWriter:
        def __init__(self) -> None:
            self.handle = original_open(
                intent_path,
                "x",
                encoding="utf-8",
                newline="\n",
            )

        def __enter__(self) -> PartialWriter:
            return self

        def __exit__(self, *_args: object) -> None:
            self.handle.close()

        def write(self, data: str) -> int:
            self.handle.write(data[:1])
            self.handle.flush()
            raise OSError("simulated disk full")

    def failing_open(path: Path, mode: str = "r", *args: Any, **kwargs: Any) -> Any:
        if path == intent_path and mode == "x":
            return PartialWriter()
        return original_open(path, mode, *args, **kwargs)

    monkeypatch.setattr(Path, "open", failing_open)

    with pytest.raises(cli.BuildIntentCliError, match="cannot write intent"):
        cli._write_new(intent_path, {"schema_version": "1.0.0"})

    assert not intent_path.exists()


def test_stage_attachments_streams_without_whole_file_read(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cli = load_cli()
    run_path = tmp_path / "run"
    run_path.mkdir()
    source = tmp_path / "structures.csv"
    attachment_bytes = b"id,structure\nethanol,CCO\n"
    source.write_bytes(attachment_bytes)
    manifest = support.attachment_manifest(
        [
            {
                "attachment_id": "structures-csv",
                "display_name": source.name,
                "media_type": "text/csv",
                "sha256": hashlib.sha256(attachment_bytes).hexdigest(),
                "size_bytes": len(attachment_bytes),
            }
        ]
    )
    original_read_bytes = Path.read_bytes

    def reject_whole_file_read(path: Path) -> bytes:
        if path == source:
            raise AssertionError("attachment must be streamed")
        return original_read_bytes(path)

    monkeypatch.setattr(Path, "read_bytes", reject_whole_file_read)

    created = cli._stage_attachments(
        manifest,
        tmp_path,
        run_path / "intent.json",
    )

    target = run_path / "structures-csv"
    assert created == [target]
    assert original_read_bytes(target) == attachment_bytes
