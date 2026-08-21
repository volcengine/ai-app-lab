import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignoredDirectories = new Set([".git", "coverage", "dist", "node_modules"]);
const internalOnlyPaths = new Set([
  "docs/agents/skills/sales-assistant-builder.md",
  "docs/production-readiness-roadmap.md",
  "docs/release-checklist.md",
  "目录说明.md",
  "backend/src/config/runtimeMode.js",
  "backend/src/fixtures/demoData.js",
  "backend/src/fixtures/salesData.js",
  "backend/src/providers/mockProviders.js",
  "backend/src/repositories/memoryRepository.js",
  "backend/src/services/demoService.js",
]);
const requiredPaths = [
  ".github/workflows/ci.yml",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "THIRD_PARTY_NOTICES.md",
  "backend/.env.example",
  "docs/README.md",
  "docs/api/api-contract.md",
  "docs/database/supabase-schema.md",
  "docs/deployment/self-hosting.md",
  "package-lock.json",
  "package.json",
  "skills/sales-intelligence-workbench/SKILL.md",
];
const forbiddenFilePatterns = [
  /^\.DS_Store$/i,
  /^\.env$/i,
  /^\.env\.(?!example$|sample$)/i,
  /\.(?:db|log|mov|mp4|mkv|p12|pem|pfx|pid|sqlite|sqlite3)$/i,
];
const publicContentRules = [
  { id: "macos_user_path", pattern: /\/Users\/[^/\s"'`]+/ },
  { id: "macos_temporary_path", pattern: /\/var\/folders\// },
  { id: "clipboard_artifact", pattern: /codex-clipboard/i },
  {
    id: "unexpected_sales_repository",
    pattern: /github\.com\/(?!3494036618-eng\/sales-intelligence-workbench(?:[\/\s`]|$)|volcengine\/ai-app-lab(?:[\/\s`]|$))[^/\s]+\/sales-intelligence-workbench/i,
  },
  {
    id: "environment_specific_release_note",
    pattern: /当前开发机|当前账号缺少|个人(?: GitHub|公开)?仓库|公司官方仓库|本轮模型合计|代码归属与许可证批准人/,
  },
];
const contentScanExclusions = new Set([
  "scripts/validate-public-release.mjs",
  "scripts/validate-skill-package.mjs",
]);

function normalize(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function walkFiles(current, output = []) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      output.push(path.join(current, entry.name));
      continue;
    }
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) walkFiles(path.join(current, entry.name), output);
      continue;
    }
    if (entry.isFile()) output.push(path.join(current, entry.name));
  }
  return output;
}

function releaseFiles() {
  const tracked = spawnSync("git", ["-C", root, "ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (tracked.status === 0) {
    return tracked.stdout
      .split("\0")
      .filter(Boolean)
      .map((relativePath) => path.join(root, relativePath))
      .filter((filePath) => fs.existsSync(filePath));
  }
  return walkFiles(root);
}

function isText(bytes) {
  return !bytes.subarray(0, 4096).includes(0);
}

function markdownLinkIssues(relativePath, text) {
  const issues = [];
  const linkPattern = /!?\[[^\]]*]\(([^)]+)\)/g;
  for (const match of text.matchAll(linkPattern)) {
    const rawTarget = match[1].trim().replace(/^<|>$/g, "").split(/\s+["']/)[0];
    if (!rawTarget || /^(?:#|https?:\/\/|mailto:)/i.test(rawTarget)) continue;
    const targetWithoutAnchor = rawTarget.split("#")[0];
    if (!targetWithoutAnchor) continue;
    let decodedTarget = targetWithoutAnchor;
    try {
      decodedTarget = decodeURIComponent(targetWithoutAnchor);
    } catch {
      issues.push(`${relativePath}: invalid URL encoding in Markdown link ${rawTarget}`);
      continue;
    }
    const resolved = path.resolve(root, path.dirname(relativePath), decodedTarget);
    if (!resolved.startsWith(`${root}${path.sep}`) && resolved !== root) {
      issues.push(`${relativePath}: Markdown link escapes repository ${rawTarget}`);
    } else if (!fs.existsSync(resolved)) {
      issues.push(`${relativePath}: broken Markdown link ${rawTarget}`);
    }
  }
  return issues;
}

const issues = [];
const files = releaseFiles();
const relativeFiles = new Set(files.map((filePath) => normalize(path.relative(root, filePath))));

for (const requiredPath of requiredPaths) {
  if (!relativeFiles.has(requiredPath)) issues.push(`missing required release file: ${requiredPath}`);
}
for (const internalPath of internalOnlyPaths) {
  if (relativeFiles.has(internalPath)) issues.push(`internal-only file is tracked: ${internalPath}`);
}

for (const filePath of files) {
  const relativePath = normalize(path.relative(root, filePath));
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink()) {
    issues.push(`symbolic link is not allowed in the release tree: ${relativePath}`);
    continue;
  }
  if (forbiddenFilePatterns.some((pattern) => pattern.test(path.basename(filePath)))) {
    issues.push(`private or generated file is tracked: ${relativePath}`);
    continue;
  }
  if (stat.size > 5 * 1024 * 1024) {
    issues.push(`unexpected file larger than 5 MiB: ${relativePath}`);
    continue;
  }
  const bytes = fs.readFileSync(filePath);
  if (!isText(bytes)) continue;
  const text = bytes.toString("utf8");
  if (!contentScanExclusions.has(relativePath)) {
    for (const rule of publicContentRules) {
      if (rule.pattern.test(text)) issues.push(`${relativePath}: ${rule.id}`);
    }
  }
  if (relativePath.endsWith(".md")) issues.push(...markdownLinkIssues(relativePath, text));
}

const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const skill = fs.readFileSync(
  path.join(root, "skills", "sales-intelligence-workbench", "SKILL.md"),
  "utf8",
);
const workflow = fs.readFileSync(
  path.join(root, "skills", "sales-intelligence-workbench", "references", "cookbook-workflow.md"),
  "utf8",
);
const ci = fs.readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
const license = fs.readFileSync(path.join(root, "LICENSE"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const backendPackageJson = JSON.parse(fs.readFileSync(path.join(root, "backend", "package.json"), "utf8"));
const packageLock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const routes = fs.readFileSync(path.join(root, "backend", "src", "routes", "index.js"), "utf8");
const deployment = fs.readFileSync(path.join(root, "docs", "deployment", "self-hosting.md"), "utf8");
const security = fs.readFileSync(path.join(root, "SECURITY.md"), "utf8");
const apiContract = fs.readFileSync(path.join(root, "docs", "api", "api-contract.md"), "utf8");
const architecture = fs.readFileSync(
  path.join(root, "skills", "sales-intelligence-workbench", "references", "architecture.md"),
  "utf8",
);
const providerConfiguration = fs.readFileSync(
  path.join(root, "skills", "sales-intelligence-workbench", "references", "provider-configuration.md"),
  "utf8",
);
const envExample = fs.readFileSync(path.join(root, "backend", ".env.example"), "utf8");
const frontendApp = fs.readFileSync(path.join(root, "frontend", "app.js"), "utf8");
const frontendStyles = fs.readFileSync(path.join(root, "frontend", "styles.css"), "utf8");
const authService = fs.readFileSync(path.join(root, "backend", "src", "security", "authService.js"), "utf8");
const salesService = fs.readFileSync(path.join(root, "backend", "src", "services", "salesService.js"), "utf8");
const canonicalSkillUrl = `https://github.com/3494036618-eng/sales-intelligence-workbench/blob/v${packageJson.version}/skills/sales-intelligence-workbench/SKILL.md`;

for (const [label, text] of [["README", readme], ["Skill", skill]]) {
  if (!text.includes(canonicalSkillUrl)) issues.push(`${label} is missing the canonical release Skill URL`);
}
for (const officialName of [
  "专业数据集（DataPro）",
  "豆包搜索（联网搜索）",
  "Agent 记忆（OpenViking）",
  "AI Native 应用开发底座（Supabase）",
]) {
  for (const [label, text] of [["README", readme], ["Skill", skill], ["Cookbook", workflow]]) {
    if (!text.includes(officialName)) issues.push(`${label} is missing official product name: ${officialName}`);
  }
}
for (const [label, text, requiredPhrases] of [
  ["README", readme, [
    "### 初始化 Agent 记忆（OpenViking）",
    "### 初始化 AI Native 应用开发底座（Supabase）",
    "少量 Agent Plan 模型、专业数据集（DataPro）和豆包搜索（联网搜索）用量",
  ]],
  ["Skill", skill, [
    "## 5. 初始化 Agent 记忆（OpenViking）",
    "AI Native 应用开发底座（Supabase）写入",
    "Agent 记忆（OpenViking）新资源创建",
  ]],
  ["Cookbook", workflow, [
    "`专业数据集`、`豆包搜索`、`Agent 记忆`",
    "`AI Native 应用开发底座`",
    "Agent 记忆（OpenViking）live doctor",
  ]],
]) {
  for (const phrase of requiredPhrases) {
    if (!text.includes(phrase)) issues.push(`${label} is missing official user-facing name: ${phrase}`);
  }
}
for (const [label, text] of [["README", readme], ["Skill", skill], ["Cookbook", workflow]]) {
  if (/^#{2,3} 初始化 (?:OpenViking|Supabase)(?: 记忆库)?$/m.test(text)) {
    issues.push(`${label} exposes an internal-only capability heading`);
  }
  if (/少量模型、DataPro 和搜索用量|真实资料写入 Supabase 与 OpenViking/.test(text)) {
    issues.push(`${label} uses internal capability names in user guidance`);
  }
}
for (const [label, text] of [
  ["README", readme],
  ["Skill", skill],
  ["API contract", apiContract],
  ["architecture", architecture],
  ["provider configuration", providerConfiguration],
  ["environment example", envExample],
]) {
  if (/\bAPP_MODE\b|--mode\s+(?:production|development|demo)|\bSALES_(?:DEMO_STABLE_MODE|PROFESSIONAL_DEMO_FALLBACK|SKIP_REAL_DATAPRO)\b/.test(text)) {
    issues.push(`${label} exposes obsolete runtime modes`);
  }
}
if (/DEMO_MODE|SALES_WORKBENCH_MODE|safe-demo|applySafeRecordingData/.test(frontendApp)) {
  issues.push("frontend exposes a selectable or fixture-backed runtime mode");
}
if (/runtime-status\.demo|demo-mode|mode-demo/.test(frontendStyles)) {
  issues.push("frontend styles retain a public demo-mode state");
}
if (!/name="username" autocomplete="username"/.test(frontendApp) || /name="email"|type="email"/.test(frontendApp)) {
  issues.push("frontend authentication is not username-only");
}
if (/password\/recover|password\/update|找回密码|重置邮件|工作区成员|成员管理|成员邀请/.test(frontendApp)) {
  issues.push("frontend exposes an email-recovery or member-management flow");
}
if (!/internalOwnerEmail/.test(authService) || !/email_confirm:\s*true/.test(authService)) {
  issues.push("single-administrator bootstrap is not server-confirmed");
}
if (/reset-password|忘记密码|找回密码|重置密码/.test(readme + skill + apiContract + providerConfiguration)) {
  issues.push("public guidance exposes a password recovery flow");
}
if (/AUTH_REDIRECT_URL|自有 SMTP|密码恢复依赖/.test(readme + skill + deployment + providerConfiguration)) {
  issues.push("public guidance still requires email password recovery");
}
if (/fixtures\/salesData|salesSeedData|demoProfessionalSources|demoPublicSources|allow_fixture_data|allow_provider_fallback/.test(salesService)) {
  issues.push("SalesService contains runtime fixture or provider-fallback logic");
}
if (!/node-version:\s*20\b/.test(ci)) issues.push("GitHub Actions must test with Node.js 20");
if (!/npm run verify/.test(ci)) issues.push("GitHub Actions must run npm run verify");
if (!/Apache License\s+Version 2\.0/.test(license)) issues.push("LICENSE is not Apache License 2.0");
if (packageJson.private !== true) issues.push("package.json must remain private because this repository is not an npm package");
if (packageJson.engines?.node !== ">=20") issues.push("package.json must require Node.js >=20");
if (backendPackageJson.version !== packageJson.version) issues.push("backend/package.json version is inconsistent");
if (packageLock.version !== packageJson.version || packageLock.packages?.[""]?.version !== packageJson.version) {
  issues.push("package-lock.json version is inconsistent");
}
for (const [label, text, pattern] of [
  ["README", readme, new RegExp(`当前为 \\\`${packageJson.version.replaceAll(".", "\\.")}\\\``)],
  ["SECURITY", security, new RegExp(`v${packageJson.version.replaceAll(".", "\\.")}`)],
  ["deployment guide", deployment, new RegExp(`\\\`${packageJson.version.replaceAll(".", "\\.")}\\\``)],
  ["health route", routes, new RegExp(`version: "${packageJson.version.replaceAll(".", "\\.")}"`)],
]) {
  if (!pattern.test(text)) issues.push(`${label} version is inconsistent`);
}

assert.deepEqual(issues, [], `公开发布检查失败：\n- ${issues.join("\n- ")}`);
process.stdout.write(`公开发布检查通过：${files.length} 个文件，未发现内部材料、环境特定信息、私密文件或失效的相对文档链接。\n`);
