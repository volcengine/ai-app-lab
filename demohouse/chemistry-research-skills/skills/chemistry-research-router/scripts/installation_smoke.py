"""Run twelve offline routing smoke cases against an installed Runtime."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Any


class InstallationSmokeError(ValueError):
    """Raised when installed routing smoke cannot be executed."""


def _load(path: Path, name: str) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise InstallationSmokeError(f"cannot load installed module: {path.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


CASES = _load(
    Path(__file__).with_name("installation_smoke_cases.py"),
    "chemistry_installation_smoke_cases",
)
CASE_SPECS = CASES.CASE_SPECS


def _modules(runtime_root: Path) -> dict[str, Any]:
    scripts = runtime_root / "skills" / "chemistry-research-router" / "scripts"
    return {
        "intent": _load(scripts / "validate_intent.py", "smoke_validate_intent"),
        "catalog": _load(scripts / "route_catalog.py", "smoke_route_catalog"),
        "policy": _load(scripts / "policy_guard.py", "smoke_policy_guard"),
        "engine": _load(scripts / "route_engine.py", "smoke_route_engine"),
    }


def _attachments(contracts: Any, roles: list[str]) -> dict[str, Any]:
    items = [
        {
            "attachment_id": f"attachment-{index:02d}",
            "display_name": f"{role}.json",
            "media_type": "application/json",
            "sha256": contracts.sha256_text(f"smoke-{role}"),
            "size_bytes": len(f"smoke-{role}"),
        }
        for index, role in enumerate(roles, start=1)
    ]
    return {
        "schema_version": "1.0.0",
        "attachments": items,
        "attachments_fingerprint": contracts.sha256_json(items),
    }


def _semantic_sections(
    spec: dict[str, Any],
    attachments: dict[str, Any],
) -> tuple[
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
]:
    attachment_refs = [
        {
            "source_ref_id": f"attachment-ref-{index:02d}",
            "source_kind": "attachment",
            "attachment_id": item["attachment_id"],
            "sha256": item["sha256"],
        }
        for index, item in enumerate(attachments["attachments"], start=1)
    ]
    input_artifacts = [
        {
            "artifact_ref": item["attachment_id"],
            "role": role,
            "media_type": item["media_type"],
            "sha256": item["sha256"],
            "source_refs": [f"attachment-ref-{index:02d}"],
        }
        for index, (role, item) in enumerate(
            zip(spec["roles"], attachments["attachments"], strict=True),
            start=1,
        )
    ]
    objects = [
        {
            "object_id": f"object-{index:02d}",
            "object_type": object_type,
            "representation": f"smoke-{object_type}",
            "source_refs": ["message-001"],
        }
        for index, object_type in enumerate(spec["objects"], start=1)
    ]
    operations = [
        {
            "operation_id": f"operation-{index:02d}",
            "operation_type": operation,
            "sequence": index,
            "negated": False,
            "source_refs": ["message-001"],
        }
        for index, operation in enumerate(spec["operations"], start=1)
    ]
    return attachment_refs, input_artifacts, objects, operations


def _intent(
    spec: dict[str, Any],
    contracts: Any,
    catalog: dict[str, Any],
    manifest: dict[str, Any],
) -> tuple[dict[str, Any], str, dict[str, Any]]:
    source_text = f"installation smoke {spec['case_id']}"
    source_ref = {
        "source_ref_id": "message-001",
        "source_kind": "message_span",
        "start": 0,
        "end": len(source_text),
        "text_sha256": contracts.sha256_text(source_text),
    }
    attachments = _attachments(contracts, spec["roles"])
    attachment_refs, input_artifacts, objects, operations = _semantic_sections(
        spec,
        attachments,
    )
    schemas = {item["schema_id"]: item for item in manifest["runtime_schemas"]}
    value = {
        "schema_version": "1.0.0",
        "intent_id": f"intent-{spec['case_id']}",
        "source": {
            "content_sha256": contracts.sha256_text(source_text),
            "language": "en-US",
            "message_length": len(source_text),
            "attachments_fingerprint": attachments["attachments_fingerprint"],
        },
        "recognizer": {
            "host_id": "installation-smoke",
            "host_version": "1.0.0",
            "model_id": "none",
            "model_mode": "unknown",
            "router_skill_fingerprint": manifest["router_skill"][
                "router_skill_fingerprint"
            ],
            "catalog_fingerprint": catalog["catalog_fingerprint"],
            "schema_fingerprint": schemas["research-intent-v1"]["sha256"],
        },
        "goal": {
            "goal_type": spec["goal"],
            "chain_requirement": spec["chain"],
            "source_refs": ["message-001"],
        },
        "source_refs": [source_ref, *attachment_refs],
        "research_objects": objects,
        "requested_operations": operations,
        "input_artifacts": input_artifacts,
        "user_parameters": [],
        "candidate_targets": spec["candidates"],
        "ambiguities": spec["ambiguities"],
        "unsupported_goals": spec["unsupported"],
        "intent_fingerprint": "",
    }
    value["intent_fingerprint"] = contracts.sha256_json(
        value,
        "intent_fingerprint",
    )
    return value, source_text, attachments


def _run_case(
    spec: dict[str, Any],
    modules: dict[str, Any],
    catalog: dict[str, Any],
    manifest: dict[str, Any],
) -> dict[str, Any]:
    contracts = modules["intent"].CONTRACTS
    intent, source, attachments = _intent(
        spec,
        contracts,
        catalog,
        manifest,
    )
    validated = modules["intent"].validate_research_intent(
        intent,
        source,
        attachments,
    )
    policy = modules["policy"].evaluate_policy(validated, catalog, None)
    decision = modules["engine"].route_intent(
        validated,
        catalog,
        policy,
        None,
    )
    expected_targets = [] if spec["target"] is None else [spec["target"]]
    expected_mode = (
        "not_executable"
        if spec["route_type"] in {"clarification_required", "unsupported"}
        else "manual_target_required"
    )
    passed = (
        decision["route_type"] == spec["route_type"]
        and decision["targets"] == expected_targets
        and decision["execution_mode"] == expected_mode
        and decision["execution_authorized"] is False
    )
    return {
        "case_id": spec["case_id"],
        "category": spec["category"],
        "route_type": decision["route_type"],
        "targets": decision["targets"],
        "execution_mode": decision["execution_mode"],
        "status": "passed" if passed else "failed",
    }


def run_smoke(
    runtime_root: Path,
    manifest: dict[str, Any],
) -> dict[str, Any]:
    """Run public offline smoke cases without invoking a Host Agent."""
    modules = _modules(runtime_root)
    catalog = modules["catalog"].load_route_catalog(runtime_root)
    cases = [_run_case(spec, modules, catalog, manifest) for spec in CASE_SPECS]
    passed = sum(item["status"] == "passed" for item in cases)
    return {
        "bundle_fingerprint": manifest["package_fingerprint"],
        "total": len(cases),
        "passed": passed,
        "failed": len(cases) - passed,
        "cases": cases,
    }
