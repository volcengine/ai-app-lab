"""Controlled CLI adapters for the seven public chemistry skills."""

from __future__ import annotations

import argparse
import importlib.util
import json
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class AdapterSpec:
    adapter_id: str
    adapter_version: str
    skill_id: str
    entrypoint: str
    validator: str
    accepted_completion_codes: frozenset[int]
    artifact_workflow: str
    artifact_schema_version: str
    extractor_id: str
    required_context: frozenset[str]
    optional_context: frozenset[str]
    validator_report_format: str = "json"
    validator_success_text: str | None = None


@dataclass(frozen=True)
class ProcessResult:
    returncode: int
    stdout: str
    stderr: str


class AdapterError(ValueError):
    """Raised when an adapter boundary fails closed."""


def _reject_non_finite(value: str) -> Any:
    raise AdapterError(f"validator JSON contains non-finite value: {value}")


def _load_local_module(filename: str, module_name: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


COMMANDS = _load_local_module(
    "skill_adapter_commands.py",
    "skill_adapter_commands_local",
)
STATES = _load_local_module(
    "skill_adapter_states.py",
    "skill_adapter_states_local",
)


def _spec(
    skill_id: str,
    entrypoint: str,
    accepted_codes: set[int],
    artifact_workflow: str,
    extractor_id: str,
    required_context: set[str],
    optional_context: set[str] | None = None,
    validator_report_format: str = "json",
    validator_success_text: str | None = None,
) -> AdapterSpec:
    return AdapterSpec(
        adapter_id=f"{skill_id}-v1",
        adapter_version="1.0.0",
        skill_id=skill_id,
        entrypoint=f"skills/{skill_id}/scripts/{entrypoint}",
        validator=f"skills/{skill_id}/scripts/validate_output.py",
        accepted_completion_codes=frozenset(accepted_codes),
        artifact_workflow=artifact_workflow,
        artifact_schema_version="1.0.0",
        extractor_id=extractor_id,
        required_context=frozenset(required_context),
        optional_context=frozenset(optional_context or set()),
        validator_report_format=validator_report_format,
        validator_success_text=validator_success_text,
    )


IO_CONTEXT = {"input_path", "output_path"}
ADAPTERS = {
    "resolve-chemical-identities-v1": _spec(
        "resolve-chemical-identities",
        "resolve_identities.py",
        {0, 2},
        "chemical-identity-resolution",
        "identity",
        {
            "request_path",
            "sources",
            "include_related",
            "use_standardizer",
            "standardization_profile",
            "timeout_seconds",
            "retries",
            "generated_at_utc",
            "output_path",
        },
    ),
    "standardize-chemical-structures-v1": _spec(
        "standardize-chemical-structures",
        "standardize_structures.py",
        {0, 2},
        "chemical-structure-standardization",
        "standardize",
        {
            "input_path",
            "input_format",
            "profile",
            "generated_at_utc",
            "output_path",
        },
    ),
    "compute-molecular-features-v1": _spec(
        "compute-molecular-features",
        "compute_features.py",
        {0, 2},
        "molecular-feature-computation",
        "features",
        {
            "input_path",
            "input_format",
            "calculation_view",
            "generated_at_utc",
            "output_path",
        },
    ),
    "search-and-curate-chemical-libraries-v1": _spec(
        "search-and-curate-chemical-libraries",
        "search_and_curate.py",
        {0, 2},
        "chemical-library-search-and-curation",
        "library",
        {"request_path", "generated_at_utc", "output_path"},
    ),
    "curate-reactions-v1": _spec(
        "curate-reactions",
        "curate_reactions.py",
        {0, 1},
        "reaction-curation",
        "curate",
        IO_CONTEXT,
        validator_report_format="success_text",
        validator_success_text=(
            "curate-reactions \u8f93\u51fa\u5951\u7ea6\u6821\u9a8c\u901a\u8fc7\u3002"
        ),
    ),
    "search-reactions-v1": _spec(
        "search-reactions",
        "search_reactions.py",
        {0, 1},
        "reaction-precedent-search",
        "search",
        IO_CONTEXT,
    ),
    "review-routes-v1": _spec(
        "review-routes",
        "review_routes.py",
        {0, 1},
        "synthesis-route-review",
        "review",
        IO_CONTEXT,
    ),
}


def build_command(adapter_id: str, context: Any) -> list[str]:
    adapter = ADAPTERS.get(adapter_id)
    if adapter is None:
        raise AdapterError(f"unsupported adapter_id: {adapter_id}")
    try:
        return COMMANDS.build_command(adapter, context)
    except COMMANDS.CommandContractError as error:
        raise AdapterError(str(error)) from error


def _resolve_entrypoint(
    repository_root: Path,
    declared: str,
) -> Path:
    try:
        root = repository_root.resolve(strict=True)
        path = (root / declared).resolve(strict=True)
        path.relative_to(root)
    except (OSError, ValueError) as error:
        raise AdapterError("adapter entrypoint is missing or unsafe") from error
    if not path.is_file() or path.is_symlink():
        raise AdapterError("adapter entrypoint must be a regular file")
    return path


def execute_adapter(
    adapter: AdapterSpec,
    argv: list[str],
    *,
    repository_root: Path,
    timeout_seconds: float | None,
) -> ProcessResult:
    if len(argv) < 2:
        raise AdapterError("adapter command is incomplete")
    if Path(argv[0]).resolve() != Path(sys.executable).resolve():
        raise AdapterError("adapter must use the current Python executable")
    expected = _resolve_entrypoint(repository_root, adapter.entrypoint)
    declared = Path(argv[1])
    actual = (
        declared.resolve()
        if declared.is_absolute()
        else (repository_root / declared).resolve()
    )
    if actual != expected:
        raise AdapterError("adapter entrypoint does not match registry")
    try:
        completed = subprocess.run(
            argv,
            cwd=repository_root,
            capture_output=True,
            text=True,
            check=False,
            timeout=timeout_seconds,
            shell=False,
        )
    except subprocess.TimeoutExpired as error:
        raise AdapterError("adapter process timed out") from error
    return ProcessResult(
        returncode=completed.returncode,
        stdout=completed.stdout,
        stderr=completed.stderr,
    )


def accept_process_result(
    adapter: AdapterSpec,
    result: ProcessResult,
    output_path: Path,
) -> Path:
    if result.returncode not in adapter.accepted_completion_codes:
        raise AdapterError(f"adapter process failed with exit code {result.returncode}")
    if (
        output_path.is_symlink()
        or not output_path.is_file()
        or output_path.stat().st_nlink != 1
    ):
        raise AdapterError("output artifact is missing or unsafe")
    return output_path


def _validator_report(
    adapter: AdapterSpec,
    completed: subprocess.CompletedProcess[str],
) -> dict[str, Any]:
    if adapter.validator_report_format == "success_text":
        message = completed.stdout.strip()
        if (
            completed.returncode != 0
            or not adapter.validator_success_text
            or message != adapter.validator_success_text
        ):
            raise AdapterError("validator success text is invalid")
        return {
            "valid": True,
            "errors": [],
            "message": message,
        }
    if adapter.validator_report_format != "json":
        raise AdapterError("validator report format is unsupported")
    try:
        report = json.loads(
            completed.stdout,
            parse_constant=_reject_non_finite,
        )
    except json.JSONDecodeError as error:
        raise AdapterError("validator JSON report is invalid") from error
    if not isinstance(report, dict):
        raise AdapterError("validator JSON report must be an object")
    return report


def run_validator(
    adapter: AdapterSpec,
    output_path: Path,
    *,
    repository_root: Path,
    timeout_seconds: float | None,
) -> dict[str, Any]:
    validator = _resolve_entrypoint(repository_root, adapter.validator)
    try:
        completed = subprocess.run(
            [sys.executable, str(validator), str(output_path)],
            cwd=repository_root,
            capture_output=True,
            text=True,
            check=False,
            timeout=timeout_seconds,
            shell=False,
        )
    except subprocess.TimeoutExpired as error:
        raise AdapterError("validator process timed out") from error
    report = _validator_report(adapter, completed)
    if completed.returncode != 0 or report.get("valid") is not True:
        raise AdapterError("validator rejected output artifact")
    return report


def extract_domain_state(
    adapter: AdapterSpec,
    artifact: Any,
) -> str:
    try:
        return STATES.extract_domain_state(adapter, artifact)
    except STATES.DomainStateError as error:
        raise AdapterError(str(error)) from error


def self_check(repository_root: Path) -> dict[str, Any]:
    errors: list[str] = []
    skill_ids: set[str] = set()
    for adapter_id, adapter in sorted(ADAPTERS.items()):
        if adapter.skill_id in skill_ids:
            errors.append(f"{adapter_id}: duplicate skill_id")
        skill_ids.add(adapter.skill_id)
        for label, path in (
            ("entrypoint", adapter.entrypoint),
            ("validator", adapter.validator),
        ):
            try:
                _resolve_entrypoint(repository_root, path)
            except AdapterError as error:
                errors.append(f"{adapter_id}.{label}: {error}")
        if not adapter.accepted_completion_codes:
            errors.append(f"{adapter_id}: no accepted completion codes")
        if adapter.validator_report_format not in {"json", "success_text"}:
            errors.append(f"{adapter_id}: unsupported validator report format")
        if (
            adapter.validator_report_format == "success_text"
            and not adapter.validator_success_text
        ):
            errors.append(f"{adapter_id}: missing validator success text")
    return {
        "valid": not errors and len(ADAPTERS) == 7,
        "adapter_count": len(ADAPTERS),
        "errors": errors,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-check", action="store_true", required=True)
    args = parser.parse_args()
    if not args.self_check:
        return 2
    repository_root = Path(__file__).resolve().parents[2]
    report = self_check(repository_root)
    print(json.dumps(report, ensure_ascii=False, sort_keys=True))
    return 0 if report["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
