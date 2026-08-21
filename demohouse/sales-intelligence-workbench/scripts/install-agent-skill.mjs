import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillName = "sales-intelligence-workbench";
const source = path.join(root, "skills", skillName);

const targetDefinitions = {
  codex: {
    label: "Codex",
    configRoot: (environment) => path.resolve(
      environment.CODEX_HOME || path.join(os.homedir(), ".codex"),
    ),
    restartHint: "重新启动 Codex 后，可使用 $sales-intelligence-workbench。",
  },
  "claude-code": {
    label: "Claude Code",
    configRoot: (environment) => path.resolve(
      environment.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"),
    ),
    restartHint: "在 Claude Code 中可使用 /sales-intelligence-workbench；当前会话未识别时请重启。",
  },
};

function copyFilter(entry) {
  const relative = path.relative(source, entry);
  if (!relative) return true;
  const segments = relative.split(path.sep);
  const name = path.basename(entry);
  return !segments.some((segment) => [
    "node_modules",
    "dist",
    ".git",
    ".temp",
    "coverage",
  ].includes(segment))
    && name !== ".DS_Store"
    && !(name.startsWith(".env.") && name !== ".env.example")
    && name !== ".env"
    && !/\.(?:log|pid)$/i.test(name);
}

function normalizeTarget(value) {
  const target = String(value || "").trim().toLowerCase();
  if (target === "claude" || target === "claude_code") return "claude-code";
  if (target === "codex" || target === "claude-code" || target === "all") return target;
  throw new Error("安装目标必须是 codex、claude-code 或 all。");
}

function requestedTarget(argv, defaultTarget) {
  const targetIndex = argv.indexOf("--target");
  if (targetIndex < 0) return normalizeTarget(defaultTarget);
  const value = argv[targetIndex + 1];
  if (!value || value.startsWith("--")) throw new Error("--target 缺少参数值。");
  return normalizeTarget(value);
}

function resolveTargets(target, environment) {
  const names = target === "all" ? ["codex", "claude-code"] : [target];
  const targets = names.map((name) => {
    const definition = targetDefinitions[name];
    const skillsRoot = path.join(definition.configRoot(environment), "skills");
    return {
      ...definition,
      name,
      skillsRoot,
      target: path.join(skillsRoot, skillName),
    };
  });
  if (new Set(targets.map((item) => item.target)).size !== targets.length) {
    throw new Error("Codex 与 Claude Code 的 Skill 安装目录不能指向同一路径。");
  }
  return targets;
}

function installOne(definition, force) {
  fs.mkdirSync(definition.skillsRoot, { recursive: true, mode: 0o700 });
  const staging = path.join(definition.skillsRoot, `.${skillName}-${randomUUID()}.install`);
  const backup = path.join(definition.skillsRoot, `.${skillName}.previous`);

  try {
    fs.cpSync(source, staging, {
      recursive: true,
      force: true,
      filter: copyFilter,
    });
    fs.rmSync(backup, { recursive: true, force: true });
    if (fs.existsSync(definition.target)) {
      if (!force) {
        throw new Error(
          `${definition.label} Skill 已存在：${definition.target}。如需更新，请追加 --force。`,
        );
      }
      fs.renameSync(definition.target, backup);
    }
    fs.renameSync(staging, definition.target);
    fs.rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    if (!fs.existsSync(definition.target) && fs.existsSync(backup)) {
      fs.renameSync(backup, definition.target);
    }
    throw error;
  }
}

export function installAgentSkill({
  target = "codex",
  force = false,
  environment = process.env,
} = {}) {
  if (!fs.existsSync(path.join(source, "SKILL.md"))) {
    throw new Error(`Skill 源目录无效：${source}`);
  }
  const definitions = resolveTargets(normalizeTarget(target), environment);
  if (!force) {
    const existing = definitions.find((definition) => fs.existsSync(definition.target));
    if (existing) {
      throw new Error(
        `${existing.label} Skill 已存在：${existing.target}。如需更新，请追加 --force。`,
      );
    }
  }
  for (const definition of definitions) installOne(definition, force);
  return definitions;
}

export function runInstallerCli({
  argv = process.argv.slice(2),
  defaultTarget = "codex",
  environment = process.env,
} = {}) {
  const target = requestedTarget(argv, defaultTarget);
  const force = argv.includes("--force");
  const installed = installAgentSkill({ target, force, environment });
  for (const definition of installed) {
    process.stdout.write(`${definition.label} Skill 已安装：${definition.target}\n`);
    process.stdout.write(`${definition.restartHint}\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runInstallerCli();
  } catch (error) {
    process.stderr.write(`错误：${error instanceof Error ? error.message : String(error)}\n`);
    if (process.env.DEBUG && error?.stack) process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
  }
}
