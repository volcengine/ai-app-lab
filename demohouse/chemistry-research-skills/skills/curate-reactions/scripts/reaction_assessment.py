"""Deterministic reaction record assessment."""

from __future__ import annotations

import hashlib
import importlib.util
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any


def _load_yield_balance() -> Any:
    path = Path(__file__).with_name("reaction_yield_balance.py")
    spec = importlib.util.spec_from_file_location(
        "reaction_assessment_yield_balance",
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load reaction_yield_balance.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


YIELD_BALANCE = _load_yield_balance()
assess_yields = YIELD_BALANCE.assess_yields
assess_balance = YIELD_BALANCE.assess_balance


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def split_reaction_smiles(
    value: Any,
) -> tuple[list[str], list[str], list[str]]:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("reaction SMILES 为空")
    text = value.strip()
    if text.count(">") != 2:
        raise ValueError("reaction SMILES 必须包含两个 >")
    left, middle, right = text.split(">")
    inputs = [item for item in left.split(".") if item]
    agents = [item for item in middle.split(".") if item]
    outputs = [item for item in right.split(".") if item]
    if not inputs or not outputs:
        raise ValueError("反应必须同时包含输入和输出")
    return inputs, agents, outputs


def source_participants(reaction_smiles: str) -> list[dict[str, Any]]:
    inputs, agents, outputs = split_reaction_smiles(reaction_smiles)
    participants = []
    for side, role, structures in (
        ("input", "reactant", inputs),
        ("input", "reagent", agents),
        ("output", "product", outputs),
    ):
        participants.extend(
            {
                "participant_id": f"{side}-{role}-{index + 1}",
                "side": side,
                "reported_role": role,
                "original_structure": structure,
            }
            for index, structure in enumerate(structures)
        )
    return participants


def _reaction_context(
    raw: dict[str, Any],
    toolkit: dict[str, Any],
    finding_factory: Callable[..., dict[str, Any]],
    ord_parser: Callable[..., tuple[Any, Any, list]],
) -> tuple[Any, str, list[str], list[str], list[str], list[dict[str, Any]]]:
    findings = []
    ord_record = raw.get("ord_record")
    reaction_smiles = raw.get("reaction_smiles")
    if isinstance(reaction_smiles, dict):
        reaction_smiles = reaction_smiles.get("reported")
    normalized_ord = None
    if isinstance(ord_record, dict):
        normalized_ord, generated, ord_findings = ord_parser(
            ord_record,
            toolkit,
        )
        findings.extend(ord_findings)
        reaction_smiles = reaction_smiles or generated
    try:
        inputs, agents, outputs = split_reaction_smiles(reaction_smiles)
    except ValueError as error:
        findings.append(
            finding_factory(
                "E-REACTION-SMILES-001",
                "error",
                "reaction_smiles",
                detail=str(error),
            )
        )
        inputs, agents, outputs = [], [], []
    if not inputs or not outputs:
        findings.append(
            finding_factory(
                "E-REACTION-SIDES-001",
                "error",
                "reaction_smiles",
            )
        )
    return normalized_ord, reaction_smiles, inputs, agents, outputs, findings


def _assess_participants(
    raw: dict[str, Any],
    reaction_smiles: str,
    upstream: dict[str, dict[str, Any]],
    toolkit: dict[str, Any],
    participant_assessor: Callable[..., tuple[dict[str, Any], Any]],
) -> tuple[list[dict[str, Any]], list[Any], list[Any], list[dict[str, Any]]]:
    participants = raw.get("participants")
    if not isinstance(participants, list) or not participants:
        try:
            participants = source_participants(str(reaction_smiles))
        except ValueError:
            participants = []
    assessments = []
    input_mols = []
    output_mols = []
    findings = []
    for index, participant in enumerate(participants):
        raw_participant = participant if isinstance(participant, dict) else {}
        assessment, mol = participant_assessor(
            raw_participant,
            upstream,
            toolkit,
            index,
        )
        assessments.append(assessment)
        findings.extend(assessment["findings"])
        if mol is not None and assessment["side"] == "output":
            output_mols.append(mol)
        elif mol is not None and assessment["reported_role"] == "reactant":
            input_mols.append(mol)
    return assessments, input_mols, output_mols, findings


def _canonical_reaction(
    inputs: list[str],
    agents: list[str],
    outputs: list[str],
    toolkit: dict[str, Any],
    canonicalizer: Callable[..., tuple[str | None, Any]],
) -> tuple[str | None, list[str], list[str], list[str]]:
    canonical_sides = []
    for values in (inputs, agents, outputs):
        canonical = []
        for value in values:
            normalized, _ = canonicalizer(value, toolkit)
            if normalized:
                canonical.append(normalized)
        canonical_sides.append(canonical)
    canonical_inputs, canonical_agents, canonical_outputs = canonical_sides
    reaction = (
        ".".join(sorted(canonical_inputs))
        + ">"
        + ".".join(sorted(canonical_agents))
        + ">"
        + ".".join(sorted(canonical_outputs))
        if canonical_inputs and canonical_outputs
        else None
    )
    return reaction, canonical_inputs, canonical_agents, canonical_outputs


def _process_findings(
    raw: dict[str, Any],
    finding_factory: Callable[..., dict[str, Any]],
) -> list[dict[str, Any]]:
    process = raw.get("process")
    if not isinstance(process, dict) or process.get("required") is not True:
        return []
    missing = [
        key
        for key in ("conditions", "setup", "observations", "workups")
        if not process.get(key)
    ]
    if not missing:
        return []
    return [
        finding_factory(
            "W-PROCESS-MISSING-001",
            "warning",
            "process",
            detail=", ".join(missing),
        )
    ]


def _state(findings: list[dict[str, Any]]) -> tuple[str, str]:
    severities = {item["severity"] for item in findings}
    if "error" in severities:
        return "error", "rejected"
    if findings:
        return "partial", "review_required"
    return "completed", "ready_for_search"


def _parent_key(
    assessments: list[dict[str, Any]],
) -> str | None:
    inputs = sorted(
        item["parent_form"]
        for item in assessments
        if item["side"] == "input" and isinstance(item["parent_form"], str)
    )
    outputs = sorted(
        item["parent_form"]
        for item in assessments
        if item["side"] == "output" and isinstance(item["parent_form"], str)
    )
    return ".".join(inputs) + ">>" + ".".join(outputs) if inputs and outputs else None


def _record_result(
    raw: dict[str, Any],
    normalized_ord: Any,
    reaction_smiles: str,
    canonical: str | None,
    assessments: list[dict[str, Any]],
    yield_assessment: dict[str, Any],
    balance: dict[str, Any],
    findings: list[dict[str, Any]],
) -> dict[str, Any]:
    status, disposition = _state(findings)
    exact_payload = {
        "reaction_smiles": canonical,
        "participants": [
            {
                "side": item["side"],
                "reported_role": item["reported_role"],
                "standardized_form": item["standardized_form"],
            }
            for item in assessments
        ],
        "yields": yield_assessment["measurements"],
        "ord_record": normalized_ord,
    }
    return {
        "record_id": raw.get("record_id"),
        "source_locator": raw.get("source_locator"),
        "original_record_hash": sha256_json(raw),
        "ord_record": normalized_ord,
        "reaction_smiles": {
            "reported": reaction_smiles,
            "canonical_unmapped": canonical,
        },
        "participant_assessments": assessments,
        "role_assessment": {
            "status": (
                "conflict"
                if any(item["role_status"] == "conflict" for item in assessments)
                else "review_required"
                if any(
                    item["role_status"] in {"ambiguous", "not_assessed"}
                    for item in assessments
                )
                else "consistent"
            )
        },
        "yield_assessment": yield_assessment,
        "balance_assessment": balance,
        "mapping_assessment": {
            "requested": False,
            "status": "not_run",
            "backend": None,
            "confidence": None,
        },
        "duplicate_memberships": [],
        "curation_status": status,
        "findings": findings,
        "disposition": disposition,
        "human_review_required": sorted(
            {item["code"] for item in findings if item["severity"] == "human_review"}
        ),
        "_duplicate_keys": {
            "exact_record": sha256_json(exact_payload),
            "reported_transformation": canonical,
            "parent_transformation_candidate": _parent_key(assessments),
        },
    }


def assess_record(
    raw: dict[str, Any],
    upstream: dict[str, dict[str, Any]],
    toolkit: dict[str, Any],
    finding_factory: Callable[..., dict[str, Any]],
    participant_assessor: Callable[..., tuple[dict[str, Any], Any]],
    ord_parser: Callable[..., tuple[Any, Any, list]],
    ord_yield_extractor: Callable[[Any], list[dict[str, Any]]],
    canonicalizer: Callable[..., tuple[str | None, Any]],
) -> dict[str, Any]:
    context = _reaction_context(raw, toolkit, finding_factory, ord_parser)
    normalized_ord, reaction_smiles, inputs, agents, outputs, findings = context
    assessments, input_mols, output_mols, participant_findings = _assess_participants(
        raw,
        reaction_smiles,
        upstream,
        toolkit,
        participant_assessor,
    )
    findings.extend(participant_findings)
    yield_source = raw
    if (
        raw.get("yields") is None
        and raw.get("yield_percent") is None
        and normalized_ord is not None
    ):
        yield_source = {**raw, "yields": ord_yield_extractor(normalized_ord)}
    yield_findings, yield_assessment = assess_yields(
        yield_source,
        finding_factory,
    )
    balance, balance_findings = assess_balance(
        input_mols,
        output_mols,
        raw.get("stoichiometry_complete") is True,
        finding_factory,
    )
    findings.extend(
        [
            *yield_findings,
            *balance_findings,
            *_process_findings(raw, finding_factory),
        ]
    )
    canonical, c_inputs, _, c_outputs = _canonical_reaction(
        inputs,
        agents,
        outputs,
        toolkit,
        canonicalizer,
    )
    if c_inputs and c_outputs and sorted(c_inputs) == sorted(c_outputs):
        findings.append(
            finding_factory(
                "W-REACTION-NO-CHANGE-001",
                "warning",
                "reaction_smiles",
            )
        )
    return _record_result(
        raw,
        normalized_ord,
        reaction_smiles,
        canonical,
        assessments,
        yield_assessment,
        balance,
        findings,
    )
