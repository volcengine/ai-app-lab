import { spawnSync } from "node:child_process";
import { mkdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const scriptsDir = dirname(fileURLToPath(import.meta.url));
export const skillDir = resolve(scriptsDir, "..");
export const repoRoot = resolve(skillDir, "../..");
export const runtimeHome = process.env.CAR_DECISION_ASSISTANT_HOME
  ? resolve(process.env.CAR_DECISION_ASSISTANT_HOME)
  : join(homedir(), ".config", "car-decision-assistant");
export const credentialsPath = join(runtimeHome, "credentials.env");
export const pidPath = join(runtimeHome, "app.pid");
export const logPath = join(runtimeHome, "logs", "app.log");

export function option(args, name, fallback = null) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

export async function ensureRuntimeHome() {
  await mkdir(runtimeHome, { recursive: true, mode: 0o700 });
  await mkdir(dirname(logPath), { recursive: true, mode: 0o700 });
}

export async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function readCredentialEnv() {
  const text = await readFile(credentialsPath, "utf8");
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        if (separator < 1) throw new Error("私密配置格式无效");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} 执行失败（${result.status}）`);
  }
}

export function commandAvailable(command, args = ["--version"]) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return !result.error && result.status === 0;
}

export async function readPid() {
  if (!(await exists(pidPath))) return null;
  const value = Number((await readFile(pidPath, "utf8")).trim());
  return Number.isSafeInteger(value) && value > 1 ? value : null;
}

export function pidRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function fetchHealth(port, live = false) {
  const response = await fetch(
    `http://127.0.0.1:${port}/api/health${live ? "?live=1" : ""}`,
    { signal: AbortSignal.timeout(live ? 120_000 : 5_000) },
  );
  const body = await response.json();
  return { httpStatus: response.status, body };
}
