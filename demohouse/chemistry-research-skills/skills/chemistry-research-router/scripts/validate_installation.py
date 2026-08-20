"""Validate a local chemistry Agent bundle installation receipt."""

from __future__ import annotations

import importlib.util
import json
import stat
import sys
from pathlib import Path, PurePosixPath
from typing import Any


def _load_sibling(name: str, filename: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


BUNDLE = _load_sibling("chemistry_installation_manifest", "bundle_manifest.py")
SMOKE = _load_sibling("chemistry_installation_smoke", "installation_smoke.py")
RECEIPT_FIELDS = {
    "schema_version",
    "bundle_id",
    "bundle_fingerprint",
    "host_adapter_version",
    "host_id",
    "scope",
    "project_root",
    "skill_root",
    "runtime_root",
    "installed_files",
    "receipt_fingerprint",
}


class InstallationIntegrityError(ValueError):
    """Raised when an installed bundle no longer matches its receipt."""


def _reject_non_finite(value: str) -> Any:
    raise InstallationIntegrityError(f"non-finite JSON is forbidden: {value}")


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise InstallationIntegrityError(f"duplicate JSON key: {key}")
        value[key] = item
    return value


def _read_object(path: Path, label: str) -> dict[str, Any]:
    try:
        value = json.loads(
            path.read_text(encoding="utf-8"),
            parse_constant=_reject_non_finite,
            object_pairs_hook=_unique_object,
        )
    except InstallationIntegrityError:
        raise
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise InstallationIntegrityError(f"{label} is unreadable") from error
    if not isinstance(value, dict):
        raise InstallationIntegrityError(f"{label} must be an object")
    return value


def _regular_file(
    path: Path,
    label: str,
    root: Path | None = None,
) -> None:
    if path.is_symlink():
        raise InstallationIntegrityError(f"{label} symlink is forbidden")
    if root is not None:
        try:
            relative = path.relative_to(root)
        except ValueError as error:
            raise InstallationIntegrityError(f"{label} escapes project") from error
        current = root
        for part in relative.parts[:-1]:
            current = current / part
            if current.is_symlink():
                raise InstallationIntegrityError(f"{label} parent symlink is forbidden")
    try:
        file_stat = path.lstat()
        resolved = path.resolve(strict=True)
    except OSError as error:
        raise InstallationIntegrityError(f"{label} is missing") from error
    if root is not None:
        try:
            resolved.relative_to(root)
        except ValueError as error:
            raise InstallationIntegrityError(f"{label} escapes project") from error
    if not stat.S_ISREG(file_stat.st_mode) or file_stat.st_nlink != 1:
        raise InstallationIntegrityError(f"{label} must be a regular file")


def _regular_directory(path: Path, label: str) -> Path:
    if path.is_symlink():
        raise InstallationIntegrityError(f"{label} symlink is forbidden")
    try:
        resolved = path.resolve(strict=True)
    except OSError as error:
        raise InstallationIntegrityError(f"{label} is missing") from error
    if not path.is_dir() or resolved != path.absolute():
        raise InstallationIntegrityError(f"{label} path is invalid")
    return resolved


def _receipt_roots(
    receipt_path: Path,
    receipt: dict[str, Any],
) -> tuple[Path, Path, Path]:
    if receipt_path.name != "installation-receipt.json":
        raise InstallationIntegrityError("receipt filename is invalid")
    if receipt_path.parent.name != ".chemistry-agent-bundle":
        raise InstallationIntegrityError("receipt directory is invalid")
    project_root = _regular_directory(receipt_path.parent.parent, "project")
    runtime_root = _regular_directory(receipt_path.parent / "runtime", "runtime")
    host_id = receipt.get("host_id")
    if host_id not in BUNDLE.HOST_SKILL_ROOTS:
        raise InstallationIntegrityError("receipt Host is unsupported")
    skill_root = _regular_directory(
        project_root / BUNDLE.HOST_SKILL_ROOTS[host_id],
        "Host skill root",
    )
    if receipt.get("project_root") != str(project_root):
        raise InstallationIntegrityError("receipt project path mismatch")
    if receipt.get("runtime_root") != str(runtime_root):
        raise InstallationIntegrityError("receipt runtime path mismatch")
    if receipt.get("skill_root") != str(skill_root):
        raise InstallationIntegrityError("receipt Host skill path mismatch")
    return project_root, skill_root, runtime_root


def _manifest(runtime_root: Path) -> dict[str, Any]:
    path = runtime_root / BUNDLE.MANIFEST_RELATIVE_PATH
    _regular_file(path, "portable bundle manifest")
    manifest = _read_object(path, "portable bundle manifest")
    try:
        return BUNDLE.validate_bundle_manifest(manifest, runtime_root)
    except BUNDLE.BundleIntegrityError as error:
        raise InstallationIntegrityError(str(error)) from error


def _manifest_file_entry(
    runtime_root: Path,
) -> dict[str, Any]:
    path = runtime_root / BUNDLE.MANIFEST_RELATIVE_PATH
    return {
        "path": (
            Path(".chemistry-agent-bundle") / "runtime" / BUNDLE.MANIFEST_RELATIVE_PATH
        ).as_posix(),
        "sha256": BUNDLE.sha256_file(path),
        "size_bytes": path.stat().st_size,
    }


def _expected_installed_files(
    project_root: Path,
    skill_root: Path,
    runtime_root: Path,
    manifest: dict[str, Any],
) -> list[dict[str, Any]]:
    entries = []
    for item in manifest["distributable_files"]:
        entries.append(
            {
                "path": (runtime_root / item["path"])
                .relative_to(project_root)
                .as_posix(),
                "sha256": item["sha256"],
                "size_bytes": item["size_bytes"],
            }
        )
        relative = item["path"]
        if relative.startswith("skills/"):
            _, skill_id, remainder = relative.split("/", 2)
            discovery = skill_root / skill_id / remainder
        else:
            prefix = "skills/chemistry-research-router/"
            if not relative.startswith(prefix):
                continue
            discovery = (
                skill_root / "chemistry-research-router" / relative.removeprefix(prefix)
            )
        entries.append(
            {
                "path": discovery.relative_to(project_root).as_posix(),
                "sha256": item["sha256"],
                "size_bytes": item["size_bytes"],
            }
        )
    entries.append(_manifest_file_entry(runtime_root))
    return sorted(entries, key=lambda item: item["path"])


def _safe_installed_path(project_root: Path, value: Any) -> Path:
    if not isinstance(value, str) or not value:
        raise InstallationIntegrityError("installed path is invalid")
    relative = PurePosixPath(value)
    if relative.is_absolute() or ".." in relative.parts or "." in relative.parts:
        raise InstallationIntegrityError("installed path is unsafe")
    path = project_root.joinpath(*relative.parts)
    try:
        path.relative_to(project_root)
    except ValueError as error:
        raise InstallationIntegrityError("installed path escapes project") from error
    return path


def _validate_installed_files(
    project_root: Path,
    receipt: dict[str, Any],
    expected: list[dict[str, Any]],
) -> None:
    files = receipt.get("installed_files")
    if files != expected:
        raise InstallationIntegrityError("receipt installed file list mismatch")
    seen: set[str] = set()
    for item in files:
        if not isinstance(item, dict) or set(item) != {
            "path",
            "sha256",
            "size_bytes",
        }:
            raise InstallationIntegrityError("installed file entry is invalid")
        if item["path"] in seen:
            raise InstallationIntegrityError("duplicate installed file path")
        seen.add(item["path"])
        path = _safe_installed_path(project_root, item["path"])
        _regular_file(path, "installed file", project_root)
        if path.stat().st_size != item["size_bytes"]:
            raise InstallationIntegrityError(
                f"installed file size mismatch: {item['path']}"
            )
        if BUNDLE.sha256_file(path) != item["sha256"]:
            raise InstallationIntegrityError(
                f"installed file SHA-256 mismatch: {item['path']}"
            )


def validate_installation(receipt_path: Path) -> dict[str, Any]:
    """Validate receipt location, manifest and every installed bundle file."""
    receipt_file = receipt_path.absolute()
    _regular_file(receipt_file, "installation receipt")
    receipt = _read_object(receipt_file, "installation receipt")
    if set(receipt) != RECEIPT_FIELDS:
        raise InstallationIntegrityError("installation receipt fields are invalid")
    if receipt.get("schema_version") != "1.0.0":
        raise InstallationIntegrityError("installation receipt version is unsupported")
    if receipt.get("scope") != "project":
        raise InstallationIntegrityError("installation receipt scope is unsupported")
    expected_fingerprint = BUNDLE.sha256_json(receipt, "receipt_fingerprint")
    if receipt.get("receipt_fingerprint") != expected_fingerprint:
        raise InstallationIntegrityError("installation receipt fingerprint mismatch")
    project_root, skill_root, runtime_root = _receipt_roots(receipt_file, receipt)
    manifest = _manifest(runtime_root)
    if receipt.get("bundle_id") != manifest["bundle_id"]:
        raise InstallationIntegrityError("installation bundle ID mismatch")
    if receipt.get("bundle_fingerprint") != manifest["package_fingerprint"]:
        raise InstallationIntegrityError("installation bundle fingerprint mismatch")
    if receipt.get("host_adapter_version") != manifest["host_adapter"]["version"]:
        raise InstallationIntegrityError("installation Host adapter drift")
    expected_files = _expected_installed_files(
        project_root,
        skill_root,
        runtime_root,
        manifest,
    )
    _validate_installed_files(project_root, receipt, expected_files)
    return receipt


def run_installation_smoke(receipt_path: Path) -> dict[str, Any]:
    """Run the fixed offline smoke matrix after validating installation."""
    receipt = validate_installation(receipt_path)
    runtime_root = Path(receipt["runtime_root"])
    manifest = _manifest(runtime_root)
    report = SMOKE.run_smoke(runtime_root, manifest)
    if report["total"] != 12:
        raise InstallationIntegrityError("installation smoke case count mismatch")
    return report
