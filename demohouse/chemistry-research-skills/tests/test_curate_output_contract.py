from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKILLS = ROOT / "skills"
CURATE_SCRIPTS = SKILLS / "curate-reactions" / "scripts"
STANDARDIZER_PATH = (
    SKILLS / "standardize-chemical-structures" / "scripts" / "standardize_structures.py"
)


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


STANDARDIZER = load_module("curate_output_standardizer", STANDARDIZER_PATH)
CURATE = load_module(
    "curate_reactions",
    CURATE_SCRIPTS / "curate_reactions.py",
)
VALIDATOR = load_module(
    "curate_output_validator",
    CURATE_SCRIPTS / "validate_output.py",
)


def standardize_record(record_id: str, structure: str, index: int):
    return {
        "id": record_id,
        "record_index": index,
        "source": "curate-output-contract-test",
        "input_format": "smiles",
        "original_structure": structure,
    }


def artifact():
    return STANDARDIZER.process_records(
        [
            standardize_record("ethanol", "CCO", 0),
            standardize_record("unknown-stereo", "CC(F)Cl", 1),
        ],
        "chembl-pipeline",
        generated_at_utc="2026-08-16T00:00:00Z",
    )


def request(upstream, upstream_record_id=None):
    participant = {
        "participant_id": "input",
        "side": "input",
        "reported_role": "reactant",
        "original_structure": "CCO",
    }
    if upstream_record_id is not None:
        participant.pop("original_structure")
        participant["upstream_record_id"] = upstream_record_id
    return {
        "schema_version": "1.0.0",
        "workflow": "curate-reactions",
        "input_profile": "reaction_smiles",
        "source": {
            "identifier": "curate-output-contract-test",
            "content_sha256": "a" * 64,
        },
        "options": {
            "participant_view": "reported_form",
            "atom_mapping": "off",
            "balance_check": "diagnostic",
        },
        "upstream_artifacts": upstream,
        "records": [
            {
                "record_id": "reaction-1",
                "reaction_smiles": "CCO>>CC=O",
                "participants": [
                    participant,
                    {
                        "participant_id": "output",
                        "side": "output",
                        "reported_role": "product",
                        "original_structure": "CC=O",
                    },
                ],
                "stoichiometry_complete": True,
            }
        ],
    }


def rehash(document):
    document["result_fingerprint"] = CURATE.stable_document_fingerprint(document)


def force_ready(document):
    record = document["records"][0]
    record["findings"] = []
    record["human_review_required"] = []
    record["curation_status"] = "completed"
    record["disposition"] = "ready_for_search"
    document["errors"] = []
    document["warnings"] = []
    document["human_review_required"] = []
    document["review_queue"] = []
    document["input_summary"]["disposition_counts"] = {
        "ready_for_search": 1,
        "rejected": 0,
        "review_required": 0,
    }
    document["input_summary"]["curation_status_counts"] = {
        "completed": 1,
        "error": 0,
        "not_run": 0,
        "partial": 0,
    }
    rehash(document)


class CurateOutputContractTests(unittest.TestCase):
    def test_validator_rejects_wrong_ruleset(self):
        document = CURATE.process_request(request([]))
        document["ruleset_version"] = "1.0.0"
        rehash(document)

        self.assertIn(
            "ruleset_version 不匹配",
            VALIDATOR.validate_output(document),
        )

    def test_validator_rejects_contract_error_with_valid_metadata(self):
        upstream = artifact()
        upstream["result_fingerprint"] = "0" * 64
        document = CURATE.process_request(request([upstream]))
        document["upstream_artifacts"][0]["contract_status"] = "valid"
        rehash(document)

        errors = VALIDATOR.validate_output(document)

        self.assertTrue(
            any("contract_status" in item for item in errors),
            errors,
        )

    def test_validator_requires_contract_error_in_each_blocked_record(self):
        upstream = artifact()
        upstream["result_fingerprint"] = "0" * 64
        document = CURATE.process_request(request([upstream]))
        document["records"][0]["findings"] = [
            CURATE.finding(
                "E-REACTION-SIDES-001",
                "error",
                "reaction_smiles",
            )
        ]
        rehash(document)

        errors = VALIDATOR.validate_output(document)

        self.assertTrue(
            any("未保留 upstream contract error" in item for item in errors),
            errors,
        )

    def test_validator_requires_contract_error_for_invalid_metadata(self):
        upstream = artifact()
        upstream["result_fingerprint"] = "0" * 64
        document = CURATE.process_request(request([upstream]))
        document["errors"] = []
        rehash(document)

        errors = VALIDATOR.validate_output(document)

        self.assertTrue(
            any("invalid metadata" in item for item in errors),
            errors,
        )

    def test_validator_rejects_review_binding_changed_to_ready(self):
        document = CURATE.process_request(request([artifact()], "unknown-stereo"))
        force_ready(document)

        errors = VALIDATOR.validate_output(document)

        self.assertTrue(
            any("upstream_disposition" in item for item in errors),
            errors,
        )

    def test_validator_rejects_null_binding_changed_to_direct_ready(self):
        input_request = request([artifact()])
        input_request["records"][0]["participants"][0]["upstream_record_id"] = None
        document = CURATE.process_request(input_request)
        force_ready(document)

        errors = VALIDATOR.validate_output(document)

        self.assertTrue(
            any("upstream_binding_status" in item for item in errors),
            errors,
        )

    def test_unparseable_ready_standardized_structure_is_rejected(self):
        for field in ("original_structure", "standardized_structure"):
            with self.subTest(field=field):
                upstream = artifact()
                upstream["records"][0][field] = "not-a-smiles"
                upstream["result_fingerprint"] = CURATE.upstream_fingerprint(upstream)
                document = CURATE.process_request(request([upstream], "ethanol"))
                record = document["records"][0]
                self.assertEqual(record["disposition"], "rejected")
                self.assertIn(
                    "E-UPSTREAM-STRUCTURE-MISMATCH-001",
                    {item["code"] for item in record["findings"]},
                )

    def test_validator_accepts_direct_and_bound_outputs(self):
        direct = CURATE.process_request(request([]))
        bound = CURATE.process_request(request([artifact()], "ethanol"))

        self.assertEqual(VALIDATOR.validate_output(direct), [])
        self.assertEqual(VALIDATOR.validate_output(bound), [])
