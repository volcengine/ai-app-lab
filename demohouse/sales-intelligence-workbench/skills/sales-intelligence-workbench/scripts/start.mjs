import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  assertInstalledApp,
  ensureDirectories,
  liveDoctorEvidence,
  paths,
  processExists,
  readConfiguration,
  readPid,
  run,
  runtimeEnvironment,
  serverAddress,
  waitForHealth,
} from "./lib.mjs";

assertInstalledApp();
ensureDirectories();

const doctor = run(process.execPath, [path.join(paths.skillRoot, "scripts", "doctor.mjs")], {
  allowFailure: true,
});
if (doctor.status !== 0) throw new Error("配置检查未通过，未启动服务。");

const configuration = readConfiguration();
const evidence = liveDoctorEvidence();
if (!evidence.fresh) {
  process.stderr.write(
    `提示：最近 ${Math.round(evidence.ttl_ms / 60000)} 分钟内没有全绿 live doctor 结果；服务仍会启动，依赖异常 Provider 的业务操作将严格失败且不会生成替代数据。\n`,
  );
}

const address = serverAddress();
if (process.argv.includes("--dry-run")) {
  process.stdout.write(`启动预检通过：${address.url}\n`);
  process.exit(0);
}

const existingPid = readPid();
const existingWorkerPid = readPid(paths.workerPidFile);
let serverPid = existingPid;
let serverStartedHere = false;
if (processExists(existingPid)) {
  if (await waitForHealth(address.url, 1500)) {
    process.stdout.write(`销售智能工作台 API 已在运行：${address.url}\n`);
  } else {
    throw new Error(`检测到仍在运行的进程 ${existingPid}，但健康检查失败。请先执行 stop.mjs。`);
  }
} else {
  fs.rmSync(paths.pidFile, { force: true });
  if (await waitForHealth(address.url, 800)) {
    throw new Error(`端口上已有其他服务响应：${address.url}`);
  }

  const logFd = fs.openSync(paths.logFile, "a", 0o600);
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: path.join(paths.installedApp, "backend"),
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: runtimeEnvironment({ NODE_ENV: "production" }),
  });
  child.unref();
  fs.closeSync(logFd);
  serverPid = child.pid;
  serverStartedHere = true;
  fs.writeFileSync(paths.pidFile, `${child.pid}\n`, { mode: 0o600 });

  if (!await waitForHealth(address.url)) {
    if (processExists(child.pid)) process.kill(child.pid, "SIGTERM");
    fs.rmSync(paths.pidFile, { force: true });
    throw new Error(`服务未通过健康检查，请查看 ${paths.logFile}`);
  }
}

const asyncJobsEnabled = ["1", "true", "yes", "on"].includes(
  String(configuration.ASYNC_JOBS_ENABLED || "true").toLowerCase(),
);
if (asyncJobsEnabled && !processExists(existingWorkerPid)) {
  fs.rmSync(paths.workerPidFile, { force: true });
  const workerLogFd = fs.openSync(paths.workerLogFile, "a", 0o600);
  const worker = spawn(process.execPath, ["src/worker.js"], {
    cwd: path.join(paths.installedApp, "backend"),
    detached: true,
    stdio: ["ignore", workerLogFd, workerLogFd],
    env: runtimeEnvironment({ NODE_ENV: "production" }),
  });
  worker.unref();
  fs.closeSync(workerLogFd);
  fs.writeFileSync(paths.workerPidFile, `${worker.pid}\n`, { mode: 0o600 });
  await new Promise((resolve) => setTimeout(resolve, 1200));
  if (!processExists(worker.pid)) {
    fs.rmSync(paths.workerPidFile, { force: true });
    if (serverStartedHere && processExists(serverPid)) process.kill(serverPid, "SIGTERM");
    if (serverStartedHere) fs.rmSync(paths.pidFile, { force: true });
    throw new Error(`后台任务 Worker 启动失败，请查看 ${paths.workerLogFile}`);
  }
} else if (asyncJobsEnabled) {
  process.stdout.write(`后台任务 Worker 已在运行：PID ${existingWorkerPid}\n`);
}

process.stdout.write(`销售智能工作台已启动：${address.url}\n`);
process.stdout.write(`日志：${paths.logFile}\n`);
if (asyncJobsEnabled) process.stdout.write(`Worker 日志：${paths.workerLogFile}\n`);
