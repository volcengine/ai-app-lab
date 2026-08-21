"""Fingerprint profile and bit-vector invariants."""

from __future__ import annotations

import hashlib
import json
import math
from typing import Any


PROFILE_PARAMETERS = {
    "morgan": {
        "radius",
        "fpSize",
        "includeChirality",
        "useBondTypes",
        "countSimulation",
        "includeRedundantEnvironments",
        "bitsPerFeature",
    },
    "rdkit_topological": {
        "minPath",
        "maxPath",
        "useHs",
        "branchedPaths",
        "useBondOrder",
        "countSimulation",
        "fpSize",
        "numBitsPerFeature",
    },
}


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


def missing_errors(
    value: dict[str, Any],
    required: set[str],
    path: str,
) -> list[str]:
    missing = sorted(required - set(value))
    return [f"{path} missing fields: {missing!r}"] if missing else []


def validate_profile(name: str, profile: Any, path: str) -> list[str]:
    if not isinstance(profile, dict):
        return [f"{path} must be an object"]
    errors = missing_errors(
        profile,
        {
            "profile_id",
            "algorithm",
            "method_family",
            "representation",
            "parameters",
            "known_limitations",
            "profile_fingerprint",
        },
        path,
    )
    if profile.get("representation") != "bit_vector_on_bits":
        errors.append(f"{path}.representation must be bit_vector_on_bits")
    expected = sha256_json(
        {key: value for key, value in profile.items() if key != "profile_fingerprint"}
    )
    if profile.get("profile_fingerprint") != expected:
        errors.append(f"{path}.profile_fingerprint mismatch")
    parameters = profile.get("parameters")
    if not isinstance(parameters, dict):
        return [*errors, f"{path}.parameters must be an object"]
    errors.extend(
        f"{path}.parameters.{field} is required"
        for field in PROFILE_PARAMETERS.get(name, set())
        if field not in parameters
    )
    if name == "maccs":
        if parameters.get("fpSize") != 167:
            errors.append(f"{path}.parameters.fpSize must be 167")
        if parameters.get("bit0Unused") is not True:
            errors.append(f"{path}.parameters.bit0Unused must be true")
    return errors


def _vector_errors(
    fingerprint: dict[str, Any],
    size: int,
    on_bits: list[int],
    path: str,
) -> list[str]:
    errors = []
    if on_bits != sorted(set(on_bits)):
        errors.append(f"{path}.on_bits must be sorted and unique")
    if any(item < 0 or item >= size for item in on_bits):
        errors.append(f"{path}.on_bits contains an out-of-range bit")
    bit_count = fingerprint.get("bit_count")
    if (
        isinstance(bit_count, bool)
        or not isinstance(bit_count, int)
        or bit_count != len(on_bits)
    ):
        errors.append(f"{path}.bit_count does not match on_bits")
    density = fingerprint.get("density")
    expected_density = len(on_bits) / size
    if (
        isinstance(density, bool)
        or not isinstance(density, (int, float))
        or not math.isfinite(float(density))
        or not math.isclose(
            float(density),
            expected_density,
            rel_tol=0.0,
            abs_tol=1e-15,
        )
    ):
        errors.append(f"{path}.density does not match bit_count/size")
    bit_set = set(on_bits)
    ascii_bits = "".join("1" if index in bit_set else "0" for index in range(size))
    if fingerprint.get("bitvector_sha256") != sha256_text(ascii_bits):
        errors.append(f"{path}.bitvector_sha256 mismatch")
    if fingerprint.get("hash_encoding") != ("ascii_bitstring_index_0_to_n_minus_1"):
        errors.append(f"{path}.hash_encoding is invalid")
    return errors


def validate_fingerprint(
    fingerprint: Any,
    profile: dict[str, Any],
    path: str,
) -> list[str]:
    if not isinstance(fingerprint, dict):
        return [f"{path} must be an object"]
    errors = missing_errors(
        fingerprint,
        {
            "profile_id",
            "representation",
            "size",
            "on_bits",
            "bit_count",
            "density",
            "bitvector_sha256",
            "hash_encoding",
        },
        path,
    )
    checks = (
        (
            fingerprint.get("profile_id") != profile.get("profile_id"),
            f"{path}.profile_id does not match fingerprint profile",
        ),
        (
            fingerprint.get("representation") != "bit_vector_on_bits",
            f"{path}.representation is invalid",
        ),
    )
    errors.extend(message for invalid, message in checks if invalid)
    size = fingerprint.get("size")
    on_bits = fingerprint.get("on_bits")
    if isinstance(size, bool) or not isinstance(size, int) or size <= 0:
        return [*errors, f"{path}.size must be a positive integer"]
    if size != (profile.get("parameters") or {}).get("fpSize"):
        errors.append(f"{path}.size does not match profile fpSize")
    if not isinstance(on_bits, list) or not all(
        isinstance(item, int) and not isinstance(item, bool) for item in on_bits
    ):
        return [*errors, f"{path}.on_bits must be an integer list"]
    errors.extend(_vector_errors(fingerprint, size, on_bits, path))
    return errors
