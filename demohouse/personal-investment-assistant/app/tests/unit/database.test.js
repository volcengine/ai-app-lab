import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createDatabase } from '../../src/server/db/database.js';

test('migrates legacy monitor tables without losing settings or run history', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'investment-assistant-db-'));
  const databasePath = path.join(directory, 'legacy.sqlite');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE stocks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      exchange TEXT NOT NULL DEFAULT 'CN',
      focus_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(code, exchange)
    );
    CREATE TABLE monitor_settings (
      stock_id TEXT PRIMARY KEY REFERENCES stocks(id) ON DELETE CASCADE,
      enabled INTEGER NOT NULL DEFAULT 0,
      schedule_time TEXT NOT NULL DEFAULT '18:00',
      schedule_days_json TEXT NOT NULL DEFAULT '["Mon","Tue","Wed","Thu","Fri"]',
      timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
      check_items_json TEXT NOT NULL DEFAULT '[]',
      last_run_at TEXT,
      last_run_date TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE monitor_runs (
      id TEXT PRIMARY KEY,
      stock_id TEXT NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
      report_id TEXT,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      error_code TEXT,
      error_message TEXT
    );
  `);
  legacy.prepare(`
    INSERT INTO stocks VALUES ('stock-1', '示例科技', 'TEST1', 'CN', '["公告"]', ?, ?)
  `).run('2026-07-20T00:00:00.000Z', '2026-07-20T00:00:00.000Z');
  legacy.prepare(`
    INSERT INTO monitor_settings VALUES (
      'stock-1', 1, '18:00', '["Mon","Tue","Wed","Thu","Fri"]',
      'Asia/Shanghai', '["公告"]', '2026-07-20T10:00:00.000Z',
      '2026-07-20', '2026-07-20T10:00:00.000Z'
    )
  `).run();
  legacy.prepare(`
    INSERT INTO monitor_runs VALUES (
      'run-legacy', 'stock-1', NULL, 'completed',
      '2026-07-20T10:00:00.000Z', '2026-07-20T10:01:00.000Z', NULL, NULL
    )
  `).run();
  legacy.close();

  const repository = createDatabase(databasePath);
  t.after(() => repository.close());

  const settings = repository.getMonitorSettings('stock-1');
  assert.equal(settings.enabled, true);
  assert.equal(Object.hasOwn(settings, 'check_items'), false);
  assert.equal(settings.schedule_retry_count, 0);
  assert.equal(settings.next_retry_at, null);
  assert.equal(settings.last_error_details, null);

  const legacyRun = repository.listMonitorRuns('stock-1', 5)[0];
  assert.equal(legacyRun.id, 'run-legacy');
  assert.equal(legacyRun.trigger, 'legacy');
  assert.equal(legacyRun.error_details, null);

  repository.updateMonitorSettings('stock-1', { schedule_time: '18:30' });
  const updated = repository.getMonitorSettings('stock-1');
  assert.equal(updated.schedule_time, '18:30');
  assert.equal(updated.last_run_date, null);

  repository.createMonitorRun('stock-1', {
    trigger: 'schedule',
    scheduledFor: '2026-07-21T10:30:00.000Z',
    startedAt: '2026-07-21T10:30:01.000Z',
  });
  const scheduledRun = repository.listMonitorRuns('stock-1', 1)[0];
  assert.equal(scheduledRun.trigger, 'schedule');
  assert.equal(scheduledRun.scheduled_for, '2026-07-21T10:30:00.000Z');

  repository.finishMonitorRun(scheduledRun.id, {
    status: 'failed',
    errorCode: 'REQUIRED_PROVIDER_UNAVAILABLE',
    errorMessage: '联网搜索额度不足',
    errorDetails: { providers: { web_search: { code: 'WEB_SEARCH_QuotaExceeded' } } },
  });
  const failedRun = repository.listMonitorRuns('stock-1', 1)[0];
  assert.equal(
    failedRun.error_details.providers.web_search.code,
    'WEB_SEARCH_QuotaExceeded',
  );
});

test('lists every saved report when no explicit history limit is requested', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'investment-assistant-history-'));
  const databasePath = path.join(directory, 'history.sqlite');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const repository = createDatabase(databasePath);
  t.after(() => repository.close());
  const stock = repository.createStock({
    name: '示例科技',
    code: '000001.SZ',
    exchange: 'CN',
    focus: ['经营情况'],
  });

  for (let index = 0; index < 25; index += 1) {
    const generatedAt = new Date(Date.UTC(2026, 6, 1, 0, index)).toISOString();
    repository.saveReport({
      id: `report-${index}`,
      stock_id: stock.id,
      type: 'monitor',
      status: 'completed',
      generated_at: generatedAt,
      data_as_of: '2026-07-01',
      evidence_fingerprint: `fingerprint-${index}`,
      change_status: index === 0 ? 'initial' : 'no_material_change',
      provider_status: {},
      model_usage: {},
      report: {
        type: 'monitor',
        generated_at: generatedAt,
        analysis: {
          summary: `第 ${index + 1} 次报告`,
          sections: [{ title: '市场异动', claims: [{ text: `记录 ${index + 1}` }] }],
        },
      },
    });
  }

  assert.equal(repository.listReports(stock.id, 'monitor').length, 25);
  assert.equal(repository.listReports(stock.id, 'monitor', 7).length, 7);
});

test('never persists raw web-search content in report_json', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'investment-assistant-storage-'));
  const databasePath = path.join(directory, 'storage.sqlite');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const repository = createDatabase(databasePath);
  const stock = repository.createStock({
    name: '示例科技',
    code: '000001.SZ',
    exchange: 'CN',
    focus: ['行业动态'],
  });
  repository.saveReport({
    id: 'report-storage',
    stock_id: stock.id,
    type: 'brief',
    status: 'completed',
    generated_at: '2026-07-27T10:00:00.000Z',
    data_as_of: '2026-07-27',
    evidence_fingerprint: 'fingerprint-storage',
    change_status: 'initial',
    provider_status: {},
    model_usage: {},
    report: {
      analysis: {
        summary: '示例科技发布了最新产品进展。',
        summary_evidence_ids: ['W1'],
        change_summary: '首次生成。',
        change_evidence_ids: [],
        sections: [{
          title: '关注方向',
          claims: [{
            text: '示例科技发布了最新产品进展，后续关注正式披露的实施节奏。',
            evidence_ids: ['W1'],
          }],
        }],
        conclusion: {
          text: '继续跟踪正式披露。',
          evidence_ids: ['W1'],
        },
      },
      evidence: [{
        id: 'W1',
        type: 'web_search',
        title: '示例科技发布最新产品',
        publisher: '示例媒体',
        url: 'https://example.com/product',
        content: 'RAW_DATABASE_PROVIDER_CONTENT_SENTINEL',
        semantic_matches: [{
          preference: '行业动态',
          scope: 'company',
          quote: 'RAW_DATABASE_PROVIDER_QUOTE_SENTINEL',
        }],
      }],
      preference_coverage: [{
        preference: '行业动态',
        expected_section: '关注方向',
        status: 'covered',
        evidence_ids: ['W1'],
      }],
    },
  });
  repository.close();

  const raw = new DatabaseSync(databasePath, { readOnly: true });
  const storedJson = raw.prepare('SELECT report_json FROM reports WHERE id = ?')
    .get('report-storage').report_json;
  raw.close();
  assert.doesNotMatch(storedJson, /RAW_DATABASE_PROVIDER_/);

  const reopened = createDatabase(databasePath);
  t.after(() => reopened.close());
  const source = reopened.getLatestReport(stock.id, 'brief').report.evidence[0];
  assert.equal(source.title, '示例科技发布最新产品');
  assert.equal(source.url, 'https://example.com/product');
  assert.match(source.content, /最新产品进展/);
});

test('migrates raw web-search content already stored by an earlier version', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'investment-assistant-report-migration-'));
  const databasePath = path.join(directory, 'migration.sqlite');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const repository = createDatabase(databasePath);
  const stock = repository.createStock({
    name: '示例科技',
    code: '000001.SZ',
    exchange: 'CN',
    focus: ['公告'],
  });
  repository.close();

  const legacy = new DatabaseSync(databasePath);
  const legacyReport = {
    analysis: {
      summary: '示例科技披露了新的经营安排。',
      summary_evidence_ids: ['W1'],
      change_summary: '首次生成。',
      change_evidence_ids: [],
      sections: [{
        title: '关注方向',
        claims: [{
          text: '示例科技披露了新的经营安排，具体执行情况以后续公告为准。',
          evidence_ids: ['W1'],
        }],
      }],
      conclusion: {
        text: '继续跟踪后续公告。',
        evidence_ids: ['W1'],
      },
    },
    evidence: [{
      id: 'W1',
      type: 'web_search',
      title: '示例科技经营安排公告',
      publisher: '示例媒体',
      url: 'https://example.com/notice',
      content: 'LEGACY_RAW_PROVIDER_CONTENT_SENTINEL',
    }],
  };
  legacy.prepare(`
    INSERT INTO reports (
      id, stock_id, type, status, generated_at, data_as_of,
      evidence_fingerprint, change_status, report_json,
      provider_status_json, model_usage_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'legacy-report',
    stock.id,
    'brief',
    'completed',
    '2026-07-27T10:00:00.000Z',
    '2026-07-27',
    'legacy-fingerprint',
    'initial',
    JSON.stringify(legacyReport),
    '{}',
    '{}',
    '2026-07-27T10:00:00.000Z',
  );
  legacy.close();

  const migrated = createDatabase(databasePath);
  t.after(() => migrated.close());
  const report = migrated.getLatestReport(stock.id, 'brief').report;
  const serialized = JSON.stringify(report);

  assert.doesNotMatch(serialized, /LEGACY_RAW_PROVIDER_CONTENT_SENTINEL/);
  assert.equal(report.evidence[0].url, 'https://example.com/notice');
  assert.match(report.evidence[0].content, /新的经营安排/);
});
