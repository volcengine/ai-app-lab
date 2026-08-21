from __future__ import annotations

import copy
import hashlib
import importlib.util
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CURATE_PATH = ROOT / "skills" / "curate-reactions" / "scripts" / "curate_reactions.py"
REVIEW_SCRIPTS = ROOT / "skills" / "review-routes" / "scripts"
CONTRACT_PATH = REVIEW_SCRIPTS / "curated_artifact_contract.py"
BINDING_PATH = REVIEW_SCRIPTS / "curation_step_binding.py"
REVIEW_CORE_PATH = REVIEW_SCRIPTS / "review_routes.py"
SEARCH_PATH = ROOT / "skills" / "search-reactions" / "scripts" / "search_reactions.py"
FIXED_TIME = "2026-08-16T00:00:00Z"


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


CURATE = load_module("curate_review_curate_fixture", CURATE_PATH)
REVIEW_CORE = load_module("curate_review_core_fixture", REVIEW_CORE_PATH)
SEARCH = load_module("curate_review_search_producer", SEARCH_PATH)
TOOLKIT = REVIEW_CORE.load_toolkit()


def load_contract():
    if not CONTRACT_PATH.is_file():
        raise AssertionError(f"missing contract module: {CONTRACT_PATH}")
    return load_module("review_curated_contract_under_test", CONTRACT_PATH)


def load_binding():
    if not BINDING_PATH.is_file():
        raise AssertionError(f"missing binding module: {BINDING_PATH}")
    return load_module("review_curation_binding_under_test", BINDING_PATH)


def make_artifact(
    reaction="CCO>>COC",
    *,
    record_id="curate-record-1",
    stoichiometry_complete=True,
):
    request = {
        "schema_version": "1.0.0",
        "workflow": "curate-reactions",
        "input_profile": "reaction_smiles",
        "source": {
            "identifier": "curate-review-contract",
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
                "record_id": record_id,
                "reaction_smiles": reaction,
                "stoichiometry_complete": stoichiometry_complete,
            }
        ],
    }
    return CURATE.process_request(request, generated_at_utc=FIXED_TIME)


def rehash(artifact):
    artifact["result_fingerprint"] = load_contract().curated_artifact_fingerprint(
        artifact
    )


def reaction_hash(reaction="CCO>>COC"):
    return hashlib.sha256(reaction.encode("utf-8")).hexdigest()


def bind(artifact, record_id, step_hash=None):
    return load_binding().bind_curation_evidence(
        artifact,
        record_id,
        step_hash or reaction_hash(),
        TOOLKIT,
        load_contract(),
    )


def make_review_request(
    artifact,
    record_id,
    *,
    route_id="route-1",
    reaction="CCO>>COC",
    product="COC",
    precursor="CCO",
    precedent=None,
):
    routes = [
        {
            "route_id": route_id,
            "backend": "contract-test",
            "backend_rank": 1,
            "backend_score": 0.9,
            "tree": {
                "type": "mol",
                "smiles": product,
                "in_stock": False,
                "children": [
                    {
                        "type": "reaction",
                        "metadata": {"rsmi": reaction},
                        "children": [
                            {
                                "type": "mol",
                                "smiles": precursor,
                                "in_stock": True,
                                "children": [],
                            }
                        ],
                    }
                ],
            },
        }
    ]
    request = {
        "schema_version": "1.0.0",
        "workflow": "review-routes",
        "input_profile": "normalized_route_v1",
        "source": {
            "identifier": "curate-review-contract",
            "content_sha256": "b" * 64,
            "license": "test-only",
        },
        "target": {
            "reported_structure": product,
            "standardized_structure": product,
            "upstream_record_id": "target-1",
        },
        "routes": routes,
        "routes_fingerprint": REVIEW_CORE.sha256_json(routes),
        "step_artifacts": [],
        "inventory_snapshot": {
            "snapshot_id": "inventory-1",
            "captured_at_utc": FIXED_TIME,
            "source": "contract-test",
            "license": "test-only",
            "records": [{"structure": precursor, "status": "in_stock"}],
        },
        "constraints": {},
        "options": {
            "comparison_mode": "dimensions_only",
            "preserve_backend_order": True,
        },
    }
    normalized, errors = REVIEW_CORE.normalize_routes(request)
    assert not errors
    analysis = REVIEW_CORE.analyze_route_tree(normalized[0], TOOLKIT)
    step = analysis["steps"][0]
    request["step_artifacts"] = [
        {
            "route_id": route_id,
            "step_id": step["step_id"],
            "step_reaction_hash": step["step_reaction_hash"],
            "curation_record_id": record_id,
            "curation_artifact": artifact,
            "precedent_artifact": precedent,
        }
    ]
    return request


def exact_precedent_artifact(
    reaction="CCO>>COC",
    record_id="curate-record-1",
):
    curated = make_artifact(reaction, record_id=record_id)
    curated["records"][0]["license"] = "test-only"
    curated["result_fingerprint"] = REVIEW_CORE.artifact_fingerprint(curated)
    request = {
        "schema_version": "1.0.0",
        "workflow": "search-reactions",
        "operation": "lookup_reaction",
        "provider": "local_curated_corpus",
        "query": {"reaction_id": record_id},
        "options": {
            "fingerprint_profile_id": None,
            "top_k": 20,
            "threshold": None,
            "candidate_limit": 100,
            "include_review_required": True,
            "use_stereochemistry": False,
        },
        "corpus_artifact": curated,
    }
    return SEARCH.process_request(request, generated_at_utc=FIXED_TIME)


class CuratedArtifactContractTests(unittest.TestCase):
    def test_official_curate_artifact_is_valid(self):
        self.assertEqual(
            load_contract().validate_curated_artifact(make_artifact()),
            [],
        )

    def test_official_empty_artifact_is_valid(self):
        artifact = make_artifact()
        artifact["records"] = []
        rehash(artifact)
        self.assertEqual(
            load_contract().validate_curated_artifact(artifact),
            [],
        )

    def test_rejects_rehashed_envelope_tampering(self):
        for field, value in (
            ("schema_version", "9.9.9"),
            ("workflow", "wrong"),
            ("ruleset_version", "9.9.9"),
            ("tool_versions", []),
            ("records", {}),
        ):
            with self.subTest(field=field):
                artifact = make_artifact()
                artifact[field] = value
                rehash(artifact)
                self.assertTrue(load_contract().validate_curated_artifact(artifact))

    def test_rejects_stale_fingerprint(self):
        artifact = make_artifact()
        artifact["records"][0]["record_id"] = "changed"
        codes = {
            item["code"] for item in load_contract().validate_curated_artifact(artifact)
        }
        self.assertIn("E-CURATE-FINGERPRINT-001", codes)

    def test_rejects_record_state_and_binding_tampering(self):
        mutators = (
            lambda record: record.update({"disposition": []}),
            lambda record: record.update({"curation_status": "error"}),
            lambda record: record["participant_assessments"][0].update(
                {"upstream_binding_status": []}
            ),
            lambda record: record["participant_assessments"][0].update(
                {"upstream_binding_status": "failed"}
            ),
        )
        for mutate in mutators:
            with self.subTest(mutate=mutate):
                artifact = make_artifact()
                mutate(artifact["records"][0])
                rehash(artifact)
                self.assertTrue(load_contract().validate_curated_artifact(artifact))

    def test_duplicate_record_id_is_invalid(self):
        artifact = make_artifact()
        artifact["records"].append(copy.deepcopy(artifact["records"][0]))
        rehash(artifact)
        codes = {
            item["code"] for item in load_contract().validate_curated_artifact(artifact)
        }
        self.assertIn("E-CURATE-RECORD-ID-001", codes)


class CurationStepBindingTests(unittest.TestCase):
    def test_exact_record_id_propagates_each_curate_state(self):
        cases = (
            (make_artifact(), "completed", "ready_for_search"),
            (
                make_artifact(stoichiometry_complete=False),
                "partial",
                "review_required",
            ),
            (make_artifact("bad"), "error", "rejected"),
        )
        for artifact, status, disposition in cases:
            with self.subTest(disposition=disposition):
                evidence, findings = bind(artifact, "curate-record-1")
                self.assertEqual(evidence["binding_status"], "bound")
                self.assertEqual(evidence["curation_record_id"], "curate-record-1")
                self.assertEqual(evidence["status"], status)
                self.assertEqual(evidence["disposition"], disposition)
                self.assertEqual(
                    evidence["artifact_fingerprint"],
                    artifact["result_fingerprint"],
                )
                self.assertEqual(
                    evidence["original_record_hash"],
                    artifact["records"][0]["original_record_hash"],
                )
                expected_codes = {
                    "ready_for_search": set(),
                    "review_required": {"W-CURATION-REVIEW-001"},
                    "rejected": {"E-CURATION-REJECTED-001"},
                }[disposition]
                self.assertEqual(
                    {item["code"] for item in findings},
                    expected_codes,
                )

    def test_artifact_and_record_id_nullability_must_match(self):
        for artifact, record_id in (
            (make_artifact(), None),
            (None, "curate-record-1"),
        ):
            with self.subTest(artifact_present=artifact is not None):
                evidence, findings = bind(artifact, record_id)
                self.assertEqual(evidence["binding_status"], "failed")
                self.assertEqual(
                    {item["code"] for item in findings},
                    {"E-CURATION-BINDING-001"},
                )

    def test_missing_record_id_fails_closed(self):
        evidence, findings = bind(make_artifact(), "missing-record")
        self.assertEqual(evidence["binding_status"], "failed")
        self.assertEqual(
            {item["code"] for item in findings},
            {"E-CURATION-BINDING-001"},
        )

    def test_step_hash_mismatch_fails_closed(self):
        evidence, findings = bind(make_artifact(), "curate-record-1", "0" * 64)
        self.assertEqual(evidence["binding_status"], "failed")
        self.assertEqual(
            {item["code"] for item in findings},
            {"E-STEP-HASH-MISMATCH-001"},
        )

    def test_same_hash_records_are_selected_by_id_not_array_order(self):
        ready = make_artifact(record_id="ready-record")
        review = make_artifact(
            record_id="review-record",
            stoichiometry_complete=False,
        )
        ready["records"].append(copy.deepcopy(review["records"][0]))
        rehash(ready)

        first, _ = bind(ready, "ready-record")
        first_fingerprint = ready["result_fingerprint"]
        ready["records"].reverse()
        rehash(ready)
        second, _ = bind(ready, "ready-record")
        selected_review, _ = bind(ready, "review-record")

        stable_fields = (
            "status",
            "disposition",
            "findings",
            "curation_record_id",
            "original_record_hash",
            "binding_status",
        )
        self.assertEqual(
            {field: first[field] for field in stable_fields},
            {field: second[field] for field in stable_fields},
        )
        self.assertEqual(first["artifact_fingerprint"], first_fingerprint)
        self.assertEqual(second["artifact_fingerprint"], ready["result_fingerprint"])
        self.assertEqual(first["disposition"], "ready_for_search")
        self.assertEqual(selected_review["disposition"], "review_required")

    def test_step_artifact_requires_artifact_id_nullability(self):
        for artifact, record_id in (
            (make_artifact(), None),
            (None, "curate-record-1"),
        ):
            with self.subTest(artifact_present=artifact is not None):
                document = REVIEW_CORE.process_request(
                    make_review_request(artifact, record_id),
                    generated_at_utc=FIXED_TIME,
                )
                route = document["route_summaries"][0]
                self.assertEqual(route["disposition"], "blocked")
                self.assertIn(
                    "E-CURATION-BINDING-001",
                    {item["code"] for item in route["findings"]},
                )

    def test_review_processor_passes_exact_record_id_to_binding(self):
        ready = make_artifact(record_id="ready-record")
        review = make_artifact(
            record_id="review-record",
            stoichiometry_complete=False,
        )
        ready["records"].append(copy.deepcopy(review["records"][0]))
        rehash(ready)

        first = REVIEW_CORE.process_request(
            make_review_request(ready, "ready-record"),
            generated_at_utc=FIXED_TIME,
        )
        ready["records"].reverse()
        rehash(ready)
        second = REVIEW_CORE.process_request(
            make_review_request(ready, "ready-record"),
            generated_at_utc=FIXED_TIME,
        )
        selected_review = REVIEW_CORE.process_request(
            make_review_request(ready, "review-record"),
            generated_at_utc=FIXED_TIME,
        )

        first_step = first["route_summaries"][0]["step_reviews"][0]
        second_step = second["route_summaries"][0]["step_reviews"][0]
        review_step = selected_review["route_summaries"][0]["step_reviews"][0]
        self.assertEqual(first_step["curation"]["curation_record_id"], "ready-record")
        self.assertEqual(second_step["curation"]["curation_record_id"], "ready-record")
        self.assertEqual(first_step["curation"]["disposition"], "ready_for_search")
        self.assertEqual(second_step["curation"]["disposition"], "ready_for_search")
        self.assertEqual(review_step["curation"]["curation_record_id"], "review-record")
        self.assertEqual(review_step["curation"]["disposition"], "review_required")

    def test_missing_invalid_and_valid_curation_are_route_local(self):
        invalid_artifact = make_artifact("CCN>>CNC", record_id="invalid-record")
        invalid_artifact["schema_version"] = "9.9.9"
        rehash(invalid_artifact)
        requests = [
            make_review_request(
                None,
                None,
                route_id="route-missing",
                precedent=exact_precedent_artifact(),
            ),
            make_review_request(
                invalid_artifact,
                "invalid-record",
                route_id="route-invalid",
                reaction="CCN>>CNC",
                product="CNC",
                precursor="CCN",
                precedent=exact_precedent_artifact("CCN>>CNC", "invalid-record"),
            ),
            make_review_request(
                make_artifact("CCCO>>CCOC", record_id="valid-record"),
                "valid-record",
                route_id="route-valid",
                reaction="CCCO>>CCOC",
                product="CCOC",
                precursor="CCCO",
                precedent=exact_precedent_artifact("CCCO>>CCOC", "valid-record"),
            ),
        ]
        request = requests[0]
        request["target"] = {}
        request["routes"] = [item["routes"][0] for item in requests]
        request["routes_fingerprint"] = REVIEW_CORE.sha256_json(request["routes"])
        request["step_artifacts"] = [item["step_artifacts"][0] for item in requests]
        request["step_artifacts"].append(copy.deepcopy(request["step_artifacts"][1]))
        request["inventory_snapshot"]["records"] = [
            item["inventory_snapshot"]["records"][0] for item in requests
        ]

        document = REVIEW_CORE.process_request(
            request,
            generated_at_utc=FIXED_TIME,
        )
        routes = {route["route_id"]: route for route in document["route_summaries"]}
        self.assertEqual(routes["route-missing"]["review_status"], "partial")
        self.assertEqual(routes["route-missing"]["disposition"], "review_required")
        self.assertEqual(routes["route-invalid"]["disposition"], "blocked")
        self.assertEqual(
            routes["route-valid"]["disposition"],
            "ready_for_expert_review",
        )
        codes = {
            route_id: {finding["code"] for finding in route["findings"]}
            for route_id, route in routes.items()
        }
        self.assertIn("W-CURATION-NOT-RUN-001", codes["route-missing"])
        self.assertIn(
            "E-CURATION-ARTIFACT-CONTRACT-001",
            codes["route-invalid"],
        )
        self.assertIn("E-CURATION-BINDING-001", codes["route-invalid"])
        self.assertNotIn(
            "E-CURATION-ARTIFACT-CONTRACT-001",
            codes["route-valid"],
        )
