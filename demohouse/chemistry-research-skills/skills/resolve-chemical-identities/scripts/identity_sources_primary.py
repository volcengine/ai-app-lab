"""OPSIN and PubChem source adapters."""

from __future__ import annotations

import importlib.util
import urllib.parse
from pathlib import Path
from typing import Any, Optional


PUBCHEM_BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"
OPSIN_BASE = "https://www.ebi.ac.uk/opsin/ws"
PUBCHEM_PROPERTIES = (
    "Title,IUPACName,MolecularFormula,CanonicalSMILES,IsomericSMILES,"
    "ConnectivitySMILES,InChI,InChIKey"
)


def _load_transport() -> Any:
    path = Path(__file__).with_name("identity_transport.py")
    spec = importlib.util.spec_from_file_location(
        "identity_sources_primary_transport",
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load identity_transport.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


TRANSPORT = _load_transport()


def fetch_opsin(
    name: str,
    transport: Any,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    url = f"{OPSIN_BASE}/{urllib.parse.quote(name, safe='')}.json"
    result = transport.request_json("opsin", "GET", url)
    payload = result.get("payload")
    records: list[dict[str, Any]] = []
    message = TRANSPORT.payload_message(payload)
    if result["status"] == "success" and isinstance(payload, dict):
        opsin_status = str(payload.get("status") or "").upper()
        if opsin_status in {"SUCCESS", "WARNING"}:
            findings = []
            if opsin_status == "WARNING":
                findings.append(
                    {
                        "code": "R-OPSIN-WARNING",
                        "severity": "review",
                        "message": message or "OPSIN 返回 WARNING。",
                    }
                )
            records.append(
                {
                    "source": "OPSIN",
                    "source_family": "opsin",
                    "source_record_id": None,
                    "match_method": "systematic_name_parser",
                    "title": name,
                    "names": [name],
                    "structure": payload.get("smiles"),
                    "inchi": payload.get("stdinchi"),
                    "inchikey": payload.get("stdinchikey"),
                    "molecular_formula": None,
                    "source_url": url,
                    "raw_record": payload,
                    "record_findings": findings,
                }
            )
        else:
            result = {
                **result,
                "status": "not_found",
                "error_kind": "not_found",
            }
    elif result["status"] == "not_found" and isinstance(payload, dict):
        message = TRANSPORT.payload_message(payload)
    return records, [
        TRANSPORT.source_log(
            "OPSIN",
            "name_to_structure",
            result,
            len(records),
            message,
        )
    ]


def pubchem_request_spec(
    query: str,
    input_type: str,
) -> tuple[str, str, Optional[dict[str, Any]], str]:
    namespace = {
        "name": "name",
        "cas_rn": "name",
        "smiles": "smiles",
        "inchi": "inchi",
        "inchikey": "inchikey",
        "pubchem_cid": "cid",
    }.get(input_type)
    if namespace is None:
        raise ValueError(f"PubChem 不支持 input_type={input_type}")
    if namespace in {"smiles", "inchi"}:
        url = f"{PUBCHEM_BASE}/compound/{namespace}/property/{PUBCHEM_PROPERTIES}/JSON"
        return "POST", url, {namespace: query}, "form"
    encoded = urllib.parse.quote(query, safe="")
    url = (
        f"{PUBCHEM_BASE}/compound/{namespace}/{encoded}/property/"
        f"{PUBCHEM_PROPERTIES}/JSON"
    )
    return "GET", url, None, "json"


def selected_pubchem_record(
    record: dict[str, Any],
    match_method: str,
    source_url: str,
) -> dict[str, Any]:
    structure = (
        record.get("IsomericSMILES")
        or record.get("SMILES")
        or record.get("CanonicalSMILES")
        or record.get("ConnectivitySMILES")
    )
    return {
        "source": "PubChem",
        "source_family": "pubchem",
        "source_record_id": (
            str(record.get("CID")) if record.get("CID") is not None else None
        ),
        "match_method": match_method,
        "title": record.get("Title"),
        "names": [
            value for value in (record.get("Title"), record.get("IUPACName")) if value
        ],
        "structure": structure,
        "inchi": record.get("InChI"),
        "inchikey": record.get("InChIKey"),
        "molecular_formula": record.get("MolecularFormula"),
        "source_url": source_url,
        "raw_record": record,
        "record_findings": [],
    }


def fetch_pubchem(
    query: str,
    input_type: str,
    transport: Any,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    method, url, body, body_format = pubchem_request_spec(query, input_type)
    result = transport.request_json(
        "pubchem",
        method,
        url,
        body,
        body_format,
    )
    records: list[dict[str, Any]] = []
    if result["status"] == "success":
        properties = (
            (result.get("payload") or {}).get("PropertyTable", {}).get("Properties", [])
        )
        if isinstance(properties, list):
            records = [
                selected_pubchem_record(
                    item,
                    f"query_{input_type}",
                    url,
                )
                for item in properties
                if isinstance(item, dict)
            ]
        if not records:
            result = {
                **result,
                "status": "not_found",
                "error_kind": "not_found",
                "message": "PubChem 未返回化合物属性记录。",
            }
    return records, [
        TRANSPORT.source_log(
            "PubChem",
            f"lookup_{input_type}",
            result,
            len(records),
        )
    ]


def collect_initial_sources(
    validated: dict[str, Any],
    transport: Any,
    enabled_sources: set[str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    query = validated["normalized_query"]
    input_type = validated["detected_input_type"]
    records: list[dict[str, Any]] = []
    logs: list[dict[str, Any]] = []
    if validated.get("local_record"):
        records.append(validated["local_record"])
    if "opsin" in enabled_sources and input_type == "name":
        found, queried = fetch_opsin(query, transport)
        records.extend(found)
        logs.extend(queried)
    if "pubchem" in enabled_sources and input_type != "chembl_id":
        found, queried = fetch_pubchem(query, input_type, transport)
        records.extend(found)
        logs.extend(queried)
    return records, logs
