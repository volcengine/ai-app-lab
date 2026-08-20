"""Deterministic handoffs for the four bounded chemistry chains."""

from __future__ import annotations

import csv
import hashlib
import importlib.util
import io
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class ChainHandoffError(ValueError):
    """Raised when an upstream result cannot form a controlled handoff."""


def _load_sibling(name: str, filename: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


LIBRARY = _load_sibling(
    "router_chain_library_builder",
    "request_library_builder.py",
)


@dataclass(frozen=True)
class HandoffDocument:
    payload: dict[str, Any]
    upstream_artifact_id: str
    upstream_artifact_sha256: str


def parameter_values(request: dict[str, Any]) -> dict[str, Any]:
    return {item["field_id"]: item["value"] for item in request["parameters"]}


def _value(parameters: dict[str, Any], field_id: str, fallback: Any) -> Any:
    return parameters.get(field_id, fallback)


def _compound_queries(request: dict[str, Any]) -> list[dict[str, str]]:
    input_types = {
        "compound_name": "name",
        "compound_identifier": "auto",
        "chemical_structure": "auto",
    }
    queries = [
        {
            "id": item["object_id"],
            "query": item["representation"],
            "input_type": input_types[item["object_type"]],
        }
        for item in request["inputs"]["research_objects"]
        if item["object_type"] in input_types
    ]
    if not queries:
        raise ChainHandoffError("chain requires a compound research object")
    return queries


def workflow_a_request(request: dict[str, Any]) -> dict[str, Any]:
    """Translate a compound chain request into the existing node contract."""
    parameters = parameter_values(request)
    operations = [
        {
            **item,
            "negated": False,
        }
        for item in request["inputs"]["operations"]
    ]
    library_intent = {
        "requested_operations": operations,
        "research_objects": request["inputs"]["research_objects"],
    }
    parameter_sources = {
        key: (value, "catalog_default") for key, value in parameters.items()
    }
    try:
        library_operation = LIBRARY.build_library_operation(
            library_intent,
            parameter_sources,
        )
    except LIBRARY.LibraryRequestError as error:
        raise ChainHandoffError(str(error)) from error
    sources = (
        _value(parameters, "public_identity_sources", [])
        if request["execution_policy"]["network_mode"] == "public_http"
        else _value(parameters, "offline_identity_sources", [])
    )
    return {
        "schema_version": "1.0.0",
        "workflow_id": "compound-evidence-v1",
        "request_id": request["request_id"],
        "inputs": {
            "queries": _compound_queries(request),
            "identity": {
                "sources": sources,
                "include_related": _value(
                    parameters,
                    "identity_include_related",
                    False,
                ),
                "timeout_seconds": _value(
                    parameters,
                    "identity_timeout_seconds",
                    20,
                ),
                "retries": _value(parameters, "identity_retries", 0),
            },
            "standardization": {
                "profile": _value(
                    parameters,
                    "standardization_profile",
                    "chembl-pipeline",
                )
            },
            "features": {
                "calculation_view": _value(
                    parameters,
                    "calculation_view",
                    "standardized",
                )
            },
            "library_operation": library_operation,
        },
        "execution_policy": dict(request["execution_policy"]),
    }


def structure_input_documents(
    request: dict[str, Any],
) -> tuple[bytes, dict[str, Any]]:
    """Create the initial CSV and binding for structure-first chains."""
    rows = [
        item
        for item in request["inputs"]["research_objects"]
        if item["object_type"] == "chemical_structure"
    ]
    if not rows:
        raise ChainHandoffError("structure chain requires chemical_structure")
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=["id", "structure", "source"])
    writer.writeheader()
    binding_rows = []
    for index, item in enumerate(rows):
        writer.writerow(
            {
                "id": item["object_id"],
                "structure": item["representation"],
                "source": "router_chain_request",
            }
        )
        binding_rows.append(
            {
                "row_index": index,
                "record_id": item["object_id"],
                "source_type": "router_chain_request",
                "source_artifact_id": None,
                "source_artifact_sha256": None,
                "source_candidate_id": None,
                "decision_artifact_id": None,
                "decision_artifact_sha256": None,
            }
        )
    return buffer.getvalue().encode("utf-8"), {
        "schema_version": "1.0.0",
        "workflow": "compound-standardization-input-binding",
        "rows": binding_rows,
    }


def feature_to_library_request(
    artifact_entry: dict[str, Any],
    operation: dict[str, Any],
) -> HandoffDocument:
    value = {
        "schema_version": "1.0.0",
        "operation": operation["operation"],
        "library_artifact": artifact_entry["relative_path"],
        "options": operation["options"],
    }
    if "queries" in operation:
        value["queries"] = operation["queries"]
    return HandoffDocument(
        payload=value,
        upstream_artifact_id=artifact_entry["artifact_id"],
        upstream_artifact_sha256=artifact_entry["sha256"],
    )


def curate_request(request: dict[str, Any]) -> dict[str, Any]:
    records = [
        {
            "record_id": item["object_id"],
            "reaction_smiles": item["representation"],
            "stoichiometry_complete": True,
        }
        for item in request["inputs"]["research_objects"]
        if item["object_type"] in {"reaction_record", "reaction_query"}
    ]
    if not records:
        raise ChainHandoffError("reaction chain requires a reaction record")
    content = repr(records).encode("utf-8")
    return {
        "schema_version": "1.0.0",
        "workflow": "curate-reactions",
        "input_profile": "reaction_smiles",
        "source": {
            "identifier": "router-chain-request",
            "content_sha256": hashlib.sha256(content).hexdigest(),
            "license": "user-provided",
        },
        "options": {
            "participant_view": "reported_form",
            "atom_mapping": "off",
            "balance_check": "diagnostic",
        },
        "upstream_artifacts": [],
        "records": records,
    }


def curation_to_search_request(
    artifact_entry: dict[str, Any],
    artifact_document: dict[str, Any],
    request: dict[str, Any],
) -> HandoffDocument:
    parameters = parameter_values(request)
    records = artifact_document.get("records")
    if not isinstance(records, list) or not records:
        raise ChainHandoffError("curation Artifact has no searchable record")
    record_id = records[0].get("record_id")
    if not isinstance(record_id, str):
        raise ChainHandoffError("curation record ID is invalid")
    operation = _value(parameters, "reaction_operation", "lookup_reaction")
    query = {"reaction_id": record_id}
    if operation == "search_similar_reactions":
        query = {"reaction_smiles": records[0]["reaction_smiles"]["canonical_unmapped"]}
    payload = {
        "schema_version": "1.0.0",
        "workflow": "search-reactions",
        "operation": operation,
        "provider": _value(
            parameters,
            "reaction_provider",
            "local_curated_corpus",
        ),
        "query": query,
        "options": {
            "fingerprint_profile_id": parameters.get("fingerprint_profile_id"),
            "top_k": _value(parameters, "reaction_top_k", 20),
            "threshold": parameters.get("similarity_threshold"),
            "candidate_limit": 100,
            "include_review_required": _value(
                parameters,
                "reaction_include_review_required",
                False,
            ),
            "use_stereochemistry": _value(
                parameters,
                "reaction_use_stereochemistry",
                True,
            ),
        },
        "corpus_artifact": artifact_document,
    }
    return HandoffDocument(
        payload=payload,
        upstream_artifact_id=artifact_entry["artifact_id"],
        upstream_artifact_sha256=artifact_entry["sha256"],
    )
