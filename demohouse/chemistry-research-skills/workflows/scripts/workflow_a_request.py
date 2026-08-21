"""Strict request contract for compound-evidence-v1."""

from __future__ import annotations

import math
from typing import Any


INPUT_FIELDS = {
    "queries",
    "identity",
    "standardization",
    "features",
    "library_operation",
}
QUERY_FIELDS = {"id", "query", "input_type"}
IDENTITY_FIELDS = {
    "sources",
    "include_related",
    "timeout_seconds",
    "retries",
}
STANDARDIZATION_FIELDS = {"profile"}
FEATURE_FIELDS = {"calculation_view"}
LIBRARY_REQUIRED_FIELDS = {"operation", "options"}
LIBRARY_OPTIONAL_FIELDS = {"queries"}
INPUT_TYPES = {
    "auto",
    "name",
    "smiles",
    "inchi",
    "inchikey",
    "pubchem_cid",
    "chembl_id",
    "cas_rn",
}
SOURCES = {"opsin", "pubchem", "chembl", "unichem"}
PROFILES = {"chembl-pipeline", "rdkit-basic"}
CALCULATION_VIEWS = {"standardized", "parent"}
LIBRARY_OPERATIONS = {
    "audit_library",
    "similarity_search",
    "substructure_search",
    "cluster_library",
    "select_diverse_subset",
}
COMMON_LIBRARY_OPTIONS = {"calculation_view", "include_review_required"}
FINGERPRINT_LIBRARY_OPTIONS = {"fingerprint_profile_id", "metric"}


class WorkflowARequestError(ValueError):
    """Raised when a Workflow A request is not exact and executable."""


def _object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise WorkflowARequestError(f"{label} must be an object")
    return value


def _exact(
    value: dict[str, Any],
    required: set[str],
    optional: set[str],
    label: str,
) -> None:
    missing = sorted(required - value.keys())
    unknown = sorted(value.keys() - required - optional)
    if missing or unknown:
        raise WorkflowARequestError(
            f"{label}: missing={missing}, unknown fields={unknown}"
        )


def _controlled_string(value: Any, allowed: set[str], label: str) -> str:
    if not isinstance(value, str) or value not in allowed:
        raise WorkflowARequestError(f"{label} is unsupported")
    return value


def _bounded_int(value: Any, minimum: int, maximum: int, label: str) -> int:
    if (
        isinstance(value, bool)
        or not isinstance(value, int)
        or not minimum <= value <= maximum
    ):
        raise WorkflowARequestError(
            f"{label} must be an integer from {minimum} to {maximum}"
        )
    return value


def _validate_queries(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list) or not value:
        raise WorkflowARequestError("inputs.queries must be a non-empty array")
    queries: list[dict[str, str]] = []
    identifiers: set[str] = set()
    for index, item in enumerate(value):
        query = _object(item, f"inputs.queries[{index}]")
        _exact(query, QUERY_FIELDS, set(), f"inputs.queries[{index}]")
        identifier = query["id"]
        text = query["query"]
        if not isinstance(identifier, str) or not identifier.strip():
            raise WorkflowARequestError(f"inputs.queries[{index}].id is invalid")
        if identifier in identifiers:
            raise WorkflowARequestError("inputs.queries IDs must be unique")
        if not isinstance(text, str) or not text.strip():
            raise WorkflowARequestError(f"inputs.queries[{index}].query is invalid")
        input_type = _controlled_string(
            query["input_type"],
            INPUT_TYPES,
            f"inputs.queries[{index}].input_type",
        )
        identifiers.add(identifier)
        queries.append(
            {
                "id": identifier,
                "query": text,
                "input_type": input_type,
            }
        )
    return queries


def _validate_identity(
    value: Any,
    network_mode: str,
) -> dict[str, Any]:
    identity = _object(value, "inputs.identity")
    _exact(identity, IDENTITY_FIELDS, set(), "inputs.identity")
    sources = identity["sources"]
    if (
        not isinstance(sources, list)
        or not all(isinstance(item, str) and item in SOURCES for item in sources)
        or len(sources) != len(set(sources))
    ):
        raise WorkflowARequestError("inputs.identity.sources is invalid")
    if network_mode == "offline" and sources:
        raise WorkflowARequestError("offline workflow requires empty identity sources")
    if not isinstance(identity["include_related"], bool):
        raise WorkflowARequestError("inputs.identity.include_related must be boolean")
    return {
        "sources": list(sources),
        "include_related": identity["include_related"],
        "timeout_seconds": _bounded_int(
            identity["timeout_seconds"],
            1,
            60,
            "inputs.identity.timeout_seconds",
        ),
        "retries": _bounded_int(
            identity["retries"],
            0,
            3,
            "inputs.identity.retries",
        ),
    }


def _validate_library(value: Any) -> dict[str, Any] | None:
    if value is None:
        return None
    library = _object(value, "inputs.library_operation")
    _exact(
        library,
        LIBRARY_REQUIRED_FIELDS,
        LIBRARY_OPTIONAL_FIELDS,
        "inputs.library_operation",
    )
    operation = _controlled_string(
        library["operation"],
        LIBRARY_OPERATIONS,
        "inputs.library_operation.operation",
    )
    options = _object(library["options"], "inputs.library_operation.options")
    queries = library.get("queries")
    normalized_options = _validate_library_options(operation, options)
    normalized_queries = _validate_library_queries(operation, queries)
    return {
        "operation": operation,
        "options": normalized_options,
        **({"queries": normalized_queries} if normalized_queries is not None else {}),
    }


def _require_boolean(value: Any, label: str) -> bool:
    if not isinstance(value, bool):
        raise WorkflowARequestError(f"{label} must be boolean")
    return value


def _require_number(
    value: Any,
    minimum: float,
    maximum: float,
    label: str,
) -> int | float:
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(float(value))
        or not minimum <= float(value) <= maximum
    ):
        raise WorkflowARequestError(
            f"{label} must be a finite number from {minimum} to {maximum}"
        )
    return value


def _validate_common_library_options(options: dict[str, Any]) -> None:
    _controlled_string(
        options["calculation_view"],
        CALCULATION_VIEWS,
        "inputs.library_operation.options.calculation_view",
    )
    _require_boolean(
        options["include_review_required"],
        "inputs.library_operation.options.include_review_required",
    )


def _library_option_fields(operation: str) -> tuple[set[str], set[str]]:
    if operation == "audit_library":
        return COMMON_LIBRARY_OPTIONS, set()
    if operation == "similarity_search":
        return (
            COMMON_LIBRARY_OPTIONS | FINGERPRINT_LIBRARY_OPTIONS | {"include_self"},
            {"top_k", "threshold"},
        )
    if operation == "substructure_search":
        return COMMON_LIBRARY_OPTIONS, set()
    if operation == "cluster_library":
        return (
            COMMON_LIBRARY_OPTIONS
            | FINGERPRINT_LIBRARY_OPTIONS
            | {"similarity_threshold"},
            set(),
        )
    return (
        COMMON_LIBRARY_OPTIONS | FINGERPRINT_LIBRARY_OPTIONS | {"pick_size", "seed"},
        {"first_picks"},
    )


def _validate_library_options(
    operation: str,
    options: dict[str, Any],
) -> dict[str, Any]:
    required, optional = _library_option_fields(operation)
    _exact(
        options,
        required,
        optional,
        "inputs.library_operation.options",
    )
    _validate_common_library_options(options)
    if operation in {"similarity_search", "cluster_library", "select_diverse_subset"}:
        _validate_fingerprint_library_options(options)
    if operation == "similarity_search":
        _validate_similarity_options(options)
    elif operation == "cluster_library":
        _validate_cluster_options(options)
    elif operation == "select_diverse_subset":
        _validate_diversity_options(options)
    return dict(options)


def _validate_fingerprint_library_options(options: dict[str, Any]) -> None:
    profile_id = options["fingerprint_profile_id"]
    if not isinstance(profile_id, str) or not profile_id.strip():
        raise WorkflowARequestError("fingerprint_profile_id must be non-empty")
    if options["metric"] != "tanimoto":
        raise WorkflowARequestError("library metric must be tanimoto")


def _validate_similarity_options(options: dict[str, Any]) -> None:
    if options.get("top_k") is None and options.get("threshold") is None:
        raise WorkflowARequestError("top_k or threshold is required")
    if options.get("top_k") is not None:
        _bounded_int(options["top_k"], 1, 5000, "top_k")
    if options.get("threshold") is not None:
        _require_number(options["threshold"], 0, 1, "threshold")
    _require_boolean(options["include_self"], "include_self")


def _validate_cluster_options(options: dict[str, Any]) -> None:
    _require_number(
        options["similarity_threshold"],
        0,
        1,
        "similarity_threshold",
    )


def _validate_diversity_options(options: dict[str, Any]) -> None:
    _bounded_int(options["pick_size"], 1, 5000, "pick_size")
    _bounded_int(options["seed"], 0, 2**31 - 1, "seed")
    if "first_picks" in options and not isinstance(options["first_picks"], list):
        raise WorkflowARequestError("first_picks must be an array")


def _validate_library_queries(
    operation: str,
    value: Any,
) -> list[dict[str, Any]] | None:
    needs_queries = operation in {"similarity_search", "substructure_search"}
    if not needs_queries:
        if value is not None:
            raise WorkflowARequestError(f"{operation} does not accept queries")
        return None
    if not isinstance(value, list) or not value:
        raise WorkflowARequestError(f"{operation} requires non-empty queries")
    if not all(isinstance(item, dict) for item in value):
        raise WorkflowARequestError("library queries must contain objects")
    if operation == "similarity_search":
        _validate_similarity_queries(value)
    else:
        _validate_substructure_queries(value)
    return [dict(item) for item in value]


def _validate_similarity_queries(value: list[dict[str, Any]]) -> None:
    allowed = ({"id", "record_id"}, {"id", "record_index"})
    for index, query in enumerate(value):
        if set(query) not in allowed:
            raise WorkflowARequestError(
                f"library queries[{index}] must bind one record"
            )
        if not isinstance(query["id"], str) or not query["id"].strip():
            raise WorkflowARequestError("similarity query id must be non-empty")
        if "record_id" in query and (
            not isinstance(query["record_id"], str) or not query["record_id"].strip()
        ):
            raise WorkflowARequestError("record_id must be non-empty")
        if "record_index" in query:
            _bounded_int(query["record_index"], 0, 4999, "record_index")


def _validate_substructure_queries(value: list[dict[str, Any]]) -> None:
    fields = {"id", "query_type", "query", "use_chirality", "max_results"}
    for index, query in enumerate(value):
        _exact(query, fields, set(), f"library queries[{index}]")
        _controlled_string(
            query["query_type"],
            {"smarts", "smiles"},
            f"library queries[{index}].query_type",
        )
        if not isinstance(query["query"], str) or not query["query"].strip():
            raise WorkflowARequestError("substructure query must be non-empty")
        _require_boolean(query["use_chirality"], "use_chirality")
        _bounded_int(query["max_results"], 1, 5000, "max_results")


def validate_workflow_a_request(value: Any) -> dict[str, Any]:
    request = _object(value, "workflow request")
    if request.get("workflow_id") != "compound-evidence-v1":
        raise WorkflowARequestError("Workflow A requires compound-evidence-v1")
    inputs = _object(request.get("inputs"), "inputs")
    _exact(inputs, INPUT_FIELDS, set(), "inputs")
    policy = _object(request.get("execution_policy"), "execution_policy")
    standardization = _object(inputs["standardization"], "inputs.standardization")
    _exact(
        standardization,
        STANDARDIZATION_FIELDS,
        set(),
        "inputs.standardization",
    )
    features = _object(inputs["features"], "inputs.features")
    _exact(features, FEATURE_FIELDS, set(), "inputs.features")
    view = features["calculation_view"]
    if view is not None:
        view = _controlled_string(
            view,
            CALCULATION_VIEWS,
            "inputs.features.calculation_view",
        )
    return {
        **request,
        "inputs": {
            "queries": _validate_queries(inputs["queries"]),
            "identity": _validate_identity(
                inputs["identity"],
                policy["network_mode"],
            ),
            "standardization": {
                "profile": _controlled_string(
                    standardization["profile"],
                    PROFILES,
                    "inputs.standardization.profile",
                )
            },
            "features": {"calculation_view": view},
            "library_operation": _validate_library(inputs["library_operation"]),
        },
    }
