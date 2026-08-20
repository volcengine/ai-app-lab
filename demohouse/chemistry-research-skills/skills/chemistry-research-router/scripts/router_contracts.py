"""Deterministic JSON and fingerprint contracts for the chemistry Router."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


class RouterContractError(ValueError):
    """Raised when Router contract data is malformed."""


def _reject_non_finite(value: str) -> Any:
    raise RouterContractError(f"non-finite JSON value is forbidden: {value}")


def _unique_json_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise RouterContractError(f"duplicate JSON key is forbidden: {key}")
        value[key] = item
    return value


def canonical_json(value: Any) -> str:
    """Serialize JSON deterministically without normalizing Unicode."""
    try:
        return json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        )
    except (TypeError, ValueError) as error:
        raise RouterContractError(
            f"non-finite or unsupported JSON value: {error}"
        ) from error


def sha256_text(value: str) -> str:
    """Hash the exact UTF-8 bytes of a string."""
    if not isinstance(value, str):
        raise RouterContractError("text must be a string")
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def sha256_json(
    value: Any,
    fingerprint_field: str | None = None,
) -> str:
    """Hash canonical JSON, optionally excluding its own fingerprint field."""
    payload = value
    if fingerprint_field is not None:
        if not isinstance(value, dict):
            raise RouterContractError("fingerprinted value must be an object")
        payload = {key: item for key, item in value.items() if key != fingerprint_field}
    return sha256_text(canonical_json(payload))


def read_json_object(path: Path, label: str) -> dict[str, Any]:
    """Read one strict UTF-8 JSON document whose top level is an object."""
    try:
        value = json.loads(
            path.read_text(encoding="utf-8"),
            parse_constant=_reject_non_finite,
            object_pairs_hook=_unique_json_object,
        )
    except RouterContractError:
        raise
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise RouterContractError(f"{label}: unreadable JSON: {error}") from error
    if not isinstance(value, dict):
        raise RouterContractError(f"{label}: top level must be an object")
    return value
