#!/usr/bin/env python3
"""对已标准化结构计算受控二维描述符、指纹和数据集质量画像。"""

from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.metadata
import importlib.util
import json
import math
import platform
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Optional, Sequence


SCHEMA_VERSION = "1.0.0"
WORKFLOW = "molecular-feature-computation"
CALCULATOR_VERSION = "1.0.0"
DESCRIPTOR_SET_ID = "rdkit-2d-core-v1"
CALCULATION_VIEWS = {"standardized", "parent"}
CALCULATION_STATUSES = {"completed", "partial", "not_run", "error"}
DISPOSITIONS = {"ready_for_downstream", "review_required", "rejected"}
UPSTREAM_DISPOSITIONS = {"ready_for_downstream", "review_required", "rejected"}
TEMPORAL_KEYS = {"generated_at_utc", "retrieved_at_utc", "requested_at_utc"}
SECRET_RE = re.compile(
    r"ark-[A-Za-z0-9_-]{12,}|"
    r"Bearer\s+[A-Za-z0-9._~+/=-]{12,}|"
    r"(?:Authorization|Cookie|Token|Api[_ -]?Key)\s*[:=]\s*\S{12,}",
    re.IGNORECASE,
)

DEFAULT_OPTIONS = {
    "morgan_radius": 2,
    "morgan_fp_size": 2048,
    "morgan_include_chirality": True,
    "morgan_use_bond_types": True,
    "morgan_count_simulation": False,
    "morgan_include_redundant_environments": False,
    "rdkit_min_path": 1,
    "rdkit_max_path": 7,
    "rdkit_fp_size": 2048,
    "rdkit_use_hs": True,
    "rdkit_branched_paths": True,
    "rdkit_use_bond_order": True,
    "rdkit_count_simulation": False,
    "rdkit_num_bits_per_feature": 2,
    "near_constant_dominance_threshold": 0.95,
    "near_constant_min_non_missing": 20,
    "outlier_iqr_multiplier": 1.5,
    "outlier_min_non_missing": 4,
    "outlier_record_id_limit": 100,
}


def load_standardization_contract() -> Any:
    path = Path(__file__).with_name("standardization_contract.py")
    spec = importlib.util.spec_from_file_location(
        "_feature_standardization_contract",
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载 standardization contract：{path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


STANDARDIZATION_CONTRACT = load_standardization_contract()


class DependencyFailure(RuntimeError):
    """固定版本化学工具不可加载。"""


class InputFailure(ValueError):
    """输入文件或输入契约无法安全处理。"""


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def sha256_json(value: Any) -> str:
    return sha256_text(canonical_json(value))


def _without_temporal_fields(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: _without_temporal_fields(item)
            for key, item in value.items()
            if key not in TEMPORAL_KEYS and key != "result_fingerprint"
        }
    if isinstance(value, list):
        return [_without_temporal_fields(item) for item in value]
    return value


def output_fingerprint(document: dict[str, Any]) -> str:
    return sha256_json(_without_temporal_fields(document))


def load_toolkit() -> dict[str, Any]:
    try:
        import rdkit
        from rdkit import Chem, rdBase
        from rdkit.Chem import Descriptors, MACCSkeys, rdFingerprintGenerator
        from rdkit.Chem import rdMolDescriptors
    except ImportError as error:
        raise DependencyFailure(
            "需要 rdkit==2025.9.2；请在隔离环境安装 scripts/requirements.txt。"
        ) from error

    if rdkit.__version__ not in {"2025.9.2", "2025.09.2"}:
        raise DependencyFailure(
            f"需要 rdkit==2025.9.2，当前版本为 {rdkit.__version__}。"
        )
    return {
        "rdkit": rdkit,
        "Chem": Chem,
        "rdBase": rdBase,
        "Descriptors": Descriptors,
        "MACCSkeys": MACCSkeys,
        "rdFingerprintGenerator": rdFingerprintGenerator,
        "rdMolDescriptors": rdMolDescriptors,
    }


def dependency_metadata() -> dict[str, Any]:
    try:
        metadata = importlib.metadata.metadata("rdkit")
        return {
            "package": "rdkit",
            "version": importlib.metadata.version("rdkit"),
            "license": metadata.get("License") or "BSD-3-Clause",
        }
    except importlib.metadata.PackageNotFoundError:
        return {"package": "rdkit", "version": None, "license": None}


def tool_versions(toolkit: dict[str, Any]) -> dict[str, Any]:
    rdmd = toolkit["rdMolDescriptors"]
    return {
        "python": platform.python_version(),
        "rdkit": toolkit["rdkit"].__version__,
        "feature_calculator": CALCULATOR_VERSION,
        "descriptor_implementations": {
            "exact_molecular_weight": getattr(
                rdmd, "_CalcExactMolWt_version", "not_exposed"
            ),
            "tpsa": getattr(rdmd, "_CalcTPSA_version", "not_exposed"),
            "crippen": getattr(rdmd, "_CalcCrippenDescriptors_version", "not_exposed"),
            "rotatable_bonds": getattr(
                rdmd, "_CalcNumRotatableBonds_version", "not_exposed"
            ),
        },
    }


def descriptor_set() -> dict[str, Any]:
    return {
        "id": DESCRIPTOR_SET_ID,
        "dimensionality": "2D",
        "requires_3d_conformer": False,
        "engine": "RDKit",
        "features": [
            {
                "name": "MolecularFormula",
                "value_type": "string",
                "unit": None,
                "feature_class": "structure_deterministic_calculation",
                "implementation": "rdMolDescriptors.CalcMolFormula",
                "parameters": {
                    "separateIsotopes": True,
                    "abbreviateHIsotopes": False,
                },
                "meaning": "给定结构的分子式；同位素被显式区分。",
            },
            {
                "name": "MolecularWeight",
                "value_type": "float",
                "unit": "Da",
                "feature_class": "structure_deterministic_calculation",
                "implementation": "Descriptors.MolWt",
                "parameters": {},
                "meaning": "按 RDKit 原子量表计算的平均分子量，不是实验测量值。",
            },
            {
                "name": "ExactMolWt",
                "value_type": "float",
                "unit": "Da",
                "feature_class": "structure_deterministic_calculation",
                "implementation": "rdMolDescriptors.CalcExactMolWt",
                "parameters": {"onlyHeavy": False},
                "meaning": "按给定同位素组成计算的单同位素精确质量。",
            },
            {
                "name": "HeavyAtomCount",
                "value_type": "integer",
                "unit": None,
                "feature_class": "structure_deterministic_calculation",
                "implementation": "rdMolDescriptors.CalcNumHeavyAtoms",
                "parameters": {},
                "meaning": "非氢原子数量。",
            },
            {
                "name": "NumHDonors",
                "value_type": "integer",
                "unit": None,
                "feature_class": "structure_based_empirical_descriptor",
                "implementation": "rdMolDescriptors.CalcNumHBD",
                "parameters": {},
                "meaning": "按 RDKit 规则识别的氢键供体数量。",
            },
            {
                "name": "NumHAcceptors",
                "value_type": "integer",
                "unit": None,
                "feature_class": "structure_based_empirical_descriptor",
                "implementation": "rdMolDescriptors.CalcNumHBA",
                "parameters": {},
                "meaning": "按 RDKit 规则识别的氢键受体数量。",
            },
            {
                "name": "NumRotatableBonds",
                "value_type": "integer",
                "unit": None,
                "feature_class": "structure_based_empirical_descriptor",
                "implementation": "rdMolDescriptors.CalcNumRotatableBonds",
                "parameters": {"strict": "Strict"},
                "meaning": "按 RDKit Strict 定义计算的可旋转键数量。",
            },
            {
                "name": "RingCount",
                "value_type": "integer",
                "unit": None,
                "feature_class": "structure_deterministic_calculation",
                "implementation": "rdMolDescriptors.CalcNumRings",
                "parameters": {},
                "meaning": "RDKit 环信息中的环数量。",
            },
            {
                "name": "NumAromaticRings",
                "value_type": "integer",
                "unit": None,
                "feature_class": "structure_based_empirical_descriptor",
                "implementation": "rdMolDescriptors.CalcNumAromaticRings",
                "parameters": {"aromaticity_model": "RDKit"},
                "meaning": "按 RDKit 芳香性模型识别的芳香环数量。",
            },
            {
                "name": "FractionCSP3",
                "value_type": "float",
                "unit": None,
                "feature_class": "structure_deterministic_calculation",
                "implementation": "rdMolDescriptors.CalcFractionCSP3",
                "parameters": {},
                "meaning": "sp3 杂化碳占全部碳原子的比例。",
            },
            {
                "name": "TPSA",
                "value_type": "float",
                "unit": "angstrom^2",
                "feature_class": "structure_based_empirical_descriptor",
                "implementation": "rdMolDescriptors.CalcTPSA",
                "parameters": {"force": False, "includeSandP": False},
                "meaning": "基于片段规则的拓扑极性表面积，不是实验表面积。",
            },
            {
                "name": "MolLogP",
                "value_type": "float",
                "unit": None,
                "feature_class": "structure_based_empirical_descriptor",
                "implementation": "rdMolDescriptors.CalcCrippenDescriptors",
                "parameters": {"includeHs": True, "force": False, "tuple_index": 0},
                "meaning": "Wildman-Crippen 原子片段法计算的结构经验 LogP。",
            },
            {
                "name": "FormalCharge",
                "value_type": "integer",
                "unit": "elementary_charge",
                "feature_class": "structure_deterministic_calculation",
                "implementation": "Chem.GetFormalCharge",
                "parameters": {},
                "meaning": "给定结构中所有原子的形式电荷总和。",
            },
            {
                "name": "NumHeteroatoms",
                "value_type": "integer",
                "unit": None,
                "feature_class": "structure_deterministic_calculation",
                "implementation": "rdMolDescriptors.CalcNumHeteroatoms",
                "parameters": {},
                "meaning": "RDKit 定义下的杂原子数量。",
            },
        ],
    }


def fingerprint_profiles(options: dict[str, Any]) -> dict[str, Any]:
    profiles = {
        "morgan": {
            "profile_id": (
                f"rdkit-morgan-r{options['morgan_radius']}-"
                f"{options['morgan_fp_size']}-"
                f"chiral{int(options['morgan_include_chirality'])}-bit-v1"
            ),
            "algorithm": "RDKit MorganGenerator",
            "method_family": "Morgan circular fingerprint; ECFP-like",
            "representation": "bit_vector_on_bits",
            "parameters": {
                "radius": options["morgan_radius"],
                "fpSize": options["morgan_fp_size"],
                "includeChirality": options["morgan_include_chirality"],
                "useBondTypes": options["morgan_use_bond_types"],
                "countSimulation": options["morgan_count_simulation"],
                "onlyNonzeroInvariants": False,
                "includeRingMembership": True,
                "includeRedundantEnvironments": options[
                    "morgan_include_redundant_environments"
                ],
                "bitsPerFeature": 1,
            },
            "known_limitations": [
                "哈希折叠会产生碰撞；该实现和参数必须与下游保持一致。",
                "指纹相似不表示功能、活性、机制、毒性或可合成性相同。",
            ],
        },
        "rdkit_topological": {
            "profile_id": (
                f"rdkit-topological-{options['rdkit_fp_size']}-"
                f"path{options['rdkit_min_path']}-{options['rdkit_max_path']}-v1"
            ),
            "algorithm": "RDKitFPGenerator",
            "method_family": "topological path and branched-subgraph fingerprint",
            "representation": "bit_vector_on_bits",
            "parameters": {
                "minPath": options["rdkit_min_path"],
                "maxPath": options["rdkit_max_path"],
                "useHs": options["rdkit_use_hs"],
                "branchedPaths": options["rdkit_branched_paths"],
                "useBondOrder": options["rdkit_use_bond_order"],
                "countSimulation": options["rdkit_count_simulation"],
                "fpSize": options["rdkit_fp_size"],
                "numBitsPerFeature": options["rdkit_num_bits_per_feature"],
            },
            "known_limitations": [
                "结果依赖路径、芳香性、键级、位数和每特征置位数。",
                "指纹相似不表示功能、活性、机制、毒性或可合成性相同。",
            ],
        },
        "maccs": {
            "profile_id": "rdkit-public-maccs-166-keys-v1",
            "algorithm": "rdMolDescriptors.GetMACCSKeysFingerprint",
            "method_family": "public MACCS structural keys",
            "representation": "bit_vector_on_bits",
            "parameters": {
                "fpSize": 167,
                "keyIndexRange": [1, 166],
                "bit0Unused": True,
                "aromaticity_model": "RDKit",
            },
            "known_limitations": [
                "公开 MACCS 定义并不完整，RDKit 文档明确记录跨实现差异。",
                "Key 1 未定义，Key 125 和 166 使用专门逻辑。",
                "该输出不得声称与商业 MDL MACCS 实现逐位等价。",
            ],
        },
    }
    for profile in profiles.values():
        profile["profile_fingerprint"] = sha256_json(profile)
    return profiles


def finding(
    code: str,
    severity: str,
    message: str,
    source: str,
    **details: Any,
) -> dict[str, Any]:
    result = {
        "code": code,
        "severity": severity,
        "message": message,
        "source": source,
    }
    if details:
        result["details"] = details
    return result


def detect_input_format(path: Path, text: str) -> str:
    if path.suffix.lower() == ".json":
        return "json"
    if path.suffix.lower() == ".csv":
        return "csv"
    stripped = text.lstrip()
    if stripped.startswith("{"):
        return "json"
    return "csv"


def parse_list_field(value: Any) -> list[Any]:
    if value is None or value == "":
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return []
        if stripped.startswith("["):
            try:
                parsed = json.loads(stripped)
            except json.JSONDecodeError:
                parsed = None
            if isinstance(parsed, list):
                return parsed
        return [item.strip() for item in stripped.split(";") if item.strip()]
    return [value]


def normalize_input_record(
    raw: dict[str, Any],
    index: int,
    source: str,
    upstream: dict[str, Any],
) -> dict[str, Any]:
    record_id = str(raw.get("id") or f"record-{index + 1:04d}")
    original = raw.get("original_structure")
    standardized = raw.get("standardized_structure")
    parent = raw.get("parent_structure")
    provenance = STANDARDIZATION_CONTRACT.record_upstream_provenance(upstream)
    return {
        "id": record_id,
        "record_index": index,
        "source": raw.get("source") or source,
        "original_structure": original if isinstance(original, str) else "",
        "standardized_structure": (
            standardized if isinstance(standardized, str) else None
        ),
        "parent_structure": parent if isinstance(parent, str) else None,
        "inchikey": raw.get("inchikey") or None,
        "parent_inchikey": raw.get("parent_inchikey") or None,
        "parse_status": raw.get("parse_status") or None,
        "standardization_status": raw.get("standardization_status") or None,
        "disposition": raw.get("disposition") or None,
        "human_review_required": parse_list_field(raw.get("human_review_required")),
        "tool_versions": provenance["tool_versions"],
        "profile": provenance["profile"],
        "upstream_workflow": provenance["upstream_workflow"],
        "upstream_fingerprint": provenance["upstream_fingerprint"],
        "input_record_fingerprint": sha256_json(raw),
    }


def _load_json_input(
    text: str,
    source: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as error:
        raise InputFailure(f"JSON 无法解析：{error}") from error
    if not isinstance(payload, dict):
        raise InputFailure("JSON 顶层必须是 object。")
    raw_records = payload.get("records")
    if not isinstance(raw_records, list) or not all(
        isinstance(item, dict) for item in raw_records
    ):
        raise InputFailure("JSON 必须包含 records object 数组。")
    if STANDARDIZATION_CONTRACT.claims_standardization_artifact(payload):
        errors = STANDARDIZATION_CONTRACT.validate_standardization_artifact(payload)
        if errors:
            raise InputFailure(
                "standardization Artifact contract violation: " + "; ".join(errors)
            )
        upstream = STANDARDIZATION_CONTRACT.build_standardization_context(
            payload,
            source,
        )
    else:
        upstream = STANDARDIZATION_CONTRACT.build_direct_context(
            payload,
            source,
            "json",
        )
    return raw_records, upstream


def _load_csv_input(
    text: str,
    source: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    reader = csv.DictReader(text.splitlines())
    if not reader.fieldnames:
        raise InputFailure("CSV 缺少表头。")
    if "standardized_structure" not in reader.fieldnames:
        raise InputFailure("CSV 必须包含 standardized_structure 列。")
    return (
        list(reader),
        STANDARDIZATION_CONTRACT.build_direct_context(
            {},
            source,
            "csv",
        ),
    )


def load_input_records(
    path: Path, input_format: str
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as error:
        raise InputFailure(f"无法读取输入文件：{error}") from error
    if SECRET_RE.search(text):
        raise InputFailure("输入中检测到疑似凭证，已停止处理。")
    actual_format = (
        detect_input_format(path, text) if input_format == "auto" else input_format
    )
    source = path.name

    if actual_format == "json":
        raw_records, upstream = _load_json_input(text, source)
    elif actual_format == "csv":
        raw_records, upstream = _load_csv_input(text, source)
    else:
        raise InputFailure(f"不支持的输入格式：{actual_format}")

    if not raw_records:
        raise InputFailure("没有可处理的结构记录。")
    records = [
        normalize_input_record(raw, index, source, upstream)
        for index, raw in enumerate(raw_records)
    ]
    return records, upstream


def descriptor_calculators(
    toolkit: dict[str, Any],
) -> dict[str, Callable[[Any], Any]]:
    Chem = toolkit["Chem"]
    Descriptors = toolkit["Descriptors"]
    rdmd = toolkit["rdMolDescriptors"]
    return {
        "MolecularFormula": lambda mol: rdmd.CalcMolFormula(
            mol, separateIsotopes=True, abbreviateHIsotopes=False
        ),
        "MolecularWeight": lambda mol: Descriptors.MolWt(mol),
        "ExactMolWt": lambda mol: rdmd.CalcExactMolWt(mol, onlyHeavy=False),
        "HeavyAtomCount": lambda mol: rdmd.CalcNumHeavyAtoms(mol),
        "NumHDonors": lambda mol: rdmd.CalcNumHBD(mol),
        "NumHAcceptors": lambda mol: rdmd.CalcNumHBA(mol),
        "NumRotatableBonds": lambda mol: rdmd.CalcNumRotatableBonds(
            mol, rdmd.NumRotatableBondsOptions.Strict
        ),
        "RingCount": lambda mol: rdmd.CalcNumRings(mol),
        "NumAromaticRings": lambda mol: rdmd.CalcNumAromaticRings(mol),
        "FractionCSP3": lambda mol: rdmd.CalcFractionCSP3(mol),
        "TPSA": lambda mol: rdmd.CalcTPSA(mol, force=False, includeSandP=False),
        "MolLogP": lambda mol: rdmd.CalcCrippenDescriptors(
            mol, includeHs=True, force=False
        )[0],
        "FormalCharge": lambda mol: Chem.GetFormalCharge(mol),
        "NumHeteroatoms": lambda mol: rdmd.CalcNumHeteroatoms(mol),
    }


def normalize_descriptor_value(
    name: str, value: Any, expected_type: str
) -> tuple[Any, Optional[str]]:
    if expected_type == "string":
        if isinstance(value, str) and value:
            return value, None
        return None, "missing"
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None, "non_numeric"
    if not math.isfinite(float(value)):
        return None, "non_finite"
    if expected_type == "integer":
        numeric = float(value)
        if not numeric.is_integer():
            return None, "non_integral"
        return int(numeric), None
    return float(value), None


def calculate_descriptors(
    molecule: Any,
    toolkit: dict[str, Any],
    calculators: Optional[dict[str, Callable[[Any], Any]]] = None,
) -> tuple[dict[str, Any], list[str], list[dict[str, Any]]]:
    definitions = descriptor_set()["features"]
    functions = calculators or descriptor_calculators(toolkit)
    values: dict[str, Any] = {}
    missing: list[str] = []
    findings: list[dict[str, Any]] = []
    for definition in definitions:
        name = definition["name"]
        calculator = functions.get(name)
        if calculator is None:
            values[name] = None
            missing.append(f"descriptor:{name}")
            findings.append(
                finding(
                    "R-DESCRIPTOR-CALCULATOR-MISSING",
                    "review",
                    f"描述符 {name} 缺少固定计算器。",
                    "feature-calculator",
                    feature=name,
                )
            )
            continue
        try:
            raw_value = calculator(molecule)
        except Exception as error:
            values[name] = None
            missing.append(f"descriptor:{name}")
            findings.append(
                finding(
                    "R-DESCRIPTOR-CALCULATION-FAILED",
                    "review",
                    f"描述符 {name} 计算失败，未用默认值替代。",
                    "rdkit",
                    feature=name,
                    error_type=type(error).__name__,
                    error_message=str(error),
                )
            )
            continue
        value, problem = normalize_descriptor_value(
            name, raw_value, definition["value_type"]
        )
        values[name] = value
        if problem:
            missing.append(f"descriptor:{name}")
            findings.append(
                finding(
                    "R-DESCRIPTOR-NONFINITE"
                    if problem == "non_finite"
                    else "R-DESCRIPTOR-INVALID-VALUE",
                    "review",
                    f"描述符 {name} 返回 {problem}，已显式记录为 null。",
                    "rdkit",
                    feature=name,
                    problem=problem,
                )
            )
    return values, missing, findings


def default_fingerprint_calculators(
    toolkit: dict[str, Any], options: dict[str, Any]
) -> dict[str, Callable[[Any], Any]]:
    generator = toolkit["rdFingerprintGenerator"]
    morgan = generator.GetMorganGenerator(
        radius=options["morgan_radius"],
        countSimulation=options["morgan_count_simulation"],
        includeChirality=options["morgan_include_chirality"],
        useBondTypes=options["morgan_use_bond_types"],
        onlyNonzeroInvariants=False,
        includeRingMembership=True,
        fpSize=options["morgan_fp_size"],
        includeRedundantEnvironments=options["morgan_include_redundant_environments"],
    )
    rdkit_fp = generator.GetRDKitFPGenerator(
        minPath=options["rdkit_min_path"],
        maxPath=options["rdkit_max_path"],
        useHs=options["rdkit_use_hs"],
        branchedPaths=options["rdkit_branched_paths"],
        useBondOrder=options["rdkit_use_bond_order"],
        countSimulation=options["rdkit_count_simulation"],
        fpSize=options["rdkit_fp_size"],
        numBitsPerFeature=options["rdkit_num_bits_per_feature"],
    )
    return {
        "morgan": morgan.GetFingerprint,
        "rdkit_topological": rdkit_fp.GetFingerprint,
        "maccs": toolkit["MACCSkeys"].GenMACCSKeys,
    }


def bitvector_summary(bitvector: Any, profile: dict[str, Any]) -> dict[str, Any]:
    size = int(bitvector.GetNumBits())
    on_bits = [int(index) for index in bitvector.GetOnBits()]
    on_bit_set = set(on_bits)
    ascii_bits = "".join("1" if index in on_bit_set else "0" for index in range(size))
    return {
        "profile_id": profile["profile_id"],
        "representation": profile["representation"],
        "size": size,
        "on_bits": on_bits,
        "bit_count": len(on_bits),
        "density": len(on_bits) / size if size else None,
        "bitvector_sha256": sha256_text(ascii_bits),
        "hash_encoding": "ascii_bitstring_index_0_to_n_minus_1",
    }


def calculate_fingerprints(
    molecule: Any,
    toolkit: dict[str, Any],
    profiles: dict[str, Any],
    options: dict[str, Any],
    calculators: Optional[dict[str, Callable[[Any], Any]]] = None,
) -> tuple[dict[str, Any], list[str], list[dict[str, Any]]]:
    functions = calculators or default_fingerprint_calculators(toolkit, options)
    values: dict[str, Any] = {}
    missing: list[str] = []
    findings: list[dict[str, Any]] = []
    for name in ("morgan", "rdkit_topological", "maccs"):
        try:
            bitvector = functions[name](molecule)
            values[name] = bitvector_summary(bitvector, profiles[name])
        except Exception as error:
            values[name] = None
            missing.append(f"fingerprint:{name}")
            findings.append(
                finding(
                    "R-FINGERPRINT-CALCULATION-FAILED",
                    "review",
                    f"指纹 {name} 计算失败，未生成伪向量。",
                    "rdkit",
                    feature=name,
                    error_type=type(error).__name__,
                    error_message=str(error),
                )
            )
    return values, missing, findings


def parse_calculation_structure(
    structure: str, toolkit: dict[str, Any]
) -> tuple[Optional[Any], Optional[str]]:
    Chem = toolkit["Chem"]
    try:
        with toolkit["rdBase"].BlockLogs():
            molecule = Chem.MolFromSmiles(structure, sanitize=False)
            if molecule is None:
                return None, "RDKit 未生成分子对象"
            Chem.SanitizeMol(molecule)
        return molecule, None
    except Exception as error:
        return None, str(error)


def review_reason_labels(values: Sequence[Any]) -> list[str]:
    labels = []
    for value in values:
        if isinstance(value, str):
            labels.append(value)
        elif isinstance(value, dict):
            labels.append(str(value.get("code") or sha256_json(value)))
        else:
            labels.append(str(value))
    return labels


def empty_output_record(
    record: dict[str, Any], calculation_view: str
) -> dict[str, Any]:
    source_structure = (
        record["standardized_structure"]
        if calculation_view == "standardized"
        else record["parent_structure"]
    )
    return {
        "id": record["id"],
        "record_index": record["record_index"],
        "source": record["source"],
        "original_structure": record["original_structure"],
        "standardized_structure": record["standardized_structure"],
        "parent_structure": record["parent_structure"],
        "inchikey": record["inchikey"],
        "parent_inchikey": record["parent_inchikey"],
        "source_structure": source_structure,
        "calculation_view": calculation_view,
        "calculation_canonical_smiles": None,
        "calculation_status": "not_run",
        "descriptors": {},
        "fingerprints": {},
        "missing_features": [],
        "qc_findings": [],
        "upstream_parse_status": record["parse_status"],
        "upstream_standardization_status": record["standardization_status"],
        "upstream_disposition": record["disposition"],
        "upstream_human_review_required": record["human_review_required"],
        "upstream_workflow": record["upstream_workflow"],
        "upstream_fingerprint": record["upstream_fingerprint"],
        "upstream_tool_versions": record["tool_versions"],
        "upstream_profile": record["profile"],
        "input_record_fingerprint": record["input_record_fingerprint"],
        "disposition": "review_required",
        "human_review_required": [],
    }


def process_record(
    record: dict[str, Any],
    calculation_view: str,
    toolkit: dict[str, Any],
    profiles: dict[str, Any],
    options: dict[str, Any],
    descriptor_functions: Optional[dict[str, Callable[[Any], Any]]] = None,
    fingerprint_functions: Optional[dict[str, Callable[[Any], Any]]] = None,
) -> dict[str, Any]:
    output = empty_output_record(record, calculation_view)
    upstream_review = review_reason_labels(record["human_review_required"])
    upstream_disposition = record["disposition"]
    upstream_blocks = (
        upstream_disposition == "rejected"
        or record["parse_status"] == "error"
        or record["standardization_status"] in {"error", "not_run"}
    )
    if upstream_blocks:
        output["disposition"] = "rejected"
        output["qc_findings"].append(
            finding(
                "E-UPSTREAM-REJECTED",
                "error",
                "上游记录不可进入特征计算；未生成任何伪特征。",
                "upstream",
                upstream_parse_status=record["parse_status"],
                upstream_standardization_status=record["standardization_status"],
                upstream_disposition=upstream_disposition,
            )
        )
        output["human_review_required"] = upstream_review
        return output

    if upstream_disposition not in UPSTREAM_DISPOSITIONS and upstream_disposition:
        output["qc_findings"].append(
            finding(
                "R-UPSTREAM-DISPOSITION-UNKNOWN",
                "review",
                "上游 disposition 不在已知枚举中，结果不得自动放行。",
                "upstream",
                upstream_disposition=upstream_disposition,
            )
        )
    if upstream_disposition == "review_required" or upstream_review:
        output["qc_findings"].append(
            finding(
                "R-UPSTREAM-REVIEW-REQUIRED",
                "review",
                "允许生成审计特征，但上游人工复核状态继续向下游传播。",
                "upstream",
                reasons=upstream_review,
            )
        )
    if calculation_view == "parent":
        output["qc_findings"].append(
            finding(
                "N-PARENT-CALCULATION-VIEW",
                "notice",
                "当前特征基于派生 parent；不得解释为真实盐型或物理样品。",
                "feature-calculator",
            )
        )

    structure = output["source_structure"]
    if not isinstance(structure, str) or not structure.strip():
        missing_code = (
            "E-STANDARDIZED-STRUCTURE-MISSING"
            if calculation_view == "standardized"
            else "R-CALCULATION-VIEW-MISSING"
        )
        missing_severity = "error" if calculation_view == "standardized" else "review"
        output["qc_findings"].append(
            finding(
                missing_code,
                missing_severity,
                f"{calculation_view} 视图没有可计算结构。",
                "input",
            )
        )
        output["missing_features"] = [
            f"descriptor:{item['name']}" for item in descriptor_set()["features"]
        ] + [f"fingerprint:{name}" for name in profiles]
        if calculation_view == "standardized":
            output["disposition"] = "rejected"
        output["human_review_required"] = sorted(
            set(
                upstream_review
                + (
                    ["R-CALCULATION-VIEW-MISSING"]
                    if missing_severity == "review"
                    else []
                )
            )
        )
        return output

    molecule, parse_error = parse_calculation_structure(structure, toolkit)
    if molecule is None:
        output["calculation_status"] = "error"
        output["disposition"] = "rejected"
        output["qc_findings"].append(
            finding(
                "E-CALCULATION-STRUCTURE-INVALID",
                "error",
                "选定计算视图无法由 RDKit 解析；未自动修复结构。",
                "rdkit",
                error=parse_error,
            )
        )
        output["human_review_required"] = upstream_review
        return output

    output["calculation_canonical_smiles"] = toolkit["Chem"].MolToSmiles(
        molecule, canonical=True, isomericSmiles=True
    )
    descriptors, missing_descriptors, descriptor_findings = calculate_descriptors(
        molecule, toolkit, descriptor_functions
    )
    fingerprints, missing_fingerprints, fingerprint_findings = calculate_fingerprints(
        molecule,
        toolkit,
        profiles,
        options,
        fingerprint_functions,
    )
    output["descriptors"] = descriptors
    output["fingerprints"] = fingerprints
    output["missing_features"] = missing_descriptors + missing_fingerprints
    output["qc_findings"].extend(descriptor_findings)
    output["qc_findings"].extend(fingerprint_findings)
    output["calculation_status"] = (
        "partial" if output["missing_features"] else "completed"
    )

    review_codes = [
        item["code"] for item in output["qc_findings"] if item["severity"] == "review"
    ]
    if output["calculation_status"] == "partial" or review_codes:
        output["disposition"] = "review_required"
    else:
        output["disposition"] = "ready_for_downstream"
    output["human_review_required"] = sorted(set(upstream_review + review_codes))
    return output


def quantile(values: Sequence[float], probability: float) -> Optional[float]:
    if not values:
        return None
    ordered = sorted(float(value) for value in values)
    if len(ordered) == 1:
        return ordered[0]
    position = (len(ordered) - 1) * probability
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    fraction = position - lower
    return ordered[lower] + fraction * (ordered[upper] - ordered[lower])


def descriptor_statistics(
    records: Sequence[dict[str, Any]],
    feature: dict[str, Any],
    options: dict[str, Any],
) -> dict[str, Any]:
    name = feature["name"]
    numeric = feature["value_type"] in {"integer", "float"}
    pairs = [
        (record["id"], record["record_index"], record["descriptors"].get(name))
        for record in records
        if record["calculation_status"] in {"completed", "partial"}
    ]
    non_missing = [
        (record_id, record_index, float(value))
        for record_id, record_index, value in pairs
        if isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(float(value))
    ]
    non_finite_count = sum(
        1
        for record in records
        for item in record["qc_findings"]
        if item["code"] == "R-DESCRIPTOR-NONFINITE"
        and (item.get("details") or {}).get("feature") == name
    )
    missing_count = (
        len(records) - len(non_missing)
        if numeric
        else sum(1 for _, _, value in pairs if value in {None, ""})
        + sum(
            record["calculation_status"] not in {"completed", "partial"}
            for record in records
        )
    )
    result = {
        "value_type": feature["value_type"],
        "unit": feature["unit"],
        "feature_class": feature["feature_class"],
        "total_records": len(records),
        "non_missing_count": (
            len(non_missing) if numeric else len(records) - missing_count
        ),
        "missing_count": missing_count,
        "missing_rate": missing_count / len(records) if records else None,
        "non_finite_count": non_finite_count,
        "unique_count": None,
        "constant": False,
        "near_constant": False,
        "dominant_value_fraction": None,
        "range": None,
        "quantiles": None,
        "outliers": {
            "rule": "1.5_iqr",
            "assessed": False,
            "count": 0,
            "record_ids": [],
            "record_indices": [],
            "record_ids_truncated": False,
        },
    }
    if not numeric:
        values = [
            record["descriptors"].get(name)
            for record in records
            if record["calculation_status"] in {"completed", "partial"}
            and record["descriptors"].get(name) not in {None, ""}
        ]
        result["unique_count"] = len(set(values))
        result["constant"] = len(values) >= 2 and len(set(values)) == 1
        return result

    values = [item[2] for item in non_missing]
    counts = Counter(values)
    result["unique_count"] = len(counts)
    if values:
        dominant_fraction = max(counts.values()) / len(values)
        result["dominant_value_fraction"] = dominant_fraction
        result["constant"] = len(values) >= 2 and len(counts) == 1
        result["near_constant"] = (
            not result["constant"]
            and len(values) >= options["near_constant_min_non_missing"]
            and dominant_fraction >= options["near_constant_dominance_threshold"]
        )
        q1 = quantile(values, 0.25)
        median = quantile(values, 0.5)
        q3 = quantile(values, 0.75)
        result["range"] = {"min": min(values), "max": max(values)}
        result["quantiles"] = {
            "method": "linear_type7",
            "q0_25": q1,
            "q0_50": median,
            "q0_75": q3,
        }
        if len(values) >= options["outlier_min_non_missing"]:
            assert q1 is not None and q3 is not None
            iqr = q3 - q1
            lower = q1 - options["outlier_iqr_multiplier"] * iqr
            upper = q3 + options["outlier_iqr_multiplier"] * iqr
            outliers = [
                (record_id, record_index)
                for record_id, record_index, value in non_missing
                if value < lower or value > upper
            ]
            limit = options["outlier_record_id_limit"]
            result["outliers"] = {
                "rule": "1.5_iqr",
                "assessed": True,
                "lower_fence": lower,
                "upper_fence": upper,
                "count": len(outliers),
                "record_ids": [item[0] for item in outliers[:limit]],
                "record_indices": [item[1] for item in outliers[:limit]],
                "record_ids_truncated": len(outliers) > limit,
            }
    return result


def duplicate_structure_profile(
    records: Sequence[dict[str, Any]],
) -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        key = record.get("calculation_canonical_smiles")
        if key and record["calculation_status"] in {"completed", "partial"}:
            groups[key].append(record)
    duplicates = []
    for structure in sorted(groups):
        members = groups[structure]
        if len(members) < 2:
            continue
        duplicates.append(
            {
                "calculation_canonical_smiles": structure,
                "structure_sha256": sha256_text(structure),
                "record_ids": [item["id"] for item in members],
                "record_indices": [item["record_index"] for item in members],
                "relationship": "same_calculation_view_structure",
            }
        )
    return {
        "group_count": len(duplicates),
        "records_in_duplicate_groups": sum(
            len(group["record_indices"]) for group in duplicates
        ),
        "groups": duplicates,
    }


def fingerprint_density_statistics(
    records: Sequence[dict[str, Any]], profiles: dict[str, Any]
) -> dict[str, Any]:
    output = {}
    for name, profile in profiles.items():
        values = [
            record["fingerprints"][name]["density"]
            for record in records
            if isinstance(record["fingerprints"].get(name), dict)
            and isinstance(record["fingerprints"][name].get("density"), (int, float))
        ]
        output[name] = {
            "profile_id": profile["profile_id"],
            "non_missing_count": len(values),
            "missing_count": len(records) - len(values),
            "missing_rate": (
                (len(records) - len(values)) / len(records) if records else None
            ),
            "range": ({"min": min(values), "max": max(values)} if values else None),
            "quantiles": (
                {
                    "method": "linear_type7",
                    "q0_25": quantile(values, 0.25),
                    "q0_50": quantile(values, 0.5),
                    "q0_75": quantile(values, 0.75),
                }
                if values
                else None
            ),
        }
    return output


def build_dataset_profile(
    records: Sequence[dict[str, Any]],
    upstream: dict[str, Any],
    profiles: dict[str, Any],
    options: dict[str, Any],
) -> dict[str, Any]:
    definitions = descriptor_set()["features"]
    definition_by_name = {item["name"]: item for item in definitions}
    descriptor_profiles = {
        feature["name"]: descriptor_statistics(records, feature, options)
        for feature in definitions
    }
    status_counts = {
        status: sum(record["calculation_status"] == status for record in records)
        for status in sorted(CALCULATION_STATUSES)
    }
    disposition_counts = {
        status: sum(record["disposition"] == status for record in records)
        for status in sorted(DISPOSITIONS)
    }
    upstream_groups = upstream.get("duplicate_groups")
    upstream_group_list = upstream_groups if isinstance(upstream_groups, list) else []
    basis_counts = Counter(
        group.get("basis")
        for group in upstream_group_list
        if isinstance(group, dict) and group.get("basis")
    )
    return {
        "total_records": len(records),
        "calculation_status_counts": status_counts,
        "disposition_counts": disposition_counts,
        "descriptor_statistics": descriptor_profiles,
        "constant_features": sorted(
            name
            for name, stats in descriptor_profiles.items()
            if stats["constant"]
            and definition_by_name[name]["value_type"] in {"integer", "float"}
        ),
        "near_constant_features": sorted(
            name
            for name, stats in descriptor_profiles.items()
            if stats["near_constant"]
        ),
        "duplicate_structures": duplicate_structure_profile(records),
        "upstream_duplicate_groups_reference": {
            "available": bool(upstream_group_list),
            "group_count": len(upstream_group_list),
            "basis_counts": dict(sorted(basis_counts.items())),
            "upstream_result_fingerprint": upstream.get("result_fingerprint"),
        },
        "fingerprint_density_statistics": fingerprint_density_statistics(
            records, profiles
        ),
        "human_review_count": disposition_counts["review_required"],
        "statistical_qc_parameters": {
            "quantile_method": "linear_type7",
            "near_constant_dominance_threshold": options[
                "near_constant_dominance_threshold"
            ],
            "near_constant_min_non_missing": options["near_constant_min_non_missing"],
            "outlier_rule": "1.5_iqr",
            "outlier_iqr_multiplier": options["outlier_iqr_multiplier"],
            "outlier_min_non_missing": options["outlier_min_non_missing"],
        },
        "interpretation": (
            "本画像只描述当前输入的缺失、分布、重复和统计异常；"
            "未评估任何具体模型、端点、数据划分或外部有效性。"
        ),
    }


def summarize_input(
    records: Sequence[dict[str, Any]],
    processed: Sequence[dict[str, Any]],
) -> dict[str, Any]:
    upstream_counts = {
        status: sum(record["disposition"] == status for record in records)
        for status in sorted(UPSTREAM_DISPOSITIONS)
    }
    upstream_counts["not_provided_or_unknown"] = len(records) - sum(
        upstream_counts.values()
    )
    return {
        "total_records": len(records),
        "upstream_disposition_counts": upstream_counts,
        "calculation_status_counts": {
            status: sum(record["calculation_status"] == status for record in processed)
            for status in sorted(CALCULATION_STATUSES)
        },
        "output_disposition_counts": {
            status: sum(record["disposition"] == status for record in processed)
            for status in sorted(DISPOSITIONS)
        },
    }


def process_records(
    input_records: Sequence[dict[str, Any]],
    *,
    calculation_view: str = "standardized",
    upstream: Optional[dict[str, Any]] = None,
    generated_at_utc: Optional[str] = None,
    options_override: Optional[dict[str, Any]] = None,
    descriptor_functions: Optional[dict[str, Callable[[Any], Any]]] = None,
    fingerprint_functions: Optional[dict[str, Callable[[Any], Any]]] = None,
) -> dict[str, Any]:
    if calculation_view not in CALCULATION_VIEWS:
        raise InputFailure(f"不支持的 calculation_view：{calculation_view}")
    if not input_records:
        raise InputFailure("没有可处理的结构记录。")
    options = dict(DEFAULT_OPTIONS)
    if options_override:
        options.update(options_override)
    if options["morgan_radius"] < 0:
        raise InputFailure("Morgan radius 必须大于等于 0。")
    if options["morgan_fp_size"] <= 0 or options["rdkit_fp_size"] <= 0:
        raise InputFailure("指纹 fpSize 必须大于 0。")
    toolkit = load_toolkit()
    profiles = fingerprint_profiles(options)
    processed = [
        process_record(
            dict(record),
            calculation_view,
            toolkit,
            profiles,
            options,
            descriptor_functions,
            fingerprint_functions,
        )
        for record in input_records
    ]
    upstream_data = dict(upstream or {})

    errors = []
    warnings = []
    human_review = []
    for record in processed:
        for item in record["qc_findings"]:
            aggregate = {
                "record_id": record["id"],
                "record_index": record["record_index"],
                **item,
            }
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
        "tool_versions": tool_versions(toolkit),
        "dependency_metadata": dependency_metadata(),
        "options": {
            "calculation_view": calculation_view,
            "allow_review_required_calculation": True,
            "reject_upstream_rejected": True,
            "auto_repair_structures": False,
            "requires_3d_conformer": False,
            **options,
        },
        "descriptor_set": descriptor_set(),
        "fingerprint_profiles": profiles,
        "input_summary": summarize_input(input_records, processed),
        "upstream": {
            "schema_version": upstream_data.get("schema_version"),
            "workflow": upstream_data.get("workflow"),
            "result_fingerprint": upstream_data.get("result_fingerprint"),
            "tool_versions": upstream_data.get("tool_versions"),
            "profile": upstream_data.get("profile"),
            "source": upstream_data.get("source"),
            "input_format": upstream_data.get("input_format"),
        },
        "records": processed,
        "dataset_profile": build_dataset_profile(
            processed, upstream_data, profiles, options
        ),
        "errors": errors,
        "warnings": warnings,
        "notices": [
            "所有结果均来自给定二维结构和固定软件规则，不是实验测量值。",
            "MolLogP、TPSA、HBD/HBA 等是基于结构的经验描述符，不是性质实验结果。",
            "指纹只编码选定算法和参数下的结构特征；相同或相近指纹不证明功能、活性或机制相同。",
            "parent 是派生计算视图，不代表真实盐型、制剂或物理样品。",
            "数据集画像只作描述性质量检查，未评估模型、端点、划分策略或外部有效性。",
        ],
        "human_review_required": human_review,
    }
    document["result_fingerprint"] = output_fingerprint(document)
    serialized = json.dumps(document, ensure_ascii=False)
    if SECRET_RE.search(serialized):
        raise RuntimeError("输出中检测到疑似凭证，已停止写出。")
    return document


def write_csv_matrix(document: dict[str, Any], path: Path) -> None:
    descriptor_names = [item["name"] for item in document["descriptor_set"]["features"]]
    fingerprint_names = list(document["fingerprint_profiles"])
    fieldnames = [
        "record_index",
        "id",
        "calculation_view",
        "source_structure",
        "calculation_status",
        "upstream_disposition",
        "disposition",
        "missing_features",
        *descriptor_names,
    ]
    for name in fingerprint_names:
        fieldnames.extend(
            [
                f"{name}_profile_id",
                f"{name}_on_bits",
                f"{name}_bit_count",
                f"{name}_density",
                f"{name}_bitvector_sha256",
            ]
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for record in document["records"]:
            row = {
                "record_index": record["record_index"],
                "id": record["id"],
                "calculation_view": record["calculation_view"],
                "source_structure": record["source_structure"],
                "calculation_status": record["calculation_status"],
                "upstream_disposition": record["upstream_disposition"],
                "disposition": record["disposition"],
                "missing_features": ";".join(record["missing_features"]),
            }
            row.update(record["descriptors"])
            for name in fingerprint_names:
                fingerprint = record["fingerprints"].get(name)
                if not isinstance(fingerprint, dict):
                    continue
                row.update(
                    {
                        f"{name}_profile_id": fingerprint["profile_id"],
                        f"{name}_on_bits": canonical_json(fingerprint["on_bits"]),
                        f"{name}_bit_count": fingerprint["bit_count"],
                        f"{name}_density": fingerprint["density"],
                        f"{name}_bitvector_sha256": fingerprint["bitvector_sha256"],
                    }
                )
            writer.writerow(row)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument(
        "--input-format", default="auto", choices=["auto", "json", "csv"]
    )
    parser.add_argument(
        "--calculation-view",
        default="standardized",
        choices=sorted(CALCULATION_VIEWS),
    )
    parser.add_argument("--morgan-radius", type=int, default=2)
    parser.add_argument("--morgan-fp-size", type=int, default=2048)
    parser.add_argument(
        "--no-morgan-chirality",
        action="store_true",
        help="关闭 Morgan 手性信息；该参数会改变 fingerprint profile。",
    )
    parser.add_argument("--rdkit-fp-size", type=int, default=2048)
    parser.add_argument("--generated-at", help="固定 UTC 时间，仅用于重复验收")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--csv-matrix", type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        records, upstream = load_input_records(args.input, args.input_format)
        document = process_records(
            records,
            calculation_view=args.calculation_view,
            upstream=upstream,
            generated_at_utc=args.generated_at,
            options_override={
                "morgan_radius": args.morgan_radius,
                "morgan_fp_size": args.morgan_fp_size,
                "morgan_include_chirality": not args.no_morgan_chirality,
                "rdkit_fp_size": args.rdkit_fp_size,
            },
        )
    except (
        DependencyFailure,
        InputFailure,
        OSError,
        ValueError,
        json.JSONDecodeError,
    ) as error:
        sys.stderr.write(f"error: {error}\n")
        return 3

    serialized = json.dumps(document, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(serialized, encoding="utf-8")
    else:
        sys.stdout.write(serialized)
    if args.csv_matrix:
        write_csv_matrix(document, args.csv_matrix)
    rejected = document["input_summary"]["output_disposition_counts"]["rejected"]
    return 2 if rejected else 0


if __name__ == "__main__":
    raise SystemExit(main())
