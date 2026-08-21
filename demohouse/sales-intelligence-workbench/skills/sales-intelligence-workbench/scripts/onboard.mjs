import { spawnSync } from "node:child_process";
import path from "node:path";

import {
  assertNodeVersion,
  paths,
  run,
} from "./lib.mjs";

function usage() {
  return `
销售智能工作台安全编排

首次记录业务范围并推进安全步骤：
  node onboard.mjs \\
    --workspace-name <工作台名称> \\
    --sales-goal <销售目标> \\
    --target-scope <行业、区域或客户范围> \\
    --sources feishu_docs,feishu_chats \\
    --deployment local

继续上次搭建：
  node onboard.mjs

可选参数：
  --from-env-file <路径>   从现有私密环境文件迁移配置
  --apply-supabase --yes   用户确认后初始化指定的 Agent Plan Supabase
  --supabase-workspace-id <Workspace ID>
  --supabase-branch-id <Branch ID>
  --supabase-profile <CLI profile，默认 current>
  --apply-openviking       复用已有 Agent Plan OpenViking 记忆库
  --openviking-resource-id <ov-资源ID>
  --openviking-collection-name <英文名称>  不存在时与 --yes 一起创建
  --confirm-live           用户知情后执行会产生少量用量的真实诊断

说明：
  - 默认自动执行本地安装、配置引导和启动等可恢复步骤。
  - 遇到云资源写入、真实 Provider 调用、用户登录、飞书导入或业务验收时会暂停。
  - 用户只输入一枚 Agent Plan Key；OpenViking 与 Supabase 内部连接信息由脚本自动获取和保存。
  - 不会擅自创建、暂停或删除云资源，也不会自动执行付费业务验收。
`;
}

function parseArgs(argv) {
  const options = {
    help: false,
    applySupabase: false,
    applyOpenViking: false,
    yes: false,
    confirmLive: false,
    workspaceName: "",
    salesGoal: "",
    targetScope: "",
    sources: "",
    deployment: "",
    fromEnvFile: "",
    openVikingResourceId: "",
    openVikingCollectionName: "",
    supabaseWorkspaceId: "",
    supabaseBranchId: "",
    supabaseProfile: "",
  };
  const flags = new Map([
    ["--help", "help"],
    ["-h", "help"],
    ["--apply-supabase", "applySupabase"],
    ["--apply-openviking", "applyOpenViking"],
    ["--yes", "yes"],
    ["--confirm-live", "confirmLive"],
  ]);
  const values = new Map([
    ["--workspace-name", "workspaceName"],
    ["--sales-goal", "salesGoal"],
    ["--target-scope", "targetScope"],
    ["--sources", "sources"],
    ["--deployment", "deployment"],
    ["--from-env-file", "fromEnvFile"],
    ["--openviking-resource-id", "openVikingResourceId"],
    ["--openviking-collection-name", "openVikingCollectionName"],
    ["--supabase-workspace-id", "supabaseWorkspaceId"],
    ["--supabase-branch-id", "supabaseBranchId"],
    ["--supabase-profile", "supabaseProfile"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (flags.has(argument)) {
      options[flags.get(argument)] = true;
    } else if (values.has(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} 缺少参数值。`);
      options[values.get(argument)] = value.trim();
      index += 1;
    } else {
      throw new Error(`未知参数：${argument}`);
    }
  }
  return options;
}

function readSetupReport(setupScript) {
  const result = spawnSync(process.execPath, [setupScript, "--json"], {
    env: process.env,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`无法读取搭建进度：${result.stderr.trim() || `退出码 ${result.status}`}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error("setup.mjs 未返回有效的 JSON 进度。");
  }
}

function printCheckpoint(report) {
  process.stdout.write(`\n已安全暂停在“${report.next_action.stage}”阶段。\n`);
  process.stdout.write(`原因：${report.next_action.reason}\n`);
  process.stdout.write(`下一步：${report.next_action.command}\n`);
}

assertNodeVersion();
const options = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write(usage().trimStart());
  process.exit(0);
}
if (options.applySupabase && !options.yes) {
  throw new Error("--apply-supabase 会写入目标数据库，必须同时提供 --yes。");
}
if (options.openVikingResourceId && options.openVikingCollectionName) {
  throw new Error("--openviking-resource-id 与 --openviking-collection-name 只能选择一个。");
}

const scripts = path.join(paths.skillRoot, "scripts");
const setupScript = path.join(scripts, "setup.mjs");
const hasBriefArguments = [
  options.workspaceName,
  options.salesGoal,
  options.targetScope,
  options.sources,
  options.deployment,
].some(Boolean);

if (hasBriefArguments) {
  if (!options.workspaceName || !options.salesGoal) {
    throw new Error("初始化业务范围时，--workspace-name 和 --sales-goal 必须同时提供。");
  }
  run(process.execPath, [
    setupScript,
    "--init",
    "--workspace-name", options.workspaceName,
    "--sales-goal", options.salesGoal,
    "--target-scope", options.targetScope,
    "--sources", options.sources || "feishu_docs,feishu_chats",
    "--deployment", options.deployment || "local",
  ]);
}

const attempted = new Set();
for (let step = 0; step < 12; step += 1) {
  const report = readSetupReport(setupScript);
  const phase = report.next_action.stage;
  process.stdout.write(
    `\n搭建进度 ${report.progress.complete}/${report.progress.total}，当前阶段：${phase}。\n`
    + `为什么做：${report.next_action.reason}\n`,
  );

  if (phase === "ready") {
    process.stdout.write(`销售智能工作台已通过阶段验收。运行地址和进程状态请查看：\n`);
    process.stdout.write(`node ${path.join(scripts, "status.mjs")}\n`);
    process.exit(0);
  }
  if (attempted.has(phase)) {
    process.stdout.write("本次操作后阶段仍未通过，请按下方提示处理具体配置或权限问题。\n");
    printCheckpoint(report);
    process.exit(0);
  }

  if (phase === "brief") {
    printCheckpoint(report);
    process.exit(0);
  }

  attempted.add(phase);
  if (phase === "app") {
    run(process.execPath, [path.join(scripts, "install.mjs")]);
    continue;
  }

  if (phase === "agent_plan") {
    if (options.fromEnvFile) {
      run(process.execPath, [
        path.join(scripts, "configure.mjs"),
        "--from-env-file", options.fromEnvFile,
      ]);
      continue;
    }
    if (process.stdin.isTTY && process.stdout.isTTY) {
      run(process.execPath, [path.join(scripts, "configure.mjs")]);
      continue;
    }
    printCheckpoint(report);
    process.exit(0);
  }

  if (phase === "openviking") {
    const openVikingScript = path.join(scripts, "setup-openviking.mjs");
    if (options.applyOpenViking) {
      const argumentsList = [openVikingScript, "--apply"];
      if (options.openVikingResourceId) {
        argumentsList.push("--resource-id", options.openVikingResourceId);
      }
      if (options.openVikingCollectionName) {
        argumentsList.push("--collection-name", options.openVikingCollectionName);
      }
      if (options.yes) argumentsList.push("--yes");
      run(process.execPath, argumentsList);
      continue;
    }
    run(process.execPath, [openVikingScript]);
    printCheckpoint(report);
    process.stdout.write(
      "复用已有记忆库时追加 --apply-openviking；需要新建时再提供英文名称并追加 --yes。\n",
    );
    process.exit(0);
  }

  if (phase === "supabase") {
    if (options.applySupabase) {
      const argumentsList = [path.join(scripts, "setup-supabase.mjs"), "--apply", "--yes"];
      if (options.supabaseWorkspaceId) {
        argumentsList.push("--workspace-id", options.supabaseWorkspaceId);
      }
      if (options.supabaseBranchId) {
        argumentsList.push("--branch-id", options.supabaseBranchId);
      }
      if (options.supabaseProfile) {
        argumentsList.push("--profile", options.supabaseProfile);
      }
      run(process.execPath, argumentsList);
      continue;
    }
    printCheckpoint(report);
    process.stdout.write("确认目标 Workspace 和持续计费影响后，再追加 --apply-supabase --yes 继续。\n");
    process.exit(0);
  }

  if (phase === "live_doctor") {
    if (options.confirmLive) {
      run(process.execPath, [path.join(scripts, "doctor.mjs"), "--live"]);
      continue;
    }
    printCheckpoint(report);
    process.stdout.write("用户知情同意少量 Agent Plan 外部能力用量后，再追加 --confirm-live 继续。\n");
    process.exit(0);
  }

  if (phase === "runtime") {
    run(process.execPath, [path.join(scripts, "start.mjs")]);
    continue;
  }

  printCheckpoint(report);
  process.exit(0);
}

throw new Error("安全编排超过最大阶段数，请运行 setup.mjs 查看具体阻塞项。");
