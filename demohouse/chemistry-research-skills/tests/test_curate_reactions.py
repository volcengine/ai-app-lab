from __future__ import annotations

import copy
import csv
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

IMPLEMENTATION_ROOT = Path(__file__).resolve().parents[1]
SKILL_ROOT = IMPLEMENTATION_ROOT / "skills" / "curate-reactions"
SCRIPTS_ROOT = SKILL_ROOT / "scripts"
CORE_PATH = SCRIPTS_ROOT / "curate_reactions.py"
VALIDATOR_PATH = SCRIPTS_ROOT / "validate_output.py"
STANDARDIZER_PATH = (
    IMPLEMENTATION_ROOT
    / "skills"
    / "standardize-chemical-structures"
    / "scripts"
    / "standardize_structures.py"
)


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


CORE = load_module("curate_reactions", CORE_PATH)
VALIDATOR = load_module("curate_reactions_validator", VALIDATOR_PATH)
STANDARDIZER = load_module(
    "curate_reactions_standardizer_fixture",
    STANDARDIZER_PATH,
)


def base_request(records=None):
    return {
        "schema_version": "1.0.0",
        "workflow": "curate-reactions",
        "input_profile": "reaction_smiles",
        "source": {
            "identifier": "engineering-gold-candidate",
            "content_sha256": "a" * 64,
            "license": "test-only",
        },
        "options": {
            "participant_view": "reported_form",
            "atom_mapping": "off",
            "balance_check": "diagnostic",
        },
        "upstream_artifacts": [],
        "records": records
        or [
            {
                "record_id": "r1",
                "reaction_smiles": "CCO>>COC",
                "stoichiometry_complete": True,
            }
        ],
    }


def make_upstream(records):
    return STANDARDIZER.process_records(
        [
            {
                "id": record["id"],
                "record_index": index,
                "source": "curate-reactions-test",
                "input_format": "smiles",
                "original_structure": record["original_structure"],
            }
            for index, record in enumerate(records)
        ],
        "chembl-pipeline",
        generated_at_utc="2026-08-10T00:00:00Z",
    )


def explicit_record(
    record_id,
    reaction_smiles,
    participants,
    **extra,
):
    return {
        "record_id": record_id,
        "reaction_smiles": reaction_smiles,
        "participants": participants,
        "stoichiometry_complete": True,
        **extra,
    }


def case(case_id, source_class, request, disposition, codes=(), top_codes=()):
    return {
        "case_id": case_id,
        "source_class": source_class,
        "request": request,
        "expected_disposition": disposition,
        "expected_codes": set(codes),
        "expected_top_codes": set(top_codes),
    }


def build_gold_cases():
    cases = []
    real = "evidence_derived_public_boundary"
    mutation = "controlled_mutation"

    cases.append(case("ord_like_balanced", real, base_request(), "ready_for_search"))
    cases.append(
        case(
            "az_analysis_unlinked",
            real,
            base_request(
                [
                    {
                        "record_id": "az-analysis",
                        "reaction_smiles": "CCO>>COC",
                        "stoichiometry_complete": True,
                        "yields": [
                            {
                                "value": 65.39,
                                "units": "PERCENT",
                                "analysis_required": True,
                            }
                        ],
                    }
                ]
            ),
            "review_required",
            {"W-ANALYSIS-LINK-001"},
        )
    )
    cases.append(
        case(
            "az_yield_100_28",
            real,
            base_request(
                [
                    {
                        "record_id": "az-over-100-a",
                        "reaction_smiles": "CCO>>COC",
                        "stoichiometry_complete": True,
                        "yield_percent": 100.28,
                    }
                ]
            ),
            "review_required",
            {"W-YIELD-RANGE-001"},
        )
    )
    cases.append(
        case(
            "az_yield_102_97",
            real,
            base_request(
                [
                    {
                        "record_id": "az-over-100-b",
                        "reaction_smiles": "CCO>>COC",
                        "stoichiometry_complete": True,
                        "yield_percent": 102.97,
                    }
                ]
            ),
            "review_required",
            {"W-YIELD-RANGE-001"},
        )
    )
    cases.append(
        case(
            "az_yield_fraction",
            real,
            base_request(
                [
                    {
                        "record_id": "az-fraction",
                        "reaction_smiles": "CCO>>COC",
                        "stoichiometry_complete": True,
                        "yield_percent": 0.5,
                    }
                ]
            ),
            "review_required",
            {"W-YIELD-FRACTION-001"},
        )
    )
    duplicate_request = base_request(
        [
            {
                "record_id": "az-dup-a",
                "reaction_smiles": "CCO>>COC",
                "stoichiometry_complete": True,
            },
            {
                "record_id": "az-dup-b",
                "reaction_smiles": "CCO>>COC",
                "stoichiometry_complete": True,
            },
        ]
    )
    cases.append(
        case(
            "az_exact_duplicate",
            real,
            duplicate_request,
            "review_required",
            {"W-DUPLICATE-EXACT-001", "W-DUPLICATE-TRANSFORMATION-001"},
        )
    )
    cases.append(
        case(
            "organic_syntheses_complete_process",
            real,
            base_request(
                [
                    {
                        "record_id": "orgsyn-complete",
                        "reaction_smiles": "CCO>>COC",
                        "stoichiometry_complete": True,
                        "process": {
                            "required": True,
                            "conditions": {"temperature_c": 60},
                            "setup": {"vessel": "round-bottom flask"},
                            "observations": [{"type": "TLC"}],
                            "workups": [{"type": "extraction"}],
                        },
                        "yield_percent": 60,
                    }
                ]
            ),
            "ready_for_search",
        )
    )
    cases.append(
        case(
            "organic_syntheses_missing_process",
            real,
            base_request(
                [
                    {
                        "record_id": "orgsyn-missing",
                        "reaction_smiles": "CCO>>COC",
                        "stoichiometry_complete": True,
                        "process": {"required": True, "conditions": {}},
                    }
                ]
            ),
            "review_required",
            {"W-PROCESS-MISSING-001"},
        )
    )
    cases.append(
        case(
            "reported_failed_reaction",
            real,
            base_request(
                [
                    {
                        "record_id": "reported-failure",
                        "reaction_smiles": "CCO>>COC",
                        "stoichiometry_complete": True,
                        "yield_percent": 0,
                    }
                ]
            ),
            "ready_for_search",
        )
    )
    cases.append(
        case(
            "reported_low_yield",
            real,
            base_request(
                [
                    {
                        "record_id": "reported-low-yield",
                        "reaction_smiles": "CCO>>COC",
                        "stoichiometry_complete": True,
                        "yield_percent": 3.2,
                    }
                ]
            ),
            "ready_for_search",
        )
    )
    cases.append(
        case(
            "ord_no_change_boundary",
            real,
            base_request(
                [
                    {
                        "record_id": "no-change",
                        "reaction_smiles": "CCO>>CCO",
                        "stoichiometry_complete": True,
                    }
                ]
            ),
            "review_required",
            {"W-REACTION-NO-CHANGE-001"},
        )
    )
    cases.append(
        case(
            "ord_unbalanced_boundary",
            real,
            base_request(
                [
                    {
                        "record_id": "unbalanced-real",
                        "reaction_smiles": "CC>>CO",
                        "stoichiometry_complete": True,
                    }
                ]
            ),
            "review_required",
            {"W-BALANCE-ATOM-001"},
        )
    )

    cases.append(
        case(
            "invalid_reaction_smiles",
            mutation,
            base_request([{"record_id": "bad-rsmi", "reaction_smiles": "invalid"}]),
            "rejected",
            {"E-REACTION-SMILES-001", "E-REACTION-SIDES-001"},
        )
    )
    cases.append(
        case(
            "missing_reactant_side",
            mutation,
            base_request([{"record_id": "missing-left", "reaction_smiles": ">>CCO"}]),
            "rejected",
            {"E-REACTION-SMILES-001", "E-REACTION-SIDES-001"},
        )
    )
    cases.append(
        case(
            "missing_product_side",
            mutation,
            base_request([{"record_id": "missing-right", "reaction_smiles": "CCO>>"}]),
            "rejected",
            {"E-REACTION-SMILES-001", "E-REACTION-SIDES-001"},
        )
    )
    cases.append(
        case(
            "invalid_participant_structure",
            mutation,
            base_request(
                [
                    explicit_record(
                        "bad-participant",
                        "CCO>>COC",
                        [
                            {
                                "participant_id": "p1",
                                "side": "input",
                                "reported_role": "reactant",
                                "original_structure": "not-a-smiles",
                            },
                            {
                                "participant_id": "p2",
                                "side": "output",
                                "reported_role": "product",
                                "original_structure": "COC",
                            },
                        ],
                    )
                ]
            ),
            "review_required",
            {"W-PARTICIPANT-STRUCTURE-001"},
        )
    )
    cases.append(
        case(
            "unknown_role",
            mutation,
            base_request(
                [
                    explicit_record(
                        "unknown-role",
                        "CCO>>COC",
                        [
                            {
                                "participant_id": "p1",
                                "side": "input",
                                "reported_role": "unknown",
                                "original_structure": "CCO",
                            },
                            {
                                "participant_id": "p2",
                                "side": "output",
                                "reported_role": "product",
                                "original_structure": "COC",
                            },
                        ],
                    )
                ]
            ),
            "review_required",
            {"W-ROLE-UNKNOWN-001"},
        )
    )
    cases.append(
        case(
            "role_conflict",
            mutation,
            base_request(
                [
                    explicit_record(
                        "role-conflict",
                        "CCO>>COC",
                        [
                            {
                                "participant_id": "p1",
                                "side": "input",
                                "reported_role": "product",
                                "original_structure": "CCO",
                            },
                            {
                                "participant_id": "p2",
                                "side": "output",
                                "reported_role": "reactant",
                                "original_structure": "COC",
                            },
                        ],
                    )
                ]
            ),
            "review_required",
            {"W-ROLE-CONFLICT-001"},
        )
    )
    cases.append(
        case(
            "conflicting_yields",
            mutation,
            base_request(
                [
                    {
                        "record_id": "yield-conflict",
                        "reaction_smiles": "CCO>>COC",
                        "stoichiometry_complete": True,
                        "yields": [
                            {"value": 40, "product_id": "p1"},
                            {"value": 55, "product_id": "p1"},
                        ],
                    }
                ]
            ),
            "review_required",
            {"W-YIELD-CONFLICT-001"},
        )
    )
    cases.append(
        case(
            "atom_and_charge_imbalance",
            mutation,
            base_request(
                [
                    {
                        "record_id": "charge-delta",
                        "reaction_smiles": "[NH4+]>>N",
                        "stoichiometry_complete": True,
                    }
                ]
            ),
            "review_required",
            {"W-BALANCE-ATOM-001", "W-BALANCE-CHARGE-001"},
        )
    )
    cases.append(
        case(
            "balance_incomplete",
            mutation,
            base_request(
                [{"record_id": "balance-assumption", "reaction_smiles": "CCO>>COC"}]
            ),
            "review_required",
            {"H-BALANCE-INCOMPLETE-001"},
        )
    )
    cases.append(
        case(
            "transformation_duplicate_different_yield",
            mutation,
            base_request(
                [
                    {
                        "record_id": "tx-a",
                        "reaction_smiles": "CCO>>COC",
                        "stoichiometry_complete": True,
                        "yield_percent": 30,
                    },
                    {
                        "record_id": "tx-b",
                        "reaction_smiles": "CCO>>COC",
                        "stoichiometry_complete": True,
                        "yield_percent": 70,
                    },
                ]
            ),
            "review_required",
            {"W-DUPLICATE-TRANSFORMATION-001"},
        )
    )
    upstream_review = make_upstream(
        [
            {
                "id": "u1",
                "original_structure": "CC(F)Cl",
                "standardized_structure": "CC(F)Cl",
                "parent_structure": "CC(F)Cl",
                "disposition": "review_required",
                "human_review_required": ["R-UNKNOWN-STEREO"],
            }
        ]
    )
    request = base_request(
        [
            explicit_record(
                "upstream-review",
                "CCO>>COC",
                [
                    {
                        "participant_id": "p1",
                        "side": "input",
                        "reported_role": "reactant",
                        "upstream_record_id": "u1",
                    },
                    {
                        "participant_id": "p2",
                        "side": "output",
                        "reported_role": "product",
                        "original_structure": "COC",
                    },
                ],
            )
        ]
    )
    request["upstream_artifacts"] = [upstream_review]
    cases.append(
        case(
            "upstream_review_propagation",
            mutation,
            request,
            "review_required",
            {"H-UPSTREAM-REVIEW-001"},
        )
    )
    upstream_rejected = make_upstream(
        [
            {
                "id": "u2",
                "original_structure": "bad",
                "standardized_structure": None,
                "parent_structure": None,
                "disposition": "rejected",
                "human_review_required": [],
            }
        ]
    )
    request = base_request(
        [
            explicit_record(
                "upstream-rejected",
                "CCO>>COC",
                [
                    {
                        "participant_id": "p1",
                        "side": "input",
                        "reported_role": "reactant",
                        "upstream_record_id": "u2",
                    },
                    {
                        "participant_id": "p2",
                        "side": "output",
                        "reported_role": "product",
                        "original_structure": "COC",
                    },
                ],
            )
        ]
    )
    request["upstream_artifacts"] = [upstream_rejected]
    cases.append(
        case(
            "upstream_rejected_propagation",
            mutation,
            request,
            "rejected",
            {"E-UPSTREAM-REJECTED-001"},
        )
    )
    cases.append(
        case(
            "salt_counterion_preserved",
            mutation,
            base_request(
                [
                    {
                        "record_id": "sodium-acetate",
                        "reaction_smiles": "CC(=O)[O-].[Na+]>>CC(=O)O",
                        "stoichiometry_complete": True,
                    }
                ]
            ),
            "review_required",
            {"W-BALANCE-ATOM-001"},
        )
    )
    cases.append(
        case(
            "isotope_preserved",
            mutation,
            base_request(
                [
                    {
                        "record_id": "isotope",
                        "reaction_smiles": "[13CH3]O>>[13CH3]O",
                        "stoichiometry_complete": True,
                    }
                ]
            ),
            "review_required",
            {"W-REACTION-NO-CHANGE-001"},
        )
    )
    cases.append(
        case(
            "duplicate_record_ids",
            mutation,
            base_request(
                [
                    {
                        "record_id": "same-id",
                        "reaction_smiles": "CCO>>COC",
                        "stoichiometry_complete": True,
                    },
                    {
                        "record_id": "same-id",
                        "reaction_smiles": "CCO>>COC",
                        "stoichiometry_complete": True,
                    },
                ]
            ),
            "ready_for_search",
            set(),
            {"E-RECORD-ID-001"},
        )
    )
    bad_fingerprint = make_upstream(
        [
            {
                "id": "u3",
                "original_structure": "CCO",
                "standardized_structure": "CCO",
                "parent_structure": "CCO",
                "disposition": "ready_for_downstream",
                "human_review_required": [],
            }
        ]
    )
    bad_fingerprint["result_fingerprint"] = "0" * 64
    request = base_request()
    request["upstream_artifacts"] = [bad_fingerprint]
    cases.append(
        case(
            "upstream_fingerprint_tamper",
            mutation,
            request,
            "rejected",
            {"E-UPSTREAM-FINGERPRINT-001"},
            {"E-UPSTREAM-FINGERPRINT-001"},
        )
    )
    request = base_request()
    request["source"]["content_sha256"] = None
    cases.append(
        case(
            "missing_source_hash",
            mutation,
            request,
            "rejected",
            {"E-INPUT-HASH-001"},
            {"E-INPUT-HASH-001"},
        )
    )
    request = base_request()
    request["options"]["atom_mapping"] = "rxnmapper"
    cases.append(
        case(
            "unsupported_mapping_option",
            mutation,
            request,
            "rejected",
            {"E-INPUT-SCHEMA-001"},
            {"E-INPUT-SCHEMA-001"},
        )
    )
    assert len(cases) == 30
    assert sum(item["source_class"] == real for item in cases) == 12
    return cases


GOLD_CASES = build_gold_cases()


class CurateReactionsContractTest(unittest.TestCase):
    def test_01_gold_inventory_is_12_real_plus_18_mutations(self):
        self.assertEqual(len(GOLD_CASES), 30)
        self.assertEqual(
            sum(
                case["source_class"] == "evidence_derived_public_boundary"
                for case in GOLD_CASES
            ),
            12,
        )

    def test_reaction_assessment_module_matches_facade(self):
        module = load_module(
            "reaction_assessment_test",
            SCRIPTS_ROOT / "reaction_assessment.py",
        )
        raw = base_request()["records"][0]
        toolkit = CORE.load_toolkit()

        expected = CORE.assess_record(raw, {}, toolkit)
        actual = module.assess_record(
            raw,
            {},
            toolkit,
            CORE.finding,
            CORE.assess_participant,
            CORE.parse_ord_record,
            CORE.extract_ord_yields,
            CORE.canonicalize_smiles,
        )

        self.assertEqual(actual, expected)

    def test_02_same_input_is_deterministic_excluding_time(self):
        request = base_request()
        one = CORE.process_request(request, generated_at_utc="2026-01-01T00:00:00Z")
        two = CORE.process_request(request, generated_at_utc="2026-02-01T00:00:00Z")
        self.assertEqual(one["result_fingerprint"], two["result_fingerprint"])

    def test_03_result_fingerprint_detects_tampering(self):
        result = CORE.process_request(base_request())
        result["records"][0]["disposition"] = "rejected"
        self.assertIn("result_fingerprint 不匹配", VALIDATOR.validate_output(result))

    def test_04_validator_rejects_forbidden_approval_field(self):
        result = CORE.process_request(base_request())
        result["records"][0]["safe_to_execute"] = True
        self.assertTrue(
            any("禁止字段" in error for error in VALIDATOR.validate_output(result))
        )

    def test_05_valid_upstream_artifact_is_consumed(self):
        artifact = make_upstream(
            [
                {
                    "id": "u",
                    "original_structure": "CCO",
                    "standardized_structure": "CCO",
                    "parent_structure": "CCO",
                    "disposition": "ready_for_downstream",
                    "human_review_required": [],
                }
            ]
        )
        request = base_request(
            [
                explicit_record(
                    "linked",
                    "CCO>>COC",
                    [
                        {
                            "participant_id": "p1",
                            "side": "input",
                            "reported_role": "reactant",
                            "upstream_record_id": "u",
                        },
                        {
                            "participant_id": "p2",
                            "side": "output",
                            "reported_role": "product",
                            "original_structure": "COC",
                        },
                    ],
                )
            ]
        )
        request["upstream_artifacts"] = [artifact]
        result = CORE.process_request(request)
        self.assertEqual(result["upstream_artifacts"][0]["record_count"], 1)

    def test_06_bad_upstream_artifact_is_not_consumed(self):
        request = base_request()
        request["upstream_artifacts"] = [
            {"records": [], "result_fingerprint": "0" * 64}
        ]
        result = CORE.process_request(request)
        self.assertEqual(
            result["upstream_artifacts"][0]["contract_status"],
            "invalid",
        )
        self.assertIn(
            "E-UPSTREAM-FINGERPRINT-001",
            {item["code"] for item in result["errors"]},
        )

    def test_07_csv_loader_builds_request_and_hash(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "reactions.csv"
            with path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(
                    handle,
                    fieldnames=["record_id", "reaction_smiles", "yield_percent"],
                )
                writer.writeheader()
                writer.writerow(
                    {
                        "record_id": "csv-1",
                        "reaction_smiles": "CCO>>COC",
                        "yield_percent": "55",
                    }
                )
            request = CORE.load_request(path, CORE.load_toolkit())
        self.assertEqual(request["input_profile"], "tabular")
        self.assertRegex(request["source"]["content_sha256"], r"^[0-9a-f]{64}$")

    def test_08_raw_ord_json_is_wrapped(self):
        document = {
            "identifiers": [{"type": "REACTION_SMILES", "value": "CCO>>COC"}],
            "inputs": {},
            "outcomes": [],
            "reaction_id": "ord-" + "1" * 32,
        }
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "reaction.json"
            path.write_text(json.dumps(document), encoding="utf-8")
            request = CORE.load_request(path, CORE.load_toolkit())
        self.assertEqual(request["input_profile"], "ord_reaction")
        self.assertEqual(len(request["records"]), 1)

    def test_09_record_limit_is_reported(self):
        request = base_request(
            [
                {
                    "record_id": f"r-{index}",
                    "reaction_smiles": "CCO>>COC",
                    "stoichiometry_complete": True,
                }
                for index in range(CORE.MAX_RECORDS + 1)
            ]
        )
        result = CORE.process_request(request)
        self.assertIn(
            "E-RESOURCE-LIMIT-001",
            {item["code"] for item in result["errors"]},
        )

    def test_10_normal_cli_and_validator(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "input.json"
            output = Path(tmp) / "output.json"
            source.write_text(json.dumps(base_request()), encoding="utf-8")
            run = subprocess.run(
                [
                    sys.executable,
                    str(CORE_PATH),
                    "--input",
                    str(source),
                    "--output",
                    str(output),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            validate = subprocess.run(
                [sys.executable, str(VALIDATOR_PATH), str(output)],
                capture_output=True,
                text=True,
                check=False,
            )
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(validate.returncode, 0, validate.stderr)

    def test_11_invalid_json_cli_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "bad.json"
            output = Path(tmp) / "output.json"
            source.write_text("{", encoding="utf-8")
            run = subprocess.run(
                [
                    sys.executable,
                    str(CORE_PATH),
                    "--input",
                    str(source),
                    "--output",
                    str(output),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertFalse(output.exists())
        self.assertEqual(run.returncode, 2)

    def test_12_tool_versions_are_fixed(self):
        result = CORE.process_request(base_request())
        self.assertEqual(
            result["tool_versions"],
            {"rdkit": "2025.9.2", "ord-schema": "0.8.3"},
        )

    def test_13_record_counts_are_conserved(self):
        result = CORE.process_request(
            base_request(
                [
                    {
                        "record_id": "good",
                        "reaction_smiles": "CCO>>COC",
                        "stoichiometry_complete": True,
                    },
                    {"record_id": "bad", "reaction_smiles": "bad"},
                ]
            )
        )
        self.assertEqual(result["input_summary"]["total_records"], 2)
        self.assertEqual(result["input_summary"]["output_records"], 2)
        self.assertEqual(sum(result["input_summary"]["disposition_counts"].values()), 2)

    def test_14_output_contains_no_secret_or_absolute_temp_path(self):
        result = CORE.process_request(base_request())
        serialized = json.dumps(result, ensure_ascii=False)
        self.assertNotRegex(serialized, CORE.SECRET_RE)
        self.assertNotIn("/private/tmp", serialized)

    def test_15_ord_yield_is_promoted_to_yield_assessment(self):
        toolkit = CORE.load_toolkit()
        reaction = toolkit["message_helpers"].reaction_from_smiles("CCO>>CC=O")
        measurement = reaction.outcomes[0].products[0].measurements.add()
        enum = measurement.DESCRIPTOR.fields_by_name["type"].enum_type
        measurement.type = enum.values_by_name["YIELD"].number
        measurement.percentage.value = 75.0
        ord_record = toolkit["MessageToDict"](
            reaction,
            preserving_proto_field_name=True,
            use_integers_for_enums=False,
        )
        value = base_request(
            [
                {
                    "record_id": "ord-yield",
                    "reaction_smiles": "CCO>>CC=O",
                    "ord_record": ord_record,
                    "stoichiometry_complete": False,
                }
            ]
        )
        result = CORE.process_request(value)
        measurements = result["records"][0]["yield_assessment"]["measurements"]
        self.assertEqual(len(measurements), 1)
        self.assertEqual(measurements[0]["value"], 75.0)
        self.assertEqual(measurements[0]["units"], "PERCENT")
        self.assertEqual(VALIDATOR.validate_output(result), [])

    def test_16_validator_rejects_nested_absolute_path(self):
        result = CORE.process_request(base_request())
        result["source_record"]["debug_path"] = (
            "/" + "Users" + "/example/private/input.json"
        )
        result["result_fingerprint"] = CORE.stable_document_fingerprint(result)

        errors = VALIDATOR.validate_output(result)

        self.assertTrue(
            any("source_record.debug_path" in item for item in errors),
            errors,
        )


def make_gold_process_test(gold_case):
    def test(self):
        result = CORE.process_request(copy.deepcopy(gold_case["request"]))
        record = result["records"][0]
        self.assertEqual(
            record["disposition"],
            gold_case["expected_disposition"],
            gold_case["case_id"],
        )
        codes = {item["code"] for item in record["findings"]}
        self.assertTrue(
            gold_case["expected_codes"].issubset(codes),
            (gold_case["case_id"], gold_case["expected_codes"], codes),
        )
        top_codes = {item["code"] for item in result["errors"]}
        self.assertTrue(
            gold_case["expected_top_codes"].issubset(top_codes),
            (gold_case["case_id"], gold_case["expected_top_codes"], top_codes),
        )

    return test


def make_gold_validator_test(gold_case):
    def test(self):
        result = CORE.process_request(copy.deepcopy(gold_case["request"]))
        self.assertEqual(
            VALIDATOR.validate_output(result),
            [],
            gold_case["case_id"],
        )

    return test


for _index, _gold_case in enumerate(GOLD_CASES, start=1):
    _safe_id = "".join(
        char if char.isalnum() else "_" for char in _gold_case["case_id"]
    )
    setattr(
        CurateReactionsContractTest,
        f"test_gold_{_index:02d}_{_safe_id}_process",
        make_gold_process_test(_gold_case),
    )
    setattr(
        CurateReactionsContractTest,
        f"test_gold_{_index:02d}_{_safe_id}_validator",
        make_gold_validator_test(_gold_case),
    )


if __name__ == "__main__":
    unittest.main()
