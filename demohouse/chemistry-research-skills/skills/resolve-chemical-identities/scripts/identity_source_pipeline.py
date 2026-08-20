"""Source ordering for identity resolution without alignment decisions."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any, Callable


def _load_local(filename: str, module_name: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


PRIMARY = _load_local(
    "identity_sources_primary.py",
    "identity_source_pipeline_primary",
)
REGISTRY = _load_local(
    "identity_sources_registry.py",
    "identity_source_pipeline_registry",
)


def _candidate_keys(
    records: list[dict[str, Any]],
    toolkit: dict[str, Any],
    candidate_aggregator: Callable[..., tuple[list, list, list]],
) -> list[str]:
    candidates, _, _ = candidate_aggregator(records, toolkit)
    return sorted(
        {candidate["inchikey"] for candidate in candidates if candidate["inchikey"]}
    )


def _extend(
    target_records: list[dict[str, Any]],
    target_logs: list[dict[str, Any]],
    result: tuple[list[dict[str, Any]], list[dict[str, Any]]],
) -> None:
    records, logs = result
    target_records.extend(records)
    target_logs.extend(logs)


def _collect_chembl(
    validated: dict[str, Any],
    existing_records: list[dict[str, Any]],
    records: list[dict[str, Any]],
    logs: list[dict[str, Any]],
    transport: Any,
    toolkit: dict[str, Any],
    candidate_aggregator: Callable[..., tuple[list, list, list]],
) -> None:
    query = validated["normalized_query"]
    input_type = validated["detected_input_type"]
    if input_type == "chembl_id":
        _extend(
            records,
            logs,
            REGISTRY.fetch_chembl_by_id(query, transport),
        )
        return
    if input_type in {"name", "cas_rn"}:
        _extend(
            records,
            logs,
            REGISTRY.fetch_chembl_by_name(query, transport),
        )
        return
    for key in _candidate_keys(
        [*existing_records, *records],
        toolkit,
        candidate_aggregator,
    ):
        _extend(
            records,
            logs,
            REGISTRY.fetch_chembl_by_inchikey(key, transport),
        )


def collect_enrichment_sources(
    validated: dict[str, Any],
    existing_records: list[dict[str, Any]],
    transport: Any,
    enabled_sources: set[str],
    include_related: bool,
    toolkit: dict[str, Any],
    candidate_aggregator: Callable[..., tuple[list, list, list]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    records: list[dict[str, Any]] = []
    logs: list[dict[str, Any]] = []
    relationships: list[dict[str, Any]] = []
    if "chembl" in enabled_sources:
        _collect_chembl(
            validated,
            existing_records,
            records,
            logs,
            transport,
            toolkit,
            candidate_aggregator,
        )
    all_records = [*existing_records, *records]
    keys = _candidate_keys(all_records, toolkit, candidate_aggregator)
    if validated["detected_input_type"] == "chembl_id" and "pubchem" in enabled_sources:
        for key in keys:
            _extend(
                records,
                logs,
                PRIMARY.fetch_pubchem(key, "inchikey", transport),
            )
        keys = _candidate_keys(
            [*existing_records, *records],
            toolkit,
            candidate_aggregator,
        )
    if "unichem" in enabled_sources:
        for key in keys:
            _extend(
                records,
                logs,
                REGISTRY.fetch_unichem_exact(key, transport),
            )
            if include_related:
                summary, relation_logs = REGISTRY.fetch_unichem_connectivity(
                    key, transport
                )
                logs.extend(relation_logs)
                relationships.extend([summary] if summary else [])
    return records, logs, relationships
