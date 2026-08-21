#!/usr/bin/env python3
"""离线批量标准化化学结构，并生成可审计的质量检查结果。"""

from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.metadata
import json
import platform
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional, Sequence


SCHEMA_VERSION = "1.0.0"
WORKFLOW = "chemical-structure-standardization-qc"
PROFILES = {"rdkit-basic", "chembl-pipeline"}
DISPOSITIONS = {"ready_for_downstream", "review_required", "rejected"}
SECRET_RE = re.compile(
    r"ark-[A-Za-z0-9_-]{12,}|"
    r"Bearer\s+[A-Za-z0-9._-]{12,}|"
    r"(?:Authorization|Cookie|Token)\s*[:=]\s*[A-Za-z0-9._-]{12,}",
    re.IGNORECASE,
)
V3000_RE = re.compile(r"^M  [vV]30", re.MULTILINE)
POLYMER_RE = re.compile(r"^M  STY.+(?:SRU|MON|COP|CRO|ANY)", re.MULTILINE)

# This deliberately small list only recognizes obvious counterions/solvents.
# Anything more complex is retained as a mixture requiring human review.
SIMPLE_AUXILIARY_FRAGMENTS = {
    "O",
    "CO",
    "[Li+]",
    "[Na+]",
    "[K+]",
    "[F-]",
    "[Cl-]",
    "[Br-]",
    "[I-]",
    "[Ca+2]",
    "[Mg+2]",
}
ORGANIC_NONMETALS = {1, 5, 6, 7, 8, 9, 14, 15, 16, 17, 34, 35, 53}


class DependencyFailure(RuntimeError):
    """Required local chemistry packages are unavailable."""


class InputFailure(RuntimeError):
    """Input could not be loaded into records."""


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_toolkit() -> dict[str, Any]:
    try:
        import rdkit
        from rdkit import Chem, rdBase
        from rdkit.Chem.MolStandardize import rdMolStandardize
        import chembl_structure_pipeline
        from chembl_structure_pipeline import checker, standardizer
    except (ImportError, ModuleNotFoundError) as error:
        raise DependencyFailure(
            "需要 rdkit==2025.9.2 和 chembl-structure-pipeline==1.2.4；"
            "请在隔离环境中安装 scripts/requirements.txt。"
        ) from error

    return {
        "rdkit": rdkit,
        "Chem": Chem,
        "rdBase": rdBase,
        "rdMolStandardize": rdMolStandardize,
        "chembl_structure_pipeline": chembl_structure_pipeline,
        "checker": checker,
        "standardizer": standardizer,
    }


def tool_versions(toolkit: dict[str, Any], profile: str) -> dict[str, Any]:
    return {
        "python": platform.python_version(),
        "rdkit": toolkit["rdkit"].__version__,
        "chembl_structure_pipeline": toolkit["chembl_structure_pipeline"].__version__,
        "active_profile": profile,
        "used_tools": (
            ["rdkit", "chembl_structure_pipeline"]
            if profile == "chembl-pipeline"
            else ["rdkit"]
        ),
    }


def dependency_metadata() -> dict[str, Any]:
    result: dict[str, Any] = {}
    for name in ("rdkit", "chembl-structure-pipeline"):
        try:
            metadata = importlib.metadata.metadata(name)
            result[name] = {
                "version": importlib.metadata.version(name),
                "license": metadata.get("License"),
            }
        except importlib.metadata.PackageNotFoundError:
            result[name] = {"version": None, "license": None}
    return result


def detect_file_format(path: Optional[Path], text: str) -> str:
    if path:
        suffix = path.suffix.lower()
        if suffix == ".csv":
            return "csv"
        if suffix in {".sdf", ".sd"}:
            return "sdf"
        if suffix in {".mol", ".molblock"}:
            return "molblock"
        if suffix in {".smi", ".smiles", ".txt"}:
            return "smiles"
    if "$$$$" in text:
        return "sdf"
    if "M  END" in text or V3000_RE.search(text):
        return "molblock"
    first_line = text.splitlines()[0] if text.splitlines() else ""
    if "," in first_line and any(
        token in first_line.lower() for token in ("smiles", "structure", "molblock")
    ):
        return "csv"
    return "smiles"


def make_record(
    record_id: str,
    structure: str,
    input_format: str,
    source: str,
    index: int,
) -> dict[str, Any]:
    return {
        "id": record_id or f"record-{index + 1:04d}",
        "original_structure": structure,
        "input_format": input_format,
        "source": source,
        "record_index": index,
    }


def read_csv_records(
    text: str,
    source: str,
    structure_column: str,
    id_column: str,
) -> list[dict[str, Any]]:
    reader = csv.DictReader(text.splitlines())
    if not reader.fieldnames:
        raise InputFailure("CSV 缺少表头")
    if structure_column not in reader.fieldnames:
        raise InputFailure(
            f"CSV 缺少结构列 {structure_column!r}；实际列为 {reader.fieldnames!r}"
        )
    records = []
    for index, row in enumerate(reader):
        record_source = row.get("source") or source
        records.append(
            make_record(
                row.get(id_column) or f"row-{index + 1:04d}",
                row.get(structure_column) or "",
                "smiles",
                record_source,
                index,
            )
        )
    return records


def read_smiles_records(text: str, source: str) -> list[dict[str, Any]]:
    records = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        parts = line.strip().split(None, 1)
        structure = parts[0]
        record_id = parts[1].strip() if len(parts) > 1 else f"line-{line_number:04d}"
        records.append(
            make_record(record_id, structure, "smiles", source, len(records))
        )
    return records


def split_sdf_records(text: str, source: str) -> list[dict[str, Any]]:
    records = []
    for raw_block in text.split("$$$$"):
        if not raw_block.strip():
            continue
        original = raw_block
        parse_block = raw_block.lstrip("\r\n")
        first_line = (
            parse_block.splitlines()[0].strip() if parse_block.splitlines() else ""
        )
        record_id = first_line or f"sdf-{len(records) + 1:04d}"
        records.append(make_record(record_id, original, "sdf", source, len(records)))
    return records


def read_input_records(
    path: Optional[Path],
    input_format: str,
    structure_column: str,
    id_column: str,
    direct_smiles: Sequence[str],
    direct_ids: Sequence[str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if direct_smiles:
        if path:
            raise InputFailure("--input 与 --smiles 不能同时使用")
        if direct_ids and len(direct_ids) != len(direct_smiles):
            raise InputFailure("--record-id 数量必须与 --smiles 数量一致")
        records = [
            make_record(
                direct_ids[index] if direct_ids else f"cli-{index + 1:04d}",
                structure,
                "smiles",
                "cli",
                index,
            )
            for index, structure in enumerate(direct_smiles)
        ]
        return records, [{"source": "cli", "input_format": "smiles"}]

    if not path:
        raise InputFailure("必须提供 --input 或至少一个 --smiles")
    if str(path) == "-":
        text = sys.stdin.read()
        source = "stdin"
        resolved_path = None
    else:
        resolved_path = path.resolve()
        text = resolved_path.read_text(encoding="utf-8")
        source = path.name

    actual_format = (
        detect_file_format(resolved_path, text)
        if input_format == "auto"
        else input_format
    )
    if actual_format == "csv":
        records = read_csv_records(text, source, structure_column, id_column)
    elif actual_format == "sdf":
        records = split_sdf_records(text, source)
    elif actual_format == "molblock":
        first_line = text.lstrip("\r\n").splitlines()[0].strip() if text.strip() else ""
        records = [
            make_record(
                first_line or (path.stem if path else "molblock-0001"),
                text,
                "molblock",
                source,
                0,
            )
        ]
    elif actual_format == "smiles":
        records = read_smiles_records(text, source)
    else:
        raise InputFailure(f"不支持的输入格式：{actual_format}")

    return records, [{"source": source, "input_format": actual_format}]


def extract_molblock(structure: str) -> str:
    lines = structure.splitlines()
    counts_index = next(
        (
            index
            for index, line in enumerate(lines)
            if re.search(r"\bV(?:2000|3000)\s*$", line)
        ),
        None,
    )
    if counts_index is not None and counts_index >= 3:
        lines = lines[counts_index - 3 :]
    normalized = "\n".join(lines)
    if structure.endswith(("\n", "\r")):
        normalized += "\n"
    match = re.search(r"^M  END\s*$", normalized, flags=re.MULTILINE)
    if match:
        return normalized[: match.end()] + "\n"
    return normalized


def finding(
    code: str,
    severity: str,
    message: str,
    source: str,
    **details: Any,
) -> dict[str, Any]:
    item = {
        "code": code,
        "severity": severity,
        "message": message,
        "source": source,
    }
    if details:
        item["details"] = details
    return item


def raw_structure_findings(record: dict[str, Any]) -> list[dict[str, Any]]:
    raw = record["original_structure"]
    findings = []
    if V3000_RE.search(raw):
        findings.append(
            finding(
                "R-V3000-MOLBLOCK",
                "review",
                "检测到 V3000 MolBlock；当前结果不得视为 ChEMBL 入库批准。",
                "input",
            )
        )
    if POLYMER_RE.search(raw):
        findings.append(
            finding(
                "R-POLYMER-MOLBLOCK",
                "review",
                "检测到聚合物 SGroup；首版不生成单一 parent。",
                "input",
            )
        )
    return findings


def parse_record(
    record: dict[str, Any], toolkit: dict[str, Any]
) -> tuple[Optional[Any], list[dict[str, Any]]]:
    Chem = toolkit["Chem"]
    rdBase = toolkit["rdBase"]
    structure = record["original_structure"]
    findings: list[dict[str, Any]] = []
    if not structure.strip():
        findings.append(
            finding(
                "E-INPUT-EMPTY",
                "error",
                "结构为空，无法解析。",
                "input",
            )
        )
        return None, findings

    try:
        with rdBase.BlockLogs():
            if record["input_format"] == "smiles":
                mol = Chem.MolFromSmiles(structure, sanitize=False)
            else:
                mol = Chem.MolFromMolBlock(
                    extract_molblock(structure),
                    sanitize=False,
                    removeHs=False,
                    strictParsing=True,
                )
    except Exception as error:
        mol = None
        findings.append(
            finding(
                "E-PARSE-EXCEPTION",
                "error",
                f"结构解析抛出异常：{error}",
                "rdkit",
            )
        )
    if mol is None:
        if not findings:
            findings.append(
                finding(
                    "E-PARSE-INVALID",
                    "error",
                    "RDKit 无法解析该结构。",
                    "rdkit",
                )
            )
        return None, findings

    try:
        with rdBase.BlockLogs():
            Chem.SanitizeMol(mol)
    except Exception as error:
        findings.append(
            finding(
                "E-SANITIZE-FAILED",
                "error",
                f"RDKit sanitize 失败：{error}",
                "rdkit",
            )
        )
        return None, findings
    return mol, findings


def fragment_classification(mol: Any, toolkit: dict[str, Any]) -> dict[str, Any]:
    Chem = toolkit["Chem"]
    fragments = Chem.GetMolFrags(mol, asMols=True, sanitizeFrags=False)
    smiles = []
    for fragment in fragments:
        try:
            Chem.SanitizeMol(fragment)
            smiles.append(Chem.MolToSmiles(fragment, isomericSmiles=True))
        except Exception:
            smiles.append(None)
    if len(fragments) <= 1:
        classification = "single_component"
    else:
        non_auxiliary = [
            value for value in smiles if value not in SIMPLE_AUXILIARY_FRAGMENTS
        ]
        classification = (
            "salt_or_solvate"
            if len(non_auxiliary) == 1 and all(value is not None for value in smiles)
            else "mixture_or_complex"
        )
    return {
        "fragment_count": len(fragments),
        "fragment_smiles": smiles,
        "classification": classification,
    }


def inspect_molecule(
    mol: Any, record: dict[str, Any], toolkit: dict[str, Any]
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    Chem = toolkit["Chem"]
    findings: list[dict[str, Any]] = []
    fragment_info = fragment_classification(mol, toolkit)
    if fragment_info["classification"] == "salt_or_solvate":
        findings.append(
            finding(
                "R-MULTICOMPONENT-SALT",
                "review",
                "检测到一个主体片段及简单辅助片段；parent 仅作为派生表示。",
                "local-qc",
                fragment_smiles=fragment_info["fragment_smiles"],
            )
        )
    elif fragment_info["classification"] == "mixture_or_complex":
        findings.append(
            finding(
                "R-MULTICOMPONENT-MIXTURE",
                "review",
                "检测到多个非简单片段，不能自动缩为单一 parent。",
                "local-qc",
                fragment_smiles=fragment_info["fragment_smiles"],
            )
        )

    potential_stereo = []
    try:
        for info in Chem.FindPotentialStereo(mol):
            if str(info.specified).endswith("Unspecified"):
                potential_stereo.append(
                    {
                        "type": str(info.type),
                        "centered_on": int(info.centeredOn),
                    }
                )
    except Exception:
        potential_stereo = []
    if potential_stereo:
        findings.append(
            finding(
                "R-UNSPECIFIED-STEREO",
                "review",
                "存在潜在但未指定的立体化学，未自动补全。",
                "rdkit",
                centers=potential_stereo,
            )
        )

    isotope_atoms = [
        {"atom_index": atom.GetIdx(), "isotope": atom.GetIsotope()}
        for atom in mol.GetAtoms()
        if atom.GetIsotope()
    ]
    if isotope_atoms:
        findings.append(
            finding(
                "R-ISOTOPE-PRESENT",
                "review",
                "结构含同位素；部分 parent 规则可能移除同位素标记。",
                "local-qc",
                atoms=isotope_atoms,
            )
        )

    metal_atoms = [
        {"atom_index": atom.GetIdx(), "atomic_number": atom.GetAtomicNum()}
        for atom in mol.GetAtoms()
        if atom.GetAtomicNum() not in ORGANIC_NONMETALS
    ]
    if metal_atoms:
        findings.append(
            finding(
                "R-METAL-PRESENT",
                "review",
                "结构含金属；配位、盐型或 parent 选择必须人工确认。",
                "local-qc",
                atoms=metal_atoms,
            )
        )

    return fragment_info, findings


def canonical_smiles(mol: Any, toolkit: dict[str, Any]) -> str:
    return toolkit["Chem"].MolToSmiles(mol, isomericSmiles=True, canonical=True)


def inchi_key(mol: Any, toolkit: dict[str, Any]) -> Optional[str]:
    try:
        with toolkit["rdBase"].BlockLogs():
            value = toolkit["Chem"].MolToInchiKey(mol)
        return value or None
    except Exception:
        return None


def checker_findings(
    mol: Any, record: dict[str, Any], toolkit: dict[str, Any]
) -> list[dict[str, Any]]:
    Chem = toolkit["Chem"]
    checker = toolkit["checker"]
    if record["input_format"] == "smiles":
        molblock = Chem.MolToMolBlock(mol)
    else:
        molblock = extract_molblock(record["original_structure"])
    result = []
    with toolkit["rdBase"].BlockLogs():
        checker_results = checker.check_molblock(molblock)
    for penalty, message in checker_results:
        severity = "review" if penalty >= 6 else "warning"
        slug = re.sub(r"[^A-Z0-9]+", "-", message.upper()).strip("-")
        result.append(
            finding(
                f"CHEMBL-CHECK-{slug or 'UNCLASSIFIED'}",
                severity,
                message,
                "chembl-structure-pipeline",
                penalty=penalty,
            )
        )
    return result


def standardize_rdkit(
    mol: Any,
    allow_parent: bool,
    toolkit: dict[str, Any],
) -> tuple[Any, Optional[Any], list[dict[str, Any]]]:
    Chem = toolkit["Chem"]
    rdMolStandardize = toolkit["rdMolStandardize"]
    before = canonical_smiles(mol, toolkit)
    with toolkit["rdBase"].BlockLogs():
        standardized = rdMolStandardize.Cleanup(Chem.Mol(mol))
    after = canonical_smiles(standardized, toolkit)
    transformations = [
        {
            "step": "rdkit_cleanup",
            "status": "completed",
            "before": before,
            "after": after,
            "changed": before != after,
        }
    ]
    if allow_parent:
        with toolkit["rdBase"].BlockLogs():
            parent = rdMolStandardize.ChargeParent(Chem.Mol(standardized))
        parent_value = canonical_smiles(parent, toolkit)
        transformations.append(
            {
                "step": "rdkit_charge_parent",
                "status": "completed",
                "before": after,
                "after": parent_value,
                "changed": after != parent_value,
            }
        )
    else:
        parent = None
        transformations.append(
            {
                "step": "rdkit_charge_parent",
                "status": "not_applied",
                "reason": "mixture_or_polymer_requires_human_review",
            }
        )
    return standardized, parent, transformations


def standardize_chembl(
    mol: Any,
    allow_parent: bool,
    toolkit: dict[str, Any],
) -> tuple[Any, Optional[Any], list[dict[str, Any]]]:
    Chem = toolkit["Chem"]
    standardizer = toolkit["standardizer"]
    before = canonical_smiles(mol, toolkit)
    with toolkit["rdBase"].BlockLogs():
        standardized = standardizer.standardize_mol(Chem.Mol(mol))
    after = canonical_smiles(standardized, toolkit)
    transformations = [
        {
            "step": "chembl_standardizer",
            "status": "completed",
            "before": before,
            "after": after,
            "changed": before != after,
        }
    ]
    if allow_parent:
        with toolkit["rdBase"].BlockLogs():
            parent, exclusion_flag = standardizer.get_parent_mol(Chem.Mol(standardized))
        parent_value = canonical_smiles(parent, toolkit)
        transformations.append(
            {
                "step": "chembl_get_parent",
                "status": "completed",
                "before": after,
                "after": parent_value,
                "changed": after != parent_value,
                "exclusion_flag": bool(exclusion_flag),
            }
        )
    else:
        parent = None
        transformations.append(
            {
                "step": "chembl_get_parent",
                "status": "not_applied",
                "reason": "mixture_or_polymer_requires_human_review",
            }
        )
    return standardized, parent, transformations


def process_record(
    record: dict[str, Any], profile: str, toolkit: dict[str, Any]
) -> dict[str, Any]:
    output = {
        "id": record["id"],
        "record_index": record["record_index"],
        "source": record["source"],
        "original_structure": record["original_structure"],
        "input_format": record["input_format"],
        "parse_status": "error",
        "standardization_status": "not_run",
        "standardized_structure": None,
        "parent_structure": None,
        "inchikey": None,
        "parent_inchikey": None,
        "transformations": [],
        "qc_findings": [],
        "disposition": "rejected",
        "human_review_required": [],
    }
    output["qc_findings"].extend(raw_structure_findings(record))
    mol, parse_findings = parse_record(record, toolkit)
    output["qc_findings"].extend(parse_findings)
    if mol is None:
        output["human_review_required"] = [
            item["code"]
            for item in output["qc_findings"]
            if item["severity"] == "review"
        ]
        return output

    output["parse_status"] = "success"
    fragment_info, inspection_findings = inspect_molecule(mol, record, toolkit)
    output["fragment_analysis"] = fragment_info
    output["qc_findings"].extend(inspection_findings)
    if profile == "chembl-pipeline":
        output["qc_findings"].extend(checker_findings(mol, record, toolkit))

    is_polymer = bool(POLYMER_RE.search(record["original_structure"]))
    allow_parent = (
        fragment_info["classification"] != "mixture_or_complex" and not is_polymer
    )
    try:
        if profile == "chembl-pipeline":
            standardized, parent, transformations = standardize_chembl(
                mol, allow_parent, toolkit
            )
        else:
            standardized, parent, transformations = standardize_rdkit(
                mol, allow_parent, toolkit
            )
        output["transformations"] = transformations
        output["standardization_status"] = "completed"
        output["standardized_structure"] = canonical_smiles(standardized, toolkit)
        output["inchikey"] = inchi_key(standardized, toolkit)
        if parent is not None:
            output["parent_structure"] = canonical_smiles(parent, toolkit)
            output["parent_inchikey"] = inchi_key(parent, toolkit)
        if profile == "chembl-pipeline" and any(
            item.get("step") == "chembl_get_parent"
            and item.get("exclusion_flag") is True
            for item in transformations
        ):
            output["qc_findings"].append(
                finding(
                    "R-CHEMBL-EXCLUDED",
                    "review",
                    "命中 ChEMBL Structure Pipeline 排除规则；保留处理结果，但不得自动进入下游。",
                    "chembl-structure-pipeline",
                )
            )
    except Exception as error:
        output["standardization_status"] = "error"
        output["qc_findings"].append(
            finding(
                "E-STANDARDIZATION-FAILED",
                "error",
                f"标准化失败：{error}",
                profile,
            )
        )

    if output["standardized_structure"] and not output["inchikey"]:
        output["qc_findings"].append(
            finding(
                "W-INCHIKEY-MISSING",
                "warning",
                "标准化结构未能生成 InChIKey。",
                "rdkit",
            )
        )
    severities = {item["severity"] for item in output["qc_findings"]}
    if "error" in severities:
        output["disposition"] = "rejected"
    elif "review" in severities:
        output["disposition"] = "review_required"
    else:
        output["disposition"] = "ready_for_downstream"
    output["human_review_required"] = [
        item["code"] for item in output["qc_findings"] if item["severity"] == "review"
    ]
    return output


def duplicate_groups(records: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    bases: dict[str, dict[str, list[dict[str, Any]]]] = {
        "original": defaultdict(list),
        "standardized": defaultdict(list),
        "parent": defaultdict(list),
    }
    for record in records:
        original_key = hashlib.sha256(
            record["original_structure"].encode("utf-8")
        ).hexdigest()
        bases["original"][original_key].append(record)
        if record["standardized_structure"]:
            key = record["inchikey"] or record["standardized_structure"]
            bases["standardized"][key].append(record)
        if record["parent_structure"]:
            key = record["parent_inchikey"] or record["parent_structure"]
            bases["parent"][key].append(record)

    groups = []
    relationship = {
        "original": "exact_original_structure_match",
        "standardized": "same_standardized_structure",
        "parent": "same_derived_parent_not_same_physical_sample",
    }
    for basis in ("original", "standardized", "parent"):
        for key in sorted(bases[basis]):
            members = bases[basis][key]
            if len(members) < 2:
                continue
            groups.append(
                {
                    "basis": basis,
                    "group_key": key,
                    "record_ids": [item["id"] for item in members],
                    "record_indices": [item["record_index"] for item in members],
                    "relationship": relationship[basis],
                }
            )
    return groups


def output_fingerprint(document: dict[str, Any]) -> str:
    payload = {
        key: value
        for key, value in document.items()
        if key not in {"generated_at_utc", "result_fingerprint"}
    }
    serialized = json.dumps(
        payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def process_records(
    input_records: Sequence[dict[str, Any]],
    profile: str,
    provenance: Optional[Sequence[dict[str, Any]]] = None,
    generated_at_utc: Optional[str] = None,
) -> dict[str, Any]:
    if profile not in PROFILES:
        raise ValueError(f"不支持的 profile：{profile}")
    if not input_records:
        raise InputFailure("没有可处理的结构记录；请检查输入文件或 --smiles 参数")
    toolkit = load_toolkit()
    processed = [
        process_record(dict(record), profile, toolkit) for record in input_records
    ]
    counts = {disposition: 0 for disposition in DISPOSITIONS}
    for record in processed:
        counts[record["disposition"]] += 1

    errors = []
    warnings = []
    human_review = []
    for record in processed:
        for item in record["qc_findings"]:
            aggregate = {"record_id": record["id"], **item}
            if item["severity"] == "error":
                errors.append(aggregate)
            elif item["severity"] == "warning":
                warnings.append(aggregate)
            elif item["severity"] == "review":
                human_review.append(aggregate)

    document = {
        "schema_version": SCHEMA_VERSION,
        "workflow": WORKFLOW,
        "generated_at_utc": generated_at_utc or now_utc(),
        "tool_versions": tool_versions(toolkit, profile),
        "dependency_metadata": dependency_metadata(),
        "options": {
            "profile": profile,
            "preserve_original": True,
            "parent_policy": "report_only",
            "duplicate_bases": ["original", "standardized", "parent"],
            "offline": True,
        },
        "input_summary": {
            "total_records": len(processed),
            "ready_for_downstream": counts["ready_for_downstream"],
            "review_required": counts["review_required"],
            "rejected": counts["rejected"],
        },
        "records": processed,
        "duplicate_groups": duplicate_groups(processed),
        "errors": errors,
        "warnings": warnings,
        "notices": [
            "ready_for_downstream 仅表示通过当前数据规则，不证明实验样品身份、活性、安全性或科学结论。",
            "parent molecule 是派生表示；同一 parent 不表示盐型、游离形式或实物样品相同。",
            "本工作流离线运行，不查询 PubChem、ChEMBL Web API 或活性数据库。",
        ],
        "human_review_required": human_review,
        "provenance": list(provenance or []),
    }
    document["result_fingerprint"] = output_fingerprint(document)
    serialized = json.dumps(document, ensure_ascii=False)
    if SECRET_RE.search(serialized):
        raise RuntimeError("输出中检测到疑似凭证，已停止写出")
    return document


def write_csv_summary(document: dict[str, Any], path: Path) -> None:
    fieldnames = [
        "record_index",
        "id",
        "source",
        "input_format",
        "parse_status",
        "standardization_status",
        "standardized_structure",
        "parent_structure",
        "inchikey",
        "parent_inchikey",
        "disposition",
        "finding_codes",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for record in document["records"]:
            writer.writerow(
                {key: record.get(key) for key in fieldnames if key != "finding_codes"}
                | {
                    "finding_codes": ";".join(
                        item["code"] for item in record["qc_findings"]
                    )
                }
            )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, help="SMI/CSV/SDF/MolBlock path, or -")
    parser.add_argument(
        "--input-format",
        default="auto",
        choices=["auto", "smiles", "csv", "sdf", "molblock"],
    )
    parser.add_argument("--smiles", action="append", default=[])
    parser.add_argument("--record-id", action="append", default=[])
    parser.add_argument("--structure-column", default="structure")
    parser.add_argument("--id-column", default="id")
    parser.add_argument(
        "--profile",
        default="chembl-pipeline",
        choices=sorted(PROFILES),
    )
    parser.add_argument("--output", type=Path, help="JSON output path")
    parser.add_argument("--csv-summary", type=Path)
    parser.add_argument(
        "--generated-at",
        help="固定 UTC 时间，仅用于可重复验收；默认取当前时间",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        records, provenance = read_input_records(
            args.input,
            args.input_format,
            args.structure_column,
            args.id_column,
            args.smiles,
            args.record_id,
        )
        document = process_records(
            records,
            args.profile,
            provenance=provenance,
            generated_at_utc=args.generated_at,
        )
    except (DependencyFailure, InputFailure, OSError, ValueError) as error:
        sys.stderr.write(f"error: {error}\n")
        return 3

    serialized = json.dumps(document, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(serialized, encoding="utf-8")
    else:
        sys.stdout.write(serialized)
    if args.csv_summary:
        write_csv_summary(document, args.csv_summary)
    return 2 if document["input_summary"]["rejected"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
