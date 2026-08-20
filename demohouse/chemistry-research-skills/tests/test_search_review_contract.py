import copy
import hashlib
import importlib.util
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CURATE_PATH = ROOT / "skills" / "curate-reactions" / "scripts" / "curate_reactions.py"
SEARCH_PATH = ROOT / "skills" / "search-reactions" / "scripts" / "search_reactions.py"
CONTRACT_PATH = (
    ROOT / "skills" / "review-routes" / "scripts" / "searched_artifact_contract.py"
)
BINDING_PATH = (
    ROOT / "skills" / "review-routes" / "scripts" / "precedent_step_binding.py"
)
FIXED_TIME = "2026-08-16T00:00:00Z"


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


CURATE = load_module("search_review_curate_producer", CURATE_PATH)
SEARCH = load_module("search_review_search_producer", SEARCH_PATH)
TOOLKIT = SEARCH.load_toolkit()


def load_contract():
    return load_module("searched_artifact_contract_under_test", CONTRACT_PATH)


def load_binding():
    return load_module("precedent_step_binding_under_test", BINDING_PATH)


def curate_request(reaction="CCO>>COC", record_id="route-step-record"):
    return {
        "schema_version": "1.0.0",
        "workflow": "curate-reactions",
        "input_profile": "reaction_smiles",
        "source": {
            "identifier": "search-review-contract",
            "content_sha256": "a" * 64,
            "license": "test-only",
        },
        "options": {
            "participant_view": "reported_form",
            "atom_mapping": "off",
            "balance_check": "diagnostic",
        },
        "upstream_artifacts": [],
        "records": [
            {
                "record_id": record_id,
                "reaction_smiles": reaction,
                "stoichiometry_complete": True,
            }
        ],
    }


def search_options(profile=None):
    return {
        "fingerprint_profile_id": profile,
        "top_k": 20,
        "threshold": None,
        "candidate_limit": 100,
        "include_review_required": True,
        "use_stereochemistry": False,
    }


def make_search_artifact(
    *,
    reaction="CCO>>COC",
    record_id="route-step-record",
    operation="lookup_reaction",
    query=None,
    option_updates=None,
):
    curated = CURATE.process_request(
        curate_request(reaction, record_id),
        generated_at_utc=FIXED_TIME,
    )
    profile = (
        "rdkit-difference-atompair-v1"
        if operation == "search_similar_reactions"
        else None
    )
    options = search_options(profile)
    options.update(option_updates or {})
    request = {
        "schema_version": "1.0.0",
        "workflow": "search-reactions",
        "operation": operation,
        "provider": "local_curated_corpus",
        "query": query or {"reaction_id": record_id},
        "options": options,
        "corpus_artifact": curated,
    }
    return SEARCH.process_request(request, generated_at_utc=FIXED_TIME)


def rehash_result(result):
    payload = {
        key: value
        for key, value in result.items()
        if key not in {"rank", "result_hash"}
    }
    result["result_hash"] = SEARCH.sha256_json(payload)


def rehash_artifact(artifact):
    artifact["result_fingerprint"] = SEARCH.stable_document_fingerprint(artifact)


def issue_codes(artifact):
    return {
        item["code"] for item in load_contract().validate_searched_artifact(artifact)
    }


def make_step(reaction="CCO>>COC"):
    canonical = SEARCH.canonical_reaction_smiles(reaction, TOOLKIT)
    return {
        "reported_reaction": reaction,
        "canonical_reaction": canonical,
        "step_reaction_hash": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
    }


def bind(artifact, reaction="CCO>>COC"):
    return load_binding().bind_precedent_evidence(
        artifact,
        make_step(reaction),
        TOOLKIT,
        load_contract(),
    )


class SearchedArtifactContractTests(unittest.TestCase):
    def test_official_search_artifact_is_valid(self):
        artifact = make_search_artifact()
        self.assertEqual(
            load_contract().validate_searched_artifact(artifact),
            [],
        )

    def test_stale_artifact_fingerprint_is_rejected(self):
        artifact = make_search_artifact()
        artifact["provider_status"] = "partial"
        self.assertIn("E-SEARCH-FINGERPRINT-001", issue_codes(artifact))

    def test_rehashed_artifact_envelope_tampering_is_rejected(self):
        for field, value in (
            ("schema_version", "9.9.9"),
            ("workflow", "wrong"),
            ("ruleset_version", "9.9.9"),
            ("operation", "wrong"),
            ("provider", "wrong"),
            ("tool_versions", []),
        ):
            with self.subTest(field=field):
                artifact = make_search_artifact()
                artifact[field] = value
                rehash_artifact(artifact)
                self.assertIn("E-SEARCH-CONTRACT-001", issue_codes(artifact))

    def test_rehashed_artifact_query_and_options_divergence_is_rejected(self):
        mutators = (
            lambda artifact: artifact["query_interpretation"].update(
                {"operation": "search_components"}
            ),
            lambda artifact: artifact["query_interpretation"].update(
                {"provider": "ord_public_api"}
            ),
            lambda artifact: artifact["query_interpretation"].update({"logic": "OR"}),
            lambda artifact: artifact["query_interpretation"].update({"query": []}),
            lambda artifact: artifact["query_interpretation"].update(
                {"threshold": 0.7}
            ),
            lambda artifact: artifact["options"].update({"top_k": True}),
            lambda artifact: artifact["options"].update(
                {"include_review_required": "yes"}
            ),
        )
        for mutate in mutators:
            with self.subTest(mutate=mutate):
                artifact = make_search_artifact()
                mutate(artifact)
                rehash_artifact(artifact)
                self.assertIn("E-SEARCH-QUERY-001", issue_codes(artifact))

    def test_rehashed_artifact_provider_state_tampering_is_rejected(self):
        mutators = (
            lambda artifact: artifact.update({"results": []}),
            lambda artifact: artifact.update(
                {"provider_status": "completed_zero_hits"}
            ),
            lambda artifact: artifact.update(
                {
                    "provider_status": "blocked",
                    "errors": [{"code": "E-REQUEST-BLOCKED-001"}],
                }
            ),
            lambda artifact: artifact.update(
                {
                    "provider_status": "source_timeout",
                    "errors": [{"code": "E-SOURCE-TIMEOUT-001"}],
                }
            ),
            lambda artifact: artifact.update(
                {
                    "provider_status": "source_error",
                    "errors": [{"code": "E-SOURCE-HTTP-001"}],
                }
            ),
        )
        for mutate in mutators:
            with self.subTest(mutate=mutate):
                artifact = make_search_artifact()
                mutate(artifact)
                rehash_artifact(artifact)
                self.assertIn("E-SEARCH-STATE-001", issue_codes(artifact))

    def test_rehashed_artifact_result_tampering_is_rejected(self):
        mutators = (
            lambda result: result.update({"provider": "ord_public_api"}),
            lambda result: result.update({"retrieval_mode": "component_and_filter"}),
            lambda result: result.update({"curation_disposition": "rejected"}),
            lambda result: result.update({"raw_score": True}),
            lambda result: result.update({"matched_constraints": {}}),
        )
        for mutate in mutators:
            with self.subTest(mutate=mutate):
                artifact = make_search_artifact()
                mutate(artifact["results"][0])
                rehash_result(artifact["results"][0])
                rehash_artifact(artifact)
                self.assertIn("E-SEARCH-RESULT-001", issue_codes(artifact))

    def test_stale_result_hash_is_rejected_after_artifact_rehash(self):
        artifact = make_search_artifact()
        artifact["results"][0]["reaction_smiles"] = "N>>C"
        rehash_artifact(artifact)
        self.assertIn("E-SEARCH-RESULT-001", issue_codes(artifact))

    def test_duplicate_result_id_is_rejected(self):
        artifact = make_search_artifact()
        duplicate = copy.deepcopy(artifact["results"][0])
        duplicate["rank"] = 2
        artifact["results"].append(duplicate)
        rehash_artifact(artifact)
        self.assertIn("E-SEARCH-RESULT-ID-001", issue_codes(artifact))


class PrecedentLookupSimilarityBindingTests(unittest.TestCase):
    def test_lookup_exact_result_must_hash_to_step(self):
        evidence, findings = bind(make_search_artifact())
        self.assertEqual(evidence["binding_status"], "bound")
        self.assertEqual(evidence["match_level"], "exact_record")
        self.assertEqual(evidence["result_ids"], ["route-step-record"])
        self.assertEqual(findings, [])

    def test_valid_unrelated_exact_artifact_fails_binding(self):
        artifact = make_search_artifact(
            reaction="CCO>>CC=O",
            record_id="unrelated-record",
        )
        evidence, findings = bind(artifact, "CCO>>COC")
        self.assertEqual(evidence["binding_status"], "failed")
        self.assertEqual(
            {item["code"] for item in findings},
            {"E-PRECEDENT-BINDING-001"},
        )

    def test_lookup_id_only_zero_hit_fails_binding(self):
        artifact = make_search_artifact(
            query={"reaction_id": "missing-record"},
        )
        self.assertEqual(artifact["provider_status"], "completed_zero_hits")
        evidence, findings = bind(artifact)
        self.assertEqual(evidence["binding_status"], "failed")
        self.assertEqual(
            {item["code"] for item in findings},
            {"E-PRECEDENT-BINDING-001"},
        )

    def test_similarity_reaction_smiles_binds_to_step(self):
        artifact = make_search_artifact(
            operation="search_similar_reactions",
            query={"reaction_smiles": "CCO>>COC"},
        )
        evidence, findings = bind(artifact)
        self.assertEqual(evidence["binding_status"], "bound")
        self.assertEqual(evidence["match_level"], "similar_reaction")
        self.assertEqual(findings[0]["code"], "W-PRECEDENT-SIMILAR-001")

    def test_similarity_record_id_requires_exact_target_result(self):
        artifact = make_search_artifact(
            operation="search_similar_reactions",
            query={"reaction_record_id": "route-step-record"},
        )
        evidence, findings = bind(artifact)
        self.assertEqual(evidence["binding_status"], "bound")
        self.assertEqual(evidence["match_level"], "similar_reaction")
        self.assertEqual(findings[0]["code"], "W-PRECEDENT-SIMILAR-001")

        artifact["results"][0]["matched_constraints"] = [
            {"exact_target_reaction": False}
        ]
        rehash_result(artifact["results"][0])
        rehash_artifact(artifact)
        evidence, findings = bind(artifact)
        self.assertEqual(evidence["binding_status"], "failed")
        self.assertEqual(
            {item["code"] for item in findings},
            {"E-PRECEDENT-BINDING-001"},
        )

    def test_similarity_result_mode_upgrade_is_contract_invalid(self):
        artifact = make_search_artifact(
            operation="search_similar_reactions",
            query={"reaction_smiles": "CCO>>COC"},
        )
        artifact["results"][0].update(
            {
                "retrieval_mode": "exact_id",
                "fingerprint_profile": None,
                "score_scope": "exact_identifier",
            }
        )
        rehash_result(artifact["results"][0])
        rehash_artifact(artifact)
        evidence, findings = bind(artifact)
        self.assertEqual(evidence["binding_status"], "failed")
        self.assertEqual(
            {item["code"] for item in findings},
            {"E-PRECEDENT-ARTIFACT-CONTRACT-001"},
        )


class PrecedentTransformationComponentBindingTests(unittest.TestCase):
    def test_transformation_query_must_match_step(self):
        artifact = make_search_artifact(
            operation="search_transformations",
            query={"reaction_smarts": "CCO>>COC"},
        )
        self.assertEqual(artifact["provider_status"], "completed")
        evidence, findings = bind(artifact)
        self.assertEqual(evidence["binding_status"], "bound")
        self.assertEqual(evidence["match_level"], "exact_transformation")
        self.assertEqual(findings, [])

        unrelated = make_search_artifact(
            operation="search_transformations",
            query={"reaction_smarts": "N>>C"},
        )
        evidence, findings = bind(unrelated)
        self.assertEqual(evidence["binding_status"], "failed")
        self.assertEqual(
            {item["code"] for item in findings},
            {"E-PRECEDENT-BINDING-001"},
        )

    def test_transformation_result_constraints_must_match_query(self):
        artifact = make_search_artifact(
            operation="search_transformations",
            query={"reaction_smarts": "CCO>>COC"},
        )
        artifact["results"][0]["matched_constraints"] = [{"reaction_smarts": "N>>C"}]
        rehash_result(artifact["results"][0])
        rehash_artifact(artifact)
        evidence, findings = bind(artifact)
        self.assertEqual(evidence["binding_status"], "failed")
        self.assertEqual(
            {item["code"] for item in findings},
            {"E-PRECEDENT-BINDING-001"},
        )

    def test_component_query_modes_bind_to_step(self):
        predicates = (
            {"target": "input", "mode": "exact", "pattern": "CCO", "threshold": None},
            {
                "target": "input",
                "mode": "substructure",
                "pattern": "CO",
                "threshold": None,
            },
            {
                "target": "input",
                "mode": "smarts",
                "pattern": "[C][C][O]",
                "threshold": None,
            },
            {
                "target": "input",
                "mode": "similar",
                "pattern": "CCO",
                "threshold": 0.9,
            },
        )
        for predicate in predicates:
            with self.subTest(mode=predicate["mode"]):
                artifact = make_search_artifact(
                    operation="search_components",
                    query={"component_predicates": [predicate]},
                )
                evidence, findings = bind(artifact)
                self.assertEqual(evidence["binding_status"], "bound")
                self.assertEqual(evidence["match_level"], "component_only")
                self.assertEqual(
                    {item["code"] for item in findings},
                    {"W-PRECEDENT-COMPONENT-001"},
                )

    def test_component_predicates_use_and_and_match_result_constraints(self):
        predicates = [
            {"target": "input", "mode": "exact", "pattern": "CCO", "threshold": None},
            {
                "target": "output",
                "mode": "exact",
                "pattern": "COC",
                "threshold": None,
            },
        ]
        artifact = make_search_artifact(
            operation="search_components",
            query={"component_predicates": predicates},
        )
        evidence, _ = bind(artifact)
        self.assertEqual(evidence["binding_status"], "bound")

        artifact["results"][0]["matched_constraints"] = predicates[:1]
        rehash_result(artifact["results"][0])
        rehash_artifact(artifact)
        evidence, findings = bind(artifact)
        self.assertEqual(evidence["binding_status"], "failed")
        self.assertEqual(
            {item["code"] for item in findings},
            {"E-PRECEDENT-BINDING-001"},
        )

    def test_component_query_for_unrelated_step_fails_binding(self):
        artifact = make_search_artifact(
            operation="search_components",
            query={
                "component_predicates": [
                    {
                        "target": "input",
                        "mode": "exact",
                        "pattern": "N",
                        "threshold": None,
                    }
                ]
            },
        )
        evidence, findings = bind(artifact)
        self.assertEqual(evidence["binding_status"], "failed")
        self.assertEqual(
            {item["code"] for item in findings},
            {"E-PRECEDENT-BINDING-001"},
        )

    def test_component_exact_respects_stereochemistry_option(self):
        reaction = "C[C@H](O)CC>>CCC(C)O"
        predicate = {
            "target": "input",
            "mode": "exact",
            "pattern": "C[C@@H](O)CC",
            "threshold": None,
        }
        without_stereo = make_search_artifact(
            reaction=reaction,
            operation="search_components",
            query={"component_predicates": [predicate]},
        )
        evidence, _ = bind(without_stereo, reaction)
        self.assertEqual(evidence["binding_status"], "bound")

        with_stereo = make_search_artifact(
            reaction=reaction,
            operation="search_components",
            query={"component_predicates": [predicate]},
            option_updates={"use_stereochemistry": True},
        )
        evidence, findings = bind(with_stereo, reaction)
        self.assertEqual(evidence["binding_status"], "failed")
        self.assertEqual(
            {item["code"] for item in findings},
            {"E-PRECEDENT-BINDING-001"},
        )
