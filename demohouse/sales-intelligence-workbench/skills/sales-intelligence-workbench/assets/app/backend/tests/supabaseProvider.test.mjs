import assert from "node:assert/strict";
import test from "node:test";
import { SupabaseProvider } from "../src/providers/supabaseProvider.js";

function envReader(values = {}) {
  return {
    value(name, fallback = "") {
      return Object.hasOwn(values, name) ? values[name] : fallback;
    },
    number(name, fallback = 0) {
      const value = Number(Object.hasOwn(values, name) ? values[name] : fallback);
      return Number.isFinite(value) ? value : fallback;
    },
  };
}

const configured = {
  SUPABASE_WORKSPACE_ID: "workspace-test",
  SUPABASE_BRANCH_ID: "branch-test",
  SUPABASE_CLI_BIN: "fake-supabase-cli",
  VOLCENGINE_ACCESS_KEY: "test-access-key",
  VOLCENGINE_SECRET_KEY: "test-secret-key",
};

test("Supabase provider parses the official CLI rows envelope", async () => {
  let invocation = null;
  const provider = new SupabaseProvider({
    env: envReader({ ...configured, SUPABASE_READ_ONLY: "false" }),
    execFile: async (command, args, options) => {
      invocation = { command, args, options };
      return {
        stdout: JSON.stringify({ boundary: "test", rows: [{ answer: 42 }], warning: "" }),
        stderr: "",
      };
    },
  });

  const result = await provider.executeSql("select 42 as answer;");
  assert.equal(result.ok, true);
  assert.deepEqual(result.rows, [{ answer: 42 }]);
  assert.equal(invocation.command, "fake-supabase-cli");
  assert.ok(invocation.args.includes("workspace-test"));
  assert.ok(invocation.args.includes("branch-test"));
  assert.equal(invocation.options.env.VOLCENGINE_ACCESS_KEY, "test-access-key");
});

test("Supabase provider blocks writes locally when read-only mode is enabled", async () => {
  let called = false;
  const provider = new SupabaseProvider({
    env: envReader({ ...configured, SUPABASE_READ_ONLY: "true" }),
    execFile: async () => {
      called = true;
      return { stdout: "[]", stderr: "" };
    },
  });

  const result = await provider.executeSql("update public.sales_goals set name = 'blocked';");
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "read_only");
  assert.equal(called, false);
});
