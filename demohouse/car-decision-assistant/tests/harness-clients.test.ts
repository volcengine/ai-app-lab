import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AGENT_PLAN_MESSAGES_URL,
  checkHarnessHealth,
  createAgentPlanClient,
  createDataProClient,
  DATAPRO_MCP_URL,
  retryHarnessCall,
  salvageConditionExtraction,
  validateConditionExtraction,
  type HarnessHealth,
} from "../lib/harness/index";

const testEnvironment = {
  AGENT_PLAN_API_KEY: "test-server-secret",
  AGENT_PLAN_MODEL: "test-model",
};

function jsonResponse(
  value: unknown,
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(value), { ...init, headers });
}

function sseResponse(value: unknown, headers?: HeadersInit): Response {
  return new Response(`event: message\ndata: ${JSON.stringify(value)}\n\n`, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      ...Object.fromEntries(new Headers(headers)),
    },
  });
}

test("Harness retries only retryable failures with bounded exponential backoff", async () => {
  const attempts: number[] = [];
  const delays: number[] = [];
  const result = await retryHarnessCall(
    async (attempt) => {
      attempts.push(attempt);
      return attempt < 3
        ? {
            service: "datapro" as const,
            status: "unavailable" as const,
            data: null,
            error: {
              code: "request_timeout",
              message: "temporary timeout",
              retryable: true,
            },
            meta: {
              request_id: `attempt-${attempt}`,
              requested_at: "2026-07-30T00:00:00.000Z",
              received_at: "2026-07-30T00:00:00.000Z",
              upstream_request_id: null,
              trace_id: null,
              log_id: null,
            },
          }
        : {
            service: "datapro" as const,
            status: "ok" as const,
            data: { code: 0, items: [] },
            error: null,
            meta: {
              request_id: `attempt-${attempt}`,
              requested_at: "2026-07-30T00:00:00.000Z",
              received_at: "2026-07-30T00:00:00.000Z",
              upstream_request_id: null,
              trace_id: null,
              log_id: null,
            },
          };
    },
    {
      initialDelayMs: 300,
      jitterRatio: 0,
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
    },
  );

  assert.equal(result.status, "ok");
  assert.deepEqual(attempts, [1, 2, 3]);
  assert.deepEqual(delays, [300, 600]);
});

test("Harness does not retry non-retryable failures", async () => {
  let attempts = 0;
  const result = await retryHarnessCall(
    async () => {
      attempts += 1;
      return {
        service: "datapro" as const,
        status: "error" as const,
        data: null,
        error: {
          code: "invalid_request",
          message: "invalid query",
          retryable: false,
        },
        meta: {
          request_id: "attempt-1",
          requested_at: "2026-07-30T00:00:00.000Z",
          received_at: "2026-07-30T00:00:00.000Z",
          upstream_request_id: null,
          trace_id: null,
          log_id: null,
        },
      };
    },
    { sleep: async () => undefined },
  );

  assert.equal(result.status, "error");
  assert.equal(attempts, 1);
});

test("DataPro performs streamable HTTP initialize, tools/list and tools/call", async () => {
  const requests: Array<{
    url: string;
    headers: Headers;
    body: Record<string, unknown>;
  }> = [];

  const fetchImpl = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const headers = new Headers(init?.headers);
    requests.push({ url: String(input), headers, body });

    if (body.method === "notifications/initialized") {
      return new Response(null, { status: 202 });
    }

    const id = body.id;
    if (body.method === "initialize") {
      return sseResponse(
        {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2025-03-26",
            capabilities: { tools: {} },
            serverInfo: { name: "datapro", version: "test" },
          },
        },
        {
          "mcp-session-id": "mcp-session-test",
          "request-id": "initialize-request",
        },
      );
    }
    if (body.method === "tools/list") {
      return sseResponse(
        {
          jsonrpc: "2.0",
          id,
          result: {
            tools: [
              {
                name: "dataPro_search",
                inputSchema: {
                  type: "object",
                  properties: { query: { type: "string" } },
                  required: ["query"],
                },
              },
            ],
          },
        },
        { "request-id": "tools-request" },
      );
    }
    if (body.method === "tools/call") {
      return sseResponse(
        {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  code: 0,
                  msg: "success",
                  trace_id: "trace-test-001",
                  dataset_type: "vehicle_config",
                  items: [{ 车型信息: { 版本: "旗舰版" } }],
                }),
              },
            ],
          },
        },
        { "request-id": "call-request" },
      );
    }
    return new Response(null, { status: 500 });
  };

  const client = createDataProClient({
    env: testEnvironment,
    fetchImpl,
    idFactory: () => "datapro-request",
  });
  const result = await client.query("调用汽车车型配置库查询测试车型");

  assert.equal(result.status, "ok");
  assert.equal(result.meta.request_id, "local_datapro-request");
  assert.equal(result.meta.trace_id, "trace-test-001");
  assert.equal(result.meta.upstream_request_id, "call-request");
  assert.equal(result.data?.dataset_type, "vehicle_config");
  assert.equal(requests.length, 4);
  assert.ok(requests.every((request) => request.url === DATAPRO_MCP_URL));
  assert.ok(
    requests.every(
      (request) =>
        request.headers.get("x-agent-plan-key") ===
        testEnvironment.AGENT_PLAN_API_KEY,
    ),
  );
  assert.equal(
    requests[1]?.headers.get("mcp-session-id"),
    "mcp-session-test",
  );
  assert.equal(
    requests[2]?.headers.get("mcp-session-id"),
    "mcp-session-test",
  );
  assert.deepEqual(
    (requests[3]?.body.params as Record<string, unknown>).arguments,
    { query: "调用汽车车型配置库查询测试车型" },
  );
  assert.doesNotMatch(
    JSON.stringify(result),
    new RegExp(testEnvironment.AGENT_PLAN_API_KEY),
  );
});

test("DataPro reports unparseable tool content without inventing data", async () => {
  const fetchImpl = async (
    _input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    if (body.method === "notifications/initialized") {
      return new Response(null, { status: 202 });
    }
    if (body.method === "initialize") {
      return jsonResponse({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          protocolVersion: "2025-03-26",
          capabilities: {},
        },
      });
    }
    if (body.method === "tools/list") {
      return jsonResponse({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          tools: [
            {
              name: "dataPro_search",
              inputSchema: {
                properties: { query: { type: "string" } },
              },
            },
          ],
        },
      });
    }
    return jsonResponse({
      jsonrpc: "2.0",
      id: body.id,
      result: {
        content: [{ type: "text", text: "not structured JSON" }],
      },
    });
  };

  const client = createDataProClient({
    env: testEnvironment,
    fetchImpl,
  });
  const result = await client.query("测试无法解析");

  assert.equal(result.status, "unparseable");
  assert.equal(result.data, null);
  assert.equal(result.error?.code, "datapro_unparseable_response");
  assert.match(result.error?.message ?? "", /no vehicle facts were inferred/i);
});

test("DataPro shares one initialization and tool discovery across concurrent queries", async () => {
  const methodCounts = new Map<string, number>();
  const fetchImpl = async (
    _input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const method = String(body.method);
    methodCounts.set(method, (methodCounts.get(method) ?? 0) + 1);
    if (method === "notifications/initialized") {
      return new Response(null, { status: 202 });
    }
    if (method === "initialize") {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return jsonResponse(
        {
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2025-03-26",
            capabilities: { tools: {} },
          },
        },
        { headers: { "mcp-session-id": "shared-session" } },
      );
    }
    if (method === "tools/list") {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return jsonResponse({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          tools: [
            {
              name: "dataPro_search",
              inputSchema: {
                properties: { query: { type: "string" } },
              },
            },
          ],
        },
      });
    }
    return jsonResponse({
      jsonrpc: "2.0",
      id: body.id,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify({ code: 0, items: [] }),
          },
        ],
      },
    });
  };
  const client = createDataProClient({
    env: testEnvironment,
    fetchImpl,
  });

  const results = await Promise.all([
    client.query("测试车型配置"),
    client.query("测试城市车系数据"),
  ]);

  assert.deepEqual(
    results.map((result) => result.status),
    ["ok", "ok"],
  );
  assert.equal(methodCounts.get("initialize"), 1);
  assert.equal(methodCounts.get("notifications/initialized"), 1);
  assert.equal(methodCounts.get("tools/list"), 1);
  assert.equal(methodCounts.get("tools/call"), 2);
});

const validConditionExtraction = {
  schema_version: "1.0",
  conditions: [
    {
      id: "condition_1",
      source_text: "预算不超过20万元",
      subject: "purchase",
      category: "budget",
      importance: "must",
      evaluation_mode: "rule",
      normalized: {
        field: "total_budget",
        operator: "lte",
        value: 20,
        unit: "万元",
      },
      needs_clarification: false,
      clarification_question: null,
    },
  ],
  clarifying_questions: [],
};

test("Agent Plan structures conditions only after strict schema validation", async () => {
  let captured:
    | {
        url: string;
        headers: Headers;
        body: Record<string, unknown>;
      }
    | undefined;
  const fetchImpl = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    captured = {
      url: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    };
    return jsonResponse(
      {
        content: [
          { type: "text", text: JSON.stringify(validConditionExtraction) },
        ],
      },
      { headers: { "request-id": "model-request-001" } },
    );
  };

  const client = createAgentPlanClient({
    env: testEnvironment,
    fetchImpl,
  });
  const result = await client.structureConditions("预算不超过20万元");

  assert.equal(result.status, "ok");
  assert.equal(result.data?.conditions[0]?.normalized.value, 20);
  assert.equal(result.meta.upstream_request_id, "model-request-001");
  assert.equal(captured?.url, AGENT_PLAN_MESSAGES_URL);
  assert.equal(
    captured?.headers.get("x-api-key"),
    testEnvironment.AGENT_PLAN_API_KEY,
  );
  assert.equal(captured?.body.model, "test-model");
  assert.match(String(captured?.body.system), /不查询、不补充、不推断任何车型/);
  assert.doesNotMatch(
    JSON.stringify(result),
    new RegExp(testEnvironment.AGENT_PLAN_API_KEY),
  );
});

test("Agent Plan discards undocumented model facts while preserving valid conditions", async () => {
  const invalid = {
    ...validConditionExtraction,
    vehicle_facts: [{ trim: "模型擅自生成的车型事实" }],
  };
  const client = createAgentPlanClient({
    env: testEnvironment,
    fetchImpl: async () =>
      jsonResponse({
        content: [{ type: "text", text: JSON.stringify(invalid) }],
      }),
  });

  const result = await client.structureConditions("预算不超过20万元");
  assert.equal(result.status, "ok");
  assert.equal(result.data?.conditions.length, 1);
  assert.equal("vehicle_facts" in (result.data ?? {}), false);
  assert.equal(validateConditionExtraction(invalid).ok, false);
});

test("Agent Plan partial validation keeps valid conditions and isolates invalid items", () => {
  const invalid = {
    ...validConditionExtraction.conditions[0],
    id: "condition_2",
    normalized: {
      field: "seat_count",
      operator: "gte",
      value: { invalid: true },
      unit: "座",
    },
  };
  const salvaged = salvageConditionExtraction(
    {
      schema_version: "1.0",
      conditions: [validConditionExtraction.conditions[0], invalid],
      clarifying_questions: [],
    },
    "预算不超过20万元",
  );
  assert.equal(salvaged?.conditions.length, 1);
  assert.equal(salvaged?.invalid_conditions?.length, 1);
  assert.equal(
    salvaged?.invalid_conditions?.[0]?.source_text,
    "预算不超过20万元",
  );
});

test("Harness clients return unavailable without server AGENT_PLAN_API_KEY", async () => {
  let fetchCount = 0;
  const fetchImpl = async (): Promise<Response> => {
    fetchCount += 1;
    return jsonResponse({});
  };
  const runtime = { env: {}, fetchImpl };
  const [datapro, agentPlan] = await Promise.all([
    createDataProClient(runtime).query("测试"),
    createAgentPlanClient(runtime).structureConditions("测试"),
  ]);

  assert.equal(datapro.status, "unavailable");
  assert.equal(agentPlan.status, "unavailable");
  assert.equal(fetchCount, 0);
});

test("Harness clients time out an upstream fetch that never settles", async () => {
  const capturedSignals: AbortSignal[] = [];
  const fetchImpl = async (
    _input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    if (init?.signal) capturedSignals.push(init.signal);
    return new Promise<Response>(() => {});
  };
  const runtime = {
    env: testEnvironment,
    fetchImpl,
    timeoutMs: 20,
  };
  const startedAt = Date.now();
  const [datapro, agentPlan] = await Promise.all([
    createDataProClient(runtime).query("测试"),
    createAgentPlanClient(runtime).structureConditions("测试"),
  ]);

  assert.ok(Date.now() - startedAt < 500);
  for (const result of [datapro, agentPlan]) {
    assert.equal(result.status, "unavailable");
    assert.equal(result.data, null);
    assert.equal(result.error?.code, "request_timeout");
  }
  assert.equal(capturedSignals.length, 2);
  assert.ok(capturedSignals.every((signal) => signal.aborted));
});

test("caller AbortSignal is merged with the runtime timeout signal", async () => {
  let upstreamSignal: AbortSignal | undefined;
  const controller = new AbortController();
  const client = createAgentPlanClient({
    env: testEnvironment,
    timeoutMs: 1_000,
    fetchImpl: async (_input, init) => {
      upstreamSignal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    },
  });
  const request = client.structureConditions("测试", {
    signal: controller.signal,
  });
  controller.abort(new Error("caller cancelled"));
  const result = await request;

  assert.equal(result.status, "error");
  assert.equal(result.error?.code, "network_error");
  assert.equal(upstreamSignal?.aborted, true);
});

test("DataPro tool-call timeout remains unavailable after initialization", async () => {
  const fetchImpl = async (
    _input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    if (body.method === "notifications/initialized") {
      return new Response(null, { status: 202 });
    }
    if (body.method === "initialize") {
      return jsonResponse({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
        },
      });
    }
    if (body.method === "tools/list") {
      return jsonResponse({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          tools: [
            {
              name: "dataPro_search",
              inputSchema: {
                properties: { query: { type: "string" } },
              },
            },
          ],
        },
      });
    }
    return new Promise<Response>(() => {});
  };
  const result = await createDataProClient({
    env: testEnvironment,
    fetchImpl,
    timeoutMs: 20,
  }).query("测试工具调用超时");

  assert.equal(result.status, "unavailable");
  assert.equal(result.data, null);
  assert.equal(result.error?.code, "request_timeout");
  assert.match(result.error?.message ?? "", /no vehicle facts were inferred/i);
});

function healthFixture(
  service: HarnessHealth["service"],
  status: HarnessHealth["status"],
): HarnessHealth {
  return {
    service,
    status,
    configured: status !== "unavailable",
    live: false,
    checked_at: "2026-07-26T00:00:00.000Z",
    latency_ms: 0,
    request_id: `local_${service}`,
    upstream_request_id: null,
    trace_id: null,
    detail: "test",
    error: null,
  };
}

test("unified health check aggregates all Harness services", async () => {
  const result = await checkHarnessHealth({
    agentPlan: {
      health: async () => healthFixture("agent_plan", "ok"),
    } as ReturnType<typeof createAgentPlanClient>,
    dataPro: {
      health: async () => healthFixture("datapro", "degraded"),
    } as ReturnType<typeof createDataProClient>,
  });

  assert.equal(result.status, "degraded");
  assert.equal(result.services.agent_plan.status, "ok");
  assert.equal(result.services.datapro.status, "degraded");
});

test("Harness source files do not contain an embedded Agent Plan key", async () => {
  const files = [
    "../lib/harness/agent-plan.ts",
    "../lib/harness/datapro.ts",
    "../lib/harness/health.ts",
    "../lib/harness/index.ts",
    "../lib/harness/runtime.ts",
    "../lib/harness/types.ts",
  ];
  const contents = await Promise.all(
    files.map((file) => readFile(new URL(file, import.meta.url), "utf8")),
  );
  for (const content of contents) {
    assert.doesNotMatch(
      content,
      /ark-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}-[0-9a-z]+/i,
    );
  }
});
