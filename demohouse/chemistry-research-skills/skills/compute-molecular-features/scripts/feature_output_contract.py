"""Document-level invariants for molecular feature artifacts."""

from __future__ import annotations

import importlib.util
import json
import math
import re
from pathlib import Path
from typing import Any


SCHEMA_VERSION = "1.0.0"
WORKFLOW = "molecular-feature-computation"
DESCRIPTOR_SET_ID = "rdkit-2d-core-v1"
CALCULATION_VIEWS = {"standardized", "parent"}
FINGERPRINT_NAMES = {"morgan", "rdkit_topological", "maccs"}
DESCRIPTOR_NAMES = {
    "MolecularFormula",
    "MolecularWeight",
    "ExactMolWt",
    "HeavyAtomCount",
    "NumHDonors",
    "NumHAcceptors",
    "NumRotatableBonds",
    "RingCount",
    "NumAromaticRings",
    "FractionCSP3",
    "TPSA",
    "MolLogP",
    "FormalCharge",
    "NumHeteroatoms",
}
REQUIRED_TOP_LEVEL = {
    "schema_version",
    "workflow",
    "generated_at_utc",
    "tool_versions",
    "options",
    "upstream",
    "descriptor_set",
    "fingerprint_profiles",
    "input_summary",
    "records",
    "dataset_profile",
    "errors",
    "warnings",
    "notices",
    "human_review_required",
    "result_fingerprint",
}
TEMPORAL_KEYS = {"generated_at_utc", "retrieved_at_utc", "requested_at_utc"}
SECRET_RE = re.compile(
    r"ark-[A-Za-z0-9_-]{12,}|"
    r"Bearer\s+[A-Za-z0-9._~+/=-]{12,}|"
    r"(?:Authorization|Cookie|Token|Api[_ -]?Key)\s*[:=]\s*\S{12,}",
    re.IGNORECASE,
)
FORBIDDEN_CLAIMS = {
    "药效已确认",
    "活性已确认",
    "毒性已确认",
    "安全性已确认",
    "结构已确证",
    "适合直接建模",
    "suitable for modeling",
    "same biological function",
    "proven active",
    "proven safe",
    "safe to synthesize",
}


def _load_local(filename: str, module_name: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


RECORD = _load_local(
    "feature_record_contract.py",
    "feature_output_record_contract",
)
DATASET = _load_local(
    "feature_dataset_contract.py",
    "feature_output_dataset_contract",
)
STANDARDIZATION = _load_local(
    "standardization_contract.py",
    "feature_output_standardization_contract",
)


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
    return RECORD.sha256_json(without_temporal_fields(document))


def _non_finite_paths(value: Any, path: str = "$") -> list[str]:
    if isinstance(value, float) and not math.isfinite(value):
        return [path]
    results = []
    if isinstance(value, dict):
        for key, item in value.items():
            results.extend(_non_finite_paths(item, f"{path}.{key}"))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            results.extend(_non_finite_paths(item, f"{path}[{index}]"))
    return results


def _descriptor_names(metadata: Any) -> tuple[set[str], list[str]]:
    if not isinstance(metadata, dict):
        return set(), ["descriptor_set must be an object"]
    checks = (
        (
            metadata.get("id") != DESCRIPTOR_SET_ID,
            "descriptor_set.id is invalid",
        ),
        (
            metadata.get("requires_3d_conformer") is not False,
            "descriptor_set must not require a 3D conformer",
        ),
    )
    errors = [message for invalid, message in checks if invalid]
    features = metadata.get("features")
    if not isinstance(features, list):
        return set(), [*errors, "descriptor_set.features must be a list"]
    names = set()
    allowed = {
        "structure_deterministic_calculation",
        "structure_based_empirical_descriptor",
    }
    for index, feature in enumerate(features):
        if not isinstance(feature, dict) or not feature.get("name"):
            errors.append(f"descriptor_set.features[{index}] is invalid")
            continue
        names.add(feature["name"])
        if feature.get("feature_class") not in allowed:
            errors.append(f"descriptor_set.features[{index}].feature_class is invalid")
    if names != DESCRIPTOR_NAMES:
        errors.append("descriptor_set features do not match the core set")
    return names, errors


def _profiles(value: Any) -> tuple[dict[str, Any], list[str]]:
    if not isinstance(value, dict) or set(value) != FINGERPRINT_NAMES:
        return {}, ["fingerprint_profiles must contain the three core profiles"]
    errors = []
    for name, profile in value.items():
        errors.extend(
            RECORD.validate_profile(
                name,
                profile,
                f"fingerprint_profiles.{name}",
            )
        )
    return value, errors


def _tool_version_errors(value: Any) -> list[str]:
    if not isinstance(value, dict):
        return ["tool_versions must be an object"]
    errors = []
    if value.get("rdkit") not in {"2025.9.2", "2025.09.2"}:
        errors.append("tool_versions.rdkit must be fixed to 2025.9.2")
    errors.extend(
        f"tool_versions.{field} is required"
        for field in ("python", "feature_calculator")
        if not value.get(field)
    )
    return errors


def _option_errors(value: Any) -> tuple[list[str], str]:
    if not isinstance(value, dict):
        return ["options must be an object"], "invalid"
    view = value.get("calculation_view")
    checks = (
        (
            view not in CALCULATION_VIEWS,
            "options.calculation_view is invalid",
        ),
        (
            value.get("auto_repair_structures") is not False,
            "options.auto_repair_structures must be false",
        ),
        (
            value.get("requires_3d_conformer") is not False,
            "options.requires_3d_conformer must be false",
        ),
    )
    return [message for invalid, message in checks if invalid], view


def _top_errors(document: dict[str, Any]) -> tuple[list[str], str]:
    errors = RECORD.missing_errors(
        document,
        REQUIRED_TOP_LEVEL,
        "document",
    )
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
    errors.extend(_tool_version_errors(document.get("tool_versions")))
    option_errors, view = _option_errors(document.get("options"))
    errors.extend(option_errors)
    return errors, view


def _finding_array_errors(document: dict[str, Any]) -> list[str]:
    errors = []
    for field in ("errors", "warnings", "notices", "human_review_required"):
        if not isinstance(document.get(field), list):
            errors.append(f"{field} must be a list")
    for field in ("errors", "warnings", "human_review_required"):
        for index, item in enumerate(document.get(field, [])):
            errors.extend(RECORD.finding_errors(item, f"{field}[{index}]"))
            if isinstance(item, dict) and not item.get("record_id"):
                errors.append(f"{field}[{index}].record_id is required")
    return errors


def _content_errors(document: dict[str, Any]) -> list[str]:
    errors = _finding_array_errors(document)
    non_finite = _non_finite_paths(document)
    if non_finite:
        errors.append(
            "output contains non-finite numeric values at: "
            + ", ".join(non_finite[:20])
        )
    serialized = json.dumps(document, ensure_ascii=False)
    if SECRET_RE.search(serialized):
        errors.append("possible secret detected in output")
    lowered = serialized.lower()
    errors.extend(
        f"forbidden scientific claim detected: {claim}"
        for claim in FORBIDDEN_CLAIMS
        if claim.lower() in lowered
    )
    fingerprint = document.get("result_fingerprint")
    if not isinstance(fingerprint, str) or not re.fullmatch(
        r"[0-9a-f]{64}",
        fingerprint or "",
    ):
        errors.append("result_fingerprint must be a SHA-256 hex string")
    elif fingerprint != output_fingerprint(document):
        errors.append("result_fingerprint mismatch")
    return errors


def _record_errors(
    records: Any,
    descriptor_names: set[str],
    profiles: dict[str, Any],
    calculation_view: str,
) -> tuple[list[dict[str, Any]], list[str], list[str]]:
    if not isinstance(records, list) or not records:
        return [], ["records must be a non-empty list"], []
    errors = []
    warnings = []
    for index, record in enumerate(records):
        record_errors, record_warnings = RECORD.validate_record(
            record,
            index,
            descriptor_names,
            profiles,
            calculation_view,
        )
        errors.extend(record_errors)
        warnings.extend(record_warnings)
    return records, errors, warnings


def validate_document(document: Any) -> tuple[list[str], list[str]]:
    if not isinstance(document, dict):
        return ["document must be an object"], []
    errors, calculation_view = _top_errors(document)
    descriptor_names, descriptor_errors = _descriptor_names(
        document.get("descriptor_set")
    )
    profiles, profile_errors = _profiles(document.get("fingerprint_profiles"))
    errors.extend(descriptor_errors)
    errors.extend(profile_errors)
    records, record_errors, warnings = _record_errors(
        document.get("records"),
        descriptor_names,
        profiles,
        calculation_view,
    )
    errors.extend(record_errors)
    errors.extend(
        STANDARDIZATION.validate_feature_upstream_binding(
            document.get("upstream"),
            records,
        )
    )
    errors.extend(DATASET.summary_errors(document.get("input_summary"), records))
    errors.extend(
        DATASET.dataset_errors(
            document.get("dataset_profile"),
            records,
            descriptor_names,
        )
    )
    errors.extend(_content_errors(document))
    return errors, sorted(set(warnings))
