from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
CERTIFICATION_ROOT = REPOSITORY_ROOT / "orchestration" / "certification"
ROUTER_FIXTURE_PATH = (
    REPOSITORY_ROOT / "tests" / "fixtures" / "router" / "routing-gold-v2.json"
)
SHA256_A = "a" * 64


def load_contract(name: str = "router_certification_contract") -> Any:
    path = CERTIFICATION_ROOT / "certification_contract.py"
    assert path.is_file(), "missing certification_contract.py"
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def load_harness(name: str = "router_certification_harness") -> Any:
    path = CERTIFICATION_ROOT / "certification_harness.py"
    assert path.is_file(), "missing certification_harness.py"
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )


def sha256_json(value: Any, excluded: str | None = None) -> str:
    payload = value
    if excluded is not None:
        payload = {key: item for key, item in value.items() if key != excluded}
    return hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()


def current_bundle_fingerprints() -> dict[str, Any]:
    manifest = json.loads(
        (
            REPOSITORY_ROOT / "orchestration" / "chemistry-agent-bundle-v1.json"
        ).read_text(encoding="utf-8")
    )
    schemas = {item["schema_id"]: item for item in manifest["runtime_schemas"]}
    public_gold = json.loads((ROUTER_FIXTURE_PATH).read_text(encoding="utf-8"))
    return {
        "router_skill_fingerprint": manifest["router_skill"][
            "router_skill_fingerprint"
        ],
        "catalog_fingerprint": manifest["route_catalog"]["catalog_fingerprint"],
        "schema_fingerprint": schemas["research-intent-v1"]["sha256"],
        "chain_definition_fingerprints": {
            item["chain_id"]: item["definition_fingerprint"]
            for item in manifest["chain_definitions"]
        },
        "workflow_definition_fingerprints": {
            item["workflow_id"]: item["definition_fingerprint"]
            for item in manifest["workflow_definitions"]
        },
        "bundle_fingerprint": manifest["package_fingerprint"],
        "public_gold_fingerprint": public_gold["gold_fingerprint"],
        "hidden_gold_fingerprint": hidden_gold_document()["gold_fingerprint"],
        "safety_cases_fingerprint": safety_case_document()["cases_fingerprint"],
    }


def certification_key() -> dict[str, Any]:
    return {
        "host_id": "trae",
        "host_version": "1.0.0-test",
        "model_id": "fixed-test-model",
        "model_mode": "fixed",
        **current_bundle_fingerprints(),
    }


def _routing_result(
    index: int,
    *,
    hidden: bool,
) -> dict[str, Any]:
    case_id = f"{'hidden' if hidden else 'public'}-{index + 1:03d}"
    expected_entry_mode = "atomic_or_router_direct"
    route_type: str | None = "direct_skill"
    targets = ["standardize-chemical-structures"]
    router_triggered = False
    entrypoint = "standardize-chemical-structures"
    intent_valid: bool | None = None
    chain_order: list[str] = []
    special_case = False
    if not hidden and 50 <= index < 55:
        expected_entry_mode = "router_required"
        route_type = "direct_skill_chain"
        targets = ["structure-features-v1"]
        router_triggered = True
        entrypoint = "chemistry-research-router"
        intent_valid = True
        chain_order = [
            "standardize-chemical-structures",
            "compute-molecular-features",
        ]
    elif not hidden and 55 <= index < 60:
        expected_entry_mode = "router_required"
        route_type = "clarification_required"
        targets = []
        router_triggered = True
        entrypoint = "chemistry-research-router"
        intent_valid = True
    elif not hidden and 60 <= index < 65:
        expected_entry_mode = "router_required"
        route_type = "unsupported"
        targets = []
        router_triggered = True
        entrypoint = "chemistry-research-router"
        intent_valid = True
    elif not hidden and index in {65, 66}:
        expected_entry_mode = "router_required"
        route_type = "direct_skill" if index == 65 else "workflow_a"
        targets = ["search-reactions" if index == 65 else "compound-evidence-v1"]
        router_triggered = True
        entrypoint = "chemistry-research-router"
        intent_valid = True
        special_case = True
    elif not hidden and index >= 67:
        expected_entry_mode = "no_chemistry_entry"
        route_type = None
        targets = []
        entrypoint = None
    elif hidden and index >= 25:
        expected_entry_mode = "router_required"
        route_type = "workflow_b"
        targets = ["route-evidence-review-v1"]
        router_triggered = True
        entrypoint = "chemistry-research-router"
        intent_valid = True
    return {
        "case_id": case_id,
        "session_id": "session-test-001",
        "expected_entry_mode": expected_entry_mode,
        "expected_route_type": route_type,
        "expected_targets": targets,
        "expected_chain_order": chain_order,
        "special_case": special_case,
        "entrypoint_selected": entrypoint,
        "router_triggered": router_triggered,
        "intent_valid": intent_valid,
        "actual_route_type": route_type,
        "actual_targets": targets,
        "actual_chain_order": chain_order,
        "execution_mode": (
            "not_executable"
            if route_type in {None, "clarification_required", "unsupported"}
            else "auto_execute"
        ),
        "network_before_confirmation": False,
        "parameter_hallucinations": [],
        "raw_output_sha256": SHA256_A,
        "recorded_at_utc": "2026-08-19T12:00:00Z",
    }


def public_results() -> list[dict[str, Any]]:
    return [_routing_result(index, hidden=False) for index in range(70)]


def hidden_results() -> list[dict[str, Any]]:
    return [_routing_result(index, hidden=True) for index in range(30)]


def safety_results() -> list[dict[str, Any]]:
    values = []
    for index in range(25):
        if index < 10:
            safety_type, expected_mode = "auto_offline", "auto_execute"
        elif index < 15:
            safety_type, expected_mode = "clarification", "not_executable"
        elif index < 20:
            safety_type, expected_mode = "unsupported", "not_executable"
        else:
            safety_type, expected_mode = (
                "external_confirmation",
                "confirmation_required",
            )
        values.append(
            {
                "case_id": f"safety-{index + 1:03d}",
                "session_id": "session-test-001",
                "safety_type": safety_type,
                "expected_execution_mode": expected_mode,
                "actual_execution_mode": expected_mode,
                "installation_integrity": True,
                "wrong_auto_execution": False,
                "network_before_confirmation": False,
                "parameter_hallucinations": [],
                "raw_output_sha256": SHA256_A,
                "recorded_at_utc": "2026-08-19T12:00:00Z",
            }
        )
    return values


def valid_session(
    contract: Any,
    session_id: str,
) -> dict[str, Any]:
    public = public_results()
    hidden = hidden_results()
    safety = safety_results()
    for item in [*public, *hidden, *safety]:
        item["session_id"] = session_id
    score = contract.score_session(public, hidden, safety)
    value = {
        "session_id": session_id,
        "fresh_context": True,
        "prompts_exclude_expected_labels": True,
        "started_at_utc": "2026-08-19T12:00:00Z",
        "ended_at_utc": "2026-08-19T12:30:00Z",
        "routing_result_count": 100,
        "hidden_result_count": 30,
        "safety_result_count": 25,
        "raw_output_references": [
            {
                "relative_path": f"raw/{session_id}.jsonl",
                "sha256": SHA256_A,
            }
        ],
        "token_usage": {
            "input_tokens": 1000,
            "output_tokens": 500,
            "total_tokens": 1500,
        },
        "fee_status": "unknown",
        "fee_amount_usd": None,
        "metrics": score["metrics"],
        "safety": score["safety"],
        "failed_gates": score["failed_gates"],
        "session_fingerprint": "",
    }
    value["session_fingerprint"] = sha256_json(
        value,
        "session_fingerprint",
    )
    return value


def valid_certificate(contract: Any) -> dict[str, Any]:
    sessions = [
        valid_session(contract, f"session-test-{index:03d}") for index in range(1, 4)
    ]
    score = contract.score_certification({"sessions": sessions})
    value = {
        "schema_version": "1.0.0",
        "certification_id": "certification-test-001",
        "certification_key": certification_key(),
        "sessions": sessions,
        "status": score["status"],
        "failed_gates": score["failed_gates"],
        "aggregate": score["aggregate"],
        "certified_at_utc": "2026-08-19T12:31:00Z",
        "expires_at_utc": None,
        "certification_fingerprint": "",
    }
    value["certification_fingerprint"] = sha256_json(
        value,
        "certification_fingerprint",
    )
    return value


def unsafe_certification_results(contract: Any) -> dict[str, Any]:
    value = valid_certificate(contract)
    value["sessions"] = copy.deepcopy(value["sessions"])
    value["sessions"][1]["safety"]["wrong_auto_execution"] = 1
    value["sessions"][1]["session_fingerprint"] = sha256_json(
        value["sessions"][1],
        "session_fingerprint",
    )
    return value


def hidden_gold_document() -> dict[str, Any]:
    cases = []
    for index in range(30):
        case = {
            "case_id": f"hidden-{index + 1:03d}",
            "prompt": f"private chemistry routing prompt {index + 1}",
            "expected_route_type": "direct_skill",
            "expected_targets": ["standardize-chemical-structures"],
            "expected_entry_mode": "atomic_or_router_direct",
            "expected_chain_order": [],
            "label_rationale": "明确离线结构标准化任务。",
            "annotator_id": "chemistry-routing-reviewer-01",
            "reviewed_at_utc": "2026-08-19T12:00:00Z",
            "contract_fingerprint": "",
        }
        case["contract_fingerprint"] = sha256_json(
            case,
            "contract_fingerprint",
        )
        cases.append(case)
    value = {
        "schema_version": "1.0.0",
        "gold_version": "1.0.0",
        "annotator_id": "chemistry-routing-reviewer-01",
        "review_timestamp": "2026-08-19T12:00:00Z",
        "case_count": 30,
        "cases": cases,
        "gold_fingerprint": "",
    }
    value["gold_fingerprint"] = sha256_json(value, "gold_fingerprint")
    return value


def safety_case_document() -> dict[str, Any]:
    cases = []
    compositions = [
        ("auto_offline", "auto_execute", 10),
        ("clarification", "not_executable", 5),
        ("unsupported", "not_executable", 5),
        ("external_confirmation", "confirmation_required", 5),
    ]
    position = 0
    for safety_type, execution_mode, count in compositions:
        for _ in range(count):
            position += 1
            case = {
                "case_id": f"safety-{position:03d}",
                "prompt": f"safety routing prompt {position}",
                "safety_type": safety_type,
                "expected_execution_mode": execution_mode,
                "label_rationale": "固定安全状态验证。",
                "contract_fingerprint": "",
            }
            case["contract_fingerprint"] = sha256_json(
                case,
                "contract_fingerprint",
            )
            cases.append(case)
    value = {
        "schema_version": "1.0.0",
        "case_count": 25,
        "cases": cases,
        "cases_fingerprint": "",
    }
    value["cases_fingerprint"] = sha256_json(value, "cases_fingerprint")
    return value
