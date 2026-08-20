import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { WORKSPACE_TABLE_SPECS, RESTORE_ORDER } from "../src/backup/supabaseBackup.js";
import { SupabaseDataRepository } from "../src/repositories/supabaseDataRepository.js";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = path.resolve(backendDir, "..");
const migration = await fs.readFile(
  path.join(rootDir, "supabase", "migrations", "202607280001_openviking_qa_boundary.sql"),
  "utf8",
);

test("OpenViking QA boundary is delivered as a non-destructive forward migration", () => {
  assert.match(migration, /rename to sales_qa_messages_legacy/i);
  assert.match(migration, /revoke all[\s\S]*?from public, anon, authenticated/i);
  assert.match(migration, /grant all[\s\S]*?to service_role/i);
  assert.match(migration, /values \('202607280001'/);
  assert.doesNotMatch(migration, /drop table|delete from|truncate/i);
});

test("Supabase backup and restore never carry legacy QA message bodies", () => {
  assert.equal(WORKSPACE_TABLE_SPECS.some(({ table }) => table === "sales_qa_messages"), false);
  assert.equal(WORKSPACE_TABLE_SPECS.some(({ table }) => table === "sales_qa_messages_legacy"), false);
  assert.equal(RESTORE_ORDER.includes("sales_qa_messages"), false);
  assert.equal(RESTORE_ORDER.includes("sales_qa_messages_legacy"), false);
});

test("Supabase Data API repository exposes no QA body persistence method", () => {
  assert.equal(Object.hasOwn(SupabaseDataRepository.prototype, "persistSalesQaMessage"), false);
});
