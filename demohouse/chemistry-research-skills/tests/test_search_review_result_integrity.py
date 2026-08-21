from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FIXTURE_PATH = ROOT / "tests" / "test_search_review_contract.py"


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


FIXTURES = load_module("search_review_result_fixtures", FIXTURE_PATH)


def issue_codes(artifact):
    return {
        item["code"]
        for item in FIXTURES.load_contract().validate_searched_artifact(artifact)
    }


def rehash(artifact):
    FIXTURES.rehash_result(artifact["results"][0])
    FIXTURES.rehash_artifact(artifact)


class SearchReviewResultIntegrityTests(unittest.TestCase):
    def test_ready_result_cannot_hide_quality_findings(self):
        artifact = FIXTURES.make_search_artifact()
        artifact["results"][0]["quality_findings"] = [
            {"code": "E-FABRICATED-001", "severity": "error"}
        ]
        rehash(artifact)
        self.assertIn("E-SEARCH-RESULT-001", issue_codes(artifact))

    def test_result_rejects_invalid_or_failed_participant_binding(self):
        for status in ("garbage", "failed"):
            with self.subTest(status=status):
                artifact = FIXTURES.make_search_artifact()
                artifact["results"][0]["participants"][0]["upstream_binding_status"] = (
                    status
                )
                rehash(artifact)
                self.assertIn("E-SEARCH-RESULT-001", issue_codes(artifact))

    def test_result_source_and_license_must_preserve_auditable_types(self):
        mutations = (
            ("source", "fabricated"),
            ("license", []),
            ("license", ""),
        )
        for field, value in mutations:
            with self.subTest(field=field, value=value):
                artifact = FIXTURES.make_search_artifact()
                artifact["results"][0][field] = value
                rehash(artifact)
                self.assertIn("E-SEARCH-RESULT-001", issue_codes(artifact))
