"""Checksum manifest verification for Workflow run directories."""

from __future__ import annotations

import hashlib
import re
from pathlib import Path


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def checksum_errors(run_dir: Path) -> list[str]:
    checksum_path = run_dir / "checksums.sha256"
    try:
        lines = checksum_path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError) as error:
        return [f"checksum file is unreadable: {error}"]
    declared: dict[str, str] = {}
    errors: list[str] = []
    for line in lines:
        parts = line.split("  ", 1)
        if len(parts) != 2 or not re.fullmatch(r"[0-9a-f]{64}", parts[0]):
            errors.append("checksum line is invalid")
            continue
        relative = Path(parts[1])
        if relative.is_absolute() or ".." in relative.parts or parts[1] in declared:
            errors.append("checksum path is invalid or duplicate")
            continue
        declared[parts[1]] = parts[0]
    actual_paths = sorted(
        path
        for path in run_dir.rglob("*")
        if path.is_file() and path.name not in {"checksums.sha256", "run.lock"}
    )
    actual_names = {path.relative_to(run_dir).as_posix() for path in actual_paths}
    if set(declared) != actual_names:
        errors.append("checksum file set does not match run files")
    for relative, expected in declared.items():
        path = run_dir / relative
        if path.is_symlink() or not path.is_file() or path.stat().st_nlink != 1:
            errors.append(f"checksum path is unsafe: {relative}")
        elif _sha256_file(path) != expected:
            errors.append(f"checksum mismatch: {relative}")
    return errors
