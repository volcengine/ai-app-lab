"""Map requested library operations to the public Workflow A contract."""

from __future__ import annotations

from typing import Any


class LibraryRequestError(ValueError):
    """Raised when a library operation lacks controlled inputs."""


OPERATION_MAP = {
    "curate_library": "audit_library",
    "search_similarity": "similarity_search",
    "search_substructure": "substructure_search",
    "cluster_library": "cluster_library",
    "select_diverse_compounds": "select_diverse_subset",
}


def _value(
    parameters: dict[str, tuple[Any, str]],
    field_id: str,
    fallback: Any = None,
) -> Any:
    item = parameters.get(field_id)
    return fallback if item is None else item[0]


def _requested_operation(intent: dict[str, Any]) -> str | None:
    requested = [
        item["operation_type"]
        for item in sorted(
            intent["requested_operations"],
            key=lambda value: value["sequence"],
        )
        if item["negated"] is False and item["operation_type"] in OPERATION_MAP
    ]
    if not requested:
        return None
    if len(set(requested)) != 1:
        raise LibraryRequestError("multiple library operations require clarification")
    return OPERATION_MAP[requested[0]]


def _common_options(
    parameters: dict[str, tuple[Any, str]],
) -> dict[str, Any]:
    return {
        "calculation_view": _value(
            parameters,
            "calculation_view",
            "standardized",
        ),
        "include_review_required": _value(
            parameters,
            "library_include_review_required",
            False,
        ),
    }


def _fingerprint_options(
    parameters: dict[str, tuple[Any, str]],
) -> dict[str, Any]:
    return {
        "fingerprint_profile_id": _value(
            parameters,
            "fingerprint_profile_id",
            _value(
                parameters,
                "library_fingerprint_profile_id",
                "rdkit-morgan-r2-2048-chiral1-bit-v1",
            ),
        ),
        "metric": _value(parameters, "library_metric", "tanimoto"),
    }


def _similarity_request(
    intent: dict[str, Any],
    parameters: dict[str, tuple[Any, str]],
) -> dict[str, Any]:
    options = {
        **_common_options(parameters),
        **_fingerprint_options(parameters),
        "include_self": _value(parameters, "library_include_self", False),
    }
    threshold = _value(parameters, "similarity_threshold")
    if threshold is None:
        options["top_k"] = _value(
            parameters,
            "top_k",
            _value(
                parameters,
                "library_top_k",
                20,
            ),
        )
    else:
        options["threshold"] = threshold
    compounds = [
        item
        for item in intent["research_objects"]
        if item["object_type"]
        in {
            "compound_name",
            "compound_identifier",
            "chemical_structure",
        }
    ]
    queries = [
        {"id": item["object_id"], "record_index": index}
        for index, item in enumerate(compounds)
    ]
    if not queries:
        raise LibraryRequestError("similarity search requires a compound query")
    return {
        "operation": "similarity_search",
        "options": options,
        "queries": queries,
    }


def _substructure_request(
    intent: dict[str, Any],
    parameters: dict[str, tuple[Any, str]],
) -> dict[str, Any]:
    structures = [
        item
        for item in intent["research_objects"]
        if item["object_type"] == "chemical_structure"
    ]
    if not structures:
        raise LibraryRequestError(
            "substructure search requires an explicit chemical structure"
        )
    if any(
        item["representation"].lstrip().startswith("InChI=")
        or "\n" in item["representation"]
        for item in structures
    ):
        raise LibraryRequestError(
            "substructure search requires an explicit SMILES query"
        )
    return {
        "operation": "substructure_search",
        "options": _common_options(parameters),
        "queries": [
            {
                "id": item["object_id"],
                "query_type": "smiles",
                "query": item["representation"],
                "use_chirality": True,
                "max_results": _value(
                    parameters,
                    "top_k",
                    _value(parameters, "library_top_k", 20),
                ),
            }
            for item in structures
        ],
    }


def _cluster_request(
    parameters: dict[str, tuple[Any, str]],
) -> dict[str, Any]:
    threshold = _value(parameters, "similarity_threshold")
    if threshold is None:
        raise LibraryRequestError("cluster_library requires similarity_threshold")
    return {
        "operation": "cluster_library",
        "options": {
            **_common_options(parameters),
            **_fingerprint_options(parameters),
            "similarity_threshold": threshold,
        },
    }


def _diversity_request(
    parameters: dict[str, tuple[Any, str]],
) -> dict[str, Any]:
    seed = _value(parameters, "seed")
    if seed is None:
        raise LibraryRequestError("select_diverse_subset requires an explicit seed")
    return {
        "operation": "select_diverse_subset",
        "options": {
            **_common_options(parameters),
            **_fingerprint_options(parameters),
            "pick_size": _value(
                parameters,
                "top_k",
                _value(parameters, "library_top_k", 20),
            ),
            "seed": seed,
        },
    }


def build_library_operation(
    intent: dict[str, Any],
    parameters: dict[str, tuple[Any, str]],
) -> dict[str, Any] | None:
    """Build one controlled library operation or return no optional step."""
    operation = _requested_operation(intent)
    if operation is None:
        return None
    if operation == "audit_library":
        return {
            "operation": operation,
            "options": _common_options(parameters),
        }
    if operation == "similarity_search":
        return _similarity_request(intent, parameters)
    if operation == "substructure_search":
        return _substructure_request(intent, parameters)
    if operation == "cluster_library":
        return _cluster_request(parameters)
    return _diversity_request(parameters)
