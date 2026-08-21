"""Load and validate the Router's fixed JSON Schema contracts."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError


SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema"
SCHEMA_FILES = {
    "research-intent-v1": "research-intent-v1.schema.json",
    "route-decision-v1": "route-decision-v1.schema.json",
    "clarification-request-v1": "clarification-request-v1.schema.json",
    "attachment-manifest-v1": "attachment-manifest-v1.schema.json",
    "router-execution-request-v1": "router-execution-request-v1.schema.json",
    "certification-record-v1": "certification-record-v1.schema.json",
    "route-confirmation-v1": "route-confirmation-v1.schema.json",
}


class SchemaContractError(ValueError):
    """Raised when a Router schema or instance is invalid."""


def _load_contracts() -> Any:
    path = Path(__file__).with_name("router_contracts.py")
    spec = importlib.util.spec_from_file_location(
        "router_schema_contracts",
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load router_contracts.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


CONTRACTS = _load_contracts()


def load_schema(name: str) -> dict[str, Any]:
    """Load one allowlisted Router schema from the references directory."""
    filename = SCHEMA_FILES.get(name)
    if filename is None:
        raise SchemaContractError(f"unsupported schema: {name}")
    path = Path(__file__).resolve().parents[1] / "references" / filename
    try:
        schema = CONTRACTS.read_json_object(path, f"schema {name}")
    except CONTRACTS.RouterContractError as error:
        raise SchemaContractError(str(error)) from error
    if schema.get("$schema") != SCHEMA_DIALECT:
        raise SchemaContractError(f"schema {name}: unsupported JSON Schema dialect")
    return schema


def _format_path(parts: Any) -> str:
    path = "$"
    for part in parts:
        path += f"[{part}]" if isinstance(part, int) else f".{part}"
    return path


def _format_errors(errors: list[Any]) -> str:
    return "; ".join(
        f"{_format_path(error.absolute_path)}: {error.message}" for error in errors
    )


def validate_schema_instance(
    value: Any,
    schema_name: str,
) -> dict[str, Any]:
    """Validate an object against one Draft 2020-12 Router schema."""
    schema = load_schema(schema_name)
    try:
        Draft202012Validator.check_schema(schema)
    except SchemaError as error:
        raise SchemaContractError(
            f"schema {schema_name} is invalid: {error}"
        ) from error
    errors = sorted(
        Draft202012Validator(schema).iter_errors(value),
        key=lambda item: tuple(str(part) for part in item.absolute_path),
    )
    if errors:
        raise SchemaContractError(_format_errors(errors))
    if not isinstance(value, dict):
        raise SchemaContractError("top level must be an object")
    return dict(value)
