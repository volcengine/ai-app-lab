import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateImmutableRelease } from "./validate-release-checkout.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const repository = "https://github.com/3494036618-eng/sales-intelligence-workbench";
const tag = `v${packageJson.version}`;
const officialRepository = "volcengine/ai-app-lab";
const officialProjectPath = "demohouse/sales-intelligence-workbench";
const officialSkillPath = `${officialProjectPath}/skills/sales-intelligence-workbench/SKILL.md`;
const officialUpstreamPath = `${officialProjectPath}/UPSTREAM.json`;
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sales-public-install-"));
const checkout = path.join(temporaryRoot, "checkout");
const officialCheckout = path.join(temporaryRoot, "ai-app-lab");

function option(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return "";
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} 缺少参数值。`);
  return value.trim();
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    env: options.env || process.env,
    encoding: "utf8",
    stdio: options.capture === false ? "inherit" : ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const detail = options.capture === false ? "" : `\n${result.stderr || result.stdout}`;
    throw new Error(`${command} ${args.join(" ")} 失败，退出码 ${result.status}。${detail}`);
  }
  return options.capture === false ? "" : result.stdout.trim();
}

function npmInvocation(args) {
  const cli = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
  ].find((candidate) => candidate && /\.(?:c?m?js)$/i.test(candidate) && fs.existsSync(candidate));
  if (cli) return { command: process.execPath, args: [cli, ...args] };
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", ["npm", ...args].join(" ")],
    };
  }
  return { command: "npm", args };
}

function remoteTagCommit() {
  const output = run("git", [
    "ls-remote",
    "--exit-code",
    `${repository}.git`,
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

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "sales-intelligence-workbench-release-verifier" },
    signal: AbortSignal.timeout(20_000),
  });
  assert.equal(response.status, 200, `远程文件不可用：${url}，HTTP ${response.status}。`);
  return response.text();
}

function trackedManifest(repositoryRoot, prefix = "") {
  const args = ["-C", repositoryRoot, "ls-files", "--stage", "-z"];
  if (prefix) args.push("--", prefix);
  const tracked = run("git", args).split("\0").filter(Boolean).map((record) => {
    const separator = record.indexOf("\t");
    assert.notEqual(separator, -1, `无法解析 Git index 记录：${record}`);
    const [mode] = record.slice(0, separator).split(/\s+/);
    assert.match(mode, /^100(?:644|755)$/, `发行镜像包含不支持的 Git mode：${mode}`);
    return { mode, trackedPath: record.slice(separator + 1) };
  });
  return tracked
    .map(({ mode, trackedPath }) => {
      const relativePath = prefix ? path.relative(prefix, trackedPath).split(path.sep).join("/") : trackedPath;
      return { mode, trackedPath, relativePath };
    })
    .filter(({ relativePath }) => relativePath !== "UPSTREAM.json")
    .map(({ mode, trackedPath, relativePath }) => ({
      path: relativePath,
      mode,
      sha256: createHash("sha256")
        .update(fs.readFileSync(path.join(repositoryRoot, trackedPath)))
        .digest("hex"),
    }))
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

async function verifyOfficialMirror(officialRef, releaseCommit) {
  if (!officialRef) {
    process.stdout.write("未提供 --official-ref：本轮只验证独立仓库发行包，不放行官方宣传。\n");
    return;
  }
  assert.match(officialRef, /^[0-9a-f]{40}$/i, "--official-ref 必须是完整 40 位 AI App Lab commit SHA。");
  const rawBase = `https://raw.githubusercontent.com/${officialRepository}/${officialRef}`;
  const [officialSkill, upstreamText] = await Promise.all([
    fetchText(`${rawBase}/${officialSkillPath}`),
    fetchText(`${rawBase}/${officialUpstreamPath}`),
  ]);
  const releaseSkill = fs.readFileSync(path.join(checkout, "skills", "sales-intelligence-workbench", "SKILL.md"), "utf8");
  assert.equal(officialSkill, releaseSkill, "AI App Lab Skill 与独立发行包不一致。");

  const upstream = JSON.parse(upstreamText);
  assert.equal(String(upstream.repository || "").replace(/\/+$/, ""), repository);
  assert.equal(upstream.version, packageJson.version, "UPSTREAM.json 版本与发行包不一致。");
  assert.equal(String(upstream.commit || "").toLowerCase(), releaseCommit, "UPSTREAM.json commit 与发行 tag 不一致。");

  run("git", [
    "clone",
    "--filter=blob:none",
    "--sparse",
    "--no-checkout",
    `https://github.com/${officialRepository}.git`,
    officialCheckout,
  ]);
  run("git", ["-C", officialCheckout, "sparse-checkout", "set", officialProjectPath]);
  run("git", ["-C", officialCheckout, "rev-parse", "--verify", `${officialRef}^{commit}`]);
  run("git", ["-C", officialCheckout, "merge-base", "--is-ancestor", officialRef, "refs/remotes/origin/main"]);
  run("git", ["-C", officialCheckout, "checkout", "--detach", officialRef]);
  assert.deepEqual(
    trackedManifest(officialCheckout, officialProjectPath),
    trackedManifest(checkout),
    "AI App Lab 中的完整销售工作台镜像与独立发行包不一致。",
  );

  const command = run(process.execPath, [
    path.join(checkout, "scripts", "print-public-skill-command.mjs"),
    "--official-ref",
    officialRef,
  ]);
  assert.equal(
    command,
    `帮我初始化销售助手：https://github.com/${officialRepository}/blob/${officialRef}/${officialSkillPath}`,
  );
  process.stdout.write(`AI App Lab 固定 commit 完整镜像验证通过：${officialRef}\n`);
}

try {
  const args = process.argv.slice(2);
  if (args.length !== 0 && !(args.length === 2 && args[0] === "--official-ref")) {
    throw new Error("只允许无参数运行，或提供 --official-ref <AI App Lab完整40位commit SHA>。");
  }
  const officialRef = option("--official-ref");
  if (officialRef && !/^[0-9a-f]{40}$/i.test(officialRef)) {
    throw new Error("--official-ref 必须是完整 40 位 AI App Lab commit SHA。");
  }
  const releaseCommit = remoteTagCommit();
  process.stdout.write(`远程 tag 已解析：${tag} ${releaseCommit}\n`);
  await validateImmutableRelease({ tag, commit: releaseCommit });
  process.stdout.write(`GitHub immutable Release 验证通过：${tag} ${releaseCommit}\n`);

  run("git", [
    "clone",
    "--depth",
    "1",
    "--branch",
    tag,
    "--single-branch",
    `${repository}.git`,
    checkout,
  ]);
  run(process.execPath, [
    path.join(checkout, "scripts", "validate-release-checkout.mjs"),
    "--expected-commit",
    releaseCommit,
  ], { cwd: checkout, capture: false });
  const npmVerify = npmInvocation(["run", "verify"]);
  run(npmVerify.command, npmVerify.args, {
    cwd: checkout,
    capture: false,
  });
  await verifyOfficialMirror(officialRef, releaseCommit);
  process.stdout.write(`公开安装验收通过：${repository}/tree/${tag}\n`);
} catch (error) {
  process.stderr.write(`公开安装验收失败：${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
