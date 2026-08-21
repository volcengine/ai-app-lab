#!/usr/bin/env python3
"""校验 search-and-curate-chemical-libraries JSON 输出。"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from pathlib import Path
from typing import Any


SCHEMA_VERSION = "1.0.0"
WORKFLOW = "chemical-library-search-and-curation"
OPERATIONS = {
    "audit_library",
    "similarity_search",
    "substructure_search",
    "cluster_library",
    "select_diverse_subset",
}
LIBRARY_STATUSES = {"ready", "partial", "blocked"}
OPERATION_STATUSES = {"completed", "partial", "not_run", "error"}
INDEX_STATUSES = {"indexed", "not_indexed", "incompatible", "error"}
MAX_SEARCH_RECORDS = 5000
MAX_CLUSTER_RECORDS = 2000
TEMPORAL_KEYS = {
    "generated_at_utc",
    "retrieved_at_utc",
    "requested_at_utc",
    "runtime_seconds",
}
SECRET_RE = re.compile(
    r"ark-[A-Za-z0-9_-]{12,}|"
    r"Bearer\s+[A-Za-z0-9._~+/=-]{12,}|"
    r"(?:Authorization|Cookie|Token|Api[_ -]?Key)\s*[:=]\s*\S{12,}",
    re.IGNORECASE,
)
FORBIDDEN_CLAIMS = {
    "活性已确认",
    "功能相同",
    "机制相同",
    "药效相同",
    "安全性已确认",
    "毒性已确认",
    "无毒",
    "保证可合成",
    "适合直接建模",
    "same biological function",
    "proven active",
    "proven safe",
    "safe to synthesize",
}
CONTRACT_BLOCKING_CODES = {
    "E-FEATURE-ARTIFACT-CONTRACT",
    "E-CANONICAL-STRUCTURE-MISMATCH",
}


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


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


def expected_fingerprint(document: dict[str, Any]) -> str:
    return sha256_json(_without_temporal_fields(document))


def issue(path: str, message: str) -> dict[str, str]:
    return {"path": path, "message": message}


def is_nonnegative_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def validate_top_level(document: dict[str, Any]) -> list[dict[str, str]]:
    issues = []
    required = {
        "schema_version",
        "workflow",
        "generated_at_utc",
        "operation",
        "library_status",
        "operation_status",
        "tool_versions",
        "options",
        "upstream_artifact",
        "request_provenance",
        "library_summary",
        "index_metadata",
        "record_manifest",
        "query_results",
        "clusters",
        "selection",
        "curation_review_queue",
        "excluded_records",
        "errors",
        "warnings",
        "notices",
        "human_review_required",
        "result_fingerprint",
    }
    for key in sorted(required):
        if key not in document:
            issues.append(issue(key, "缺少顶层字段"))
    if document.get("schema_version") != SCHEMA_VERSION:
        issues.append(issue("schema_version", "schema_version 不匹配"))
    if document.get("workflow") != WORKFLOW:
        issues.append(issue("workflow", "workflow 不匹配"))
    if document.get("operation") not in OPERATIONS:
        issues.append(issue("operation", "operation 不受控"))
    if document.get("library_status") not in LIBRARY_STATUSES:
        issues.append(issue("library_status", "library_status 不受控"))
    if document.get("operation_status") not in OPERATION_STATUSES:
        issues.append(issue("operation_status", "operation_status 不受控"))
    for key in (
        "tool_versions",
        "options",
        "upstream_artifact",
        "request_provenance",
        "library_summary",
        "index_metadata",
    ):
        if key in document and not isinstance(document[key], dict):
            issues.append(issue(key, "必须是 object"))
    for key in (
        "record_manifest",
        "query_results",
        "clusters",
        "curation_review_queue",
        "excluded_records",
        "errors",
        "warnings",
        "notices",
        "human_review_required",
    ):
        if key in document and not isinstance(document[key], list):
            issues.append(issue(key, "必须是 array"))
    upstream = document.get("upstream_artifact") or {}
    declared_path = upstream.get("declared_path")
    if isinstance(declared_path, str) and Path(declared_path).is_absolute():
        issues.append(
            issue(
                "upstream_artifact.declared_path",
                "输出不得保存机器绝对路径",
            )
        )
    index = document.get("index_metadata") or {}
    if index.get("backend") != "rdkit_in_memory":
        issues.append(issue("index_metadata.backend", "首版只允许 rdkit_in_memory"))
    if index.get("persistent_index") is not False:
        issues.append(issue("index_metadata.persistent_index", "首版不得声称持久索引"))
    if index.get("network_access") is not False:
        issues.append(issue("index_metadata.network_access", "首版不得访问网络"))
    if index.get("automatic_backend_fallback") is not False:
        issues.append(
            issue(
                "index_metadata.automatic_backend_fallback",
                "首版不得自动切换后端",
            )
        )
    return issues


def validate_manifest(document: dict[str, Any]) -> list[dict[str, str]]:
    issues = []
    manifest = document.get("record_manifest")
    if not isinstance(manifest, list):
        return issues
    seen_indices = set()
    for index, record in enumerate(manifest):
        path = f"record_manifest[{index}]"
        if not isinstance(record, dict):
            issues.append(issue(path, "必须是 object"))
            continue
        status = record.get("index_status")
        if status not in INDEX_STATUSES:
            issues.append(issue(path + ".index_status", "index_status 不受控"))
        record_index = record.get("record_index")
        if not is_nonnegative_int(record_index):
            issues.append(issue(path + ".record_index", "record_index 无效"))
        elif record_index in seen_indices:
            issues.append(issue(path + ".record_index", "record_index 重复"))
        else:
            seen_indices.add(record_index)
        if status != "indexed" and not record.get("reason"):
            issues.append(issue(path + ".reason", "非 indexed 记录必须说明原因"))
        if record.get("upstream_disposition") == "rejected" and status == "indexed":
            issues.append(issue(path, "上游 rejected 记录不得 indexed"))
    summary = document.get("library_summary") or {}
    counts = summary.get("index_status_counts")
    if not isinstance(counts, dict):
        issues.append(issue("library_summary.index_status_counts", "必须是 object"))
        return issues
    expected_counts = {
        status: sum(
            isinstance(record, dict) and record.get("index_status") == status
            for record in manifest
        )
        for status in INDEX_STATUSES
    }
    if counts != expected_counts:
        issues.append(issue("library_summary.index_status_counts", "状态计数不守恒"))
    if summary.get("total_records") != len(manifest):
        issues.append(issue("library_summary.total_records", "总记录数不守恒"))
    if summary.get("record_count_conserved") is not True:
        issues.append(
            issue("library_summary.record_count_conserved", "必须明确计数守恒")
        )
    excluded = document.get("excluded_records")
    if isinstance(excluded, list):
        expected = [
            record
            for record in manifest
            if isinstance(record, dict) and record.get("index_status") != "indexed"
        ]
        if excluded != expected:
            issues.append(issue("excluded_records", "排除记录与 manifest 不一致"))
    return issues


def validate_similarity(document: dict[str, Any]) -> list[dict[str, str]]:
    issues = []
    options = document.get("options") or {}
    if options.get("metric") != "tanimoto":
        issues.append(issue("options.metric", "首版 similarity 只允许 tanimoto"))
    if options.get("top_k") is None and options.get("threshold") is None:
        issues.append(issue("options", "top_k/threshold 至少一个"))
    for query_index, query in enumerate(document.get("query_results") or []):
        path = f"query_results[{query_index}]"
        if not isinstance(query, dict):
            issues.append(issue(path, "必须是 object"))
            continue
        hits = query.get("hits")
        if not isinstance(hits, list):
            issues.append(issue(path + ".hits", "必须是 array"))
            continue
        previous = None
        previous_index = None
        for hit_index, hit in enumerate(hits):
            hit_path = f"{path}.hits[{hit_index}]"
            if not isinstance(hit, dict):
                issues.append(issue(hit_path, "必须是 object"))
                continue
            score = hit.get("similarity")
            if (
                not isinstance(score, (int, float))
                or isinstance(score, bool)
                or not math.isfinite(float(score))
                or not 0 <= float(score) <= 1
            ):
                issues.append(issue(hit_path + ".similarity", "分数必须在 [0,1]"))
                continue
            if hit.get("metric") != "tanimoto":
                issues.append(issue(hit_path + ".metric", "metric 不匹配"))
            record_index = hit.get("hit_record_index")
            if previous is not None and (
                score > previous
                or (
                    score == previous
                    and isinstance(record_index, int)
                    and isinstance(previous_index, int)
                    and record_index < previous_index
                )
            ):
                issues.append(issue(hit_path, "hit 排序不稳定"))
            previous = score
            previous_index = record_index
            if hit.get("rank") != hit_index + 1:
                issues.append(issue(hit_path + ".rank", "rank 不连续"))
            if not isinstance(hit.get("exact_structure_match"), bool):
                issues.append(
                    issue(hit_path + ".exact_structure_match", "必须显式给出")
                )
    return issues


def validate_substructure(document: dict[str, Any]) -> list[dict[str, str]]:
    issues = []
    for query_index, query in enumerate(document.get("query_results") or []):
        path = f"query_results[{query_index}]"
        if not isinstance(query, dict):
            issues.append(issue(path, "必须是 object"))
            continue
        query_text = query.get("query")
        if isinstance(query_text, str) and "$(" in query_text:
            if query.get("query_status") == "completed":
                issues.append(issue(path, "recursive SMARTS 不得执行"))
        if query.get("query_status") != "completed":
            if not query.get("error"):
                issues.append(issue(path + ".error", "失败查询必须说明原因"))
            continue
        if query.get("match_engine") != "rdkit_full_subgraph_isomorphism":
            issues.append(issue(path + ".match_engine", "不得以 screenout 充当命中"))
        parameters = query.get("parameters")
        if not isinstance(parameters, dict):
            issues.append(issue(path + ".parameters", "必须记录完整参数"))
        elif parameters.get("recursionPossible") is not False:
            issues.append(
                issue(path + ".parameters.recursionPossible", "首版必须关闭 recursion")
            )
        hits = query.get("hits")
        if not isinstance(hits, list):
            issues.append(issue(path + ".hits", "必须是 array"))
            continue
        if query.get("returned_count") != len(hits):
            issues.append(issue(path + ".returned_count", "命中计数不一致"))
        for hit_index, hit in enumerate(hits):
            hit_path = f"{path}.hits[{hit_index}]"
            if hit.get("match_engine") != "rdkit_full_subgraph_isomorphism":
                issues.append(issue(hit_path, "hit 未经过完整子图匹配"))
            atom_indices = hit.get("match_atom_indices")
            if not isinstance(atom_indices, list) or not atom_indices:
                issues.append(
                    issue(hit_path + ".match_atom_indices", "缺少 atom mapping")
                )
    return issues


def validate_clusters(document: dict[str, Any]) -> list[dict[str, str]]:
    issues = []
    manifest = document.get("record_manifest") or []
    indexed = {
        item.get("record_index")
        for item in manifest
        if isinstance(item, dict) and item.get("index_status") == "indexed"
    }
    seen = []
    for cluster_index, cluster in enumerate(document.get("clusters") or []):
        path = f"clusters[{cluster_index}]"
        members = cluster.get("member_record_indices")
        if not isinstance(members, list) or not members:
            issues.append(issue(path + ".member_record_indices", "cluster 不能为空"))
            continue
        if cluster.get("size") != len(members):
            issues.append(issue(path + ".size", "cluster size 不一致"))
        if cluster.get("centroid_record_index") != members[0]:
            issues.append(
                issue(path + ".centroid_record_index", "centroid 必须为首成员")
            )
        if cluster.get("metric") != "tanimoto":
            issues.append(issue(path + ".metric", "metric 不匹配"))
        seen.extend(members)
    if document.get("operation_status") == "completed":
        if len(seen) != len(set(seen)):
            issues.append(issue("clusters", "同一记录出现在多个 cluster"))
        if set(seen) != indexed:
            issues.append(issue("clusters", "cluster 未覆盖全部 indexed 记录"))
    return issues


def validate_selection(document: dict[str, Any]) -> list[dict[str, str]]:
    issues = []
    selection = document.get("selection")
    if document.get("operation_status") != "completed":
        return issues
    if not isinstance(selection, dict):
        return [issue("selection", "完成的多样性选择必须有 object")]
    picks = selection.get("picks")
    if not isinstance(picks, list):
        return [issue("selection.picks", "必须是 array")]
    if selection.get("pick_size") != len(picks):
        issues.append(issue("selection.pick_size", "pick_size 不一致"))
    indices = [item.get("record_index") for item in picks if isinstance(item, dict)]
    if len(indices) != len(set(indices)):
        issues.append(issue("selection.picks", "选择结果不得重复"))
    if not is_nonnegative_int(selection.get("seed")):
        issues.append(issue("selection.seed", "seed 必须是非负整数"))
    for index, pick in enumerate(picks):
        if pick.get("pick_order") != index + 1:
            issues.append(
                issue(f"selection.picks[{index}].pick_order", "pick_order 不连续")
            )
    return issues


def validate_governance(document: dict[str, Any]) -> list[dict[str, str]]:
    issues = []
    for index, item in enumerate(document.get("curation_review_queue") or []):
        path = f"curation_review_queue[{index}]"
        if not isinstance(item, dict):
            issues.append(issue(path, "必须是 object"))
            continue
        if item.get("required_action") != "human_review":
            issues.append(issue(path + ".required_action", "只能要求人工复核"))
        if item.get("automatic_mutation") is not False:
            issues.append(issue(path + ".automatic_mutation", "不得自动修改化合物库"))
    return issues


def validate_limits(document: dict[str, Any]) -> list[dict[str, str]]:
    issues = []
    summary = document.get("library_summary") or {}
    count = summary.get("indexed_records")
    if not is_nonnegative_int(count):
        return issues
    limit = (
        MAX_CLUSTER_RECORDS
        if document.get("operation") == "cluster_library"
        else MAX_SEARCH_RECORDS
    )
    if count > limit and document.get("operation_status") != "not_run":
        issues.append(issue("operation_status", "资源超限时必须 not_run"))
    return issues


def validate_contract_blocking(
    document: dict[str, Any],
) -> list[dict[str, str]]:
    contract_error = any(
        isinstance(item, dict) and item.get("code") in CONTRACT_BLOCKING_CODES
        for item in document.get("errors") or []
    )
    if not contract_error:
        upstream = document.get("upstream_artifact") or {}
        if upstream.get("workflow") != "molecular-feature-computation":
            return [
                issue(
                    "upstream_artifact.workflow",
                    "合法结果必须来自 molecular-feature-computation",
                )
            ]
        return []
    issues = []
    if document.get("operation_status") != "not_run":
        issues.append(
            issue(
                "operation_status",
                "上游合同失败必须 not_run",
            )
        )
    if document.get("library_status") != "blocked":
        issues.append(issue("library_status", "上游合同失败必须 blocked"))
    manifest = document.get("record_manifest") or []
    for index, item in enumerate(manifest):
        if not isinstance(item, dict):
            continue
        if (
            item.get("index_status") != "incompatible"
            or item.get("reason") != "upstream_artifact_contract_invalid"
        ):
            issues.append(
                issue(
                    f"record_manifest[{index}]",
                    "上游合同失败记录必须 incompatible",
                )
            )
    return issues


def validate(document: Any) -> dict[str, Any]:
    issues: list[dict[str, str]] = []
    if not isinstance(document, dict):
        return {
            "valid": False,
            "issues": [issue("$", "顶层必须是 object")],
        }
    issues.extend(validate_top_level(document))
    issues.extend(validate_manifest(document))
    operation = document.get("operation")
    if document.get("operation_status") != "not_run":
        if operation == "similarity_search":
            issues.extend(validate_similarity(document))
        elif operation == "substructure_search":
            issues.extend(validate_substructure(document))
        elif operation == "cluster_library":
            issues.extend(validate_clusters(document))
        elif operation == "select_diverse_subset":
            issues.extend(validate_selection(document))
    issues.extend(validate_governance(document))
    issues.extend(validate_limits(document))
    issues.extend(validate_contract_blocking(document))

    serialized = json.dumps(document, ensure_ascii=False)
    if SECRET_RE.search(serialized):
        issues.append(issue("$", "输出包含疑似凭证"))
    lowered = serialized.lower()
    for claim in FORBIDDEN_CLAIMS:
        if claim.lower() in lowered:
            issues.append(issue("$", f"输出包含禁止的科学结论：{claim}"))
    actual = document.get("result_fingerprint")
    expected = expected_fingerprint(document)
    if actual != expected:
        issues.append(issue("result_fingerprint", "结果指纹不匹配"))
    return {"valid": not issues, "issues": issues}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        document = json.loads(args.path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        sys.stderr.write(f"error: {error}\n")
        return 2
    result = validate(document)
    sys.stdout.write(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
