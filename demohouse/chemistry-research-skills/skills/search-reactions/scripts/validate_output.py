#!/usr/bin/env python3
"""Validate search-reactions output and scientific boundaries."""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
from pathlib import Path
from typing import Any, Sequence

from search_reactions import (
    OPERATIONS,
    PROFILE_DEFINITIONS,
    PROVIDERS,
    PROVIDER_STATUSES,
    RULESET_VERSION,
    SCHEMA_VERSION,
    SECRET_RE,
    WORKFLOW,
    sha256_json,
    stable_document_fingerprint,
)


def load_output_contract() -> Any:
    spec = importlib.util.spec_from_file_location(
        "search_output_contract_validator",
        Path(__file__).with_name("search_output_contract.py"),
    )
    module = importlib.util.module_from_spec(spec)
    if spec.loader is None:
        raise RuntimeError("cannot load search output contract")
    spec.loader.exec_module(module)
    return module


OUTPUT_CONTRACT = load_output_contract()

FORBIDDEN_KEYS = {
    "reaction_is_feasible",
    "conditions_are_optimal",
    "safe_to_execute",
    "no_precedent_exists",
    "recommended_conditions",
}
FORBIDDEN_CLAIMS = {
    "反应可行",
    "条件最优",
    "可安全执行",
    "不存在先例",
    "推荐条件",
    "reaction is feasible",
    "conditions are optimal",
    "safe to execute",
    "no precedent exists",
}


def walk(value: Any, path: str = "$") -> list[tuple[str, str, Any]]:
    result = []
    if isinstance(value, dict):
        for key, item in value.items():
            current = f"{path}.{key}"
            result.append((current, str(key), item))
            result.extend(walk(item, current))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            result.extend(walk(item, f"{path}[{index}]"))
    return result


def is_bounded_int(
    value: Any,
    minimum: int,
    maximum: int | None = None,
) -> bool:
    return (
        isinstance(value, int)
        and not isinstance(value, bool)
        and value >= minimum
        and (maximum is None or value <= maximum)
    )


def _validate_result_shape(
    item: dict[str, Any],
    path: str,
    provider: Any,
) -> list[str]:
    required = {
        "rank",
        "reaction_id",
        "dataset_id",
        "provider",
        "reaction_smiles",
        "retrieval_mode",
        "fingerprint_profile",
        "raw_score",
        "score_scope",
        "matched_constraints",
        "participants",
        "reported_condition_evidence",
        "yield_measurements",
        "source",
        "license",
        "curation_disposition",
        "quality_findings",
        "result_hash",
    }
    errors = [f"{path}.{key} 缺失" for key in sorted(required - set(item))]
    if item.get("provider") != provider:
        errors.append(f"{path}.provider 与顶层不一致")
    if item.get("curation_disposition") == "rejected":
        errors.append(f"{path} 不得包含 rejected 候选")
    if not is_bounded_int(item.get("rank"), 1):
        errors.append(f"{path}.rank 非正整数")
    raw_score = item.get("raw_score")
    if raw_score is not None and (
        not isinstance(raw_score, (int, float))
        or isinstance(raw_score, bool)
        or not 0 <= raw_score <= 1
    ):
        errors.append(f"{path}.raw_score 必须为 null 或 0–1")
    for key in (
        "matched_constraints",
        "participants",
        "yield_measurements",
        "quality_findings",
    ):
        if not isinstance(item.get(key), list):
            errors.append(f"{path}.{key} 必须是 array")
    participants = item.get("participants")
    if isinstance(participants, list):
        for index, participant in enumerate(participants):
            if not isinstance(participant, dict) or participant.get(
                "upstream_binding_status"
            ) not in {"not_requested", "bound", "failed"}:
                errors.append(
                    f"{path}.participants[{index}].upstream_binding_status 不受控"
                )
    return errors


def _validate_result_profile(
    item: dict[str, Any],
    path: str,
) -> list[str]:
    errors = []
    profile = item.get("fingerprint_profile")
    if item.get("retrieval_mode") == "whole_reaction_similarity":
        if not isinstance(profile, dict):
            errors.append(f"{path}.fingerprint_profile 缺失")
        else:
            profile_id = profile.get("profile_id")
            definition = PROFILE_DEFINITIONS.get(profile_id)
            if definition is None:
                errors.append(f"{path}.fingerprint_profile.profile_id 不受控")
            elif profile.get("metric") != definition["metric"]:
                errors.append(f"{path}.fingerprint_profile.metric 不匹配")
        if item.get("score_scope") != "whole_reaction":
            errors.append(f"{path}.score_scope 必须为 whole_reaction")
    elif profile is not None:
        errors.append(f"{path}.fingerprint_profile 应为 null")
    return errors


def validate_result(item: Any, path: str, provider: Any) -> list[str]:
    if not isinstance(item, dict):
        return [f"{path} 必须是 object"]
    errors = _validate_result_shape(item, path, provider)
    errors.extend(_validate_result_profile(item, path))
    payload = {
        key: value for key, value in item.items() if key not in {"rank", "result_hash"}
    }
    if item.get("result_hash") != sha256_json(payload):
        errors.append(f"{path}.result_hash 不匹配")
    return errors


def _validate_envelope(document: dict[str, Any]) -> list[str]:
    required = set(
        "schema_version workflow ruleset_version generated_at_utc operation "
        "provider provider_status tool_versions query_interpretation options "
        "corpus_provenance corpus_summary results excluded_records review_queue "
        "errors warnings notices result_fingerprint".split()
    )
    errors = [f"{key} 缺失" for key in sorted(required - set(document))]
    for failed, message in (
        (document.get("schema_version") != SCHEMA_VERSION, "schema_version 不匹配"),
        (document.get("workflow") != WORKFLOW, "workflow 不匹配"),
        (document.get("ruleset_version") != RULESET_VERSION, "ruleset_version 不匹配"),
        (document.get("operation") not in OPERATIONS, "operation 不受控"),
        (document.get("provider") not in PROVIDERS, "provider 不受控"),
        (
            document.get("provider_status") not in PROVIDER_STATUSES,
            "provider_status 不受控",
        ),
    ):
        if failed:
            errors.append(message)
    versions = document.get("tool_versions")
    if not isinstance(versions, dict):
        errors.append("tool_versions 必须是 object")
    else:
        if versions.get("rdkit") not in {"2025.9.2", "2025.09.2"}:
            errors.append("rdkit 必须固定 2025.9.2")
        if versions.get("ord-schema") != "0.8.3":
            errors.append("ord-schema 必须固定 0.8.3")
    for key in (
        "results",
        "excluded_records",
        "review_queue",
        "errors",
        "warnings",
        "notices",
    ):
        if not isinstance(document.get(key), list):
            errors.append(f"{key} 必须是 array")
    return errors


def _validate_results_and_options(document: dict[str, Any]) -> list[str]:
    errors = []
    results = document.get("results")
    results = results if isinstance(results, list) else []
    for index, item in enumerate(results):
        errors.extend(
            validate_result(item, f"results[{index}]", document.get("provider"))
        )
    ranks = [item.get("rank") for item in results if isinstance(item, dict)]
    if ranks != list(range(1, len(results) + 1)):
        errors.append("results.rank 必须连续且从 1 开始")
    options = document.get("options")
    if not isinstance(options, dict):
        return errors + ["options 必须是 object"]
    top_k = options.get("top_k")
    if not is_bounded_int(top_k, 1, 100):
        errors.append("options.top_k 必须为 1–100")
    elif len(results) > top_k:
        errors.append("results 数量超过 top_k")
    profile = options.get("fingerprint_profile_id")
    if document.get("operation") == "search_similar_reactions":
        if (
            document.get("provider_status")
            in {"completed", "completed_zero_hits", "partial"}
            and profile not in PROFILE_DEFINITIONS
        ):
            errors.append("相似反应检索缺少受控 fingerprint profile")
    elif profile is not None:
        errors.append("非相似检索不得设置 fingerprint profile")
    return errors


def _validate_status_and_summary(document: dict[str, Any]) -> list[str]:
    errors = []
    status = document.get("provider_status")
    results = document.get("results") or []
    top_errors = document.get("errors") or []
    if status == "completed" and not results:
        errors.append("completed 必须至少有一条结果")
    if status == "completed_zero_hits" and results:
        errors.append("completed_zero_hits 不得有结果")
    if status in {"blocked", "source_timeout", "source_error"} and not top_errors:
        errors.append(f"{status} 必须包含 errors")
    if status in {"completed", "completed_zero_hits"} and top_errors:
        errors.append(f"{status} 不得包含 errors")
    review_ids = {
        item.get("reaction_id")
        for item in document.get("review_queue") or []
        if isinstance(item, dict)
    }
    expected_review = {
        item.get("reaction_id")
        for item in results
        if isinstance(item, dict)
        and item.get("curation_disposition") == "review_required"
    }
    if review_ids != expected_review:
        errors.append("review_queue 与 review_required 结果不一致")
    corpus = document.get("corpus_summary")
    if not isinstance(corpus, dict):
        errors.append("corpus_summary 必须是 object")
    else:
        for key in ("input_records", "searchable_records", "excluded_records"):
            if not is_bounded_int(corpus.get(key), 0):
                errors.append(f"corpus_summary.{key} 必须是非负整数")
    return errors


def _validate_forbidden(document: dict[str, Any]) -> list[str]:
    errors = [
        f"{path} 是禁止字段" for path, key, _ in walk(document) if key in FORBIDDEN_KEYS
    ]
    serialized = json.dumps(document, ensure_ascii=False)
    if SECRET_RE.search(serialized):
        errors.append("输出含疑似凭证")
    errors.extend(
        f"输出含禁止科学结论：{claim}"
        for claim in FORBIDDEN_CLAIMS
        if re.search(re.escape(claim), serialized, flags=re.IGNORECASE)
    )
    return errors


def validate_output(document: Any) -> list[str]:
    if not isinstance(document, dict):
        return ["输出顶层必须是 object"]
    errors = _validate_envelope(document)
    errors.extend(_validate_results_and_options(document))
    errors.extend(_validate_status_and_summary(document))
    errors.extend(_validate_forbidden(document))
    if document.get("result_fingerprint") != stable_document_fingerprint(document):
        errors.append("result_fingerprint 不匹配")
    errors.extend(OUTPUT_CONTRACT.validate_corpus_provenance(document))
    errors.extend(OUTPUT_CONTRACT.validate_local_contract_blocking(document))
    return errors


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args(argv)
    try:
        document = json.loads(args.output.read_text(encoding="utf-8"))
    except Exception as error:
        print(json.dumps({"valid": False, "errors": [str(error)]}, ensure_ascii=False))
        return 2
    errors = validate_output(document)
    print(
        json.dumps(
            {"valid": not errors, "errors": errors},
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
