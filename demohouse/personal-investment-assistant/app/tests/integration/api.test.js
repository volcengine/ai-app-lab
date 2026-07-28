import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createDatabase } from '../../src/server/db/database.js';
import { createApp } from '../../src/server/app.js';

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'investment-assistant-test-'));
  const staticDir = path.join(directory, 'dist');
  fs.mkdirSync(staticDir);
  fs.writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html><html><body><div id="root"></div></body></html>');
  const databasePath = path.join(directory, 'test.sqlite');
  const repository = createDatabase(databasePath);
  const config = {
    nodeEnv: 'test',
    webOrigin: 'http://127.0.0.1:5174',
    timezone: 'Asia/Shanghai',
    schedulerEnabled: false,
    apiToken: '',
    staticDir,
    databasePath,
    providerHealthPath: path.join(directory, 'provider-health.json'),
    providerHealthTtlMs: 900_000,
    ark: { apiKey: 'configured', model: 'test' },
    dataPro: { apiKey: 'configured' },
    webSearch: { apiKey: 'configured' },
  };
  const reportService = {
    generate: async ({ stockId, type }) => ({ id: randomId, stock_id: stockId, type }),
  };
  const monitorService = {
    run: async (stockId) => ({ report: { id: randomId, stock_id: stockId, type: 'monitor' } }),
  };
  const runtime = {
    repository,
    reportService,
    monitorService,
    dataPro: { probe: async () => ({ ok: true }) },
    webSearch: { probe: async () => ({ ok: true }) },
    model: { probe: async () => ({ ok: true }) },
  };
  return {
    app: createApp({ config, runtime }),
    config,
    repository,
    close() {
      repository.close();
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

const randomId = '00000000-0000-4000-8000-000000000001';

test('serves the built frontend and requires a fresh live provider check for readiness', async (t) => {
  const context = fixture();
  t.after(() => context.close());

  const frontend = await request(context.app).get('/').expect(200).expect('Content-Type', /html/);
  assert.match(frontend.text, /id="root"/);

  const beforeDoctor = await request(context.app).get('/api/health/ready').expect(503);
  assert.equal(beforeDoctor.body.configured, true);
  assert.equal(beforeDoctor.body.live_check.checked, false);

  const doctor = await request(context.app).post('/api/doctor').send({ live: true }).expect(200);
  assert.equal(doctor.body.ok, true);
  assert.equal(doctor.body.live, true);
  assert.equal(doctor.body.providers.agent_plan_model.ok, true);
  assert.equal(doctor.body.providers.ark_model, undefined);

  const ready = await request(context.app).get('/api/health/ready').expect(200);
  assert.equal(ready.body.ok, true);
  assert.equal(ready.body.live_check.fresh, true);
  assert.equal(ready.body.live_check.providers.web_search.ok, true);
  assert.equal(ready.body.live_check.providers.agent_plan_model.ok, true);
  assert.equal(fs.statSync(context.config.providerHealthPath).mode & 0o777, 0o600);
  for (const suffix of ['', '-wal', '-shm']) {
    assert.equal(fs.statSync(`${context.config.databasePath}${suffix}`).mode & 0o777, 0o600);
  }
});

test('does not rate-limit read-only UI polling', async (t) => {
  const context = fixture();
  t.after(() => context.close());

  for (let index = 0; index < 75; index += 1) {
    const response = await request(context.app).get('/api/health/live').expect(200);
    assert.equal(response.headers['ratelimit-limit'], undefined);
  }
});

test('watchlist, report, and monitor settings API flow', async (t) => {
  const context = fixture();
  t.after(() => context.close());

  const created = await request(context.app).post('/api/stocks').send({
    name: '示例科技',
    code: 'TEST1',
    exchange: 'CN',
    focus: ['收入', '公告'],
  }).expect(201);

  await request(context.app).get('/api/reports/latest').query({
    stock_id: created.body.id,
    type: 'brief',
  }).expect(404);

  const generated = await request(context.app).post('/api/reports/generate').send({
    stock_id: created.body.id,
    type: 'brief',
  }).expect(201);
  assert.equal(generated.body.id, randomId);

  const updated = await request(context.app).put(`/api/stocks/${created.body.id}`).send({
    name: '示例科技更新',
    code: 'TEST1',
    exchange: 'CN',
    focus: ['收入'],
  }).expect(200);
  assert.equal(updated.body.name, '示例科技更新');

  const settings = await request(context.app).put(`/api/monitor/settings/${created.body.id}`).send({
    enabled: true,
    schedule_time: '18:00',
    schedule_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    timezone: 'Asia/Shanghai',
  }).expect(200);
  assert.equal(settings.body.enabled, true);

  const runs = await request(context.app).get(`/api/monitor/runs/${created.body.id}`).expect(200);
  assert.deepEqual(runs.body.items, []);

  await request(context.app).put(`/api/monitor/settings/${created.body.id}`).send({
    enabled: true,
    schedule_time: '18:00',
    schedule_days: ['Mon'],
    timezone: 'Not/A_Timezone',
  }).expect(400);
});

test('rejects unsupported markets and duplicate securities', async (t) => {
  const context = fixture();
  t.after(() => context.close());
  const stock = { name: '示例科技', code: 'TEST1', exchange: 'CN', focus: ['公告'] };
  await request(context.app).post('/api/stocks').send(stock).expect(201);
  await request(context.app).post('/api/stocks').send(stock).expect(409);
  await request(context.app).post('/api/stocks').send({ ...stock, code: 'TEST2', exchange: 'OTHER' }).expect(400);
});

test('exposes a privacy-safe local usage ledger and summary', async (t) => {
  const context = fixture();
  t.after(() => context.close());
  const created = await request(context.app).post('/api/stocks').send({
    name: '示例科技',
    code: 'TEST1',
    exchange: 'CN',
    focus: ['公告'],
  }).expect(201);

  context.repository.recordUsageEvent({
    report_id: randomId,
    stock_id: created.body.id,
    report_type: 'brief',
    provider: 'datapro',
    operation: 'search',
    status: 'succeeded',
    request_count: 1,
    metadata: { result_count: 3 },
  });
  context.repository.recordUsageEvent({
    report_id: randomId,
    stock_id: created.body.id,
    report_type: 'brief',
    provider: 'ark_model',
    operation: 'report_generation',
    status: 'succeeded',
    request_count: 1,
    input_tokens: 80,
    output_tokens: 20,
    total_tokens: 100,
    metadata: { model: 'test' },
  });

  const log = await request(context.app).get('/api/usage-log').expect(200);
  assert.equal(log.body.authoritative_afp_billing, false);
  assert.equal(log.body.items.length, 2);
  assert.equal(log.body.items.find((item) => item.provider === 'ark_model').metadata.model, 'test');

  const summary = await request(context.app).get('/api/usage-summary').expect(200);
  assert.equal(summary.body.scope, 'local_operational_ledger');
  assert.equal(summary.body.authoritative_afp_billing, false);
  assert.equal(summary.body.totals.request_count, 2);
  assert.equal(summary.body.totals.total_tokens, 100);
  assert.equal(summary.body.providers.length, 2);
});
