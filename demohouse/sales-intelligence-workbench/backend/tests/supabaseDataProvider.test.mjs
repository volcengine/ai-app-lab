import assert from "node:assert/strict";
import test from "node:test";
import { SupabaseDataProvider } from "../src/providers/supabaseDataProvider.js";

function envReader(values = {}) {
  return {
    value(name, fallback = "") {
      return Object.hasOwn(values, name) ? values[name] : fallback;
    },
    number(name, fallback) {
      const value = Number(this.value(name, fallback));
      return Number.isFinite(value) ? value : fallback;
    },
  };
}

test("Supabase live probe checks the runtime Data API without control-plane credentials", async () => {
  const calls = [];
  const provider = new SupabaseDataProvider({
    env: envReader({
      SUPABASE_API_URL: "https://database.example.test",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
      SUPABASE_RUN_ENABLED: "true",
    }),
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify([{ id: "workspace-1" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const result = await provider.probe();

  assert.deepEqual(result, { ok: true, row_count: 1 });
  assert.equal(provider.isConfigured(), true);
  assert.equal(provider.isRunEnabled(), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://database.example.test/rest/v1/app_workspaces?select=id&limit=1");
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.headers.apikey, "test-service-role");
});
