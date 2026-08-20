from __future__ import annotations

import base64
import importlib.util
import io
import json
import socket
import subprocess
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

IMPLEMENTATION_ROOT = Path(__file__).resolve().parents[1]
SKILL_ROOT = IMPLEMENTATION_ROOT / "skills" / "search-reactions"
SCRIPTS_ROOT = SKILL_ROOT / "scripts"
CORE_PATH = SCRIPTS_ROOT / "search_reactions.py"
VALIDATOR_PATH = SCRIPTS_ROOT / "validate_output.py"
FIXED_TIME = "2026-08-10T00:00:00Z"


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


CORE = load_module("search_reactions", CORE_PATH)
VALIDATOR = load_module("search_reactions_validator", VALIDATOR_PATH)
TOOLKIT = CORE.load_toolkit()


def curated_record(
    record_id,
    reaction_smiles,
    *,
    disposition="ready_for_search",
    dataset_id=None,
    conditions=None,
    yields=None,
    findings=None,
):
    inputs, agents, outputs = CORE.split_reaction_smiles(reaction_smiles)
    normalized_findings = []
    for item in findings or []:
        code = item["code"]
        normalized_findings.append(
            {
                "code": code,
                "severity": ("error" if disposition == "rejected" else "warning"),
                "field_path": "reaction_smiles",
                "message": item.get("message") or code,
                "evidence": [],
            }
        )
    participants = []
    for side, values in (("input", inputs), ("agent", agents), ("output", outputs)):
        for index, structure in enumerate(values):
            participants.append(
                {
                    "participant_id": f"{record_id}-{side}-{index}",
                    "side": side,
                    "reported_role": "product" if side == "output" else "unknown",
                    "reported_form": structure,
                    "standardized_form": structure,
                    "parent_form": structure,
                    "upstream_record_id": None,
                    "upstream_binding_status": "not_requested",
                    "upstream_disposition": None,
                    "upstream_human_review_required": [],
                    "participation_status": (
                        "product" if side == "output" else "contributes_product_atoms"
                    ),
                    "role_status": "consistent",
                    "findings": [],
                }
            )
    canonical = CORE.canonical_reaction_smiles(reaction_smiles, TOOLKIT)
    return {
        "record_id": record_id,
        "dataset_id": dataset_id,
        "source_locator": {"source": "engineering-gold"},
        "original_record_hash": CORE.sha256_json(
            {"record_id": record_id, "reaction_smiles": reaction_smiles}
        ),
        "ord_record": {},
        "reaction_smiles": {
            "reported": reaction_smiles,
            "canonical_unmapped": canonical,
        },
        "participant_assessments": participants,
        "role_assessment": {"status": "consistent"},
        "yield_assessment": {"measurements": list(yields or [])},
        "balance_assessment": {
            "status": "not_assessed",
            "assumption": "none",
            "element_delta": {},
            "formal_charge_delta": 0,
        },
        "mapping_assessment": {
            "requested": False,
            "status": "not_run",
            "backend": None,
            "confidence": None,
        },
        "duplicate_memberships": [],
        "conditions": list(conditions or []),
        "findings": normalized_findings,
        "curation_status": (
            "completed"
            if disposition == "ready_for_search"
            else "partial"
            if disposition == "review_required"
            else "error"
        ),
        "disposition": disposition,
        "human_review_required": [],
    }


def corpus_artifact():
    records = [
        curated_record(
            "r-oxidation",
            "CCO>O>CC=O",
            dataset_id="gold-a",
            conditions=[{"temperature": {"value": 25, "units": "CELSIUS"}}],
            yields=[{"value": 75, "units": "PERCENT"}],
        ),
        curated_record(
            "r-oxidation-dup",
            "CCO>[Na+].[Cl-]>CC=O",
            dataset_id="gold-b",
        ),
        curated_record("r-reduction", "CC=O>[H][H]>CCO", dataset_id="gold-a"),
        curated_record(
            "r-ester",
            "CC(=O)O.OCC>>CC(=O)OCC",
            dataset_id="gold-a",
        ),
        curated_record("r-amide", "CC(=O)Cl.N>>CC(N)=O", dataset_id="gold-c"),
        curated_record(
            "r-review",
            "BrCC>>CCO",
            disposition="review_required",
            findings=[{"code": "W-BALANCE-ATOM-001", "message": "review"}],
        ),
        curated_record(
            "r-rejected",
            "C>>N",
            disposition="rejected",
            findings=[{"code": "E-ORD-VALIDATION-001", "message": "rejected"}],
        ),
        curated_record("r-nochange", "CCO>>CCO", dataset_id="gold-z"),
        curated_record("r-chiral", "C[C@H](O)C(=O)O>>CC(=O)C(=O)O"),
    ]
    artifact = {
        "schema_version": "1.0.0",
        "workflow": "curate-reactions",
        "ruleset_version": "1.1.0",
        "generated_at_utc": FIXED_TIME,
        "runtime_seconds": 1.5,
        "tool_versions": {
            "rdkit": "2025.9.2",
            "ord-schema": "0.8.3",
        },
        "options": {
            "participant_view": "reported_form",
            "atom_mapping": "off",
            "balance_check": "diagnostic",
        },
        "source_record": {
            "identifier": "engineering-gold",
            "content_sha256": "a" * 64,
            "license": "test-only",
        },
        "records": records,
    }
    artifact["result_fingerprint"] = CORE.curated_artifact_fingerprint(artifact)
    return artifact


def request(operation, *, query=None, options=None, provider="local_curated_corpus"):
    value = {
        "schema_version": "1.0.0",
        "workflow": "search-reactions",
        "operation": operation,
        "provider": provider,
        "query": query or {},
        "options": {
            "fingerprint_profile_id": (
                "rdkit-difference-atompair-v1"
                if operation == "search_similar_reactions"
                else None
            ),
            "top_k": 20,
            "threshold": None,
            "candidate_limit": 100,
            "include_review_required": True,
            "use_stereochemistry": False,
        },
    }
    if provider == "local_curated_corpus":
        value["corpus_artifact"] = corpus_artifact()
    else:
        value["provider_config"] = {
            "base_url": CORE.ORD_API_BASE,
            "timeout_seconds": 5,
        }
    if options:
        value["options"].update(options)
    return value


def process(value, *, http_get=None):
    return CORE.process_request(
        value,
        generated_at_utc=FIXED_TIME,
        http_get=http_get,
    )


def ord_payload(reaction_id="ord-test", reaction_smiles="CCO>>CC=O"):
    reaction = TOOLKIT["message_helpers"].reaction_from_smiles(reaction_smiles)
    return {
        "dataset_id": "ord_dataset-test",
        "reaction_id": reaction_id,
        "proto": base64.b64encode(reaction.SerializeToString()).decode("ascii"),
    }


def successful_http_get(url, timeout):
    del timeout
    if "/reaction?" in url:
        return 200, ord_payload()
    return 200, [ord_payload()]


def case(
    case_id,
    value,
    *,
    status,
    min_results=0,
    ids=None,
    error_code=None,
    check=None,
    http_get=None,
):
    return {
        "case_id": case_id,
        "request": value,
        "status": status,
        "min_results": min_results,
        "ids": set(ids or []),
        "error_code": error_code,
        "check": check,
        "http_get": http_get,
    }


def build_gold_cases():
    cases = []

    # ID/source lookup: 4.
    cases.extend(
        [
            case(
                "lookup_reaction_id",
                request("lookup_reaction", query={"reaction_id": "r-oxidation"}),
                status="completed",
                min_results=1,
                ids={"r-oxidation"},
            ),
            case(
                "lookup_reaction_and_dataset",
                request(
                    "lookup_reaction",
                    query={"reaction_id": "r-oxidation", "dataset_id": "gold-a"},
                ),
                status="completed",
                min_results=1,
            ),
            case(
                "lookup_missing",
                request("lookup_reaction", query={"reaction_id": "r-missing"}),
                status="completed_zero_hits",
            ),
            case(
                "lookup_review_included",
                request("lookup_reaction", query={"reaction_id": "r-review"}),
                status="completed",
                min_results=1,
            ),
        ]
    )

    # Component queries: 8.
    cases.extend(
        [
            case(
                "component_input_exact",
                request(
                    "search_components",
                    query={
                        "component_predicates": [
                            {"target": "input", "mode": "exact", "pattern": "CCO"}
                        ]
                    },
                ),
                status="completed",
                min_results=3,
            ),
            case(
                "component_output_exact",
                request(
                    "search_components",
                    query={
                        "component_predicates": [
                            {"target": "output", "mode": "exact", "pattern": "CC=O"}
                        ]
                    },
                ),
                status="completed",
                min_results=2,
            ),
            case(
                "component_substructure",
                request(
                    "search_components",
                    query={
                        "component_predicates": [
                            {
                                "target": "output",
                                "mode": "substructure",
                                "pattern": "C(=O)O",
                            }
                        ]
                    },
                ),
                status="completed",
                min_results=2,
            ),
            case(
                "component_smarts",
                request(
                    "search_components",
                    query={
                        "component_predicates": [
                            {"target": "input", "mode": "smarts", "pattern": "[#6]-Br"}
                        ]
                    },
                ),
                status="completed",
                min_results=1,
                ids={"r-review"},
            ),
            case(
                "component_similar",
                request(
                    "search_components",
                    query={
                        "component_predicates": [
                            {
                                "target": "input",
                                "mode": "similar",
                                "pattern": "CCCO",
                                "threshold": 0.2,
                            }
                        ]
                    },
                ),
                status="completed",
                min_results=1,
            ),
            case(
                "component_predicates_and",
                request(
                    "search_components",
                    query={
                        "component_predicates": [
                            {"target": "input", "mode": "exact", "pattern": "CCO"},
                            {"target": "output", "mode": "exact", "pattern": "CC=O"},
                        ]
                    },
                ),
                status="completed",
                min_results=2,
            ),
            case(
                "component_zero_hits",
                request(
                    "search_components",
                    query={
                        "component_predicates": [
                            {"target": "input", "mode": "exact", "pattern": "[Xe]"}
                        ]
                    },
                ),
                status="completed_zero_hits",
            ),
            case(
                "component_invalid_smiles",
                request(
                    "search_components",
                    query={
                        "component_predicates": [
                            {"target": "input", "mode": "exact", "pattern": "C1"}
                        ]
                    },
                ),
                status="blocked",
                error_code="E-REQUEST-BLOCKED-001",
            ),
        ]
    )

    # Transformation queries: 8.
    cases.extend(
        [
            case(
                "transformation_oxidation",
                request(
                    "search_transformations",
                    query={"reaction_smarts": "[C:1]-[O:2]>>[C:1]=[O:2]"},
                ),
                status="completed",
                min_results=2,
            ),
            case(
                "transformation_reduction",
                request(
                    "search_transformations",
                    query={"reaction_smarts": "[C:1]=[O:2]>>[C:1]-[O:2]"},
                ),
                status="completed",
                min_results=1,
            ),
            case(
                "transformation_ester",
                request(
                    "search_transformations",
                    query={"reaction_smarts": "C(=O)O.OCC>>C(=O)OCC"},
                ),
                status="completed",
                min_results=1,
            ),
            case(
                "transformation_amide",
                request(
                    "search_transformations",
                    query={"reaction_smarts": "C(=O)Cl.N>>C(N)=O"},
                ),
                status="completed",
                min_results=1,
            ),
            case(
                "transformation_stereo_explicit",
                request(
                    "search_transformations",
                    query={"reaction_smarts": "C[C@H](O)C(=O)O>>CC(=O)C(=O)O"},
                    options={"use_stereochemistry": True},
                ),
                status="completed",
                min_results=1,
            ),
            case(
                "transformation_stereo_ignored",
                request(
                    "search_transformations",
                    query={"reaction_smarts": "C[C@@H](O)C(=O)O>>CC(=O)C(=O)O"},
                    options={"use_stereochemistry": False},
                ),
                status="completed",
                min_results=1,
            ),
            case(
                "transformation_zero_hits",
                request(
                    "search_transformations",
                    query={"reaction_smarts": "[Xe]>>[Kr]"},
                ),
                status="completed_zero_hits",
            ),
            case(
                "transformation_invalid",
                request(
                    "search_transformations",
                    query={"reaction_smarts": "not a reaction"},
                ),
                status="blocked",
                error_code="E-REQUEST-BLOCKED-001",
            ),
        ]
    )

    # Whole-reaction similarity: 12.
    diff = "rdkit-difference-atompair-v1"
    structural = "rdkit-structural-atompair-v1"
    cases.extend(
        [
            case(
                "similar_difference_exact",
                request(
                    "search_similar_reactions",
                    query={"reaction_smiles": "CCO>>CC=O"},
                    options={"fingerprint_profile_id": diff, "top_k": 3},
                ),
                status="completed",
                min_results=3,
                check=lambda d: unittest.TestCase().assertEqual(
                    d["results"][0]["raw_score"], 1.0
                ),
            ),
            case(
                "similar_structural_exact",
                request(
                    "search_similar_reactions",
                    query={"reaction_smiles": "CCO>>CC=O"},
                    options={"fingerprint_profile_id": structural, "top_k": 2},
                ),
                status="completed",
                min_results=2,
            ),
            case(
                "similar_agents_invariant_difference",
                request(
                    "search_similar_reactions",
                    query={"reaction_smiles": "CCO>N>CC=O"},
                    options={"fingerprint_profile_id": diff, "top_k": 2},
                ),
                status="completed",
                min_results=2,
                ids={"r-oxidation"},
                check=lambda d: unittest.TestCase().assertEqual(
                    d["results"][0]["raw_score"], 1.0
                ),
            ),
            case(
                "similar_agents_invariant_structural",
                request(
                    "search_similar_reactions",
                    query={"reaction_smiles": "CCO>N>CC=O"},
                    options={"fingerprint_profile_id": structural, "top_k": 2},
                ),
                status="completed",
                min_results=2,
            ),
            case(
                "similar_record_id",
                request(
                    "search_similar_reactions",
                    query={"reaction_record_id": "r-reduction"},
                    options={"top_k": 1},
                ),
                status="completed",
                min_results=1,
                ids={"r-reduction"},
            ),
            case(
                "similar_threshold",
                request(
                    "search_similar_reactions",
                    query={"reaction_smiles": "CCO>>CC=O"},
                    options={"threshold": 1.0},
                ),
                status="completed",
                min_results=2,
            ),
            case(
                "similar_tie_stable",
                request(
                    "search_similar_reactions",
                    query={"reaction_smiles": "CCO>>CC=O"},
                    options={"top_k": 2},
                ),
                status="completed",
                min_results=2,
                check=lambda d: unittest.TestCase().assertEqual(
                    [x["reaction_id"] for x in d["results"]],
                    ["r-oxidation", "r-reduction"],
                ),
            ),
            case(
                "similar_rejected_excluded",
                request(
                    "search_similar_reactions",
                    query={"reaction_smiles": "C>>N"},
                    options={"top_k": 20},
                ),
                status="completed",
                min_results=1,
                check=lambda d: unittest.TestCase().assertNotIn(
                    "r-rejected", {x["reaction_id"] for x in d["results"]}
                ),
            ),
            case(
                "similar_review_included",
                request(
                    "search_similar_reactions",
                    query={"reaction_smiles": "BrCC>>CCO"},
                    options={"top_k": 1, "include_review_required": True},
                ),
                status="completed",
                min_results=1,
                ids={"r-review"},
            ),
            case(
                "similar_review_excluded",
                request(
                    "search_similar_reactions",
                    query={"reaction_smiles": "BrCC>>CCO"},
                    options={"top_k": 20, "include_review_required": False},
                ),
                status="completed",
                min_results=1,
                check=lambda d: unittest.TestCase().assertNotIn(
                    "r-review", {x["reaction_id"] for x in d["results"]}
                ),
            ),
            case(
                "similar_no_change_retained",
                request(
                    "search_similar_reactions",
                    query={"reaction_smiles": "CCO>>CCO"},
                    options={"top_k": 1},
                ),
                status="completed",
                min_results=1,
                ids={"r-nochange"},
            ),
            case(
                "similar_invalid_profile",
                request(
                    "search_similar_reactions",
                    query={"reaction_smiles": "CCO>>CC=O"},
                    options={"fingerprint_profile_id": "unknown"},
                ),
                status="blocked",
                error_code="E-REQUEST-BLOCKED-001",
            ),
        ]
    )

    # Quality/evidence: 4.
    cases.extend(
        [
            case(
                "evidence_source_and_license",
                request("lookup_reaction", query={"reaction_id": "r-oxidation"}),
                status="completed",
                min_results=1,
                check=lambda d: unittest.TestCase().assertIn(
                    "license", d["results"][0]
                ),
            ),
            case(
                "evidence_conditions",
                request("lookup_reaction", query={"reaction_id": "r-oxidation"}),
                status="completed",
                min_results=1,
                check=lambda d: unittest.TestCase().assertTrue(
                    d["results"][0]["reported_condition_evidence"]
                ),
            ),
            case(
                "evidence_yield",
                request("lookup_reaction", query={"reaction_id": "r-oxidation"}),
                status="completed",
                min_results=1,
                check=lambda d: unittest.TestCase().assertEqual(
                    d["results"][0]["yield_measurements"][0]["value"], 75
                ),
            ),
            case(
                "quality_review_queue",
                request("lookup_reaction", query={"reaction_id": "r-review"}),
                status="completed",
                min_results=1,
                check=lambda d: unittest.TestCase().assertEqual(
                    d["review_queue"][0]["reaction_id"], "r-review"
                ),
            ),
        ]
    )

    # Provider failures: 4.
    def timeout_get(url, timeout):
        del url, timeout
        raise socket.timeout("timed out")

    def error_get(url, timeout):
        del url, timeout
        return 503, {"detail": "unavailable"}

    def parse_error_get(url, timeout):
        del url, timeout
        return 200, [{"dataset_id": "d", "reaction_id": "r", "proto": "not-base64"}]

    bad_allowlist = request(
        "lookup_reaction",
        query={"reaction_id": "ord-test"},
        provider="ord_public_api",
    )
    bad_allowlist["provider_config"]["base_url"] = "https://example.com/api"
    cases.extend(
        [
            case(
                "provider_timeout",
                request(
                    "lookup_reaction",
                    query={"reaction_id": "ord-test"},
                    provider="ord_public_api",
                ),
                status="source_timeout",
                error_code="E-SOURCE-TIMEOUT-001",
                http_get=timeout_get,
            ),
            case(
                "provider_http_error",
                request(
                    "lookup_reaction",
                    query={"reaction_id": "ord-test"},
                    provider="ord_public_api",
                ),
                status="source_error",
                error_code="E-SOURCE-HTTP-001",
                http_get=error_get,
            ),
            case(
                "provider_proto_error",
                request(
                    "lookup_reaction",
                    query={"reaction_id": "ord-test"},
                    provider="ord_public_api",
                ),
                status="source_error",
                error_code="E-SOURCE-HTTP-001",
                http_get=parse_error_get,
            ),
            case(
                "provider_allowlist",
                bad_allowlist,
                status="blocked",
                error_code="E-REQUEST-BLOCKED-001",
            ),
        ]
    )
    assert len(cases) == 40
    return cases


GOLD_CASES = build_gold_cases()


class SearchReactionsGoldTests(unittest.TestCase):
    pass


def make_gold_test(gold):
    def test(self):
        document = process(gold["request"], http_get=gold["http_get"])
        self.assertEqual(document["provider_status"], gold["status"])
        self.assertGreaterEqual(len(document["results"]), gold["min_results"])
        result_ids = {item["reaction_id"] for item in document["results"]}
        self.assertTrue(gold["ids"].issubset(result_ids))
        if gold["error_code"]:
            self.assertIn(
                gold["error_code"], {item["code"] for item in document["errors"]}
            )
        if gold["check"]:
            gold["check"](document)
        self.assertEqual(VALIDATOR.validate_output(document), [])

    return test


for _index, _gold in enumerate(GOLD_CASES, start=1):
    setattr(
        SearchReactionsGoldTests,
        f"test_gold_{_index:02d}_{_gold['case_id']}",
        make_gold_test(_gold),
    )


class ContractAndCliTests(unittest.TestCase):
    def test_agents_do_not_change_adopted_reaction_fingerprints(self):
        for profile_id, definition in CORE.PROFILE_DEFINITIONS.items():
            first, _ = CORE.reaction_fingerprint("CCO>O>CC=O", profile_id, TOOLKIT)
            second, _ = CORE.reaction_fingerprint(
                "CCO>[Na+].[Cl-]>CC=O", profile_id, TOOLKIT
            )
            score = CORE.fingerprint_similarity(
                first, second, definition["metric"], TOOLKIT
            )
            self.assertEqual(score, 1.0)

    def test_deterministic_output_excluding_time_and_runtime(self):
        value = request(
            "search_similar_reactions",
            query={"reaction_smiles": "CCO>>CC=O"},
            options={"top_k": 5},
        )
        first = process(value)
        second = CORE.process_request(value, generated_at_utc="2027-01-01T00:00:00Z")
        self.assertEqual(first["result_fingerprint"], second["result_fingerprint"])
        self.assertEqual(first["results"], second["results"])

    def test_result_fingerprint_detects_tampering(self):
        document = process(
            request("lookup_reaction", query={"reaction_id": "r-oxidation"})
        )
        document["results"][0]["reaction_id"] = "tampered"
        self.assertIn(
            "result_fingerprint 不匹配",
            VALIDATOR.validate_output(document),
        )

    def test_result_hash_detects_tampering(self):
        document = process(
            request("lookup_reaction", query={"reaction_id": "r-oxidation"})
        )
        document["results"][0]["raw_score"] = 0.5
        errors = VALIDATOR.validate_output(document)
        self.assertTrue(any("result_hash 不匹配" in item for item in errors))

    def test_profile_scores_are_separate_and_identified(self):
        profiles = {}
        for profile_id in CORE.PROFILE_DEFINITIONS:
            document = process(
                request(
                    "search_similar_reactions",
                    query={"reaction_smiles": "CCO>>CC=O"},
                    options={"fingerprint_profile_id": profile_id, "top_k": 1},
                )
            )
            profiles[profile_id] = document["results"][0]["fingerprint_profile"]
        self.assertEqual(set(profiles), set(CORE.PROFILE_DEFINITIONS))
        self.assertNotEqual(
            profiles["rdkit-difference-atompair-v1"]["metric"],
            profiles["rdkit-structural-atompair-v1"]["metric"],
        )

    def test_remote_lookup_success_and_license(self):
        document = process(
            request(
                "lookup_reaction",
                query={"reaction_id": "ord-test"},
                provider="ord_public_api",
            ),
            http_get=successful_http_get,
        )
        self.assertEqual(document["provider_status"], "completed")
        self.assertEqual(document["results"][0]["license"], "CC-BY-SA-4.0")
        self.assertEqual(VALIDATOR.validate_output(document), [])

    def test_remote_lookup_404_is_completed_zero_hits(self):
        error = urllib.error.HTTPError(
            CORE.ORD_API_BASE + "/reaction",
            404,
            "Not Found",
            {},
            io.BytesIO(b"{}"),
        )
        with patch.object(
            CORE.urllib.request,
            "urlopen",
            side_effect=error,
        ):
            document = process(
                request(
                    "lookup_reaction",
                    query={"reaction_id": "missing"},
                    provider="ord_public_api",
                )
            )

        self.assertEqual(document["provider_status"], "completed_zero_hits")
        self.assertEqual(document["results"], [])
        self.assertEqual(document["errors"], [])
        self.assertEqual(VALIDATOR.validate_output(document), [])

    def test_local_corpus_source_license_and_provenance_are_propagated(self):
        artifact = corpus_artifact()
        artifact["records"][0]["source_locator"] = None
        artifact["source_record"] = {
            "identifier": "controlled-corpus",
            "content_sha256": "a" * 64,
            "license": "Apache-2.0",
        }
        artifact["result_fingerprint"] = CORE.curated_artifact_fingerprint(artifact)
        value = request(
            "lookup_reaction",
            query={"reaction_id": "r-oxidation"},
        )
        value["corpus_artifact"] = artifact
        document = process(value)
        result = document["results"][0]
        self.assertEqual(result["license"], "Apache-2.0")
        self.assertEqual(
            result["source"]["source_locator"]["identifier"],
            "controlled-corpus",
        )
        self.assertEqual(
            result["source"]["provenance"]["workflow"],
            "curate-reactions",
        )
        self.assertEqual(VALIDATOR.validate_output(document), [])

    def test_local_ord_evidence_is_preserved_from_curated_record(self):
        artifact = corpus_artifact()
        record = artifact["records"][0]
        record["conditions"] = []
        record["yield_assessment"] = {"measurements": []}
        record["ord_record"] = {
            "conditions": {"temperature": {"setpoint": {"value": 25.0}}},
            "outcomes": [
                {
                    "products": [
                        {
                            "identifiers": [{"type": "SMILES", "value": "CC=O"}],
                            "measurements": [
                                {
                                    "type": "YIELD",
                                    "percentage": {"value": 75.0},
                                }
                            ],
                        }
                    ]
                }
            ],
            "provenance": {"record_created": {"person": {"name": "test"}}},
        }
        artifact["result_fingerprint"] = CORE.curated_artifact_fingerprint(artifact)
        value = request("lookup_reaction", query={"reaction_id": "r-oxidation"})
        value["corpus_artifact"] = artifact
        document = process(value)
        result = document["results"][0]
        self.assertEqual(
            result["reported_condition_evidence"]["temperature"]["setpoint"]["value"],
            25.0,
        )
        self.assertEqual(result["yield_measurements"][0]["value"], 75.0)
        self.assertTrue(result["source"]["provenance"])
        self.assertEqual(VALIDATOR.validate_output(document), [])

    def test_remote_component_query_encodes_structured_predicate(self):
        captured = {}

        def get(url, timeout):
            captured["url"] = url
            return successful_http_get(url, timeout)

        document = process(
            request(
                "search_components",
                query={
                    "component_predicates": [
                        {"target": "input", "mode": "smarts", "pattern": "[#6;R]"}
                    ]
                },
                provider="ord_public_api",
            ),
            http_get=get,
        )
        self.assertEqual(document["provider_status"], "completed_zero_hits")
        self.assertIn("component=", captured["url"])
        self.assertIn("%3B", captured["url"])

    def test_bad_corpus_fingerprint_blocks(self):
        value = request("lookup_reaction", query={"reaction_id": "r-oxidation"})
        value["corpus_artifact"]["records"][0]["record_id"] = "tampered"
        document = process(value)
        self.assertEqual(document["provider_status"], "blocked")
        self.assertEqual(document["results"], [])
        self.assertEqual(VALIDATOR.validate_output(document), [])

    def test_rejected_never_ranked_even_when_review_enabled(self):
        document = process(
            request(
                "search_similar_reactions",
                query={"reaction_smiles": "C>>N"},
                options={"top_k": 20, "include_review_required": True},
            )
        )
        self.assertNotIn(
            "r-rejected", {item["reaction_id"] for item in document["results"]}
        )
        self.assertIn(
            "r-rejected",
            {
                item.get("reaction_id")
                for item in document["excluded_records"]
                if isinstance(item, dict)
            },
        )

    def test_output_has_no_forbidden_scientific_keys(self):
        document = process(
            request("lookup_reaction", query={"reaction_id": "r-oxidation"})
        )
        serialized = json.dumps(document, ensure_ascii=False)
        for key in VALIDATOR.FORBIDDEN_KEYS:
            self.assertNotIn(f'"{key}"', serialized)

    def test_cli_success_and_validator(self):
        value = request(
            "search_similar_reactions",
            query={"reaction_smiles": "CCO>>CC=O"},
            options={"top_k": 3},
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            input_path = root / "request.json"
            output_path = root / "output.json"
            input_path.write_text(json.dumps(value), encoding="utf-8")
            completed = subprocess.run(
                [
                    sys.executable,
                    str(CORE_PATH),
                    "--input",
                    str(input_path),
                    "--output",
                    str(output_path),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            validation = subprocess.run(
                [sys.executable, str(VALIDATOR_PATH), str(output_path)],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(validation.returncode, 0, validation.stdout)

    def test_cli_blocked_returns_one_but_writes_auditable_output(self):
        value = request("lookup_reaction", query={"reaction_id": "r-oxidation"})
        value["corpus_artifact"]["result_fingerprint"] = "0" * 64
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            input_path = root / "request.json"
            output_path = root / "output.json"
            input_path.write_text(json.dumps(value), encoding="utf-8")
            completed = subprocess.run(
                [
                    sys.executable,
                    str(CORE_PATH),
                    "--input",
                    str(input_path),
                    "--output",
                    str(output_path),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(completed.returncode, 1, completed.stderr)
            document = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(document["provider_status"], "blocked")
            self.assertEqual(VALIDATOR.validate_output(document), [])

    def test_cli_supports_relative_artifact_path(self):
        value = request("lookup_reaction", query={"reaction_id": "r-oxidation"})
        artifact = value.pop("corpus_artifact")
        value["corpus_artifact_path"] = "corpus.json"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "corpus.json").write_text(json.dumps(artifact), encoding="utf-8")
            request_path = root / "request.json"
            output_path = root / "output.json"
            request_path.write_text(json.dumps(value), encoding="utf-8")
            completed = subprocess.run(
                [
                    sys.executable,
                    str(CORE_PATH),
                    "--input",
                    str(request_path),
                    "--output",
                    str(output_path),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)

    def test_secret_request_is_blocked_without_echo(self):
        value = request("lookup_reaction", query={"reaction_id": "r-oxidation"})
        fake_secret = "abcdefghijklmnop"
        value["provider_config"] = {"Authorization": "Bearer " + fake_secret}
        document = process(value)
        self.assertEqual(document["provider_status"], "blocked")
        self.assertNotIn(fake_secret, json.dumps(document))
        self.assertEqual(VALIDATOR.validate_output(document), [])

    def test_top_k_limit(self):
        value = request(
            "search_similar_reactions",
            query={"reaction_smiles": "CCO>>CC=O"},
            options={"top_k": 101},
        )
        document = process(value)
        self.assertEqual(document["provider_status"], "blocked")

    def test_non_similarity_operation_rejects_profile(self):
        value = request("lookup_reaction", query={"reaction_id": "r-oxidation"})
        value["options"]["fingerprint_profile_id"] = "rdkit-difference-atompair-v1"
        document = process(value)
        self.assertEqual(document["provider_status"], "blocked")

    def test_local_50k_resource_limit(self):
        artifact = corpus_artifact()
        artifact["records"] = [artifact["records"][0]] * (CORE.MAX_LOCAL_RECORDS + 1)
        artifact["result_fingerprint"] = CORE.curated_artifact_fingerprint(artifact)
        value = request("lookup_reaction", query={"reaction_id": "r-oxidation"})
        value["corpus_artifact"] = artifact
        document = process(value)
        self.assertEqual(document["provider_status"], "blocked")


if __name__ == "__main__":
    unittest.main()
