import { loadConfig } from './config.js';
import { createRuntime } from './bootstrap.js';
import { logger } from './logger.js';

const config = loadConfig({ ENABLE_SCHEDULER: true });
const runtime = createRuntime(config);
let tickRunning = false;

async function tick() {
  if (tickRunning) return;
  tickRunning = true;
  try {
    const results = await runtime.monitorService.runDue();
    if (results.length) logger.info('worker_monitors_completed', { results });
  } catch (error) {
    logger.error('worker_tick_failed', { code: error.code || 'WORKER_ERROR', message: error.message });
  } finally {
    tickRunning = false;
  }
}

logger.info('worker_started', { timezone: config.timezone });
await tick();
const timer = setInterval(tick, 30_000);

function shutdown(signal) {
  logger.info('worker_stopping', { signal });
  clearInterval(timer);
  runtime.repository.close();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
