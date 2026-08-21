import copy
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parents[1]
SKILL_DIR = PROJECT_DIR / "skills" / "search-and-curate-chemical-libraries"
PROCESSOR_PATH = SKILL_DIR / "scripts" / "search_and_curate.py"
VALIDATOR_PATH = SKILL_DIR / "scripts" / "validate_output.py"
FEATURE_PATH = (
    PROJECT_DIR
    / "skills"
    / "compute-molecular-features"
    / "scripts"
    / "compute_features.py"
)
STANDARDIZER_PATH = (
    PROJECT_DIR
    / "skills"
    / "standardize-chemical-structures"
    / "scripts"
    / "standardize_structures.py"
)
FIXED_TIME = "2026-08-09T00:00:00+00:00"
ASPIRIN = "CC(=O)Oc1ccccc1C(=O)O"
ASPIRIN_SODIUM = "[Na+].CC(=O)Oc1ccccc1C(=O)[O-]"
CAFFEINE = "Cn1cnc2c1c(=O)n(C)c(=O)n2C"
ETHANOL = "CCO"
BENZENE = "c1ccccc1"
R_LACTIC = "C[C@H](O)C(=O)O"
S_LACTIC = "C[C@@H](O)C(=O)O"
MORGAN_PROFILE = "rdkit-morgan-r2-2048-chiral1-bit-v1"


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


PROCESSOR = load_module("search_and_curate", PROCESSOR_PATH)
VALIDATOR = load_module("validate_search_and_curate", VALIDATOR_PATH)
FEATURE = load_module("features_for_library_search", FEATURE_PATH)
STANDARDIZER = load_module("standardizer_for_library_search", STANDARDIZER_PATH)


def feature_input_record(
    record_id,
    structure,
    *,
    parent_structure=None,
    disposition="ready_for_downstream",
    calculation_status="completed",
    human_review_required=None,
    index=0,
):
    if parent_structure is None:
        parent_structure = structure
    standardization_status = (
        "completed" if calculation_status == "completed" else calculation_status
    )
    return {
        "id": record_id,
        "record_index": index,
        "source": "unit-test",
        "original_structure": structure,
        "standardized_structure": structure,
        "parent_structure": parent_structure,
        "inchikey": None,
        "parent_inchikey": None,
        "parse_status": "success" if calculation_status != "error" else "error",
        "standardization_status": standardization_status,
        "disposition": disposition,
        "human_review_required": list(human_review_required or []),
        "tool_versions": {"rdkit": "2025.9.2"},
        "profile": "chembl-pipeline",
        "upstream_workflow": "chemical-structure-standardization-qc",
        "upstream_fingerprint": "a" * 64,
        "input_record_fingerprint": "b" * 64,
    }


def gold_feature_library(calculation_view="standardized"):
    structures = [
        ("aspirin-a", ASPIRIN, ASPIRIN, "ready_for_downstream", []),
        ("aspirin-b", ASPIRIN, ASPIRIN, "ready_for_downstream", []),
        (
            "aspirin-sodium",
            ASPIRIN_SODIUM,
            ASPIRIN,
            "review_required",
            ["R-MULTICOMPONENT-SALT"],
        ),
        ("caffeine", CAFFEINE, CAFFEINE, "ready_for_downstream", []),
        ("ethanol", ETHANOL, ETHANOL, "ready_for_downstream", []),
        ("benzene", BENZENE, BENZENE, "ready_for_downstream", []),
        ("r-lactic", R_LACTIC, R_LACTIC, "ready_for_downstream", []),
        ("s-lactic", S_LACTIC, S_LACTIC, "ready_for_downstream", []),
    ]
    records = [
        feature_input_record(
            record_id,
            structure,
            parent_structure=parent,
            disposition=disposition,
            human_review_required=reasons,
            index=index,
        )
        for index, (record_id, structure, parent, disposition, reasons) in enumerate(
            structures
        )
    ]
    upstream = {
        "schema_version": "1.0.0",
        "workflow": "chemical-structure-standardization-qc",
        "result_fingerprint": "a" * 64,
        "tool_versions": {"rdkit": "2025.9.2"},
        "profile": "chembl-pipeline",
        "duplicate_groups": [],
        "source": "unit-test",
        "input_format": "json",
    }
    return FEATURE.process_records(
        records,
        calculation_view=calculation_view,
        upstream=upstream,
        generated_at_utc=FIXED_TIME,
    )


def request_context():
    return {
        "request_path": Path("/tmp/request.json"),
        "request_sha256": "c" * 64,
        "library_path": Path("/tmp/library.json"),
        "library_path_declared": "library.json",
        "library_sha256": "d" * 64,
    }


def request(operation, *, options=None, queries=None):
    payload = {
        "schema_version": "1.0.0",
        "operation": operation,
        "library_artifact": "library.json",
        "options": {
            "calculation_view": "standardized",
            "include_review_required": False,
        },
    }
    if options:
        payload["options"].update(options)
    if queries is not None:
        payload["queries"] = queries
    return payload


def process(payload, library=None, generated_at=FIXED_TIME):
    return PROCESSOR.process_request(
        payload,
        library or gold_feature_library(),
        request_context(),
        generated_at_utc=generated_at,
    )


def similarity_request(**overrides):
    options = {
        "include_review_required": True,
        "fingerprint_profile_id": MORGAN_PROFILE,
        "metric": "tanimoto",
        "top_k": 3,
        "threshold": None,
        "include_self": True,
    }
    options.update(overrides)
    return request(
        "similarity_search",
        options=options,
        queries=[{"id": "query-aspirin", "record_id": "aspirin-a"}],
    )


class LibraryAuditAndStateTests(unittest.TestCase):
    def test_audit_preserves_records_and_excludes_review_by_default(self):
        document = process(request("audit_library"))
        self.assertEqual(document["operation_status"], "completed")
        self.assertEqual(document["library_summary"]["total_records"], 8)
        self.assertEqual(document["library_summary"]["indexed_records"], 7)
        self.assertEqual(
            document["library_summary"]["index_status_counts"]["not_indexed"], 1
        )
        excluded = {item["id"]: item for item in document["excluded_records"]}
        self.assertEqual(
            excluded["aspirin-sodium"]["reason"],
            "review_required_excluded_by_default",
        )
        self.assertTrue(document["library_summary"]["record_count_conserved"])
        self.assertTrue(VALIDATOR.validate(document)["valid"])

    def test_audit_includes_review_only_when_explicit_and_keeps_duplicate_ids(self):
        library = gold_feature_library()
        duplicate = copy.deepcopy(library["records"][0])
        duplicate["record_index"] = len(library["records"])
        duplicate["id"] = "aspirin-a"
        library["records"].append(duplicate)
        library["dataset_profile"]["total_records"] += 1
        library["result_fingerprint"] = FEATURE.output_fingerprint(library)
        document = process(
            request(
                "audit_library",
                options={"include_review_required": True},
            ),
            library,
        )
        self.assertEqual(document["library_summary"]["total_records"], 9)
        self.assertEqual(document["library_summary"]["indexed_records"], 9)
        self.assertEqual(
            [item["id"] for item in document["record_manifest"]].count("aspirin-a"),
            2,
        )
        exact_groups = [
            item
            for item in document["curation_review_queue"]
            if item["type"] == "exact_structure_duplicates"
        ]
        self.assertTrue(exact_groups)
        self.assertTrue(
            all(item["automatic_mutation"] is False for item in exact_groups)
        )
        self.assertTrue(VALIDATOR.validate(document)["valid"])

    def test_upstream_rejected_and_error_records_never_index(self):
        library = gold_feature_library()
        rejected = copy.deepcopy(library["records"][4])
        rejected["record_index"] = len(library["records"])
        rejected["id"] = "rejected"
        rejected["calculation_status"] = "not_run"
        rejected["disposition"] = "rejected"
        rejected["source_structure"] = None
        rejected["calculation_canonical_smiles"] = None
        rejected["fingerprints"] = {}
        library["records"].append(rejected)
        library["dataset_profile"]["total_records"] += 1
        library["result_fingerprint"] = FEATURE.output_fingerprint(library)
        document = process(
            request(
                "audit_library",
                options={"include_review_required": True},
            ),
            library,
        )
        by_id = {item["id"]: item for item in document["record_manifest"]}
        self.assertNotEqual(by_id["rejected"]["index_status"], "indexed")
        self.assertEqual(document["library_summary"]["total_records"], 9)
        self.assertTrue(VALIDATOR.validate(document)["valid"])

    def test_upstream_fingerprint_tamper_blocks_operation(self):
        library = gold_feature_library()
        library["records"][0]["source_structure"] = "CC"
        document = process(similarity_request(), library)
        self.assertEqual(document["operation_status"], "not_run")
        self.assertEqual(document["library_status"], "blocked")
        self.assertEqual(document["library_summary"]["indexed_records"], 0)
        self.assertIn(
            "E-FEATURE-ARTIFACT-CONTRACT",
            {item["code"] for item in document["errors"]},
        )
        self.assertTrue(
            all(
                item["index_status"] == "incompatible"
                for item in document["record_manifest"]
            )
        )
        self.assertTrue(VALIDATOR.validate(document)["valid"])

    def test_view_mismatch_and_profile_mismatch_fail_closed(self):
        view_document = process(
            request(
                "similarity_search",
                options={
                    "calculation_view": "parent",
                    "include_review_required": True,
                    "fingerprint_profile_id": MORGAN_PROFILE,
                    "metric": "tanimoto",
                    "top_k": 3,
                    "threshold": None,
                    "include_self": True,
                },
                queries=[{"record_id": "aspirin-a"}],
            )
        )
        self.assertEqual(view_document["operation_status"], "not_run")
        self.assertIn(
            "E-CALCULATION-VIEW-MISMATCH",
            {item["code"] for item in view_document["errors"]},
        )

        profile_document = process(
            similarity_request(fingerprint_profile_id="unknown-fingerprint-profile")
        )
        self.assertEqual(profile_document["operation_status"], "not_run")
        self.assertIn(
            "E-FINGERPRINT-PROFILE-INCOMPATIBLE",
            {item["code"] for item in profile_document["errors"]},
        )
        self.assertTrue(VALIDATOR.validate(view_document)["valid"])
        self.assertTrue(VALIDATOR.validate(profile_document)["valid"])

    def test_result_fingerprint_is_stable_across_runtime_time(self):
        first = process(
            similarity_request(),
            generated_at="2026-08-09T00:00:00+00:00",
        )
        second = process(
            similarity_request(),
            generated_at="2026-08-10T12:34:56+00:00",
        )
        self.assertNotEqual(first["generated_at_utc"], second["generated_at_utc"])
        self.assertEqual(first["result_fingerprint"], second["result_fingerprint"])


class SimilaritySearchTests(unittest.TestCase):
    def test_gold_similarity_scores_and_tie_order_match_rdkit(self):
        document = process(similarity_request())
        hits = document["query_results"][0]["hits"]
        self.assertEqual(
            [(item["hit_id"], item["similarity"]) for item in hits],
            [
                ("aspirin-a", 1.0),
                ("aspirin-b", 1.0),
                ("aspirin-sodium", 0.6666666666666666),
            ],
        )
        self.assertTrue(hits[0]["exact_structure_match"])
        self.assertTrue(hits[1]["exact_structure_match"])
        self.assertFalse(hits[2]["exact_structure_match"])
        self.assertEqual(
            document["query_results"][0]["tie_break"],
            "score_desc_then_record_index_asc",
        )
        self.assertTrue(VALIDATOR.validate(document)["valid"])

    def test_threshold_self_exclusion_and_boundary_ties_are_audited(self):
        document = process(
            similarity_request(
                top_k=1,
                threshold=0.5,
                include_self=False,
            )
        )
        result = document["query_results"][0]
        self.assertEqual([item["hit_id"] for item in result["hits"]], ["aspirin-b"])
        self.assertEqual(result["boundary_tie_count"], 1)
        self.assertEqual(result["truncated_equal_score_count"], 0)
        self.assertTrue(VALIDATOR.validate(document)["valid"])

    def test_invalid_similarity_options_fail_without_scores(self):
        for options in (
            {"top_k": 0},
            {"threshold": 1.1},
            {"top_k": None, "threshold": None},
            {"metric": "dice"},
            {"include_self": None},
        ):
            with self.subTest(options=options):
                document = process(similarity_request(**options))
                self.assertEqual(document["operation_status"], "not_run")
                self.assertEqual(document["query_results"], [])
                self.assertTrue(document["errors"])
                self.assertTrue(VALIDATOR.validate(document)["valid"])

    def test_ambiguous_record_id_query_is_retained_as_invalid(self):
        library = gold_feature_library()
        library["records"][1]["id"] = "aspirin-a"
        library["result_fingerprint"] = FEATURE.output_fingerprint(library)
        document = process(similarity_request(), library)
        result = document["query_results"][0]
        self.assertEqual(document["operation_status"], "error")
        self.assertEqual(result["query_status"], "invalid")
        self.assertIn("实际为 2", result["error"])
        self.assertEqual(result["hits"], [])
        self.assertTrue(VALIDATOR.validate(document)["valid"])

    def test_empty_fingerprint_is_incompatible_not_zero_similarity(self):
        library = gold_feature_library()
        fingerprint = library["records"][4]["fingerprints"]["morgan"]
        fingerprint["on_bits"] = []
        fingerprint["bit_count"] = 0
        fingerprint["density"] = 0.0
        fingerprint["bitvector_sha256"] = PROCESSOR.sha256_text("0" * 2048)
        library["result_fingerprint"] = FEATURE.output_fingerprint(library)
        document = process(similarity_request(), library)
        ethanol = next(
            item for item in document["record_manifest"] if item["id"] == "ethanol"
        )
        self.assertEqual(ethanol["index_status"], "incompatible")
        self.assertIn("空 fingerprint", ethanol["reason"])
        self.assertTrue(VALIDATOR.validate(document)["valid"])


class SubstructureSearchTests(unittest.TestCase):
    def test_acid_smarts_uses_full_match_and_gold_hits(self):
        document = process(
            request(
                "substructure_search",
                options={"include_review_required": True},
                queries=[
                    {
                        "id": "acid",
                        "query_type": "smarts",
                        "query": "[CX3](=O)[OX2H1]",
                        "use_chirality": False,
                        "max_results": 20,
                    }
                ],
            )
        )
        result = document["query_results"][0]
        self.assertEqual(
            [item["hit_id"] for item in result["hits"]],
            ["aspirin-a", "aspirin-b", "r-lactic", "s-lactic"],
        )
        self.assertEqual(result["match_engine"], "rdkit_full_subgraph_isomorphism")
        self.assertTrue(all(item["match_atom_indices"] for item in result["hits"]))
        self.assertTrue(VALIDATOR.validate(document)["valid"])

    def test_chiral_smiles_query_distinguishes_enantiomers(self):
        document = process(
            request(
                "substructure_search",
                options={"include_review_required": True},
                queries=[
                    {
                        "id": "r-lactic",
                        "query_type": "smiles",
                        "query": R_LACTIC,
                        "use_chirality": True,
                        "max_results": 20,
                    }
                ],
            )
        )
        hits = [item["hit_id"] for item in document["query_results"][0]["hits"]]
        self.assertEqual(hits, ["r-lactic"])
        self.assertTrue(VALIDATOR.validate(document)["valid"])

    def test_recursive_smarts_is_rejected_without_execution(self):
        document = process(
            request(
                "substructure_search",
                options={"include_review_required": True},
                queries=[
                    {
                        "id": "recursive",
                        "query_type": "smarts",
                        "query": "[$(C=O)]",
                        "use_chirality": False,
                        "max_results": 20,
                    }
                ],
            )
        )
        result = document["query_results"][0]
        self.assertEqual(document["operation_status"], "error")
        self.assertEqual(result["query_status"], "invalid")
        self.assertEqual(result["error_code"], "E-RECURSIVE-SMARTS-UNSUPPORTED")
        self.assertEqual(result["hits"], [])
        self.assertTrue(VALIDATOR.validate(document)["valid"])

    def test_invalid_substructure_queries_are_explicit_and_preserved(self):
        queries = [
            {
                "id": "empty",
                "query_type": "smarts",
                "query": "",
                "use_chirality": False,
                "max_results": 10,
            },
            {
                "id": "bad-type",
                "query_type": "auto",
                "query": "C",
                "use_chirality": False,
                "max_results": 10,
            },
            {
                "id": "bad-smarts",
                "query_type": "smarts",
                "query": "[",
                "use_chirality": False,
                "max_results": 10,
            },
            {
                "id": "missing-chirality",
                "query_type": "smiles",
                "query": "CCO",
                "max_results": 10,
            },
        ]
        document = process(
            request(
                "substructure_search",
                options={"include_review_required": True},
                queries=queries,
            )
        )
        self.assertEqual(document["operation_status"], "error")
        self.assertEqual(len(document["query_results"]), len(queries))
        self.assertTrue(
            all(
                item["query_status"] == "invalid" and item["error"]
                for item in document["query_results"]
            )
        )
        self.assertTrue(VALIDATOR.validate(document)["valid"])


class ClusteringAndDiversityTests(unittest.TestCase):
    def test_butina_gold_clusters_and_parameters(self):
        document = process(
            request(
                "cluster_library",
                options={
                    "include_review_required": True,
                    "fingerprint_profile_id": MORGAN_PROFILE,
                    "metric": "tanimoto",
                    "similarity_threshold": 0.7,
                },
            )
        )
        clusters = [item["member_ids"] for item in document["clusters"]]
        self.assertEqual(
            clusters,
            [
                ["aspirin-b", "aspirin-a"],
                ["s-lactic"],
                ["r-lactic"],
                ["benzene"],
                ["ethanol"],
                ["caffeine"],
                ["aspirin-sodium"],
            ],
        )
        self.assertTrue(
            all(item["reordering"] is True for item in document["clusters"])
        )
        self.assertTrue(VALIDATOR.validate(document)["valid"])

    def test_maxmin_gold_is_deterministic_and_records_seed(self):
        payload = request(
            "select_diverse_subset",
            options={
                "include_review_required": True,
                "fingerprint_profile_id": MORGAN_PROFILE,
                "metric": "tanimoto",
                "pick_size": 4,
                "seed": 61453,
                "first_picks": [],
            },
        )
        first = process(payload)
        second = process(payload, generated_at="2026-08-10T00:00:00+00:00")
        first_picks = [item["record_index"] for item in first["selection"]["picks"]]
        second_picks = [item["record_index"] for item in second["selection"]["picks"]]
        self.assertEqual(first_picks, [6, 3, 5, 2])
        self.assertEqual(second_picks, first_picks)
        self.assertEqual(first["selection"]["seed"], 61453)
        self.assertTrue(VALIDATOR.validate(first)["valid"])

    def test_invalid_cluster_and_maxmin_options_fail_closed(self):
        invalid_cluster = process(
            request(
                "cluster_library",
                options={
                    "include_review_required": True,
                    "fingerprint_profile_id": MORGAN_PROFILE,
                    "metric": "tanimoto",
                    "similarity_threshold": 1.5,
                },
            )
        )
        invalid_seed = process(
            request(
                "select_diverse_subset",
                options={
                    "include_review_required": True,
                    "fingerprint_profile_id": MORGAN_PROFILE,
                    "metric": "tanimoto",
                    "pick_size": 4,
                    "seed": -1,
                },
            )
        )
        invalid_size = process(
            request(
                "select_diverse_subset",
                options={
                    "include_review_required": True,
                    "fingerprint_profile_id": MORGAN_PROFILE,
                    "metric": "tanimoto",
                    "pick_size": 99,
                    "seed": 42,
                },
            )
        )
        for document in (invalid_cluster, invalid_seed, invalid_size):
            self.assertEqual(document["operation_status"], "not_run")
            self.assertTrue(document["errors"])
            self.assertTrue(VALIDATOR.validate(document)["valid"])

    def test_resource_guard_never_truncates_or_switches_backend(self):
        original = PROCESSOR.MAX_SEARCH_RECORDS
        PROCESSOR.MAX_SEARCH_RECORDS = 2
        try:
            document = process(request("audit_library"))
        finally:
            PROCESSOR.MAX_SEARCH_RECORDS = original
        self.assertEqual(document["operation_status"], "not_run")
        self.assertEqual(document["library_summary"]["total_records"], 8)
        self.assertEqual(document["index_metadata"]["backend"], "rdkit_in_memory")
        self.assertFalse(document["index_metadata"]["automatic_backend_fallback"])
        self.assertIn(
            "E-RESOURCE-LIMIT",
            {item["code"] for item in document["errors"]},
        )
        self.assertEqual(PROCESSOR.MAX_SEARCH_RECORDS, 5000)
        self.assertEqual(PROCESSOR.MAX_CLUSTER_RECORDS, 2000)
        self.assertTrue(VALIDATOR.validate(document)["valid"])


class ValidatorAndCliTests(unittest.TestCase):
    def test_validator_detects_tampering_secret_and_automatic_mutation(self):
        original = process(similarity_request())

        tampered_score = copy.deepcopy(original)
        tampered_score["query_results"][0]["hits"][0]["similarity"] = 0.25
        score_result = VALIDATOR.validate(tampered_score)
        self.assertFalse(score_result["valid"])
        self.assertIn(
            "result_fingerprint",
            {item["path"] for item in score_result["issues"]},
        )

        tampered_mutation = copy.deepcopy(original)
        tampered_mutation["curation_review_queue"][0]["automatic_mutation"] = True
        tampered_mutation["result_fingerprint"] = VALIDATOR.expected_fingerprint(
            tampered_mutation
        )
        mutation_result = VALIDATOR.validate(tampered_mutation)
        self.assertFalse(mutation_result["valid"])
        self.assertTrue(
            any("不得自动修改" in item["message"] for item in mutation_result["issues"])
        )

        tampered_secret = copy.deepcopy(original)
        tampered_secret["notices"].append("Authorization: Bearer " + "x" * 24)
        tampered_secret["result_fingerprint"] = VALIDATOR.expected_fingerprint(
            tampered_secret
        )
        secret_result = VALIDATOR.validate(tampered_secret)
        self.assertFalse(secret_result["valid"])
        self.assertTrue(
            any("疑似凭证" in item["message"] for item in secret_result["issues"])
        )

    def test_validator_rejects_forbidden_scientific_claim(self):
        document = process(similarity_request())
        document["notices"].append("这些命中记录的活性已确认。")
        document["result_fingerprint"] = VALIDATOR.expected_fingerprint(document)
        result = VALIDATOR.validate(document)
        self.assertFalse(result["valid"])
        self.assertTrue(
            any("禁止的科学结论" in item["message"] for item in result["issues"])
        )

    def test_normal_cli_and_validator_cli(self):
        library = gold_feature_library()
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            library_path = root / "library.json"
            request_path = root / "request.json"
            output_path = root / "result.json"
            library_path.write_text(
                json.dumps(library, ensure_ascii=False), encoding="utf-8"
            )
            payload = similarity_request()
            payload["library_artifact"] = "library.json"
            request_path.write_text(
                json.dumps(payload, ensure_ascii=False), encoding="utf-8"
            )
            completed = subprocess.run(
                [
                    sys.executable,
                    str(PROCESSOR_PATH),
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
            self.assertEqual(completed.returncode, 0, completed.stderr)
            result = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(result["operation_status"], "completed")
            checked = subprocess.run(
                [sys.executable, str(VALIDATOR_PATH), str(output_path)],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(checked.returncode, 0, checked.stdout + checked.stderr)
            self.assertTrue(json.loads(checked.stdout)["valid"])

    def test_cli_normalizes_absolute_artifact_path_before_output(self):
        library = gold_feature_library()
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            library_path = root / "library.json"
            request_path = root / "request.json"
            output_path = root / "result.json"
            library_path.write_text(
                json.dumps(library, ensure_ascii=False), encoding="utf-8"
            )
            payload = request("audit_library")
            payload["library_artifact"] = str(library_path.resolve())
            request_path.write_text(
                json.dumps(payload, ensure_ascii=False), encoding="utf-8"
            )

            completed = subprocess.run(
                [
                    sys.executable,
                    str(PROCESSOR_PATH),
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

            self.assertEqual(completed.returncode, 0, completed.stderr)
            document = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(
                document["upstream_artifact"]["declared_path"],
                "library.json",
            )
            self.assertTrue(VALIDATOR.validate(document)["valid"])

    def test_invalid_cli_request_fails_without_output(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            request_path = root / "request.json"
            output_path = root / "result.json"
            request_path.write_text(
                json.dumps(
                    {
                        "operation": "similarity_search",
                        "library_artifact": "",
                        "options": {},
                    }
                ),
                encoding="utf-8",
            )
            completed = subprocess.run(
                [
                    sys.executable,
                    str(PROCESSOR_PATH),
                    "--request",
                    str(request_path),
                    "--output",
                    str(output_path),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(completed.returncode, 3)
            self.assertFalse(output_path.exists())
            self.assertIn("error:", completed.stderr)

    def test_first_to_third_to_fourth_real_chain(self):
        standardization = STANDARDIZER.process_records(
            [
                {
                    "id": "aspirin",
                    "original_structure": ASPIRIN,
                    "input_format": "smiles",
                    "source": "unit-test",
                    "record_index": 0,
                },
                {
                    "id": "aspirin-sodium",
                    "original_structure": ASPIRIN_SODIUM,
                    "input_format": "smiles",
                    "source": "unit-test",
                    "record_index": 1,
                },
                {
                    "id": "bad-valence",
                    "original_structure": "CO(C)C",
                    "input_format": "smiles",
                    "source": "unit-test",
                    "record_index": 2,
                },
            ],
            "chembl-pipeline",
            generated_at_utc=FIXED_TIME,
        )
        feature_records = [
            FEATURE.normalize_input_record(
                item,
                index,
                "unit-test-chain",
                {
                    "workflow": standardization["workflow"],
                    "result_fingerprint": standardization["result_fingerprint"],
                    "tool_versions": standardization["tool_versions"],
                    "profile": standardization["options"]["profile"],
                },
            )
            for index, item in enumerate(standardization["records"])
        ]
        feature_library = FEATURE.process_records(
            feature_records,
            calculation_view="standardized",
            upstream={
                "schema_version": standardization["schema_version"],
                "workflow": standardization["workflow"],
                "result_fingerprint": standardization["result_fingerprint"],
                "tool_versions": standardization["tool_versions"],
                "profile": standardization["options"]["profile"],
                "duplicate_groups": standardization["duplicate_groups"],
                "source": "unit-test-chain",
                "input_format": "json",
            },
            generated_at_utc=FIXED_TIME,
        )
        document = process(
            request(
                "audit_library",
                options={"include_review_required": True},
            ),
            feature_library,
        )
        manifest = {item["id"]: item for item in document["record_manifest"]}
        self.assertEqual(manifest["aspirin"]["index_status"], "indexed")
        self.assertEqual(manifest["aspirin-sodium"]["index_status"], "indexed")
        self.assertNotEqual(manifest["bad-valence"]["index_status"], "indexed")
        self.assertEqual(document["library_summary"]["total_records"], 3)
        self.assertTrue(VALIDATOR.validate(document)["valid"])


if __name__ == "__main__":
    unittest.main()
