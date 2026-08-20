import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createEnvReader } from "../src/config/runtimeEnv.js";
import { createSupabaseProvider } from "../src/providers/supabaseProvider.js";

const rootDir = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const baseEnv = createEnvReader();
const env = {
  ...baseEnv,
  value(name, fallback = "") {
    if (name === "SUPABASE_READ_ONLY") return "false";
    return baseEnv.value(name, fallback);
  },
};
const provider = createSupabaseProvider({ env });

if (!provider.isConfigured()) {
  throw new Error("Supabase control-plane SQL is not configured.");
}

const sql = readFileSync(
  resolve(rootDir, "supabase/tests/202607230002_paid_workflow_guard_smoke.sql"),
  "utf8",
);
const result = provider.executeSqlSync(sql);
if (!result.ok) {
  throw new Error(result.error?.message || "Paid workflow guard smoke test failed.");
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  check: "paid_workflow_guard",
  transaction: "rolled_back",
  provider_calls: 0,
}, null, 2)}\n`);
