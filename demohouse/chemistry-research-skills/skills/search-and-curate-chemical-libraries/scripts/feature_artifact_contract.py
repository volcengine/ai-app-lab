"""Validate the features-to-library Artifact contract."""

from __future__ import annotations

import hashlib
import json
import math
import re
from typing import Any


FEATURE_SCHEMA_VERSION = "1.0.0"
FEATURE_WORKFLOW = "molecular-feature-computation"
FEATURE_CALCULATION_VIEWS = {"standardized", "parent"}
FEATURE_CALCULATION_STATUSES = set("completed partial not_run error".split())
FEATURE_DISPOSITIONS = set("ready_for_downstream review_required rejected".split())
FEATURE_PROFILE_NAMES = set("morgan rdkit_topological maccs".split())
PROFILE_REQUIRED_PARAMETERS = {
    "morgan": set(
        "radius fpSize includeChirality useBondTypes countSimulation "
        "includeRedundantEnvironments bitsPerFeature".split()
    ),
    "rdkit_topological": set(
        "minPath maxPath useHs branchedPaths useBondOrder "
        "countSimulation fpSize numBitsPerFeature".split()
    ),
    "maccs": set("fpSize bit0Unused".split()),
}
TEMPORAL_KEYS = set(
    "generated_at_utc retrieved_at_utc requested_at_utc runtime_seconds".split()
)
REQUIRED_TOP_LEVEL = set(
    "schema_version workflow tool_versions options fingerprint_profiles "
    "records result_fingerprint".split()
)
REQUIRED_RECORD_FIELDS = set(
    "id record_index standardized_structure parent_structure "
    "source_structure calculation_canonical_smiles calculation_view "
    "calculation_status descriptors fingerprints missing_features "
    "disposition human_review_required".split()
)
REQUIRED_PROFILE_FIELDS = set(
    "profile_id algorithm method_family representation parameters "
    "known_limitations profile_fingerprint".split()
)
REQUIRED_FINGERPRINT_FIELDS = set(
    "profile_id representation size on_bits bit_count density "
    "bitvector_sha256 hash_encoding".split()
)


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def sha256_json(value: Any) -> str:
    return sha256_text(canonical_json(value))


def _without_temporal_fields(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: _without_temporal_fields(item)
            for key, item in value.items()
            if key not in TEMPORAL_KEYS and key != "result_fingerprint"
        }
    if isinstance(value, list):
        return [_without_temporal_fields(item) for item in value]
    return value


def feature_artifact_fingerprint(
    artifact: dict[str, Any],
) -> str:
    return sha256_json(_without_temporal_fields(artifact))


def _missing(
    value: dict[str, Any],
    required: set[str],
) -> list[str]:
    return sorted(required - set(value))


def _expected_profile_size(profile: dict[str, Any]) -> Any:
    parameters = profile.get("parameters")
    if not isinstance(parameters, dict):
        return None
    return parameters.get("fpSize")


def _validate_profile(
    name: str,
    profile: Any,
) -> list[str]:
    path = f"fingerprint_profiles.{name}"
    if not isinstance(profile, dict):
        return [f"{path} must be object"]
    missing = _missing(profile, REQUIRED_PROFILE_FIELDS)
    if missing:
        return [f"{path} missing fields: {', '.join(missing)}"]
    errors = []
    if profile["representation"] != "bit_vector_on_bits":
        errors.append(f"{path}.representation is invalid")
    parameters = profile["parameters"]
    if not isinstance(parameters, dict):
        errors.append(f"{path}.parameters must be object")
        return errors
    if (
        not isinstance(parameters.get("fpSize"), int)
        or isinstance(parameters.get("fpSize"), bool)
        or parameters["fpSize"] <= 0
    ):
        errors.append(f"{path}.parameters.fpSize is invalid")
    missing_parameters = sorted(PROFILE_REQUIRED_PARAMETERS[name] - set(parameters))
    if missing_parameters:
        errors.append(
            f"{path}.parameters missing fields: " + ", ".join(missing_parameters)
        )
    expected = sha256_json(
        {key: value for key, value in profile.items() if key != "profile_fingerprint"}
    )
    if profile["profile_fingerprint"] != expected:
        errors.append(f"{path}.profile_fingerprint mismatch")
    if name == "maccs" and (
        parameters.get("fpSize") != 167 or parameters.get("bit0Unused") is not True
    ):
        errors.append(f"{path} MACCS parameters are invalid")
    return errors


def _validate_fingerprint_shape(
    value: dict[str, Any],
    profile: dict[str, Any],
    path: str,
) -> list[str]:
    errors = []
    if value["profile_id"] != profile.get("profile_id"):
        errors.append(f"{path}.profile_id does not match profile")
    if value["representation"] != "bit_vector_on_bits":
        errors.append(f"{path}.representation is invalid")
    if value["size"] != _expected_profile_size(profile):
        errors.append(f"{path}.size does not match profile")
    if value["hash_encoding"] != ("ascii_bitstring_index_0_to_n_minus_1"):
        errors.append(f"{path}.hash_encoding is invalid")
    return errors


def _validate_on_bits(
    value: dict[str, Any],
    path: str,
) -> list[str]:
    size = value["size"]
    on_bits = value["on_bits"]
    if not isinstance(size, int) or isinstance(size, bool) or size <= 0:
        return [f"{path}.size is invalid"]
    if not isinstance(on_bits, list) or not all(
        isinstance(item, int) and not isinstance(item, bool) for item in on_bits
    ):
        return [f"{path}.on_bits is invalid"]
    errors = []
    if on_bits != sorted(set(on_bits)):
        errors.append(f"{path}.on_bits must be sorted and unique")
    if any(item < 0 or item >= size for item in on_bits):
        errors.append(f"{path}.on_bits contains out-of-range bit")
    bit_count = value["bit_count"]
    if not isinstance(bit_count, int) or isinstance(bit_count, bool):
        errors.append(f"{path}.bit_count is invalid")
    elif bit_count != len(on_bits):
        errors.append(f"{path}.bit_count mismatch")
    expected_density = len(on_bits) / size
    density = value["density"]
    if (
        not isinstance(density, (int, float))
        or isinstance(density, bool)
        or not math.isfinite(float(density))
        or abs(float(density) - expected_density) > 1e-12
    ):
        errors.append(f"{path}.density mismatch")
    bit_set = set(on_bits)
    ascii_bits = "".join("1" if index in bit_set else "0" for index in range(size))
    if value["bitvector_sha256"] != sha256_text(ascii_bits):
        errors.append(f"{path}.bitvector_sha256 mismatch")
    return errors


def validate_fingerprint(
    value: Any,
    profile: dict[str, Any],
    path: str,
) -> list[str]:
    if not isinstance(value, dict):
        return [f"{path} must be object"]
    missing = _missing(value, REQUIRED_FINGERPRINT_FIELDS)
    if missing:
        return [f"{path} missing fields: {', '.join(missing)}"]
    return _validate_fingerprint_shape(
        value,
        profile,
        path,
    ) + _validate_on_bits(value, path)


def _validate_record_scalars(
    record: dict[str, Any],
    index: int,
) -> list[str]:
    path = f"records[{index}]"
    errors = []
    if not isinstance(record["id"], str) or not record["id"].strip():
        errors.append(f"{path}.id must be non-empty string")
    record_index = record["record_index"]
    if (
        not isinstance(record_index, int)
        or isinstance(record_index, bool)
        or record_index != index
    ):
        errors.append(f"{path}.record_index must be integer input order")
    for field in (
        "standardized_structure",
        "parent_structure",
        "source_structure",
        "calculation_canonical_smiles",
    ):
        if record[field] is not None and not isinstance(record[field], str):
            errors.append(f"{path}.{field} must be string or null")
    for field in ("descriptors", "fingerprints"):
        if not isinstance(record[field], dict):
            errors.append(f"{path}.{field} must be object")
    for field in ("missing_features", "human_review_required"):
        if not isinstance(record[field], list):
            errors.append(f"{path}.{field} must be array")
    return errors


def _valid_enum(value: Any, allowed: set[str]) -> bool:
    return isinstance(value, str) and value in allowed


def _validate_record_enums(
    record: dict[str, Any],
    index: int,
) -> list[str]:
    path = f"records[{index}]"
    errors = []
    enum_fields = (
        ("calculation_view", FEATURE_CALCULATION_VIEWS),
        ("calculation_status", FEATURE_CALCULATION_STATUSES),
        ("disposition", FEATURE_DISPOSITIONS),
    )
    for field, allowed in enum_fields:
        if not _valid_enum(record[field], allowed):
            errors.append(f"{path}.{field} is invalid")
    return errors


def _validate_record_fields(
    record: dict[str, Any],
    index: int,
) -> list[str]:
    path = f"records[{index}]"
    missing = _missing(record, REQUIRED_RECORD_FIELDS)
    if missing:
        return [f"{path} missing fields: {', '.join(missing)}"]
    return _validate_record_scalars(record, index) + _validate_record_enums(
        record, index
    )


def _validate_record_view(
    record: dict[str, Any],
    index: int,
    calculation_view: str,
) -> list[str]:
    path = f"records[{index}]"
    errors = []
    if record["calculation_view"] != calculation_view:
        errors.append(f"{path}.calculation_view does not match options")
    expected_source = (
        record["standardized_structure"]
        if calculation_view == "standardized"
        else record["parent_structure"]
    )
    if record["source_structure"] != expected_source:
        errors.append(f"{path}.source_structure does not match calculation view")
    return errors


def _validate_record_status(
    record: dict[str, Any],
    index: int,
) -> list[str]:
    path = f"records[{index}]"
    status = record["calculation_status"]
    disposition = record["disposition"]
    errors = []
    if status == "completed" and record["missing_features"]:
        errors.append(f"{path} completed record has missing_features")
    if status == "partial":
        if not record["missing_features"]:
            errors.append(f"{path} partial record needs missing_features")
        if disposition == "ready_for_downstream":
            errors.append(f"{path} partial record cannot be ready_for_downstream")
    if status in {"not_run", "error"} and (
        record["descriptors"] or record["fingerprints"]
    ):
        errors.append(f"{path} non-calculated record emitted features")
    if status == "error" and disposition != "rejected":
        errors.append(f"{path} error record must be rejected")
    if disposition == "ready_for_downstream":
        if status != "completed":
            errors.append(f"{path} ready record must be completed")
        if record["human_review_required"]:
            errors.append(f"{path} ready record cannot require human review")
    return errors


def _validate_record_fingerprints(
    record: dict[str, Any],
    index: int,
    profiles: dict[str, dict[str, Any]],
) -> list[str]:
    if record["calculation_status"] not in {"completed", "partial"}:
        return []
    path = f"records[{index}]"
    fingerprints = record["fingerprints"]
    if set(fingerprints) != FEATURE_PROFILE_NAMES:
        return [f"{path}.fingerprints must contain three profiles"]
    errors = []
    for name, profile in profiles.items():
        errors.extend(
            validate_fingerprint(
                fingerprints.get(name),
                profile,
                f"{path}.fingerprints.{name}",
            )
        )
    return errors


def _validate_records(
    artifact: dict[str, Any],
    profiles: dict[str, dict[str, Any]],
    calculation_view: str,
) -> list[str]:
    records = artifact.get("records")
    if not isinstance(records, list) or not records:
        return ["records must be non-empty object array"]
    errors = []
    for index, record in enumerate(records):
        if not isinstance(record, dict):
            errors.append(f"records[{index}] must be object")
            continue
        field_errors = _validate_record_fields(record, index)
        errors.extend(field_errors)
        if field_errors:
            continue
        errors.extend(_validate_record_view(record, index, calculation_view))
        errors.extend(_validate_record_status(record, index))
        errors.extend(_validate_record_fingerprints(record, index, profiles))
    return errors


def _validate_envelope(
    artifact: dict[str, Any],
) -> tuple[list[str], Any]:
    errors = []
    missing = _missing(artifact, REQUIRED_TOP_LEVEL)
    if missing:
        errors.append("features Artifact missing fields: " + ", ".join(missing))
    if artifact.get("schema_version") != FEATURE_SCHEMA_VERSION:
        errors.append("features Artifact schema_version is invalid")
    if artifact.get("workflow") != FEATURE_WORKFLOW:
        errors.append("features Artifact workflow is invalid")
    if not isinstance(artifact.get("tool_versions"), dict):
        errors.append("features Artifact tool_versions must be object")
    options = artifact.get("options")
    calculation_view = (
        options.get("calculation_view") if isinstance(options, dict) else None
    )
    if calculation_view not in FEATURE_CALCULATION_VIEWS:
        errors.append("features Artifact calculation_view is invalid")
    return errors, calculation_view


def _validate_profiles(
    artifact: dict[str, Any],
) -> tuple[list[str], dict[str, dict[str, Any]]]:
    profiles = artifact.get("fingerprint_profiles")
    if not isinstance(profiles, dict) or set(profiles) != FEATURE_PROFILE_NAMES:
        return (
            ["fingerprint_profiles must contain three core profiles"],
            {},
        )
    errors = []
    for name, profile in profiles.items():
        errors.extend(_validate_profile(name, profile))
    profile_ids = [
        profile.get("profile_id")
        for profile in profiles.values()
        if isinstance(profile, dict)
    ]
    if (
        len(profile_ids) != len(FEATURE_PROFILE_NAMES)
        or not all(isinstance(item, str) and item for item in profile_ids)
        or len(set(profile_ids)) != len(profile_ids)
    ):
        errors.append("fingerprint profile_id values must be unique strings")
    return errors, profiles if not errors else {}


def _validate_result_fingerprint(
    artifact: dict[str, Any],
) -> list[str]:
    fingerprint = artifact.get("result_fingerprint")
    if not isinstance(fingerprint, str) or not re.fullmatch(
        r"[0-9a-f]{64}",
        fingerprint,
    ):
        return ["features Artifact result_fingerprint is invalid"]
    if fingerprint != feature_artifact_fingerprint(artifact):
        return ["features Artifact fingerprint mismatch"]
    return []


def validate_feature_artifact(artifact: Any) -> list[str]:
    if not isinstance(artifact, dict):
        return ["features Artifact must be object"]
    errors, calculation_view = _validate_envelope(artifact)
    profile_errors, profiles = _validate_profiles(artifact)
    errors.extend(profile_errors)
    errors.extend(_validate_result_fingerprint(artifact))
    if calculation_view in FEATURE_CALCULATION_VIEWS and profiles:
        errors.extend(
            _validate_records(
                artifact,
                profiles,
                calculation_view,
            )
        )
    return errors
