import { createDatabase } from './db/database.js';
import { DataProProvider } from './providers/datapro.js';
import { WebSearchProvider } from './providers/web-search.js';
import { AgentPlanModelProvider } from './providers/agent-plan-model.js';
import { ReportService } from './services/report-service.js';
import { MonitorService } from './services/monitor-service.js';

export function createRuntime(config, overrides = {}) {
  const repository = overrides.repository || createDatabase(config.databasePath);
  const dataPro = overrides.dataPro || new DataProProvider(config);
  const webSearch = overrides.webSearch || new WebSearchProvider(config);
  const model = overrides.model || new AgentPlanModelProvider(config);
  const reportService = overrides.reportService || new ReportService({ repository, dataPro, webSearch, model, config });
  const monitorService = overrides.monitorService || new MonitorService({ repository, reportService, config });
  return { repository, dataPro, webSearch, model, reportService, monitorService };
}
