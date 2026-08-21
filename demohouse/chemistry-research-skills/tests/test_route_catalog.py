from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest

import router_test_support as support


EXPECTED_TARGETS = {
    "resolve-chemical-identities",
    "standardize-chemical-structures",
    "compute-molecular-features",
    "search-and-curate-chemical-libraries",
    "curate-reactions",
    "search-reactions",
    "review-routes",
    "identity-standardization-v1",
    "structure-features-v1",
    "structure-library-v1",
    "reaction-precedent-v1",
    "compound-evidence-v1",
    "route-evidence-review-v1",
}
EXPECTED_CATALOG_FINGERPRINT = (
    "305beaa925ff156adafde2f6b1fa87494f38d06ef05c000afe1f12f616b64019"
)
EXPECTED_DEFAULTS = {
    "network_mode": "offline",
    "external_retry": "manual",
    "offline_identity_sources": [],
    "public_identity_sources": ["opsin", "pubchem", "chembl", "unichem"],
    "identity_include_related": False,
    "identity_timeout_seconds": 20,
    "identity_retries": 0,
    "standardization_profile": "chembl-pipeline",
    "calculation_view": "standardized",
    "library_fingerprint_profile_id": "rdkit-morgan-r2-2048-chiral1-bit-v1",
    "library_metric": "tanimoto",
    "library_top_k": 20,
    "library_include_review_required": False,
    "library_include_self": False,
    "reaction_provider": "local_curated_corpus",
    "reaction_operation": "lookup_reaction",
    "reaction_top_k": 20,
    "reaction_include_review_required": False,
    "reaction_use_stereochemistry": True,
}
EXPECTED_CHAIN_EDGES = {
    "identity-standardization-v1": [
        ["resolve-identities", "identity-gate"],
        ["identity-gate", "build-standardization-input"],
        ["build-standardization-input", "standardize-structures"],
        ["standardize-structures", "validate-chain"],
    ],
    "structure-features-v1": [
        ["standardize-structures", "calculation-view-gate"],
        ["calculation-view-gate", "compute-features"],
        ["compute-features", "validate-chain"],
    ],
    "structure-library-v1": [
        ["standardize-structures", "calculation-view-gate"],
        ["calculation-view-gate", "compute-features"],
        ["compute-features", "library-operation"],
        ["library-operation", "validate-chain"],
    ],
    "reaction-precedent-v1": [
        ["curate-reactions", "search-reactions"],
        ["search-reactions", "validate-chain"],
    ],
}


def load_catalog_module() -> Any:
    return support.load_router_module(
        "router_catalog_under_test",
        "route_catalog.py",
    )


def recursive_keys(value: Any) -> set[str]:
    if isinstance(value, dict):
        return set(value) | {
            key for item in value.values() for key in recursive_keys(item)
        }
    if isinstance(value, list):
        return {key for item in value for key in recursive_keys(item)}
    return set()


def write_catalog_root(
    tmp_path: Path,
    value: dict[str, Any],
) -> Path:
    root = tmp_path / "repository"
    path = (
        root
        / "skills"
        / "chemistry-research-router"
        / "references"
        / "route-catalog-v1.json"
    )
    path.parent.mkdir(parents=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, sort_keys=True),
        encoding="utf-8",
    )
    return root


def write_definition_root(
    tmp_path: Path,
    chain_id: str,
    value: dict[str, Any],
) -> Path:
    root = tmp_path / "definition-repository"
    path = root / "orchestration" / "definitions" / f"{chain_id}.json"
    path.parent.mkdir(parents=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, sort_keys=True),
        encoding="utf-8",
    )
    return root


def test_catalog_contains_only_registered_targets() -> None:
    catalog_module = load_catalog_module()
    catalog = catalog_module.load_route_catalog(support.REPOSITORY_ROOT)

    assert {item["target_id"] for item in catalog["targets"]} == EXPECTED_TARGETS
    forbidden = {"command", "entrypoint", "validator", "url", "api_key"}
    assert not forbidden & recursive_keys(catalog)
    direct = {
        item["direct_entry_policy"]
        for item in catalog["targets"]
        if item["target_type"] == "direct_skill"
    }
    composed = {
        item["direct_entry_policy"]
        for item in catalog["targets"]
        if item["target_type"] != "direct_skill"
    }
    assert direct == {"offline_risk_free_only"}
    assert composed == {"never"}


def test_catalog_freezes_only_approved_safe_defaults() -> None:
    catalog_module = load_catalog_module()
    catalog = catalog_module.load_route_catalog(support.REPOSITORY_ROOT)

    assert catalog["safe_defaults"] == EXPECTED_DEFAULTS
    assert "threshold" not in recursive_keys(catalog)
    assert "inventory_snapshot" not in recursive_keys(catalog)
    assert "route_constraints" not in recursive_keys(catalog)
    assert all(
        set(entry["safe_defaults"]) <= EXPECTED_DEFAULTS.keys()
        for entry in catalog["targets"]
    )


def test_catalog_fingerprint_and_lookup_are_deterministic() -> None:
    catalog_module = load_catalog_module()
    catalog = catalog_module.load_route_catalog(support.REPOSITORY_ROOT)

    assert catalog_module.catalog_fingerprint(catalog) == catalog["catalog_fingerprint"]
    assert catalog["catalog_fingerprint"] == EXPECTED_CATALOG_FINGERPRINT
    assert (
        catalog_module.route_entry(catalog, "compound-evidence-v1")["target_type"]
        == "workflow_a"
    )
    with pytest.raises(catalog_module.RouteCatalogError, match="unknown target"):
        catalog_module.route_entry(catalog, "unregistered-target")


def test_catalog_rejects_unapproved_default_even_when_resigned(
    tmp_path: Path,
) -> None:
    catalog_module = load_catalog_module()
    catalog = catalog_module.load_route_catalog(support.REPOSITORY_ROOT)
    tampered = copy.deepcopy(catalog)
    tampered["safe_defaults"]["threshold"] = 0.7
    tampered["catalog_fingerprint"] = support.sha256_json(
        tampered,
        "catalog_fingerprint",
    )
    root = write_catalog_root(tmp_path, tampered)

    with pytest.raises(catalog_module.RouteCatalogError, match="safe defaults"):
        catalog_module.load_route_catalog(root)


def test_catalog_rejects_non_string_target_id_as_contract_error(
    tmp_path: Path,
) -> None:
    catalog_module = load_catalog_module()
    catalog = catalog_module.load_route_catalog(support.REPOSITORY_ROOT)
    tampered = copy.deepcopy(catalog)
    tampered["targets"][0]["target_id"] = []
    tampered["catalog_fingerprint"] = support.sha256_json(
        tampered,
        "catalog_fingerprint",
    )
    root = write_catalog_root(tmp_path, tampered)

    with pytest.raises(catalog_module.RouteCatalogError, match="target"):
        catalog_module.load_route_catalog(root)


def test_chain_definitions_have_exact_static_edges() -> None:
    catalog_module = load_catalog_module()

    for chain_id, expected_edges in EXPECTED_CHAIN_EDGES.items():
        value = catalog_module.load_chain_definition(
            chain_id,
            support.REPOSITORY_ROOT,
        )
        assert value["edges"] == expected_edges
        assert value["definition_version"] == "1.0.0"
        assert value["definition_fingerprint"] == support.sha256_json(
            value,
            "definition_fingerprint",
        )
        assert not {
            "command",
            "entrypoint",
            "validator",
            "url",
            "api_key",
        } & recursive_keys(value)


def test_chain_loader_rejects_unknown_chain() -> None:
    catalog_module = load_catalog_module()

    with pytest.raises(catalog_module.RouteCatalogError, match="unknown chain"):
        catalog_module.load_chain_definition(
            "../../unsafe",
            support.REPOSITORY_ROOT,
        )


def test_chain_loader_rejects_resigned_node_reordering(
    tmp_path: Path,
) -> None:
    catalog_module = load_catalog_module()
    chain_id = "structure-features-v1"
    value = catalog_module.load_chain_definition(
        chain_id,
        support.REPOSITORY_ROOT,
    )
    tampered = copy.deepcopy(value)
    tampered["nodes"][0], tampered["nodes"][1] = (
        tampered["nodes"][1],
        tampered["nodes"][0],
    )
    tampered["definition_fingerprint"] = support.sha256_json(
        tampered,
        "definition_fingerprint",
    )
    root = write_definition_root(tmp_path, chain_id, tampered)

    with pytest.raises(catalog_module.RouteCatalogError, match="node order"):
        catalog_module.load_chain_definition(chain_id, root)
