"""Verify and stage portable ExecutionRequest inputs for target runtimes."""

from __future__ import annotations

import hashlib
import stat
from pathlib import Path
from typing import Any


class TargetStagingError(ValueError):
    """Raised when a declared input cannot be safely staged."""


def _declared_path(value: str) -> Path:
    declared = Path(value)
    if declared.is_absolute() or declared == Path(".") or ".." in declared.parts:
        raise TargetStagingError("staged input path is unsafe")
    return declared


def _source_path(base: Path, declared: Path) -> Path:
    if base.is_symlink() or not base.is_dir():
        raise TargetStagingError("request base must be a real directory")
    root = base.resolve(strict=True)
    current = root
    for part in declared.parts:
        current = current / part
        if current.is_symlink():
            raise TargetStagingError("staged input symlink is forbidden")
    try:
        source = current.resolve(strict=True)
        source.relative_to(root)
    except (OSError, ValueError) as error:
        raise TargetStagingError(
            "staged input is missing or escapes request base"
        ) from error
    source_stat = source.stat()
    if not stat.S_ISREG(source_stat.st_mode):
        raise TargetStagingError("staged input must be a regular file")
    if source_stat.st_nlink != 1:
        raise TargetStagingError("staged input hardlink is forbidden")
    return source


def stage_inputs(
    request: dict[str, Any],
    request_base: Path | None,
    target_base: Path,
    write_bytes: Any,
) -> None:
    """Copy hash-verified inputs while preserving declared relative paths."""
    staged = request["staged_inputs"]
    if not staged:
        return
    if request_base is None:
        raise TargetStagingError("request base is required for staged inputs")
    for item in staged:
        declared = _declared_path(item["path"])
        source = _source_path(request_base, declared)
        data = source.read_bytes()
        if hashlib.sha256(data).hexdigest() != item["sha256"]:
            raise TargetStagingError("staged input hash mismatch")
        destination = target_base / declared
        write_bytes(destination, data)
