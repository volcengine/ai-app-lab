import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const commandPrinter = path.join(root, "scripts", "print-public-skill-command.mjs");
const temporaryHome = fs.mkdtempSync(path.join(os.tmpdir(), "sales-workbench-skill-"));
const codexHome = path.join(temporaryHome, "codex");
const claudeConfigDir = path.join(temporaryHome, "claude");
const baseEnvironment = {
  ...process.env,
  HOME: temporaryHome,
};
const clients = [
  {
    label: "Codex",
    script: "install-codex-skill.mjs",
    environment: { CODEX_HOME: codexHome },
    target: path.join(codexHome, "skills", "sales-intelligence-workbench"),
    trigger: /\$sales-intelligence-workbench/,
  },
  {
    label: "Claude Code",
    script: "install-claude-code-skill.mjs",
    environment: { CLAUDE_CONFIG_DIR: claudeConfigDir },
    target: path.join(claudeConfigDir, "skills", "sales-intelligence-workbench"),
    trigger: /\/sales-intelligence-workbench/,
  },
];

function run(client, args, expectedStatus) {
  const result = spawnSync(process.execPath, [
    path.join(root, "scripts", client.script),
    ...args,
  ], {
    cwd: root,
    env: { ...baseEnvironment, ...client.environment },
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    expectedStatus,
    `${client.label} 安装器退出码异常。\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result;
}

function assertInstalled(client) {
  const installedSkillPath = path.join(client.target, "SKILL.md");
  assert.ok(fs.existsSync(installedSkillPath));
  assert.ok(fs.existsSync(path.join(client.target, "scripts", "onboard.mjs")));
  assert.ok(fs.existsSync(path.join(client.target, "assets", "app", "backend", ".env.example")));
  assert.equal(fs.existsSync(path.join(client.target, ".DS_Store")), false);
  const installedSkill = fs.readFileSync(installedSkillPath, "utf8");
  assert.match(installedSkill, /## 远程 Skill 入口/);
  assert.match(installedSkill, /skills\/sales-intelligence-workbench\/SKILL\.md/);
  assert.match(installedSkill, /node scripts\/validate-skill-package\.mjs/);
  assert.match(installedSkill, /node scripts\/test-skill-installer\.mjs/);
}

try {
  for (const client of clients) {
    const installed = run(client, [], 0);
    assert.match(installed.stdout, new RegExp(`${client.label} Skill 已安装`));
    assert.match(installed.stdout, client.trigger);
    assertInstalled(client);

    const duplicate = run(client, [], 1);
    assert.match(duplicate.stderr, /Skill 已存在/);
    run(client, ["--force"], 0);
    assertInstalled(client);
  }

  const allSandbox = path.join(temporaryHome, "all");
  const allResult = spawnSync(process.execPath, [
    path.join(root, "scripts", "install-agent-skill.mjs"),
    "--target",
    "all",
  ], {
    cwd: root,
    env: {
      ...baseEnvironment,
      CODEX_HOME: path.join(allSandbox, "codex"),
      CLAUDE_CONFIG_DIR: path.join(allSandbox, "claude"),
    },
    encoding: "utf8",
  });
  assert.equal(allResult.status, 0, allResult.stderr || allResult.stdout);
  assert.match(allResult.stdout, /Codex Skill 已安装/);
  assert.match(allResult.stdout, /Claude Code Skill 已安装/);
  assert.ok(fs.existsSync(path.join(
    allSandbox,
    "codex",
    "skills",
    "sales-intelligence-workbench",
    "SKILL.md",
  )));
  assert.ok(fs.existsSync(path.join(
    allSandbox,
    "claude",
    "skills",
    "sales-intelligence-workbench",
    "SKILL.md",
  )));

  const onboardingEnvironment = {
    ...baseEnvironment,
    CODEX_HOME: codexHome,
    PORT: process.env.SKILL_TEST_PORT || "18787",
    SALES_WORKBENCH_HOME: path.join(temporaryHome, "runtime"),
    SALES_WORKBENCH_CONFIG_HOME: path.join(temporaryHome, "config"),
    SALES_WORKBENCH_STATE_HOME: path.join(temporaryHome, "state"),
  };
  const codexTarget = clients[0].target;
  const help = spawnSync(process.execPath, [
    path.join(codexTarget, "scripts", "onboard.mjs"),
    "--help",
  ], {
    env: onboardingEnvironment,
    encoding: "utf8",
  });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /安全编排/);

  const onboarding = spawnSync(process.execPath, [
    path.join(codexTarget, "scripts", "onboard.mjs"),
    "--workspace-name", "隔离验收工作台",
    "--sales-goal", "验证 Skill 部署入口",
    "--target-scope", "测试企业",
    "--sources", "none",
    "--deployment", "local",
  ], {
    env: onboardingEnvironment,
    encoding: "utf8",
  });
  assert.equal(
    onboarding.status,
    0,
    `onboarding 退出码异常。\nstdout:\n${onboarding.stdout}\nstderr:\n${onboarding.stderr}`,
  );
  assert.match(onboarding.stdout, /当前阶段：app/);
  assert.match(onboarding.stdout, /已安全暂停在“agent_plan”阶段/);
  assert.ok(fs.existsSync(path.join(onboardingEnvironment.SALES_WORKBENCH_HOME, "app", "backend", "package.json")));
  assert.ok(fs.existsSync(path.join(onboardingEnvironment.SALES_WORKBENCH_STATE_HOME, "builder-brief.json")));
  assert.equal(fs.existsSync(path.join(onboardingEnvironment.SALES_WORKBENCH_CONFIG_HOME, "credentials.env")), false);
  assert.equal(fs.existsSync(path.join(onboardingEnvironment.SALES_WORKBENCH_STATE_HOME, "doctor-live.json")), false);

  const publicCommand = spawnSync(process.execPath, [
    commandPrinter,
    "--repository", "https://github.com/example/sales-workbench",
    "--ref", "v0.9.1",
  ], {
    cwd: root,
    env: baseEnvironment,
    encoding: "utf8",
  });
  assert.equal(publicCommand.status, 0, publicCommand.stderr);
  assert.equal(
    publicCommand.stdout.trim(),
    "帮我初始化销售助手：https://github.com/example/sales-workbench/blob/v0.9.1/skills/sales-intelligence-workbench/SKILL.md",
  );
  assert.doesNotMatch(publicCommand.stdout, /sales-assistant-builder\.md/);

  const nestedPublicCommand = spawnSync(process.execPath, [
    commandPrinter,
    "--repository", "https://github.com/volcengine/ai-app-lab",
    "--ref", "0123456789abcdef",
    "--skill-path", "demohouse/sales-intelligence-workbench/skills/sales-intelligence-workbench/SKILL.md",
  ], {
    cwd: root,
    env: baseEnvironment,
    encoding: "utf8",
  });
  assert.equal(nestedPublicCommand.status, 0, nestedPublicCommand.stderr);
  assert.equal(
    nestedPublicCommand.stdout.trim(),
    "帮我初始化销售助手：https://github.com/volcengine/ai-app-lab/blob/0123456789abcdef/demohouse/sales-intelligence-workbench/skills/sales-intelligence-workbench/SKILL.md",
  );

  const mutableCommand = spawnSync(process.execPath, [
    commandPrinter,
    "--repository", "https://github.com/example/sales-workbench",
    "--ref", "main",
  ], {
    cwd: root,
    env: baseEnvironment,
    encoding: "utf8",
  });
  assert.equal(mutableCommand.status, 1);
  assert.match(mutableCommand.stderr, /不能使用 main\/master/);

  process.stdout.write(
    "Codex 与 Claude Code Skill 隔离安装、双端安装、重复安装保护、强制更新和安全 onboarding 检查通过。\n",
  );
} finally {
  fs.rmSync(temporaryHome, { recursive: true, force: true });
}
