import importlib.util
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "skills" / "resolve-chemical-identities" / "scripts"


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


RESOLVER = load_module(
    "resolve_refactor_facade",
    SCRIPTS / "resolve_identities.py",
)
TOOLKIT = RESOLVER.load_toolkit()


class ResolveRefactorContractTests(unittest.TestCase):
    def test_request_and_transport_modules_are_publicly_wired(self):
        request_contract = load_module(
            "identity_request_contract_test",
            SCRIPTS / "identity_request_contract.py",
        )
        transport = load_module(
            "identity_transport_test",
            SCRIPTS / "identity_transport.py",
        )
        request = {"query": "CCO", "input_type": "smiles"}

        self.assertEqual(
            RESOLVER.validate_request(request, TOOLKIT),
            request_contract.validate_request(request, TOOLKIT),
        )
        self.assertTrue(hasattr(RESOLVER, "HttpTransport"))
        self.assertTrue(hasattr(RESOLVER, "FixtureTransport"))
        self.assertEqual(transport.HttpTransport.__name__, "HttpTransport")
        self.assertEqual(transport.FixtureTransport.__name__, "FixtureTransport")

    def test_source_modules_match_facade_behavior(self):
        primary = load_module(
            "identity_sources_primary_test",
            SCRIPTS / "identity_sources_primary.py",
        )
        registry = load_module(
            "identity_sources_registry_test",
            SCRIPTS / "identity_sources_registry.py",
        )
        fixtures = {
            "opsin": {
                "status": "success",
                "http_status": 200,
                "payload": {
                    "status": "SUCCESS",
                    "chemicalName": "aspirin",
                    "smiles": "CC(=O)Oc1ccccc1C(=O)O",
                    "stdinchi": "InChI=1S/C9H8O4",
                    "stdinchikey": "BSYNRYMUTXBXSQ-UHFFFAOYSA-N",
                },
            }
        }

        def clock():
            return "2026-08-17T00:00:00Z"

        facade_transport = RESOLVER.FixtureTransport(fixtures, clock=clock)
        module_transport = RESOLVER.FixtureTransport(fixtures, clock=clock)

        facade_records, facade_logs = RESOLVER.fetch_opsin(
            "aspirin",
            facade_transport,
        )
        module_records, module_logs = primary.fetch_opsin(
            "aspirin",
            module_transport,
        )

        self.assertEqual(facade_records, module_records)
        self.assertEqual(facade_logs, module_logs)
        self.assertTrue(hasattr(registry, "fetch_chembl_by_name"))
        self.assertTrue(hasattr(registry, "fetch_unichem_exact"))

    def test_candidate_and_standardization_modules_match_facade_behavior(self):
        candidates = load_module(
            "identity_candidates_test",
            SCRIPTS / "identity_candidates.py",
        )
        standardization = load_module(
            "identity_standardization_test",
            SCRIPTS / "identity_standardization.py",
        )
        validated = RESOLVER.validate_request(
            {"query": "CCO", "input_type": "smiles"},
            TOOLKIT,
        )
        source_record = validated["local_record"]

        facade_result = RESOLVER.aggregate_candidates(
            [source_record],
            TOOLKIT,
        )
        module_result = candidates.aggregate_candidates(
            [source_record],
            TOOLKIT,
        )

        self.assertEqual(facade_result, module_result)
        self.assertEqual(
            facade_result[0][0]["inchikey"],
            "LFQSCWFLJHTTHZ-UHFFFAOYSA-N",
        )
        self.assertEqual(
            RESOLVER.standardizer_identifier(None),
            standardization.standardizer_identifier(None),
        )

    def test_alignment_and_output_contract_modules_preserve_public_surface(self):
        alignment = load_module(
            "identity_alignment_test",
            SCRIPTS / "identity_alignment.py",
        )
        output_contract = load_module(
            "identity_output_contract_test",
            SCRIPTS / "identity_output_contract.py",
        )
        validated = RESOLVER.validate_request(
            {"query": "CCO", "input_type": "smiles"},
            TOOLKIT,
        )
        candidates, unresolved, conflicts = RESOLVER.aggregate_candidates(
            [validated["local_record"]],
            TOOLKIT,
        )

        facade_alignment = RESOLVER.determine_alignment(
            validated,
            candidates,
            unresolved,
            conflicts,
            "not_run",
        )
        module_alignment = alignment.determine_alignment(
            validated,
            candidates,
            unresolved,
            conflicts,
            "not_run",
        )

        self.assertEqual(facade_alignment, module_alignment)
        document = {
            "workflow": "chemical-identity-resolution",
            "generated_at_utc": "2026-08-17T00:00:00Z",
            "resolutions": [],
        }
        self.assertEqual(
            RESOLVER.output_fingerprint(document),
            output_contract.output_fingerprint(document),
        )
        public = {
            "validate_request",
            "HttpTransport",
            "FixtureTransport",
            "fetch_opsin",
            "fetch_pubchem",
            "fetch_chembl_by_name",
            "fetch_unichem_exact",
            "aggregate_candidates",
            "apply_standardization_views",
            "determine_alignment",
            "build_handoff",
            "resolve_one",
            "process_requests",
            "output_fingerprint",
        }
        self.assertLessEqual(public, set(dir(RESOLVER)))

    def test_output_contract_matches_validator_behavior(self):
        output_contract = load_module(
            "identity_output_contract_behavior_test",
            SCRIPTS / "identity_output_contract.py",
        )
        validator = load_module(
            "identity_output_validator_behavior_test",
            SCRIPTS / "validate_output.py",
        )
        document = RESOLVER.process_requests(
            [{"id": "ethanol", "query": "CCO", "input_type": "smiles"}],
            transport=RESOLVER.FixtureTransport({}),
            enabled_sources=(),
            use_standardizer=False,
            generated_at_utc="2026-08-17T00:00:00Z",
        )

        errors, warnings = output_contract.validate_document(document)
        report = validator.validate(document)

        self.assertEqual(errors, report["errors"])
        self.assertEqual(warnings, report["warnings"])

        document["resolutions"][0]["sample_identity_status"] = "confirmed"
        document["result_fingerprint"] = RESOLVER.output_fingerprint(document)
        errors, _ = output_contract.validate_document(document)
        self.assertTrue(
            any("sample_identity_status" in item for item in errors),
            errors,
        )

    def test_pipeline_module_matches_facade_document(self):
        pipeline = load_module(
            "identity_pipeline_test",
            SCRIPTS / "identity_pipeline.py",
        )
        requests = [{"id": "ethanol", "query": "CCO", "input_type": "smiles"}]
        facade = RESOLVER.process_requests(
            requests,
            transport=RESOLVER.FixtureTransport({}),
            enabled_sources=(),
            use_standardizer=False,
            generated_at_utc="2026-08-17T00:00:00Z",
        )
        module = pipeline.process_requests(
            requests,
            transport=RESOLVER.FixtureTransport({}),
            enabled_sources=(),
            use_standardizer=False,
            generated_at_utc="2026-08-17T00:00:00Z",
        )

        self.assertEqual(module, facade)

    def test_output_contract_rejects_rehashed_boolean_total_requests(self):
        validator = load_module(
            "identity_output_validator_boolean_count_test",
            SCRIPTS / "validate_output.py",
        )
        document = RESOLVER.process_requests(
            [{"id": "ethanol", "query": "CCO", "input_type": "smiles"}],
            transport=RESOLVER.FixtureTransport({}),
            enabled_sources=(),
            use_standardizer=False,
            generated_at_utc="2026-08-17T00:00:00Z",
        )
        document["input_summary"]["total_requests"] = True
        document["result_fingerprint"] = RESOLVER.output_fingerprint(document)

        report = validator.validate(document)

        self.assertFalse(report["valid"])
        self.assertTrue(
            any("input_summary.total_requests" in item for item in report["errors"]),
            report,
        )
