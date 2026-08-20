from __future__ import annotations

import json
from collections import Counter
from typing import Any

import router_test_support as support


SOURCE_FILE_SHA256 = "8f2adf88390dfc203f50b777db8d4860dd9b37e346ab4b568553d468eca5b3a7"
SOURCE_CASES_FINGERPRINT = (
    "70a9467e02dd9b9820ada6b2dc055e4b555bf7f8c0229b4e68455b4fd93dbf7f"
)
GOLD_FINGERPRINT = "d1c547be4c1632189f3cad4df7ff47d4fc9c82978e78fe13421e12484156b848"
CHANGED_CASES = ["X01", "X04", "X06", "X08"]
EXPECTED_CHANGED_TARGETS = {
    "X01": ("workflow_a", ["compound-evidence-v1"]),
    "X04": ("workflow_b", ["route-evidence-review-v1"]),
    "X06": ("direct_skill_chain", ["structure-library-v1"]),
    "X08": ("workflow_b", ["route-evidence-review-v1"]),
}
EXPECTED_ROUTE_COUNTS = {
    "direct_skill": 56,
    "direct_skill_chain": 5,
    "workflow_a": 1,
    "workflow_b": 2,
    "clarification_required": 3,
    "unsupported": 3,
}
CASE_FIELDS = {
    "case_id",
    "source_case_id",
    "prompt",
    "old_expected",
    "expected_route_type",
    "expected_targets",
    "expected_entry_mode",
    "change_reason",
    "contract_fingerprint",
}


def load_gold() -> dict[str, Any]:
    value = json.loads(
        (support.ROUTER_FIXTURES / "routing-gold-v2.json").read_text(encoding="utf-8")
    )
    assert isinstance(value, dict)
    return value


def source_payload(cases: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "case_id": item["source_case_id"],
            "prompt": item["prompt"],
            "expected_action": item["old_expected"]["expected_action"],
            "expected_skill_chain": item["old_expected"]["expected_skill_chain"],
            "reason": item["old_expected"]["reason"],
        }
        for item in cases
    ]


def test_router_gold_v2_preserves_source_provenance() -> None:
    value = load_gold()

    assert value["source_artifact_type"] == ("chemistry-skill-routing-gold-candidate")
    assert value["source_artifact_sha256"] == SOURCE_FILE_SHA256
    assert value["source_cases_fingerprint"] == SOURCE_CASES_FINGERPRINT
    assert support.sha256_json(source_payload(value["cases"])) == (
        SOURCE_CASES_FINGERPRINT
    )
    assert len(value["cases"]) == 70
    assert len({item["source_case_id"] for item in value["cases"]}) == 70
    assert all(item["case_id"] == item["source_case_id"] for item in value["cases"])


def test_router_gold_v2_declares_only_four_migrations() -> None:
    value = load_gold()
    cases = {item["case_id"]: item for item in value["cases"]}

    assert value["changed_cases"] == CHANGED_CASES
    assert [item["source_case_id"] for item in value["migrations"]] == (CHANGED_CASES)
    assert all(
        set(item)
        == {
            "source_case_id",
            "old_expected",
            "new_expected",
            "change_reason",
            "reviewer",
        }
        for item in value["migrations"]
    )
    for case_id, (route_type, targets) in EXPECTED_CHANGED_TARGETS.items():
        assert cases[case_id]["expected_route_type"] == route_type
        assert cases[case_id]["expected_targets"] == targets
    for migration in value["migrations"]:
        case = cases[migration["source_case_id"]]
        assert migration["old_expected"] == case["old_expected"]
        assert migration["new_expected"] == {
            "route_type": case["expected_route_type"],
            "targets": case["expected_targets"],
        }
        assert migration["change_reason"] == case["change_reason"]
    assert cases["R08"]["expected_targets"] == ["search-reactions"]


def test_router_gold_v2_has_controlled_routes_and_entry_modes() -> None:
    value = load_gold()

    assert (
        Counter(item["expected_route_type"] for item in value["cases"])
        == EXPECTED_ROUTE_COUNTS
    )
    assert all(set(item) == CASE_FIELDS for item in value["cases"])
    assert all(
        item["expected_entry_mode"]
        in {
            "atomic_or_router_direct",
            "router_required",
            "no_chemistry_entry",
        }
        for item in value["cases"]
    )
    assert all(
        item["expected_entry_mode"] == "router_required"
        for item in value["cases"]
        if item["expected_route_type"]
        in {
            "direct_skill_chain",
            "workflow_a",
            "workflow_b",
            "clarification_required",
            "unsupported",
        }
    )


def test_router_gold_v2_case_fingerprints_detect_tampering() -> None:
    value = load_gold()

    for item in value["cases"]:
        assert item["contract_fingerprint"] == support.sha256_json(
            item,
            "contract_fingerprint",
        )


def test_router_gold_v2_top_level_fingerprint_is_valid() -> None:
    value = load_gold()

    assert value["gold_fingerprint"] == support.sha256_json(
        value,
        "gold_fingerprint",
    )
    assert value["gold_fingerprint"] == GOLD_FINGERPRINT
