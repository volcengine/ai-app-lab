#!/usr/bin/env python3
"""Search Artifact contract consumed by review-routes."""

import hashlib
import importlib.util
import json
import math
import re
from pathlib import Path
from typing import Any

SCHEMA = "1.0.0"
WORKFLOW = "search-reactions"
RULESET = "1.1.0"
CONTRACT_ERROR = "E-SEARCH-CONTRACT-001"
FINGERPRINT_ERROR = "E-SEARCH-FINGERPRINT-001"
QUERY_ERROR = "E-SEARCH-QUERY-001"
STATE_ERROR = "E-SEARCH-STATE-001"
OPERATIONS = {
    "lookup_reaction",
    "search_components",
    "search_transformations",
    "search_similar_reactions",
}
PROVIDERS = {"local_curated_corpus", "ord_public_api"}
PROVIDER_STATUSES = {
    "completed",
    "completed_zero_hits",
    "partial",
    "blocked",
    "source_timeout",
    "source_error",
}
PROFILE_METRICS = {
    "rdkit-difference-atompair-v1": "dice",
    "rdkit-structural-atompair-v1": "tanimoto",
}
QUERY_OPTION_FIELDS = (
    "fingerprint_profile_id",
    "top_k",
    "threshold",
    "candidate_limit",
    "include_review_required",
    "use_stereochemistry",
)
TEMPORAL_KEYS = {
    "generated_at_utc",
    "retrieved_at_utc",
    "runtime_seconds",
    "elapsed_seconds",
    "result_fingerprint",
}
REQUIRED_TOP = set(
    "schema_version workflow ruleset_version generated_at_utc operation provider "
    "provider_status tool_versions query_interpretation options corpus_provenance "
    "corpus_summary results excluded_records review_queue errors warnings notices "
    "runtime_seconds result_fingerprint".split()
)


def _load_result_contract() -> Any:
    path = Path(__file__).with_name("searched_result_contract.py")
    spec = importlib.util.spec_from_file_location("searched_result_contract", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load result contract: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


RESULT_CONTRACT = _load_result_contract()


def _json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def _sha256_json(value: Any) -> str:
    return hashlib.sha256(_json(value).encode("utf-8")).hexdigest()


def _without_temporal(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: _without_temporal(item)
            for key, item in value.items()
            if key not in TEMPORAL_KEYS
        }
    if isinstance(value, list):
        return [_without_temporal(item) for item in value]
    return value


def searched_artifact_fingerprint(artifact: dict[str, Any]) -> str:
    return _sha256_json(_without_temporal(artifact))


def query_fingerprint(artifact: dict[str, Any]) -> str:
    interpretation = artifact["query_interpretation"]
    options = artifact["options"]
    payload = {field: options[field] for field in QUERY_OPTION_FIELDS}
    payload.update(
        {
            "operation": artifact["operation"],
            "provider": artifact["provider"],
            "query": interpretation["query"],
        }
    )
    return _sha256_json(payload)


def _issue(code: str, path: str, detail: str) -> dict[str, str]:
    return {"code": code, "field_path": path, "detail": detail}


def _issues(
    code: str,
    checks: tuple[tuple[str, bool, str], ...],
) -> list[dict[str, str]]:
    return [_issue(code, path, detail) for path, invalid, detail in checks if invalid]


def _is_sha256(value: Any) -> bool:
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) is not None


def _is_finite_number(value: Any) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def _validate_envelope(value: dict[str, Any]) -> list[dict[str, str]]:
    missing = REQUIRED_TOP - set(value)
    runtime = value.get("runtime_seconds")
    checks = (
        ("$", bool(missing), f"missing {sorted(missing)}"),
        ("schema_version", value.get("schema_version") != SCHEMA, "invalid"),
        ("workflow", value.get("workflow") != WORKFLOW, "invalid"),
        ("ruleset_version", value.get("ruleset_version") != RULESET, "invalid"),
        ("operation", value.get("operation") not in OPERATIONS, "invalid"),
        ("provider", value.get("provider") not in PROVIDERS, "invalid"),
        (
            "provider_status",
            value.get("provider_status") not in PROVIDER_STATUSES,
            "invalid",
        ),
        ("tool_versions", not isinstance(value.get("tool_versions"), dict), "invalid"),
        (
            "generated_at_utc",
            not isinstance(value.get("generated_at_utc"), str),
            "invalid",
        ),
        (
            "runtime_seconds",
            not _is_finite_number(runtime) or runtime < 0,
            "invalid",
        ),
    )
    issues = _issues(CONTRACT_ERROR, checks)
    array_fields = (
        "results",
        "excluded_records",
        "review_queue",
        "errors",
        "warnings",
        "notices",
    )
    issues.extend(
        _issue(CONTRACT_ERROR, field, "must be array")
        for field in array_fields
        if not isinstance(value.get(field), list)
    )
    versions = value.get("tool_versions")
    if isinstance(versions, dict):
        expected = {
            "rdkit": {"2025.9.2", "2025.09.2"},
            "ord-schema": {"0.8.3"},
            "search-reactions": {RULESET},
        }
        issues.extend(
            _issue(CONTRACT_ERROR, f"tool_versions.{field}", "invalid")
            for field, allowed in expected.items()
            if versions.get(field) not in allowed
        )
    return issues


def _validate_options(value: Any, operation: Any) -> list[dict[str, str]]:
    if not isinstance(value, dict):
        return [_issue(QUERY_ERROR, "options", "must be object")]
    top_k = value.get("top_k")
    limit = value.get("candidate_limit")
    threshold = value.get("threshold")
    profile = value.get("fingerprint_profile_id")
    profile_invalid = (
        profile not in PROFILE_METRICS
        if operation == "search_similar_reactions"
        else profile is not None
    )
    checks = (
        ("options", bool(set(QUERY_OPTION_FIELDS) - set(value)), "missing fields"),
        (
            "options.top_k",
            type(top_k) is not int or not 1 <= top_k <= 100,
            "invalid",
        ),
        (
            "options.candidate_limit",
            type(limit) is not int or not 1 <= limit <= 1000,
            "invalid",
        ),
        (
            "options.threshold",
            threshold is not None
            and (not _is_finite_number(threshold) or not 0 <= threshold <= 1),
            "invalid",
        ),
        (
            "options.include_review_required",
            type(value.get("include_review_required")) is not bool,
            "invalid",
        ),
        (
            "options.use_stereochemistry",
            type(value.get("use_stereochemistry")) is not bool,
            "invalid",
        ),
        ("options.fingerprint_profile_id", profile_invalid, "invalid"),
    )
    return _issues(QUERY_ERROR, checks)


def _validate_query(
    value: Any,
    artifact: dict[str, Any],
) -> list[dict[str, str]]:
    if not isinstance(value, dict):
        return [_issue(QUERY_ERROR, "query_interpretation", "must be object")]
    options = artifact.get("options")
    options = options if isinstance(options, dict) else {}
    checks = (
        (value.get("operation") == artifact.get("operation"), "operation"),
        (value.get("provider") == artifact.get("provider"), "provider"),
        (value.get("logic") == "AND", "logic"),
        (isinstance(value.get("query"), dict), "query"),
        (
            value.get("fingerprint_profile_id")
            == options.get("fingerprint_profile_id"),
            "fingerprint_profile_id",
        ),
        (value.get("threshold") == options.get("threshold"), "threshold"),
        (
            value.get("use_stereochemistry") == options.get("use_stereochemistry"),
            "use_stereochemistry",
        ),
    )
    return [
        _issue(QUERY_ERROR, f"query_interpretation.{path}", "mismatch")
        for valid, path in checks
        if not valid
    ]


def _validate_local_provenance(
    value: dict[str, Any], status: Any
) -> list[dict[str, str]]:
    contract_status = value.get("contract_status")
    if contract_status == "valid":
        checks = (
            (
                "corpus_provenance.workflow",
                value.get("workflow") != "curate-reactions",
                "mismatch",
            ),
            (
                "corpus_provenance.schema_version",
                value.get("schema_version") != "1.0.0",
                "mismatch",
            ),
            (
                "corpus_provenance.ruleset_version",
                value.get("ruleset_version") != "1.1.0",
                "mismatch",
            ),
            (
                "corpus_provenance.artifact_fingerprint",
                not _is_sha256(value.get("artifact_fingerprint")),
                "invalid",
            ),
        )
        return _issues(CONTRACT_ERROR, checks)
    return _issues(
        CONTRACT_ERROR,
        (
            (
                "corpus_provenance.contract_status",
                contract_status not in {"invalid", "not_assessed"}
                or status != "blocked",
                "invalid",
            ),
        ),
    )


def _validate_ord_provenance(value: dict[str, Any]) -> list[dict[str, str]]:
    fields = (
        "workflow",
        "schema_version",
        "ruleset_version",
        "artifact_fingerprint",
    )
    checks = (
        (
            "corpus_provenance.contract_status",
            value.get("contract_status") != "not_applicable",
            "invalid",
        ),
        *tuple(
            (f"corpus_provenance.{field}", value.get(field) is not None, "must be null")
            for field in fields
        ),
    )
    return _issues(CONTRACT_ERROR, checks)


def _validate_corpus_provenance(
    value: Any, provider: Any, status: Any
) -> list[dict[str, str]]:
    if not isinstance(value, dict):
        return [_issue(CONTRACT_ERROR, "corpus_provenance", "must be object")]
    required = set(
        "provider workflow schema_version ruleset_version artifact_fingerprint "
        "record_count contract_status".split()
    )
    count = value.get("record_count")
    issues = _issues(
        CONTRACT_ERROR,
        (
            (
                "corpus_provenance",
                bool(required - set(value)),
                "missing fields",
            ),
            (
                "corpus_provenance.record_count",
                type(count) is not int or count < 0,
                "invalid",
            ),
            (
                "corpus_provenance.provider",
                value.get("provider") != provider,
                "mismatch",
            ),
        ),
    )
    if provider == "local_curated_corpus":
        issues.extend(_validate_local_provenance(value, status))
    elif provider == "ord_public_api":
        issues.extend(_validate_ord_provenance(value))
    return issues


def _validate_provider_state(artifact: dict[str, Any]) -> list[dict[str, str]]:
    status = artifact.get("provider_status")
    results = artifact.get("results")
    errors = artifact.get("errors")
    warnings = artifact.get("warnings")
    results = results if isinstance(results, list) else []
    errors = errors if isinstance(errors, list) else []
    warnings = warnings if isinstance(warnings, list) else []
    invalid = False
    if status == "completed":
        invalid = not results or bool(errors)
    elif status == "completed_zero_hits":
        invalid = bool(results) or bool(errors)
    elif status == "partial":
        invalid = not (errors or warnings)
    elif status in {"blocked", "source_timeout", "source_error"}:
        invalid = bool(results) or not errors
    return [_issue(STATE_ERROR, "provider_status", "state mismatch")] if invalid else []


def _validate_summary_and_queue(
    artifact: dict[str, Any],
) -> list[dict[str, str]]:
    issues = []
    summary = artifact.get("corpus_summary")
    if not isinstance(summary, dict):
        issues.append(_issue(CONTRACT_ERROR, "corpus_summary", "must be object"))
    else:
        for field in ("input_records", "searchable_records", "excluded_records"):
            value = summary.get(field)
            if type(value) is not int or value < 0:
                issues.append(
                    _issue(
                        CONTRACT_ERROR,
                        f"corpus_summary.{field}",
                        "invalid",
                    )
                )
    results = artifact.get("results")
    results = results if isinstance(results, list) else []
    expected_review = {
        result.get("reaction_id")
        for result in results
        if isinstance(result, dict)
        and result.get("curation_disposition") == "review_required"
    }
    queue = artifact.get("review_queue")
    queue = queue if isinstance(queue, list) else []
    actual_review = {
        item.get("reaction_id") for item in queue if isinstance(item, dict)
    }
    if actual_review != expected_review:
        issues.append(_issue(STATE_ERROR, "review_queue", "result IDs mismatch"))
    return issues


def validate_searched_artifact(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, dict):
        return [_issue(CONTRACT_ERROR, "$", "must be object")]
    issues = _validate_envelope(value)
    issues.extend(_validate_options(value.get("options"), value.get("operation")))
    issues.extend(_validate_query(value.get("query_interpretation"), value))
    issues.extend(
        _validate_corpus_provenance(
            value.get("corpus_provenance"),
            value.get("provider"),
            value.get("provider_status"),
        )
    )
    issues.extend(RESULT_CONTRACT.validate_results(value))
    issues.extend(_validate_provider_state(value))
    issues.extend(_validate_summary_and_queue(value))
    fingerprint = value.get("result_fingerprint")
    if not _is_sha256(fingerprint) or fingerprint != searched_artifact_fingerprint(
        value
    ):
        issues.append(_issue(FINGERPRINT_ERROR, "result_fingerprint", "mismatch"))
    return issues
