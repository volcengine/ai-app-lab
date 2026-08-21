import { createEnvReader } from "../src/config/runtimeEnv.js";
import { createRuntimePolicy, publicRuntimePolicy } from "../src/config/runtimePolicy.js";
import { createDataProProvider } from "../src/providers/dataProProvider.js";
import { createModelProvider } from "../src/providers/modelProvider.js";
import { createOpenVikingProvider } from "../src/providers/openVikingProvider.js";
import { createSupabaseDataProvider } from "../src/providers/supabaseDataProvider.js";
import { createWebSearchProvider } from "../src/providers/webSearchProvider.js";

const live = process.argv.includes("--live");
const onlyProviderIndex = process.argv.indexOf("--only-provider");
const onlyProvider = onlyProviderIndex >= 0 ? String(process.argv[onlyProviderIndex + 1] || "").trim() : "";
const supportedProviders = new Set(["model", "datapro", "web_search", "openviking", "supabase"]);
if (onlyProvider && !supportedProviders.has(onlyProvider)) {
  throw new Error(`Unsupported --only-provider value: ${onlyProvider}`);
}
const env = createEnvReader();
const runtimePolicy = createRuntimePolicy({ env });

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function safeError(result) {
  if (!result?.error) return null;
  return {
    code: String(result.error.code || "error").slice(0, 100),
    message: String(result.error.message || "").slice(0, 300),
    http_status: result.http_status || null,
  };
}

function compactUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  return {
    prompt_tokens: usage.prompt_tokens ?? null,
    completion_tokens: usage.completion_tokens ?? null,
    total_tokens: usage.total_tokens ?? null,
  };
}

function providerState(provider) {
  return {
    configured: Boolean(provider.isConfigured()),
    enabled: Boolean(provider.isRunEnabled()),
  };
}

function resultCount(value) {
  if (Array.isArray(value)) return value.length;
  if (Array.isArray(value?.items)) return value.items.length;
  if (Array.isArray(value?.result)) return value.result.length;
  return value ? 1 : 0;
}

async function checked(name, fn) {
  const startedAt = Date.now();
  try {
    const result = await fn();
    const elapsedMs = Date.now() - startedAt;
    return {
      name,
      called: true,
      ok: Boolean(result?.ok),
      provider_mode: result?.provider_mode || (result?.ok ? "real" : null),
      request_id: result?.request_id || null,
      raw_ref: result?.raw_ref || null,
      latency_ms: result?.latency_ms ?? elapsedMs,
      elapsed_ms: elapsedMs,
      attempts: Math.max(1, Number(result?.attempts || 1)),
      usage: compactUsage(result?.usage),
      error: safeError(result),
      result,
    };
  } catch (error) {
    return {
      name,
      called: true,
      ok: false,
      provider_mode: null,
      request_id: null,
      raw_ref: null,
      latency_ms: Date.now() - startedAt,
      elapsed_ms: Date.now() - startedAt,
      attempts: 1,
      usage: null,
      error: {
        code: "exception",
        message: String(error?.message || error).slice(0, 300),
        http_status: null,
      },
      result: null,
    };
  }
}

function publicResult(check) {
  if (!check) return null;
  return {
    called: check.called,
    ok: check.ok,
    provider_mode: check.provider_mode,
    request_id: check.request_id,
    raw_ref: check.raw_ref,
    latency_ms: check.latency_ms,
    elapsed_ms: check.elapsed_ms,
    attempts: check.attempts,
    usage: check.usage,
    error: check.error,
  };
}

const providers = {
  model: createModelProvider(),
  datapro: createDataProProvider(),
  web_search: createWebSearchProvider(),
  openviking: createOpenVikingProvider(),
  supabase: createSupabaseDataProvider(),
};

const providerStates = Object.fromEntries(
  Object.entries(providers).map(([name, provider]) => [name, providerState(provider)]),
);

const runtime = {
  app: publicRuntimePolicy(runtimePolicy),
  repository_mode: env.value("REPOSITORY_MODE", "supabase"),
  supabase_read_only: truthy(env.value("SUPABASE_READ_ONLY", "false")),
};

const startedAt = new Date().toISOString();
const checks = {};
const selected = (name) => !onlyProvider || onlyProvider === name;
const liveProbeCompany = process.env.LIVE_PROBE_COMPANY || "北京火山引擎科技有限公司";

if (live) {
  if (selected("model") && providerStates.model.enabled) {
    checks.model = await checked("model", () => providers.model.callJson({
      operation: "sales_workbench_readonly_baseline",
      maxTokens: 80,
      system: "你是只读连通性探针。只输出 JSON，不调用工具，不补充事实。",
      payload: {
        task: "返回指定结构",
        output_schema: { ok: true, message: "ready" },
      },
    }));
  }

  if (selected("datapro") && providerStates.datapro.enabled) {
    checks.datapro = await checked(
      "datapro",
      () => providers.datapro.callTool(`${liveProbeCompany} 企业工商信息`),
    );
  }

  if (selected("web_search") && providerStates.web_search.enabled) {
    checks.web_search = await checked(
      "web_search",
      () => providers.web_search.search({
        query: "火山引擎 Agent Plan 官方文档",
        count: 1,
        need_summary: false,
      }),
    );
  }

  if (selected("openviking") && providerStates.openviking.enabled) {
    const health = await checked("openviking_health", () => providers.openviking.health());
    let find = null;
    if (health.ok) {
      find = await checked(
        "openviking_find",
        () => providers.openviking.findMemories("销售工作台", { limit: 1 }),
      );
    }
    checks.openviking = {
      health: publicResult(health),
      find: publicResult(find),
      find_result_count: find?.ok ? resultCount(find.result?.result) : 0,
      ok: Boolean(health.ok && find?.ok),
    };
  }

  if (selected("supabase") && providerStates.supabase.enabled) {
    checks.supabase = await checked("supabase", () => providers.supabase.probe());
  }
}

const blockers = [];

blockers.push(...runtimePolicy.blockers);

if (runtime.repository_mode !== "supabase") {
  blockers.push("REPOSITORY_MODE is not supabase.");
}

for (const [name, state] of Object.entries(providerStates).filter(([name]) => selected(name))) {
  if (!state.configured) blockers.push(name + " is not configured.");
  if (!state.enabled) blockers.push(name + " is not enabled.");
}

if (live) {
  for (const name of ["model", "datapro", "web_search", "supabase"].filter(selected)) {
    if (!checks[name]?.ok) blockers.push(name + " live check failed.");
  }
  if (selected("openviking") && !checks.openviking?.ok) blockers.push("openviking live check failed.");
}

const report = {
  schema_version: 1,
  check_type: live ? onlyProvider ? "read_only_live_partial" : "read_only_live" : "configuration_only",
  selected_provider: onlyProvider || null,
  started_at: startedAt,
  read_only_contract: {
    business_data_writes: false,
    openviking_writes: false,
    supabase_writes: false,
    model_request: live && selected("model"),
    datapro_request: live && selected("datapro"),
    web_search_request: live && selected("web_search"),
  },
  runtime,
  providers: providerStates,
  checks: {
    model: publicResult(checks.model),
    datapro: publicResult(checks.datapro),
    web_search: checks.web_search
      ? {
          ...publicResult(checks.web_search),
          result_count: checks.web_search.result?.result_count ?? 0,
        }
      : null,
    openviking: checks.openviking || null,
    supabase: publicResult(checks.supabase),
  },
  runtime_ready: !onlyProvider && blockers.length === 0,
  blockers,
  finished_at: new Date().toISOString(),
};

console.log(JSON.stringify(report, null, 2));

if (live && blockers.length) {
  process.exitCode = 1;
}
