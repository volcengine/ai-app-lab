"""Resolve the portable repository root from source, runtime, or Host copies."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


class RuntimeLayoutError(ValueError):
    """Raised when a Router script cannot bind to an installed runtime."""


def _reject_non_finite(value: str) -> Any:
    raise RuntimeLayoutError(f"non-finite receipt value is forbidden: {value}")


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise RuntimeLayoutError(f"duplicate receipt key is forbidden: {key}")
        value[key] = item
    return value


def _read_object(path: Path, label: str) -> dict[str, Any]:
    if path.is_symlink() or not path.is_file():
        raise RuntimeLayoutError(f"{label} must be a regular file")
    try:
        value = json.loads(
            path.read_text(encoding="utf-8"),
            parse_constant=_reject_non_finite,
            object_pairs_hook=_unique_object,
        )
    except RuntimeLayoutError:
        raise
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise RuntimeLayoutError(f"{label} is unreadable") from error
    if not isinstance(value, dict):
        raise RuntimeLayoutError(f"{label} must be an object")
    return value


def _canonical_json(value: Any) -> str:
    try:
        return json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        )
    except (TypeError, ValueError) as error:
        raise RuntimeLayoutError("receipt is not canonical JSON") from error


def _sha256_json(value: dict[str, Any], excluded_field: str) -> str:
    payload = {key: item for key, item in value.items() if key != excluded_field}
    return hashlib.sha256(_canonical_json(payload).encode("utf-8")).hexdigest()


def _has_portable_layout(root: Path) -> bool:
    required = (
        root / "workflows/scripts/workflow_a_request.py",
        root / "orchestration/definitions/structure-features-v1.json",
        root / "skills/chemistry-research-router/references/route-catalog-v1.json",
    )
    return all(path.is_file() and not path.is_symlink() for path in required)


def _installed_runtime(script_path: Path) -> Path:
    resolved_script = script_path.resolve(strict=True)
    project_root = resolved_script.parents[4]
    receipt = _read_object(
        project_root / ".chemistry-agent-bundle/installation-receipt.json",
        "installation receipt",
    )
    if receipt.get("scope") != "project":
        raise RuntimeLayoutError("installation receipt scope mismatch")
    if receipt.get("project_root") != str(project_root):
        raise RuntimeLayoutError("installation receipt project path mismatch")
    expected_fingerprint = _sha256_json(receipt, "receipt_fingerprint")
    if receipt.get("receipt_fingerprint") != expected_fingerprint:
        raise RuntimeLayoutError("installation receipt fingerprint mismatch")
    skill_root = Path(str(receipt.get("skill_root", "")))
    try:
        resolved_script.relative_to(skill_root.resolve(strict=True))
    except (OSError, ValueError) as error:
        raise RuntimeLayoutError(
            "Router script is outside the Host skill root"
        ) from error
    runtime_root = project_root / ".chemistry-agent-bundle/runtime"
    if receipt.get("runtime_root") != str(runtime_root):
        raise RuntimeLayoutError("installation receipt runtime path mismatch")
    if runtime_root.is_symlink() or not runtime_root.is_dir():
        raise RuntimeLayoutError("installed runtime must be a real directory")
    if runtime_root.resolve(strict=True) != runtime_root.absolute():
        raise RuntimeLayoutError("installed runtime path is invalid")
    manifest = _read_object(
        runtime_root / "orchestration/chemistry-agent-bundle-v1.json",
        "installed bundle manifest",
    )
    if manifest.get("package_fingerprint") != receipt.get("bundle_fingerprint"):
        raise RuntimeLayoutError("installed bundle fingerprint mismatch")
    if not _has_portable_layout(runtime_root):
        raise RuntimeLayoutError("installed runtime layout is incomplete")
    return runtime_root


def repository_root(script_path: Path) -> Path:
    """Return the source/runtime root while validating Host-copy indirection."""
    try:
        resolved_script = script_path.resolve(strict=True)
    except OSError as error:
        raise RuntimeLayoutError("Router script path is unavailable") from error
    direct_root = resolved_script.parents[3]
    if _has_portable_layout(direct_root):
        return direct_root
    return _installed_runtime(resolved_script)
