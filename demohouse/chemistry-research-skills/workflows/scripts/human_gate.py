"""Workflow A gate requests and authorized domain transformations."""

from __future__ import annotations

import importlib.util
import sys
from dataclasses import asdict, dataclass
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


CONTRACTS = _load_local_module(
    "workflow_contracts.py",
    "human_gate_contracts",
)
DECISIONS = _load_local_module(
    "human_decision_contract.py",
    "human_gate_decision_contract",
)
HumanDecisionError = DECISIONS.HumanDecisionError


@dataclass(frozen=True)
class AuthorizedStructure:
    request_id: str
    structure: str
    source_type: str
    source_candidate_id: str | None
    source_inchikey: str | None
    source_artifact_id: str
    decision_artifact_id: str | None
    record_selection_status: str


@dataclass(frozen=True)
class AuthorizedStructureSet:
    schema_version: str
    workflow: str
    structures: tuple[AuthorizedStructure, ...]
    excluded_request_ids: tuple[str, ...]
    abort_run: bool

    def as_json(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "workflow": self.workflow,
            "structures": [asdict(item) for item in self.structures],
            "excluded_request_ids": list(self.excluded_request_ids),
            "abort_run": self.abort_run,
        }


def validate_human_decision(
    value: Any,
    gate: dict[str, Any],
    source_artifact: dict[str, Any],
) -> dict[str, Any]:
    return DECISIONS.validate_human_decision(
        CONTRACTS,
        value,
        gate,
        source_artifact,
    )


def build_identity_gate_request(
    *,
    run_id: str,
    request_fingerprint: str,
    source_artifact: dict[str, Any],
    identity_artifact: dict[str, Any],
) -> dict[str, Any]:
    unresolved = []
    for resolution in identity_artifact.get("resolutions", []):
        if not isinstance(resolution, dict):
            continue
        handoff = resolution.get("standardization_handoff")
        if not isinstance(handoff, dict) or handoff.get("status") == "ready":
            continue
        request = resolution.get("request")
        request_id = request.get("id") if isinstance(request, dict) else None
        if not isinstance(request_id, str):
            continue
        unresolved.append(
            {
                "request_id": request_id,
                "disposition": resolution.get("disposition"),
                "candidate_ids": [
                    item["candidate_id"]
                    for item in resolution.get("candidates", [])
                    if isinstance(item, dict)
                    and isinstance(item.get("candidate_id"), str)
                ],
            }
        )
    if not unresolved:
        raise HumanDecisionError("identity gate has no unresolved requests")
    return {
        "schema_version": "1.0.0",
        "workflow": "workflow-human-gate-request",
        "run_id": run_id,
        "gate_id": "gate-identity-0001",
        "gate_type": "identity_resolution",
        "node_id": "identity-gate",
        "request_fingerprint": request_fingerprint,
        "source_artifact_id": source_artifact["artifact_id"],
        "source_artifact_sha256": source_artifact["sha256"],
        "unresolved_requests": unresolved,
    }


def build_view_gate_request(
    *,
    run_id: str,
    request_fingerprint: str,
    source_artifact: dict[str, Any],
    standardize_artifact: dict[str, Any],
) -> dict[str, Any]:
    records = standardize_artifact.get("records")
    if not isinstance(records, list) or not records:
        raise HumanDecisionError("calculation view gate requires records")
    return {
        "schema_version": "1.0.0",
        "workflow": "workflow-human-gate-request",
        "run_id": run_id,
        "gate_id": "gate-view-0001",
        "gate_type": "calculation_view",
        "node_id": "calculation-view-gate",
        "request_fingerprint": request_fingerprint,
        "source_artifact_id": source_artifact["artifact_id"],
        "source_artifact_sha256": source_artifact["sha256"],
        "available_views": ["standardized", "parent"],
        "parent_missing_record_ids": [
            item.get("id")
            for item in records
            if isinstance(item, dict) and item.get("parent_structure") is None
        ],
    }


def _ready_structure(
    resolution: dict[str, Any],
    source_artifact_id: str,
) -> AuthorizedStructure:
    record = resolution["standardization_handoff"]["records"][0]
    return AuthorizedStructure(
        request_id=record["id"],
        structure=record["structure"],
        source_type="identity_handoff",
        source_candidate_id=record["source_candidate_id"],
        source_inchikey=record["source_inchikey"],
        source_artifact_id=source_artifact_id,
        decision_artifact_id=None,
        record_selection_status="automatic_handoff",
    )


def _decided_structure(
    *,
    request_id: str,
    action: dict[str, Any],
    candidates: dict[tuple[str, str], dict[str, Any]],
    source_artifact_id: str,
    decision_artifact_id: str,
) -> AuthorizedStructure:
    if action["decision"] == "authorize_candidate_for_standardization":
        candidate = candidates[(request_id, action["candidate_id"])]
        return AuthorizedStructure(
            request_id=request_id,
            structure=candidate["canonical_smiles"],
            source_type="authorized_candidate",
            source_candidate_id=candidate["candidate_id"],
            source_inchikey=candidate.get("inchikey"),
            source_artifact_id=source_artifact_id,
            decision_artifact_id=decision_artifact_id,
            record_selection_status="user_confirmed",
        )
    return AuthorizedStructure(
        request_id=request_id,
        structure=action["structure"],
        source_type="user_supplied_structure",
        source_candidate_id=None,
        source_inchikey=None,
        source_artifact_id=source_artifact_id,
        decision_artifact_id=decision_artifact_id,
        record_selection_status="user_supplied",
    )


def apply_identity_decision(
    identity: dict[str, Any],
    decision: dict[str, Any] | None,
    *,
    source_artifact_id: str,
    decision_artifact_id: str | None,
) -> AuthorizedStructureSet:
    items = decision["decisions"] if decision is not None else []
    actions = {
        item.get("request_id"): item
        for item in items
        if isinstance(item, dict) and isinstance(item.get("request_id"), str)
    }
    candidates = DECISIONS.candidate_map(identity)
    structures: list[AuthorizedStructure] = []
    excluded: list[str] = []
    abort = any(
        isinstance(item, dict) and item.get("decision") == "abort_run" for item in items
    )
    for resolution in identity.get("resolutions", []):
        if not isinstance(resolution, dict):
            continue
        handoff = resolution.get("standardization_handoff", {})
        if handoff.get("status") == "ready":
            structures.append(_ready_structure(resolution, source_artifact_id))
            continue
        request = resolution.get("request", {})
        request_id = request.get("id")
        action = actions.get(request_id)
        if action is None or action["decision"] == "exclude_record":
            excluded.append(request_id)
            continue
        if decision_artifact_id is None:
            raise HumanDecisionError(
                "authorized structure requires a decision Artifact"
            )
        structures.append(
            _decided_structure(
                request_id=request_id,
                action=action,
                candidates=candidates,
                source_artifact_id=source_artifact_id,
                decision_artifact_id=decision_artifact_id,
            )
        )
    return AuthorizedStructureSet(
        schema_version="1.0.0",
        workflow="authorized-structure-set",
        structures=tuple(structures),
        excluded_request_ids=tuple(excluded),
        abort_run=abort,
    )


def selected_calculation_view(decision: dict[str, Any]) -> str | None:
    selected = decision["decisions"][0]["decision"]
    if selected == "abort_run":
        return None
    return "parent" if selected == "use_parent" else "standardized"
