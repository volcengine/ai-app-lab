"""Secret and machine-path scanning for persisted Workflow packages."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any


SECRET_RE = re.compile(
    r"ark-[A-Za-z0-9_-]{12,}|"
    r"Bearer\s+[A-Za-z0-9._~+/=-]{12,}|"
    r"(?:Authorization|Cookie|Api[_ -]?Key)\s*[:=]\s*\S{12,}",
    re.IGNORECASE,
)
MACHINE_PATH_RE = re.compile(r"/(?:Users|home|private|tmp|var)/|[A-Za-z]:\\\\Users\\\\")


def content_errors(
    run_dir: Path,
    artifacts: list[dict[str, Any]],
) -> list[str]:
    _ = artifacts
    paths = sorted(
        path
        for path in run_dir.rglob("*")
        if path.is_file() and path.suffix in {".json", ".jsonl"}
    )
    errors = []
    for path in paths:
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as error:
            errors.append(f"package text is unreadable: {path.name}: {error}")
            continue
        if SECRET_RE.search(text):
            errors.append(f"possible secret detected in package file: {path.name}")
        if MACHINE_PATH_RE.search(text):
            errors.append(f"machine path detected in package file: {path.name}")
    return errors
