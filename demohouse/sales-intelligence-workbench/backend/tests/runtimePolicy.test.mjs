import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimePolicy } from "../src/config/runtimePolicy.js";

function envReader(values = {}) {
  return {
    value(name, fallback = "") {
      return Object.hasOwn(values, name) ? values[name] : fallback;
    },
    hasAny(names) {
      return names.some((name) => Boolean(this.value(name)));
    },
    hasAll(names) {
      return names.every((name) => Boolean(this.value(name)));
    },
  };
}

const readyConfiguration = Object.freeze({
  REPOSITORY_MODE: "supabase",
  SUPABASE_READ_ONLY: "false",
  SUPABASE_API_URL: "https://supabase.example.test",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  APP_WORKSPACE_ID: "54768bef-53aa-47d0-a9e3-bbca4593cf58",
  HTTP_AUTH_ENABLED: "true",
  AGENT_PLAN_API_KEY: "test-key",
  DATAPRO_RUN_ENABLED: "true",
  WEB_SEARCH_RUN_ENABLED: "true",
  MODEL_RUN_ENABLED: "true",
  OPENVIKING_BASE_URL: "https://openviking.example.test",
  OPENVIKING_API_KEY: "test-openviking-key",
  OPENVIKING_RUN_ENABLED: "true",
});

test("missing real storage and providers block readiness", () => {
  const policy = createRuntimePolicy({
    env: envReader({
      REPOSITORY_MODE: "memory",
    }),
  });

  assert.equal(policy.ready, false);
  assert.equal(policy.fail_closed, true);
  assert.match(policy.blockers.join(" | "), /REPOSITORY_MODE must be supabase/);
  assert.match(policy.blockers.join(" | "), /DataPro/);
  assert.match(policy.blockers.join(" | "), /web search/);
  assert.match(policy.blockers.join(" | "), /model provider/);
});

test("fully configured runtime is structurally ready", () => {
  const policy = createRuntimePolicy({ env: envReader(readyConfiguration) });
  assert.equal(policy.ready, true);
  assert.deepEqual(policy.blockers, []);
});

test("authentication and paid-workflow protections are mandatory", () => {
  const policy = createRuntimePolicy({
    env: envReader({
      ...readyConfiguration,
      HTTP_AUTH_ENABLED: "false",
      PAID_WORKFLOW_MAX_CONCURRENCY: "0",
      PAID_WORKFLOW_DAILY_LIMIT: "0",
      PAID_WORKFLOW_STALE_AFTER_SECONDS: "0",
      PAID_WORKFLOW_BUDGET_TIMEZONE: "Mars/Olympus",
    }),
  });
  const blockers = policy.blockers.join(" | ");
  assert.match(blockers, /HTTP_AUTH_ENABLED must be true/);
  assert.match(blockers, /PAID_WORKFLOW_MAX_CONCURRENCY/);
  assert.match(blockers, /PAID_WORKFLOW_DAILY_LIMIT/);
  assert.match(blockers, /PAID_WORKFLOW_STALE_AFTER_SECONDS/);
  assert.match(blockers, /PAID_WORKFLOW_BUDGET_TIMEZONE/);
});

test("the persistent worker queue and circuit breaker are mandatory", () => {
  const policy = createRuntimePolicy({
    env: envReader({
      ...readyConfiguration,
      ASYNC_JOBS_ENABLED: "false",
      JOB_WORKER_LEASE_SECONDS: "30",
      PROVIDER_CIRCUIT_BREAKER_ENABLED: "false",
      PROVIDER_CIRCUIT_BREAKER_FAILURE_THRESHOLD: "0",
      PROVIDER_CIRCUIT_BREAKER_COOLDOWN_SECONDS: "0",
    }),
  });
  const blockers = policy.blockers.join(" | ");
  assert.match(blockers, /ASYNC_JOBS_ENABLED must be true/);
  assert.match(blockers, /JOB_WORKER_LEASE_SECONDS must be at least 60/);
  assert.match(blockers, /PROVIDER_CIRCUIT_BREAKER_ENABLED must be true/);
  assert.match(blockers, /PROVIDER_CIRCUIT_BREAKER_FAILURE_THRESHOLD/);
  assert.match(blockers, /PROVIDER_CIRCUIT_BREAKER_COOLDOWN_SECONDS/);
});

test("proxied deployments require secure cookies and explicit HTTPS origins", () => {
  const unsafe = createRuntimePolicy({
    env: envReader({
      ...readyConfiguration,
      TRUST_PROXY: "true",
      AUTH_COOKIE_SECURE: "false",
      ALLOWED_ORIGINS: "http://sales.example.test",
    }),
  });
  const blockers = unsafe.blockers.join(" | ");
  assert.match(blockers, /AUTH_COOKIE_SECURE=true/);
  assert.match(blockers, /HTTPS ALLOWED_ORIGINS/);

  const safe = createRuntimePolicy({
    env: envReader({
      ...readyConfiguration,
      TRUST_PROXY: "true",
      AUTH_COOKIE_SECURE: "true",
      ALLOWED_ORIGINS: "https://sales.example.test",
    }),
  });
  assert.equal(safe.ready, true);
});
