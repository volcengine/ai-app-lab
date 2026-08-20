from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
ROUTER_ROOT = REPOSITORY_ROOT / "skills" / "chemistry-research-router"
ROUTER_SCRIPTS = ROUTER_ROOT / "scripts"
ROUTER_FIXTURES = Path(__file__).resolve().parent / "fixtures" / "router"
SHA256_A = "a" * 64
SHA256_B = "b" * 64
SHA256_C = "c" * 64


def load_router_module(name: str, filename: str) -> Any:
    path = ROUTER_SCRIPTS / filename
    assert path.is_file(), f"missing Router module: {filename}"
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def install_router_bundle(project_root: Path) -> tuple[Path, Path]:
    project_root.mkdir()
    module_name = "router_test_installer_" + sha256_text(str(project_root))[:16]
    installer = load_router_module(module_name, "install_bundle.py")
    installer.install_bundle(
        "trae",
        "project",
        REPOSITORY_ROOT,
        project_root,
    )
    receipt_path = (
        project_root / ".chemistry-agent-bundle" / "installation-receipt.json"
    )
    script = (
        project_root
        / ".chemistry-agent-bundle"
        / "runtime"
        / "skills"
        / "chemistry-research-router"
        / "scripts"
        / "run_router.py"
    )
    return script, receipt_path


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def sha256_json(value: Any, excluded_field: str | None = None) -> str:
    payload = value
    if excluded_field is not None:
        assert isinstance(value, dict)
        payload = {key: item for key, item in value.items() if key != excluded_field}
    return sha256_text(canonical_json(payload))


def attachment_manifest(
    attachments: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "schema_version": "1.0.0",
        "attachments": attachments,
        "attachments_fingerprint": sha256_json(attachments),
    }


def empty_attachments() -> dict[str, Any]:
    return attachment_manifest([])


def fixed_recognizer() -> dict[str, str]:
    return {
        "host_id": "trae",
        "host_version": "1.0.0-test",
        "model_id": "fixed-test-model",
        "model_mode": "fixed",
        "router_skill_fingerprint": SHA256_A,
        "catalog_fingerprint": SHA256_B,
        "schema_fingerprint": SHA256_C,
    }


def message_span(
    source_text: str,
    selected_text: str,
    source_ref_id: str,
) -> dict[str, Any]:
    start = source_text.index(selected_text)
    return {
        "source_ref_id": source_ref_id,
        "source_kind": "message_span",
        "start": start,
        "end": start + len(selected_text),
        "text_sha256": sha256_text(selected_text),
    }


def resign(intent: dict[str, Any]) -> dict[str, Any]:
    intent["intent_fingerprint"] = sha256_json(intent, "intent_fingerprint")
    return intent


def valid_intent(
    source_text: str = "把 aspirin 解析、标准化并计算指纹",
) -> dict[str, Any]:
    source_ref = message_span(source_text, "aspirin", "span-001")
    value = {
        "schema_version": "1.0.0",
        "intent_id": "intent-test-001",
        "source": {
            "content_sha256": sha256_text(source_text),
            "language": "zh-CN",
            "message_length": len(source_text),
            "attachments_fingerprint": empty_attachments()["attachments_fingerprint"],
        },
        "recognizer": fixed_recognizer(),
        "goal": {
            "goal_type": "build_compound_evidence",
            "chain_requirement": "complete_evidence_workflow",
            "source_refs": ["span-001"],
        },
        "source_refs": [source_ref],
        "research_objects": [
            {
                "object_id": "object-001",
                "object_type": "compound_name",
                "representation": "aspirin",
                "source_refs": ["span-001"],
            }
        ],
        "requested_operations": [],
        "input_artifacts": [],
        "user_parameters": [],
        "candidate_targets": ["compound-evidence-v1"],
        "ambiguities": [],
        "unsupported_goals": [],
        "intent_fingerprint": "",
    }
    return resign(value)


def valid_library_intent(source_text: str) -> dict[str, Any]:
    value = valid_intent(source_text)
    parameter_ref = message_span(source_text, "0.7", "span-002")
    value["goal"] = {
        "goal_type": "search_or_curate_library",
        "chain_requirement": "single_operation",
        "source_refs": ["span-001"],
    }
    value["source_refs"].append(parameter_ref)
    value["requested_operations"] = [
        {
            "operation_id": "operation-001",
            "operation_type": "search_similarity",
            "sequence": 1,
            "negated": False,
            "source_refs": ["span-001"],
        }
    ]
    value["user_parameters"] = [
        {
            "parameter_id": "parameter-001",
            "field_id": "similarity_threshold",
            "value": 0.7,
            "provenance": "user_explicit",
            "source_refs": ["span-002"],
        }
    ]
    value["candidate_targets"] = ["search-and-curate-chemical-libraries"]
    return resign(value)


def valid_attachment_case(
    source_text: str = "复核 aspirin 附件中的路线",
) -> tuple[dict[str, Any], dict[str, Any]]:
    attachment = {
        "attachment_id": "attachment-001",
        "display_name": "route.json",
        "media_type": "application/json",
        "sha256": SHA256_A,
        "size_bytes": 128,
    }
    manifest = attachment_manifest([attachment])
    value = valid_intent(source_text)
    value["source"]["attachments_fingerprint"] = manifest["attachments_fingerprint"]
    value["goal"] = {
        "goal_type": "build_route_evidence_review",
        "chain_requirement": "complete_evidence_workflow",
        "source_refs": ["span-001"],
    }
    value["source_refs"] = [
        message_span(source_text, "复核", "span-001"),
        {
            "source_ref_id": "attachment-ref-001",
            "source_kind": "attachment",
            "attachment_id": "attachment-001",
            "sha256": SHA256_A,
        },
    ]
    value["research_objects"] = [
        {
            "object_id": "object-001",
            "object_type": "route_record",
            "representation": "attachment-001",
            "source_refs": ["attachment-ref-001"],
        }
    ]
    value["input_artifacts"] = [
        {
            "artifact_ref": "attachment-001",
            "role": "route_input",
            "media_type": "application/json",
            "sha256": SHA256_A,
            "source_refs": ["attachment-ref-001"],
        }
    ]
    value["candidate_targets"] = ["route-evidence-review-v1"]
    return resign(value), manifest
