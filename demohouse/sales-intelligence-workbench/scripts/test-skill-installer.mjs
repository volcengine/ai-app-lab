import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const commandPrinter = path.join(root, "scripts", "print-public-skill-command.mjs");
const temporaryHome = fs.mkdtempSync(path.join(os.tmpdir(), "sales-workbench-skill-"));
const codexHome = path.join(temporaryHome, "codex");
const claudeConfigDir = path.join(temporaryHome, "claude");
process.on("uncaughtExceptionMonitor", (error) => {
  if (process.env.GITHUB_ACTIONS !== "true") return;
  const message = String(error?.message || error || "unknown failure")
    .split(temporaryHome).join("<temporary-home>")
    .split(root).join("<repository>")
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
  process.stderr.write(`::error title=Skill installer isolation failure::${message}\n`);
});
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

function outputTail(value, limit = 3_500) {
  const text = String(value || "");
  return text.length <= limit ? text : `[前置输出已省略]\n${text.slice(-limit)}`;
}

function assertInstalled(client) {
  const installedSkillPath = path.join(client.target, "SKILL.md");
  assert.ok(fs.existsSync(installedSkillPath));
  assert.ok(fs.existsSync(path.join(client.target, "scripts", "onboard.mjs")));
  assert.ok(fs.existsSync(path.join(client.target, "assets", "app", "backend", ".env.example")));
  assert.ok(fs.existsSync(path.join(client.target, "assets", "app", "backend", "package.json")));
  assert.ok(fs.existsSync(path.join(client.target, "assets", "app", "backend", "src", "server.js")));
  assert.ok(fs.existsSync(path.join(client.target, "assets", "app", "frontend", "index.html")));
  assert.ok(fs.existsSync(path.join(client.target, "assets", "app", "frontend", "app.js")));
  assert.ok(fs.existsSync(path.join(client.target, "assets", "app", "supabase", "migrations")));
  assert.equal(fs.existsSync(path.join(client.target, ".DS_Store")), false);
  const installedSkill = fs.readFileSync(installedSkillPath, "utf8");
  assert.match(installedSkill, /## 远程 Skill 入口/);
  assert.match(installedSkill, /volcengine\/ai-app-lab\/blob\/main\/demohouse\/sales-intelligence-workbench\/skills\/sales-intelligence-workbench\/SKILL\.md/);
  assert.match(installedSkill, /固定发行版本：v0\.10\.1/);
  assert.match(installedSkill, /3494036618-eng\/sales-intelligence-workbench/);
  assert.match(installedSkill, /不能下载 AI App Lab 的整个 monorepo/);
  assert.match(installedSkill, /release_root="\$\(mktemp -d/);
  assert.match(installedSkill, /\$releaseRoot = Join-Path/);
  assert.match(installedSkill, /\$LASTEXITCODE -ne 0/);
  assert.match(installedSkill, /node \(Join-Path \$releaseRoot "scripts\/validate-release-checkout\.mjs"\)/);
  assert.match(installedSkill, /Remove-Item -LiteralPath \$releaseRoot -Recurse -Force/);
  assert.match(installedSkill, /git clone --depth 1 --branch v0\.10\.1 --single-branch/);
  assert.match(installedSkill, /validate-release-checkout\.mjs/);
  assert.match(installedSkill, /不得复用、修改、清理或覆盖任何已有源码目录/);
  assert.match(installedSkill, /完整的 `npm run verify`/);
  assert.doesNotMatch(installedSkill, /<projectDir>/);
  assert.match(installedSkill, /完整的 `npm run verify`/);
}

function probeInstalledSource(client, environment) {
  const installedLibUrl = pathToFileURL(path.join(client.target, "scripts", "lib.mjs")).href;
  const probe = spawnSync(process.execPath, [
    "--input-type=module",
    "--eval",
    `
      import fs from "node:fs";
      import path from "node:path";
      import { paths } from ${JSON.stringify(installedLibUrl)};
      const required = [
        "backend/package.json",
        "backend/src/server.js",
        "frontend/index.html",
        "frontend/app.js",
        "supabase/migrations",
      ];
      process.stdout.write(JSON.stringify({
        skillRoot: paths.skillRoot,
        sourceApp: paths.sourceApp,
        required: Object.fromEntries(required.map((relative) => [
          relative,
          fs.existsSync(path.join(paths.sourceApp, relative)),
        ])),
      }));
    `,
  ], {
    env: environment,
    encoding: "utf8",
  });
  assert.equal(
    probe.status,
    0,
    `已安装 Skill 源目录探针执行失败。\nstdout:\n${probe.stdout}\nstderr:\n${probe.stderr}`,
  );
  const report = JSON.parse(probe.stdout);
  assert.equal(
    fs.realpathSync(report.skillRoot),
    fs.realpathSync(client.target),
    `子进程 Skill 根目录解析错误：${probe.stdout}`,
  );
  assert.equal(
    fs.realpathSync(report.sourceApp),
    fs.realpathSync(path.join(client.target, "assets", "app")),
    `子进程应用源目录解析错误：${probe.stdout}`,
  );
  assert.deepEqual(
    Object.values(report.required),
    [true, true, true, true, true],
    `子进程无法读取完整应用包：${probe.stdout}`,
  );
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
  probeInstalledSource(clients[0], onboardingEnvironment);
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
    `onboarding 退出码异常。\nstdout:\n${outputTail(onboarding.stdout)}\nstderr:\n${outputTail(onboarding.stderr)}`,
  );
  assert.match(onboarding.stdout, /当前阶段：app/);
  assert.match(onboarding.stdout, /已安全暂停在“agent_plan”阶段/);
  assert.ok(fs.existsSync(path.join(onboardingEnvironment.SALES_WORKBENCH_HOME, "app", "backend", "package.json")));
  assert.ok(fs.existsSync(path.join(onboardingEnvironment.SALES_WORKBENCH_STATE_HOME, "builder-brief.json")));
  assert.equal(fs.existsSync(path.join(onboardingEnvironment.SALES_WORKBENCH_CONFIG_HOME, "credentials.env")), false);
  assert.equal(fs.existsSync(path.join(onboardingEnvironment.SALES_WORKBENCH_STATE_HOME, "doctor-live.json")), false);

  const publicCommand = spawnSync(process.execPath, [
    commandPrinter,
    "--repository", "https://github.com/3494036618-eng/sales-intelligence-workbench",
    "--ref", "v0.10.1",
  ], {
    cwd: root,
    env: baseEnvironment,
    encoding: "utf8",
  });
  assert.equal(publicCommand.status, 0, publicCommand.stderr);
  assert.equal(
    publicCommand.stdout.trim(),
    "帮我初始化销售助手：https://github.com/3494036618-eng/sales-intelligence-workbench/blob/v0.10.1/skills/sales-intelligence-workbench/SKILL.md",
  );
  assert.doesNotMatch(publicCommand.stdout, /sales-assistant-builder\.md/);

  const officialPublicCommand = spawnSync(process.execPath, [
    commandPrinter,
    "--official",
  ], {
    cwd: root,
    env: baseEnvironment,
    encoding: "utf8",
  });
  assert.equal(officialPublicCommand.status, 0, officialPublicCommand.stderr);
  assert.equal(
    officialPublicCommand.stdout.trim(),
    "帮我初始化销售助手：https://github.com/volcengine/ai-app-lab/blob/main/demohouse/sales-intelligence-workbench/skills/sales-intelligence-workbench/SKILL.md",
  );

  const officialCommit = "0123456789abcdef0123456789abcdef01234567";
  const officialPinnedCommand = spawnSync(process.execPath, [
    commandPrinter,
    "--official-ref", officialCommit,
  ], {
    cwd: root,
    env: baseEnvironment,
    encoding: "utf8",
  });
  assert.equal(officialPinnedCommand.status, 0, officialPinnedCommand.stderr);
  assert.equal(
    officialPinnedCommand.stdout.trim(),
    `帮我初始化销售助手：https://github.com/volcengine/ai-app-lab/blob/${officialCommit}/demohouse/sales-intelligence-workbench/skills/sales-intelligence-workbench/SKILL.md`,
  );

  const nestedPublicCommand = spawnSync(process.execPath, [
    commandPrinter,
    "--repository", "https://github.com/volcengine/ai-app-lab",
    "--ref", officialCommit,
    "--skill-path", "demohouse/sales-intelligence-workbench/skills/sales-intelligence-workbench/SKILL.md",
  ], {
    cwd: root,
    env: baseEnvironment,
    encoding: "utf8",
  });
  assert.equal(nestedPublicCommand.status, 0, nestedPublicCommand.stderr);
  assert.equal(
    nestedPublicCommand.stdout.trim(),
    `帮我初始化销售助手：https://github.com/volcengine/ai-app-lab/blob/${officialCommit}/demohouse/sales-intelligence-workbench/skills/sales-intelligence-workbench/SKILL.md`,
  );

  const mutableCommand = spawnSync(process.execPath, [
    commandPrinter,
    "--repository", "https://github.com/3494036618-eng/sales-intelligence-workbench",
    "--ref", "main",
  ], {
    cwd: root,
    env: baseEnvironment,
    encoding: "utf8",
  });
  assert.equal(mutableCommand.status, 1);
  assert.match(mutableCommand.stderr, /vX\.Y\.Z release tag 或完整 40 位 commit SHA/);

  for (const [label, args, errorPattern] of [
    ["wrong repository", [
      "--repository", "https://github.com/wrong-owner/sales-intelligence-workbench",
      "--ref", "v0.10.1",
    ], /不属于当前固定发行链路/],
    ["wrong Skill path", [
      "--repository", "https://github.com/3494036618-eng/sales-intelligence-workbench",
      "--ref", "v0.10.1",
      "--skill-path", "skills/not-the-sales-skill/SKILL.md",
    ], /不属于当前固定发行链路/],
    ["wrong release version", [
      "--repository", "https://github.com/3494036618-eng/sales-intelligence-workbench",
      "--ref", "v0.10.0",
    ], /不属于当前固定发行链路/],
    ["HEAD", [
      "--repository", "https://github.com/3494036618-eng/sales-intelligence-workbench",
      "--ref", "HEAD",
    ], /vX\.Y\.Z release tag 或完整 40 位 commit SHA/],
    ["refs heads main", [
      "--repository", "https://github.com/3494036618-eng/sales-intelligence-workbench",
      "--ref", "refs\/heads\/main",
    ], /vX\.Y\.Z release tag 或完整 40 位 commit SHA/],
    ["official conflict", ["--official", "--ref", "v0.10.1"], /不能与其他参数组合/],
    ["short official SHA", ["--official-ref", "0123456789abcdef"], /完整 40 位 commit SHA/],
  ]) {
    const rejected = spawnSync(process.execPath, [commandPrinter, ...args], {
      cwd: root,
      env: baseEnvironment,
      encoding: "utf8",
    });
    assert.equal(rejected.status, 1, `${label} 应被拒绝。`);
    assert.match(rejected.stderr, errorPattern, `${label} 错误信息不明确。`);
    assert.doesNotMatch(rejected.stderr, /\n\s+at |file:\/\/|\/Users\//, `${label} 不应泄露堆栈或本机路径。`);
  }

  const customCommand = spawnSync(process.execPath, [
    commandPrinter,
    "--repository", "https://github.com/example/sales-workbench",
    "--ref", "v1.2.3",
    "--allow-custom-repository",
  ], {
    cwd: root,
    env: baseEnvironment,
    encoding: "utf8",
  });
  assert.equal(customCommand.status, 0, customCommand.stderr);

  process.stdout.write(
    "Codex 与 Claude Code Skill 隔离安装、双端安装、重复安装保护、强制更新和安全 onboarding 检查通过。\n",
  );
} finally {
  fs.rmSync(temporaryHome, { recursive: true, force: true });
}
