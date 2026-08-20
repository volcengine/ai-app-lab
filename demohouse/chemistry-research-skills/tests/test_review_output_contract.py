from __future__ import annotations

import copy
import importlib.util
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FIXTURE_PATH = ROOT / "tests" / "test_review_routes.py"
OUTPUT_CONTRACT_PATH = (
    ROOT / "skills" / "review-routes" / "scripts" / "review_output_contract.py"
)


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


FIXTURES = load_module("review_output_fixtures", FIXTURE_PATH)
CORE = FIXTURES.CORE
VALIDATOR = FIXTURES.VALIDATOR


def load_output_contract():
    if not OUTPUT_CONTRACT_PATH.is_file():
        raise AssertionError(f"missing output contract: {OUTPUT_CONTRACT_PATH}")
    return load_module("review_output_contract_under_test", OUTPUT_CONTRACT_PATH)


def make_document(curation="ready_for_search"):
    request = FIXTURES.prepare_request(
        FIXTURES.base_request(),
        curation=curation,
    )
    return FIXTURES.process(request)


def first_route(document):
    return document["route_summaries"][0]


def first_step(document):
    return first_route(document)["step_reviews"][0]


def rehash(document):
    document["result_fingerprint"] = CORE.stable_document_fingerprint(document)


class ReviewOutputContractTests(unittest.TestCase):
    def test_ruleset_1_1_is_emitted_and_validated(self):
        document = make_document()
        self.assertEqual(document["ruleset_version"], "1.1.0")
        document["ruleset_version"] = "1.0.0"
        rehash(document)
        self.assertTrue(VALIDATOR.validate_output(document))

    def test_validator_accepts_each_emitted_curation_state(self):
        for state in (
            "ready_for_search",
            "review_required",
            "rejected",
            "not_run",
        ):
            with self.subTest(state=state):
                document = make_document(state)
                self.assertEqual(VALIDATOR.validate_output(document), [])
                self.assertEqual(
                    load_output_contract().validate_route_curation_state(
                        first_route(document)
                    ),
                    [],
                )

    def test_bound_curation_requires_complete_provenance(self):
        for field in (
            "artifact_fingerprint",
            "curation_record_id",
            "original_record_hash",
        ):
            with self.subTest(field=field):
                evidence = copy.deepcopy(first_step(make_document())["curation"])
                evidence[field] = None
                self.assertTrue(
                    load_output_contract().validate_curation_evidence(evidence)
                )

    def test_rehashed_binding_and_record_state_tampering_is_rejected(self):
        documents = [
            make_document("not_run"),
            make_document("review_required"),
            make_document("rejected"),
        ]
        mutations = [
            {"binding_status": "bound"},
            {"status": "completed", "disposition": "ready_for_search"},
            {"status": "completed", "disposition": "ready_for_search"},
        ]
        for document, mutation in zip(documents, mutations, strict=True):
            with self.subTest(mutation=mutation):
                first_step(document)["curation"].update(mutation)
                rehash(document)
                self.assertTrue(VALIDATOR.validate_output(document))

    def test_rehashed_blocked_route_cannot_be_changed_to_ready(self):
        document = make_document("rejected")
        route = first_route(document)
        route["review_status"] = "completed"
        route["disposition"] = "ready_for_expert_review"
        rehash(document)
        self.assertTrue(VALIDATOR.validate_output(document))

    def test_review_queue_must_match_route_and_step_findings(self):
        document = make_document("review_required")
        document["review_queue"] = []
        rehash(document)
        self.assertTrue(VALIDATOR.validate_output(document))

    def test_malformed_counts_are_rejected_without_validator_exception(self):
        documents = [make_document(), make_document()]
        documents[0]["input_summary"]["disposition_counts"]["blocked"] = "x"
        route = first_route(documents[1])
        route["precedent_coverage_by_level"]["exact_record"] = "x"
        for document in documents:
            with self.subTest(document=document):
                rehash(document)
                self.assertTrue(VALIDATOR.validate_output(document))

    def test_blocked_route_queue_keeps_warning_and_error_reasons(self):
        invalid_tree = FIXTURES.reaction(
            "CCO>>COC",
            [FIXTURES.molecule("CCO")],
        )
        request = FIXTURES.base_request([FIXTURES.route_record(tree=invalid_tree)])
        request["source"]["license"] = None
        document = FIXTURES.process(request)
        route_queue = [
            item for item in document["review_queue"] if item["step_id"] is None
        ]
        reasons = set(route_queue[0]["reason_codes"])
        self.assertIn("E-ROUTE-TOPOLOGY-001", reasons)
        self.assertIn("W-SOURCE-LICENSE-001", reasons)


if __name__ == "__main__":
    unittest.main()
