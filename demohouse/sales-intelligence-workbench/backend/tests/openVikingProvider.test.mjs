import assert from "node:assert/strict";
import test from "node:test";
import { OpenVikingProvider } from "../src/providers/openVikingProvider.js";

function envReader(values = {}) {
  return {
    value(name, fallback = "") {
      return Object.hasOwn(values, name) ? values[name] : fallback;
    },
    number(name, fallback) {
      return Object.hasOwn(values, name) ? Number(values[name]) : fallback;
    },
  };
}

test("OpenViking timeout allows long resource ingestion and remains bounded", () => {
  assert.equal(new OpenVikingProvider({ env: envReader() }).timeoutMs, 120_000);
  assert.equal(new OpenVikingProvider({ env: envReader({ OPENVIKING_TIMEOUT_MS: "180000" }) }).timeoutMs, 180_000);
  assert.equal(new OpenVikingProvider({ env: envReader({ OPENVIKING_TIMEOUT_MS: "1000" }) }).timeoutMs, 5_000);
  assert.equal(new OpenVikingProvider({ env: envReader({ OPENVIKING_TIMEOUT_MS: "900000" }) }).timeoutMs, 300_000);
});

test("sales OpenViking URIs isolate workspace, company and source", () => {
  const provider = new OpenVikingProvider({
    env: envReader({ OPENVIKING_SALES_ROOT_URI: "viking://resources/sales-root" }),
  });

  assert.equal(
    provider.salesMaterialUri({ workspaceId: "Workspace A", companyId: "Company A", sourceId: "sync_123" }),
    "viking://resources/sales-root/workspace-a/companies/company-a/materials/sync_123.md",
  );
  assert.notEqual(
    provider.salesCompanyUri({ workspaceId: "workspace-a", companyId: "company-a" }),
    provider.salesCompanyUri({ workspaceId: "workspace-a", companyId: "company-b" }),
  );
  assert.equal(
    provider.salesDossierUri({ workspaceId: "Workspace A", companyId: "Company A", dossierId: "Dossier 1" }),
    "viking://resources/sales-root/workspace-a/companies/company-a/dossiers/dossier-1.md",
  );
  assert.equal(
    provider.salesSessionId({ workspaceId: "Workspace A", companyId: "Company A" }),
    "sales-workspace-a-company-a",
  );
});

test("text resource writes use explicit create and replace modes", async () => {
  const calls = [];
  const provider = new OpenVikingProvider({
    env: envReader({
      OPENVIKING_RUN_ENABLED: "true",
      OPENVIKING_CLI: process.execPath,
    }),
    execFile: async (_command, args) => {
      calls.push(args);
      return {
        stdout: JSON.stringify({
          ok: true,
          result: { semantic_status: "queued", vector_status: "queued" },
        }),
        stderr: "",
      };
    },
  });
  const uri = provider.salesMaterialUri({ workspaceId: "workspace-a", companyId: "company-a", sourceId: "source-a" });

  const created = await provider.upsertTextResource({ uri, content: "first", mode: "create" });
  const updated = await provider.upsertTextResource({ uri, content: "second", mode: "replace" });

  assert.equal(created.ok, true);
  assert.equal(updated.ok, true);
  assert.equal(created.uri, uri);
  assert.equal(created.processing_status, "queued");
  assert.deepEqual(calls[0], ["--agent-id", "default", "write", uri, "--content", "first", "--mode", "create", "-o", "json"]);
  assert.deepEqual(calls[1], ["--agent-id", "default", "write", uri, "--content", "second", "--mode", "replace", "-o", "json"]);
});

test("text resource reads return canonical content from the official HTTP endpoint", async () => {
  const calls = [];
  const provider = new OpenVikingProvider({
    env: envReader({
      OPENVIKING_BASE_URL: "https://openviking.example",
      OPENVIKING_API_KEY: "private-key",
    }),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ result: { content: "# 飞书资料\n客户关注私有化部署。" } });
        },
      };
    },
  });

  const result = await provider.readTextResource("viking://resources/company/material.md");

  assert.equal(result.ok, true);
  assert.equal(result.content, "# 飞书资料\n客户关注私有化部署。");
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.body, undefined);
  assert.match(calls[0].url, /\/api\/v1\/content\/read\?uri=/);
  assert.match(calls[0].url, /raw=true$/);
});

test("company-scoped retrieval passes the exact subtree URI", async () => {
  const calls = [];
  const provider = new OpenVikingProvider({
    env: envReader({ OPENVIKING_CLI: process.execPath }),
    execFile: async (_command, args) => {
      calls.push(args);
      return { stdout: JSON.stringify({ result: { resources: [] } }), stderr: "" };
    },
  });
  const uri = provider.salesCompanyUri({ workspaceId: "workspace-a", companyId: "company-a" });

  const result = await provider.findMemories("预算", { uri, limit: 5 });

  assert.equal(result.ok, true);
  assert.deepEqual(calls[0], ["--agent-id", "default", "find", "预算", "--uri", uri, "--node-limit", "5", "-o", "json"]);
});

test("session capture follows the official create and per-message HTTP flow", async () => {
  const calls = [];
  const response = (status, payload) => ({
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(payload);
    },
  });
  const provider = new OpenVikingProvider({
    env: envReader({
      OPENVIKING_RUN_ENABLED: "true",
      OPENVIKING_BASE_URL: "https://openviking.example",
      OPENVIKING_API_KEY: "private-key",
      OPENVIKING_AGENT_ID: "sales-workbench",
    }),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (options.method === "GET") {
        return response(404, { status: "error", error: { code: "NOT_FOUND", message: "Session not found" } });
      }
      if (url.endsWith("/api/v1/sessions")) {
        return response(200, { result: { session_id: "sales-workspace-company" } });
      }
      return response(200, { result: { ok: true } });
    },
  });

  const captured = await provider.addSessionMessages("sales-workspace-company", [
    { role: "user", content: "客户关注数据权限。" },
    { role: "assistant", content: "下一步确认权限边界。" },
  ]);
  const committed = await provider.commitSession(captured.session_id);
  const deleted = await provider.deleteSession(captured.session_id);

  assert.equal(captured.ok, true);
  assert.equal(captured.created, true);
  assert.equal(captured.session_id, "sales-workspace-company");
  assert.equal(committed.ok, true);
  assert.equal(deleted.ok, true);
  assert.equal(calls.some((call) => call.url.includes("/messages/batch")), false);
  assert.deepEqual(JSON.parse(calls[1].options.body), { session_id: "sales-workspace-company" });
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    role: "user",
    parts: [{ type: "text", text: "客户关注数据权限。" }],
  });
  assert.deepEqual(JSON.parse(calls[3].options.body), {
    role: "assistant",
    parts: [{ type: "text", text: "下一步确认权限边界。" }],
  });
  assert.deepEqual(JSON.parse(calls[4].options.body), {
    telemetry: false,
    keep_recent_count: 6,
  });
  assert.equal(calls[5].options.method, "DELETE");
  assert.equal(calls[5].options.body, undefined);
  assert.ok(calls.every((call) => call.options.headers["X-OpenViking-Agent"] === "sales-workbench"));
  assert.ok(calls.every((call) => call.options.headers.Authorization === "Bearer private-key"));
});

test("session context restores normalized live messages and archive overview", async () => {
  const calls = [];
  const provider = new OpenVikingProvider({
    env: envReader({
      OPENVIKING_BASE_URL: "https://openviking.example",
      OPENVIKING_API_KEY: "private-key",
    }),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            result: {
              latest_archive_overview: "客户持续关注数据权限。",
              messages: [
                {
                  id: "message-1",
                  role: "user",
                  parts: [{ type: "text", text: "预算确认了吗？" }],
                  created_at: "2026-07-26T09:00:00.000Z",
                },
                {
                  id: "message-2",
                  role: "assistant",
                  parts: [{ type: "text", text: "资料中尚未确认预算。" }],
                  created_at: "2026-07-26T09:00:01.000Z",
                },
              ],
            },
          });
        },
      };
    },
  });

  const result = await provider.getSessionContext("sales-company-a", { tokenBudget: 2400 });

  assert.equal(result.ok, true);
  assert.equal(result.latest_archive_overview, "客户持续关注数据权限。");
  assert.deepEqual(result.messages.map(({ id, role, text }) => ({ id, role, text })), [
    { id: "message-1", role: "user", text: "预算确认了吗？" },
    { id: "message-2", role: "assistant", text: "资料中尚未确认预算。" },
  ]);
  assert.equal(calls[0].options.method, "GET");
  assert.match(calls[0].url, /\/sessions\/sales-company-a\/context\?token_budget=2400$/);
});

test("local ovcli config supplies HTTP URL, API key and agent identity", () => {
  const provider = new OpenVikingProvider({
    env: envReader(),
    cliConfig: {
      url: "https://api.vikingdb.cn-beijing.volces.com/openviking",
      api_key: "local-private-key",
      agent_id: "local-agent",
    },
  });

  assert.equal(provider.baseUrl, "https://api.vikingdb.cn-beijing.volces.com/openviking");
  assert.equal(provider.apiKey, "local-private-key");
  assert.equal(provider.agentId, "local-agent");
  assert.equal(provider.isConfigured(), true);
});

test("Agent Plan key is not reused as OpenViking data-plane authentication", () => {
  const provider = new OpenVikingProvider({
    env: envReader({
      AGENT_PLAN_API_KEY: "agent-plan-key",
      OPENVIKING_BASE_URL: "https://api.vikingdb.cn-beijing.volces.com/openviking",
    }),
    cliConfig: {},
  });

  assert.equal(provider.apiKey, "");
});
