"""Validate Host/model certification records and current fingerprints."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any


class CertificationContractError(ValueError):
    """Raised when certification is malformed, stale, or revoked."""


def _load_sibling(name: str, filename: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


CONTRACTS = _load_sibling(
    "router_certification_contracts",
    "router_contracts.py",
)
SCHEMAS = _load_sibling(
    "router_certification_schemas",
    "schema_validation.py",
)
FINGERPRINT_FIELDS = {
    "router_skill_fingerprint",
    "catalog_fingerprint",
    "schema_fingerprint",
}


def validate_certification_record(
    value: Any,
    current_fingerprints: dict[str, Any],
) -> dict[str, Any]:
    """Validate one record and bind it to the current Router artifacts."""
    try:
        certificate = SCHEMAS.validate_schema_instance(
            value,
            "certification-record-v1",
        )
    except SCHEMAS.SchemaContractError as error:
        raise CertificationContractError(str(error)) from error
    expected = CONTRACTS.sha256_json(
        certificate,
        "certificate_fingerprint",
    )
    if certificate["certificate_fingerprint"] != expected:
        raise CertificationContractError("certificate_fingerprint mismatch")
    if set(current_fingerprints) != FINGERPRINT_FIELDS:
        raise CertificationContractError("current fingerprint fields mismatch")
    for field_id in sorted(FINGERPRINT_FIELDS):
        if certificate[field_id] != current_fingerprints[field_id]:
            raise CertificationContractError(f"{field_id} mismatch")
    if certificate["bundle_integrity"] is not True:
        raise CertificationContractError("certificate bundle integrity failed")
    return certificate
