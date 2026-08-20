import { randomUUID } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BACKUP_FORMAT_VERSION,
  WORKSPACE_TABLE_SPECS,
  sha256File,
  validateBackupPackage,
} from "../src/backup/supabaseBackup.js";
import { createEnvReader } from "../src/config/runtimeEnv.js";
import { createSupabaseDataProvider } from "../src/providers/supabaseDataProvider.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDir, "../..");
const migrationsDir = resolve(repositoryRoot, "supabase/migrations");
const env = createEnvReader();
const provider = createSupabaseDataProvider({ env });
const workspaceId = env.value("APP_WORKSPACE_ID");
const cloudWorkspaceId = env.value("SUPABASE_WORKSPACE_ID");
const branchId = env.value("SUPABASE_BRANCH_ID");

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function writePrivateJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  chmodSync(filePath, 0o600);
}

async function readAll(table, options = {}) {
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

if (!provider.isConfigured() || !provider.isRunEnabled()) {
  throw new Error("Configured and enabled Supabase Data API access is required for backup.");
}
if (!workspaceId || !cloudWorkspaceId || !branchId) {
  throw new Error("APP_WORKSPACE_ID, SUPABASE_WORKSPACE_ID, and SUPABASE_BRANCH_ID are required for backup.");
}

const backupId = `supabase-${timestamp()}-${randomUUID().slice(0, 8)}`;
const outputDir = resolve(option("--output-dir") || resolve(repositoryRoot, "backups/private/supabase", backupId));
if (existsSync(outputDir)) throw new Error(`Backup directory already exists: ${outputDir}`);
mkdirSync(outputDir, { recursive: true, mode: 0o700 });
chmodSync(outputDir, 0o700);

const workspaceRows = await readAll("app_workspaces", {
  filters: { id: `eq.${workspaceId}` },
  order: "id.asc",
});
if (workspaceRows.length !== 1) throw new Error(`Expected exactly one application workspace, found ${workspaceRows.length}.`);

const tables = { app_workspaces: workspaceRows };
for (const spec of WORKSPACE_TABLE_SPECS) {
  tables[spec.table] = await readAll(spec.table, {
    filters: { workspace_id: `eq.${workspaceId}` },
    order: spec.order,
  });
}

const memberUserIds = [...new Set((tables.app_workspace_members || []).map((row) => row.user_id).filter(Boolean))];
tables.app_users = [];
for (const userId of memberUserIds) {
  const users = await readAll("app_users", { filters: { id: `eq.${userId}` }, order: "id.asc" });
  tables.app_users.push(...users);
}

const migrations = await readAll("schema_migrations", { order: "version.asc" });
const appliedVersions = new Set(migrations.map((entry) => entry.version));
const localMigrations = readdirSync(migrationsDir)
  .filter((name) => /^\d+.*\.sql$/.test(name))
  .sort();
for (const version of appliedVersions) {
  if (!localMigrations.some((name) => name.startsWith(version))) {
    throw new Error(`Applied migration ${version} is missing from the local repository.`);
  }
}

const backupMigrationsDir = resolve(outputDir, "migrations");
mkdirSync(backupMigrationsDir, { mode: 0o700 });
for (const migration of localMigrations.filter((name) => appliedVersions.has(name.slice(0, 12)))) {
  const destination = resolve(backupMigrationsDir, migration);
  copyFileSync(resolve(migrationsDir, migration), destination);
  chmodSync(destination, 0o600);
}

const exportedAt = new Date().toISOString();
const data = {
  format_version: BACKUP_FORMAT_VERSION,
  backup_id: backupId,
  exported_at: exportedAt,
  source: {
    cloud_workspace_id: cloudWorkspaceId,
    branch_id: branchId,
    app_workspace_id: workspaceId,
    app_workspace_slug: env.value("APP_WORKSPACE_SLUG"),
  },
  schema_migrations: migrations,
  tables,
};
const dataPath = resolve(outputDir, "data.json");
writePrivateJson(dataPath, data);

const files = [dataPath, ...readdirSync(backupMigrationsDir).sort().map((name) => resolve(backupMigrationsDir, name))]
  .map((filePath) => ({
    path: relative(outputDir, filePath),
    bytes: statSync(filePath).size,
    sha256: sha256File(filePath),
  }));
const rowCounts = Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, rows.length]));
const manifest = {
  format_version: BACKUP_FORMAT_VERSION,
  backup_id: backupId,
  created_at: exportedAt,
  source: data.source,
  required_migrations: migrations.map((entry) => entry.version),
  row_counts: rowCounts,
  files,
  notes: [
    "The package contains private application data and must not be committed.",
    "Authentication users and provider secret values are not backed up by this package.",
  ],
};
const manifestPath = resolve(outputDir, "manifest.json");
writePrivateJson(manifestPath, manifest);

validateBackupPackage(
  outputDir,
  JSON.parse(readFileSync(manifestPath, "utf8")),
  JSON.parse(readFileSync(dataPath, "utf8")),
);

console.log(JSON.stringify({
  ok: true,
  backup_id: backupId,
  output_dir: outputDir,
  cloud_workspace_id: cloudWorkspaceId,
  app_workspace_id: workspaceId,
  migration_count: migrations.length,
  row_counts: rowCounts,
  checksums_verified: true,
}, null, 2));
