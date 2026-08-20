import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = path.resolve(backendDir, "..");
const queueMigration = await fs.readFile(
  path.join(rootDir, "supabase", "migrations", "202607230002_async_job_queue.sql"),
  "utf8",
);
const cancellationMigration = await fs.readFile(
  path.join(rootDir, "supabase", "migrations", "202607230003_safe_job_cancellation.sql"),
  "utf8",
);
const terminalRunMigration = await fs.readFile(
  path.join(rootDir, "supabase", "migrations", "202607290001_reconcile_terminal_job_provider_runs.sql"),
  "utf8",
);
const durableCheckpointMigration = await fs.readFile(
  path.join(rootDir, "supabase", "migrations", "202607300001_durable_job_checkpoints.sql"),
  "utf8",
);
const smoke = await fs.readFile(
  path.join(rootDir, "supabase", "tests", "202607230003_async_job_queue_smoke.sql"),
  "utf8",
);

test("asynchronous queue migration keeps claiming and paid execution atomic", () => {
  assert.match(queueMigration, /for update skip locked/);
  assert.match(queueMigration, /create or replace function public\.enqueue_sales_job/);
  assert.match(queueMigration, /create or replace function public\.claim_sales_job/);
  assert.match(queueMigration, /create or replace function public\.release_sales_job_claim/);
  assert.match(queueMigration, /and not v_has_reservation/);
  assert.match(queueMigration, /where j\.workspace_id = p_workspace_id[\s\S]*?and j\.status = 'running'/);
});

test("safe cancellation is delivered as a forward-only migration", () => {
  assert.match(cancellationMigration, /values \('202607230003'/);
  assert.match(cancellationMigration, /add column if not exists cancel_requested_at/);
  assert.match(cancellationMigration, /create or replace function public\.heartbeat_sales_job/);
  assert.match(cancellationMigration, /create or replace function public\.request_cancel_sales_job/);
  assert.match(cancellationMigration, /create or replace function public\.acknowledge_cancel_sales_job/);
  assert.match(cancellationMigration, /stage = 'cancelling'/);
  assert.match(cancellationMigration, /create or replace function public\.retry_sales_job/);
  assert.match(cancellationMigration, /create or replace function public\.finish_paid_workflow/);
  assert.match(cancellationMigration, /to service_role/);
  assert.match(cancellationMigration, /revoke all[\s\S]*?from public, anon, authenticated/);
});

test("terminal jobs close orphaned provider runs and active steps", () => {
  assert.match(terminalRunMigration, /create or replace function public\.reconcile_terminal_job_provider_runs/);
  assert.match(terminalRunMigration, /after update of status, error_json on public\.jobs/);
  assert.match(terminalRunMigration, /update public\.provider_run_steps/);
  assert.match(terminalRunMigration, /update public\.provider_runs/);
  assert.match(terminalRunMigration, /and r\.status = 'running'/);
  assert.match(terminalRunMigration, /values \('202607290001'/);
  assert.match(terminalRunMigration, /Reconcile runs that were orphaned before this trigger was installed/);
});

test("durable job checkpoints preserve completed work and allow bounded paid-stage retries", () => {
  assert.match(durableCheckpointMigration, /add column if not exists checkpoint_json jsonb/i);
  assert.match(durableCheckpointMigration, /add column if not exists progress_detail_json jsonb/i);
  assert.match(durableCheckpointMigration, /create or replace function public\.checkpoint_sales_job/i);
  assert.match(durableCheckpointMigration, /checkpoint_json = j\.checkpoint_json \|\| v_patch/i);
  assert.match(durableCheckpointMigration, /stage = case when v_should_retry then 'retry_wait' else 'failed' end/i);
  assert.match(durableCheckpointMigration, /v_job\.attempt_count < v_job\.max_attempts/i);
  assert.doesNotMatch(
    durableCheckpointMigration,
    /v_should_retry[\s\S]{0,120}not v_has_reservation/i,
  );
  assert.match(durableCheckpointMigration, /release_reason'[\s\S]{0,180}'retryable_worker_failure'/i);
  assert.match(durableCheckpointMigration, /values \('202607300001'/);
});

test("queue smoke covers safe retry, heartbeat, reservation and rollback", () => {
  assert.match(smoke, /^begin;/m);
  assert.match(smoke, /enqueue_sales_job/);
  assert.match(smoke, /claim_sales_job/);
  assert.match(smoke, /heartbeat_sales_job/);
  assert.match(smoke, /release_sales_job_claim/);
  assert.match(smoke, /request_cancel_sales_job/);
  assert.match(smoke, /acknowledge_cancel_sales_job/);
  assert.match(smoke, /reserve_paid_workflow/);
  assert.match(smoke, /finish_paid_workflow/);
  assert.match(smoke, /^rollback;/m);
});
