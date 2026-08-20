import { existsSync, readFileSync } from "node:fs";

export const localEnvUrl = new URL("../../.env.local", import.meta.url);

function parseEnvValue(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function loadLocalEnv() {
  if (!existsSync(localEnvUrl)) return {};
  const content = readFileSync(localEnvUrl, "utf8");
  const env = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = parseEnvValue(line.slice(separatorIndex + 1));
    env[key] = value;
  }
  return env;
}

export function createEnvReader(localEnv = loadLocalEnv()) {
  return {
    hasLocalEnv: existsSync(localEnvUrl),
    value(name, fallback = "") {
      return process.env[name] || localEnv[name] || fallback;
    },
    number(name, fallback) {
      const value = Number(this.value(name));
      return Number.isFinite(value) ? value : fallback;
    },
    source(name) {
      if (process.env[name]) return "process.env";
      if (localEnv[name]) return "backend/.env.local";
      return null;
    },
    sources(names) {
      return names.map((name) => this.source(name)).filter(Boolean);
    },
    hasAny(names) {
      return names.some((name) => Boolean(this.value(name)));
    },
    hasAll(names) {
      return names.every((name) => Boolean(this.value(name)));
    },
  };
}

