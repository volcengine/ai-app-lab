"""CLI for deterministic semantic draft to ResearchIntent conversion."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import stat
from pathlib import Path
from typing import Any


class BuildIntentCliError(ValueError):
    """Raised when CLI input or output handling fails closed."""


def _load_sibling(name: str, filename: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


CONTRACTS = _load_sibling("router_build_cli_contracts", "router_contracts.py")
BUILDER = _load_sibling("router_build_cli_builder", "intent_builder.py")
COPY_CHUNK_SIZE = 1024 * 1024


def _read_source(path: Path) -> str:
    try:
        return path.read_bytes().decode("utf-8")
    except (OSError, UnicodeError) as error:
        raise BuildIntentCliError("source is not readable UTF-8") from error


def _write_new(path: Path, value: dict[str, Any]) -> None:
    if path.exists() or path.is_symlink():
        raise BuildIntentCliError("intent output already exists")
    created = False
    try:
        with path.open("x", encoding="utf-8", newline="\n") as handle:
            created = True
            handle.write(CONTRACTS.canonical_json(value) + "\n")
    except OSError as error:
        if created:
            path.unlink(missing_ok=True)
        raise BuildIntentCliError("cannot write intent output") from error


def _real_directory(path: Path, label: str) -> Path:
    if path.is_symlink() or not path.is_dir():
        raise BuildIntentCliError(f"{label} must be a real directory")
    try:
        return path.resolve(strict=True)
    except OSError as error:
        raise BuildIntentCliError(f"{label} is not accessible") from error


def _attachment_source(
    attachment: dict[str, Any],
    attachment_root: Path,
) -> Path:
    source = attachment_root / attachment["display_name"]
    if source.is_symlink():
        raise BuildIntentCliError("attachment source symlink is forbidden")
    try:
        resolved = source.resolve(strict=True)
        resolved.relative_to(attachment_root)
        file_stat = resolved.stat()
    except (OSError, ValueError) as error:
        raise BuildIntentCliError("attachment source is unavailable") from error
    if not stat.S_ISREG(file_stat.st_mode):
        raise BuildIntentCliError("attachment source must be a regular file")
    if file_stat.st_size != attachment["size_bytes"]:
        raise BuildIntentCliError("attachment source size mismatch")
    return resolved


def _stage_attachments(
    manifest: dict[str, Any],
    attachment_root: Path,
    intent_path: Path,
) -> list[Path]:
    source_root = _real_directory(attachment_root, "attachment root")
    output_root = _real_directory(intent_path.parent, "intent output directory")
    prepared: list[tuple[dict[str, Any], Path, Path]] = []
    for attachment in manifest["attachments"]:
        target = output_root / attachment["attachment_id"]
        if target == intent_path or target.exists() or target.is_symlink():
            raise BuildIntentCliError("staged attachment output already exists")
        prepared.append(
            (
                attachment,
                _attachment_source(attachment, source_root),
                target,
            )
        )
    created: list[Path] = []
    try:
        for attachment, source, target in prepared:
            digest = hashlib.sha256()
            size = 0
            with source.open("rb") as source_handle, target.open("xb") as handle:
                created.append(target)
                while chunk := source_handle.read(COPY_CHUNK_SIZE):
                    handle.write(chunk)
                    digest.update(chunk)
                    size += len(chunk)
            if size != attachment["size_bytes"]:
                raise BuildIntentCliError("attachment source size mismatch")
            if digest.hexdigest() != attachment["sha256"]:
                raise BuildIntentCliError("attachment source hash mismatch")
    except (OSError, BuildIntentCliError) as error:
        for path in created:
            path.unlink(missing_ok=True)
        if isinstance(error, BuildIntentCliError):
            raise
        raise BuildIntentCliError("cannot stage attachment output") from error
    return created


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Build validated ResearchIntent V1 from a semantic draft",
    )
    parser.add_argument("--draft", type=Path, required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--attachments", type=Path, required=True)
    parser.add_argument("--attachment-root", type=Path, required=True)
    parser.add_argument("--certificate", type=Path, required=True)
    parser.add_argument("--intent", type=Path, required=True)
    return parser


def _success(intent: dict[str, Any]) -> dict[str, Any]:
    return {
        "built": True,
        "valid": True,
        "intent_id": intent["intent_id"],
        "intent_fingerprint": intent["intent_fingerprint"],
    }


def _failure() -> dict[str, Any]:
    return {
        "built": False,
        "valid": False,
        "intent_id": None,
        "intent_fingerprint": None,
    }


def main() -> int:
    args = build_parser().parse_args()
    created: list[Path] = []
    try:
        attachments = CONTRACTS.read_json_object(
            args.attachments,
            "attachment manifest",
        )
        intent = BUILDER.build_research_intent(
            CONTRACTS.read_json_object(args.draft, "semantic draft"),
            _read_source(args.source),
            attachments,
            CONTRACTS.read_json_object(args.certificate, "certificate"),
        )
        created = _stage_attachments(
            attachments,
            args.attachment_root,
            args.intent,
        )
        _write_new(args.intent, intent)
    except (
        CONTRACTS.RouterContractError,
        BUILDER.IntentBuildError,
        BuildIntentCliError,
    ):
        for path in created:
            path.unlink(missing_ok=True)
        print(CONTRACTS.canonical_json(_failure()))
        return 2
    print(CONTRACTS.canonical_json(_success(intent)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
