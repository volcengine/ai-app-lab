#!/usr/bin/env python3
"""Pure consistency checks for curate-reactions output bindings."""

from __future__ import annotations

import re
from typing import Any


STANDARDIZATION_WORKFLOW = "chemical-structure-standardization-qc"
STANDARDIZATION_SCHEMA_VERSION = "1.0.0"
METADATA_FIELDS = {
    "workflow",
    "schema_version",
    "result_fingerprint",
    "record_count",
    "contract_status",
}
UPSTREAM_FATAL_CODES = {
    "E-UPSTREAM-FINGERPRINT-001",
    "E-UPSTREAM-ARTIFACT-CONTRACT-001",
    "E-UPSTREAM-RECORD-ID-001",
}


def _metadata_item_errors(item: Any, path: str) -> list[str]:
    if not isinstance(item, dict):
        return [f"{path} 必须是 object"]
    missing = METADATA_FIELDS - set(item)
    if missing:
        return [f"{path} 缺少字段：{sorted(missing)!r}"]
    errors = []
    status = item["contract_status"]
    if status not in {"valid", "invalid"}:
        errors.append(f"{path}.contract_status 不受控")
    count = item["record_count"]
    count_valid = isinstance(count, int) and not isinstance(count, bool) and count >= 0
    if not count_valid:
        errors.append(f"{path}.record_count 非法")
    if status != "valid":
        return errors
    if item["workflow"] != STANDARDIZATION_WORKFLOW:
        errors.append(f"{path}.workflow 非正式 standardize workflow")
    if item["schema_version"] != STANDARDIZATION_SCHEMA_VERSION:
        errors.append(f"{path}.schema_version 不匹配")
    fingerprint = item["result_fingerprint"]
    if not isinstance(fingerprint, str) or not re.fullmatch(
        r"[0-9a-f]{64}",
        fingerprint,
    ):
        errors.append(f"{path}.result_fingerprint 非 SHA-256")
    if count_valid and count < 1:
        errors.append(f"{path}.record_count 必须为正整数")
    return errors


def validate_upstream_metadata(value: Any) -> list[str]:
    if not isinstance(value, list):
        return ["upstream_artifacts 必须是 array"]
    errors = []
    for index, item in enumerate(value):
        errors.extend(_metadata_item_errors(item, f"upstream_artifacts[{index}]"))
    return errors


def _unrequested_binding_errors(
    participant: dict[str, Any],
    path: str,
) -> list[str]:
    errors = []
    if participant.get("upstream_record_id") is not None:
        errors.append(f"{path}.upstream_record_id 不得伪造绑定")
    if participant.get("upstream_disposition") is not None:
        errors.append(f"{path}.upstream_disposition 无绑定来源")
    return errors


def _failed_binding_errors(
    participant: dict[str, Any],
    path: str,
    record_codes: set[str],
) -> list[str]:
    errors = []
    if "E-UPSTREAM-BINDING-001" not in record_codes:
        errors.append(f"{path}.upstream_binding_status failed 未传播")
    if participant.get("upstream_disposition") is not None:
        errors.append(f"{path}.upstream_disposition 失败绑定不得有状态")
    return errors


def validate_participant_binding(
    participant: Any,
    path: str,
    record_codes: set[str],
) -> list[str]:
    if not isinstance(participant, dict):
        return [f"{path} 必须是 object"]
    upstream_id = participant.get("upstream_record_id")
    disposition = participant.get("upstream_disposition")
    binding_status = participant.get("upstream_binding_status")
    if binding_status not in {"not_requested", "bound", "failed"}:
        return [f"{path}.upstream_binding_status 不受控"]
    if binding_status == "not_requested":
        return _unrequested_binding_errors(participant, path)
    if binding_status == "failed":
        return _failed_binding_errors(participant, path, record_codes)
    if not isinstance(upstream_id, str) or not upstream_id:
        return [f"{path}.upstream_record_id bound 必须是非空字符串"]
    allowed = {
        "ready_for_downstream",
        "review_required",
        "rejected",
    }
    if disposition not in allowed:
        return [f"{path}.upstream_disposition 不受控"]
    expected_codes = {
        "review_required": "H-UPSTREAM-REVIEW-001",
        "rejected": "E-UPSTREAM-REJECTED-001",
    }
    expected = expected_codes.get(disposition)
    return (
        [f"{path}.upstream_disposition {disposition} 未传播"]
        if expected and expected not in record_codes
        else []
    )


def validate_contract_blocking(document: dict[str, Any]) -> list[str]:
    top_errors = document.get("errors") or []
    codes = {item.get("code") for item in top_errors if isinstance(item, dict)}
    metadata = document.get("upstream_artifacts")
    invalid_metadata = isinstance(metadata, list) and any(
        isinstance(item, dict) and item.get("contract_status") == "invalid"
        for item in metadata
    )
    if not codes & UPSTREAM_FATAL_CODES:
        return (
            ["invalid metadata 必须保留 upstream contract error"]
            if invalid_metadata
            else []
        )
    errors = []
    records = document.get("records") or []
    if any(
        not isinstance(record, dict)
        or record.get("curation_status") != "error"
        or record.get("disposition") != "rejected"
        for record in records
    ):
        errors.append("upstream contract error 要求全部 records 为 error/rejected")
    if document.get("duplicate_groups") != []:
        errors.append("upstream contract error 要求 duplicate_groups 为空")
    if document.get("review_queue") != []:
        errors.append("upstream contract error 要求 review_queue 为空")
    for index, record in enumerate(records):
        findings = record.get("findings", []) if isinstance(record, dict) else []
        record_codes = {item.get("code") for item in findings if isinstance(item, dict)}
        if not record_codes & UPSTREAM_FATAL_CODES:
            errors.append(f"records[{index}] 未保留 upstream contract error")
    container_error = any(
        isinstance(item, dict)
        and item.get("code") == "E-UPSTREAM-ARTIFACT-CONTRACT-001"
        and item.get("field_path") == "upstream_artifacts"
        for item in top_errors
    )
    if isinstance(metadata, list) and not metadata and not container_error:
        errors.append("可枚举 upstream contract error 不得丢失 metadata")
    if (
        isinstance(metadata, list)
        and metadata
        and not any(
            isinstance(item, dict) and item.get("contract_status") == "invalid"
            for item in metadata
        )
    ):
        errors.append("upstream contract error 要求 contract_status=invalid")
    return errors
