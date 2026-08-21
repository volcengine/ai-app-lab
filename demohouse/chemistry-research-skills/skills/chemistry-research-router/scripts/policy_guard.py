"""Deterministic safety policy for validated ResearchIntent documents."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Sequence


POLICY_CODES = {
    "E-SOURCE-BINDING",
    "E-CATALOG-MISMATCH",
    "E-SCHEMA-MISMATCH",
    "E-HOST-CERTIFICATION",
    "E-UNDECLARED-PARAMETER",
    "E-REACTION-MOLECULE-CONFLICT",
    "E-MISSING-PREREQUISITE",
    "E-UNSAFE-CAPABILITY",
    "E-EXTERNAL-DISCLOSURE",
    "E-INSTALL-INTEGRITY",
}
BLOCKING_CODES = {
    "E-SOURCE-BINDING",
    "E-CATALOG-MISMATCH",
    "E-SCHEMA-MISMATCH",
    "E-UNDECLARED-PARAMETER",
    "E-REACTION-MOLECULE-CONFLICT",
    "E-MISSING-PREREQUISITE",
    "E-INSTALL-INTEGRITY",
}
REACTION_OBJECT_TYPES = {
    "reaction_record",
    "reaction_collection",
    "reaction_query",
}
IDENTITY_OBJECT_TYPES = {"compound_name", "compound_identifier"}
IDENTITY_TARGETS = {
    "resolve-chemical-identities",
    "identity-standardization-v1",
    "compound-evidence-v1",
}
IDENTITY_BYPASS_TARGETS = {
    "standardize-chemical-structures",
    "compute-molecular-features",
    "search-and-curate-chemical-libraries",
    "structure-features-v1",
    "structure-library-v1",
}


@dataclass(frozen=True)
class PolicyFinding:
    code: str
    severity: str
    field_ids: tuple[str, ...]


@dataclass(frozen=True)
class PolicyResult:
    findings: tuple[PolicyFinding, ...]
    blocked: bool


Rule = Callable[
    [dict[str, Any], dict[str, Any], dict[str, Any] | None],
    Sequence[PolicyFinding],
]


def _finding(
    code: str,
    *field_ids: str,
    severity: str | None = None,
) -> PolicyFinding:
    if code not in POLICY_CODES:
        raise ValueError(f"unknown policy code: {code}")
    level = severity or ("error" if code in BLOCKING_CODES else "warning")
    return PolicyFinding(code, level, tuple(field_ids))


def catalog_findings(
    intent: dict[str, Any],
    catalog: dict[str, Any],
    certificate: dict[str, Any] | None,
) -> Sequence[PolicyFinding]:
    del certificate
    if intent["recognizer"]["catalog_fingerprint"] != catalog["catalog_fingerprint"]:
        return (_finding("E-CATALOG-MISMATCH", "catalog_fingerprint"),)
    return ()


def certification_findings(
    intent: dict[str, Any],
    catalog: dict[str, Any],
    certificate: dict[str, Any] | None,
) -> Sequence[PolicyFinding]:
    if certificate is None or certificate.get("status") != "verified_auto":
        return (_finding("E-HOST-CERTIFICATION", "recognizer"),)
    findings: list[PolicyFinding] = []
    if certificate.get("catalog_fingerprint") != catalog["catalog_fingerprint"]:
        findings.append(_finding("E-CATALOG-MISMATCH", "catalog_fingerprint"))
    if (
        certificate.get("schema_fingerprint")
        != intent["recognizer"]["schema_fingerprint"]
    ):
        findings.append(_finding("E-SCHEMA-MISMATCH", "schema_fingerprint"))
    if (
        certificate.get("router_skill_fingerprint")
        != intent["recognizer"]["router_skill_fingerprint"]
    ):
        findings.append(_finding("E-INSTALL-INTEGRITY", "router_skill_fingerprint"))
    if certificate.get("bundle_integrity") is not True:
        findings.append(_finding("E-INSTALL-INTEGRITY", "bundle_integrity"))
    identity_fields = ("host_id", "host_version", "model_id", "model_mode")
    if any(
        certificate.get(field) != intent["recognizer"][field]
        for field in identity_fields
    ):
        findings.append(_finding("E-HOST-CERTIFICATION", "recognizer"))
    return findings


def parameter_findings(
    intent: dict[str, Any],
    catalog: dict[str, Any],
    certificate: dict[str, Any] | None,
) -> Sequence[PolicyFinding]:
    del catalog, certificate
    invalid = [
        item["parameter_id"]
        for item in intent["user_parameters"]
        if item.get("provenance") != "user_explicit"
    ]
    if invalid:
        return (_finding("E-UNDECLARED-PARAMETER", *sorted(invalid)),)
    return ()


def molecule_reaction_findings(
    intent: dict[str, Any],
    catalog: dict[str, Any],
    certificate: dict[str, Any] | None,
) -> Sequence[PolicyFinding]:
    del catalog, certificate
    object_types = {item["object_type"] for item in intent["research_objects"]}
    targets = set(intent["candidate_targets"])
    if object_types & REACTION_OBJECT_TYPES and (
        "search-and-curate-chemical-libraries" in targets
    ):
        return (_finding("E-REACTION-MOLECULE-CONFLICT", "candidate_targets"),)
    return ()


def _artifact_roles(intent: dict[str, Any]) -> set[str]:
    return {item["role"] for item in intent["input_artifacts"]}


def prerequisite_findings(
    intent: dict[str, Any],
    catalog: dict[str, Any],
    certificate: dict[str, Any] | None,
) -> Sequence[PolicyFinding]:
    del catalog, certificate
    object_types = {item["object_type"] for item in intent["research_objects"]}
    targets = set(intent["candidate_targets"])
    roles = _artifact_roles(intent)
    findings: list[PolicyFinding] = []
    if object_types & IDENTITY_OBJECT_TYPES and targets & IDENTITY_BYPASS_TARGETS:
        findings.append(_finding("E-MISSING-PREREQUISITE", "identity_resolution"))
    if (
        "search-and-curate-chemical-libraries" in targets
        and not object_types & REACTION_OBJECT_TYPES
        and "features_input" not in roles
    ):
        findings.append(_finding("E-MISSING-PREREQUISITE", "features_input"))
    if "route-evidence-review-v1" in targets:
        missing = [
            role for role in ("reaction_input", "route_input") if role not in roles
        ]
        if missing:
            findings.append(_finding("E-MISSING-PREREQUISITE", *missing))
    return findings


def unsafe_capability_findings(
    intent: dict[str, Any],
    catalog: dict[str, Any],
    certificate: dict[str, Any] | None,
) -> Sequence[PolicyFinding]:
    del catalog, certificate
    if (
        intent["goal"]["goal_type"] == "unsupported_scientific_goal"
        or intent["unsupported_goals"]
    ):
        return (_finding("E-UNSAFE-CAPABILITY", "unsupported_goals"),)
    return ()


def external_disclosure_findings(
    intent: dict[str, Any],
    catalog: dict[str, Any],
    certificate: dict[str, Any] | None,
) -> Sequence[PolicyFinding]:
    del catalog, certificate
    object_types = {item["object_type"] for item in intent["research_objects"]}
    targets = set(intent["candidate_targets"])
    if object_types & IDENTITY_OBJECT_TYPES and targets & IDENTITY_TARGETS:
        return (_finding("E-EXTERNAL-DISCLOSURE", "research_objects"),)
    return ()


RULES: tuple[Rule, ...] = (
    catalog_findings,
    certification_findings,
    parameter_findings,
    molecule_reaction_findings,
    prerequisite_findings,
    unsafe_capability_findings,
    external_disclosure_findings,
)


def evaluate_policy(
    intent: dict[str, Any],
    catalog: dict[str, Any],
    certification: dict[str, Any] | None,
) -> PolicyResult:
    findings: list[PolicyFinding] = []
    seen_codes: set[str] = set()
    for rule in RULES:
        for finding in rule(intent, catalog, certification):
            if finding.code not in seen_codes:
                findings.append(finding)
                seen_codes.add(finding.code)
    return PolicyResult(
        findings=tuple(findings),
        blocked=any(item.code in BLOCKING_CODES for item in findings),
    )
