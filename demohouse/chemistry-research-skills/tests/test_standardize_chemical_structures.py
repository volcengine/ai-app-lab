import csv
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parents[1]
SKILL_DIR = PROJECT_DIR / "skills" / "standardize-chemical-structures"
PROCESSOR_PATH = SKILL_DIR / "scripts" / "standardize_structures.py"
VALIDATOR_PATH = SKILL_DIR / "scripts" / "validate_output.py"


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


PROCESSOR = load_module("standardize_structures", PROCESSOR_PATH)
VALIDATOR = load_module("validate_standardize_output", VALIDATOR_PATH)


def record(record_id, structure, input_format="smiles", index=0):
    return {
        "id": record_id,
        "original_structure": structure,
        "input_format": input_format,
        "source": "unit-test",
        "record_index": index,
    }


class StandardizeChemicalStructuresTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.toolkit = PROCESSOR.load_toolkit()
        cls.Chem = cls.toolkit["Chem"]

    def process(self, records, profile="chembl-pipeline"):
        return PROCESSOR.process_records(
            [
                record(
                    item[0],
                    item[1],
                    item[2] if len(item) > 2 else "smiles",
                    index,
                )
                for index, item in enumerate(records)
            ],
            profile,
            provenance=[{"source": "unit-test", "input_format": "mixed"}],
            generated_at_utc="2026-08-06T00:00:00+00:00",
        )

    def test_normal_examples_and_local_synthetic_structure(self):
        document = self.process(
            [
                ("aspirin", "CC(=O)Oc1ccccc1C(=O)O"),
                ("aspirin-sodium", "[Na+].CC(=O)Oc1ccccc1C(=O)[O-]"),
                ("caffeine", "Cn1cnc2c1c(=O)n(C)c(=O)n2C"),
                ("ethanol", "CCO"),
                (
                    "local-synthetic",
                    "C[C@H](F)C(=O)N[C@@H](C#N)c1ccc(Br)cc1",
                ),
            ]
        )
        self.assertEqual(document["input_summary"]["total_records"], 5)
        by_id = {item["id"]: item for item in document["records"]}
        for name in ("aspirin", "caffeine", "ethanol", "local-synthetic"):
            self.assertEqual(by_id[name]["disposition"], "ready_for_downstream", name)
            self.assertIsNotNone(by_id[name]["standardized_structure"])
            self.assertIsNotNone(by_id[name]["inchikey"])
        self.assertEqual(
            by_id["aspirin-sodium"]["parent_inchikey"],
            by_id["aspirin"]["parent_inchikey"],
        )
        self.assertEqual(
            by_id["aspirin-sodium"]["original_structure"],
            "[Na+].CC(=O)Oc1ccccc1C(=O)[O-]",
        )
        self.assertEqual(by_id["aspirin-sodium"]["disposition"], "review_required")

    def test_invalid_and_empty_structures_are_retained(self):
        document = self.process(
            [
                ("bad-valence", "CO(C)C"),
                ("empty", ""),
                ("illegal", "not-a-smiles"),
            ]
        )
        self.assertEqual(len(document["records"]), 3)
        self.assertEqual(document["input_summary"]["rejected"], 3)
        for item in document["records"]:
            self.assertEqual(item["parse_status"], "error")
            self.assertEqual(item["disposition"], "rejected")
            self.assertIsNone(item["standardized_structure"])
            self.assertIsNone(item["parent_structure"])
            self.assertIsNone(item["inchikey"])
            self.assertEqual(
                item["original_structure"],
                {
                    "bad-valence": "CO(C)C",
                    "empty": "",
                    "illegal": "not-a-smiles",
                }[item["id"]],
            )

    def test_empty_batch_and_empty_file_fail_closed(self):
        with self.assertRaisesRegex(PROCESSOR.InputFailure, "没有可处理的结构记录"):
            PROCESSOR.process_records(
                [],
                "chembl-pipeline",
                generated_at_utc="2026-08-06T00:00:00+00:00",
            )

        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            input_path = root / "empty.smi"
            output_path = root / "result.json"
            input_path.touch()
            completed = subprocess.run(
                [
                    str(Path(__import__("sys").executable)),
                    str(PROCESSOR_PATH),
                    "--input",
                    str(input_path),
                    "--profile",
                    "chembl-pipeline",
                    "--output",
                    str(output_path),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(completed.returncode, 3, completed.stderr)
            self.assertIn("没有可处理的结构记录", completed.stderr)
            self.assertFalse(output_path.exists())

    def test_unknown_stereo_requires_human_review(self):
        document = self.process([("unknown-stereo", "CC(F)Cl")])
        item = document["records"][0]
        self.assertEqual(item["parse_status"], "success")
        self.assertEqual(item["disposition"], "review_required")
        self.assertIn("R-UNSPECIFIED-STEREO", item["human_review_required"])
        self.assertNotIn("@", item["standardized_structure"])

    def test_multicomponent_salt_gets_derived_parent(self):
        document = self.process(
            [
                ("aspirin", "CC(=O)Oc1ccccc1C(=O)O"),
                ("aspirin-sodium", "[Na+].CC(=O)Oc1ccccc1C(=O)[O-]"),
            ]
        )
        sodium = document["records"][1]
        self.assertEqual(
            sodium["fragment_analysis"]["classification"], "salt_or_solvate"
        )
        self.assertIsNotNone(sodium["parent_structure"])
        parent_group = next(
            item for item in document["duplicate_groups"] if item["basis"] == "parent"
        )
        self.assertEqual(parent_group["record_ids"], ["aspirin", "aspirin-sodium"])
        self.assertEqual(
            parent_group["relationship"],
            "same_derived_parent_not_same_physical_sample",
        )

    def test_true_mixture_is_not_collapsed_to_single_parent(self):
        document = self.process([("mixture", "CCO.CN")])
        item = document["records"][0]
        self.assertEqual(
            item["fragment_analysis"]["classification"], "mixture_or_complex"
        )
        self.assertIsNone(item["parent_structure"])
        self.assertIsNone(item["parent_inchikey"])
        self.assertEqual(item["disposition"], "review_required")
        self.assertIn("R-MULTICOMPONENT-MIXTURE", item["human_review_required"])

    def test_metal_complex_and_isotope_require_review(self):
        document = self.process(
            [
                ("metal", "[Cu+2]([NH3])([NH3])([NH3])[NH3]"),
                ("isotope", "[13CH3]CO"),
            ]
        )
        by_id = {item["id"]: item for item in document["records"]}
        self.assertIn("R-METAL-PRESENT", by_id["metal"]["human_review_required"])
        self.assertIn("R-ISOTOPE-PRESENT", by_id["isotope"]["human_review_required"])
        self.assertEqual(by_id["metal"]["disposition"], "review_required")
        self.assertEqual(by_id["isotope"]["disposition"], "review_required")

    def test_chembl_exclusion_flag_requires_human_review(self):
        document = self.process([("eight-boron-ring", "B1BBBBBBB1")])
        item = document["records"][0]
        exclusion = next(
            transformation
            for transformation in item["transformations"]
            if transformation["step"] == "chembl_get_parent"
        )
        self.assertTrue(exclusion["exclusion_flag"])
        self.assertEqual(item["disposition"], "review_required")
        self.assertIn("R-CHEMBL-EXCLUDED", item["human_review_required"])
        self.assertTrue(VALIDATOR.validate(document)["valid"])

    def test_v3000_molblock_requires_review(self):
        mol = self.Chem.MolFromSmiles("CCO")
        molblock = self.Chem.MolToV3KMolBlock(mol)
        document = self.process([("v3000", molblock, "molblock")])
        item = document["records"][0]
        self.assertEqual(item["parse_status"], "success")
        self.assertIn("R-V3000-MOLBLOCK", item["human_review_required"])
        self.assertEqual(item["disposition"], "review_required")

    def test_polymer_marker_suppresses_parent(self):
        mol = self.Chem.MolFromSmiles("CCO")
        molblock = self.Chem.MolToMolBlock(mol)
        molblock = molblock.replace("M  END", "M  STY  1   1 SRU\nM  END")
        document = self.process([("polymer", molblock, "molblock")])
        item = document["records"][0]
        self.assertIn("R-POLYMER-MOLBLOCK", item["human_review_required"])
        self.assertIsNone(item["parent_structure"])
        self.assertEqual(item["disposition"], "review_required")

    def test_three_duplicate_bases_are_separate(self):
        document = self.process(
            [
                ("ethanol-a", "CCO"),
                ("ethanol-b", "CCO"),
                ("aspirin", "CC(=O)Oc1ccccc1C(=O)O"),
                ("aspirin-sodium", "[Na+].CC(=O)Oc1ccccc1C(=O)[O-]"),
            ]
        )
        groups = document["duplicate_groups"]
        bases = {item["basis"] for item in groups}
        self.assertIn("original", bases)
        self.assertIn("standardized", bases)
        self.assertIn("parent", bases)
        original = next(item for item in groups if item["basis"] == "original")
        self.assertEqual(original["record_ids"], ["ethanol-a", "ethanol-b"])

    def test_disposition_counts_conserve_all_inputs(self):
        document = self.process(
            [
                ("ready", "CCO"),
                ("review", "CC(F)Cl"),
                ("rejected", "CO(C)C"),
            ]
        )
        summary = document["input_summary"]
        self.assertEqual(
            summary["total_records"],
            summary["ready_for_downstream"]
            + summary["review_required"]
            + summary["rejected"],
        )

    def test_profiles_are_explicit_and_not_chained(self):
        chembl = self.process([("aspirin", "CC(=O)Oc1ccccc1C(=O)O")])
        rdkit = self.process(
            [("aspirin", "CC(=O)Oc1ccccc1C(=O)O")],
            profile="rdkit-basic",
        )
        self.assertEqual(
            chembl["tool_versions"]["used_tools"],
            ["rdkit", "chembl_structure_pipeline"],
        )
        self.assertEqual(rdkit["tool_versions"]["used_tools"], ["rdkit"])
        self.assertEqual(
            chembl["records"][0]["transformations"][0]["step"],
            "chembl_standardizer",
        )
        self.assertEqual(
            rdkit["records"][0]["transformations"][0]["step"],
            "rdkit_cleanup",
        )

    def test_same_input_profile_and_versions_are_deterministic(self):
        records = [("aspirin", "CC(=O)Oc1ccccc1C(=O)O"), ("ethanol", "CCO")]
        first = self.process(records)
        second = self.process(records)
        self.assertEqual(first, second)
        self.assertEqual(first["result_fingerprint"], second["result_fingerprint"])

    def test_output_contract_and_forbidden_claims(self):
        document = self.process(
            [
                ("ready", "CCO"),
                ("review", "CC(F)Cl"),
                ("rejected", "CO(C)C"),
            ]
        )
        report = VALIDATOR.validate(document)
        self.assertTrue(report["valid"], report)
        serialized = json.dumps(document, ensure_ascii=False)
        for phrase in (
            "结构已确证",
            "药效已确认",
            "安全性已确认",
            "可合成性已确认",
        ):
            self.assertNotIn(phrase, serialized)

    def test_standardization_output_contract_matches_validator(self):
        contract = load_module(
            "standardization_output_contract_test",
            SKILL_DIR / "scripts" / "standardization_output_contract.py",
        )
        document = self.process([("ethanol", "CCO")])

        errors, warnings = contract.validate_document(document)
        report = VALIDATOR.validate(document)

        self.assertEqual(errors, report["errors"])
        self.assertEqual(warnings, report["warnings"])

    def test_validator_rejects_rehashed_record_index_mismatch(self):
        for invalid_index in (9, True, 1.5, "0"):
            with self.subTest(record_index=invalid_index):
                document = self.process([("ethanol", "CCO")])
                document["records"][0]["record_index"] = invalid_index
                document["result_fingerprint"] = PROCESSOR.output_fingerprint(document)

                report = VALIDATOR.validate(document)

                self.assertFalse(report["valid"])
                self.assertTrue(
                    any("records[0].record_index" in item for item in report["errors"]),
                    report,
                )

    def test_validator_rejects_missing_record_index_without_crashing(self):
        document = self.process([("ethanol", "CCO")])
        document["records"][0].pop("record_index")
        document["result_fingerprint"] = PROCESSOR.output_fingerprint(document)

        report = VALIDATOR.validate(document)

        self.assertFalse(report["valid"])
        self.assertTrue(
            any("record_index" in item for item in report["errors"]),
            report,
        )

    def test_validator_rejects_rehashed_boolean_duplicate_index(self):
        document = self.process(
            [
                ("ethanol-a", "CCO"),
                ("ethanol-b", "CCO"),
            ]
        )
        self.assertTrue(document["duplicate_groups"])
        document["duplicate_groups"][0]["record_indices"][0] = False
        document["result_fingerprint"] = PROCESSOR.output_fingerprint(document)

        report = VALIDATOR.validate(document)

        self.assertFalse(report["valid"])
        self.assertTrue(
            any("record_indices" in item for item in report["errors"]),
            report,
        )

    def test_validator_rejects_secret_and_lost_failure_record(self):
        document = self.process([("rejected", "CO(C)C")])
        document["notices"].append("ark-" + "A" * 24)
        report = VALIDATOR.validate(document)
        self.assertFalse(report["valid"])
        self.assertIn("possible secret detected in output", report["errors"])

        document = self.process([("rejected", "CO(C)C")])
        document["records"] = []
        report = VALIDATOR.validate(document)
        self.assertFalse(report["valid"])
        self.assertTrue(
            any("total_records" in item for item in report["errors"]),
            report,
        )

    def test_csv_smiles_sdf_and_molblock_input_adapters(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            csv_path = root / "records.csv"
            csv_path.write_text(
                "id,structure,source\naspirin,CC(=O)Oc1ccccc1C(=O)O,fixture\n",
                encoding="utf-8",
            )
            csv_records, csv_provenance = PROCESSOR.read_input_records(
                csv_path, "auto", "structure", "id", [], []
            )
            self.assertEqual(csv_records[0]["id"], "aspirin")
            self.assertEqual(
                csv_records[0]["original_structure"], "CC(=O)Oc1ccccc1C(=O)O"
            )
            self.assertEqual(csv_provenance[0]["source"], "records.csv")
            self.assertFalse(Path(csv_provenance[0]["source"]).is_absolute())

            smi_path = root / "records.smi"
            smi_path.write_text("CCO ethanol\nCC caffeine-fragment\n", encoding="utf-8")
            smi_records, _ = PROCESSOR.read_input_records(
                smi_path, "auto", "structure", "id", [], []
            )
            self.assertEqual(
                [item["id"] for item in smi_records], ["ethanol", "caffeine-fragment"]
            )

            ethanol = self.Chem.MolFromSmiles("CCO")
            caffeine = self.Chem.MolFromSmiles("Cn1cnc2c1c(=O)n(C)c(=O)n2C")
            sdf_path = root / "records.sdf"
            sdf_path.write_text(
                self.Chem.MolToMolBlock(ethanol).replace("\n", "\n", 1)
                + "$$$$\n"
                + self.Chem.MolToMolBlock(caffeine)
                + "$$$$\n",
                encoding="utf-8",
            )
            sdf_records, _ = PROCESSOR.read_input_records(
                sdf_path, "auto", "structure", "id", [], []
            )
            self.assertEqual(len(sdf_records), 2)
            self.assertTrue(all(item["input_format"] == "sdf" for item in sdf_records))

            mol_path = root / "ethanol.mol"
            molblock = self.Chem.MolToMolBlock(ethanol)
            mol_path.write_text(molblock, encoding="utf-8")
            mol_records, _ = PROCESSOR.read_input_records(
                mol_path, "auto", "structure", "id", [], []
            )
            self.assertEqual(len(mol_records), 1)
            self.assertEqual(mol_records[0]["original_structure"], molblock)

    def test_file_location_does_not_change_result_fingerprint(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            paths = [root / "first" / "records.smi", root / "second" / "records.smi"]
            documents = []
            for path in paths:
                path.parent.mkdir()
                path.write_text("CCO ethanol\n", encoding="utf-8")
                records, provenance = PROCESSOR.read_input_records(
                    path, "auto", "structure", "id", [], []
                )
                documents.append(
                    PROCESSOR.process_records(
                        records,
                        "chembl-pipeline",
                        provenance=provenance,
                        generated_at_utc="2026-08-06T00:00:00+00:00",
                    )
                )
            self.assertEqual(
                documents[0]["result_fingerprint"],
                documents[1]["result_fingerprint"],
            )
            self.assertEqual(
                documents[0]["provenance"],
                [{"source": "records.smi", "input_format": "smiles"}],
            )

    def test_cli_writes_json_and_csv_and_returns_two_for_rejected(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            input_path = root / "records.csv"
            output_path = root / "result.json"
            csv_path = root / "result.csv"
            input_path.write_text(
                "id,structure\nethanol,CCO\nbad,CO(C)C\n",
                encoding="utf-8",
            )
            completed = subprocess.run(
                [
                    str(Path(__import__("sys").executable)),
                    str(PROCESSOR_PATH),
                    "--input",
                    str(input_path),
                    "--profile",
                    "chembl-pipeline",
                    "--generated-at",
                    "2026-08-06T00:00:00+00:00",
                    "--output",
                    str(output_path),
                    "--csv-summary",
                    str(csv_path),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(completed.returncode, 2, completed.stderr)
            self.assertTrue(output_path.exists())
            self.assertTrue(csv_path.exists())
            document = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertTrue(VALIDATOR.validate(document)["valid"])
            with csv_path.open(encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(len(rows), 2)
            self.assertEqual(rows[1]["disposition"], "rejected")


if __name__ == "__main__":
    unittest.main()
