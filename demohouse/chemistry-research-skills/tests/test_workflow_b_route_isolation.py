from __future__ import annotations

import copy
import hashlib
from pathlib import Path
from typing import Any

from workflow_test_support import (
    ADAPTERS,
    CONTRACTS,
    FIXTURES,
    REPOSITORY_ROOT,
    RUNNER,
    load_json,
    load_local_module,
    write_json,
)


WORKFLOW_B = load_local_module(
    "workflow_b_route_isolation",
    REPOSITORY_ROOT / "workflows" / "scripts" / "workflow_b.py",
)
EVIDENCE = load_local_module(
    "workflow_b_route_evidence",
    REPOSITORY_ROOT / "workflows" / "scripts" / "evidence_package.py",
)
FIXTURE_ROOT = FIXTURES / "workflow_b" / "single"


def _route_step(route_id: str, step_id: str):
    reaction_hash = (route_id + step_id).encode().hex().ljust(64, "0")[:64]
    return WORKFLOW_B.RouteStep(
        route_id=route_id,
        step_id=step_id,
        step_reaction_hash=reaction_hash,
        canonical_reaction="CCO>>CC=O",
    )


def test_search_plan_is_stable_by_route_and_step():
    plans = WORKFLOW_B.expand_search_plan(
        steps=[
            _route_step("route-b", "step-2"),
            _route_step("route-a", "step-1"),
        ],
        strategy={
            "provider": "local_curated_corpus",
            "operation": "search_transformations",
            "top_k": 20,
            "include_review_required": False,
            "use_stereochemistry": True,
            "fingerprint_profile_id": None,
            "threshold": None,
        },
    )

    assert [(item.route_id, item.step_id) for item in plans] == [
        ("route-a", "step-1"),
        ("route-b", "step-2"),
    ]


def test_wrong_step_blocks_only_affected_route():
    results = [
        WORKFLOW_B.StepSearchResult(
            route_id="route-a",
            step_id="step-1",
            step_reaction_hash="a" * 64,
            provider_status="completed",
            artifact_id="search-a",
            binding_status="bound",
        ),
        WORKFLOW_B.StepSearchResult(
            route_id="route-b",
            step_id="step-2",
            step_reaction_hash="b" * 64,
            provider_status="completed",
            artifact_id="search-b",
            binding_status="wrong_step",
        ),
    ]

    assembled = WORKFLOW_B.assemble_step_artifacts(results)
    by_route = {item["route_id"]: item for item in assembled}

    assert by_route["route-a"]["binding_status"] == "bound"
    assert by_route["route-b"]["binding_status"] == "blocked"


def test_zero_hit_timeout_and_source_error_stay_distinct():
    results = [
        WORKFLOW_B.StepSearchResult(
            "route-1",
            "zero",
            "a" * 64,
            "completed_zero_hits",
            "search-zero",
            "bound",
        ),
        WORKFLOW_B.StepSearchResult(
            "route-1",
            "timeout",
            "b" * 64,
            "source_timeout",
            "search-timeout",
            "bound",
        ),
        WORKFLOW_B.StepSearchResult(
            "route-1",
            "error",
            "c" * 64,
            "source_error",
            "search-error",
            "bound",
        ),
    ]

    claims = EVIDENCE.claims_for_step_searches(results)
    by_step = {item["subject_id"]: item for item in claims}

    assert by_step["zero"]["claim_type"] == "precedent_zero_hits"
    assert by_step["zero"]["status"] == "supported"
    assert by_step["timeout"]["claim_type"] == "precedent_search_incomplete"
    assert by_step["timeout"]["status"] == "review_required"
    assert by_step["error"]["claim_type"] == "precedent_search_incomplete"
    assert by_step["error"]["status"] == "review_required"

    wrong_step = EVIDENCE.claims_for_step_searches(
        [
            WORKFLOW_B.StepSearchResult(
                "route-1",
                "wrong",
                "d" * 64,
                "completed_zero_hits",
                "search-wrong",
                "wrong_step",
            )
        ]
    )
    assert wrong_step[0]["claim_type"] == "precedent_search_incomplete"
    assert wrong_step[0]["status"] == "blocked"


def _sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _two_route_request(tmp_path: Path) -> Path:
    reaction_path = tmp_path / "reactions.json"
    reaction_path.write_bytes((FIXTURE_ROOT / "reactions.json").read_bytes())
    route_document = load_json(FIXTURE_ROOT / "routes.json")
    second = copy.deepcopy(route_document["routes"][0])
    second["route_id"] = "aspirin-route-2"
    second["backend_rank"] = 2
    route_document["routes"].append(second)
    routes_fingerprint = CONTRACTS.sha256_json(route_document["routes"])
    route_document["routes_fingerprint"] = routes_fingerprint
    route_document["source"]["content_sha256"] = routes_fingerprint
    route_path = tmp_path / "routes.json"
    write_json(route_path, route_document)
    request = load_json(FIXTURE_ROOT / "request.json")
    request["inputs"]["reaction_input"]["sha256"] = _sha256_file(reaction_path)
    request["inputs"]["route_input"]["sha256"] = _sha256_file(route_path)
    request_path = tmp_path / "request.json"
    write_json(request_path, request)
    return request_path


class WrongSecondStepExecutor:
    def __init__(self, wrong_calls: set[int] | None = None):
        self.search_calls = 0
        self.wrong_calls = wrong_calls or {2}

    def __call__(
        self,
        adapter: Any,
        argv: list[str],
        *,
        repository_root: Path,
        timeout_seconds: float | None,
    ):
        if adapter.adapter_id != "search-reactions-v1":
            return ADAPTERS.execute_adapter(
                adapter,
                argv,
                repository_root=repository_root,
                timeout_seconds=timeout_seconds,
            )
        self.search_calls += 1
        input_path = Path(argv[argv.index("--input") + 1])
        original = input_path.read_bytes()
        try:
            if self.search_calls in self.wrong_calls:
                request = load_json(input_path)
                request["query"] = {"reaction_id": "wrong-step-record"}
                write_json(input_path, request)
            return ADAPTERS.execute_adapter(
                adapter,
                argv,
                repository_root=repository_root,
                timeout_seconds=timeout_seconds,
            )
        finally:
            input_path.write_bytes(original)


class InvalidSecondSearchExecutor:
    def __init__(self):
        self.search_calls = 0

    def __call__(
        self,
        adapter: Any,
        argv: list[str],
        *,
        repository_root: Path,
        timeout_seconds: float | None,
    ):
        if adapter.adapter_id != "search-reactions-v1":
            return ADAPTERS.execute_adapter(
                adapter,
                argv,
                repository_root=repository_root,
                timeout_seconds=timeout_seconds,
            )
        self.search_calls += 1
        if self.search_calls == 2:
            output_path = Path(argv[argv.index("--output") + 1])
            write_json(output_path, {})
            return ADAPTERS.ProcessResult(0, "", "")
        return ADAPTERS.execute_adapter(
            adapter,
            argv,
            repository_root=repository_root,
            timeout_seconds=timeout_seconds,
        )


def test_wrong_step_blocks_only_its_route_in_real_workflow(tmp_path):
    request_path = _two_route_request(tmp_path)
    run_dir = tmp_path / "run"

    result = RUNNER.start_run(
        request_path,
        run_dir,
        REPOSITORY_ROOT,
        executor=WrongSecondStepExecutor(),
    )

    assert result.status == "completed_with_review"
    index = load_json(run_dir / "artifacts" / "index.json")
    review_entry = next(
        item for item in index["artifacts"] if item["logical_name"] == "route-review"
    )
    review = load_json(run_dir / review_entry["relative_path"])
    dispositions = {
        item["route_id"]: item["disposition"] for item in review["route_summaries"]
    }
    assert dispositions == {
        "aspirin-route-1": "review_required",
        "aspirin-route-2": "blocked",
    }
    validator = load_local_module(
        "workflow_b_route_isolation_validator",
        REPOSITORY_ROOT / "workflows" / "scripts" / "validate_workflow.py",
    )
    report = validator.validate_run_directory(run_dir, REPOSITORY_ROOT)
    assert report["valid"] is True, report["errors"]


def test_all_blocked_routes_still_produce_valid_expert_package(tmp_path):
    request_path = _two_route_request(tmp_path)
    run_dir = tmp_path / "run-all-blocked"

    result = RUNNER.start_run(
        request_path,
        run_dir,
        REPOSITORY_ROOT,
        executor=WrongSecondStepExecutor({1, 2}),
    )

    assert result.status == "blocked"
    index = load_json(run_dir / "artifacts" / "index.json")
    assert any(
        item["logical_name"] == "expert-review-package" for item in index["artifacts"]
    )
    validator = load_local_module(
        "workflow_b_all_blocked_validator",
        REPOSITORY_ROOT / "workflows" / "scripts" / "validate_workflow.py",
    )
    report = validator.validate_run_directory(run_dir, REPOSITORY_ROOT)
    assert report["valid"] is True, report["errors"]


def test_invalid_search_artifact_is_route_local_failure(tmp_path):
    request_path = _two_route_request(tmp_path)
    run_dir = tmp_path / "run-invalid-search"

    result = RUNNER.start_run(
        request_path,
        run_dir,
        REPOSITORY_ROOT,
        executor=InvalidSecondSearchExecutor(),
    )

    assert result.status == "completed_with_review"
    validator = load_local_module(
        "workflow_b_invalid_search_validator",
        REPOSITORY_ROOT / "workflows" / "scripts" / "validate_workflow.py",
    )
    report = validator.validate_run_directory(run_dir, REPOSITORY_ROOT)
    assert report["valid"] is True, report["errors"]
