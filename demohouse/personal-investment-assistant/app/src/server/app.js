import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { AppError } from './errors.js';
import { logger } from './logger.js';
import { publicConfig } from './config.js';
import { nextScheduledRun } from './domain/time.js';
import { runDoctor } from './services/doctor-service.js';
import { readProviderHealth, writeProviderHealth } from './services/provider-health.js';

const stockSchema = z.object({
  name: z.string().trim().min(1).max(80),
  code: z.string().trim().regex(/^[A-Za-z0-9.-]{1,20}$/),
  exchange: z.enum(['CN', 'HK', 'US']).default('CN'),
  focus: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
});

const timezoneSchema = z.string().min(1).max(80).refine((value) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}, '无效的 IANA 时区');

const reportRequestSchema = z.object({
  stock_id: z.string().uuid(),
  type: z.enum(['brief', 'monitor']),
});

const scheduleSchema = z.object({
  enabled: z.boolean(),
  schedule_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  schedule_days: z.array(z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])).min(1),
  timezone: timezoneSchema,
});

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function requireApiToken(config) {
  return (req, res, next) => {
    if (!config.apiToken || req.path.startsWith('/health/') || req.path === '/meta') return next();
    const token = req.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (token !== config.apiToken) return next(new AppError('未授权', { code: 'UNAUTHORIZED', status: 401 }));
    return next();
  };
}

export function createApp({ config, runtime }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '256kb' }));
  app.use((req, res, next) => {
    req.id = req.get('x-request-id') || randomUUID();
    res.setHeader('X-Request-Id', req.id);
    const origin = req.get('origin');
    if (origin && origin === config.webOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(origin === config.webOrigin ? 204 : 403);
    const started = Date.now();
    res.on('finish', () => logger.info('http_request', {
      request_id: req.id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Date.now() - started,
    }));
    return next();
  });
  app.use('/api', rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
  }));
  app.use('/api', requireApiToken(config));

  app.get('/api/health/live', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  app.get('/api/health/ready', (req, res) => {
    const meta = publicConfig(config);
    const configured = Object.values(meta.providers).every((provider) => provider.configured);
    const liveCheck = readProviderHealth(config);
    const ready = configured && liveCheck.ok;
    res.status(ready ? 200 : 503).json({
      ok: ready,
      configured,
      ...meta,
      live_check: liveCheck,
    });
  });

  app.get('/api/meta', (req, res) => res.json({
    name: '个人投资助手',
    disclaimer: '仅供信息整理和研究辅助，不构成投资建议。',
    ...publicConfig(config),
  }));

  app.post('/api/doctor', asyncRoute(async (req, res) => {
    const live = z.object({ live: z.boolean().default(false) }).parse(req.body || {}).live;
    const result = await runDoctor({ ...runtime, live });
    writeProviderHealth(config, result);
    res.status(result.ok ? 200 : 503).json(result);
  }));

  app.get('/api/stocks', (req, res) => res.json({ items: runtime.repository.listStocks() }));

  app.post('/api/stocks', (req, res, next) => {
    try {
      const input = stockSchema.parse(req.body);
      const stock = runtime.repository.createStock({ ...input, timezone: config.timezone });
      res.status(201).json(stock);
    } catch (error) {
      if (String(error?.message).includes('UNIQUE constraint failed')) {
        return next(new AppError('该证券代码已在关注列表中', { code: 'STOCK_ALREADY_EXISTS', status: 409 }));
      }
      return next(error);
    }
  });

  app.put('/api/stocks/:stockId', (req, res, next) => {
    try {
      const input = stockSchema.parse(req.body);
      const stock = runtime.repository.updateStock(req.params.stockId, input);
      if (!stock) throw new AppError('关注标的不存在', { code: 'STOCK_NOT_FOUND', status: 404 });
      res.json(stock);
    } catch (error) {
      if (String(error?.message).includes('UNIQUE constraint failed')) {
        return next(new AppError('该证券代码已在关注列表中', { code: 'STOCK_ALREADY_EXISTS', status: 409 }));
      }
      return next(error);
    }
  });

  app.delete('/api/stocks/:stockId', (req, res) => {
    const deleted = runtime.repository.deleteStock(req.params.stockId);
    if (!deleted) throw new AppError('关注标的不存在', { code: 'STOCK_NOT_FOUND', status: 404 });
    res.sendStatus(204);
  });

  app.get('/api/reports/latest', (req, res) => {
    const query = z.object({ stock_id: z.string().uuid(), type: z.enum(['brief', 'monitor']) }).parse(req.query);
    const item = runtime.repository.getLatestReport(query.stock_id, query.type);
    if (!item) return res.status(404).json({ error: { code: 'REPORT_NOT_FOUND', message: '暂无历史报告' } });
    return res.json(item);
  });

  app.get('/api/reports/history', (req, res) => {
    const query = z.object({
      stock_id: z.string().uuid(),
      type: z.enum(['brief', 'monitor']),
      limit: z.coerce.number().int().min(1).max(50).optional(),
    }).parse(req.query);
    res.json({ items: runtime.repository.listReports(query.stock_id, query.type, query.limit) });
  });

  app.post('/api/reports/generate', asyncRoute(async (req, res) => {
    const input = reportRequestSchema.parse(req.body);
    const report = input.type === 'monitor'
      ? (await runtime.monitorService.run(input.stock_id, { trigger: 'manual' })).report
      : await runtime.reportService.generate({ stockId: input.stock_id, type: input.type });
    res.status(201).json(report);
  }));

  app.get('/api/usage-log', (req, res) => {
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(req.query);
    res.json({
      scope: 'local_operational_ledger',
      authoritative_afp_billing: false,
      items: runtime.repository.listUsageEvents(query.limit),
    });
  });

  app.get('/api/usage-summary', (req, res) => {
    res.json(runtime.repository.getUsageSummary());
  });

  app.get('/api/monitor/status', (req, res) => {
    const status = typeof runtime.monitorService.status === 'function'
      ? runtime.monitorService.status()
      : { enabled: config.schedulerEnabled, last_tick_at: null };
    res.json(status);
  });

  app.get('/api/monitor/settings/:stockId', (req, res) => {
    const settings = runtime.repository.getMonitorSettings(req.params.stockId);
    if (!settings) throw new AppError('关注标的不存在', { code: 'STOCK_NOT_FOUND', status: 404 });
    res.json({ ...settings, next_run: nextScheduledRun(settings) });
  });

  app.get('/api/monitor/runs/:stockId', (req, res) => {
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(50).default(20),
    }).parse(req.query);
    if (!runtime.repository.getStock(req.params.stockId)) {
      throw new AppError('关注标的不存在', { code: 'STOCK_NOT_FOUND', status: 404 });
    }
    res.json({ items: runtime.repository.listMonitorRuns(req.params.stockId, query.limit) });
  });

  app.put('/api/monitor/settings/:stockId', (req, res) => {
    const input = scheduleSchema.parse(req.body);
    const settings = runtime.repository.updateMonitorSettings(req.params.stockId, input);
    if (!settings) throw new AppError('关注标的不存在', { code: 'STOCK_NOT_FOUND', status: 404 });
    res.json({ ...settings, next_run: nextScheduledRun(settings) });
  });

  app.use(express.static(config.staticDir, { index: false, maxAge: config.nodeEnv === 'production' ? '1h' : 0 }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    const indexPath = path.join(config.staticDir, 'index.html');
    try {
      return res.type('html').send(fs.readFileSync(indexPath));
    } catch (error) {
      if (error.code === 'ENOENT') return res.status(404).send('Frontend build not found. Run npm run build.');
      return next(error);
    }
  });

  app.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: '接口不存在' } }));

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const isZod = error instanceof z.ZodError;
    const status = isZod ? 400 : error.status || 500;
    const code = isZod ? 'INVALID_REQUEST' : error.code || 'INTERNAL_ERROR';
    logger.error('request_failed', {
      request_id: req.id,
      code,
      status,
      message: error.message,
    });
    return res.status(status).json({
      error: {
        code,
        message: status >= 500 && code === 'INTERNAL_ERROR' ? '服务发生内部错误' : error.message,
        details: isZod ? error.issues : error.details,
        request_id: req.id,
      },
    });
  });

  return app;
}
