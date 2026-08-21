from __future__ import annotations

import csv
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
RUNNER = REPOSITORY_ROOT / "examples" / "aspirin-seven-skill-e2e" / "run_case.py"


def load_runner_module():
    spec = importlib.util.spec_from_file_location(
        "aspirin_seven_skill_runner",
        RUNNER,
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


RUNNER_MODULE = load_runner_module()


class AspirinSevenSkillE2ETests(unittest.TestCase):
    def _identity_with_handoff(self, status, records):
        return {
            "resolutions": [
                {
                    "standardization_handoff": {
                        "status": status,
                        "records": records,
                    }
                }
            ]
        }

    def test_structure_adapter_uses_handoff_record_not_candidate(self):
        identity = {
            "resolutions": [
                {
                    "candidates": [{"canonical_smiles": "WRONG"}],
                    "standardization_handoff": {
                        "status": "ready",
                        "records": [
                            {
                                "id": "query-1",
                                "structure": "CC(=O)Oc1ccccc1C(=O)O",
                                "source_candidate_id": "candidate-001",
                                "source_inchikey": ("BSYNRYMUTXBXSQ-UHFFFAOYSA-N"),
                            }
                        ],
                    },
                }
            ]
        }
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "structures.csv"
            RUNNER_MODULE.build_structure_csv(
                {"additional_structures": []},
                identity,
                output,
            )
            with output.open(encoding="utf-8", newline="") as handle:
                rows = list(csv.DictReader(handle))
        self.assertEqual(
            rows,
            [
                {
                    "id": "query-1",
                    "structure": "CC(=O)Oc1ccccc1C(=O)O",
                    "source": ("resolve-chemical-identities:query-1:candidate-001"),
                }
            ],
        )

    def test_structure_adapter_rejects_blocked_handoff(self):
        record = {
            "id": "query-1",
            "structure": "CCO",
            "source_candidate_id": "candidate-001",
            "source_inchikey": "LFQSCWFLJHTTHZ-UHFFFAOYSA-N",
        }
        identity = self._identity_with_handoff(
            "blocked_pending_resolution",
            [record],
        )
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "structures.csv"
            with self.assertRaisesRegex(
                RUNNER_MODULE.CaseFailure,
                "identity handoff is not ready",
            ):
                RUNNER_MODULE.build_structure_csv(
                    {"additional_structures": []},
                    identity,
                    output,
                )

    def test_structure_adapter_rejects_zero_records(self):
        identity = self._identity_with_handoff("ready", [])
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "structures.csv"
            with self.assertRaisesRegex(
                RUNNER_MODULE.CaseFailure,
                "exactly one record",
            ):
                RUNNER_MODULE.build_structure_csv(
                    {"additional_structures": []},
                    identity,
                    output,
                )

    def test_structure_adapter_rejects_multiple_records(self):
        record = {
            "id": "query-1",
            "structure": "CCO",
            "source_candidate_id": "candidate-001",
            "source_inchikey": "LFQSCWFLJHTTHZ-UHFFFAOYSA-N",
        }
        identity = self._identity_with_handoff(
            "ready",
            [record, dict(record)],
        )
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "structures.csv"
            with self.assertRaisesRegex(
                RUNNER_MODULE.CaseFailure,
                "exactly one record",
            ):
                RUNNER_MODULE.build_structure_csv(
                    {"additional_structures": []},
                    identity,
                    output,
                )

    def test_offline_case_passes_all_handoffs_and_repeatability_checks(self):
        with tempfile.TemporaryDirectory() as directory:
            output_dir = Path(directory) / "acceptance"
            completed = subprocess.run(
                [
                    sys.executable,
                    str(RUNNER),
                    "--output-dir",
                    str(output_dir),
                ],
                cwd=REPOSITORY_ROOT,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            report = json.loads(
                (output_dir / "gold_report.json").read_text(encoding="utf-8")
            )
            self.assertEqual(report["status"], "passed")
            self.assertEqual(len(report["executed_skills"]), 7)
            self.assertEqual(report["run_count"], 2)
            self.assertEqual(report["validators_passed_per_run"], 8)
            self.assertTrue(report["repeatability"]["passed"])
            self.assertTrue(all(report["repeatability"]["by_skill"].values()))
            self.assertFalse(report["network"]["used"])
            self.assertFalse(any(report["fees"].values()))


if __name__ == "__main__":
    unittest.main()
