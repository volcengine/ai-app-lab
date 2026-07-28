import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptsDir, '..');
const repositoryApp = path.resolve(skillRoot, '..', '..', 'app');
const bundledApp = path.join(skillRoot, 'assets', 'app');
const cliErrorHandler = Symbol.for('investment-assistant.cli-error-handler');

if (!globalThis[cliErrorHandler]) {
  globalThis[cliErrorHandler] = true;
  const reportFatal = (error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`错误：${message}\n`);
    if (process.env.DEBUG && error?.stack) process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
  };
  process.on('uncaughtException', reportFatal);
  process.on('unhandledRejection', reportFatal);
}

export const paths = {
  skillRoot,
  sourceApp: fs.existsSync(path.join(repositoryApp, 'package.json'))
    ? repositoryApp
    : bundledApp,
  installRoot: path.resolve(process.env.INVESTMENT_ASSISTANT_HOME
    || path.join(os.homedir(), '.local', 'share', 'investment-assistant')),
  configDir: path.resolve(process.env.INVESTMENT_ASSISTANT_CONFIG_HOME
    || path.join(os.homedir(), '.config', 'investment-assistant')),
};

paths.installedApp = path.join(paths.installRoot, 'app');
paths.credentialsFile = process.env.INVESTMENT_ASSISTANT_CREDENTIALS_FILE
  || path.join(paths.configDir, 'credentials.env');
paths.runDir = path.join(paths.installRoot, 'run');
paths.logDir = path.join(paths.installRoot, 'logs');
paths.pidFile = path.join(paths.runDir, 'server.pid');
paths.logFile = path.join(paths.logDir, 'server.log');
Object.freeze(paths);

export function ensureDirectories() {
  fs.mkdirSync(paths.installRoot, { recursive: true, mode: 0o700 });
  fs.mkdirSync(paths.configDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(paths.runDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(paths.logDir, { recursive: true, mode: 0o700 });
}

export function parseEnvFile(filePath = paths.credentialsFile) {
  try {
    const values = {};
    for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const index = line.indexOf('=');
      const key = line.slice(0, index).trim();
      let value = line.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      }
      values[key] = value;
    }
    return values;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

export function writeCredentials(values) {
  ensureDirectories();
  const credentialKeys = new Set(['ARK_API_KEY', 'DATAPRO_API_KEY', 'WEB_SEARCH_API_KEY']);
  const extraLines = Object.entries(values)
    .filter(([key, value]) => !credentialKeys.has(key) && /^[A-Z][A-Z0-9_]*$/.test(key) && value !== '')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${JSON.stringify(String(value))}`);
  const lines = [
    '# 个人投资助手凭证。不要提交此文件。',
    `ARK_API_KEY=${JSON.stringify(values.ARK_API_KEY || '')}`,
    `DATAPRO_API_KEY=${JSON.stringify(values.DATAPRO_API_KEY || values.ARK_API_KEY || '')}`,
    `WEB_SEARCH_API_KEY=${JSON.stringify(values.WEB_SEARCH_API_KEY || '')}`,
    ...extraLines,
    '',
  ];
  fs.writeFileSync(paths.credentialsFile, lines.join('\n'), { mode: 0o600 });
  fs.chmodSync(paths.credentialsFile, 0o600);
}

export function assertNodeVersion() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 13)) {
    throw new Error(`需要 Node.js 22.13 或更高版本，当前为 ${process.versions.node}`);
  }
}

export function assertInstalledApp() {
  if (!fs.existsSync(path.join(paths.installedApp, 'package.json'))) {
    throw new Error(`尚未安装应用，请先运行 node ${path.join(paths.skillRoot, 'scripts', 'install.mjs')}`);
  }
}

export function readOption(name, args = process.argv.slice(2)) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} 缺少参数值。`);
  return value;
}

export function resolveUserPath(value) {
  if (!value) return null;
  if (value === '~') return os.homedir();
  if (value.startsWith(`~${path.sep}`)) return path.join(os.homedir(), value.slice(2));
  return path.resolve(value);
}

export function inspectApplicationSource(sourcePath) {
  const resolved = path.resolve(sourcePath);
  if (!fs.existsSync(resolved)) {
    return { path: resolved, exists: false, recognized: false };
  }
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) throw new Error(`应用源码路径不是目录：${resolved}`);
  let manifest = null;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(resolved, 'package.json'), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`应用 package.json 无法解析：${error.message}`);
  }
  const required = [
    'src/server/index.js',
    'src/web',
    'scripts/check.mjs',
    'package-lock.json',
  ];
  const recognized = manifest?.name === '@investment-assistant/app'
    && required.every((relative) => fs.existsSync(path.join(resolved, relative)));
  return {
    path: resolved,
    exists: true,
    recognized,
    manifest,
  };
}

export function assertApplicationSource(sourcePath) {
  const state = inspectApplicationSource(sourcePath);
  if (!state.exists || !state.recognized) {
    throw new Error(`不是可用的个人投资助手应用源码：${state.path}`);
  }
  return state;
}

export function applicationCopyFilter(root, source) {
  const relative = path.relative(root, source);
  if (!relative) return true;
  const segments = relative.split(path.sep);
  if (segments.some((segment) => ['node_modules', 'dist', '.git', 'coverage', 'data'].includes(segment))) {
    return false;
  }
  const name = path.basename(source);
  if (name === '.DS_Store') return false;
  if (name === '.env') return false;
  if (name.startsWith('.env.') && name !== '.env.example') return false;
  return !/\.(?:sqlite(?:-shm|-wal)?|log|pid)$/i.test(name);
}

export function sanitizedNpmEnvironment(environment = process.env) {
  const sanitized = { ...environment };
  for (const key of [
    'APP_API_TOKEN',
    'APP_DATA_DIR',
    'DATABASE_PATH',
    'ARK_API_KEY',
    'DATAPRO_API_KEY',
    'WEB_SEARCH_API_KEY',
    'INVESTMENT_ASSISTANT_CREDENTIALS_FILE',
    'INVESTMENT_ASSISTANT_CONFIG_HOME',
    'INVESTMENT_ASSISTANT_HOME',
  ]) {
    delete sanitized[key];
  }
  return sanitized;
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    stdio: options.stdio || 'inherit',
    encoding: options.encoding,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} 执行失败，退出码 ${result.status}`);
  }
  return result;
}

export function readPid() {
  try {
    const pid = Number(fs.readFileSync(paths.pidFile, 'utf8').trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export function processExists(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

export function runtimeEnvironment(overrides = {}) {
  const values = parseEnvFile();
  return {
    ...process.env,
    INVESTMENT_ASSISTANT_CREDENTIALS_FILE: paths.credentialsFile,
    APP_DATA_DIR: process.env.APP_DATA_DIR || values.APP_DATA_DIR || paths.installRoot,
    ...overrides,
  };
}

export function serverAddress() {
  const fileValues = parseEnvFile();
  const host = process.env.APP_HOST || fileValues.APP_HOST || '127.0.0.1';
  const port = Number(process.env.APP_PORT || fileValues.APP_PORT || 8788);
  const browserHost = ['0.0.0.0', '::'].includes(host) ? '127.0.0.1' : host;
  return { host, port, url: `http://${browserHost}:${port}` };
}

export function configuredCredentials() {
  const values = parseEnvFile();
  const arkKey = values.ARK_API_KEY || '';
  return {
    agent_plan_model: Boolean(arkKey),
    datapro: Boolean(values.DATAPRO_API_KEY || arkKey),
    web_search: Boolean(values.WEB_SEARCH_API_KEY || arkKey),
  };
}

export async function requestLocalApi(pathname, {
  method = 'GET',
  body,
  allowFailure = false,
} = {}) {
  const address = serverAddress();
  const values = parseEnvFile();
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (values.APP_API_TOKEN) headers.Authorization = `Bearer ${values.APP_API_TOKEN}`;

  let response;
  try {
    response = await fetch(`${address.url}${pathname.startsWith('/') ? pathname : `/${pathname}`}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(`无法连接个人投资助手 ${address.url}：${error.message}`);
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = text; }
  }
  if (!response.ok && !allowFailure) {
    const message = payload?.error?.message || `HTTP ${response.status}`;
    const code = payload?.error?.code ? `（${payload.error.code}）` : '';
    throw new Error(`本地 API 请求失败${code}：${message}`);
  }
  return { ok: response.ok, status: response.status, body: payload };
}

export async function waitForHealth(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/health/live`);
      if (response.ok) return true;
    } catch {
      // The process may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}
