import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createEnvReader, loadLocalEnv } from "../src/config/runtimeEnv.js";
import { createSupabaseDataProvider } from "../src/providers/supabaseDataProvider.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDir, "../..");
const env = createEnvReader();
const provider = createSupabaseDataProvider({ env });
const workspaceId = env.value("APP_WORKSPACE_ID");
const suffix = `${Date.now()}_${randomUUID().slice(0, 8)}`;
const prefix = `s2_backup_${suffix}`;
const now = new Date().toISOString();
const outputDir = resolve(repositoryRoot, "backups/private/supabase", `${prefix}_package`);
let report = null;
let primaryError = null;

const ids = {
  providerConnection: `${prefix}_provider`,
  goal: `${prefix}_goal`,
  company: `${prefix}_company`,
  job: `${prefix}_job`,
  run: `${prefix}_run`,
  step: `${prefix}_step`,
  target: `${prefix}_target`,
  search: `${prefix}_search`,
  progress: `${prefix}_progress`,
  dossier: `${prefix}_dossier`,
  citation: `${prefix}_citation`,
  material: `${prefix}_material`,
  openviking: `${prefix}_openviking`,
  syncSource: `${prefix}_sync_source`,
  checkpoint: `${prefix}_checkpoint`,
  audit: `${prefix}_audit`,
};

function assertOk(condition, message) {
  if (!condition) throw new Error(`Stage 2 backup package assertion failed: ${message}`);
}

async function insert(table, row) {
  await provider.insert(table, row, { returning: false });
}

async function remove(table, id) {
  await provider.delete(table, { workspace_id: `eq.${workspaceId}`, id: `eq.${id}` }, { returning: false });
}

if (!workspaceId || !provider.isConfigured() || !provider.isRunEnabled()) {
  throw new Error("Configured and enabled Supabase Data API access is required.");
}

try {
  await insert("provider_connections", {
    id: ids.providerConnection,
    workspace_id: workspaceId,
    provider: `backup-smoke-${suffix}`,
    status: "configured",
    secret_ref: "secret://synthetic-test-only",
    config_json: { synthetic: true },
  });
  await insert("sales_goals", {
    id: ids.goal,
    workspace_id: workspaceId,
    name: "Stage 2 backup restore smoke",
    description: "Synthetic data removed from the source after backup.",
    keywords: ["stage2", "backup"],
    payload_json: { synthetic: true },
  });
  await insert("sales_companies", {
    id: ids.company,
    workspace_id: workspaceId,
    name: `Synthetic Restore Company ${suffix}`,
    initial: "S",
    industry: "automated_test",
    location: "test",
    tags: ["stage2", "backup"],
    payload_json: { synthetic: true },
  });
  await insert("jobs", {
    id: ids.job,
    workspace_id: workspaceId,
    job_type: "backup_restore_smoke",
    status: "succeeded",
    attempt_count: 1,
    max_attempts: 1,
    started_at: now,
    finished_at: now,
    payload_json: { synthetic: true },
  });
  await insert("provider_runs", {
    id: ids.run,
    workspace_id: workspaceId,
    job_id: ids.job,
    operation: "backup_restore_smoke",
    status: "succeeded",
    app_mode: "production",
    entity_type: "company",
    entity_id: ids.company,
    started_at: now,
    finished_at: now,
    duration_ms: 1,
    payload_json: { synthetic: true },
  });
  await insert("provider_run_steps", {
    id: ids.step,
    workspace_id: workspaceId,
    provider_run_id: ids.run,
    sequence: 1,
    provider: "supabase",
    operation: "backup_restore_smoke",
    status: "succeeded",
    input_summary: "Synthetic input.",
    output_summary: "Synthetic output.",
    attempts: 1,
    started_at: now,
    finished_at: now,
    latency_ms: 1,
  });
  await insert("sales_target_enterprises", {
    id: ids.target,
    workspace_id: workspaceId,
    goal_id: ids.goal,
    company_id: ids.company,
    status: "new",
    payload_json: { synthetic: true },
  });
  await insert("sales_company_search_results", {
    id: ids.search,
    workspace_id: workspaceId,
    goal_id: ids.goal,
    company_id: ids.company,
    query: "synthetic backup restore query",
    reason: "Automated verification only.",
    payload_json: { synthetic: true },
  });
  await insert("sales_progress_snapshots", {
    id: ids.progress,
    workspace_id: workspaceId,
    company_id: ids.company,
    label: "new",
    summary: "Synthetic progress snapshot.",
    evidence: "automated_test",
    payload_json: { synthetic: true },
  });
  await insert("sales_dossier_records", {
    id: ids.dossier,
    workspace_id: workspaceId,
    company_id: ids.company,
    title: "Synthetic dossier",
    summary: "Automated restore verification.",
    memory_summary: "Synthetic only.",
    status: "completed",
    provider_run_id: ids.run,
    payload_json: { synthetic: true },
  });
  await insert("sales_dossier_citations", {
    id: ids.citation,
    workspace_id: workspaceId,
    dossier_id: ids.dossier,
    citation_no: "1",
    label: "Synthetic citation",
    source_kind: "automated_test",
    url: "",
    payload_json: { synthetic: true },
  });
  await insert("sales_materials", {
    id: ids.material,
    workspace_id: workspaceId,
    company_id: ids.company,
    title: "Synthetic material",
    source_type: "automated_test",
    content_hash: `sha256:${suffix}`,
    summary: "Synthetic only.",
    payload_json: { synthetic: true },
  });
  await insert("sales_openviking_refs", {
    id: ids.openviking,
    workspace_id: workspaceId,
    company_id: ids.company,
    related_type: "material",
    related_id: ids.material,
    ref_kind: "resource",
    uri: `viking://synthetic/${suffix}`,
    summary: "Synthetic only.",
    payload_json: { synthetic: true },
  });
  await insert("sync_sources", {
    id: ids.syncSource,
    workspace_id: workspaceId,
    source_type: "automated_test",
    external_id: suffix,
    display_name: "Synthetic sync source",
    status: "active",
    config_json: { synthetic: true },
  });
  await insert("sync_checkpoints", {
    id: ids.checkpoint,
    workspace_id: workspaceId,
    source_id: ids.syncSource,
    checkpoint_key: "cursor",
    checkpoint_value: "synthetic-cursor",
    content_hash: `sha256:${suffix}`,
    last_success_at: now,
  });
  await insert("audit_events", {
    id: ids.audit,
    workspace_id: workspaceId,
    action: "backup_restore_smoke",
    entity_type: "company",
    entity_id: ids.company,
    after_json: { synthetic: true },
  });

  const child = spawnSync(process.execPath, [resolve(scriptDir, "backup-supabase.mjs"), "--output-dir", outputDir], {
    cwd: resolve(scriptDir, ".."),
    encoding: "utf8",
    env: { ...process.env, ...loadLocalEnv() },
  });
  if (child.status !== 0) throw new Error(child.stderr || child.stdout || "Backup child process failed.");
  const backup = JSON.parse(child.stdout.trim());
  const expectedTables = [
    "provider_connections", "sales_goals", "sales_companies", "jobs", "provider_runs",
    "provider_run_steps", "sales_target_enterprises", "sales_company_search_results",
    "sales_progress_snapshots", "sales_dossier_records", "sales_dossier_citations",
    "sales_materials", "sales_openviking_refs", "sync_sources",
    "sync_checkpoints", "audit_events",
  ];
  for (const table of expectedTables) {
    assertOk(backup.row_counts?.[table] >= 1, `backup did not capture ${table}`);
  }
  report = {
    ok: true,
    test_run: suffix,
    backup_id: backup.backup_id,
    output_dir: backup.output_dir,
    verified_nonempty_tables: expectedTables,
    checksums_verified: backup.checksums_verified === true,
  };
} catch (error) {
  primaryError = error;
  throw error;
} finally {
  const cleanupTasks = [
    () => remove("provider_connections", ids.providerConnection),
    () => remove("audit_events", ids.audit),
    () => remove("sales_goals", ids.goal),
    () => remove("sales_companies", ids.company),
    () => remove("jobs", ids.job),
    () => remove("sync_sources", ids.syncSource),
  ];
  for (const cleanup of cleanupTasks) {
    try {
      await cleanup();
    } catch (error) {
      if (!primaryError) throw error;
      console.error(`Cleanup warning: ${error.message}`);
    }
  }
  const remaining = await provider.select("sales_companies", {
    select: "id",
    filters: { workspace_id: `eq.${workspaceId}`, id: `eq.${ids.company}` },
    limit: 1,
  });
  assertOk(remaining.length === 0, "synthetic source data was not cleaned up");
  if (report) report.source_cleanup_verified = true;
}

console.log(JSON.stringify(report, null, 2));
