import fs from 'node:fs';
import { paths, processExists, readPid } from './lib.mjs';

const pid = readPid();
if (!processExists(pid)) {
  fs.rmSync(paths.pidFile, { force: true });
  process.stdout.write('个人投资助手当前未运行。\n');
  process.exit(0);
}

process.kill(pid, 'SIGTERM');
const deadline = Date.now() + 10_000;
while (Date.now() < deadline && processExists(pid)) {
  await new Promise((resolve) => setTimeout(resolve, 200));
}
if (processExists(pid)) throw new Error(`进程 ${pid} 未能在 10 秒内停止。`);
fs.rmSync(paths.pidFile, { force: true });
process.stdout.write('个人投资助手已停止。\n');
