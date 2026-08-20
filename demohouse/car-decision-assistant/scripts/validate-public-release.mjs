import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const strictGit = process.argv.includes("--strict-git");
const required = [
  "README.md",
  "LICENSE",
  "SECURITY.md",
  "PRIVACY.md",
  "SUPPORT.md",
  "CONTRIBUTING.md",
  "CHANGELOG.md",
  ".env.example",
  ".github/workflows/ci.yml",
  "skills/car-decision-assistant/SKILL.md",
];
for (const file of required) await stat(join(root, file));

const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
assert.equal(packageJson.name, "car-decision-assistant");
assert.equal(packageJson.version, "0.1.0");
for (const script of ["verify", "release:verify", "skill:validate", "skill:test"]) {
  assert.ok(packageJson.scripts?.[script], `缺少 npm script: ${script}`);
}

const excluded = new Set([
  ".git",
  "node_modules",
  ".vinext",
  "dist",
  ".wrangler",
  ".playwright-cli",
  "qa",
  "outputs",
  "work",
]);
const textExtensions = new Set([
  "",
  ".md",
  ".json",
  ".mjs",
  ".js",
  ".ts",
  ".tsx",
  ".css",
  ".sql",
  ".yaml",
  ".yml",
  ".toml",
  ".example",
]);
const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) await walk(absolute);
    else if (entry.isFile() && textExtensions.has(extname(entry.name))) files.push(absolute);
  }
}
await walk(root);

const forbidden = [
  [new RegExp(["/Users", "bytedance"].join("/"), "g"), "本机绝对路径"],
  [/\bagent-plan-\d{6,}\b/g, "疑似个人 CLI Profile"],
  [
    /\b(?:account|tenant|user)[_-]?id\s*[:=]\s*["']?\d{6,}\b/gi,
    "疑似个人账号 ID",
  ],
  [
    /SUPABASE_WORKSPACE_ID[ \t]*=[ \t]*["']?(?!<)[A-Za-z0-9][A-Za-z0-9_-]{7,}/g,
    "硬编码 Workspace ID",
  ],
  [new RegExp(["我的购车", "决策盘"].join(""), "g"), "旧产品名"],
  [new RegExp(["my-car", "decision-board"].join("-"), "g"), "旧产品名"],
  [new RegExp(["appgprj", "[A-Za-z0-9]+"].join("_"), "g"), "Sites 项目绑定"],
  [new RegExp(["bnpm", "byted", "org"].join("\\."), "g"), "公司内网 npm registry"],
  [/ark-[A-Za-z0-9_-]{12,}/g, "疑似 Agent Plan Key"],
];
const violations = [];
for (const file of files) {
  const text = await readFile(file, "utf8");
  for (const [pattern, label] of forbidden) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) violations.push(`${relative(root, file)}: ${label}`);
  }
}
assert.deepEqual(violations, [], `公开文件检查失败:\n${violations.join("\n")}`);

const officialNamingFiles = [
  "README.md",
  "SECURITY.md",
  "PRIVACY.md",
  "SUPPORT.md",
  "CONTRIBUTING.md",
  "CHANGELOG.md",
  "docs/data-and-evidence-policy.md",
  "docs/requirements-engineering.md",
  "skills/car-decision-assistant/SKILL.md",
  "skills/car-decision-assistant/references/acceptance.md",
  "skills/car-decision-assistant/references/setup.md",
  "skills/car-decision-assistant/references/troubleshooting.md",
];
const namingViolations = [];
for (const file of officialNamingFiles) {
  const content = await readFile(join(root, file), "utf8");
  for (const phrase of [
    "Agent Plan Supabase",
    "汽车专业数据集",
    "专业数据集（DataPro）",
    "真实 Provider",
  ]) {
    if (content.includes(phrase)) namingViolations.push(`${file}: ${phrase}`);
  }
}
for (const file of [
  "README.md",
  "SECURITY.md",
  "CHANGELOG.md",
  "skills/car-decision-assistant/SKILL.md",
]) {
  const content = await readFile(join(root, file), "utf8");
  if (/测试版|\bBeta\b|v0\.1\.0-beta/i.test(content)) {
    namingViolations.push(`${file}: 面向用户的测试版表述`);
  }
}
assert.deepEqual(
  namingViolations,
  [],
  `对外名称未与 Agent Plan 控制台保持一致:\n${namingViolations.join("\n")}`,
);

const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter(Boolean);
const disallowedTracked = tracked.filter((file) =>
  /^(?:node_modules|dist|\.vinext|\.wrangler|\.playwright-cli|qa)\//.test(file) ||
  file === ".openai/hosting.json" ||
  [
    "app/chatgpt-auth.ts",
    "cloudflare-env.d.ts",
    "design-qa.md",
    "tests/acceptance-report.md",
    "tests/最终验收报告.md",
    "public/favicon.svg",
    "public/file.svg",
    "public/globe.svg",
    "public/window.svg",
  ].includes(file),
);
if (strictGit) {
  assert.deepEqual(disallowedTracked, [], "Git 已跟踪本地构建、日志或 QA 产物");
}

const gitStatus = execFileSync("git", ["status", "--porcelain=v1"], {
  cwd: root,
  encoding: "utf8",
}).trim();
if (strictGit) assert.equal(gitStatus, "", "严格发布检查要求 Git 工作树干净");

console.log(
  JSON.stringify({
    status: "ok",
    files_scanned: files.length,
    git_clean: gitStatus.length === 0,
    release_ready: gitStatus.length === 0 && disallowedTracked.length === 0,
    disallowed_tracked: disallowedTracked,
    strict_git: strictGit,
  }),
);
