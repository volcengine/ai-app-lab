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
  "scripts/test-release-checkout.mjs",
  "scripts/validate-release-checkout.mjs",
  "scripts/verify-public-install.mjs",
]) {
  assert.ok(fs.existsSync(path.join(root, relativePath)), `缺少客户端安装器：${relativePath}`);
}

const skill = read("skills/sales-intelligence-workbench/SKILL.md");
const agent = read("skills/sales-intelligence-workbench/agents/openai.yaml");
const workflow = read("skills/sales-intelligence-workbench/references/cookbook-workflow.md");
const readme = read("README.md");
const ciWorkflow = read(".github/workflows/ci.yml");
const packageJson = JSON.parse(read("package.json"));
const canonicalRepository = "https://github.com/3494036618-eng/sales-intelligence-workbench";
const canonicalReleaseRef = `v${packageJson.version}`;
const canonicalReleaseSkillUrl = `${canonicalRepository}/blob/${canonicalReleaseRef}/skills/sales-intelligence-workbench/SKILL.md`;
const officialSkillUrl = "https://github.com/volcengine/ai-app-lab/blob/main/demohouse/sales-intelligence-workbench/skills/sales-intelligence-workbench/SKILL.md";

assert.match(skill, /^---\r?\nname: sales-intelligence-workbench\r?\n/m);
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
assert.equal(publicSkillCommand[1], officialSkillUrl);
assert.ok(skill.includes(`固定发行版本：${canonicalReleaseRef}`));
assert.ok(skill.includes(`固定发行仓库：${canonicalRepository}`));
assert.ok(skill.includes(`固定发行 Skill：${canonicalReleaseSkillUrl}`));
assert.match(skill, /不能下载 AI App Lab 的整个 monorepo/);
assert.match(skill, /release_root="\$\(mktemp -d/);
assert.ok(skill.includes(`git clone --depth 1 --branch ${canonicalReleaseRef} --single-branch`));
assert.ok(skill.includes(`${canonicalRepository}.git "$release_root"`));
assert.match(skill, /\$releaseRoot = Join-Path/);
assert.match(skill, /\$LASTEXITCODE -ne 0/);
assert.match(skill, /node \(Join-Path \$releaseRoot "scripts\/validate-release-checkout\.mjs"\)/);
assert.match(skill, /Remove-Item -LiteralPath \$releaseRoot -Recurse -Force/);
assert.match(skill, /validate-release-checkout\.mjs/);
assert.match(skill, /远程 tag 当前指向/);
assert.match(skill, /不得复用、修改、清理或覆盖任何已有源码目录/);
assert.match(skill, /完整的 `npm run verify`/);
assert.doesNotMatch(skill, /<projectDir>/);
assert.doesNotMatch(skill, /从用户提供的 Skill URL 解析同一个 GitHub 仓库/);
assert.match(skill, /完整的 `npm run verify`/);
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
assert.match(install, /schema_version: 2/);
assert.match(install, /release_version: sourceIdentity\.version/);
assert.match(install, /finalStagedIdentity/);
assert.match(install, /应用包测试后的最终内容身份与发行源不一致/);
const runtimeLib = read("skills/sales-intelligence-workbench/scripts/lib.mjs");
assert.match(runtimeLib, /export function installedAppIntegrity/);
assert.match(runtimeLib, /export function assertInstalledAppIntegrity/);
assert.match(runtimeLib, /return assertInstalledAppIntegrity\(\)/);
const statusScript = read("skills/sales-intelligence-workbench/scripts/status.mjs");
assert.match(statusScript, /integrity/);
assert.match(statusScript, /!integrity\.ok\) process\.exitCode = 1/);
const setupScript = read("skills/sales-intelligence-workbench/scripts/setup.mjs");
assert.match(setupScript, /const appIntegrity = installedAppIntegrity\(\)/);
assert.match(setupScript, /const installed = appIntegrity\.ok/);
const publicVerifier = read("scripts/verify-public-install.mjs");
assert.match(publicVerifier, /merge-base", "--is-ancestor"/);
assert.match(publicVerifier, /trackedManifest\(officialCheckout, officialProjectPath\)/);
assert.match(publicVerifier, /validateImmutableRelease/);
assert.match(publicVerifier, /mode/);
const checkoutValidator = read("scripts/validate-release-checkout.mjs");
assert.match(checkoutValidator, /ls-remote/);
assert.match(checkoutValidator, /--ignored=matching/);
assert.match(checkoutValidator, /export async function validateImmutableRelease/);
assert.match(checkoutValidator, /release\.immutable, true/);
assert.match(install, /source_tree_sha256: sourceIdentity\.sha256/);
assert.match(read("skills/sales-intelligence-workbench/scripts/lib.mjs"), /export function appSourceIdentity/);
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
assert.match(readme, /npm run skill:command -- --official/);
assert.match(readme, /npm run skill:command -- --official-ref/);
assert.match(readme, /npm run release:verify:public/);
assert.match(readme, /npm run release:verify:public -- --official-ref/);
assert.match(ciWorkflow, /ubuntu-latest, macos-latest, windows-latest/);
assert.match(ciWorkflow, /node-version: 20/);
assert.match(readme, /skills\/sales-intelligence-workbench\/SKILL\.md/);
assert.ok(readme.includes(officialSkillUrl));
assert.ok(readme.includes(`${canonicalRepository}/tree/${canonicalReleaseRef}`));
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
assert.equal(packageJson.scripts?.["release:validate:checkout"], "node scripts/validate-release-checkout.mjs");
assert.equal(packageJson.scripts?.["release:test:checkout"], "node scripts/test-release-checkout.mjs");
assert.equal(packageJson.scripts?.["release:verify:public"], "node scripts/verify-public-install.mjs");
assert.match(packageJson.scripts?.verify || "", /release:validate/);
assert.match(packageJson.scripts?.verify || "", /release:test:checkout/);
assert.match(packageJson.scripts?.verify || "", /skill:validate/);
assert.match(packageJson.scripts?.verify || "", /skill:test/);
assert.match(packageJson.scripts?.verify || "", /backend run release:verify/);

process.stdout.write("Skill 包结构、触发配置、安装入口和 Cookbook 链路检查通过。\n");
