from __future__ import annotations

import copy
import importlib.util
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTE_FIXTURE_PATH = ROOT / "tests" / "test_review_routes.py"
SEARCH_FIXTURE_PATH = ROOT / "tests" / "test_search_review_contract.py"
FIXED_TIME = "2026-08-16T00:00:00Z"


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


ROUTES = load_module("search_review_route_fixtures", ROUTE_FIXTURE_PATH)
SEARCH_FIXTURES = load_module("search_review_contract_fixtures", SEARCH_FIXTURE_PATH)
CORE = ROUTES.CORE


def prepare(routes=None):
    return ROUTES.prepare_request(ROUTES.base_request(routes))


def entry_record(entry):
    return entry["curation_artifact"]["records"][0]


def search_for_entry(entry, *, operation="lookup_reaction", query=None):
    record = entry_record(entry)
    return SEARCH_FIXTURES.make_search_artifact(
        reaction=record["reaction_smiles"]["reported"],
        record_id=record["record_id"],
        operation=operation,
        query=query,
    )


def attach_real_precedent(value, index=0, **search_kwargs):
    entry = value["step_artifacts"][index]
    entry["precedent_artifact"] = search_for_entry(entry, **search_kwargs)
    return entry["precedent_artifact"]


def process(value):
    return CORE.process_request(value, generated_at_utc=FIXED_TIME)


def first_route(document):
    return document["route_summaries"][0]


def first_precedent(document):
    return first_route(document)["step_reviews"][0]["precedent"]


def route_codes(route):
    return {item["code"] for item in route["findings"]}


def rehash_search(artifact):
    SEARCH_FIXTURES.rehash_artifact(artifact)


class SearchReviewStatusIntegrationTests(unittest.TestCase):
    def test_missing_precedent_requires_review(self):
        value = prepare()
        value["step_artifacts"][0]["precedent_artifact"] = None
        route = first_route(process(value))
        self.assertEqual(route["review_status"], "partial")
        self.assertEqual(route["disposition"], "review_required")
        self.assertIn("W-PRECEDENT-NOT-RUN-001", route_codes(route))

    def test_completed_exact_precedent_is_bound(self):
        value = prepare()
        artifact = attach_real_precedent(value)
        document = process(value)
        precedent = first_precedent(document)
        self.assertEqual(
            first_route(document)["disposition"], "ready_for_expert_review"
        )
        self.assertEqual(precedent["binding_status"], "bound")
        self.assertEqual(precedent["match_level"], "exact_record")
        self.assertEqual(
            precedent["artifact_fingerprint"], artifact["result_fingerprint"]
        )

    def test_review_required_result_propagates_review(self):
        value = prepare()
        artifact = attach_real_precedent(value)
        result = artifact["results"][0]
        result["curation_disposition"] = "review_required"
        result["quality_findings"] = [{"code": "W-CANDIDATE-REVIEW-001"}]
        artifact["review_queue"] = [
            {
                "reaction_id": result["reaction_id"],
                "reason_codes": ["W-CANDIDATE-REVIEW-001"],
            }
        ]
        SEARCH_FIXTURES.rehash_result(result)
        rehash_search(artifact)
        route = first_route(process(value))
        self.assertEqual(route["disposition"], "review_required")
        self.assertIn("W-PRECEDENT-RESULT-REVIEW-001", route_codes(route))

    def test_partial_precedent_cannot_be_ready(self):
        value = prepare()
        artifact = attach_real_precedent(value)
        artifact["provider_status"] = "partial"
        artifact["warnings"] = [{"code": "W-PARTIAL-001"}]
        rehash_search(artifact)
        route = first_route(process(value))
        self.assertEqual(route["review_status"], "partial")
        self.assertEqual(route["disposition"], "review_required")
        self.assertIn("W-PRECEDENT-PARTIAL-001", route_codes(route))

    def test_id_only_timeout_and_source_error_remain_review(self):
        for status, code in (
            ("source_timeout", "W-PRECEDENT-TIMEOUT-001"),
            ("source_error", "W-PRECEDENT-ERROR-001"),
        ):
            with self.subTest(status=status):
                value = prepare()
                artifact = attach_real_precedent(value)
                artifact["provider_status"] = status
                artifact["results"] = []
                artifact["review_queue"] = []
                artifact["errors"] = [{"code": f"E-{status.upper()}-001"}]
                rehash_search(artifact)
                route = first_route(process(value))
                self.assertEqual(route["disposition"], "review_required")
                self.assertIn(code, route_codes(route))
                self.assertNotIn("E-PRECEDENT-BINDING-001", route_codes(route))

    def test_blocked_precedent_blocks_route(self):
        value = prepare()
        artifact = attach_real_precedent(value)
        artifact["provider_status"] = "blocked"
        artifact["results"] = []
        artifact["review_queue"] = []
        artifact["errors"] = [{"code": "E-REQUEST-BLOCKED-001"}]
        artifact["corpus_provenance"]["contract_status"] = "invalid"
        rehash_search(artifact)
        route = first_route(process(value))
        self.assertEqual(route["disposition"], "blocked")
        self.assertIn("E-PRECEDENT-BLOCKED-001", route_codes(route))

    def test_structurally_bound_zero_hit_requires_review(self):
        value = prepare()
        entry = value["step_artifacts"][0]
        reaction = entry_record(entry)["reaction_smiles"]["reported"]
        artifact = attach_real_precedent(
            value,
            operation="search_transformations",
            query={"reaction_smarts": reaction},
        )
        artifact["provider_status"] = "completed_zero_hits"
        artifact["results"] = []
        artifact["review_queue"] = []
        rehash_search(artifact)
        route = first_route(process(value))
        self.assertEqual(route["disposition"], "review_required")
        self.assertIn("W-PRECEDENT-ZERO-001", route_codes(route))


class SearchReviewFailureLocalityTests(unittest.TestCase):
    def test_wrong_schema_and_unrelated_query_block_only_affected_routes(self):
        routes = [
            ROUTES.route_record("route-valid", ROUTES.linear_tree()),
            ROUTES.route_record("route-invalid", ROUTES.different_tree()),
        ]
        value = prepare(routes)
        attach_real_precedent(value, 0)
        unrelated = SEARCH_FIXTURES.make_search_artifact(
            reaction="CCO>>COC",
            record_id="unrelated-record",
        )
        value["step_artifacts"][1]["precedent_artifact"] = unrelated
        document = process(value)
        by_id = {route["route_id"]: route for route in document["route_summaries"]}
        self.assertEqual(
            by_id["route-valid"]["disposition"],
            "ready_for_expert_review",
        )
        self.assertEqual(by_id["route-invalid"]["disposition"], "blocked")
        self.assertIn(
            "E-PRECEDENT-BINDING-001",
            route_codes(by_id["route-invalid"]),
        )

        invalid = attach_real_precedent(value, 1)
        invalid["schema_version"] = "9.9.9"
        rehash_search(invalid)
        document = process(value)
        by_id = {route["route_id"]: route for route in document["route_summaries"]}
        self.assertEqual(by_id["route-invalid"]["disposition"], "blocked")
        self.assertIn(
            "E-PRECEDENT-ARTIFACT-CONTRACT-001",
            route_codes(by_id["route-invalid"]),
        )

    def test_duplicate_step_entry_fails_both_bindings_locally(self):
        value = prepare()
        attach_real_precedent(value)
        value["step_artifacts"].append(copy.deepcopy(value["step_artifacts"][0]))
        route = first_route(process(value))
        self.assertEqual(route["disposition"], "blocked")
        self.assertIn("E-CURATION-BINDING-001", route_codes(route))
        self.assertIn("E-PRECEDENT-BINDING-001", route_codes(route))
