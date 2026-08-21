from __future__ import annotations

import csv
import importlib.util
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path
from typing import Any


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).resolve().parent / "fixtures"
FIXED_TIME = "2026-08-17T12:00:00Z"


def load_local_module(name: str, path: Path) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


CONTRACTS = load_local_module(
    "workflow_test_contracts",
    REPOSITORY_ROOT / "workflows" / "scripts" / "workflow_contracts.py",
)
LEDGER = load_local_module(
    "workflow_test_ledger",
    REPOSITORY_ROOT / "workflows" / "scripts" / "event_ledger.py",
)
RUNNER = load_local_module(
    "workflow_test_runner",
    REPOSITORY_ROOT / "workflows" / "scripts" / "workflow_runner.py",
)
ADAPTERS = load_local_module(
    "workflow_test_adapters",
    REPOSITORY_ROOT / "workflows" / "scripts" / "skill_adapters.py",
)


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    assert isinstance(value, dict)
    return value


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, sort_keys=True),
        encoding="utf-8",
    )


def run_checked(
    arguments: list[str],
    expected_codes: set[int],
) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(
        arguments,
        cwd=REPOSITORY_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert completed.returncode in expected_codes, completed.stderr
    return completed


def explicit_workflow_a_request() -> dict[str, Any]:
    return load_json(FIXTURES / "workflow_a_explicit_structure.json")


def _identity_request(request: dict[str, Any]) -> dict[str, Any]:
    inputs = request["inputs"]
    identity = inputs["identity"]
    return {
        "requests": inputs["queries"],
        "options": {
            "sources": identity["sources"],
            "include_related": identity["include_related"],
            "standardization_profile": inputs["standardization"]["profile"],
        },
    }


def _write_standardization_csv(
    path: Path,
    identity: dict[str, Any],
) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["id", "structure", "source"],
        )
        writer.writeheader()
        for resolution in identity["resolutions"]:
            handoff = resolution["standardization_handoff"]
            assert handoff["status"] == "ready"
            record = handoff["records"][0]
            writer.writerow(
                {
                    "id": record["id"],
                    "structure": record["structure"],
                    "source": "identity_handoff",
                }
            )


def run_direct_compound_chain(root: Path) -> dict[str, str]:
    root.mkdir(parents=True)
    request = explicit_workflow_a_request()
    identity_request = root / "identity-request.json"
    write_json(identity_request, _identity_request(request))
    identity_path = root / "identity.json"
    identity_options = request["inputs"]["identity"]
    run_checked(
        [
            sys.executable,
            "skills/resolve-chemical-identities/scripts/resolve_identities.py",
            "--request",
            str(identity_request),
            "--sources",
            "",
            "--standardization-profile",
            request["inputs"]["standardization"]["profile"],
            "--timeout",
            str(identity_options["timeout_seconds"]),
            "--retries",
            str(identity_options["retries"]),
            "--generated-at",
            FIXED_TIME,
            "--output",
            str(identity_path),
        ],
        {0},
    )
    identity = load_json(identity_path)
    structures = root / "standardization-input.csv"
    _write_standardization_csv(structures, identity)
    standardized_path = root / "standardized-structures.json"
    run_checked(
        [
            sys.executable,
            "skills/standardize-chemical-structures/scripts/standardize_structures.py",
            "--input",
            str(structures),
            "--input-format",
            "csv",
            "--profile",
            request["inputs"]["standardization"]["profile"],
            "--generated-at",
            FIXED_TIME,
            "--output",
            str(standardized_path),
        ],
        {0, 2},
    )
    features_path = root / "molecular-features.json"
    run_checked(
        [
            sys.executable,
            "skills/compute-molecular-features/scripts/compute_features.py",
            "--input",
            str(standardized_path),
            "--input-format",
            "json",
            "--calculation-view",
            request["inputs"]["features"]["calculation_view"],
            "--generated-at",
            FIXED_TIME,
            "--output",
            str(features_path),
        ],
        {0, 2},
    )
    return {
        "identity": identity["result_fingerprint"],
        "standardize": load_json(standardized_path)["result_fingerprint"],
        "features": load_json(features_path)["result_fingerprint"],
    }


def start_request(
    root: Path,
    request: dict[str, Any],
) -> tuple[Path, subprocess.CompletedProcess[str]]:
    root.mkdir(parents=True, exist_ok=True)
    request_path = root / "request.json"
    run_dir = root / "run"
    write_json(request_path, request)
    completed = subprocess.run(
        [
            sys.executable,
            str(REPOSITORY_ROOT / "workflows/scripts/run_workflow.py"),
            "start",
            "--request",
            str(request_path),
            "--run-dir",
            str(run_dir),
        ],
        cwd=REPOSITORY_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    return run_dir, completed


def artifact_by_logical_name(
    run_dir: Path,
    logical_name: str,
) -> dict[str, Any]:
    index = load_json(run_dir / "artifacts/index.json")
    entry = next(
        item for item in index["artifacts"] if item["logical_name"] == logical_name
    )
    return load_json(run_dir / entry["relative_path"])


def workflow_fingerprints(run_dir: Path) -> dict[str, str]:
    return {
        "identity": artifact_by_logical_name(
            run_dir,
            "identity-result",
        )["result_fingerprint"],
        "standardize": artifact_by_logical_name(
            run_dir,
            "standardized-structures",
        )["result_fingerprint"],
        "features": artifact_by_logical_name(
            run_dir,
            "molecular-features",
        )["result_fingerprint"],
    }


def run_workflow_a(
    root: Path,
) -> tuple[Path, subprocess.CompletedProcess[str]]:
    return start_request(root, explicit_workflow_a_request())


def completed_workflow_a(root: Path) -> Path:
    run_dir, completed = run_workflow_a(root)
    assert completed.returncode == 0, completed.stderr
    return run_dir


class CountingExecutor:
    def __init__(self, delegate: Any):
        self.delegate = delegate
        self.calls: Counter[str] = Counter()

    def __call__(
        self,
        adapter: Any,
        argv: list[str],
        *,
        repository_root: Path,
        timeout_seconds: float | None,
    ) -> Any:
        self.calls[adapter.adapter_id] += 1
        return self.delegate(
            adapter,
            argv,
            repository_root=repository_root,
            timeout_seconds=timeout_seconds,
        )


def node_start_counts(run_dir: Path) -> Counter[str]:
    manifest = load_json(run_dir / "run_manifest.json")
    events = LEDGER.read_verified_events(
        run_dir / "events.jsonl",
        manifest["run_id"],
    )
    return Counter(
        item["node_id"] for item in events if item["event_type"] == "node_started"
    )


def synthetic_running_node(
    root: Path,
    *,
    external: bool,
) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    request = explicit_workflow_a_request()
    if external:
        request["inputs"]["identity"]["sources"] = ["pubchem"]
        request["execution_policy"]["network_mode"] = "public_http"
    request_path = root / "request.json"
    write_json(request_path, request)
    run_dir = root / "run"
    manifest = RUNNER.initialize_run(
        request_path,
        run_dir,
        REPOSITORY_ROOT,
    )
    base = {
        "schema_version": "1.0.0",
        "run_id": manifest["run_id"],
        "node_id": "resolve-identities",
        "attempt": 1,
        "recorded_at_utc": FIXED_TIME,
    }
    execution_class = "external" if external else "offline"
    for event_type in ("node_ready", "node_started"):
        LEDGER.append_event(
            run_dir / "events.jsonl",
            {
                **base,
                "event_type": event_type,
                "payload": {"execution_class": execution_class},
            },
        )
    return run_dir


def valid_retry_decision(run_dir: Path) -> dict[str, Any]:
    gate = load_json(run_dir / "gates/gate-retry-resolve-identities-0001/request.json")
    value = {
        "schema_version": "1.0.0",
        "run_id": gate["run_id"],
        "gate_id": gate["gate_id"],
        "gate_type": "external_retry",
        "request_fingerprint": gate["request_fingerprint"],
        "definition_fingerprint": gate["definition_fingerprint"],
        "node_id": gate["node_id"],
        "interrupted_attempt": gate["interrupted_attempt"],
        "actor_type": "user",
        "decided_at_utc": FIXED_TIME,
        "action": "authorize_retry",
    }
    value["decision_fingerprint"] = CONTRACTS.sha256_json(value)
    return value


def run_workflow_a_with_query(
    root: Path,
    query: str,
    input_type: str,
) -> Path:
    request = explicit_workflow_a_request()
    request["inputs"]["queries"] = [
        {"id": "q1", "query": query, "input_type": input_type}
    ]
    run_dir, completed = start_request(root, request)
    assert completed.returncode == 10, completed.stderr
    return run_dir


def awaiting_identity_gate(root: Path) -> Path:
    return run_workflow_a_with_query(root, "CCO.CN", "smiles")


def valid_identity_decision(run_dir: Path) -> dict[str, Any]:
    gate = load_json(run_dir / "gates" / "gate-identity-0001" / "request.json")
    identity = artifact_by_logical_name(run_dir, "identity-result")
    candidate = identity["resolutions"][0]["candidates"][0]
    value = {
        "schema_version": "1.0.0",
        "run_id": gate["run_id"],
        "gate_id": gate["gate_id"],
        "gate_type": "identity_resolution",
        "request_fingerprint": gate["request_fingerprint"],
        "source_artifact_id": gate["source_artifact_id"],
        "source_artifact_sha256": gate["source_artifact_sha256"],
        "actor_type": "user",
        "decided_at_utc": FIXED_TIME,
        "decisions": [
            {
                "request_id": "q1",
                "decision": "authorize_candidate_for_standardization",
                "decision_scope": "record_candidate",
                "candidate_id": candidate["candidate_id"],
                "candidate_sha256": CONTRACTS.sha256_json(candidate),
            }
        ],
    }
    value["decision_fingerprint"] = CONTRACTS.sha256_json(value)
    return value


def valid_view_decision(run_dir: Path, decision: str) -> dict[str, Any]:
    gate = load_json(run_dir / "gates" / "gate-view-0001" / "request.json")
    value = {
        "schema_version": "1.0.0",
        "run_id": gate["run_id"],
        "gate_id": gate["gate_id"],
        "gate_type": "calculation_view",
        "request_fingerprint": gate["request_fingerprint"],
        "source_artifact_id": gate["source_artifact_id"],
        "source_artifact_sha256": gate["source_artifact_sha256"],
        "actor_type": "user",
        "decided_at_utc": FIXED_TIME,
        "decisions": [
            {
                "decision": decision,
                "decision_scope": "workflow_calculation_view",
            }
        ],
    }
    value["decision_fingerprint"] = CONTRACTS.sha256_json(value)
    return value
