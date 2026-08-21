"""Validate user confirmation binding and replay resistance."""

from __future__ import annotations

import importlib.util
from datetime import datetime
from pathlib import Path
from typing import Any


class ConfirmationContractError(ValueError):
    """Raised when a route confirmation is malformed or stale."""


def _load_contracts() -> Any:
    path = Path(__file__).with_name("router_contracts.py")
    spec = importlib.util.spec_from_file_location(
        "router_confirmation_contracts",
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load router_contracts.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


CONTRACTS = _load_contracts()


def _load_schemas() -> Any:
    path = Path(__file__).with_name("schema_validation.py")
    spec = importlib.util.spec_from_file_location(
        "router_confirmation_schemas",
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load schema_validation.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SCHEMAS = _load_schemas()


def validate_route_confirmation(
    value: Any,
    decision: dict[str, Any],
    request: dict[str, Any],
) -> dict[str, Any]:
    """Validate one confirmation against exactly one decision and request."""
    try:
        confirmation = SCHEMAS.validate_schema_instance(
            value,
            "route-confirmation-v1",
        )
    except SCHEMAS.SchemaContractError as error:
        raise ConfirmationContractError(str(error)) from error
    try:
        datetime.fromisoformat(
            confirmation["decided_at_utc"].removesuffix("Z") + "+00:00"
        )
    except ValueError as error:
        raise ConfirmationContractError(
            "confirmation decided_at_utc is invalid UTC"
        ) from error
    if (
        confirmation["decision_id"] != decision["decision_id"]
        or confirmation["decision_fingerprint"] != decision["decision_fingerprint"]
    ):
        raise ConfirmationContractError("confirmation decision binding mismatch")
    if confirmation["request_fingerprint"] != request["request_fingerprint"]:
        raise ConfirmationContractError("confirmation request binding mismatch")
    confirmation_reasons = set(confirmation["confirmation_reasons"])
    if confirmation_reasons != set(
        request["risk_reasons"]
    ) or confirmation_reasons != set(decision["confirmation_reasons"]):
        raise ConfirmationContractError("confirmation reasons mismatch")
    expected = CONTRACTS.sha256_json(
        confirmation,
        "confirmation_fingerprint",
    )
    if confirmation["confirmation_fingerprint"] != expected:
        raise ConfirmationContractError("confirmation_fingerprint mismatch")
    return confirmation
