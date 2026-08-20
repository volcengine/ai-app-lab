import { HttpError } from "../utils/http.js";
import { makeId } from "../utils/ids.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

function nonNegativeInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function dateKey(value, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function errorDetails(error) {
  const details = error?.details;
  if (!details) return {};
  if (typeof details === "object") return details;
  try {
    return JSON.parse(details);
  } catch {
    return {};
  }
}

function limitError(error) {
  const message = String(error?.message || "");
  const details = errorDetails(error);
  if (message.includes("paid_workflow_concurrency_exceeded")) {
    return new HttpError(429, "paid_workflow_concurrency_exceeded", "当前付费任务已达到并发上限，请稍后重试。", {
      running: Number(details.running || 0),
      limit: Number(details.limit || 0),
      retry_after_seconds: Number(details.retry_after_seconds || 30),
    });
  }
  if (message.includes("paid_workflow_daily_limit_exceeded")) {
    return new HttpError(429, "paid_workflow_daily_limit_exceeded", "今日付费任务次数已达到工作区上限。", {
      used: Number(details.used || 0),
      limit: Number(details.limit || 0),
      timezone: String(details.timezone || ""),
    });
  }
  return null;
}

export function paidWorkflowLimits(env) {
  return Object.freeze({
    max_concurrent: nonNegativeInteger(env.value("PAID_WORKFLOW_MAX_CONCURRENCY", "2"), 2),
    daily_limit: nonNegativeInteger(env.value("PAID_WORKFLOW_DAILY_LIMIT", "100"), 100),
    timezone: String(env.value("PAID_WORKFLOW_BUDGET_TIMEZONE", "Asia/Shanghai") || "Asia/Shanghai").trim(),
    stale_after_seconds: positiveInteger(env.value("PAID_WORKFLOW_STALE_AFTER_SECONDS", "1800"), 1800),
  });
}

export class PaidWorkflowGuard {
  constructor(options = {}) {
    this.env = options.env;
    this.repository = options.repository || null;
    this.failClosed = Boolean(options.failClosed);
    this.listLocalJobs = options.listLocalJobs || (() => []);
    this.limits = paidWorkflowLimits(this.env);
    this.localReservations = new Map();
    this.localQueue = Promise.resolve();
    try {
      dateKey(new Date(), this.limits.timezone);
    } catch {
      throw new Error(`PAID_WORKFLOW_BUDGET_TIMEZONE is invalid: ${this.limits.timezone}`);
    }
  }

  async reserve(job) {
    if (job.is_paid === false) return { job: clone(job), budget: null };
    const reservationId = makeId("usage_reservation");
    const candidate = { ...clone(job), is_paid: true, reservation_id: reservationId };

    if (typeof this.repository?.reservePaidWorkflow === "function") {
      try {
        return await this.repository.reservePaidWorkflow(candidate, reservationId, this.limits);
      } catch (error) {
        const known = limitError(error);
        if (known) throw known;
        throw new HttpError(503, "usage_guard_unavailable", "付费任务保护暂时不可用，任务未执行。", {
          reason: String(error?.code || "reservation_failed"),
        });
      }
    }

    if (this.failClosed) {
      throw new HttpError(503, "usage_guard_unavailable", "生产环境缺少持久化付费任务保护，任务未执行。", {
        reason: "repository_reservation_not_supported",
      });
    }
    return this.withLocalLock(() => this.reserveLocal(candidate));
  }

  async finish(job) {
    if (!job?.is_paid || !job?.reservation_id) return clone(job);
    if (typeof this.repository?.finishPaidWorkflow === "function") {
      try {
        return await this.repository.finishPaidWorkflow(job, job.reservation_id);
      } catch (error) {
        throw new HttpError(503, "usage_guard_unavailable", "付费任务状态未能可靠落库。", {
          reason: String(error?.code || "reservation_release_failed"),
        });
      }
    }
    if (this.failClosed) {
      throw new HttpError(503, "usage_guard_unavailable", "生产环境缺少持久化付费任务保护。", {
        reason: "repository_release_not_supported",
      });
    }
    const reservation = this.localReservations.get(job.reservation_id);
    if (reservation?.status === "running") {
      reservation.status = job.status;
      reservation.released_at = job.finished_at || new Date().toISOString();
    }
    return clone(job);
  }

  async snapshot() {
    if (typeof this.repository?.getPaidWorkflowUsage === "function") {
      try {
        const usage = await this.repository.getPaidWorkflowUsage(this.limits.timezone);
        return this.publicSnapshot(usage);
      } catch (error) {
        if (this.failClosed) {
          throw new HttpError(503, "usage_guard_unavailable", "无法读取付费任务用量。", {
            reason: String(error?.code || "usage_snapshot_failed"),
          });
        }
      }
    }
    return this.publicSnapshot(this.localUsage());
  }

  withLocalLock(operation) {
    const result = this.localQueue.then(operation, operation);
    this.localQueue = result.catch(() => {});
    return result;
  }

  reserveLocal(job) {
    const now = new Date();
    for (const reservation of this.localReservations.values()) {
      if (reservation.status === "running" && new Date(reservation.expires_at) <= now) {
        reservation.status = "expired";
        reservation.released_at = now.toISOString();
      }
    }
    const usage = this.localUsage(now);
    if (this.limits.max_concurrent > 0 && usage.running >= this.limits.max_concurrent) {
      throw new HttpError(429, "paid_workflow_concurrency_exceeded", "当前付费任务已达到并发上限，请稍后重试。", {
        running: usage.running,
        limit: this.limits.max_concurrent,
        retry_after_seconds: Math.min(this.limits.stale_after_seconds, 60),
      });
    }
    if (this.limits.daily_limit > 0 && usage.used_today >= this.limits.daily_limit) {
      throw new HttpError(429, "paid_workflow_daily_limit_exceeded", "今日付费任务次数已达到工作区上限。", {
        used: usage.used_today,
        limit: this.limits.daily_limit,
        timezone: this.limits.timezone,
      });
    }
    const reservedAt = now.toISOString();
    this.localReservations.set(job.reservation_id, {
      id: job.reservation_id,
      job_id: job.id,
      job_type: job.job_type,
      status: "running",
      reserved_at: reservedAt,
      expires_at: new Date(now.getTime() + this.limits.stale_after_seconds * 1000).toISOString(),
    });
    return {
      job: clone(job),
      budget: this.publicSnapshot({
        running: usage.running + 1,
        used_today: usage.used_today + 1,
        by_job_type: {
          ...usage.by_job_type,
          [job.job_type]: Number(usage.by_job_type[job.job_type] || 0) + 1,
        },
      }),
    };
  }

  localUsage(now = new Date()) {
    const today = dateKey(now, this.limits.timezone);
    const usage = { running: 0, used_today: 0, by_job_type: {} };
    for (const reservation of this.localReservations.values()) {
      if (reservation.status === "running" && new Date(reservation.expires_at) > now) usage.running += 1;
      if (dateKey(reservation.reserved_at, this.limits.timezone) !== today) continue;
      usage.used_today += 1;
      usage.by_job_type[reservation.job_type] = Number(usage.by_job_type[reservation.job_type] || 0) + 1;
    }
    if (!this.localReservations.size) {
      for (const job of this.listLocalJobs()) {
        if (!job?.is_paid || !job.created_at || dateKey(job.created_at, this.limits.timezone) !== today) continue;
        usage.used_today += 1;
        usage.by_job_type[job.job_type] = Number(usage.by_job_type[job.job_type] || 0) + 1;
        if (job.status === "running") usage.running += 1;
      }
    }
    return usage;
  }

  publicSnapshot(usage = {}) {
    return {
      running: Number(usage.running || 0),
      max_concurrent: this.limits.max_concurrent,
      used_today: Number(usage.used_today || 0),
      daily_limit: this.limits.daily_limit,
      timezone: this.limits.timezone,
      by_job_type: usage.by_job_type && typeof usage.by_job_type === "object" ? usage.by_job_type : {},
      counting_unit: "paid_workflow_attempt",
    };
  }
}
