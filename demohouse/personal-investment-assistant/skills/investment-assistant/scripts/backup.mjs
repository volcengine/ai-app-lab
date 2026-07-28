import fs from 'node:fs';
import path from 'node:path';
import {
  ensureDirectories,
  parseEnvFile,
  paths,
  processExists,
  readPid,
} from './lib.mjs';

ensureDirectories();
if (processExists(readPid())) {
  throw new Error('为保证 SQLite 备份一致性，请先运行 stop.mjs 停止服务。');
}

const values = parseEnvFile();
const databasePath = path.resolve(values.DATABASE_PATH || path.join(paths.installRoot, 'investment-assistant.sqlite'));
if (!fs.existsSync(databasePath)) throw new Error(`数据库不存在：${databasePath}`);

const backupDir = path.join(paths.installRoot, 'backups');
fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = path.join(backupDir, `investment-assistant-${timestamp}.sqlite`);
fs.copyFileSync(databasePath, target);
fs.chmodSync(target, 0o600);
process.stdout.write(`数据库备份已创建：${target}\n`);
