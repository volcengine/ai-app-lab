import assert from "node:assert/strict";
import test from "node:test";

import { SalesService } from "../src/services/salesService.js";
import { JobWorker } from "../src/workers/jobWorker.js";

function envReader(values = {}) {
  return {
    value(name, fallback = "") {
      return Object.hasOwn(values, name) ? values[name] : fallback;
    },
  };
}

function salesState() {
  return {
    goals: [{ id: "goal-1", name: "测试目标", company_ids: ["company-1"] }],
    companies: {
      "company-1": {
        id: "company-1",
        name: "测试科技有限公司",
        dossier_ids: [],
        material_ids: [],
        qa_session_id: "sales-company-1",
      },
    },
    dossiers: {},
    materials: {},
    qa_messages: {},
    sync_sources: {},
    sync_checkpoints: {},
    jobs: {},
  };
}

const strictRuntimePolicy = Object.freeze({
  fail_closed: true,
});

const permissiveTestPolicy = Object.freeze({
  fail_closed: false,
});

test("enqueueing a dossier persists a queued job without reserving paid capacity", async () => {
  const calls = [];
  const repository = {
    async getSalesState() {
      return salesState();
    },
    async enqueueJob(job) {
      calls.push({ operation: "enqueue", job });
      return job;
    },
  };
  const paidWorkflowGuard = {
    async reserve() {
      calls.push({ operation: "reserve" });
      throw new Error("paid capacity must not be reserved while enqueueing");
    },
  };
  const service = new SalesService({
    env: envReader({ ASYNC_JOBS_ENABLED: "true", APP_WORKSPACE_ID: "workspace-test" }),
    runtimePolicy: strictRuntimePolicy,
    repository,
    paidWorkflowGuard,
  });

  await service.assertRuntimeReady();
  const job = await service.enqueueDossier("company-1", { idempotency_key: "request-1" }, {
    created_by: "11111111-1111-4111-8111-111111111111",
  });

  assert.equal(job.status, "queued");
  assert.equal(job.stage_label, "等待执行");
  assert.equal(job.progress, 0);
  assert.equal(calls.filter((call) => call.operation === "enqueue").length, 1);
  assert.equal(calls.filter((call) => call.operation === "reserve").length, 0);
  assert.equal(Object.hasOwn(job, "request"), false);
  assert.equal(Object.hasOwn(job, "created_by"), false);
  assert.equal(Object.hasOwn(job, "reservation_id"), false);
});

test("enqueueing reports a queue failure instead of returning a local-only queued job", async () => {
  const repository = {
    async getSalesState() {
      return salesState();
    },
    async enqueueJob() {
      throw new Error("rpc unavailable");
    },
  };
  const service = new SalesService({
    env: envReader({ ASYNC_JOBS_ENABLED: "true", APP_WORKSPACE_ID: "workspace-test" }),
    runtimePolicy: permissiveTestPolicy,
    repository,
  });

  await service.assertRuntimeReady();
  await assert.rejects(
    service.enqueueDossier("company-1"),
    (error) => error?.status === 503 && error?.code === "job_queue_unavailable",
  );
  assert.deepEqual(service.data.jobs, {});
});

test("public job progress exposes only a compact user-facing detail", () => {
  const service = new SalesService({
    env: envReader(),
    runtimePolicy: permissiveTestPolicy,
  });
  const job = service.publicJob({
    id: "job-progress",
    job_type: "sales_dossier_generation",
    status: "running",
    stage: "collecting_professional",
    progress: 34,
    progress_detail: {
      message: "正在核验专业资料 2/4",
      current: 2,
      total: 4,
      provider: "datapro",
      query: "private query",
      worker_id: "worker-private",
    },
    attempt_count: 1,
    max_attempts: 3,
  });

  assert.deepEqual(job.stage_detail, {
    message: "正在核验专业资料 2/4",
    current: 2,
    total: 4,
  });
  assert.equal(Object.hasOwn(job.stage_detail, "provider"), false);
  assert.equal(Object.hasOwn(job.stage_detail, "query"), false);
  assert.equal(Object.hasOwn(job.stage_detail, "worker_id"), false);
});

test("API service can refresh dossier data written by a separate worker process", async () => {
  let persisted = salesState();
  let reads = 0;
  const repository = {
    async getSalesState() {
      reads += 1;
      return structuredClone(persisted);
    },
  };
  const service = new SalesService({
    env: envReader({ ASYNC_JOBS_ENABLED: "true", APP_WORKSPACE_ID: "workspace-test" }),
    runtimePolicy: strictRuntimePolicy,
    repository,
  });

  await service.assertRuntimeReady();
  assert.deepEqual(service.listDossiers("company-1"), []);

  persisted = salesState();
  persisted.companies["company-1"].dossier_ids = ["dossier-worker-1"];
  persisted.dossiers["dossier-worker-1"] = {
    id: "dossier-worker-1",
    company_id: "company-1",
    title: "测试科技有限公司企业档案",
    summary: "后台 Worker 已生成并持久化最新企业档案。",
    body: [
      { text: "企业与业务概览：测试科技有限公司面向企业客户提供软件与知识库产品。", citation_ids: ["p1"] },
      { text: "经营与业务动态：专业数据反映该企业持续推进内容检索与协作管理能力。", citation_ids: ["p2"] },
      { text: "近期公开动态：测试科技有限公司于2026年7月发布知识库产品升级公告。", citation_ids: ["w1", "w2"] },
      { text: "风险与关注事项：项目推进需在商务报价前确认数据权限、合同责任和交付排期。", citation_ids: ["p1", "w2"] },
      { text: "销售机会判断：产品升级形成试点窗口，但不代表企业已经形成采购意向。", citation_ids: ["p2", "w1"] },
      { text: "建议行动：1. 联系产品负责人核验范围。\n2. 确认数据权限边界。\n3. 准备试点方案。", citation_ids: ["p1", "w2"] },
    ],
    citations: [
      {
        id: "p1",
        label: "企业工商数据库",
        source_kind: "专业数据集",
        summary: "测试科技有限公司经营企业软件与知识库产品。",
        independence_key: "datapro-business",
      },
      {
        id: "p2",
        label: "金融数据库",
        source_kind: "专业数据集",
        summary: "测试科技有限公司持续推进内容检索与协作管理业务。",
        independence_key: "datapro-market",
      },
      {
        id: "w1",
        label: "测试科技有限公司发布知识库产品升级公告",
        source_kind: "联网搜索",
        summary: "测试科技有限公司于2026年7月发布知识库产品升级公告。",
        url: "https://news.test/company-update",
        independence_key: "news.test",
      },
      {
        id: "w2",
        label: "测试科技有限公司披露产品交付安排",
        source_kind: "联网搜索",
        summary: "测试科技有限公司披露知识库产品的分阶段交付安排。",
        url: "https://official.test/company-delivery",
        independence_key: "official.test",
      },
    ],
    version_no: 1,
    change_status: "initial",
    data_as_of: "2026-07-24T00:00:00.000Z",
    generated_at: "2026-07-24T06:00:00.000Z",
    created_at: "2026-07-24T06:00:00.000Z",
  };

  await service.refreshPersistedState({ force: true });

  assert.equal(reads, 2);
  assert.equal(service.listDossiers("company-1")[0].id, "dossier-worker-1");
  assert.equal(service.dossierDetail("dossier-worker-1").version_no, 1);
});

test("worker claims one job, reports progress and executes it once", async () => {
  const calls = [];
  let claimed = false;
  let current = null;
  const repository = {
    async claimNextJob(workerId, jobTypes, leaseSeconds) {
      calls.push({ operation: "claim", workerId, jobTypes, leaseSeconds });
      if (claimed) return null;
      claimed = true;
      current = {
        id: "job-1",
        job_type: "sales_dossier_generation",
        entity_id: "company-1",
        status: "running",
        stage: "starting",
        progress: 1,
        worker_id: workerId,
      };
      return current;
    },
    async heartbeatJob(jobId, workerId, stage, progress) {
      calls.push({ operation: "heartbeat", jobId, workerId, stage, progress });
      current = { ...current, stage, progress };
      return current;
    },
    async getJob() {
      return current;
    },
    async releaseJobClaim() {
      calls.push({ operation: "release" });
    },
  };
  const salesService = {
    async assertRuntimeReady() {},
    async executeQueuedJob(job, options) {
      calls.push({ operation: "execute", job });
      await options.report_progress("generating_dossier", 70);
      current = { ...current, status: "succeeded", stage: "succeeded", progress: 100 };
      return { action: "created" };
    },
  };
  const worker = new JobWorker({
    repository,
    salesService,
    env: envReader({ JOB_WORKER_POLL_MS: "100", JOB_WORKER_LEASE_SECONDS: "600" }),
    workerId: "worker-test",
    logger: { info() {}, error() {} },
  });

  await worker.assertReady();
  const result = await worker.runOnce();

  assert.equal(result.status, "succeeded");
  assert.equal(calls.filter((call) => call.operation === "execute").length, 1);
  assert.ok(calls.some((call) => call.operation === "heartbeat" && call.stage === "generating_dossier"));
  assert.equal(calls.some((call) => call.operation === "release"), false);
});

test("worker requeues an unreserved task after a retryable claim failure", async () => {
  const calls = [];
  const job = {
    id: "job-retry",
    job_type: "sales_dossier_generation",
    entity_id: "company-1",
    status: "running",
    stage: "starting",
    progress: 1,
    worker_id: "worker-test",
  };
  const repository = {
    async claimNextJob() {
      return job;
    },
    async heartbeatJob(jobId, workerId, stage, progress) {
      return { ...job, id: jobId, worker_id: workerId, stage, progress };
    },
    async getJob() {
      return job;
    },
    async releaseJobClaim(jobId, workerId, error, options) {
      calls.push({ jobId, workerId, error, options });
      return { ...job, status: "queued" };
    },
  };
  const salesService = {
    async assertRuntimeReady() {},
    async executeQueuedJob() {
      const error = new Error("capacity reached");
      error.code = "paid_workflow_concurrency_exceeded";
      throw error;
    },
  };
  const worker = new JobWorker({
    repository,
    salesService,
    env: envReader(),
    workerId: "worker-test",
    logger: { info() {}, error() {} },
  });

  const result = await worker.runOnce();
  assert.equal(result.status, "queued");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.retry, true);
  assert.equal(calls[0].options.delay_seconds, 30);
});

test("worker persists a durable checkpoint before requeueing a retryable paid stage", async () => {
  const calls = [];
  let current = {
    id: "job-checkpoint",
    job_type: "sales_dossier_generation",
    entity_id: "company-1",
    status: "running",
    stage: "collecting_professional",
    progress: 18,
    worker_id: "worker-test",
    attempt_count: 1,
    max_attempts: 3,
    is_paid: true,
    reservation_id: "reservation-test",
    checkpoint: {},
  };
  const repository = {
    async claimNextJob() {
      return current;
    },
    async heartbeatJob(jobId, workerId, stage, progress) {
      current = { ...current, id: jobId, worker_id: workerId, stage, progress };
      calls.push({ operation: "heartbeat", stage, progress });
      return current;
    },
    async saveJobCheckpoint(jobId, workerId, checkpoint, options) {
      current = {
        ...current,
        id: jobId,
        worker_id: workerId,
        checkpoint: { ...current.checkpoint, ...checkpoint },
        stage: options.stage,
        progress: options.progress,
        progress_detail: options.detail,
      };
      calls.push({ operation: "checkpoint", checkpoint, options });
      return current;
    },
    async getJob() {
      return current;
    },
    async releaseJobClaim(jobId, workerId, error, options) {
      calls.push({ operation: "release", jobId, workerId, error, options });
      current = {
        ...current,
        status: "queued",
        stage: "retry_wait",
        scheduled_at: "2026-07-30T12:00:05.000Z",
      };
      return current;
    },
  };
  const salesService = {
    async assertRuntimeReady() {},
    async executeQueuedJob(_job, options) {
      await options.save_checkpoint(
        {
          dossier: {
            schema_version: 1,
            company_id: "company-1",
            evidence_collection: {
              completed_query_keys: ["datapro:business"],
            },
          },
        },
        {
          stage: "collecting_professional",
          progress: 24,
          detail: { current: 1, total: 2, message: "正在核验专业资料 1/2" },
        },
      );
      const error = new Error("temporary upstream failure");
      error.code = "provider_timeout";
      error.category = "timeout";
      error.retryable = true;
      throw error;
    },
  };
  const worker = new JobWorker({
    repository,
    salesService,
    env: envReader(),
    workerId: "worker-test",
    logger: { info() {}, error() {} },
    random: () => 0,
  });

  const result = await worker.runOnce();

  assert.equal(result.status, "queued");
  assert.deepEqual(current.checkpoint.dossier.evidence_collection.completed_query_keys, [
    "datapro:business",
  ]);
  assert.deepEqual(current.progress_detail, {
    current: 1,
    total: 2,
    message: "正在核验专业资料 1/2",
  });
  assert.deepEqual(
    calls.filter((call) => call.operation === "checkpoint")
      .map((call) => call.options.stage),
    ["collecting_professional"],
  );
  const released = calls.find((call) => call.operation === "release");
  assert.equal(released.options.retry, true);
  assert.equal(released.options.delay_seconds, 5);
  assert.equal(released.error.category, "timeout");
});

test("running cancellation keeps the lease until the worker reaches a safe checkpoint", async () => {
  const calls = [];
  let current = {
    id: "job-cancel",
    job_type: "sales_dossier_generation",
    entity_id: "company-1",
    status: "running",
    stage: "generating_dossier",
    progress: 70,
    worker_id: "worker-test",
    is_paid: true,
    reservation_id: "reservation-test",
  };
  const initial = salesState();
  initial.jobs[current.id] = current;
  const repository = {
    async getSalesState() {
      return initial;
    },
    async getJob() {
      return current;
    },
    async requestJobCancellation() {
      calls.push("request");
      current = {
        ...current,
        stage: "cancelling",
        cancel_requested_at: "2026-07-23T12:00:00.000Z",
      };
      return current;
    },
    async acknowledgeJobCancellation(jobId, workerId) {
      calls.push({ operation: "acknowledge", jobId, workerId });
      current = {
        ...current,
        status: "cancelled",
        stage: "cancelled",
        worker_id: null,
        lease_expires_at: null,
      };
      return current;
    },
  };
  const service = new SalesService({
    env: envReader({ ASYNC_JOBS_ENABLED: "true", APP_WORKSPACE_ID: "workspace-test" }),
    runtimePolicy: strictRuntimePolicy,
    repository,
  });

  await service.assertRuntimeReady();
  const requested = await service.cancelJob(current.id);
  assert.equal(requested.status, "running");
  assert.equal(requested.stage, "cancelling");
  assert.equal(requested.worker_id, "worker-test");

  await assert.rejects(
    () => service.assertJobActive(current.id),
    (error) => error.code === "job_cancelled",
  );
  assert.equal(current.status, "cancelled");
  assert.deepEqual(calls, [
    "request",
    { operation: "acknowledge", jobId: "job-cancel", workerId: "worker-test" },
  ]);
});
