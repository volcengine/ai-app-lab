"""Document-level output invariants and fingerprints."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import re
from pathlib import Path
from typing import Any


SCHEMA_VERSION = "1.0.0"
WORKFLOW = "chemical-identity-resolution"
DISPOSITIONS = {
    "ready_for_standardization",
    "review_required",
    "rejected",
}
TEMPORAL_KEYS = frozenset(
    {
        "generated_at_utc",
        "retrieved_at_utc",
        "requested_at_utc",
        "confirmed_at_utc",
    }
)
SECRET_RE = re.compile(
    r"(?i)(authorization\s*:|bearer\s+[A-Za-z0-9._~+/=-]{12,}|"
    r"api[_ -]?key\s*[:=]|cookie\s*:|ark-[A-Za-z0-9_-]{16,})"
)
FORBIDDEN_CLAIMS = (
    "sample identity confirmed",
    "physical sample confirmed",
    "experimentally confirmed",
    "safe to synthesize",
    "proven efficacy",
    "proven active",
)


def _load_resolution_contract() -> Any:
    path = Path(__file__).with_name("identity_resolution_contract.py")
    spec = importlib.util.spec_from_file_location(
        "identity_output_resolution_contract",
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load identity_resolution_contract.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


RESOLUTION = _load_resolution_contract()


def _count_matches(value: Any, expected: int) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value == expected


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def without_temporal_fields(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: without_temporal_fields(item)
            for key, item in value.items()
            if key not in TEMPORAL_KEYS and key != "result_fingerprint"
        }
    if isinstance(value, list):
        return [without_temporal_fields(item) for item in value]
    return value


def output_fingerprint(document: dict[str, Any]) -> str:
    return sha256_json(without_temporal_fields(document))


def _top_level_errors(document: dict[str, Any]) -> list[str]:
    errors = RESOLUTION.HANDOFF.missing_errors(
        document,
        {
            "schema_version",
            "workflow",
            "generated_at_utc",
            "tool_versions",
            "source_metadata",
            "options",
            "input_summary",
            "resolutions",
            "cross_query_relationships",
            "notices",
            "result_fingerprint",
        },
        "document",
    )
    if document.get("schema_version") != SCHEMA_VERSION:
        errors.append("unsupported schema_version")
    if document.get("workflow") != WORKFLOW:
        errors.append("invalid workflow")
    metadata = document.get("source_metadata")
    if not isinstance(metadata, dict):
        errors.append("source_metadata must be an object")
    else:
        errors.extend(
            f"source_metadata missing {source}"
            for source in ("OPSIN", "PubChem", "ChEMBL", "UniChem")
            if source not in metadata
        )
    options = document.get("options")
    if not isinstance(options, dict):
        errors.append("options must be an object")
    else:
        if options.get("automatic_tie_breaking") is not False:
            errors.append("automatic_tie_breaking must be false")
        if options.get("no_model_generated_structures") is not True:
            errors.append("no_model_generated_structures must be true")
    return errors


def _summary_errors(
    summary: Any,
    resolutions: list[Any],
) -> list[str]:
    if not isinstance(summary, dict):
        return ["input_summary must be an object"]
    counts = {
        status: sum(
            isinstance(resolution, dict) and resolution.get("disposition") == status
            for resolution in resolutions
        )
        for status in DISPOSITIONS
    }
    errors = []
    if not _count_matches(summary.get("total_requests"), len(resolutions)):
        errors.append("input_summary.total_requests does not match resolutions")
    errors.extend(
        f"input_summary.{status} does not match resolutions"
        for status, count in counts.items()
        if not _count_matches(summary.get(status), count)
    )
    if sum(counts.values()) != len(resolutions):
        errors.append("disposition counts do not conserve total requests")
    return errors


def _content_errors(document: dict[str, Any]) -> list[str]:
    serialized = json.dumps(document, ensure_ascii=False)
    errors = []
    if SECRET_RE.search(serialized):
        errors.append("possible secret detected in output")
    lower = serialized.lower()
    errors.extend(
        f"forbidden scientific claim detected: {claim}"
        for claim in FORBIDDEN_CLAIMS
        if claim in lower
    )
    if document.get("result_fingerprint") != output_fingerprint(document):
        errors.append("result_fingerprint mismatch")
    return errors


def validate_document(document: Any) -> tuple[list[str], list[str]]:
    if not isinstance(document, dict):
        return ["document must be an object"], []
    errors = _top_level_errors(document)
    warnings = []
    resolutions = document.get("resolutions")
    if not isinstance(resolutions, list) or not resolutions:
        errors.append("resolutions must be a non-empty list")
        resolutions = []
    for index, resolution in enumerate(resolutions):
        resolution_errors, resolution_warnings = RESOLUTION.validate_resolution(
            resolution, index
        )
        errors.extend(resolution_errors)
        warnings.extend(resolution_warnings)
    errors.extend(_summary_errors(document.get("input_summary"), resolutions))
    errors.extend(_content_errors(document))
    return errors, warnings
