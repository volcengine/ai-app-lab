"""Runtime dependencies, versions, and source metadata."""

from __future__ import annotations

import importlib.util
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


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
    "identity_runtime_transport",
)


class DependencyFailure(RuntimeError):
    """A pinned runtime dependency is unavailable."""


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_toolkit() -> dict[str, Any]:
    try:
        import rdkit
        from rdkit import Chem, RDLogger
        from rdkit.Chem import inchi, rdMolDescriptors
    except ImportError as error:
        raise DependencyFailure(
            "缺少 rdkit==2025.9.2；请在隔离环境安装 scripts/requirements.txt"
        ) from error
    RDLogger.DisableLog("rdApp.error")
    return {
        "rdkit": rdkit,
        "Chem": Chem,
        "inchi": inchi,
        "rdMolDescriptors": rdMolDescriptors,
    }


def toolkit_versions(toolkit: dict[str, Any]) -> dict[str, Any]:
    return {
        "resolver": "1.0.0",
        "rdkit": toolkit["rdkit"].__version__,
        "inchi_provider": {
            "name": "rdkit.Chem.inchi",
            "embedded_inchi_version": "not_exposed_by_rdkit_python_api",
        },
        "opsin": {
            "runtime": "official_web_api_when_enabled",
            "service_version": "not_exposed_by_api",
            "reviewed_release": "2.9.0",
        },
        "pubchem": {
            "api": "PUG REST",
            "service_version": "not_exposed_by_api",
        },
        "chembl": {
            "api": "ChEMBL Data Web Services",
            "database_version": "runtime",
        },
        "unichem": {"api": "POST API v1 (2.0 documentation)"},
    }


def _base_source_metadata(enabled_sources: set[str]) -> dict[str, Any]:
    return {
        "OPSIN": {
            "enabled": "opsin" in enabled_sources,
            "service_version": "not_exposed_by_api",
            "reviewed_release": "2.9.0",
            "documentation_url": (
                "https://github.com/dan2097/opsin/releases/tag/2.9.0"
            ),
        },
        "PubChem": {
            "enabled": "pubchem" in enabled_sources,
            "service_version": "not_exposed_by_api",
            "api": "PUG REST",
            "documentation_url": ("https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest"),
        },
        "ChEMBL": {
            "enabled": "chembl" in enabled_sources,
            "database_version": None,
            "release_date": None,
            "api_status": None,
            "documentation_url": (
                "https://chembl.gitbook.io/chembl-interface-documentation/"
                "web-services/chembl-data-web-services"
            ),
        },
        "UniChem": {
            "enabled": "unichem" in enabled_sources,
            "service_version": "not_exposed_by_api",
            "api": "POST API v1 (2.0 documentation)",
            "documentation_url": "https://chembl.gitbook.io/unichem/api",
        },
    }


def fetch_source_metadata(
    enabled_sources: set[str],
    transport: Any,
) -> dict[str, Any]:
    metadata = _base_source_metadata(enabled_sources)
    if "chembl" not in enabled_sources:
        return metadata
    url = "https://www.ebi.ac.uk/chembl/api/data/status.json"
    result = transport.request_json("chembl_status", "GET", url)
    payload = result.get("payload")
    if result["status"] == "success" and isinstance(payload, dict):
        metadata["ChEMBL"].update(
            {
                "database_version": payload.get("chembl_db_version"),
                "release_date": payload.get("chembl_release_date"),
                "api_status": payload.get("status"),
                "database_counts": {
                    key: payload.get(key)
                    for key in (
                        "activities",
                        "compound_records",
                        "disinct_compounds",
                        "publications",
                        "targets",
                    )
                    if key in payload
                },
            }
        )
    metadata["ChEMBL"]["status_query"] = TRANSPORT.source_log(
        "ChEMBL",
        "runtime_status",
        result,
        1 if isinstance(payload, dict) else 0,
    )
    return metadata
