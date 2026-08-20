"""Deterministic command builders for registered Skill adapters."""

from __future__ import annotations

import sys
from typing import Any


class CommandContractError(ValueError):
    """Raised when an internal adapter context is invalid."""


def _require_exact_context(adapter: Any, context: Any) -> dict[str, Any]:
    if not isinstance(context, dict):
        raise CommandContractError("adapter context must be an object")
    missing = sorted(adapter.required_context - context.keys())
    unknown = sorted(
        context.keys() - adapter.required_context - adapter.optional_context
    )
    if missing or unknown:
        raise CommandContractError(
            f"adapter context missing={missing}, unknown context={unknown}"
        )
    return context


def _require_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value or "\x00" in value:
        raise CommandContractError(f"{label} must be a non-empty string")
    return value


def _require_bounded_int(
    value: Any,
    label: str,
    minimum: int,
    maximum: int,
) -> int:
    if (
        isinstance(value, bool)
        or not isinstance(value, int)
        or not minimum <= value <= maximum
    ):
        raise CommandContractError(
            f"{label} must be an integer from {minimum} to {maximum}"
        )
    return value


def _resolve_command(adapter: Any, context: dict[str, Any]) -> list[str]:
    sources = context["sources"]
    if (
        not isinstance(sources, list)
        or not all(
            isinstance(item, str) and item in {"opsin", "pubchem", "chembl", "unichem"}
            for item in sources
        )
        or len(sources) != len(set(sources))
    ):
        raise CommandContractError("sources must be a unique controlled array")
    profile = context["standardization_profile"]
    if not isinstance(profile, str) or profile not in {
        "chembl-pipeline",
        "rdkit-basic",
    }:
        raise CommandContractError("standardization_profile is unsupported")
    command = [
        sys.executable,
        adapter.entrypoint,
        "--request",
        _require_string(context["request_path"], "request_path"),
        "--sources",
        ",".join(sources),
        "--standardization-profile",
        profile,
        "--timeout",
        str(
            _require_bounded_int(
                context["timeout_seconds"],
                "timeout_seconds",
                1,
                60,
            )
        ),
        "--retries",
        str(_require_bounded_int(context["retries"], "retries", 0, 3)),
        "--generated-at",
        _require_string(context["generated_at_utc"], "generated_at_utc"),
        "--output",
        _require_string(context["output_path"], "output_path"),
    ]
    if context["include_related"] is True:
        command.append("--include-related")
    elif context["include_related"] is not False:
        raise CommandContractError("include_related must be boolean")
    if context["use_standardizer"] is False:
        command.append("--no-standardizer")
    elif context["use_standardizer"] is not True:
        raise CommandContractError("use_standardizer must be boolean")
    return command


def _standardize_command(adapter: Any, context: dict[str, Any]) -> list[str]:
    input_format = context["input_format"]
    if not isinstance(input_format, str) or input_format not in {
        "auto",
        "smiles",
        "csv",
        "sdf",
        "molblock",
    }:
        raise CommandContractError("input_format is unsupported")
    profile = context["profile"]
    if not isinstance(profile, str) or profile not in {
        "chembl-pipeline",
        "rdkit-basic",
    }:
        raise CommandContractError("profile is unsupported")
    return [
        sys.executable,
        adapter.entrypoint,
        "--input",
        _require_string(context["input_path"], "input_path"),
        "--input-format",
        input_format,
        "--profile",
        profile,
        "--generated-at",
        _require_string(context["generated_at_utc"], "generated_at_utc"),
        "--output",
        _require_string(context["output_path"], "output_path"),
    ]


def _features_command(adapter: Any, context: dict[str, Any]) -> list[str]:
    input_format = context["input_format"]
    if not isinstance(input_format, str) or input_format not in {
        "auto",
        "json",
        "csv",
    }:
        raise CommandContractError("input_format is unsupported")
    calculation_view = context["calculation_view"]
    if not isinstance(calculation_view, str) or calculation_view not in {
        "parent",
        "standardized",
    }:
        raise CommandContractError("calculation_view is unsupported")
    return [
        sys.executable,
        adapter.entrypoint,
        "--input",
        _require_string(context["input_path"], "input_path"),
        "--input-format",
        input_format,
        "--calculation-view",
        calculation_view,
        "--generated-at",
        _require_string(context["generated_at_utc"], "generated_at_utc"),
        "--output",
        _require_string(context["output_path"], "output_path"),
    ]


def _library_command(adapter: Any, context: dict[str, Any]) -> list[str]:
    return [
        sys.executable,
        adapter.entrypoint,
        "--request",
        _require_string(context["request_path"], "request_path"),
        "--generated-at",
        _require_string(context["generated_at_utc"], "generated_at_utc"),
        "--output",
        _require_string(context["output_path"], "output_path"),
    ]


def _io_command(adapter: Any, context: dict[str, Any]) -> list[str]:
    return [
        sys.executable,
        adapter.entrypoint,
        "--input",
        _require_string(context["input_path"], "input_path"),
        "--output",
        _require_string(context["output_path"], "output_path"),
    ]


def build_command(adapter: Any, context: Any) -> list[str]:
    value = _require_exact_context(adapter, context)
    if adapter.extractor_id == "identity":
        return _resolve_command(adapter, value)
    if adapter.extractor_id == "standardize":
        return _standardize_command(adapter, value)
    if adapter.extractor_id == "features":
        return _features_command(adapter, value)
    if adapter.extractor_id == "library":
        return _library_command(adapter, value)
    return _io_command(adapter, value)
