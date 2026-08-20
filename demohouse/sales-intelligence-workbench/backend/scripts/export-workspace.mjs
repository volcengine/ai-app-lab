import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { backendFetch, readAuthSession } from "./import-feishu-cli.mjs";

const DEFAULT_API_URL = "http://127.0.0.1:8787";

function usage() {
  return `
导出当前工作区的可迁移业务数据（仅 owner）

用法：
  node scripts/export-workspace.mjs [--api-url <URL>] [--auth-session <PATH>] [--output <PATH>]

输出包含企业、目标、公开档案、资料正文、同步游标和问答，属于私密业务数据。
不会包含密钥、Provider 原文、OpenViking 内部 URI、Worker、租约或运行诊断。
`;
}

function optionValue(argv, index, name) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} 缺少参数值。`);
  return value;
}

function parseArgs(argv) {
  const options = {
    apiUrl: process.env.SALES_WORKBENCH_API_URL || "",
    authSession: process.env.SALES_WORKBENCH_AUTH_SESSION
      || path.join(os.homedir(), ".local", "state", "sales-intelligence-workbench", "cli-session.json"),
    output: "",
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--api-url") {
      options.apiUrl = optionValue(argv, index, argument);
      index += 1;
    } else if (argument === "--auth-session") {
      options.authSession = optionValue(argv, index, argument);
      index += 1;
    } else if (argument === "--output") {
      options.output = optionValue(argv, index, argument);
      index += 1;
    } else {
      throw new Error(`未知参数：${argument}`);
    }
  }
  return options;
}

function assertPrivateSession(filePath) {
  const session = readAuthSession(filePath);
  if (!session) throw new Error("未找到 CLI 登录态。请先运行 Skill 的 login.mjs。");
  const mode = fs.statSync(filePath).mode & 0o077;
  if (mode !== 0) throw new Error("CLI 会话文件权限不安全；请将其权限改为 0600 后重试。");
  return session;
}

function defaultOutput() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return path.join(
    os.homedir(),
    ".local",
    "state",
    "sales-intelligence-workbench",
    "exports",
    `workspace-${stamp}.json`,
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage().trimStart());
    return;
  }
  const session = assertPrivateSession(options.authSession);
  options.apiUrl = String(options.apiUrl || session.api_url || DEFAULT_API_URL).replace(/\/$/, "");
  if (!/^https?:\/\/[^/]+/i.test(options.apiUrl)) throw new Error("--api-url 不是有效的 HTTP(S) 地址。");

  const response = await backendFetch(`${options.apiUrl}/api/admin/workspace-export`, {
    method: "GET",
  }, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const requestId = payload?.meta?.request_id ? `，请求ID ${payload.meta.request_id}` : "";
    throw new Error(`${payload?.error?.message || `导出失败（HTTP ${response.status}）`}${requestId}`);
  }
  const exported = payload.data;
  if (exported?.format !== "sales-intelligence-workbench-workspace-export") {
    throw new Error("服务端没有返回有效的工作区业务数据包。");
  }

  const outputPath = path.resolve(options.output || defaultOutput());
  fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  fs.chmodSync(path.dirname(outputPath), 0o700);
  fs.writeFileSync(outputPath, `${JSON.stringify(exported, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  fs.chmodSync(outputPath, 0o600);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    output: outputPath,
    goal_count: exported.goals?.length || 0,
    enterprise_count: exported.enterprises?.length || 0,
    contains_private_business_data: true,
  }, null, 2)}\n`);
}

export { assertPrivateSession, parseArgs };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: { message: error.message } }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
