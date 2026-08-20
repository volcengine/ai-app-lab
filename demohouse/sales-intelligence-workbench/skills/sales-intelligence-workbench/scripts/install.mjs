import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  appCopyFilter,
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
  assertAppSource(staging);

  if (!skipTests) {
    run(process.execPath, ["--check", "frontend/app.js"], { cwd: staging });
    run(process.execPath, ["--check", "frontend/text-format.js"], { cwd: staging });
    run(process.platform === "win32" ? "npm.cmd" : "npm", ["test"], {
      cwd: path.join(staging, "backend"),
      env: { ...process.env, NODE_ENV: "test" },
    });
  }

  fs.writeFileSync(path.join(staging, ".sales-workbench-runtime.json"), `${JSON.stringify({
    schema_version: 1,
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
