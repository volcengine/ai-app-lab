from __future__ import annotations

import copy
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CURATE_PATH = ROOT / "skills" / "curate-reactions" / "scripts" / "curate_reactions.py"
SEARCH_SCRIPTS = ROOT / "skills" / "search-reactions" / "scripts"
SEARCH_PATH = SEARCH_SCRIPTS / "search_reactions.py"
CONTRACT_PATH = SEARCH_SCRIPTS / "curated_artifact_contract.py"
FIXED_TIME = "2026-08-16T00:00:00Z"


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


CURATE = load_module("curate_search_curate_fixture", CURATE_PATH)
SEARCH = load_module("curate_search_processor", SEARCH_PATH)


def load_contract():
    if not CONTRACT_PATH.is_file():
        raise AssertionError(f"missing contract module: {CONTRACT_PATH}")
    return load_module("curated_artifact_contract_under_test", CONTRACT_PATH)


def curate_request(records):
    return {
        "schema_version": "1.0.0",
        "workflow": "curate-reactions",
        "input_profile": "reaction_smiles",
        "source": {
            "identifier": "curate-search-contract-test",
            "content_sha256": "a" * 64,
            "license": "test-only",
        },
        "options": {
            "participant_view": "reported_form",
            "atom_mapping": "off",
            "balance_check": "diagnostic",
        },
        "upstream_artifacts": [],
        "records": records,
    }


def make_curate_artifact(records=None):
    values = (
        records
        if records is not None
        else [
            {
                "record_id": "ready-1",
                "reaction_smiles": "CCO>>COC",
                "stoichiometry_complete": True,
            }
        ]
    )
    return CURATE.process_request(
        curate_request(values),
        generated_at_utc=FIXED_TIME,
    )


def rehash(artifact):
    artifact["result_fingerprint"] = load_contract().curated_artifact_fingerprint(
        artifact
    )


def search_request(artifact, reaction_id="ready-1"):
    return {
        "schema_version": "1.0.0",
        "workflow": "search-reactions",
        "operation": "lookup_reaction",
        "provider": "local_curated_corpus",
        "query": {"reaction_id": reaction_id},
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


def mixed_artifact():
    ready = make_curate_artifact()["records"][0]
    review = make_curate_artifact(
        [
            {
                "record_id": "review-prototype",
                "reaction_smiles": "CCO>>CCO",
                "stoichiometry_complete": True,
            }
        ]
    )["records"][0]
    rejected = make_curate_artifact(
        [
            {
                "record_id": "rejected-prototype",
                "reaction_smiles": "invalid",
                "stoichiometry_complete": True,
            }
        ]
    )["records"][0]
    artifact = make_curate_artifact([])
    records = []
    for prefix, count, prototype in (
        ("ready", 80, ready),
        ("review", 15, review),
        ("rejected", 5, rejected),
    ):
        for index in range(count):
            record = copy.deepcopy(prototype)
            record["record_id"] = f"{prefix}-{index:03d}"
            records.append(record)
    artifact["records"] = records
    rehash(artifact)
    return artifact


class CuratedArtifactContractTests(unittest.TestCase):
    def test_official_curate_artifact_is_valid(self):
        self.assertEqual(
            load_contract().validate_curated_artifact(make_curate_artifact()),
            [],
        )

    def test_official_empty_curate_artifact_is_valid(self):
        artifact = make_curate_artifact([])
        self.assertEqual(artifact["records"], [])
        self.assertEqual(
            load_contract().validate_curated_artifact(artifact),
            [],
        )

    def test_rejects_rehashed_envelope_tampering(self):
        cases = (
            ("schema_version", "9.9.9", "schema_version"),
            ("workflow", "wrong-workflow", "workflow"),
            ("ruleset_version", "9.9.9", "ruleset_version"),
            ("tool_versions", [], "tool_versions"),
            ("records", {}, "records"),
        )
        for field, value, expected_path in cases:
            with self.subTest(field=field):
                artifact = make_curate_artifact()
                artifact[field] = value
                rehash(artifact)
                issues = load_contract().validate_curated_artifact(artifact)
                self.assertTrue(
                    any(expected_path in item["field_path"] for item in issues),
                    issues,
                )

    def test_rejects_stale_fingerprint(self):
        artifact = make_curate_artifact()
        artifact["records"][0]["record_id"] = "changed"
        issues = load_contract().validate_curated_artifact(artifact)
        self.assertIn(
            "E-CURATE-FINGERPRINT-001",
            {item["code"] for item in issues},
        )

    def test_rejects_rehashed_record_state_and_binding_tampering(self):
        cases = (
            (
                "error_marked_ready",
                lambda record: record.update(
                    {
                        "curation_status": "error",
                        "findings": [
                            {
                                "code": "E-TAMPER",
                                "severity": "error",
                                "field_path": "reaction_smiles",
                                "message": "tampered",
                                "evidence": [],
                            }
                        ],
                    }
                ),
            ),
            (
                "binding_failed_marked_ready",
                lambda record: record["participant_assessments"][0].update(
                    {
                        "upstream_binding_status": "failed",
                        "upstream_disposition": None,
                    }
                ),
            ),
            (
                "binding_status_non_string",
                lambda record: record["participant_assessments"][0].update(
                    {"upstream_binding_status": []}
                ),
            ),
            (
                "non_string_disposition",
                lambda record: record.update({"disposition": []}),
            ),
        )
        for name, mutate in cases:
            with self.subTest(name=name):
                artifact = make_curate_artifact()
                mutate(artifact["records"][0])
                rehash(artifact)
                self.assertTrue(load_contract().validate_curated_artifact(artifact))

    def test_duplicate_record_id_blocks_artifact(self):
        artifact = make_curate_artifact()
        artifact["records"].append(copy.deepcopy(artifact["records"][0]))
        rehash(artifact)
        issues = load_contract().validate_curated_artifact(artifact)
        self.assertIn(
            "E-CURATE-RECORD-ID-001",
            {item["code"] for item in issues},
        )


class CurateSearchBlockingTests(unittest.TestCase):
    def assert_blocked(self, document, input_records):
        self.assertEqual(document["provider_status"], "blocked")
        self.assertEqual(document["results"], [])
        self.assertEqual(
            document["corpus_summary"],
            {
                "input_records": input_records,
                "searchable_records": 0,
                "excluded_records": input_records,
            },
        )
        self.assertEqual(
            document["corpus_provenance"]["contract_status"],
            "invalid",
        )
        self.assertIn(
            "E-CURATED-ARTIFACT-CONTRACT-001",
            {item["code"] for item in document["errors"]},
        )

    def test_rehashed_contract_tampering_blocks_before_search(self):
        cases = (
            ("schema", lambda a: a.update({"schema_version": "9.9.9"})),
            ("workflow", lambda a: a.update({"workflow": "wrong"})),
            ("ruleset", lambda a: a.update({"ruleset_version": "9.9.9"})),
            (
                "state",
                lambda a: a["records"][0].update(
                    {
                        "curation_status": "error",
                        "findings": [
                            {
                                "code": "E-TAMPER",
                                "severity": "error",
                                "field_path": "reaction_smiles",
                                "message": "tampered",
                                "evidence": [],
                            }
                        ],
                    }
                ),
            ),
            (
                "binding",
                lambda a: a["records"][0]["participant_assessments"][0].update(
                    {
                        "upstream_binding_status": "failed",
                        "upstream_disposition": None,
                    }
                ),
            ),
            (
                "duplicate",
                lambda a: a["records"].append(copy.deepcopy(a["records"][0])),
            ),
        )
        for name, mutate in cases:
            with self.subTest(name=name):
                artifact = make_curate_artifact()
                mutate(artifact)
                rehash(artifact)
                document = SEARCH.process_request(
                    search_request(artifact),
                    generated_at_utc=FIXED_TIME,
                )
                self.assert_blocked(document, len(artifact["records"]))

    def test_invalid_artifact_preserves_each_record_in_manifest(self):
        artifact = make_curate_artifact(
            [
                {
                    "record_id": "r1",
                    "reaction_smiles": "CCO>>COC",
                    "stoichiometry_complete": True,
                },
                {
                    "record_id": "r2",
                    "reaction_smiles": "CCO>>CCO",
                    "stoichiometry_complete": True,
                },
            ]
        )
        artifact["workflow"] = "wrong"
        rehash(artifact)
        document = SEARCH.process_request(search_request(artifact))
        self.assertEqual(
            [item["reason"] for item in document["excluded_records"]],
            [
                "upstream_artifact_contract_invalid",
                "upstream_artifact_contract_invalid",
            ],
        )

    def test_contract_invalid_cli_writes_output_and_returns_one(self):
        artifact = make_curate_artifact()
        artifact["result_fingerprint"] = "0" * 64
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            input_path = root / "request.json"
            output_path = root / "output.json"
            input_path.write_text(
                json.dumps(search_request(artifact)),
                encoding="utf-8",
            )
            completed = subprocess.run(
                [
                    sys.executable,
                    str(SEARCH_PATH),
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
        self.assert_blocked(document, 1)


class CurateSearchRecordTests(unittest.TestCase):
    def test_rehashed_canonical_divergence_blocks_artifact(self):
        artifact = make_curate_artifact()
        artifact["records"][0]["reaction_smiles"]["canonical_unmapped"] = "N>>O"
        rehash(artifact)
        document = SEARCH.process_request(search_request(artifact))
        self.assertEqual(document["provider_status"], "blocked")

    def test_result_participants_keep_binding_status(self):
        document = SEARCH.process_request(search_request(make_curate_artifact()))
        participants = document["results"][0]["participants"]
        self.assertTrue(all("upstream_binding_status" in item for item in participants))

    def test_empty_official_corpus_is_valid_zero_hit(self):
        artifact = make_curate_artifact([])
        document = SEARCH.process_request(search_request(artifact, "missing"))
        self.assertEqual(document["provider_status"], "completed_zero_hits")
        self.assertEqual(
            document["corpus_summary"],
            {
                "input_records": 0,
                "searchable_records": 0,
                "excluded_records": 0,
            },
        )
        self.assertEqual(
            document["corpus_provenance"]["contract_status"],
            "valid",
        )

    def test_mixed_state_artifact_remains_valid(self):
        artifact = mixed_artifact()
        for include_review, searchable, review_excluded in (
            (False, 80, 15),
            (True, 95, 0),
        ):
            with self.subTest(include_review=include_review):
                value = search_request(artifact, "not-present")
                value["options"]["include_review_required"] = include_review
                document = SEARCH.process_request(value)
                reasons = [item["reason"] for item in document["excluded_records"]]
                self.assertEqual(
                    document["provider_status"],
                    "completed_zero_hits",
                )
                self.assertEqual(
                    document["corpus_summary"]["searchable_records"],
                    searchable,
                )
                self.assertEqual(
                    reasons.count("review_required_excluded"),
                    review_excluded,
                )
                self.assertEqual(reasons.count("rejected"), 5)
                self.assertEqual(
                    document["corpus_provenance"]["contract_status"],
                    "valid",
                )
