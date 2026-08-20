from __future__ import annotations

import copy
import importlib.util
import json
import socket
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

IMPLEMENTATION_ROOT = Path(__file__).resolve().parents[1]
SKILL_ROOT = IMPLEMENTATION_ROOT / "skills" / "review-routes"
SCRIPTS_ROOT = SKILL_ROOT / "scripts"
CORE_PATH = SCRIPTS_ROOT / "review_routes.py"
VALIDATOR_PATH = SCRIPTS_ROOT / "validate_output.py"
CURATE_PATH = (
    IMPLEMENTATION_ROOT
    / "skills"
    / "curate-reactions"
    / "scripts"
    / "curate_reactions.py"
)
SEARCH_PATH = (
    IMPLEMENTATION_ROOT
    / "skills"
    / "search-reactions"
    / "scripts"
    / "search_reactions.py"
)
FIXED_TIME = "2026-08-10T00:00:00Z"


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


CORE = load_module("review_routes", CORE_PATH)
VALIDATOR = load_module("review_routes_validator", VALIDATOR_PATH)
CURATE = load_module("review_routes_curate_producer", CURATE_PATH)
SEARCH = load_module("review_routes_search_producer", SEARCH_PATH)
TOOLKIT = CORE.load_toolkit()


def molecule(smiles, *, in_stock=True, children=None):
    return {
        "type": "mol",
        "smiles": smiles,
        "in_stock": in_stock,
        "children": list(children or []),
    }


def reaction(reaction_smiles, children):
    return {
        "type": "reaction",
        "metadata": {
            "rsmi": reaction_smiles,
            "reaction_hash": CORE.sha256_json(reaction_smiles)[:20],
        },
        "children": list(children),
    }


def linear_tree():
    ethanol = molecule("CCO")
    acid = molecule("CC(=O)O")
    return molecule(
        "CCOC(C)=O",
        in_stock=False,
        children=[reaction("CCO.CC(=O)O>>CCOC(C)=O.O", [ethanol, acid])],
    )


def branched_tree():
    ether = molecule("COC")
    ethanol = molecule(
        "CCO",
        in_stock=False,
        children=[reaction("COC>>CCO", [ether])],
    )
    acid = molecule("CC(=O)O")
    return molecule(
        "CCOC(C)=O",
        in_stock=False,
        children=[reaction("CCO.CC(=O)O>>CCOC(C)=O.O", [ethanol, acid])],
    )


def different_tree():
    amine = molecule("CN")
    acid = molecule("CC(=O)O")
    return molecule(
        "CNC(C)=O",
        in_stock=False,
        children=[reaction("CN.CC(=O)O>>CNC(C)=O.O", [amine, acid])],
    )


def deep_tree(steps):
    current = molecule("C")
    for size in range(2, steps + 2):
        product = "C" * size
        current = molecule(
            product,
            in_stock=False,
            children=[reaction(f"{'C' * (size - 1)}>>{product}", [current])],
        )
    return current


def route_record(route_id="route-1", tree=None, *, rank=1, score=0.9):
    return {
        "route_id": route_id,
        "backend": "engineering-gold",
        "backend_rank": rank,
        "backend_score": score,
        "tree": copy.deepcopy(tree or linear_tree()),
    }


def base_request(routes=None, *, profile="normalized_route_v1"):
    routes = copy.deepcopy(routes or [route_record()])
    if profile == "paroutes_v2_json":
        routes = [item["tree"] if "tree" in item else item for item in routes]
    value = {
        "schema_version": "1.0.0",
        "workflow": "review-routes",
        "input_profile": profile,
        "source": {
            "identifier": "engineering-gold",
            "content_sha256": "a" * 64,
            "license": "test-only",
        },
        "target": {
            "reported_structure": "CCOC(C)=O",
            "standardized_structure": "CCOC(C)=O",
            "upstream_record_id": "target-1",
        },
        "routes": routes,
        "routes_fingerprint": CORE.sha256_json(routes),
        "step_artifacts": [],
        "inventory_snapshot": None,
        "constraints": {},
        "options": {
            "comparison_mode": "dimensions_only",
            "preserve_backend_order": True,
        },
    }
    return value


def curation_artifact(step, disposition="ready_for_search"):
    reaction_smiles = "bad" if disposition == "rejected" else step["reported_reaction"]
    request = {
        "schema_version": "1.0.0",
        "workflow": "curate-reactions",
        "input_profile": "reaction_smiles",
        "source": {
            "identifier": "review-routes-fixture",
            "content_sha256": "a" * 64,
        },
        "options": {
            "participant_view": "reported_form",
            "atom_mapping": "off",
            "balance_check": "diagnostic",
        },
        "upstream_artifacts": [],
        "records": [
            {
                "record_id": step["step_id"],
                "reaction_smiles": reaction_smiles,
                "stoichiometry_complete": disposition != "review_required",
            }
        ],
    }
    return CURATE.process_request(request, generated_at_utc=FIXED_TIME)


def _search_options(profile=None):
    return {
        "fingerprint_profile_id": profile,
        "top_k": 20,
        "threshold": None,
        "candidate_limit": 100,
        "include_review_required": True,
        "use_stereochemistry": False,
    }


def _search_request(step, level, corpus):
    operation_query = {
        "exact_record": (
            "lookup_reaction",
            {"reaction_id": step["step_id"]},
            None,
        ),
        "exact_transformation": (
            "search_transformations",
            {"reaction_smarts": step["canonical_reaction"]},
            None,
        ),
        "similar_reaction": (
            "search_similar_reactions",
            {"reaction_smiles": step["canonical_reaction"]},
            "rdkit-difference-atompair-v1",
        ),
        "component_only": (
            "search_components",
            {
                "component_predicates": [
                    {
                        "target": "input",
                        "mode": "exact",
                        "pattern": step["precursors"][0],
                        "threshold": None,
                    }
                ]
            },
            None,
        ),
        "completed_zero_hits": (
            "search_transformations",
            {"reaction_smarts": step["canonical_reaction"]},
            None,
        ),
    }
    operation, query, profile = operation_query[level]
    return {
        "schema_version": "1.0.0",
        "workflow": "search-reactions",
        "operation": operation,
        "provider": "local_curated_corpus",
        "query": query,
        "options": _search_options(profile),
        "corpus_artifact": corpus,
    }


def _remote_search_artifact(step, level):
    request = {
        "schema_version": "1.0.0",
        "workflow": "search-reactions",
        "operation": "lookup_reaction",
        "provider": "ord_public_api",
        "query": {"reaction_id": step["step_id"]},
        "options": _search_options(),
        "provider_config": {
            "base_url": SEARCH.ORD_API_BASE,
            "timeout_seconds": 5,
        },
    }

    def failed_get(url, timeout):
        del url, timeout
        if level == "source_timeout":
            raise socket.timeout("controlled timeout")
        raise RuntimeError("controlled provider error")

    return SEARCH.process_request(
        request,
        generated_at_utc=FIXED_TIME,
        http_get=failed_get,
    )


def search_artifact(
    step,
    level="exact_record",
    *,
    license_known=True,
    multiple_profiles=False,
):
    if level in {"source_timeout", "source_error"}:
        return _remote_search_artifact(step, level)
    curated = curation_artifact(step)
    record = curated["records"][0]
    record["conditions"] = [{"temperature_c": 25}]
    record["yield_measurements"] = [{"value": 75, "units": "PERCENT"}]
    record["license"] = "test-license" if license_known else None
    if level == "completed_zero_hits":
        curated["records"] = []
    curated["result_fingerprint"] = CORE.artifact_fingerprint(curated)
    document = SEARCH.process_request(
        _search_request(step, level, curated),
        generated_at_utc=FIXED_TIME,
    )
    if multiple_profiles and document["results"]:
        duplicate = copy.deepcopy(document["results"][0])
        duplicate["rank"] = len(document["results"]) + 1
        duplicate["reaction_id"] += "-profile-mismatch"
        duplicate["fingerprint_profile"] = {
            **duplicate["fingerprint_profile"],
            "profile_id": "rdkit-structural-atompair-v1",
            "metric": "tanimoto",
        }
        payload = {
            key: value
            for key, value in duplicate.items()
            if key not in {"rank", "result_hash"}
        }
        duplicate["result_hash"] = SEARCH.sha256_json(payload)
        document["results"].append(duplicate)
        document["result_fingerprint"] = SEARCH.stable_document_fingerprint(document)
    return document


def route_analyses(value):
    routes, errors = CORE.normalize_routes(value)
    assert not errors
    return [(route, CORE.analyze_route_tree(route, TOOLKIT)) for route in routes]


def prepare_request(
    value,
    *,
    curation="ready_for_search",
    precedent="exact_record",
    inventory="complete",
    license_known=True,
    multiple_profiles=False,
):
    value = copy.deepcopy(value)
    value["source"]["license"] = "test-only" if license_known else None
    entries = []
    inventory_records = {}
    for route, analysis in route_analyses(value):
        for leaf in analysis["leaves"]:
            if leaf["structure"]:
                inventory_records[leaf["structure"]] = {
                    "structure": leaf["structure"],
                    "status": "in_stock",
                }
        for step in analysis["steps"]:
            curation_document = (
                None if curation == "not_run" else curation_artifact(step, curation)
            )
            entries.append(
                {
                    "route_id": route["route_id"],
                    "step_id": step["step_id"],
                    "step_reaction_hash": step["step_reaction_hash"],
                    "curation_record_id": (
                        curation_document["records"][0]["record_id"]
                        if curation_document
                        else None
                    ),
                    "curation_artifact": curation_document,
                    "precedent_artifact": (
                        None
                        if precedent == "not_run"
                        else search_artifact(
                            step,
                            precedent,
                            license_known=license_known,
                            multiple_profiles=multiple_profiles,
                        )
                    ),
                }
            )
    value["step_artifacts"] = entries
    if inventory == "complete":
        value["inventory_snapshot"] = {
            "snapshot_id": "inventory-1",
            "captured_at_utc": FIXED_TIME,
            "source": "engineering-gold",
            "license": "test-only",
            "records": list(inventory_records.values()),
        }
    elif inventory == "no_license":
        value["inventory_snapshot"] = {
            "snapshot_id": "inventory-1",
            "captured_at_utc": FIXED_TIME,
            "source": "engineering-gold",
            "license": None,
            "records": list(inventory_records.values()),
        }
    elif inventory == "not_in_stock":
        records = list(inventory_records.values())
        if records:
            records[0]["status"] = "not_in_stock"
        value["inventory_snapshot"] = {
            "snapshot_id": "inventory-1",
            "captured_at_utc": FIXED_TIME,
            "source": "engineering-gold",
            "license": "test-only",
            "records": records,
        }
    elif inventory == "incomplete":
        value["inventory_snapshot"] = {"snapshot_id": "inventory-1"}
    else:
        value["inventory_snapshot"] = None
    return value


def process(value):
    return CORE.process_request(value, generated_at_utc=FIXED_TIME)


def all_codes(document):
    return {
        item["code"]
        for item in [*document["errors"], *document["warnings"]]
        if isinstance(item, dict)
    }


def case(
    case_id,
    group,
    value,
    *,
    disposition=None,
    codes=(),
    route_count=None,
    check=None,
):
    return {
        "case_id": case_id,
        "group": group,
        "request": value,
        "disposition": disposition,
        "codes": set(codes),
        "route_count": route_count,
        "check": check,
    }


def build_gold_cases():
    cases = []

    # Route schema/topology: 12.
    cases.append(
        case(
            "linear_ready",
            "route_schema_topology",
            prepare_request(base_request()),
            disposition="ready_for_expert_review",
        )
    )
    cases.append(
        case(
            "branched_ready",
            "route_schema_topology",
            prepare_request(base_request([route_record(tree=branched_tree())])),
            disposition="ready_for_expert_review",
            check=lambda d: unittest.TestCase().assertEqual(
                d["route_summaries"][0]["step_count"], 2
            ),
        )
    )
    cases.append(
        case(
            "paroutes_adapter",
            "route_schema_topology",
            prepare_request(base_request(profile="paroutes_v2_json")),
            disposition="ready_for_expert_review",
        )
    )
    aizynth = base_request(
        [{"tree": linear_tree(), "rank": 1, "score": 0.8}],
        profile="aizynthfinder_json",
    )
    cases.append(
        case(
            "aizynth_adapter_generated_id",
            "route_schema_topology",
            prepare_request(aizynth),
            disposition="ready_for_expert_review",
        )
    )
    root_reaction = base_request([route_record(tree=reaction("CCO>>CC=O", []))])
    cases.append(
        case(
            "root_must_be_molecule",
            "route_schema_topology",
            root_reaction,
            disposition="blocked",
            codes={"E-ROUTE-TOPOLOGY-001"},
        )
    )
    invalid_molecule = base_request([route_record(tree=molecule("C1", children=[]))])
    cases.append(
        case(
            "invalid_molecule",
            "route_schema_topology",
            invalid_molecule,
            disposition="blocked",
            codes={"E-MOLECULE-STRUCTURE-001"},
        )
    )
    multiple_reactions = linear_tree()
    multiple_reactions["children"].append(
        reaction("CCOC(C)=O>>CCOC(C)=O", [molecule("CCOC(C)=O")])
    )
    cases.append(
        case(
            "multiple_reaction_children",
            "route_schema_topology",
            base_request([route_record(tree=multiple_reactions)]),
            disposition="blocked",
            codes={"E-ROUTE-TOPOLOGY-001"},
        )
    )
    no_precursors = molecule(
        "CCO",
        children=[reaction("CCBr>>CCO", [])],
    )
    cases.append(
        case(
            "reaction_without_precursors",
            "route_schema_topology",
            base_request([route_record(tree=no_precursors)]),
            disposition="blocked",
            codes={"E-ROUTE-TOPOLOGY-001"},
        )
    )
    non_molecule_child = molecule(
        "CCO",
        children=[reaction("CCBr>>CCO", [{"type": "reaction", "children": []}])],
    )
    cases.append(
        case(
            "reaction_child_not_molecule",
            "route_schema_topology",
            base_request([route_record(tree=non_molecule_child)]),
            disposition="blocked",
            codes={"E-ROUTE-TOPOLOGY-001"},
        )
    )
    output_mismatch = linear_tree()
    output_mismatch["children"][0]["metadata"]["rsmi"] = "CCO.CC(=O)O>>CCN"
    cases.append(
        case(
            "reaction_output_mismatch",
            "route_schema_topology",
            base_request([route_record(tree=output_mismatch)]),
            disposition="blocked",
            codes={"E-STEP-REACTION-001"},
        )
    )
    precursor_mismatch = linear_tree()
    precursor_mismatch["children"][0]["metadata"]["rsmi"] = "CCO>>CCOC(C)=O"
    cases.append(
        case(
            "precursor_missing_from_reaction",
            "route_schema_topology",
            base_request([route_record(tree=precursor_mismatch)]),
            disposition="blocked",
            codes={"E-STEP-REACTION-001"},
        )
    )
    cases.append(
        case(
            "step_limit",
            "route_schema_topology",
            base_request([route_record(tree=deep_tree(51))]),
            disposition="blocked",
            codes={"E-RESOURCE-LIMIT-001"},
        )
    )

    # Step handoff: 12.
    cases.append(
        case(
            "handoff_exact_ready",
            "step_handoff",
            prepare_request(base_request()),
            disposition="ready_for_expert_review",
        )
    )
    cases.append(
        case(
            "handoff_transformation_ready",
            "step_handoff",
            prepare_request(base_request(), precedent="exact_transformation"),
            disposition="ready_for_expert_review",
        )
    )
    cases.append(
        case(
            "curation_review_propagates",
            "step_handoff",
            prepare_request(base_request(), curation="review_required"),
            disposition="review_required",
            codes={"W-CURATION-REVIEW-001"},
        )
    )
    cases.append(
        case(
            "curation_rejected_blocks",
            "step_handoff",
            prepare_request(base_request(), curation="rejected"),
            disposition="blocked",
            codes={"E-CURATION-REJECTED-001"},
        )
    )
    bad_curation_fp = prepare_request(base_request())
    bad_curation_fp["step_artifacts"][0]["curation_artifact"]["result_fingerprint"] = (
        "0" * 64
    )
    cases.append(
        case(
            "curation_fingerprint_mismatch",
            "step_handoff",
            bad_curation_fp,
            disposition="blocked",
            codes={"E-CURATION-ARTIFACT-CONTRACT-001"},
        )
    )
    bad_search_fp = prepare_request(base_request())
    bad_search_fp["step_artifacts"][0]["precedent_artifact"]["result_fingerprint"] = (
        "0" * 64
    )
    cases.append(
        case(
            "search_fingerprint_mismatch",
            "step_handoff",
            bad_search_fp,
            disposition="blocked",
            codes={"E-PRECEDENT-ARTIFACT-CONTRACT-001"},
        )
    )
    bad_step_hash = prepare_request(base_request())
    bad_step_hash["step_artifacts"][0]["step_reaction_hash"] = "0" * 64
    cases.append(
        case(
            "step_hash_mismatch",
            "step_handoff",
            bad_step_hash,
            disposition="blocked",
            codes={"E-STEP-HASH-MISMATCH-001"},
        )
    )
    curation_no_match = prepare_request(base_request())
    artifact = curation_no_match["step_artifacts"][0]["curation_artifact"]
    artifact["records"][0]["reaction_smiles"]["canonical_unmapped"] = "C>>N"
    artifact["result_fingerprint"] = CORE.artifact_fingerprint(artifact)
    cases.append(
        case(
            "curation_record_no_match",
            "step_handoff",
            curation_no_match,
            disposition="blocked",
            codes={"E-STEP-HASH-MISMATCH-001"},
        )
    )
    curation_wrong_workflow = prepare_request(base_request())
    artifact = curation_wrong_workflow["step_artifacts"][0]["curation_artifact"]
    artifact["workflow"] = "wrong"
    artifact["result_fingerprint"] = CORE.artifact_fingerprint(artifact)
    cases.append(
        case(
            "curation_wrong_workflow",
            "step_handoff",
            curation_wrong_workflow,
            disposition="blocked",
            codes={"E-CURATION-ARTIFACT-CONTRACT-001"},
        )
    )
    search_wrong_workflow = prepare_request(base_request())
    artifact = search_wrong_workflow["step_artifacts"][0]["precedent_artifact"]
    artifact["workflow"] = "wrong"
    artifact["result_fingerprint"] = CORE.artifact_fingerprint(artifact)
    cases.append(
        case(
            "search_wrong_workflow",
            "step_handoff",
            search_wrong_workflow,
            disposition="blocked",
            codes={"E-PRECEDENT-ARTIFACT-CONTRACT-001"},
        )
    )
    duplicate_entry = prepare_request(base_request())
    duplicate_entry["step_artifacts"].append(
        copy.deepcopy(duplicate_entry["step_artifacts"][0])
    )
    cases.append(
        case(
            "duplicate_artifact_entry",
            "step_handoff",
            duplicate_entry,
            disposition="blocked",
            codes={"E-CURATION-BINDING-001"},
        )
    )
    orphan_entry = prepare_request(base_request())
    orphan_entry["step_artifacts"].append(
        {
            "route_id": "route-1",
            "step_id": "step-orphan",
            "step_reaction_hash": "b" * 64,
        }
    )
    cases.append(
        case(
            "orphan_artifact_entry",
            "step_handoff",
            orphan_entry,
            disposition="ready_for_expert_review",
            codes={"E-STEP-HASH-MISMATCH-001"},
        )
    )

    # Precedent evidence: 12.
    cases.append(
        case(
            "precedent_exact_record",
            "precedent_evidence",
            prepare_request(base_request(), precedent="exact_record"),
            disposition="ready_for_expert_review",
        )
    )
    cases.append(
        case(
            "precedent_exact_transformation",
            "precedent_evidence",
            prepare_request(base_request(), precedent="exact_transformation"),
            disposition="ready_for_expert_review",
        )
    )
    cases.append(
        case(
            "precedent_similar",
            "precedent_evidence",
            prepare_request(base_request(), precedent="similar_reaction"),
            disposition="review_required",
            codes={"W-PRECEDENT-SIMILAR-001"},
        )
    )
    cases.append(
        case(
            "precedent_component",
            "precedent_evidence",
            prepare_request(base_request(), precedent="component_only"),
            disposition="review_required",
            codes={"W-PRECEDENT-COMPONENT-001"},
        )
    )
    cases.append(
        case(
            "precedent_zero",
            "precedent_evidence",
            prepare_request(base_request(), precedent="completed_zero_hits"),
            disposition="review_required",
            codes={"W-PRECEDENT-ZERO-001"},
        )
    )
    cases.append(
        case(
            "precedent_timeout",
            "precedent_evidence",
            prepare_request(base_request(), precedent="source_timeout"),
            disposition="review_required",
            codes={"W-PRECEDENT-TIMEOUT-001"},
        )
    )
    cases.append(
        case(
            "precedent_source_error",
            "precedent_evidence",
            prepare_request(base_request(), precedent="source_error"),
            disposition="review_required",
            codes={"W-PRECEDENT-ERROR-001"},
        )
    )
    cases.append(
        case(
            "precedent_not_run",
            "precedent_evidence",
            prepare_request(base_request(), precedent="not_run"),
            disposition="review_required",
            codes={"W-PRECEDENT-NOT-RUN-001"},
        )
    )
    cases.append(
        case(
            "precedent_missing_license",
            "precedent_evidence",
            prepare_request(base_request(), license_known=False),
            disposition="review_required",
            codes={"W-SOURCE-LICENSE-001"},
        )
    )
    cases.append(
        case(
            "precedent_conditions_and_yield_preserved",
            "precedent_evidence",
            prepare_request(base_request()),
            disposition="ready_for_expert_review",
            check=lambda d: (
                unittest.TestCase().assertTrue(
                    d["route_summaries"][0]["step_reviews"][0]["precedent"][
                        "reported_condition_evidence"
                    ]
                ),
                unittest.TestCase().assertTrue(
                    d["route_summaries"][0]["step_reviews"][0]["precedent"][
                        "reported_yield_evidence"
                    ]
                ),
            ),
        )
    )
    mixed_profiles = prepare_request(
        base_request(), precedent="similar_reaction", multiple_profiles=True
    )
    cases.append(
        case(
            "precedent_profiles_not_mixed",
            "precedent_evidence",
            mixed_profiles,
            disposition="blocked",
            codes={"E-PRECEDENT-ARTIFACT-CONTRACT-001"},
        )
    )
    completed_empty = prepare_request(base_request())
    artifact = completed_empty["step_artifacts"][0]["precedent_artifact"]
    artifact["results"] = []
    artifact["provider_status"] = "completed"
    artifact["result_fingerprint"] = CORE.artifact_fingerprint(artifact)
    cases.append(
        case(
            "precedent_completed_empty_is_not_run",
            "precedent_evidence",
            completed_empty,
            disposition="blocked",
            codes={"E-PRECEDENT-ARTIFACT-CONTRACT-001"},
        )
    )

    # Inventory and constraints: 8.
    cases.append(
        case(
            "inventory_complete",
            "inventory_constraints",
            prepare_request(base_request()),
            disposition="ready_for_expert_review",
        )
    )
    cases.append(
        case(
            "inventory_missing",
            "inventory_constraints",
            prepare_request(base_request(), inventory="missing"),
            disposition="review_required",
            codes={"W-INVENTORY-MISSING-001"},
        )
    )
    cases.append(
        case(
            "inventory_license_missing",
            "inventory_constraints",
            prepare_request(base_request(), inventory="no_license"),
            disposition="review_required",
            codes={"W-INVENTORY-LICENSE-001"},
        )
    )
    cases.append(
        case(
            "inventory_incomplete",
            "inventory_constraints",
            prepare_request(base_request(), inventory="incomplete"),
            disposition="review_required",
            codes={"W-INVENTORY-MISSING-001"},
        )
    )
    max_steps = prepare_request(base_request())
    max_steps["constraints"] = {"max_steps": 0}
    cases.append(
        case(
            "constraint_max_steps",
            "inventory_constraints",
            max_steps,
            disposition="review_required",
            codes={"W-CONSTRAINT-VIOLATION-001"},
        )
    )
    max_precursors = prepare_request(base_request())
    max_precursors["constraints"] = {"max_precursors": 1}
    cases.append(
        case(
            "constraint_max_precursors",
            "inventory_constraints",
            max_precursors,
            disposition="review_required",
            codes={"W-CONSTRAINT-VIOLATION-001"},
        )
    )
    all_stock = prepare_request(base_request(), inventory="not_in_stock")
    all_stock["constraints"] = {"require_all_leaves_in_stock": True}
    cases.append(
        case(
            "constraint_all_leaves_in_stock",
            "inventory_constraints",
            all_stock,
            disposition="review_required",
            codes={"W-CONSTRAINT-VIOLATION-001"},
        )
    )
    forbidden = prepare_request(base_request())
    forbidden["constraints"] = {"forbidden_starting_materials": ["CCO"]}
    cases.append(
        case(
            "constraint_forbidden_precursor",
            "inventory_constraints",
            forbidden,
            disposition="review_required",
            codes={"W-CONSTRAINT-VIOLATION-001"},
        )
    )

    # Duplicates and dimensions: 8.
    duplicate_routes = [
        route_record("route-a", linear_tree(), rank=1, score=0.9),
        route_record("route-b", linear_tree(), rank=2, score=0.8),
    ]
    cases.append(
        case(
            "duplicate_routes_grouped",
            "duplicates_comparison",
            prepare_request(base_request(duplicate_routes)),
            disposition="review_required",
            codes={"W-ROUTE-DUPLICATE-001"},
            route_count=2,
        )
    )
    distinct_routes = [
        route_record("route-a", linear_tree(), rank=1, score=0.9),
        route_record("route-b", different_tree(), rank=2, score=0.8),
    ]
    distinct_request = base_request(distinct_routes)
    distinct_request["target"] = None
    cases.append(
        case(
            "distinct_routes_not_grouped",
            "duplicates_comparison",
            prepare_request(distinct_request),
            disposition="ready_for_expert_review",
            route_count=2,
            check=lambda d: unittest.TestCase().assertEqual(
                d["duplicate_route_groups"], []
            ),
        )
    )
    scores = prepare_request(base_request(duplicate_routes[:1]))
    cases.append(
        case(
            "backend_score_preserved",
            "duplicates_comparison",
            scores,
            disposition="ready_for_expert_review",
            check=lambda d: unittest.TestCase().assertEqual(
                d["comparison_dimensions"][0]["backend_score"], 0.9
            ),
        )
    )
    order_request = base_request(
        [
            route_record("route-z", linear_tree(), rank=9, score=0.1),
            route_record("route-a", different_tree(), rank=1, score=0.9),
        ]
    )
    order_request["target"] = None
    cases.append(
        case(
            "input_order_preserved",
            "duplicates_comparison",
            prepare_request(order_request),
            disposition="ready_for_expert_review",
            route_count=2,
            check=lambda d: unittest.TestCase().assertEqual(
                [item["route_id"] for item in d["route_summaries"]],
                ["route-z", "route-a"],
            ),
        )
    )
    cases.append(
        case(
            "exact_coverage_one",
            "duplicates_comparison",
            prepare_request(base_request()),
            disposition="ready_for_expert_review",
            check=lambda d: unittest.TestCase().assertEqual(
                d["route_summaries"][0]["exact_or_transformation_coverage"],
                1.0,
            ),
        )
    )
    cases.append(
        case(
            "similar_coverage_zero",
            "duplicates_comparison",
            prepare_request(base_request(), precedent="similar_reaction"),
            disposition="review_required",
            check=lambda d: unittest.TestCase().assertEqual(
                d["route_summaries"][0]["exact_or_transformation_coverage"],
                0.0,
            ),
        )
    )
    coverage_constraint = prepare_request(base_request(), precedent="similar_reaction")
    coverage_constraint["constraints"] = {
        "minimum_exact_or_transformation_coverage": 0.5
    }
    cases.append(
        case(
            "minimum_coverage_constraint",
            "duplicates_comparison",
            coverage_constraint,
            disposition="review_required",
            codes={"W-CONSTRAINT-VIOLATION-001"},
        )
    )
    deterministic = prepare_request(base_request())
    cases.append(
        case(
            "route_signature_deterministic",
            "duplicates_comparison",
            deterministic,
            disposition="ready_for_expert_review",
            check=lambda d: unittest.TestCase().assertEqual(
                d["route_summaries"][0]["route_signature"],
                process(deterministic)["route_summaries"][0]["route_signature"],
            ),
        )
    )

    # Failure and security: 8.
    bad_schema = prepare_request(base_request())
    bad_schema["schema_version"] = "0.0.0"
    cases.append(
        case(
            "bad_schema",
            "failure_security",
            bad_schema,
            route_count=0,
            codes={"E-INPUT-SCHEMA-001"},
        )
    )
    bad_workflow = prepare_request(base_request())
    bad_workflow["workflow"] = "wrong"
    cases.append(
        case(
            "bad_workflow",
            "failure_security",
            bad_workflow,
            route_count=0,
            codes={"E-INPUT-SCHEMA-001"},
        )
    )
    bad_profile = prepare_request(base_request())
    bad_profile["input_profile"] = "unknown"
    cases.append(
        case(
            "unknown_profile",
            "failure_security",
            bad_profile,
            route_count=0,
            codes={"E-INPUT-SCHEMA-001"},
        )
    )
    pickle_profile = prepare_request(base_request())
    pickle_profile["input_profile"] = "pickle"
    cases.append(
        case(
            "pickle_profile",
            "failure_security",
            pickle_profile,
            route_count=0,
            codes={"E-PICKLE-INPUT-001"},
        )
    )
    bad_routes_hash = prepare_request(base_request())
    bad_routes_hash["routes_fingerprint"] = "0" * 64
    cases.append(
        case(
            "routes_fingerprint_mismatch",
            "failure_security",
            bad_routes_hash,
            route_count=0,
            codes={"E-INPUT-HASH-001"},
        )
    )
    bad_source_hash = prepare_request(base_request())
    bad_source_hash["source"]["content_sha256"] = "bad"
    cases.append(
        case(
            "source_hash_invalid",
            "failure_security",
            bad_source_hash,
            route_count=0,
            codes={"E-INPUT-HASH-001"},
        )
    )
    secret_request = prepare_request(base_request())
    secret_request["source"]["note"] = "Bearer " + "abcdefghijklmnop"
    cases.append(
        case(
            "secret_blocked",
            "failure_security",
            secret_request,
            route_count=0,
            codes={"E-INPUT-SCHEMA-001"},
        )
    )
    too_many_routes = base_request(
        [
            route_record(f"route-{index}", linear_tree(), rank=index)
            for index in range(CORE.MAX_ROUTES + 1)
        ]
    )
    cases.append(
        case(
            "route_resource_limit",
            "failure_security",
            too_many_routes,
            route_count=0,
            codes={"E-RESOURCE-LIMIT-001"},
        )
    )

    assert len(cases) == 60
    assert {
        group: sum(item["group"] == group for item in cases)
        for group in {
            "route_schema_topology",
            "step_handoff",
            "precedent_evidence",
            "inventory_constraints",
            "duplicates_comparison",
            "failure_security",
        }
    } == {
        "route_schema_topology": 12,
        "step_handoff": 12,
        "precedent_evidence": 12,
        "inventory_constraints": 8,
        "duplicates_comparison": 8,
        "failure_security": 8,
    }
    return cases


GOLD_CASES = build_gold_cases()


class ReviewRoutesGoldTests(unittest.TestCase):
    pass


def make_gold_test(gold):
    def test(self):
        document = process(copy.deepcopy(gold["request"]))
        expected_count = gold["route_count"] if gold["route_count"] is not None else 1
        self.assertEqual(len(document["route_summaries"]), expected_count)
        if gold["disposition"] is not None:
            self.assertEqual(
                document["route_summaries"][0]["disposition"],
                gold["disposition"],
            )
        self.assertTrue(gold["codes"].issubset(all_codes(document)))
        if gold["check"]:
            gold["check"](document)
        self.assertEqual(VALIDATOR.validate_output(document), [])

    return test


for _index, _gold in enumerate(GOLD_CASES, start=1):
    setattr(
        ReviewRoutesGoldTests,
        f"test_gold_{_index:02d}_{_gold['case_id']}",
        make_gold_test(_gold),
    )


class ReviewRoutesContractTests(unittest.TestCase):
    def test_result_fingerprint_excludes_time_and_runtime(self):
        value = prepare_request(base_request())
        first = process(value)
        second = CORE.process_request(value, generated_at_utc="2027-01-01T00:00:00Z")
        self.assertEqual(first["result_fingerprint"], second["result_fingerprint"])

    def test_result_fingerprint_detects_tampering(self):
        document = process(prepare_request(base_request()))
        document["route_summaries"][0]["step_count"] = 99
        self.assertIn(
            "result_fingerprint 不匹配",
            VALIDATOR.validate_output(document),
        )

    def test_dimensions_have_no_hidden_total_score(self):
        document = process(prepare_request(base_request()))
        serialized = json.dumps(document)
        self.assertNotIn('"decision_score"', serialized)
        self.assertNotIn('"total_score"', serialized)

    def test_ready_for_expert_review_is_not_ready_for_experiment(self):
        document = process(prepare_request(base_request()))
        self.assertEqual(
            document["route_summaries"][0]["disposition"],
            "ready_for_expert_review",
        )
        self.assertNotIn("ready_for_experiment", json.dumps(document))

    def test_paroutes_adapter_deterministic_route_id(self):
        value = base_request(profile="paroutes_v2_json")
        first, _ = CORE.normalize_routes(value)
        second, _ = CORE.normalize_routes(value)
        self.assertEqual(first[0]["route_id"], second[0]["route_id"])

    def test_pickle_cli_fails_without_output(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "route.pkl"
            output = Path(directory) / "output.json"
            source.write_bytes(b"not-a-pickle")
            completed = subprocess.run(
                [
                    sys.executable,
                    str(CORE_PATH),
                    "--input",
                    str(source),
                    "--output",
                    str(output),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(completed.returncode, 2)
            self.assertFalse(output.exists())

    def test_cli_success_and_validator(self):
        value = prepare_request(base_request())
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "request.json"
            output = Path(directory) / "output.json"
            source.write_text(json.dumps(value), encoding="utf-8")
            completed = subprocess.run(
                [
                    sys.executable,
                    str(CORE_PATH),
                    "--input",
                    str(source),
                    "--output",
                    str(output),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            validation = subprocess.run(
                [sys.executable, str(VALIDATOR_PATH), str(output)],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(validation.returncode, 0, validation.stdout)

    def test_cli_blocked_writes_auditable_output_and_returns_one(self):
        value = prepare_request(base_request(), curation="rejected")
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "request.json"
            output = Path(directory) / "output.json"
            source.write_text(json.dumps(value), encoding="utf-8")
            completed = subprocess.run(
                [
                    sys.executable,
                    str(CORE_PATH),
                    "--input",
                    str(source),
                    "--output",
                    str(output),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(completed.returncode, 1, completed.stderr)
            document = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(document["route_summaries"][0]["disposition"], "blocked")
            self.assertEqual(VALIDATOR.validate_output(document), [])

    def test_source_backend_scores_remain_unmodified(self):
        value = prepare_request(base_request([route_record(score=3.14159, rank=7)]))
        document = process(value)
        metadata = document["route_summaries"][0]["backend_metadata"]
        self.assertEqual(metadata["backend_score"], 3.14159)
        self.assertEqual(metadata["backend_rank"], 7)

    def test_zero_hit_timeout_and_error_remain_distinct(self):
        levels = {}
        for level in ("completed_zero_hits", "source_timeout", "source_error"):
            document = process(prepare_request(base_request(), precedent=level))
            levels[level] = document["route_summaries"][0]["step_reviews"][0][
                "precedent"
            ]["match_level"]
        self.assertEqual(
            levels,
            {
                "completed_zero_hits": "completed_zero_hits",
                "source_timeout": "source_timeout",
                "source_error": "source_error",
            },
        )

    def test_record_and_step_counts_are_conserved(self):
        document = process(
            prepare_request(base_request([route_record(tree=branched_tree())]))
        )
        summary = document["input_summary"]
        self.assertTrue(summary["record_count_conserved"])
        self.assertEqual(summary["input_routes"], 1)
        self.assertEqual(summary["output_routes"], 1)
        self.assertEqual(summary["total_steps"], 2)

    def test_output_contains_no_secret_or_absolute_temp_path(self):
        document = process(prepare_request(base_request()))
        serialized = json.dumps(document, ensure_ascii=False)
        self.assertNotRegex(serialized, CORE.SECRET_RE)
        self.assertNotIn("/private/tmp", serialized)

    def test_inventory_route_export_claim_is_not_snapshot_coverage(self):
        document = process(prepare_request(base_request(), inventory="missing"))
        route = document["route_summaries"][0]
        self.assertEqual(route["inventory_coverage"], 0.0)
        self.assertTrue(
            all(
                item["inventory_source"] == "route_export"
                for item in route["terminal_precursors"]
            )
        )

    def test_step_artifact_binding_uses_hash_not_position(self):
        value = prepare_request(base_request([route_record(tree=branched_tree())]))
        value["step_artifacts"].reverse()
        document = process(value)
        self.assertEqual(
            document["route_summaries"][0]["disposition"],
            "ready_for_expert_review",
        )

    def test_validator_rejects_forbidden_scientific_key(self):
        document = process(prepare_request(base_request()))
        document["route_is_feasible"] = True
        errors = VALIDATOR.validate_output(document)
        self.assertTrue(any("禁止字段" in item for item in errors))

    def test_uppercase_ark_in_inchikey_is_not_treated_as_a_token(self):
        value = prepare_request(base_request())
        value["routes"][0]["tree"]["metadata"] = {
            "reaction_hash": "ZZTGXSBQAPLARK-UHFFFAOYSA-N"
        }
        value["routes_fingerprint"] = CORE.sha256_json(value["routes"])
        document = process(value)
        self.assertFalse(document["errors"])
        self.assertEqual(VALIDATOR.validate_output(document), [])


if __name__ == "__main__":
    unittest.main()
