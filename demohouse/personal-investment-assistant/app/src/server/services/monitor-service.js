import { randomUUID } from 'node:crypto';
import { AppError } from '../errors.js';
import { isScheduleDue, zonedParts } from '../domain/time.js';

const retryDelaysMs = [5 * 60 * 1000, 15 * 60 * 1000, 30 * 60 * 1000];

function errorDetails(error) {
  return error?.details && typeof error.details === 'object'
    ? structuredClone(error.details)
    : null;
}

function diagnosticErrorMessage(error) {
  const providers = error?.details?.providers;
  if (!providers || typeof providers !== 'object') return error.message;
  const labels = {
    datapro: 'DataPro',
    web_search: '联网搜索',
    agent_plan_model: 'Agent Plan 模型',
    ark_model: 'Agent Plan 模型',
  };
  const failures = Object.entries(providers)
    .filter(([, value]) => value?.ok === false && !value?.skipped)
    .map(([provider, value]) => {
      const label = labels[provider] || provider;
      const detail = value.message || error.message;
      return `${label}：${detail}${value.code ? `（${value.code}）` : ''}`;
    });
  return failures.join('；') || error.message;
}

export class MonitorService {
  constructor({ repository, reportService, config, clock = () => new Date() }) {
    this.repository = repository;
    this.reportService = reportService;
    this.config = config;
    this.clock = clock;
    this.schedulerState = {
      started_at: this.clock().toISOString(),
      tick_running: false,
      last_tick_at: null,
      last_tick_completed_at: null,
      last_results: [],
      last_error: null,
    };
  }

  status() {
    return {
      enabled: this.config.schedulerEnabled !== false,
      ...this.schedulerState,
      enabled_monitor_count: this.repository.listEnabledMonitorSettings().length,
    };
  }

  async run(stockId, { trigger = 'manual', scheduledFor = null } = {}) {
    const stock = this.repository.getStock(stockId);
    if (!stock) throw new AppError('关注标的不存在', { code: 'STOCK_NOT_FOUND', status: 404 });
    const leaseOwner = randomUUID();
    if (!this.repository.tryAcquireMonitorLease(stockId, leaseOwner)) {
      throw new AppError('该标的的盘后检查正在执行', { code: 'MONITOR_ALREADY_RUNNING', status: 409 });
    }
    const startedAt = this.clock();
    const runId = this.repository.createMonitorRun(stockId, {
      trigger,
      scheduledFor: scheduledFor?.toISOString() || null,
      startedAt: startedAt.toISOString(),
    });
    try {
      const report = await this.reportService.generate({
        stockId,
        type: 'monitor',
        now: scheduledFor || startedAt,
        trigger,
      });
      const completedAt = this.clock();
      const settings = this.repository.getMonitorSettings(stockId);
      const nextSettings = {
        last_run_at: completedAt.toISOString(),
      };
      if (trigger === 'schedule') {
        const parts = zonedParts(scheduledFor || completedAt, settings?.timezone || this.config.timezone);
        Object.assign(nextSettings, {
          last_run_date: parts.date,
          schedule_attempt_date: null,
          schedule_retry_count: 0,
          next_retry_at: null,
          last_error_code: null,
          last_error_message: null,
          last_error_details: null,
        });
      }
      this.repository.updateMonitorSettings(stockId, nextSettings);
      this.repository.finishMonitorRun(runId, {
        status: report.status === 'review_required' ? 'review_required' : 'completed',
        reportId: report.id,
      });
      return { trigger, report };
    } catch (error) {
      if (trigger === 'schedule') {
        const failedAt = this.clock();
        const settings = this.repository.getMonitorSettings(stockId);
        const parts = zonedParts(scheduledFor || failedAt, settings?.timezone || this.config.timezone);
        const previousAttempts = settings?.schedule_attempt_date === parts.date
          ? Number(settings.schedule_retry_count || 0)
          : 0;
        const retryCount = previousAttempts + 1;
        const delay = retryDelaysMs[Math.min(retryCount - 1, retryDelaysMs.length - 1)];
        const details = errorDetails(error);
        const diagnosticMessage = diagnosticErrorMessage(error);
        this.repository.updateMonitorSettings(stockId, {
          last_run_at: failedAt.toISOString(),
          schedule_attempt_date: parts.date,
          schedule_retry_count: retryCount,
          next_retry_at: delay ? new Date(failedAt.getTime() + delay).toISOString() : null,
          last_error_code: error.code || 'MONITOR_FAILED',
          last_error_message: diagnosticMessage,
          last_error_details: details,
        });
      }
      this.repository.finishMonitorRun(runId, {
        status: 'failed',
        errorCode: error.code || 'MONITOR_FAILED',
        errorMessage: diagnosticErrorMessage(error),
        errorDetails: errorDetails(error),
      });
      throw error;
    } finally {
      this.repository.releaseMonitorLease(stockId, leaseOwner);
    }
  }

  async runDue(now = new Date()) {
    this.schedulerState.tick_running = true;
    this.schedulerState.last_tick_at = now.toISOString();
    this.schedulerState.last_error = null;
    try {
      const due = this.repository.listEnabledMonitorSettings().filter((settings) => isScheduleDue(settings, now));
      const results = [];
      for (const settings of due) {
        try {
          const result = await this.run(settings.stock_id, { trigger: 'schedule', scheduledFor: now });
          results.push({ stock_id: settings.stock_id, ok: true, report_id: result.report.id });
        } catch (error) {
          results.push({ stock_id: settings.stock_id, ok: false, code: error.code || 'MONITOR_FAILED' });
        }
      }
      this.schedulerState.last_results = results;
      return results;
    } catch (error) {
      this.schedulerState.last_error = {
        code: error.code || 'MONITOR_FAILED',
        message: error.message,
      };
      throw error;
    } finally {
      this.schedulerState.tick_running = false;
      this.schedulerState.last_tick_completed_at = this.clock().toISOString();
    }
  }
}
