import fs from "node:fs";
import path from "node:path";
import {
  assertInstalledApp,
  commandExists,
  configurationSummary,
  credentialFileIsPrivate,
  paths,
  readConfiguration,
  run,
  runtimeEnvironment,
  writePrivateJson,
} from "./lib.mjs";

assertInstalledApp();
const live = process.argv.includes("--live");
const onlyProviderIndex = process.argv.indexOf("--only-provider");
const onlyProvider = onlyProviderIndex >= 0 ? String(process.argv[onlyProviderIndex + 1] || "").trim() : "";
const configuration = readConfiguration();
const summary = configurationSummary();
const localBlockers = [];
const localWarnings = [];

if (!fs.existsSync(paths.credentialsFile)) localBlockers.push("credentials.env 不存在");
if (!fs.existsSync(paths.runtimeFile)) localBlockers.push("runtime.env 不存在");
if (fs.existsSync(paths.credentialsFile) && !credentialFileIsPrivate()) {
  localBlockers.push("credentials.env 权限过宽，必须为 0600");
}
if (!summary.async_jobs) {
  localBlockers.push("必须启用持久化异步任务队列");
}
if (summary.worker_lease_seconds < 60) {
  localBlockers.push("Worker 租约必须不少于 60 秒");
}
if (summary.feishu_sync && !commandExists("lark-cli")) localBlockers.push("已启用飞书 CLI 导入，但找不到 lark-cli");
if (!summary.feishu_sync && !commandExists("lark-cli")) localWarnings.push("飞书 CLI 导入未启用，且当前未检测到 lark-cli");

const scriptName = live ? "baseline-real-readonly.mjs" : "doctor.mjs";
const args = [path.join(paths.installedApp, "backend", "scripts", scriptName)];
if (live) args.push("--live");
if (onlyProvider) args.push("--only-provider", onlyProvider);
const result = run(process.execPath, args, {
  cwd: path.join(paths.installedApp, "backend"),
  env: runtimeEnvironment(),
  encoding: "utf8",
  stdio: "pipe",
  allowFailure: true,
});

let backendReport = null;
try {
  backendReport = JSON.parse(result.stdout || "{}");
} catch {
  localBlockers.push("后端 doctor 未返回有效 JSON");
}
if (result.status !== 0) localBlockers.push(live ? "真实只读 Provider 检查未全部通过" : "后端配置检查未通过");

const ok = localBlockers.length === 0;
const report = {
  checked_at: new Date().toISOString(),
  check_type: live ? onlyProvider ? "read_only_live_partial" : "read_only_live" : "configuration_only",
  selected_provider: onlyProvider || null,
  ok,
  local: {
    installed_app: paths.installedApp,
    configuration: summary,
    warnings: localWarnings,
    blockers: localBlockers,
  },
  backend: backendReport,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (live) writePrivateJson(paths.lastDoctorFile, report);
if (live && !onlyProvider && ok && backendReport?.runtime_ready) {
  writePrivateJson(paths.liveDoctorFile, backendReport);
}
if (!ok) process.exitCode = 1;
