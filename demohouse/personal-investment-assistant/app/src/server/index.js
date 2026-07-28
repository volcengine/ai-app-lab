import fs from 'node:fs';
import { loadConfig } from './config.js';
import { createRuntime } from './bootstrap.js';
import { createApp } from './app.js';
import { logger } from './logger.js';

const config = loadConfig();
fs.mkdirSync(config.dataDir, { recursive: true });
const runtime = createRuntime(config);
const app = createApp({ config, runtime });
const server = app.listen(config.port, config.host, () => {
  logger.info('server_started', {
    url: `http://${config.host}:${config.port}`,
    scheduler_enabled: config.schedulerEnabled,
  });
});

let schedulerTimer;
if (config.schedulerEnabled) {
  let schedulerRunning = false;
  const tick = async () => {
    if (schedulerRunning) return;
    schedulerRunning = true;
    try {
      const results = await runtime.monitorService.runDue();
      if (results.length) logger.info('scheduled_monitors_completed', { results });
    } catch (error) {
      logger.error('scheduler_tick_failed', { code: error.code || 'SCHEDULER_ERROR', message: error.message });
    } finally {
      schedulerRunning = false;
    }
  };
  schedulerTimer = setInterval(tick, 30_000);
  schedulerTimer.unref();
  setTimeout(tick, 1000).unref();
}

function shutdown(signal) {
  logger.info('server_stopping', { signal });
  if (schedulerTimer) clearInterval(schedulerTimer);
  server.close(() => {
    runtime.repository.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
