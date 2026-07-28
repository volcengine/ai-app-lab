import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function writeProviderHealth(config, result) {
  if (!result?.live) return;
  const payload = {
    version: 1,
    checked_at: result.completed_at,
    ok: Boolean(result.ok),
    providers: result.providers,
  };
  fs.mkdirSync(path.dirname(config.providerHealthPath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${config.providerHealthPath}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, config.providerHealthPath);
  fs.chmodSync(config.providerHealthPath, 0o600);
}

export function readProviderHealth(config, now = Date.now()) {
  try {
    const payload = JSON.parse(fs.readFileSync(config.providerHealthPath, 'utf8'));
    const checkedAt = Date.parse(payload.checked_at);
    const ageMs = now - checkedAt;
    const fresh = Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= config.providerHealthTtlMs;
    return {
      checked: true,
      fresh,
      ok: Boolean(payload.ok) && fresh,
      checked_at: payload.checked_at,
      age_ms: Number.isFinite(ageMs) ? ageMs : null,
      providers: payload.providers || {},
    };
  } catch {
    return {
      checked: false,
      fresh: false,
      ok: false,
      checked_at: null,
      age_ms: null,
      providers: {},
    };
  }
}
