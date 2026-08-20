from __future__ import annotations

import copy
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

import router_test_support as support


SOURCE_TEXT = "把 aspirin 解析、标准化并计算指纹"


def load_intent_validator() -> Any:
    return support.load_router_module(
        "router_intent_validation_under_test",
        "validate_intent.py",
    )


def load_source_binding() -> Any:
    return support.load_router_module(
        "router_source_binding_under_test",
        "source_binding.py",
    )


def load_fixture(name: str) -> dict[str, Any]:
    value = json.loads((support.ROUTER_FIXTURES / name).read_text(encoding="utf-8"))
    assert isinstance(value, dict)
    return value


def test_valid_intent_fixture_passes_full_validation() -> None:
    validator = load_intent_validator()
    intent = load_fixture("valid-intent.json")
    attachments = load_fixture("valid-attachments.json")

    assert (
        validator.validate_research_intent(intent, SOURCE_TEXT, attachments) == intent
    )


def test_intent_rejects_forged_source_span() -> None:
    validator = load_intent_validator()
    intent = support.valid_intent(SOURCE_TEXT)
    intent["source_refs"][0]["start"] += 1
    support.resign(intent)

    with pytest.raises(validator.IntentValidationError, match="source span"):
        validator.validate_research_intent(
            intent,
            SOURCE_TEXT,
            support.empty_attachments(),
        )


def test_source_binding_uses_unicode_code_points_without_normalization() -> None:
    validator = load_intent_validator()
    source = "🙂 分析 aspirin 与 café"
    intent = support.valid_intent(source)

    assert (
        validator.validate_research_intent(
            intent,
            source,
            support.empty_attachments(),
        )
        == intent
    )

    decomposed = source.replace("é", "e\u0301")
    with pytest.raises(validator.IntentValidationError, match="source content"):
        validator.validate_research_intent(
            intent,
            decomposed,
            support.empty_attachments(),
        )


@pytest.mark.parametrize("field", ["content_sha256", "message_length"])
def test_intent_rejects_forged_source_metadata(field: str) -> None:
    validator = load_intent_validator()
    intent = support.valid_intent(SOURCE_TEXT)
    intent["source"][field] = (
        support.SHA256_A if field == "content_sha256" else len(SOURCE_TEXT) + 1
    )
    support.resign(intent)

    with pytest.raises(validator.IntentValidationError, match="source"):
        validator.validate_research_intent(
            intent,
            SOURCE_TEXT,
            support.empty_attachments(),
        )


def test_intent_rejects_agent_generated_parameter() -> None:
    validator = load_intent_validator()
    source = "查找 aspirin 的相似分子，阈值 0.7"
    intent = support.valid_library_intent(source)
    intent["user_parameters"][0]["provenance"] = "agent_inferred"
    support.resign(intent)

    with pytest.raises(validator.IntentValidationError, match="user_explicit"):
        validator.validate_research_intent(
            intent,
            source,
            support.empty_attachments(),
        )


@pytest.mark.parametrize(
    ("field_id", "value"),
    [
        ("fingerprint_profile_id", []),
        ("reaction_provider", 7),
        ("route_constraints", "unbounded free text"),
        ("inventory_snapshot", []),
        ("retry_policy", "automatic"),
    ],
)
def test_intent_rejects_invalid_controlled_parameter_value(
    field_id: str,
    value: Any,
) -> None:
    validator = load_intent_validator()
    source = "查找 aspirin 的相似分子，阈值 0.7"
    intent = support.valid_library_intent(source)
    intent["user_parameters"][0]["field_id"] = field_id
    intent["user_parameters"][0]["value"] = value
    support.resign(intent)

    with pytest.raises(validator.IntentValidationError, match="value"):
        validator.validate_research_intent(
            intent,
            source,
            support.empty_attachments(),
        )


@pytest.mark.parametrize(
    ("field_id", "value"),
    [
        ("fingerprint_profile_id", []),
        ("reaction_provider", "https://provider.invalid"),
        ("route_constraints", "free-form constraint"),
        ("inventory_snapshot", {"path": "/private/inventory.json"}),
        ("retry_policy", "automatic"),
    ],
)
def test_user_parameter_values_are_field_typed(
    field_id: str,
    value: Any,
) -> None:
    validator = load_intent_validator()
    source = "查找 aspirin 的相似分子，阈值 0.7"
    intent = support.valid_library_intent(source)
    intent["user_parameters"][0]["field_id"] = field_id
    intent["user_parameters"][0]["value"] = value
    support.resign(intent)

    with pytest.raises(validator.IntentValidationError, match="value"):
        validator.validate_research_intent(
            intent,
            source,
            support.empty_attachments(),
        )


def test_intent_rejects_unknown_nested_field() -> None:
    validator = load_intent_validator()
    intent = support.valid_intent(SOURCE_TEXT)
    intent["recognizer"]["confidence"] = 0.99
    support.resign(intent)

    with pytest.raises(validator.IntentValidationError, match="confidence"):
        validator.validate_research_intent(
            intent,
            SOURCE_TEXT,
            support.empty_attachments(),
        )


def test_intent_rejects_fingerprint_tamper() -> None:
    validator = load_intent_validator()
    intent = support.valid_intent(SOURCE_TEXT)
    intent["candidate_targets"] = ["standardize-chemical-structures"]

    with pytest.raises(validator.IntentValidationError, match="fingerprint"):
        validator.validate_research_intent(
            intent,
            SOURCE_TEXT,
            support.empty_attachments(),
        )


def test_attachment_reference_is_bound_to_manifest_hash() -> None:
    validator = load_intent_validator()
    intent, attachments = support.valid_attachment_case()
    source = "复核 aspirin 附件中的路线"

    assert (
        validator.validate_research_intent(
            intent,
            source,
            attachments,
        )
        == intent
    )

    tampered = copy.deepcopy(attachments)
    tampered["attachments"][0]["sha256"] = support.SHA256_B
    tampered["attachments_fingerprint"] = support.sha256_json(tampered["attachments"])
    tampered_intent = copy.deepcopy(intent)
    tampered_intent["source"]["attachments_fingerprint"] = tampered[
        "attachments_fingerprint"
    ]
    support.resign(tampered_intent)
    with pytest.raises(validator.IntentValidationError, match="attachment hash"):
        validator.validate_research_intent(tampered_intent, source, tampered)


def test_attachment_manifest_rejects_path_or_url() -> None:
    validator = load_intent_validator()
    intent, attachments = support.valid_attachment_case()
    attachments["attachments"][0]["path"] = "/private/route.json"
    attachments["attachments_fingerprint"] = support.sha256_json(
        attachments["attachments"]
    )

    with pytest.raises(validator.IntentValidationError, match="path"):
        validator.validate_research_intent(
            intent,
            "复核 aspirin 附件中的路线",
            attachments,
        )


def test_attachment_manifest_rejects_parent_display_name() -> None:
    validator = load_intent_validator()
    intent, attachments = support.valid_attachment_case()
    attachments["attachments"][0]["display_name"] = ".."
    attachments["attachments_fingerprint"] = support.sha256_json(
        attachments["attachments"]
    )
    intent["source"]["attachments_fingerprint"] = attachments["attachments_fingerprint"]
    support.resign(intent)

    with pytest.raises(validator.IntentValidationError, match="display_name"):
        validator.validate_research_intent(
            intent,
            "复核 aspirin 附件中的路线",
            attachments,
        )


def test_input_artifact_requires_matching_attachment_source_ref() -> None:
    validator = load_intent_validator()
    intent, attachments = support.valid_attachment_case()
    intent["input_artifacts"][0]["source_refs"] = ["span-001"]
    support.resign(intent)

    with pytest.raises(
        validator.IntentValidationError,
        match="attachment source reference",
    ):
        validator.validate_research_intent(
            intent,
            "复核 aspirin 附件中的路线",
            attachments,
        )


def test_source_binding_rejects_duplicate_and_unknown_reference_ids() -> None:
    validator = load_intent_validator()
    intent = support.valid_intent(SOURCE_TEXT)
    duplicate = copy.deepcopy(intent["source_refs"][0])
    duplicate["start"] = 0
    duplicate["end"] = 1
    duplicate["text_sha256"] = support.sha256_text(SOURCE_TEXT[0:1])
    intent["source_refs"].append(duplicate)
    support.resign(intent)

    with pytest.raises(validator.IntentValidationError, match="duplicate"):
        validator.validate_research_intent(
            intent,
            SOURCE_TEXT,
            support.empty_attachments(),
        )

    intent = support.valid_intent(SOURCE_TEXT)
    intent["research_objects"][0]["source_refs"] = ["span-missing"]
    support.resign(intent)
    with pytest.raises(validator.IntentValidationError, match="unknown source"):
        validator.validate_research_intent(
            intent,
            SOURCE_TEXT,
            support.empty_attachments(),
        )


@pytest.mark.parametrize(
    ("section", "id_field", "changed_field", "changed_value"),
    [
        ("research_objects", "object_id", "representation", "aspirin duplicate"),
        ("requested_operations", "operation_id", "negated", True),
        ("user_parameters", "parameter_id", "value", 0.8),
    ],
)
def test_intent_rejects_duplicate_semantic_ids(
    section: str,
    id_field: str,
    changed_field: str,
    changed_value: Any,
) -> None:
    validator = load_intent_validator()
    source = "查找 aspirin 的相似分子，阈值 0.7"
    intent = support.valid_library_intent(source)
    duplicate = copy.deepcopy(intent[section][0])
    duplicate[changed_field] = changed_value
    intent[section].append(duplicate)
    support.resign(intent)

    with pytest.raises(validator.IntentValidationError, match=f"duplicate {id_field}"):
        validator.validate_research_intent(
            intent,
            source,
            support.empty_attachments(),
        )


def test_source_binding_returns_validated_reference_ids() -> None:
    source_binding = load_source_binding()
    intent = support.valid_intent(SOURCE_TEXT)

    assert source_binding.validate_source_bindings(
        intent,
        SOURCE_TEXT,
        support.empty_attachments(),
    ) == ["span-001"]


def test_validate_intent_cli_outputs_only_privacy_safe_summary(
    tmp_path: Path,
) -> None:
    source_path = tmp_path / "source.txt"
    source_path.write_text(SOURCE_TEXT, encoding="utf-8")
    script = support.ROUTER_SCRIPTS / "validate_intent.py"

    completed = subprocess.run(
        [
            sys.executable,
            str(script),
            "--intent",
            str(support.ROUTER_FIXTURES / "valid-intent.json"),
            "--source",
            str(source_path),
            "--attachments",
            str(support.ROUTER_FIXTURES / "valid-attachments.json"),
        ],
        cwd=support.REPOSITORY_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr
    assert json.loads(completed.stdout) == {
        "valid": True,
        "intent_id": "intent-test-001",
        "intent_fingerprint": (
            "cc81a7683bbfb2dd0d04ace4514e9e486b84d366366ad68a378e61f230e23042"
        ),
        "source_binding": "passed",
        "errors": [],
    }
    assert SOURCE_TEXT not in completed.stdout
