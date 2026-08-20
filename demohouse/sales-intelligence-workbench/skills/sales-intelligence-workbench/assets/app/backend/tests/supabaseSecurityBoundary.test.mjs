import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationPath = path.join(
  root,
  "supabase",
  "migrations",
  "202607280002_secure_internal_tables.sql",
);

test("internal metadata tables are fail-closed for ordinary roles", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  assert.match(sql, /alter table public\.schema_migrations enable row level security/i);
  assert.match(sql, /revoke all on table public\.schema_migrations from public, anon, authenticated/i);
  assert.match(sql, /grant all on table public\.schema_migrations to service_role/i);
  assert.doesNotMatch(sql, /alter table public\.health_check/i);
  assert.match(sql, /values \('202607280002'/i);
  assert.doesNotMatch(sql, /\b(?:drop|truncate|delete)\b/i);
});

test("live verifier treats platform-owned health checks as a separate fail-closed boundary", () => {
  const verifier = fs.readFileSync(
    path.join(root, "backend", "scripts", "verify-supabase-security-boundary.mjs"),
    "utf8",
  );

  assert.match(verifier, /platformManagedTables = new Set\(\["health_check"\]\)/);
  assert.match(verifier, /platform_managed_tables_fail_closed/);
  assert.match(verifier, /project_public_tables_use_rls/);
});
