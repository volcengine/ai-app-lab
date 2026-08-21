#!/usr/bin/env python3
"""Non-destructive curation and quality review for structured reactions."""

from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.util
import importlib.metadata
import json
import re
import sys
from collections import defaultdict
from collections.abc import Sequence
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA_VERSION = "1.0.0"
WORKFLOW = "curate-reactions"
RULESET_VERSION = "1.1.0"
MAX_RECORDS = 5000
MAX_RECORD_BYTES = 2 * 1024 * 1024
MAX_INPUT_BYTES = 100 * 1024 * 1024

CURATION_STATUSES = {"completed", "partial", "not_run", "error"}
DISPOSITIONS = {"ready_for_search", "review_required", "rejected"}
INPUT_PROFILES = {
    "ord_dataset",
    "ord_reaction",
    "reaction_smiles",
    "tabular",
}
TEMPORAL_TOP_LEVEL_KEYS = {
    "generated_at_utc",
    "runtime_seconds",
    "result_fingerprint",
}
SECRET_RE = re.compile(
    r"ark-[A-Za-z0-9_-]{12,}|"
    r"Bearer\s+[A-Za-z0-9._~+/=-]{12,}|"
    r"(?:Authorization|Cookie|Token|Api[_ -]?Key)\s*[:=]\s*\S{12,}",
    re.IGNORECASE,
)

RULE_MESSAGES = {
    "E-INPUT-SCHEMA-001": "输入顶层字段或枚举不符合冻结合同。",
    "E-INPUT-HASH-001": "来源缺少有效 SHA-256。",
    "E-RECORD-ID-001": "record_id 缺失或批内重复。",
    "E-ORD-PARSE-001": "ORD 记录无法按固定 Schema 解析。",
    "E-ORD-VALIDATION-001": "ORD 官方校验返回阻断错误。",
    "E-REACTION-SIDES-001": "反应缺少可识别的输入或输出侧。",
    "E-REACTION-SMILES-001": "reaction SMILES 不是可解析的两段或三段形式。",
    "E-UPSTREAM-FINGERPRINT-001": "上游 artifact 指纹缺失或与内容不匹配。",
    "E-UPSTREAM-ARTIFACT-CONTRACT-001": (
        "上游 standardize Artifact 不符合冻结消费合同。"
    ),
    "E-UPSTREAM-RECORD-ID-001": (
        "上游 standardize 记录 ID 缺失或在本批 Artifact 中重复。"
    ),
    "E-UPSTREAM-BINDING-001": ("participant 显式 upstream_record_id 无法精确绑定。"),
    "E-UPSTREAM-STRUCTURE-MISMATCH-001": (
        "participant 原始结构与绑定的上游原始结构不等价。"
    ),
    "E-UPSTREAM-REJECTED-001": ("participant 绑定的上游标准化记录已 rejected。"),
    "E-RESOURCE-LIMIT-001": "输入超过首版资源上限。",
    "W-PARTICIPANT-STRUCTURE-001": "参与物结构不可解析或上游状态拒绝。",
    "W-PARTICIPANT-FORM-001": "报告形式、标准化形式或 parent 存在差异。",
    "W-ROLE-CONFLICT-001": "来源角色与可确定的参与性诊断冲突。",
    "W-ROLE-UNKNOWN-001": "参与物角色不能确定。",
    "W-YIELD-RANGE-001": "百分比产率超出 0 到 100。",
    "W-YIELD-FRACTION-001": "百分比产率疑似混用 0 到 1 小数。",
    "W-YIELD-CONFLICT-001": "同一产物存在冲突的产率记录。",
    "W-ANALYSIS-LINK-001": "产物测量没有关联分析记录。",
    "W-DUPLICATE-EXACT-001": "记录与其他记录在 exact_record 视图重复。",
    "W-DUPLICATE-TRANSFORMATION-001": "报告形式的反应转化重复。",
    "H-DUPLICATE-PARENT-001": "记录只在 parent 转化视图相同，禁止自动合并。",
    "W-BALANCE-ATOM-001": "显式反应结构的逐元素计数不平衡。",
    "W-BALANCE-CHARGE-001": "显式反应结构的形式电荷不平衡。",
    "H-BALANCE-INCOMPLETE-001": "守恒检查缺少计量数、共反应物或副产物前提。",
    "W-MAPPING-FAILED-001": "请求了原子映射，但首版核心未运行或 adapter 失败。",
    "H-MAPPING-LOW-CONFIDENCE-001": "原子映射置信度不足或位于适用域外。",
    "W-PROCESS-MISSING-001": "用途要求的条件、装置、观察或后处理字段缺失。",
    "W-ORD-UNCLASSIFIED-001": "ORD 返回未分类 warning，原文已保留。",
    "W-REACTION-NO-CHANGE-001": "输入和输出结构集合相同，需确认是否为有效反应记录。",
    "H-UPSTREAM-REVIEW-001": "参与物继承上游人工复核状态。",
}


class InputFailure(RuntimeError):
    """Raised for a top-level input failure."""


def load_local_module(filename: str, module_name: str) -> Any:
    spec = importlib.util.spec_from_file_location(
        module_name,
        Path(__file__).with_name(filename),
    )
    module = importlib.util.module_from_spec(spec)
    if spec.loader is None:
        raise RuntimeError(f"cannot load local module: {filename}")
    spec.loader.exec_module(module)
    return module


STANDARDIZATION_CONTRACT = load_local_module(
    "standardization_artifact_contract.py",
    "curate_standardization_artifact_contract",
)
PARTICIPANT_BINDING = load_local_module(
    "participant_binding.py",
    "curate_participant_binding",
)
REACTION_ASSESSMENT = load_local_module(
    "reaction_assessment.py",
    "curate_reaction_assessment",
)
UPSTREAM_FATAL_CODES = {
    "E-UPSTREAM-FINGERPRINT-001",
    "E-UPSTREAM-ARTIFACT-CONTRACT-001",
    "E-UPSTREAM-RECORD-ID-001",
}


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def stable_document_fingerprint(document: dict[str, Any]) -> str:
    payload = {
        key: value
        for key, value in document.items()
        if key not in TEMPORAL_TOP_LEVEL_KEYS
    }
    return sha256_json(payload)


def upstream_fingerprint(document: dict[str, Any]) -> str:
    return STANDARDIZATION_CONTRACT.standardization_artifact_fingerprint(document)


def finding(
    code: str,
    severity: str,
    field_path: str,
    *,
    detail: str | None = None,
    raw_message: str | None = None,
    evidence: Sequence[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    item: dict[str, Any] = {
        "code": code,
        "severity": severity,
        "field_path": field_path,
        "message": RULE_MESSAGES[code],
        "evidence": list(evidence or []),
    }
    if detail is not None:
        item["detail"] = detail
    if raw_message is not None:
        item["raw_message"] = raw_message
    return item


def load_toolkit() -> dict[str, Any]:
    try:
        import rdkit
        from rdkit import Chem
    except ImportError as exc:
        raise InputFailure(
            "缺少 rdkit==2025.9.2；请在隔离环境安装 scripts/requirements.txt"
        ) from exc
    rdkit_version = importlib.metadata.version("rdkit")
    if rdkit_version != "2025.9.2":
        raise InputFailure(f"rdkit 版本必须为 2025.9.2，当前为 {rdkit_version}")
    try:
        from google.protobuf.json_format import MessageToDict, ParseDict
        from ord_schema import message_helpers, validations
        from ord_schema.proto import dataset_pb2, reaction_pb2
    except ImportError as exc:
        raise InputFailure(
            "缺少 ord-schema==0.8.3；请在隔离环境安装 scripts/requirements.txt"
        ) from exc
    ord_version = importlib.metadata.version("ord-schema")
    if ord_version != "0.8.3":
        raise InputFailure(f"ord-schema 版本必须为 0.8.3，当前为 {ord_version}")
    return {
        "rdkit": rdkit,
        "Chem": Chem,
        "MessageToDict": MessageToDict,
        "ParseDict": ParseDict,
        "message_helpers": message_helpers,
        "validations": validations,
        "dataset_pb2": dataset_pb2,
        "reaction_pb2": reaction_pb2,
        "rdkit_version": rdkit_version,
        "ord_version": ord_version,
    }


def validate_sha256(value: Any) -> bool:
    return isinstance(value, str) and bool(re.fullmatch(r"[0-9a-fA-F]{64}", value))


def split_reaction_smiles(value: Any) -> tuple[list[str], list[str], list[str]]:
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


def canonicalize_smiles(value: str, toolkit: dict[str, Any]) -> tuple[str | None, Any]:
    Chem = toolkit["Chem"]
    with toolkit["rdkit"].rdBase.BlockLogs():
        mol = Chem.MolFromSmiles(value)
    if mol is None:
        return None, None
    return Chem.MolToSmiles(mol, canonical=True, isomericSmiles=True), mol


def classify_ord_warning(message: str) -> str:
    if "analysis_key" in message and "Product measurements" in message:
        return "W-ANALYSIS-LINK-001"
    if "outside the expected range (0-100)" in message:
        return "W-YIELD-RANGE-001"
    if "Percentage values are 0-100, not fractions" in message:
        return "W-YIELD-FRACTION-001"
    return "W-ORD-UNCLASSIFIED-001"


def parse_ord_record(
    raw: dict[str, Any], toolkit: dict[str, Any]
) -> tuple[dict[str, Any] | None, str | None, list[dict[str, Any]]]:
    findings: list[dict[str, Any]] = []
    reaction = toolkit["reaction_pb2"].Reaction()
    try:
        toolkit["ParseDict"](raw, reaction, ignore_unknown_fields=False)
    except Exception as exc:  # noqa: BLE001 - protobuf exposes mixed parse errors
        findings.append(
            finding(
                "E-ORD-PARSE-001",
                "error",
                "ord_record",
                detail=f"{type(exc).__name__}: {exc}",
            )
        )
        return None, None, findings
    output = toolkit["validations"].validate_message(reaction, raise_on_error=False)
    for message in output.errors:
        findings.append(
            finding(
                "E-ORD-VALIDATION-001",
                "error",
                "ord_record",
                raw_message=str(message),
            )
        )
    for message in output.warnings:
        findings.append(
            finding(
                classify_ord_warning(str(message)),
                "warning",
                "ord_record",
                raw_message=str(message),
            )
        )
    try:
        reaction_smiles = toolkit["message_helpers"].get_reaction_smiles(
            reaction, generate_if_missing=True
        )
    except Exception as exc:  # noqa: BLE001 - ORD helper may wrap RDKit errors
        reaction_smiles = None
        findings.append(
            finding(
                "E-REACTION-SMILES-001",
                "error",
                "ord_record.identifiers",
                detail=f"无法从 ORD 生成 reaction SMILES：{exc}",
            )
        )
    normalized = toolkit["MessageToDict"](
        reaction,
        preserving_proto_field_name=True,
        use_integers_for_enums=False,
    )
    return normalized, reaction_smiles, findings


def extract_ord_yields(ord_record: Any) -> list[dict[str, Any]]:
    if not isinstance(ord_record, dict):
        return []
    yields = []
    for outcome_index, outcome in enumerate(ord_record.get("outcomes") or []):
        if not isinstance(outcome, dict):
            continue
        for product_index, product in enumerate(outcome.get("products") or []):
            if not isinstance(product, dict):
                continue
            product_id = f"outcome-{outcome_index + 1}-product-{product_index + 1}"
            identifiers = product.get("identifiers")
            if isinstance(identifiers, list):
                for identifier in identifiers:
                    if (
                        isinstance(identifier, dict)
                        and identifier.get("type") == "SMILES"
                        and identifier.get("value")
                    ):
                        product_id = str(identifier["value"])
                        break
            for measurement in product.get("measurements") or []:
                if (
                    not isinstance(measurement, dict)
                    or measurement.get("type") != "YIELD"
                ):
                    continue
                percentage = measurement.get("percentage")
                value = (
                    percentage.get("value") if isinstance(percentage, dict) else None
                )
                yields.append(
                    {
                        "value": value,
                        "units": "PERCENT",
                        "type": "reported",
                        "product_id": product_id,
                        "analysis_key": measurement.get("analysis_key"),
                        # ORD's official validator already reports missing links.
                        "analysis_required": False,
                    }
                )
    return yields


def load_upstream_contract(
    artifacts: Any,
) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    index, metadata, issues = STANDARDIZATION_CONTRACT.build_upstream_contract(
        artifacts
    )
    errors = [
        finding(
            item["code"],
            "error",
            item["field_path"],
            detail=item["detail"],
        )
        for item in issues
    ]
    return index, metadata, errors


def source_participants(
    reaction_smiles: str,
) -> list[dict[str, Any]]:
    inputs, agents, outputs = split_reaction_smiles(reaction_smiles)
    participants = []
    for side, role, structures in (
        ("input", "reactant", inputs),
        ("input", "reagent", agents),
        ("output", "product", outputs),
    ):
        for index, structure in enumerate(structures):
            participants.append(
                {
                    "participant_id": f"{side}-{role}-{index + 1}",
                    "side": side,
                    "reported_role": role,
                    "original_structure": structure,
                }
            )
    return participants


def assess_participant(
    raw: dict[str, Any],
    upstream: dict[str, dict[str, Any]],
    toolkit: dict[str, Any],
    index: int,
) -> tuple[dict[str, Any], Any]:
    return PARTICIPANT_BINDING.assess_participant(
        raw,
        upstream,
        toolkit,
        index,
        finding,
    )


def assess_record(
    raw: dict[str, Any],
    upstream: dict[str, dict[str, Any]],
    toolkit: dict[str, Any],
) -> dict[str, Any]:
    return REACTION_ASSESSMENT.assess_record(
        raw,
        upstream,
        toolkit,
        finding,
        assess_participant,
        parse_ord_record,
        extract_ord_yields,
        canonicalize_smiles,
    )


def apply_duplicate_groups(
    records: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    groups_by_view: dict[str, defaultdict[str, list[dict[str, Any]]]] = {
        view: defaultdict(list)
        for view in (
            "exact_record",
            "reported_transformation",
            "parent_transformation_candidate",
        )
    }
    for record in records:
        for view, key in record["_duplicate_keys"].items():
            if key:
                groups_by_view[view][key].append(record)
    groups = []
    code_for_view = {
        "exact_record": "W-DUPLICATE-EXACT-001",
        "reported_transformation": "W-DUPLICATE-TRANSFORMATION-001",
        "parent_transformation_candidate": "H-DUPLICATE-PARENT-001",
    }
    for view in (
        "exact_record",
        "reported_transformation",
        "parent_transformation_candidate",
    ):
        for key in sorted(groups_by_view[view]):
            members = groups_by_view[view][key]
            if len(members) < 2:
                continue
            group_id = f"{view}:{hashlib.sha256(key.encode()).hexdigest()[:16]}"
            member_ids = [item["record_id"] for item in members]
            groups.append(
                {
                    "group_id": group_id,
                    "view": view,
                    "record_ids": member_ids,
                    "automatic_action": "none",
                }
            )
            code = code_for_view[view]
            severity = (
                "human_review"
                if view == "parent_transformation_candidate"
                else "warning"
            )
            for record in members:
                record["duplicate_memberships"].append(group_id)
                record["findings"].append(
                    finding(
                        code,
                        severity,
                        "duplicate_memberships",
                        detail=f"{view}: {member_ids}",
                    )
                )
                if record["disposition"] == "ready_for_search":
                    record["disposition"] = "review_required"
                    record["curation_status"] = "partial"
                if severity == "human_review":
                    record["human_review_required"] = sorted(
                        set(record["human_review_required"]) | {code}
                    )
    for record in records:
        record.pop("_duplicate_keys", None)
    return groups


def normalize_options(
    raw_options: Any,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    options = raw_options if isinstance(raw_options, dict) else {}
    normalized = {
        "participant_view": options.get("participant_view", "reported_form"),
        "atom_mapping": options.get("atom_mapping", "off"),
        "balance_check": options.get("balance_check", "diagnostic"),
        "duplicate_views": options.get(
            "duplicate_views",
            [
                "exact_record",
                "reported_transformation",
                "parent_transformation_candidate",
            ],
        ),
        "preserve_original": True,
        "network_access": False,
        "automatic_writeback": False,
    }
    allowed = (
        normalized["participant_view"] == "reported_form"
        and normalized["atom_mapping"] == "off"
        and normalized["balance_check"] == "diagnostic"
    )
    if allowed:
        return normalized, []
    normalized.update(
        {
            "participant_view": "reported_form",
            "atom_mapping": "off",
            "balance_check": "diagnostic",
        }
    )
    return normalized, [
        finding(
            "E-INPUT-SCHEMA-001",
            "error",
            "options",
            detail="首版只允许 reported_form / atom_mapping=off / diagnostic",
        )
    ]


def validate_request_envelope(
    request: dict[str, Any],
) -> tuple[Any, dict[str, Any], list[Any], list[dict[str, Any]]]:
    errors: list[dict[str, Any]] = []
    for field, valid in (
        ("schema_version", request.get("schema_version") == SCHEMA_VERSION),
        ("workflow", request.get("workflow") == WORKFLOW),
        ("input_profile", request.get("input_profile") in INPUT_PROFILES),
    ):
        if not valid:
            errors.append(finding("E-INPUT-SCHEMA-001", "error", field))
    source = request.get("source")
    if not isinstance(source, dict) or not validate_sha256(
        source.get("content_sha256")
    ):
        errors.append(finding("E-INPUT-HASH-001", "error", "source.content_sha256"))
    options, option_errors = normalize_options(request.get("options"))
    errors.extend(option_errors)
    records = request.get("records")
    if not isinstance(records, list):
        records = []
        errors.append(finding("E-INPUT-SCHEMA-001", "error", "records"))
    if len(records) > MAX_RECORDS:
        errors.append(finding("E-RESOURCE-LIMIT-001", "error", "records"))
    return source, options, records, errors


def validate_reaction_record_ids(
    records: Sequence[Any],
) -> tuple[set[int], list[dict[str, Any]]]:
    seen: set[str] = set()
    invalid: set[int] = set()
    errors: list[dict[str, Any]] = []
    for index, record in enumerate(records):
        if len(canonical_json(record).encode("utf-8")) > MAX_RECORD_BYTES:
            errors.append(
                finding(
                    "E-RESOURCE-LIMIT-001",
                    "error",
                    f"records[{index}]",
                )
            )
            invalid.add(index)
        record_id = record.get("record_id") if isinstance(record, dict) else None
        if not isinstance(record_id, str) or not record_id or record_id in seen:
            errors.append(
                finding(
                    "E-RECORD-ID-001",
                    "error",
                    f"records[{index}].record_id",
                )
            )
            invalid.add(index)
        else:
            seen.add(record_id)
    return invalid, errors


def has_run_fatal(findings: Sequence[dict[str, Any]]) -> bool:
    fatal_codes = {
        "E-INPUT-SCHEMA-001",
        "E-INPUT-HASH-001",
        "E-RESOURCE-LIMIT-001",
    } | UPSTREAM_FATAL_CODES
    return any(item.get("code") in fatal_codes for item in findings)


def build_rejected_record(
    raw: Any,
    index: int,
    findings: Sequence[dict[str, Any]],
) -> dict[str, Any]:
    value = raw if isinstance(raw, dict) else {}
    return {
        "record_id": f"__invalid_record_{index + 1}",
        "source_locator": {
            "original_record_id": value.get("record_id"),
            "source_locator": value.get("source_locator"),
        },
        "original_record_hash": sha256_json(raw),
        "ord_record": None,
        "reaction_smiles": {
            "reported": value.get("reaction_smiles"),
            "canonical_unmapped": None,
        },
        "participant_assessments": [],
        "role_assessment": {"status": "not_assessed"},
        "yield_assessment": {"measurements": [], "status": "not_run"},
        "balance_assessment": {
            "status": "not_assessed",
            "assumption": "none",
            "element_delta": {},
            "formal_charge_delta": 0,
        },
        "mapping_assessment": {
            "requested": False,
            "status": "not_run",
            "backend": None,
            "confidence": None,
        },
        "duplicate_memberships": [],
        "curation_status": "error",
        "findings": list(findings),
        "disposition": "rejected",
        "human_review_required": [],
        "_duplicate_keys": {
            "exact_record": None,
            "reported_transformation": None,
            "parent_transformation_candidate": None,
        },
    }


def process_reaction_records(
    records: list[Any],
    invalid_indices: set[int],
    run_fatal: bool,
    top_errors: list[dict[str, Any]],
    upstream: dict[str, dict[str, Any]],
    toolkit: dict[str, Any],
) -> list[dict[str, Any]]:
    candidates = [] if len(records) > MAX_RECORDS else records
    if run_fatal:
        invalid_indices.update(range(len(candidates)))
    processed = []
    for index, raw in enumerate(candidates):
        if index not in invalid_indices and isinstance(raw, dict):
            processed.append(assess_record(raw, upstream, toolkit))
            continue
        findings = [
            item
            for item in top_errors
            if run_fatal or item["field_path"].startswith(f"records[{index}]")
        ]
        processed.append(build_rejected_record(raw, index, findings))
    return processed


def build_curate_document(
    *,
    source: Any,
    options: dict[str, Any],
    metadata: list[dict[str, Any]],
    records: list[Any],
    processed: list[dict[str, Any]],
    duplicate_groups: list[dict[str, Any]],
    top_errors: list[dict[str, Any]],
    toolkit: dict[str, Any],
    generated_at_utc: str | None,
) -> dict[str, Any]:
    all_findings = list(top_errors)
    for record in processed:
        all_findings.extend(
            {"record_id": record["record_id"], **item} for item in record["findings"]
        )
    dispositions = {
        status: sum(record["disposition"] == status for record in processed)
        for status in sorted(DISPOSITIONS)
    }
    statuses = {
        status: sum(record["curation_status"] == status for record in processed)
        for status in sorted(CURATION_STATUSES)
    }
    review_queue = [
        {
            "record_id": record["record_id"],
            "required_action": "human_review",
            "reason_codes": sorted(
                {
                    item["code"]
                    for item in record["findings"]
                    if item["severity"] in {"warning", "human_review"}
                }
            ),
        }
        for record in processed
        if record["disposition"] == "review_required"
    ]
    document = {
        "schema_version": SCHEMA_VERSION,
        "workflow": WORKFLOW,
        "ruleset_version": RULESET_VERSION,
        "generated_at_utc": generated_at_utc or now_utc(),
        "tool_versions": {
            "rdkit": toolkit["rdkit_version"],
            "ord-schema": toolkit["ord_version"],
        },
        "options": options,
        "source_record": {
            "identifier": source.get("identifier")
            if isinstance(source, dict)
            else None,
            "content_sha256": (
                source.get("content_sha256") if isinstance(source, dict) else None
            ),
            "license": source.get("license") if isinstance(source, dict) else None,
        },
        "upstream_artifacts": metadata,
        "input_summary": {
            "total_records": len(records),
            "output_records": len(processed),
            "disposition_counts": dispositions,
            "curation_status_counts": statuses,
        },
        "records": processed,
        "duplicate_groups": duplicate_groups,
        "review_queue": review_queue,
        "errors": [item for item in all_findings if item["severity"] == "error"],
        "warnings": [item for item in all_findings if item["severity"] == "warning"],
        "notices": [
            "ready_for_search 只表示通过当前结构化检索数据门槛，不表示适合建模。",
            "元素/电荷平衡和原子映射诊断不证明反应正确、可复现、安全或可执行。",
            "本工作流不删除、合并、覆盖或写回原始反应记录。",
        ],
        "human_review_required": [
            item for item in all_findings if item["severity"] == "human_review"
        ],
    }
    document["result_fingerprint"] = stable_document_fingerprint(document)
    if SECRET_RE.search(canonical_json(document)):
        raise InputFailure("输出中检测到疑似凭证，已停止写出")
    return document


def process_request(
    request: dict[str, Any],
    *,
    generated_at_utc: str | None = None,
) -> dict[str, Any]:
    toolkit = load_toolkit()
    source, options, records, top_errors = validate_request_envelope(request)
    invalid_indices, record_errors = validate_reaction_record_ids(records)
    top_errors.extend(record_errors)
    upstream, metadata, upstream_errors = load_upstream_contract(
        request.get("upstream_artifacts")
    )
    top_errors.extend(upstream_errors)
    run_fatal = has_run_fatal(top_errors)
    processed = process_reaction_records(
        records,
        invalid_indices,
        run_fatal,
        top_errors,
        upstream,
        toolkit,
    )
    if run_fatal:
        for record in processed:
            record.pop("_duplicate_keys", None)
        duplicate_groups = []
    else:
        duplicate_groups = apply_duplicate_groups(processed)
    return build_curate_document(
        source=source,
        options=options,
        metadata=metadata,
        records=records,
        processed=processed,
        duplicate_groups=duplicate_groups,
        top_errors=top_errors,
        toolkit=toolkit,
        generated_at_utc=generated_at_utc,
    )


def load_request(path: Path, toolkit: dict[str, Any]) -> dict[str, Any]:
    if path.stat().st_size > MAX_INPUT_BYTES:
        raise InputFailure("输入文件超过 100 MiB")
    content_hash = hashlib.sha256(path.read_bytes()).hexdigest()
    suffixes = path.suffixes
    if path.suffix.lower() == ".csv":
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.DictReader(handle))
        if not rows or not {"record_id", "reaction_smiles"}.issubset(rows[0].keys()):
            raise InputFailure("CSV 必须包含 record_id,reaction_smiles")
        records = []
        for row in rows:
            record: dict[str, Any] = {
                "record_id": row.get("record_id"),
                "reaction_smiles": row.get("reaction_smiles"),
            }
            if row.get("yield_percent"):
                try:
                    record["yield_percent"] = float(row["yield_percent"])
                except ValueError:
                    record["yield_percent"] = row["yield_percent"]
            records.append(record)
        return {
            "schema_version": SCHEMA_VERSION,
            "workflow": WORKFLOW,
            "input_profile": "tabular",
            "source": {
                "identifier": path.name,
                "content_sha256": content_hash,
            },
            "options": {},
            "upstream_artifacts": [],
            "records": records,
        }
    if suffixes[-2:] == [".pb", ".gz"] or path.suffix.lower() == ".pb":
        dataset = toolkit["message_helpers"].load_message(
            str(path), toolkit["dataset_pb2"].Dataset
        )
        records = [
            {
                "record_id": reaction.reaction_id or f"reaction-{index + 1}",
                "ord_record": toolkit["MessageToDict"](
                    reaction,
                    preserving_proto_field_name=True,
                    use_integers_for_enums=False,
                ),
            }
            for index, reaction in enumerate(dataset.reactions)
        ]
        return {
            "schema_version": SCHEMA_VERSION,
            "workflow": WORKFLOW,
            "input_profile": "ord_dataset",
            "source": {
                "identifier": dataset.dataset_id or path.name,
                "content_sha256": content_hash,
            },
            "options": {},
            "upstream_artifacts": [],
            "records": records,
        }
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise InputFailure(f"无法读取 JSON：{exc}") from exc
    if not isinstance(document, dict):
        raise InputFailure("JSON 顶层必须是 object")
    if document.get("workflow") == WORKFLOW:
        return document
    if isinstance(document.get("reactions"), list):
        return {
            "schema_version": SCHEMA_VERSION,
            "workflow": WORKFLOW,
            "input_profile": "ord_dataset",
            "source": {
                "identifier": document.get("dataset_id") or path.name,
                "content_sha256": content_hash,
            },
            "options": {},
            "upstream_artifacts": [],
            "records": [
                {
                    "record_id": reaction.get("reaction_id") or f"reaction-{index + 1}",
                    "ord_record": reaction,
                }
                for index, reaction in enumerate(document["reactions"])
                if isinstance(reaction, dict)
            ],
        }
    if "inputs" in document or "outcomes" in document:
        return {
            "schema_version": SCHEMA_VERSION,
            "workflow": WORKFLOW,
            "input_profile": "ord_reaction",
            "source": {
                "identifier": document.get("reaction_id") or path.name,
                "content_sha256": content_hash,
            },
            "options": {},
            "upstream_artifacts": [],
            "records": [
                {
                    "record_id": document.get("reaction_id") or "reaction-1",
                    "ord_record": document,
                }
            ],
        }
    raise InputFailure("无法识别 JSON 输入 profile")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="输入 JSON/CSV/PB/PB.GZ")
    parser.add_argument("--output", required=True, help="输出 JSON")
    args = parser.parse_args(argv)
    try:
        toolkit = load_toolkit()
        request = load_request(Path(args.input), toolkit)
        result = process_request(request)
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(
            json.dumps(result, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    except (OSError, InputFailure, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    print(
        f"完成 {result['input_summary']['output_records']} 条反应；"
        f"ready={result['input_summary']['disposition_counts']['ready_for_search']}，"
        f"review={result['input_summary']['disposition_counts']['review_required']}，"
        f"rejected={result['input_summary']['disposition_counts']['rejected']}。"
    )
    fatal_codes = {
        "E-INPUT-SCHEMA-001",
        "E-INPUT-HASH-001",
        "E-RESOURCE-LIMIT-001",
    } | UPSTREAM_FATAL_CODES
    return 1 if any(item.get("code") in fatal_codes for item in result["errors"]) else 0


if __name__ == "__main__":
    raise SystemExit(main())
