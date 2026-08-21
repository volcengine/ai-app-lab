import csv
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parents[1]
SKILL_DIR = PROJECT_DIR / "skills" / "compute-molecular-features"
PROCESSOR_PATH = SKILL_DIR / "scripts" / "compute_features.py"
VALIDATOR_PATH = SKILL_DIR / "scripts" / "validate_output.py"
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
GLUCOSE = "OC[C@H]1O[C@H](O)[C@@H](O)[C@H](O)[C@H]1O"
LOCAL_STRUCTURE = "C[C@H](F)C(=O)N[C@@H](C#N)c1ccc(Br)cc1"
_DEFAULT_PARENT = object()


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


PROCESSOR = load_module("compute_molecular_features", PROCESSOR_PATH)
VALIDATOR = load_module("validate_molecular_features", VALIDATOR_PATH)
STANDARDIZER = load_module("standardize_for_feature_chain", STANDARDIZER_PATH)


def input_record(
    record_id,
    standardized_structure,
    *,
    parent_structure=_DEFAULT_PARENT,
    original_structure=None,
    disposition="ready_for_downstream",
    parse_status="success",
    standardization_status="completed",
    human_review_required=None,
    index=0,
):
    if parent_structure is _DEFAULT_PARENT:
        parent_structure = standardized_structure
    return {
        "id": record_id,
        "record_index": index,
        "source": "unit-test",
        "original_structure": (
            standardized_structure if original_structure is None else original_structure
        ),
        "standardized_structure": standardized_structure,
        "parent_structure": parent_structure,
        "inchikey": None,
        "parent_inchikey": None,
        "parse_status": parse_status,
        "standardization_status": standardization_status,
        "disposition": disposition,
        "human_review_required": list(human_review_required or []),
        "tool_versions": {
            "rdkit": "2025.9.2",
            "chembl_structure_pipeline": "1.2.4",
        },
        "profile": "chembl-pipeline",
        "upstream_workflow": "chemical-structure-standardization-qc",
        "upstream_fingerprint": "b" * 64,
        "input_record_fingerprint": PROCESSOR.sha256_json(
            {
                "id": record_id,
                "standardized_structure": standardized_structure,
                "parent_structure": parent_structure,
                "disposition": disposition,
            }
        ),
    }


def upstream_context(duplicate_groups=None):
    return {
        "schema_version": "1.0.0",
        "workflow": "chemical-structure-standardization-qc",
        "result_fingerprint": "b" * 64,
        "tool_versions": {
            "rdkit": "2025.9.2",
            "chembl_structure_pipeline": "1.2.4",
        },
        "profile": "chembl-pipeline",
        "duplicate_groups": list(duplicate_groups or []),
        "source": "unit-test",
        "input_format": "json",
    }


def process(
    records,
    *,
    calculation_view="standardized",
    generated_at=FIXED_TIME,
    options_override=None,
    descriptor_functions=None,
    fingerprint_functions=None,
    duplicate_groups=None,
):
    normalized = []
    for index, record in enumerate(records):
        item = dict(record)
        item["record_index"] = index
        normalized.append(item)
    return PROCESSOR.process_records(
        normalized,
        calculation_view=calculation_view,
        upstream=upstream_context(duplicate_groups),
        generated_at_utc=generated_at,
        options_override=options_override,
        descriptor_functions=descriptor_functions,
        fingerprint_functions=fingerprint_functions,
    )


class MolecularFeatureCoreTests(unittest.TestCase):
    def test_normal_structures_compute_complete_auditable_features(self):
        document = process(
            [
                input_record("aspirin", ASPIRIN),
                input_record("aspirin-sodium", ASPIRIN_SODIUM),
                input_record("caffeine", CAFFEINE),
                input_record("ethanol", ETHANOL),
                input_record("benzene", BENZENE),
                input_record("glucose", GLUCOSE),
                input_record("local-structure", LOCAL_STRUCTURE),
            ]
        )
        self.assertEqual(document["input_summary"]["total_records"], 7)
        self.assertEqual(
            document["input_summary"]["calculation_status_counts"]["completed"],
            7,
        )
        self.assertEqual(document["descriptor_set"]["id"], "rdkit-2d-core-v1")
        self.assertFalse(document["descriptor_set"]["requires_3d_conformer"])
        expected_names = {
            item["name"] for item in document["descriptor_set"]["features"]
        }
        for item in document["records"]:
            with self.subTest(record=item["id"]):
                self.assertEqual(item["calculation_status"], "completed")
                self.assertEqual(set(item["descriptors"]), expected_names)
                self.assertEqual(
                    set(item["fingerprints"]),
                    {"morgan", "rdkit_topological", "maccs"},
                )
                self.assertEqual(item["missing_features"], [])
                self.assertEqual(
                    item["original_structure"],
                    next(
                        record["original_structure"]
                        for record in document["records"]
                        if record["id"] == item["id"]
                    ),
                )
        by_id = {item["id"]: item for item in document["records"]}
        self.assertEqual(by_id["glucose"]["descriptors"]["MolecularFormula"], "C6H12O6")
        self.assertTrue(VALIDATOR.validate(document)["valid"])

    def test_aspirin_descriptor_values_match_fixed_rdkit_behavior(self):
        document = process([input_record("aspirin", ASPIRIN)])
        values = document["records"][0]["descriptors"]
        self.assertEqual(values["MolecularFormula"], "C9H8O4")
        self.assertAlmostEqual(values["MolecularWeight"], 180.159, places=6)
        self.assertAlmostEqual(values["ExactMolWt"], 180.042258736, places=9)
        self.assertEqual(values["HeavyAtomCount"], 13)
        self.assertEqual(values["NumHDonors"], 1)
        self.assertEqual(values["NumHAcceptors"], 3)
        self.assertEqual(values["NumRotatableBonds"], 2)
        self.assertEqual(values["RingCount"], 1)
        self.assertEqual(values["NumAromaticRings"], 1)
        self.assertAlmostEqual(values["FractionCSP3"], 1 / 9, places=12)
        self.assertAlmostEqual(values["TPSA"], 63.6, places=9)
        self.assertAlmostEqual(values["MolLogP"], 1.3101, places=6)
        self.assertEqual(values["FormalCharge"], 0)
        self.assertEqual(values["NumHeteroatoms"], 4)

    def test_fingerprint_profiles_and_representations_are_complete(self):
        document = process([input_record("aspirin", ASPIRIN)])
        profiles = document["fingerprint_profiles"]
        self.assertEqual(
            profiles["morgan"]["parameters"],
            {
                "radius": 2,
                "fpSize": 2048,
                "includeChirality": True,
                "useBondTypes": True,
                "countSimulation": False,
                "onlyNonzeroInvariants": False,
                "includeRingMembership": True,
                "includeRedundantEnvironments": False,
                "bitsPerFeature": 1,
            },
        )
        self.assertEqual(
            profiles["rdkit_topological"]["parameters"]["numBitsPerFeature"],
            2,
        )
        self.assertEqual(profiles["maccs"]["parameters"]["fpSize"], 167)
        fingerprints = document["records"][0]["fingerprints"]
        for name, value in fingerprints.items():
            with self.subTest(fingerprint=name):
                self.assertEqual(value["representation"], "bit_vector_on_bits")
                self.assertEqual(value["on_bits"], sorted(set(value["on_bits"])))
                self.assertEqual(value["bit_count"], len(value["on_bits"]))
                self.assertAlmostEqual(
                    value["density"],
                    value["bit_count"] / value["size"],
                    places=15,
                )
                self.assertRegex(value["bitvector_sha256"], r"^[0-9a-f]{64}$")
        self.assertEqual(fingerprints["maccs"]["size"], 167)
        self.assertNotIn(0, fingerprints["maccs"]["on_bits"])
        self.assertTrue(VALIDATOR.validate(document)["valid"])

    def test_fingerprint_parameter_change_changes_profile(self):
        default = process([input_record("aspirin", ASPIRIN)])
        changed = process(
            [input_record("aspirin", ASPIRIN)],
            options_override={
                "morgan_radius": 3,
                "morgan_fp_size": 1024,
                "morgan_include_chirality": False,
            },
        )
        default_profile = default["fingerprint_profiles"]["morgan"]
        changed_profile = changed["fingerprint_profiles"]["morgan"]
        self.assertNotEqual(
            default_profile["profile_id"], changed_profile["profile_id"]
        )
        self.assertNotEqual(
            default_profile["profile_fingerprint"],
            changed_profile["profile_fingerprint"],
        )
        self.assertEqual(changed["records"][0]["fingerprints"]["morgan"]["size"], 1024)
        self.assertTrue(VALIDATOR.validate(changed)["valid"])

    def test_same_input_version_and_parameters_are_deterministic(self):
        records = [
            input_record("aspirin", ASPIRIN),
            input_record("ethanol", ETHANOL),
        ]
        first = process(records, generated_at="2026-08-09T00:00:00+00:00")
        second = process(records, generated_at="2026-08-10T00:00:00+00:00")
        self.assertNotEqual(first["generated_at_utc"], second["generated_at_utc"])
        self.assertEqual(first["result_fingerprint"], second["result_fingerprint"])
        first["generated_at_utc"] = second["generated_at_utc"]
        self.assertEqual(first, second)


class StateAndViewTests(unittest.TestCase):
    def test_upstream_rejected_record_is_retained_without_fake_features(self):
        rejected = input_record(
            "upstream-rejected",
            ASPIRIN,
            disposition="rejected",
            parse_status="error",
            standardization_status="not_run",
        )
        document = process([rejected])
        item = document["records"][0]
        self.assertEqual(item["id"], "upstream-rejected")
        self.assertEqual(item["original_structure"], ASPIRIN)
        self.assertEqual(item["calculation_status"], "not_run")
        self.assertEqual(item["disposition"], "rejected")
        self.assertEqual(item["descriptors"], {})
        self.assertEqual(item["fingerprints"], {})
        self.assertIn(
            "E-UPSTREAM-REJECTED",
            [finding["code"] for finding in item["qc_findings"]],
        )
        self.assertTrue(VALIDATOR.validate(document)["valid"])

    def test_invalid_and_empty_standardized_structures_are_rejected(self):
        document = process(
            [
                input_record("invalid", "CO(C)C"),
                input_record("empty", ""),
            ]
        )
        self.assertEqual(len(document["records"]), 2)
        for item in document["records"]:
            with self.subTest(record=item["id"]):
                self.assertEqual(item["disposition"], "rejected")
                self.assertIn(item["calculation_status"], {"not_run", "error"})
                self.assertEqual(item["descriptors"], {})
                self.assertEqual(item["fingerprints"], {})
        self.assertEqual(
            document["input_summary"]["output_disposition_counts"]["rejected"],
            2,
        )
        self.assertTrue(VALIDATOR.validate(document)["valid"])

    def test_upstream_review_reasons_are_propagated_while_features_compute(self):
        cases = [
            (
                "unknown-stereo",
                "CC(F)Cl",
                ["R-UNSPECIFIED-STEREO"],
            ),
            (
                "salt",
                ASPIRIN_SODIUM,
                ["R-MULTICOMPONENT-SALT"],
            ),
            (
                "true-mixture",
                "CCO.CN",
                ["R-MULTICOMPONENT-MIXTURE"],
            ),
            (
                "metal",
                "[Cu+2]([NH3])([NH3])([NH3])[NH3]",
                ["R-METAL-PRESENT"],
            ),
            (
                "isotope",
                "[13CH3]CO",
                ["R-ISOTOPE-PRESENT"],
            ),
        ]
        document = process(
            [
                input_record(
                    record_id,
                    structure,
                    disposition="review_required",
                    human_review_required=reasons,
                )
                for record_id, structure, reasons in cases
            ]
        )
        for item, (_, _, reasons) in zip(document["records"], cases):
            with self.subTest(record=item["id"]):
                self.assertIn(item["calculation_status"], {"completed", "partial"})
                self.assertEqual(item["disposition"], "review_required")
                self.assertTrue(set(reasons) <= set(item["human_review_required"]))
                self.assertIn(
                    "R-UPSTREAM-REVIEW-REQUIRED",
                    [finding["code"] for finding in item["qc_findings"]],
                )
        self.assertTrue(VALIDATOR.validate(document)["valid"])

    def test_standardized_and_parent_views_do_not_mix_or_overwrite(self):
        sodium = input_record(
            "aspirin-sodium",
            ASPIRIN_SODIUM,
            parent_structure=ASPIRIN,
            original_structure=ASPIRIN_SODIUM,
            disposition="review_required",
            human_review_required=["R-MULTICOMPONENT-SALT"],
        )
        standardized = process([sodium], calculation_view="standardized")
        parent = process([sodium], calculation_view="parent")
        standardized_item = standardized["records"][0]
        parent_item = parent["records"][0]
        self.assertEqual(standardized_item["source_structure"], ASPIRIN_SODIUM)
        self.assertEqual(parent_item["source_structure"], ASPIRIN)
        self.assertEqual(standardized_item["original_structure"], ASPIRIN_SODIUM)
        self.assertEqual(parent_item["original_structure"], ASPIRIN_SODIUM)
        self.assertGreater(
            standardized_item["descriptors"]["MolecularWeight"],
            parent_item["descriptors"]["MolecularWeight"],
        )
        self.assertNotEqual(
            standardized_item["fingerprints"]["morgan"]["bitvector_sha256"],
            parent_item["fingerprints"]["morgan"]["bitvector_sha256"],
        )
        self.assertIn(
            "N-PARENT-CALCULATION-VIEW",
            [finding["code"] for finding in parent_item["qc_findings"]],
        )
        self.assertTrue(VALIDATOR.validate(standardized)["valid"])
        self.assertTrue(VALIDATOR.validate(parent)["valid"])

    def test_missing_parent_does_not_fall_back_to_standardized(self):
        record = input_record(
            "mixture",
            "CCO.CN",
            parent_structure=None,
            disposition="review_required",
            human_review_required=["R-MULTICOMPONENT-MIXTURE"],
        )
        document = process([record], calculation_view="parent")
        item = document["records"][0]
        self.assertIsNone(item["source_structure"])
        self.assertEqual(item["calculation_status"], "not_run")
        self.assertEqual(item["disposition"], "review_required")
        self.assertEqual(item["descriptors"], {})
        self.assertEqual(item["fingerprints"], {})
        self.assertIn("R-CALCULATION-VIEW-MISSING", item["human_review_required"])
        self.assertTrue(VALIDATOR.validate(document)["valid"])

    def test_same_parent_salts_remain_distinct_records(self):
        records = [
            input_record("aspirin", ASPIRIN, parent_structure=ASPIRIN),
            input_record(
                "aspirin-sodium",
                ASPIRIN_SODIUM,
                parent_structure=ASPIRIN,
                disposition="review_required",
                human_review_required=["R-MULTICOMPONENT-SALT"],
            ),
        ]
        standardized = process(records, calculation_view="standardized")
        parent = process(records, calculation_view="parent")
        self.assertNotEqual(
            standardized["records"][0]["descriptors"]["MolecularWeight"],
            standardized["records"][1]["descriptors"]["MolecularWeight"],
        )
        parent_group = parent["dataset_profile"]["duplicate_structures"]["groups"][0]
        self.assertEqual(parent_group["record_ids"], ["aspirin", "aspirin-sodium"])
        self.assertEqual(len(parent["records"]), 2)
        self.assertTrue(
            all(
                "物理样品" in notice
                for notice in parent["notices"]
                if "parent" in notice
            )
        )


class DatasetQualityAndFailureTests(unittest.TestCase):
    def test_same_structure_different_ids_are_preserved_and_profiled(self):
        upstream_group = {
            "basis": "standardized",
            "record_ids": ["ethanol-a", "ethanol-b"],
            "record_indices": [0, 1],
            "relationship": "same_standardized_structure",
        }
        document = process(
            [
                input_record("ethanol-a", ETHANOL),
                input_record("ethanol-b", ETHANOL),
            ],
            duplicate_groups=[upstream_group],
        )
        self.assertEqual(
            [item["id"] for item in document["records"]],
            ["ethanol-a", "ethanol-b"],
        )
        duplicate_profile = document["dataset_profile"]["duplicate_structures"]
        self.assertEqual(duplicate_profile["group_count"], 1)
        self.assertEqual(
            duplicate_profile["groups"][0]["record_ids"],
            ["ethanol-a", "ethanol-b"],
        )
        upstream_reference = document["dataset_profile"][
            "upstream_duplicate_groups_reference"
        ]
        self.assertTrue(upstream_reference["available"])
        self.assertEqual(upstream_reference["basis_counts"], {"standardized": 1})

    def test_dataset_profile_reports_constants_near_constants_and_ranges(self):
        records = [input_record(f"ethanol-{index:02d}", ETHANOL) for index in range(20)]
        records.append(input_record("benzene", BENZENE))
        document = process(records)
        profile = document["dataset_profile"]
        self.assertIn("FormalCharge", profile["constant_features"])
        self.assertIn("HeavyAtomCount", profile["near_constant_features"])
        heavy = profile["descriptor_statistics"]["HeavyAtomCount"]
        self.assertEqual(heavy["non_missing_count"], 21)
        self.assertAlmostEqual(heavy["dominant_value_fraction"], 20 / 21, places=15)
        self.assertEqual(heavy["range"], {"min": 3.0, "max": 6.0})
        self.assertEqual(heavy["quantiles"]["method"], "linear_type7")
        self.assertNotIn("MolecularFormula", profile["constant_features"])
        self.assertTrue(VALIDATOR.validate(document)["valid"])

    def test_large_molecule_is_retained_and_statistically_visible(self):
        large = "C" * 300
        document = process(
            [
                input_record("ethanol", ETHANOL),
                input_record("benzene", BENZENE),
                input_record("aspirin", ASPIRIN),
                input_record("caffeine", CAFFEINE),
                input_record("large-chain", large),
            ]
        )
        item = document["records"][-1]
        self.assertEqual(item["calculation_status"], "completed")
        self.assertGreater(item["descriptors"]["MolecularWeight"], 4000)
        molecular_weight = document["dataset_profile"]["descriptor_statistics"][
            "MolecularWeight"
        ]
        self.assertGreater(molecular_weight["range"]["max"], 4000)
        self.assertIn("large-chain", molecular_weight["outliers"]["record_ids"])
        self.assertTrue(VALIDATOR.validate(document)["valid"])

    def test_nan_and_inf_are_explicit_missing_values_not_silent_defaults(self):
        toolkit = PROCESSOR.load_toolkit()
        calculators = PROCESSOR.descriptor_calculators(toolkit)
        calculators["MolLogP"] = lambda molecule: float("nan")
        calculators["TPSA"] = lambda molecule: float("inf")
        document = process(
            [input_record("aspirin", ASPIRIN)],
            descriptor_functions=calculators,
        )
        item = document["records"][0]
        self.assertEqual(item["calculation_status"], "partial")
        self.assertEqual(item["disposition"], "review_required")
        self.assertIsNone(item["descriptors"]["MolLogP"])
        self.assertIsNone(item["descriptors"]["TPSA"])
        self.assertIn("descriptor:MolLogP", item["missing_features"])
        self.assertIn("descriptor:TPSA", item["missing_features"])
        self.assertEqual(
            document["dataset_profile"]["descriptor_statistics"]["MolLogP"][
                "non_finite_count"
            ],
            1,
        )
        self.assertNotIn("NaN", json.dumps(document, ensure_ascii=False))
        self.assertNotIn("Infinity", json.dumps(document, ensure_ascii=False))
        self.assertTrue(VALIDATOR.validate(document)["valid"])

    def test_dataset_counts_conserve_every_input(self):
        document = process(
            [
                input_record("ready", ETHANOL),
                input_record(
                    "review",
                    "CC(F)Cl",
                    disposition="review_required",
                    human_review_required=["R-UNSPECIFIED-STEREO"],
                ),
                input_record(
                    "rejected",
                    ASPIRIN,
                    disposition="rejected",
                    parse_status="error",
                    standardization_status="not_run",
                ),
                input_record("invalid", "CO(C)C"),
            ]
        )
        summary = document["input_summary"]
        self.assertEqual(summary["total_records"], 4)
        self.assertEqual(sum(summary["calculation_status_counts"].values()), 4)
        self.assertEqual(sum(summary["output_disposition_counts"].values()), 4)
        self.assertEqual(document["dataset_profile"]["total_records"], 4)
        self.assertTrue(VALIDATOR.validate(document)["valid"])

    def test_output_contains_no_automatic_scientific_claims(self):
        document = process([input_record("aspirin", ASPIRIN)])
        serialized = json.dumps(document, ensure_ascii=False).lower()
        forbidden = (
            "药效已确认",
            "活性已确认",
            "毒性已确认",
            "安全性已确认",
            "结构已确证",
            "适合直接建模",
            "same biological function",
            "safe to synthesize",
        )
        for phrase in forbidden:
            self.assertNotIn(phrase, serialized)
        self.assertIn(
            "未评估任何具体模型",
            document["dataset_profile"]["interpretation"],
        )


class ContractTamperAndInputTests(unittest.TestCase):
    def test_feature_output_contract_matches_validator(self):
        contract = load_module(
            "feature_output_contract_test",
            SKILL_DIR / "scripts" / "feature_output_contract.py",
        )
        document = process([input_record("ethanol", ETHANOL)])

        errors, warnings = contract.validate_document(document)
        report = VALIDATOR.validate(document)

        self.assertEqual(errors, report["errors"])
        self.assertEqual(warnings, report["warnings"])

    def test_validator_rejects_result_tampering(self):
        document = process([input_record("aspirin", ASPIRIN)])
        document["records"][0]["descriptors"]["MolecularWeight"] += 1
        report = VALIDATOR.validate(document)
        self.assertFalse(report["valid"])
        self.assertIn("result_fingerprint mismatch", report["errors"])

    def test_validator_rejects_rehashed_fingerprint_size_divergence(self):
        document = process([input_record("ethanol", ETHANOL)])
        fingerprint = document["records"][0]["fingerprints"]["morgan"]
        fingerprint["size"] += 1
        bit_set = set(fingerprint["on_bits"])
        ascii_bits = "".join(
            "1" if index in bit_set else "0" for index in range(fingerprint["size"])
        )
        fingerprint["density"] = len(bit_set) / fingerprint["size"]
        fingerprint["bitvector_sha256"] = PROCESSOR.sha256_text(ascii_bits)
        document["result_fingerprint"] = VALIDATOR.output_fingerprint(document)

        report = VALIDATOR.validate(document)

        self.assertFalse(report["valid"])
        self.assertTrue(
            any("size does not match profile" in item for item in report["errors"]),
            report,
        )

    def test_validator_rejects_malformed_record_containers_without_crashing(self):
        for field in (
            "descriptors",
            "fingerprints",
            "qc_findings",
            "upstream_human_review_required",
            "human_review_required",
        ):
            with self.subTest(field=field):
                document = process([input_record("ethanol", ETHANOL)])
                document["records"][0][field] = None
                document["result_fingerprint"] = VALIDATOR.output_fingerprint(document)

                report = VALIDATOR.validate(document)

                self.assertFalse(report["valid"])
                self.assertTrue(
                    any(f"records[0].{field}" in item for item in report["errors"]),
                    report,
                )

    def test_validator_rejects_rehashed_boolean_record_counts(self):
        cases = (
            (
                "record_index",
                lambda document: document["records"][0].update({"record_index": False}),
                "records[0].record_index",
            ),
            (
                "input_total",
                lambda document: document["input_summary"].update(
                    {"total_records": True}
                ),
                "input_summary.total_records",
            ),
            (
                "dataset_total",
                lambda document: document["dataset_profile"].update(
                    {"total_records": True}
                ),
                "dataset_profile.total_records",
            ),
        )
        for name, mutate, expected_path in cases:
            with self.subTest(field=name):
                document = process([input_record("ethanol", ETHANOL)])
                mutate(document)
                document["result_fingerprint"] = VALIDATOR.output_fingerprint(document)

                report = VALIDATOR.validate(document)

                self.assertFalse(report["valid"])
                self.assertTrue(
                    any(expected_path in item for item in report["errors"]),
                    report,
                )

    def test_validator_rejects_secret_and_nonfinite_values(self):
        document = process([input_record("aspirin", ASPIRIN)])
        document["notices"].append("Authorization: Bearer " + "A" * 24)
        document["records"][0]["descriptors"]["MolLogP"] = float("nan")
        document["result_fingerprint"] = VALIDATOR.output_fingerprint(document)
        report = VALIDATOR.validate(document)
        self.assertFalse(report["valid"])
        self.assertIn("possible secret detected in output", report["errors"])
        self.assertTrue(
            any("non-finite" in error for error in report["errors"]),
            report,
        )

    def test_validator_rejects_calculation_view_mixing(self):
        document = process([input_record("aspirin", ASPIRIN)])
        document["records"][0]["source_structure"] = "CCO"
        document["result_fingerprint"] = VALIDATOR.output_fingerprint(document)
        report = VALIDATOR.validate(document)
        self.assertFalse(report["valid"])
        self.assertTrue(
            any("mixes calculation views" in error for error in report["errors"])
        )

    def test_direct_json_and_csv_input_adapters_preserve_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            json_path = root / "records.json"
            json_path.write_text(
                json.dumps(
                    {
                        "schema_version": "direct-v1",
                        "records": [
                            {
                                "id": "aspirin",
                                "original_structure": ASPIRIN,
                                "standardized_structure": ASPIRIN,
                                "parent_structure": ASPIRIN,
                                "parse_status": "success",
                                "standardization_status": "completed",
                                "disposition": "ready_for_downstream",
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            json_records, json_upstream = PROCESSOR.load_input_records(
                json_path, "auto"
            )
            self.assertEqual(json_records[0]["id"], "aspirin")
            self.assertEqual(json_records[0]["original_structure"], ASPIRIN)
            self.assertEqual(json_upstream["schema_version"], "direct-v1")
            self.assertEqual(json_upstream["source"], "records.json")
            self.assertFalse(Path(json_upstream["source"]).is_absolute())

            csv_path = root / "records.csv"
            csv_path.write_text(
                "id,original_structure,standardized_structure,parent_structure,"
                "parse_status,standardization_status,disposition,"
                "human_review_required\n"
                f"ethanol,{ETHANOL},{ETHANOL},{ETHANOL},success,completed,"
                "ready_for_downstream,[]\n",
                encoding="utf-8",
            )
            csv_records, csv_upstream = PROCESSOR.load_input_records(csv_path, "auto")
            self.assertEqual(csv_records[0]["id"], "ethanol")
            self.assertEqual(csv_records[0]["standardized_structure"], ETHANOL)
            self.assertEqual(csv_upstream["input_format"], "csv")

    def test_file_location_does_not_change_feature_result_fingerprint(self):
        payload = STANDARDIZER.process_records(
            [
                {
                    "id": "aspirin",
                    "record_index": 0,
                    "source": "unit-test",
                    "input_format": "smiles",
                    "original_structure": ASPIRIN,
                }
            ],
            "chembl-pipeline",
            provenance=[{"source": "unit-test"}],
            generated_at_utc=FIXED_TIME,
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            documents = []
            for folder in ("first", "second"):
                path = root / folder / "standardized.json"
                path.parent.mkdir()
                path.write_text(json.dumps(payload), encoding="utf-8")
                records, upstream = PROCESSOR.load_input_records(path, "json")
                documents.append(
                    PROCESSOR.process_records(
                        records,
                        calculation_view="standardized",
                        upstream=upstream,
                        generated_at_utc=FIXED_TIME,
                    )
                )
            self.assertEqual(
                documents[0]["result_fingerprint"],
                documents[1]["result_fingerprint"],
            )
            self.assertEqual(
                documents[0]["upstream"]["source"],
                "standardized.json",
            )
            self.assertEqual(
                list(documents[0]["input_summary"]["calculation_status_counts"]),
                sorted(PROCESSOR.CALCULATION_STATUSES),
            )
            self.assertEqual(
                list(documents[0]["input_summary"]["output_disposition_counts"]),
                sorted(PROCESSOR.DISPOSITIONS),
            )

    def test_input_adapter_rejects_missing_structure_column_and_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            bad_csv = root / "bad.csv"
            bad_csv.write_text("id,structure\nx,CCO\n", encoding="utf-8")
            with self.assertRaisesRegex(
                PROCESSOR.InputFailure, "standardized_structure"
            ):
                PROCESSOR.load_input_records(bad_csv, "auto")

            secret_json = root / "secret.json"
            secret_json.write_text(
                json.dumps(
                    {
                        "records": [
                            {
                                "id": "x",
                                "standardized_structure": ETHANOL,
                                "note": "ark-" + "A" * 24,
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(PROCESSOR.InputFailure, "疑似凭证"):
                PROCESSOR.load_input_records(secret_json, "auto")


class CliAndWorkflowTests(unittest.TestCase):
    def test_cli_success_writes_valid_json_and_csv_matrix(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            input_path = root / "records.csv"
            output_path = root / "features.json"
            csv_path = root / "features.csv"
            input_path.write_text(
                "id,original_structure,standardized_structure,parent_structure,"
                "parse_status,standardization_status,disposition\n"
                f"aspirin,{ASPIRIN},{ASPIRIN},{ASPIRIN},success,completed,"
                "ready_for_downstream\n"
                f"ethanol,{ETHANOL},{ETHANOL},{ETHANOL},success,completed,"
                "ready_for_downstream\n",
                encoding="utf-8",
            )
            completed = subprocess.run(
                [
                    sys.executable,
                    str(PROCESSOR_PATH),
                    "--input",
                    str(input_path),
                    "--generated-at",
                    FIXED_TIME,
                    "--output",
                    str(output_path),
                    "--csv-matrix",
                    str(csv_path),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertTrue(output_path.exists())
            self.assertTrue(csv_path.exists())
            document = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertTrue(VALIDATOR.validate(document)["valid"])
            with csv_path.open(encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(len(rows), 2)
            self.assertEqual(rows[0]["MolecularFormula"], "C9H8O4")
            self.assertTrue(json.loads(rows[0]["morgan_on_bits"]))

    def test_cli_failure_returns_two_and_preserves_all_records(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            input_path = root / "records.json"
            output_path = root / "features.json"
            input_path.write_text(
                json.dumps(
                    {
                        "records": [
                            {
                                "id": "ready",
                                "original_structure": ETHANOL,
                                "standardized_structure": ETHANOL,
                                "parent_structure": ETHANOL,
                                "parse_status": "success",
                                "standardization_status": "completed",
                                "disposition": "ready_for_downstream",
                                "human_review_required": [],
                            },
                            {
                                "id": "rejected",
                                "original_structure": "CO(C)C",
                                "standardized_structure": None,
                                "parent_structure": None,
                                "parse_status": "error",
                                "standardization_status": "not_run",
                                "disposition": "rejected",
                                "human_review_required": [],
                            },
                        ]
                    }
                ),
                encoding="utf-8",
            )
            completed = subprocess.run(
                [
                    sys.executable,
                    str(PROCESSOR_PATH),
                    "--input",
                    str(input_path),
                    "--generated-at",
                    FIXED_TIME,
                    "--output",
                    str(output_path),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(completed.returncode, 2, completed.stderr)
            document = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(len(document["records"]), 2)
            rejected = document["records"][1]
            self.assertEqual(rejected["calculation_status"], "not_run")
            self.assertEqual(rejected["descriptors"], {})
            self.assertTrue(VALIDATOR.validate(document)["valid"])

    def test_first_skill_json_to_third_skill_real_chain(self):
        first_records = [
            {
                "id": "aspirin",
                "record_index": 0,
                "source": "chain-test",
                "input_format": "smiles",
                "original_structure": ASPIRIN,
            },
            {
                "id": "aspirin-sodium",
                "record_index": 1,
                "source": "chain-test",
                "input_format": "smiles",
                "original_structure": ASPIRIN_SODIUM,
            },
            {
                "id": "bad-valence",
                "record_index": 2,
                "source": "chain-test",
                "input_format": "smiles",
                "original_structure": "CO(C)C",
            },
        ]
        first_document = STANDARDIZER.process_records(
            first_records,
            "chembl-pipeline",
            provenance=[{"source": "chain-test"}],
            generated_at_utc=FIXED_TIME,
        )
        self.assertEqual(first_document["input_summary"]["rejected"], 1)

        with tempfile.TemporaryDirectory() as directory:
            input_path = Path(directory) / "standardized.json"
            input_path.write_text(
                json.dumps(first_document, ensure_ascii=False),
                encoding="utf-8",
            )
            records, upstream = PROCESSOR.load_input_records(input_path, "json")
            third_document = PROCESSOR.process_records(
                records,
                calculation_view="standardized",
                upstream=upstream,
                generated_at_utc=FIXED_TIME,
            )
        self.assertEqual(len(third_document["records"]), 3)
        by_id = {item["id"]: item for item in third_document["records"]}
        self.assertEqual(by_id["aspirin"]["calculation_status"], "completed")
        self.assertEqual(by_id["aspirin-sodium"]["disposition"], "review_required")
        self.assertEqual(by_id["bad-valence"]["calculation_status"], "not_run")
        self.assertEqual(by_id["bad-valence"]["descriptors"], {})
        self.assertEqual(
            third_document["upstream"]["result_fingerprint"],
            first_document["result_fingerprint"],
        )
        self.assertTrue(VALIDATOR.validate(third_document)["valid"])

    def test_validator_cli_accepts_valid_output_and_rejects_tampering(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "features.json"
            document = process([input_record("aspirin", ASPIRIN)])
            path.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")
            valid = subprocess.run(
                [sys.executable, str(VALIDATOR_PATH), str(path)],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(valid.returncode, 0, valid.stdout)
            document["records"][0]["descriptors"]["TPSA"] = 0
            path.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")
            invalid = subprocess.run(
                [sys.executable, str(VALIDATOR_PATH), str(path)],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(invalid.returncode, 1, invalid.stdout)
            self.assertIn("result_fingerprint mismatch", invalid.stdout)


if __name__ == "__main__":
    unittest.main()
