import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";

export const BACKUP_FORMAT_VERSION = 1;

export const WORKSPACE_TABLE_SPECS = [
  { table: "app_workspace_members", order: "user_id.asc", onConflict: "workspace_id,user_id", authBound: true },
  { table: "provider_connections", order: "id.asc", onConflict: "id" },
  { table: "sales_goals", order: "id.asc", onConflict: "id" },
  { table: "sales_companies", order: "id.asc", onConflict: "id" },
  { table: "jobs", order: "id.asc", onConflict: "id" },
  { table: "provider_runs", order: "id.asc", onConflict: "id" },
  { table: "provider_run_steps", order: "id.asc", onConflict: "id" },
  { table: "sales_target_enterprises", order: "id.asc", onConflict: "id" },
  { table: "sales_company_search_results", order: "id.asc", onConflict: "id" },
  { table: "sales_progress_snapshots", order: "id.asc", onConflict: "id" },
  { table: "sales_dossier_records", order: "id.asc", onConflict: "id" },
  { table: "sales_dossier_citations", order: "id.asc", onConflict: "id" },
  { table: "sales_materials", order: "id.asc", onConflict: "id" },
  { table: "sales_openviking_refs", order: "id.asc", onConflict: "id" },
  { table: "sync_sources", order: "id.asc", onConflict: "id" },
  { table: "sync_checkpoints", order: "id.asc", onConflict: "id" },
  { table: "audit_events", order: "id.asc", onConflict: "id" },
];

export const RESTORE_ORDER = [
  "provider_connections",
  "sales_goals",
  "sales_companies",
  "jobs",
  "provider_runs",
  "provider_run_steps",
  "sales_target_enterprises",
  "sales_company_search_results",
  "sales_progress_snapshots",
  "sales_dossier_records",
  "sales_dossier_citations",
  "sales_materials",
  "sales_openviking_refs",
  "sync_sources",
  "sync_checkpoints",
  "audit_events",
];

const USER_REFERENCE_FIELDS = ["created_by", "updated_by", "actor_user_id"];

export function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function prepareRowsForRestore(table, rows, targetWorkspaceId) {
  if (["app_users", "app_workspace_members"].includes(table)) return [];

  return rows.map((sourceRow) => {
    const row = structuredClone(sourceRow);
    if (table === "app_workspaces") {
      row.id = targetWorkspaceId;
    } else if (Object.hasOwn(row, "workspace_id")) {
      row.workspace_id = targetWorkspaceId;
    }

    for (const field of USER_REFERENCE_FIELDS) {
      if (Object.hasOwn(row, field)) row[field] = null;
    }
    if (table === "sales_companies") delete row.normalized_name;
    if (table === "provider_connections") {
      row.secret_ref = null;
      row.status = "needs_reconfiguration";
    }
    return row;
  });
}

export function validateBackupPackage(backupDir, manifest, data) {
  if (manifest.format_version !== BACKUP_FORMAT_VERSION || data.format_version !== BACKUP_FORMAT_VERSION) {
    throw new Error(`Unsupported backup format. Expected version ${BACKUP_FORMAT_VERSION}.`);
  }
  if (manifest.backup_id !== data.backup_id) throw new Error("Backup manifest and data identifiers do not match.");

  for (const [table, expected] of Object.entries(manifest.row_counts || {})) {
    const actual = Array.isArray(data.tables?.[table]) ? data.tables[table].length : -1;
    if (actual !== expected) throw new Error(`Backup row count mismatch for ${table}: expected ${expected}, got ${actual}.`);
  }

  const root = resolve(backupDir);
  for (const file of manifest.files || []) {
    const filePath = resolve(root, file.path);
    if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
      throw new Error(`Backup manifest contains an unsafe path: ${file.path}.`);
    }
    const actualHash = sha256File(filePath);
    if (actualHash !== file.sha256) throw new Error(`Backup checksum mismatch for ${file.path}.`);
  }
  return true;
}

export function tableSpec(table) {
  return WORKSPACE_TABLE_SPECS.find((entry) => entry.table === table) || null;
}
