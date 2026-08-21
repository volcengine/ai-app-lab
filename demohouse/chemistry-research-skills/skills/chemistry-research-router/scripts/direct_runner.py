"""Execute one registered direct Skill request through its public Adapter."""

from __future__ import annotations

import hashlib
import importlib.util
import stat
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class DirectRunnerError(ValueError):
    """Raised when a direct Skill request cannot execute safely."""


def _load_module(name: str, path: Path) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


LAYOUT = _load_module(
    "router_direct_runtime_layout",
    Path(__file__).with_name("runtime_layout.py"),
)
REPOSITORY_ROOT = LAYOUT.repository_root(Path(__file__))
WORKFLOW_SCRIPTS = REPOSITORY_ROOT / "workflows" / "scripts"
ADAPTERS = _load_module(
    "router_direct_adapters",
    WORKFLOW_SCRIPTS / "skill_adapters.py",
)
REGISTRY = _load_module(
    "router_direct_registry",
    WORKFLOW_SCRIPTS / "artifact_registry.py",
)
CONTRACTS = _load_module(
    "router_direct_contracts",
    WORKFLOW_SCRIPTS / "workflow_contracts.py",
)
PREPARATION = _load_module(
    "router_direct_preparation",
    Path(__file__).with_name("direct_preparation.py"),
)
STAGING = _load_module(
    "router_direct_staging",
    Path(__file__).with_name("target_staging.py"),
)
TARGET_ADAPTERS = PREPARATION.TARGET_ADAPTERS
prepare_direct = PREPARATION.prepare_direct


@dataclass(frozen=True)
class DirectRunResult:
    status: str
    exit_code: int
    target_id: str
    run_dir: Path
    output_path: Path


def _write_json(path: Path, value: dict[str, Any]) -> None:
    REGISTRY.atomic_write_bytes(
        path,
        (CONTRACTS.canonical_json(value) + "\n").encode("utf-8"),
    )


def _create_run_directory(run_dir: Path) -> None:
    declared = run_dir if run_dir.is_absolute() else Path.cwd() / run_dir
    current = Path(declared.anchor)
    for part in declared.parts[1:]:
        current = current / part
        if current.is_symlink():
            raise DirectRunnerError("direct run path contains a symlink")
    if run_dir.exists():
        raise DirectRunnerError("direct run directory already exists")
    try:
        run_dir.parent.mkdir(parents=True, exist_ok=True)
        if run_dir.parent.is_symlink():
            raise DirectRunnerError("direct run parent is a symlink")
        run_dir.mkdir()
    except FileExistsError as error:
        raise DirectRunnerError("direct run directory already exists") from error
    except OSError as error:
        raise DirectRunnerError(
            f"direct run directory cannot be created: {error}"
        ) from error


def start_direct(
    request: dict[str, Any],
    run_dir: Path,
    repository_root: Path,
    *,
    execution_request: dict[str, Any] | None = None,
    request_base: Path | None = None,
) -> DirectRunResult:
    """Execute one direct target through the fixed Adapter registry."""
    if run_dir.exists() or run_dir.is_symlink():
        raise DirectRunnerError("direct run directory already exists")
    target_id = request["target_id"]
    adapter_id = TARGET_ADAPTERS.get(target_id)
    if adapter_id is None:
        raise DirectRunnerError(f"unsupported direct target: {target_id}")
    _create_run_directory(run_dir)
    if execution_request is not None:
        try:
            STAGING.stage_inputs(
                execution_request,
                request_base,
                run_dir,
                REGISTRY.atomic_write_bytes,
            )
        except STAGING.TargetStagingError as error:
            raise DirectRunnerError(str(error)) from error
    _write_json(run_dir / "direct_request.json", request)
    output_path = run_dir / "output.json"
    adapter = ADAPTERS.ADAPTERS[adapter_id]
    try:
        prepared = prepare_direct(request, run_dir)
    except PREPARATION.DirectPreparationError as error:
        raise DirectRunnerError(str(error)) from error
    argv = ADAPTERS.build_command(adapter_id, prepared.command_context)
    result = ADAPTERS.execute_adapter(
        adapter,
        argv,
        repository_root=repository_root,
        timeout_seconds=180,
    )
    ADAPTERS.accept_process_result(adapter, result, prepared.output_path)
    REGISTRY.atomic_write_bytes(output_path, prepared.output_path.read_bytes())
    prepared.output_path.unlink(missing_ok=True)
    validation = ADAPTERS.run_validator(
        adapter,
        output_path,
        repository_root=repository_root,
        timeout_seconds=180,
    )
    _write_json(run_dir / "validation.json", validation)
    document = CONTRACTS.read_json_object(output_path, "direct Skill output")
    domain_state = ADAPTERS.extract_domain_state(adapter, document)
    status = (
        "completed"
        if domain_state in {"completed", "ready_for_standardization"}
        else (
            "completed_with_review" if domain_state == "review_required" else "blocked"
        )
    )
    report = {
        "schema_version": "1.0.0",
        "valid": True,
        "target_id": target_id,
        "adapter_id": adapter_id,
        "domain_state": domain_state,
        "status": status,
        "request_sha256": hashlib.sha256(
            (run_dir / "direct_request.json").read_bytes()
        ).hexdigest(),
        "output_sha256": hashlib.sha256(output_path.read_bytes()).hexdigest(),
    }
    _write_json(run_dir / "direct_report.json", report)
    return DirectRunResult(
        status=status,
        exit_code=0 if status.startswith("completed") else 2,
        target_id=target_id,
        run_dir=run_dir,
        output_path=output_path,
    )


def _input_errors(
    run_dir: Path,
    request: dict[str, Any],
) -> list[str]:
    errors = []
    for item in request["inputs"]["artifacts"]:
        declared = Path(item["path"])
        if declared.is_absolute() or declared == Path(".") or ".." in declared.parts:
            errors.append("direct input path is unsafe")
            continue
        path = run_dir / declared
        if path.is_symlink() or not path.is_file():
            errors.append(f"direct input is missing: {declared.as_posix()}")
            continue
        path_stat = path.stat()
        if not stat.S_ISREG(path_stat.st_mode) or path_stat.st_nlink != 1:
            errors.append(f"direct input is unsafe: {declared.as_posix()}")
            continue
        if hashlib.sha256(path.read_bytes()).hexdigest() != item["sha256"]:
            errors.append(f"direct input SHA-256 mismatch: {declared.as_posix()}")
    return errors


def validate_direct_run(
    run_dir: Path,
    repository_root: Path,
) -> dict[str, Any]:
    """Re-run the registered Validator and compare the stored output hash."""
    try:
        request = CONTRACTS.read_json_object(
            run_dir / "direct_request.json",
            "direct request",
        )
        report = CONTRACTS.read_json_object(
            run_dir / "direct_report.json",
            "direct report",
        )
        output_path = run_dir / "output.json"
        adapter = ADAPTERS.ADAPTERS[TARGET_ADAPTERS[request["target_id"]]]
        ADAPTERS.run_validator(
            adapter,
            output_path,
            repository_root=repository_root,
            timeout_seconds=180,
        )
        actual_hash = hashlib.sha256(output_path.read_bytes()).hexdigest()
        request_hash = hashlib.sha256(
            (run_dir / "direct_request.json").read_bytes()
        ).hexdigest()
        errors = _input_errors(run_dir, request)
        if report["request_sha256"] != request_hash:
            errors.append("direct request SHA-256 mismatch")
        if report["output_sha256"] != actual_hash:
            errors.append("direct output SHA-256 mismatch")
    except (
        KeyError,
        CONTRACTS.ContractError,
        ADAPTERS.AdapterError,
        OSError,
    ) as error:
        errors = [str(error)]
    return {
        "schema_version": "1.0.0",
        "valid": not errors,
        "errors": errors,
    }
