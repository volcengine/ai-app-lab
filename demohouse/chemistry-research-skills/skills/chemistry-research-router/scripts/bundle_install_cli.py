"""CLI facade for project-scoped chemistry Agent bundle installation."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Callable


Installer = Callable[[str, str, Path, Path], dict[str, Any]]


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--host",
        choices=("trae", "codex", "claude-code"),
        required=True,
    )
    parser.add_argument("--scope", choices=("project",), required=True)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--target-root", type=Path, required=True)
    return parser


def main(installer: Installer) -> int:
    args = _parser().parse_args()
    try:
        receipt = installer(
            args.host,
            args.scope,
            args.source_root,
            args.target_root,
        )
    except ValueError:
        print("install_bundle: installation failed", file=sys.stderr)
        return 2
    summary = {
        "status": "installed",
        "host_id": receipt["host_id"],
        "scope": receipt["scope"],
        "bundle_fingerprint": receipt["bundle_fingerprint"],
    }
    print(
        json.dumps(
            summary,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
    )
    return 0
