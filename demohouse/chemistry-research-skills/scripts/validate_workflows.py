"""Repository release-boundary checks for the built-in Workflow Runtime."""

from __future__ import annotations

import ast
import hashlib
import json
from pathlib import Path
from typing import Any


DEFINITION_FILES = {
    "compound-evidence-v1.json",
    "route-evidence-review-v1.json",
}
REQUIRED_FILES = (
    "workflows/scripts/run_workflow.py",
    "workflows/scripts/validate_workflow.py",
    "examples/workflow-a-b-e2e/run_acceptance.py",
    "examples/workflow-a-b-e2e/README.md",
    "examples/workflow-a-b-e2e/workflow-a-request.json",
    "examples/workflow-a-b-e2e/workflow-b-request.json",
    "examples/workflow-a-b-e2e/inputs/reactions.json",
    "examples/workflow-a-b-e2e/inputs/routes.json",
)
MAX_PRODUCTION_FILE_LINES = 399
MAX_FUNCTION_LINES = 80


def _canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )


def _definition_fingerprint(value: dict[str, Any]) -> str:
    payload = {
        key: item for key, item in value.items() if key != "definition_fingerprint"
    }
    return hashlib.sha256(_canonical_json(payload).encode("utf-8")).hexdigest()


def _definition_errors(
    definition_path: Path,
    errors: list[str],
) -> None:
    relative = definition_path.as_posix()
    try:
        value = json.loads(definition_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        errors.append(f"{relative}: unreadable definition JSON: {error}")
        return
    if not isinstance(value, dict):
        errors.append(f"{relative}: definition must be an object")
        return
    declared = value.get("definition_fingerprint")
    try:
        expected = _definition_fingerprint(value)
    except (TypeError, ValueError) as error:
        errors.append(f"{relative}: definition is not canonical JSON: {error}")
        return
    if declared != expected:
        errors.append(f"{relative}: definition fingerprint mismatch")


def _function_budget_errors(
    path: Path,
    tree: ast.AST,
    errors: list[str],
) -> None:
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if node.end_lineno is None:
            continue
        length = node.end_lineno - node.lineno + 1
        if length > MAX_FUNCTION_LINES:
            errors.append(
                f"{path.as_posix()}:{node.lineno}: "
                f"function {node.name} exceeds {MAX_FUNCTION_LINES} lines"
            )


def _cross_skill_import_errors(
    path: Path,
    tree: ast.AST,
    errors: list[str],
) -> None:
    for node in ast.walk(tree):
        modules: list[str] = []
        if isinstance(node, ast.Import):
            modules = [item.name for item in node.names]
        elif isinstance(node, ast.ImportFrom) and node.module is not None:
            modules = [node.module]
        if any(
            module == "skills" or module.startswith("skills.") for module in modules
        ):
            errors.append(
                f"{path.as_posix()}:{node.lineno}: "
                "Workflow must not import Skill Python modules"
            )


def _production_file_errors(
    root: Path,
    path: Path,
    errors: list[str],
) -> None:
    relative = path.relative_to(root)
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as error:
        errors.append(f"{relative}: unreadable Python file: {error}")
        return
    line_count = len(text.splitlines())
    if line_count > MAX_PRODUCTION_FILE_LINES:
        errors.append(
            f"{relative}: production file exceeds {MAX_PRODUCTION_FILE_LINES} lines"
        )
    try:
        tree = ast.parse(text, filename=relative.as_posix())
    except SyntaxError as error:
        errors.append(f"{relative}: invalid Python syntax: {error}")
        return
    _function_budget_errors(relative, tree, errors)
    _cross_skill_import_errors(relative, tree, errors)


def _definition_boundary(root: Path, errors: list[str]) -> None:
    definitions = root / "workflows" / "definitions"
    actual = (
        {path.name for path in definitions.glob("*.json")}
        if definitions.is_dir()
        else set()
    )
    if actual != DEFINITION_FILES:
        errors.append(
            "workflow definitions mismatch: "
            f"expected={sorted(DEFINITION_FILES)} actual={sorted(actual)}"
        )
    for name in sorted(actual & DEFINITION_FILES):
        _definition_errors(definitions / name, errors)


def validate_workflow_boundary(
    root: Path,
    errors: list[str],
) -> None:
    _definition_boundary(root, errors)
    for relative in REQUIRED_FILES:
        if not (root / relative).is_file():
            errors.append(f"missing workflow release file: {relative}")
    production_files = sorted((root / "workflows" / "scripts").glob("*.py"))
    acceptance = root / "examples" / "workflow-a-b-e2e" / "run_acceptance.py"
    if acceptance.is_file():
        production_files.append(acceptance)
    if not production_files:
        errors.append("workflow production files are missing")
    for path in production_files:
        _production_file_errors(root, path, errors)
