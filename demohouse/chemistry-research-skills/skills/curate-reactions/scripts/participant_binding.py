#!/usr/bin/env python3
"""Bind reaction participants to validated standardization records."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any


FindingFactory = Callable[..., dict[str, Any]]
PARTICIPANT_ROLES = {
    "reactant",
    "reagent",
    "catalyst",
    "solvent",
    "internal_standard",
    "product",
    "unknown",
}


def resolve_upstream_binding(
    raw: dict[str, Any],
    upstream: dict[str, dict[str, Any]],
    participant_index: int,
    make_finding: FindingFactory,
) -> tuple[dict[str, Any] | None, list[dict[str, Any]], bool]:
    if "upstream_record_id" not in raw:
        return None, [], False
    upstream_id = raw.get("upstream_record_id")
    path = f"participants[{participant_index}].upstream_record_id"
    if not isinstance(upstream_id, str) or not upstream_id:
        detail = "upstream_record_id 必须是非空字符串"
    elif upstream_id not in upstream:
        detail = f"未知 upstream_record_id: {upstream_id}"
    else:
        return upstream[upstream_id], [], True
    return (
        None,
        [
            make_finding(
                "E-UPSTREAM-BINDING-001",
                "error",
                path,
                detail=detail,
            )
        ],
        True,
    )


def _molblock(value: str) -> str | None:
    lines = value.splitlines()
    end_index = next(
        (index for index, line in enumerate(lines) if line.strip() == "M  END"),
        None,
    )
    if end_index is None:
        return None
    return "\n".join(lines[: end_index + 1]) + "\n"


def canonical_original_structure(
    structure: str,
    input_format: str,
    toolkit: dict[str, Any],
) -> str | None:
    Chem = toolkit["Chem"]
    with toolkit["rdkit"].rdBase.BlockLogs():
        if input_format == "smiles":
            mol = Chem.MolFromSmiles(structure)
        elif input_format in {"sdf", "molblock"}:
            block = _molblock(structure)
            mol = (
                Chem.MolFromMolBlock(
                    block,
                    sanitize=True,
                    removeHs=True,
                )
                if block is not None
                else None
            )
        else:
            mol = None
    if mol is None:
        return None
    return Chem.MolToSmiles(mol, canonical=True, isomericSmiles=True)


def original_structures_match(
    participant_structure: str,
    upstream_record: dict[str, Any],
    toolkit: dict[str, Any],
) -> bool:
    participant = canonical_original_structure(
        participant_structure,
        "smiles",
        toolkit,
    )
    original = canonical_original_structure(
        upstream_record["original_structure"],
        upstream_record["input_format"],
        toolkit,
    )
    return participant is not None and participant == original


def _upstream_state_findings(
    upstream_record: dict[str, Any],
    participant_index: int,
    make_finding: FindingFactory,
) -> list[dict[str, Any]]:
    disposition = upstream_record["disposition"]
    if disposition == "rejected":
        return [
            make_finding(
                "E-UPSTREAM-REJECTED-001",
                "error",
                f"participants[{participant_index}].upstream_disposition",
                detail="上游 standardize 记录已 rejected",
            )
        ]
    if disposition != "review_required":
        return []
    return [
        make_finding(
            "H-UPSTREAM-REVIEW-001",
            "human_review",
            f"participants[{participant_index}]",
            detail="; ".join(upstream_record["human_review_required"]),
        )
    ]


def _role_context(
    raw: dict[str, Any],
    index: int,
    make_finding: FindingFactory,
) -> tuple[str, str, str, str, list[dict[str, Any]]]:
    role = raw.get("reported_role", "unknown")
    if role not in PARTICIPANT_ROLES:
        role = "unknown"
    side = raw.get("side")
    if side not in {"input", "output"}:
        side = "output" if role == "product" else "input"
    findings = []
    if role == "unknown":
        findings.append(
            make_finding(
                "W-ROLE-UNKNOWN-001",
                "warning",
                f"participants[{index}].reported_role",
            )
        )
    conflict = (side == "output" and role != "product") or (
        side == "input" and role == "product"
    )
    if conflict:
        detail = (
            "输出侧参与物未报告为 product"
            if side == "output"
            else "输入侧参与物报告为 product"
        )
        findings.append(
            make_finding(
                "W-ROLE-CONFLICT-001",
                "warning",
                f"participants[{index}].reported_role",
                detail=detail,
            )
        )
    participation = (
        "product"
        if side == "output"
        else "not_assessed"
        if role in {"reagent", "catalyst", "solvent", "unknown"}
        else "contributes_product_atoms"
    )
    role_status = (
        "conflict"
        if conflict
        else "not_assessed"
        if role == "unknown"
        else "consistent"
    )
    return role, side, participation, role_status, findings


def _binding_context(
    raw: dict[str, Any],
    upstream_record: dict[str, Any] | None,
    toolkit: dict[str, Any],
    index: int,
    make_finding: FindingFactory,
) -> tuple[Any, Any, Any, Any, list[Any], list[dict[str, Any]]]:
    findings: list[dict[str, Any]] = []
    structure = raw.get("original_structure")
    if upstream_record is None:
        return structure, None, None, None, [], findings
    if "original_structure" not in raw:
        structure = upstream_record["original_structure"]
        if (
            canonical_original_structure(
                structure,
                upstream_record["input_format"],
                toolkit,
            )
            is None
        ):
            findings.append(
                make_finding(
                    "E-UPSTREAM-STRUCTURE-MISMATCH-001",
                    "error",
                    f"participants[{index}].original_structure",
                )
            )
    elif not isinstance(structure, str) or not original_structures_match(
        structure, upstream_record, toolkit
    ):
        findings.append(
            make_finding(
                "E-UPSTREAM-STRUCTURE-MISMATCH-001",
                "error",
                f"participants[{index}].original_structure",
            )
        )
    findings.extend(_upstream_state_findings(upstream_record, index, make_finding))
    return (
        structure,
        upstream_record["standardized_structure"],
        upstream_record["parent_structure"],
        upstream_record["disposition"],
        list(upstream_record["human_review_required"]),
        findings,
    )


def _canonical_form(
    structure: Any,
    standardized: Any,
    blocked: bool,
    toolkit: dict[str, Any],
) -> tuple[str | None, Any]:
    if blocked:
        return None, None
    value = standardized if isinstance(standardized, str) else structure
    if not isinstance(value, str):
        return None, None
    Chem = toolkit["Chem"]
    with toolkit["rdkit"].rdBase.BlockLogs():
        mol = Chem.MolFromSmiles(value)
    if mol is None:
        return None, None
    return Chem.MolToSmiles(mol, canonical=True, isomericSmiles=True), mol


def assess_participant(
    raw: dict[str, Any],
    upstream: dict[str, dict[str, Any]],
    toolkit: dict[str, Any],
    index: int,
    make_finding: FindingFactory,
) -> tuple[dict[str, Any], Any]:
    upstream_record, binding_findings, requested = resolve_upstream_binding(
        raw,
        upstream,
        index,
        make_finding,
    )
    role, side, participation, role_status, role_findings = _role_context(
        raw,
        index,
        make_finding,
    )
    context = _binding_context(
        raw,
        upstream_record,
        toolkit,
        index,
        make_finding,
    )
    structure, standardized, parent, disposition, review, state_findings = context
    findings = binding_findings + state_findings + role_findings
    blocked = any(item["severity"] == "error" for item in findings)
    canonical, mol = _canonical_form(
        structure,
        standardized,
        blocked,
        toolkit,
    )
    if canonical is None and not blocked:
        code, severity = (
            ("E-UPSTREAM-STRUCTURE-MISMATCH-001", "error")
            if upstream_record is not None
            else ("W-PARTICIPANT-STRUCTURE-001", "warning")
        )
        findings.append(
            make_finding(
                code,
                severity,
                f"participants[{index}].original_structure",
            )
        )
        blocked = severity == "error"
    if not blocked and (
        isinstance(structure, str)
        and isinstance(standardized, str)
        and structure != standardized
        or isinstance(parent, str)
        and isinstance(standardized, str)
        and parent != standardized
    ):
        findings.append(
            make_finding(
                "W-PARTICIPANT-FORM-001",
                "warning",
                f"participants[{index}]",
                detail="保留 reported/standardized/parent 差异",
            )
        )
    return (
        {
            "participant_id": raw.get("participant_id") or f"participant-{index + 1}",
            "side": side,
            "reported_role": role,
            "reported_form": structure,
            "standardized_form": canonical,
            "parent_form": None if blocked else parent,
            "upstream_record_id": raw.get("upstream_record_id"),
            "upstream_binding_status": (
                "failed"
                if requested and upstream_record is None
                else "bound"
                if requested
                else "not_requested"
            ),
            "upstream_disposition": disposition,
            "upstream_human_review_required": review,
            "participation_status": participation,
            "role_status": role_status,
            "findings": findings,
        },
        mol,
    )
