import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CANONICAL_REPOSITORY = "https://github.com/3494036618-eng/sales-intelligence-workbench";
const RELEASE_API = "https://api.github.com/repos/3494036618-eng/sales-intelligence-workbench/releases/tags";

function runGit(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`Git checkout 校验失败：git ${args.join(" ")}。`);
  }
  return result.stdout.trim();
}

function resolveRemoteTagCommit(root, repository, tag) {
  const output = runGit(root, [
    "ls-remote",
    "--exit-code",
    `${normalizeRepository(repository)}.git`,
    `refs/tags/${tag}`,
    `refs/tags/${tag}^{}`,
  ]);
  const rows = output.split(/\r?\n/).filter(Boolean).map((line) => line.split(/\s+/));
  const peeled = rows.find(([, ref]) => ref === `refs/tags/${tag}^{}`);
  const direct = rows.find(([, ref]) => ref === `refs/tags/${tag}`);
  const commit = (peeled || direct)?.[0] || "";
  assert.match(commit, /^[0-9a-f]{40}$/i, `远程 ${tag} 没有解析到完整 commit SHA。`);
  return commit.toLowerCase();
}

function normalizeRepository(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    throw new Error("origin 不是有效的公开 HTTPS GitHub 仓库地址。");
  }
  if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password) {
    throw new Error("origin 必须是无凭证的公开 HTTPS GitHub 仓库地址。");
  }
  const segments = url.pathname.replace(/\/+$/, "").replace(/\.git$/, "").split("/").filter(Boolean);
  if (segments.length !== 2) throw new Error("origin 必须指向 GitHub 仓库根目录。");
  return `https://github.com/${segments[0]}/${segments[1]}`;
}

function packageVersion(root) {
  const packagePath = path.join(root, "package.json");
  assert.ok(fs.existsSync(packagePath), "checkout 根目录缺少 package.json。");
  const parsed = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  assert.match(String(parsed.version || ""), /^\d+\.\d+\.\d+$/, "package.json version 无效。");
  return parsed.version;
}

export function validateReleaseCheckout({
  root = scriptRoot,
  expectedRepository = CANONICAL_REPOSITORY,
  expectedTag = `v${packageVersion(root)}`,
  expectedCommit = "",
  verifyRemote = true,
} = {}) {
  const resolvedRoot = path.resolve(root);
  if (expectedCommit && !/^[0-9a-f]{40}$/i.test(expectedCommit)) {
    throw new Error("expected commit 必须是完整 40 位 SHA。");
  }

  const actualRepository = normalizeRepository(runGit(resolvedRoot, ["remote", "get-url", "origin"]));
  assert.equal(actualRepository, normalizeRepository(expectedRepository), "origin 不是固定发行仓库。");

  const exactTag = runGit(resolvedRoot, ["describe", "--tags", "--exact-match", "HEAD"]);
  assert.equal(exactTag, expectedTag, `checkout 必须精确位于 ${expectedTag}。`);

  const head = runGit(resolvedRoot, ["rev-parse", "HEAD"]);
  const tagCommit = runGit(resolvedRoot, ["rev-parse", `${expectedTag}^{commit}`]);
  assert.equal(head, tagCommit, "tag 没有指向当前 checkout commit。");
  if (expectedCommit) assert.equal(head, expectedCommit.toLowerCase(), "checkout commit 与预期发行 commit 不一致。");
  if (verifyRemote) {
    const remoteCommit = resolveRemoteTagCommit(resolvedRoot, actualRepository, expectedTag);
    assert.equal(head, remoteCommit, "checkout commit 与远程发行 tag 不一致。");
  }

  const status = runGit(resolvedRoot, ["status", "--porcelain", "--untracked-files=all", "--ignored=matching"]);
  assert.equal(status, "", "发行 checkout 存在未提交、未跟踪或被忽略的额外文件。");

  return { repository: actualRepository, tag: exactTag, commit: head };
}

export async function validateImmutableRelease(report, fetchImpl = fetch) {
  const response = await fetchImpl(`${RELEASE_API}/${encodeURIComponent(report.tag)}`, {
    headers: { "user-agent": "sales-intelligence-workbench-checkout-validator" },
    signal: AbortSignal.timeout(20_000),
  });
  assert.equal(response.status, 200, `GitHub Release 不可用：HTTP ${response.status}。`);
  const release = await response.json();
  assert.equal(release.tag_name, report.tag, "GitHub Release tag 与 checkout 不一致。");
  assert.equal(release.draft, false, "GitHub Release 仍是草稿。");
  assert.equal(release.prerelease, false, "GitHub Release 不能是预发布版本。");
  assert.equal(release.immutable, true, "GitHub Release 必须启用 immutable，防止 tag 或资产被事后替换。");
  assert.equal(String(release.target_commitish || "").toLowerCase(), report.commit, "GitHub Release commit 与 checkout 不一致。");
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return "";
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} 缺少参数值。`);
  return value.trim();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 0 && !(args.length === 2 && args[0] === "--expected-commit")) {
      throw new Error("只允许无参数运行，或提供 --expected-commit <完整40位SHA>。");
    }
    const report = validateReleaseCheckout({ expectedCommit: readOption("--expected-commit") });
    process.stdout.write(`发行 checkout 校验通过：${report.tag} ${report.commit}\n`);
  } catch (error) {
    process.stderr.write(`错误：${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
