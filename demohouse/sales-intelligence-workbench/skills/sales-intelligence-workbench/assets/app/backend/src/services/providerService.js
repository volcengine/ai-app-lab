import { HttpError } from "../utils/http.js";

export class ProviderService {
  constructor(options = {}) {
    this.getProviderStatusSnapshot = options.getProviderStatus || (() => ({}));
    this.webSearchProvider = options.webSearchProvider || null;
    this.modelProvider = options.modelProvider || null;
    this.dataProProvider = options.dataProProvider || null;
    this.openVikingProvider = options.openVikingProvider || null;
    this.supabaseDataProvider = options.supabaseDataProvider || null;
  }

  getProviderStatus() {
    return this.getProviderStatusSnapshot();
  }

  async probeWebSearch(body) {
    if (!this.webSearchProvider) throw new HttpError(500, "provider_unavailable", "Web search provider is not available.");
    const query = String(body.query || "").trim();
    if (!query) throw new HttpError(400, "bad_request", "query is required.");
    const result = await this.webSearchProvider.search({
      query,
      count: body.count,
      search_type: body.search_type,
      time_range: body.time_range,
      auth_level: body.auth_level,
      need_summary: body.need_summary,
    });
    return this.requireSuccess("web_search", result, "Web search probe failed.");
  }

  async probeDataPro(body = {}) {
    if (!this.dataProProvider) throw new HttpError(500, "provider_unavailable", "DataPro provider is not available.");
    const query = String(body.query || "").trim();
    if (!query) throw new HttpError(400, "bad_request", "query is required.");
    const result = await this.dataProProvider.callTool(query);
    return this.requireSuccess("datapro", result, "DataPro probe failed.");
  }

  async probeModel() {
    if (!this.modelProvider) throw new HttpError(500, "provider_unavailable", "Model provider is not available.");
    const result = await this.modelProvider.callJson({
      operation: "connectivity_probe",
      system: "只输出 JSON，返回 {\"ok\":true}。",
      payload: { task: "验证 Agent Plan 模型结构化响应连接" },
      maxTokens: 80,
    });
    return this.requireSuccess("model", result, "Model probe failed.");
  }

  async probeOpenViking(body = {}) {
    if (!this.openVikingProvider) throw new HttpError(500, "provider_unavailable", "OpenViking provider is not available.");
    const query = String(body.query || "").trim();
    const result = query
      ? await this.openVikingProvider.findMemories(query, { limit: body.limit })
      : await this.openVikingProvider.health();
    return this.requireSuccess("openviking", result, "OpenViking probe failed.");
  }

  async probeSupabase() {
    if (!this.supabaseDataProvider) {
      throw new HttpError(500, "provider_unavailable", "Supabase Data API provider is not available.");
    }
    let result;
    try {
      result = await this.supabaseDataProvider.probe();
    } catch (error) {
      throw new HttpError(502, error.code || "provider_error", error.message || "Supabase probe failed.", {
        provider: "supabase",
      });
    }
    return this.requireSuccess("supabase", result, "Supabase probe failed.");
  }

  requireSuccess(provider, result, fallbackMessage) {
    if (result?.ok) return result;
    const status = result?.error?.code === "missing_config" ? 503 : 502;
    throw new HttpError(status, result?.error?.code || "provider_error", result?.error?.message || fallbackMessage, {
      provider,
      request_id: result?.request_id || null,
    });
  }
}
