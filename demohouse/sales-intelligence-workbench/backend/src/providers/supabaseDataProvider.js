import { createEnvReader } from "../config/runtimeEnv.js";

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function normalizedBaseUrl(value) {
  const base = String(value || "").trim().replace(/\/$/, "");
  if (!base) return "";
  return base.endsWith("/rest/v1") ? base : `${base}/rest/v1`;
}

function apiError(response, body) {
  const error = new Error(body?.message || body?.hint || `Supabase Data API returned HTTP ${response.status}.`);
  error.code = body?.code || `http_${response.status}`;
  error.details = body?.details || null;
  error.http_status = response.status;
  return error;
}

export class SupabaseDataProvider {
  constructor(options = {}) {
    this.env = options.env || createEnvReader();
    this.fetch = options.fetchImpl || fetch;
    this.baseUrl = normalizedBaseUrl(this.env.value("SUPABASE_API_URL"));
    this.serviceRoleKey = this.env.value("SUPABASE_SERVICE_ROLE_KEY");
    this.timeoutMs = this.env.number("SUPABASE_DATA_API_TIMEOUT_MS", 15000);
    this.runEnabled = truthy(this.env.value("SUPABASE_RUN_ENABLED", "false"));
  }

  isConfigured() {
    return Boolean(this.baseUrl && this.serviceRoleKey);
  }

  isRunEnabled() {
    return this.runEnabled;
  }

  async request(path, options = {}) {
    if (!this.isConfigured()) throw new Error("Supabase Data API is not configured.");
    const url = new URL(`${this.baseUrl}/${String(path).replace(/^\//, "")}`);
    for (const [name, value] of Object.entries(options.query || {})) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(name, String(value));
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(url, {
        method: options.method || "GET",
        headers: {
          Accept: "application/json",
          apikey: this.serviceRoleKey,
          Authorization: `Bearer ${this.serviceRoleKey}`,
          ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(options.prefer ? { Prefer: options.prefer } : {}),
          ...(options.headers || {}),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
      const text = await response.text();
      let body = null;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = { message: text.slice(0, 1000) };
        }
      }
      if (!response.ok) throw apiError(response, body);
      return body;
    } catch (error) {
      if (error.name === "AbortError") {
        const timeoutError = new Error(`Supabase Data API timed out after ${this.timeoutMs}ms.`);
        timeoutError.code = "timeout";
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  select(table, options = {}) {
    return this.request(table, {
      query: {
        select: options.select || "*",
        ...(options.filters || {}),
        order: options.order || undefined,
        limit: options.limit || undefined,
        offset: options.offset || undefined,
      },
    });
  }

  insert(table, rows, options = {}) {
    return this.request(table, {
      method: "POST",
      body: rows,
      prefer: options.returning === false ? "return=minimal" : "return=representation",
    });
  }

  upsert(table, rows, options = {}) {
    return this.request(table, {
      method: "POST",
      query: { on_conflict: options.onConflict || "id" },
      body: rows,
      prefer: `resolution=merge-duplicates,${options.returning === false ? "return=minimal" : "return=representation"}`,
    });
  }

  update(table, values, filters = {}, options = {}) {
    return this.request(table, {
      method: "PATCH",
      query: filters,
      body: values,
      prefer: options.returning === false ? "return=minimal" : "return=representation",
    });
  }

  delete(table, filters = {}, options = {}) {
    return this.request(table, {
      method: "DELETE",
      query: filters,
      prefer: options.returning === false ? "return=minimal" : "return=representation",
    });
  }

  rpc(functionName, body) {
    return this.request(`rpc/${functionName}`, {
      method: "POST",
      body,
      prefer: "return=representation",
    });
  }

  async probe() {
    const rows = await this.select("app_workspaces", { select: "id", limit: 1 });
    return { ok: true, row_count: Array.isArray(rows) ? rows.length : 0 };
  }
}

export function createSupabaseDataProvider(options = {}) {
  return new SupabaseDataProvider(options);
}
