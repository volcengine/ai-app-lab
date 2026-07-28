import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { sanitizeReportForStorage } from '../domain/report-storage.js';

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function mapStock(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    exchange: row.exchange,
    focus: parseJson(row.focus_json, []),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapSettings(row) {
  if (!row) return null;
  return {
    stock_id: row.stock_id,
    enabled: Boolean(row.enabled),
    schedule_time: row.schedule_time,
    schedule_days: parseJson(row.schedule_days_json, []),
    timezone: row.timezone,
    last_run_at: row.last_run_at,
    last_run_date: row.last_run_date,
    schedule_attempt_date: row.schedule_attempt_date,
    schedule_retry_count: Number(row.schedule_retry_count || 0),
    next_retry_at: row.next_retry_at,
    last_error_code: row.last_error_code,
    last_error_message: row.last_error_message,
    last_error_details: parseJson(row.last_error_details_json, null),
    updated_at: row.updated_at,
  };
}

function mapReport(row) {
  if (!row) return null;
  return {
    id: row.id,
    stock_id: row.stock_id,
    type: row.type,
    status: row.status,
    generated_at: row.generated_at,
    data_as_of: row.data_as_of,
    evidence_fingerprint: row.evidence_fingerprint,
    change_status: row.change_status,
    report: parseJson(row.report_json, {}),
    provider_status: parseJson(row.provider_status_json, {}),
    model_usage: parseJson(row.model_usage_json, {}),
  };
}

function mapMonitorRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    stock_id: row.stock_id,
    report_id: row.report_id,
    trigger: row.trigger || 'legacy',
    scheduled_for: row.scheduled_for,
    status: row.status,
    started_at: row.started_at,
    completed_at: row.completed_at,
    error_code: row.error_code,
    error_message: row.error_message,
    error_details: parseJson(row.error_details_json, null),
  };
}

function mapUsageEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    report_id: row.report_id,
    stock_id: row.stock_id,
    report_type: row.report_type,
    provider: row.provider,
    operation: row.operation,
    status: row.status,
    request_count: row.request_count,
    input_tokens: row.input_tokens,
    output_tokens: row.output_tokens,
    total_tokens: row.total_tokens,
    error_code: row.error_code,
    metadata: parseJson(row.metadata_json, {}),
    created_at: row.created_at,
  };
}

function migrateStoredReports(db) {
  const rows = db.prepare('SELECT id, report_json FROM reports').all();
  if (!rows.length) return;
  const update = db.prepare('UPDATE reports SET report_json = ? WHERE id = ?');
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const row of rows) {
      const report = parseJson(row.report_json, null);
      if (!report) continue;
      const storedJson = JSON.stringify(sanitizeReportForStorage(report));
      if (storedJson !== row.report_json) update.run(storedJson, row.id);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function createDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(databasePath);
  fs.chmodSync(databasePath, 0o600);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  for (const suffix of ['-wal', '-shm']) {
    const sidecarPath = `${databasePath}${suffix}`;
    if (fs.existsSync(sidecarPath)) fs.chmodSync(sidecarPath, 0o600);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS stocks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      exchange TEXT NOT NULL DEFAULT 'CN',
      focus_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(code, exchange)
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      stock_id TEXT NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('brief', 'monitor')),
      status TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      data_as_of TEXT,
      evidence_fingerprint TEXT NOT NULL,
      change_status TEXT NOT NULL,
      report_json TEXT NOT NULL,
      provider_status_json TEXT NOT NULL,
      model_usage_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS reports_stock_type_generated_idx
      ON reports(stock_id, type, generated_at DESC);

    CREATE TABLE IF NOT EXISTS monitor_settings (
      stock_id TEXT PRIMARY KEY REFERENCES stocks(id) ON DELETE CASCADE,
      enabled INTEGER NOT NULL DEFAULT 0,
      schedule_time TEXT NOT NULL DEFAULT '18:00',
      schedule_days_json TEXT NOT NULL DEFAULT '["Mon","Tue","Wed","Thu","Fri"]',
      timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
      last_run_at TEXT,
      last_run_date TEXT,
      last_error_details_json TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS monitor_runs (
      id TEXT PRIMARY KEY,
      stock_id TEXT NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
      report_id TEXT REFERENCES reports(id) ON DELETE SET NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      error_code TEXT,
      error_message TEXT,
      error_details_json TEXT
    );

    CREATE TABLE IF NOT EXISTS monitor_leases (
      stock_id TEXT PRIMARY KEY REFERENCES stocks(id) ON DELETE CASCADE,
      owner TEXT NOT NULL,
      locked_until TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS usage_events (
      id TEXT PRIMARY KEY,
      report_id TEXT,
      stock_id TEXT,
      report_type TEXT,
      provider TEXT NOT NULL,
      operation TEXT NOT NULL,
      status TEXT NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 1,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      error_code TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS usage_events_created_idx
      ON usage_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS usage_events_report_idx
      ON usage_events(report_id, created_at ASC);
  `);

  const ensureColumn = (table, column, definition) => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some((item) => item.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };
  ensureColumn('monitor_settings', 'schedule_attempt_date', 'TEXT');
  ensureColumn('monitor_settings', 'schedule_retry_count', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('monitor_settings', 'next_retry_at', 'TEXT');
  ensureColumn('monitor_settings', 'last_error_code', 'TEXT');
  ensureColumn('monitor_settings', 'last_error_message', 'TEXT');
  ensureColumn('monitor_settings', 'last_error_details_json', 'TEXT');
  ensureColumn('monitor_runs', 'trigger', "TEXT NOT NULL DEFAULT 'legacy'");
  ensureColumn('monitor_runs', 'scheduled_for', 'TEXT');
  ensureColumn('monitor_runs', 'error_details_json', 'TEXT');
  migrateStoredReports(db);

  return {
    close() { db.close(); },

    listStocks() {
      return db.prepare('SELECT * FROM stocks ORDER BY created_at ASC').all().map(mapStock);
    },

    getStock(id) {
      return mapStock(db.prepare('SELECT * FROM stocks WHERE id = ?').get(id));
    },

    createStock(input) {
      const now = new Date().toISOString();
      const stock = {
        id: randomUUID(),
        name: input.name.trim(),
        code: input.code.trim(),
        exchange: input.exchange || 'CN',
        focus: input.focus || [],
        created_at: now,
        updated_at: now,
      };
      db.prepare(`
        INSERT INTO stocks (id, name, code, exchange, focus_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(stock.id, stock.name, stock.code, stock.exchange, JSON.stringify(stock.focus), now, now);
      db.prepare(`
        INSERT INTO monitor_settings (stock_id, timezone, updated_at)
        VALUES (?, ?, ?)
      `).run(stock.id, input.timezone || 'Asia/Shanghai', now);
      return stock;
    },

    updateStock(id, input) {
      const now = new Date().toISOString();
      const result = db.prepare(`
        UPDATE stocks SET name = ?, code = ?, exchange = ?, focus_json = ?, updated_at = ?
        WHERE id = ?
      `).run(
        input.name.trim(),
        input.code.trim(),
        input.exchange,
        JSON.stringify(input.focus),
        now,
        id,
      );
      return result.changes ? this.getStock(id) : null;
    },

    deleteStock(id) {
      return db.prepare('DELETE FROM stocks WHERE id = ?').run(id).changes > 0;
    },

    getLatestReport(stockId, type) {
      return mapReport(db.prepare(`
        SELECT * FROM reports WHERE stock_id = ? AND type = ?
        ORDER BY generated_at DESC LIMIT 1
      `).get(stockId, type));
    },

    listReports(stockId, type, limit = null) {
      const query = `
        SELECT * FROM reports WHERE stock_id = ? AND type = ?
        ORDER BY generated_at DESC
      `;
      const rows = limit == null
        ? db.prepare(query).all(stockId, type)
        : db.prepare(`${query} LIMIT ?`).all(stockId, type, limit);
      return rows.map(mapReport);
    },

    saveReport(record) {
      const storedReport = sanitizeReportForStorage(record.report);
      db.prepare(`
        INSERT INTO reports (
          id, stock_id, type, status, generated_at, data_as_of,
          evidence_fingerprint, change_status, report_json,
          provider_status_json, model_usage_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id,
        record.stock_id,
        record.type,
        record.status,
        record.generated_at,
        record.data_as_of || null,
        record.evidence_fingerprint,
        record.change_status,
        JSON.stringify(storedReport),
        JSON.stringify(record.provider_status || {}),
        JSON.stringify(record.model_usage || {}),
        new Date().toISOString(),
      );
      return this.getLatestReport(record.stock_id, record.type);
    },

    getMonitorSettings(stockId) {
      return mapSettings(db.prepare('SELECT * FROM monitor_settings WHERE stock_id = ?').get(stockId));
    },

    listEnabledMonitorSettings() {
      return db.prepare('SELECT * FROM monitor_settings WHERE enabled = 1').all().map(mapSettings);
    },

    updateMonitorSettings(stockId, input) {
      const current = this.getMonitorSettings(stockId);
      if (!current) return null;
      const next = { ...current, ...input, updated_at: new Date().toISOString() };
      const scheduleChanged = (
        (Object.hasOwn(input, 'enabled') && input.enabled !== current.enabled)
        || (Object.hasOwn(input, 'schedule_time') && input.schedule_time !== current.schedule_time)
        || (Object.hasOwn(input, 'schedule_days')
          && JSON.stringify(input.schedule_days) !== JSON.stringify(current.schedule_days))
        || (Object.hasOwn(input, 'timezone') && input.timezone !== current.timezone)
      );
      if (scheduleChanged) {
        next.last_run_date = null;
        next.schedule_attempt_date = null;
        next.schedule_retry_count = 0;
        next.next_retry_at = null;
        next.last_error_code = null;
        next.last_error_message = null;
        next.last_error_details = null;
      }
      db.prepare(`
        UPDATE monitor_settings SET enabled = ?, schedule_time = ?, schedule_days_json = ?,
          timezone = ?, last_run_at = ?, last_run_date = ?,
          schedule_attempt_date = ?, schedule_retry_count = ?, next_retry_at = ?,
          last_error_code = ?, last_error_message = ?, last_error_details_json = ?, updated_at = ?
        WHERE stock_id = ?
      `).run(
        next.enabled ? 1 : 0,
        next.schedule_time,
        JSON.stringify(next.schedule_days),
        next.timezone,
        next.last_run_at || null,
        next.last_run_date || null,
        next.schedule_attempt_date || null,
        Number(next.schedule_retry_count || 0),
        next.next_retry_at || null,
        next.last_error_code || null,
        next.last_error_message || null,
        next.last_error_details ? JSON.stringify(next.last_error_details) : null,
        next.updated_at,
        stockId,
      );
      return this.getMonitorSettings(stockId);
    },

    createMonitorRun(stockId, {
      trigger = 'manual',
      scheduledFor = null,
      startedAt = new Date().toISOString(),
    } = {}) {
      const id = randomUUID();
      db.prepare(`
        INSERT INTO monitor_runs (id, stock_id, trigger, scheduled_for, status, started_at)
        VALUES (?, ?, ?, ?, 'running', ?)
      `).run(id, stockId, trigger, scheduledFor, startedAt);
      return id;
    },

    listMonitorRuns(stockId, limit = 20) {
      return db.prepare(`
        SELECT * FROM monitor_runs WHERE stock_id = ?
        ORDER BY started_at DESC LIMIT ?
      `).all(stockId, limit).map(mapMonitorRun);
    },

    tryAcquireMonitorLease(stockId, owner, ttlMs = 10 * 60 * 1000) {
      const now = new Date().toISOString();
      const lockedUntil = new Date(Date.now() + ttlMs).toISOString();
      const result = db.prepare(`
        INSERT INTO monitor_leases (stock_id, owner, locked_until) VALUES (?, ?, ?)
        ON CONFLICT(stock_id) DO UPDATE SET owner = excluded.owner, locked_until = excluded.locked_until
        WHERE monitor_leases.locked_until < ?
      `).run(stockId, owner, lockedUntil, now);
      return result.changes > 0;
    },

    releaseMonitorLease(stockId, owner) {
      db.prepare('DELETE FROM monitor_leases WHERE stock_id = ? AND owner = ?').run(stockId, owner);
    },

    finishMonitorRun(id, {
      status,
      reportId = null,
      errorCode = null,
      errorMessage = null,
      errorDetails = null,
    }) {
      db.prepare(`
        UPDATE monitor_runs SET status = ?, report_id = ?, completed_at = ?,
          error_code = ?, error_message = ?, error_details_json = ? WHERE id = ?
      `).run(
        status,
        reportId,
        new Date().toISOString(),
        errorCode,
        errorMessage,
        errorDetails ? JSON.stringify(errorDetails) : null,
        id,
      );
    },

    recordUsageEvent(input) {
      const event = {
        id: input.id || randomUUID(),
        report_id: input.report_id || null,
        stock_id: input.stock_id || null,
        report_type: input.report_type || null,
        provider: input.provider,
        operation: input.operation,
        status: input.status,
        request_count: Number(input.request_count || 1),
        input_tokens: Number(input.input_tokens || 0),
        output_tokens: Number(input.output_tokens || 0),
        total_tokens: Number(input.total_tokens || 0),
        error_code: input.error_code || null,
        metadata: input.metadata || {},
        created_at: input.created_at || new Date().toISOString(),
      };
      db.prepare(`
        INSERT INTO usage_events (
          id, report_id, stock_id, report_type, provider, operation, status,
          request_count, input_tokens, output_tokens, total_tokens, error_code,
          metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        event.id,
        event.report_id,
        event.stock_id,
        event.report_type,
        event.provider,
        event.operation,
        event.status,
        event.request_count,
        event.input_tokens,
        event.output_tokens,
        event.total_tokens,
        event.error_code,
        JSON.stringify(event.metadata),
        event.created_at,
      );
      return event;
    },

    listUsageEvents(limit = 100) {
      return db.prepare(`
        SELECT * FROM usage_events ORDER BY created_at DESC LIMIT ?
      `).all(limit).map(mapUsageEvent);
    },

    getUsageSummary() {
      const totals = db.prepare(`
        SELECT COUNT(*) AS event_count,
          COALESCE(SUM(request_count), 0) AS request_count,
          COALESCE(SUM(input_tokens), 0) AS input_tokens,
          COALESCE(SUM(output_tokens), 0) AS output_tokens,
          COALESCE(SUM(total_tokens), 0) AS total_tokens
        FROM usage_events
      `).get();
      const providers = db.prepare(`
        SELECT provider,
          COUNT(*) AS event_count,
          COALESCE(SUM(request_count), 0) AS request_count,
          COALESCE(SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END), 0) AS succeeded,
          COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed,
          COALESCE(SUM(total_tokens), 0) AS total_tokens
        FROM usage_events GROUP BY provider ORDER BY provider ASC
      `).all();
      return {
        scope: 'local_operational_ledger',
        authoritative_afp_billing: false,
        totals,
        providers,
        generated_at: new Date().toISOString(),
      };
    },
  };
}
