"""Yield and elemental-balance diagnostics."""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from collections.abc import Callable, Sequence
from typing import Any


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def molecule_composition(mol: Any) -> tuple[Counter[str], int]:
    counts: Counter[str] = Counter()
    charge = 0
    for atom in mol.GetAtoms():
        counts[atom.GetSymbol()] += 1
        counts["H"] += int(atom.GetTotalNumHs(includeNeighbors=True))
        charge += int(atom.GetFormalCharge())
    if not counts["H"]:
        counts.pop("H", None)
    return counts, charge


def composition_delta(
    input_mols: Sequence[Any],
    output_mols: Sequence[Any],
) -> tuple[dict[str, int], int]:
    inputs: Counter[str] = Counter()
    outputs: Counter[str] = Counter()
    input_charge = 0
    output_charge = 0
    for mol in input_mols:
        counts, charge = molecule_composition(mol)
        inputs.update(counts)
        input_charge += charge
    for mol in output_mols:
        counts, charge = molecule_composition(mol)
        outputs.update(counts)
        output_charge += charge
    elements = sorted(set(inputs) | set(outputs))
    delta = {
        element: outputs[element] - inputs[element]
        for element in elements
        if outputs[element] != inputs[element]
    }
    return delta, output_charge - input_charge


def _yield_findings(
    entry: dict[str, Any],
    index: int,
    finding_factory: Callable[..., dict[str, Any]],
) -> list[dict[str, Any]]:
    value = entry.get("value")
    findings = []
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if value < 0 or value > 100:
            findings.append(
                finding_factory(
                    "W-YIELD-RANGE-001",
                    "warning",
                    f"yields[{index}].value",
                    detail=str(value),
                )
            )
        elif 0 < value < 1:
            findings.append(
                finding_factory(
                    "W-YIELD-FRACTION-001",
                    "warning",
                    f"yields[{index}].value",
                    detail=str(value),
                )
            )
    if entry.get("analysis_required") is True and not entry.get("analysis_key"):
        findings.append(
            finding_factory(
                "W-ANALYSIS-LINK-001",
                "warning",
                f"yields[{index}].analysis_key",
            )
        )
    return findings


def assess_yields(
    raw: dict[str, Any],
    finding_factory: Callable[..., dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    yields = raw.get("yields")
    if yields is None and raw.get("yield_percent") is not None:
        yields = [
            {
                "value": raw.get("yield_percent"),
                "units": "PERCENT",
                "type": "reported",
            }
        ]
    if not isinstance(yields, list):
        yields = []
    normalized = []
    findings = []
    by_product: defaultdict[str, set[float]] = defaultdict(set)
    for index, entry in enumerate(yields):
        if not isinstance(entry, dict):
            continue
        normalized.append(
            {
                "value": entry.get("value"),
                "units": entry.get("units", "PERCENT"),
                "type": entry.get("type", "reported"),
                "product_id": entry.get("product_id"),
                "analysis_key": entry.get("analysis_key"),
            }
        )
        findings.extend(_yield_findings(entry, index, finding_factory))
        value = entry.get("value")
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            by_product[str(entry.get("product_id"))].add(float(value))
    for product_id, values in by_product.items():
        if len(values) > 1:
            findings.append(
                finding_factory(
                    "W-YIELD-CONFLICT-001",
                    "warning",
                    "yields",
                    detail=f"product_id={product_id}, values={sorted(values)}",
                )
            )
    return findings, {"measurements": normalized, "status": "completed"}


def assess_balance(
    input_mols: list[Any],
    output_mols: list[Any],
    stoichiometry_complete: bool,
    finding_factory: Callable[..., dict[str, Any]],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    assessment = {
        "status": "not_assessed",
        "assumption": "each_listed_reactant_once",
        "element_delta": {},
        "formal_charge_delta": 0,
    }
    if not input_mols or not output_mols:
        return assessment, []
    element_delta, charge_delta = composition_delta(
        input_mols,
        output_mols,
    )
    assessment.update(
        {
            "status": "completed",
            "element_delta": element_delta,
            "formal_charge_delta": charge_delta,
        }
    )
    findings = []
    if element_delta:
        findings.append(
            finding_factory(
                "W-BALANCE-ATOM-001",
                "warning",
                "balance_assessment.element_delta",
                detail=canonical_json(element_delta),
            )
        )
    if charge_delta:
        findings.append(
            finding_factory(
                "W-BALANCE-CHARGE-001",
                "warning",
                "balance_assessment.formal_charge_delta",
                detail=str(charge_delta),
            )
        )
    if not stoichiometry_complete:
        findings.append(
            finding_factory(
                "H-BALANCE-INCOMPLETE-001",
                "human_review",
                "balance_assessment",
            )
        )
    return assessment, findings
