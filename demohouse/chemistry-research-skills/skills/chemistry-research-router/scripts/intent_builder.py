"""Build a complete ResearchIntent from a compact semantic draft."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Any


class IntentBuildError(ValueError):
    """Raised when a semantic draft cannot be bound without inference."""


def _load_sibling(name: str, filename: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


CONTRACTS = _load_sibling("router_builder_contracts", "router_contracts.py")
SCHEMAS = _load_sibling("router_builder_schemas", "schema_validation.py")
CERTIFICATES = _load_sibling(
    "router_builder_certificates",
    "certification_contract.py",
)
VALIDATOR = _load_sibling("router_builder_validator", "validate_intent.py")
TOP_FIELDS = {
    "schema_version",
    "language",
    "goal",
    "research_objects",
    "requested_operations",
    "input_artifacts",
    "user_parameters",
    "candidate_targets",
    "ambiguities",
    "unsupported_goals",
}
GOAL_FIELDS = {"goal_type", "chain_requirement", "evidence_text"}
OBJECT_FIELDS = {"object_type", "evidence"}
OPERATION_FIELDS = {"operation_type", "negated", "evidence_text"}
ARTIFACT_FIELDS = {"attachment_id", "role"}
PARAMETER_FIELDS = {"field_id", "value", "evidence_text"}
MESSAGE_EVIDENCE_FIELDS = {"source_kind", "text"}
ATTACHMENT_EVIDENCE_FIELDS = {"source_kind", "attachment_id"}
RECOGNIZER_FIELDS = (
    "host_id",
    "host_version",
    "model_id",
    "model_mode",
    "router_skill_fingerprint",
    "catalog_fingerprint",
    "schema_fingerprint",
)


def _object(value: Any, fields: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != fields:
        raise IntentBuildError(f"{label} fields mismatch")
    return value


def _array(value: Any, label: str) -> list[Any]:
    if not isinstance(value, list):
        raise IntentBuildError(f"{label} must be an array")
    return value


def _validate_draft(draft: Any) -> dict[str, Any]:
    value = _object(draft, TOP_FIELDS, "semantic draft")
    if value["schema_version"] != "1.0.0":
        raise IntentBuildError("semantic draft version mismatch")
    _object(value["goal"], GOAL_FIELDS, "goal")
    for item in _array(value["research_objects"], "research_objects"):
        evidence = _object(item, OBJECT_FIELDS, "research object")["evidence"]
        if not isinstance(evidence, dict):
            raise IntentBuildError("research object evidence must be an object")
        if evidence.get("source_kind") not in {"message_span", "attachment"}:
            raise IntentBuildError("research object evidence source_kind is invalid")
        fields = (
            MESSAGE_EVIDENCE_FIELDS
            if evidence.get("source_kind") == "message_span"
            else ATTACHMENT_EVIDENCE_FIELDS
        )
        _object(evidence, fields, "research object evidence")
    for item in _array(value["requested_operations"], "requested_operations"):
        _object(item, OPERATION_FIELDS, "requested operation")
    for item in _array(value["input_artifacts"], "input_artifacts"):
        _object(item, ARTIFACT_FIELDS, "input artifact")
    for item in _array(value["user_parameters"], "user_parameters"):
        _object(item, PARAMETER_FIELDS, "user parameter")
    for field in ("candidate_targets", "ambiguities", "unsupported_goals"):
        _array(value[field], field)
    return value


class EvidenceIndex:
    """Create stable source references while rejecting ambiguous evidence."""

    def __init__(
        self,
        source_text: str,
        attachments: dict[str, dict[str, Any]],
    ) -> None:
        self.source_text = source_text
        self.attachments = attachments
        self.refs: list[dict[str, Any]] = []
        self.messages: dict[str, str] = {}
        self.attachment_refs: dict[str, str] = {}

    def message(self, text: Any) -> str:
        if not isinstance(text, str) or not text:
            raise IntentBuildError("message evidence must be non-empty text")
        if text in self.messages:
            return self.messages[text]
        start = self.source_text.find(text)
        if start < 0 or self.source_text.find(text, start + 1) >= 0:
            raise IntentBuildError(
                "message evidence must be unique and occur exactly once"
            )
        source_ref_id = f"span-{len(self.messages) + 1:03d}"
        self.refs.append(
            {
                "source_ref_id": source_ref_id,
                "source_kind": "message_span",
                "start": start,
                "end": start + len(text),
                "text_sha256": CONTRACTS.sha256_text(text),
            }
        )
        self.messages[text] = source_ref_id
        return source_ref_id

    def attachment(self, attachment_id: Any) -> str:
        if not isinstance(attachment_id, str) or attachment_id not in self.attachments:
            raise IntentBuildError("attachment evidence is unknown")
        if attachment_id in self.attachment_refs:
            return self.attachment_refs[attachment_id]
        source_ref_id = f"attachment-ref-{len(self.attachment_refs) + 1:03d}"
        attachment = self.attachments[attachment_id]
        self.refs.append(
            {
                "source_ref_id": source_ref_id,
                "source_kind": "attachment",
                "attachment_id": attachment_id,
                "sha256": attachment["sha256"],
            }
        )
        self.attachment_refs[attachment_id] = source_ref_id
        return source_ref_id

    def evidence(self, value: dict[str, Any]) -> tuple[str, str]:
        if value["source_kind"] == "message_span":
            text = value["text"]
            return self.message(text), text
        attachment_id = value["attachment_id"]
        return self.attachment(attachment_id), attachment_id


def _attachment_map(manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {item["attachment_id"]: item for item in manifest["attachments"]}


def _recognizer(certificate: dict[str, Any]) -> dict[str, Any]:
    return {field: certificate[field] for field in RECOGNIZER_FIELDS}


def _validate_certificate(certificate: Any) -> dict[str, Any]:
    if not isinstance(certificate, dict):
        raise IntentBuildError("certificate must be an object")
    current = {
        field: certificate.get(field)
        for field in (
            "router_skill_fingerprint",
            "catalog_fingerprint",
            "schema_fingerprint",
        )
    }
    try:
        return CERTIFICATES.validate_certification_record(certificate, current)
    except CERTIFICATES.CertificationContractError as error:
        raise IntentBuildError(str(error)) from error


def _objects(
    draft: dict[str, Any],
    evidence: EvidenceIndex,
) -> list[dict[str, Any]]:
    values = []
    for position, item in enumerate(draft["research_objects"], start=1):
        source_ref, representation = evidence.evidence(item["evidence"])
        values.append(
            {
                "object_id": f"object-{position:03d}",
                "object_type": item["object_type"],
                "representation": representation,
                "source_refs": [source_ref],
            }
        )
    return values


def _operations(
    draft: dict[str, Any],
    evidence: EvidenceIndex,
) -> list[dict[str, Any]]:
    return [
        {
            "operation_id": f"operation-{position:03d}",
            "operation_type": item["operation_type"],
            "sequence": position,
            "negated": item["negated"],
            "source_refs": [evidence.message(item["evidence_text"])],
        }
        for position, item in enumerate(draft["requested_operations"], start=1)
    ]


def _artifacts(
    draft: dict[str, Any],
    evidence: EvidenceIndex,
) -> list[dict[str, Any]]:
    values = []
    for item in draft["input_artifacts"]:
        attachment_id = item["attachment_id"]
        source_ref = evidence.attachment(attachment_id)
        attachment = evidence.attachments[attachment_id]
        values.append(
            {
                "artifact_ref": attachment_id,
                "role": item["role"],
                "media_type": attachment["media_type"],
                "sha256": attachment["sha256"],
                "source_refs": [source_ref],
            }
        )
    return values


def _parameters(
    draft: dict[str, Any],
    evidence: EvidenceIndex,
) -> list[dict[str, Any]]:
    return [
        {
            "parameter_id": f"parameter-{position:03d}",
            "field_id": item["field_id"],
            "value": item["value"],
            "provenance": "user_explicit",
            "source_refs": [evidence.message(item["evidence_text"])],
        }
        for position, item in enumerate(draft["user_parameters"], start=1)
    ]


def build_research_intent(
    draft: Any,
    source_text: str,
    attachment_manifest: Any,
    certificate: Any,
) -> dict[str, Any]:
    """Build and fully validate ResearchIntent V1 without semantic inference."""
    value = _validate_draft(draft)
    try:
        manifest = SCHEMAS.validate_schema_instance(
            attachment_manifest,
            "attachment-manifest-v1",
        )
    except SCHEMAS.SchemaContractError as error:
        raise IntentBuildError(str(error)) from error
    validated_certificate = _validate_certificate(certificate)
    evidence = EvidenceIndex(source_text, _attachment_map(manifest))
    goal_ref = evidence.message(value["goal"]["evidence_text"])
    recognizer = _recognizer(validated_certificate)
    intent = {
        "schema_version": "1.0.0",
        "intent_id": "",
        "source": {
            "content_sha256": CONTRACTS.sha256_text(source_text),
            "language": value["language"],
            "message_length": len(source_text),
            "attachments_fingerprint": manifest["attachments_fingerprint"],
        },
        "recognizer": recognizer,
        "goal": {
            "goal_type": value["goal"]["goal_type"],
            "chain_requirement": value["goal"]["chain_requirement"],
            "source_refs": [goal_ref],
        },
        "source_refs": evidence.refs,
        "research_objects": _objects(value, evidence),
        "requested_operations": _operations(value, evidence),
        "input_artifacts": _artifacts(value, evidence),
        "user_parameters": _parameters(value, evidence),
        "candidate_targets": list(value["candidate_targets"]),
        "ambiguities": list(value["ambiguities"]),
        "unsupported_goals": list(value["unsupported_goals"]),
        "intent_fingerprint": "",
    }
    seed = {
        "draft": value,
        "source_sha256": intent["source"]["content_sha256"],
        "attachments_fingerprint": manifest["attachments_fingerprint"],
        "recognizer": recognizer,
    }
    intent["intent_id"] = "intent-" + CONTRACTS.sha256_json(seed)[:24]
    intent["intent_fingerprint"] = CONTRACTS.sha256_json(
        intent,
        "intent_fingerprint",
    )
    try:
        return VALIDATOR.validate_research_intent(intent, source_text, manifest)
    except VALIDATOR.IntentValidationError as error:
        raise IntentBuildError(str(error)) from error
