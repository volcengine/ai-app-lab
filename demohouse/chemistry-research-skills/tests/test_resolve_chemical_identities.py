import copy
import importlib.util
import io
import json
import socket
import subprocess
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch


PROJECT_DIR = Path(__file__).resolve().parents[1]
SKILL_DIR = PROJECT_DIR / "skills" / "resolve-chemical-identities"
STANDARDIZER = (
    PROJECT_DIR
    / "skills"
    / "standardize-chemical-structures"
    / "scripts"
    / "standardize_structures.py"
)
FIXED_TIME = "2026-08-07T00:00:00+00:00"
ASPIRIN_SMILES = "CC(=O)OC1=CC=CC=C1C(=O)O"
ASPIRIN_INCHI = "InChI=1S/C9H8O4/c1-6(10)13-8-5-3-2-4-7(8)9(11)12/h2-5H,1H3,(H,11,12)"
ASPIRIN_KEY = "BSYNRYMUTXBXSQ-UHFFFAOYSA-N"
ASPIRIN_SODIUM_SMILES = "CC(=O)OC1=CC=CC=C1C(=O)[O-].[Na+]"
ASPIRIN_SODIUM_INCHI = (
    "InChI=1S/C9H8O4.Na/c1-6(10)13-8-5-3-2-4-7(8)9(11)12;/h2-5H,1H3,(H,11,12);/q;+1/p-1"
)
ASPIRIN_SODIUM_KEY = "JZLOKWGVGHYBKD-UHFFFAOYSA-M"
GLUCOSE_CYCLIC_SMILES = "C([C@@H]1[C@H]([C@@H]([C@H](C(O1)O)O)O)O)O"
GLUCOSE_CYCLIC_INCHI = (
    "InChI=1S/C6H12O6/c7-1-2-3(8)4(9)5(10)6(11)12-2/h2-11H,1H2/t2-,3-,4+,5-,6?/m1/s1"
)
GLUCOSE_CYCLIC_KEY = "WQZGKKKJIJFFOK-GASJEMHNSA-N"
GLUCOSE_OPEN_SMILES = "O=C[C@H](O)[C@@H](O)[C@H](O)[C@H](O)CO"
GLUCOSE_OPEN_INCHI = (
    "InChI=1S/C6H12O6/c7-1-2(8)3(9)4(10)5(11)6(12)13/"
    "h2-6,8-12H,1H2/t2-,3+,4-,5-,6?/m1/s1"
)
GLUCOSE_OPEN_KEY = "GZCGUPFRVQAUEE-SLPGGIOYSA-N"
VITAMIN_E_SMILES = "CC1=C(C2=C(CC[C@@](O2)(C)CCC[C@H](C)CCC[C@H](C)CCCC(C)C)C(=C1O)C)C"
VITAMIN_E_INCHI = (
    "InChI=1S/C29H50O2/c1-20(2)12-9-13-21(3)14-10-15-22(4)"
    "16-11-18-29(8)19-17-26-25(7)27(30)23(5)24(6)28(26)"
    "31-29/h20-22,30H,9-19H2,1-8H3/t21-,22-,29-/m1/s1"
)
VITAMIN_E_KEY = "GVJHHUAWPYXKBD-IEOSBIPESA-N"


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


RESOLVER = load_module(
    "resolve_chemical_identities",
    SKILL_DIR / "scripts" / "resolve_identities.py",
)
VALIDATOR = load_module(
    "validate_chemical_identity_output",
    SKILL_DIR / "scripts" / "validate_output.py",
)
TOOLKIT = RESOLVER.load_toolkit()


def property_payload(
    cid,
    title,
    smiles,
    inchi,
    inchikey,
    formula=None,
):
    return {
        "PropertyTable": {
            "Properties": [
                {
                    "CID": cid,
                    "Title": title,
                    "SMILES": smiles,
                    "InChI": inchi,
                    "InChIKey": inchikey,
                    "MolecularFormula": formula,
                }
            ]
        }
    }


def chembl_record(
    chembl_id,
    pref_name,
    smiles,
    inchi,
    inchikey,
    synonyms=(),
    formula=None,
):
    return {
        "molecule_chembl_id": chembl_id,
        "pref_name": pref_name,
        "molecule_type": "Small molecule",
        "molecule_structures": (
            {
                "canonical_smiles": smiles,
                "standard_inchi": inchi,
                "standard_inchi_key": inchikey,
            }
            if smiles or inchi or inchikey
            else None
        ),
        "molecule_properties": {"full_molformula": formula} if formula else {},
        "molecule_synonyms": [{"molecule_synonym": synonym} for synonym in synonyms],
    }


def chembl_payload(*records):
    return {
        "molecules": list(records),
        "page_meta": {"total_count": len(records)},
    }


def unichem_payload(inchi, inchikey, uci, mappings=()):
    return {
        "compounds": [
            {
                "uci": uci,
                "standardInchiKey": inchikey,
                "inchi": {
                    "inchi": inchi,
                    "formula": inchi.split("/", 2)[1],
                },
                "sources": [
                    {
                        "shortName": source,
                        "longName": source,
                        "compoundId": source_id,
                        "url": f"https://example.test/{source}/{source_id}",
                    }
                    for source, source_id in mappings
                ],
            }
        ],
        "notFound": [],
        "response": "Success",
        "totalCompounds": "1",
    }


def opsin_payload(name, smiles, inchi, inchikey, status="SUCCESS", message=""):
    return {
        "status": status,
        "message": message,
        "chemicalName": name,
        "smiles": smiles,
        "stdinchi": inchi,
        "stdinchikey": inchikey,
    }


def response(payload, status="success", http_status=None, **extra):
    return {
        "status": status,
        "http_status": (
            http_status
            if http_status is not None
            else 200
            if status == "success"
            else 404
            if status == "not_found"
            else None
        ),
        "payload": payload,
        **extra,
    }


def not_found(message="not found"):
    return response(
        {"message": message},
        status="not_found",
        http_status=404,
        error_kind="not_found",
    )


def source_error(kind="service_error", message="service unavailable", http_status=503):
    return response(
        {"message": message},
        status="source_error",
        http_status=http_status,
        error_kind=kind,
        message=message,
    )


def fixture_transport(fixtures):
    return RESOLVER.FixtureTransport(fixtures, clock=lambda: FIXED_TIME)


def process(requests, fixtures, sources, include_related=False):
    return RESOLVER.process_requests(
        requests,
        transport=fixture_transport(fixtures),
        enabled_sources=sources,
        include_related=include_related,
        use_standardizer=True,
        standardizer_script=STANDARDIZER,
        standardization_profile="chembl-pipeline",
        generated_at_utc=FIXED_TIME,
    )


class InputDetectionTests(unittest.TestCase):
    def test_auto_detection_handles_simple_smiles_and_stable_ids(self):
        cases = {
            "CCO": "smiles",
            ASPIRIN_SMILES: "smiles",
            ASPIRIN_INCHI: "inchi",
            ASPIRIN_KEY: "inchikey",
            "CHEMBL25": "chembl_id",
            "64-17-5": "cas_rn",
            "aspirin": "name",
        }
        for query, expected in cases.items():
            with self.subTest(query=query):
                detected, findings = RESOLVER.detect_input_type(query, TOOLKIT)
                self.assertEqual(detected, expected)
                self.assertFalse(
                    [item for item in findings if item["severity"] == "error"]
                )

    def test_pure_numeric_auto_input_is_not_guessed_as_cid(self):
        validated = RESOLVER.validate_request({"query": "2244"}, TOOLKIT)
        self.assertEqual(validated["input_status"], "invalid_input")
        self.assertEqual(validated["detected_input_type"], "ambiguous_numeric")
        self.assertIn(
            "E-AMBIGUOUS-NUMERIC-ID",
            [item["code"] for item in validated["findings"]],
        )

    def test_explicit_pubchem_cid_is_accepted(self):
        validated = RESOLVER.validate_request(
            {"query": "2244", "input_type": "pubchem_cid"}, TOOLKIT
        )
        self.assertEqual(validated["input_status"], "valid")
        self.assertEqual(validated["detected_input_type"], "pubchem_cid")

    def test_cas_check_digit_is_validated_without_claiming_registration(self):
        self.assertTrue(RESOLVER.valid_cas_check_digit("64-17-5"))
        self.assertFalse(RESOLVER.valid_cas_check_digit("64-17-6"))
        invalid = RESOLVER.validate_request(
            {"query": "64-17-6", "input_type": "cas_rn"}, TOOLKIT
        )
        self.assertEqual(invalid["input_status"], "invalid_input")

    def test_invalid_structure_is_rejected_without_network_queries(self):
        document = process(
            [{"id": "bad", "query": "CO(C)C", "input_type": "smiles"}],
            fixtures={},
            sources={"pubchem", "chembl", "unichem"},
        )
        resolution = document["resolutions"][0]
        self.assertEqual(resolution["input_status"], "invalid_input")
        self.assertEqual(resolution["disposition"], "rejected")
        self.assertEqual(resolution["source_queries"], [])
        self.assertEqual(resolution["candidates"], [])


class ScientificGoldenCaseTests(unittest.TestCase):
    def test_aspirin_name_is_exact_only_with_two_independent_sources(self):
        fixtures = {
            "opsin": not_found("uninterpretable common name"),
            "pubchem": response(
                property_payload(
                    2244,
                    "Aspirin",
                    ASPIRIN_SMILES,
                    ASPIRIN_INCHI,
                    ASPIRIN_KEY,
                    "C9H8O4",
                )
            ),
            "chembl_pref_name": response(
                chembl_payload(
                    chembl_record(
                        "CHEMBL25",
                        "ASPIRIN",
                        ASPIRIN_SMILES,
                        ASPIRIN_INCHI,
                        ASPIRIN_KEY,
                        synonyms=("Aspirin",),
                        formula="C9H8O4",
                    )
                )
            ),
            "chembl_synonym": response(
                chembl_payload(
                    chembl_record(
                        "CHEMBL25",
                        "ASPIRIN",
                        ASPIRIN_SMILES,
                        ASPIRIN_INCHI,
                        ASPIRIN_KEY,
                        synonyms=("Aspirin",),
                        formula="C9H8O4",
                    )
                )
            ),
            f"unichem_exact:{ASPIRIN_KEY}": response(
                unichem_payload(
                    ASPIRIN_INCHI,
                    ASPIRIN_KEY,
                    161671,
                    mappings=(("pubchem", "2244"), ("chembl", "CHEMBL25")),
                )
            ),
        }
        document = process(
            [{"id": "aspirin", "query": "aspirin"}],
            fixtures,
            {"opsin", "pubchem", "chembl", "unichem"},
        )
        resolution = document["resolutions"][0]
        self.assertEqual(resolution["record_alignment_status"], "exact")
        self.assertEqual(resolution["sample_identity_status"], "not_assessed")
        self.assertEqual(resolution["disposition"], "ready_for_standardization")
        self.assertEqual(len(resolution["candidates"]), 1)
        self.assertEqual(
            set(resolution["candidates"][0]["source_families"]),
            {"pubchem", "chembl", "unichem"},
        )
        self.assertEqual(resolution["standardization_handoff"]["status"], "ready")
        self.assertTrue(VALIDATOR.validate(document)["valid"])

    def test_single_source_name_remains_ambiguous(self):
        fixtures = {
            "pubchem": response(
                property_payload(
                    2244,
                    "Aspirin",
                    ASPIRIN_SMILES,
                    ASPIRIN_INCHI,
                    ASPIRIN_KEY,
                    "C9H8O4",
                )
            )
        }
        document = process(
            [{"query": "aspirin"}],
            fixtures,
            {"pubchem"},
        )
        resolution = document["resolutions"][0]
        self.assertEqual(resolution["record_alignment_status"], "ambiguous")
        self.assertEqual(resolution["disposition"], "review_required")
        self.assertNotEqual(resolution["standardization_handoff"]["status"], "ready")

    def test_vitamin_e_family_name_is_not_forced_to_pubchem_structure(self):
        structureless = chembl_record(
            "CHEMBL3989727",
            "VITAMIN E",
            None,
            None,
            None,
            synonyms=(
                "Vitamin E",
                "Alpha-tocopherol",
                "Vitamin E succinate",
                "Vitamin E, unspecified form",
            ),
        )
        fixtures = {
            "opsin": not_found("vitamin E was uninterpretable"),
            "pubchem": response(
                property_payload(
                    14985,
                    "Vitamin E",
                    VITAMIN_E_SMILES,
                    VITAMIN_E_INCHI,
                    VITAMIN_E_KEY,
                    "C29H50O2",
                )
            ),
            "chembl_pref_name": response(chembl_payload(structureless)),
            "chembl_synonym": response(chembl_payload(structureless)),
            f"unichem_exact:{VITAMIN_E_KEY}": response(
                unichem_payload(
                    VITAMIN_E_INCHI,
                    VITAMIN_E_KEY,
                    1001,
                    mappings=(("pubchem", "14985"),),
                )
            ),
        }
        document = process(
            [{"id": "vitamin-e", "query": "vitamin E"}],
            fixtures,
            {"opsin", "pubchem", "chembl", "unichem"},
        )
        resolution = document["resolutions"][0]
        self.assertEqual(resolution["record_alignment_status"], "ambiguous")
        self.assertEqual(resolution["disposition"], "review_required")
        self.assertEqual(len(resolution["unresolved_source_records"]), 1)
        self.assertNotEqual(resolution["standardization_handoff"]["status"], "ready")

    def test_glucose_open_and_cyclic_candidates_are_both_preserved(self):
        cyclic = chembl_record(
            "CHEMBL1222250",
            "DEXTROSE",
            GLUCOSE_CYCLIC_SMILES,
            GLUCOSE_CYCLIC_INCHI,
            GLUCOSE_CYCLIC_KEY,
            synonyms=("Glucose",),
            formula="C6H12O6",
        )
        fixtures = {
            "opsin": response(
                opsin_payload(
                    "glucose",
                    GLUCOSE_OPEN_SMILES,
                    GLUCOSE_OPEN_INCHI,
                    GLUCOSE_OPEN_KEY,
                )
            ),
            "pubchem": response(
                property_payload(
                    5793,
                    "D-Glucose",
                    GLUCOSE_CYCLIC_SMILES,
                    GLUCOSE_CYCLIC_INCHI,
                    GLUCOSE_CYCLIC_KEY,
                    "C6H12O6",
                )
            ),
            "chembl_pref_name": response(chembl_payload()),
            "chembl_synonym": response(chembl_payload(cyclic)),
            f"unichem_exact:{GLUCOSE_OPEN_KEY}": response(
                unichem_payload(
                    GLUCOSE_OPEN_INCHI,
                    GLUCOSE_OPEN_KEY,
                    2001,
                    mappings=(("chembl", "CHEMBL448805"),),
                )
            ),
            f"unichem_exact:{GLUCOSE_CYCLIC_KEY}": response(
                unichem_payload(
                    GLUCOSE_CYCLIC_INCHI,
                    GLUCOSE_CYCLIC_KEY,
                    2002,
                    mappings=(("pubchem", "5793"), ("chembl", "CHEMBL1222250")),
                )
            ),
        }
        document = process(
            [{"id": "glucose", "query": "glucose"}],
            fixtures,
            {"opsin", "pubchem", "chembl", "unichem"},
        )
        resolution = document["resolutions"][0]
        self.assertEqual(resolution["record_alignment_status"], "ambiguous")
        self.assertEqual(resolution["disposition"], "review_required")
        self.assertEqual(
            {candidate["inchikey"] for candidate in resolution["candidates"]},
            {GLUCOSE_OPEN_KEY, GLUCOSE_CYCLIC_KEY},
        )
        self.assertFalse(document["options"]["automatic_tie_breaking"])

    def test_aspirin_and_sodium_share_parent_but_not_full_identity(self):
        document = process(
            [
                {
                    "id": "aspirin",
                    "query": ASPIRIN_SMILES,
                    "input_type": "smiles",
                },
                {
                    "id": "aspirin-sodium",
                    "query": ASPIRIN_SODIUM_SMILES,
                    "input_type": "smiles",
                },
            ],
            fixtures={},
            sources=set(),
        )
        relationship = document["cross_query_relationships"][0]
        self.assertEqual(relationship["relationship"], "related_forms")
        self.assertNotEqual(
            relationship["left_inchikey"], relationship["right_inchikey"]
        )
        self.assertEqual(
            relationship["left_parent_inchikey"],
            relationship["right_parent_inchikey"],
        )
        self.assertIn("不是同一物理样品", relationship["explanation"])

    def test_r_and_s_lactic_acid_are_not_merged_by_connectivity(self):
        document = process(
            [
                {"id": "r", "query": "C[C@H](O)C(=O)O", "input_type": "smiles"},
                {"id": "s", "query": "C[C@@H](O)C(=O)O", "input_type": "smiles"},
            ],
            fixtures={},
            sources=set(),
        )
        relationship = document["cross_query_relationships"][0]
        self.assertEqual(relationship["relationship"], "different_or_unresolved")
        self.assertEqual(
            relationship["left_inchikey"][:14],
            relationship["right_inchikey"][:14],
        )
        self.assertNotEqual(
            relationship["left_inchikey"], relationship["right_inchikey"]
        )

    def test_multicomponent_input_requires_review_and_blocks_handoff(self):
        document = process(
            [{"id": "mixture", "query": "CCO.CN", "input_type": "smiles"}],
            fixtures={},
            sources=set(),
        )
        resolution = document["resolutions"][0]
        self.assertEqual(resolution["disposition"], "review_required")
        self.assertIn(
            "R-MULTICOMPONENT-CANDIDATE",
            [item["code"] for item in resolution["candidates"][0]["quality_findings"]],
        )
        self.assertEqual(resolution["standardization_handoff"]["records"], [])

    def test_unassigned_stereo_requires_review(self):
        document = process(
            [{"id": "stereo", "query": "CC(O)C(=O)O", "input_type": "smiles"}],
            fixtures={},
            sources=set(),
        )
        resolution = document["resolutions"][0]
        self.assertEqual(resolution["disposition"], "review_required")
        codes = [
            item["code"] for item in resolution["candidates"][0]["quality_findings"]
        ]
        self.assertIn("R-UNSPECIFIED-STEREO", codes)


class ErrorClassificationTests(unittest.TestCase):
    def test_all_404_is_not_found_not_source_error(self):
        document = process(
            [{"query": "definitely-not-a-real-compound-name"}],
            {"pubchem": not_found()},
            {"pubchem"},
        )
        resolution = document["resolutions"][0]
        self.assertEqual(resolution["retrieval_status"], "not_found")
        self.assertEqual(resolution["disposition"], "rejected")

    def test_503_is_source_error_not_not_found(self):
        document = process(
            [{"query": "aspirin"}],
            {"pubchem": source_error()},
            {"pubchem"},
        )
        resolution = document["resolutions"][0]
        self.assertEqual(resolution["retrieval_status"], "source_error")
        self.assertNotEqual(resolution["retrieval_status"], "not_found")
        self.assertEqual(resolution["disposition"], "review_required")

    def test_success_plus_503_is_partial(self):
        fixtures = {
            "pubchem": response(
                property_payload(
                    2244,
                    "Aspirin",
                    ASPIRIN_SMILES,
                    ASPIRIN_INCHI,
                    ASPIRIN_KEY,
                    "C9H8O4",
                )
            ),
            "chembl_pref_name": source_error(),
            "chembl_synonym": not_found(),
        }
        document = process(
            [{"query": "aspirin"}],
            fixtures,
            {"pubchem", "chembl"},
        )
        resolution = document["resolutions"][0]
        self.assertEqual(resolution["retrieval_status"], "partial")
        self.assertEqual(resolution["disposition"], "review_required")

    def test_http_transport_classifies_invalid_json(self):
        class FakeResponse:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self):
                return b"<html>not json</html>"

        transport = RESOLVER.HttpTransport(
            timeout=1, retries=0, clock=lambda: FIXED_TIME
        )
        with patch.object(
            RESOLVER.urllib.request, "urlopen", return_value=FakeResponse()
        ):
            result = transport.request_json("key", "GET", "https://example.test")
        self.assertEqual(result["status"], "source_error")
        self.assertEqual(result["error_kind"], "invalid_json")

    def test_http_transport_classifies_http_503(self):
        error = urllib.error.HTTPError(
            "https://example.test",
            503,
            "busy",
            {},
            io.BytesIO(b'{"message":"busy"}'),
        )
        transport = RESOLVER.HttpTransport(
            timeout=1, retries=0, clock=lambda: FIXED_TIME
        )
        with patch.object(RESOLVER.urllib.request, "urlopen", side_effect=error):
            result = transport.request_json("key", "GET", "https://example.test")
        self.assertEqual(result["status"], "source_error")
        self.assertEqual(result["error_kind"], "service_error")
        self.assertEqual(result["http_status"], 503)

    def test_http_transport_classifies_timeout(self):
        transport = RESOLVER.HttpTransport(
            timeout=1, retries=0, clock=lambda: FIXED_TIME
        )
        error = urllib.error.URLError(socket.timeout("timed out"))
        with patch.object(RESOLVER.urllib.request, "urlopen", side_effect=error):
            result = transport.request_json("key", "GET", "https://example.test")
        self.assertEqual(result["status"], "source_error")
        self.assertEqual(result["error_kind"], "timeout")

    def test_same_stable_id_with_different_full_keys_is_conflict(self):
        aspirin_record = chembl_record(
            "CHEMBL25",
            "ASPIRIN",
            ASPIRIN_SMILES,
            ASPIRIN_INCHI,
            ASPIRIN_KEY,
            formula="C9H8O4",
        )
        fixtures = {
            "chembl_id": response(aspirin_record),
            "pubchem": response(
                property_payload(
                    5793,
                    "D-Glucose",
                    GLUCOSE_CYCLIC_SMILES,
                    GLUCOSE_CYCLIC_INCHI,
                    GLUCOSE_CYCLIC_KEY,
                    "C6H12O6",
                )
            ),
        }
        document = process(
            [{"query": "CHEMBL25", "input_type": "chembl_id"}],
            fixtures,
            {"chembl", "pubchem"},
        )
        resolution = document["resolutions"][0]
        self.assertEqual(resolution["record_alignment_status"], "conflict")
        self.assertEqual(resolution["disposition"], "review_required")
        self.assertEqual(len(resolution["candidates"]), 2)

    def test_source_structure_key_integrity_mismatch_is_conflict(self):
        dishonest_record = chembl_record(
            "CHEMBL25",
            "ASPIRIN",
            ASPIRIN_SMILES,
            ASPIRIN_INCHI,
            GLUCOSE_CYCLIC_KEY,
        )
        document = process(
            [{"query": "CHEMBL25", "input_type": "chembl_id"}],
            {"chembl_id": response(dishonest_record)},
            {"chembl"},
        )
        resolution = document["resolutions"][0]
        self.assertEqual(resolution["record_alignment_status"], "conflict")
        self.assertEqual(len(resolution["source_record_conflicts"]), 1)


class ContractAndCliTests(unittest.TestCase):
    def test_skill_links_standardization_handoff_contract(self):
        skill_text = (SKILL_DIR / "SKILL.md").read_text(encoding="utf-8")
        reference = SKILL_DIR / "references" / "标准化交接合同.md"
        self.assertTrue(reference.is_file())
        reference_text = reference.read_text(encoding="utf-8")
        self.assertIn("标准化交接合同", skill_text)
        self.assertIn("standardization_handoff.status=ready", skill_text)
        self.assertIn("禁止读取 candidates", reference_text)

    def _ready_handoff_document(self):
        return process(
            [{"query": ASPIRIN_SMILES, "input_type": "smiles"}],
            {},
            set(),
        )

    def _validate_handoff_mutation(self, mutate):
        document = self._ready_handoff_document()
        mutate(document["resolutions"][0])
        document["result_fingerprint"] = RESOLVER.output_fingerprint(document)
        return VALIDATOR.validate(document)

    def _assert_handoff_mutation_rejected(
        self,
        mutate,
        expected_error,
    ):
        report = self._validate_handoff_mutation(mutate)
        self.assertFalse(report["valid"])
        self.assertTrue(
            any(expected_error in item for item in report["errors"]),
            report["errors"],
        )

    def test_validator_rejects_handoff_envelope_tampering(self):
        cases = [
            (
                "unknown_status",
                lambda resolution: resolution["standardization_handoff"].update(
                    {"status": "unknown"}
                ),
                "standardization_handoff.status has invalid value",
            ),
            (
                "wrong_target",
                lambda resolution: resolution["standardization_handoff"].update(
                    {"target_skill": "compute-molecular-features"}
                ),
                "standardization_handoff.target_skill",
            ),
            (
                "zero_ready_records",
                lambda resolution: resolution["standardization_handoff"].update(
                    {"records": []}
                ),
                "ready handoff requires exactly one record",
            ),
            (
                "multiple_ready_records",
                lambda resolution: resolution["standardization_handoff"][
                    "records"
                ].append(
                    copy.deepcopy(resolution["standardization_handoff"]["records"][0])
                ),
                "ready handoff requires exactly one record",
            ),
            (
                "invalid_alignment_scope",
                lambda resolution: resolution["standardization_handoff"].update(
                    {"alignment_scope": "sample_identity"}
                ),
                "standardization_handoff.alignment_scope has invalid value",
            ),
            (
                "empty_notice",
                lambda resolution: resolution["standardization_handoff"].update(
                    {"notice": ""}
                ),
                "standardization_handoff.notice must be a non-empty string",
            ),
        ]
        for name, mutate, expected_error in cases:
            with self.subTest(name=name):
                self._assert_handoff_mutation_rejected(
                    mutate,
                    expected_error,
                )

    def test_validator_rejects_non_string_handoff_enums_without_crashing(self):
        cases = [
            (
                "status",
                lambda resolution: resolution["standardization_handoff"].update(
                    {"status": []}
                ),
                "standardization_handoff.status has invalid value",
            ),
            (
                "alignment_scope",
                lambda resolution: resolution["standardization_handoff"].update(
                    {"alignment_scope": []}
                ),
                "standardization_handoff.alignment_scope has invalid value",
            ),
        ]
        for name, mutate, expected_error in cases:
            with self.subTest(name=name):
                self._assert_handoff_mutation_rejected(
                    mutate,
                    expected_error,
                )

    def test_validator_rejects_handoff_record_binding_tampering(self):
        cases = [
            (
                "missing_field",
                lambda resolution: resolution["standardization_handoff"]["records"][
                    0
                ].pop("source_inchikey"),
                "missing keys: source_inchikey",
            ),
            (
                "record_not_object",
                lambda resolution: resolution["standardization_handoff"].update(
                    {"records": ["not-an-object"]}
                ),
                "records[0] must be an object",
            ),
            (
                "request_id_mismatch",
                lambda resolution: resolution["standardization_handoff"]["records"][
                    0
                ].update({"id": "other-id"}),
                "records[0].id must match request.id",
            ),
            (
                "candidate_id_mismatch",
                lambda resolution: resolution["standardization_handoff"]["records"][
                    0
                ].update({"source_candidate_id": "candidate-999"}),
                "source_candidate_id must match candidate.candidate_id",
            ),
            (
                "structure_mismatch",
                lambda resolution: resolution["standardization_handoff"]["records"][
                    0
                ].update({"structure": "CCO"}),
                "records[0].structure must match candidate.canonical_smiles",
            ),
            (
                "inchikey_mismatch",
                lambda resolution: resolution["standardization_handoff"]["records"][
                    0
                ].update({"source_inchikey": GLUCOSE_CYCLIC_KEY}),
                "source_inchikey must match candidate.inchikey",
            ),
        ]
        for name, mutate, expected_error in cases:
            with self.subTest(name=name):
                self._assert_handoff_mutation_rejected(
                    mutate,
                    expected_error,
                )

    def test_validator_rejects_blocked_handoff_state_conflicts(self):
        cases = [
            (
                "blocked_with_records",
                lambda resolution: resolution["standardization_handoff"].update(
                    {"status": "blocked_pending_resolution"}
                ),
                "blocked handoff must not contain records",
            ),
            (
                "invalid_input_conflict",
                lambda resolution: resolution["standardization_handoff"].update(
                    {
                        "status": "blocked_invalid_input",
                        "records": [],
                    }
                ),
                "blocked_invalid_input requires invalid rejected input",
            ),
            (
                "pending_conflicts_with_ready",
                lambda resolution: resolution["standardization_handoff"].update(
                    {
                        "status": "blocked_pending_resolution",
                        "records": [],
                    }
                ),
                "blocked_pending_resolution conflicts with ready candidate",
            ),
            (
                "missing_conflicts_with_structure",
                lambda resolution: resolution["standardization_handoff"].update(
                    {
                        "status": "blocked_missing_structure",
                        "records": [],
                    }
                ),
                "blocked_missing_structure requires missing candidate structure",
            ),
        ]
        for name, mutate, expected_error in cases:
            with self.subTest(name=name):
                self._assert_handoff_mutation_rejected(
                    mutate,
                    expected_error,
                )

    def test_validator_requires_invalid_input_handoff_status(self):
        document = process(
            [{"id": "bad", "query": "CO(C)C", "input_type": "smiles"}],
            {},
            set(),
        )
        handoff = document["resolutions"][0]["standardization_handoff"]
        handoff["status"] = "blocked_pending_resolution"
        document["result_fingerprint"] = RESOLVER.output_fingerprint(document)

        report = VALIDATOR.validate(document)

        self.assertFalse(report["valid"])
        self.assertTrue(
            any(
                "invalid input requires blocked_invalid_input" in item
                for item in report["errors"]
            ),
            report["errors"],
        )

    def test_chembl_runtime_version_is_recorded_when_available(self):
        document = process(
            [{"query": ASPIRIN_SMILES, "input_type": "smiles"}],
            {
                "chembl_status": response(
                    {
                        "chembl_db_version": "ChEMBL_37",
                        "chembl_release_date": "2026-05-01",
                        "status": "UP",
                    }
                ),
                f"chembl_inchikey:{ASPIRIN_KEY}": not_found(),
            },
            {"chembl"},
        )
        metadata = document["source_metadata"]["ChEMBL"]
        self.assertEqual(metadata["database_version"], "ChEMBL_37")
        self.assertEqual(metadata["release_date"], "2026-05-01")
        self.assertEqual(metadata["api_status"], "UP")

    def test_standardizer_can_be_explicitly_disabled(self):
        document = RESOLVER.process_requests(
            [{"query": ASPIRIN_SMILES, "input_type": "smiles"}],
            transport=fixture_transport({}),
            enabled_sources=set(),
            use_standardizer=False,
            standardizer_script=STANDARDIZER,
            generated_at_utc=FIXED_TIME,
        )
        resolution = document["resolutions"][0]
        self.assertFalse(document["options"]["use_standardizer"])
        self.assertIsNone(document["options"]["standardizer_script"])
        self.assertEqual(resolution["standardization_comparison"]["status"], "not_run")
        self.assertEqual(resolution["standardization_handoff"]["status"], "ready")

    def test_artifact_records_stable_standardizer_identifier(self):
        document = process(
            [{"query": ASPIRIN_SMILES, "input_type": "smiles"}],
            {},
            set(),
        )
        identifier = document["options"]["standardizer_script"]
        self.assertEqual(
            identifier,
            "standardize-chemical-structures/scripts/standardize_structures.py",
        )
        self.assertFalse(Path(identifier).is_absolute())

    def test_cli_rejects_invalid_transport_options(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fixtures = root / "fixtures.json"
            fixtures.write_text("{}", encoding="utf-8")

            for option, value in (("--timeout", "0"), ("--retries", "-1")):
                with self.subTest(option=option):
                    output = root / f"{option[2:]}.json"
                    completed = subprocess.run(
                        [
                            sys.executable,
                            str(SKILL_DIR / "scripts" / "resolve_identities.py"),
                            "--query",
                            "CCO",
                            "--input-type",
                            "smiles",
                            "--sources",
                            "",
                            "--fixture-responses",
                            str(fixtures),
                            option,
                            value,
                            "--output",
                            str(output),
                        ],
                        capture_output=True,
                        text=True,
                        check=False,
                    )
                    self.assertEqual(completed.returncode, 3)
                    self.assertFalse(output.exists())
                    self.assertNotIn("Traceback", completed.stderr)
                    self.assertIn(option[2:], completed.stderr)

            request_path = root / "request.json"
            output = root / "include-related.json"
            request_path.write_text(
                json.dumps(
                    {
                        "requests": [
                            {
                                "query": "CCO",
                                "input_type": "smiles",
                            }
                        ],
                        "options": {
                            "sources": "",
                            "include_related": "false",
                        },
                    }
                ),
                encoding="utf-8",
            )
            completed = subprocess.run(
                [
                    sys.executable,
                    str(SKILL_DIR / "scripts" / "resolve_identities.py"),
                    "--request",
                    str(request_path),
                    "--fixture-responses",
                    str(fixtures),
                    "--output",
                    str(output),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(completed.returncode, 3)
            self.assertFalse(output.exists())
            self.assertIn("include_related", completed.stderr)

    def test_fixed_fixture_output_is_deterministic(self):
        fixtures_one = {
            "pubchem": response(
                property_payload(
                    2244,
                    "Aspirin",
                    ASPIRIN_SMILES,
                    ASPIRIN_INCHI,
                    ASPIRIN_KEY,
                    "C9H8O4",
                )
            )
        }
        fixtures_two = json.loads(json.dumps(fixtures_one))
        first = process([{"query": "aspirin"}], fixtures_one, {"pubchem"})
        second = process([{"query": "aspirin"}], fixtures_two, {"pubchem"})
        self.assertEqual(first, second)
        self.assertEqual(first["result_fingerprint"], second["result_fingerprint"])

    def test_validator_rejects_false_exact_and_sample_identity_upgrade(self):
        document = process(
            [{"query": "aspirin"}],
            {
                "pubchem": response(
                    property_payload(
                        2244,
                        "Aspirin",
                        ASPIRIN_SMILES,
                        ASPIRIN_INCHI,
                        ASPIRIN_KEY,
                        "C9H8O4",
                    )
                )
            },
            {"pubchem"},
        )
        resolution = document["resolutions"][0]
        resolution["record_alignment_status"] = "exact"
        resolution["sample_identity_status"] = "expert_confirmed"
        document["result_fingerprint"] = RESOLVER.output_fingerprint(document)
        report = VALIDATOR.validate(document)
        self.assertFalse(report["valid"])
        self.assertTrue(any("two independent" in item for item in report["errors"]))
        self.assertTrue(
            any("automatically upgraded" in item for item in report["errors"])
        )

    def test_validator_rejects_secret_and_fingerprint_tampering(self):
        document = process(
            [{"query": ASPIRIN_SMILES, "input_type": "smiles"}],
            {},
            set(),
        )
        document["notices"].append("Authorization: Bearer " + "A" * 24)
        report = VALIDATOR.validate(document)
        self.assertFalse(report["valid"])
        self.assertIn("possible secret detected in output", report["errors"])
        self.assertIn("result_fingerprint mismatch", report["errors"])

    def test_cli_and_output_validator_with_offline_structure(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "identity.json"
            command = [
                sys.executable,
                str(SKILL_DIR / "scripts" / "resolve_identities.py"),
                "--query",
                ASPIRIN_SMILES,
                "--input-type",
                "smiles",
                "--sources",
                "",
                "--generated-at",
                FIXED_TIME,
                "--output",
                str(output),
            ]
            completed = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(completed.returncode, 0, completed.stderr)
            validator = subprocess.run(
                [
                    sys.executable,
                    str(SKILL_DIR / "scripts" / "validate_output.py"),
                    str(output),
                ],
                capture_output=True,
                text=True,
            )
            self.assertEqual(validator.returncode, 0, validator.stdout)
            report = json.loads(validator.stdout)
            self.assertTrue(report["valid"], report)

    def test_cli_invalid_structure_returns_two_and_preserves_rejection(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "identity.json"
            completed = subprocess.run(
                [
                    sys.executable,
                    str(SKILL_DIR / "scripts" / "resolve_identities.py"),
                    "--query",
                    "CO(C)C",
                    "--input-type",
                    "smiles",
                    "--sources",
                    "",
                    "--generated-at",
                    FIXED_TIME,
                    "--output",
                    str(output),
                ],
                capture_output=True,
                text=True,
            )
            self.assertEqual(completed.returncode, 2, completed.stderr)
            document = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(document["input_summary"]["rejected"], 1)
            self.assertEqual(document["resolutions"][0]["candidates"], [])

    def test_cli_empty_invocation_fails_closed_without_output(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "identity.json"
            completed = subprocess.run(
                [
                    sys.executable,
                    str(SKILL_DIR / "scripts" / "resolve_identities.py"),
                    "--sources",
                    "",
                    "--output",
                    str(output),
                ],
                capture_output=True,
                text=True,
            )
            self.assertEqual(completed.returncode, 3)
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
