import fs from 'node:fs';
import { spawn } from 'node:child_process';
import {
  assertInstalledApp,
  ensureDirectories,
  paths,
  processExists,
  readPid,
  runtimeEnvironment,
  serverAddress,
  waitForHealth,
} from './lib.mjs';

assertInstalledApp();
ensureDirectories();

const address = serverAddress();
const existingPid = readPid();
if (processExists(existingPid)) {
  if (await waitForHealth(address.url, 1500)) {
    process.stdout.write(`个人投资助手已在运行：${address.url}\n`);
    process.exit(0);
  }
  throw new Error(`检测到仍在运行的进程 ${existingPid}，但健康检查失败。请先运行 stop.mjs。`);
}

fs.rmSync(paths.pidFile, { force: true });
if (await waitForHealth(address.url, 800)) {
  throw new Error(`端口上已有服务响应，但它不由当前 Skill 管理：${address.url}`);
}
const logFd = fs.openSync(paths.logFile, 'a', 0o600);
const child = spawn(process.execPath, ['src/server/index.js'], {
  cwd: paths.installedApp,
  detached: true,
  stdio: ['ignore', logFd, logFd],
  env: runtimeEnvironment({ NODE_ENV: 'production' }),
});
child.unref();
fs.closeSync(logFd);
fs.writeFileSync(paths.pidFile, `${child.pid}\n`, { mode: 0o600 });

if (!await waitForHealth(address.url)) {
  if (processExists(child.pid)) process.kill(child.pid, 'SIGTERM');
  fs.rmSync(paths.pidFile, { force: true });
  throw new Error(`服务未能通过健康检查，请查看 ${paths.logFile}`);
}

process.stdout.write(`个人投资助手已启动：${address.url}\n`);
process.stdout.write(`日志：${paths.logFile}\n`);
