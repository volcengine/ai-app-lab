"""Validate ResearchIntent references against exact source material."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any


class SourceBindingError(ValueError):
    """Raised when an Intent source reference cannot be replayed."""


def _load_contracts() -> Any:
    path = Path(__file__).with_name("router_contracts.py")
    spec = importlib.util.spec_from_file_location(
        "router_source_contracts",
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load router_contracts.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


CONTRACTS = _load_contracts()
REFERENCE_SECTIONS = (
    "research_objects",
    "requested_operations",
    "input_artifacts",
    "user_parameters",
)


def validate_message_span(
    source_text: str,
    source_ref: dict[str, Any],
) -> None:
    start = source_ref["start"]
    end = source_ref["end"]
    if not 0 <= start < end <= len(source_text):
        raise SourceBindingError("source span is outside message")
    selected = source_text[start:end]
    if CONTRACTS.sha256_text(selected) != source_ref["text_sha256"]:
        raise SourceBindingError("source span hash mismatch")


def _validate_source_metadata(
    intent: dict[str, Any],
    source_text: str,
    attachment_manifest: dict[str, Any],
) -> None:
    source = intent["source"]
    if source["content_sha256"] != CONTRACTS.sha256_text(source_text):
        raise SourceBindingError("source content hash mismatch")
    if source["message_length"] != len(source_text):
        raise SourceBindingError("source message_length mismatch")
    expected = CONTRACTS.sha256_json(attachment_manifest["attachments"])
    if attachment_manifest["attachments_fingerprint"] != expected:
        raise SourceBindingError("attachments_fingerprint mismatch")
    if source["attachments_fingerprint"] != expected:
        raise SourceBindingError("source attachments_fingerprint mismatch")


def _attachment_map(
    attachment_manifest: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    attachments: dict[str, dict[str, Any]] = {}
    for item in attachment_manifest["attachments"]:
        attachment_id = item["attachment_id"]
        if attachment_id in attachments:
            raise SourceBindingError("duplicate attachment_id")
        attachments[attachment_id] = item
    return attachments


def _validate_attachment_ref(
    source_ref: dict[str, Any],
    attachments: dict[str, dict[str, Any]],
) -> None:
    attachment = attachments.get(source_ref["attachment_id"])
    if attachment is None:
        raise SourceBindingError("unknown attachment reference")
    if source_ref["sha256"] != attachment["sha256"]:
        raise SourceBindingError("attachment hash mismatch")


def _source_ref_map(
    intent: dict[str, Any],
    source_text: str,
    attachments: dict[str, dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    source_refs: dict[str, dict[str, Any]] = {}
    for item in intent["source_refs"]:
        source_ref_id = item["source_ref_id"]
        if source_ref_id in source_refs:
            raise SourceBindingError("duplicate source_ref_id")
        if item["source_kind"] == "message_span":
            validate_message_span(source_text, item)
        else:
            _validate_attachment_ref(item, attachments)
        source_refs[source_ref_id] = item
    return source_refs


def _referenced_ids(intent: dict[str, Any]) -> list[str]:
    referenced = list(intent["goal"]["source_refs"])
    for section in REFERENCE_SECTIONS:
        for item in intent[section]:
            referenced.extend(item["source_refs"])
    return referenced


def _validate_references(
    intent: dict[str, Any],
    source_refs: dict[str, dict[str, Any]],
    attachments: dict[str, dict[str, Any]],
) -> None:
    unknown = sorted(set(_referenced_ids(intent)) - source_refs.keys())
    if unknown:
        raise SourceBindingError(f"unknown source reference: {unknown}")
    for artifact in intent["input_artifacts"]:
        attachment = attachments.get(artifact["artifact_ref"])
        if attachment is None:
            raise SourceBindingError("unknown input artifact attachment")
        if artifact["sha256"] != attachment["sha256"]:
            raise SourceBindingError("input artifact hash mismatch")
        if artifact["media_type"] != attachment["media_type"]:
            raise SourceBindingError("input artifact media_type mismatch")
        bound_refs = [source_refs[item] for item in artifact["source_refs"]]
        if not any(
            item["source_kind"] == "attachment"
            and item["attachment_id"] == artifact["artifact_ref"]
            and item["sha256"] == artifact["sha256"]
            for item in bound_refs
        ):
            raise SourceBindingError(
                "input artifact requires matching attachment source reference"
            )


def validate_source_bindings(
    intent: dict[str, Any],
    source_text: str,
    attachment_manifest: dict[str, Any],
) -> list[str]:
    """Replay all message and attachment references without normalization."""
    _validate_source_metadata(intent, source_text, attachment_manifest)
    attachments = _attachment_map(attachment_manifest)
    source_refs = _source_ref_map(intent, source_text, attachments)
    _validate_references(intent, source_refs, attachments)
    return list(source_refs)
