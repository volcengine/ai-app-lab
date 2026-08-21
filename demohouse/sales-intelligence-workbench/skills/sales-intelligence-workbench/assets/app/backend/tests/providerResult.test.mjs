import assert from "node:assert/strict";
import test from "node:test";
import { WebSearchProvider } from "../src/providers/webSearchProvider.js";
import { classifyProviderError, executeProviderCall, providerFailure } from "../src/providers/providerResult.js";

function envReader(values = {}) {
  return {
    value(name, fallback = "") {
      return Object.hasOwn(values, name) ? values[name] : fallback;
    },
    number(name, fallback = 0) {
      const value = Number(Object.hasOwn(values, name) ? values[name] : fallback);
      return Number.isFinite(value) ? value : fallback;
    },
  };
}

test("provider errors use stable categories and retryability", () => {
  assert.deepEqual(classifyProviderError({ code: "timeout" }), { category: "timeout", retryable: true });
  assert.deepEqual(classifyProviderError({ code: "missing_config" }), { category: "configuration", retryable: false });
  assert.deepEqual(classifyProviderError({ code: "4003" }), { category: "validation", retryable: false });
  assert.deepEqual(classifyProviderError({ code: "invalid_query" }), { category: "validation", retryable: false });
  assert.deepEqual(classifyProviderError({ http_status: 401 }), { category: "authentication", retryable: false });
  assert.deepEqual(
    classifyProviderError({ code: "10500", message: "Internal Error" }),
    { category: "upstream", retryable: true },
  );
  const failure = providerFailure("model", { code: "network_error", message: "connection reset" });
  assert.equal(failure.provider, "model");
  assert.equal(failure.provider_mode, "real");
  assert.equal(failure.error.category, "network");
  assert.equal(failure.error.retryable, true);
});

test("retry helper retries only retryable failures", async () => {
  let calls = 0;
  const result = await executeProviderCall(async () => {
    calls += 1;
    if (calls === 1) return providerFailure("web_search", { code: "network_error", message: "temporary" });
    return { ok: true, provider: "web_search", provider_mode: "real" };
  }, { max_retries: 1, sleep: async () => {} });

  assert.equal(calls, 2);
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 2);
});

test("web search retries a transient network failure once", async () => {
  let calls = 0;
  const retryDelays = [];
  const provider = new WebSearchProvider({
    env: envReader({
      WEB_SEARCH_API_KEY: "test-key",
      WEB_SEARCH_MAX_RETRIES: "1",
      WEB_SEARCH_TIMEOUT_MS: "1000",
    }),
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new Error("temporary network failure");
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            ResponseMetadata: { RequestId: "request-1" },
            Result: { ResultCount: 0, WebResults: [] },
          };
        },
      };
    },
    sleep: async (milliseconds) => {
      retryDelays.push(milliseconds);
    },
  });

  const result = await provider.search({ query: "测试查询", count: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 2);
  assert.equal(calls, 2);
  assert.deepEqual(retryDelays, [2500]);
});

test("web search retries the official 10500 temporary-unavailable response once", async () => {
  let calls = 0;
  const retryDelays = [];
  const provider = new WebSearchProvider({
    env: envReader({
      WEB_SEARCH_API_KEY: "test-key",
      WEB_SEARCH_MAX_RETRIES: "1",
      WEB_SEARCH_TIMEOUT_MS: "1000",
    }),
    fetchImpl: async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            ResponseMetadata: {
              RequestId: `request-${calls}`,
              Error: {
                Code: "10500",
                Message: "Ark AgentPlan service is temporarily unavailable. Please retry later.",
              },
            },
          };
        },
      };
    },
    sleep: async (milliseconds) => {
      retryDelays.push(milliseconds);
    },
  });

  const result = await provider.search({ query: "测试查询", count: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "10500");
  assert.equal(result.error.retryable, true);
  assert.equal(result.attempts, 2);
  assert.equal(calls, 2);
  assert.deepEqual(retryDelays, [2500]);
});

test("web search retries a 10500 Internal Error response once", async () => {
  let calls = 0;
  const provider = new WebSearchProvider({
    env: envReader({
      WEB_SEARCH_API_KEY: "test-key",
      WEB_SEARCH_MAX_RETRIES: "1",
      WEB_SEARCH_TIMEOUT_MS: "1000",
    }),
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              ResponseMetadata: {
                RequestId: "request-internal-error",
                Error: { Code: "10500", Message: "Internal Error" },
              },
            };
          },
        };
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            ResponseMetadata: { RequestId: "request-recovered" },
            Result: { ResultCount: 0, WebResults: [] },
          };
        },
      };
    },
    sleep: async () => {},
  });

  const result = await provider.search({ query: "测试查询", count: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 2);
  assert.equal(calls, 2);
});

test("web search sends official authority filter and query rewrite fields", async () => {
  let requestBody = null;
  let requestHeaders = null;
  const provider = new WebSearchProvider({
    env: envReader({
      WEB_SEARCH_API_KEY: "test-key",
      WEB_SEARCH_MAX_RETRIES: "0",
      WEB_SEARCH_TIMEOUT_MS: "1000",
    }),
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      requestHeaders = options.headers;
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            ResponseMetadata: { RequestId: "request-2" },
            Result: { ResultCount: 0, WebResults: [] },
          };
        },
      };
    },
  });

  const result = await provider.search({
    query: "权威来源测试",
    count: 3,
    auth_level: 1,
    query_rewrite: true,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(requestBody.Filter, { AuthInfoLevel: 1 });
  assert.deepEqual(requestBody.QueryControl, { QueryRewrite: true });
  assert.equal(Object.hasOwn(requestBody, "AuthLevel"), false);
  assert.equal(requestHeaders["X-Traffic-Tag"], "skill_web_search_common");
});

test("web search cleans structured titles and discards epoch publish times", async () => {
  const provider = new WebSearchProvider({
    env: envReader({
      WEB_SEARCH_API_KEY: "test-key",
      WEB_SEARCH_MAX_RETRIES: "0",
      WEB_SEARCH_TIMEOUT_MS: "1000",
    }),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          ResponseMetadata: { RequestId: "request-clean" },
          Result: {
            ResultCount: 3,
            WebResults: [
              {
                Title: "--- title: 比亚迪与合作伙伴发布新项目 source: 示例网 datetime: 2026-07-20",
                Url: "https://news.example.org/byd",
                Summary: "  比亚迪发布合作动态。\n",
                PublishTime: 0,
              },
              {
                Title: "正常标题",
                Url: "https://news.example.org/current",
                PublishTime: 1784505600,
              },
              {
                Title: "没有日期的旧结果",
                Url: "https://news.example.org/epoch",
                PublishTime: 0,
              },
            ],
          },
        };
      },
    }),
  });

  const result = await provider.search({ query: "比亚迪 最新合作", count: 2 });
  assert.equal(result.results[0].title, "比亚迪与合作伙伴发布新项目");
  assert.equal(result.results[0].summary, "比亚迪发布合作动态。");
  assert.equal(result.results[0].publish_time, "2026-07-20T00:00:00.000Z");
  assert.equal(result.results[1].publish_time, "2026-07-20T00:00:00.000Z");
  assert.equal(result.results[2].publish_time, null);
});
