import os from "node:os";

const SUPPORTED_JOB_TYPES = Object.freeze([
  "sales_dossier_generation",
  "sales_material_openviking_sync",
]);

function positiveInteger(value, fallback, minimum = 1) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function safeError(error) {
  return {
    code: String(error?.code || "worker_execution_failed").slice(0, 120),
    message: String(error?.message || "后台任务执行失败。").slice(0, 500),
    category: String(error?.category || "workflow").slice(0, 80),
    retryable: Boolean(error?.retryable || Number(error?.status || 0) >= 500),
  };
}

function shouldRetryClaim(error) {
  return [
    "paid_workflow_concurrency_exceeded",
    "usage_guard_unavailable",
    "provider_timeout",
    "supabase_unavailable",
  ].includes(String(error?.code || "")) || Boolean(error?.retryable);
}

function retryDelaySeconds(error, attemptCount, random = Math.random) {
  if (String(error?.code || "") === "paid_workflow_concurrency_exceeded") return 30;
  const attempt = Math.max(1, Number(attemptCount || 1));
  const base = Math.min(60, 5 * (2 ** Math.max(0, attempt - 1)));
  const jitter = Math.floor(base * 0.25 * Math.max(0, Math.min(1, Number(random()) || 0)));
  return base + jitter;
}

export class JobWorker {
  constructor(options = {}) {
    this.repository = options.repository;
    this.salesService = options.salesService;
    this.env = options.env;
    this.workerId = options.workerId
      || this.env?.value?.("JOB_WORKER_ID", "")
      || `${os.hostname()}:${process.pid}`;
    this.pollMs = positiveInteger(this.env?.value?.("JOB_WORKER_POLL_MS", "1000"), 1000, 100);
    this.leaseSeconds = positiveInteger(this.env?.value?.("JOB_WORKER_LEASE_SECONDS", "600"), 600, 60);
    this.heartbeatMs = Math.max(5_000, Math.min(30_000, Math.floor((this.leaseSeconds * 1000) / 3)));
    this.jobTypes = options.jobTypes || SUPPORTED_JOB_TYPES;
    this.logger = options.logger || console;
    this.random = options.random || Math.random;
    this.stopped = false;
  }

  async assertReady() {
    if (!this.repository || typeof this.repository.claimNextJob !== "function") {
      throw new Error("Persistent asynchronous job queue is not configured.");
    }
    if (!this.salesService || typeof this.salesService.executeQueuedJob !== "function") {
      throw new Error("Sales job executor is not configured.");
    }
    await this.salesService.assertRuntimeReady();
  }

  async runOnce() {
    const job = await this.repository.claimNextJob(this.workerId, this.jobTypes, this.leaseSeconds);
    if (!job) return { claimed: false };

    let stage = job.stage || "starting";
    let progress = Number(job.progress || 1);
    let heartbeatFailure = null;
    let heartbeatBusy = false;
    const heartbeat = async (nextStage = stage, nextProgress = progress) => {
      if (heartbeatFailure) throw heartbeatFailure;
      stage = nextStage;
      progress = nextProgress;
      const updated = await this.repository.heartbeatJob(
        job.id,
        this.workerId,
        stage,
        progress,
        this.leaseSeconds,
      );
      stage = updated.stage || stage;
      progress = Number(updated.progress ?? progress);
      return updated;
    };
    const saveCheckpoint = async (checkpointPatch = {}, options = {}) => {
      if (typeof this.repository.saveJobCheckpoint !== "function") {
        throw new Error("Persistent job checkpoints are not configured.");
      }
      stage = options.stage || stage;
      progress = Number(options.progress ?? progress);
      const updated = await this.repository.saveJobCheckpoint(
        job.id,
        this.workerId,
        checkpointPatch,
        {
          stage,
          progress,
          detail: options.detail || {},
          lease_seconds: this.leaseSeconds,
        },
      );
      stage = updated.stage || stage;
      progress = Number(updated.progress ?? progress);
      job.checkpoint = updated.checkpoint || job.checkpoint || {};
      job.progress_detail = updated.progress_detail || job.progress_detail || {};
      return updated;
    };
    const heartbeatTimer = setInterval(() => {
      if (heartbeatBusy || heartbeatFailure) return;
      heartbeatBusy = true;
      heartbeat().catch((error) => {
        heartbeatFailure = error;
      }).finally(() => {
        heartbeatBusy = false;
      });
    }, this.heartbeatMs);
    heartbeatTimer.unref?.();

    try {
      await heartbeat("starting", 2);
      const result = await this.salesService.executeQueuedJob(job, {
        worker_id: this.workerId,
        report_progress: heartbeat,
        save_checkpoint: saveCheckpoint,
      });
      if (heartbeatFailure) throw heartbeatFailure;
      return { claimed: true, job_id: job.id, status: "succeeded", result };
    } catch (error) {
      const latest = await this.repository.getJob(job.id).catch(() => null);
      let finalStatus = latest?.status || "failed";
      if (!["succeeded", "failed", "cancelled"].includes(latest?.status)) {
        const released = await this.repository.releaseJobClaim(job.id, this.workerId, safeError(error), {
          retry: shouldRetryClaim(error),
          delay_seconds: retryDelaySeconds(error, latest?.attempt_count || job.attempt_count, this.random),
        });
        finalStatus = released?.status || finalStatus;
      }
      return {
        claimed: true,
        job_id: job.id,
        status: finalStatus,
        error: safeError(error),
      };
    } finally {
      clearInterval(heartbeatTimer);
    }
  }

  async run() {
    await this.assertReady();
    this.logger.info?.(`sales-job-worker ready (${this.workerId})`);
    while (!this.stopped) {
      try {
        const result = await this.runOnce();
        if (!result.claimed) await sleep(this.pollMs);
      } catch (error) {
        this.logger.error?.(`sales-job-worker poll failed: ${String(error?.code || error?.message || "unknown_error")}`);
        await sleep(this.pollMs);
      }
    }
  }

  stop() {
    this.stopped = true;
  }
}

export { SUPPORTED_JOB_TYPES };
