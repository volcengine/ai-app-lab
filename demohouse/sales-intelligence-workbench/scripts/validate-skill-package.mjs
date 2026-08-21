import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillRoot = path.join(root, "skills", "sales-intelligence-workbench");

function read(relativePath) {
  const filePath = path.join(root, relativePath);
  assert.ok(fs.existsSync(filePath), `缺少文件：${relativePath}`);
  return fs.readFileSync(filePath, "utf8");
}

const requiredSkillFiles = [
  "SKILL.md",
  "agents/openai.yaml",
  "scripts/onboard.mjs",
  "scripts/setup.mjs",
  "scripts/install.mjs",
  "scripts/configure.mjs",
  "scripts/setup-openviking.mjs",
  "scripts/setup-supabase.mjs",
  "scripts/doctor.mjs",
  "scripts/start.mjs",
  "scripts/login.mjs",
  "scripts/import-feishu.mjs",
  "scripts/verify-business-chain.mjs",
  "references/cookbook-workflow.md",
  "assets/app/backend/package.json",
  "assets/app/frontend/index.html",
];

for (const relativePath of requiredSkillFiles) {
  assert.ok(fs.existsSync(path.join(skillRoot, relativePath)), `Skill 缺少文件：${relativePath}`);
}

for (const relativePath of [
  "scripts/install-agent-skill.mjs",
  "scripts/install-codex-skill.mjs",
  "scripts/install-claude-code-skill.mjs",
]) {
  assert.ok(fs.existsSync(path.join(root, relativePath)), `缺少客户端安装器：${relativePath}`);
}

const skill = read("skills/sales-intelligence-workbench/SKILL.md");
const agent = read("skills/sales-intelligence-workbench/agents/openai.yaml");
const workflow = read("skills/sales-intelligence-workbench/references/cookbook-workflow.md");
const readme = read("README.md");
const packageJson = JSON.parse(read("package.json"));
const canonicalRepository = "https://github.com/3494036618-eng/sales-intelligence-workbench";
const canonicalSkillUrl = `${canonicalRepository}/blob/v${packageJson.version}/skills/sales-intelligence-workbench/SKILL.md`;

assert.match(skill, /^---\nname: sales-intelligence-workbench\n/m);
assert.match(agent, /\$sales-intelligence-workbench/);
assert.match(agent, /allow_implicit_invocation:\s*true/);
assert.match(skill, /onboard\.mjs/);
assert.match(skill, /setup-openviking\.mjs/);
assert.match(skill, /用户侧只输入\s*一枚 Agent Plan Key/);
assert.match(skill, /## 远程 Skill 入口/);
const publicSkillCommand = skill.match(
  /帮我初始化销售助手：(https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/blob\/[A-Za-z0-9._-]+\/(?:[A-Za-z0-9_.-]+\/)*skills\/sales-intelligence-workbench\/SKILL\.md)/,
);
assert.ok(publicSkillCommand, "主 Skill 必须包含不带占位符的 GitHub 初始化 URL");
assert.doesNotMatch(publicSkillCommand[1], /[<>]/);
assert.equal(publicSkillCommand[1], canonicalSkillUrl);
assert.match(skill, /node scripts\/validate-skill-package\.mjs/);
assert.match(skill, /node scripts\/test-skill-installer\.mjs/);
assert.match(skill, /Codex/);
assert.match(skill, /Claude Code/);
assert.match(skill, /skill:install:codex/);
assert.match(skill, /skill:install:claude/);
assert.doesNotMatch(skill, /页面的“成员”入口/);
assert.doesNotMatch(skill, /AUTH_REDIRECT_URL|自有 SMTP|密码恢复依赖/);
assert.doesNotMatch(skill, /要求用户.*OpenViking.*(?:API )?Key/);
const configure = read("skills/sales-intelligence-workbench/scripts/configure.mjs");
assert.doesNotMatch(configure, /OpenViking 数据面 API Key/);
assert.doesNotMatch(configure, /hiddenQuestion\(rl, output, "Supabase Service Role Key"/);
assert.doesNotMatch(configure, /hiddenQuestion\(rl, output, "火山 (?:Access|Secret) Key/);
assert.doesNotMatch(configure, /visibleQuestion\(rl, "Supabase Data API URL"/);
assert.doesNotMatch(configure, /AUTH_REDIRECT_URL/);
const login = read("skills/sales-intelligence-workbench/scripts/login.mjs");
assert.match(login, /--username/);
assert.match(login, /body: JSON\.stringify\(\{ username, password \}\)/);
assert.doesNotMatch(skill + readme, /reset-password|忘记密码|找回密码|重置密码/);
const install = read("skills/sales-intelligence-workbench/scripts/install.mjs");
assert.match(install, /AUTH_REFRESH_COOKIE_MAX_AGE === "2592000"/);
assert.match(install, /AUTH_REFRESH_COOKIE_MAX_AGE: "31536000"/);
const stop = read("skills/sales-intelligence-workbench/scripts/stop.mjs");
assert.match(stop, /Date\.now\(\) \+ 35_000/);
assert.doesNotMatch(stop, /SIGKILL/);
assert.match(read("skills/sales-intelligence-workbench/scripts/setup-supabase.mjs"), /自动获取 Data API 端点和后端内部凭据/);
assert.match(workflow, /专业数据集（DataPro）与豆包搜索（联网搜索）有界并发采集、逐查询检查点 → 档案 Agent 六章节事实规划、服务端确定性组装与质量门禁 → AI Native 应用开发底座（Supabase）/);
assert.match(workflow, /Agent 三次以内/);
assert.match(workflow, /可重试故障只继续未完成查询/);
assert.doesNotMatch(workflow, /DataPro → 豆包搜索 → OpenViking → 模型 → Supabase/);
for (const officialName of [
  "专业数据集（DataPro）",
  "豆包搜索（联网搜索）",
  "Agent 记忆（OpenViking）",
  "AI Native 应用开发底座（Supabase）",
]) {
  assert.match(skill, new RegExp(officialName), `主 Skill 缺少 Agent Plan 控制台名称：${officialName}`);
  assert.match(readme, new RegExp(officialName), `README 缺少 Agent Plan 控制台名称：${officialName}`);
  assert.match(workflow, new RegExp(officialName), `Cookbook 缺少 Agent Plan 控制台名称：${officialName}`);
}
assert.match(readme, /npm run skill:install/);
assert.match(readme, /npm run skill:install:codex/);
assert.match(readme, /npm run skill:install:claude/);
assert.match(readme, /\$sales-intelligence-workbench/);
assert.match(readme, /\/sales-intelligence-workbench/);
assert.match(readme, /npm run skill:command/);
assert.match(readme, /skills\/sales-intelligence-workbench\/SKILL\.md/);
assert.match(
  readme,
  /帮我初始化销售助手：`https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/blob\/[A-Za-z0-9._-]+\/(?:[A-Za-z0-9_.-]+\/)*skills\/sales-intelligence-workbench\/SKILL\.md`/,
);
for (const relativePath of [
  "README.md",
  "CHANGELOG.md",
  "THIRD_PARTY_NOTICES.md",
  "docs/database/supabase-schema.md",
  "skills/sales-intelligence-workbench/SKILL.md",
]) {
  const publicDocument = read(relativePath);
  assert.doesNotMatch(publicDocument, /\/Users\/[^/\s]+|当前开发机|当前账号缺少|个人(?: GitHub|公开)?仓库|公司官方仓库/);
  const salesRepositoryUrls = publicDocument.match(/https:\/\/github\.com\/[^/\s`]+\/sales-intelligence-workbench[^\s`)"]*/g) || [];
  assert.ok(
    salesRepositoryUrls.every((url) => url.startsWith(canonicalRepository)),
    `${relativePath} 包含非当前发行仓库的销售工作台地址`,
  );
}
for (const internalOnlyPath of [
  "目录说明.md",
  "docs/production-readiness-roadmap.md",
  "docs/release-checklist.md",
  "docs/agents/skills/sales-assistant-builder.md",
]) {
  assert.equal(fs.existsSync(path.join(root, internalOnlyPath)), false, `公开包不应包含内部或遗留文件：${internalOnlyPath}`);
}
assert.equal(packageJson.scripts?.["skill:install"], "node scripts/install-codex-skill.mjs");
assert.equal(packageJson.scripts?.["skill:install:codex"], "node scripts/install-codex-skill.mjs");
assert.equal(packageJson.scripts?.["skill:install:claude"], "node scripts/install-claude-code-skill.mjs");
assert.equal(packageJson.scripts?.["skill:install:all"], "node scripts/install-agent-skill.mjs --target all");
assert.equal(packageJson.scripts?.["skill:command"], "node scripts/print-public-skill-command.mjs");
assert.equal(packageJson.scripts?.["release:validate"], "node scripts/validate-public-release.mjs");
assert.match(packageJson.scripts?.verify || "", /release:validate/);
assert.match(packageJson.scripts?.verify || "", /skill:validate/);
assert.match(packageJson.scripts?.verify || "", /skill:test/);
assert.match(packageJson.scripts?.verify || "", /backend run release:verify/);

process.stdout.write("Skill 包结构、触发配置、安装入口和 Cookbook 链路检查通过。\n");
