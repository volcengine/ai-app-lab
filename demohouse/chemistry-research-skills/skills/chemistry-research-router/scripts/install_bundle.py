"""Install the chemistry Agent bundle into one controlled project scope."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import stat
import sys
from dataclasses import dataclass
from pathlib import Path
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


BUNDLE = _load_sibling("chemistry_bundle_manifest", "bundle_manifest.py")
IGNORE_ENTRY = b".chemistry-agent-bundle/\n"
RECEIPT_NAME = "installation-receipt.json"


class InstallationError(ValueError):
    """Raised when a project installation cannot proceed safely."""


@dataclass(frozen=True)
class CopyAction:
    source: Path
    destination: Path
    sha256: str
    size_bytes: int


def _reject_non_finite(value: str) -> Any:
    raise InstallationError(f"non-finite manifest value is forbidden: {value}")


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise InstallationError(f"duplicate manifest key is forbidden: {key}")
        value[key] = item
    return value


def _read_manifest(source_root: Path) -> dict[str, Any]:
    path = source_root / BUNDLE.MANIFEST_RELATIVE_PATH
    if path.is_symlink() or not path.is_file():
        raise InstallationError("portable bundle manifest is missing")
    try:
        value = json.loads(
            path.read_text(encoding="utf-8"),
            parse_constant=_reject_non_finite,
            object_pairs_hook=_unique_object,
        )
    except InstallationError:
        raise
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise InstallationError("portable bundle manifest is invalid") from error
    try:
        return BUNDLE.validate_bundle_manifest(value, source_root)
    except BUNDLE.BundleIntegrityError as error:
        raise InstallationError(str(error)) from error


def _project_root(target_root: Path) -> Path:
    if target_root.is_symlink() or not target_root.is_dir():
        raise InstallationError("target project root must be a regular directory")
    try:
        root = target_root.resolve(strict=True)
    except OSError as error:
        raise InstallationError("target project root cannot be resolved") from error
    if root != target_root.absolute():
        raise InstallationError("target project root cannot traverse symlinks")
    return root


def _runtime_actions(
    source_root: Path,
    runtime_root: Path,
    manifest: dict[str, Any],
) -> list[CopyAction]:
    actions = [
        CopyAction(
            source=source_root / item["path"],
            destination=runtime_root / item["path"],
            sha256=item["sha256"],
            size_bytes=item["size_bytes"],
        )
        for item in manifest["distributable_files"]
    ]
    manifest_source = source_root / BUNDLE.MANIFEST_RELATIVE_PATH
    actions.append(
        CopyAction(
            source=manifest_source,
            destination=runtime_root / BUNDLE.MANIFEST_RELATIVE_PATH,
            sha256=BUNDLE.sha256_file(manifest_source),
            size_bytes=manifest_source.stat().st_size,
        )
    )
    return actions


def _discovery_action(
    source_root: Path,
    skill_root: Path,
    item: dict[str, Any],
) -> CopyAction | None:
    relative = item["path"]
    if relative.startswith("skills/"):
        _, skill_id, remainder = relative.split("/", 2)
        destination = skill_root / skill_id / remainder
    else:
        prefix = "skills/chemistry-research-router/"
        if not relative.startswith(prefix):
            return None
        remainder = relative.removeprefix(prefix)
        destination = skill_root / "chemistry-research-router" / remainder
    return CopyAction(
        source=source_root / relative,
        destination=destination,
        sha256=item["sha256"],
        size_bytes=item["size_bytes"],
    )


def _copy_actions(
    source_root: Path,
    skill_root: Path,
    runtime_root: Path,
    manifest: dict[str, Any],
) -> list[CopyAction]:
    actions = _runtime_actions(source_root, runtime_root, manifest)
    for item in manifest["distributable_files"]:
        action = _discovery_action(source_root, skill_root, item)
        if action is not None:
            actions.append(action)
    by_destination: dict[str, CopyAction] = {}
    for action in actions:
        key = str(action.destination)
        if key in by_destination:
            raise InstallationError("duplicate installation destination")
        by_destination[key] = action
    return [by_destination[key] for key in sorted(by_destination)]


def _check_parent_chain(path: Path, project_root: Path) -> None:
    try:
        relative = path.relative_to(project_root)
    except ValueError as error:
        raise InstallationError("installation path escapes project root") from error
    current = project_root
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            raise InstallationError(f"installation symlink is forbidden: {current}")
        if current.exists() and not current.is_dir():
            raise InstallationError(
                f"installation parent is not a directory: {current}"
            )


def _check_destination(action: CopyAction, project_root: Path) -> None:
    _check_parent_chain(action.destination.parent, project_root)
    destination = action.destination
    if destination.is_symlink():
        raise InstallationError(f"installation symlink is forbidden: {destination}")
    if not destination.exists():
        return
    try:
        file_stat = destination.lstat()
    except OSError as error:
        raise InstallationError("cannot inspect installation destination") from error
    if not stat.S_ISREG(file_stat.st_mode) or file_stat.st_nlink != 1:
        raise InstallationError("existing installation file is unsafe")
    if (
        file_stat.st_size != action.size_bytes
        or BUNDLE.sha256_file(destination) != action.sha256
    ):
        raise InstallationError(f"existing installation file differs: {destination}")


def _check_gitignore(project_root: Path) -> tuple[Path, bytes]:
    path = project_root / ".gitignore"
    if path.is_symlink():
        raise InstallationError("project gitignore symlink is forbidden")
    if not path.exists():
        return path, b""
    try:
        file_stat = path.lstat()
        content = path.read_bytes()
    except OSError as error:
        raise InstallationError("project gitignore cannot be read") from error
    if not stat.S_ISREG(file_stat.st_mode) or file_stat.st_nlink != 1:
        raise InstallationError("project gitignore must be a regular file")
    return path, content


def _with_ignore_entry(content: bytes) -> bytes:
    lines = content.splitlines()
    if IGNORE_ENTRY.rstrip(b"\n") in lines:
        return content
    separator = b"" if not content or content.endswith(b"\n") else b"\n"
    return content + separator + IGNORE_ENTRY


def _write_action(action: CopyAction, project_root: Path) -> None:
    if action.destination.exists():
        return
    action.destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        data = action.source.read_bytes()
    except OSError as error:
        raise InstallationError("cannot read installation source") from error
    if len(data) != action.size_bytes or hashlib.sha256(data).hexdigest() != (
        action.sha256
    ):
        raise InstallationError("installation source changed after validation")
    try:
        with action.destination.open("xb") as handle:
            handle.write(data)
    except FileExistsError:
        _check_destination(action, project_root)
    except OSError as error:
        raise InstallationError("cannot write installation file") from error


def _installed_files(
    actions: list[CopyAction],
    project_root: Path,
) -> list[dict[str, Any]]:
    return [
        {
            "path": action.destination.relative_to(project_root).as_posix(),
            "sha256": action.sha256,
            "size_bytes": action.size_bytes,
        }
        for action in actions
    ]


def _receipt(
    host_id: str,
    project_root: Path,
    skill_root: Path,
    runtime_root: Path,
    manifest: dict[str, Any],
    actions: list[CopyAction],
) -> dict[str, Any]:
    value = {
        "schema_version": "1.0.0",
        "bundle_id": manifest["bundle_id"],
        "bundle_fingerprint": manifest["package_fingerprint"],
        "host_adapter_version": manifest["host_adapter"]["version"],
        "host_id": host_id,
        "scope": "project",
        "project_root": str(project_root),
        "skill_root": str(skill_root),
        "runtime_root": str(runtime_root),
        "installed_files": _installed_files(actions, project_root),
        "receipt_fingerprint": "",
    }
    value["receipt_fingerprint"] = BUNDLE.sha256_json(
        value,
        "receipt_fingerprint",
    )
    return value


def _write_receipt(path: Path, receipt: dict[str, Any]) -> None:
    expected = BUNDLE.canonical_json(receipt) + "\n"
    if path.is_symlink():
        raise InstallationError("installation receipt symlink is forbidden")
    if path.exists():
        try:
            current = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as error:
            raise InstallationError("installation receipt cannot be read") from error
        if current != expected:
            raise InstallationError("existing installation receipt differs")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("x", encoding="utf-8", newline="\n") as handle:
            handle.write(expected)
    except OSError as error:
        raise InstallationError("cannot write installation receipt") from error


def _update_gitignore(path: Path, before: bytes) -> None:
    after = _with_ignore_entry(before)
    if after == before:
        return
    try:
        if path.exists():
            with path.open("ab") as handle:
                handle.write(after[len(before) :])
        else:
            with path.open("xb") as handle:
                handle.write(after)
    except OSError as error:
        raise InstallationError("cannot update project gitignore") from error


def _remove_failed_receipt(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except OSError as error:
        raise InstallationError("failed receipt cannot be invalidated") from error


def _validate_result(receipt_path: Path) -> None:
    validator = _load_sibling(
        "chemistry_installer_validation",
        "validate_installation.py",
    )
    try:
        smoke = validator.run_installation_smoke(receipt_path)
    except BaseException as error:
        _remove_failed_receipt(receipt_path)
        if isinstance(error, (KeyboardInterrupt, SystemExit)):
            raise
        raise InstallationError("installation smoke failed") from error
    if smoke["failed"] != 0:
        _remove_failed_receipt(receipt_path)
        raise InstallationError("installation smoke failed")


def _commit_receipt(path: Path, receipt: dict[str, Any]) -> None:
    try:
        _write_receipt(path, receipt)
        _validate_result(path)
    except BaseException:
        _remove_failed_receipt(path)
        raise


def install_bundle(
    host_id: str,
    scope: str,
    source_root: Path,
    target_root: Path,
) -> dict[str, Any]:
    """Install one validated bundle without modifying Agent credentials."""
    if host_id not in BUNDLE.HOST_SKILL_ROOTS:
        raise InstallationError("unsupported Host adapter")
    if scope != "project":
        raise InstallationError("only project installation scope is supported")
    source = source_root.resolve()
    project = _project_root(target_root)
    manifest = _read_manifest(source)
    relative_skill_root = Path(BUNDLE.HOST_SKILL_ROOTS[host_id])
    skill_root = project / relative_skill_root
    runtime_root = project / ".chemistry-agent-bundle" / "runtime"
    actions = _copy_actions(source, skill_root, runtime_root, manifest)
    gitignore_path, gitignore_before = _check_gitignore(project)
    for action in actions:
        _check_destination(action, project)
    receipt = _receipt(
        host_id,
        project,
        skill_root,
        runtime_root,
        manifest,
        actions,
    )
    receipt_path = project / ".chemistry-agent-bundle" / RECEIPT_NAME
    existing_receipt = receipt_path.exists() or receipt_path.is_symlink()
    if existing_receipt:
        _write_receipt(receipt_path, receipt)
    for action in actions:
        _write_action(action, project)
    _update_gitignore(gitignore_path, gitignore_before)
    _commit_receipt(receipt_path, receipt)
    return receipt


def _main() -> int:
    cli = _load_sibling("chemistry_bundle_install_cli", "bundle_install_cli.py")
    return cli.main(install_bundle)


if __name__ == "__main__":
    raise SystemExit(_main())
