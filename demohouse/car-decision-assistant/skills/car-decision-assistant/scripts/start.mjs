import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { closeSync, openSync, writeFileSync } from "node:fs";
import { ensureRuntimeHome, fetchHealth, logPath, pidPath, pidRunning, readCredentialEnv, readPid, repoRoot } from "./lib.mjs";

const existingPid = await readPid();
if (pidRunning(existingPid)) {
  console.log(JSON.stringify({ status: "already_running", pid: existingPid }));
  process.exit(0);
}

const environment = await readCredentialEnv();
for (const key of ["AGENT_PLAN_API_KEY", "SUPABASE_WORKSPACE_ID"]) {
  assert.ok(environment[key], `私密配置缺少 ${key}`);
}
const port = Number(environment.CAR_DECISION_PORT || 3003);
assert.ok(Number.isInteger(port) && port > 1024 && port < 65536, "端口无效");

await ensureRuntimeHome();
const log = openSync(logPath, "a", 0o600);
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(
  npmCommand,
  ["run", "dev:supabase", "--", "--host", "127.0.0.1", "--port", String(port)],
  {
    cwd: repoRoot,
    detached: process.platform !== "win32",
    env: { ...process.env, ...environment },
    stdio: ["ignore", log, log],
  },
);
child.unref();
closeSync(log);
writeFileSync(pidPath, `${child.pid}\n`, { mode: 0o600 });

let health = null;
for (let attempt = 0; attempt < 30; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  try {
    health = await fetchHealth(port, false);
    if (health.httpStatus < 500) break;
  } catch {
    // 服务启动阶段可能暂时无法连接，继续在限定次数内探测。
  }
}
if (!health) {
  throw new Error(`服务未在预期时间内启动；请检查 ${logPath}`);
}

console.log(
  JSON.stringify({
    status: "running",
    pid: child.pid,
    url: `http://127.0.0.1:${port}`,
    health: health.body,
    log_path: logPath,
  }),
);
