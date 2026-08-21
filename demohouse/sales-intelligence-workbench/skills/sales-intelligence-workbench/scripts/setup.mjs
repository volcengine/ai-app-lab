import fs from "node:fs";

import {
  commandExists,
  configurationSummary,
  ensureDirectories,
  liveDoctorEvidence,
  paths,
  processExists,
  readConfiguration,
  readPid,
  serverAddress,
  waitForHealth,
  writePrivateJson,
} from "./lib.mjs";

const ALLOWED_SOURCES = new Set([
  "feishu_docs",
  "feishu_chats",
  "none",
]);
const ALLOWED_DEPLOYMENTS = new Set(["local", "private_network"]);

function usage() {
  return `
销售智能工作台 Builder

记录已确认的业务范围：
  node setup.mjs --init \\
    --workspace-name <工作台名称> \\
    --sales-goal <销售目标> \\
    --target-scope <行业、区域或客户范围> \\
    --sources feishu_docs,feishu_chats \\
    --deployment local

查看搭建进度：
  node setup.mjs
  node setup.mjs --json

说明：
  - 本命令不创建云资源、不调用 Agent Plan 外部能力，也不产生 AFP。
  - 业务范围不包含密钥；密钥仍由 configure.mjs 隐藏输入。
  - sources 可选：feishu_docs、feishu_chats；暂不导入历史资料时使用 none。
`;
}

function parseArgs(argv) {
  const options = {
    init: false,
    json: false,
    help: false,
    workspaceName: "",
    salesGoal: "",
    targetScope: "",
    sources: "",
    deployment: "local",
  };
  const valueOptions = new Map([
    ["--workspace-name", "workspaceName"],
    ["--sales-goal", "salesGoal"],
    ["--target-scope", "targetScope"],
    ["--sources", "sources"],
    ["--deployment", "deployment"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--init") options.init = true;
    else if (argument === "--json") options.json = true;
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
  return options;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function parseSources(value) {
  const sources = [...new Set(String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean))];
  const invalid = sources.filter((item) => !ALLOWED_SOURCES.has(item));
  if (invalid.length) throw new Error(`不支持的资料来源：${invalid.join("、")}`);
  if (sources.includes("none") && sources.length > 1) {
    throw new Error("none 不能与其他资料来源同时使用。");
  }
  return sources;
}

function saveBrief(options) {
  if (!options.workspaceName) throw new Error("--workspace-name 不能为空。");
  if (!options.salesGoal) throw new Error("--sales-goal 不能为空。");
  if (!ALLOWED_DEPLOYMENTS.has(options.deployment)) {
    throw new Error("--deployment 只支持 local 或 private_network。");
  }
  const existing = readJson(paths.builderBriefFile);
  const sources = parseSources(options.sources || "feishu_docs,feishu_chats");
  const now = new Date().toISOString();
  writePrivateJson(paths.builderBriefFile, {
    schema_version: 1,
    workspace_name: options.workspaceName,
    sales_goal: options.salesGoal,
    target_scope: options.targetScope,
    source_types: sources,
    deployment: options.deployment,
    created_at: existing?.created_at || now,
    updated_at: now,
  });
}

function stage(id, label, status, detail) {
  return { id, label, status, detail };
}

function completeCount(stages) {
  return stages.filter((item) => ["complete", "skipped"].includes(item.status)).length;
}

function nextAction(stages, context) {
  const pending = stages.find((item) => item.status === "pending");
  if (!pending) {
    return {
      stage: "ready",
      reason: "真实业务链路已经通过，可以开始持续导入资料和日常使用。",
      command: `node ${paths.skillRoot}/scripts/backup.mjs`,
    };
  }
  const actions = {
    brief: {
      reason: "先确认要服务的销售目标和资料范围，后续配置才不会变成无目的安装。",
      command: `node ${paths.skillRoot}/scripts/setup.mjs --init --workspace-name "<名称>" --sales-goal "<目标>" --target-scope "<范围>" --sources feishu_docs,feishu_chats --deployment local`,
    },
    app: {
      reason: "先安装经过测试的完整前后端模板，再连接真实资源。",
      command: `node ${paths.skillRoot}/scripts/install.mjs`,
    },
    agent_plan: {
      reason: "模型、专业数据集（DataPro）、豆包搜索（联网搜索）和 Agent 记忆（OpenViking）控制面必须使用真实 Agent Plan 配置。",
      command: `node ${paths.skillRoot}/scripts/configure.mjs`,
    },
    supabase: {
      reason: "结构化业务数据必须落入北京地域的 Agent Plan Supabase Workspace。",
      command: `node ${paths.skillRoot}/scripts/setup-supabase.mjs`,
    },
    openviking: {
      reason: "历史资料和长期记忆需要初始化 Agent Plan OpenViking 记忆库；内部连接信息由脚本自动管理。",
      command: `node ${paths.skillRoot}/scripts/setup-openviking.mjs`,
    },
    feishu_cli: {
      reason: "已选择飞书资料来源，需要安装并授权用户态 lark-cli，同时启用飞书 CLI 导入。",
      command: "按 references/feishu-import.md 安装并登录 lark-cli，然后重新运行 configure.mjs。",
    },
    live_doctor: {
      reason: "配置存在不代表真实可用，需要逐项验证模型和控制台能力的数据面。",
      command: `node ${paths.skillRoot}/scripts/doctor.mjs --live`,
    },
    runtime: {
      reason: "API 和独立 Worker 都运行后，档案任务才能完整执行。",
      command: `node ${paths.skillRoot}/scripts/start.mjs`,
    },
    workbench_session: {
      reason: "先在浏览器创建首位管理员，再为 CLI 导入和验收建立用户会话。",
      command: `打开 ${context.url} 创建管理员，然后运行 node ${paths.skillRoot}/scripts/login.mjs`,
    },
    history_import: {
      reason: "Cookbook 的长期资料链路要求至少完成一次真实、授权的资料导入。",
      command: `node ${paths.skillRoot}/scripts/import-feishu.mjs --company-id <企业ID> --doc <飞书文档链接>`,
    },
    business_acceptance: {
      reason: "最后必须用获授权企业跑企业搜索、入池、档案、问答和持久化闭环。",
      command: `node ${paths.skillRoot}/scripts/verify-business-chain.mjs --goal-id <销售目标ID> --company-query <完整企业名称> --question "<验收问题>" --confirm-live`,
    },
  };
  return { stage: pending.id, ...actions[pending.id] };
}

async function buildReport() {
  const brief = readJson(paths.builderBriefFile);
  const configuration = readConfiguration();
  const summary = configurationSummary();
  const doctor = liveDoctorEvidence();
  const importReceipt = readJson(paths.historyImportReceiptFile);
  const acceptance = readJson(paths.businessAcceptanceFile);
  const installed = fs.existsSync(paths.installedApp);
  const serverRunning = processExists(readPid());
  const workerRunning = processExists(readPid(paths.workerPidFile));
  const address = serverAddress();
  const health = serverRunning ? await waitForHealth(address.url, 1_200) : false;
  const sources = Array.isArray(brief?.source_types) ? brief.source_types : [];
  const wantsFeishu = sources.some((item) => item.startsWith("feishu_"));
  const larkCliAvailable = commandExists("lark-cli");
  const planKeyReady = Boolean(configuration.AGENT_PLAN_API_KEY);

  const stages = [
    stage("brief", "确认销售场景", brief?.workspace_name && brief?.sales_goal ? "complete" : "pending",
      brief ? `${brief.workspace_name}；${brief.sales_goal}` : "尚未记录业务范围"),
    stage("app", "安装完整应用", installed ? "complete" : "pending",
      installed ? paths.installedApp : "尚未安装前后端运行时"),
    stage("agent_plan", "配置 Agent Plan 模型与能力卡片", planKeyReady && summary.model && summary.datapro && summary.web_search ? "complete" : "pending",
      planKeyReady ? "已配置统一 Agent Plan Key，权限待 live doctor 验证" : "尚未配置 Agent Plan Key"),
    stage("supabase", "连接 Agent Plan Supabase", summary.supabase_data_api && configuration.SUPABASE_WORKSPACE_ID ? "complete" : "pending",
      summary.supabase_data_api ? "Data API 已配置" : "尚未完成 Agent Plan Workspace 初始化"),
    stage("openviking", "连接 OpenViking", summary.openviking ? "complete" : "pending",
      summary.openviking
        ? `Agent Plan 记忆库已连接${configuration.OPENVIKING_COLLECTION_NAME ? `：${configuration.OPENVIKING_COLLECTION_NAME}` : ""}`
        : "尚未初始化 Agent Plan 记忆库；无需输入其他 Key"),
    stage("feishu_cli", "准备飞书资料读取", !wantsFeishu ? "skipped" : summary.feishu_sync && larkCliAvailable ? "complete" : "pending",
      !wantsFeishu ? "当前业务范围未选择飞书资料" : summary.feishu_sync && larkCliAvailable ? "lark-cli 已发现，授权状态需在首次读取时确认" : "飞书 CLI 导入未启用或找不到 lark-cli"),
    stage("live_doctor", "验证真实数据面", doctor.fresh ? "complete" : "pending",
      doctor.fresh ? "最近一次全量 live doctor 仍在有效期内" : "尚无有效的全量真实诊断"),
    stage("runtime", "启动 API 与 Worker", serverRunning && workerRunning && health ? "complete" : "pending",
      serverRunning && workerRunning && health ? address.url : "API、Worker 或健康检查未全部就绪"),
    stage("workbench_session", "建立工作台用户会话", summary.cli_session ? "complete" : "pending",
      summary.cli_session ? "CLI 用户会话已存在" : "需要先在浏览器创建管理员，再运行 login.mjs"),
    stage("history_import", "导入首批历史资料", !wantsFeishu ? "skipped" : importReceipt?.ok ? "complete" : "pending",
      !wantsFeishu ? "当前业务范围未选择飞书资料" : importReceipt?.ok ? `已完成 ${importReceipt.source_kind} 导入` : "尚无成功导入回执"),
    stage("business_acceptance", "验收真实业务闭环", acceptance?.ok ? "complete" : "pending",
      acceptance?.ok ? `已于 ${acceptance.accepted_at} 通过` : "尚未完成企业搜索、档案和资料问答验收"),
  ];

  return {
    schema_version: 1,
    checked_at: new Date().toISOString(),
    progress: {
      complete: completeCount(stages),
      total: stages.length,
    },
    brief,
    stages,
    next_action: nextAction(stages, { url: address.url }),
    paths: {
      app: paths.installedApp,
      config: paths.configDir,
      state: paths.stateDir,
    },
  };
}

function printHuman(report) {
  process.stdout.write(`销售智能工作台 Builder：${report.progress.complete}/${report.progress.total} 个阶段就绪\n`);
  for (const item of report.stages) {
    const marker = item.status === "complete" ? "[完成]" : item.status === "skipped" ? "[跳过]" : "[待办]";
    process.stdout.write(`${marker} ${item.label}：${item.detail}\n`);
  }
  process.stdout.write(`\n下一步（${report.next_action.stage}）：${report.next_action.reason}\n`);
  process.stdout.write(`${report.next_action.command}\n`);
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write(usage().trimStart());
  process.exit(0);
}
ensureDirectories();
if (options.init) saveBrief(options);
const report = await buildReport();
if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
else printHuman(report);
