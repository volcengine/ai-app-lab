"""Node input staging and registered Adapter execution for bounded chains."""

from __future__ import annotations

import hashlib
import importlib.util
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class ChainNodeError(ValueError):
    """Raised when a chain node cannot construct a controlled handoff."""


def _load_module(name: str, path: Path) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def _load_sibling(name: str, filename: str) -> Any:
    return _load_module(name, Path(__file__).with_name(filename))


LAYOUT = _load_sibling("router_chain_node_runtime_layout", "runtime_layout.py")
REPOSITORY_ROOT = LAYOUT.repository_root(Path(__file__))
WORKFLOW_SCRIPTS = REPOSITORY_ROOT / "workflows" / "scripts"
HANDOFFS = _load_sibling("router_chain_node_handoffs", "chain_handoffs.py")
CONTRACTS = _load_module(
    "router_chain_node_contracts",
    WORKFLOW_SCRIPTS / "workflow_contracts.py",
)
LEDGER = _load_module(
    "router_chain_node_ledger",
    WORKFLOW_SCRIPTS / "event_ledger.py",
)
REGISTRY = _load_module(
    "router_chain_node_registry",
    WORKFLOW_SCRIPTS / "artifact_registry.py",
)
STATE = _load_module(
    "router_chain_node_state",
    WORKFLOW_SCRIPTS / "workflow_state.py",
)
ADAPTERS = _load_module(
    "router_chain_node_adapters",
    WORKFLOW_SCRIPTS / "skill_adapters.py",
)
GATE_RESUME = _load_module(
    "router_chain_node_gate_resume",
    WORKFLOW_SCRIPTS / "workflow_runner_gates.py",
)
A_NODES = _load_module(
    "router_chain_node_workflow_a",
    WORKFLOW_SCRIPTS / "workflow_a_nodes.py",
)
A_ADAPTERS = A_NODES.ADAPTER_NODES
CTX = A_NODES.CTX
A_NODE_IDS = {
    "resolve-identities",
    "identity-gate",
    "build-standardization-input",
    "standardize-structures",
    "calculation-view-gate",
    "compute-features",
}


def recorded_at() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def make_run_id(request_fingerprint: str) -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"run-{timestamp}-{request_fingerprint[:12]}-{uuid.uuid4().hex[:8]}"


def exit_code(status: str) -> int:
    return {
        "completed": 0,
        "completed_with_review": 0,
        "blocked": 2,
        "failed_integrity": 4,
        "failed_execution": 5,
        "awaiting_human": 10,
    }.get(status, 3)


def _write_json(path: Path, value: dict[str, Any]) -> None:
    REGISTRY.atomic_write_bytes(
        path,
        (CONTRACTS.canonical_json(value) + "\n").encode("utf-8"),
    )


def create_run_directory(run_dir: Path) -> None:
    """Create a new run directory without traversing symlink components."""
    declared = run_dir if run_dir.is_absolute() else Path.cwd() / run_dir
    current = Path(declared.anchor)
    for part in declared.parts[1:]:
        current = current / part
        if current.is_symlink():
            raise ChainNodeError("run directory path contains a symlink")
    if run_dir.exists():
        raise ChainNodeError("run directory already exists")
    try:
        run_dir.parent.mkdir(parents=True, exist_ok=True)
        if run_dir.parent.is_symlink():
            raise ChainNodeError("run directory parent is a symlink")
        run_dir.mkdir()
    except FileExistsError as error:
        raise ChainNodeError("run directory already exists") from error
    except OSError as error:
        raise ChainNodeError(f"run directory cannot be created: {error}") from error


def _commit_input(
    context: Any,
    *,
    logical_name: str,
    path: Path,
    media_type: str,
) -> dict[str, Any]:
    key = CONTRACTS.sha256_json(
        {
            "request_id": context.request["request_id"],
            "logical_name": logical_name,
        }
    )
    return CTX.commit(
        context,
        node_id="chain-input",
        logical_name=logical_name,
        path=path,
        media_type=media_type,
        execution_key_value=key,
        validation_artifact_id=None,
        domain_state="completed",
    )


def stage_chain_inputs(context: Any, chain_request: dict[str, Any]) -> None:
    chain_id = chain_request["target_id"]
    if chain_id in {"structure-features-v1", "structure-library-v1"}:
        csv_bytes, binding = HANDOFFS.structure_input_documents(chain_request)
        csv_path = context.run_dir / "inputs" / "structures.csv"
        binding_path = context.run_dir / "inputs" / "structure-binding.json"
        REGISTRY.atomic_write_bytes(csv_path, csv_bytes)
        _write_json(binding_path, binding)
        _commit_input(
            context,
            logical_name="standardization-input",
            path=csv_path,
            media_type="text/csv",
        )
        _commit_input(
            context,
            logical_name="standardization-input-binding",
            path=binding_path,
            media_type="application/json",
        )
    elif chain_id == "reaction-precedent-v1":
        path = context.run_dir / "inputs" / "reaction-request.json"
        _write_json(path, HANDOFFS.curate_request(chain_request))
        _commit_input(
            context,
            logical_name="reaction-input",
            path=path,
            media_type="application/json",
        )


def _sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _adapter_node(
    context: Any,
    *,
    node_id: str,
    adapter_id: str,
    request_path: Path,
    output_name: str,
    logical_name: str,
    validation_name: str,
    upstream_names: tuple[str, ...],
    request_mode: bool = False,
) -> Any:
    attempt = CTX.attempt_dir(context, node_id)
    input_field = "request_path" if request_mode else "input_path"
    command_context = {
        input_field: str(request_path),
        "output_path": str(attempt / f".{output_name}.tmp"),
    }
    if request_mode:
        command_context["generated_at_utc"] = context.recorded_at_utc
    node_input = A_ADAPTERS.NodeInput(
        node_id=node_id,
        adapter_id=adapter_id,
        command_context=command_context,
        output_path=attempt / output_name,
        logical_name=logical_name,
        validation_logical_name=validation_name,
        key_parameters={"request_sha256": _sha256_file(request_path)},
        upstream_names=upstream_names,
    )
    return A_ADAPTERS.execute_adapter_node(node_input, context)


def _commit_handoff(
    context: Any,
    *,
    node_id: str,
    request_name: str,
    binding_name: str,
    request_path: Path,
    handoff: Any,
    upstream_name: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    _write_json(request_path, handoff.payload)
    request_key = CTX.execution_key(
        context,
        node_id,
        {"handoff_role": request_name},
        (upstream_name,),
    )
    request_entry = CTX.commit(
        context,
        node_id=node_id,
        logical_name=request_name,
        path=request_path,
        media_type="application/json",
        execution_key_value=request_key,
        validation_artifact_id=None,
        domain_state="completed",
    )
    binding_path = request_path.with_name(f"{binding_name}.json")
    _write_json(
        binding_path,
        {
            "schema_version": "1.0.0",
            "request_artifact_id": request_entry["artifact_id"],
            "request_artifact_sha256": request_entry["sha256"],
            "upstream_artifact_id": handoff.upstream_artifact_id,
            "upstream_artifact_sha256": handoff.upstream_artifact_sha256,
        },
    )
    binding_key = CTX.execution_key(
        context,
        node_id,
        {"handoff_role": binding_name},
        (upstream_name, request_name),
    )
    binding_entry = CTX.commit(
        context,
        node_id=node_id,
        logical_name=binding_name,
        path=binding_path,
        media_type="application/json",
        execution_key_value=binding_key,
        validation_artifact_id=None,
        domain_state="completed",
    )
    return request_entry, binding_entry


def _library_node(context: Any) -> Any:
    operation = context.request["inputs"]["library_operation"]
    if not isinstance(operation, dict):
        raise ChainNodeError("library chain has no library operation")
    source = context.artifacts["molecular-features"]
    handoff = HANDOFFS.feature_to_library_request(source, operation)
    request_path = context.run_dir / "library-request.json"
    request_entry, binding_entry = _commit_handoff(
        context,
        node_id="library-operation",
        request_name="library-request",
        binding_name="library-request-binding",
        request_path=request_path,
        handoff=handoff,
        upstream_name="molecular-features",
    )
    return _adapter_node(
        context,
        node_id="library-operation",
        adapter_id="search-and-curate-chemical-libraries-v1",
        request_path=context.run_dir / request_entry["relative_path"],
        output_name="library-operation.json",
        logical_name="library-operation",
        validation_name="library-validation",
        upstream_names=(
            "molecular-features",
            "library-request",
            "library-request-binding",
        ),
        request_mode=True,
    )


def _curate_node(context: Any) -> Any:
    source = context.artifacts["reaction-input"]
    return _adapter_node(
        context,
        node_id="curate-reactions",
        adapter_id="curate-reactions-v1",
        request_path=context.run_dir / source["relative_path"],
        output_name="curated-reactions.json",
        logical_name="curated-reactions",
        validation_name="curate-validation",
        upstream_names=("reaction-input",),
    )


def _search_node(context: Any, chain_request: dict[str, Any]) -> Any:
    source = context.artifacts["curated-reactions"]
    document = CTX.read_json(context.run_dir / source["relative_path"])
    handoff = HANDOFFS.curation_to_search_request(
        source,
        document,
        chain_request,
    )
    request_path = context.run_dir / "inputs" / "search-request.json"
    request_entry, binding_entry = _commit_handoff(
        context,
        node_id="search-reactions",
        request_name="search-request",
        binding_name="search-request-binding",
        request_path=request_path,
        handoff=handoff,
        upstream_name="curated-reactions",
    )
    return _adapter_node(
        context,
        node_id="search-reactions",
        adapter_id="search-reactions-v1",
        request_path=context.run_dir / request_entry["relative_path"],
        output_name="reaction-precedents.json",
        logical_name="reaction-precedents",
        validation_name="search-validation",
        upstream_names=(
            "curated-reactions",
            "search-request",
            "search-request-binding",
        ),
    )


def execute_node(
    node_id: str,
    context: Any,
    chain_request: dict[str, Any],
) -> Any:
    """Execute one allowlisted internal or registered Adapter node."""
    if node_id in A_NODE_IDS:
        return A_NODES.execute_workflow_a_node(node_id, context)
    if node_id == "library-operation":
        return _library_node(context)
    if node_id == "curate-reactions":
        return _curate_node(context)
    if node_id == "search-reactions":
        return _search_node(context, chain_request)
    if node_id == "validate-chain":
        return CTX.NodeOutcome(node_id, "succeeded", "completed")
    raise ChainNodeError(f"unsupported chain node: {node_id}")
