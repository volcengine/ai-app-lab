"""CLI facade for deterministic chemistry intent routing."""

from __future__ import annotations

import argparse
import importlib.util
import sys
from pathlib import Path
from typing import Any


def _load_sibling(name: str, filename: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


CONTRACTS = _load_sibling("route_cli_contracts", "router_contracts.py")
INTENT = _load_sibling("route_cli_intent", "validate_intent.py")
CATALOG = _load_sibling("route_cli_catalog", "route_catalog.py")
POLICY = _load_sibling("route_cli_policy", "policy_guard.py")
ENGINE = _load_sibling("route_cli_engine", "route_engine.py")
LAYOUT = _load_sibling("route_cli_runtime_layout", "runtime_layout.py")
REPOSITORY_ROOT = LAYOUT.repository_root(Path(__file__))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Route ResearchIntent V1")
    parser.add_argument("--intent", type=Path, required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--attachments", type=Path, required=True)
    parser.add_argument("--certificate", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser


def _read_source(path: Path) -> str:
    try:
        return path.read_bytes().decode("utf-8")
    except (OSError, UnicodeError) as error:
        raise ENGINE.RouteEngineError("source is not readable UTF-8") from error


def _write_new(path: Path, value: dict[str, Any]) -> None:
    if path.exists() or path.is_symlink():
        raise ENGINE.RouteEngineError("output already exists")
    try:
        with path.open("x", encoding="utf-8", newline="\n") as handle:
            handle.write(CONTRACTS.canonical_json(value) + "\n")
    except OSError as error:
        raise ENGINE.RouteEngineError("cannot write route output") from error


def route_from_files(args: argparse.Namespace) -> dict[str, Any]:
    intent = CONTRACTS.read_json_object(args.intent, "intent")
    attachments = CONTRACTS.read_json_object(
        args.attachments,
        "attachment manifest",
    )
    certificate = CONTRACTS.read_json_object(args.certificate, "certificate")
    validated = INTENT.validate_research_intent(
        intent,
        _read_source(args.source),
        attachments,
    )
    catalog = CATALOG.load_route_catalog(REPOSITORY_ROOT)
    policy = POLICY.evaluate_policy(validated, catalog, certificate)
    decision = ENGINE.route_intent(validated, catalog, policy, certificate)
    _write_new(args.output, decision)
    return decision


def main() -> int:
    args = build_parser().parse_args()
    try:
        decision = route_from_files(args)
    except (
        CONTRACTS.RouterContractError,
        INTENT.IntentValidationError,
        CATALOG.RouteCatalogError,
        ENGINE.RouteEngineError,
    ):
        print("route_intent: validation failed", file=sys.stderr)
        return 2
    print(
        CONTRACTS.canonical_json(
            {
                "decision_id": decision["decision_id"],
                "route_type": decision["route_type"],
                "targets": decision["targets"],
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
