import { createDataProProvider } from "../src/providers/dataProProvider.js";
import { createModelProvider } from "../src/providers/modelProvider.js";
import { createOpenVikingProvider } from "../src/providers/openVikingProvider.js";
import { createSupabaseProvider } from "../src/providers/supabaseProvider.js";
import { createWebSearchProvider } from "../src/providers/webSearchProvider.js";

const liveProbeCompany = process.env.LIVE_PROBE_COMPANY || "北京火山引擎科技有限公司";

function safeError(result) {
  if (!result?.error) return null;
  return {
    code: result.error.code || "error",
    message: String(result.error.message || "").slice(0, 300),
    http_status: result.http_status || null,
  };
}

function status(ok, details = {}) {
  return {
    ok: Boolean(ok),
    ...details,
  };
}

async function checkModel() {
  const provider = createModelProvider();
  if (!provider.isConfigured()) {
    return status(false, { configured: false, error: { code: "missing_config", message: "MODEL_* 未配置完整。" } });
  }
  const result = await provider.callJson({
    operation: "afp_preflight_model",
    maxTokens: 60,
    system: "你是连通性探针。只输出 JSON，不要输出 Markdown。",
    payload: {
      task: "请返回 {\"ok\":true,\"message\":\"model ready\"}",
      output_schema: { ok: true, message: "model ready" },
    },
  });
  return status(result.ok, {
    configured: true,
    model: provider.modelName,
    usage: result.usage || null,
    request_id: result.request_id || null,
    error: safeError(result),
  });
}

async function checkDataPro() {
  const provider = createDataProProvider();
  if (!provider.isConfigured()) {
    return status(false, { configured: false, error: { code: "missing_config", message: "DATAPRO_* 未配置完整。" } });
  }
  const result = await provider.callTool(`${liveProbeCompany} 企业工商信息`);
  return status(result.ok, {
    configured: true,
    request_id: result.request_id || null,
    summary: result.summary ? String(result.summary).slice(0, 220) : "",
    error: safeError(result),
  });
}

async function checkWebSearch() {
  const provider = createWebSearchProvider();
  if (!provider.isConfigured()) {
    return status(false, { configured: false, error: { code: "missing_config", message: "AGENT_PLAN_API_KEY 未配置。" } });
  }
  const result = await provider.search({
    query: `${liveProbeCompany} 最新动态`,
    count: 1,
    need_summary: false,
  });
  return status(result.ok, {
    configured: true,
    request_id: result.request_id || null,
    result_count: result.result_count || 0,
    first_result: result.results?.[0]
      ? {
          title: result.results[0].title,
          url: result.results[0].url,
        }
      : null,
    error: safeError(result),
  });
}

async function checkOpenViking() {
  const provider = createOpenVikingProvider();
  if (!provider.isConfigured()) {
    return status(false, { configured: false, error: { code: "missing_config", message: "OpenViking 未配置。" } });
  }
  const stamp = `afp-preflight-${Date.now()}`;
  const health = await provider.health();
  if (!health.ok) {
    return status(false, {
      configured: true,
      stage: "health",
      error: safeError(health),
    });
  }
  const write = await provider.storeMemory([
    {
      role: "user",
      content: `AFP 预检测试记忆 ${stamp}。用于确认 OpenViking 当前库可以写入和检索，可在测试后清理。`,
    },
  ]);
  if (!write.ok) {
    return status(false, {
      configured: true,
      stage: "write",
      health: health.result || null,
      error: safeError(write),
    });
  }
  const find = await provider.findMemories(stamp, { limit: 3 });
  const findPreview = JSON.stringify(find.result || null);
  return status(find.ok, {
    configured: true,
    stage: find.ok ? "write_and_find" : "find",
    stamp,
    health: health.result || null,
    write_ref: write.raw_ref || null,
    find_ref: find.raw_ref || null,
    find_exact_match: findPreview.includes(stamp),
    find_result_preview: findPreview.slice(0, 500),
    error: safeError(find),
  });
}

async function checkSupabase() {
  const provider = createSupabaseProvider();
  if (!provider.isConfigured()) {
    return status(false, {
      configured: false,
      workspace_id: provider.workspaceId || "",
      error: { code: "missing_config", message: "Supabase 工作区、AK/SK 或 skill 目录未配置完整。" },
    });
  }
  const stamp = `afp-preflight-${Date.now()}`;
  const result = await provider.executeSql(`
    create temporary table afp_preflight_probe (
      id text primary key,
      note text
    );
    insert into afp_preflight_probe (id, note) values ('${stamp}', 'temporary write/read probe');
    select id, note from afp_preflight_probe where id = '${stamp}';
  `);
  return status(result.ok, {
    configured: true,
    workspace_id: provider.workspaceId,
    rows: result.rows || null,
    error: safeError(result),
  });
}

const checks = [
  ["model", checkModel],
  ["datapro", checkDataPro],
  ["web_search", checkWebSearch],
  ["openviking", checkOpenViking],
  ["supabase", checkSupabase],
];

const startedAt = new Date().toISOString();
const results = {};
for (const [name, fn] of checks) {
  try {
    results[name] = await fn();
  } catch (error) {
    results[name] = status(false, {
      error: {
        code: "exception",
        message: String(error?.message || error).slice(0, 300),
      },
    });
  }
}

const failed = Object.entries(results).filter(([, result]) => !result.ok).map(([name]) => name);
console.log(JSON.stringify({
  started_at: startedAt,
  finished_at: new Date().toISOString(),
  ok: failed.length === 0,
  failed,
  results,
}, null, 2));

if (failed.length) process.exitCode = 1;
