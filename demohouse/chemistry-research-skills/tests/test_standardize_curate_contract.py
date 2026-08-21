from __future__ import annotations

import copy
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
SKILLS_ROOT = REPOSITORY_ROOT / "skills"
STANDARDIZER_PATH = (
    SKILLS_ROOT
    / "standardize-chemical-structures"
    / "scripts"
    / "standardize_structures.py"
)
CURATE_SCRIPTS = SKILLS_ROOT / "curate-reactions" / "scripts"
CURATE_PATH = CURATE_SCRIPTS / "curate_reactions.py"
CONTRACT_PATH = CURATE_SCRIPTS / "standardization_artifact_contract.py"
FIXED_TIME = "2026-08-16T00:00:00Z"


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


STANDARDIZER = load_module("standardize_curate_fixture", STANDARDIZER_PATH)
CURATE = load_module("standardize_curate_processor", CURATE_PATH)


def load_contract():
    return load_module(
        "standardize_curate_contract_under_test",
        CONTRACT_PATH,
    )


def input_record(
    record_id: str,
    structure: str,
    index: int,
) -> dict[str, object]:
    return {
        "id": record_id,
        "record_index": index,
        "source": "standardize-curate-contract-test",
        "input_format": "smiles",
        "original_structure": structure,
    }


def make_standardize_artifact() -> dict[str, object]:
    return STANDARDIZER.process_records(
        [
            input_record("ethanol", "CCO", 0),
            input_record("unknown-stereo", "CC(F)Cl", 1),
            input_record("invalid", "not-a-smiles", 2),
        ],
        "chembl-pipeline",
        provenance=[
            {
                "source": "standardize-curate-contract-test",
                "input_format": "smiles",
            }
        ],
        generated_at_utc=FIXED_TIME,
    )


def rehash(artifact: dict[str, object]) -> None:
    contract = load_contract()
    artifact["result_fingerprint"] = contract.standardization_artifact_fingerprint(
        artifact
    )


def reaction_request(
    artifacts: object,
    records: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    return {
        "schema_version": "1.0.0",
        "workflow": "curate-reactions",
        "input_profile": "reaction_smiles",
        "source": {
            "identifier": "standardize-curate-contract-test",
            "content_sha256": "a" * 64,
            "license": "test-only",
        },
        "options": {
            "participant_view": "reported_form",
            "atom_mapping": "off",
            "balance_check": "diagnostic",
        },
        "upstream_artifacts": artifacts,
        "records": records
        if records is not None
        else [
            {
                "record_id": "reaction-1",
                "reaction_smiles": "CCO>>CC=O",
                "stoichiometry_complete": True,
            }
        ],
    }


def explicit_reaction(participant: dict[str, object]) -> dict[str, object]:
    return {
        "record_id": "bound-reaction",
        "reaction_smiles": "CCO>>CC=O",
        "participants": [
            participant,
            {
                "participant_id": "product",
                "side": "output",
                "reported_role": "product",
                "original_structure": "CC=O",
            },
        ],
        "stoichiometry_complete": True,
    }


class StandardizationArtifactContractTests(unittest.TestCase):
    def test_real_standardize_artifact_is_valid(self):
        issues = load_contract().validate_standardization_artifact(
            make_standardize_artifact(),
            0,
        )
        self.assertEqual(issues, [])

    def test_rejects_rehashed_envelope_tampering(self):
        cases = (
            ("schema_version", "9.9.9", "schema_version"),
            ("workflow", "standardize-chemical-structures", "workflow"),
            ("tool_versions", [], "tool_versions"),
            ("records", [], "records"),
        )
        for field, value, expected_path in cases:
            with self.subTest(field=field):
                artifact = make_standardize_artifact()
                artifact[field] = value
                rehash(artifact)

                issues = load_contract().validate_standardization_artifact(
                    artifact,
                    0,
                )
                self.assertTrue(
                    any(expected_path in item["field_path"] for item in issues),
                    issues,
                )

    def test_rejects_stale_fingerprint(self):
        artifact = make_standardize_artifact()
        artifact["records"][0]["original_structure"] = "CCN"

        issues = load_contract().validate_standardization_artifact(
            artifact,
            0,
        )
        self.assertIn(
            "E-UPSTREAM-FINGERPRINT-001",
            {item["code"] for item in issues},
        )

    def test_rejects_hidden_artifact_wrapper(self):
        wrapper = {"artifact": make_standardize_artifact()}
        index, metadata, issues = load_contract().build_upstream_contract([wrapper])
        self.assertEqual(index, {})
        self.assertEqual(metadata[0]["contract_status"], "invalid")
        self.assertIn(
            "E-UPSTREAM-ARTIFACT-CONTRACT-001",
            {item["code"] for item in issues},
        )

    def test_rejects_rehashed_record_state_tampering(self):
        cases = (
            (
                "ready_parse_error",
                lambda record: record.update({"parse_status": "error"}),
            ),
            (
                "ready_not_run",
                lambda record: record.update({"standardization_status": "not_run"}),
            ),
            (
                "ready_with_review",
                lambda record: record["human_review_required"].append("R-TAMPERED"),
            ),
            (
                "bool_record_index",
                lambda record: record.update({"record_index": False}),
            ),
            (
                "non_string_disposition",
                lambda record: record.update({"disposition": []}),
            ),
            (
                "malformed_finding",
                lambda record: record.update({"qc_findings": [[]]}),
            ),
        )
        for name, mutate in cases:
            with self.subTest(name=name):
                artifact = make_standardize_artifact()
                mutate(artifact["records"][0])
                rehash(artifact)

                issues = load_contract().validate_standardization_artifact(
                    artifact,
                    0,
                )
                self.assertTrue(issues)

    def test_rejects_review_upgraded_to_ready_after_rehash(self):
        artifact = make_standardize_artifact()
        record = artifact["records"][1]
        record["disposition"] = "ready_for_downstream"
        record["human_review_required"] = []
        rehash(artifact)

        issues = load_contract().validate_standardization_artifact(
            artifact,
            0,
        )
        self.assertTrue(
            any("disposition" in item["field_path"] for item in issues),
            issues,
        )

    def test_rejects_rejected_record_without_error_basis(self):
        artifact = make_standardize_artifact()
        artifact["records"][0]["disposition"] = "rejected"
        rehash(artifact)

        issues = load_contract().validate_standardization_artifact(
            artifact,
            0,
        )
        self.assertTrue(
            any("disposition" in item["field_path"] for item in issues),
            issues,
        )

    def test_rejects_duplicate_id_within_artifact(self):
        artifact = make_standardize_artifact()
        artifact["records"][1]["id"] = artifact["records"][0]["id"]
        rehash(artifact)
        index, metadata, issues = load_contract().build_upstream_contract([artifact])
        self.assertEqual(index, {})
        self.assertEqual(metadata[0]["contract_status"], "invalid")
        self.assertIn(
            "E-UPSTREAM-RECORD-ID-001",
            {item["code"] for item in issues},
        )

    def test_rejects_duplicate_id_across_artifacts(self):
        first = make_standardize_artifact()
        second = copy.deepcopy(first)
        second["records"][0]["original_structure"] = "CCN"
        second["records"][0]["standardized_structure"] = "CCN"
        rehash(second)
        index, metadata, issues = load_contract().build_upstream_contract(
            [first, second]
        )
        self.assertEqual(index, {})
        self.assertEqual(
            [item["contract_status"] for item in metadata],
            ["invalid", "invalid"],
        )
        self.assertIn(
            "E-UPSTREAM-RECORD-ID-001",
            {item["code"] for item in issues},
        )

    def test_non_array_container_has_no_metadata(self):
        index, metadata, issues = load_contract().build_upstream_contract(
            {"not": "an-array"}
        )
        self.assertEqual(index, {})
        self.assertEqual(metadata, [])
        self.assertEqual(
            issues[0]["field_path"],
            "upstream_artifacts",
        )


class CurateArtifactBlockingTests(unittest.TestCase):
    def assert_batch_blocked(self, document):
        self.assertEqual(document["duplicate_groups"], [])
        self.assertEqual(document["review_queue"], [])
        self.assertTrue(document["records"])
        self.assertTrue(
            all(
                record["curation_status"] == "error"
                and record["disposition"] == "rejected"
                for record in document["records"]
            )
        )
        self.assertEqual(
            document["input_summary"]["disposition_counts"]["ready_for_search"],
            0,
        )

    def test_invalid_artifact_contract_blocks_entire_batch(self):
        cases = []
        stale = make_standardize_artifact()
        stale["result_fingerprint"] = "0" * 64
        cases.append(("stale_fingerprint", [stale]))
        wrong_workflow = make_standardize_artifact()
        wrong_workflow["workflow"] = "standardize-chemical-structures"
        rehash(wrong_workflow)
        cases.append(("wrong_workflow", [wrong_workflow]))
        first = make_standardize_artifact()
        second = copy.deepcopy(first)
        cases.append(("duplicate_ids", [first, second]))
        cases.append(("non_array", {"invalid": "container"}))

        for name, artifacts in cases:
            with self.subTest(name=name):
                result = CURATE.process_request(
                    reaction_request(artifacts),
                    generated_at_utc=FIXED_TIME,
                )
                self.assert_batch_blocked(result)

    def test_duplicate_rejection_is_independent_of_artifact_order(self):
        first = make_standardize_artifact()
        second = copy.deepcopy(first)

        forward = CURATE.process_request(reaction_request([first, second]))
        reverse = CURATE.process_request(reaction_request([second, first]))
        self.assert_batch_blocked(forward)
        self.assert_batch_blocked(reverse)
        self.assertEqual(
            forward["input_summary"]["disposition_counts"],
            reverse["input_summary"]["disposition_counts"],
        )

    def test_non_array_container_has_empty_metadata(self):
        result = CURATE.process_request(reaction_request({"invalid": "container"}))
        self.assert_batch_blocked(result)
        self.assertEqual(result["upstream_artifacts"], [])


class CurateParticipantBindingTests(unittest.TestCase):
    def run_bound(self, participant, artifact=None):
        artifact = artifact or make_standardize_artifact()
        request = reaction_request(
            [artifact],
            [explicit_reaction(participant)],
        )
        return CURATE.process_request(request)["records"][0]

    def test_explicit_missing_or_invalid_id_is_rejected(self):
        for value in ("missing", None, "", [], False):
            with self.subTest(value=value):
                output = self.run_bound(
                    {
                        "participant_id": "input",
                        "side": "input",
                        "reported_role": "reactant",
                        "upstream_record_id": value,
                        "original_structure": "CCO",
                    }
                )
                self.assertEqual(output["disposition"], "rejected")
                self.assertIn(
                    "E-UPSTREAM-BINDING-001",
                    {item["code"] for item in output["findings"]},
                )

    def test_absent_upstream_id_keeps_direct_behavior(self):
        output = CURATE.process_request(
            reaction_request(
                [],
                [
                    explicit_reaction(
                        {
                            "participant_id": "direct",
                            "side": "input",
                            "reported_role": "reactant",
                            "original_structure": "CCO",
                        }
                    )
                ],
            )
        )["records"][0]
        self.assertNotEqual(output["disposition"], "rejected")
        self.assertNotIn(
            "E-UPSTREAM-BINDING-001",
            {item["code"] for item in output["findings"]},
        )

    def test_original_structure_binding_is_chemical_and_not_parent_only(self):
        cases = (("OCC", False), ("CCN", True), (None, True))
        for structure, rejected in cases:
            with self.subTest(structure=structure):
                output = self.run_bound(
                    {
                        "participant_id": "input",
                        "side": "input",
                        "reported_role": "reactant",
                        "upstream_record_id": "ethanol",
                        "original_structure": structure,
                    }
                )
                codes = {item["code"] for item in output["findings"]}
                self.assertEqual(
                    "E-UPSTREAM-STRUCTURE-MISMATCH-001" in codes,
                    rejected,
                )
        artifact = make_standardize_artifact()
        upstream = artifact["records"][0]
        upstream["original_structure"] = "[Na+].CC[O-]"
        upstream["standardized_structure"] = "[Na+].CC[O-]"
        upstream["parent_structure"] = "CCO"
        rehash(artifact)
        output = self.run_bound(
            {
                "participant_id": "input",
                "side": "input",
                "reported_role": "reactant",
                "upstream_record_id": "ethanol",
                "original_structure": "CCO",
            },
            artifact,
        )
        self.assertEqual(output["disposition"], "rejected")

    def test_upstream_dispositions_propagate_conservatively(self):
        expectations = (
            ("ethanol", None),
            ("unknown-stereo", "H-UPSTREAM-REVIEW-001"),
            ("invalid", "E-UPSTREAM-REJECTED-001"),
        )
        for record_id, expected_code in expectations:
            with self.subTest(record_id=record_id):
                output = self.run_bound(
                    {
                        "participant_id": "input",
                        "side": "input",
                        "reported_role": "reactant",
                        "upstream_record_id": record_id,
                    }
                )
                codes = {item["code"] for item in output["findings"]}
                if expected_code is None:
                    self.assertFalse(
                        codes
                        & {
                            "H-UPSTREAM-REVIEW-001",
                            "E-UPSTREAM-REJECTED-001",
                        }
                    )
                else:
                    self.assertIn(expected_code, codes)
                if record_id == "invalid":
                    self.assertEqual(output["disposition"], "rejected")

    def test_contract_invalid_cli_writes_output_and_returns_one(self):
        artifact = make_standardize_artifact()
        artifact["result_fingerprint"] = "0" * 64
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            input_path = root / "request.json"
            output_path = root / "curated.json"
            input_path.write_text(
                json.dumps(reaction_request([artifact])),
                encoding="utf-8",
            )
            completed = subprocess.run(
                [
                    sys.executable,
                    str(CURATE_PATH),
                    "--input",
                    str(input_path),
                    "--output",
                    str(output_path),
                ],
                cwd=REPOSITORY_ROOT,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(completed.returncode, 1, completed.stderr)
            result = json.loads(output_path.read_text(encoding="utf-8"))
        CurateArtifactBlockingTests.assert_batch_blocked(self, result)
