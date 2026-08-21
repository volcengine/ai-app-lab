import assert from "node:assert/strict";
import test from "node:test";
import { ProviderCircuitBreaker } from "../src/limits/providerCircuitBreaker.js";
import { ProviderRunStore } from "../src/observability/providerRunStore.js";
import { SalesService } from "../src/services/salesService.js";

function envReader(values = {}) {
  return {
    value(name, fallback = "") {
      return Object.hasOwn(values, name) ? values[name] : fallback;
    },
  };
}

test("provider run records redact secrets and retain safe usage metadata", async () => {
  const store = new ProviderRunStore();
  const run = await store.startRun({ operation: "test" });

  await store.executeStep(run.id, {
    provider: "model",
    operation: "probe",
    input_summary: "Authorization: Bearer fake",
    output_summary: "Probe completed.",
  }, async () => ({
    ok: true,
    request_id: "request-1",
    raw_ref: "model:request-1",
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }));
  await store.completeRun(run.id, { result_ref: "result:1" });

  const saved = await store.get(run.id);
  assert.equal(saved.status, "succeeded");
  assert.match(saved.steps[0].input_summary, /\[REDACTED\]/);
  assert.equal(saved.steps[0].usage.total_tokens, 15);
  assert.equal(saved.steps[0].raw_ref, "model:request-1");
  assert.equal(saved.app_mode, "production");
});

test("sales service provider run APIs expose diagnostics without internal references", async () => {
  const store = new ProviderRunStore();
  const service = new SalesService({
    env: envReader(),
    runtimePolicy: { fail_closed: false },
    providerRunStore: store,
  });
  const run = await store.startRun({
    operation: "public_provider_run",
    app_mode: "production",
    entity_type: "target_enterprise",
    entity_id: "company-1",
  });
  await store.executeStep(run.id, {
    provider: "model",
    operation: "generate",
    input_summary: "Generate a report.",
  }, async () => ({
    ok: true,
    request_id: "request-private",
    raw_ref: "model:request-private",
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }));
  await store.completeRun(run.id, { result_ref: "dossier:private" });

  const detail = await service.getProviderRun(run.id);
  const listed = await service.listProviderRuns({ operation: "public_provider_run" });
  for (const publicRun of [detail, listed[0]]) {
    assert.equal(publicRun.id, run.id);
    assert.equal(publicRun.steps[0].provider, "model");
    assert.equal(publicRun.steps[0].usage.total_tokens, 15);
    assert.equal(Object.hasOwn(publicRun, "result_ref"), false);
    assert.equal(Object.hasOwn(publicRun, "app_mode"), false);
    assert.equal(Object.hasOwn(publicRun.steps[0], "request_id"), false);
    assert.equal(Object.hasOwn(publicRun.steps[0], "raw_ref"), false);
  }
});

test("provider run failure retains bounded redacted validation diagnostics", async () => {
  const store = new ProviderRunStore();
  const run = await store.startRun({ operation: "validation_failure", app_mode: "production" });

  await store.failRun(run.id, {
    code: "model_unavailable",
    message: "Dossier validation failed.",
    category: "workflow",
    details: {
      validation_errors: [
        "经营与业务动态必须优先引用语义匹配的专业数据库",
        "Bearer private-token",
      ],
    },
  });

  const saved = await store.get(run.id);
  assert.deepEqual(saved.error.validation_errors, [
    "经营与业务动态必须优先引用语义匹配的专业数据库",
    "Bearer [REDACTED]",
  ]);
});

test("provider runs can be reloaded from a persistent repository", async () => {
  const saved = new Map();
  const repository = {
    persistProviderRun(run) {
      saved.set(run.id, structuredClone(run));
      return run;
    },
    getProviderRun(runId) {
      return saved.has(runId) ? structuredClone(saved.get(runId)) : null;
    },
    listProviderRuns() {
      return [...saved.values()].map((run) => structuredClone(run));
    },
  };
  const firstStore = new ProviderRunStore({ repository, failOnPersistenceError: true });
  const run = await firstStore.startRun({ operation: "persistent_test", entity_id: "company-1" });
  const step = await firstStore.startStep(run.id, { provider: "supabase", operation: "persist" });
  await firstStore.finishStep(run.id, step.id, { ok: true, usage: { total_tokens: 0 } });
  await firstStore.completeRun(run.id, { result_ref: "result:company-1" });

  const secondStore = new ProviderRunStore({ repository, failOnPersistenceError: true });
  assert.equal((await secondStore.get(run.id)).status, "succeeded");
  assert.equal((await secondStore.get(run.id)).steps.length, 1);
  assert.equal((await secondStore.list({ operation: "persistent_test" }))[0].id, run.id);
});

test("provider run start fails closed when required persistence is unavailable", async () => {
  const store = new ProviderRunStore({
    repository: {
      persistProviderRun() {
        throw new Error("database unavailable");
      },
    },
    failOnPersistenceError: true,
  });

  await assert.rejects(() => store.startRun({ operation: "must_persist" }), /database unavailable/);
});

test("provider run store blocks an open circuit before another upstream call", async () => {
  let calls = 0;
  const store = new ProviderRunStore({
    circuitBreaker: new ProviderCircuitBreaker({
      enabled: true,
      failureThreshold: 1,
      cooldownSeconds: 30,
    }),
  });
  const run = await store.startRun({ operation: "circuit_test" });
  const operation = async () => {
    calls += 1;
    return {
      ok: false,
      error: { code: "timeout", category: "timeout", retryable: true },
    };
  };

  await store.executeStep(run.id, { provider: "model", operation: "generate" }, operation);
  await assert.rejects(
    () => store.executeStep(run.id, { provider: "model", operation: "generate" }, operation),
    (error) => error.code === "provider_circuit_open",
  );

  const saved = await store.get(run.id);
  assert.equal(calls, 1);
  assert.equal(saved.steps.length, 2);
  assert.equal(saved.steps[1].error.code, "provider_circuit_open");
});

test("cancelling a provider run also closes its running step", async () => {
  const store = new ProviderRunStore();
  const run = await store.startRun({ operation: "cancel_test" });
  await store.startStep(run.id, { provider: "web_search", operation: "search" });

  const cancelled = await store.cancelRun(run.id, { summary: "User cancelled the task." });
  assert.equal(cancelled.status, "cancelled");
  assert.ok(cancelled.finished_at);
  assert.equal(cancelled.steps[0].status, "cancelled");
  assert.equal(cancelled.steps[0].output_summary, "User cancelled the task.");
});
