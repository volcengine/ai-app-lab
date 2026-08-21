"""Internal gate, bridge, and package nodes for Workflow A."""

from __future__ import annotations

import csv
import importlib.util
import io
import sys
from pathlib import Path
from typing import Any


def _load_local_module(filename: str, module_name: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


CTX = _load_local_module(
    "workflow_a_context.py",
    "workflow_a_nodes_context",
)
ADAPTER_NODES = _load_local_module(
    "workflow_a_adapters.py",
    "workflow_a_nodes_adapters",
)
EVIDENCE = _load_local_module(
    "evidence_package.py",
    "workflow_a_nodes_evidence",
)
LEDGER = _load_local_module(
    "event_ledger.py",
    "workflow_a_nodes_ledger",
)
GATES = _load_local_module(
    "workflow_a_gates.py",
    "workflow_a_nodes_gates",
)


def _standardization_rows(
    authorized: dict[str, Any],
    context: Any,
) -> tuple[str, list[dict[str, Any]]]:
    rows: list[dict[str, Any]] = []
    csv_buffer = io.StringIO(newline="")
    writer = csv.DictWriter(
        csv_buffer,
        fieldnames=["id", "structure", "source"],
    )
    writer.writeheader()
    artifacts = {item["artifact_id"]: item for item in context.artifacts.values()}
    for record in authorized.get("structures", []):
        if not isinstance(record, dict):
            raise CTX.WorkflowANodeError("authorized structure is invalid")
        source = artifacts.get(record.get("source_artifact_id"))
        decision = artifacts.get(record.get("decision_artifact_id"))
        if source is None:
            raise CTX.WorkflowANodeError("authorized source Artifact is missing")
        writer.writerow(
            {
                "id": record["request_id"],
                "structure": record["structure"],
                "source": record["source_type"],
            }
        )
        rows.append(
            {
                "row_index": len(rows),
                "record_id": record["request_id"],
                "source_type": record["source_type"],
                "source_artifact_id": source["artifact_id"],
                "source_artifact_sha256": source["sha256"],
                "source_candidate_id": record["source_candidate_id"],
                "decision_artifact_id": (
                    decision["artifact_id"] if decision is not None else None
                ),
                "decision_artifact_sha256": (
                    decision["sha256"] if decision is not None else None
                ),
            }
        )
    if not rows:
        raise CTX.WorkflowANodeError(
            "identity handoff produced no standardization rows"
        )
    return csv_buffer.getvalue(), rows


def _write_standardization_inputs(
    context: Any,
    csv_text: str,
    rows: list[dict[str, Any]],
) -> tuple[Path, Path]:
    attempt = CTX.attempt_dir(context, "build-standardization-input")
    csv_path = attempt / "standardization-input.csv"
    binding_path = attempt / "standardization-input-binding.json"
    CTX.REGISTRY.atomic_write_bytes(csv_path, csv_text.encode("utf-8"))
    CTX.write_json(
        binding_path,
        {
            "schema_version": "1.0.0",
            "workflow": "compound-standardization-input-binding",
            "rows": rows,
        },
    )
    return csv_path, binding_path


def _commit_standardization_inputs(
    context: Any,
    csv_path: Path,
    binding_path: Path,
    row_count: int,
) -> Any:
    node_id = "build-standardization-input"
    key = CTX.execution_key(
        context,
        node_id,
        {"rows": row_count},
        ("authorized-structure-input",),
    )
    committed = []
    for logical_name, path, media_type in (
        ("standardization-input", csv_path, "text/csv"),
        ("standardization-input-binding", binding_path, "application/json"),
    ):
        committed.append(
            CTX.commit(
                context,
                node_id=node_id,
                logical_name=logical_name,
                path=path,
                media_type=media_type,
                execution_key_value=key,
                validation_artifact_id=None,
                domain_state="completed",
            )
        )
    return CTX.NodeOutcome(
        node_id,
        "succeeded",
        "completed",
        tuple(item["artifact_id"] for item in committed),
    )


def _build_standardization_input(context: Any) -> Any:
    authorized_entry = context.artifacts["authorized-structure-input"]
    authorized = CTX.read_json(context.run_dir / authorized_entry["relative_path"])
    csv_text, rows = _standardization_rows(authorized, context)
    csv_path, binding_path = _write_standardization_inputs(
        context,
        csv_text,
        rows,
    )
    return _commit_standardization_inputs(
        context,
        csv_path,
        binding_path,
        len(rows),
    )


def _write_evidence_package(context: Any) -> None:
    events = LEDGER.read_verified_events(
        context.run_dir / "events.jsonl",
        context.run_id,
    )
    artifacts = CTX.REGISTRY.rebuild_artifact_index(events)["artifacts"]
    EVIDENCE.write_workflow_package(
        run_dir=context.run_dir,
        workflow_id="compound-evidence-v1",
        run_status="running",
        events=events,
        artifacts=artifacts,
        with_checksums=False,
    )


def _validate_evidence_package(context: Any) -> None:
    package = {
        "evidence_index": CTX.read_json(context.run_dir / "evidence_index.json"),
        "claim_ledger": CTX.read_json(context.run_dir / "claim_ledger.json"),
    }
    report = EVIDENCE.validate_package(package)
    if report["valid"] is not True:
        raise CTX.WorkflowANodeError("workflow evidence package is invalid")


def _internal_node(node_id: str, context: Any) -> Any:
    if node_id == "identity-gate":
        return GATES.identity_gate(context)
    elif node_id == "build-standardization-input":
        return _build_standardization_input(context)
    elif node_id == "calculation-view-gate":
        return GATES.calculation_view_gate(context)
    elif node_id == "build-compound-evidence-package":
        _write_evidence_package(context)
    elif node_id == "validate-workflow":
        _validate_evidence_package(context)
    else:
        raise CTX.WorkflowANodeError(f"unsupported Workflow A node: {node_id}")
    return CTX.NodeOutcome(node_id, "succeeded", "completed")


def build_workflow_a_node_input(node_id: str, context: Any) -> Any:
    return ADAPTER_NODES.build_workflow_a_node_input(node_id, context)


def execute_workflow_a_node(node_id: str, context: Any) -> Any:
    if node_id in {
        "resolve-identities",
        "standardize-structures",
        "compute-features",
        "optional-library-operation",
    }:
        return ADAPTER_NODES.execute_adapter_node(
            build_workflow_a_node_input(node_id, context),
            context,
        )
    return _internal_node(node_id, context)
