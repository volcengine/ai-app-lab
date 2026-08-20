"""Determine whether a validated Router request may execute."""

from __future__ import annotations

import copy
import importlib.util
import sys
from pathlib import Path
from typing import Any


class ExecutionAuthorizationError(ValueError):
    """Raised when authorization inputs are internally inconsistent."""


ALLOWED_PROVENANCE = {
    "user_explicit",
    "validated_attachment",
    "catalog_default",
    "human_decision",
    "derived_integrity_value",
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


CONTRACTS = _load_sibling(
    "router_authorization_contracts",
    "router_contracts.py",
)
DECISIONS = _load_sibling(
    "router_authorization_decisions",
    "decision_contracts.py",
)
REQUESTS = _load_sibling(
    "router_authorization_requests",
    "request_contracts.py",
)
CERTIFICATES = _load_sibling(
    "router_authorization_certificates",
    "certification_contract.py",
)


def _bindings_match(
    intent: dict[str, Any],
    decision: dict[str, Any],
    request: dict[str, Any],
) -> bool:
    return (
        decision.get("intent_id") == intent.get("intent_id")
        and decision.get("intent_fingerprint") == intent.get("intent_fingerprint")
        and request.get("intent_id") == intent.get("intent_id")
        and request.get("intent_fingerprint") == intent.get("intent_fingerprint")
        and request.get("decision_id") == decision.get("decision_id")
        and request.get("decision_fingerprint") == decision.get("decision_fingerprint")
    )


def _certificate_matches(
    intent: dict[str, Any],
    decision: dict[str, Any],
    certificate: dict[str, Any],
) -> bool:
    recognizer = intent["recognizer"]
    return (
        certificate.get("bundle_integrity") is True
        and certificate.get("host_id") == recognizer["host_id"]
        and certificate.get("host_version") == recognizer["host_version"]
        and certificate.get("model_id") == recognizer["model_id"]
        and certificate.get("model_mode") == recognizer["model_mode"]
        and certificate.get("router_skill_fingerprint")
        == recognizer["router_skill_fingerprint"]
        and certificate.get("schema_fingerprint") == recognizer["schema_fingerprint"]
        and certificate.get("catalog_fingerprint") == decision["catalog_fingerprint"]
    )


def _integrity_valid(
    intent: dict[str, Any],
    decision: dict[str, Any],
    request: dict[str, Any],
    certification: dict[str, Any] | None,
) -> bool:
    try:
        if intent["intent_fingerprint"] != CONTRACTS.sha256_json(
            intent,
            "intent_fingerprint",
        ):
            return False
        DECISIONS.validate_route_decision(decision)
        REQUESTS.validate_execution_request(request)
        if certification is not None:
            CERTIFICATES.validate_certification_record(
                certification,
                {
                    "router_skill_fingerprint": intent["recognizer"][
                        "router_skill_fingerprint"
                    ],
                    "catalog_fingerprint": decision["catalog_fingerprint"],
                    "schema_fingerprint": intent["recognizer"]["schema_fingerprint"],
                },
            )
    except (
        KeyError,
        DECISIONS.DecisionContractError,
        REQUESTS.RequestContractError,
        CERTIFICATES.CertificationContractError,
    ):
        return False
    return True


def _authorization(
    mode: str,
    *,
    authorized: bool = False,
    reasons: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "execution_mode": mode,
        "execution_authorized": authorized,
        "confirmation_reasons": list(reasons or []),
    }


def authorize_execution(
    intent: dict[str, Any],
    decision: dict[str, Any],
    certification: dict[str, Any] | None,
    request: dict[str, Any],
) -> dict[str, Any]:
    """Return the final execution mode without performing side effects."""
    if not _integrity_valid(intent, decision, request, certification) or not (
        _bindings_match(intent, decision, request)
    ):
        return _authorization("not_executable")
    if certification is None:
        return _authorization("manual_target_required")
    provenance = {
        item.get("provenance") for item in request.get("parameter_bindings", [])
    }
    if not provenance <= ALLOWED_PROVENANCE:
        return _authorization("not_executable")
    if not _certificate_matches(intent, decision, certification):
        return _authorization("manual_target_required")
    status = certification["status"]
    if status == "revoked":
        return _authorization("not_executable")
    if status == "unverified":
        return _authorization("manual_target_required")
    if status == "verified_confirm_only":
        reasons = list(
            dict.fromkeys(["unverified_host", *request.get("risk_reasons", [])])
        )
        return _authorization("confirmation_required", reasons=reasons)
    reasons = list(request.get("risk_reasons", []))
    if reasons:
        return _authorization("confirmation_required", reasons=reasons)
    if (
        decision.get("decision_status") != "ready"
        or len(decision.get("targets", [])) != 1
        or decision.get("missing_inputs")
        or decision.get("policy_findings")
        or request["target_request"]["execution_policy"]["network_mode"] != "offline"
    ):
        return _authorization("not_executable")
    return _authorization("auto_execute", authorized=True)


def apply_authorization(
    intent: dict[str, Any],
    decision: dict[str, Any],
    certification: dict[str, Any] | None,
    request: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Persist final authorization into a re-fingerprinted decision/request."""
    authorization = authorize_execution(
        intent,
        decision,
        certification,
        request,
    )
    final_decision = copy.deepcopy(decision)
    final_decision.update(authorization)
    final_decision["decision_fingerprint"] = CONTRACTS.sha256_json(
        final_decision,
        "decision_fingerprint",
    )
    final_decision = DECISIONS.validate_route_decision(final_decision)
    final_request = copy.deepcopy(request)
    final_request["decision_fingerprint"] = final_decision["decision_fingerprint"]
    if authorization["confirmation_reasons"]:
        final_request["risk_reasons"] = list(authorization["confirmation_reasons"])
    request_id = (
        "router-request-"
        + CONTRACTS.sha256_json(
            {
                "intent_fingerprint": intent["intent_fingerprint"],
                "decision_fingerprint": final_decision["decision_fingerprint"],
                "target_id": final_request["target_id"],
            }
        )[:24]
    )
    final_request["request_id"] = request_id
    final_request["target_request"]["request_id"] = request_id
    for binding in final_request["parameter_bindings"]:
        if binding["field_id"] == "request_id":
            binding["value"] = request_id
    final_request["request_fingerprint"] = CONTRACTS.sha256_json(
        final_request,
        "request_fingerprint",
    )
    final_request = REQUESTS.validate_execution_request(final_request)
    return final_decision, final_request
