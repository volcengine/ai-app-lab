#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Sequence


CASE_ROOT = Path(__file__).resolve().parent
REPOSITORY_ROOT = CASE_ROOT.parents[1]
DEFAULT_CASE_PATH = CASE_ROOT / "case.json"

SKILL_SCRIPTS = {
    "resolve": ("skills/resolve-chemical-identities/scripts/resolve_identities.py"),
    "standardize": (
        "skills/standardize-chemical-structures/scripts/standardize_structures.py"
    ),
    "features": ("skills/compute-molecular-features/scripts/compute_features.py"),
    "library": (
        "skills/search-and-curate-chemical-libraries/scripts/search_and_curate.py"
    ),
    "curate_reaction": ("skills/curate-reactions/scripts/curate_reactions.py"),
    "search_reaction": ("skills/search-reactions/scripts/search_reactions.py"),
    "review_route": "skills/review-routes/scripts/review_routes.py",
}

VALIDATORS = {
    "resolve": ("skills/resolve-chemical-identities/scripts/validate_output.py"),
    "standardize": (
        "skills/standardize-chemical-structures/scripts/validate_output.py"
    ),
    "features": ("skills/compute-molecular-features/scripts/validate_output.py"),
    "library": (
        "skills/search-and-curate-chemical-libraries/scripts/validate_output.py"
    ),
    "curate_reaction": ("skills/curate-reactions/scripts/validate_output.py"),
    "search_reaction": ("skills/search-reactions/scripts/validate_output.py"),
    "review_route": "skills/review-routes/scripts/validate_output.py",
}

FINAL_ARTIFACTS = {
    "resolve-chemical-identities": "01_identity.json",
    "standardize-chemical-structures": "02_standardized.json",
    "compute-molecular-features": "03_features.json",
    "search-and-curate-chemical-libraries": "04_library_search.json",
    "curate-reactions": "05_curated_reaction.json",
    "search-reactions": "06_reaction_search.json",
    "review-routes": "07_route_review.json",
}


class CaseFailure(RuntimeError):
    pass


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def sha256_json(value: Any) -> str:
    return sha256_text(canonical_json(value))


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise CaseFailure(f"{path.name} must contain a JSON object")
    return value


def write_json(path: Path, value: Any) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def run_command(
    label: str,
    arguments: Sequence[str],
    expected_returncodes: set[int],
    audit: list[dict[str, Any]],
) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(
        list(arguments),
        cwd=REPOSITORY_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    audit.append(
        {
            "label": label,
            "returncode": completed.returncode,
            "stdout": completed.stdout.strip(),
            "stderr": completed.stderr.strip(),
        }
    )
    if completed.returncode not in expected_returncodes:
        raise CaseFailure(
            f"{label} returned {completed.returncode}; "
            f"expected {sorted(expected_returncodes)}; "
            f"stderr={completed.stderr.strip()!r}"
        )
    return completed


def run_validator(
    skill_key: str,
    artifact_path: Path,
    run_dir: Path,
    audit: list[dict[str, Any]],
) -> None:
    validator = REPOSITORY_ROOT / VALIDATORS[skill_key]
    completed = run_command(
        f"validate:{skill_key}",
        [sys.executable, str(validator), str(artifact_path)],
        {0},
        audit,
    )
    report_path = run_dir / f"{artifact_path.stem}.validation.json"
    try:
        report = json.loads(completed.stdout)
    except json.JSONDecodeError:
        report = {
            "valid": True,
            "message": completed.stdout.strip(),
            "errors": [],
        }
    if report.get("valid") is False:
        raise CaseFailure(f"validator rejected {artifact_path.name}")
    write_json(report_path, report)


def expect(
    condition: bool,
    assertion_id: str,
    assertions: list[str],
) -> None:
    if not condition:
        raise CaseFailure(f"semantic assertion failed: {assertion_id}")
    assertions.append(assertion_id)


def records_by_id(document: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        str(record.get("id")): record
        for record in document.get("records", [])
        if isinstance(record, dict)
    }


def build_structure_csv(
    case: dict[str, Any],
    identity: dict[str, Any],
    path: Path,
) -> None:
    resolution = identity["resolutions"][0]
    handoff = resolution["standardization_handoff"]
    if handoff.get("status") != "ready":
        raise CaseFailure("identity handoff is not ready")
    records = handoff["records"]
    if len(records) != 1:
        raise CaseFailure("identity handoff must contain exactly one record")
    handoff_record = records[0]
    rows = [
        {
            "id": handoff_record["id"],
            "structure": handoff_record["structure"],
            "source": (
                "resolve-chemical-identities:"
                f"{handoff_record['id']}:"
                f"{handoff_record['source_candidate_id']}"
            ),
        },
        *case["additional_structures"],
    ]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["id", "structure", "source"],
        )
        writer.writeheader()
        writer.writerows(rows)


def build_library_request(
    case: dict[str, Any],
    artifact_name: str,
) -> dict[str, Any]:
    options = case["library_search"]
    return {
        "schema_version": "1.0.0",
        "operation": "similarity_search",
        "library_artifact": artifact_name,
        "options": {
            "calculation_view": "standardized",
            "include_review_required": options["include_review_required"],
            "fingerprint_profile_id": options["fingerprint_profile_id"],
            "metric": options["metric"],
            "top_k": options["top_k"],
            "threshold": None,
            "include_self": options["include_self"],
        },
        "queries": [
            {
                "id": "query-aspirin",
                "record_id": options["query_record_id"],
            }
        ],
    }


def build_curation_request(
    case: dict[str, Any],
    standardized: dict[str, Any],
) -> dict[str, Any]:
    reaction = case["reaction"]
    return {
        "schema_version": "1.0.0",
        "workflow": "curate-reactions",
        "input_profile": "reaction_smiles",
        "source": {
            "identifier": "aspirin-acetylation-controlled-fixture",
            "content_sha256": sha256_text(reaction["reaction_smiles"]),
            "license": "Apache-2.0",
        },
        "options": {
            "participant_view": "reported_form",
            "atom_mapping": "off",
            "balance_check": "diagnostic",
        },
        "upstream_artifacts": [standardized],
        "records": [
            {
                "record_id": reaction["record_id"],
                "reaction_smiles": reaction["reaction_smiles"],
                "participants": reaction["participants"],
                "stoichiometry_complete": reaction["stoichiometry_complete"],
            }
        ],
    }


def build_reaction_search_request(
    case: dict[str, Any],
    artifact_name: str,
) -> dict[str, Any]:
    return {
        "schema_version": "1.0.0",
        "workflow": "search-reactions",
        "operation": "lookup_reaction",
        "provider": "local_curated_corpus",
        "query": {"reaction_id": case["reaction"]["record_id"]},
        "options": {
            "fingerprint_profile_id": None,
            "top_k": 20,
            "threshold": None,
            "candidate_limit": 100,
            "include_review_required": True,
            "use_stereochemistry": False,
        },
        "corpus_artifact_path": artifact_name,
    }


def build_route_request(
    case: dict[str, Any],
    standardized: dict[str, Any],
) -> dict[str, Any]:
    records = records_by_id(standardized)
    route_case = case["route"]
    reaction = case["reaction"]
    target = records[route_case["target_record_id"]]
    precursors = [
        records[record_id] for record_id in route_case["precursor_record_ids"]
    ]
    tree = {
        "type": "mol",
        "smiles": target["standardized_structure"],
        "in_stock": False,
        "children": [
            {
                "type": "reaction",
                "metadata": {"rsmi": reaction["reaction_smiles"]},
                "children": [
                    {
                        "type": "mol",
                        "smiles": precursor["standardized_structure"],
                        "in_stock": True,
                        "children": [],
                    }
                    for precursor in precursors
                ],
            }
        ],
    }
    routes = [
        {
            "route_id": route_case["route_id"],
            "backend": route_case["backend"],
            "backend_rank": route_case["backend_rank"],
            "backend_score": None,
            "tree": tree,
        }
    ]
    return {
        "schema_version": "1.0.0",
        "workflow": "review-routes",
        "input_profile": "normalized_route_v1",
        "source": {
            "identifier": "aspirin-route-controlled-fixture",
            "content_sha256": sha256_json(routes),
            "license": "Apache-2.0",
        },
        "target": {
            "reported_structure": target["original_structure"],
            "standardized_structure": target["standardized_structure"],
            "upstream_record_id": target["id"],
        },
        "routes": routes,
        "routes_fingerprint": sha256_json(routes),
        "step_artifacts": [],
        "inventory_snapshot": {
            "snapshot_id": "controlled-test-inventory",
            "captured_at_utc": case["generated_at_utc"],
            "source": "controlled-test-fixture",
            "license": "Apache-2.0",
            "records": [
                {
                    "structure": precursor["standardized_structure"],
                    "status": "in_stock",
                }
                for precursor in precursors
            ],
        },
        "constraints": {
            "max_steps": 1,
            "max_precursors": 2,
            "require_all_leaves_in_stock": True,
            "minimum_exact_or_transformation_coverage": 1.0,
        },
        "options": {
            "comparison_mode": "dimensions_only",
            "preserve_backend_order": True,
        },
    }


def assert_identity(
    case: dict[str, Any],
    document: dict[str, Any],
    assertions: list[str],
) -> None:
    resolution = document["resolutions"][0]
    expect(
        resolution["input_status"] == "valid",
        "identity.input_valid",
        assertions,
    )
    expect(
        resolution["retrieval_status"] == "not_run",
        "identity.offline_retrieval_not_run",
        assertions,
    )
    expect(
        resolution["disposition"] == "ready_for_standardization",
        "identity.ready_for_standardization",
        assertions,
    )
    expect(
        resolution["candidates"][0]["inchikey"]
        == case["identity"]["expected_inchikey"],
        "identity.expected_inchikey",
        assertions,
    )


def assert_structure_chain(
    case: dict[str, Any],
    identity: dict[str, Any],
    standardized: dict[str, Any],
    features: dict[str, Any],
    library: dict[str, Any],
    assertions: list[str],
) -> None:
    standard_records = records_by_id(standardized)
    feature_records = records_by_id(features)
    identity_candidate = identity["resolutions"][0]["candidates"][0]
    expect(
        standard_records["query-1"]["inchikey"] == identity_candidate["inchikey"],
        "standardize.identity_inchikey_handoff",
        assertions,
    )
    expect(
        standard_records["aspirin-sodium"]["disposition"] == "review_required",
        "standardize.salt_requires_review",
        assertions,
    )
    expect(
        standard_records["invalid-structure"]["disposition"] == "rejected",
        "standardize.invalid_rejected",
        assertions,
    )
    expect(
        feature_records["invalid-structure"]["calculation_status"] == "not_run",
        "features.rejected_not_run",
        assertions,
    )
    expect(
        not feature_records["invalid-structure"]["fingerprints"],
        "features.rejected_has_no_fingerprints",
        assertions,
    )
    aspirin_descriptors = feature_records["query-1"]["descriptors"]
    expect(
        aspirin_descriptors["MolecularFormula"] == "C9H8O4",
        "features.aspirin_formula",
        assertions,
    )
    expect(
        abs(aspirin_descriptors["ExactMolWt"] - 180.042258736) < 1e-9,
        "features.aspirin_exact_mass",
        assertions,
    )
    excluded = {item["id"]: item["reason"] for item in library["excluded_records"]}
    expect(
        excluded["aspirin-sodium"] == "review_required_excluded_by_default",
        "library.review_record_excluded",
        assertions,
    )
    expect(
        excluded["invalid-structure"] == "structure_parse_error",
        "library.rejected_record_excluded",
        assertions,
    )
    hits = library["query_results"][0]["hits"]
    expect(
        hits[0]["hit_id"] == "salicylic-acid",
        "library.salicylic_acid_top_hit",
        assertions,
    )
    expect(
        library["operation_status"] == "completed",
        "library.operation_completed",
        assertions,
    )
    expect(
        case["library_search"]["query_record_id"]
        == library["query_results"][0]["query_record_id"],
        "library.query_record_bound",
        assertions,
    )


def assert_reaction_chain(
    case: dict[str, Any],
    curated: dict[str, Any],
    searched: dict[str, Any],
    reviewed: dict[str, Any],
    assertions: list[str],
) -> None:
    curated_record = curated["records"][0]
    expect(
        curated_record["disposition"] == "ready_for_search",
        "reaction.ready_for_search",
        assertions,
    )
    balance = curated_record["balance_assessment"]
    expect(
        balance["status"] == "completed"
        and not balance["element_delta"]
        and balance["formal_charge_delta"] == 0,
        "reaction.element_and_charge_balanced",
        assertions,
    )
    expect(
        len(curated["upstream_artifacts"]) == 1
        and curated["upstream_artifacts"][0]["workflow"]
        == "chemical-structure-standardization-qc"
        and curated["upstream_artifacts"][0]["schema_version"] == "1.0.0"
        and curated["upstream_artifacts"][0]["contract_status"] == "valid",
        "reaction.standardization_artifact_contract_valid",
        assertions,
    )
    expect(
        all(
            item["upstream_record_id"]
            and item["upstream_binding_status"] == "bound"
            and item["upstream_disposition"] == "ready_for_downstream"
            and not item["upstream_human_review_required"]
            for item in curated_record["participant_assessments"]
        ),
        "reaction.participants_bound_to_ready_standardization_records",
        assertions,
    )
    expect(
        searched["provider_status"] == "completed",
        "reaction_search.completed",
        assertions,
    )
    expect(
        searched["corpus_provenance"]["provider"] == "local_curated_corpus"
        and searched["corpus_provenance"]["workflow"] == "curate-reactions"
        and searched["corpus_provenance"]["schema_version"] == "1.0.0"
        and searched["corpus_provenance"]["ruleset_version"] == "1.1.0"
        and searched["corpus_provenance"]["artifact_fingerprint"]
        == curated["result_fingerprint"]
        and searched["corpus_provenance"]["contract_status"] == "valid",
        "reaction_search.curated_corpus_provenance_bound",
        assertions,
    )
    expect(
        len(searched["results"]) == 1
        and searched["results"][0]["reaction_id"] == case["reaction"]["record_id"],
        "reaction_search.exact_record_found",
        assertions,
    )
    route = reviewed["route_summaries"][0]
    curation = route["step_reviews"][0]["curation"]
    precedent = route["step_reviews"][0]["precedent"]
    expect(
        curation["binding_status"] == "bound"
        and curation["curation_record_id"] == curated_record["record_id"]
        and curation["original_record_hash"] == curated_record["original_record_hash"]
        and curation["artifact_fingerprint"] == curated["result_fingerprint"],
        "route.curation_record_provenance_bound",
        assertions,
    )
    expect(
        precedent["binding_status"] == "bound"
        and precedent["operation"] == "lookup_reaction"
        and precedent["provider"] == "local_curated_corpus"
        and precedent["artifact_fingerprint"] == searched["result_fingerprint"]
        and precedent["query_fingerprint"]
        and precedent["result_ids"] == [case["reaction"]["record_id"]]
        and precedent["result_hashes"] == [searched["results"][0]["result_hash"]],
        "route.precedent_query_result_provenance_bound",
        assertions,
    )
    expect(
        route["disposition"] == "ready_for_expert_review",
        "route.ready_for_expert_review",
        assertions,
    )
    expect(
        route["exact_or_transformation_coverage"] == 1.0,
        "route.exact_precedent_coverage_complete",
        assertions,
    )
    expect(
        route["inventory_coverage"] == 1.0,
        "route.controlled_inventory_coverage_complete",
        assertions,
    )
    serialized = json.dumps(reviewed, ensure_ascii=False)
    expect(
        "decision_score" not in serialized
        and "total_score" not in serialized
        and "ready_for_experiment" not in serialized,
        "route.no_unsupported_decision_claim",
        assertions,
    )


def scan_artifacts(
    artifact_paths: Sequence[Path],
    output_root: Path,
    assertions: list[str],
) -> None:
    forbidden_keys = (
        '"authorization"',
        '"x-agent-plan-key"',
        '"api_key"',
        '"cookie"',
    )
    for path in artifact_paths:
        text = path.read_text(encoding="utf-8")
        lowered = text.lower()
        expect(
            str(output_root) not in text,
            f"security.no_absolute_output_path:{path.name}",
            assertions,
        )
        expect(
            not any(key in lowered for key in forbidden_keys),
            f"security.no_secret_field:{path.name}",
            assertions,
        )


def execute_once(
    case: dict[str, Any],
    run_dir: Path,
) -> dict[str, Any]:
    run_dir.mkdir(parents=True)
    audit: list[dict[str, Any]] = []
    assertions: list[str] = []
    fixed_time = case["generated_at_utc"]

    identity_path = run_dir / FINAL_ARTIFACTS["resolve-chemical-identities"]
    run_command(
        "resolve-chemical-identities",
        [
            sys.executable,
            str(REPOSITORY_ROOT / SKILL_SCRIPTS["resolve"]),
            "--query",
            case["identity"]["query"],
            "--input-type",
            case["identity"]["input_type"],
            "--sources",
            "",
            "--generated-at",
            fixed_time,
            "--output",
            str(identity_path),
        ],
        {0},
        audit,
    )
    run_validator("resolve", identity_path, run_dir, audit)
    identity = load_json(identity_path)
    assert_identity(case, identity, assertions)

    structures_path = run_dir / "02_structures.csv"
    build_structure_csv(case, identity, structures_path)
    standardized_path = run_dir / FINAL_ARTIFACTS["standardize-chemical-structures"]
    run_command(
        "standardize-chemical-structures",
        [
            sys.executable,
            str(REPOSITORY_ROOT / SKILL_SCRIPTS["standardize"]),
            "--input",
            str(structures_path),
            "--profile",
            "chembl-pipeline",
            "--generated-at",
            fixed_time,
            "--output",
            str(standardized_path),
            "--csv-summary",
            str(run_dir / "02_standardized.csv"),
        ],
        {2},
        audit,
    )
    run_validator("standardize", standardized_path, run_dir, audit)
    standardized = load_json(standardized_path)

    features_path = run_dir / FINAL_ARTIFACTS["compute-molecular-features"]
    run_command(
        "compute-molecular-features",
        [
            sys.executable,
            str(REPOSITORY_ROOT / SKILL_SCRIPTS["features"]),
            "--input",
            str(standardized_path),
            "--input-format",
            "json",
            "--calculation-view",
            "standardized",
            "--generated-at",
            fixed_time,
            "--output",
            str(features_path),
            "--csv-matrix",
            str(run_dir / "03_features.csv"),
        ],
        {2},
        audit,
    )
    run_validator("features", features_path, run_dir, audit)
    features = load_json(features_path)

    library_request_path = run_dir / "04_library_request.json"
    write_json(
        library_request_path,
        build_library_request(case, features_path.name),
    )
    library_path = run_dir / FINAL_ARTIFACTS["search-and-curate-chemical-libraries"]
    run_command(
        "search-and-curate-chemical-libraries",
        [
            sys.executable,
            str(REPOSITORY_ROOT / SKILL_SCRIPTS["library"]),
            "--request",
            str(library_request_path),
            "--generated-at",
            fixed_time,
            "--output",
            str(library_path),
        ],
        {0},
        audit,
    )
    run_validator("library", library_path, run_dir, audit)
    library = load_json(library_path)
    assert_structure_chain(
        case,
        identity,
        standardized,
        features,
        library,
        assertions,
    )

    curation_request_path = run_dir / "05_curation_request.json"
    write_json(
        curation_request_path,
        build_curation_request(case, standardized),
    )
    curated_path = run_dir / FINAL_ARTIFACTS["curate-reactions"]
    run_command(
        "curate-reactions",
        [
            sys.executable,
            str(REPOSITORY_ROOT / SKILL_SCRIPTS["curate_reaction"]),
            "--input",
            str(curation_request_path),
            "--output",
            str(curated_path),
        ],
        {0},
        audit,
    )
    run_validator("curate_reaction", curated_path, run_dir, audit)
    curated = load_json(curated_path)

    reaction_search_request_path = run_dir / "06_search_request.json"
    write_json(
        reaction_search_request_path,
        build_reaction_search_request(case, curated_path.name),
    )
    searched_path = run_dir / FINAL_ARTIFACTS["search-reactions"]
    run_command(
        "search-reactions",
        [
            sys.executable,
            str(REPOSITORY_ROOT / SKILL_SCRIPTS["search_reaction"]),
            "--input",
            str(reaction_search_request_path),
            "--output",
            str(searched_path),
        ],
        {0},
        audit,
    )
    run_validator("search_reaction", searched_path, run_dir, audit)
    searched = load_json(searched_path)

    route_request = build_route_request(case, standardized)
    route_discovery_request_path = run_dir / "07_route_discovery_request.json"
    write_json(route_discovery_request_path, route_request)
    route_discovery_path = run_dir / "07_route_discovery.json"
    run_command(
        "review-routes:discover-step-binding",
        [
            sys.executable,
            str(REPOSITORY_ROOT / SKILL_SCRIPTS["review_route"]),
            "--input",
            str(route_discovery_request_path),
            "--output",
            str(route_discovery_path),
        ],
        {0},
        audit,
    )
    run_validator("review_route", route_discovery_path, run_dir, audit)
    discovery = load_json(route_discovery_path)
    step = discovery["route_summaries"][0]["step_reviews"][0]
    route_request["step_artifacts"] = [
        {
            "route_id": case["route"]["route_id"],
            "step_id": step["step_id"],
            "step_reaction_hash": step["step_reaction_hash"],
            "curation_record_id": curated["records"][0]["record_id"],
            "curation_artifact": curated,
            "precedent_artifact": searched,
        }
    ]
    final_route_request_path = run_dir / "07_route_request.json"
    write_json(final_route_request_path, route_request)
    reviewed_path = run_dir / FINAL_ARTIFACTS["review-routes"]
    run_command(
        "review-routes",
        [
            sys.executable,
            str(REPOSITORY_ROOT / SKILL_SCRIPTS["review_route"]),
            "--input",
            str(final_route_request_path),
            "--output",
            str(reviewed_path),
        ],
        {0},
        audit,
    )
    run_validator("review_route", reviewed_path, run_dir, audit)
    reviewed = load_json(reviewed_path)
    assert_reaction_chain(
        case,
        curated,
        searched,
        reviewed,
        assertions,
    )

    artifact_paths = [run_dir / filename for filename in FINAL_ARTIFACTS.values()]
    scan_artifacts(artifact_paths, run_dir.parent, assertions)
    write_json(run_dir / "command_audit.json", audit)
    return {
        "fingerprints": {
            skill_id: load_json(run_dir / filename)["result_fingerprint"]
            for skill_id, filename in FINAL_ARTIFACTS.items()
        },
        "assertions": assertions,
        "validators_passed": 8,
    }


def write_gold_report(
    case: dict[str, Any],
    output_root: Path,
    first: dict[str, Any],
    second: dict[str, Any],
) -> dict[str, Any]:
    repeatability = {
        skill_id: first["fingerprints"][skill_id] == second["fingerprints"][skill_id]
        for skill_id in FINAL_ARTIFACTS
    }
    if not all(repeatability.values()):
        failed = [skill_id for skill_id, passed in repeatability.items() if not passed]
        raise CaseFailure(
            "result_fingerprint repeatability failed: " + ", ".join(failed)
        )
    report = {
        "schema_version": "1.0.0",
        "case_id": case["case_id"],
        "status": "passed",
        "executed_skills": list(FINAL_ARTIFACTS),
        "run_count": 2,
        "validators_passed_per_run": first["validators_passed"],
        "semantic_assertion_count_per_run": len(first["assertions"]),
        "semantic_assertions": first["assertions"],
        "repeatability": {
            "passed": True,
            "by_skill": repeatability,
            "result_fingerprints": first["fingerprints"],
        },
        "network": {
            "used": False,
            "basis": (
                "identity sources were empty and all search providers were "
                "local artifacts"
            ),
        },
        "fees": {
            "api": False,
            "gpu": False,
            "external_database": False,
        },
        "scientific_scope": {
            "validated": (
                "CLI contracts, artifact handoffs, validators, controlled "
                "status propagation, and deterministic fingerprints"
            ),
            "not_validated": [
                "chemical expert acceptance",
                "real user acceptance",
                "experimental feasibility",
                "experimental safety",
                "production performance",
            ],
        },
        "artifacts": {
            "run_1": {
                skill_id: f"run-1/{filename}"
                for skill_id, filename in FINAL_ARTIFACTS.items()
            },
            "run_2": {
                skill_id: f"run-2/{filename}"
                for skill_id, filename in FINAL_ARTIFACTS.items()
            },
        },
    }
    write_json(output_root / "gold_report.json", report)
    lines = [
        "# Aspirin Seven-Skill E2E Gold Report",
        "",
        f"- Case: `{case['case_id']}`",
        "- Status: `passed`",
        "- Runs: `2`",
        f"- Skills: `{len(FINAL_ARTIFACTS)}`",
        f"- Validators per run: `{first['validators_passed']}`",
        (f"- Semantic assertions per run: `{len(first['assertions'])}`"),
        "- Result fingerprint repeatability: `passed`",
        "- Network/API/GPU fees: `none`",
        "",
        "This report validates the engineering workflow only. It does not "
        "approve experimental feasibility, safety, or production use.",
        "",
    ]
    (output_root / "gold_report.md").write_text(
        "\n".join(lines),
        encoding="utf-8",
    )
    return report


def run_acceptance(case_path: Path, output_root: Path) -> dict[str, Any]:
    if output_root.exists() and any(output_root.iterdir()):
        raise CaseFailure(f"output directory must be absent or empty: {output_root}")
    output_root.mkdir(parents=True, exist_ok=True)
    case = load_json(case_path)
    first = execute_once(case, output_root / "run-1")
    second = execute_once(case, output_root / "run-2")
    return write_gold_report(case, output_root, first, second)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Run the offline aspirin acceptance case across all seven chemistry skills."
        )
    )
    parser.add_argument(
        "--case",
        type=Path,
        default=DEFAULT_CASE_PATH,
    )
    parser.add_argument("--output-dir", required=True, type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        report = run_acceptance(
            args.case.resolve(),
            args.output_dir.resolve(),
        )
    except (CaseFailure, OSError, ValueError, KeyError) as error:
        print(f"acceptance case failed: {error}", file=sys.stderr)
        return 1
    print(
        json.dumps(
            {
                "case_id": report["case_id"],
                "status": report["status"],
                "skills": len(report["executed_skills"]),
                "repeatability": report["repeatability"]["passed"],
                "gold_report": str(args.output_dir.resolve() / "gold_report.json"),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
