#!/usr/bin/env python3
"""保守解析化学名称、结构和数据库标识符，并保留来源与不确定性。"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


# Preserve the historical monkeypatch surface used by transport consumers.
URLLIB_REQUEST = urllib.request


def load_local_module(filename: str, module_name: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载本地模块：{filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


REQUEST_CONTRACT = load_local_module(
    "identity_request_contract.py",
    "resolve_identity_request_contract",
)
TRANSPORT = load_local_module(
    "identity_transport.py",
    "resolve_identity_transport",
)
PRIMARY_SOURCES = load_local_module(
    "identity_sources_primary.py",
    "resolve_identity_sources_primary",
)
REGISTRY_SOURCES = load_local_module(
    "identity_sources_registry.py",
    "resolve_identity_sources_registry",
)
SOURCE_PIPELINE = load_local_module(
    "identity_source_pipeline.py",
    "resolve_identity_source_pipeline",
)
CANDIDATES = load_local_module(
    "identity_candidates.py",
    "resolve_identity_candidates",
)
STANDARDIZATION = load_local_module(
    "identity_standardization.py",
    "resolve_identity_standardization",
)
ALIGNMENT = load_local_module(
    "identity_alignment.py",
    "resolve_identity_alignment",
)
OUTPUT_CONTRACT = load_local_module(
    "identity_output_contract.py",
    "resolve_identity_output_contract",
)
RUNTIME = load_local_module(
    "identity_runtime.py",
    "resolve_identity_runtime",
)
PIPELINE = load_local_module(
    "identity_pipeline.py",
    "resolve_identity_pipeline",
)

SCHEMA_VERSION = PIPELINE.SCHEMA_VERSION
WORKFLOW = PIPELINE.WORKFLOW
DEFAULT_SOURCES = PIPELINE.DEFAULT_SOURCES
SUPPORTED_SOURCES = PIPELINE.SUPPORTED_SOURCES
INPUT_TYPES = REQUEST_CONTRACT.INPUT_TYPES
DEFAULT_TIMEOUT = TRANSPORT.DEFAULT_TIMEOUT
DEFAULT_RETRIES = TRANSPORT.DEFAULT_RETRIES

DependencyFailure = RUNTIME.DependencyFailure
InputFailure = REQUEST_CONTRACT.InputFailure
now_utc = RUNTIME.now_utc
load_toolkit = RUNTIME.load_toolkit
toolkit_versions = RUNTIME.toolkit_versions
fetch_source_metadata = RUNTIME.fetch_source_metadata

canonical_json = OUTPUT_CONTRACT.canonical_json
sha256_json = OUTPUT_CONTRACT.sha256_json
output_fingerprint = OUTPUT_CONTRACT.output_fingerprint

normalize_input_type = REQUEST_CONTRACT.normalize_input_type
valid_cas_check_digit = REQUEST_CONTRACT.valid_cas_check_digit
parse_structure = REQUEST_CONTRACT.parse_structure
structure_identifiers = REQUEST_CONTRACT.structure_identifiers
looks_like_failed_smiles = REQUEST_CONTRACT.looks_like_failed_smiles
detect_input_type = REQUEST_CONTRACT.detect_input_type
local_source_record = REQUEST_CONTRACT.local_source_record
validate_request = REQUEST_CONTRACT.validate_request

HttpTransport = TRANSPORT.HttpTransport
FixtureTransport = TRANSPORT.FixtureTransport
source_log = TRANSPORT.source_log

fetch_opsin = PRIMARY_SOURCES.fetch_opsin
pubchem_request_spec = PRIMARY_SOURCES.pubchem_request_spec
selected_pubchem_record = PRIMARY_SOURCES.selected_pubchem_record
fetch_pubchem = PRIMARY_SOURCES.fetch_pubchem
collect_initial_sources = PRIMARY_SOURCES.collect_initial_sources

selected_chembl_record = REGISTRY_SOURCES.selected_chembl_record
fetch_chembl_by_id = REGISTRY_SOURCES.fetch_chembl_by_id
fetch_chembl_by_inchikey = REGISTRY_SOURCES.fetch_chembl_by_inchikey
fetch_chembl_by_name = REGISTRY_SOURCES.fetch_chembl_by_name
selected_unichem_record = REGISTRY_SOURCES.selected_unichem_record
fetch_unichem_exact = REGISTRY_SOURCES.fetch_unichem_exact
fetch_unichem_connectivity = REGISTRY_SOURCES.fetch_unichem_connectivity
collect_enrichment_sources = SOURCE_PIPELINE.collect_enrichment_sources

normalize_source_record = CANDIDATES.normalize_source_record
aggregate_candidates = CANDIDATES.aggregate_candidates
default_standardizer_path = STANDARDIZATION.default_standardizer_path
standardizer_identifier = STANDARDIZATION.standardizer_identifier
apply_standardization_views = STANDARDIZATION.apply_standardization_views

aggregate_retrieval_status = ALIGNMENT.aggregate_retrieval_status
has_review_findings = ALIGNMENT.has_review_findings
determine_alignment = ALIGNMENT.determine_alignment
build_handoff = ALIGNMENT.build_handoff
build_cross_query_relationships = ALIGNMENT.build_cross_query_relationships

resolve_one = PIPELINE.resolve_one
process_requests = PIPELINE.process_requests


def load_request_file(
    path: Path,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise InputFailure(f"无法读取请求文件：{error}") from error
    if not isinstance(payload, dict):
        raise InputFailure("请求文件顶层必须是 JSON object。")
    requests = payload.get("requests")
    if requests is None and "query" in payload:
        requests = [payload]
    if not isinstance(requests, list) or not all(
        isinstance(item, dict) for item in requests
    ):
        raise InputFailure("请求文件必须包含 requests 数组或单个 query。")
    options = payload.get("options") or {}
    if not isinstance(options, dict):
        raise InputFailure("options 必须是 JSON object。")
    return requests, options


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--query", action="append", default=[])
    parser.add_argument("--request", type=Path, help="单条或批量 JSON 请求文件")
    parser.add_argument(
        "--input-type",
        default="auto",
        choices=sorted(INPUT_TYPES),
    )
    parser.add_argument("--context")
    parser.add_argument("--expected-form")
    parser.add_argument(
        "--sources",
        default=",".join(DEFAULT_SOURCES),
        help="逗号分隔：opsin,pubchem,chembl,unichem；空字符串表示不联网",
    )
    parser.add_argument(
        "--include-related",
        action="store_true",
        help="额外调用 UniChem connectivity，记录相关形式证据",
    )
    parser.add_argument(
        "--standardizer-script",
        type=Path,
        help="第一个 Skill 的 standardize_structures.py；默认自动寻找同级 Skill",
    )
    parser.add_argument(
        "--no-standardizer",
        action="store_true",
        help="不生成第一个 Skill 的派生 comparison_view",
    )
    parser.add_argument(
        "--standardization-profile",
        default="chembl-pipeline",
        choices=["rdkit-basic", "chembl-pipeline"],
    )
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT)
    parser.add_argument("--retries", type=int, default=DEFAULT_RETRIES)
    parser.add_argument(
        "--fixture-responses",
        type=Path,
        help="仅用于离线测试的固定来源响应 JSON",
    )
    parser.add_argument("--generated-at", help="固定 UTC 时间，仅用于可重复验收")
    parser.add_argument("--output", type=Path)
    return parser.parse_args()


def validate_transport_options(timeout: Any, retries: Any) -> None:
    if (
        not isinstance(timeout, int)
        or isinstance(timeout, bool)
        or not 1 <= timeout <= 60
    ):
        raise InputFailure("--timeout 必须是 1–60 秒的整数。")
    if (
        not isinstance(retries, int)
        or isinstance(retries, bool)
        or not 0 <= retries <= 3
    ):
        raise InputFailure("--retries 必须是 0–3 的整数。")


def _requests_from_args(
    args: argparse.Namespace,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if args.request:
        requests, options = load_request_file(args.request)
        if args.query:
            raise InputFailure("--request 与 --query 不能同时使用。")
        return requests, options
    requests = [
        {
            "id": f"query-{index}",
            "query": query,
            "input_type": args.input_type,
            "context": args.context,
            "expected_form": args.expected_form,
        }
        for index, query in enumerate(args.query, 1)
    ]
    if not requests:
        raise InputFailure("请提供 --query 或 --request。")
    return requests, {}


def _transport(
    args: argparse.Namespace,
    generated_at: str,
) -> Any:
    validate_transport_options(args.timeout, args.retries)

    def clock() -> str:
        return generated_at

    if not args.fixture_responses:
        return HttpTransport(
            timeout=args.timeout,
            retries=args.retries,
            clock=clock,
        )
    fixtures = json.loads(args.fixture_responses.read_text(encoding="utf-8"))
    if not isinstance(fixtures, dict):
        raise InputFailure("fixture-responses 顶层必须是 JSON object。")
    return FixtureTransport(fixtures, clock=clock)


def _sources(value: Any) -> list[str]:
    if isinstance(value, str):
        return [source.strip() for source in value.split(",") if source.strip()]
    if isinstance(value, list):
        return [str(source) for source in value]
    raise InputFailure("sources 必须是逗号分隔字符串或数组。")


def _run(args: argparse.Namespace) -> dict[str, Any]:
    requests, file_options = _requests_from_args(args)
    generated_at = args.generated_at or now_utc()
    include_related = file_options.get(
        "include_related",
        args.include_related,
    )
    if not isinstance(include_related, bool):
        raise InputFailure("include_related 必须是 boolean。")
    return process_requests(
        requests,
        transport=_transport(args, generated_at),
        enabled_sources=_sources(file_options.get("sources", args.sources)),
        include_related=include_related,
        use_standardizer=not args.no_standardizer,
        standardizer_script=(args.standardizer_script or default_standardizer_path()),
        standardization_profile=file_options.get(
            "standardization_profile",
            args.standardization_profile,
        ),
        generated_at_utc=generated_at,
    )


def main() -> int:
    args = parse_args()
    try:
        document = _run(args)
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
    return 2 if document["input_summary"]["rejected"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
