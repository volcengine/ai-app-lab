import fs from "node:fs";
import { paths, processExists, readPid } from "./lib.mjs";

async function stopProcess(pidFile, label) {
  const pid = readPid(pidFile);
  if (!processExists(pid)) {
    fs.rmSync(pidFile, { force: true });
    return false;
  }
  process.kill(pid, "SIGTERM");
  const deadline = Date.now() + 35_000;
  while (Date.now() < deadline && processExists(pid)) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (processExists(pid)) {
    throw new Error(`${label}进程 ${pid} 仍在安全结束当前任务，请稍后再次运行 stop.mjs。`);
  }
  fs.rmSync(pidFile, { force: true });
  return true;
}

const workerStopped = await stopProcess(paths.workerPidFile, "Worker ");
const serverStopped = await stopProcess(paths.pidFile, "API ");
if (!workerStopped && !serverStopped) {
  process.stdout.write("销售智能工作台当前未运行。\n");
  process.exit(0);
}
process.stdout.write("销售智能工作台已停止，配置和业务数据未删除。\n");
