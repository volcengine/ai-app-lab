from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FIXTURE_PATH = ROOT / "tests" / "test_search_review_integration.py"
CONTRACT_PATH = (
    ROOT / "skills" / "review-routes" / "scripts" / "precedent_output_contract.py"
)


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


FIXTURES = load_module("precedent_output_fixtures", FIXTURE_PATH)
CORE = FIXTURES.CORE
VALIDATOR = FIXTURES.ROUTES.VALIDATOR


def load_contract():
    if not CONTRACT_PATH.is_file():
        raise AssertionError(f"missing precedent output contract: {CONTRACT_PATH}")
    return load_module("precedent_output_contract_under_test", CONTRACT_PATH)


def make_document(state="exact"):
    value = FIXTURES.prepare()
    entry = value["step_artifacts"][0]
    record = FIXTURES.entry_record(entry)
    reaction = record["reaction_smiles"]["reported"]
    if state == "missing":
        entry["precedent_artifact"] = None
    elif state == "similar":
        FIXTURES.attach_real_precedent(
            value,
            operation="search_similar_reactions",
            query={"reaction_smiles": reaction},
        )
    else:
        artifact = FIXTURES.attach_real_precedent(value)
        if state == "partial":
            artifact["provider_status"] = "partial"
            artifact["warnings"] = [{"code": "W-PARTIAL-001"}]
        elif state == "blocked":
            artifact["provider_status"] = "blocked"
            artifact["results"] = []
            artifact["review_queue"] = []
            artifact["errors"] = [{"code": "E-REQUEST-BLOCKED-001"}]
            artifact["corpus_provenance"]["contract_status"] = "invalid"
        elif state == "result_review":
            result = artifact["results"][0]
            result["curation_disposition"] = "review_required"
            result["quality_findings"] = [{"code": "W-CANDIDATE-REVIEW-001"}]
            artifact["review_queue"] = [
                {
                    "reaction_id": result["reaction_id"],
                    "reason_codes": ["W-CANDIDATE-REVIEW-001"],
                }
            ]
            FIXTURES.SEARCH_FIXTURES.rehash_result(result)
        FIXTURES.rehash_search(artifact)
    return FIXTURES.process(value)


def first_route(document):
    return document["route_summaries"][0]


def first_precedent(document):
    return first_route(document)["step_reviews"][0]["precedent"]


def rehash(document):
    document["result_fingerprint"] = CORE.stable_document_fingerprint(document)


class PrecedentOutputContractTests(unittest.TestCase):
    def test_all_emitted_precedent_states_are_valid(self):
        for state in ("exact", "missing", "similar", "partial", "blocked"):
            with self.subTest(state=state):
                route = first_route(make_document(state))
                self.assertEqual(
                    load_contract().validate_route_precedent_state(route),
                    [],
                )

    def test_bound_precedent_requires_complete_provenance(self):
        fields = (
            ("artifact_fingerprint", None),
            ("query_fingerprint", None),
            ("result_ids", []),
            ("result_hashes", []),
        )
        for field, replacement in fields:
            with self.subTest(field=field):
                precedent = first_precedent(make_document())
                precedent[field] = replacement
                self.assertTrue(load_contract().validate_precedent_evidence(precedent))

    def test_rehashed_missing_binding_and_match_level_tamper_are_rejected(self):
        missing = make_document("missing")
        first_precedent(missing)["binding_status"] = "bound"
        rehash(missing)
        self.assertTrue(VALIDATOR.validate_output(missing))

        similar = make_document("similar")
        first_precedent(similar)["match_level"] = "exact_record"
        rehash(similar)
        self.assertTrue(VALIDATOR.validate_output(similar))

    def test_rehashed_result_review_provenance_tamper_is_rejected(self):
        document = make_document("result_review")
        first_precedent(document)["review_required_result_ids"] = []
        rehash(document)
        self.assertTrue(VALIDATOR.validate_output(document))

    def test_rehashed_partial_and_blocked_state_cannot_be_ready(self):
        for state in ("partial", "blocked"):
            with self.subTest(state=state):
                document = make_document(state)
                route = first_route(document)
                route["review_status"] = "completed"
                route["disposition"] = "ready_for_expert_review"
                rehash(document)
                self.assertTrue(VALIDATOR.validate_output(document))
