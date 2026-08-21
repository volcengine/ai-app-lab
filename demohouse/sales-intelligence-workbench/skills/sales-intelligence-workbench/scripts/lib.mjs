import fs from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const cliErrorHandler = Symbol.for("sales-intelligence-workbench.cli-error-handler");

if (!globalThis[cliErrorHandler]) {
  globalThis[cliErrorHandler] = true;
  const reportFatal = (error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`错误：${message}\n`);
    if (process.env.DEBUG && error?.stack) process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
  };
  process.on("uncaughtException", reportFatal);
  process.on("unhandledRejection", reportFatal);
}

export const paths = {
  skillRoot: path.resolve(scriptsDir, ".."),
  sourceApp: path.resolve(scriptsDir, "..", "assets", "app"),
  projectRoot: path.resolve(scriptsDir, "..", "..", ".."),
  installRoot: path.resolve(process.env.SALES_WORKBENCH_HOME
    || path.join(os.homedir(), ".local", "share", "sales-intelligence-workbench")),
  configDir: path.resolve(process.env.SALES_WORKBENCH_CONFIG_HOME
    || path.join(os.homedir(), ".config", "sales-intelligence-workbench")),
  stateDir: path.resolve(process.env.SALES_WORKBENCH_STATE_HOME
    || path.join(os.homedir(), ".local", "state", "sales-intelligence-workbench")),
};

paths.installedApp = path.join(paths.installRoot, "app");
paths.credentialsFile = path.join(paths.configDir, "credentials.env");
paths.runtimeFile = path.join(paths.configDir, "runtime.env");
paths.runDir = path.join(paths.stateDir, "run");
paths.logDir = path.join(paths.stateDir, "logs");
paths.backupDir = path.join(paths.stateDir, "backups");
paths.pidFile = path.join(paths.runDir, "server.pid");
paths.logFile = path.join(paths.logDir, "server.log");
paths.workerPidFile = path.join(paths.runDir, "worker.pid");
paths.workerLogFile = path.join(paths.logDir, "worker.log");
paths.liveDoctorFile = path.join(paths.stateDir, "doctor-live.json");
paths.lastDoctorFile = path.join(paths.stateDir, "doctor-last.json");
paths.cliSessionFile = path.join(paths.stateDir, "cli-session.json");
paths.builderBriefFile = path.join(paths.stateDir, "builder-brief.json");
paths.historyImportReceiptFile = path.join(paths.stateDir, "history-import-receipt.json");
paths.businessAcceptanceFile = path.join(paths.stateDir, "business-acceptance.json");
Object.freeze(paths);

export const SECRET_KEYS = Object.freeze([
  "AGENT_PLAN_API_KEY",
  "MODEL_API_KEY",
  "DATAPRO_API_KEY",
  "WEB_SEARCH_API_KEY",
  "OPENVIKING_API_KEY",
  "VOLCENGINE_ACCESS_KEY",
  "VOLCENGINE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
]);

export const RUNTIME_KEYS = Object.freeze([
  "REPOSITORY_MODE",
  "HOST",
  "PORT",
  "HTTP_AUTH_ENABLED",
  "AUTH_BOOTSTRAP_ENABLED",
  "AUTH_COOKIE_SECURE",
  "AUTH_PROVIDER_TIMEOUT_MS",
  "AUTH_SESSION_CACHE_TTL_MS",
  "AUTH_REFRESH_COOKIE_MAX_AGE",
  "ALLOWED_ORIGINS",
  "TRUST_PROXY",
  "API_MAX_BODY_BYTES",
  "API_RATE_LIMIT_PER_MIN",
  "API_WRITE_RATE_LIMIT_PER_MIN",
  "API_PAID_RATE_LIMIT_PER_MIN",
  "AUTH_RATE_LIMIT_PER_15_MIN",
  "PAID_WORKFLOW_MAX_CONCURRENCY",
  "PAID_WORKFLOW_DAILY_LIMIT",
  "PAID_WORKFLOW_BUDGET_TIMEZONE",
  "PAID_WORKFLOW_STALE_AFTER_SECONDS",
  "ASYNC_JOBS_ENABLED",
  "JOB_WORKER_POLL_MS",
  "JOB_WORKER_LEASE_SECONDS",
  "PROVIDER_CIRCUIT_BREAKER_ENABLED",
  "PROVIDER_CIRCUIT_BREAKER_FAILURE_THRESHOLD",
  "PROVIDER_CIRCUIT_BREAKER_COOLDOWN_SECONDS",
  "LIVE_PROBE_COMPANY",
  "DATAPRO_MCP_URL",
  "DATAPRO_RUN_ENABLED",
  "DATAPRO_MAX_SOURCES",
  "DATAPRO_TIMEOUT_MS",
  "DATAPRO_MAX_RETRIES",
  "WEB_SEARCH_BASE_URL",
  "WEB_SEARCH_TRAFFIC_TAG",
  "WEB_SEARCH_RUN_ENABLED",
  "WEB_SEARCH_MAX_COUNT",
  "WEB_SEARCH_TIMEOUT_MS",
  "WEB_SEARCH_MAX_RETRIES",
  "MODEL_BASE_URL",
  "MODEL_NAME",
  "MODEL_RUN_ENABLED",
  "MODEL_MAX_CARDS",
  "MODEL_MAX_TOKENS",
  "MODEL_TIMEOUT_MS",
  "MODEL_MAX_RETRIES",
  "DOSSIER_AGENT_MAX_CALLS",
  "DOSSIER_CHECKPOINT_TTL_MS",
  "DOSSIER_DATAPRO_CONCURRENCY",
  "DOSSIER_WEB_CONCURRENCY",
  "OPENVIKING_BASE_URL",
  "OPENVIKING_CLI",
  "OPENVIKING_CLI_CONFIG",
  "OPENVIKING_AGENT_ID",
  "OPENVIKING_RESOURCE_ID",
  "OPENVIKING_COLLECTION_NAME",
  "OPENVIKING_RUN_ENABLED",
  "OPENVIKING_SALES_ROOT_URI",
  "OPENVIKING_FIND_LIMIT",
  "OPENVIKING_TIMEOUT_MS",
  "OPENVIKING_QA_AUTO_COMMIT_EVERY",
  "OPENVIKING_QA_KEEP_RECENT_MESSAGES",
  "VOLCENGINE_REGION",
  "SUPABASE_WORKSPACE_ID",
  "SUPABASE_BRANCH_ID",
  "SUPABASE_API_URL",
  "SUPABASE_DATA_API_TIMEOUT_MS",
  "SUPABASE_READ_ONLY",
  "SUPABASE_RUN_ENABLED",
  "SUPABASE_CLI_BIN",
  "SUPABASE_CLI_PROFILE",
  "SUPABASE_TIMEOUT_MS",
  "APP_WORKSPACE_ID",
  "APP_WORKSPACE_SLUG",
  "APP_WORKSPACE_NAME",
  "APP_WORKSPACE_PLAN_MODE",
  "FEISHU_SYNC_ENABLED",
  "FEISHU_CLI_IMPORT_ENABLED",
  "FEISHU_CLI_IMPORT_TASK_LIMIT",
  "LIVE_DOCTOR_TTL_MS",
]);

const RUNTIME_DEFAULTS = Object.freeze({
  REPOSITORY_MODE: "supabase",
  HOST: "127.0.0.1",
  PORT: "8787",
  HTTP_AUTH_ENABLED: "true",
  AUTH_BOOTSTRAP_ENABLED: "true",
  AUTH_COOKIE_SECURE: "false",
  AUTH_PROVIDER_TIMEOUT_MS: "12000",
  AUTH_SESSION_CACHE_TTL_MS: "15000",
  AUTH_REFRESH_COOKIE_MAX_AGE: "31536000",
  ALLOWED_ORIGINS: "",
  TRUST_PROXY: "false",
  API_MAX_BODY_BYTES: "1048576",
  API_RATE_LIMIT_PER_MIN: "180",
  API_WRITE_RATE_LIMIT_PER_MIN: "60",
  API_PAID_RATE_LIMIT_PER_MIN: "12",
  AUTH_RATE_LIMIT_PER_15_MIN: "20",
  PAID_WORKFLOW_MAX_CONCURRENCY: "2",
  PAID_WORKFLOW_DAILY_LIMIT: "100",
  PAID_WORKFLOW_BUDGET_TIMEZONE: "Asia/Shanghai",
  PAID_WORKFLOW_STALE_AFTER_SECONDS: "1800",
  ASYNC_JOBS_ENABLED: "true",
  JOB_WORKER_POLL_MS: "1000",
  JOB_WORKER_LEASE_SECONDS: "600",
  PROVIDER_CIRCUIT_BREAKER_ENABLED: "true",
  PROVIDER_CIRCUIT_BREAKER_FAILURE_THRESHOLD: "5",
  PROVIDER_CIRCUIT_BREAKER_COOLDOWN_SECONDS: "60",
  LIVE_PROBE_COMPANY: "北京火山引擎科技有限公司",
  DATAPRO_MCP_URL: "https://datapro.hqd.cn-beijing.volces.com/mcp",
  DATAPRO_MAX_SOURCES: "4",
  DATAPRO_TIMEOUT_MS: "45000",
  DATAPRO_MAX_RETRIES: "1",
  WEB_SEARCH_BASE_URL: "https://open.feedcoopapi.com/search_api/web_search",
  WEB_SEARCH_TRAFFIC_TAG: "skill_web_search_common",
  WEB_SEARCH_MAX_COUNT: "3",
  WEB_SEARCH_TIMEOUT_MS: "20000",
  WEB_SEARCH_MAX_RETRIES: "1",
  MODEL_BASE_URL: "https://ark.cn-beijing.volces.com/api/plan/v3",
  MODEL_NAME: "ark-code-latest",
  MODEL_MAX_CARDS: "2",
  MODEL_MAX_TOKENS: "700",
  MODEL_TIMEOUT_MS: "90000",
  MODEL_MAX_RETRIES: "1",
  DOSSIER_AGENT_MAX_CALLS: "3",
  DOSSIER_CHECKPOINT_TTL_MS: "1800000",
  DOSSIER_DATAPRO_CONCURRENCY: "2",
  DOSSIER_WEB_CONCURRENCY: "3",
  OPENVIKING_AGENT_ID: "default",
  OPENVIKING_SALES_ROOT_URI: "viking://resources/sales-workbench",
  OPENVIKING_FIND_LIMIT: "3",
  OPENVIKING_TIMEOUT_MS: "120000",
  OPENVIKING_QA_AUTO_COMMIT_EVERY: "4",
  OPENVIKING_QA_KEEP_RECENT_MESSAGES: "6",
  VOLCENGINE_REGION: "cn-beijing",
  SUPABASE_DATA_API_TIMEOUT_MS: "15000",
  SUPABASE_READ_ONLY: "false",
  SUPABASE_CLI_BIN: "byted-supabase-cli",
  SUPABASE_CLI_PROFILE: "current",
  SUPABASE_TIMEOUT_MS: "30000",
  APP_WORKSPACE_SLUG: "default",
  APP_WORKSPACE_NAME: "Sales Workbench",
  APP_WORKSPACE_PLAN_MODE: "agent_plan",
  FEISHU_SYNC_ENABLED: "false",
  FEISHU_CLI_IMPORT_ENABLED: "false",
  FEISHU_CLI_IMPORT_TASK_LIMIT: "100",
  LIVE_DOCTOR_TTL_MS: "900000",
});

export function ensureDirectories() {
  for (const directory of [
    paths.installRoot,
    paths.configDir,
    paths.stateDir,
    paths.runDir,
    paths.logDir,
    paths.backupDir,
  ]) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.chmodSync(directory, 0o700);
  }
}

function parseEnvValue(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1);
  return trimmed;
}

export function parseEnvFile(filePath) {
  try {
    const values = {};
    for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const index = line.indexOf("=");
      const key = line.slice(0, index).trim();
      if (!/^[A-Z][A-Z0-9_]*$/.test(key)) continue;
      values[key] = parseEnvValue(line.slice(index + 1));
    }
    return values;
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

function writeEnvFile(filePath, heading, keys, values) {
  const lines = [heading];
  for (const key of keys) {
    if (values[key] === undefined || values[key] === null || values[key] === "") continue;
    lines.push(`${key}=${JSON.stringify(String(values[key]))}`);
  }
  lines.push("");
  fs.writeFileSync(filePath, lines.join("\n"), { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

function firstValue(values, keys) {
  for (const key of keys) {
    if (values[key] !== undefined && values[key] !== null && values[key] !== "") return String(values[key]);
  }
  return "";
}

function configuredFlag(values, key, configured) {
  if (values[key] !== undefined && values[key] !== "") return String(values[key]);
  return configured ? "true" : "false";
}

export function readConfiguration() {
  return {
    ...parseEnvFile(paths.runtimeFile),
    ...parseEnvFile(paths.credentialsFile),
  };
}

export function writeConfiguration(inputValues) {
  ensureDirectories();
  const current = readConfiguration();
  const values = { ...current, ...inputValues };
  const hasInput = (key) => Object.hasOwn(inputValues, key);
  const explicitPlanKey = hasInput("AGENT_PLAN_API_KEY");
  const agentPlanKey = firstValue(values, [
    "AGENT_PLAN_API_KEY",
    "MODEL_API_KEY",
    "ARK_API_KEY",
    "VOLCENGINE_ARK_API_KEY",
    "DATAPRO_API_KEY",
    "WEB_SEARCH_API_KEY",
  ]);
  const capabilityOverride = (key, aliases = []) => {
    if (hasInput(key)) return String(inputValues[key] || "");
    if (explicitPlanKey) return "";
    return firstValue(values, [key, ...aliases]);
  };
  const credentialValues = {
    AGENT_PLAN_API_KEY: agentPlanKey,
    MODEL_API_KEY: capabilityOverride("MODEL_API_KEY", ["ARK_API_KEY", "VOLCENGINE_ARK_API_KEY"]),
    DATAPRO_API_KEY: capabilityOverride("DATAPRO_API_KEY"),
    WEB_SEARCH_API_KEY: capabilityOverride("WEB_SEARCH_API_KEY", ["ASK_ECHO_SEARCH_INFINITY_API_KEY"]),
    OPENVIKING_API_KEY: capabilityOverride("OPENVIKING_API_KEY", ["OPENVIKING_BEARER_TOKEN"]),
    VOLCENGINE_ACCESS_KEY: firstValue(values, ["VOLCENGINE_ACCESS_KEY"]),
    VOLCENGINE_SECRET_KEY: firstValue(values, ["VOLCENGINE_SECRET_KEY"]),
    SUPABASE_SERVICE_ROLE_KEY: firstValue(values, ["SUPABASE_SERVICE_ROLE_KEY"]),
  };
  const runtimeValues = { ...RUNTIME_DEFAULTS };
  for (const key of RUNTIME_KEYS) {
    if (values[key] !== undefined && values[key] !== "") runtimeValues[key] = String(values[key]);
  }
  if (!runtimeValues.APP_WORKSPACE_ID) runtimeValues.APP_WORKSPACE_ID = randomUUID();
  if (!runtimeValues.ALLOWED_ORIGINS) {
    const port = Number(runtimeValues.PORT) || 8787;
    runtimeValues.ALLOWED_ORIGINS = `http://127.0.0.1:${port},http://localhost:${port}`;
  }
  runtimeValues.REPOSITORY_MODE = "supabase";
  runtimeValues.SUPABASE_READ_ONLY = "false";
  runtimeValues.MODEL_RUN_ENABLED = configuredFlag(values, "MODEL_RUN_ENABLED", Boolean(credentialValues.MODEL_API_KEY || agentPlanKey));
  runtimeValues.DATAPRO_RUN_ENABLED = configuredFlag(values, "DATAPRO_RUN_ENABLED", Boolean(credentialValues.DATAPRO_API_KEY || agentPlanKey));
  runtimeValues.WEB_SEARCH_RUN_ENABLED = configuredFlag(values, "WEB_SEARCH_RUN_ENABLED", Boolean(credentialValues.WEB_SEARCH_API_KEY || agentPlanKey));
  runtimeValues.OPENVIKING_RUN_ENABLED = configuredFlag(
    values,
    "OPENVIKING_RUN_ENABLED",
    Boolean(
      (credentialValues.OPENVIKING_API_KEY && runtimeValues.OPENVIKING_BASE_URL)
      || openVikingCliConfiguration(runtimeValues).ready
    ),
  );
  runtimeValues.SUPABASE_RUN_ENABLED = configuredFlag(
    values,
    "SUPABASE_RUN_ENABLED",
    Boolean(
      runtimeValues.SUPABASE_API_URL
      && credentialValues.SUPABASE_SERVICE_ROLE_KEY
      && runtimeValues.APP_WORKSPACE_ID
    ),
  );
  writeEnvFile(paths.credentialsFile, "# 销售智能工作台私密凭证。不要提交此文件。", SECRET_KEYS, credentialValues);
  writeEnvFile(paths.runtimeFile, "# 销售智能工作台非敏感运行配置。", RUNTIME_KEYS, runtimeValues);
  return { credentials: credentialValues, runtime: runtimeValues };
}

export function assertNodeVersion() {
  const major = Number(process.versions.node.split(".")[0]);
  if (!Number.isFinite(major) || major < 20) {
    throw new Error(`需要 Node.js 20 或更高版本，当前为 ${process.versions.node}`);
  }
}

export function assertAppSource(sourcePath) {
  const resolved = path.resolve(sourcePath);
  const required = [
    "backend/package.json",
    "backend/src/server.js",
    "frontend/index.html",
    "frontend/app.js",
    "supabase/migrations",
  ];
  const missing = required.filter((relative) => !fs.existsSync(path.join(resolved, relative)));
  if (missing.length) throw new Error(`不是完整的销售智能工作台应用包：缺少 ${missing.join("、")}`);
  return resolved;
}

export function assertInstalledApp() {
  return assertAppSource(paths.installedApp);
}

export function appCopyFilter(rootDir, sourcePath) {
  const relative = path.relative(rootDir, sourcePath);
  if (!relative) return true;
  const segments = relative.split(path.sep);
  const first = segments[0];
  if (!["backend", "frontend", "supabase"].includes(first)) return false;
  if (segments.some((segment) => ["node_modules", ".git", ".temp", "coverage", "backups"].includes(segment))) return false;
  const name = path.basename(sourcePath);
  if (name === ".DS_Store" || name === ".env.local") return false;
  if (name.startsWith(".env.") && name !== ".env.example") return false;
  return !/\.(?:log|pid)$/i.test(name);
}

export function readOption(name, args = process.argv.slice(2)) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} 缺少参数值。`);
  return value;
}

export function resolveUserPath(value) {
  if (!value) return null;
  if (value === "~") return os.homedir();
  if (value.startsWith(`~${path.sep}`)) return path.join(os.homedir(), value.slice(2));
  return path.resolve(value);
}

export function openVikingCliConfiguration(values = readConfiguration()) {
  const configuredPath = values.OPENVIKING_CLI_CONFIG || "~/.openviking/ovcli.conf";
  const configPath = resolveUserPath(configuredPath);
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const url = String(parsed?.url || parsed?.base_url || "").trim();
    const apiKeyPresent = Boolean(String(parsed?.api_key || "").trim());
    return {
      path: configPath,
      ready: Boolean(url && apiKeyPresent),
      url: url || null,
      agent_id: String(parsed?.agent_id || "").trim() || null,
    };
  } catch {
    return {
      path: configPath,
      ready: false,
      url: null,
      agent_id: null,
    };
  }
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    stdio: options.stdio || "inherit",
    encoding: options.encoding,
    input: options.input,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} 执行失败，退出码 ${result.status}`);
  }
  return result;
}

export function commandExists(command) {
  const result = spawnSync(command, ["--version"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

export function readPid(filePath = paths.pidFile) {
  try {
    const pid = Number(fs.readFileSync(filePath, "utf8").trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export function processExists(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

export function runtimeEnvironment(overrides = {}) {
  const configuration = readConfiguration();
  return {
    ...configuration,
    ...process.env,
    FRONTEND_DIR: path.join(paths.installedApp, "frontend"),
    SALES_WORKBENCH_STATE_DIR: paths.stateDir,
    SALES_WORKBENCH_BACKUP_DIR: paths.backupDir,
    SALES_WORKBENCH_LIVE_DOCTOR_FILE: paths.lastDoctorFile,
    ...overrides,
  };
}

export function serverAddress() {
  const configuration = readConfiguration();
  const host = process.env.HOST || configuration.HOST || "127.0.0.1";
  const port = Number(process.env.PORT || configuration.PORT || 8787);
  const browserHost = ["0.0.0.0", "::"].includes(host) ? "127.0.0.1" : host;
  return { host, port, url: `http://${browserHost}:${port}` };
}

export async function waitForHealth(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return true;
    } catch {
      // The process may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

export function credentialFileIsPrivate() {
  try {
    return (fs.statSync(paths.credentialsFile).mode & 0o077) === 0;
  } catch {
    return false;
  }
}

export function writePrivateJson(filePath, value) {
  ensureDirectories();
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

export function liveDoctorEvidence() {
  try {
    const report = JSON.parse(fs.readFileSync(paths.liveDoctorFile, "utf8"));
    const finishedAt = Date.parse(report.finished_at || report.checked_at || "");
    const ttlMs = Number(readConfiguration().LIVE_DOCTOR_TTL_MS || 900000);
    const ageMs = Number.isFinite(finishedAt) ? Date.now() - finishedAt : Number.POSITIVE_INFINITY;
    return {
      exists: true,
      fresh: Boolean(report.runtime_ready && ageMs >= 0 && ageMs <= ttlMs),
      age_ms: Number.isFinite(ageMs) ? ageMs : null,
      ttl_ms: ttlMs,
      report,
    };
  } catch {
    return { exists: false, fresh: false, age_ms: null, ttl_ms: Number(readConfiguration().LIVE_DOCTOR_TTL_MS || 900000), report: null };
  }
}

export function configurationSummary() {
  const values = readConfiguration();
  const hasAgentPlanKey = Boolean(values.AGENT_PLAN_API_KEY);
  const openVikingCli = openVikingCliConfiguration(values);
  return {
    repository_mode: values.REPOSITORY_MODE || "supabase",
    http_auth: String(values.HTTP_AUTH_ENABLED || "false").toLowerCase() === "true",
    async_jobs: String(values.ASYNC_JOBS_ENABLED || "false").toLowerCase() === "true",
    worker_lease_seconds: Number(values.JOB_WORKER_LEASE_SECONDS || 0),
    cli_session: fs.existsSync(paths.cliSessionFile),
    model: Boolean(values.MODEL_API_KEY || hasAgentPlanKey),
    datapro: Boolean(values.DATAPRO_API_KEY || hasAgentPlanKey),
    web_search: Boolean(values.WEB_SEARCH_API_KEY || hasAgentPlanKey),
    openviking: Boolean(
      (values.OPENVIKING_BASE_URL && values.OPENVIKING_API_KEY)
      || openVikingCli.ready
    ),
    supabase_data_api: Boolean(values.SUPABASE_API_URL && values.SUPABASE_SERVICE_ROLE_KEY && values.APP_WORKSPACE_ID),
    supabase_control_plane: Boolean(values.VOLCENGINE_ACCESS_KEY && values.VOLCENGINE_SECRET_KEY),
    feishu_sync: [values.FEISHU_CLI_IMPORT_ENABLED, values.FEISHU_SYNC_ENABLED]
      .some((value) => String(value || "false").toLowerCase() === "true"),
  };
}
