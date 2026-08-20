import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createEnvReader } from "../src/config/runtimeEnv.js";
import { createSupabaseProvider } from "../src/providers/supabaseProvider.js";

const rootDir = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const migrationsDir = resolve(rootDir, "supabase/migrations");
const shouldApply = process.argv.includes("--apply");
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
  throw new Error("Supabase CLI persistence is not configured. Check AK/SK, SUPABASE_WORKSPACE_ID and SUPABASE_CLI_BIN.");
}

const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort();

const tableCheck = provider.executeSqlSync("select to_regclass('public.schema_migrations') as migration_table;");
if (!tableCheck.ok) throw new Error(tableCheck.error?.message || "Unable to inspect Supabase migrations.");

let applied = new Set();
if (tableCheck.rows?.[0]?.migration_table) {
  const result = provider.executeSqlSync("select version from public.schema_migrations order by version;");
  if (!result.ok) throw new Error(result.error?.message || "Unable to read Supabase migrations.");
  applied = new Set((result.rows || []).map((row) => String(row.version)));
}

const pending = migrationFiles.filter((name) => !applied.has(name.split("_")[0]));
if (!shouldApply) {
  console.log(JSON.stringify({ ok: pending.length === 0, applied: [...applied], pending }, null, 2));
  if (pending.length) process.exitCode = 1;
} else {
  for (const name of pending) {
    const sql = readFileSync(resolve(migrationsDir, name), "utf8");
    const result = provider.executeSqlSync(sql);
    if (!result.ok) throw new Error(`${name}: ${result.error?.message || "migration failed"}`);
    console.log(`applied ${name}`);
  }
  const verify = provider.executeSqlSync("select version, description, applied_at from public.schema_migrations order by version;");
  if (!verify.ok) throw new Error(verify.error?.message || "Unable to verify Supabase migrations.");
  console.log(JSON.stringify({ ok: true, migrations: verify.rows || [] }, null, 2));
}
