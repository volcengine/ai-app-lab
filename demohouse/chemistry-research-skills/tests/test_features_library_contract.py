import copy
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parents[1]
FEATURE_PATH = (
    PROJECT_DIR
    / "skills"
    / "compute-molecular-features"
    / "scripts"
    / "compute_features.py"
)
CONTRACT_PATH = (
    PROJECT_DIR
    / "skills"
    / "search-and-curate-chemical-libraries"
    / "scripts"
    / "feature_artifact_contract.py"
)
LIBRARY_PATH = (
    PROJECT_DIR
    / "skills"
    / "search-and-curate-chemical-libraries"
    / "scripts"
    / "search_and_curate.py"
)
LIBRARY_VALIDATOR_PATH = (
    PROJECT_DIR
    / "skills"
    / "search-and-curate-chemical-libraries"
    / "scripts"
    / "validate_output.py"
)
STANDARDIZER_PATH = (
    PROJECT_DIR
    / "skills"
    / "standardize-chemical-structures"
    / "scripts"
    / "standardize_structures.py"
)
FIXED_TIME = "2026-08-16T00:00:00+00:00"
ASPIRIN = "CC(=O)Oc1ccccc1C(=O)O"
ASPIRIN_SODIUM = "[Na+].CC(=O)Oc1ccccc1C(=O)[O-]"
MORGAN_PROFILE = "rdkit-morgan-r2-2048-chiral1-bit-v1"


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


FEATURE = load_module("feature_contract_fixture", FEATURE_PATH)
STANDARDIZER = load_module(
    "feature_contract_standardizer_fixture",
    STANDARDIZER_PATH,
)
LIBRARY = load_module("library_contract_processor", LIBRARY_PATH)
LIBRARY_VALIDATOR = load_module(
    "library_contract_validator",
    LIBRARY_VALIDATOR_PATH,
)


def load_contract():
    if not CONTRACT_PATH.is_file():
        raise AssertionError(f"contract module missing: {CONTRACT_PATH}")
    return load_module("feature_artifact_contract_under_test", CONTRACT_PATH)


def feature_record(
    record_id,
    structure,
    *,
    disposition="ready_for_downstream",
    human_review_required=None,
    index=0,
):
    return {
        "id": record_id,
        "record_index": index,
        "source": "contract-test",
        "original_structure": structure,
        "standardized_structure": structure,
        "parent_structure": structure,
        "inchikey": None,
        "parent_inchikey": None,
        "parse_status": "success",
        "standardization_status": "completed",
        "disposition": disposition,
        "human_review_required": list(human_review_required or []),
        "tool_versions": {
            "rdkit": "2025.9.2",
            "chembl_structure_pipeline": "1.2.4",
        },
        "profile": "chembl-pipeline",
        "upstream_workflow": "chemical-structure-standardization-qc",
        "upstream_fingerprint": "b" * 64,
        "input_record_fingerprint": "c" * 64,
    }


def make_feature_artifact():
    records = [
        feature_record("aspirin", ASPIRIN, index=0),
        feature_record(
            "aspirin-sodium",
            ASPIRIN_SODIUM,
            disposition="review_required",
            human_review_required=["R-MULTICOMPONENT-SALT"],
            index=1,
        ),
    ]
    return FEATURE.process_records(
        records,
        calculation_view="standardized",
        upstream={
            "schema_version": "1.0.0",
            "workflow": "chemical-structure-standardization-qc",
            "result_fingerprint": "b" * 64,
            "tool_versions": {
                "rdkit": "2025.9.2",
                "chembl_structure_pipeline": "1.2.4",
            },
            "profile": "chembl-pipeline",
            "duplicate_groups": [],
            "source": "contract-test",
            "input_format": "json",
        },
        generated_at_utc=FIXED_TIME,
    )


def request(operation="similarity_search"):
    options = {
        "calculation_view": "standardized",
        "include_review_required": True,
    }
    queries = None
    if operation in {
        "similarity_search",
        "cluster_library",
        "select_diverse_subset",
    }:
        options.update(
            {
                "fingerprint_profile_id": MORGAN_PROFILE,
                "metric": "tanimoto",
            }
        )
    if operation == "similarity_search":
        options.update({"top_k": 2, "threshold": None, "include_self": True})
        queries = [{"id": "q", "record_id": "aspirin"}]
    elif operation == "cluster_library":
        options["similarity_threshold"] = 0.7
    elif operation == "select_diverse_subset":
        options.update({"pick_size": 1, "seed": 61453})
    elif operation == "substructure_search":
        queries = [
            {
                "id": "q",
                "query_type": "smarts",
                "query": "C(=O)O",
                "use_chirality": False,
                "max_results": 10,
            }
        ]
    payload = {
        "schema_version": "1.0.0",
        "operation": operation,
        "library_artifact": "features.json",
        "options": options,
    }
    if queries is not None:
        payload["queries"] = queries
    return payload


def context():
    return {
        "request_path": Path("/tmp/request.json"),
        "request_sha256": "d" * 64,
        "library_path": Path("/tmp/features.json"),
        "library_path_declared": "features.json",
        "library_sha256": "e" * 64,
    }


class FeatureArtifactContractTests(unittest.TestCase):
    def test_contract_rejects_rehashed_semantic_tampering(self):
        contract = load_contract()
        cases = [
            (
                "wrong_schema",
                lambda artifact: artifact.update({"schema_version": "9.9.9"}),
                "schema_version",
            ),
            (
                "invalid_tool_versions",
                lambda artifact: artifact.update({"tool_versions": []}),
                "tool_versions must be object",
            ),
            (
                "partial_marked_ready",
                lambda artifact: artifact["records"][0].update(
                    {
                        "calculation_status": "partial",
                        "missing_features": ["descriptor:TPSA"],
                    }
                ),
                "partial record cannot be ready_for_downstream",
            ),
            (
                "review_reason_marked_ready",
                lambda artifact: artifact["records"][0].update(
                    {"human_review_required": ["R-TAMPERED"]}
                ),
                "ready record cannot require human review",
            ),
            (
                "source_view_divergence",
                lambda artifact: artifact["records"][0].update(
                    {"source_structure": "CCO"}
                ),
                "source_structure does not match calculation view",
            ),
            (
                "profile_size_divergence",
                lambda artifact: artifact["fingerprint_profiles"]["morgan"][
                    "parameters"
                ].update({"fpSize": 16}),
                "fingerprints.morgan.size does not match profile",
            ),
            (
                "wrong_hash_encoding",
                lambda artifact: artifact["records"][0]["fingerprints"][
                    "morgan"
                ].update({"hash_encoding": "wrong"}),
                "hash_encoding is invalid",
            ),
            (
                "boolean_record_index",
                lambda artifact: artifact["records"][1].update({"record_index": True}),
                "record_index must be integer input order",
            ),
        ]
        for name, mutate, expected_error in cases:
            with self.subTest(name=name):
                artifact = make_feature_artifact()
                mutate(artifact)
                for profile in artifact["fingerprint_profiles"].values():
                    profile["profile_fingerprint"] = contract.sha256_json(
                        {
                            key: value
                            for key, value in profile.items()
                            if key != "profile_fingerprint"
                        }
                    )
                artifact["result_fingerprint"] = contract.feature_artifact_fingerprint(
                    artifact
                )
                errors = contract.validate_feature_artifact(artifact)
                self.assertTrue(
                    any(expected_error in item for item in errors),
                    errors,
                )


class LibraryProcessorContractTests(unittest.TestCase):
    def _rehash(self, artifact, contract):
        for profile in artifact["fingerprint_profiles"].values():
            profile["profile_fingerprint"] = contract.sha256_json(
                {
                    key: value
                    for key, value in profile.items()
                    if key != "profile_fingerprint"
                }
            )
        artifact["result_fingerprint"] = contract.feature_artifact_fingerprint(artifact)

    def test_rehashed_contract_tampering_blocks_entire_library(self):
        contract = load_contract()
        mutations = [
            lambda artifact: artifact.update({"schema_version": "9.9.9"}),
            lambda artifact: artifact["records"][0].update(
                {
                    "calculation_status": "partial",
                    "missing_features": ["descriptor:TPSA"],
                }
            ),
            lambda artifact: artifact["records"][0].update(
                {"human_review_required": ["R-TAMPERED"]}
            ),
            lambda artifact: artifact["records"][0].update({"source_structure": "CCO"}),
            lambda artifact: artifact["fingerprint_profiles"]["morgan"][
                "parameters"
            ].update({"fpSize": 16}),
            lambda artifact: artifact["records"][0]["fingerprints"]["morgan"].update(
                {"hash_encoding": "wrong"}
            ),
        ]
        for index, mutate in enumerate(mutations):
            with self.subTest(index=index):
                artifact = make_feature_artifact()
                mutate(artifact)
                self._rehash(artifact, contract)
                document = LIBRARY.process_request(
                    request(),
                    artifact,
                    context(),
                    generated_at_utc=FIXED_TIME,
                )
                self.assertEqual(
                    document["operation_status"],
                    "not_run",
                )
                self.assertEqual(document["library_status"], "blocked")
                self.assertEqual(
                    document["library_summary"]["indexed_records"],
                    0,
                )
                self.assertEqual(
                    len(document["record_manifest"]),
                    len(artifact["records"]),
                )
                self.assertTrue(
                    all(
                        item["index_status"] == "incompatible"
                        and item["reason"] == "upstream_artifact_contract_invalid"
                        for item in document["record_manifest"]
                    )
                )

    def test_cli_writes_valid_blocked_report_and_returns_two(self):
        contract = load_contract()
        artifact = make_feature_artifact()
        artifact["schema_version"] = "9.9.9"
        artifact["result_fingerprint"] = contract.feature_artifact_fingerprint(artifact)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            artifact_path = root / "features.json"
            request_path = root / "request.json"
            output_path = root / "result.json"
            artifact_path.write_text(
                json.dumps(artifact),
                encoding="utf-8",
            )
            payload = request()
            payload["library_artifact"] = "features.json"
            request_path.write_text(
                json.dumps(payload),
                encoding="utf-8",
            )
            completed = subprocess.run(
                [
                    sys.executable,
                    str(LIBRARY_PATH),
                    "--request",
                    str(request_path),
                    "--output",
                    str(output_path),
                    "--generated-at",
                    FIXED_TIME,
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(completed.returncode, 2, completed.stderr)
            self.assertTrue(output_path.is_file())
            document = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(document["library_status"], "blocked")
            self.assertEqual(document["operation_status"], "not_run")
            self.assertTrue(LIBRARY_VALIDATOR.validate(document)["valid"])


class LibraryWorkflowAndCanonicalTests(unittest.TestCase):
    def test_standardization_artifact_is_not_a_library_input(self):
        standardization = STANDARDIZER.process_records(
            [
                {
                    "id": "aspirin",
                    "record_index": 0,
                    "source": "contract-test",
                    "input_format": "smiles",
                    "original_structure": ASPIRIN,
                }
            ],
            "chembl-pipeline",
            generated_at_utc=FIXED_TIME,
        )
        for operation in ("audit_library", "substructure_search"):
            with self.subTest(operation=operation):
                document = LIBRARY.process_request(
                    request(operation),
                    standardization,
                    context(),
                    generated_at_utc=FIXED_TIME,
                )
                self.assertEqual(
                    document["operation_status"],
                    "not_run",
                )
                self.assertEqual(document["library_status"], "blocked")
                self.assertIn(
                    "E-FEATURE-ARTIFACT-CONTRACT",
                    {item["code"] for item in document["errors"]},
                )
                self.assertTrue(LIBRARY_VALIDATOR.validate(document)["valid"])

    def test_canonical_structure_mismatch_blocks_before_search(self):
        contract = load_contract()
        artifact = make_feature_artifact()
        artifact["records"][0]["calculation_canonical_smiles"] = "CCO"
        artifact["result_fingerprint"] = contract.feature_artifact_fingerprint(artifact)
        document = LIBRARY.process_request(
            request(),
            artifact,
            context(),
            generated_at_utc=FIXED_TIME,
        )
        self.assertEqual(document["operation_status"], "not_run")
        self.assertEqual(document["library_status"], "blocked")
        self.assertEqual(
            document["library_summary"]["indexed_records"],
            0,
        )
        self.assertTrue(
            all(
                item["index_status"] == "incompatible"
                for item in document["record_manifest"]
            )
        )
        self.assertIn(
            "E-CANONICAL-STRUCTURE-MISMATCH",
            {item["code"] for item in document["errors"]},
        )


class LibraryOutputContractTests(unittest.TestCase):
    def _blocked_document(self):
        artifact = make_feature_artifact()
        artifact["schema_version"] = "9.9.9"
        contract = load_contract()
        artifact["result_fingerprint"] = contract.feature_artifact_fingerprint(artifact)
        return LIBRARY.process_request(
            request(),
            artifact,
            context(),
            generated_at_utc=FIXED_TIME,
        )

    def test_validator_rejects_fake_ready_contract_failure(self):
        document = self._blocked_document()
        mutations = [
            lambda value: value.update({"library_status": "ready"}),
            lambda value: value.update({"operation_status": "completed"}),
            lambda value: value["record_manifest"][0].update(
                {"index_status": "indexed", "reason": None}
            ),
        ]
        for index, mutate in enumerate(mutations):
            with self.subTest(index=index):
                tampered = copy.deepcopy(document)
                mutate(tampered)
                tampered["result_fingerprint"] = LIBRARY_VALIDATOR.expected_fingerprint(
                    tampered
                )
                report = LIBRARY_VALIDATOR.validate(tampered)
                self.assertFalse(report["valid"])

    def test_validator_rejects_fake_ready_canonical_failure(self):
        contract = load_contract()
        artifact = make_feature_artifact()
        artifact["records"][0]["calculation_canonical_smiles"] = "CCO"
        artifact["result_fingerprint"] = contract.feature_artifact_fingerprint(artifact)
        document = LIBRARY.process_request(
            request(),
            artifact,
            context(),
            generated_at_utc=FIXED_TIME,
        )
        document["library_status"] = "ready"
        document["result_fingerprint"] = LIBRARY_VALIDATOR.expected_fingerprint(
            document
        )
        report = LIBRARY_VALIDATOR.validate(document)
        self.assertFalse(report["valid"])
