import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '../..');
const defaultConfigDir = path.join(os.homedir(), '.config', 'investment-assistant');
const defaultDataDir = path.join(os.homedir(), '.local', 'share', 'investment-assistant');

const booleanValue = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}, z.boolean());

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_HOST: z.string().default('127.0.0.1'),
  APP_PORT: z.coerce.number().int().min(1).max(65535).default(8788),
  WEB_ORIGIN: z.string().url().default('http://127.0.0.1:5174'),
  APP_TIMEZONE: z.string().default('Asia/Shanghai'),
  APP_DATA_DIR: z.string().optional(),
  DATABASE_PATH: z.string().optional(),
  ENABLE_SCHEDULER: booleanValue.default(true),
  APP_API_TOKEN: z.string().optional(),
  ARK_API_KEY: z.string().optional(),
  DATAPRO_API_KEY: z.string().optional(),
  WEB_SEARCH_API_KEY: z.string().optional(),
  ARK_BASE_URL: z.string().url().default('https://ark.cn-beijing.volces.com/api/plan/v3'),
  ARK_MODEL: z.string().default('doubao-seed-evolving'),
  DATAPRO_MCP_URL: z.string().url().default('https://datapro.hqd.cn-beijing.volces.com/mcp'),
  WEB_SEARCH_URL: z.string().url().default('https://open.feedcoopapi.com/search_api/web_search'),
  PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  PROVIDER_RETRY_COUNT: z.coerce.number().int().min(0).max(4).default(2),
  PROVIDER_HEALTH_TTL_MS: z.coerce.number().int().min(60000).max(86400000).default(900000),
  MODEL_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(256).max(8192).default(2600),
  REPORT_RETRY_COUNT: z.coerce.number().int().min(0).max(4).default(1),
  SEMANTIC_PREFERENCE_ENABLED: booleanValue.default(true),
});

function readEnvFile(filePath) {
  try {
    return dotenv.parse(fs.readFileSync(filePath));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

export function loadConfig(overrides = {}) {
  const configDir = overrides.INVESTMENT_ASSISTANT_CONFIG_HOME
    || process.env.INVESTMENT_ASSISTANT_CONFIG_HOME
    || defaultConfigDir;
  const installRoot = overrides.INVESTMENT_ASSISTANT_HOME
    || process.env.INVESTMENT_ASSISTANT_HOME
    || defaultDataDir;
  const credentialsFile = overrides.INVESTMENT_ASSISTANT_CREDENTIALS_FILE
    || process.env.INVESTMENT_ASSISTANT_CREDENTIALS_FILE
    || path.join(configDir, 'credentials.env');
  const fileValues = readEnvFile(credentialsFile);
  const parsed = configSchema.parse({ ...fileValues, ...process.env, ...overrides });
  const dataDir = path.resolve(parsed.APP_DATA_DIR || installRoot);
  const arkApiKey = parsed.ARK_API_KEY || '';
  const webSearchApiKey = parsed.WEB_SEARCH_API_KEY || arkApiKey || '';

  return Object.freeze({
    nodeEnv: parsed.NODE_ENV,
    host: parsed.APP_HOST,
    port: parsed.APP_PORT,
    webOrigin: parsed.WEB_ORIGIN,
    timezone: parsed.APP_TIMEZONE,
    dataDir,
    databasePath: path.resolve(parsed.DATABASE_PATH || path.join(dataDir, 'investment-assistant.sqlite')),
    schedulerEnabled: parsed.ENABLE_SCHEDULER,
    apiToken: parsed.APP_API_TOKEN || '',
    credentialsFile,
    appRoot,
    staticDir: path.join(appRoot, 'dist'),
    providerHealthPath: path.join(dataDir, 'provider-health.json'),
    providerHealthTtlMs: parsed.PROVIDER_HEALTH_TTL_MS,
    providerTimeoutMs: parsed.PROVIDER_TIMEOUT_MS,
    providerRetryCount: parsed.PROVIDER_RETRY_COUNT,
    reportRetryCount: parsed.REPORT_RETRY_COUNT,
    semanticPreferenceEnabled: parsed.SEMANTIC_PREFERENCE_ENABLED,
    ark: {
      apiKey: arkApiKey,
      baseUrl: parsed.ARK_BASE_URL.replace(/\/$/, ''),
      model: parsed.ARK_MODEL,
      maxOutputTokens: parsed.MODEL_MAX_OUTPUT_TOKENS,
    },
    dataPro: {
      apiKey: parsed.DATAPRO_API_KEY || parsed.ARK_API_KEY || '',
      url: parsed.DATAPRO_MCP_URL,
    },
    webSearch: {
      apiKey: webSearchApiKey,
      url: parsed.WEB_SEARCH_URL,
    },
  });
}

export function publicConfig(config) {
  return {
    environment: config.nodeEnv,
    timezone: config.timezone,
    scheduler_enabled: config.schedulerEnabled,
    providers: {
      model: { configured: Boolean(config.ark.apiKey), model: config.ark.model },
      datapro: { configured: Boolean(config.dataPro.apiKey) },
      web_search: { configured: Boolean(config.webSearch.apiKey) },
    },
  };
}
