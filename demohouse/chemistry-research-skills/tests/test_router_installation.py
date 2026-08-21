from __future__ import annotations

import hashlib
import importlib.util
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest
import yaml


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
ROUTER_ROOT = REPOSITORY_ROOT / "skills" / "chemistry-research-router"
ROUTER_SCRIPTS = ROUTER_ROOT / "scripts"
EXPECTED_ROUTER_DESCRIPTION = (
    "理解化学科研自然语言需求，生成带来源绑定的 ResearchIntent，并通过本地"
    "确定性校验路由到七个化学 Skill、受控 Skill 链或 Workflow A/B。用于复杂、"
    "多步、模糊、需要自动编排，或可能联网、产生费用和发送数据的化学身份、"
    "结构、特征、分子库、反应和已有路线任务；毒性预测、路线生成、实验安全和"
    "放大审批不支持。"
)


def load_router_module(name: str, filename: str) -> Any:
    path = ROUTER_SCRIPTS / filename
    assert path.is_file(), f"missing Router module: {filename}"
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def copy_bundle_source(tmp_path: Path) -> Path:
    snapshot = tmp_path / "source"
    snapshot.mkdir()
    ignore = shutil.ignore_patterns("__pycache__", "*.pyc")
    for directory in ("skills", "workflows", "orchestration"):
        shutil.copytree(
            REPOSITORY_ROOT / directory,
            snapshot / directory,
            ignore=ignore,
        )
    for filename in ("pyproject.toml", "requirements-dev.txt", "uv.lock"):
        shutil.copy2(REPOSITORY_ROOT / filename, snapshot / filename)
    return snapshot


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )


def resign_receipt(receipt: dict[str, Any]) -> dict[str, Any]:
    payload = {
        key: value for key, value in receipt.items() if key != "receipt_fingerprint"
    }
    receipt["receipt_fingerprint"] = hashlib.sha256(
        canonical_json(payload).encode("utf-8")
    ).hexdigest()
    return receipt


def load_frontmatter(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    assert text.startswith("---\n")
    _, frontmatter, _ = text.split("---\n", 2)
    value = yaml.safe_load(frontmatter)
    assert isinstance(value, dict)
    return value


def test_router_skill_has_standard_frontmatter_and_small_metadata() -> None:
    metadata = load_frontmatter(ROUTER_ROOT / "SKILL.md")

    assert metadata == {
        "name": "chemistry-research-router",
        "description": EXPECTED_ROUTER_DESCRIPTION,
    }
    assert len(metadata["description"]) <= 1024


def test_router_skill_does_not_contain_hidden_gold_or_scientific_defaults() -> None:
    text = (ROUTER_ROOT / "SKILL.md").read_text(encoding="utf-8")

    assert "R08" not in text
    assert "X01" not in text
    assert "expected_targets" not in text
    assert "0.7" not in text


def test_router_skill_requires_semantic_intent_and_controlled_cli() -> None:
    text = (ROUTER_ROOT / "SKILL.md").read_text(encoding="utf-8")

    for required in (
        "ResearchIntent V1",
        "build_intent.py",
        "semantic draft",
        "run_router.py route",
        "run_router.py execute",
        "clarification_required",
        "confirmation_required",
        "unsupported",
    ):
        assert required in text
    for forbidden in (
        "关键词匹配作为主路由",
        "Agent 补充科学参数",
        "绕过 Validator",
        "自由拼接 Skill",
    ):
        assert forbidden in text


def test_router_skill_exposes_host_discovery_metadata() -> None:
    metadata_path = ROUTER_ROOT / "agents" / "openai.yaml"
    metadata = yaml.safe_load(metadata_path.read_text(encoding="utf-8"))

    assert metadata == {
        "interface": {
            "display_name": "化学科研确定性路由",
            "short_description": (
                "从自然语言生成来源绑定 Intent，并安全路由到七 Skill、固定 chain"
                " 或 Workflow"
            ),
            "default_prompt": (
                "使用 $chemistry-research-router 理解这项化学科研需求，生成带来源绑定"
                "的 ResearchIntent，经本地 Policy 与 Router 校验后，仅在授权状态下"
                "执行目标。"
            ),
        }
    }


def test_bundle_manifest_covers_only_the_portable_runtime() -> None:
    bundle = load_router_module(
        "router_installation_bundle_manifest",
        "bundle_manifest.py",
    )

    manifest = bundle.build_bundle_manifest(REPOSITORY_ROOT)

    assert {item["skill_id"] for item in manifest["skills"]} == {
        "resolve-chemical-identities",
        "standardize-chemical-structures",
        "compute-molecular-features",
        "search-and-curate-chemical-libraries",
        "curate-reactions",
        "search-reactions",
        "review-routes",
    }
    assert len(manifest["runtime_schemas"]) == 7
    assert len(manifest["chain_definitions"]) == 4
    assert len(manifest["workflow_definitions"]) == 2
    assert bundle.validate_bundle_manifest(manifest, REPOSITORY_ROOT) == manifest
    paths = [item["path"] for item in manifest["distributable_files"]]
    assert paths == sorted(paths)
    assert all(not Path(path).is_absolute() for path in paths)
    assert all(not path.startswith("tests/") for path in paths)
    assert all("certification/" not in path for path in paths)
    assert all("installation-receipt.json" not in path for path in paths)
    assert "skills/chemistry-research-router/scripts/build_intent.py" in paths
    assert "skills/chemistry-research-router/scripts/intent_builder.py" in paths


def test_bundle_manifest_detects_router_file_tamper(tmp_path: Path) -> None:
    bundle = load_router_module(
        "router_installation_bundle_tamper",
        "bundle_manifest.py",
    )
    snapshot = copy_bundle_source(tmp_path)
    manifest = bundle.build_bundle_manifest(snapshot)
    skill_md = snapshot / "skills" / "chemistry-research-router" / "SKILL.md"
    skill_md.write_text(
        skill_md.read_text(encoding="utf-8") + "\nchanged\n",
        encoding="utf-8",
    )

    with pytest.raises(bundle.BundleIntegrityError, match="SHA-256"):
        bundle.validate_bundle_manifest(manifest, snapshot)


@pytest.mark.parametrize(
    ("host_id", "relative_skill_root"),
    [
        ("trae", Path(".trae/skills")),
        ("codex", Path(".agents/skills")),
        ("claude-code", Path(".claude/skills")),
    ],
)
def test_project_install_uses_controlled_host_path(
    tmp_path: Path,
    host_id: str,
    relative_skill_root: Path,
) -> None:
    installer = load_router_module(
        f"router_installation_{host_id}",
        "install_bundle.py",
    )

    receipt = installer.install_bundle(
        host_id,
        "project",
        REPOSITORY_ROOT,
        tmp_path,
    )

    assert Path(receipt["skill_root"]) == tmp_path / relative_skill_root
    assert Path(receipt["runtime_root"]) == (
        tmp_path / ".chemistry-agent-bundle" / "runtime"
    )
    assert (
        Path(receipt["runtime_root"])
        / "orchestration"
        / "chemistry-agent-bundle-v1.json"
    ).is_file()


def test_installed_bundle_builds_intent_without_source_repository(
    tmp_path: Path,
) -> None:
    installer = load_router_module(
        "router_installation_intent_builder",
        "install_bundle.py",
    )
    receipt = installer.install_bundle(
        "claude-code",
        "project",
        REPOSITORY_ROOT,
        tmp_path,
    )
    runtime = Path(receipt["runtime_root"])
    manifest = json.loads(
        (runtime / "orchestration/chemistry-agent-bundle-v1.json").read_text(
            encoding="utf-8"
        )
    )
    schemas = {item["schema_id"]: item for item in manifest["runtime_schemas"]}
    source = "把 aspirin 标准化"
    draft = {
        "schema_version": "1.0.0",
        "language": "zh-CN",
        "goal": {
            "goal_type": "standardize_structure",
            "chain_requirement": "single_operation",
            "evidence_text": source,
        },
        "research_objects": [
            {
                "object_type": "chemical_structure",
                "evidence": {
                    "source_kind": "message_span",
                    "text": "aspirin",
                },
            }
        ],
        "requested_operations": [
            {
                "operation_type": "standardize_structure",
                "negated": False,
                "evidence_text": "标准化",
            }
        ],
        "input_artifacts": [],
        "user_parameters": [],
        "candidate_targets": ["standardize-chemical-structures"],
        "ambiguities": [],
        "unsupported_goals": [],
    }
    attachments = {
        "schema_version": "1.0.0",
        "attachments": [],
        "attachments_fingerprint": hashlib.sha256(b"[]").hexdigest(),
    }
    certificate = {
        "schema_version": "1.0.0",
        "certification_id": "portable-precert-001",
        "status": "unverified",
        "host_id": "claude-code",
        "host_version": "test",
        "model_id": "test",
        "model_mode": "fixed",
        "router_skill_fingerprint": manifest["router_skill"][
            "router_skill_fingerprint"
        ],
        "catalog_fingerprint": manifest["route_catalog"]["catalog_fingerprint"],
        "schema_fingerprint": schemas["research-intent-v1"]["sha256"],
        "bundle_integrity": True,
        "certificate_fingerprint": "",
    }
    certificate["certificate_fingerprint"] = hashlib.sha256(
        canonical_json(
            {
                key: value
                for key, value in certificate.items()
                if key != "certificate_fingerprint"
            }
        ).encode("utf-8")
    ).hexdigest()
    inputs = tmp_path / "inputs"
    inputs.mkdir()
    paths = {
        "source": inputs / "source.txt",
        "draft": inputs / "draft.json",
        "attachments": inputs / "attachments.json",
        "certificate": inputs / "certificate.json",
        "intent": inputs / "intent.json",
    }
    paths["source"].write_text(source, encoding="utf-8")
    for key, value in (
        ("draft", draft),
        ("attachments", attachments),
        ("certificate", certificate),
    ):
        paths[key].write_text(canonical_json(value), encoding="utf-8")
    script = (
        runtime / "skills" / "chemistry-research-router" / "scripts" / "build_intent.py"
    )

    completed = subprocess.run(
        [
            sys.executable,
            str(script),
            "--draft",
            str(paths["draft"]),
            "--source",
            str(paths["source"]),
            "--attachments",
            str(paths["attachments"]),
            "--attachment-root",
            str(inputs),
            "--certificate",
            str(paths["certificate"]),
            "--intent",
            str(paths["intent"]),
        ],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr
    assert json.loads(completed.stdout)["valid"] is True
    assert paths["intent"].is_file()
    assert source not in completed.stdout


def test_installed_host_router_copy_routes_without_runtime_workaround(
    tmp_path: Path,
) -> None:
    installer = load_router_module(
        "router_installation_host_route",
        "install_bundle.py",
    )
    receipt = installer.install_bundle(
        "trae",
        "project",
        REPOSITORY_ROOT,
        tmp_path,
    )
    runtime = Path(receipt["runtime_root"])
    manifest = json.loads(
        (runtime / "orchestration/chemistry-agent-bundle-v1.json").read_text(
            encoding="utf-8"
        )
    )
    schemas = {item["schema_id"]: item for item in manifest["runtime_schemas"]}
    source = "对 structures.csv 中的结构先标准化，再计算指纹。"
    attachment_bytes = b"id,structure\nethanol,CCO\n"
    draft = {
        "schema_version": "1.0.0",
        "language": "zh-CN",
        "goal": {
            "goal_type": "compute_molecular_features",
            "chain_requirement": "explicit_bounded_chain",
            "evidence_text": source,
        },
        "research_objects": [
            {
                "object_type": "compound_collection",
                "evidence": {
                    "source_kind": "attachment",
                    "attachment_id": "structures-csv",
                },
            }
        ],
        "requested_operations": [
            {
                "operation_type": "standardize_structure",
                "negated": False,
                "evidence_text": "先标准化",
            },
            {
                "operation_type": "compute_fingerprint",
                "negated": False,
                "evidence_text": "再计算指纹",
            },
        ],
        "input_artifacts": [
            {
                "attachment_id": "structures-csv",
                "role": "structure_input",
            }
        ],
        "user_parameters": [],
        "candidate_targets": ["structure-features-v1"],
        "ambiguities": [],
        "unsupported_goals": [],
    }
    attachment = {
        "attachment_id": "structures-csv",
        "display_name": "structures.csv",
        "media_type": "text/csv",
        "sha256": hashlib.sha256(attachment_bytes).hexdigest(),
        "size_bytes": len(attachment_bytes),
    }
    attachments = {
        "schema_version": "1.0.0",
        "attachments": [attachment],
        "attachments_fingerprint": hashlib.sha256(
            canonical_json([attachment]).encode("utf-8")
        ).hexdigest(),
    }
    certificate = {
        "schema_version": "1.0.0",
        "certification_id": "portable-precert-host-route",
        "status": "unverified",
        "host_id": "trae",
        "host_version": "test",
        "model_id": "test",
        "model_mode": "host_auto",
        "router_skill_fingerprint": manifest["router_skill"][
            "router_skill_fingerprint"
        ],
        "catalog_fingerprint": manifest["route_catalog"]["catalog_fingerprint"],
        "schema_fingerprint": schemas["research-intent-v1"]["sha256"],
        "bundle_integrity": True,
        "certificate_fingerprint": "",
    }
    certificate["certificate_fingerprint"] = hashlib.sha256(
        canonical_json(
            {
                key: value
                for key, value in certificate.items()
                if key != "certificate_fingerprint"
            }
        ).encode("utf-8")
    ).hexdigest()
    inputs = tmp_path / "inputs"
    run = tmp_path / "run"
    inputs.mkdir()
    run.mkdir()
    paths = {
        "source": inputs / "source.txt",
        "draft": inputs / "draft.json",
        "attachments": inputs / "attachments.json",
        "certificate": inputs / "certificate.json",
        "intent": run / "intent.json",
        "decision": run / "decision.json",
        "request": run / "request.json",
    }
    paths["source"].write_text(source, encoding="utf-8")
    (inputs / "structures.csv").write_bytes(attachment_bytes)
    for key, value in (
        ("draft", draft),
        ("attachments", attachments),
        ("certificate", certificate),
    ):
        paths[key].write_text(canonical_json(value), encoding="utf-8")
    host_scripts = tmp_path / ".trae/skills/chemistry-research-router/scripts"
    built = subprocess.run(
        [
            sys.executable,
            str(host_scripts / "build_intent.py"),
            "--draft",
            str(paths["draft"]),
            "--source",
            str(paths["source"]),
            "--attachments",
            str(paths["attachments"]),
            "--attachment-root",
            str(inputs),
            "--certificate",
            str(paths["certificate"]),
            "--intent",
            str(paths["intent"]),
        ],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=False,
    )
    assert built.returncode == 0, built.stderr

    routed = subprocess.run(
        [
            sys.executable,
            str(host_scripts / "run_router.py"),
            "route",
            "--intent",
            str(paths["intent"]),
            "--source",
            str(paths["source"]),
            "--attachments",
            str(paths["attachments"]),
            "--certificate",
            str(paths["certificate"]),
            "--decision",
            str(paths["decision"]),
            "--request",
            str(paths["request"]),
        ],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=False,
    )

    assert routed.returncode == 0, routed.stderr
    decision = json.loads(paths["decision"].read_text(encoding="utf-8"))
    request = json.loads(paths["request"].read_text(encoding="utf-8"))
    assert decision["execution_mode"] == "manual_target_required"
    assert decision["targets"] == ["structure-features-v1"]
    assert request["target_id"] == "structure-features-v1"


def test_installer_is_idempotent_and_does_not_modify_credentials(
    tmp_path: Path,
) -> None:
    installer = load_router_module(
        "router_installation_idempotent",
        "install_bundle.py",
    )
    credentials = tmp_path / ".env"
    credentials.write_text("SECRET=unchanged\n", encoding="utf-8")
    before = credentials.read_bytes()
    gitignore = tmp_path / ".gitignore"
    gitignore_before = b"# keep existing rules"
    gitignore.write_bytes(gitignore_before)

    first = installer.install_bundle(
        "trae",
        "project",
        REPOSITORY_ROOT,
        tmp_path,
    )
    second = installer.install_bundle(
        "trae",
        "project",
        REPOSITORY_ROOT,
        tmp_path,
    )

    assert second == first
    assert credentials.read_bytes() == before
    assert gitignore.read_bytes() == (
        gitignore_before + b"\n.chemistry-agent-bundle/\n"
    )


def test_idempotent_install_does_not_bypass_failed_smoke(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    installer = load_router_module(
        "router_installation_failed_smoke",
        "install_bundle.py",
    )

    class FailingValidator:
        class InstallationIntegrityError(ValueError):
            pass

        @staticmethod
        def validate_installation(_receipt_path: Path) -> dict[str, Any]:
            return {}

        @staticmethod
        def run_installation_smoke(_receipt_path: Path) -> dict[str, int]:
            return {"failed": 1}

    monkeypatch.setattr(
        installer,
        "_load_sibling",
        lambda _name, _filename: FailingValidator,
    )
    receipt_path = tmp_path / ".chemistry-agent-bundle" / "installation-receipt.json"

    for _attempt in range(2):
        with pytest.raises(installer.InstallationError, match="smoke"):
            installer.install_bundle(
                "trae",
                "project",
                REPOSITORY_ROOT,
                tmp_path,
            )
        assert not receipt_path.exists()


def test_installer_fails_closed_on_existing_file_conflict(tmp_path: Path) -> None:
    installer = load_router_module(
        "router_installation_conflict",
        "install_bundle.py",
    )
    installer.install_bundle(
        "trae",
        "project",
        REPOSITORY_ROOT,
        tmp_path,
    )
    installed_skill = (
        tmp_path / ".trae" / "skills" / "chemistry-research-router" / "SKILL.md"
    )
    installed_skill.write_text("changed\n", encoding="utf-8")

    with pytest.raises(installer.InstallationError, match="differs"):
        installer.install_bundle(
            "trae",
            "project",
            REPOSITORY_ROOT,
            tmp_path,
        )


def test_installer_rejects_symlinked_gitignore(tmp_path: Path) -> None:
    installer = load_router_module(
        "router_installation_symlink",
        "install_bundle.py",
    )
    victim = tmp_path / "victim"
    victim.write_text("keep\n", encoding="utf-8")
    (tmp_path / ".gitignore").symlink_to(victim)

    with pytest.raises(installer.InstallationError, match="gitignore"):
        installer.install_bundle(
            "trae",
            "project",
            REPOSITORY_ROOT,
            tmp_path,
        )

    assert victim.read_text(encoding="utf-8") == "keep\n"


def test_installation_validator_rejects_external_runtime_path(
    tmp_path: Path,
) -> None:
    installer = load_router_module(
        "router_installation_external_runtime",
        "install_bundle.py",
    )
    validator = load_router_module(
        "router_installation_validator_external",
        "validate_installation.py",
    )
    installer.install_bundle(
        "trae",
        "project",
        REPOSITORY_ROOT,
        tmp_path,
    )
    receipt_path = tmp_path / ".chemistry-agent-bundle" / "installation-receipt.json"
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    receipt["runtime_root"] = str(tmp_path / "outside")
    receipt_path.write_text(
        canonical_json(resign_receipt(receipt)) + "\n",
        encoding="utf-8",
    )

    with pytest.raises(validator.InstallationIntegrityError, match="runtime path"):
        validator.validate_installation(receipt_path)


def test_installation_validator_detects_runtime_tamper(tmp_path: Path) -> None:
    installer = load_router_module(
        "router_installation_runtime_tamper",
        "install_bundle.py",
    )
    validator = load_router_module(
        "router_installation_validator_tamper",
        "validate_installation.py",
    )
    receipt = installer.install_bundle(
        "claude-code",
        "project",
        REPOSITORY_ROOT,
        tmp_path,
    )
    runtime_skill = (
        Path(receipt["runtime_root"])
        / "skills"
        / "chemistry-research-router"
        / "SKILL.md"
    )
    runtime_skill.write_text(
        runtime_skill.read_text(encoding="utf-8") + "\nchanged\n",
        encoding="utf-8",
    )

    receipt_path = tmp_path / ".chemistry-agent-bundle" / "installation-receipt.json"
    with pytest.raises(validator.InstallationIntegrityError, match="SHA-256"):
        validator.validate_installation(receipt_path)


def test_installation_validator_rejects_nested_directory_symlink(
    tmp_path: Path,
) -> None:
    installer = load_router_module(
        "router_installation_nested_symlink",
        "install_bundle.py",
    )
    validator = load_router_module(
        "router_installation_validator_nested_symlink",
        "validate_installation.py",
    )
    receipt = installer.install_bundle(
        "trae",
        "project",
        REPOSITORY_ROOT,
        tmp_path,
    )
    runtime_orchestration = Path(receipt["runtime_root"]) / "orchestration"
    external = tmp_path / "external-orchestration"
    runtime_orchestration.rename(external)
    runtime_orchestration.symlink_to(external, target_is_directory=True)
    receipt_path = tmp_path / ".chemistry-agent-bundle" / "installation-receipt.json"

    with pytest.raises(validator.InstallationIntegrityError, match="symlink"):
        validator.validate_installation(receipt_path)


def test_installer_hashes_the_bytes_it_writes(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    installer = load_router_module(
        "router_installation_source_race",
        "install_bundle.py",
    )
    source = tmp_path / "source.txt"
    destination = tmp_path / "project" / "installed.txt"
    source.write_bytes(b"trusted")
    expected = hashlib.sha256(b"trusted").hexdigest()
    action = installer.CopyAction(source, destination, expected, len(b"trusted"))
    original_read_bytes = Path.read_bytes

    def racing_read_bytes(path: Path) -> bytes:
        if path == source:
            source.write_bytes(b"trusted")
            return b"altered"
        return original_read_bytes(path)

    monkeypatch.setattr(Path, "read_bytes", racing_read_bytes)

    with pytest.raises(installer.InstallationError, match="source changed"):
        installer._write_action(action, tmp_path)

    assert not destination.exists()


def test_interrupted_receipt_commit_removes_executable_receipt(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    installer = load_router_module(
        "router_installation_receipt_interrupt",
        "install_bundle.py",
    )
    original_write = installer._write_receipt

    def interrupted_write(path: Path, receipt: dict[str, Any]) -> None:
        original_write(path, receipt)
        raise KeyboardInterrupt

    monkeypatch.setattr(installer, "_write_receipt", interrupted_write)
    receipt_path = tmp_path / ".chemistry-agent-bundle" / "installation-receipt.json"

    with pytest.raises(KeyboardInterrupt):
        installer.install_bundle(
            "trae",
            "project",
            REPOSITORY_ROOT,
            tmp_path,
        )

    assert not receipt_path.exists()


def test_installed_runtime_passes_twelve_controlled_smoke_cases(
    tmp_path: Path,
) -> None:
    installer = load_router_module(
        "router_installation_smoke_installer",
        "install_bundle.py",
    )
    validator = load_router_module(
        "router_installation_smoke_validator",
        "validate_installation.py",
    )
    receipt = installer.install_bundle(
        "codex",
        "project",
        REPOSITORY_ROOT,
        tmp_path,
    )
    receipt_path = tmp_path / ".chemistry-agent-bundle" / "installation-receipt.json"

    report = validator.run_installation_smoke(receipt_path)

    assert report["bundle_fingerprint"] == receipt["bundle_fingerprint"]
    assert report["total"] == 12
    assert report["passed"] == 12
    assert report["failed"] == 0
    categories = [item["category"] for item in report["cases"]]
    for category in (
        "direct_skill",
        "direct_skill_chain",
        "workflow",
        "clarification",
        "unsupported",
        "non_chemistry_negative",
    ):
        assert categories.count(category) == 2
    assert all(item["status"] == "passed" for item in report["cases"])
