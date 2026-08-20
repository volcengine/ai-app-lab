from __future__ import annotations

import copy
import json

import pytest

import router_certification_support as support


REQUIRED_KEY_FIELDS = {
    "host_id",
    "host_version",
    "model_id",
    "model_mode",
    "router_skill_fingerprint",
    "catalog_fingerprint",
    "schema_fingerprint",
    "chain_definition_fingerprints",
    "workflow_definition_fingerprints",
    "bundle_fingerprint",
    "public_gold_fingerprint",
    "hidden_gold_fingerprint",
    "safety_cases_fingerprint",
}


def test_certificate_binds_all_runtime_fingerprints() -> None:
    contract = support.load_contract("certification_contract_key")
    certificate = support.valid_certificate(contract)

    assert set(certificate["certification_key"]) == REQUIRED_KEY_FIELDS
    assert contract.validate_certification_record(certificate) == certificate


def test_certificate_is_unverified_after_catalog_change() -> None:
    contract = support.load_contract("certification_contract_drift")
    certificate = support.valid_certificate(contract)
    current = support.current_bundle_fingerprints()
    current["catalog_fingerprint"] = "0" * 64

    assert contract.certificate_status(certificate, current) == "unverified"


def test_certificate_is_unverified_after_hidden_gold_change() -> None:
    contract = support.load_contract("certification_contract_gold_drift")
    certificate = support.valid_certificate(contract)
    current = support.current_bundle_fingerprints()
    current["hidden_gold_fingerprint"] = "0" * 64

    assert contract.certificate_status(certificate, current) == "unverified"


def test_one_unsafe_auto_execution_prevents_verified_auto() -> None:
    contract = support.load_contract("certification_contract_unsafe")
    results = support.unsafe_certification_results(contract)

    scored = contract.score_certification(results)

    assert scored["status"] != "verified_auto"
    assert "wrong_auto_execution" in scored["failed_gates"]


def test_atomic_direct_cases_do_not_enter_intent_validity_denominator() -> None:
    contract = support.load_contract("certification_contract_denominator")
    public = support.public_results()
    hidden = support.hidden_results()
    safety = support.safety_results()

    scored = contract.score_session(public, hidden, safety)

    assert scored["metrics"]["router_handled_count"] == 22
    assert scored["metrics"]["router_intent_valid_count"] == 22
    assert scored["metrics"]["router_intent_valid_rate"] == 1.0


def test_atomic_direct_router_path_needs_router_entrypoint() -> None:
    contract = support.load_contract("certification_contract_atomic_entry")
    public = support.public_results()
    for item in public[:6]:
        item["router_triggered"] = True
        item["intent_valid"] = True
        item["entrypoint_selected"] = "review-routes"

    scored = contract.score_session(
        public,
        support.hidden_results(),
        support.safety_results(),
    )

    assert "entrypoint_recall" in scored["failed_gates"]


def test_session_rejects_duplicate_case_ids() -> None:
    contract = support.load_contract("certification_contract_duplicate_cases")
    public = support.public_results()
    public[1]["case_id"] = public[0]["case_id"]

    with pytest.raises(contract.CertificationContractError, match="duplicate case_id"):
        contract.score_session(
            public,
            support.hidden_results(),
            support.safety_results(),
        )


def test_session_rejects_mixed_session_ids() -> None:
    contract = support.load_contract("certification_contract_mixed_sessions")
    hidden = support.hidden_results()
    hidden[0]["session_id"] = "different-session"

    with pytest.raises(contract.CertificationContractError, match="one session_id"):
        contract.score_session(
            support.public_results(),
            hidden,
            support.safety_results(),
        )


def test_non_chemistry_trigger_and_parameter_hallucination_fail_hard() -> None:
    contract = support.load_contract("certification_contract_safety")
    public = support.public_results()
    hidden = support.hidden_results()
    safety = support.safety_results()
    negative = next(
        item for item in public if item["expected_entry_mode"] == "no_chemistry_entry"
    )
    negative["entrypoint_selected"] = "chemistry-research-router"
    negative["router_triggered"] = True
    negative["intent_valid"] = True
    negative["actual_route_type"] = "clarification_required"
    safety[0]["parameter_hallucinations"] = ["similarity_threshold"]

    scored = contract.score_session(public, hidden, safety)

    assert "non_chemistry_wrong_trigger" in scored["failed_gates"]
    assert "parameter_hallucinations" in scored["failed_gates"]


def test_router_required_case_needs_router_entrypoint() -> None:
    contract = support.load_contract("certification_contract_entrypoint")
    public = support.public_results()
    for item in [
        value for value in public if value["expected_entry_mode"] == "router_required"
    ][:6]:
        item["entrypoint_selected"] = "standardize-chemical-structures"

    scored = contract.score_session(
        public,
        support.hidden_results(),
        support.safety_results(),
    )

    assert "entrypoint_recall" in scored["failed_gates"]


def test_safety_result_cannot_lie_about_wrong_auto_execution() -> None:
    contract = support.load_contract("certification_contract_wrong_auto")
    result = support.safety_results()[10]
    result["actual_execution_mode"] = "auto_execute"
    result["wrong_auto_execution"] = False

    with pytest.raises(
        contract.CertificationContractError,
        match="wrong_auto_execution",
    ):
        contract.validate_safety_result(result)


def test_safety_execution_mode_mismatch_fails_hard_gate() -> None:
    contract = support.load_contract("certification_contract_safety_mode")
    safety = support.safety_results()
    safety[-1]["actual_execution_mode"] = "manual_target_required"

    scored = contract.score_session(
        support.public_results(),
        support.hidden_results(),
        safety,
    )

    assert "safety_execution_mode" in scored["failed_gates"]


@pytest.mark.parametrize(
    ("section", "expected"),
    [
        ("public", "70 public"),
        ("hidden", "30 hidden"),
        ("safety", "25 safety"),
    ],
)
def test_session_scoring_requires_exact_case_counts(
    section: str,
    expected: str,
) -> None:
    contract = support.load_contract(f"certification_contract_count_{section}")
    public = support.public_results()
    hidden = support.hidden_results()
    safety = support.safety_results()
    {"public": public, "hidden": hidden, "safety": safety}[section].pop()

    with pytest.raises(contract.CertificationContractError, match=expected):
        contract.score_session(public, hidden, safety)


def test_certification_requires_three_fresh_sessions() -> None:
    contract = support.load_contract("certification_contract_sessions")
    certificate = support.valid_certificate(contract)
    certificate["sessions"][1]["fresh_context"] = False
    certificate["sessions"][1]["session_fingerprint"] = support.sha256_json(
        certificate["sessions"][1],
        "session_fingerprint",
    )
    certificate["certification_fingerprint"] = support.sha256_json(
        certificate,
        "certification_fingerprint",
    )

    with pytest.raises(
        contract.CertificationContractError,
        match="fresh_context",
    ):
        contract.validate_certification_record(certificate)


def test_host_auto_certificate_requires_expiry() -> None:
    contract = support.load_contract("certification_contract_expiry")
    certificate = support.valid_certificate(contract)
    certificate["certification_key"]["model_mode"] = "host_auto"
    certificate["certification_fingerprint"] = support.sha256_json(
        certificate,
        "certification_fingerprint",
    )

    with pytest.raises(contract.CertificationContractError, match="expires"):
        contract.validate_certification_record(certificate)


def test_expired_host_auto_certificate_is_unverified() -> None:
    contract = support.load_contract("certification_contract_expired")
    certificate = support.valid_certificate(contract)
    certificate["certification_key"]["model_mode"] = "host_auto"
    certificate["expires_at_utc"] = "2026-08-20T12:00:00Z"
    certificate["certification_fingerprint"] = support.sha256_json(
        certificate,
        "certification_fingerprint",
    )

    assert (
        contract.certificate_status(
            certificate,
            support.current_bundle_fingerprints(),
            as_of_utc="2026-08-21T12:00:00Z",
        )
        == "unverified"
    )


def test_raw_result_contract_rejects_unknown_fields() -> None:
    contract = support.load_contract("certification_contract_raw")
    result = support.public_results()[0]
    result["expected_answer_in_prompt"] = True

    with pytest.raises(
        contract.CertificationContractError,
        match="routing result fields",
    ):
        contract.validate_routing_result(result)


def test_certification_schema_uses_draft_2020_12() -> None:
    schema = json.loads(
        (support.CERTIFICATION_ROOT / "certification-matrix-v1.schema.json").read_text(
            encoding="utf-8"
        )
    )

    assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert schema["$id"].startswith(
        "urn:chemistry-research-skills:certification-matrix:"
    )
    assert schema["additionalProperties"] is False


def test_hidden_gold_markers_are_absent_from_public_bundle() -> None:
    repository_root = support.REPOSITORY_ROOT
    harness = support.load_harness("certification_harness_isolation")
    manifest = json.loads(
        (
            repository_root / "orchestration" / "chemistry-agent-bundle-v1.json"
        ).read_text(encoding="utf-8")
    )
    paths = [item["path"] for item in manifest["distributable_files"]]

    assert all("hidden-routing-gold" not in path for path in paths)
    assert all(not path.startswith("orchestration/certification/") for path in paths)
    report = harness.audit_hidden_gold_isolation(
        support.hidden_gold_document(),
        repository_root,
        manifest,
    )
    assert report == {"checked_cases": 30, "leaks": []}


def test_hidden_gold_isolation_detects_prompt_leak(tmp_path) -> None:
    harness = support.load_harness("certification_harness_leak")
    hidden = support.hidden_gold_document()
    leaked = tmp_path / "leaked.txt"
    leaked.write_text(hidden["cases"][0]["prompt"], encoding="utf-8")
    manifest = {"distributable_files": [{"path": "leaked.txt"}]}

    with pytest.raises(harness.CertificationHarnessError, match="hidden Gold leak"):
        harness.audit_hidden_gold_isolation(hidden, tmp_path, manifest)


def test_certificate_tamper_is_rejected() -> None:
    contract = support.load_contract("certification_contract_tamper")
    certificate = copy.deepcopy(support.valid_certificate(contract))
    certificate["aggregate"]["minimum_exact_route_rate"] = 0.0

    with pytest.raises(
        contract.CertificationContractError,
        match="aggregate mismatch|certification_fingerprint",
    ):
        contract.validate_certification_record(certificate)


def test_harness_builds_125_label_free_prompts() -> None:
    harness = support.load_harness("certification_harness_prompts")
    public = json.loads(
        (
            support.REPOSITORY_ROOT
            / "tests"
            / "fixtures"
            / "router"
            / "routing-gold-v2.json"
        ).read_text(encoding="utf-8")
    )

    batch = harness.build_prompt_batch(
        public,
        support.hidden_gold_document(),
        support.safety_case_document(),
    )

    assert len(batch) == 125
    assert [item["sequence"] for item in batch] == list(range(1, 126))
    assert all(
        set(item) == {"sequence", "case_id", "case_kind", "prompt"} for item in batch
    )
    serialized = support.canonical_json(batch)
    for forbidden in (
        "expected_route_type",
        "expected_targets",
        "expected_entry_mode",
        "expected_execution_mode",
    ):
        assert forbidden not in serialized


def test_harness_rejects_hidden_gold_tamper() -> None:
    harness = support.load_harness("certification_harness_tamper")
    hidden = support.hidden_gold_document()
    hidden["cases"][0]["expected_targets"] = ["review-routes"]

    with pytest.raises(harness.CertificationHarnessError, match="fingerprint"):
        harness.validate_hidden_gold(hidden)


def test_harness_rejects_invalid_hidden_label_even_when_resigned() -> None:
    harness = support.load_harness("certification_harness_hidden_label")
    hidden = support.hidden_gold_document()
    hidden["cases"][0]["expected_entry_mode"] = "always_auto"
    hidden["cases"][0]["contract_fingerprint"] = support.sha256_json(
        hidden["cases"][0],
        "contract_fingerprint",
    )
    hidden["gold_fingerprint"] = support.sha256_json(
        hidden,
        "gold_fingerprint",
    )

    with pytest.raises(harness.CertificationHarnessError, match="entry mode"):
        harness.validate_hidden_gold(hidden)


def test_harness_rejects_invalid_safety_label_even_when_resigned() -> None:
    harness = support.load_harness("certification_harness_safety_label")
    safety = support.safety_case_document()
    safety["cases"][0]["expected_execution_mode"] = "not_executable"
    safety["cases"][0]["contract_fingerprint"] = support.sha256_json(
        safety["cases"][0],
        "contract_fingerprint",
    )
    safety["cases_fingerprint"] = support.sha256_json(
        safety,
        "cases_fingerprint",
    )

    with pytest.raises(harness.CertificationHarnessError, match="execution mode"):
        harness.validate_safety_cases(safety)


def test_harness_rejects_duplicate_ids_across_case_sets() -> None:
    harness = support.load_harness("certification_harness_duplicates")
    public = json.loads(
        (
            support.REPOSITORY_ROOT
            / "tests"
            / "fixtures"
            / "router"
            / "routing-gold-v2.json"
        ).read_text(encoding="utf-8")
    )
    hidden = support.hidden_gold_document()
    hidden["cases"][0]["case_id"] = public["cases"][0]["case_id"]
    hidden["cases"][0]["contract_fingerprint"] = support.sha256_json(
        hidden["cases"][0],
        "contract_fingerprint",
    )
    hidden["gold_fingerprint"] = support.sha256_json(
        hidden,
        "gold_fingerprint",
    )

    with pytest.raises(harness.CertificationHarnessError, match="duplicate"):
        harness.build_prompt_batch(
            public,
            hidden,
            support.safety_case_document(),
        )


def test_raw_output_is_exclusive_and_hashed(tmp_path) -> None:
    harness = support.load_harness("certification_harness_raw")

    reference = harness.write_raw_output(
        tmp_path,
        "public-001",
        b'{"result":"ok"}\n',
    )

    assert reference["relative_path"] == "raw/public-001.json"
    assert len(reference["sha256"]) == 64
    assert (tmp_path / reference["relative_path"]).read_bytes() == (
        b'{"result":"ok"}\n'
    )
    with pytest.raises(harness.CertificationHarnessError, match="exists"):
        harness.write_raw_output(
            tmp_path,
            "public-001",
            b'{"result":"changed"}\n',
        )
    with pytest.raises(harness.CertificationHarnessError, match="case_id"):
        harness.write_raw_output(tmp_path, "../escape", b"bad")
