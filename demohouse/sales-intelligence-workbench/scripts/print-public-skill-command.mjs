import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const canonicalRepository = "https://github.com/3494036618-eng/sales-intelligence-workbench";
const canonicalSkillPath = "skills/sales-intelligence-workbench/SKILL.md";
const officialRepository = "https://github.com/volcengine/ai-app-lab";
const officialSkillPath = "demohouse/sales-intelligence-workbench/skills/sales-intelligence-workbench/SKILL.md";
const officialEntryUrl = "https://github.com/volcengine/ai-app-lab/blob/main/demohouse/sales-intelligence-workbench/skills/sales-intelligence-workbench/SKILL.md";

function option(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return "";
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} 缺少参数值。`);
  return value.trim();
}

function usage() {
  return `
生成销售助手公开初始化口令

用法：
  node scripts/print-public-skill-command.mjs --official

  node scripts/print-public-skill-command.mjs --official-ref <40位commit SHA>

  node scripts/print-public-skill-command.mjs \\
    --repository https://github.com/<owner>/<repo> \\
    --ref v${packageJson.version} \\
    [--skill-path skills/sales-intelligence-workbench/SKILL.md] \\
    [--allow-custom-repository]

说明：
  - --official 生成 AI App Lab 的 main 最新入口；重大宣传应在 PR 合并后使用 --official-ref 固定到合并 commit。
  - --official-ref 只接受完整 40 位 commit SHA。
  - --repository 必须是公开 GitHub 仓库根地址。
  - --ref 只接受 vX.Y.Z release tag 或完整 40 位 commit SHA。
  - --skill-path 是 Skill 在仓库内的相对路径；默认适用于独立仓库。
  - 默认只允许本项目独立发行地址或 AI App Lab 官方路径；测试 fork 必须显式使用 --allow-custom-repository。
  - 本命令只生成文字，不访问网络、不修改文件。
`.trimStart();
}

function main() {
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  process.stdout.write(usage());
  process.exit(0);
}

if (process.argv.includes("--official")) {
  if (process.argv.length !== 3) {
    throw new Error("--official 不能与其他参数组合；固定宣传版本请使用 --official-ref。");
  }
  process.stdout.write(`帮我初始化销售助手：${officialEntryUrl}\n`);
  process.exit(0);
}

const officialRef = option("--official-ref");
if (officialRef) {
  if (!/^[0-9a-f]{40}$/i.test(officialRef)) {
    throw new Error("--official-ref 必须是完整 40 位 commit SHA。");
  }
  if (process.argv.length !== 4) {
    throw new Error("--official-ref 不能与其他参数组合。");
  }
  const url = `${officialRepository}/blob/${officialRef}/${officialSkillPath}`;
  process.stdout.write(`帮我初始化销售助手：${url}\n`);
  process.exit(0);
}

const repository = option("--repository");
const ref = option("--ref");
const skillPath = option("--skill-path") || canonicalSkillPath;
const allowCustomRepository = process.argv.includes("--allow-custom-repository");
if (!repository || !ref) throw new Error("必须同时提供 --repository 和 --ref。");
if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(ref) && !/^[0-9a-f]{40}$/i.test(ref)) {
  throw new Error("正式初始化口令必须使用 vX.Y.Z release tag 或完整 40 位 commit SHA。");
}

let url;
try {
  url = new URL(repository);
} catch {
  throw new Error("--repository 不是有效 URL。");
}
if (url.protocol !== "https:" || url.hostname !== "github.com") {
  throw new Error("--repository 必须是 https://github.com/<owner>/<repo>。");
}

const segments = url.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
if (segments.length !== 2) {
  throw new Error("--repository 必须指向 GitHub 仓库根目录，不能包含额外路径。");
}

const [owner, repo] = segments;
const normalizedRepository = `https://github.com/${owner}/${repo}`;
const skillPathSegments = skillPath.split("/").filter(Boolean);
if (
  skillPath.startsWith("/")
  || skillPathSegments.includes(".")
  || skillPathSegments.includes("..")
  || skillPathSegments.at(-1) !== "SKILL.md"
) {
  throw new Error("--skill-path 必须是仓库内以 SKILL.md 结尾的安全相对路径。");
}
if (!allowCustomRepository) {
  const isCanonicalRelease = normalizedRepository === canonicalRepository
    && skillPath === canonicalSkillPath
    && ref === `v${packageJson.version}`;
  const isOfficialCommit = normalizedRepository === officialRepository
    && skillPath === officialSkillPath
    && /^[0-9a-f]{40}$/i.test(ref);
  if (!isCanonicalRelease && !isOfficialCommit) {
    throw new Error("仓库、版本或 Skill 路径不属于当前固定发行链路；测试 fork 必须显式追加 --allow-custom-repository。");
  }
}
const encodedSkillPath = skillPathSegments.map((segment) => encodeURIComponent(segment)).join("/");
const entryUrl = `https://github.com/${owner}/${repo}/blob/${encodeURIComponent(ref)}/${encodedSkillPath}`;
process.stdout.write(`帮我初始化销售助手：${entryUrl}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`错误：${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
