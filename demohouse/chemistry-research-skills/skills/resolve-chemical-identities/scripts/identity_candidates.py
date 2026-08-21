"""Normalize source records and aggregate full-identity candidates."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any, Optional, Sequence


def _load_request_contract() -> Any:
    path = Path(__file__).with_name("identity_request_contract.py")
    spec = importlib.util.spec_from_file_location(
        "identity_candidates_request_contract",
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load identity_request_contract.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


REQUEST_CONTRACT = _load_request_contract()


def _integrity_conflict(
    record: dict[str, Any],
    source_key: str,
    derived_key: str,
) -> dict[str, Any]:
    return {
        "code": "E-SOURCE-INCHIKEY-MISMATCH",
        "severity": "error",
        "message": (
            f"{record['source']} 提供的 InChIKey 与本地从其结构重算的完整 "
            "InChIKey 不一致。"
        ),
        "source": record["source"],
        "source_record_id": record.get("source_record_id"),
        "source_inchikey": source_key,
        "derived_inchikey": derived_key,
    }


def _parse_source_record(
    record: dict[str, Any],
    toolkit: dict[str, Any],
) -> tuple[Optional[dict[str, Any]], Optional[str]]:
    molecule = None
    parse_error = None
    if record.get("inchi"):
        molecule, parse_error = REQUEST_CONTRACT.parse_structure(
            record["inchi"],
            "inchi",
            toolkit,
        )
    if molecule is None and record.get("structure"):
        molecule, parse_error = REQUEST_CONTRACT.parse_structure(
            record["structure"],
            "smiles",
            toolkit,
        )
    derived = (
        REQUEST_CONTRACT.structure_identifiers(molecule, toolkit)
        if molecule is not None
        else None
    )
    return derived, parse_error


def _normalized_record(
    record: dict[str, Any],
    derived: Optional[dict[str, Any]],
    final_key: str,
    findings: list[dict[str, Any]],
) -> dict[str, Any]:
    normalized = {
        **record,
        "canonical_smiles": (derived or {}).get("canonical_smiles"),
        "normalized_inchi": (derived or {}).get("inchi") or record.get("inchi"),
        "normalized_inchikey": final_key,
        "connectivity_block": (
            final_key[:14]
            if REQUEST_CONTRACT.INCHIKEY_RE.fullmatch(final_key)
            else None
        ),
        "normalized_formula": (derived or {}).get("molecular_formula")
        or record.get("molecular_formula"),
        "component_count": (derived or {}).get("component_count"),
        "unassigned_stereo": (derived or {}).get("unassigned_stereo") or [],
        "record_findings": findings,
    }
    if normalized["component_count"] and normalized["component_count"] > 1:
        normalized["record_findings"].append(
            {
                "code": "R-MULTICOMPONENT-CANDIDATE",
                "severity": "review",
                "message": (
                    "候选结构包含多个组分，可能是盐、溶剂化物、配合物或混合物。"
                ),
            }
        )
    if normalized["unassigned_stereo"]:
        normalized["record_findings"].append(
            {
                "code": "R-UNSPECIFIED-STEREO",
                "severity": "review",
                "message": "候选结构存在未指定立体中心。",
            }
        )
    return normalized


def normalize_source_record(
    record: dict[str, Any],
    toolkit: dict[str, Any],
) -> tuple[Optional[dict[str, Any]], Optional[dict[str, Any]]]:
    source_key = record.get("inchikey")
    derived, parse_error = _parse_source_record(record, toolkit)
    findings = list(record.get("record_findings") or [])
    if derived and source_key and derived["inchikey"] != source_key:
        findings.append(_integrity_conflict(record, source_key, derived["inchikey"]))
        return None, {
            **record,
            "record_findings": findings,
            "parse_error": parse_error,
        }

    final_key = (derived or {}).get("inchikey") or source_key
    if not final_key:
        return None, {
            **record,
            "record_findings": [
                *findings,
                {
                    "code": "R-SOURCE-RECORD-NO-COMPLETE-STRUCTURE",
                    "severity": "review",
                    "message": "来源记录没有可核对的完整结构或 InChIKey。",
                },
            ],
            "parse_error": parse_error,
        }
    if derived is None:
        findings.append(
            {
                "code": "R-KEY-WITHOUT-LOCAL-STRUCTURE",
                "severity": "review",
                "message": "来源只提供完整 InChIKey，未能在本地重建结构。",
            }
        )
    return _normalized_record(record, derived, final_key, findings), None


def _new_group(normalized: dict[str, Any]) -> dict[str, Any]:
    return {
        "canonical_smiles": normalized.get("canonical_smiles"),
        "inchi": normalized.get("normalized_inchi"),
        "inchikey": normalized["normalized_inchikey"],
        "connectivity_block": normalized.get("connectivity_block"),
        "molecular_formula": normalized.get("normalized_formula"),
        "component_count": normalized.get("component_count"),
        "names": set(),
        "evidence": [],
        "quality_findings": [],
        "comparison_view": None,
    }


def _evidence(normalized: dict[str, Any]) -> dict[str, Any]:
    return {
        "source": normalized["source"],
        "source_family": normalized["source_family"],
        "source_record_id": normalized.get("source_record_id"),
        "source_url": normalized.get("source_url"),
        "match_method": normalized.get("match_method"),
        "source_structure": normalized.get("structure"),
        "source_inchi": normalized.get("inchi"),
        "source_inchikey": normalized.get("inchikey"),
        "raw_record": normalized.get("raw_record"),
    }


def _merge_group(
    group: dict[str, Any],
    normalized: dict[str, Any],
) -> None:
    for target, source in (
        ("canonical_smiles", "canonical_smiles"),
        ("inchi", "normalized_inchi"),
        ("molecular_formula", "normalized_formula"),
    ):
        if group[target] is None and normalized.get(source):
            group[target] = normalized[source]
    group["names"].update(normalized.get("names") or [])
    if normalized.get("title"):
        group["names"].add(normalized["title"])
    evidence = _evidence(normalized)
    evidence_key = (
        evidence["source_family"],
        evidence["source_record_id"],
        evidence["match_method"],
        evidence["source_inchikey"],
    )
    existing_keys = {
        (
            item["source_family"],
            item["source_record_id"],
            item["match_method"],
            item["source_inchikey"],
        )
        for item in group["evidence"]
    }
    if evidence_key not in existing_keys:
        group["evidence"].append(evidence)
    existing_findings = {
        (item.get("code"), item.get("message")) for item in group["quality_findings"]
    }
    for finding in normalized.get("record_findings") or []:
        finding_key = (finding.get("code"), finding.get("message"))
        if finding_key not in existing_findings:
            group["quality_findings"].append(finding)
            existing_findings.add(finding_key)


def _finalize_groups(groups: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    ordered = sorted(
        groups.values(),
        key=lambda item: (
            item["inchikey"] or "",
            item["canonical_smiles"] or "",
        ),
    )
    candidates = []
    for index, group in enumerate(ordered, 1):
        group["candidate_id"] = f"candidate-{index:03d}"
        group["names"] = sorted(group["names"], key=str.casefold)
        group["evidence"] = sorted(
            group["evidence"],
            key=lambda item: (
                item["source_family"],
                item.get("source_record_id") or "",
                item.get("match_method") or "",
            ),
        )
        group["source_families"] = sorted(
            {item["source_family"] for item in group["evidence"]}
        )
        candidates.append(group)
    return candidates


def aggregate_candidates(
    records: Sequence[dict[str, Any]],
    toolkit: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    groups: dict[str, dict[str, Any]] = {}
    unresolved: list[dict[str, Any]] = []
    integrity_conflicts: list[dict[str, Any]] = []
    for record in records:
        normalized, problem = normalize_source_record(record, toolkit)
        if normalized is not None:
            key = normalized["normalized_inchikey"]
            group = groups.setdefault(key, _new_group(normalized))
            _merge_group(group, normalized)
            continue
        if problem and any(
            item.get("code") == "E-SOURCE-INCHIKEY-MISMATCH"
            for item in problem.get("record_findings", [])
        ):
            integrity_conflicts.append(problem)
        elif problem:
            unresolved.append(problem)
    return _finalize_groups(groups), unresolved, integrity_conflicts
