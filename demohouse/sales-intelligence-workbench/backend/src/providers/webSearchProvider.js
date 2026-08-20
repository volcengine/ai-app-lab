import { createEnvReader } from "../config/runtimeEnv.js";
import { executeProviderCall, providerFailure, providerSuccess } from "./providerResult.js";

const DEFAULT_BASE_URL = "https://open.feedcoopapi.com/search_api/web_search";
const DEFAULT_TRAFFIC_TAG = "skill_web_search_common";
const DEFAULT_TIMEOUT_MS = 20000;

function clampCount(value, maxCount) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return maxCount;
  return Math.max(1, Math.min(Math.trunc(parsed), maxCount));
}

function normalizeError(payload) {
  const error = payload?.ResponseMetadata?.Error || payload?.Error || null;
  if (!error) return null;
  return {
    code: error.Code || payload?.Code || "provider_error",
    code_n: error.CodeN || payload?.CodeN || null,
    message: error.Message || payload?.Message || "Provider returned an error.",
  };
}

function cleanResultText(value, maxLength = 2000) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeTitle(value) {
  const title = cleanResultText(value, 500);
  const structured = title.match(
    /(?:^|---\s*)title\s*[:：]\s*(.*?)(?=\s+(?:source|datetime|publish(?:ed)?_?time|url|summary)\s*[:：]|$)/i,
  )?.[1];
  return cleanResultText(structured || title, 300)
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .trim();
}

function validPublishDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  const input = Number.isFinite(numeric)
    ? numeric < 10_000_000_000 ? numeric * 1000 : numeric
    : value;
  const date = new Date(input);
  if (!Number.isFinite(date.getTime())) return null;
  const year = date.getUTCFullYear();
  if (year < 2000 || year > new Date().getUTCFullYear() + 1) return null;
  return date.toISOString();
}

function normalizePublishTime(value, metadataText = "") {
  const direct = validPublishDate(value);
  if (direct) return direct;
  const embedded = cleanResultText(metadataText, 800).match(
    /(?:datetime|publish(?:ed)?_?time|发布日期|发布时间)\s*[:：]\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?)/i,
  )?.[1];
  return validPublishDate(embedded?.replaceAll("/", "-"));
}

function normalizeResult(result) {
  return {
    id: result.Id || null,
    sort_id: result.SortId ?? null,
    title: normalizeTitle(result.Title),
    site_name: cleanResultText(result.SiteName, 160),
    url: cleanResultText(result.Url, 1000),
    snippet: cleanResultText(result.Snippet, 2000),
    summary: cleanResultText(result.Summary, 4000),
    publish_time: normalizePublishTime(result.PublishTime, result.Title),
    logo_url: result.LogoUrl || null,
    rank_score: result.RankScore ?? null,
    auth_description: result.AuthInfoDes || null,
    auth_level: result.AuthInfoLevel ?? null,
    content_formats: result.ContentFormats || null,
  };
}

export class WebSearchProvider {
  constructor(options = {}) {
    this.env = options.env || createEnvReader();
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.sleep = options.sleep;
  }

  get apiKey() {
    return this.env.value("WEB_SEARCH_API_KEY")
      || this.env.value("AGENT_PLAN_API_KEY")
      || this.env.value("ASK_ECHO_SEARCH_INFINITY_API_KEY");
  }

  get baseUrl() {
    return this.env.value("WEB_SEARCH_BASE_URL", DEFAULT_BASE_URL);
  }

  get maxCount() {
    return Math.max(1, Math.min(this.env.number("WEB_SEARCH_MAX_COUNT", 3), 50));
  }

  get trafficTag() {
    return this.env.value("WEB_SEARCH_TRAFFIC_TAG", DEFAULT_TRAFFIC_TAG);
  }

  get runEnabled() {
    return ["1", "true", "yes", "on"].includes(String(this.env.value("WEB_SEARCH_RUN_ENABLED", "false")).toLowerCase());
  }

  get timeoutMs() {
    return Math.max(1000, this.env.number("WEB_SEARCH_TIMEOUT_MS", DEFAULT_TIMEOUT_MS));
  }

  get maxRetries() {
    return Math.max(0, Math.min(this.env.number("WEB_SEARCH_MAX_RETRIES", 1), 2));
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  isRunEnabled() {
    return this.isConfigured() && this.runEnabled;
  }

  async search(input) {
    const query = String(input.query || input.Query || "").trim();
    if (!query) {
      return providerFailure("web_search", { code: "bad_request", message: "query is required." });
    }
    if (query.length > 100) {
      return providerFailure("web_search", { code: "bad_request", message: "query must be 100 characters or fewer." });
    }
    if (!this.isConfigured()) {
      return providerFailure("web_search", { code: "missing_config", message: "AGENT_PLAN_API_KEY is not configured." });
    }

    const searchType = input.search_type || input.SearchType || "web";
    const count = clampCount(input.count ?? input.Count, this.maxCount);
    const body = {
      Query: query,
      SearchType: searchType,
      Count: count,
      NeedSummary: input.need_summary ?? input.NeedSummary ?? true,
    };
    const timeRange = input.time_range ?? input.TimeRange;
    const authLevel = input.auth_level ?? input.AuthLevel;
    const queryRewrite = input.query_rewrite ?? input.QueryRewrite;
    if (timeRange) body.TimeRange = timeRange;
    if (authLevel !== undefined && authLevel !== null && authLevel !== "") {
      body.Filter = { AuthInfoLevel: Number(authLevel) };
    }
    if (queryRewrite) body.QueryControl = { QueryRewrite: true };

    return executeProviderCall(
      () => this.searchOnce({ body, query, searchType }),
      {
        max_retries: this.maxRetries,
        base_delay_ms: 2500,
        sleep: this.sleep,
      },
    );
  }

  async searchOnce({ body, query, searchType }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    let payload;
    const startedAt = Date.now();
    try {
      response = await this.fetchImpl(this.baseUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "X-Traffic-Tag": this.trafficTag,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      payload = await response.json();
    } catch (error) {
      return providerFailure("web_search", {
          code: error.name === "AbortError" ? "timeout" : "network_error",
          message: error.name === "AbortError" ? "web search request timed out." : error.message,
      }, { latency_ms: Date.now() - startedAt });
    } finally {
      clearTimeout(timeout);
    }

    const providerError = normalizeError(payload);
    if (!response.ok || providerError) {
      return providerFailure("web_search", providerError || { code: "http_error", message: `HTTP ${response.status}` }, {
        http_status: response.status,
        request_id: payload?.ResponseMetadata?.RequestId || payload?.Result?.LogId || null,
        latency_ms: Date.now() - startedAt,
      });
    }

    const result = payload.Result || {};
    const webResults = Array.isArray(result.WebResults) ? result.WebResults : [];
    const requestId = payload.ResponseMetadata?.RequestId || result.LogId || null;
    return providerSuccess("web_search", {
      request_id: requestId,
      log_id: result.LogId || requestId,
      query,
      search_type: result.SearchContext?.SearchType || searchType,
      result_count: result.ResultCount ?? webResults.length,
      latency_ms: Date.now() - startedAt,
      raw_ref: requestId ? `web_search:${requestId}` : null,
      results: webResults.map(normalizeResult),
    });
  }
}

export function createWebSearchProvider(options = {}) {
  return new WebSearchProvider(options);
}
