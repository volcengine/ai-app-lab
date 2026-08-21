"""Canonical manifest for the portable chemistry Agent bundle."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import stat
import sys
import tomllib
from pathlib import Path, PurePosixPath
from typing import Any


def _load_spec() -> Any:
    path = Path(__file__).with_name("bundle_spec.py")
    spec = importlib.util.spec_from_file_location("chemistry_bundle_spec", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load bundle_spec.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


SPEC = _load_spec()
HOST_SKILL_ROOTS = SPEC.HOST_SKILL_ROOTS
MANIFEST_RELATIVE_PATH = SPEC.MANIFEST_RELATIVE_PATH


class BundleIntegrityError(ValueError):
    """Raised when a portable bundle manifest or source tree is invalid."""


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
        raise BundleIntegrityError(
            f"manifest is not canonical JSON: {error}"
        ) from error


def sha256_json(value: Any, excluded_field: str | None = None) -> str:
    payload = value
    if excluded_field is not None:
        if not isinstance(value, dict):
            raise BundleIntegrityError("fingerprinted value must be an object")
        payload = {key: item for key, item in value.items() if key != excluded_field}
    return hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as error:
        raise BundleIntegrityError(f"cannot read bundle file: {path}") from error
    return digest.hexdigest()


def _safe_source_file(path: Path, root: Path) -> None:
    try:
        relative = path.relative_to(root)
        file_stat = path.lstat()
    except (OSError, ValueError) as error:
        raise BundleIntegrityError("bundle source path is invalid") from error
    if path.is_symlink() or not stat.S_ISREG(file_stat.st_mode):
        raise BundleIntegrityError(
            f"bundle source must be a regular file: {relative.as_posix()}"
        )
    current = root
    for part in relative.parts[:-1]:
        current = current / part
        if current.is_symlink():
            raise BundleIntegrityError(
                f"bundle source symlink is forbidden: {relative.as_posix()}"
            )
    try:
        path.resolve(strict=True).relative_to(root)
    except (OSError, ValueError) as error:
        raise BundleIntegrityError(
            f"bundle source escapes root: {relative.as_posix()}"
        ) from error
    if file_stat.st_nlink != 1:
        raise BundleIntegrityError(
            f"bundle source hardlink is forbidden: {relative.as_posix()}"
        )


def _is_ignored(relative: Path) -> bool:
    return any(part in SPEC.IGNORED_PARTS for part in relative.parts) or (
        relative.suffix in {".pyc", ".pyo"}
    )


def _source_files(repository_root: Path) -> list[Path]:
    root = repository_root.resolve()
    files: list[Path] = []
    for relative in SPEC.ROOT_FILES:
        path = root / relative
        _safe_source_file(path, root)
        files.append(path)
    for directory in SPEC.SOURCE_DIRECTORIES:
        base = root / directory
        if base.is_symlink() or not base.is_dir():
            raise BundleIntegrityError(
                f"bundle source directory is invalid: {directory}"
            )
        for path in sorted(base.rglob("*")):
            relative = path.relative_to(root)
            if _is_ignored(relative):
                continue
            if path.is_symlink():
                raise BundleIntegrityError(
                    f"bundle source symlink is forbidden: {relative.as_posix()}"
                )
            if path.is_file():
                _safe_source_file(path, root)
                files.append(path)
    unique = {path.relative_to(root).as_posix(): path for path in files}
    unique.pop(MANIFEST_RELATIVE_PATH.as_posix(), None)
    return [unique[key] for key in sorted(unique)]


def _file_entries(repository_root: Path) -> list[dict[str, Any]]:
    root = repository_root.resolve()
    return [
        {
            "path": path.relative_to(root).as_posix(),
            "sha256": sha256_file(path),
            "size_bytes": path.stat().st_size,
        }
        for path in _source_files(root)
    ]


def _files_for_prefix(
    entries: list[dict[str, Any]],
    prefix: str,
) -> list[dict[str, Any]]:
    marker = prefix.rstrip("/") + "/"
    return [item for item in entries if item["path"].startswith(marker)]


def _project_version(repository_root: Path) -> str:
    try:
        value = tomllib.loads(
            (repository_root / "pyproject.toml").read_text(encoding="utf-8")
        )
        version = value["project"]["version"]
    except (
        OSError,
        UnicodeError,
        tomllib.TOMLDecodeError,
        KeyError,
        TypeError,
    ) as error:
        raise BundleIntegrityError("project version is invalid") from error
    if not isinstance(version, str) or not version:
        raise BundleIntegrityError("project version is invalid")
    return version


def _document(repository_root: Path, relative: str) -> dict[str, Any]:
    path = repository_root / relative
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise BundleIntegrityError(f"bundle JSON is invalid: {relative}") from error
    if not isinstance(value, dict):
        raise BundleIntegrityError(f"bundle JSON must be an object: {relative}")
    return value


def _skill_records(
    entries: list[dict[str, Any]],
    version: str,
) -> list[dict[str, Any]]:
    records = []
    for skill_id in SPEC.SKILL_IDS:
        files = _files_for_prefix(entries, f"skills/{skill_id}")
        if not files:
            raise BundleIntegrityError(f"Skill source is missing: {skill_id}")
        record = {
            "skill_id": skill_id,
            "version": version,
            "file_count": len(files),
            "skill_fingerprint": sha256_json(
                {"skill_id": skill_id, "version": version, "files": files}
            ),
        }
        records.append(record)
    return records


def _schema_records(
    repository_root: Path,
    entries: list[dict[str, Any]],
) -> list[dict[str, str]]:
    by_path = {item["path"]: item for item in entries}
    prefix = "skills/chemistry-research-router/references"
    records = []
    for filename in SPEC.SCHEMA_PATHS:
        relative = f"{prefix}/{filename}"
        if relative not in by_path:
            raise BundleIntegrityError(f"runtime Schema is missing: {filename}")
        records.append(
            {
                "schema_id": filename.removesuffix(".schema.json"),
                "path": relative,
                "sha256": by_path[relative]["sha256"],
            }
        )
    return records


def _definition_records(
    repository_root: Path,
    entries: list[dict[str, Any]],
    *,
    kind: str,
) -> list[dict[str, str]]:
    by_path = {item["path"]: item for item in entries}
    ids = SPEC.CHAIN_IDS if kind == "chain" else SPEC.WORKFLOW_IDS
    directory = (
        "orchestration/definitions" if kind == "chain" else "workflows/definitions"
    )
    id_field = "chain_id" if kind == "chain" else "workflow_id"
    records = []
    for definition_id in ids:
        relative = f"{directory}/{definition_id}.json"
        value = _document(repository_root, relative)
        if value.get(id_field) != definition_id:
            raise BundleIntegrityError(
                f"{kind} Definition ID mismatch: {definition_id}"
            )
        fingerprint = value.get("definition_fingerprint")
        if not isinstance(fingerprint, str) or len(fingerprint) != 64:
            raise BundleIntegrityError(
                f"{kind} Definition fingerprint is invalid: {definition_id}"
            )
        if fingerprint != sha256_json(value, "definition_fingerprint"):
            raise BundleIntegrityError(
                f"{kind} Definition fingerprint mismatch: {definition_id}"
            )
        records.append(
            {
                f"{kind}_id": definition_id,
                "path": relative,
                "sha256": by_path[relative]["sha256"],
                "definition_fingerprint": fingerprint,
            }
        )
    return records


def build_bundle_manifest(repository_root: Path) -> dict[str, Any]:
    """Build the deterministic portable manifest from a repository root."""
    root = repository_root.resolve()
    entries = _file_entries(root)
    version = _project_version(root)
    router_files = _files_for_prefix(
        entries,
        "skills/chemistry-research-router",
    )
    catalog_path = "skills/chemistry-research-router/references/route-catalog-v1.json"
    catalog = _document(root, catalog_path)
    if catalog.get("catalog_fingerprint") != sha256_json(
        catalog,
        "catalog_fingerprint",
    ):
        raise BundleIntegrityError("Route Catalog fingerprint mismatch")
    by_path = {item["path"]: item for item in entries}
    manifest: dict[str, Any] = {
        "schema_version": SPEC.SCHEMA_VERSION,
        "bundle_id": SPEC.BUNDLE_ID,
        "package_version": version,
        "host_adapter": {
            "version": SPEC.HOST_ADAPTER_VERSION,
            "project_skill_roots": HOST_SKILL_ROOTS,
        },
        "skills": _skill_records(entries, version),
        "router_skill": {
            "skill_id": "chemistry-research-router",
            "file_count": len(router_files),
            "router_skill_fingerprint": sha256_json(router_files),
        },
        "runtime_schemas": _schema_records(root, entries),
        "route_catalog": {
            "path": catalog_path,
            "sha256": by_path[catalog_path]["sha256"],
            "catalog_fingerprint": catalog["catalog_fingerprint"],
        },
        "chain_definitions": _definition_records(
            root,
            entries,
            kind="chain",
        ),
        "workflow_definitions": _definition_records(
            root,
            entries,
            kind="workflow",
        ),
        "distributable_files": entries,
        "package_fingerprint": "",
    }
    manifest["package_fingerprint"] = sha256_json(
        manifest,
        "package_fingerprint",
    )
    return manifest


def _validate_relative_path(value: Any) -> str:
    if not isinstance(value, str) or not value:
        raise BundleIntegrityError("manifest path must be a non-empty string")
    path = PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts or "." in path.parts:
        raise BundleIntegrityError(f"manifest path is unsafe: {value}")
    return value


def validate_bundle_manifest(
    value: Any,
    repository_root: Path,
) -> dict[str, Any]:
    """Validate manifest integrity and every distributable source file."""
    if not isinstance(value, dict):
        raise BundleIntegrityError("bundle manifest must be an object")
    expected_fingerprint = sha256_json(value, "package_fingerprint")
    if value.get("package_fingerprint") != expected_fingerprint:
        raise BundleIntegrityError("bundle package fingerprint mismatch")
    files = value.get("distributable_files")
    if not isinstance(files, list):
        raise BundleIntegrityError("distributable_files must be an array")
    root = repository_root.resolve()
    seen: set[str] = set()
    for item in files:
        if not isinstance(item, dict):
            raise BundleIntegrityError("bundle file entry must be an object")
        relative = _validate_relative_path(item.get("path"))
        if relative in seen:
            raise BundleIntegrityError(f"duplicate bundle path: {relative}")
        seen.add(relative)
        path = root / relative
        _safe_source_file(path, root)
        if item.get("size_bytes") != path.stat().st_size:
            raise BundleIntegrityError(f"bundle size/SHA-256 mismatch: {relative}")
        if item.get("sha256") != sha256_file(path):
            raise BundleIntegrityError(f"bundle SHA-256 mismatch: {relative}")
    expected = build_bundle_manifest(root)
    if value != expected:
        raise BundleIntegrityError("bundle manifest metadata mismatch")
    return value


def _main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    manifest = build_bundle_manifest(args.repository_root)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(canonical_json(manifest) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
