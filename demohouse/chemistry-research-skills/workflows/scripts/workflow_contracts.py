"""Shared deterministic contracts for chemistry workflows."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any


SCHEMA_VERSION = "1.0.0"
SUPPORTED_WORKFLOWS = {
    "compound-evidence-v1",
    "route-evidence-review-v1",
}
COMMON_REQUEST_FIELDS = {
    "schema_version",
    "workflow_id",
    "request_id",
    "inputs",
    "execution_policy",
}
EXECUTION_POLICY_FIELDS = {"network_mode", "external_retry"}
NETWORK_MODES = {"offline", "public_http"}
EXTERNAL_RETRY_POLICIES = {"manual"}
CONTROLLED_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
RUN_ID_RE = re.compile(r"^run-\d{8}T\d{6}Z-[0-9a-f]{12}-[0-9a-f]{8}$")


class ContractError(ValueError):
    """Raised when a workflow contract fails closed."""


def _reject_non_finite(value: str) -> Any:
    raise ContractError(f"non-finite JSON value is forbidden: {value}")


def unique_json_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise ContractError(f"duplicate JSON key is forbidden: {key}")
        value[key] = item
    return value


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
        raise ContractError(f"non-finite or unsupported JSON value: {error}") from error


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def read_json_object(path: Path, label: str) -> dict[str, Any]:
    try:
        value = json.loads(
            path.read_text(encoding="utf-8"),
            parse_constant=_reject_non_finite,
            object_pairs_hook=unique_json_object,
        )
    except ContractError:
        raise
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ContractError(f"{label}: unreadable JSON: {error}") from error
    if not isinstance(value, dict):
        raise ContractError(f"{label}: top level must be an object")
    return value


def require_exact_fields(
    value: dict[str, Any],
    required: set[str],
    optional: set[str],
    label: str,
) -> None:
    missing = sorted(required - value.keys())
    unknown = sorted(value.keys() - required - optional)
    if missing or unknown:
        raise ContractError(f"{label}: missing={missing}, unknown fields={unknown}")


def require_controlled_id(value: Any, label: str) -> str:
    if not isinstance(value, str) or not CONTROLLED_ID_RE.fullmatch(value):
        raise ContractError(f"{label}: invalid controlled ID")
    return value


def require_sha256(value: Any, label: str) -> str:
    if not isinstance(value, str) or not SHA256_RE.fullmatch(value):
        raise ContractError(f"{label}: invalid SHA-256")
    return value


def require_run_id(value: Any, label: str = "run_id") -> str:
    if not isinstance(value, str) or not RUN_ID_RE.fullmatch(value):
        raise ContractError(f"{label}: invalid versioned run_id")
    return value


def validate_execution_policy(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        raise ContractError("execution_policy: must be an object")
    require_exact_fields(
        value,
        EXECUTION_POLICY_FIELDS,
        set(),
        "execution_policy",
    )
    network_mode = value["network_mode"]
    external_retry = value["external_retry"]
    if not isinstance(network_mode, str) or network_mode not in NETWORK_MODES:
        raise ContractError("execution_policy.network_mode: unsupported")
    if (
        not isinstance(external_retry, str)
        or external_retry not in EXTERNAL_RETRY_POLICIES
    ):
        raise ContractError("execution_policy.external_retry: unsupported")
    return {
        "network_mode": network_mode,
        "external_retry": external_retry,
    }


def validate_common_request(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ContractError("workflow request: top level must be an object")
    require_exact_fields(value, COMMON_REQUEST_FIELDS, set(), "workflow request")
    if value["schema_version"] != SCHEMA_VERSION:
        raise ContractError("workflow request: schema_version must be 1.0.0")
    workflow_id = value["workflow_id"]
    if not isinstance(workflow_id, str) or workflow_id not in SUPPORTED_WORKFLOWS:
        raise ContractError("workflow request: unsupported workflow_id")
    request_id = require_controlled_id(value["request_id"], "request_id")
    if not isinstance(value["inputs"], dict):
        raise ContractError("workflow request.inputs: must be an object")
    return {
        "schema_version": SCHEMA_VERSION,
        "workflow_id": workflow_id,
        "request_id": request_id,
        "inputs": value["inputs"],
        "execution_policy": validate_execution_policy(value["execution_policy"]),
    }


def validate_relative_input_path(value: Any) -> Path:
    if not isinstance(value, str) or not value:
        raise ContractError("input path: must be a non-empty string")
    declared = Path(value)
    if declared.is_absolute() or ".." in declared.parts:
        raise ContractError("input path: absolute or parent path is forbidden")
    if declared == Path("."):
        raise ContractError("input path: file path is required")
    return declared


def _reject_symlink_components(base: Path, declared: Path) -> None:
    current = base
    for part in declared.parts:
        current = current / part
        if current.is_symlink():
            raise ContractError("input path: symlink is forbidden")


def resolve_declared_input(base: Path, value: Any) -> Path:
    declared = validate_relative_input_path(value)
    base_resolved = base.resolve(strict=True)
    _reject_symlink_components(base_resolved, declared)
    try:
        resolved = (base_resolved / declared).resolve(strict=True)
        resolved.relative_to(base_resolved)
    except (OSError, ValueError) as error:
        raise ContractError("input path: missing or escapes base") from error
    if not resolved.is_file():
        raise ContractError("input path: regular file is required")
    return resolved
