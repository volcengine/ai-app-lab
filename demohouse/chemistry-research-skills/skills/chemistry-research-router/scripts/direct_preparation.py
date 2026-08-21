"""Build exact registered Adapter contexts for direct Skill requests."""

from __future__ import annotations

import csv
import hashlib
import importlib.util
import json
import stat
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class DirectPreparationError(ValueError):
    """Raised when a direct request lacks a controlled prerequisite."""


TARGET_ADAPTERS = {
    "resolve-chemical-identities": "resolve-chemical-identities-v1",
    "standardize-chemical-structures": "standardize-chemical-structures-v1",
    "compute-molecular-features": "compute-molecular-features-v1",
    "search-and-curate-chemical-libraries": ("search-and-curate-chemical-libraries-v1"),
    "curate-reactions": "curate-reactions-v1",
    "search-reactions": "search-reactions-v1",
    "review-routes": "review-routes-v1",
}


@dataclass(frozen=True)
class PreparedDirect:
    adapter_id: str
    command_context: dict[str, Any]
    output_path: Path


def _load_library_builder() -> Any:
    path = Path(__file__).with_name("request_library_builder.py")
    spec = importlib.util.spec_from_file_location(
        "router_direct_library_builder",
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load request_library_builder.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


LIBRARY = _load_library_builder()


def _write_json(path: Path, value: dict[str, Any]) -> None:
    try:
        text = json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        )
        with path.open("x", encoding="utf-8", newline="\n") as handle:
            handle.write(text + "\n")
    except (OSError, TypeError, ValueError) as error:
        raise DirectPreparationError(
            f"cannot write direct request: {path.name}"
        ) from error


def _parameters(request: dict[str, Any]) -> dict[str, Any]:
    return {item["field_id"]: item["value"] for item in request["parameters"]}


def _artifact(
    request: dict[str, Any],
    work_dir: Path,
    role: str,
) -> Path:
    matches = [item for item in request["inputs"]["artifacts"] if item["role"] == role]
    if len(matches) != 1:
        raise DirectPreparationError(f"direct target requires one {role}")
    declared = Path(matches[0]["path"])
    if declared.is_absolute() or declared == Path(".") or ".." in declared.parts:
        raise DirectPreparationError("direct input path is unsafe")
    path = work_dir / declared
    if path.is_symlink() or not path.is_file():
        raise DirectPreparationError("direct input must be a regular file")
    path_stat = path.stat()
    if not stat.S_ISREG(path_stat.st_mode) or path_stat.st_nlink != 1:
        raise DirectPreparationError("direct input hardlink is forbidden")
    if hashlib.sha256(path.read_bytes()).hexdigest() != matches[0]["sha256"]:
        raise DirectPreparationError("direct input hash mismatch")
    return path


def _objects(
    request: dict[str, Any],
    allowed: set[str],
) -> list[dict[str, Any]]:
    values = [
        item
        for item in request["inputs"]["research_objects"]
        if item["object_type"] in allowed
    ]
    if not values:
        raise DirectPreparationError("direct target research object is missing")
    return values


def _resolve_context(
    request: dict[str, Any],
    work_dir: Path,
    output_path: Path,
) -> dict[str, Any]:
    parameters = _parameters(request)
    input_types = {
        "compound_name": "name",
        "compound_identifier": "auto",
        "chemical_structure": "auto",
    }
    objects = _objects(request, set(input_types))
    queries = [
        {
            "id": item["object_id"],
            "query": item["representation"],
            "input_type": input_types[item["object_type"]],
        }
        for item in objects
    ]
    sources = (
        parameters.get("public_identity_sources", [])
        if request["execution_policy"]["network_mode"] == "public_http"
        else parameters.get("offline_identity_sources", [])
    )
    profile = parameters.get("standardization_profile", "chembl-pipeline")
    request_path = work_dir / "identity-request.json"
    _write_json(
        request_path,
        {
            "requests": queries,
            "options": {
                "sources": sources,
                "include_related": parameters.get(
                    "identity_include_related",
                    False,
                ),
                "standardization_profile": profile,
            },
        },
    )
    return {
        "request_path": str(request_path),
        "sources": sources,
        "include_related": parameters.get("identity_include_related", False),
        "use_standardizer": True,
        "standardization_profile": profile,
        "timeout_seconds": parameters.get("identity_timeout_seconds", 20),
        "retries": parameters.get("identity_retries", 0),
        "generated_at_utc": "1970-01-01T00:00:00Z",
        "output_path": str(output_path),
    }


def _standardize_context(
    request: dict[str, Any],
    work_dir: Path,
    output_path: Path,
) -> dict[str, Any]:
    objects = _objects(request, {"chemical_structure"})
    path = work_dir / "structures.csv"
    try:
        with path.open("x", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(
                handle,
                fieldnames=["id", "structure", "source"],
            )
            writer.writeheader()
            for item in objects:
                writer.writerow(
                    {
                        "id": item["object_id"],
                        "structure": item["representation"],
                        "source": "router_direct_request",
                    }
                )
    except OSError as error:
        raise DirectPreparationError("cannot write structure input") from error
    parameters = _parameters(request)
    return {
        "input_path": str(path),
        "input_format": "csv",
        "profile": parameters.get(
            "standardization_profile",
            "chembl-pipeline",
        ),
        "generated_at_utc": "1970-01-01T00:00:00Z",
        "output_path": str(output_path),
    }


def _features_context(
    request: dict[str, Any],
    work_dir: Path,
    output_path: Path,
) -> dict[str, Any]:
    parameters = _parameters(request)
    return {
        "input_path": str(_artifact(request, work_dir, "standardization_input")),
        "input_format": "json",
        "calculation_view": parameters.get(
            "calculation_view",
            "standardized",
        ),
        "generated_at_utc": "1970-01-01T00:00:00Z",
        "output_path": str(output_path),
    }


def _library_context(
    request: dict[str, Any],
    work_dir: Path,
    output_path: Path,
) -> dict[str, Any]:
    parameters = {
        key: (value, "catalog_default") for key, value in _parameters(request).items()
    }
    intent = {
        "requested_operations": [
            {**item, "negated": False} for item in request["inputs"]["operations"]
        ],
        "research_objects": request["inputs"]["research_objects"],
    }
    try:
        operation = LIBRARY.build_library_operation(intent, parameters)
    except LIBRARY.LibraryRequestError as error:
        raise DirectPreparationError(str(error)) from error
    if operation is None:
        raise DirectPreparationError("library operation is missing")
    feature_path = _artifact(request, work_dir, "features_input")
    request_path = work_dir / "library-request.json"
    _write_json(
        request_path,
        {
            "schema_version": "1.0.0",
            "operation": operation["operation"],
            "library_artifact": feature_path.relative_to(work_dir).as_posix(),
            "options": operation["options"],
            **({"queries": operation["queries"]} if "queries" in operation else {}),
        },
    )
    return {
        "request_path": str(request_path),
        "generated_at_utc": "1970-01-01T00:00:00Z",
        "output_path": str(output_path),
    }


def _curate_context(
    request: dict[str, Any],
    work_dir: Path,
    output_path: Path,
) -> dict[str, Any]:
    objects = _objects(request, {"reaction_record", "reaction_query"})
    records = [
        {
            "record_id": item["object_id"],
            "reaction_smiles": item["representation"],
            "stoichiometry_complete": True,
        }
        for item in objects
    ]
    request_path = work_dir / "curate-request.json"
    _write_json(
        request_path,
        {
            "schema_version": "1.0.0",
            "workflow": "curate-reactions",
            "input_profile": "reaction_smiles",
            "source": {
                "identifier": "router-direct-request",
                "content_sha256": hashlib.sha256(
                    repr(records).encode("utf-8")
                ).hexdigest(),
                "license": "user-provided",
            },
            "options": {
                "participant_view": "reported_form",
                "atom_mapping": "off",
                "balance_check": "diagnostic",
            },
            "upstream_artifacts": [],
            "records": records,
        },
    )
    return {
        "input_path": str(request_path),
        "output_path": str(output_path),
    }


def _search_context(
    request: dict[str, Any],
    work_dir: Path,
    output_path: Path,
) -> dict[str, Any]:
    parameters = _parameters(request)
    query_object = _objects(request, {"reaction_query", "reaction_record"})[0]
    operation = parameters.get("reaction_operation", "lookup_reaction")
    query = {"reaction_id": query_object["representation"]}
    request_path = work_dir / "search-request.json"
    _write_json(
        request_path,
        {
            "schema_version": "1.0.0",
            "workflow": "search-reactions",
            "operation": operation,
            "provider": parameters.get(
                "reaction_provider",
                "local_curated_corpus",
            ),
            "query": query,
            "options": {
                "fingerprint_profile_id": parameters.get("fingerprint_profile_id"),
                "top_k": parameters.get("reaction_top_k", 20),
                "threshold": parameters.get("similarity_threshold"),
                "candidate_limit": 100,
                "include_review_required": parameters.get(
                    "reaction_include_review_required",
                    False,
                ),
                "use_stereochemistry": parameters.get(
                    "reaction_use_stereochemistry",
                    True,
                ),
            },
            "corpus_artifact_path": _artifact(
                request,
                work_dir,
                "curation_input",
            )
            .relative_to(work_dir)
            .as_posix(),
        },
    )
    return {
        "input_path": str(request_path),
        "output_path": str(output_path),
    }


def _review_context(
    request: dict[str, Any],
    work_dir: Path,
    output_path: Path,
) -> dict[str, Any]:
    return {
        "input_path": str(_artifact(request, work_dir, "route_input")),
        "output_path": str(output_path),
    }


BUILDERS = {
    "resolve-chemical-identities": _resolve_context,
    "standardize-chemical-structures": _standardize_context,
    "compute-molecular-features": _features_context,
    "search-and-curate-chemical-libraries": _library_context,
    "curate-reactions": _curate_context,
    "search-reactions": _search_context,
    "review-routes": _review_context,
}


def prepare_direct(
    request: dict[str, Any],
    work_dir: Path,
) -> PreparedDirect:
    """Prepare one exact Adapter context without executing a subprocess."""
    target_id = request["target_id"]
    builder = BUILDERS.get(target_id)
    if builder is None:
        raise DirectPreparationError(f"unsupported direct target: {target_id}")
    output_path = work_dir / ".output.json.tmp"
    return PreparedDirect(
        adapter_id=TARGET_ADAPTERS[target_id],
        command_context=builder(request, work_dir, output_path),
        output_path=output_path,
    )
