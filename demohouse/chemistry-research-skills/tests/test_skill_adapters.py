from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_ROOT = REPOSITORY_ROOT / "workflows" / "scripts"


def load_module(name: str, filename: str):
    path = SCRIPTS_ROOT / filename
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


ADAPTERS_MODULE = load_module("skill_adapters_test", "skill_adapters.py")
ADAPTERS = ADAPTERS_MODULE.ADAPTERS


def resolve_context() -> dict:
    return {
        "request_path": "/run/request.json",
        "sources": [],
        "include_related": False,
        "use_standardizer": True,
        "standardization_profile": "chembl-pipeline",
        "timeout_seconds": 20,
        "retries": 1,
        "generated_at_utc": "2026-08-17T12:00:00Z",
        "output_path": "/run/output.json",
    }


def fixture_adapter() -> object:
    return ADAPTERS_MODULE.AdapterSpec(
        adapter_id="fixture-v1",
        adapter_version="1.0.0",
        skill_id="fixture",
        entrypoint="skills/fixture/scripts/run.py",
        validator="skills/fixture/scripts/validate_output.py",
        accepted_completion_codes=frozenset({0}),
        artifact_workflow="fixture-workflow",
        artifact_schema_version="1.0.0",
        extractor_id="fixture",
        required_context=frozenset(),
        optional_context=frozenset(),
    )


def test_all_seven_adapters_use_public_cli_and_validator():
    expected_skills = {
        "resolve-chemical-identities",
        "standardize-chemical-structures",
        "compute-molecular-features",
        "search-and-curate-chemical-libraries",
        "curate-reactions",
        "search-reactions",
        "review-routes",
    }

    assert {item.skill_id for item in ADAPTERS.values()} == expected_skills
    for adapter in ADAPTERS.values():
        assert adapter.entrypoint.startswith(f"skills/{adapter.skill_id}/scripts/")
        assert adapter.validator == (
            f"skills/{adapter.skill_id}/scripts/validate_output.py"
        )


def test_adapter_completion_codes_match_public_cli_behavior():
    assert ADAPTERS["resolve-chemical-identities-v1"].accepted_completion_codes == {
        0,
        2,
    }
    assert ADAPTERS["standardize-chemical-structures-v1"].accepted_completion_codes == {
        0,
        2,
    }
    assert ADAPTERS["compute-molecular-features-v1"].accepted_completion_codes == {
        0,
        2,
    }
    assert ADAPTERS[
        "search-and-curate-chemical-libraries-v1"
    ].accepted_completion_codes == {0, 2}
    assert ADAPTERS["curate-reactions-v1"].accepted_completion_codes == {0, 1}
    assert ADAPTERS["search-reactions-v1"].accepted_completion_codes == {0, 1}
    assert ADAPTERS["review-routes-v1"].accepted_completion_codes == {0, 1}


def test_resolve_command_is_built_from_exact_context():
    command = ADAPTERS_MODULE.build_command(
        "resolve-chemical-identities-v1",
        resolve_context(),
    )

    assert command == [
        sys.executable,
        "skills/resolve-chemical-identities/scripts/resolve_identities.py",
        "--request",
        "/run/request.json",
        "--sources",
        "",
        "--standardization-profile",
        "chembl-pipeline",
        "--timeout",
        "20",
        "--retries",
        "1",
        "--generated-at",
        "2026-08-17T12:00:00Z",
        "--output",
        "/run/output.json",
    ]


def test_resolve_command_accepts_public_cli_zero_retry_contract():
    context = resolve_context()
    context["retries"] = 0

    command = ADAPTERS_MODULE.build_command(
        "resolve-chemical-identities-v1",
        context,
    )

    assert command[command.index("--retries") + 1] == "0"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("timeout_seconds", 0),
        ("timeout_seconds", 61),
        ("retries", -1),
        ("retries", 4),
    ],
)
def test_resolve_command_matches_public_cli_transport_bounds(field, value):
    context = resolve_context()
    context[field] = value

    with pytest.raises(ADAPTERS_MODULE.AdapterError, match=field):
        ADAPTERS_MODULE.build_command(
            "resolve-chemical-identities-v1",
            context,
        )


def test_resolve_command_rejects_unhashable_controlled_values():
    context = resolve_context()
    context["sources"] = [{}]

    with pytest.raises(ADAPTERS_MODULE.AdapterError, match="sources"):
        ADAPTERS_MODULE.build_command(
            "resolve-chemical-identities-v1",
            context,
        )


def test_user_context_cannot_override_command():
    context = resolve_context()
    context["command"] = ["sh", "-c", "unsafe"]

    with pytest.raises(ADAPTERS_MODULE.AdapterError, match="unknown context"):
        ADAPTERS_MODULE.build_command(
            "resolve-chemical-identities-v1",
            context,
        )


def test_execute_rejects_untrusted_executable_before_running():
    adapter = ADAPTERS["resolve-chemical-identities-v1"]

    with pytest.raises(ADAPTERS_MODULE.AdapterError, match="Python executable"):
        ADAPTERS_MODULE.execute_adapter(
            adapter,
            ["sh", adapter.entrypoint, "--help"],
            repository_root=REPOSITORY_ROOT,
            timeout_seconds=2,
        )


def test_process_exit_code_requires_output_artifact(tmp_path):
    result = ADAPTERS_MODULE.ProcessResult(
        returncode=0,
        stdout="",
        stderr="",
    )

    with pytest.raises(ADAPTERS_MODULE.AdapterError, match="output artifact"):
        ADAPTERS_MODULE.accept_process_result(
            fixture_adapter(),
            result,
            tmp_path / "missing.json",
        )


def test_validator_report_must_be_valid_json_object(tmp_path):
    adapter = fixture_adapter()
    validator = tmp_path / adapter.validator
    validator.parent.mkdir(parents=True)
    validator.write_text(
        "print('not-json')\n",
        encoding="utf-8",
    )
    output = tmp_path / "output.json"
    output.write_text("{}", encoding="utf-8")

    with pytest.raises(ADAPTERS_MODULE.AdapterError, match="validator JSON"):
        ADAPTERS_MODULE.run_validator(
            adapter,
            output,
            repository_root=tmp_path,
            timeout_seconds=2,
        )


def test_text_validator_rejects_unexpected_success_message(tmp_path):
    adapter = ADAPTERS["curate-reactions-v1"]
    validator = tmp_path / adapter.validator
    validator.parent.mkdir(parents=True)
    validator.write_text(
        "print('unexpected-success-text')\n",
        encoding="utf-8",
    )
    output = tmp_path / "output.json"
    output.write_text("{}", encoding="utf-8")

    with pytest.raises(ADAPTERS_MODULE.AdapterError, match="success text"):
        ADAPTERS_MODULE.run_validator(
            adapter,
            output,
            repository_root=tmp_path,
            timeout_seconds=2,
        )


def test_validator_report_rejects_non_finite_json(tmp_path):
    adapter = fixture_adapter()
    validator = tmp_path / adapter.validator
    validator.parent.mkdir(parents=True)
    validator.write_text(
        'print(\'{"valid": true, "score": NaN}\')\n',
        encoding="utf-8",
    )
    output = tmp_path / "output.json"
    output.write_text("{}", encoding="utf-8")

    with pytest.raises(ADAPTERS_MODULE.AdapterError, match="non-finite"):
        ADAPTERS_MODULE.run_validator(
            adapter,
            output,
            repository_root=tmp_path,
            timeout_seconds=2,
        )


def test_domain_extractors_keep_review_and_blocked_distinct():
    ready = ADAPTERS_MODULE.extract_domain_state(
        ADAPTERS["search-reactions-v1"],
        {"provider_status": "completed_zero_hits"},
    )
    review = ADAPTERS_MODULE.extract_domain_state(
        ADAPTERS["search-reactions-v1"],
        {"provider_status": "source_timeout"},
    )
    blocked = ADAPTERS_MODULE.extract_domain_state(
        ADAPTERS["search-reactions-v1"],
        {"provider_status": "blocked"},
    )

    assert (ready, review, blocked) == (
        "completed",
        "review_required",
        "blocked",
    )


def test_self_check_is_read_only_and_complete():
    report = ADAPTERS_MODULE.self_check(REPOSITORY_ROOT)

    assert report == {
        "valid": True,
        "adapter_count": 7,
        "errors": [],
    }
    json.dumps(report)
