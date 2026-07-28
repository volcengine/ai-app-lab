import test from 'node:test';
import assert from 'node:assert/strict';
import { MonitorService } from '../../src/server/services/monitor-service.js';

function createRepository() {
  const settings = {
    stock_id: 'stock-1',
    enabled: true,
    schedule_time: '18:00',
    schedule_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    timezone: 'Asia/Shanghai',
    last_run_at: null,
    last_run_date: null,
    schedule_attempt_date: null,
    schedule_retry_count: 0,
    next_retry_at: null,
    last_error_details: null,
  };
  return {
    settings,
    getStock: () => ({ id: 'stock-1' }),
    listEnabledMonitorSettings: () => [settings],
    tryAcquireMonitorLease: () => true,
    createMonitorRun: (_stockId, input) => {
      settings.runInput = input;
      return 'run-1';
    },
    getMonitorSettings: () => settings,
    updateMonitorSettings: (_stockId, input) => Object.assign(settings, input),
    finishMonitorRun: (_runId, result) => { settings.finished = result; },
    releaseMonitorLease: () => {},
  };
}

test('runs a due monitor and records the generated report', async () => {
  const repository = createRepository();
  const now = new Date('2026-07-20T10:00:00.000Z');
  let generateInput;
  const service = new MonitorService({
    repository,
    reportService: { generate: async (input) => { generateInput = input; return { id: 'report-1' }; } },
    config: { timezone: 'Asia/Shanghai', schedulerEnabled: true },
    clock: () => now,
  });

  const results = await service.runDue(now);
  assert.deepEqual(results, [{ stock_id: 'stock-1', ok: true, report_id: 'report-1' }]);
  assert.equal(repository.settings.finished.status, 'completed');
  assert.equal(repository.settings.finished.reportId, 'report-1');
  assert.equal(repository.settings.last_run_date, '2026-07-20');
  assert.equal(repository.settings.runInput.trigger, 'schedule');
  assert.equal(generateInput.trigger, 'schedule');
  assert.equal(generateInput.now, now);
});

test('treats a displayed report awaiting review as a completed scheduled run', async () => {
  const repository = createRepository();
  const now = new Date('2026-07-20T10:00:00.000Z');
  const service = new MonitorService({
    repository,
    reportService: { generate: async () => ({ id: 'report-1', status: 'review_required' }) },
    config: { timezone: 'Asia/Shanghai', schedulerEnabled: true },
    clock: () => now,
  });

  const results = await service.runDue(now);
  assert.deepEqual(results, [{ stock_id: 'stock-1', ok: true, report_id: 'report-1' }]);
  assert.equal(repository.settings.finished.status, 'review_required');
  assert.equal(repository.settings.last_run_date, '2026-07-20');
});

test('backs off a scheduled failure without marking the day successful', async () => {
  const repository = createRepository();
  const now = new Date('2026-07-20T10:00:00.000Z');
  const service = new MonitorService({
    repository,
    reportService: { generate: async () => { throw Object.assign(new Error('quota'), { code: 'DATAPRO_4011' }); } },
    config: { timezone: 'Asia/Shanghai', schedulerEnabled: true },
    clock: () => now,
  });

  await assert.rejects(service.run('stock-1', { trigger: 'schedule', scheduledFor: now }), /quota/);
  assert.equal(repository.settings.last_run_at, now.toISOString());
  assert.equal(repository.settings.last_run_date, null);
  assert.equal(repository.settings.schedule_attempt_date, '2026-07-20');
  assert.equal(repository.settings.schedule_retry_count, 1);
  assert.equal(repository.settings.next_retry_at, '2026-07-20T10:05:00.000Z');
  assert.equal(repository.settings.finished.status, 'failed');
  assert.equal(repository.settings.finished.errorCode, 'DATAPRO_4011');
});

test('persists the underlying provider failure for scheduled-run diagnosis', async () => {
  const repository = createRepository();
  const now = new Date('2026-07-20T10:00:00.000Z');
  const providerError = Object.assign(new Error('真实数据源未全部就绪'), {
    code: 'REQUIRED_PROVIDER_UNAVAILABLE',
    details: {
      providers: {
        datapro: { ok: true },
        web_search: {
          ok: false,
          code: 'WEB_SEARCH_QuotaExceeded',
          message: '当日搜索额度已用尽',
        },
      },
    },
  });
  const service = new MonitorService({
    repository,
    reportService: { generate: async () => { throw providerError; } },
    config: { timezone: 'Asia/Shanghai', schedulerEnabled: true },
    clock: () => now,
  });

  await assert.rejects(service.run('stock-1', { trigger: 'schedule', scheduledFor: now }));
  assert.match(repository.settings.last_error_message, /联网搜索：当日搜索额度已用尽/);
  assert.equal(
    repository.settings.last_error_details.providers.web_search.code,
    'WEB_SEARCH_QuotaExceeded',
  );
  assert.equal(
    repository.settings.finished.errorDetails.providers.web_search.code,
    'WEB_SEARCH_QuotaExceeded',
  );
});

test('does not suppress the later schedule after a failed manual run', async () => {
  const repository = createRepository();
  const service = new MonitorService({
    repository,
    reportService: { generate: async () => { throw new Error('manual failure'); } },
    config: { timezone: 'Asia/Shanghai', schedulerEnabled: true },
  });

  await assert.rejects(service.run('stock-1', { trigger: 'manual' }), /manual failure/);
  assert.equal(repository.settings.last_run_at, null);
  assert.equal(repository.settings.last_run_date, null);
});

test('a successful manual run does not suppress the scheduled run later that day', async () => {
  const repository = createRepository();
  repository.settings.last_error_code = 'REQUIRED_PROVIDER_UNAVAILABLE';
  repository.settings.last_error_message = 'DataPro 未就绪';
  repository.settings.last_error_details = { providers: { datapro: { ok: false } } };
  const now = new Date('2026-07-20T10:00:00.000Z');
  let reportIndex = 0;
  const service = new MonitorService({
    repository,
    reportService: { generate: async () => ({ id: `report-${++reportIndex}` }) },
    config: { timezone: 'Asia/Shanghai', schedulerEnabled: true },
    clock: () => now,
  });

  await service.run('stock-1', { trigger: 'manual' });
  assert.equal(repository.settings.last_run_date, null);
  assert.equal(repository.settings.last_error_code, 'REQUIRED_PROVIDER_UNAVAILABLE');
  assert.equal(repository.settings.last_error_message, 'DataPro 未就绪');
  assert.deepEqual(repository.settings.last_error_details, { providers: { datapro: { ok: false } } });

  const results = await service.runDue(now);
  assert.deepEqual(results, [{ stock_id: 'stock-1', ok: true, report_id: 'report-2' }]);
  assert.equal(repository.settings.last_run_date, '2026-07-20');
  assert.equal(repository.settings.last_error_code, null);
  assert.equal(repository.settings.last_error_message, null);
  assert.equal(repository.settings.last_error_details, null);
});
