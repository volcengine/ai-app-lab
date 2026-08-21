import assert from "node:assert/strict";
import test from "node:test";
import { SupabaseDataRepository } from "../src/repositories/supabaseDataRepository.js";

const workspaceId = "54768bef-53aa-47d0-a9e3-bbca4593cf58";

function createProvider(options = {}) {
  const calls = [];
  return {
    calls,
    isConfigured: () => true,
    async select(table, query) {
      calls.push({ method: "select", table, query });
      if (table === "schema_migrations") return [{ version: "202607300001" }];
      if (table === "app_workspaces") return [{ id: workspaceId }];
      return options.select?.(table, query) || [];
    },
    async update(table, values, filters) {
      calls.push({ method: "update", table, values, filters });
      return options.update?.(table, values, filters) || [];
    },
    async insert(table, rows) {
      calls.push({ method: "insert", table, rows });
      return Array.isArray(rows) ? rows : [rows];
    },
    async rpc(name, body) {
      calls.push({ method: "rpc", name, body });
      return options.rpc?.(name, body) || { ok: true };
    },
  };
}

test("Data API state reads scope every sales table to the application workspace", async () => {
  const provider = createProvider();
  const repository = new SupabaseDataRepository({ supabaseDataProvider: provider, workspaceId });

  const state = await repository.getSalesState();
  assert.deepEqual(state, {
    goals: [],
    companies: {},
    dossiers: {},
    materials: {},
    qa_messages: {},
    sync_sources: {},
    sync_checkpoints: {},
    jobs: {},
  });

  const businessReads = provider.calls.filter((call) => call.method === "select")
    .filter((call) => !["schema_migrations", "app_workspaces"].includes(call.table));
  assert.equal(businessReads.length, 11);
  assert.ok(businessReads.every((call) => call.query.filters.workspace_id === `eq.${workspaceId}`));
  assert.equal(businessReads.some((call) => call.table === "sales_qa_messages"), false);
});

test("material sync metadata is persisted inside the application workspace", async () => {
  const provider = createProvider();
  const repository = new SupabaseDataRepository({ supabaseDataProvider: provider, workspaceId });
  const syncedAt = "2026-07-21T10:00:00.000Z";

  await repository.persistSyncSource({
    id: "sync-1",
    source_type: "feishu_doc",
    external_id: "doc-1",
    display_name: "测试文档",
    status: "active",
    last_synced_at: syncedAt,
  });
  await repository.persistSyncCheckpoint({
    id: "checkpoint-1",
    source_id: "sync-1",
    checkpoint_key: "revision_id",
    checkpoint_value: "12",
    content_hash: "hash-1",
    last_success_at: syncedAt,
  });
  await repository.persistSalesMaterial({
    id: "material-1",
    company_id: "company-1",
    title: "测试文档",
    source_id: "sync-1",
    source_version: "12",
    content_hash: "hash-1",
    last_synced_at: syncedAt,
  });

  const inserts = provider.calls.filter((call) => call.method === "insert");
  assert.deepEqual(inserts.map((call) => call.table), ["sync_sources", "sync_checkpoints", "sales_materials"]);
  assert.ok(inserts.every((call) => call.rows.workspace_id === workspaceId));
  assert.equal(inserts.at(-1).rows.source_id, "sync-1");
  assert.equal(inserts.at(-1).rows.source_version, "12");
  assert.equal(inserts.at(-1).rows.summary, "");
  assert.equal(Object.hasOwn(inserts.at(-1).rows.payload_json, "text"), false);
  assert.equal(Object.hasOwn(inserts.at(-1).rows.payload_json, "source_items"), false);
});

test("Data API upserts never update an identifier outside the application workspace", async () => {
  const provider = createProvider();
  const repository = new SupabaseDataRepository({ supabaseDataProvider: provider, workspaceId });
  const goal = {
    id: "goal-data-api",
    name: "Data API Goal",
    description: "test",
    keywords: [],
    created_at: "2026-07-21T00:00:00.000Z",
    updated_at: "2026-07-21T00:00:00.000Z",
  };

  await repository.persistSalesGoal(goal);

  const update = provider.calls.find((call) => call.method === "update" && call.table === "sales_goals");
  const insert = provider.calls.find((call) => call.method === "insert" && call.table === "sales_goals");
  assert.deepEqual(update.filters, { workspace_id: `eq.${workspaceId}`, id: "eq.goal-data-api" });
  assert.equal(insert.rows.workspace_id, workspaceId);
});

test("multi-table writes use RPCs and provider runs retain their persistent job", async () => {
  const provider = createProvider();
  const repository = new SupabaseDataRepository({ supabaseDataProvider: provider, workspaceId });
  const dossier = { id: "dossier-1", company_id: "company-1", citations: [] };
  const job = { id: "job-1", job_type: "dossier.generate", status: "running" };
  const run = { id: "run-1", job_id: job.id, operation: "test", status: "running", steps: [] };

  await repository.persistJob(job);
  await repository.persistSalesDossier(dossier);
  await repository.persistProviderRun(run);

  const rpcCalls = provider.calls.filter((call) => call.method === "rpc");
  assert.deepEqual(rpcCalls.map((call) => call.name), ["persist_sales_dossier", "persist_provider_run"]);
  assert.ok(rpcCalls.every((call) => call.body.p_workspace_id === workspaceId));
  assert.equal(rpcCalls.at(-1).body.p_run.job_id, job.id);
});

test("paid workflow reservations and releases use atomic workspace RPCs", async () => {
  const provider = createProvider({
    rpc(name, body) {
      if (name === "reserve_paid_workflow") {
        return { job: body.p_job, budget: { running: 1, used_today: 1 } };
      }
      if (name === "get_paid_workflow_usage") return { running: 0, used_today: 1 };
      return body.p_job || { ok: true };
    },
  });
  const repository = new SupabaseDataRepository({ supabaseDataProvider: provider, workspaceId });
  const candidate = { id: "job-budget", job_type: "sales_qa", status: "running", is_paid: true };
  const limits = { max_concurrent: 2, daily_limit: 50, timezone: "Asia/Shanghai", stale_after_seconds: 1800 };

  const reserved = await repository.reservePaidWorkflow(candidate, "reservation-1", limits);
  await repository.finishPaidWorkflow({ ...reserved.job, status: "succeeded" }, "reservation-1");
  const usage = await repository.getPaidWorkflowUsage("Asia/Shanghai");

  assert.equal(reserved.budget.running, 1);
  assert.equal(usage.used_today, 1);
  const calls = provider.calls.filter((call) => call.method === "rpc").slice(-3);
  assert.deepEqual(calls.map((call) => call.name), [
    "reserve_paid_workflow",
    "finish_paid_workflow",
    "get_paid_workflow_usage",
  ]);
  assert.ok(calls.every((call) => call.body.p_workspace_id === workspaceId));
});

test("asynchronous jobs enqueue, claim, heartbeat, cancel safely, release and retry through atomic RPCs", async () => {
  const provider = createProvider({
    rpc(name, body) {
      if (name === "claim_sales_job") {
        return {
          ...body,
          id: "job-async",
          job_type: "sales_dossier_generation",
          status: "running",
          stage: "starting",
          progress: 1,
          attempt_count: 1,
          max_attempts: 3,
          payload_json: { request: {} },
        };
      }
      return {
        id: "job-async",
        job_type: "sales_dossier_generation",
        status: name === "enqueue_sales_job" || name === "retry_sales_job"
          ? "queued"
          : name === "acknowledge_cancel_sales_job" ? "cancelled" : "running",
        stage: name === "enqueue_sales_job" || name === "retry_sales_job"
          ? "queued"
          : name === "request_cancel_sales_job" ? "cancelling"
            : name === "acknowledge_cancel_sales_job" ? "cancelled" : "collecting_evidence",
        progress: name === "enqueue_sales_job" || name === "retry_sales_job" ? 0 : 20,
        attempt_count: name === "enqueue_sales_job" ? 0 : 1,
        max_attempts: 3,
        payload_json: body.p_job || { request: {} },
      };
    },
  });
  const repository = new SupabaseDataRepository({ supabaseDataProvider: provider, workspaceId });
  const queued = await repository.enqueueJob({
    id: "job-async",
    job_type: "sales_dossier_generation",
    status: "queued",
    request: {},
  });
  const claimed = await repository.claimNextJob("worker-1", ["sales_dossier_generation"], 600);
  const heartbeat = await repository.heartbeatJob(claimed.id, "worker-1", "collecting_evidence", 20, 600);
  const checkpointed = await repository.saveJobCheckpoint(
    claimed.id,
    "worker-1",
    {
      dossier: {
        schema_version: 1,
        company_id: "company-1",
        evidence_collection: { completed_query_keys: ["datapro:business"] },
      },
    },
    {
      stage: "collecting_professional",
      progress: 24,
      detail: { current: 1, total: 2, message: "正在核验专业资料 1/2" },
      lease_seconds: 600,
    },
  );
  const cancelling = await repository.requestJobCancellation(claimed.id);
  const cancelled = await repository.acknowledgeJobCancellation(claimed.id, "worker-1");
  await repository.releaseJobClaim(claimed.id, "worker-1", { code: "temporary" }, { retry: true, delay_seconds: 5 });
  const retried = await repository.retryQueuedJob(claimed.id);

  assert.equal(queued.status, "queued");
  assert.equal(claimed.status, "running");
  assert.equal(heartbeat.progress, 20);
  assert.equal(checkpointed.progress, 20);
  assert.equal(cancelling.stage, "cancelling");
  assert.equal(cancelled.status, "cancelled");
  assert.equal(retried.status, "queued");
  const rpcCalls = provider.calls.filter((call) => call.method === "rpc").slice(-8);
  assert.deepEqual(rpcCalls.map((call) => call.name), [
    "enqueue_sales_job",
    "claim_sales_job",
    "heartbeat_sales_job",
    "checkpoint_sales_job",
    "request_cancel_sales_job",
    "acknowledge_cancel_sales_job",
    "release_sales_job_claim",
    "retry_sales_job",
  ]);
  assert.ok(rpcCalls.every((call) => call.body.p_workspace_id === workspaceId));
  const checkpointCall = rpcCalls.find((call) => call.name === "checkpoint_sales_job");
  assert.equal(checkpointCall.body.p_worker_id, "worker-1");
  assert.deepEqual(checkpointCall.body.p_progress_detail, {
    current: 1,
    total: 2,
    message: "正在核验专业资料 1/2",
  });
  assert.deepEqual(checkpointCall.body.p_checkpoint_patch.dossier.evidence_collection.completed_query_keys, [
    "datapro:business",
  ]);
});
