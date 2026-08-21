import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import { createEnvReader } from "../config/runtimeEnv.js";
import { providerFailure, providerSuccess } from "./providerResult.js";

const execFileAsync = promisify(execFile);

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function truncate(text, maxLength = 12000) {
  const value = String(text || "");
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function parseJsonOutput(stdout) {
  const output = String(stdout || "").trim();
  if (!output) return null;
  try {
    return JSON.parse(output);
  } catch {
    const objectStart = output.indexOf("{");
    const arrayStart = output.indexOf("[");
    const candidates = [objectStart, arrayStart].filter((index) => index >= 0);
    if (!candidates.length) return null;
    const start = Math.min(...candidates);
    try {
      return JSON.parse(output.slice(start));
    } catch {
      return null;
    }
  }
}

function defaultCliPath() {
  const homeCli = process.env.HOME ? join(process.env.HOME, "bin", "ov") : "";
  if (homeCli && existsSync(homeCli)) return homeCli;
  return "ov";
}

function defaultCliConfigPath() {
  return process.env.HOME ? join(process.env.HOME, ".openviking", "ovcli.conf") : "";
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

function readCliConfig(configPath) {
  if (!configPath || !existsSync(configPath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function sessionIdFromResult(result, fallback = "") {
  const candidates = [
    result?.session_id,
    result?.id,
    result?.result?.session_id,
    result?.result?.id,
  ];
  return String(candidates.find((value) => value) || fallback || "").trim();
}

function sessionMessageText(message) {
  const parts = Array.isArray(message?.parts) ? message.parts : [];
  const partText = parts
    .filter((part) => part?.type === "text" || typeof part?.text === "string")
    .map((part) => String(part?.text || ""))
    .join("\n")
    .trim();
  return partText || String(message?.content || message?.text || "").trim();
}

function normalizeSessionContext(result) {
  const context = result?.result && typeof result.result === "object" ? result.result : result || {};
  const messages = (Array.isArray(context?.messages) ? context.messages : [])
    .map((message, index) => ({
      id: String(message?.id || `openviking-message-${index + 1}`),
      role: ["assistant", "user"].includes(message?.role) ? message.role : "user",
      text: sessionMessageText(message),
      created_at: message?.created_at || message?.timestamp || null,
    }))
    .filter((message) => message.text);
  return {
    ...context,
    latest_archive_overview: String(
      context?.latest_archive_overview
      || context?.archive_overview
      || context?.overview
      || "",
    ).trim(),
    messages,
  };
}

function textResourceContent(result) {
  const value = result?.result ?? result;
  if (typeof value === "string") return value;
  return String(value?.content || value?.text || value?.raw_content || "").trim();
}

function isSessionNotFound(result) {
  const code = String(result?.error?.code || "").toLowerCase();
  const message = `${result?.error?.message || ""} ${result?.stderr || ""} ${result?.stdout || ""}`.toLowerCase();
  return Number(result?.http_status || 0) === 404
    || ["404", "not_found", "session_not_found"].includes(code)
    || /not found|does not exist|不存在|未找到/.test(message);
}

function uriSegment(value, fallback = "default") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

export class OpenVikingProvider {
  constructor(options = {}) {
    this.env = options.env || createEnvReader();
    this.execFile = options.execFile || execFileAsync;
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.cliPath = this.env.value("OPENVIKING_CLI") || defaultCliPath();
    this.cliConfigPath = this.env.value("OPENVIKING_CLI_CONFIG") || defaultCliConfigPath();
    this.cliConfig = options.cliConfig || readCliConfig(this.cliConfigPath);
    this.agentId = this.env.value("OPENVIKING_AGENT_ID") || this.cliConfig.agent_id || "default";
    this.timeoutMs = Math.min(300000, Math.max(5000, this.env.number("OPENVIKING_TIMEOUT_MS", 120000)));
    this.findLimit = this.env.number("OPENVIKING_FIND_LIMIT", 3);
    this.qaKeepRecentMessages = Math.max(0, Math.min(
      40,
      this.env.number("OPENVIKING_QA_KEEP_RECENT_MESSAGES", 6),
    ));
    this.memoryUri = this.env.value("OPENVIKING_MEMORY_URI", "");
    this.salesRootUri = String(this.env.value("OPENVIKING_SALES_ROOT_URI", "viking://resources/sales-workbench") || "viking://resources/sales-workbench").replace(/\/$/, "");
  }

  get apiKey() {
    return this.env.value("OPENVIKING_API_KEY")
      || this.env.value("OPENVIKING_BEARER_TOKEN")
      || this.cliConfig.api_key
      || "";
  }

  get baseUrl() {
    const raw = this.env.value("OPENVIKING_BASE_URL")
      || this.env.value("OPENVIKING_URL")
      || this.cliConfig.url
      || "";
    return String(raw || "").replace(/\/mcp\/?$/, "").replace(/\/api\/v1\/?$/, "").replace(/\/$/, "");
  }

  isConfigured() {
    return Boolean((this.baseUrl && this.apiKey) || commandExists(this.cliPath));
  }

  isRunEnabled() {
    return truthy(this.env.value("OPENVIKING_RUN_ENABLED", "false"));
  }

  salesWorkspaceUri({ workspaceId } = {}) {
    return `${this.salesRootUri}/${uriSegment(workspaceId, "local-workspace")}`;
  }

  salesCompanyUri({ workspaceId, companyId } = {}) {
    return `${this.salesWorkspaceUri({ workspaceId })}/companies/${uriSegment(companyId, "unknown-company")}`;
  }

  salesMaterialUri({ workspaceId, companyId, sourceId } = {}) {
    return `${this.salesCompanyUri({ workspaceId, companyId })}/materials/${uriSegment(sourceId, "unknown-source")}.md`;
  }

  salesDossierUri({ workspaceId, companyId, dossierId } = {}) {
    return `${this.salesCompanyUri({ workspaceId, companyId })}/dossiers/${uriSegment(dossierId, "unknown-dossier")}.md`;
  }

  salesSessionId({ workspaceId, companyId } = {}) {
    return `sales-${uriSegment(workspaceId, "local-workspace")}-${uriSegment(companyId, "unknown-company")}`;
  }

  async runCli(args) {
    const startedAt = Date.now();
    const cliArgs = this.agentId && !args.includes("--agent-id")
      ? ["--agent-id", this.agentId, ...args]
      : args;
    try {
      const { stdout, stderr } = await this.execFile(this.cliPath, cliArgs, {
        timeout: this.timeoutMs,
        maxBuffer: 1024 * 1024,
        env: {
          ...process.env,
          NO_COLOR: "1",
          PYTHONIOENCODING: "utf-8",
        },
      });
      return providerSuccess("openviking", {
        stdout: truncate(stdout),
        stderr: truncate(stderr, 2000),
        latency_ms: Date.now() - startedAt,
      });
    } catch (error) {
      const timedOut = error.code === "ETIMEDOUT" || (error.killed && error.signal === "SIGTERM");
      return providerFailure("openviking", {
          code: error.code === "ENOENT" ? "missing_cli" : timedOut ? "timeout" : "cli_error",
          message: timedOut ? "OpenViking CLI request timed out." : truncate(error.message, 2000),
      }, {
        stdout: truncate(error.stdout, 2000),
        stderr: truncate(error.stderr, 2000),
        latency_ms: Date.now() - startedAt,
      });
    }
  }

  async callRest(path, body = {}, options = {}) {
    if (!this.baseUrl || !this.apiKey) {
      return providerFailure("openviking", { code: "missing_http_config", message: "OPENVIKING_BASE_URL and an OpenViking API Key are not configured." });
    }
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    let payload;
    try {
      const method = String(options.method || "POST").toUpperCase();
      response = await this.fetchImpl(`${this.baseUrl}/api/v1${path}`, {
        method,
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "X-OpenViking-Agent": this.agentId,
        },
        body: ["GET", "HEAD", "DELETE"].includes(method) ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      payload = text ? JSON.parse(text) : {};
    } catch (error) {
      return providerFailure("openviking", {
          code: error.name === "AbortError" ? "timeout" : "network_error",
          message: error.name === "AbortError" ? "OpenViking HTTP request timed out." : error.message,
      }, {
        latency_ms: Date.now() - startedAt,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok || payload?.status === "error") {
      return providerFailure("openviking", {
        code: payload?.error?.code || "provider_error",
        message: payload?.error?.message || `HTTP ${response.status}`,
      }, {
        http_status: response.status,
        latency_ms: Date.now() - startedAt,
      });
    }

    return providerSuccess("openviking", {
      result: payload?.result ?? payload,
      raw_ref: `openviking:http:${path}`,
      latency_ms: Date.now() - startedAt,
    });
  }

  async health() {
    if (!this.isConfigured()) {
      return providerFailure("openviking", { code: "missing_config", message: "OpenViking CLI is not configured." });
    }
    const result = await this.runCli(["health", "-o", "json"]);
    if (!result.ok) return result;
    return providerSuccess("openviking", {
      result: parseJsonOutput(result.stdout),
      raw_ref: "openviking:health",
      latency_ms: result.latency_ms,
    });
  }

  buildConfirmedCardMemory({ scope, object, card, sources }) {
    const sourceLines = (sources || [])
      .slice(0, 5)
      .map((source) => `- ${source.label || source.id}${source.url ? ` (${source.url})` : ""}`)
      .join("\n");
    return [
      "竞争变化卡已被用户确认，需要作为长期记忆保存。",
      `范围：${scope?.name || card.scope_id}`,
      `对象：${object?.name || card.object_id}`,
      `维度：${card.dimension}`,
      `标题：${card.title}`,
      `确认后的变化：${card.after}`,
      `置信度：${card.confidence}`,
      sourceLines ? `证据来源：\n${sourceLines}` : "",
      `内部追踪：scope=${card.scope_id}; object=${card.object_id}; card=${card.id}; run=${card.run_id}`,
    ].filter(Boolean).join("\n");
  }

  async rememberConfirmedCard(payload) {
    if (!this.isConfigured()) {
      return providerFailure("openviking", { code: "missing_config", message: "OpenViking CLI is not configured." });
    }
    if (!this.isRunEnabled()) {
      return providerFailure("openviking", { code: "disabled", message: "OPENVIKING_RUN_ENABLED is false." }, { skipped: true });
    }

    const content = this.buildConfirmedCardMemory(payload);
    const message = JSON.stringify({ role: "user", content });
    const result = await this.runCli(["add-memory", message, "-o", "json"]);
    if (!result.ok) return result;

    const parsed = parseJsonOutput(result.stdout);
    return providerSuccess("openviking", {
      raw_ref: `openviking:add-memory:${payload.card.id}`,
      result: parsed,
      summary: parsed?.result?.message || parsed?.message || "OpenViking memory write completed.",
      latency_ms: result.latency_ms,
    });
  }

  async storeMemory(messages) {
    if (!this.isConfigured()) {
      return providerFailure("openviking", { code: "missing_config", message: "OpenViking is not configured." });
    }
    if (!this.isRunEnabled()) {
      return providerFailure("openviking", { code: "disabled", message: "OPENVIKING_RUN_ENABLED is false." }, { skipped: true });
    }
    const normalized = Array.isArray(messages) ? messages : [{ role: "user", content: String(messages || "") }];
    const result = await this.runCli(["add-memory", JSON.stringify(normalized), "-o", "json"]);
    if (!result.ok) return result;
    const parsed = parseJsonOutput(result.stdout);
    return providerSuccess("openviking", {
      raw_ref: `openviking:add-memory:${Date.now()}`,
      result: parsed,
      summary: parsed?.result?.message || parsed?.message || "OpenViking memory write completed.",
      latency_ms: result.latency_ms,
    });
  }

  async addResource(path, options = {}) {
    if (!this.isConfigured()) {
      return providerFailure("openviking", { code: "missing_config", message: "OpenViking is not configured." });
    }
    if (!this.isRunEnabled()) {
      return providerFailure("openviking", { code: "disabled", message: "OPENVIKING_RUN_ENABLED is false." }, { skipped: true });
    }
    const args = ["add-resource", String(path), "-o", "json"];
    if (options.to) args.push("--to", String(options.to));
    if (options.parent) args.push("--parent", String(options.parent));
    if (options.reason) args.push("--reason", String(options.reason));
    if (options.instruction) args.push("--instruction", String(options.instruction));
    if (options.wait) args.push("--wait");
    const result = await this.runCli(args);
    if (!result.ok) return result;
    return providerSuccess("openviking", {
      raw_ref: `openviking:add-resource:${path}`,
      result: parseJsonOutput(result.stdout),
      latency_ms: result.latency_ms,
    });
  }

  async upsertTextResource({ uri, content, mode = "replace" } = {}) {
    const targetUri = String(uri || "").trim();
    const text = String(content || "").trim();
    if (!targetUri || !text) {
      return providerFailure("openviking", { code: "bad_request", message: "uri and content are required." });
    }
    if (!this.isConfigured()) {
      return providerFailure("openviking", { code: "missing_config", message: "OpenViking is not configured." });
    }
    if (!this.isRunEnabled()) {
      return providerFailure("openviking", { code: "disabled", message: "OPENVIKING_RUN_ENABLED is false." }, { skipped: true });
    }
    const writeMode = mode === "create" ? "create" : "replace";
    const result = await this.runCli([
      "write",
      targetUri,
      "--content",
      text,
      "--mode",
      writeMode,
      "-o",
      "json",
    ]);
    if (!result.ok) return result;
    const parsed = parseJsonOutput(result.stdout);
    const semanticStatus = String(parsed?.result?.semantic_status || "").trim();
    const vectorStatus = String(parsed?.result?.vector_status || "").trim();
    const processingStatus = [semanticStatus, vectorStatus].includes("queued") ? "queued" : "ready";
    return providerSuccess("openviking", {
      uri: targetUri,
      raw_ref: targetUri,
      result: parsed,
      processing_status: processingStatus,
      summary: processingStatus === "queued"
        ? "OpenViking resource accepted and queued for indexing."
        : writeMode === "create" ? "OpenViking resource created." : "OpenViking resource updated.",
      latency_ms: result.latency_ms,
    });
  }

  async readTextResource(uri) {
    const targetUri = String(uri || "").trim();
    if (!targetUri) {
      return providerFailure("openviking", { code: "bad_request", message: "uri is required." });
    }
    if (!this.isConfigured()) {
      return providerFailure("openviking", { code: "missing_config", message: "OpenViking is not configured." });
    }

    if (this.baseUrl && this.apiKey) {
      const result = await this.callRest(
        `/content/read?uri=${encodeURIComponent(targetUri)}&raw=true`,
        {},
        { method: "GET" },
      );
      if (!result.ok) return result;
      return providerSuccess("openviking", {
        uri: targetUri,
        content: textResourceContent(result.result),
        result: result.result,
        raw_ref: targetUri,
        latency_ms: result.latency_ms,
      });
    }

    const result = await this.runCli(["read", targetUri, "-o", "json"]);
    if (!result.ok) return result;
    const parsed = parseJsonOutput(result.stdout);
    return providerSuccess("openviking", {
      uri: targetUri,
      content: textResourceContent(parsed),
      result: parsed?.result ?? parsed,
      raw_ref: targetUri,
      latency_ms: result.latency_ms,
    });
  }

  async removeResource(uri) {
    const targetUri = String(uri || "").trim();
    if (!targetUri) {
      return providerFailure("openviking", { code: "bad_request", message: "uri is required." });
    }
    if (!this.isConfigured()) {
      return providerFailure("openviking", { code: "missing_config", message: "OpenViking is not configured." });
    }
    if (!this.isRunEnabled()) {
      return providerFailure("openviking", { code: "disabled", message: "OPENVIKING_RUN_ENABLED is false." }, { skipped: true });
    }
    const result = await this.runCli(["rm", targetUri, "-o", "json"]);
    if (!result.ok) return result;
    return providerSuccess("openviking", {
      uri: targetUri,
      raw_ref: targetUri,
      result: parseJsonOutput(result.stdout),
      summary: "OpenViking resource removed.",
      latency_ms: result.latency_ms,
    });
  }

  async getSession(sessionId) {
    const targetSessionId = String(sessionId || "").trim();
    if (!targetSessionId) {
      return providerFailure("openviking", { code: "bad_request", message: "sessionId is required." });
    }
    if (this.baseUrl && this.apiKey) {
      const result = await this.callRest(`/sessions/${encodeURIComponent(targetSessionId)}`, {}, { method: "GET" });
      if (!result.ok) return result;
      return providerSuccess("openviking", {
        session_id: sessionIdFromResult(result.result, targetSessionId),
        result: result.result,
        raw_ref: `openviking:session:${targetSessionId}`,
        latency_ms: result.latency_ms,
      });
    }

    const result = await this.runCli(["session", "get", targetSessionId, "-o", "json"]);
    if (!result.ok) return result;
    const parsed = parseJsonOutput(result.stdout);
    return providerSuccess("openviking", {
      session_id: sessionIdFromResult(parsed, targetSessionId),
      result: parsed?.result ?? parsed,
      raw_ref: `openviking:session:${targetSessionId}`,
      latency_ms: result.latency_ms,
    });
  }

  async getSessionContext(sessionId, options = {}) {
    const targetSessionId = String(sessionId || "").trim();
    if (!targetSessionId) {
      return providerFailure("openviking", { code: "bad_request", message: "sessionId is required." });
    }
    if (!this.isConfigured()) {
      return providerFailure("openviking", { code: "missing_config", message: "OpenViking is not configured." });
    }

    if (this.baseUrl && this.apiKey) {
      const tokenBudget = Math.max(0, Number(options.tokenBudget || 0));
      const query = tokenBudget ? `?token_budget=${Math.floor(tokenBudget)}` : "";
      const result = await this.callRest(
        `/sessions/${encodeURIComponent(targetSessionId)}/context${query}`,
        {},
        { method: "GET" },
      );
      if (!result.ok) return result;
      const context = normalizeSessionContext(result.result);
      return providerSuccess("openviking", {
        session_id: targetSessionId,
        context,
        messages: context.messages,
        latest_archive_overview: context.latest_archive_overview,
        result: result.result,
        raw_ref: `openviking:session:${targetSessionId}:context`,
        latency_ms: result.latency_ms,
      });
    }

    const result = await this.runCli([
      "session",
      "get-session-context",
      targetSessionId,
      "-o",
      "json",
    ]);
    if (!result.ok) return result;
    const parsed = parseJsonOutput(result.stdout);
    const context = normalizeSessionContext(parsed);
    return providerSuccess("openviking", {
      session_id: targetSessionId,
      context,
      messages: context.messages,
      latest_archive_overview: context.latest_archive_overview,
      result: parsed?.result ?? parsed,
      raw_ref: `openviking:session:${targetSessionId}:context`,
      latency_ms: result.latency_ms,
    });
  }

  async createSession(preferredSessionId = "") {
    const requestedSessionId = String(preferredSessionId || "").trim();
    if (this.baseUrl && this.apiKey) {
      const body = requestedSessionId ? { session_id: requestedSessionId } : {};
      const result = await this.callRest("/sessions", body);
      if (!result.ok) return result;
      const sessionId = sessionIdFromResult(result.result, requestedSessionId);
      if (!sessionId) {
        return providerFailure("openviking", {
          code: "invalid_response",
          message: "OpenViking did not return a session_id.",
        });
      }
      return providerSuccess("openviking", {
        session_id: sessionId,
        created: true,
        result: result.result,
        raw_ref: `openviking:session:${sessionId}`,
        latency_ms: result.latency_ms,
      });
    }

    const result = await this.runCli(["session", "new", "-o", "json"]);
    if (!result.ok) return result;
    const parsed = parseJsonOutput(result.stdout);
    const sessionId = sessionIdFromResult(parsed);
    if (!sessionId) {
      return providerFailure("openviking", {
        code: "invalid_response",
        message: "OpenViking CLI did not return a session_id.",
      });
    }
    return providerSuccess("openviking", {
      session_id: sessionId,
      created: true,
      result: parsed?.result ?? parsed,
      raw_ref: `openviking:session:${sessionId}`,
      latency_ms: result.latency_ms,
    });
  }

  async ensureSession(sessionId) {
    const preferredSessionId = String(sessionId || "").trim();
    if (!preferredSessionId) return this.createSession();
    const existing = await this.getSession(preferredSessionId);
    if (existing.ok) return { ...existing, created: false };
    if (!isSessionNotFound(existing)) return existing;
    return this.createSession(preferredSessionId);
  }

  async addSessionMessages(sessionId, messages) {
    const normalized = (Array.isArray(messages) ? messages : [])
      .map((message) => ({
        role: ["assistant", "user"].includes(message.role) ? message.role : "user",
        content: String(message.content || message.text || "").trim(),
      }))
      .filter((message) => message.content);
    if (!normalized.length) {
      return providerFailure("openviking", { code: "bad_request", message: "messages are required." });
    }
    if (!this.isConfigured()) {
      return providerFailure("openviking", { code: "missing_config", message: "OpenViking is not configured." });
    }
    if (!this.isRunEnabled()) {
      return providerFailure("openviking", { code: "disabled", message: "OPENVIKING_RUN_ENABLED is false." }, { skipped: true });
    }

    const ensured = await this.ensureSession(sessionId);
    if (!ensured.ok) return ensured;
    const actualSessionId = ensured.session_id;
    const results = [];

    if (this.baseUrl && this.apiKey) {
      for (const message of normalized) {
        const result = await this.callRest(
          `/sessions/${encodeURIComponent(actualSessionId)}/messages`,
          {
            role: message.role,
            parts: [{ type: "text", text: message.content }],
          },
        );
        if (!result.ok) return result;
        results.push(result.result);
      }
    } else {
      for (const message of normalized) {
        const result = await this.runCli([
          "session",
          "add-message",
          actualSessionId,
          "--role",
          message.role,
          "--content",
          message.content,
          "-o",
          "json",
        ]);
        if (!result.ok) return result;
        results.push(parseJsonOutput(result.stdout));
      }
    }

    return providerSuccess("openviking", {
      session_id: actualSessionId,
      created: Boolean(ensured.created),
      raw_ref: `openviking:session:${actualSessionId}:messages`,
      result: results,
    });
  }

  async recordSessionUsed(sessionId, contexts = []) {
    const uris = (contexts || []).map((item) => String(item || "").trim()).filter(Boolean);
    if (!uris.length) return providerSuccess("openviking", { skipped: true, summary: "No OpenViking contexts used." });
    if (!this.isRunEnabled()) {
      return providerFailure("openviking", { code: "disabled", message: "OPENVIKING_RUN_ENABLED is false." }, { skipped: true });
    }
    const result = await this.callRest(`/sessions/${encodeURIComponent(sessionId)}/used`, { contexts: uris });
    return {
      ...result,
      raw_ref: result.ok ? `openviking:session:${sessionId}:used` : result.raw_ref,
    };
  }

  async commitSession(sessionId, options = {}) {
    if (!this.isConfigured()) {
      return providerFailure("openviking", { code: "missing_config", message: "OpenViking is not configured." });
    }
    if (!this.isRunEnabled()) {
      return providerFailure("openviking", { code: "disabled", message: "OPENVIKING_RUN_ENABLED is false." }, { skipped: true });
    }

    const keepRecentCount = Math.max(0, Math.min(
      40,
      Number.isFinite(Number(options.keepRecentCount))
        ? Math.floor(Number(options.keepRecentCount))
        : this.qaKeepRecentMessages,
    ));
    const rest = await this.callRest(`/sessions/${encodeURIComponent(sessionId)}/commit`, {
      telemetry: false,
      keep_recent_count: keepRecentCount,
    });
    if (rest.ok || rest.error?.code !== "missing_http_config") {
      return {
        ...rest,
        raw_ref: rest.ok ? `openviking:session:${sessionId}:commit` : rest.raw_ref,
      };
    }

    const result = await this.runCli(["session", "commit", String(sessionId), "-o", "json"]);
    if (!result.ok) return result;
    return providerSuccess("openviking", {
      raw_ref: `openviking:session:${sessionId}:commit`,
      result: parseJsonOutput(result.stdout),
      latency_ms: result.latency_ms,
    });
  }

  async deleteSession(sessionId) {
    const targetSessionId = String(sessionId || "").trim();
    if (!targetSessionId) {
      return providerFailure("openviking", { code: "bad_request", message: "sessionId is required." });
    }
    if (!this.isConfigured()) {
      return providerFailure("openviking", { code: "missing_config", message: "OpenViking is not configured." });
    }
    if (!this.isRunEnabled()) {
      return providerFailure("openviking", { code: "disabled", message: "OPENVIKING_RUN_ENABLED is false." }, { skipped: true });
    }
    if (!this.baseUrl || !this.apiKey) {
      return providerFailure("openviking", {
        code: "missing_http_config",
        message: "Deleting an OpenViking session requires HTTP configuration or ~/.openviking/ovcli.conf.",
      });
    }
    const result = await this.callRest(`/sessions/${encodeURIComponent(targetSessionId)}`, {}, { method: "DELETE" });
    if (!result.ok) return result;
    return providerSuccess("openviking", {
      session_id: targetSessionId,
      raw_ref: `openviking:session:${targetSessionId}:deleted`,
      result: result.result,
      latency_ms: result.latency_ms,
    });
  }

  async findMemories(query, options = {}) {
    if (!this.isConfigured()) {
      return providerFailure("openviking", { code: "missing_config", message: "OpenViking CLI is not configured." });
    }
    const args = ["find", String(query || ""), "--node-limit", String(options.limit || this.findLimit), "-o", "json"];
    const uri = options.uri || this.memoryUri;
    if (uri) args.splice(2, 0, "--uri", uri);
    const result = await this.runCli(args);
    if (!result.ok) return result;
    const parsed = parseJsonOutput(result.stdout);

    return providerSuccess("openviking", {
      result: parsed?.result ?? parsed,
      raw_ref: "openviking:find",
      latency_ms: result.latency_ms,
    });
  }
}

export function createOpenVikingProvider(options = {}) {
  return new OpenVikingProvider(options);
}
