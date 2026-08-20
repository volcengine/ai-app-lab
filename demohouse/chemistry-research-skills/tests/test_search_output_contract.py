from __future__ import annotations

import copy
import importlib.util
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CURATE_PATH = ROOT / "skills" / "curate-reactions" / "scripts" / "curate_reactions.py"
SEARCH_SCRIPTS = ROOT / "skills" / "search-reactions" / "scripts"


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


CURATE = load_module("search_output_curate", CURATE_PATH)
SEARCH = load_module(
    "search_reactions",
    SEARCH_SCRIPTS / "search_reactions.py",
)
VALIDATOR = load_module(
    "search_output_validator",
    SEARCH_SCRIPTS / "validate_output.py",
)
FIXED_TIME = "2026-08-16T00:00:00Z"


def make_curate_artifact():
    request = {
        "schema_version": "1.0.0",
        "workflow": "curate-reactions",
        "input_profile": "reaction_smiles",
        "source": {
            "identifier": "search-output-contract-test",
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
                "record_id": "r1",
                "reaction_smiles": "CCO>>COC",
                "stoichiometry_complete": True,
            }
        ],
    }
    return CURATE.process_request(request, generated_at_utc=FIXED_TIME)


def search_request(artifact):
    return {
        "schema_version": "1.0.0",
        "workflow": "search-reactions",
        "operation": "lookup_reaction",
        "provider": "local_curated_corpus",
        "query": {"reaction_id": "r1"},
        "options": {
            "fingerprint_profile_id": None,
            "top_k": 20,
            "threshold": None,
            "candidate_limit": 100,
            "include_review_required": True,
            "use_stereochemistry": False,
        },
        "corpus_artifact": artifact,
    }


def process(value, **kwargs):
    return SEARCH.process_request(
        value,
        generated_at_utc=FIXED_TIME,
        **kwargs,
    )


class SearchOutputContractTests(unittest.TestCase):
    def test_local_output_binds_exact_corpus_fingerprint(self):
        artifact = make_curate_artifact()
        document = process(search_request(artifact))
        provenance = document["corpus_provenance"]
        self.assertEqual(
            provenance["artifact_fingerprint"],
            artifact["result_fingerprint"],
        )
        self.assertEqual(provenance["contract_status"], "valid")

    def test_different_corpus_fingerprint_changes_search_fingerprint(self):
        first = make_curate_artifact()
        first["records"][0]["source"] = {"kind": "explicit"}
        first["result_fingerprint"] = CURATE.stable_document_fingerprint(first)
        second = copy.deepcopy(first)
        second["notices"].append("changed top-level evidence")
        second["result_fingerprint"] = CURATE.stable_document_fingerprint(second)
        first_output = process(search_request(first))
        second_output = process(search_request(second))
        self.assertNotEqual(
            first_output["result_fingerprint"],
            second_output["result_fingerprint"],
        )

    def test_ord_output_marks_corpus_not_applicable(self):
        value = {
            "schema_version": "1.0.0",
            "workflow": "search-reactions",
            "operation": "lookup_reaction",
            "provider": "ord_public_api",
            "query": {"reaction_id": "missing"},
            "options": {
                "fingerprint_profile_id": None,
                "top_k": 20,
                "threshold": None,
                "candidate_limit": 100,
                "include_review_required": False,
                "use_stereochemistry": False,
            },
            "provider_config": {
                "base_url": SEARCH.ORD_API_BASE,
                "timeout_seconds": 5,
            },
        }
        document = process(value, http_get=lambda url, timeout: (404, {}))
        self.assertEqual(
            document["corpus_provenance"]["contract_status"],
            "not_applicable",
        )

    def test_validator_rejects_blocked_changed_to_zero_hit(self):
        artifact = make_curate_artifact()
        artifact["result_fingerprint"] = "0" * 64
        document = process(search_request(artifact))
        document["provider_status"] = "completed_zero_hits"
        document["errors"] = []
        document["result_fingerprint"] = SEARCH.stable_document_fingerprint(document)
        errors = VALIDATOR.validate_output(document)
        self.assertTrue(
            any("corpus_provenance invalid" in item for item in errors),
            errors,
        )

    def test_validator_rejects_invalid_provenance_changed_to_valid(self):
        artifact = make_curate_artifact()
        artifact["workflow"] = "wrong"
        artifact["result_fingerprint"] = CURATE.stable_document_fingerprint(artifact)
        document = process(search_request(artifact))
        document["corpus_provenance"]["contract_status"] = "valid"
        document["result_fingerprint"] = SEARCH.stable_document_fingerprint(document)
        errors = VALIDATOR.validate_output(document)
        self.assertTrue(
            any("corpus_provenance" in item for item in errors),
            errors,
        )

    def test_validator_rejects_rehashed_boolean_integer_fields(self):
        cases = (
            (
                "top_k",
                lambda document: document["options"].update({"top_k": True}),
                "options.top_k",
            ),
            (
                "rank",
                lambda document: document["results"][0].update({"rank": True}),
                "results[0].rank",
            ),
            (
                "corpus_count",
                lambda document: document["corpus_summary"].update(
                    {"input_records": True}
                ),
                "corpus_summary.input_records",
            ),
        )
        for name, mutate, expected_path in cases:
            with self.subTest(field=name):
                document = process(search_request(make_curate_artifact()))
                mutate(document)
                document["result_fingerprint"] = SEARCH.stable_document_fingerprint(
                    document
                )

                errors = VALIDATOR.validate_output(document)

                self.assertTrue(
                    any(expected_path in item for item in errors),
                    errors,
                )
