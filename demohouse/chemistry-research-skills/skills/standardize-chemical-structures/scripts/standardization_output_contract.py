"""Pure output invariants for structure standardization artifacts."""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any


SCHEMA_VERSION = "1.0.0"
WORKFLOW = "chemical-structure-standardization-qc"
PROFILES = {"rdkit-basic", "chembl-pipeline"}
DISPOSITIONS = {"ready_for_downstream", "review_required", "rejected"}
PARSE_STATUSES = {"success", "error"}
STANDARDIZATION_STATUSES = {"completed", "not_run", "error"}
DUPLICATE_BASES = {"original", "standardized", "parent"}
REQUIRED_TOP_LEVEL = {
    "schema_version",
    "workflow",
    "generated_at_utc",
    "tool_versions",
    "options",
    "input_summary",
    "records",
    "duplicate_groups",
    "errors",
    "warnings",
    "notices",
    "human_review_required",
    "result_fingerprint",
}
REQUIRED_RECORD_FIELDS = {
    "id",
    "record_index",
    "original_structure",
    "input_format",
    "parse_status",
    "standardization_status",
    "standardized_structure",
    "parent_structure",
    "inchikey",
    "parent_inchikey",
    "transformations",
    "qc_findings",
    "disposition",
    "human_review_required",
}
SECRET_RE = re.compile(
    r"ark-[A-Za-z0-9_-]{12,}|"
    r"Bearer\s+[A-Za-z0-9._-]{12,}|"
    r"(?:Authorization|Cookie|Token)\s*[:=]\s*[A-Za-z0-9._-]{12,}",
    re.IGNORECASE,
)
FORBIDDEN_ASSERTIONS = {
    "实验样品身份已经确认",
    "结构已确证",
    "药效已确认",
    "毒性已确认",
    "安全性已确认",
    "可合成性已确认",
    "experimentally confirmed",
    "clinically effective",
    "safe to synthesize",
}


def output_fingerprint(document: dict[str, Any]) -> str:
    payload = {
        key: value
        for key, value in document.items()
        if key not in {"generated_at_utc", "result_fingerprint"}
    }
    serialized = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def finding_errors(item: Any, path: str) -> list[str]:
    if not isinstance(item, dict):
        return [f"{path} must be an object"]
    errors = [
        f"{path}.{field} is required"
        for field in ("code", "severity", "message", "source")
        if not item.get(field)
    ]
    if item.get("severity") not in {"error", "warning", "review"}:
        errors.append(f"{path}.severity is invalid")
    return errors


def _record_shape_errors(
    record: dict[str, Any],
    index: int,
    path: str,
) -> list[str]:
    record_index = record["record_index"]
    checks = (
        (
            not isinstance(record["id"], str) or not record["id"],
            f"{path}.id must be a non-empty string",
        ),
        (
            isinstance(record_index, bool)
            or not isinstance(record_index, int)
            or record_index != index,
            f"{path}.record_index must equal integer input order",
        ),
        (
            not isinstance(record["original_structure"], str),
            f"{path}.original_structure must be a string",
        ),
        (
            record["input_format"] not in {"smiles", "sdf", "molblock"},
            f"{path}.input_format is invalid",
        ),
        (
            record["parse_status"] not in PARSE_STATUSES,
            f"{path}.parse_status is invalid",
        ),
        (
            record["standardization_status"] not in STANDARDIZATION_STATUSES,
            f"{path}.standardization_status is invalid",
        ),
        (
            record["disposition"] not in DISPOSITIONS,
            f"{path}.disposition is invalid",
        ),
        (
            not isinstance(record["transformations"], list),
            f"{path}.transformations must be a list",
        ),
        (
            not isinstance(record["qc_findings"], list),
            f"{path}.qc_findings must be a list",
        ),
        (
            not isinstance(record["human_review_required"], list),
            f"{path}.human_review_required must be a list",
        ),
    )
    return [message for invalid, message in checks if invalid]


def _record_state_errors(
    record: dict[str, Any],
    path: str,
) -> list[str]:
    errors = []
    if record["parse_status"] == "error":
        errors.extend(
            f"{path}.{field} must be null when parsing failed"
            for field in (
                "standardized_structure",
                "parent_structure",
                "inchikey",
                "parent_inchikey",
            )
            if record[field] is not None
        )
        if record["disposition"] != "rejected":
            errors.append(f"{path} parse failure must be rejected")
    if record["disposition"] == "ready_for_downstream":
        checks = (
            (
                record["parse_status"] != "success",
                f"{path} ready record must parse successfully",
            ),
            (
                record["standardization_status"] != "completed",
                f"{path} ready record must complete standardization",
            ),
            (
                bool(record["human_review_required"]),
                f"{path} ready record cannot require human review",
            ),
        )
        errors.extend(message for invalid, message in checks if invalid)
    if record["parent_structure"] is None and record["parent_inchikey"] is not None:
        errors.append(f"{path}.parent_inchikey requires parent_structure")
    return errors


def _review_errors(record: dict[str, Any], path: str) -> list[str]:
    review_codes = {
        item.get("code")
        for item in record.get("qc_findings", [])
        if isinstance(item, dict) and item.get("severity") == "review"
    }
    errors = []
    if set(record.get("human_review_required", [])) != review_codes:
        errors.append(f"{path}.human_review_required does not match findings")
    if review_codes and record["disposition"] == "ready_for_downstream":
        errors.append(f"{path} review finding cannot be ready")
    chembl_excluded = any(
        isinstance(item, dict)
        and item.get("step") == "chembl_get_parent"
        and item.get("exclusion_flag") is True
        for item in record.get("transformations", [])
    )
    if chembl_excluded and "R-CHEMBL-EXCLUDED" not in review_codes:
        errors.append(f"{path} ChEMBL exclusion flag must require human review")
    fragment = record.get("fragment_analysis")
    if (
        isinstance(fragment, dict)
        and fragment.get("classification") == "mixture_or_complex"
        and record["parent_structure"] is not None
    ):
        errors.append(f"{path} mixture must not be collapsed to one parent")
    return errors


def validate_record(
    record: Any,
    index: int,
) -> tuple[list[str], list[str]]:
    path = f"records[{index}]"
    if not isinstance(record, dict):
        return [f"{path} must be an object"], []
    missing = sorted(REQUIRED_RECORD_FIELDS - set(record))
    if missing:
        return [f"{path} missing fields: {missing!r}"], []
    errors = _record_shape_errors(record, index, path)
    if isinstance(record["qc_findings"], list):
        for finding_index, item in enumerate(record["qc_findings"]):
            errors.extend(
                finding_errors(
                    item,
                    f"{path}.qc_findings[{finding_index}]",
                )
            )
    errors.extend(_record_state_errors(record, path))
    errors.extend(_review_errors(record, path))
    warnings = (
        [f"{path} disposition is {record['disposition']}"]
        if record["disposition"] != "ready_for_downstream"
        else []
    )
    return errors, warnings


def duplicate_errors(
    groups: Any,
    records: list[dict[str, Any]],
) -> list[str]:
    if not isinstance(groups, list):
        return ["duplicate_groups must be a list"]
    valid_indices = set(range(len(records)))
    errors = []
    for index, group in enumerate(groups):
        path = f"duplicate_groups[{index}]"
        if not isinstance(group, dict):
            errors.append(f"{path} must be an object")
            continue
        if group.get("basis") not in DUPLICATE_BASES:
            errors.append(f"{path}.basis is invalid")
        indices = group.get("record_indices")
        ids = group.get("record_ids")
        if not isinstance(indices, list) or len(indices) < 2:
            errors.append(f"{path}.record_indices must contain at least two")
            continue
        if any(
            isinstance(item, bool)
            or not isinstance(item, int)
            or item not in valid_indices
            for item in indices
        ):
            errors.append(f"{path}.record_indices references an unknown record index")
        if not isinstance(ids, list) or len(ids) != len(indices):
            errors.append(f"{path}.record_ids must align with indices")
        if group.get("basis") == "parent" and group.get("relationship") != (
            "same_derived_parent_not_same_physical_sample"
        ):
            errors.append(f"{path} must preserve the parent/sample distinction")
    return errors


def _top_errors(document: dict[str, Any]) -> list[str]:
    missing = sorted(REQUIRED_TOP_LEVEL - set(document))
    errors = [f"missing top-level fields: {missing!r}"] if missing else []
    checks = (
        (
            document.get("schema_version") != SCHEMA_VERSION,
            f"schema_version must be {SCHEMA_VERSION}",
        ),
        (
            document.get("workflow") != WORKFLOW,
            f"workflow must be {WORKFLOW}",
        ),
        (
            not document.get("generated_at_utc"),
            "generated_at_utc is required",
        ),
    )
    errors.extend(message for invalid, message in checks if invalid)
    versions = document.get("tool_versions")
    if not isinstance(versions, dict):
        errors.append("tool_versions must be an object")
    else:
        errors.extend(
            f"tool_versions.{field} is required"
            for field in ("python", "rdkit", "chembl_structure_pipeline")
            if not versions.get(field)
        )
    options = document.get("options")
    if not isinstance(options, dict):
        errors.append("options must be an object")
    elif options.get("profile") not in PROFILES:
        errors.append("options.profile is invalid")
    return errors


def _summary_errors(
    summary: Any,
    records: list[dict[str, Any]],
) -> list[str]:
    if not isinstance(summary, dict):
        return ["input_summary must be an object"]
    expected = {
        status: sum(record.get("disposition") == status for record in records)
        for status in DISPOSITIONS
    }
    errors = []
    if summary.get("total_records") != len(records):
        errors.append("input_summary.total_records does not match records")
    errors.extend(
        f"input_summary.{status} does not match records"
        for status, count in expected.items()
        if summary.get(status) != count
    )
    if len(records) != sum(expected.values()):
        errors.append("record dispositions do not conserve input count")
    return errors


def _content_errors(document: dict[str, Any]) -> list[str]:
    errors = []
    for field in ("errors", "warnings", "notices", "human_review_required"):
        if not isinstance(document.get(field), list):
            errors.append(f"{field} must be a list")
    for field in ("errors", "warnings", "human_review_required"):
        for index, item in enumerate(document.get(field, [])):
            errors.extend(finding_errors(item, f"{field}[{index}]"))
            if isinstance(item, dict) and not item.get("record_id"):
                errors.append(f"{field}[{index}].record_id is required")
    serialized = json.dumps(document, ensure_ascii=False)
    if SECRET_RE.search(serialized):
        errors.append("possible secret detected in output")
    lowered = serialized.lower()
    errors.extend(
        f"forbidden scientific assertion detected: {phrase}"
        for phrase in FORBIDDEN_ASSERTIONS
        if phrase.lower() in lowered
    )
    fingerprint = document.get("result_fingerprint")
    if not isinstance(fingerprint, str) or not re.fullmatch(
        r"[0-9a-f]{64}",
        fingerprint or "",
    ):
        errors.append("result_fingerprint must be a SHA-256 hex string")
    elif fingerprint != output_fingerprint(document):
        errors.append("result_fingerprint does not match document content")
    return errors


def validate_document(document: Any) -> tuple[list[str], list[str]]:
    if not isinstance(document, dict):
        return ["document must be an object"], []
    errors = _top_errors(document)
    records = document.get("records")
    if not isinstance(records, list):
        errors.append("records must be a list")
        records = []
    elif not records:
        errors.append("records must contain at least one input record")
    warnings = []
    for index, record in enumerate(records):
        record_errors, record_warnings = validate_record(record, index)
        errors.extend(record_errors)
        warnings.extend(record_warnings)
    errors.extend(_summary_errors(document.get("input_summary"), records))
    errors.extend(duplicate_errors(document.get("duplicate_groups"), records))
    errors.extend(_content_errors(document))
    return errors, sorted(set(warnings))
