import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

import { backendFetch, readAuthSession } from "./import-feishu-cli.mjs";

const DEFAULT_API_URL = "http://127.0.0.1:8787";
const TERMINAL_JOB_STATUSES = new Set(["succeeded", "failed", "cancelled"]);
const PRIVATE_KEYS = new Set([
  "access_token",
  "api_key",
  "lease_token",
  "openviking_ref",
  "openviking_uri",
  "password",
  "professional_source_ref",
  "prompt",
  "raw_ref",
  "refresh_token",
  "secret",
  "secret_key",
  "service_role_key",
  "worker_id",
]);

function usage() {
  return `
真实业务链路验收（会写入业务数据并产生 AFP/Token）

用法：
  npm run verify:business -- \\
    --goal-id <销售目标ID> \\
    --company-query <完整企业名称> \\
    --question <基于档案的验收问题> \\
    --confirm-live

也可以验证已入池企业：
  npm run verify:business -- \\
    --enterprise-id <企业ID> \\
    --question <基于档案的验收问题> \\
    --confirm-live

选项：
  --candidate-id <候选企业ID>  搜索结果不能按完整名称唯一匹配时，显式选择候选。
  --api-url <URL>              工作台 API 地址。
  --auth-session <PATH>        login.mjs 创建的 0600 CLI 会话文件。
  --timeout-ms <N>             等待异步档案任务的最长时间，默认 300000。
  --poll-ms <N>                任务轮询间隔，默认 1000。
  --confirm-live               必填；确认调用真实 Provider 并保留生成的业务数据。

安全约束：
  1. 必须使用已获授权的测试企业；脚本不会自动删除企业、档案或问答。
  2. 不接受 API Key、Service Role 或密码作为命令行参数。
  3. 只有真实 Provider Run、逐段引用和持久化检查全部通过，才会输出 ok=true。
`;
}

function optionValue(argv, index, name) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} 缺少参数值。`);
  return value;
}

function parseArgs(argv) {
  const options = {
    apiUrl: process.env.SALES_WORKBENCH_API_URL || "",
    authSession: process.env.SALES_WORKBENCH_AUTH_SESSION
      || path.join(os.homedir(), ".local", "state", "sales-intelligence-workbench", "cli-session.json"),
    goalId: "",
    companyQuery: "",
    candidateId: "",
    enterpriseId: "",
    question: "",
    timeoutMs: 300_000,
    pollMs: 1_000,
    confirmLive: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--confirm-live") options.confirmLive = true;
    else if (argument === "--api-url") {
      options.apiUrl = optionValue(argv, index, argument);
      index += 1;
    } else if (argument === "--auth-session") {
      options.authSession = optionValue(argv, index, argument);
      index += 1;
    } else if (argument === "--goal-id") {
      options.goalId = optionValue(argv, index, argument);
      index += 1;
    } else if (argument === "--company-query") {
      options.companyQuery = optionValue(argv, index, argument);
      index += 1;
    } else if (argument === "--candidate-id") {
      options.candidateId = optionValue(argv, index, argument);
      index += 1;
    } else if (argument === "--enterprise-id") {
      options.enterpriseId = optionValue(argv, index, argument);
      index += 1;
    } else if (argument === "--question") {
      options.question = optionValue(argv, index, argument);
      index += 1;
    } else if (argument === "--timeout-ms") {
      options.timeoutMs = Number(optionValue(argv, index, argument));
      index += 1;
    } else if (argument === "--poll-ms") {
      options.pollMs = Number(optionValue(argv, index, argument));
      index += 1;
    } else {
      throw new Error(`未知参数：${argument}`);
    }
  }

  if (options.help) return options;
  if (!options.confirmLive) {
    throw new Error("必须提供 --confirm-live，确认本次会调用真实 Provider、产生 AFP/Token 并保留业务数据。");
  }
  if (Boolean(options.companyQuery) === Boolean(options.enterpriseId)) {
    throw new Error("--company-query 与 --enterprise-id 必须且只能提供一个。");
  }
  if (options.companyQuery && !options.goalId) {
    throw new Error("使用 --company-query 时必须提供 --goal-id。");
  }
  if (options.candidateId && !options.companyQuery) {
    throw new Error("--candidate-id 只能与 --company-query 一起使用。");
  }
  if (!options.question.trim()) {
    throw new Error("必须提供 --question，以验证 Supabase 档案、OpenViking 资料召回与会话记忆，以及模型问答。");
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 10_000 || options.timeoutMs > 900_000) {
    throw new Error("--timeout-ms 必须在 10000 到 900000 之间。");
  }
  if (!Number.isFinite(options.pollMs) || options.pollMs < 250 || options.pollMs > 5_000) {
    throw new Error("--poll-ms 必须在 250 到 5000 之间。");
  }
  return options;
}

function normalizeIdentity(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s·•()（）[\]【】_-]+/g, "");
}

function selectCandidate(candidates, options) {
  if (!Array.isArray(candidates) || !candidates.length) {
    throw new Error("专业数据集没有返回可选择的企业候选。");
  }
  let matches = [];
  if (options.candidateId) {
    matches = candidates.filter((candidate) => candidate.id === options.candidateId);
  } else {
    const expected = normalizeIdentity(options.companyQuery);
    matches = candidates.filter((candidate) => normalizeIdentity(candidate.name) === expected);
  }
  if (matches.length !== 1) {
    const visibleCandidates = candidates.slice(0, 8)
      .map((candidate) => `${candidate.name || "未命名企业"} (${candidate.id || "无ID"})`)
      .join("；");
    throw new Error(
      `无法唯一确定企业主体。请核对完整企业名称，或使用 --candidate-id 显式选择。候选：${visibleCandidates || "无"}`,
    );
  }
  const selected = matches[0];
  if (selected.identity_status !== "verified") {
    throw new Error(`候选企业 ${selected.name || selected.id} 未通过专业数据集主体核验，不能进入生产验收。`);
  }
  return selected;
}

function parsePayload(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

async function apiRequest(options, method, endpoint, body) {
  const response = await backendFetch(`${options.apiUrl}${endpoint}`, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }, options);
  const payload = parsePayload(await response.text());
  if (!response.ok) {
    const code = payload?.error?.code || `http_${response.status}`;
    const message = payload?.error?.message || "工作台 API 请求失败。";
    const requestId = payload?.meta?.request_id ? `，请求ID ${payload.meta.request_id}` : "";
    throw new Error(`${code}: ${message}${requestId}`);
  }
  return payload.data;
}

function assertPrivateSession(filePath) {
  const session = readAuthSession(filePath);
  if (!session) {
    throw new Error("未找到有效 CLI 登录态。请先运行 Skill 的 login.mjs，密码不要发送到聊天或命令行参数。");
  }
  const mode = fs.statSync(filePath).mode & 0o077;
  if (mode !== 0) throw new Error("CLI 会话文件权限不安全；请将其权限改为 0600 后重试。");
  return session;
}

async function pollJob(options, jobId, request = apiRequest) {
  const deadline = Date.now() + options.timeoutMs;
  let previousStage = "";
  while (Date.now() < deadline) {
    const job = await request(options, "GET", `/api/jobs/${encodeURIComponent(jobId)}`);
    if (job.stage !== previousStage) {
      previousStage = job.stage;
      process.stderr.write(`任务 ${job.id}：${job.stage_label || job.stage}（${job.progress ?? 0}%）\n`);
    }
    if (TERMINAL_JOB_STATUSES.has(job.status)) {
      if (job.status !== "succeeded") {
        throw new Error(`档案任务未成功：${job.status}${job.error?.code ? ` (${job.error.code})` : ""}`);
      }
      return job;
    }
    await delay(options.pollMs);
  }
  throw new Error(`等待档案任务超时（${options.timeoutMs}ms）；任务仍可能在后台运行，请按 job_id 查询。`);
}

function collectPrivatePaths(value, prefix = "$", result = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectPrivatePaths(item, `${prefix}[${index}]`, result));
    return result;
  }
  if (!value || typeof value !== "object") return result;
  for (const [key, nested] of Object.entries(value)) {
    const nextPath = `${prefix}.${key}`;
    if (PRIVATE_KEYS.has(key.toLowerCase())) result.push(nextPath);
    collectPrivatePaths(nested, nextPath, result);
  }
  return result;
}

function assertPublicPayload(value, label) {
  const privatePaths = collectPrivatePaths(value);
  if (privatePaths.length) {
    throw new Error(`${label} 暴露了内部字段：${privatePaths.slice(0, 8).join("、")}`);
  }
}

function validateCitedParagraphs(paragraphs, citations, label) {
  if (!Array.isArray(paragraphs) || !paragraphs.length) throw new Error(`${label}没有可验收的正文段落。`);
  if (!Array.isArray(citations) || !citations.length) throw new Error(`${label}没有真实引用来源。`);
  const allowedIds = new Set(citations.map((citation) => String(citation.id)));
  for (const [index, paragraph] of paragraphs.entries()) {
    const ids = Array.isArray(paragraph.citation_ids) ? paragraph.citation_ids.map(String) : [];
    if (!String(paragraph.text || "").trim()) throw new Error(`${label}第 ${index + 1} 段正文为空。`);
    if (!ids.length) throw new Error(`${label}第 ${index + 1} 段缺少引用。`);
    const unknown = ids.filter((id) => !allowedIds.has(id));
    if (unknown.length) throw new Error(`${label}第 ${index + 1} 段引用了不存在的来源：${unknown.join("、")}`);
  }
}

function validateDossier(dossier, enterpriseId) {
  assertPublicPayload(dossier, "档案公开响应");
  if (!dossier?.id || dossier.company_id !== enterpriseId) throw new Error("档案与目标企业不匹配。");
  validateCitedParagraphs(dossier.body, dossier.citations, "档案");
  const sourceKinds = [...new Set(dossier.citations.map((citation) => citation.source_kind).filter(Boolean))];
  if (!sourceKinds.some((kind) => /专业数据|工商|招投标/.test(kind))) {
    throw new Error("档案缺少专业数据来源，不能作为生产验收结果。");
  }
  if (!sourceKinds.some((kind) => /联网搜索|公开|新闻|公告|媒体|官网/.test(kind))) {
    throw new Error("档案缺少联网公开来源，不能作为生产验收结果。");
  }
  return { sourceKinds, citationCount: dossier.citations.length, paragraphCount: dossier.body.length };
}

function validateQa(result) {
  assertPublicPayload(result, "资料问答公开响应");
  const message = result?.message;
  if (!message?.id || message.role !== "assistant") throw new Error("资料问答没有返回有效的助手消息。");
  if (message.insufficient) throw new Error("资料问答返回资料不足，完整业务链路未通过。");
  validateCitedParagraphs(message.paragraphs, message.citations, "资料问答");
  return { message, citationCount: message.citations.length };
}

function assertProviderRun(run, expectedProviders, label) {
  assertPublicPayload(run, `${label} Provider Run`);
  if (!run?.id || !["succeeded", "succeeded_with_issues"].includes(run.status)) {
    throw new Error(`${label} Provider Run 未成功。`);
  }
  const missing = [];
  const failed = [];
  for (const provider of expectedProviders) {
    const steps = (run.steps || []).filter((step) => step.provider === provider);
    if (!steps.length) {
      missing.push(provider);
      continue;
    }
    if (!steps.some((step) => step.status === "succeeded")) failed.push(provider);
  }
  if (missing.length || failed.length) {
    throw new Error(
      `${label} Provider 未完整通过`
      + `${missing.length ? `；缺少：${missing.join("、")}` : ""}`
      + `${failed.length ? `；未成功：${failed.join("、")}` : ""}`,
    );
  }
}

function assertDossierPersistenceBoundary(run) {
  const step = (run?.steps || []).find((candidate) => (
    candidate.provider === "openviking"
    && candidate.operation === "store_dossier_memory"
  ));
  if (!step) {
    throw new Error("最新档案缺少 OpenViking 存储边界证据。");
  }
  if (step.status !== "skipped" || !/Supabase/.test(String(step.output_summary || ""))) {
    throw new Error("最新档案未遵守 Supabase 持久化、OpenViking 不重复存档的边界。");
  }
}

function providerRunSummary(run) {
  return {
    id: run.id,
    operation: run.operation,
    status: run.status,
    duration_ms: run.duration_ms,
    steps: (run.steps || []).map((step) => ({
      provider: step.provider,
      operation: step.operation,
      status: step.status,
      attempts: step.attempts,
      latency_ms: step.latency_ms,
      usage: step.usage || null,
      error_code: step.error?.code || null,
    })),
  };
}

function usageSummary(runs) {
  const summary = {
    model: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    provider_attempts: {},
  };
  for (const run of runs.filter(Boolean)) {
    for (const step of run.steps || []) {
      summary.provider_attempts[step.provider] = (summary.provider_attempts[step.provider] || 0)
        + Math.max(1, Number(step.attempts || 1));
      if (step.provider !== "model" || !step.usage) continue;
      summary.model.prompt_tokens += Number(step.usage.prompt_tokens || 0);
      summary.model.completion_tokens += Number(step.usage.completion_tokens || 0);
      summary.model.total_tokens += Number(step.usage.total_tokens || 0);
    }
  }
  return summary;
}

async function findProviderRun(options, input, request = apiRequest) {
  if (input.runId) {
    return request(options, "GET", `/api/provider-runs/${encodeURIComponent(input.runId)}`);
  }
  const query = new URLSearchParams({
    operation: input.operation,
    entity_id: input.entityId,
    limit: "20",
  });
  const runs = await request(options, "GET", `/api/provider-runs?${query}`);
  const startedAfter = Date.parse(input.startedAfter || "");
  const match = (runs || []).find((run) => input.jobId && run.job_id === input.jobId)
    || (runs || []).find((run) => !Number.isFinite(startedAfter) || Date.parse(run.started_at || "") >= startedAfter - 5_000);
  if (!match) throw new Error(`找不到 ${input.operation} 的 Provider Run 证据。`);
  return match;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage().trimStart());
    return;
  }

  const session = assertPrivateSession(options.authSession);
  options.apiUrl = String(options.apiUrl || session.api_url || DEFAULT_API_URL).replace(/\/$/, "");
  if (!/^https?:\/\/[^/]+/i.test(options.apiUrl)) throw new Error("--api-url 不是有效的 HTTP(S) 地址。");

  process.stderr.write("开始真实业务验收：会保留 Supabase 企业/档案记录和 OpenViking 问答 Session，并产生真实 AFP/Token。\n");
  const runs = [];
  let company;
  let searchRun = null;

  if (options.companyQuery) {
    const goals = await apiRequest(options, "GET", "/api/sales-goals");
    if (!(goals || []).some((goal) => goal.id === options.goalId)) {
      throw new Error(`销售目标不存在或当前用户无权访问：${options.goalId}`);
    }
    const candidates = await apiRequest(
      options,
      "POST",
      `/api/sales-goals/${encodeURIComponent(options.goalId)}/company-search`,
      { query: options.companyQuery },
    );
    const selected = selectCandidate(candidates, options);
    searchRun = await findProviderRun(options, {
      runId: selected.provider_run_id,
      operation: "sales_company_search",
      entityId: options.goalId,
    });
    assertProviderRun(searchRun, ["datapro", "web_search"], "企业搜索");
    runs.push(searchRun);
    company = await apiRequest(
      options,
      "POST",
      `/api/sales-goals/${encodeURIComponent(options.goalId)}/target-enterprises`,
      { company_id: selected.id },
    );
  } else {
    company = await apiRequest(options, "GET", `/api/target-enterprises/${encodeURIComponent(options.enterpriseId)}`);
  }

  assertPublicPayload(company, "企业公开响应");
  if (!company?.id || company.identity_status !== "verified") {
    throw new Error("目标企业未通过专业数据集主体核验，不能继续生产验收。");
  }

  const dossierStartedAt = new Date().toISOString();
  const dossierResponse = await apiRequest(
    options,
    "POST",
    `/api/target-enterprises/${encodeURIComponent(company.id)}/dossiers`,
    { idempotency_key: `release-acceptance-${Date.now()}` },
  );
  let dossierJob = null;
  let dossierId = dossierResponse?.detail?.id || dossierResponse?.id || "";
  if (dossierResponse?.job_type || ["queued", "running"].includes(dossierResponse?.status)) {
    dossierJob = await pollJob(options, dossierResponse.id);
    dossierId = dossierJob.result?.dossier_id || "";
    if (dossierJob.result?.action !== "created") {
      throw new Error("档案证据未变化，模型和持久化写入没有完整执行；本次不能作为完整生产验收。");
    }
  }
  if (!dossierId) throw new Error("档案任务成功但没有返回 dossier_id。");
  const dossier = await apiRequest(options, "GET", `/api/dossiers/${encodeURIComponent(dossierId)}`);
  const dossierChecks = validateDossier(dossier, company.id);
  const dossierRun = await findProviderRun(options, {
    operation: "sales_dossier_generation",
    entityId: company.id,
    jobId: dossierJob?.id || dossierResponse?.job_id || "",
    startedAfter: dossierStartedAt,
  });
  assertProviderRun(dossierRun, ["datapro", "web_search", "model", "supabase"], "最新档案");
  assertDossierPersistenceBoundary(dossierRun);
  runs.push(dossierRun);

  const qaResult = await apiRequest(
    options,
    "POST",
    `/api/target-enterprises/${encodeURIComponent(company.id)}/qa`,
    { question: options.question },
  );
  const qaChecks = validateQa(qaResult);
  const qaRun = await findProviderRun(options, {
    runId: qaResult.provider_run_id,
    operation: "sales_qa",
    entityId: company.id,
  });
  assertProviderRun(qaRun, ["openviking", "model", "supabase"], "资料问答");
  runs.push(qaRun);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    mode: "real_business_chain",
    finished_at: new Date().toISOString(),
    writes_retained: true,
    goal_id: options.goalId || company.goal_id || null,
    enterprise: {
      id: company.id,
      name: company.name,
      identity_status: company.identity_status,
    },
    company_search: searchRun ? providerRunSummary(searchRun) : { status: "not_run_existing_enterprise" },
    dossier: {
      id: dossier.id,
      job_id: dossierJob?.id || null,
      version_no: dossier.version_no,
      citation_count: dossierChecks.citationCount,
      paragraph_count: dossierChecks.paragraphCount,
      source_kinds: dossierChecks.sourceKinds,
      provider_run: providerRunSummary(dossierRun),
    },
    qa: {
      message_id: qaChecks.message.id,
      citation_count: qaChecks.citationCount,
      provider_run: providerRunSummary(qaRun),
    },
    usage: usageSummary(runs),
  }, null, 2)}\n`);
}

export {
  apiRequest,
  assertDossierPersistenceBoundary,
  assertProviderRun,
  collectPrivatePaths,
  findProviderRun,
  normalizeIdentity,
  parseArgs,
  pollJob,
  selectCandidate,
  usageSummary,
  validateDossier,
  validateQa,
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      error: { message: error.message },
    }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
