import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  applicationCopyFilter,
  assertNodeVersion,
  assertApplicationSource,
  ensureDirectories,
  paths,
  processExists,
  readPid,
  readOption,
  resolveUserPath,
  run,
  sanitizedNpmEnvironment,
  serverAddress,
  waitForHealth,
} from './lib.mjs';

assertNodeVersion();
ensureDirectories();
if (processExists(readPid())) {
  throw new Error('应用正在运行。更新前请先运行 stop.mjs，数据库和历史不会被删除。');
}
if (await waitForHealth(serverAddress().url, 800)) {
  throw new Error('应用端口仍有服务响应。请先运行 stop.mjs，再执行安装或更新。');
}

const skipConfig = process.argv.includes('--skip-config');
const skipPrune = process.argv.includes('--keep-dev-dependencies');
const sourceValue = readOption('--source');
const sourceApp = sourceValue
  ? resolveUserPath(sourceValue)
  : paths.sourceApp;
const sourceState = assertApplicationSource(sourceApp);
if (path.resolve(sourceState.path) === path.resolve(paths.installedApp)) {
  throw new Error('运行时安装目录不能同时作为项目源码目录。');
}
const npmEnvironment = sanitizedNpmEnvironment();
const staging = path.join(paths.installRoot, `.app-install-${randomUUID()}`);
const backup = path.join(paths.installRoot, '.app-previous');

try {
  fs.cpSync(sourceState.path, staging, {
    recursive: true,
    force: true,
    filter: (source) => applicationCopyFilter(sourceState.path, source),
  });
  const hasLockfile = fs.existsSync(path.join(staging, 'package-lock.json'));
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', hasLockfile ? ['ci'] : ['install'], {
    cwd: staging,
    env: { ...npmEnvironment, NODE_ENV: 'development' },
  });
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'check'], {
    cwd: staging,
    env: { ...npmEnvironment, NODE_ENV: 'test' },
  });
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test'], {
    cwd: staging,
    env: { ...npmEnvironment, NODE_ENV: 'test' },
  });
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
    cwd: staging,
    env: { ...npmEnvironment, NODE_ENV: 'production' },
  });
  if (!skipPrune) {
    run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['prune', '--omit=dev'], {
      cwd: staging,
      env: { ...npmEnvironment, NODE_ENV: 'production' },
    });
  }
  fs.writeFileSync(path.join(staging, '.investment-assistant-runtime.json'), `${JSON.stringify({
    schema_version: 1,
    source_path: sourceState.path,
    installed_at: new Date().toISOString(),
  }, null, 2)}\n`, { mode: 0o600 });

  fs.rmSync(backup, { recursive: true, force: true });
  if (fs.existsSync(paths.installedApp)) fs.renameSync(paths.installedApp, backup);
  fs.renameSync(staging, paths.installedApp);
  fs.rmSync(backup, { recursive: true, force: true });
} catch (error) {
  fs.rmSync(staging, { recursive: true, force: true });
  if (!fs.existsSync(paths.installedApp) && fs.existsSync(backup)) {
    fs.renameSync(backup, paths.installedApp);
  }
  throw error;
}

process.stdout.write(`应用源码：${sourceState.path}\n`);
process.stdout.write(`应用运行时已安装到 ${paths.installedApp}\n`);
if (!skipConfig && !fs.existsSync(paths.credentialsFile)) {
  if (process.stdin.isTTY && process.stdout.isTTY) {
    run(process.execPath, [path.join(paths.skillRoot, 'scripts', 'configure.mjs')]);
  } else {
    process.stdout.write(`下一步：在交互式终端运行 node ${path.join(paths.skillRoot, 'scripts', 'configure.mjs')}\n`);
  }
}
