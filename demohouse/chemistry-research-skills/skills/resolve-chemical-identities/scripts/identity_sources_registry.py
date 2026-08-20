"""ChEMBL and UniChem source adapters and enrichment orchestration."""

from __future__ import annotations

import importlib.util
import urllib.parse
from pathlib import Path
from typing import Any, Optional


CHEMBL_BASE = "https://www.ebi.ac.uk/chembl/api/data"
UNICHEM_BASE = "https://www.ebi.ac.uk/unichem/api/v1"


def _load_local(filename: str, module_name: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


TRANSPORT = _load_local(
    "identity_transport.py",
    "identity_sources_registry_transport",
)


def selected_chembl_record(
    record: dict[str, Any],
    match_method: str,
    source_url: str,
    query: Optional[str] = None,
) -> dict[str, Any]:
    structures = record.get("molecule_structures") or {}
    properties = record.get("molecule_properties") or {}
    synonyms = record.get("molecule_synonyms") or []
    names = []
    if record.get("pref_name"):
        names.append(record["pref_name"])
    for synonym in synonyms:
        if not isinstance(synonym, dict):
            continue
        value = synonym.get("molecule_synonym")
        if value and (query is None or value.casefold() == query.casefold()):
            names.append(value)
    raw_record = {
        "molecule_chembl_id": record.get("molecule_chembl_id"),
        "pref_name": record.get("pref_name"),
        "molecule_type": record.get("molecule_type"),
        "molecule_hierarchy": record.get("molecule_hierarchy"),
        "molecule_structures": structures,
        "molecule_properties": {
            key: properties.get(key)
            for key in ("full_molformula", "full_mwt")
            if key in properties
        },
        "matched_names": sorted(set(names), key=str.casefold),
    }
    return {
        "source": "ChEMBL",
        "source_family": "chembl",
        "source_record_id": record.get("molecule_chembl_id"),
        "match_method": match_method,
        "title": record.get("pref_name"),
        "names": sorted(set(names), key=str.casefold),
        "structure": structures.get("canonical_smiles"),
        "inchi": structures.get("standard_inchi"),
        "inchikey": structures.get("standard_inchi_key"),
        "molecular_formula": properties.get("full_molformula"),
        "source_url": source_url,
        "raw_record": raw_record,
        "record_findings": [],
    }


def _chembl_list_payload(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    if "molecules" in payload:
        return [
            item for item in payload.get("molecules") or [] if isinstance(item, dict)
        ]
    if payload.get("molecule_chembl_id"):
        return [payload]
    return []


def _chembl_result(
    result: dict[str, Any],
    records: list[dict[str, Any]],
    operation: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if result["status"] == "success" and not records:
        result = {
            **result,
            "status": "not_found",
            "error_kind": "not_found",
        }
    return records, [
        TRANSPORT.source_log(
            "ChEMBL",
            operation,
            result,
            len(records),
        )
    ]


def fetch_chembl_by_id(
    chembl_id: str,
    transport: Any,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    normalized = chembl_id.upper()
    url = f"{CHEMBL_BASE}/molecule/{urllib.parse.quote(normalized, safe='')}.json"
    result = transport.request_json("chembl_id", "GET", url)
    records = [
        selected_chembl_record(record, "chembl_id", url)
        for record in _chembl_list_payload(result.get("payload"))
    ]
    return _chembl_result(result, records, "lookup_chembl_id")


def fetch_chembl_by_inchikey(
    inchikey: str,
    transport: Any,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    query_string = urllib.parse.urlencode(
        {
            "molecule_structures__standard_inchi_key__iexact": inchikey,
            "limit": 20,
        }
    )
    url = f"{CHEMBL_BASE}/molecule.json?{query_string}"
    result = transport.request_json(
        f"chembl_inchikey:{inchikey}",
        "GET",
        url,
    )
    records = [
        selected_chembl_record(record, "full_inchikey", url)
        for record in _chembl_list_payload(result.get("payload"))
    ]
    return _chembl_result(result, records, "lookup_full_inchikey")


def fetch_chembl_by_name(
    name: str,
    transport: Any,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    records_by_id: dict[str, dict[str, Any]] = {}
    logs: list[dict[str, Any]] = []
    operations = (
        ("chembl_pref_name", "pref_name__iexact", "exact_preferred_name"),
        (
            "chembl_synonym",
            "molecule_synonyms__molecule_synonym__iexact",
            "exact_synonym",
        ),
    )
    for fixture_key, field, match_method in operations:
        url = f"{CHEMBL_BASE}/molecule.json?" + urllib.parse.urlencode(
            {field: name, "limit": 50}
        )
        result = transport.request_json(fixture_key, "GET", url)
        selected = [
            selected_chembl_record(record, match_method, url, name)
            for record in _chembl_list_payload(result.get("payload"))
        ]
        for record in selected:
            identifier = record.get("source_record_id") or TRANSPORT.sha256_json(record)
            existing = records_by_id.get(identifier)
            if existing is None:
                records_by_id[identifier] = record
            else:
                existing["names"] = sorted(
                    set(existing["names"] + record["names"]),
                    key=str.casefold,
                )
                existing["match_method"] = "exact_preferred_name_and_synonym"
        if result["status"] == "success" and not selected:
            result = {
                **result,
                "status": "not_found",
                "error_kind": "not_found",
            }
        logs.append(
            TRANSPORT.source_log(
                "ChEMBL",
                f"lookup_{match_method}",
                result,
                len(selected),
            )
        )
    return list(records_by_id.values()), logs


def selected_unichem_record(
    compound: dict[str, Any],
    source_url: str,
) -> dict[str, Any]:
    inchi_data = compound.get("inchi") or {}
    sources = compound.get("sources") or []
    selected_sources = [
        {
            "source": source.get("shortName"),
            "source_record_id": source.get("compoundId"),
            "source_url": source.get("url"),
        }
        for source in sources
        if isinstance(source, dict) and source.get("shortName") in {"pubchem", "chembl"}
    ]
    return {
        "source": "UniChem",
        "source_family": "unichem",
        "source_record_id": (
            str(compound.get("uci")) if compound.get("uci") is not None else None
        ),
        "match_method": "exact_full_inchikey",
        "title": None,
        "names": [],
        "structure": None,
        "inchi": inchi_data.get("inchi"),
        "inchikey": compound.get("standardInchiKey"),
        "molecular_formula": inchi_data.get("formula"),
        "source_url": source_url,
        "raw_record": {
            "uci": compound.get("uci"),
            "standardInchiKey": compound.get("standardInchiKey"),
            "inchi": inchi_data,
            "selected_source_mappings": selected_sources,
            "source_mapping_count": len(sources),
        },
        "record_findings": [],
    }


def fetch_unichem_exact(
    inchikey: str,
    transport: Any,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    url = f"{UNICHEM_BASE}/compounds"
    result = transport.request_json(
        f"unichem_exact:{inchikey}",
        "POST",
        url,
        {"compound": inchikey, "type": "inchikey"},
        "json",
    )
    payload = result.get("payload")
    records = []
    if result["status"] == "success" and isinstance(payload, dict):
        records = [
            selected_unichem_record(compound, url)
            for compound in payload.get("compounds") or []
            if isinstance(compound, dict)
        ]
        if not records:
            result = {
                **result,
                "status": "not_found",
                "error_kind": "not_found",
                "message": "UniChem exact 未返回匹配。",
            }
    return records, [
        TRANSPORT.source_log(
            "UniChem",
            "exact_full_inchikey",
            result,
            len(records),
        )
    ]


def fetch_unichem_connectivity(
    inchikey: str,
    transport: Any,
) -> tuple[Optional[dict[str, Any]], list[dict[str, Any]]]:
    url = f"{UNICHEM_BASE}/connectivity"
    result = transport.request_json(
        f"unichem_connectivity:{inchikey}",
        "POST",
        url,
        {
            "compound": inchikey,
            "type": "inchikey",
            "searchComponents": True,
        },
        "json",
    )
    payload = result.get("payload")
    summary = None
    if result["status"] == "success" and isinstance(payload, dict):
        sources = [
            item for item in payload.get("sources") or [] if isinstance(item, dict)
        ]
        type_counts: dict[str, int] = {}
        layer_counts: dict[str, int] = {}
        for source in sources:
            search_type = str(source.get("typeOfSearch") or "unknown")
            type_counts[search_type] = type_counts.get(search_type, 0) + 1
            for layer, same in (source.get("comparison") or {}).items():
                if same is False:
                    layer_counts[layer] = layer_counts.get(layer, 0) + 1
        selected_sources = [
            {
                "source": source.get("shortName"),
                "source_record_id": source.get("compoundId"),
                "source_url": source.get("url"),
                "type_of_search": source.get("typeOfSearch"),
                "searched_component_index": source.get("searchedInchiPos"),
                "layer_comparison": source.get("comparison"),
            }
            for source in sources
            if source.get("shortName") in {"pubchem", "chembl"}
        ][:100]
        summary = {
            "query_inchikey": inchikey,
            "searched_compound": payload.get("searchedCompound"),
            "total_compounds": payload.get("totalCompounds"),
            "total_sources": payload.get("totalSources"),
            "search_type_counts": type_counts,
            "layer_difference_counts": layer_counts,
            "selected_source_records": selected_sources,
            "selected_source_records_truncated": len(selected_sources) >= 100,
        }
    return summary, [
        TRANSPORT.source_log(
            "UniChem",
            "connectivity_related_forms",
            result,
            len((summary or {}).get("selected_source_records", [])),
        )
    ]
