import { existsSync } from "node:fs";
import { join } from "node:path";
import { createEnvReader } from "./runtimeEnv.js";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function isEnabled(value) {
  return TRUE_VALUES.has(String(value || "").trim().toLowerCase());
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function validTimeZone(value) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function parseAbsoluteUrl(value) {
  try {
    return new URL(String(value || "").trim());
  } catch {
    return null;
  }
}

function parseOrigins(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map(parseAbsoluteUrl);
}

export function createRuntimePolicy(options = {}) {
  const env = options.env || createEnvReader();
  const repositoryMode = String(env.value("REPOSITORY_MODE", "supabase")).trim().toLowerCase();
  const providerRuns = {
    datapro: isEnabled(env.value("DATAPRO_RUN_ENABLED", "false")),
    web_search: isEnabled(env.value("WEB_SEARCH_RUN_ENABLED", "false")),
    model: isEnabled(env.value("MODEL_RUN_ENABLED", "false")),
    openviking: isEnabled(env.value("OPENVIKING_RUN_ENABLED", "false")),
  };
  const blockers = [];
  const httpAuthEnabled = isEnabled(env.value("HTTP_AUTH_ENABLED", "true"));
  const paidWorkflowLimits = Object.freeze({
    max_concurrent: positiveInteger(env.value("PAID_WORKFLOW_MAX_CONCURRENCY", "2"), 0),
    daily_limit: positiveInteger(env.value("PAID_WORKFLOW_DAILY_LIMIT", "100"), 0),
    timezone: String(env.value("PAID_WORKFLOW_BUDGET_TIMEZONE", "Asia/Shanghai") || "").trim(),
    stale_after_seconds: positiveInteger(env.value("PAID_WORKFLOW_STALE_AFTER_SECONDS", "1800"), 0),
  });
  const asyncJobsEnabled = isEnabled(env.value("ASYNC_JOBS_ENABLED", "true"));
  const providerCircuitBreaker = Object.freeze({
    enabled: isEnabled(env.value("PROVIDER_CIRCUIT_BREAKER_ENABLED", "true")),
    failure_threshold: positiveInteger(env.value("PROVIDER_CIRCUIT_BREAKER_FAILURE_THRESHOLD", "5"), 0),
    cooldown_seconds: positiveInteger(env.value("PROVIDER_CIRCUIT_BREAKER_COOLDOWN_SECONDS", "60"), 0),
  });

  if (repositoryMode !== "supabase") blockers.push("REPOSITORY_MODE must be supabase");
  if (isEnabled(env.value("SUPABASE_READ_ONLY", "false"))) blockers.push("SUPABASE_READ_ONLY must be false");
  if (!env.hasAll(["SUPABASE_API_URL", "SUPABASE_SERVICE_ROLE_KEY", "APP_WORKSPACE_ID"])) {
    blockers.push("Supabase Data API configuration is incomplete");
  }
  if (!httpAuthEnabled) blockers.push("HTTP_AUTH_ENABLED must be true");
  if (!paidWorkflowLimits.max_concurrent) blockers.push("PAID_WORKFLOW_MAX_CONCURRENCY must be greater than 0");
  if (!paidWorkflowLimits.daily_limit) blockers.push("PAID_WORKFLOW_DAILY_LIMIT must be greater than 0");
  if (!paidWorkflowLimits.stale_after_seconds) blockers.push("PAID_WORKFLOW_STALE_AFTER_SECONDS must be greater than 0");
  if (!asyncJobsEnabled) blockers.push("ASYNC_JOBS_ENABLED must be true");
  if (!providerCircuitBreaker.enabled) blockers.push("PROVIDER_CIRCUIT_BREAKER_ENABLED must be true");
  if (!providerCircuitBreaker.failure_threshold) {
    blockers.push("PROVIDER_CIRCUIT_BREAKER_FAILURE_THRESHOLD must be greater than 0");
  }
  if (!providerCircuitBreaker.cooldown_seconds) {
    blockers.push("PROVIDER_CIRCUIT_BREAKER_COOLDOWN_SECONDS must be greater than 0");
  }
  if (positiveInteger(env.value("JOB_WORKER_LEASE_SECONDS", "600"), 0) < 60) {
    blockers.push("JOB_WORKER_LEASE_SECONDS must be at least 60");
  }
  if (!validTimeZone(paidWorkflowLimits.timezone)) blockers.push("PAID_WORKFLOW_BUDGET_TIMEZONE is invalid");

  const host = String(env.value("HOST", "127.0.0.1")).trim().toLowerCase();
  const loopbackOnly = ["127.0.0.1", "::1", "localhost"].includes(host);
  const trustProxy = isEnabled(env.value("TRUST_PROXY", "false"));
  const secureCookie = isEnabled(env.value("AUTH_COOKIE_SECURE", "false"));
  if ((!loopbackOnly || trustProxy) && !secureCookie) {
    blockers.push("public or proxied deployments require AUTH_COOKIE_SECURE=true");
  }
  if (trustProxy) {
    const allowedOrigins = parseOrigins(env.value("ALLOWED_ORIGINS", ""));
    if (!allowedOrigins.length || allowedOrigins.some((origin) => !origin || origin.protocol !== "https:")) {
      blockers.push("proxied deployments require explicit HTTPS ALLOWED_ORIGINS");
    }
  }

  if (!env.hasAny(["DATAPRO_API_KEY", "AGENT_PLAN_API_KEY"]) || !providerRuns.datapro) {
    blockers.push("an enabled DataPro provider is required");
  }
  if (!env.hasAny(["WEB_SEARCH_API_KEY", "AGENT_PLAN_API_KEY", "ASK_ECHO_SEARCH_INFINITY_API_KEY"]) || !providerRuns.web_search) {
    blockers.push("an enabled web search provider is required");
  }
  if (!env.hasAny(["MODEL_API_KEY", "AGENT_PLAN_API_KEY", "ARK_API_KEY", "VOLCENGINE_ARK_API_KEY"]) || !providerRuns.model) {
    blockers.push("an enabled model provider is required");
  }
  const openVikingCli = env.value("OPENVIKING_CLI") || (process.env.HOME ? join(process.env.HOME, "bin", "ov") : "");
  const openVikingCliConfig = env.value("OPENVIKING_CLI_CONFIG")
    || (process.env.HOME ? join(process.env.HOME, ".openviking", "ovcli.conf") : "");
  const openVikingConfigured = (
    env.hasAny(["OPENVIKING_API_KEY", "OPENVIKING_BEARER_TOKEN"])
    && env.hasAny(["OPENVIKING_BASE_URL"])
  )
    || Boolean(openVikingCliConfig && existsSync(openVikingCliConfig))
    || Boolean(env.value("OPENVIKING_CLI") && openVikingCli && existsSync(openVikingCli));
  if (!openVikingConfigured || !providerRuns.openviking) {
    blockers.push("an enabled OpenViking provider is required");
  }
  return Object.freeze({
    fail_closed: true,
    repository_mode: repositoryMode,
    provider_runs: Object.freeze(providerRuns),
    paid_workflow_limits: paidWorkflowLimits,
    provider_circuit_breaker: providerCircuitBreaker,
    async_jobs_enabled: asyncJobsEnabled,
    http_auth_enabled: httpAuthEnabled,
    blockers: Object.freeze(blockers),
    ready: blockers.length === 0,
  });
}

export function publicRuntimePolicy(policy) {
  return {
    ready: policy.ready,
    fail_closed: true,
    repository_mode: policy.repository_mode,
    blockers: [...policy.blockers],
  };
}
