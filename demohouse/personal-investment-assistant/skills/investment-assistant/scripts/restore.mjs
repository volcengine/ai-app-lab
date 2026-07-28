import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  assertNodeVersion,
  ensureDirectories,
  parseEnvFile,
  paths,
  processExists,
  readPid,
} from './lib.mjs';

assertNodeVersion();
ensureDirectories();
if (processExists(readPid())) {
  throw new Error('为保证 SQLite 恢复一致性，请先运行 stop.mjs 停止服务。');
}

const sourceArgument = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
if (!sourceArgument || !process.argv.includes('--yes')) {
  throw new Error('用法：node restore.mjs <备份文件.sqlite> --yes');
}

const source = path.resolve(sourceArgument);
if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
  throw new Error(`备份文件不存在：${source}`);
}

function checkDatabase(filePath) {
  const database = new DatabaseSync(filePath, { readOnly: true });
  try {
    const result = database.prepare('PRAGMA quick_check').get();
    if (result?.quick_check !== 'ok') throw new Error(`SQLite quick_check 失败：${result?.quick_check || '未知结果'}`);
  } finally {
    database.close();
  }
}

checkDatabase(source);
const values = parseEnvFile();
const databasePath = path.resolve(values.DATABASE_PATH || path.join(paths.installRoot, 'investment-assistant.sqlite'));
if (source === databasePath) throw new Error('备份文件与当前数据库路径相同，未执行恢复。');

fs.mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 });
const backupDir = path.join(paths.installRoot, 'backups');
fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
let previousBackup = null;
if (fs.existsSync(databasePath)) {
  previousBackup = path.join(backupDir, `pre-restore-${timestamp}.sqlite`);
  fs.copyFileSync(databasePath, previousBackup);
  fs.chmodSync(previousBackup, 0o600);
}

const temporaryPath = `${databasePath}.${randomUUID()}.restore`;
try {
  fs.copyFileSync(source, temporaryPath);
  fs.chmodSync(temporaryPath, 0o600);
  checkDatabase(temporaryPath);
  fs.renameSync(temporaryPath, databasePath);
  fs.rmSync(`${databasePath}-wal`, { force: true });
  fs.rmSync(`${databasePath}-shm`, { force: true });
  checkDatabase(databasePath);
} catch (error) {
  fs.rmSync(temporaryPath, { force: true });
  throw error;
}

if (previousBackup) process.stdout.write(`恢复前数据库已备份：${previousBackup}\n`);
process.stdout.write(`数据库已从备份恢复：${source}\n`);
