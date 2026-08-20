"""Validate real Host Agent certification records and runtime drift."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path, PurePosixPath
from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError


SCHEMA_PATH = Path(__file__).with_name("certification-matrix-v1.schema.json")
CURRENT_FINGERPRINT_FIELDS = {
    "router_skill_fingerprint",
    "catalog_fingerprint",
    "schema_fingerprint",
    "chain_definition_fingerprints",
    "workflow_definition_fingerprints",
    "bundle_fingerprint",
    "public_gold_fingerprint",
    "hidden_gold_fingerprint",
    "safety_cases_fingerprint",
}
EXPECTED_CHAIN_IDS = {
    "identity-standardization-v1",
    "reaction-precedent-v1",
    "structure-features-v1",
    "structure-library-v1",
}
EXPECTED_WORKFLOW_IDS = {
    "compound-evidence-v1",
    "route-evidence-review-v1",
}


def _load_sibling(name: str, filename: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


RESULTS = _load_sibling("certification_contract_results", "certification_results.py")
SCORING = _load_sibling("certification_contract_scoring", "certification_scoring.py")


class CertificationContractError(ValueError):
    """Raised when certification evidence is malformed or fails integrity."""


def canonical_json(value: Any) -> str:
    try:
        return json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        )
    except (TypeError, ValueError) as error:
        raise CertificationContractError(
            f"certification value is not canonical JSON: {error}"
        ) from error


def sha256_json(value: Any, excluded: str | None = None) -> str:
    payload = value
    if excluded is not None:
        if not isinstance(value, dict):
            raise CertificationContractError("fingerprinted value must be an object")
        payload = {key: item for key, item in value.items() if key != excluded}
    return hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()


def validate_routing_result(value: Any) -> dict[str, Any]:
    try:
        return RESULTS.validate_routing_result(value)
    except RESULTS.CertificationResultError as error:
        raise CertificationContractError(str(error)) from error


def validate_safety_result(value: Any) -> dict[str, Any]:
    try:
        return RESULTS.validate_safety_result(value)
    except RESULTS.CertificationResultError as error:
        raise CertificationContractError(str(error)) from error


def score_session(
    public_results: list[dict[str, Any]],
    hidden_results: list[dict[str, Any]],
    safety_results: list[dict[str, Any]],
) -> dict[str, Any]:
    try:
        return SCORING.score_session(
            public_results,
            hidden_results,
            safety_results,
        )
    except SCORING.CertificationScoringError as error:
        raise CertificationContractError(str(error)) from error


def score_certification(value: dict[str, Any]) -> dict[str, Any]:
    try:
        return SCORING.score_certification(value)
    except SCORING.CertificationScoringError as error:
        raise CertificationContractError(str(error)) from error


def _error_path(parts: Any) -> str:
    path = "$"
    for part in parts:
        path += f"[{part}]" if isinstance(part, int) else f".{part}"
    return path


def _schema_validate(value: Any) -> dict[str, Any]:
    try:
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(schema)
    except (OSError, UnicodeError, json.JSONDecodeError, SchemaError) as error:
        raise CertificationContractError("certification Schema is invalid") from error
    errors = sorted(
        Draft202012Validator(schema).iter_errors(value),
        key=lambda item: tuple(str(part) for part in item.absolute_path),
    )
    if errors:
        message = "; ".join(
            f"{_error_path(error.absolute_path)}: {error.message}" for error in errors
        )
        raise CertificationContractError(message)
    if not isinstance(value, dict):
        raise CertificationContractError("certification must be an object")
    return dict(value)


def _validate_session_time(session: dict[str, Any]) -> None:
    try:
        started = RESULTS.timestamp(
            session["started_at_utc"],
            "session started_at_utc",
        )
        ended = RESULTS.timestamp(
            session["ended_at_utc"],
            "session ended_at_utc",
        )
    except RESULTS.CertificationResultError as error:
        raise CertificationContractError(str(error)) from error
    if ended <= started:
        raise CertificationContractError("session end must follow start")


def _validate_session_billing(session: dict[str, Any]) -> None:
    usage = session["token_usage"]
    if usage["total_tokens"] != usage["input_tokens"] + usage["output_tokens"]:
        raise CertificationContractError("session token usage is inconsistent")
    if session["fee_status"] == "known_zero" and session["fee_amount_usd"] != 0:
        raise CertificationContractError("known_zero fee must be zero")
    if session["fee_status"] == "unknown" and session["fee_amount_usd"] is not None:
        raise CertificationContractError("unknown fee amount must be null")


def _validate_raw_references(session: dict[str, Any]) -> None:
    for reference in session["raw_output_references"]:
        path = PurePosixPath(reference["relative_path"])
        if path.is_absolute() or ".." in path.parts or "." in path.parts:
            raise CertificationContractError("raw output path is unsafe")


def _validate_session(session: dict[str, Any]) -> None:
    expected = sha256_json(session, "session_fingerprint")
    if session["session_fingerprint"] != expected:
        raise CertificationContractError("session_fingerprint mismatch")
    _validate_session_time(session)
    if session["fresh_context"] is not True:
        raise CertificationContractError("session fresh_context must be true")
    if session["prompts_exclude_expected_labels"] is not True:
        raise CertificationContractError("session prompt leaks expected labels")
    _validate_session_billing(session)
    _validate_raw_references(session)
    expected_gates = SCORING.failed_gates(
        session["metrics"],
        session["safety"],
    )
    if session["failed_gates"] != expected_gates:
        raise CertificationContractError("session failed_gates mismatch")


def _validate_key(key: dict[str, Any]) -> None:
    if set(key["chain_definition_fingerprints"]) != EXPECTED_CHAIN_IDS:
        raise CertificationContractError("chain fingerprint set mismatch")
    if set(key["workflow_definition_fingerprints"]) != EXPECTED_WORKFLOW_IDS:
        raise CertificationContractError("workflow fingerprint set mismatch")


def _validate_expiry(certificate: dict[str, Any]) -> None:
    try:
        certified = RESULTS.timestamp(
            certificate["certified_at_utc"],
            "certified_at_utc",
        )
    except RESULTS.CertificationResultError as error:
        raise CertificationContractError(str(error)) from error
    expires_value = certificate["expires_at_utc"]
    if certificate["certification_key"]["model_mode"] == "host_auto":
        if expires_value is None:
            raise CertificationContractError(
                "host_auto certificate expires_at required"
            )
        try:
            expires = RESULTS.timestamp(expires_value, "expires_at_utc")
        except RESULTS.CertificationResultError as error:
            raise CertificationContractError(str(error)) from error
        if expires <= certified:
            raise CertificationContractError("certificate expires before certification")
    elif expires_value is not None:
        try:
            RESULTS.timestamp(expires_value, "expires_at_utc")
        except RESULTS.CertificationResultError as error:
            raise CertificationContractError(str(error)) from error


def validate_certification_record(value: Any) -> dict[str, Any]:
    certificate = _schema_validate(value)
    _validate_key(certificate["certification_key"])
    session_ids = [item["session_id"] for item in certificate["sessions"]]
    if len(session_ids) != len(set(session_ids)):
        raise CertificationContractError("session IDs must be unique")
    for session in certificate["sessions"]:
        _validate_session(session)
    scored = score_certification(certificate)
    for field in ("status", "failed_gates", "aggregate"):
        if certificate[field] != scored[field]:
            raise CertificationContractError(f"certification {field} mismatch")
    _validate_expiry(certificate)
    expected = sha256_json(certificate, "certification_fingerprint")
    if certificate["certification_fingerprint"] != expected:
        raise CertificationContractError("certification_fingerprint mismatch")
    return certificate


def certificate_status(
    certificate: dict[str, Any],
    current_fingerprints: dict[str, Any],
    *,
    as_of_utc: str | None = None,
) -> str:
    try:
        validated = validate_certification_record(certificate)
    except CertificationContractError:
        return "unverified"
    if set(current_fingerprints) != CURRENT_FINGERPRINT_FIELDS:
        return "unverified"
    key = validated["certification_key"]
    if any(
        key[field] != current_fingerprints[field]
        for field in sorted(CURRENT_FINGERPRINT_FIELDS)
    ):
        return "unverified"
    if key["model_mode"] == "host_auto" and as_of_utc is not None:
        try:
            as_of = RESULTS.timestamp(as_of_utc, "as_of_utc")
            expires = RESULTS.timestamp(
                validated["expires_at_utc"],
                "expires_at_utc",
            )
        except RESULTS.CertificationResultError:
            return "unverified"
        if as_of > expires:
            return "unverified"
    return validated["status"]
