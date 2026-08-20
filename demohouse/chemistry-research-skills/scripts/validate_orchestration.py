"""Repository release checks for the chemistry orchestration boundary."""

from __future__ import annotations

import ast
import importlib.util
import json
import re
import sys
from pathlib import Path
from typing import Any

import yaml


REQUIRED_FILES = (
    "orchestration/chemistry-agent-bundle-v1.json",
    "skills/chemistry-research-router/SKILL.md",
    "skills/chemistry-research-router/agents/openai.yaml",
    "skills/chemistry-research-router/references/routing-boundaries.md",
    "skills/chemistry-research-router/references/routing-examples.md",
    "skills/chemistry-research-router/scripts/bundle_manifest.py",
    "skills/chemistry-research-router/scripts/bundle_spec.py",
    "skills/chemistry-research-router/scripts/bundle_install_cli.py",
    "skills/chemistry-research-router/scripts/install_bundle.py",
    "skills/chemistry-research-router/scripts/installation_smoke.py",
    "skills/chemistry-research-router/scripts/installation_smoke_cases.py",
    "skills/chemistry-research-router/scripts/intent_builder.py",
    "skills/chemistry-research-router/scripts/build_intent.py",
    "skills/chemistry-research-router/scripts/run_router.py",
    "skills/chemistry-research-router/scripts/validate_installation.py",
)
SCHEMA_FILES = (
    "attachment-manifest-v1.schema.json",
    "certification-record-v1.schema.json",
    "clarification-request-v1.schema.json",
    "research-intent-v1.schema.json",
    "route-confirmation-v1.schema.json",
    "route-decision-v1.schema.json",
    "router-execution-request-v1.schema.json",
)
CHAIN_IDS = {
    "identity-standardization-v1",
    "reaction-precedent-v1",
    "structure-features-v1",
    "structure-library-v1",
}
WORKFLOW_IDS = {"compound-evidence-v1", "route-evidence-review-v1"}
FORBIDDEN_DATA_KEYS = {"command", "entrypoint", "validator", "url"}
HIDDEN_GOLD_MARKERS = {"R08", "X01", "expected_targets"}
MAX_PRODUCTION_LINES = 399
MAX_FUNCTION_LINES = 80
SECRET_PATTERNS = (
    re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"),
    re.compile(r"github_pat_[A-Za-z0-9_]{20,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"sk-[A-Za-z0-9_-]{20,}"),
    re.compile(r"ark-[A-Za-z0-9-]{30,}"),
)


def _load_module(path: Path, name: str) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path.name}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def _read_json(path: Path, errors: list[str]) -> dict[str, Any] | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        errors.append(f"{path.as_posix()}: invalid JSON: {error}")
        return None
    if not isinstance(value, dict):
        errors.append(f"{path.as_posix()}: JSON top level must be an object")
        return None
    return value


def _required_files(root: Path, errors: list[str]) -> None:
    for relative in REQUIRED_FILES:
        if not (root / relative).is_file():
            errors.append(f"missing orchestration release file: {relative}")


def _schema_boundary(root: Path, errors: list[str]) -> None:
    references = root / "skills/chemistry-research-router/references"
    actual = {path.name for path in references.glob("*.schema.json")}
    if actual != set(SCHEMA_FILES):
        errors.append(
            "Router Schema set mismatch: "
            f"expected={sorted(SCHEMA_FILES)} actual={sorted(actual)}"
        )
    ids: set[str] = set()
    for filename in sorted(actual & set(SCHEMA_FILES)):
        value = _read_json(references / filename, errors)
        if value is None:
            continue
        if value.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
            errors.append(f"{filename}: Schema dialect must be Draft 2020-12")
        schema_id = value.get("$id")
        if not isinstance(schema_id, str) or not schema_id.startswith("urn:"):
            errors.append(f"{filename}: Schema $id must be a URN")
        elif schema_id in ids:
            errors.append(f"{filename}: duplicate Schema $id")
        else:
            ids.add(schema_id)


def _recursive_keys(value: Any) -> set[str]:
    if isinstance(value, dict):
        return set(value) | {
            key for item in value.values() for key in _recursive_keys(item)
        }
    if isinstance(value, list):
        return {key for item in value for key in _recursive_keys(item)}
    return set()


def _controlled_json_boundary(root: Path, errors: list[str]) -> None:
    files = [
        root / "skills/chemistry-research-router/references/route-catalog-v1.json",
        *sorted((root / "orchestration/definitions").glob("*.json")),
        *sorted((root / "workflows/definitions").glob("*.json")),
        root / "orchestration/chemistry-agent-bundle-v1.json",
    ]
    chain_ids: set[str] = set()
    workflow_ids: set[str] = set()
    for path in files:
        value = _read_json(path, errors)
        if value is None:
            continue
        forbidden = _recursive_keys(value) & FORBIDDEN_DATA_KEYS
        if forbidden:
            errors.append(
                f"{path.relative_to(root)}: forbidden keys {sorted(forbidden)}"
            )
        if "chain_id" in value:
            chain_ids.add(value["chain_id"])
        if "workflow_id" in value:
            workflow_ids.add(value["workflow_id"])
    if chain_ids != CHAIN_IDS:
        errors.append("bounded chain Definition set mismatch")
    if workflow_ids != WORKFLOW_IDS:
        errors.append("Workflow Definition set mismatch")


def _skill_metadata(root: Path, errors: list[str]) -> None:
    skill_root = root / "skills/chemistry-research-router"
    skill_path = skill_root / "SKILL.md"
    try:
        text = skill_path.read_text(encoding="utf-8")
        _, frontmatter, _ = text.split("---\n", 2)
        metadata = yaml.safe_load(frontmatter)
    except (OSError, UnicodeError, ValueError, yaml.YAMLError) as error:
        errors.append(f"Router SKILL.md metadata is invalid: {error}")
        return
    if (
        not isinstance(metadata, dict)
        or set(metadata) != {"name", "description"}
        or metadata.get("name") != "chemistry-research-router"
    ):
        errors.append("Router SKILL.md frontmatter mismatch")
    try:
        agent = yaml.safe_load(
            (skill_root / "agents/openai.yaml").read_text(encoding="utf-8")
        )
    except (OSError, UnicodeError, yaml.YAMLError) as error:
        errors.append(f"Router Agent metadata is invalid: {error}")
        return
    prompt = (
        agent.get("interface", {}).get("default_prompt")
        if isinstance(agent, dict)
        else None
    )
    if not isinstance(prompt, str) or "$chemistry-research-router" not in prompt:
        errors.append("Router Agent metadata does not invoke the Router Skill")


def _text_boundary(root: Path, errors: list[str]) -> None:
    router_root = root / "skills/chemistry-research-router"
    user_path_marker = "/" + "Users" + "/"
    internal_path_marker = "byte" + "dance" + "/"
    for path in router_root.rglob("*"):
        if not path.is_file() or "__pycache__" in path.parts:
            continue
        if path.suffix not in {".md", ".py", ".json", ".txt", ".yaml", ".yml"}:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeError:
            errors.append(f"{path.relative_to(root)}: non-UTF-8 file")
            continue
        relative = path.relative_to(root)
        if user_path_marker in text or internal_path_marker in text:
            errors.append(f"{relative}: machine-specific path")
        if any(pattern.search(text) for pattern in SECRET_PATTERNS):
            errors.append(f"{relative}: possible credential")
    exposed = [
        router_root / "SKILL.md",
        router_root / "agents/openai.yaml",
        router_root / "references/routing-boundaries.md",
        router_root / "references/routing-examples.md",
    ]
    for path in exposed:
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            errors.append(f"{path.relative_to(root)}: exposed metadata is unreadable")
            continue
        if HIDDEN_GOLD_MARKERS & {
            marker for marker in HIDDEN_GOLD_MARKERS if marker in text
        }:
            errors.append(f"{path.relative_to(root)}: hidden Gold marker")


def _python_boundary(root: Path, errors: list[str]) -> None:
    scripts = root / "skills/chemistry-research-router/scripts"
    for path in sorted(scripts.glob("*.py")):
        relative = path.relative_to(root)
        text = path.read_text(encoding="utf-8")
        if len(text.splitlines()) > MAX_PRODUCTION_LINES:
            errors.append(f"{relative}: production file exceeds 399 lines")
        try:
            tree = ast.parse(text, filename=relative.as_posix())
        except SyntaxError as error:
            errors.append(f"{relative}: invalid Python syntax: {error}")
            continue
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                length = (node.end_lineno or node.lineno) - node.lineno + 1
                if length > MAX_FUNCTION_LINES:
                    errors.append(
                        f"{relative}:{node.lineno}: function {node.name} exceeds 80 lines"
                    )
            modules: list[str] = []
            if isinstance(node, ast.Import):
                modules = [item.name for item in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module:
                modules = [node.module]
            if any(name == "skills" or name.startswith("skills.") for name in modules):
                errors.append(f"{relative}:{node.lineno}: Router imports Skill module")


def _manifest_boundary(root: Path, errors: list[str]) -> None:
    module_path = root / "skills/chemistry-research-router/scripts/bundle_manifest.py"
    manifest_path = root / "orchestration/chemistry-agent-bundle-v1.json"
    try:
        bundle = _load_module(module_path, "release_orchestration_manifest")
        manifest = _read_json(manifest_path, errors)
        if manifest is not None:
            bundle.validate_bundle_manifest(manifest, root)
    except (RuntimeError, ValueError, OSError, SyntaxError) as error:
        errors.append(f"orchestration package fingerprint validation failed: {error}")


def validate_orchestration_boundary(root: Path, errors: list[str]) -> None:
    """Validate Router, Definitions and bundle as one release boundary."""
    _required_files(root, errors)
    _schema_boundary(root, errors)
    _controlled_json_boundary(root, errors)
    _skill_metadata(root, errors)
    _text_boundary(root, errors)
    _python_boundary(root, errors)
    _manifest_boundary(root, errors)
