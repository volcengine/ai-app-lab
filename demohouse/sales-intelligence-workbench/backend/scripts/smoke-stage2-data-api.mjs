import { randomUUID } from "node:crypto";
import { createEnvReader } from "../src/config/runtimeEnv.js";
import { ProviderRunStore } from "../src/observability/providerRunStore.js";
import { createSupabaseDataProvider } from "../src/providers/supabaseDataProvider.js";
import { createSupabaseProvider } from "../src/providers/supabaseProvider.js";
import { SupabaseDataRepository } from "../src/repositories/supabaseDataRepository.js";

const env = createEnvReader();
const adminProvider = createSupabaseProvider({ env });
const dataProvider = createSupabaseDataProvider({ env });
const workspaceId = env.value("APP_WORKSPACE_ID");
const suffix = `${Date.now()}_${randomUUID().slice(0, 8)}`;
const companyId = `s2_data_${suffix}_company`;
const dossierId = `s2_data_${suffix}_dossier`;
const rejectedDossierId = `s2_data_${suffix}_rejected`;
let runId = "";
let primaryError = null;
let report = null;

function sqlString(value) {
  if (value === null || value === undefined || value === "") return "null";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function assertOk(condition, message) {
  if (!condition) throw new Error(`Stage 2 Data API smoke assertion failed: ${message}`);
}

function executeSql(sql) {
  const result = adminProvider.executeSqlSync(sql);
  if (!result.ok) throw new Error(result.error?.message || "Supabase SQL failed.");
  return result.rows || [];
}

if (!workspaceId) throw new Error("APP_WORKSPACE_ID is required.");
if (!dataProvider.isConfigured()) throw new Error("Supabase Data API configuration is required.");
if (!adminProvider.isConfigured() || !adminProvider.isRunEnabled() || adminProvider.readOnly) {
  throw new Error("Writable Supabase admin configuration is required for cleanup verification.");
}

const repository = new SupabaseDataRepository({
  env,
  supabaseDataProvider: dataProvider,
  workspaceId,
});

try {
  const now = new Date().toISOString();
  const company = {
    id: companyId,
    name: `Stage 2 Data API Test ${suffix}`,
    initial: "S",
    industry: "automated_test",
    location: "test",
    tags: ["stage2", "data-api"],
    progress: {
      label: "新商机",
      summary: "Data API transaction smoke test.",
      evidence: "automated_test",
      updated_at: now,
    },
    dossier_ids: [],
    material_ids: [],
    qa_session_id: `sales-${companyId}`,
    created_at: now,
    updated_at: now,
  };
  await repository.persistSalesCompany(company);

  const runStore = new ProviderRunStore({ repository, failOnPersistenceError: true });
  const run = await runStore.startRun({
    operation: "stage2_data_api_rpc_smoke",
    app_mode: "production",
    entity_type: "target_enterprise",
    entity_id: companyId,
  });
  runId = run.id;
  const step = await runStore.startStep(run.id, {
    provider: "supabase",
    operation: "transaction_rpc",
    input_summary: "Verify provider run RPC persistence.",
  });
  await runStore.finishStep(run.id, step.id, {
    ok: true,
    output_summary: "Provider run RPC persisted.",
    usage: { total_tokens: 0 },
  });
  await runStore.completeRun(run.id, { result_ref: `stage2-data-api:${suffix}` });

  const dossier = {
    id: dossierId,
    company_id: companyId,
    provider_run_id: run.id,
    title: "Stage 2 Data API Transaction Test",
    summary: "Temporary automated test record.",
    memory_summary: "Removed after validation.",
    body: [{ text: "Transactional dossier body.", citation_ids: ["1"] }],
    citations: [{ id: "1", label: "Automated test citation", source_kind: "test", url: "" }],
    created_at: now,
  };
  await repository.persistSalesDossier(dossier);

  const persistedRun = await repository.getProviderRun(run.id);
  const state = await repository.getSalesState();
  assertOk(persistedRun?.status === "succeeded", "provider run RPC did not persist the terminal state");
  assertOk(persistedRun?.steps?.length === 1, "provider run RPC did not persist its step");
  assertOk(state.dossiers[dossierId]?.citations?.length === 1, "dossier RPC did not persist its citation");
  assertOk(state.dossiers[dossierId]?.provider_run_id === run.id, "dossier RPC did not retain provider_run_id");

  let rejected = false;
  try {
    await repository.persistSalesDossier({
      ...dossier,
      id: rejectedDossierId,
      company_id: `missing-${suffix}`,
    });
  } catch (error) {
    rejected = /company was not found/i.test(error.message);
  }
  assertOk(rejected, "invalid dossier transaction was not rejected");
  const rejectedRows = executeSql(`
    select count(*)::int as count
    from public.sales_dossier_records
    where workspace_id = ${sqlString(workspaceId)}::uuid and id = ${sqlString(rejectedDossierId)};
  `);
  assertOk(Number(rejectedRows[0]?.count || 0) === 0, "rejected dossier left a partial record");

  report = {
    ok: true,
    test_run: suffix,
    verified: {
      data_api_company_write: true,
      provider_run_transaction_rpc: true,
      dossier_and_citations_transaction_rpc: true,
      provider_run_link: true,
      failed_transaction_left_no_partial_record: true,
    },
  };
} catch (error) {
  primaryError = error;
  throw error;
} finally {
  const cleanup = adminProvider.executeSqlSync(`
    delete from public.provider_runs
    where workspace_id = ${sqlString(workspaceId)}::uuid
      and (id = ${sqlString(runId)} or entity_id = ${sqlString(companyId)});
    delete from public.sales_companies
    where workspace_id = ${sqlString(workspaceId)}::uuid and id = ${sqlString(companyId)};
  `);
  if (!cleanup.ok) {
    const cleanupError = new Error(`Stage 2 Data API smoke cleanup failed: ${cleanup.error?.message || "unknown error"}`);
    if (!primaryError) throw cleanupError;
    console.error(cleanupError.message);
  } else {
    const remaining = executeSql(`
      select
        (select count(*)::int from public.sales_companies where workspace_id = ${sqlString(workspaceId)}::uuid and id = ${sqlString(companyId)}) as companies,
        (select count(*)::int from public.sales_dossier_records where workspace_id = ${sqlString(workspaceId)}::uuid and id in (${sqlString(dossierId)}, ${sqlString(rejectedDossierId)})) as dossiers,
        (select count(*)::int from public.provider_runs where workspace_id = ${sqlString(workspaceId)}::uuid and id = ${sqlString(runId)}) as runs;
    `)[0];
    assertOk(Number(remaining.companies) === 0 && Number(remaining.dossiers) === 0 && Number(remaining.runs) === 0, "temporary Data API records were not cleaned up");
    if (report) report.cleanup_verified = true;
  }
}

console.log(JSON.stringify(report, null, 2));
