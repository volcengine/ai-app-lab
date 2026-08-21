import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parents[1]
CONTRACT_PATH = (
    PROJECT_DIR
    / "skills"
    / "compute-molecular-features"
    / "scripts"
    / "standardization_contract.py"
)
STANDARDIZER_PATH = (
    PROJECT_DIR
    / "skills"
    / "standardize-chemical-structures"
    / "scripts"
    / "standardize_structures.py"
)
STANDARDIZER_VALIDATOR_PATH = (
    PROJECT_DIR
    / "skills"
    / "standardize-chemical-structures"
    / "scripts"
    / "validate_output.py"
)
FEATURE_PROCESSOR_PATH = (
    PROJECT_DIR
    / "skills"
    / "compute-molecular-features"
    / "scripts"
    / "compute_features.py"
)
FEATURE_VALIDATOR_PATH = (
    PROJECT_DIR
    / "skills"
    / "compute-molecular-features"
    / "scripts"
    / "validate_output.py"
)
FIXED_TIME = "2026-08-16T00:00:00+00:00"
ASPIRIN = "CC(=O)Oc1ccccc1C(=O)O"
ASPIRIN_SODIUM = "[Na+].CC(=O)Oc1ccccc1C(=O)[O-]"


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


STANDARDIZER = load_module("contract_standardizer", STANDARDIZER_PATH)
STANDARDIZER_VALIDATOR = load_module(
    "contract_standardizer_validator",
    STANDARDIZER_VALIDATOR_PATH,
)


def load_contract():
    if not CONTRACT_PATH.is_file():
        raise AssertionError(f"contract module missing: {CONTRACT_PATH}")
    return load_module("standardization_contract_under_test", CONTRACT_PATH)


def make_standardization_artifact():
    artifact = STANDARDIZER.process_records(
        [
            {
                "id": "aspirin",
                "record_index": 0,
                "source": "contract-test",
                "input_format": "smiles",
                "original_structure": ASPIRIN,
            },
            {
                "id": "aspirin-sodium",
                "record_index": 1,
                "source": "contract-test",
                "input_format": "smiles",
                "original_structure": ASPIRIN_SODIUM,
            },
            {
                "id": "invalid",
                "record_index": 2,
                "source": "contract-test",
                "input_format": "smiles",
                "original_structure": "CO(C)C",
            },
        ],
        "chembl-pipeline",
        provenance=[{"source": "contract-test"}],
        generated_at_utc=FIXED_TIME,
    )
    report = STANDARDIZER_VALIDATOR.validate(artifact)
    if not report["valid"]:
        raise AssertionError(report["errors"])
    return artifact


class StandardizationArtifactEnvelopeTests(unittest.TestCase):
    def test_contract_rejects_envelope_and_stale_fingerprint_tampering(self):
        contract = load_contract()
        cases = [
            (
                "wrong_workflow",
                lambda artifact: artifact.update({"workflow": "wrong-workflow"}),
                "workflow",
            ),
            (
                "wrong_schema",
                lambda artifact: artifact.update({"schema_version": "9.9.9"}),
                "schema_version",
            ),
            (
                "missing_fingerprint",
                lambda artifact: artifact.pop("result_fingerprint"),
                "result_fingerprint",
            ),
            (
                "uppercase_fingerprint",
                lambda artifact: artifact.update(
                    {"result_fingerprint": artifact["result_fingerprint"].upper()}
                ),
                "result_fingerprint",
            ),
            (
                "stale_structure_fingerprint",
                lambda artifact: artifact["records"][0].update(
                    {"standardized_structure": "CCO"}
                ),
                "fingerprint mismatch",
            ),
            (
                "stale_profile_fingerprint",
                lambda artifact: artifact["options"].update({"profile": "rdkit-basic"}),
                "fingerprint mismatch",
            ),
        ]
        for name, mutate, expected_error in cases:
            with self.subTest(name=name):
                artifact = make_standardization_artifact()
                mutate(artifact)
                errors = contract.validate_standardization_artifact(artifact)
                self.assertTrue(
                    any(expected_error in item for item in errors),
                    errors,
                )


class StandardizationArtifactRecordTests(unittest.TestCase):
    def test_contract_rejects_record_state_tampering_after_rehash(self):
        contract = load_contract()

        def ready_record(artifact):
            return artifact["records"][0]

        cases = [
            (
                "missing_required_field",
                lambda artifact: ready_record(artifact).pop("source"),
                "records[0] missing fields: source",
            ),
            (
                "record_index_mismatch",
                lambda artifact: ready_record(artifact).update({"record_index": 9}),
                "records[0].record_index",
            ),
            (
                "non_string_parse_status",
                lambda artifact: ready_record(artifact).update({"parse_status": []}),
                "records[0].parse_status",
            ),
            (
                "parse_error_marked_ready",
                lambda artifact: ready_record(artifact).update(
                    {
                        "parse_status": "error",
                        "standardization_status": "not_run",
                    }
                ),
                "parse error must be rejected",
            ),
            (
                "not_run_marked_ready",
                lambda artifact: ready_record(artifact).update(
                    {"standardization_status": "not_run"}
                ),
                "non-completed standardization must be rejected",
            ),
            (
                "review_reason_marked_ready",
                lambda artifact: ready_record(artifact).update(
                    {"human_review_required": ["R-TAMPERED"]}
                ),
                "review reasons cannot be ready_for_downstream",
            ),
            (
                "parent_key_without_parent",
                lambda artifact: ready_record(artifact).update(
                    {
                        "parent_structure": None,
                        "parent_inchikey": ("BSYNRYMUTXBXSQ-UHFFFAOYSA-N"),
                    }
                ),
                "parent_inchikey requires parent_structure",
            ),
        ]
        for name, mutate, expected_error in cases:
            with self.subTest(name=name):
                artifact = make_standardization_artifact()
                mutate(artifact)
                artifact["result_fingerprint"] = (
                    contract.standardization_artifact_fingerprint(artifact)
                )
                errors = contract.validate_standardization_artifact(artifact)
                self.assertTrue(
                    any(expected_error in item for item in errors),
                    errors,
                )


class FeatureInputAdapterContractTests(unittest.TestCase):
    def test_processor_rejects_claimed_artifact_tampering(self):
        processor = load_module(
            "feature_processor_contract_test",
            FEATURE_PROCESSOR_PATH,
        )
        cases = [
            (
                "wrong_workflow",
                lambda artifact: artifact.update({"workflow": "wrong-workflow"}),
            ),
            (
                "stale_structure",
                lambda artifact: artifact["records"][0].update(
                    {"standardized_structure": "CCO"}
                ),
            ),
            (
                "missing_fingerprint",
                lambda artifact: artifact.pop("result_fingerprint"),
            ),
        ]
        for name, mutate in cases:
            with self.subTest(name=name):
                artifact = make_standardization_artifact()
                mutate(artifact)
                with tempfile.TemporaryDirectory() as directory:
                    path = Path(directory) / "standardized.json"
                    path.write_text(
                        json.dumps(artifact),
                        encoding="utf-8",
                    )
                    with self.assertRaisesRegex(
                        processor.InputFailure,
                        "standardization Artifact contract",
                    ):
                        processor.load_input_records(path, "json")

    def test_cli_rejects_tampered_artifact_without_output(self):
        artifact = make_standardization_artifact()
        artifact["workflow"] = "wrong-workflow"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            input_path = root / "tampered.json"
            output_path = root / "features.json"
            input_path.write_text(json.dumps(artifact), encoding="utf-8")
            completed = subprocess.run(
                [
                    sys.executable,
                    str(FEATURE_PROCESSOR_PATH),
                    "--input",
                    str(input_path),
                    "--input-format",
                    "json",
                    "--output",
                    str(output_path),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(completed.returncode, 3, completed.stderr)
            self.assertFalse(output_path.exists())
            self.assertIn(
                "standardization Artifact contract violation",
                completed.stderr,
            )
            self.assertNotIn("Traceback", completed.stderr)

    def test_valid_artifact_binds_top_level_provenance(self):
        processor = load_module(
            "feature_processor_valid_artifact_test",
            FEATURE_PROCESSOR_PATH,
        )
        contract = load_contract()
        artifact = make_standardization_artifact()
        artifact["records"][0].update(
            {
                "upstream_workflow": "record-spoof",
                "upstream_fingerprint": "f" * 64,
                "tool_versions": {"rdkit": "spoof"},
                "profile": "spoof",
            }
        )
        artifact["result_fingerprint"] = contract.standardization_artifact_fingerprint(
            artifact
        )
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "standardized.json"
            path.write_text(json.dumps(artifact), encoding="utf-8")
            records, upstream = processor.load_input_records(path, "json")
        record = records[0]
        self.assertEqual(
            record["upstream_workflow"],
            "chemical-structure-standardization-qc",
        )
        self.assertEqual(
            record["upstream_fingerprint"],
            artifact["result_fingerprint"],
        )
        self.assertEqual(record["tool_versions"], artifact["tool_versions"])
        self.assertEqual(
            record["profile"],
            artifact["options"]["profile"],
        )
        self.assertTrue(upstream["_validated_standardization_artifact"])

    def test_direct_json_and_csv_drop_self_reported_provenance(self):
        processor = load_module(
            "feature_processor_direct_input_test",
            FEATURE_PROCESSOR_PATH,
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            json_path = root / "direct.json"
            json_path.write_text(
                json.dumps(
                    {
                        "schema_version": "direct-v1",
                        "records": [
                            {
                                "id": "ethanol",
                                "standardized_structure": "CCO",
                                "upstream_workflow": (
                                    "chemical-structure-standardization-qc"
                                ),
                                "upstream_fingerprint": "f" * 64,
                                "tool_versions": {"rdkit": "spoof"},
                                "profile": "spoof",
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            csv_path = root / "direct.csv"
            csv_path.write_text(
                "id,standardized_structure,upstream_workflow,"
                "upstream_fingerprint,profile\n"
                "ethanol,CCO,chemical-structure-standardization-qc,"
                + "f" * 64
                + ",spoof\n",
                encoding="utf-8",
            )
            for name, path, input_format in (
                ("json", json_path, "json"),
                ("csv", csv_path, "csv"),
            ):
                with self.subTest(name=name):
                    records, upstream = processor.load_input_records(
                        path,
                        input_format,
                    )
                    self.assertIsNone(upstream["workflow"])
                    self.assertIsNone(upstream["result_fingerprint"])
                    self.assertIsNone(upstream["tool_versions"])
                    self.assertIsNone(upstream["profile"])
                    self.assertIsNone(records[0]["upstream_workflow"])
                    self.assertIsNone(records[0]["upstream_fingerprint"])
                    self.assertIsNone(records[0]["tool_versions"])
                    self.assertIsNone(records[0]["profile"])


class FeatureOutputUpstreamContractTests(unittest.TestCase):
    def _official_feature_document(self):
        processor = load_module(
            "feature_processor_output_contract_test",
            FEATURE_PROCESSOR_PATH,
        )
        artifact = make_standardization_artifact()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "standardized.json"
            path.write_text(json.dumps(artifact), encoding="utf-8")
            records, upstream = processor.load_input_records(path, "json")
        return processor.process_records(
            records,
            calculation_view="standardized",
            upstream=upstream,
            generated_at_utc=FIXED_TIME,
        )

    def test_validator_rejects_record_upstream_binding_tampering(self):
        validator = load_module(
            "feature_validator_binding_test",
            FEATURE_VALIDATOR_PATH,
        )
        cases = [
            ("upstream_workflow", "wrong-workflow"),
            ("upstream_fingerprint", "f" * 64),
            ("upstream_tool_versions", {"rdkit": "spoof"}),
            ("upstream_profile", "spoof"),
        ]
        for field, value in cases:
            with self.subTest(field=field):
                document = self._official_feature_document()
                document["records"][0][field] = value
                document["result_fingerprint"] = validator.output_fingerprint(document)
                report = validator.validate(document)
                self.assertFalse(report["valid"])
                self.assertTrue(
                    any(field in item for item in report["errors"]),
                    report["errors"],
                )

    def test_validator_rejects_partial_official_upstream(self):
        validator = load_module(
            "feature_validator_partial_upstream_test",
            FEATURE_VALIDATOR_PATH,
        )
        for field in ("workflow", "result_fingerprint"):
            with self.subTest(field=field):
                document = self._official_feature_document()
                document["upstream"][field] = None
                document["result_fingerprint"] = validator.output_fingerprint(document)
                report = validator.validate(document)
                self.assertFalse(report["valid"])
                self.assertTrue(
                    any(
                        "partial upstream provenance" in item
                        for item in report["errors"]
                    ),
                    report["errors"],
                )
