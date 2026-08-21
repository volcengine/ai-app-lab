import { makeId } from "../utils/ids.js";
import { nowIso } from "../utils/time.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

function redactSecrets(value, maxLength = 500) {
  return String(value || "")
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/ark-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}-[0-9a-f]{5}/gi, "[REDACTED]")
    .replace(/AKLT[A-Za-z0-9]{20,}/g, "[REDACTED]")
    .replace(/((?:api|access|secret)[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeError(error) {
  if (!error) return null;
  const validationErrors = Array.isArray(error.details?.validation_errors)
    ? error.details.validation_errors
      .map((item) => redactSecrets(item))
      .filter(Boolean)
      .slice(0, 16)
    : [];
  return {
    code: redactSecrets(error.code || "provider_error", 80),
    message: redactSecrets(error.message || "Provider call failed."),
    category: redactSecrets(error.category || "unknown", 80),
    retryable: Boolean(error.retryable),
    validation_errors: validationErrors,
  };
}

function safeUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  const result = {};
  for (const key of ["prompt_tokens", "completion_tokens", "total_tokens", "reasoning_tokens"]) {
    const value = Number(usage[key]);
    if (Number.isFinite(value)) result[key] = value;
  }
  return Object.keys(result).length ? result : null;
}

function durationMs(startedAt, finishedAt) {
  return Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime());
}

export class ProviderRunStore {
  constructor(options = {}) {
    this.maxRuns = Math.max(20, Number(options.maxRuns || 200));
    this.runs = [];
    this.repository = options.repository || null;
    this.failOnPersistenceError = Boolean(options.failOnPersistenceError);
    this.persistenceError = null;
    this.circuitBreaker = options.circuitBreaker || null;
  }

  async startRun(input = {}) {
    const run = {
      id: makeId("provider_run"),
      operation: redactSecrets(input.operation || "provider_workflow", 120),
      status: "running",
      app_mode: "production",
      entity_type: redactSecrets(input.entity_type || "", 80),
      entity_id: redactSecrets(input.entity_id || "", 160),
      job_id: redactSecrets(input.job_id || "", 160) || null,
      started_at: nowIso(),
      finished_at: null,
      duration_ms: null,
      result_ref: null,
      error: null,
      steps: [],
    };
    this.runs.unshift(run);
    this.runs.splice(this.maxRuns);
    try {
      await this.persistRun(run, { strict: true });
    } catch (error) {
      this.runs = this.runs.filter((item) => item.id !== run.id);
      throw error;
    }
    return clone(run);
  }

  async startStep(runId, input = {}) {
    const run = this.requireRun(runId);
    const step = {
      id: makeId("provider_step"),
      sequence: run.steps.length + 1,
      provider: redactSecrets(input.provider || "unknown", 80),
      operation: redactSecrets(input.operation || "provider_call", 120),
      status: "running",
      input_summary: redactSecrets(input.input_summary || ""),
      output_summary: "",
      request_id: null,
      raw_ref: null,
      usage: null,
      attempts: Math.max(1, Number(input.attempts || 1)),
      started_at: nowIso(),
      finished_at: null,
      latency_ms: null,
      error: null,
    };
    run.steps.push(step);
    await this.persistRun(run, { strict: true });
    return clone(step);
  }

  async finishStep(runId, stepId, result = {}) {
    const run = this.requireRun(runId);
    const step = run.steps.find((item) => item.id === stepId);
    if (!step) throw new Error(`Provider step was not found: ${stepId}`);
    const finishedAt = nowIso();
    const explicitlySkipped = result.status === "skipped";
    step.status = explicitlySkipped ? "skipped" : result.ok === false ? "failed" : "succeeded";
    step.output_summary = redactSecrets(result.output_summary || result.summary || "");
    step.request_id = redactSecrets(result.request_id || "", 180) || null;
    step.raw_ref = redactSecrets(result.raw_ref || "", 240) || null;
    step.usage = safeUsage(result.usage);
    step.attempts = Math.max(1, Number(result.attempts || step.attempts || 1));
    step.finished_at = finishedAt;
    step.latency_ms = Number.isFinite(Number(result.latency_ms))
      ? Math.max(0, Number(result.latency_ms))
      : durationMs(step.started_at, finishedAt);
    step.error = safeError(result.error);
    await this.persistRun(run, { strict: true });
    return clone(step);
  }

  async skipStep(runId, input = {}) {
    const step = await this.startStep(runId, input);
    return this.finishStep(runId, step.id, {
      status: "skipped",
      output_summary: input.output_summary || "Provider step was not enabled for this run.",
      error: input.error || null,
    });
  }

  async executeStep(runId, input, operation) {
    const step = await this.startStep(runId, input);
    let circuitToken = null;
    try {
      circuitToken = this.circuitBreaker?.beforeCall(input?.provider);
      const result = await operation();
      const succeeded = result?.ok !== false;
      if (succeeded) {
        this.circuitBreaker?.recordSuccess(circuitToken);
      } else {
        this.circuitBreaker?.recordFailure(circuitToken, result?.error);
      }
      await this.finishStep(runId, step.id, {
        ...(result || {}),
        ok: succeeded,
        output_summary: succeeded ? input.output_summary || result?.summary || "" : "",
      });
      return result;
    } catch (error) {
      if (circuitToken) this.circuitBreaker?.recordFailure(circuitToken, error);
      try {
        await this.finishStep(runId, step.id, {
          ok: false,
          error: {
            code: error.code || "provider_exception",
            message: error.message || "Provider call failed.",
            category: error.category || "unknown",
            retryable: error.retryable,
          },
        });
      } catch (persistenceError) {
        if (this.failOnPersistenceError) throw persistenceError;
      }
      throw error;
    }
  }

  async completeRun(runId, input = {}) {
    const run = this.requireRun(runId);
    const finishedAt = nowIso();
    const hasFailedStep = run.steps.some((step) => step.status === "failed");
    run.status = hasFailedStep ? "succeeded_with_issues" : "succeeded";
    run.finished_at = finishedAt;
    run.duration_ms = durationMs(run.started_at, finishedAt);
    run.result_ref = redactSecrets(input.result_ref || "", 240) || null;
    await this.persistRun(run, { strict: true });
    return clone(run);
  }

  async failRun(runId, error) {
    const run = this.requireRun(runId);
    const finishedAt = nowIso();
    run.status = "failed";
    run.finished_at = finishedAt;
    run.duration_ms = durationMs(run.started_at, finishedAt);
    run.error = safeError(error);
    await this.persistRun(run, { strict: true });
    return clone(run);
  }

  async cancelRun(runId, input = {}) {
    const run = this.requireRun(runId);
    if (run.status === "cancelled") return clone(run);
    if (run.status !== "running") return clone(run);
    const finishedAt = nowIso();
    run.status = "cancelled";
    run.finished_at = finishedAt;
    run.duration_ms = durationMs(run.started_at, finishedAt);
    run.error = null;
    for (const step of run.steps) {
      if (step.status !== "running") continue;
      step.status = "cancelled";
      step.output_summary = redactSecrets(input.summary || "任务已由用户取消。", 500);
      step.finished_at = finishedAt;
      step.latency_ms = durationMs(step.started_at, finishedAt);
      step.error = null;
    }
    await this.persistRun(run, { strict: true });
    return clone(run);
  }

  async list(filters = {}) {
    const operation = String(filters.operation || "").trim();
    const entityId = String(filters.entity_id || "").trim();
    const requestedLimit = Number(filters.limit || 20);
    const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 20, 100));
    const memoryRuns = this.runs
      .filter((run) => !operation || run.operation === operation)
      .filter((run) => !entityId || run.entity_id === entityId)
      .map((run) => clone(run));
    const persistedRuns = await this.readPersisted("listProviderRuns", [{ operation, entity_id: entityId, limit }], []);
    return [...new Map([...memoryRuns, ...persistedRuns].map((run) => [run.id, run])).values()]
      .sort((a, b) => String(b.started_at || "").localeCompare(String(a.started_at || "")))
      .slice(0, limit);
  }

  async get(runId) {
    const run = this.runs.find((item) => item.id === runId);
    if (run) return clone(run);
    return this.readPersisted("getProviderRun", [runId], null);
  }

  requireRun(runId) {
    const run = this.runs.find((item) => item.id === runId);
    if (!run) throw new Error(`Provider run was not found: ${runId}`);
    return run;
  }

  async persistRun(run, options = {}) {
    if (typeof this.repository?.persistProviderRun !== "function") return null;
    try {
      const result = await this.repository.persistProviderRun(clone(run));
      this.persistenceError = null;
      return result;
    } catch (error) {
      this.persistenceError = safeError(error);
      if (options.strict && this.failOnPersistenceError) throw error;
      return null;
    }
  }

  async readPersisted(method, args, fallback) {
    if (typeof this.repository?.[method] !== "function") return fallback;
    try {
      const result = await this.repository[method](...args);
      this.persistenceError = null;
      return result ?? fallback;
    } catch (error) {
      this.persistenceError = safeError(error);
      if (this.failOnPersistenceError) throw error;
      return fallback;
    }
  }
}
