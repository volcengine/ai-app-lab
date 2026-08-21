#!/usr/bin/env python3
"""Validate corpus provenance in search-reactions outputs."""

from __future__ import annotations

import re
from typing import Any


LOCAL_PROVIDER = "local_curated_corpus"
ORD_PROVIDER = "ord_public_api"
CURATE_WORKFLOW = "curate-reactions"
CURATE_SCHEMA_VERSION = "1.0.0"
CURATE_RULESET_VERSION = "1.1.0"
CONTRACT_ERROR_CODE = "E-CURATED-ARTIFACT-CONTRACT-001"
REQUIRED_FIELDS = {
    "provider",
    "workflow",
    "schema_version",
    "ruleset_version",
    "artifact_fingerprint",
    "record_count",
    "contract_status",
}


def ord_corpus_provenance() -> dict[str, Any]:
    return {
        "provider": ORD_PROVIDER,
        "workflow": None,
        "schema_version": None,
        "ruleset_version": None,
        "artifact_fingerprint": None,
        "record_count": 0,
        "contract_status": "not_applicable",
    }


def query_interpretation(
    operation: Any,
    provider: Any,
    query: dict[str, Any],
    options: dict[str, Any],
) -> dict[str, Any]:
    return {
        "operation": operation,
        "provider": provider,
        "logic": "AND",
        "query": query,
        "fingerprint_profile_id": options["fingerprint_profile_id"],
        "threshold": options["threshold"],
        "use_stereochemistry": options["use_stereochemistry"],
        "scientific_scope": (
            "仅在指定 provider、query 和 profile 下召回与排序；"
            "相似度不证明可行性、条件可迁移性或安全性。"
        ),
    }


def _shape_errors(value: Any) -> list[str]:
    if not isinstance(value, dict):
        return ["corpus_provenance 必须是 object"]
    missing = REQUIRED_FIELDS - set(value)
    if missing:
        return [f"corpus_provenance 缺少字段：{sorted(missing)!r}"]
    count = value["record_count"]
    if not isinstance(count, int) or isinstance(count, bool) or count < 0:
        return ["corpus_provenance.record_count 非法"]
    return []


def _valid_local_errors(value: dict[str, Any]) -> list[str]:
    errors = []
    expected = {
        "workflow": CURATE_WORKFLOW,
        "schema_version": CURATE_SCHEMA_VERSION,
        "ruleset_version": CURATE_RULESET_VERSION,
    }
    for field, expected_value in expected.items():
        if value[field] != expected_value:
            errors.append(f"corpus_provenance.{field} 不匹配")
    fingerprint = value["artifact_fingerprint"]
    if not isinstance(fingerprint, str) or not re.fullmatch(
        r"[0-9a-f]{64}", fingerprint
    ):
        errors.append("corpus_provenance.artifact_fingerprint 非 SHA-256")
    return errors


def validate_corpus_provenance(
    document: dict[str, Any],
) -> list[str]:
    value = document.get("corpus_provenance")
    errors = _shape_errors(value)
    if errors or not isinstance(value, dict):
        return errors
    provider = document.get("provider")
    if value["provider"] != provider:
        errors.append("corpus_provenance.provider 与顶层不一致")
    status = value["contract_status"]
    if provider == ORD_PROVIDER:
        if status != "not_applicable":
            errors.append("ORD corpus_provenance 必须 not_applicable")
        for field in (
            "workflow",
            "schema_version",
            "ruleset_version",
            "artifact_fingerprint",
        ):
            if value[field] is not None:
                errors.append(f"ORD corpus_provenance.{field} 必须为 null")
        return errors
    if provider != LOCAL_PROVIDER:
        return errors
    if status not in {"valid", "invalid", "not_assessed"}:
        errors.append("local corpus_provenance.contract_status 不受控")
    if status == "valid":
        errors.extend(_valid_local_errors(value))
    return errors


def _invalid_local_errors(
    document: dict[str, Any],
    top_codes: set[Any],
) -> list[str]:
    provider_status = document.get("provider_status")
    errors = []
    if provider_status != "blocked":
        errors.append("corpus_provenance invalid 要求 provider_status=blocked")
    if document.get("results") != []:
        errors.append("corpus_provenance invalid 不得有 results")
    if CONTRACT_ERROR_CODE not in top_codes:
        errors.append("corpus_provenance invalid 缺少 contract error")
    summary = document.get("corpus_summary")
    if isinstance(summary, dict):
        if summary.get("searchable_records") != 0:
            errors.append("contract-invalid searchable_records 必须为 0")
        if summary.get("excluded_records") != summary.get("input_records"):
            errors.append("contract-invalid excluded_records 不守恒")
    return errors


def validate_local_contract_blocking(
    document: dict[str, Any],
) -> list[str]:
    if document.get("provider") != LOCAL_PROVIDER:
        return []
    provenance = document.get("corpus_provenance")
    if not isinstance(provenance, dict):
        return []
    status = provenance.get("contract_status")
    top_codes = {
        item.get("code")
        for item in document.get("errors") or []
        if isinstance(item, dict)
    }
    if status == "invalid":
        return _invalid_local_errors(document, top_codes)
    errors = []
    if status == "valid" and CONTRACT_ERROR_CODE in top_codes:
        errors.append("corpus_provenance valid 不得包含 contract error")
    if status == "not_assessed" and document.get("provider_status") != "blocked":
        errors.append("corpus_provenance not_assessed 只能用于 blocked request")
    return errors
