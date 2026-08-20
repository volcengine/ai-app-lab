"""Bridge identity candidates to the structure standardization Skill."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any, Optional


def default_standardizer_path() -> Path:
    return (
        Path(__file__).resolve().parents[2]
        / "standardize-chemical-structures"
        / "scripts"
        / "standardize_structures.py"
    )


def standardizer_identifier(path: Optional[Path]) -> Optional[str]:
    if path is None:
        return None
    resolved = path.resolve()
    skills_root = Path(__file__).resolve().parents[2]
    try:
        return resolved.relative_to(skills_root).as_posix()
    except ValueError:
        return path.name


def _not_run(reason: str, profile: str) -> dict[str, Any]:
    return {
        "status": "not_run",
        "reason": reason,
        "target_skill": "standardize-chemical-structures",
        "profile": profile,
    }


def _load_standardizer(path: Path) -> Any:
    spec = importlib.util.spec_from_file_location(
        "_identity_standardizer",
        path,
    )
    if spec is None or spec.loader is None:
        return None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _input_records(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "id": candidate["candidate_id"],
            "record_index": index,
            "source": "resolve-chemical-identities",
            "input_format": "smiles",
            "original_structure": candidate["canonical_smiles"],
        }
        for index, candidate in enumerate(candidates, 1)
    ]


def _apply_views(
    candidates: list[dict[str, Any]],
    document: dict[str, Any],
    profile: str,
) -> None:
    by_id = {record["id"]: record for record in document["records"]}
    for candidate in candidates:
        record = by_id[candidate["candidate_id"]]
        candidate["comparison_view"] = {
            "status": record["standardization_status"],
            "profile": profile,
            "standardized_structure": record["standardized_structure"],
            "parent_structure": record["parent_structure"],
            "standardized_inchikey": record["inchikey"],
            "parent_inchikey": record["parent_inchikey"],
            "disposition": record["disposition"],
            "finding_codes": [finding["code"] for finding in record["qc_findings"]],
        }


def apply_standardization_views(
    candidates: list[dict[str, Any]],
    standardizer_script: Optional[Path],
    profile: str,
    generated_at_utc: str,
) -> dict[str, Any]:
    eligible = [candidate for candidate in candidates if candidate["canonical_smiles"]]
    if not eligible:
        return _not_run(
            "没有可交给结构标准化 Skill 的候选结构。",
            profile,
        )
    if standardizer_script is None:
        return _not_run("调用方显式禁用了结构标准化交接。", profile)
    if not standardizer_script.exists():
        return _not_run(
            f"未找到结构标准化脚本：{standardizer_script}",
            profile,
        )
    try:
        module = _load_standardizer(standardizer_script)
        if module is None:
            return {
                "status": "error",
                "reason": "无法加载结构标准化脚本。",
                "target_skill": "standardize-chemical-structures",
                "profile": profile,
            }
        document = module.process_records(
            _input_records(eligible),
            profile,
            provenance=[
                {
                    "source": "resolve-chemical-identities",
                    "purpose": "derived_comparison_view_only",
                }
            ],
            generated_at_utc=generated_at_utc,
        )
    except Exception as error:
        return {
            "status": "error",
            "reason": str(error),
            "target_skill": "standardize-chemical-structures",
            "profile": profile,
        }
    _apply_views(eligible, document, profile)
    return {
        "status": "completed",
        "target_skill": "standardize-chemical-structures",
        "profile": profile,
        "tool_versions": document["tool_versions"],
        "notice": (
            "comparison_view 是派生比较口径，不覆盖来源结构；"
            "同一 parent 不代表同一物理样品。"
        ),
    }
