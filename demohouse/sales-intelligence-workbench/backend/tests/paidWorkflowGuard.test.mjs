import assert from "node:assert/strict";
import test from "node:test";
import { PaidWorkflowGuard, paidWorkflowLimits } from "../src/limits/paidWorkflowGuard.js";

function envReader(values = {}) {
  return {
    value(name, fallback = "") {
      return Object.hasOwn(values, name) ? values[name] : fallback;
    },
  };
}

function job(id, type = "sales_dossier_generation") {
  const createdAt = new Date().toISOString();
  return {
    id,
    job_type: type,
    status: "running",
    attempt_count: 1,
    max_attempts: 2,
    started_at: createdAt,
    created_at: createdAt,
    updated_at: createdAt,
    is_paid: true,
  };
}

test("paid workflow limits use safe strict-runtime defaults", () => {
  assert.deepEqual(paidWorkflowLimits(envReader()), {
    max_concurrent: 2,
    daily_limit: 100,
    timezone: "Asia/Shanghai",
    stale_after_seconds: 1800,
  });
});

test("local guard rejects excess concurrency and releases the slot on completion", async () => {
  const guard = new PaidWorkflowGuard({
    env: envReader({
      PAID_WORKFLOW_MAX_CONCURRENCY: "1",
      PAID_WORKFLOW_DAILY_LIMIT: "10",
      PAID_WORKFLOW_BUDGET_TIMEZONE: "UTC",
      PAID_WORKFLOW_STALE_AFTER_SECONDS: "3600",
    }),
  });

  const first = await guard.reserve(job("job-1"));
  assert.equal(first.budget.running, 1);
  await assert.rejects(
    () => guard.reserve(job("job-2")),
    (error) => error.status === 429 && error.code === "paid_workflow_concurrency_exceeded",
  );

  await guard.finish({ ...first.job, status: "succeeded", finished_at: new Date().toISOString() });
  const second = await guard.reserve(job("job-2"));
  assert.equal(second.budget.running, 1);
  assert.equal(second.budget.used_today, 2);
});

test("local guard counts every paid attempt against the daily limit", async () => {
  const guard = new PaidWorkflowGuard({
    env: envReader({
      PAID_WORKFLOW_MAX_CONCURRENCY: "2",
      PAID_WORKFLOW_DAILY_LIMIT: "1",
      PAID_WORKFLOW_BUDGET_TIMEZONE: "UTC",
    }),
  });
  const first = await guard.reserve(job("job-1", "sales_company_search"));
  await guard.finish({ ...first.job, status: "failed", finished_at: new Date().toISOString() });

  await assert.rejects(
    () => guard.reserve(job("job-2", "sales_qa")),
    (error) => error.status === 429 && error.code === "paid_workflow_daily_limit_exceeded",
  );
  const snapshot = await guard.snapshot();
  assert.equal(snapshot.used_today, 1);
  assert.equal(snapshot.by_job_type.sales_company_search, 1);
});

test("runtime delegates reservation and completion to persistent repository RPCs", async () => {
  const calls = [];
  const repository = {
    async reservePaidWorkflow(candidate, reservationId, limits) {
      calls.push({ operation: "reserve", candidate, reservationId, limits });
      return { job: candidate, budget: { running: 1, used_today: 1 } };
    },
    async finishPaidWorkflow(candidate, reservationId) {
      calls.push({ operation: "finish", candidate, reservationId });
      return candidate;
    },
    async getPaidWorkflowUsage(timezone) {
      calls.push({ operation: "snapshot", timezone });
      return { running: 0, used_today: 1, by_job_type: { sales_qa: 1 } };
    },
  };
  const guard = new PaidWorkflowGuard({ env: envReader(), repository, failClosed: true });
  const reservation = await guard.reserve(job("job-prod", "sales_qa"));
  await guard.finish({ ...reservation.job, status: "succeeded", finished_at: new Date().toISOString() });
  const snapshot = await guard.snapshot();

  assert.deepEqual(calls.map((call) => call.operation), ["reserve", "finish", "snapshot"]);
  assert.match(reservation.job.reservation_id, /^usage_reservation_/);
  assert.equal(snapshot.daily_limit, 100);
  assert.equal(snapshot.by_job_type.sales_qa, 1);
});

test("runtime fails closed when the persistent reservation capability is missing", async () => {
  const guard = new PaidWorkflowGuard({ env: envReader(), repository: {}, failClosed: true });
  await assert.rejects(
    () => guard.reserve(job("job-prod")),
    (error) => error.status === 503 && error.code === "usage_guard_unavailable",
  );
});
