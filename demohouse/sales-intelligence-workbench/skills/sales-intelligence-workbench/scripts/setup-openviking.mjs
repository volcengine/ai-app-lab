import fs from "node:fs";
import { spawnSync } from "node:child_process";

import {
  assertNodeVersion,
  commandExists,
  configurationSummary,
  paths,
  readConfiguration,
  writeConfiguration,
} from "./lib.mjs";

const OFFICIAL_BASE_URL = "https://api.vikingdb.cn-beijing.volces.com/openviking";
const DEFAULT_WAIT_SECONDS = 900;
const MAX_COLLECTIONS = 20;

function usage() {
  return `
Agent Plan OpenViking 记忆库初始化

只读检查并给出下一步：
  node setup-openviking.mjs

复用指定记忆库：
  node setup-openviking.mjs --apply --resource-id <ov-资源ID>

按名称复用；不存在时创建：
  node setup-openviking.mjs --apply --collection-name <英文名称> --yes

参数：
  --apply                    保存选中记忆库的内部连接信息
  --resource-id <资源ID>     复用已有记忆库
  --collection-name <名称>   精确匹配已有记忆库，或创建新记忆库
  --yes                      确认创建付费云资源；复用已有资源不要求
  --wait-seconds <秒>        等待新资源 READY 的最长时间，默认 900

说明：
  - 用户只需配置 Agent Plan Key；内部访问凭证由官方控制面自动获取并以 0600 保存。
  - 默认只读，不创建资源、不写配置、不产生新资源费用。
  - 新建 OpenViking 记忆库可能持续计费，且单账号最多 20 个，必须显式提供 --yes。
`;
}

function parseArgs(argv) {
  const options = {
    apply: false,
    yes: false,
    help: false,
    resourceId: "",
    collectionName: "",
    waitSeconds: DEFAULT_WAIT_SECONDS,
  };
  const valueOptions = new Map([
    ["--resource-id", "resourceId"],
    ["--collection-name", "collectionName"],
    ["--wait-seconds", "waitSeconds"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") options.apply = true;
    else if (argument === "--yes") options.yes = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (valueOptions.has(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} 缺少参数值。`);
      options[valueOptions.get(argument)] = value.trim();
      index += 1;
    } else {
      throw new Error(`未知参数：${argument}`);
    }
  }
  options.waitSeconds = Number(options.waitSeconds);
  if (!Number.isFinite(options.waitSeconds) || options.waitSeconds < 5 || options.waitSeconds > 3600) {
    throw new Error("--wait-seconds 必须是 5 到 3600 之间的秒数。");
  }
  if (options.resourceId && options.collectionName) {
    throw new Error("--resource-id 与 --collection-name 只能选择一个。");
  }
  return options;
}

function redact(value, secrets = []) {
  let text = String(value || "");
  for (const secret of secrets.filter(Boolean)) text = text.split(secret).join("[REDACTED]");
  return text
    .replace(/("?(?:ApiKey|api_key)"?\s*[:=]\s*")[^"]+(")/gi, "$1[REDACTED]$2")
    .replace(/\bark-[A-Za-z0-9-]{20,}\b/g, "[REDACTED]");
}

function parseJsonOutput(stdout, label) {
  const text = String(stdout || "").trim();
  if (!text) throw new Error(`${label} 未返回数据。`);
  try {
    return JSON.parse(text);
  } catch {
    const starts = [text.indexOf("{"), text.indexOf("[")].filter((index) => index >= 0);
    const start = starts.length ? Math.min(...starts) : -1;
    const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        // Continue to the safe error below.
      }
    }
    throw new Error(`${label} 返回格式无法识别。`);
  }
}

function controlPlaneCommand() {
  const override = String(process.env.OPENVIKING_CONTROL_PLANE_CLI || "").trim();
  if (override) return { command: override, prefix: [] };
  if (commandExists("ov-cp")) return { command: "ov-cp", prefix: [] };
  if (commandExists("uvx")) {
    return {
      command: "uvx",
      prefix: ["--from", "mcp-server-openviking-controlplane", "ov-cp"],
    };
  }
  throw new Error(
    "未找到官方 OpenViking 控制面命令。请先安装 uv（提供 uvx），然后重新运行本脚本。",
  );
}

function mapControlPlaneError(raw, secrets) {
  const message = redact(raw, secrets);
  if (/ProductUnordered/i.test(message)) {
    return "当前 Agent Plan 尚未开通 Agent 记忆（OpenViking）。请在控制台对应能力卡片完成开通后重试。";
  }
  if (/Unauthorized|Forbidden|Invalid.*Key|Authentication/i.test(message)) {
    return "Agent Plan Key 无效、已过期或无权管理 OpenViking，请更新套餐 Key 后重试。";
  }
  if (/20|limit|quota|maximum/i.test(message)) {
    return "OpenViking 记忆库数量可能已达账号上限（20 个）。请复用已有记忆库，或在控制台清理闲置资源后重试。";
  }
  return `OpenViking 控制面调用失败。${message ? `错误摘要：${message.slice(0, 500)}` : ""}`;
}

function invokeControlPlane(cli, subcommand, args, agentPlanKey) {
  const result = spawnSync(cli.command, [...cli.prefix, subcommand, ...args], {
    env: {
      ...process.env,
      AGENTPLAN_API_KEY: agentPlanKey,
    },
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(mapControlPlaneError(result.error.message, [agentPlanKey]));
  }
  if (result.status !== 0) {
    throw new Error(mapControlPlaneError(result.stderr || result.stdout, [agentPlanKey]));
  }
  return parseJsonOutput(result.stdout, `OpenViking ${subcommand}`);
}

function collectionList(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["Items", "items", "Resources", "resources", "Collections", "collections", "Data", "data"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function collectionId(item) {
  return String(item?.ResourceID || item?.resource_id || item?.resourceId || item?.ID || item?.id || "").trim();
}

function collectionName(item) {
  return String(item?.Name || item?.name || "").trim();
}

function collectionStatus(item) {
  return String(item?.Status || item?.status || "").trim().toUpperCase();
}

function printCollections(collections) {
  if (!collections.length) {
    process.stdout.write("当前账号还没有 OpenViking 记忆库。\n");
    return;
  }
  process.stdout.write("当前账号可用的 OpenViking 记忆库：\n");
  for (const item of collections) {
    const id = collectionId(item) || "未知资源ID";
    const name = collectionName(item) || "未命名";
    const status = collectionStatus(item) || "UNKNOWN";
    process.stdout.write(`- ${name}（${id}，${status}）\n`);
  }
}

function selectCollection(collections, options) {
  if (options.resourceId) {
    const selected = collections.find((item) => collectionId(item) === options.resourceId);
    if (!selected) throw new Error(`未找到 OpenViking 记忆库：${options.resourceId}`);
    return selected;
  }
  if (options.collectionName) {
    return collections.find((item) => collectionName(item) === options.collectionName) || null;
  }
  if (collections.length === 1) return collections[0];
  return null;
}

function validateCollectionName(name) {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)) {
    throw new Error("记忆库名称必须以英文字母开头，只包含英文字母、数字或下划线，最长 64 个字符。");
  }
}

function createdResource(payload) {
  const candidates = [
    payload,
    payload?.Data,
    payload?.data,
    payload?.Resource,
    payload?.resource,
  ];
  for (const item of candidates) {
    if (item && collectionId(item)) return item;
  }
  throw new Error("OpenViking 创建成功，但响应中缺少 ResourceID。请在控制台确认资源后按 ResourceID 复用，避免重复创建。");
}

function apiCredential(payload) {
  const candidates = [payload, payload?.Data, payload?.data];
  for (const item of candidates) {
    const apiKey = String(item?.ApiKey || item?.api_key || item?.apiKey || "").trim();
    const userId = String(item?.UserID || item?.user_id || item?.userId || "").trim();
    if (apiKey) return { apiKey, userId: userId || "default" };
  }
  throw new Error("OpenViking 记忆库已就绪，但控制面没有返回可用的内部访问凭证。");
}

async function waitUntilReady(cli, resourceId, agentPlanKey, waitSeconds) {
  const deadline = Date.now() + waitSeconds * 1000;
  while (Date.now() <= deadline) {
    const resource = invokeControlPlane(cli, "get", [resourceId], agentPlanKey);
    const status = collectionStatus(resource);
    if (status === "READY") return resource;
    if (["FAILED", "ERROR", "DELETED", "DELETE_FAILED"].includes(status)) {
      throw new Error(`OpenViking 记忆库进入终止状态：${status}。请在控制台查看失败原因。`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(
    `等待 OpenViking 记忆库 READY 超时。资源 ${resourceId} 已保留，请稍后使用 --resource-id ${resourceId} 继续，避免重复创建。`,
  );
}

assertNodeVersion();
const options = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write(usage().trimStart());
  process.exit(0);
}

const configuration = readConfiguration();
if (!configuration.AGENT_PLAN_API_KEY) {
  throw new Error(`尚未配置 Agent Plan Key。请先运行 node ${paths.skillRoot}/scripts/configure.mjs`);
}

const summary = configurationSummary();
if (summary.openviking) {
  process.stdout.write("OpenViking 记忆库已连接，无需再次初始化，也无需输入其他 Key。\n");
  process.exit(0);
}

const cli = controlPlaneCommand();
const collections = collectionList(
  invokeControlPlane(cli, "list", [], configuration.AGENT_PLAN_API_KEY),
);
const selected = selectCollection(collections, options);

if (!options.apply) {
  printCollections(collections);
  if (selected) {
    process.stdout.write(
      `下一步可复用该记忆库：node ${paths.skillRoot}/scripts/setup-openviking.mjs --apply --resource-id ${collectionId(selected)}\n`,
    );
  } else if (collections.length > 1) {
    process.stdout.write("请选择一个 ResourceID，再使用 --apply --resource-id 继续。\n");
  } else {
    process.stdout.write(
      `请确认新记忆库英文名称和持续计费影响，再运行：node ${paths.skillRoot}/scripts/setup-openviking.mjs --apply --collection-name <英文名称> --yes\n`,
    );
  }
  process.exit(0);
}

let resource = selected;
let created = false;
if (!resource) {
  if (!options.collectionName) {
    printCollections(collections);
    throw new Error("存在多个记忆库时必须通过 --resource-id 选择；没有记忆库时必须提供 --collection-name。");
  }
  validateCollectionName(options.collectionName);
  if (!options.yes) {
    throw new Error("创建 OpenViking 记忆库可能持续计费，必须在确认后同时提供 --yes。");
  }
  if (collections.length >= MAX_COLLECTIONS) {
    throw new Error("当前账号已有 20 个 OpenViking 记忆库，请复用已有资源或先清理闲置资源。");
  }
  resource = createdResource(invokeControlPlane(cli, "create", [
    "--name", options.collectionName,
    "--source", "agentplan",
    "--description", "Sales intelligence workbench long-term memory",
  ], configuration.AGENT_PLAN_API_KEY));
  created = true;
}

const resourceId = collectionId(resource);
if (!resourceId) throw new Error("选中的 OpenViking 记忆库缺少 ResourceID。");
const readyResource = collectionStatus(resource) === "READY"
  ? resource
  : await waitUntilReady(cli, resourceId, configuration.AGENT_PLAN_API_KEY, options.waitSeconds);
const credentials = apiCredential(
  invokeControlPlane(cli, "api-key", [resourceId], configuration.AGENT_PLAN_API_KEY),
);
const name = collectionName(readyResource) || collectionName(resource) || options.collectionName || resourceId;

writeConfiguration({
  OPENVIKING_API_KEY: credentials.apiKey,
  OPENVIKING_BASE_URL: OFFICIAL_BASE_URL,
  OPENVIKING_AGENT_ID: credentials.userId,
  OPENVIKING_RESOURCE_ID: resourceId,
  OPENVIKING_COLLECTION_NAME: name,
  OPENVIKING_RUN_ENABLED: "true",
});

fs.chmodSync(paths.credentialsFile, 0o600);
process.stdout.write(`${created ? "已创建" : "已复用"} Agent Plan OpenViking 记忆库：${name}（${resourceId}）。\n`);
process.stdout.write(`内部连接信息已安全写入 ${paths.credentialsFile}，权限为 0600，未在终端显示。\n`);
process.stdout.write("用户侧仍只使用 Agent Plan Key，无需输入或管理其他 Key。\n");
