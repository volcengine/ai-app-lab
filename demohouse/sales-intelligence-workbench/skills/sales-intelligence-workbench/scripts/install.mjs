import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  appCopyFilter,
  appSourceIdentity,
  assertAppSource,
  assertNodeVersion,
  ensureDirectories,
  paths,
  processExists,
  readConfiguration,
  readOption,
  readPid,
  resolveUserPath,
  run,
  serverAddress,
  waitForHealth,
  writeConfiguration,
} from "./lib.mjs";

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

assertNodeVersion();
ensureDirectories();

if (processExists(readPid()) || processExists(readPid(paths.workerPidFile))) {
  throw new Error("工作台正在运行。更新前请先执行 stop.mjs，业务数据不会因此删除。");
}
if (await waitForHealth(serverAddress().url, 800)) {
  throw new Error("配置端口仍有服务响应。请先停止该服务，再执行安装或升级。");
}

const sourceValue = readOption("--source");
const sourceRoot = assertAppSource(sourceValue ? resolveUserPath(sourceValue) : paths.sourceApp);
const sourceIdentity = appSourceIdentity(sourceRoot);
if (path.resolve(sourceRoot) === path.resolve(paths.installedApp)) {
  throw new Error("运行时安装目录不能同时作为源码目录。");
}

const staging = path.join(paths.installRoot, `.app-install-${randomUUID()}`);
const previous = path.join(paths.installRoot, ".app-previous");
const skipTests = process.argv.includes("--skip-tests");

try {
  fs.cpSync(sourceRoot, staging, {
    recursive: true,
    force: true,
    filter: (entry) => appCopyFilter(sourceRoot, entry),
  });
  try {
    assertAppSource(staging);
  } catch (error) {
    throw new Error(`应用包复制后不完整：${error instanceof Error ? error.message : String(error)}`);
  }
  const stagedIdentity = appSourceIdentity(staging);
  if (stagedIdentity.sha256 !== sourceIdentity.sha256) {
    throw new Error("应用包复制后的内容哈希与发行源不一致。");
  }

  if (!skipTests) {
    run(process.execPath, ["--check", "frontend/app.js"], { cwd: staging });
    run(process.execPath, ["--check", "frontend/text-format.js"], { cwd: staging });
    const npmTest = npmInvocation(["test"]);
    run(npmTest.command, npmTest.args, {
      cwd: path.join(staging, "backend"),
      env: { ...process.env, NODE_ENV: "test" },
    });
  }

  const finalStagedIdentity = appSourceIdentity(staging);
  if (
    finalStagedIdentity.version !== sourceIdentity.version
    || finalStagedIdentity.sha256 !== sourceIdentity.sha256
    || finalStagedIdentity.file_count !== sourceIdentity.file_count
  ) {
    throw new Error("应用包测试后的最终内容身份与发行源不一致。");
  }

  fs.writeFileSync(path.join(staging, ".sales-workbench-runtime.json"), `${JSON.stringify({
    schema_version: 2,
    release_version: sourceIdentity.version,
    source_tree_sha256: sourceIdentity.sha256,
    source_file_count: sourceIdentity.file_count,
    source_path: sourceRoot,
    installed_at: new Date().toISOString(),
  }, null, 2)}\n`, { mode: 0o600 });

  fs.rmSync(previous, { recursive: true, force: true });
  if (fs.existsSync(paths.installedApp)) fs.renameSync(paths.installedApp, previous);
  fs.renameSync(staging, paths.installedApp);
  fs.rmSync(previous, { recursive: true, force: true });
} catch (error) {
  fs.rmSync(staging, { recursive: true, force: true });
  if (!fs.existsSync(paths.installedApp) && fs.existsSync(previous)) {
    fs.renameSync(previous, paths.installedApp);
  }
  throw error;
}

process.stdout.write(`应用运行时已安装到 ${paths.installedApp}\n`);
const installedConfiguration = readConfiguration();
if (installedConfiguration.AUTH_REFRESH_COOKIE_MAX_AGE === "2592000") {
  writeConfiguration({ AUTH_REFRESH_COOKIE_MAX_AGE: "31536000" });
  process.stdout.write("浏览器本机会话保持期已从旧版默认值升级为一年。\n");
}
if (!fs.existsSync(paths.credentialsFile) || !fs.existsSync(paths.runtimeFile)) {
  process.stdout.write(`下一步：运行 node ${path.join(paths.skillRoot, "scripts", "configure.mjs")}\n`);
}
