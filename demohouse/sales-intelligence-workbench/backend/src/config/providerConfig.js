import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { createEnvReader } from "./runtimeEnv.js";
import { createRuntimePolicy, publicRuntimePolicy } from "./runtimePolicy.js";

const DEFAULTS = {
  DATAPRO_MCP_URL: "https://datapro.hqd.cn-beijing.volces.com/mcp",
  WEB_SEARCH_BASE_URL: "https://open.feedcoopapi.com/search_api/web_search",
  OPENVIKING_AGENT_ID: "default",
  SUPABASE_REGION: "cn-beijing",
};

function unique(values) {
  return [...new Set(values)];
}

function commandExists(command) {
  const value = String(command || "").trim();
  if (!value) return false;
  if (value.includes("/")) return existsSync(value);
  return String(process.env.PATH || "")
    .split(delimiter)
    .filter(Boolean)
    .some((directory) => existsSync(join(directory, value)));
}

function configStatus(env, requiredEnv, acceptedEnv = requiredEnv) {
  if (!requiredEnv.length) return "ready";
  return requiredEnv.every((name) => env.hasAny(Array.isArray(name) ? name : [name])) ? "configured" : "missing_config";
}

function missingGroups(env, requiredEnv) {
  return requiredEnv
    .filter((name) => !env.hasAny(Array.isArray(name) ? name : [name]))
    .map((name) => (Array.isArray(name) ? name.join(" or ") : name));
}

function provider(id, label, options) {
  const {
    status,
    mode,
    role,
    required_env = [],
    optional_env = [],
    configured_from = [],
    missing = [],
    notes = [],
    safe_config = {},
  } = options;
  return {
    id,
    label,
    status,
    mode,
    role,
    required_env,
    optional_env,
    configured_from: unique(configured_from),
    missing,
    notes,
    safe_config,
  };
}

export function getProviderStatus(options = {}) {
  const env = options.env || createEnvReader();
  const runtimePolicy = options.runtimePolicy || createRuntimePolicy({ env });
  const repositoryMode = env.value("REPOSITORY_MODE") || "supabase";

  const webSearchRequired = [["WEB_SEARCH_API_KEY", "AGENT_PLAN_API_KEY", "ASK_ECHO_SEARCH_INFINITY_API_KEY"]];
  const dataProRequired = [["DATAPRO_API_KEY", "AGENT_PLAN_API_KEY"]];
  const supabaseRequired = ["SUPABASE_API_URL", "SUPABASE_SERVICE_ROLE_KEY", "APP_WORKSPACE_ID"];
  const supabaseAdminEnv = ["VOLCENGINE_ACCESS_KEY", "VOLCENGINE_SECRET_KEY", "SUPABASE_WORKSPACE_ID", "SUPABASE_BRANCH_ID", "SUPABASE_CLI_BIN"];
  const openVikingCliConfigPath = env.value("OPENVIKING_CLI_CONFIG")
    || (process.env.HOME ? join(process.env.HOME, ".openviking", "ovcli.conf") : "");
  const openVikingConfigExists = Boolean(openVikingCliConfigPath && existsSync(openVikingCliConfigPath));
  const openVikingCliPath = env.value("OPENVIKING_CLI") || (process.env.HOME ? join(process.env.HOME, "bin", "ov") : "ov");
  const openVikingCliExists = commandExists(openVikingCliPath);
  const openVikingHttpConfigured = env.hasAny(["OPENVIKING_API_KEY", "OPENVIKING_BEARER_TOKEN"])
    && env.hasAny(["OPENVIKING_BASE_URL"]);
  const openVikingConfigured = openVikingHttpConfigured || openVikingConfigExists || openVikingCliExists;
  const modelRequired = [["ARK_API_KEY", "VOLCENGINE_ARK_API_KEY", "MODEL_API_KEY", "AGENT_PLAN_API_KEY"]];

  const providers = [
    provider("web_search", "联网搜索 Provider", {
      status: configStatus(env, webSearchRequired),
      mode: "real",
      role: "公开来源发现：新闻、官网、文档、价格页、发布记录",
      required_env: ["AGENT_PLAN_API_KEY（WEB_SEARCH_API_KEY 可作为高级覆盖）"],
      optional_env: ["WEB_SEARCH_BASE_URL", "WEB_SEARCH_TRAFFIC_TAG", "WEB_SEARCH_MAX_COUNT", "WEB_SEARCH_RUN_ENABLED", "WEB_SEARCH_TIMEOUT_MS", "WEB_SEARCH_MAX_RETRIES"],
      configured_from: env.sources(["WEB_SEARCH_API_KEY", "AGENT_PLAN_API_KEY", "ASK_ECHO_SEARCH_INFINITY_API_KEY", "WEB_SEARCH_BASE_URL", "WEB_SEARCH_TRAFFIC_TAG", "WEB_SEARCH_MAX_COUNT", "WEB_SEARCH_RUN_ENABLED", "WEB_SEARCH_TIMEOUT_MS", "WEB_SEARCH_MAX_RETRIES"]),
      missing: missingGroups(env, webSearchRequired),
      notes: ["状态接口只检查配置，不发起搜索请求。", "主流程调用由 WEB_SEARCH_RUN_ENABLED 控制，避免日常测试消耗额度。"],
      safe_config: {
        base_url: env.value("WEB_SEARCH_BASE_URL") || DEFAULTS.WEB_SEARCH_BASE_URL,
        traffic_tag: env.value("WEB_SEARCH_TRAFFIC_TAG", "skill_web_search_common"),
        max_count: env.number("WEB_SEARCH_MAX_COUNT", 3),
        run_enabled: ["1", "true", "yes", "on"].includes(String(env.value("WEB_SEARCH_RUN_ENABLED", "false")).toLowerCase()),
        timeout_ms: env.number("WEB_SEARCH_TIMEOUT_MS", 20000),
        max_retries: env.number("WEB_SEARCH_MAX_RETRIES", 1),
      },
    }),
    provider("datapro", "DataPro Provider", {
      status: configStatus(env, dataProRequired),
      mode: "real",
      role: "企业主体、工商事实、风险和知识产权数据核验",
      required_env: ["DATAPRO_API_KEY or AGENT_PLAN_API_KEY"],
      optional_env: ["DATAPRO_MCP_URL", "DATAPRO_RUN_ENABLED", "DATAPRO_MAX_SOURCES", "DATAPRO_TIMEOUT_MS", "DATAPRO_MAX_RETRIES"],
      configured_from: env.sources(["DATAPRO_API_KEY", "AGENT_PLAN_API_KEY", "DATAPRO_MCP_URL", "DATAPRO_RUN_ENABLED", "DATAPRO_MAX_SOURCES", "DATAPRO_TIMEOUT_MS", "DATAPRO_MAX_RETRIES"]),
      missing: missingGroups(env, dataProRequired),
      notes: ["状态接口只检查配置，不调用 dataPro_search。", "主流程调用由 DATAPRO_RUN_ENABLED 控制，真实查询会消耗 AFP。"],
      safe_config: {
        mcp_url: env.value("DATAPRO_MCP_URL") || DEFAULTS.DATAPRO_MCP_URL,
        run_enabled: ["1", "true", "yes", "on"].includes(String(env.value("DATAPRO_RUN_ENABLED", "false")).toLowerCase()),
        max_sources: env.number("DATAPRO_MAX_SOURCES", 4),
        timeout_ms: env.number("DATAPRO_TIMEOUT_MS", 45000),
        max_retries: env.number("DATAPRO_MAX_RETRIES", 1),
      },
    }),
    provider("supabase", "Supabase Repository / Provider", {
      status: configStatus(env, supabaseRequired),
      mode: "real",
      role: "业务状态持久化、SQL、Storage、Edge Functions 管理",
      required_env: supabaseRequired,
      optional_env: [...supabaseAdminEnv, "SUPABASE_READ_ONLY", "SUPABASE_RUN_ENABLED", "SUPABASE_TIMEOUT_MS", "SUPABASE_DATA_API_TIMEOUT_MS", "REPOSITORY_MODE"],
      configured_from: env.sources([...supabaseRequired, ...supabaseAdminEnv, "SUPABASE_READ_ONLY", "SUPABASE_RUN_ENABLED", "SUPABASE_TIMEOUT_MS", "SUPABASE_DATA_API_TIMEOUT_MS", "REPOSITORY_MODE"]),
      missing: missingGroups(env, supabaseRequired),
      notes: ["状态接口不返回 Supabase API keys。", "销售工作台运行时使用 Data API；CLI 凭据仅用于迁移、备份和管理。"],
      safe_config: {
        workspace_id: env.value("SUPABASE_WORKSPACE_ID") || null,
        branch_id: env.value("SUPABASE_BRANCH_ID") || null,
        read_only: env.value("SUPABASE_READ_ONLY") || null,
        region: env.value("VOLCENGINE_REGION") || DEFAULTS.SUPABASE_REGION,
        run_enabled: ["1", "true", "yes", "on"].includes(String(env.value("SUPABASE_RUN_ENABLED", "false")).toLowerCase()),
        app_workspace_id: env.value("APP_WORKSPACE_ID") || null,
        cli_bin: env.value("SUPABASE_CLI_BIN") || "byted-supabase-cli",
        data_api_timeout_ms: env.number("SUPABASE_DATA_API_TIMEOUT_MS", 15000),
      },
    }),
    provider("openviking", "OpenViking Provider", {
      status: openVikingConfigured ? "configured" : "missing_config",
      mode: "real",
      role: "飞书资料正文、资料问答 Session、长期记忆与企业内资料召回",
      required_env: ["OpenViking CLI 配置（默认 ~/.openviking/ovcli.conf），或 OPENVIKING_BASE_URL + OPENVIKING_API_KEY"],
      optional_env: ["OPENVIKING_CLI", "OPENVIKING_CLI_CONFIG", "OPENVIKING_AGENT_ID", "OPENVIKING_RUN_ENABLED", "OPENVIKING_SALES_ROOT_URI", "OPENVIKING_FIND_LIMIT", "OPENVIKING_TIMEOUT_MS"],
      configured_from: openVikingConfigured ? unique([...env.sources(["OPENVIKING_API_KEY", "OPENVIKING_BEARER_TOKEN", "OPENVIKING_BASE_URL", "OPENVIKING_CLI", "OPENVIKING_CLI_CONFIG", "OPENVIKING_AGENT_ID", "OPENVIKING_RUN_ENABLED", "OPENVIKING_SALES_ROOT_URI", "OPENVIKING_FIND_LIMIT", "OPENVIKING_TIMEOUT_MS"]), openVikingConfigExists ? "local_openviking_cli_config" : null, openVikingCliExists ? "local_openviking_cli" : null].filter(Boolean)) : [],
      missing: openVikingConfigured ? [] : ["OpenViking CLI 配置，或 OPENVIKING_BASE_URL + OPENVIKING_API_KEY"],
      notes: ["Agent Plan 套餐控制 AFP 抵扣，Agent 记忆（OpenViking）数据面仍使用内部访问凭证认证。", "状态接口不写入资料或会话。", "OpenViking 不承担企业、档案、任务和权限数据库角色。", "飞书正文与资料问答记忆写入由 OPENVIKING_RUN_ENABLED 控制。"],
      safe_config: {
        cli_path: openVikingCliPath,
        agent_id: env.value("OPENVIKING_AGENT_ID") || DEFAULTS.OPENVIKING_AGENT_ID,
        run_enabled: ["1", "true", "yes", "on"].includes(String(env.value("OPENVIKING_RUN_ENABLED", "false")).toLowerCase()),
        sales_root_uri: env.value("OPENVIKING_SALES_ROOT_URI") || "viking://resources/sales-workbench",
        find_limit: env.number("OPENVIKING_FIND_LIMIT", 3),
        timeout_ms: env.number("OPENVIKING_TIMEOUT_MS", 120000),
      },
    }),
    provider("model", "Model Provider", {
      status: configStatus(env, modelRequired),
      mode: "real",
      role: "基于 sources / facts 生成结构化变化卡、报告和问答",
      required_env: ["AGENT_PLAN_API_KEY（MODEL_API_KEY 可作为高级覆盖）"],
      optional_env: ["MODEL_NAME", "MODEL_BASE_URL", "MODEL_RUN_ENABLED", "MODEL_MAX_CARDS", "MODEL_MAX_TOKENS", "MODEL_TIMEOUT_MS"],
      configured_from: env.sources(["ARK_API_KEY", "VOLCENGINE_ARK_API_KEY", "MODEL_API_KEY", "AGENT_PLAN_API_KEY", "MODEL_NAME", "MODEL_BASE_URL", "MODEL_RUN_ENABLED", "MODEL_MAX_CARDS", "MODEL_MAX_TOKENS", "MODEL_TIMEOUT_MS"]),
      missing: missingGroups(env, modelRequired),
      notes: ["模型输出必须经过后端 JSON 校验。", "主流程调用由 MODEL_RUN_ENABLED 控制，避免日常测试消耗额度。"],
      safe_config: {
        model_name: env.value("MODEL_NAME") || null,
        base_url: env.value("MODEL_BASE_URL") || null,
        run_enabled: ["1", "true", "yes", "on"].includes(String(env.value("MODEL_RUN_ENABLED", "false")).toLowerCase()),
        max_cards: env.number("MODEL_MAX_CARDS", 2),
        timeout_ms: env.number("MODEL_TIMEOUT_MS", 90000),
      },
    }),
  ];

  return {
    generated_at: new Date().toISOString(),
    runtime: publicRuntimePolicy(runtimePolicy),
    environment: {
      local_env_loaded: env.hasLocalEnv,
      local_env_path: "backend/.env.local",
    },
    repository: {
      active: repositoryMode,
      status: configStatus(env, supabaseRequired),
      notes: ["使用 Supabase Data API Repository，业务状态按 Workspace 读取并写回。"],
    },
    providers,
  };
}
