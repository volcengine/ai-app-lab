"""Identity request parsing and local structure validation."""

from __future__ import annotations

import re
from typing import Any, Optional


INPUT_TYPES = frozenset(
    {
        "auto",
        "name",
        "smiles",
        "inchi",
        "inchikey",
        "pubchem_cid",
        "chembl_id",
        "cas_rn",
    }
)
INPUT_TYPE_ALIASES = {
    "cid": "pubchem_cid",
    "pubchem-cid": "pubchem_cid",
    "chembl-id": "chembl_id",
    "cas": "cas_rn",
    "cas-rn": "cas_rn",
}
INCHIKEY_RE = re.compile(r"^[A-Z]{14}-[A-Z]{10}-[A-Z]$")
CHEMBL_RE = re.compile(r"^CHEMBL\d+$", re.IGNORECASE)
CAS_RE = re.compile(r"^(?P<body>\d{2,7})-(?P<middle>\d{2})-(?P<check>\d)$")


class InputFailure(ValueError):
    """Request or CLI input is invalid."""


def normalize_input_type(value: str) -> str:
    normalized = value.strip().lower().replace(" ", "_")
    normalized = INPUT_TYPE_ALIASES.get(normalized, normalized)
    if normalized not in INPUT_TYPES:
        raise InputFailure(f"不支持的 input_type：{value}")
    return normalized


def valid_cas_check_digit(value: str) -> bool:
    match = CAS_RE.fullmatch(value)
    if not match:
        return False
    digits = match.group("body") + match.group("middle")
    total = sum(int(digit) * weight for weight, digit in enumerate(reversed(digits), 1))
    return total % 10 == int(match.group("check"))


def parse_structure(
    value: str,
    structure_type: str,
    toolkit: dict[str, Any],
) -> tuple[Optional[Any], Optional[str]]:
    Chem = toolkit["Chem"]
    try:
        if structure_type == "smiles":
            molecule = Chem.MolFromSmiles(value, sanitize=False)
        elif structure_type == "inchi":
            molecule = Chem.MolFromInchi(
                value,
                sanitize=False,
                removeHs=False,
            )
        else:
            raise ValueError(f"不支持的结构类型：{structure_type}")
        if molecule is None:
            return None, "RDKit 未生成分子对象"
        Chem.SanitizeMol(molecule)
        return molecule, None
    except Exception as error:  # RDKit exposes multiple C++ exception types.
        return None, str(error)


def structure_identifiers(
    molecule: Any,
    toolkit: dict[str, Any],
) -> dict[str, Any]:
    Chem = toolkit["Chem"]
    inchi = toolkit["inchi"]
    rdMolDescriptors = toolkit["rdMolDescriptors"]
    canonical_smiles = Chem.MolToSmiles(
        molecule,
        canonical=True,
        isomericSmiles=True,
    )
    standard_inchi = inchi.MolToInchi(molecule)
    standard_inchikey = (
        inchi.InchiToInchiKey(standard_inchi) if standard_inchi else None
    )
    chiral_centers = Chem.FindMolChiralCenters(
        molecule,
        includeUnassigned=True,
        includeCIP=True,
    )
    unassigned_stereo = [
        {"atom_index": atom_index, "assignment": assignment}
        for atom_index, assignment in chiral_centers
        if assignment == "?"
    ]
    return {
        "canonical_smiles": canonical_smiles,
        "inchi": standard_inchi or None,
        "inchikey": standard_inchikey or None,
        "connectivity_block": (standard_inchikey[:14] if standard_inchikey else None),
        "molecular_formula": rdMolDescriptors.CalcMolFormula(molecule),
        "component_count": len(Chem.GetMolFrags(molecule)),
        "unassigned_stereo": unassigned_stereo,
    }


def looks_like_failed_smiles(value: str) -> bool:
    if any(character.isspace() for character in value):
        return False
    if any(token in value for token in ("[", "]", "(", ")", "=", "#", "@", "\\", "/")):
        return True
    return bool(re.search(r"[A-Za-z]\d|\d[A-Za-z]", value))


def detect_input_type(
    query: str,
    toolkit: dict[str, Any],
) -> tuple[str, list[dict[str, Any]]]:
    stripped = query.strip()
    findings: list[dict[str, Any]] = []
    if CHEMBL_RE.fullmatch(stripped):
        return "chembl_id", findings
    if INCHIKEY_RE.fullmatch(stripped.upper()):
        return "inchikey", findings
    if stripped.startswith("InChI="):
        return "inchi", findings
    if CAS_RE.fullmatch(stripped):
        return "cas_rn", findings
    if stripped.isdigit():
        findings.append(
            {
                "code": "E-AMBIGUOUS-NUMERIC-ID",
                "severity": "error",
                "message": (
                    "纯数字不能安全地区分 PubChem CID、内部编号或名称；"
                    "请显式指定 input_type=pubchem_cid。"
                ),
            }
        )
        return "ambiguous_numeric", findings

    molecule, _ = parse_structure(stripped, "smiles", toolkit)
    if molecule is not None:
        return "smiles", findings
    if looks_like_failed_smiles(stripped):
        return "smiles", findings
    return "name", findings


def local_source_record(
    request_id: str,
    query: str,
    input_type: str,
    toolkit: dict[str, Any],
) -> tuple[Optional[dict[str, Any]], list[dict[str, Any]]]:
    molecule, error = parse_structure(query, input_type, toolkit)
    if molecule is None:
        return None, [
            {
                "code": "E-INVALID-STRUCTURE",
                "severity": "error",
                "message": error or "结构无法解析",
            }
        ]

    identifiers = structure_identifiers(molecule, toolkit)
    findings: list[dict[str, Any]] = []
    if identifiers["component_count"] > 1:
        findings.append(
            {
                "code": "R-MULTICOMPONENT-INPUT",
                "severity": "review",
                "message": "输入包含多个结构组分；不得自动挑选单一主体。",
            }
        )
    if identifiers["unassigned_stereo"]:
        findings.append(
            {
                "code": "R-UNSPECIFIED-STEREO",
                "severity": "review",
                "message": "结构存在未指定立体中心；不得自动补成立体化学。",
            }
        )
    return (
        {
            "source": "local_input",
            "source_family": "local_input",
            "source_record_id": request_id,
            "match_method": f"parsed_{input_type}",
            "title": None,
            "names": [],
            "structure": (
                query if input_type == "smiles" else identifiers["canonical_smiles"]
            ),
            "inchi": identifiers["inchi"],
            "inchikey": identifiers["inchikey"],
            "molecular_formula": identifiers["molecular_formula"],
            "source_url": None,
            "raw_record": {
                "input_type": input_type,
                "input_value": query,
            },
            "record_findings": findings,
        },
        findings,
    )


def _empty_query_result(
    request_id: str,
    query: str,
    requested_type: str,
    context: Any,
    expected_form: Any,
    findings: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "id": request_id,
        "query": query,
        "requested_input_type": requested_type,
        "detected_input_type": "unknown",
        "context": context,
        "expected_form": expected_form,
        "input_status": "invalid_input",
        "findings": findings,
        "local_record": None,
    }


def _validate_typed_query(
    detected_type: str,
    request_id: str,
    stripped: str,
    toolkit: dict[str, Any],
    findings: list[dict[str, Any]],
) -> Optional[dict[str, Any]]:
    local_record = None
    if detected_type == "inchikey" and not INCHIKEY_RE.fullmatch(stripped.upper()):
        findings.append(
            {
                "code": "E-INVALID-INCHIKEY",
                "severity": "error",
                "message": "InChIKey 必须符合 14-10-1 大写字母格式。",
            }
        )
    elif detected_type == "chembl_id" and not CHEMBL_RE.fullmatch(stripped):
        findings.append(
            {
                "code": "E-INVALID-CHEMBL-ID",
                "severity": "error",
                "message": "ChEMBL ID 必须符合 CHEMBL 加数字的格式。",
            }
        )
    elif detected_type == "pubchem_cid" and (
        not stripped.isdigit() or int(stripped) <= 0
    ):
        findings.append(
            {
                "code": "E-INVALID-PUBCHEM-CID",
                "severity": "error",
                "message": "PubChem CID 必须是正整数。",
            }
        )
    elif detected_type == "cas_rn" and not valid_cas_check_digit(stripped):
        findings.append(
            {
                "code": "E-INVALID-CAS-CHECK-DIGIT",
                "severity": "error",
                "message": (
                    "CAS RN 格式或校验位无效；本检查只验证字符和校验位，"
                    "不证明该编号由 CAS 正式登记。"
                ),
            }
        )
    elif detected_type in {"smiles", "inchi"}:
        local_record, local_findings = local_source_record(
            request_id,
            stripped,
            detected_type,
            toolkit,
        )
        findings.extend(local_findings)
    elif detected_type == "name" and len(stripped) > 500:
        findings.append(
            {
                "code": "E-NAME-TOO-LONG",
                "severity": "error",
                "message": "化学名称超过 500 个字符；请检查输入。",
            }
        )
    return local_record


def validate_request(
    item: dict[str, Any],
    toolkit: dict[str, Any],
) -> dict[str, Any]:
    request_id = str(item.get("id") or "query-1").strip() or "query-1"
    raw_query = item.get("query")
    query = raw_query if isinstance(raw_query, str) else ""
    requested_type = normalize_input_type(str(item.get("input_type") or "auto"))
    context = item.get("context")
    expected_form = item.get("expected_form")
    findings: list[dict[str, Any]] = []
    if not query.strip():
        findings.append(
            {
                "code": "E-EMPTY-QUERY",
                "severity": "error",
                "message": "query 不能为空。",
            }
        )
        return _empty_query_result(
            request_id,
            query,
            requested_type,
            context,
            expected_form,
            findings,
        )

    stripped = query.strip()
    if len(stripped) > 1000:
        findings.append(
            {
                "code": "E-QUERY-TOO-LONG",
                "severity": "error",
                "message": "单条 query 超过 1000 个字符；请确认没有误传整段文档。",
            }
        )
        detected_type = "unknown"
    elif requested_type == "auto":
        detected_type, detected_findings = detect_input_type(stripped, toolkit)
        findings.extend(detected_findings)
    else:
        detected_type = requested_type

    local_record = _validate_typed_query(
        detected_type,
        request_id,
        stripped,
        toolkit,
        findings,
    )
    invalid = any(finding["severity"] == "error" for finding in findings)
    return {
        "id": request_id,
        "query": query,
        "normalized_query": (
            stripped.upper() if detected_type in {"inchikey", "chembl_id"} else stripped
        ),
        "requested_input_type": requested_type,
        "detected_input_type": detected_type,
        "context": context,
        "expected_form": expected_form,
        "input_status": "invalid_input" if invalid else "valid",
        "findings": findings,
        "local_record": local_record,
    }
