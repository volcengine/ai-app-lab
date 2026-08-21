import { randomUUID } from "node:crypto";

import { createEnvReader } from "../src/config/runtimeEnv.js";
import { createSupabaseDataProvider } from "../src/providers/supabaseDataProvider.js";
import { createSupabaseProvider } from "../src/providers/supabaseProvider.js";
import { SupabaseDataRepository } from "../src/repositories/supabaseDataRepository.js";
import {
  buildMaterialSyncIdentity,
  makeMaterialContentHash,
} from "../src/sync/materialSync.js";

const env = createEnvReader();
const adminProvider = createSupabaseProvider({ env });
const dataProvider = createSupabaseDataProvider({ env });
const workspaceId = env.value("APP_WORKSPACE_ID");
const suffix = `${Date.now()}_${randomUUID().slice(0, 8)}`;
const companyId = `s3_sync_${suffix}_company`;
const externalId = `stage3-acceptance-${suffix}`;
const identity = buildMaterialSyncIdentity(companyId, {
  title: "Stage 3 material sync acceptance",
  source: {
    type: "feishu_doc",
    external_id: externalId,
  },
});
const checkpointId = `${identity.source_id}:revision_id`;
let primaryError = null;
let report = null;

function sqlString(value) {
  if (value === null || value === undefined || value === "") return "null";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function assertOk(condition, message) {
  if (!condition) throw new Error(`Stage 3 material sync smoke assertion failed: ${message}`);
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
    name: `Stage 3 Sync Test ${suffix}`,
    initial: "S",
    industry: "automated_test",
    location: "test",
    tags: ["stage3", "material-sync"],
    progress: {
      label: "新商机",
      summary: "Stage 3 material sync acceptance.",
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

  await repository.persistSyncSource({
    id: identity.source_id,
    source_type: identity.source_type,
    external_id: identity.external_id,
    display_name: identity.display_name,
    status: "active",
    config: { format: "markdown", acceptance_test: true },
    last_synced_at: now,
    created_at: now,
    updated_at: now,
  });

  const firstContent = "Stage 3 material sync acceptance version 1.";
  const firstHash = makeMaterialContentHash({
    title: "Stage 3 material sync acceptance",
    text: firstContent,
  });
  const firstMaterial = {
    id: identity.material_id,
    company_id: companyId,
    title: "Stage 3 material sync acceptance",
    source_type: identity.source_type,
    source_url: "",
    source_id: identity.source_id,
    source_version: "1",
    content_hash: firstHash,
    summary: firstContent,
    text: firstContent,
    openviking_uri: "viking://resources/sales-workbench/stage3-acceptance/material.md",
    openviking_status: "indexed",
    last_synced_at: now,
    created_at: now,
    updated_at: now,
  };
  await repository.persistSalesMaterial(firstMaterial);
  await repository.persistSyncCheckpoint({
    id: checkpointId,
    source_id: identity.source_id,
    checkpoint_key: "revision_id",
    checkpoint_value: "1",
    content_hash: firstHash,
    last_success_at: now,
    created_at: now,
    updated_at: now,
  });

  const firstState = await repository.getSalesState();
  assertOk(firstState.sync_sources[identity.source_id]?.status === "active", "sync source was not persisted");
  assertOk(firstState.sync_checkpoints[checkpointId]?.checkpoint_value === "1", "initial checkpoint was not persisted");
  assertOk(firstState.materials[identity.material_id]?.source_id === identity.source_id, "material was not linked to its source");
  assertOk(firstState.companies[companyId]?.material_ids?.includes(identity.material_id), "company did not expose the synced material");

  const secondNow = new Date(Date.now() + 1000).toISOString();
  const secondContent = "Stage 3 material sync acceptance version 2.";
  const secondHash = makeMaterialContentHash({
    title: firstMaterial.title,
    text: secondContent,
  });
  await repository.persistSalesMaterial({
    ...firstMaterial,
    source_version: "2",
    content_hash: secondHash,
    summary: secondContent,
    text: secondContent,
    last_synced_at: secondNow,
    updated_at: secondNow,
  });
  await repository.persistSyncCheckpoint({
    id: checkpointId,
    source_id: identity.source_id,
    checkpoint_key: "revision_id",
    checkpoint_value: "2",
    content_hash: secondHash,
    last_success_at: secondNow,
    updated_at: secondNow,
  });

  const secondState = await repository.getSalesState();
  const materialRows = executeSql(`
    select count(*)::int as count
    from public.sales_materials
    where workspace_id = ${sqlString(workspaceId)}::uuid
      and company_id = ${sqlString(companyId)}
      and source_id = ${sqlString(identity.source_id)}
      and deleted_at is null;
  `);
  assertOk(Number(materialRows[0]?.count || 0) === 1, "source update created a duplicate material row");
  assertOk(secondState.materials[identity.material_id]?.source_version === "2", "material version was not updated");
  assertOk(secondState.materials[identity.material_id]?.content_hash === secondHash, "material content hash was not updated");
  assertOk(secondState.sync_checkpoints[checkpointId]?.checkpoint_value === "2", "checkpoint was not advanced");

  await repository.softDeleteSalesMaterial(identity.material_id, secondNow);
  const deletedState = await repository.getSalesState();
  assertOk(!deletedState.materials[identity.material_id], "soft-deleted material remained in business reads");

  report = {
    ok: true,
    test_run: suffix,
    verified: {
      stable_source_and_material_identity: true,
      source_material_foreign_key: true,
      checkpoint_persistence: true,
      same_row_update_without_duplicate: true,
      soft_delete_filtered_from_reads: true,
    },
  };
} catch (error) {
  primaryError = error;
  throw error;
} finally {
  const cleanup = adminProvider.executeSqlSync(`
    delete from public.sales_companies
    where workspace_id = ${sqlString(workspaceId)}::uuid and id = ${sqlString(companyId)};
    delete from public.sync_sources
    where workspace_id = ${sqlString(workspaceId)}::uuid and id = ${sqlString(identity.source_id)};
  `);
  if (!cleanup.ok) {
    const cleanupError = new Error(`Stage 3 material sync smoke cleanup failed: ${cleanup.error?.message || "unknown error"}`);
    if (!primaryError) throw cleanupError;
    console.error(cleanupError.message);
  } else {
    const remaining = executeSql(`
      select
        (select count(*)::int from public.sales_companies where workspace_id = ${sqlString(workspaceId)}::uuid and id = ${sqlString(companyId)}) as companies,
        (select count(*)::int from public.sales_materials where workspace_id = ${sqlString(workspaceId)}::uuid and id = ${sqlString(identity.material_id)}) as materials,
        (select count(*)::int from public.sync_sources where workspace_id = ${sqlString(workspaceId)}::uuid and id = ${sqlString(identity.source_id)}) as sources,
        (select count(*)::int from public.sync_checkpoints where workspace_id = ${sqlString(workspaceId)}::uuid and source_id = ${sqlString(identity.source_id)}) as checkpoints;
    `)[0];
    assertOk(
      Number(remaining.companies) === 0
        && Number(remaining.materials) === 0
        && Number(remaining.sources) === 0
        && Number(remaining.checkpoints) === 0,
      "temporary material sync records were not cleaned up",
    );
    if (report) report.cleanup_verified = true;
  }
}

console.log(JSON.stringify(report, null, 2));
