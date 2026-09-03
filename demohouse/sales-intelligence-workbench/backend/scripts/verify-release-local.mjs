import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(scriptDir, "..");
const projectRoot = path.resolve(backendDir, "..");

function npmInvocation(args) {
  const cli = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
  ].find((candidate) => candidate && /\.(?:c?m?js)$/i.test(candidate) && fs.existsSync(candidate));
  if (cli) return { command: process.execPath, args: [cli, ...args] };
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", ["npm", ...args].join(" ")],
    };
  }
  return { command: "npm", args };
}

const npmTest = npmInvocation(["test"]);
const npmSecretScan = npmInvocation(["run", "release:secrets"]);

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
    command: npmTest.command,
    args: npmTest.args,
    cwd: backendDir,
  },
  {
    name: "发布密钥扫描",
    command: npmSecretScan.command,
    args: npmSecretScan.args,
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
  const message = `离线发布验收失败：${error?.message || String(error)}`;
  console.error(`\n${message}`);
  if (process.env.GITHUB_ACTIONS === "true") {
    const annotation = message
      .split(projectRoot).join("<repository>")
      .replace(/%/g, "%25")
      .replace(/\r/g, "%0D")
      .replace(/\n/g, "%0A");
    process.stderr.write(`::error title=Offline release verification failure::${annotation}\n`);
  }
  process.exitCode = 1;
}
