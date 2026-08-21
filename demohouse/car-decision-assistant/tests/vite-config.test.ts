import assert from "node:assert/strict";
import test from "node:test";
import { resolveLocalWorkerVars } from "../vite.config";

const sentinel = "test-agent-plan-key-that-must-stay-server-side";

test("forwards the host Agent Plan key only to the local dev Worker", () => {
  assert.deepEqual(
    resolveLocalWorkerVars("serve", { AGENT_PLAN_API_KEY: ` ${sentinel} ` }),
    { AGENT_PLAN_API_KEY: sentinel },
  );
});

test("forwards Supabase credentials only to the local dev Worker", () => {
  assert.deepEqual(
    resolveLocalWorkerVars("serve", {
      PROJECT_STORAGE_BACKEND: "supabase",
      SUPABASE_URL: " https://example.supabase.test ",
      SUPABASE_SERVICE_ROLE_KEY: " test-service-role ",
      SUPABASE_ANON_KEY: " test-anon ",
    }),
    {
      PROJECT_STORAGE_BACKEND: "supabase",
      SUPABASE_URL: "https://example.supabase.test",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
      SUPABASE_ANON_KEY: "test-anon",
    },
  );
  assert.deepEqual(
    resolveLocalWorkerVars("build", {
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
    }),
    {},
  );
});

test("does not copy the host Agent Plan key into production build config", () => {
  assert.deepEqual(
    resolveLocalWorkerVars("build", { AGENT_PLAN_API_KEY: sentinel }),
    {},
  );
});

test("omits an unset or blank local Agent Plan key", () => {
  assert.deepEqual(resolveLocalWorkerVars("serve", {}), {});
  assert.deepEqual(
    resolveLocalWorkerVars("serve", { AGENT_PLAN_API_KEY: "   " }),
    {},
  );
});
