import fs from "node:fs";
import { Writable } from "node:stream";
import readline from "node:readline/promises";
import {
  configurationSummary,
  openVikingCliConfiguration,
  parseEnvFile,
  paths,
  readConfiguration,
  readOption,
  resolveUserPath,
  writeConfiguration,
} from "./lib.mjs";

class MutedOutput extends Writable {
  constructor(output) {
    super();
    this.output = output;
    this.muted = false;
  }

  _write(chunk, encoding, callback) {
    if (!this.muted) this.output.write(chunk, encoding);
    callback();
  }
}

async function hiddenQuestion(rl, output, label, existingValue = "") {
  process.stdout.write(`${label}${existingValue ? "（留空保留现有值）" : ""}: `);
  output.muted = true;
  const answer = await rl.question("");
  output.muted = false;
  process.stdout.write("\n");
  return answer.trim() || existingValue;
}

async function visibleQuestion(rl, label, existingValue = "") {
  const suffix = existingValue ? ` [${existingValue}]` : "";
  const answer = (await rl.question(`${label}${suffix}: `)).trim();
  return answer || existingValue;
}

const importPath = readOption("--from-env-file");

if (importPath) {
  const resolved = resolveUserPath(importPath);
  if (!fs.existsSync(resolved)) throw new Error(`配置源文件不存在：${resolved}`);
  const imported = parseEnvFile(resolved);
  writeConfiguration(imported);
  process.stdout.write(`已从现有环境文件迁移配置，源文件未被修改。\n`);
  process.stdout.write(`私密凭证：${paths.credentialsFile}（0600）\n`);
  process.stdout.write(`运行配置：${paths.runtimeFile}（0600）\n`);
  process.stdout.write(`${JSON.stringify(configurationSummary(), null, 2)}\n`);
  process.exit(0);
}

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  throw new Error("交互配置需要终端，以确保密钥输入不回显；迁移现有配置可使用 --from-env-file。");
}

const existing = readConfiguration();
const output = new MutedOutput(process.stdout);
const rl = readline.createInterface({ input: process.stdin, output, terminal: true });

try {
  process.stdout.write("凭证只写入本机用户配置目录，输入过程不会回显。\n");
  const agentPlanKey = await hiddenQuestion(
    rl,
    output,
    "Agent Plan API Key（模型、DataPro、豆包搜索和 OpenViking 控制面共用）",
    existing.AGENT_PLAN_API_KEY
      || existing.MODEL_API_KEY
      || existing.DATAPRO_API_KEY
      || existing.WEB_SEARCH_API_KEY,
  );
  if (!agentPlanKey) throw new Error("Agent Plan API Key 不能为空。");
  const detectedOpenViking = openVikingCliConfiguration(existing);
  const openVikingKey = existing.OPENVIKING_API_KEY || "";
  const openVikingBaseUrl = existing.OPENVIKING_BASE_URL || "";
  let openVikingCliConfig = existing.OPENVIKING_CLI_CONFIG || "";
  if (detectedOpenViking.ready && !openVikingKey) {
    openVikingCliConfig = detectedOpenViking.path;
    process.stdout.write(`已自动接入本机 OpenViking CLI 配置：${detectedOpenViking.path}\n`);
  } else if (!openVikingKey) {
    process.stdout.write(
      "Agent Plan Key 已保存；OpenViking 记忆库将在下一阶段自动选择或创建，无需输入其他 Key。\n",
    );
  }
  const openVikingCli = existing.OPENVIKING_CLI || "";
  const openVikingAgentId = existing.OPENVIKING_AGENT_ID || detectedOpenViking.agent_id || "default";

  process.stdout.write(
    "Supabase 将在下一阶段通过已登录的官方 CLI 自动选择 Agent Plan Workspace，"
      + "并获取后端内部连接信息；无需输入 Data API、Service Role 或火山 AK/SK。\n",
  );

  const feishuAnswer = await visibleQuestion(
    rl,
    "是否启用飞书 CLI 导入（命令行与前端入口，true/false）",
    existing.FEISHU_CLI_IMPORT_ENABLED || existing.FEISHU_SYNC_ENABLED || "false",
  );
  const liveProbeCompany = await visibleQuestion(
    rl,
    "真实只读诊断使用的企业名称",
    existing.LIVE_PROBE_COMPANY || "北京火山引擎科技有限公司",
  );
  writeConfiguration({
    ...existing,
    AGENT_PLAN_API_KEY: agentPlanKey,
    MODEL_API_KEY: "",
    DATAPRO_API_KEY: "",
    WEB_SEARCH_API_KEY: "",
    OPENVIKING_API_KEY: openVikingKey,
    OPENVIKING_BASE_URL: openVikingBaseUrl,
    OPENVIKING_CLI: openVikingCli,
    OPENVIKING_CLI_CONFIG: openVikingCliConfig,
    OPENVIKING_AGENT_ID: openVikingAgentId,
    SUPABASE_API_URL: existing.SUPABASE_API_URL || "",
    SUPABASE_SERVICE_ROLE_KEY: existing.SUPABASE_SERVICE_ROLE_KEY || "",
    APP_WORKSPACE_ID: existing.APP_WORKSPACE_ID || "",
    SUPABASE_WORKSPACE_ID: existing.SUPABASE_WORKSPACE_ID || "",
    SUPABASE_BRANCH_ID: existing.SUPABASE_BRANCH_ID || "",
    SUPABASE_CLI_PROFILE: existing.SUPABASE_CLI_PROFILE || "current",
    VOLCENGINE_ACCESS_KEY: existing.VOLCENGINE_ACCESS_KEY || "",
    VOLCENGINE_SECRET_KEY: existing.VOLCENGINE_SECRET_KEY || "",
    FEISHU_CLI_IMPORT_ENABLED: /^true|1|yes$/i.test(feishuAnswer) ? "true" : "false",
    FEISHU_SYNC_ENABLED: /^true|1|yes$/i.test(feishuAnswer) ? "true" : "false",
    LIVE_PROBE_COMPANY: liveProbeCompany,
  });

  process.stdout.write(`私密凭证已写入 ${paths.credentialsFile}（0600）。\n`);
  process.stdout.write(`运行配置已写入 ${paths.runtimeFile}（0600）。\n`);
  process.stdout.write("下一步运行 doctor.mjs；它只显示配置状态，不显示密钥。\n");
} finally {
  rl.close();
}
