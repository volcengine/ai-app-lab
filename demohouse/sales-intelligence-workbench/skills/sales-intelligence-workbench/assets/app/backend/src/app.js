import http from "node:http";
import { fileURLToPath } from "node:url";
import { getProviderStatus } from "./config/providerConfig.js";
import { createEnvReader } from "./config/runtimeEnv.js";
import { createRuntimePolicy } from "./config/runtimePolicy.js";
import { createWebSearchProvider } from "./providers/webSearchProvider.js";
import { createModelProvider } from "./providers/modelProvider.js";
import { createDataProProvider } from "./providers/dataProProvider.js";
import { createOpenVikingProvider } from "./providers/openVikingProvider.js";
import { createSupabaseDataProvider } from "./providers/supabaseDataProvider.js";
import { SupabaseDataRepository } from "./repositories/supabaseDataRepository.js";
import { AdminStatusService } from "./services/adminStatusService.js";
import { ProviderService } from "./services/providerService.js";
import { FeishuImportTaskService } from "./services/feishuImportTaskService.js";
import { SalesService } from "./services/salesService.js";
import { createRouter } from "./routes/index.js";
import { createStaticFrontend } from "./frontend/staticFrontend.js";
import { createAuthService } from "./security/authService.js";
import { createRateLimiters } from "./security/rateLimiter.js";

const defaultFrontendDir = fileURLToPath(new URL("../../frontend/", import.meta.url));

export function createRuntimeContext(options = {}) {
  const env = options.env || createEnvReader();
  const runtimePolicy = options.runtimePolicy || createRuntimePolicy({ env });
  const webSearchProvider = createWebSearchProvider({ env });
  const modelProvider = createModelProvider({ env });
  const dataProProvider = createDataProProvider({ env });
  const openVikingProvider = createOpenVikingProvider({ env });
  const supabaseDataProvider = createSupabaseDataProvider({ env });
  const providerStatus = () => getProviderStatus({ env, runtimePolicy });
  const providerService = new ProviderService({
    getProviderStatus: providerStatus,
    webSearchProvider,
    modelProvider,
    dataProProvider,
    openVikingProvider,
    supabaseDataProvider,
  });
  const salesRepository = supabaseDataProvider.isConfigured()
    ? new SupabaseDataRepository({
      env,
      supabaseDataProvider,
      workspaceId: env.value("APP_WORKSPACE_ID"),
    })
    : null;
  const salesService = new SalesService({ env, runtimePolicy, dataProProvider, webSearchProvider, modelProvider, openVikingProvider, repository: salesRepository });
  const feishuImportTaskService = new FeishuImportTaskService({
    env,
    runtimePolicy,
    salesService,
  });
  const adminStatusService = new AdminStatusService({ env, runtimePolicy, getProviderStatus: providerStatus });
  const authService = options.authService || createAuthService({ env, dataProvider: supabaseDataProvider });
  const rateLimiters = options.rateLimiters || createRateLimiters(env);
  return {
    env,
    runtimePolicy,
    providerStatus,
    salesRepository,
    providerService,
    salesService,
    feishuImportTaskService,
    adminStatusService,
    authService,
    rateLimiters,
  };
}

export function createApp(options = {}) {
  const context = options.context || createRuntimeContext(options);
  const {
    env,
    runtimePolicy,
    providerService,
    salesService,
    feishuImportTaskService,
    adminStatusService,
    authService,
    rateLimiters,
  } = context;
  const staticFrontend = createStaticFrontend({
    rootDir: env.value("FRONTEND_DIR", defaultFrontendDir),
  });
  const router = createRouter(providerService, {
    salesService,
    feishuImportTaskService,
    adminStatusService,
    runtimePolicy,
    staticFrontend,
    authService,
    rateLimiters,
    env,
  });
  const server = http.createServer(router);
  server.runtimeContext = context;
  return server;
}
