"""Validate a source-bound ResearchIntent without exposing source content."""

from __future__ import annotations

import argparse
import importlib.util
from pathlib import Path
from typing import Any


class IntentValidationError(ValueError):
    """Raised when a ResearchIntent fails closed."""


def _load_sibling(name: str, filename: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


CONTRACTS = _load_sibling("router_intent_contracts", "router_contracts.py")
SCHEMAS = _load_sibling("router_intent_schemas", "schema_validation.py")
SOURCE = _load_sibling("router_intent_source", "source_binding.py")
UNIQUE_ID_FIELDS = (
    ("research_objects", "object_id"),
    ("requested_operations", "operation_id"),
    ("user_parameters", "parameter_id"),
)


def _validate_unique_ids(intent: dict[str, Any]) -> None:
    for section, field in UNIQUE_ID_FIELDS:
        values = [item[field] for item in intent[section]]
        if len(values) != len(set(values)):
            raise IntentValidationError(f"duplicate {field}")


def validate_research_intent(
    value: Any,
    source_text: str,
    attachment_manifest: dict[str, Any],
) -> dict[str, Any]:
    """Validate Schema, source bindings, parameter provenance, and fingerprint."""
    try:
        attachments = SCHEMAS.validate_schema_instance(
            attachment_manifest,
            "attachment-manifest-v1",
        )
        intent = SCHEMAS.validate_schema_instance(value, "research-intent-v1")
    except SCHEMAS.SchemaContractError as error:
        raise IntentValidationError(str(error)) from error
    _validate_unique_ids(intent)
    try:
        SOURCE.validate_source_bindings(intent, source_text, attachments)
    except SOURCE.SourceBindingError as error:
        raise IntentValidationError(str(error)) from error
    expected = CONTRACTS.sha256_json(intent, "intent_fingerprint")
    if intent["intent_fingerprint"] != expected:
        raise IntentValidationError("intent_fingerprint mismatch")
    if any(item["provenance"] != "user_explicit" for item in intent["user_parameters"]):
        raise IntentValidationError("parameters must be user_explicit")
    return intent


def _read_source(path: Path) -> str:
    try:
        return path.read_bytes().decode("utf-8")
    except (OSError, UnicodeError) as error:
        raise IntentValidationError("source is not readable UTF-8") from error


def _success_summary(intent: dict[str, Any]) -> dict[str, Any]:
    return {
        "valid": True,
        "intent_id": intent["intent_id"],
        "intent_fingerprint": intent["intent_fingerprint"],
        "source_binding": "passed",
        "errors": [],
    }


def _failure_summary() -> dict[str, Any]:
    return {
        "valid": False,
        "intent_id": None,
        "intent_fingerprint": None,
        "source_binding": "failed",
        "errors": ["intent validation failed"],
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate ResearchIntent V1")
    parser.add_argument("--intent", type=Path, required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--attachments", type=Path, required=True)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        intent = CONTRACTS.read_json_object(args.intent, "intent")
        attachments = CONTRACTS.read_json_object(
            args.attachments,
            "attachment manifest",
        )
        validated = validate_research_intent(
            intent,
            _read_source(args.source),
            attachments,
        )
    except (
        CONTRACTS.RouterContractError,
        IntentValidationError,
    ):
        print(CONTRACTS.canonical_json(_failure_summary()))
        return 2
    print(CONTRACTS.canonical_json(_success_summary(validated)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
