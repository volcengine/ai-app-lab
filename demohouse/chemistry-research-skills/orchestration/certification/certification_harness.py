"""Prepare label-free certification prompts and preserve raw Host outputs."""

from __future__ import annotations

import hashlib
import json
import re
import stat
from pathlib import Path
from typing import Any


CONTROLLED_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
HIDDEN_FIELDS = {
    "case_id",
    "prompt",
    "expected_route_type",
    "expected_targets",
    "expected_entry_mode",
    "expected_chain_order",
    "label_rationale",
    "annotator_id",
    "reviewed_at_utc",
    "contract_fingerprint",
}
HIDDEN_TOP_FIELDS = {
    "schema_version",
    "gold_version",
    "annotator_id",
    "review_timestamp",
    "case_count",
    "cases",
    "gold_fingerprint",
}
SAFETY_FIELDS = {
    "case_id",
    "prompt",
    "safety_type",
    "expected_execution_mode",
    "label_rationale",
    "contract_fingerprint",
}
SAFETY_TOP_FIELDS = {
    "schema_version",
    "case_count",
    "cases",
    "cases_fingerprint",
}
SAFETY_COMPOSITION = {
    "auto_offline": 10,
    "clarification": 5,
    "unsupported": 5,
    "external_confirmation": 5,
}
ENTRY_MODES = {
    "atomic_or_router_direct",
    "router_required",
    "no_chemistry_entry",
}
ROUTE_TYPES = {
    "direct_skill",
    "direct_skill_chain",
    "workflow_a",
    "workflow_b",
    "clarification_required",
    "unsupported",
    None,
}
SAFETY_EXECUTION_MODES = {
    "auto_offline": "auto_execute",
    "clarification": "not_executable",
    "unsupported": "not_executable",
    "external_confirmation": "confirmation_required",
}


class CertificationHarnessError(ValueError):
    """Raised when certification inputs or raw output storage are unsafe."""


def canonical_json(value: Any) -> str:
    try:
        return json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        )
    except (TypeError, ValueError) as error:
        raise CertificationHarnessError("certification data is invalid") from error


def sha256_json(value: Any, excluded: str | None = None) -> str:
    payload = value
    if excluded is not None:
        if not isinstance(value, dict):
            raise CertificationHarnessError("fingerprinted value must be an object")
        payload = {key: item for key, item in value.items() if key != excluded}
    return hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()


def _controlled_id(value: Any, label: str) -> str:
    if not isinstance(value, str) or not CONTROLLED_ID.fullmatch(value):
        raise CertificationHarnessError(f"{label} is invalid")
    return value


def _string_list(value: Any, label: str) -> list[str]:
    if (
        not isinstance(value, list)
        or not all(isinstance(item, str) and item for item in value)
        or len(value) != len(set(value))
    ):
        raise CertificationHarnessError(f"{label} must be unique strings")
    return value


def _validate_case(
    value: Any,
    fields: set[str],
    fingerprint_field: str,
    label: str,
) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != fields:
        raise CertificationHarnessError(f"{label} fields mismatch")
    _controlled_id(value["case_id"], f"{label} case_id")
    if not isinstance(value["prompt"], str) or not value["prompt"].strip():
        raise CertificationHarnessError(f"{label} prompt is invalid")
    if value[fingerprint_field] != sha256_json(value, fingerprint_field):
        raise CertificationHarnessError(f"{label} fingerprint mismatch")
    return dict(value)


def validate_hidden_gold(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != HIDDEN_TOP_FIELDS:
        raise CertificationHarnessError("hidden Gold fields mismatch")
    if (
        value["schema_version"] != "1.0.0"
        or value["gold_version"] != "1.0.0"
        or value["case_count"] != 30
        or not isinstance(value["cases"], list)
        or len(value["cases"]) != 30
    ):
        raise CertificationHarnessError("hidden Gold version or count mismatch")
    cases = [
        _validate_case(item, HIDDEN_FIELDS, "contract_fingerprint", "hidden Gold")
        for item in value["cases"]
    ]
    for item in cases:
        _string_list(item["expected_targets"], "hidden expected_targets")
        _string_list(item["expected_chain_order"], "hidden expected_chain_order")
        if item["expected_entry_mode"] not in ENTRY_MODES:
            raise CertificationHarnessError("hidden entry mode is invalid")
        if item["expected_route_type"] not in ROUTE_TYPES:
            raise CertificationHarnessError("hidden route type is invalid")
        if item["annotator_id"] != value["annotator_id"]:
            raise CertificationHarnessError("hidden annotator mismatch")
    if value["gold_fingerprint"] != sha256_json(value, "gold_fingerprint"):
        raise CertificationHarnessError("hidden Gold fingerprint mismatch")
    return value


def validate_safety_cases(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != SAFETY_TOP_FIELDS:
        raise CertificationHarnessError("safety case fields mismatch")
    if (
        value["schema_version"] != "1.0.0"
        or value["case_count"] != 25
        or not isinstance(value["cases"], list)
        or len(value["cases"]) != 25
    ):
        raise CertificationHarnessError("safety case version or count mismatch")
    cases = [
        _validate_case(item, SAFETY_FIELDS, "contract_fingerprint", "safety case")
        for item in value["cases"]
    ]
    counts = {
        safety_type: sum(item["safety_type"] == safety_type for item in cases)
        for safety_type in SAFETY_COMPOSITION
    }
    if counts != SAFETY_COMPOSITION:
        raise CertificationHarnessError("safety composition must be 10/5/5/5")
    if any(
        item["expected_execution_mode"] != SAFETY_EXECUTION_MODES[item["safety_type"]]
        for item in cases
    ):
        raise CertificationHarnessError("safety execution mode is invalid")
    if value["cases_fingerprint"] != sha256_json(value, "cases_fingerprint"):
        raise CertificationHarnessError("safety cases fingerprint mismatch")
    return value


def _validate_public_gold(value: Any) -> dict[str, Any]:
    if (
        not isinstance(value, dict)
        or value.get("schema_version") != "2.0.0"
        or value.get("gold_version") != "2.0.0"
        or not isinstance(value.get("cases"), list)
        or len(value["cases"]) != 70
        or value.get("source_case_count") != 70
    ):
        raise CertificationHarnessError("public Gold version or count mismatch")
    if value.get("gold_fingerprint") != sha256_json(value, "gold_fingerprint"):
        raise CertificationHarnessError("public Gold fingerprint mismatch")
    for item in value["cases"]:
        if item.get("contract_fingerprint") != sha256_json(
            item,
            "contract_fingerprint",
        ):
            raise CertificationHarnessError("public case fingerprint mismatch")
    return value


def _prompts(
    cases: list[dict[str, Any]],
    case_kind: str,
    start: int,
) -> list[dict[str, Any]]:
    return [
        {
            "sequence": start + index,
            "case_id": item["case_id"],
            "case_kind": case_kind,
            "prompt": item["prompt"],
        }
        for index, item in enumerate(cases)
    ]


def build_prompt_batch(
    public_gold: Any,
    hidden_gold: Any,
    safety_cases: Any,
) -> list[dict[str, Any]]:
    public = _validate_public_gold(public_gold)
    hidden = validate_hidden_gold(hidden_gold)
    safety = validate_safety_cases(safety_cases)
    batch = [
        *_prompts(public["cases"], "routing_public", 1),
        *_prompts(hidden["cases"], "routing_hidden", 71),
        *_prompts(safety["cases"], "safety", 101),
    ]
    case_ids = [item["case_id"] for item in batch]
    if len(case_ids) != len(set(case_ids)):
        raise CertificationHarnessError("duplicate case_id across certification sets")
    return batch


def audit_hidden_gold_isolation(
    hidden_gold: Any,
    public_root: Path,
    manifest: Any,
) -> dict[str, Any]:
    hidden = validate_hidden_gold(hidden_gold)
    if not isinstance(manifest, dict) or not isinstance(
        manifest.get("distributable_files"),
        list,
    ):
        raise CertificationHarnessError("bundle manifest file list is invalid")
    labels = [(item["case_id"], item["prompt"]) for item in hidden["cases"]]
    leaks: list[dict[str, str]] = []
    for entry in manifest["distributable_files"]:
        relative = Path(entry.get("path", ""))
        if relative.is_absolute() or relative == Path(".") or ".." in relative.parts:
            raise CertificationHarnessError("bundle manifest path is unsafe")
        path = public_root / relative
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeError:
            continue
        except OSError as error:
            raise CertificationHarnessError("bundle file is unreadable") from error
        for case_id, prompt in labels:
            if case_id in text or prompt in text:
                leaks.append({"case_id": case_id, "path": relative.as_posix()})
    if leaks:
        raise CertificationHarnessError("hidden Gold leak detected")
    return {"checked_cases": len(labels), "leaks": []}


def _safe_raw_root(session_dir: Path) -> Path:
    if session_dir.is_symlink() or not session_dir.is_dir():
        raise CertificationHarnessError("session directory is unsafe")
    raw_root = session_dir / "raw"
    if raw_root.is_symlink():
        raise CertificationHarnessError("raw output directory is unsafe")
    try:
        raw_root.mkdir(exist_ok=True)
    except OSError as error:
        raise CertificationHarnessError("cannot create raw output directory") from error
    if not stat.S_ISDIR(raw_root.lstat().st_mode):
        raise CertificationHarnessError("raw output directory is unsafe")
    return raw_root


def write_raw_output(
    session_dir: Path,
    case_id: str,
    output: bytes,
) -> dict[str, Any]:
    identifier = _controlled_id(case_id, "case_id")
    if not isinstance(output, bytes):
        raise CertificationHarnessError("raw output must be bytes")
    raw_root = _safe_raw_root(session_dir)
    path = raw_root / f"{identifier}.json"
    if path.exists() or path.is_symlink():
        raise CertificationHarnessError("raw output already exists")
    try:
        with path.open("xb") as handle:
            handle.write(output)
    except FileExistsError as error:
        raise CertificationHarnessError("raw output already exists") from error
    except OSError as error:
        raise CertificationHarnessError("cannot write raw output") from error
    return {
        "relative_path": path.relative_to(session_dir).as_posix(),
        "sha256": hashlib.sha256(output).hexdigest(),
        "size_bytes": len(output),
    }
