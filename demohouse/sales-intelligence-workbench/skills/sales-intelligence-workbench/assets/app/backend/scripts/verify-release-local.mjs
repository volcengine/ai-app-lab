import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(scriptDir, "..");
const projectRoot = path.resolve(backendDir, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const steps = [
  {
    name: "前端 JavaScript 语法",
    command: process.execPath,
    args: ["--check", "frontend/app.js"],
    cwd: projectRoot,
  },
  {
    name: "前端文本格式化语法",
    command: process.execPath,
    args: ["--check", "frontend/text-format.js"],
    cwd: projectRoot,
  },
  {
    name: "后端自动化测试",
    command: npmCommand,
    args: ["test"],
    cwd: backendDir,
  },
  {
    name: "发布密钥扫描",
    command: npmCommand,
    args: ["run", "release:secrets"],
    cwd: backendDir,
  },
  {
    name: "Skill 分发包一致性",
    command: process.execPath,
    args: ["skills/sales-intelligence-workbench/scripts/sync-assets.mjs", "--check"],
    cwd: projectRoot,
  },
  {
    name: "Skill 隔离生命周期",
    command: process.execPath,
    args: ["skills/sales-intelligence-workbench/scripts/self-test.mjs"],
    cwd: projectRoot,
  },
];

function runStep(step, index) {
  console.log(`\n[${index + 1}/${steps.length}] ${step.name}`);
  const result = spawnSync(step.command, step.args, {
    cwd: step.cwd,
    env: {
      ...process.env,
      NO_COLOR: process.env.NO_COLOR || "1",
    },
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${step.name} 未通过（退出码 ${result.status ?? "unknown"}）。`);
  }
}

console.log("开始离线发布验收。本流程不访问外部 Provider，也不会产生 AFP。");

try {
  steps.forEach(runStep);
  console.log(`\n离线发布验收通过：${steps.length}/${steps.length} 项完成。`);
} catch (error) {
  console.error(`\n离线发布验收失败：${error?.message || String(error)}`);
  process.exitCode = 1;
}
