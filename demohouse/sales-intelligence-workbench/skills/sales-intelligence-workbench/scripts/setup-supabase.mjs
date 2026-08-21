import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  assertInstalledApp,
  commandExists,
  paths,
  readConfiguration,
  run,
  runtimeEnvironment,
  writeConfiguration,
} from "./lib.mjs";

function parseJson(stdout, label) {
  try {
    return JSON.parse(String(stdout || "").trim());
  } catch {
    throw new Error(`${label} 未返回有效 JSON。`);
  }
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : "";
}

function workspaceItems(payload) {
  if (Array.isArray(payload)) return payload;
  const candidates = [
    payload?.workspaces,
    payload?.Workspaces,
    payload?.items,
    payload?.Items,
    payload?.data,
    payload?.Data,
    payload?.data?.items,
    payload?.Data?.Items,
  ];
  return candidates.find(Array.isArray) || [];
}

function workspaceId(item) {
  return String(
    item?.workspace_id
      || item?.WorkspaceId
      || item?.WorkspaceID
      || item?.id
      || item?.ID
      || item?.ref
      || item?.Ref
      || "",
  ).trim();
}

function workspaceName(item) {
  return String(item?.name || item?.Name || item?.workspace_name || item?.WorkspaceName || "未命名 Workspace").trim();
}

function isAgentPlanWorkspace(item) {
  if (item?.is_agent_plan === true || item?.is_agent_plan_instance === true) return true;
  const plan = String(
    item?.plan_mode
      || item?.PlanMode
      || item?.billing_mode
      || item?.BillingMode
      || item?.source
      || item?.Source
      || "",
  );
  return /agent[\s_-]*plan/i.test(plan);
}

function runCli(command, args, environment) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: environment,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const message = String(result.stderr || result.stdout || "Supabase CLI 执行失败。")
      .replace(/https?:\/\/\S+/g, "[URL]")
      .replace(/\b(?:ws|br)-[A-Za-z0-9_-]+\b/g, "[RESOURCE_ID]")
      .replace(/\bAKL[A-Za-z0-9_-]{12,}\b/g, "[ACCESS_KEY]")
      .replace(/\bark-[A-Za-z0-9_-]{16,}\b/g, "[API_KEY]")
      .replace(/\beyJ[A-Za-z0-9._-]{24,}\b/g, "[TOKEN]")
      .slice(0, 800);
    throw new Error(message);
  }
  return result.stdout;
}

function endpointOrigin(payload) {
  const addresses = (payload?.Endpoints || [])
    .flatMap((endpoint) => endpoint?.Addresses || [])
    .filter((address) => String(address?.AddressDomain || "").trim());
  const preferred = addresses.find((address) => /public|internet|external/i.test(String(address.AddressType || "")));
  const selected = preferred || addresses[0];
  const domain = String(selected?.AddressDomain || "").trim();
  const port = Number(selected?.AddressPort || 0);
  if (!domain) return "";
  return `https://${domain}${port && port !== 443 ? `:${port}` : ""}`;
}

function serviceRoleKey(payload) {
  if (!Array.isArray(payload)) return "";
  const item = payload.find((candidate) => /service.?role/i.test(String(candidate?.name || candidate?.type || "")));
  return String(item?.api_key || "").trim();
}

async function probeDataApi(apiUrl, key) {
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/rest/v1/app_workspaces?select=id&limit=1`, {
    signal: AbortSignal.timeout(15_000),
    headers: {
      Accept: "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  if (!response.ok) throw new Error(`Supabase Data API 回读验证失败（HTTP ${response.status}）。`);
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length < 1) {
    throw new Error("Supabase Data API 可达，但未读到应用 Workspace；初始化未完成。");
  }
  return rows.length;
}

assertInstalledApp();
const apply = process.argv.includes("--apply");
const confirmed = process.argv.includes("--yes");
const configuration = readConfiguration();
const command = configuration.SUPABASE_CLI_BIN || "byted-supabase-cli";
const profile = readOption("--profile") || configuration.SUPABASE_CLI_PROFILE || "current";
const requestedWorkspaceId = readOption("--workspace-id") || configuration.SUPABASE_WORKSPACE_ID || "";
const requestedBranchId = readOption("--branch-id") || configuration.SUPABASE_BRANCH_ID || "";
const profileArgs = profile === "current" ? [] : ["--profile", profile];
const environment = runtimeEnvironment();
if (profileArgs.length) {
  delete environment.VOLCENGINE_ACCESS_KEY;
  delete environment.VOLCENGINE_SECRET_KEY;
  delete environment.VOLCENGINE_SESSION_TOKEN;
}

let selectedWorkspaceId = requestedWorkspaceId;
let discovered = [];
if (!selectedWorkspaceId && commandExists(command)) {
  const listed = parseJson(runCli(command, [
    ...profileArgs,
    "projects", "list",
    "--limit", "100",
    "-o", "json",
  ], environment), "Supabase projects list");
  discovered = workspaceItems(listed)
    .filter((item) => isAgentPlanWorkspace(item) && workspaceId(item))
    .map((item) => ({ id: workspaceId(item), name: workspaceName(item) }));
  if (discovered.length === 1) selectedWorkspaceId = discovered[0].id;
}

if (!apply) {
  const selection = selectedWorkspaceId
    ? `已选 Agent Plan Workspace：${selectedWorkspaceId}`
    : discovered.length > 1
      ? `发现 ${discovered.length} 个 Agent Plan Workspace，请从下列列表选择：\n${discovered
        .map((item) => `- ${item.name}（${item.id}）`)
        .join("\n")}`
      : "尚未选定 Agent Plan Workspace。";
  const applyCommand = selectedWorkspaceId
    ? `setup-supabase.mjs --apply --workspace-id ${selectedWorkspaceId}${profile === "current" ? "" : ` --profile ${profile}`} --yes`
    : "setup-supabase.mjs --apply --workspace-id <workspace-id> --yes";
  process.stdout.write([
    "Supabase 初始化计划（当前未写入）：",
    selection,
    "1. 只读确认目标 Workspace 属于 Agent Plan，且处于可用状态。",
    "2. 通过已登录的官方 CLI 自动获取 Data API 端点和后端内部凭据。",
    "3. 仅写入本机销售工作台私密配置，不向用户显示内部凭据。",
    "4. 对目标数据库应用随应用包分发的版本化迁移。",
    "5. 创建或更新 APP_WORKSPACE_ID 对应的应用 Workspace 记录。",
    "6. 通过 Data API 回读验证。",
    `确认目标无误后执行：${applyCommand}`,
    "本命令不会创建、暂停或删除云 Workspace。",
    !commandExists(command)
      ? `未检测到 ${command}；请先安装并运行 byted-supabase-cli login --profile agent-plan --region cn-beijing --is-agent-plan。`
      : "",
    "",
  ].filter(Boolean).join("\n"));
  process.exit(0);
}
if (!confirmed) {
  throw new Error("应用迁移会修改目标数据库；确认目标无误后同时传入 --apply --yes。");
}
if (!commandExists(command)) throw new Error(`找不到 ${command}，请先安装并登录火山 Supabase CLI。`);
if (!selectedWorkspaceId) {
  if (discovered.length > 1) {
    throw new Error("检测到多个 Agent Plan Workspace，请使用 --workspace-id 明确选择目标。");
  }
  throw new Error(
    "未发现可用的 Agent Plan Workspace。请先登录官方 CLI；需要新建时，先由用户确认计费影响，再执行 projects create --is-agent-plan。",
  );
}

const workspace = parseJson(runCli(command, [
  ...profileArgs,
  "projects", "list",
  "--workspace-id", selectedWorkspaceId,
  "--detail",
  "-o", "json",
], environment), "Supabase projects list");
if (!workspace?.is_agent_plan && !workspace?.is_agent_plan_instance) {
  throw new Error("目标不是 AI Native 应用开发底座（Supabase）的 Agent Plan Workspace。请使用 --is-agent-plan 创建新 Workspace，不要使用普通按量实例。");
}
if (String(workspace.status || "").toLowerCase() !== "running") {
  throw new Error(`目标 Agent Plan Supabase Workspace 当前状态为 ${workspace.status || "unknown"}，请先恢复为 Running。`);
}

const endpointArgs = [
  ...profileArgs,
  "endpoints", "list",
  "--workspace-id", selectedWorkspaceId,
  "-o", "json",
];
const keyArgs = [
  ...profileArgs,
  "projects", "api-keys",
  "--workspace-id", selectedWorkspaceId,
  "-o", "json",
];
if (requestedBranchId) {
  endpointArgs.push("--branch-id", requestedBranchId);
  keyArgs.push("--branch-id", requestedBranchId);
}

const endpoints = parseJson(runCli(command, endpointArgs, environment), "Supabase endpoints list");
const keys = parseJson(runCli(command, keyArgs, environment), "Supabase API keys");
const apiOrigin = endpointOrigin(endpoints);
const key = serviceRoleKey(keys);
if (!apiOrigin) throw new Error("目标 Workspace 未返回可用的 Data API 域名。");
if (!key) throw new Error("目标 Workspace 未返回 Service Role Key。");

writeConfiguration({
  ...configuration,
  SUPABASE_CLI_PROFILE: profile,
  SUPABASE_WORKSPACE_ID: selectedWorkspaceId,
  SUPABASE_BRANCH_ID: requestedBranchId || endpoints.BranchId || "",
  SUPABASE_API_URL: apiOrigin,
  SUPABASE_SERVICE_ROLE_KEY: key,
  SUPABASE_RUN_ENABLED: "true",
});

const refreshedEnvironment = runtimeEnvironment();
run(process.execPath, [path.join(paths.installedApp, "backend", "scripts", "migrate-supabase.mjs"), "--apply"], {
  cwd: path.join(paths.installedApp, "backend"),
  env: refreshedEnvironment,
});
run(process.execPath, [path.join(paths.installedApp, "backend", "scripts", "bootstrap-workspace.mjs")], {
  cwd: path.join(paths.installedApp, "backend"),
  env: refreshedEnvironment,
});

const rowCount = await probeDataApi(apiOrigin, key);
process.stdout.write(`${JSON.stringify({
  ok: true,
  configuration_updated: true,
  migrations_applied: true,
  app_workspace_bootstrapped: true,
  data_api_probe_rows: rowCount,
  credentials_file: paths.credentialsFile,
  runtime_file: paths.runtimeFile,
}, null, 2)}\n`);
