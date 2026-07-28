import fs from 'node:fs';
import path from 'node:path';
import { assertInstalledApp, requestLocalApi } from './lib.mjs';

const exchanges = new Set(['CN', 'HK', 'US']);
const scheduleDays = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} 缺少参数值。`);
  return value;
}

function nonEmptyStrings(value, field, { min = 1, max = 12, itemMax = 80 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new Error(`${field} 必须包含 ${min}-${max} 项。`);
  }
  const normalized = value.map((item) => String(item).trim());
  if (normalized.some((item) => !item || item.length > itemMax)) {
    throw new Error(`${field} 包含空值或超长内容。`);
  }
  return [...new Set(normalized)];
}

function validTimezone(value) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function normalizeMonitor(value, focus) {
  if (value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('monitor 必须是对象。');
  }
  const monitor = {};
  if (value.enabled !== undefined) {
    if (typeof value.enabled !== 'boolean') throw new Error('monitor.enabled 必须是布尔值。');
    monitor.enabled = value.enabled;
  }
  if (value.schedule_time !== undefined) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.schedule_time)) {
      throw new Error('monitor.schedule_time 必须为 HH:mm。');
    }
    monitor.schedule_time = value.schedule_time;
  }
  if (value.schedule_days !== undefined) {
    const days = nonEmptyStrings(value.schedule_days, 'monitor.schedule_days', { max: 7, itemMax: 3 });
    if (days.some((day) => !scheduleDays.has(day))) throw new Error('monitor.schedule_days 包含无效星期。');
    monitor.schedule_days = days;
  }
  if (value.timezone !== undefined) {
    if (typeof value.timezone !== 'string' || !validTimezone(value.timezone)) {
      throw new Error('monitor.timezone 必须是有效的 IANA 时区。');
    }
    monitor.timezone = value.timezone;
  }
  if (value.check_items !== undefined) {
    monitor.check_items = nonEmptyStrings(value.check_items, 'monitor.check_items');
  } else if (!focus.length) {
    throw new Error('monitor.check_items 和 focus 不能同时为空。');
  }
  return monitor;
}

function normalizeProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Profile 根节点必须是对象。');
  if (!Array.isArray(value.stocks) || value.stocks.length < 1 || value.stocks.length > 100) {
    throw new Error('Profile 必须包含 1-100 只关注标的。');
  }
  const seen = new Set();
  const stocks = value.stocks.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`stocks[${index}] 必须是对象。`);
    const name = String(item.name || '').trim();
    const code = String(item.code || '').trim();
    const exchange = String(item.exchange || 'CN').toUpperCase();
    if (!name || name.length > 80) throw new Error(`stocks[${index}].name 无效。`);
    if (!/^[A-Za-z0-9.-]{1,20}$/.test(code)) throw new Error(`stocks[${index}].code 无效。`);
    if (!exchanges.has(exchange)) throw new Error(`stocks[${index}].exchange 仅支持 CN、HK、US。`);
    const key = `${exchange}:${code.toUpperCase()}`;
    if (seen.has(key)) throw new Error(`Profile 中存在重复标的：${key}`);
    seen.add(key);
    const focus = nonEmptyStrings(item.focus, `stocks[${index}].focus`);
    return { name, code, exchange, focus, monitor: normalizeMonitor(item.monitor, focus) };
  });
  return { stocks };
}

async function upsertStock(input, existing) {
  const body = { name: input.name, code: input.code, exchange: input.exchange, focus: input.focus };
  if (existing) {
    const result = await requestLocalApi(`/api/stocks/${encodeURIComponent(existing.id)}`, {
      method: 'PUT',
      body,
    });
    return { action: 'updated', stock: result.body };
  }
  const result = await requestLocalApi('/api/stocks', { method: 'POST', body });
  return { action: 'created', stock: result.body };
}

assertInstalledApp();
const inputValue = readOption('--input');
if (!inputValue) throw new Error('请使用 --input 指定 Profile JSON 的绝对路径。');
const inputPath = path.resolve(inputValue);
const stat = fs.statSync(inputPath);
if (!stat.isFile()) throw new Error(`Profile 不是普通文件：${inputPath}`);
if ((stat.mode & 0o077) !== 0) fs.chmodSync(inputPath, 0o600);

let raw;
try { raw = JSON.parse(fs.readFileSync(inputPath, 'utf8')); } catch (error) {
  throw new Error(`无法解析 Profile JSON：${error.message}`);
}
const profile = normalizeProfile(raw);
const current = (await requestLocalApi('/api/stocks')).body.items || [];
const bySecurity = new Map(current.map((stock) => [
  `${stock.exchange}:${stock.code.toUpperCase()}`,
  stock,
]));
const summary = [];

for (const input of profile.stocks) {
  const key = `${input.exchange}:${input.code.toUpperCase()}`;
  const result = await upsertStock(input, bySecurity.get(key));
  if (input.monitor) {
    const currentSettings = (await requestLocalApi(`/api/monitor/settings/${result.stock.id}`)).body;
    await requestLocalApi(`/api/monitor/settings/${result.stock.id}`, {
      method: 'PUT',
      body: {
        enabled: input.monitor.enabled ?? currentSettings.enabled,
        schedule_time: input.monitor.schedule_time ?? currentSettings.schedule_time,
        schedule_days: input.monitor.schedule_days ?? currentSettings.schedule_days,
        timezone: input.monitor.timezone ?? currentSettings.timezone,
        check_items: input.monitor.check_items ?? input.focus,
      },
    });
  }
  summary.push({ action: result.action, name: result.stock.name, code: result.stock.code, exchange: result.stock.exchange });
}

if (process.argv.includes('--consume-profile')) fs.rmSync(inputPath, { force: true });
process.stdout.write(`${JSON.stringify({ applied: summary.length, stocks: summary }, null, 2)}\n`);
