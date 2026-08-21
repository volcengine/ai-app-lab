"""Unified CLI for routing and executing registered chemistry targets."""

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


CONTRACTS = _load_sibling("router_cli_contracts", "router_contracts.py")
TARGETS = _load_sibling("router_cli_targets", "target_runner.py")
INTENT = _load_sibling("router_cli_intent", "validate_intent.py")
CATALOG = _load_sibling("router_cli_catalog", "route_catalog.py")
POLICY = _load_sibling("router_cli_policy", "policy_guard.py")
ENGINE = _load_sibling("router_cli_engine", "route_engine.py")
BUILDERS = _load_sibling("router_cli_builders", "request_builders.py")
CERTIFICATES = _load_sibling(
    "router_cli_certificates",
    "certification_contract.py",
)
AUTHORIZATION = _load_sibling(
    "router_cli_authorization",
    "execution_authorization.py",
)
INSTALLATION = _load_sibling(
    "router_cli_installation",
    "validate_installation.py",
)
LAYOUT = _load_sibling("router_cli_runtime_layout", "runtime_layout.py")
REPOSITORY_ROOT = LAYOUT.repository_root(Path(__file__))


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="action", required=True)
    execute = subparsers.add_parser("execute")
    execute.add_argument("--request", type=Path, required=True)
    execute.add_argument("--decision", type=Path, required=True)
    execute.add_argument("--confirmation", type=Path)
    execute.add_argument("--run-dir", type=Path, required=True)
    execute.add_argument("--installation-receipt", type=Path, required=True)
    route = subparsers.add_parser("route")
    route.add_argument("--intent", type=Path, required=True)
    route.add_argument("--source", type=Path, required=True)
    route.add_argument("--attachments", type=Path, required=True)
    route.add_argument("--certificate", type=Path, required=True)
    route.add_argument("--decision", type=Path, required=True)
    route.add_argument("--request", type=Path, required=True)
    resume = subparsers.add_parser("resume")
    resume.add_argument("--run-dir", type=Path, required=True)
    resume.add_argument("--decision", type=Path)
    resume.add_argument("--installation-receipt", type=Path, required=True)
    return parser


def _runtime_root(receipt_path: Path) -> Path:
    receipt = INSTALLATION.validate_installation(receipt_path)
    return Path(receipt["runtime_root"])


def _execute(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    repository_root = _runtime_root(args.installation_receipt)
    request = CONTRACTS.read_json_object(args.request, "execution request")
    decision = CONTRACTS.read_json_object(args.decision, "route decision")
    decision = TARGETS.DECISIONS.validate_route_decision(decision)
    confirmation = (
        CONTRACTS.read_json_object(args.confirmation, "route confirmation")
        if args.confirmation is not None
        else None
    )
    if decision["execution_mode"] == "confirmation_required" and confirmation is None:
        return {
            "status": "confirmation_required",
            "target_id": request["target_id"],
            "run_dir": str(args.run_dir),
        }, 12
    if decision["execution_mode"] == "manual_target_required":
        return {
            "status": "manual_target_required",
            "target_id": request["target_id"],
            "run_dir": str(args.run_dir),
        }, 13
    result = TARGETS.run_target(
        request,
        args.run_dir,
        repository_root,
        confirmation,
        decision=decision,
        request_base=args.request.parent,
    )
    return {
        "status": result.status,
        "target_id": request["target_id"],
        "run_dir": str(result.run_dir),
    }, result.exit_code


def _read_source(path: Path) -> str:
    try:
        return path.read_bytes().decode("utf-8")
    except (OSError, UnicodeError) as error:
        raise TARGETS.RouterExecutionError("source is not readable UTF-8") from error


def _write_new(path: Path, value: dict[str, Any]) -> None:
    if path.exists() or path.is_symlink():
        raise TARGETS.RouterExecutionError("Router output already exists")
    try:
        with path.open("x", encoding="utf-8", newline="\n") as handle:
            handle.write(CONTRACTS.canonical_json(value) + "\n")
    except OSError as error:
        raise TARGETS.RouterExecutionError("cannot write Router output") from error


def _require_new_outputs(*paths: Path) -> None:
    if any(path.exists() or path.is_symlink() for path in paths):
        raise TARGETS.RouterExecutionError("Router output already exists")


def _route(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    _require_new_outputs(args.decision, args.request)
    intent = CONTRACTS.read_json_object(args.intent, "intent")
    attachments = CONTRACTS.read_json_object(
        args.attachments,
        "attachment manifest",
    )
    certificate = CONTRACTS.read_json_object(
        args.certificate,
        "certification record",
    )
    validated = INTENT.validate_research_intent(
        intent,
        _read_source(args.source),
        attachments,
    )
    catalog = CATALOG.load_route_catalog(REPOSITORY_ROOT)
    certificate = CERTIFICATES.validate_certification_record(
        certificate,
        {
            "router_skill_fingerprint": validated["recognizer"][
                "router_skill_fingerprint"
            ],
            "catalog_fingerprint": catalog["catalog_fingerprint"],
            "schema_fingerprint": validated["recognizer"]["schema_fingerprint"],
        },
    )
    policy = POLICY.evaluate_policy(validated, catalog, certificate)
    decision = ENGINE.route_intent(
        validated,
        catalog,
        policy,
        certificate,
    )
    if decision["route_type"] in {"clarification_required", "unsupported"}:
        _write_new(args.decision, decision)
        return {
            "status": decision["decision_status"],
            "decision_id": decision["decision_id"],
            "target_id": None,
            "execution_mode": decision["execution_mode"],
        }, 10 if decision["route_type"] == "clarification_required" else 11
    request = BUILDERS.build_execution_request(
        validated,
        decision,
        catalog,
        args.intent.parent,
    )
    decision, request = AUTHORIZATION.apply_authorization(
        validated,
        decision,
        certificate,
        request,
    )
    _write_new(args.decision, decision)
    _write_new(args.request, request)
    return {
        "status": decision["decision_status"],
        "decision_id": decision["decision_id"],
        "target_id": request["target_id"],
        "execution_mode": decision["execution_mode"],
    }, 0


def _resume(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    repository_root = _runtime_root(args.installation_receipt)
    if (args.run_dir / "chain_request.json").is_file():
        result = TARGETS.CHAIN.resume_chain(
            args.run_dir,
            repository_root,
            args.decision,
        )
        target_id = CONTRACTS.read_json_object(
            args.run_dir / "chain_request.json",
            "chain request",
        )["target_id"]
    elif (args.run_dir / "workflow-run" / "workflow_request.json").is_file():
        workflow_dir = args.run_dir / "workflow-run"
        result = TARGETS.WORKFLOW.resume_run(
            workflow_dir,
            repository_root,
            args.decision,
        )
        target_id = CONTRACTS.read_json_object(
            workflow_dir / "workflow_request.json",
            "workflow request",
        )["workflow_id"]
    elif (args.run_dir / "workflow_request.json").is_file():
        result = TARGETS.WORKFLOW.resume_run(
            args.run_dir,
            repository_root,
            args.decision,
        )
        target_id = CONTRACTS.read_json_object(
            args.run_dir / "workflow_request.json",
            "workflow request",
        )["workflow_id"]
    else:
        raise TARGETS.RouterExecutionError("run directory type is unsupported")
    return {
        "status": result.status,
        "target_id": target_id,
        "run_dir": str(result.run_dir),
    }, result.exit_code


def main() -> int:
    args = _parser().parse_args()
    try:
        if args.action == "execute":
            summary, exit_code = _execute(args)
        elif args.action == "route":
            summary, exit_code = _route(args)
        elif args.action == "resume":
            summary, exit_code = _resume(args)
        else:
            raise TARGETS.RouterExecutionError("unsupported Router action")
    except (
        CONTRACTS.RouterContractError,
        TARGETS.RouterExecutionError,
        INTENT.IntentValidationError,
        CATALOG.RouteCatalogError,
        ENGINE.RouteEngineError,
        BUILDERS.RequestBuilderError,
        CERTIFICATES.CertificationContractError,
        INSTALLATION.InstallationIntegrityError,
        TARGETS.DECISIONS.DecisionContractError,
        TARGETS.REQUESTS.RequestContractError,
    ):
        print("run_router: execution failed", file=sys.stderr)
        return 2
    print(CONTRACTS.canonical_json(summary))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
