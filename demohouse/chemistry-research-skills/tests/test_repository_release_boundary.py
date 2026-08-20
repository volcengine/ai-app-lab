from __future__ import annotations

import importlib.util
import json
import shutil
import tomllib
from pathlib import Path
from typing import Any


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
SKILLS_ROOT = REPOSITORY_ROOT / "skills"
VALIDATOR_PATH = REPOSITORY_ROOT / "scripts" / "validate_repository.py"

EXPECTED_PUBLIC_SKILLS = {
    "resolve-chemical-identities",
    "standardize-chemical-structures",
    "compute-molecular-features",
    "search-and-curate-chemical-libraries",
    "curate-reactions",
    "search-reactions",
    "review-routes",
}
EXPECTED_DISCOVERABLE_SKILLS = EXPECTED_PUBLIC_SKILLS | {"chemistry-research-router"}
EXPECTED_PROJECT_NAME = "chemistry-research-skills"
EXPECTED_DISPLAY_NAME = "Chemistry Research Skills"
EXPECTED_BUNDLE_ID = "chemistry-research-agent-bundle"
EXPECTED_DEV_DEPENDENCIES = {
    "chembl-structure-pipeline==1.2.4",
    "jsonschema==4.25.1",
    "ord-schema==0.8.3",
    "pytest==9.0.3",
    "PyYAML==6.0.2",
    "rdkit==2025.9.2",
    "ruff==0.16.2",
}
PUBLIC_METADATA_FILES = {
    "README.md",
    "NOTICE",
    "CITATION.cff",
    "SECURITY.md",
    "CODE_OF_CONDUCT.md",
    "package.json",
    ".github/ISSUE_TEMPLATE/config.yml",
}
FORBIDDEN_PUBLIC_IDENTIFIERS = {
    "3494036618" + "-eng",
    "yu" + "tong",
    "/" + "Users" + "/",
    "byte" + "dance",
}


def load_repository_validator() -> Any:
    spec = importlib.util.spec_from_file_location(
        "release_boundary_repository_validator",
        VALIDATOR_PATH,
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def direct_requirement_lines(path: Path) -> set[str]:
    return {
        line.strip()
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }


def test_skill_directory_contains_exactly_public_skills():
    actual = {path.name for path in SKILLS_ROOT.iterdir() if path.is_dir()}
    assert actual == EXPECTED_DISCOVERABLE_SKILLS


def test_repository_validator_lists_exactly_public_skills():
    validator = load_repository_validator()
    assert set(validator.SKILLS) == EXPECTED_PUBLIC_SKILLS


def test_plugin_manifest_declares_portable_repository():
    plugin = json.loads((REPOSITORY_ROOT / "plugin.json").read_text(encoding="utf-8"))

    assert plugin == {
        "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
        "name": EXPECTED_PROJECT_NAME,
        "version": "0.1.0-alpha.2",
        "description": (
            "Auditable chemistry skills and research workflows for AI agents."
        ),
        "author": {"name": f"{EXPECTED_DISPLAY_NAME} contributors"},
        "license": "Apache-2.0",
        "keywords": [
            "agent-skills",
            "chemistry",
            "cheminformatics",
            "scientific-agents",
            "research-workflows",
        ],
    }


def test_public_project_identity_is_consistent():
    pyproject = tomllib.loads(
        (REPOSITORY_ROOT / "pyproject.toml").read_text(encoding="utf-8")
    )
    citation = (REPOSITORY_ROOT / "CITATION.cff").read_text(encoding="utf-8")
    notice = (REPOSITORY_ROOT / "NOTICE").read_text(encoding="utf-8")
    bundle = json.loads(
        (REPOSITORY_ROOT / "orchestration/chemistry-agent-bundle-v1.json").read_text(
            encoding="utf-8"
        )
    )

    assert pyproject["project"]["name"] == EXPECTED_PROJECT_NAME
    assert f'title: "{EXPECTED_DISPLAY_NAME}"' in citation
    assert notice.splitlines()[0] == EXPECTED_DISPLAY_NAME
    assert bundle["bundle_id"] == EXPECTED_BUNDLE_ID


def test_router_is_standard_discoverable_but_not_scientific_skill():
    router_root = SKILLS_ROOT / "chemistry-research-router"

    assert (router_root / "SKILL.md").is_file()
    assert (router_root / "scripts" / "run_router.py").is_file()
    assert "chemistry-research-router" not in EXPECTED_PUBLIC_SKILLS


def test_public_metadata_excludes_personal_identifiers():
    for relative in PUBLIC_METADATA_FILES:
        text = (REPOSITORY_ROOT / relative).read_text(encoding="utf-8")
        text = text.replace(
            "github:3494036618-eng/chemistry-research-skills",
            "github:PUBLIC_REPOSITORY/chemistry-research-skills",
        )
        for identifier in FORBIDDEN_PUBLIC_IDENTIFIERS:
            assert identifier not in text, f"{identifier!r} found in {relative}"


def test_readme_reports_representative_live_host_acceptance():
    readme = (REPOSITORY_ROOT / "README.md").read_text(encoding="utf-8")

    assert "真实 Host 端到端验证：代表性自然语言链路已通过" in readme
    assert "npx github:3494036618-eng/chemistry-research-skills install" in readme
    assert "Representative live-host acceptance: passed" in readme
    assert "npx github:3494036618-eng/chemistry-research-skills install" in readme
    assert "单客户端" not in readme
    assert "single-host" not in readme
    assert "Codex、Claude Code 最新 Bundle 真实调用" not in readme
    assert "Codex and Claude Code live acceptance" not in readme


def test_npm_manifest_exposes_npx_installer():
    package = json.loads((REPOSITORY_ROOT / "package.json").read_text(encoding="utf-8"))

    assert package["name"] == EXPECTED_PROJECT_NAME
    assert package["version"] == "0.1.0-alpha.2"
    assert package["bin"] == {
        "chemistry-research-skills": "bin/chemistry-research-skills.mjs",
    }
    assert package["license"] == "Apache-2.0"
    assert package.get("private") is not True
    assert "bin" in package["files"]
    assert "skills" in package["files"]
    assert "uv.lock" in package["files"]


def test_node_installer_supports_help_and_dry_run(tmp_path):
    import subprocess

    bin_path = REPOSITORY_ROOT / "bin" / "chemistry-research-skills.mjs"

    help_result = subprocess.run(
        ["node", str(bin_path), "--help"],
        cwd=REPOSITORY_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    assert "chemistry-research-skills install" in help_result.stdout
    assert "--target-root" in help_result.stdout

    dry_run = subprocess.run(
        [
            "node",
            str(bin_path),
            "install",
            "--host",
            "trae",
            "--target-root",
            str(tmp_path),
            "--dry-run",
            "--json",
        ],
        cwd=REPOSITORY_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    result = json.loads(dry_run.stdout)
    assert result["status"] == "dry_run"
    assert result["host"] == "trae"
    assert result["targetRoot"] == str(tmp_path)
    assert any("install_bundle.py" in " ".join(item) for item in result["commands"])
    assert any("uv" in item[0] and "sync" in item for item in result["commands"])


def test_release_dependency_files_exclude_private_candidate():
    pyproject = tomllib.loads(
        (REPOSITORY_ROOT / "pyproject.toml").read_text(encoding="utf-8")
    )
    direct = set(pyproject["dependency-groups"]["dev"])
    requirements = direct_requirement_lines(REPOSITORY_ROOT / "requirements-dev.txt")
    lock = tomllib.loads((REPOSITORY_ROOT / "uv.lock").read_text(encoding="utf-8"))
    locked_names = {package["name"] for package in lock["package"]}

    assert direct == EXPECTED_DEV_DEPENDENCIES
    assert requirements == EXPECTED_DEV_DEPENDENCIES
    assert "gemmi" not in locked_names


def test_repository_validator_accepts_workflow_release_boundary():
    validator = load_repository_validator()
    errors: list[str] = []

    validator.validate_workflow_boundary(errors)

    assert errors == []


def test_repository_validator_rejects_definition_fingerprint_tamper(
    tmp_path,
):
    validator = load_repository_validator()
    workflow_root = tmp_path / "workflows"
    shutil.copytree(REPOSITORY_ROOT / "workflows", workflow_root)
    definition_path = workflow_root / "definitions" / "compound-evidence-v1.json"
    definition = json.loads(definition_path.read_text(encoding="utf-8"))
    definition["definition_version"] = "9.9.9"
    definition_path.write_text(
        json.dumps(definition, ensure_ascii=False),
        encoding="utf-8",
    )
    validator.ROOT = tmp_path
    errors: list[str] = []

    validator.validate_workflow_boundary(errors)

    assert any("definition fingerprint mismatch" in item for item in errors)


def test_repository_validator_accepts_orchestration_boundary():
    validator = load_repository_validator()
    errors: list[str] = []

    validator.validate_orchestration_boundary(errors)

    assert errors == []


def test_orchestration_is_not_counted_as_eighth_scientific_skill():
    validator = load_repository_validator()

    assert len(validator.SKILLS) == 7
    assert "chemistry-research-router" not in validator.SKILLS


def test_repository_validator_rejects_bundle_manifest_tamper(tmp_path):
    validator = load_repository_validator()
    for directory in ("skills", "workflows", "orchestration"):
        shutil.copytree(REPOSITORY_ROOT / directory, tmp_path / directory)
    for filename in ("pyproject.toml", "requirements-dev.txt", "uv.lock"):
        shutil.copy2(REPOSITORY_ROOT / filename, tmp_path / filename)
    manifest_path = tmp_path / "orchestration" / "chemistry-agent-bundle-v1.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["package_fingerprint"] = "0" * 64
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    validator.ROOT = tmp_path
    errors: list[str] = []

    validator.validate_orchestration_boundary(errors)

    assert any("package fingerprint" in item for item in errors)


def test_orchestration_validator_reports_missing_files_without_crashing(
    tmp_path,
):
    validator = load_repository_validator()
    for directory in ("skills", "workflows", "orchestration"):
        shutil.copytree(REPOSITORY_ROOT / directory, tmp_path / directory)
    for filename in ("pyproject.toml", "requirements-dev.txt", "uv.lock"):
        shutil.copy2(REPOSITORY_ROOT / filename, tmp_path / filename)
    router_root = tmp_path / "skills" / "chemistry-research-router"
    (router_root / "SKILL.md").unlink()
    (router_root / "scripts" / "bundle_spec.py").unlink()
    validator.ROOT = tmp_path
    errors: list[str] = []

    validator.validate_orchestration_boundary(errors)

    assert any("SKILL.md" in item for item in errors)
    assert any("bundle_spec.py" in item for item in errors)


def test_orchestration_validator_requires_intent_builder(tmp_path):
    validator = load_repository_validator()
    for directory in ("skills", "workflows", "orchestration"):
        shutil.copytree(REPOSITORY_ROOT / directory, tmp_path / directory)
    for filename in ("pyproject.toml", "requirements-dev.txt", "uv.lock"):
        shutil.copy2(REPOSITORY_ROOT / filename, tmp_path / filename)
    builder_path = (
        tmp_path
        / "skills"
        / "chemistry-research-router"
        / "scripts"
        / "intent_builder.py"
    )
    builder_path.unlink()
    validator.ROOT = tmp_path
    errors: list[str] = []

    validator.validate_orchestration_boundary(errors)

    assert any("intent_builder.py" in item for item in errors)
