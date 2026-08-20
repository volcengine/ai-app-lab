import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  RESTORE_ORDER,
  WORKSPACE_TABLE_SPECS,
  prepareRowsForRestore,
  tableSpec,
  validateBackupPackage,
} from "../src/backup/supabaseBackup.js";
import { createEnvReader } from "../src/config/runtimeEnv.js";
import { createSupabaseDataProvider } from "../src/providers/supabaseDataProvider.js";

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function hasFlag(name) {
  return process.argv.includes(name);
}

async function readAll(provider, table, options = {}) {
  const rows = [];
  const pageSize = 500;
  let offset = 0;
  while (true) {
    const page = await provider.select(table, {
      select: options.select || "*",
      filters: options.filters || {},
      order: options.order,
      limit: pageSize,
      offset,
    });
    if (!Array.isArray(page)) throw new Error(`Data API returned a non-array response for ${table}.`);
    rows.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

async function writeBatches(provider, table, rows, onConflict) {
  const batchSize = 200;
  for (let index = 0; index < rows.length; index += batchSize) {
    await provider.upsert(table, rows.slice(index, index + batchSize), { onConflict, returning: false });
  }
}

const backupDir = resolve(option("--backup-dir") || "");
if (!option("--backup-dir")) throw new Error("--backup-dir is required.");
const manifest = JSON.parse(readFileSync(resolve(backupDir, "manifest.json"), "utf8"));
const data = JSON.parse(readFileSync(resolve(backupDir, "data.json"), "utf8"));
validateBackupPackage(backupDir, manifest, data);

if (!hasFlag("--apply")) {
  console.log(JSON.stringify({
    ok: true,
    mode: "validate-only",
    backup_id: manifest.backup_id,
    source: manifest.source,
    required_migrations: manifest.required_migrations,
    row_counts: manifest.row_counts,
    checksums_verified: true,
    apply_command: "npm run db:restore -- --backup-dir <path> --target-workspace-id <cloud-id> --target-branch-id <branch-id> --acknowledge-target <cloud-id> --acknowledge-target-branch <branch-id> --target-app-workspace-id <app-workspace-id> --apply",
  }, null, 2));
  process.exit(0);
}

const env = createEnvReader();
const provider = createSupabaseDataProvider({ env });
const targetCloudWorkspaceId = env.value("SUPABASE_WORKSPACE_ID");
const targetBranchId = env.value("SUPABASE_BRANCH_ID");
const requestedTarget = option("--target-workspace-id");
const requestedTargetBranch = option("--target-branch-id");
const acknowledgedTarget = option("--acknowledge-target");
const acknowledgedTargetBranch = option("--acknowledge-target-branch");
const targetAppWorkspaceId = option("--target-app-workspace-id") || env.value("APP_WORKSPACE_ID");

if (!provider.isConfigured() || !provider.isRunEnabled()) {
  throw new Error("Configured and enabled target Supabase Data API access is required for restore.");
}
if (!targetCloudWorkspaceId || !targetBranchId || !targetAppWorkspaceId) {
  throw new Error("Target SUPABASE_WORKSPACE_ID, SUPABASE_BRANCH_ID, and APP_WORKSPACE_ID are required.");
}
if (requestedTarget !== targetCloudWorkspaceId || acknowledgedTarget !== targetCloudWorkspaceId) {
  throw new Error("Target confirmation failed. Both target arguments must exactly match configured SUPABASE_WORKSPACE_ID.");
}
if (requestedTargetBranch !== targetBranchId || acknowledgedTargetBranch !== targetBranchId) {
  throw new Error("Target branch confirmation failed. Both branch arguments must exactly match configured SUPABASE_BRANCH_ID.");
}
if (targetCloudWorkspaceId === manifest.source.cloud_workspace_id && targetBranchId === manifest.source.branch_id) {
  throw new Error("Restore to the source cloud workspace and branch is blocked. Configure a separate empty branch or workspace.");
}

const appliedMigrations = await readAll(provider, "schema_migrations", { order: "version.asc" });
const appliedVersions = new Set(appliedMigrations.map((entry) => entry.version));
const missingMigrations = manifest.required_migrations.filter((version) => !appliedVersions.has(version));
if (missingMigrations.length) {
  throw new Error(`Target schema is missing migrations: ${missingMigrations.join(", ")}. Run db:migrate first.`);
}

const targetWorkspaces = await provider.select("app_workspaces", { select: "id", limit: 2 });
if (targetWorkspaces.some((row) => row.id !== targetAppWorkspaceId)) {
  throw new Error("Target contains another application workspace. Restore requires a dedicated empty cloud workspace or branch.");
}
for (const spec of WORKSPACE_TABLE_SPECS) {
  const existing = await provider.select(spec.table, { select: spec.table === "app_workspace_members" ? "user_id" : "id", limit: 1 });
  if (existing.length) throw new Error(`Target table ${spec.table} is not empty. Restore was not started.`);
}

if (!targetWorkspaces.length) {
  const workspaceRows = prepareRowsForRestore("app_workspaces", data.tables.app_workspaces || [], targetAppWorkspaceId);
  if (workspaceRows.length !== 1) throw new Error("Backup does not contain exactly one application workspace.");
  workspaceRows[0].slug = env.value("APP_WORKSPACE_SLUG", workspaceRows[0].slug);
  workspaceRows[0].name = env.value("APP_WORKSPACE_NAME", workspaceRows[0].name);
  await provider.insert("app_workspaces", workspaceRows, { returning: false });
}

const restoredCounts = { app_workspaces: 1, app_users: 0, app_workspace_members: 0 };
for (const table of RESTORE_ORDER) {
  const rows = prepareRowsForRestore(table, data.tables?.[table] || [], targetAppWorkspaceId);
  if (rows.length) await writeBatches(provider, table, rows, tableSpec(table)?.onConflict || "id");
  restoredCounts[table] = rows.length;
}

for (const table of RESTORE_ORDER) {
  const spec = tableSpec(table);
  const rows = await readAll(provider, table, {
    filters: { workspace_id: `eq.${targetAppWorkspaceId}` },
    order: spec?.order,
  });
  if (rows.length !== restoredCounts[table]) {
    throw new Error(`Restore verification failed for ${table}: expected ${restoredCounts[table]}, got ${rows.length}.`);
  }
}

console.log(JSON.stringify({
  ok: true,
  mode: "applied",
  backup_id: manifest.backup_id,
  target_cloud_workspace_id: targetCloudWorkspaceId,
  target_branch_id: targetBranchId,
  target_app_workspace_id: targetAppWorkspaceId,
  restored_counts: restoredCounts,
  checksums_verified: true,
  auth_bindings_skipped: true,
  provider_secrets_require_reconfiguration: true,
}, null, 2));
