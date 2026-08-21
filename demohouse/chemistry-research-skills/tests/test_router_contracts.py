from __future__ import annotations

import hashlib
import importlib.util
import sys
from pathlib import Path
from typing import Any

import pytest


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
ROUTER_SCRIPTS = REPOSITORY_ROOT / "skills" / "chemistry-research-router" / "scripts"
SCHEMA_NAMES = {
    "research-intent-v1",
    "route-decision-v1",
    "clarification-request-v1",
    "attachment-manifest-v1",
    "router-execution-request-v1",
    "certification-record-v1",
    "route-confirmation-v1",
}


def load_router_module(name: str, filename: str) -> Any:
    path = ROUTER_SCRIPTS / filename
    assert path.is_file(), f"missing Router module: {filename}"
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def load_contracts() -> Any:
    return load_router_module(
        "router_contracts_under_test",
        "router_contracts.py",
    )


def load_schemas() -> Any:
    return load_router_module(
        "router_schema_validation_under_test",
        "schema_validation.py",
    )


def test_router_json_rejects_duplicate_keys_and_non_finite(tmp_path: Path) -> None:
    contracts = load_contracts()
    duplicate = tmp_path / "duplicate.json"
    duplicate.write_text('{"intent_id":"a","intent_id":"b"}', encoding="utf-8")
    non_finite = tmp_path / "non-finite.json"
    non_finite.write_text('{"value":NaN}', encoding="utf-8")

    with pytest.raises(contracts.RouterContractError, match="duplicate"):
        contracts.read_json_object(duplicate, "intent")
    with pytest.raises(contracts.RouterContractError, match="non-finite"):
        contracts.read_json_object(non_finite, "intent")
    with pytest.raises(contracts.RouterContractError, match="non-finite"):
        contracts.canonical_json({"value": float("inf")})


def test_router_fingerprint_excludes_only_declared_field() -> None:
    contracts = load_contracts()
    value = {
        "schema_version": "1.0.0",
        "intent_fingerprint": "old",
        "x": 1,
    }
    expected = hashlib.sha256(b'{"schema_version":"1.0.0","x":1}').hexdigest()

    assert contracts.sha256_json(value, "intent_fingerprint") == expected
    assert "intent_fingerprint" in value
    assert value["intent_fingerprint"] == "old"


def test_router_text_hash_preserves_unicode_without_normalization() -> None:
    contracts = load_contracts()
    composed = "\u00e9"
    decomposed = "e\u0301"

    assert (
        contracts.sha256_text(composed)
        == hashlib.sha256(composed.encode("utf-8")).hexdigest()
    )
    assert contracts.sha256_text(composed) != contracts.sha256_text(decomposed)


def test_router_json_reader_requires_top_level_object(tmp_path: Path) -> None:
    contracts = load_contracts()
    path = tmp_path / "array.json"
    path.write_text("[]", encoding="utf-8")

    with pytest.raises(contracts.RouterContractError, match="top level"):
        contracts.read_json_object(path, "intent")


def test_schema_loader_rejects_unknown_schema_name() -> None:
    schemas = load_schemas()

    assert set(schemas.SCHEMA_FILES) == SCHEMA_NAMES
    with pytest.raises(schemas.SchemaContractError, match="unsupported"):
        schemas.load_schema("../../unsafe.json")


def test_schema_validator_uses_draft_2020_12(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    schemas = load_schemas()
    schema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "required": ["value"],
        "properties": {"value": {"type": "integer"}},
        "unevaluatedProperties": False,
    }
    monkeypatch.setattr(schemas, "load_schema", lambda name: schema)

    assert schemas.validate_schema_instance(
        {"value": 1},
        "research-intent-v1",
    ) == {"value": 1}
    with pytest.raises(schemas.SchemaContractError, match="value"):
        schemas.validate_schema_instance(
            {"value": "wrong"},
            "research-intent-v1",
        )
    with pytest.raises(schemas.SchemaContractError, match="unexpected"):
        schemas.validate_schema_instance(
            {"value": 1, "unexpected": True},
            "research-intent-v1",
        )
