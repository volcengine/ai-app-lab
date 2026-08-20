import {
  createHarnessError,
  createRuntime,
  finishRequest,
  getHeaderRequestId,
  getNestedString,
  isHarnessTimeoutError,
  isRecord,
  readAgentPlanKey,
  redactSecret,
  startRequest,
} from "./runtime";
import type {
  ClientRuntimeOptions,
  HarnessCallResult,
  HarnessHealth,
} from "./types";

export const DATAPRO_MCP_URL =
  "https://datapro.hqd.cn-beijing.volces.com/mcp";

const MCP_PROTOCOL_VERSION = "2025-03-26";

export type McpTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export type DataProInitialization = {
  protocol_version: string;
  server_info: Record<string, unknown> | null;
  capabilities: Record<string, unknown>;
  session_id: string | null;
};

export type DataProToolList = {
  tools: McpTool[];
};

export type DataProPayload = Record<string, unknown>;

export type DataProQueryOptions = {
  toolName?: string;
  signal?: AbortSignal;
};

type JsonRpcFailure = {
  code?: number | string;
  message?: string;
};

type RpcSuccess = {
  ok: true;
  result: unknown;
  upstreamRequestId: string | null;
  sessionId?: string | null;
};

type RpcFailure = {
  ok: false;
  code: string;
  message: string;
  retryable: boolean;
  upstreamRequestId: string | null;
  sessionId?: string | null;
};

type RpcOutcome = RpcSuccess | RpcFailure;

type InitializedState = {
  protocolVersion: string;
  sessionId: string | null;
  serverInfo: Record<string, unknown> | null;
  capabilities: Record<string, unknown>;
};

type InitializedOutcome =
  | RpcFailure
  | (RpcSuccess & { state: InitializedState });

type ToolsOutcome =
  | RpcFailure
  | (RpcSuccess & { tools: McpTool[] });

function jsonRpcId(value: unknown): string {
  return String(value);
}

function collectJsonCandidates(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

function parseEventStream(text: string): unknown[] {
  const payloads: unknown[] = [];
  let dataLines: string[] = [];

  const flush = () => {
    if (dataLines.length === 0) {
      return;
    }
    const joined = dataLines.join("\n").trim();
    dataLines = [];
    if (!joined || joined === "[DONE]") {
      return;
    }
    try {
      payloads.push(JSON.parse(joined));
    } catch {
      // A malformed SSE event is ignored here and reported if no valid
      // JSON-RPC response can be found.
    }
  };

  for (const line of text.split(/\r?\n/)) {
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  flush();
  return payloads;
}

function parseRpcEnvelope(text: string, expectedId: number): unknown | null {
  const candidates: unknown[] = [];
  try {
    candidates.push(...collectJsonCandidates(JSON.parse(text)));
  } catch {
    candidates.push(...parseEventStream(text));
  }

  for (const candidate of candidates) {
    if (
      isRecord(candidate) &&
      candidate.id !== undefined &&
      jsonRpcId(candidate.id) === jsonRpcId(expectedId)
    ) {
      return candidate;
    }
  }
  return null;
}

function parseTools(result: unknown): McpTool[] | null {
  if (!isRecord(result) || !Array.isArray(result.tools)) {
    return null;
  }

  const tools: McpTool[] = [];
  for (const value of result.tools) {
    if (!isRecord(value) || typeof value.name !== "string" || !value.name) {
      return null;
    }
    const tool: McpTool = { name: value.name };
    if (typeof value.description === "string") {
      tool.description = value.description;
    }
    if (isRecord(value.inputSchema)) {
      tool.inputSchema = value.inputSchema;
    }
    tools.push(tool);
  }
  return tools;
}

function toolAcceptsQuery(tool: McpTool): boolean {
  const properties = tool.inputSchema?.properties;
  return isRecord(properties) && isRecord(properties.query);
}

function chooseDataProTool(
  tools: McpTool[],
  requestedName?: string,
): McpTool | null {
  if (requestedName) {
    return tools.find((tool) => tool.name === requestedName) ?? null;
  }

  return (
    tools.find((tool) => tool.name === "dataPro_search") ??
    tools.find((tool) => tool.name.toLowerCase() === "datapro_search") ??
    tools.find(toolAcceptsQuery) ??
    null
  );
}

function parseToolPayload(result: unknown): {
  payload: DataProPayload | null;
  isError: boolean;
} {
  if (!isRecord(result)) {
    return { payload: null, isError: false };
  }

  if (isRecord(result.structuredContent)) {
    return {
      payload: result.structuredContent,
      isError: result.isError === true,
    };
  }

  if (!Array.isArray(result.content)) {
    return { payload: null, isError: result.isError === true };
  }

  for (const content of result.content) {
    if (!isRecord(content) || content.type !== "text") {
      continue;
    }
    if (typeof content.text !== "string") {
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(content.text);
      if (isRecord(parsed)) {
        return {
          payload: parsed,
          isError: result.isError === true,
        };
      }
    } catch {
      return { payload: null, isError: result.isError === true };
    }
  }

  return { payload: null, isError: result.isError === true };
}

function dataProTraceId(payload: unknown): string | null {
  return getNestedString(payload, [
    ["trace_id"],
    ["traceId"],
    ["metadata", "trace_id"],
    ["metadata", "traceId"],
  ]);
}

function dataProRequestId(payload: unknown): string | null {
  return getNestedString(payload, [
    ["request_id"],
    ["requestId"],
    ["RequestId"],
    ["ResponseMetadata", "RequestId"],
  ]);
}

export class DataProClient {
  private readonly runtime: ReturnType<typeof createRuntime>;
  private initialized: InitializedState | null = null;
  private initializationPromise: Promise<InitializedOutcome> | null = null;
  private tools: McpTool[] | null = null;
  private toolsPromise: Promise<ToolsOutcome> | null = null;
  private rpcSequence = 0;

  constructor(options: ClientRuntimeOptions = {}) {
    this.runtime = createRuntime(options);
  }

  private nextRpcId(): number {
    this.rpcSequence += 1;
    return this.rpcSequence;
  }

  private async rpc(
    method: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<RpcOutcome> {
    const key = readAgentPlanKey(this.runtime.environment);
    if (!key) {
      return {
        ok: false,
        code: "missing_configuration",
        message: "AGENT_PLAN_API_KEY is not configured on the server.",
        retryable: false,
        upstreamRequestId: null,
      };
    }

    const id = this.nextRpcId();
    const headers = new Headers({
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "X-Agent-Plan-Key": key,
      "MCP-Protocol-Version":
        this.initialized?.protocolVersion ?? MCP_PROTOCOL_VERSION,
    });
    if (this.initialized?.sessionId) {
      headers.set("Mcp-Session-Id", this.initialized.sessionId);
    }

    let response: Response;
    try {
      response = await this.runtime.fetchImpl(DATAPRO_MCP_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          method,
          params,
        }),
        signal,
      });
    } catch (error) {
      const timedOut = isHarnessTimeoutError(error);
      return {
        ok: false,
        code: timedOut ? "request_timeout" : "network_error",
        message: timedOut
          ? "DataPro timed out; no vehicle facts were inferred."
          : "DataPro could not be reached.",
        retryable: true,
        upstreamRequestId: null,
      };
    }

    const upstreamRequestId = getHeaderRequestId(response.headers);
    const responseText = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        code: `http_${response.status}`,
        message: `DataPro request failed with HTTP ${response.status}.`,
        retryable: response.status === 429 || response.status >= 500,
        upstreamRequestId,
      };
    }

    const envelope = parseRpcEnvelope(responseText, id);
    if (!isRecord(envelope)) {
      return {
        ok: false,
        code: "invalid_json_rpc_response",
        message: "DataPro returned an unreadable JSON-RPC response.",
        retryable: false,
        upstreamRequestId,
      };
    }

    if (isRecord(envelope.error)) {
      const failure = envelope.error as JsonRpcFailure;
      const rpcCode =
        typeof failure.code === "string" || typeof failure.code === "number"
          ? String(failure.code)
          : "unknown";
      const upstreamMessage =
        typeof failure.message === "string"
          ? redactSecret(failure.message, key)
          : "DataPro returned a JSON-RPC error.";
      return {
        ok: false,
        code: `json_rpc_${rpcCode}`,
        message: upstreamMessage,
        retryable: rpcCode === "-32000",
        upstreamRequestId,
      };
    }

    if (!("result" in envelope)) {
      return {
        ok: false,
        code: "missing_json_rpc_result",
        message: "DataPro response did not include a JSON-RPC result.",
        retryable: false,
        upstreamRequestId,
      };
    }

    return {
      ok: true,
      result: envelope.result,
      upstreamRequestId,
      sessionId: response.headers.get("mcp-session-id"),
    };
  }

  private async sendInitializedNotification(
    signal?: AbortSignal,
  ): Promise<RpcOutcome> {
    const key = readAgentPlanKey(this.runtime.environment);
    if (!key) {
      return {
        ok: false,
        code: "missing_configuration",
        message: "AGENT_PLAN_API_KEY is not configured on the server.",
        retryable: false,
        upstreamRequestId: null,
      };
    }

    const headers = new Headers({
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "X-Agent-Plan-Key": key,
      "MCP-Protocol-Version":
        this.initialized?.protocolVersion ?? MCP_PROTOCOL_VERSION,
    });
    if (this.initialized?.sessionId) {
      headers.set("Mcp-Session-Id", this.initialized.sessionId);
    }

    try {
      const response = await this.runtime.fetchImpl(DATAPRO_MCP_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
          params: {},
        }),
        signal,
      });
      if (!response.ok) {
        return {
          ok: false,
          code: `http_${response.status}`,
          message: `DataPro initialization acknowledgement failed with HTTP ${response.status}.`,
          retryable: response.status === 429 || response.status >= 500,
          upstreamRequestId: getHeaderRequestId(response.headers),
        };
      }
      return {
        ok: true,
        result: null,
        upstreamRequestId: getHeaderRequestId(response.headers),
      };
    } catch (error) {
      const timedOut = isHarnessTimeoutError(error);
      return {
        ok: false,
        code: timedOut ? "request_timeout" : "network_error",
        message: timedOut
          ? "DataPro initialization timed out; no vehicle facts were inferred."
          : "DataPro initialization acknowledgement could not be sent.",
        retryable: true,
        upstreamRequestId: null,
      };
    }
  }

  private async initializeSession(
    signal?: AbortSignal,
  ): Promise<InitializedOutcome> {
    const outcome = await this.rpc(
      "initialize",
      {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {
          name: "my-car-decision-dossier",
          version: "0.1.0",
        },
      },
      signal,
    );
    if (!outcome.ok) {
      return outcome;
    }
    if (!isRecord(outcome.result)) {
      return {
        ok: false,
        code: "invalid_initialize_result",
        message: "DataPro initialize result was not an object.",
        retryable: false,
        upstreamRequestId: outcome.upstreamRequestId,
      };
    }

    const protocolVersion =
      typeof outcome.result.protocolVersion === "string"
        ? outcome.result.protocolVersion
        : MCP_PROTOCOL_VERSION;
    this.initialized = {
      protocolVersion,
      sessionId: outcome.sessionId ?? null,
      serverInfo: isRecord(outcome.result.serverInfo)
        ? outcome.result.serverInfo
        : null,
      capabilities: isRecord(outcome.result.capabilities)
        ? outcome.result.capabilities
        : {},
    };

    const acknowledgement = await this.sendInitializedNotification(signal);
    if (!acknowledgement.ok) {
      this.initialized = null;
      return acknowledgement;
    }

    return {
      ok: true,
      result: this.initialized,
      upstreamRequestId: outcome.upstreamRequestId,
      state: this.initialized,
    };
  }

  private async ensureInitialized(
    signal?: AbortSignal,
  ): Promise<InitializedOutcome> {
    if (this.initialized) {
      return {
        ok: true,
        result: this.initialized,
        upstreamRequestId: null,
        state: this.initialized,
      };
    }

    // A caller-provided signal belongs to that caller only. Do not let an
    // aborted request cancel initialization shared by another concurrent query.
    if (signal) {
      return this.initializeSession(signal);
    }

    if (!this.initializationPromise) {
      this.initializationPromise = this.initializeSession().then((result) => {
        if (!result.ok) {
          this.initializationPromise = null;
        }
        return result;
      });
    }
    return this.initializationPromise;
  }

  async initialize(
    signal?: AbortSignal,
  ): Promise<HarnessCallResult<DataProInitialization>> {
    const started = startRequest(this.runtime.clock, this.runtime.idFactory);
    const result = await this.ensureInitialized(signal);
    if (!result.ok) {
      return {
        service: "datapro",
        status:
          result.code === "missing_configuration" ? "unavailable" : "error",
        data: null,
        error: createHarnessError(
          result.code,
          result.message,
          result.retryable,
        ),
        meta: finishRequest(started, this.runtime.clock, {
          upstream_request_id: result.upstreamRequestId,
        }),
      };
    }

    return {
      service: "datapro",
      status: "ok",
      data: {
        protocol_version: result.state.protocolVersion,
        server_info: result.state.serverInfo,
        capabilities: result.state.capabilities,
        session_id: result.state.sessionId,
      },
      error: null,
      meta: finishRequest(started, this.runtime.clock, {
        upstream_request_id: result.upstreamRequestId,
      }),
    };
  }

  private async requestTools(
    signal?: AbortSignal,
  ): Promise<ToolsOutcome> {
    const initialization = await this.ensureInitialized(signal);
    if (!initialization.ok) {
      return initialization;
    }

    const result = await this.rpc("tools/list", {}, signal);
    if (!result.ok) {
      return result;
    }
    const tools = parseTools(result.result);
    if (!tools) {
      return {
        ok: false,
        code: "invalid_tools_list",
        message: "DataPro returned an invalid tools/list result.",
        retryable: false,
        upstreamRequestId: result.upstreamRequestId,
      };
    }
    this.tools = tools;
    return { ...result, tools };
  }

  private async fetchTools(
    signal?: AbortSignal,
  ): Promise<ToolsOutcome> {
    if (this.tools) {
      return {
        ok: true,
        result: { tools: this.tools },
        upstreamRequestId: null,
        tools: this.tools,
      };
    }

    if (signal) {
      return this.requestTools(signal);
    }

    if (!this.toolsPromise) {
      this.toolsPromise = this.requestTools().then((result) => {
        if (!result.ok) {
          this.toolsPromise = null;
        }
        return result;
      });
    }
    return this.toolsPromise;
  }

  async listTools(
    signal?: AbortSignal,
  ): Promise<HarnessCallResult<DataProToolList>> {
    const started = startRequest(this.runtime.clock, this.runtime.idFactory);
    const result = await this.fetchTools(signal);
    if (!result.ok) {
      return {
        service: "datapro",
        status:
          result.code === "missing_configuration" ? "unavailable" : "error",
        data: null,
        error: createHarnessError(
          result.code,
          result.message,
          result.retryable,
        ),
        meta: finishRequest(started, this.runtime.clock, {
          upstream_request_id: result.upstreamRequestId,
        }),
      };
    }
    return {
      service: "datapro",
      status: "ok",
      data: { tools: result.tools },
      error: null,
      meta: finishRequest(started, this.runtime.clock, {
        upstream_request_id: result.upstreamRequestId,
      }),
    };
  }

  private async invokeTool(
    toolName: string,
    query: string,
    signal?: AbortSignal,
  ): Promise<RpcOutcome> {
    return this.rpc(
      "tools/call",
      {
        name: toolName,
        arguments: { query },
      },
      signal,
    );
  }

  async callTool(
    toolName: string,
    query: string,
    signal?: AbortSignal,
  ): Promise<HarnessCallResult<DataProPayload>> {
    const started = startRequest(this.runtime.clock, this.runtime.idFactory);
    const initialization = await this.ensureInitialized(signal);
    if (!initialization.ok) {
      return {
        service: "datapro",
        status:
          initialization.code === "missing_configuration"
            ? "unavailable"
            : "error",
        data: null,
        error: createHarnessError(
          initialization.code,
          initialization.message,
          initialization.retryable,
        ),
        meta: finishRequest(started, this.runtime.clock, {
          upstream_request_id: initialization.upstreamRequestId,
        }),
      };
    }

    const outcome = await this.invokeTool(toolName, query, signal);
    return this.toToolResult(started, outcome);
  }

  private toToolResult(
    started: ReturnType<typeof startRequest>,
    outcome: RpcOutcome,
  ): HarnessCallResult<DataProPayload> {
    if (!outcome.ok) {
      return {
        service: "datapro",
        status:
          outcome.code === "missing_configuration" ||
          outcome.code === "request_timeout"
            ? "unavailable"
            : "error",
        data: null,
        error: createHarnessError(
          outcome.code,
          outcome.message,
          outcome.retryable,
        ),
        meta: finishRequest(started, this.runtime.clock, {
          upstream_request_id: outcome.upstreamRequestId,
        }),
      };
    }

    const parsed = parseToolPayload(outcome.result);
    if (!parsed.payload) {
      return {
        service: "datapro",
        status: "unparseable",
        data: null,
        error: createHarnessError(
          "datapro_unparseable_response",
          "DataPro returned content that was not valid structured JSON; no vehicle facts were inferred.",
          false,
        ),
        meta: finishRequest(started, this.runtime.clock, {
          upstream_request_id: outcome.upstreamRequestId,
        }),
      };
    }

    const traceId = dataProTraceId(parsed.payload);
    const upstreamRequestId =
      dataProRequestId(parsed.payload) ?? outcome.upstreamRequestId;
    const code = parsed.payload.code;
    const businessFailure =
      parsed.isError ||
      (typeof code === "number" && code !== 0) ||
      (typeof code === "string" && code !== "0");
    if (businessFailure) {
      const message =
        typeof parsed.payload.msg === "string"
          ? parsed.payload.msg
          : "DataPro returned a business error.";
      return {
        service: "datapro",
        status: "error",
        data: parsed.payload,
        error: createHarnessError(
          `datapro_business_${String(code ?? "error")}`,
          redactSecret(
            message,
            readAgentPlanKey(this.runtime.environment),
          ),
          false,
        ),
        meta: finishRequest(started, this.runtime.clock, {
          upstream_request_id: upstreamRequestId,
          trace_id: traceId,
        }),
      };
    }

    return {
      service: "datapro",
      status: "ok",
      data: parsed.payload,
      error: null,
      meta: finishRequest(started, this.runtime.clock, {
        upstream_request_id: upstreamRequestId,
        trace_id: traceId,
      }),
    };
  }

  async query(
    query: string,
    options: DataProQueryOptions = {},
  ): Promise<HarnessCallResult<DataProPayload>> {
    const started = startRequest(this.runtime.clock, this.runtime.idFactory);
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return {
        service: "datapro",
        status: "error",
        data: null,
        error: createHarnessError(
          "invalid_query",
          "DataPro query must not be empty.",
          false,
        ),
        meta: finishRequest(started, this.runtime.clock),
      };
    }

    const discovered = await this.fetchTools(options.signal);
    if (!discovered.ok) {
      return {
        service: "datapro",
        status:
          discovered.code === "missing_configuration" ||
          discovered.code === "request_timeout"
            ? "unavailable"
            : "error",
        data: null,
        error: createHarnessError(
          discovered.code,
          discovered.message,
          discovered.retryable,
        ),
        meta: finishRequest(started, this.runtime.clock, {
          upstream_request_id: discovered.upstreamRequestId,
        }),
      };
    }

    const tool = chooseDataProTool(discovered.tools, options.toolName);
    if (!tool) {
      return {
        service: "datapro",
        status: "unavailable",
        data: null,
        error: createHarnessError(
          "datapro_tool_unavailable",
          "The DataPro MCP server did not advertise a query-compatible tool.",
          false,
        ),
        meta: finishRequest(started, this.runtime.clock, {
          upstream_request_id: discovered.upstreamRequestId,
        }),
      };
    }

    const outcome = await this.invokeTool(
      tool.name,
      normalizedQuery,
      options.signal,
    );
    return this.toToolResult(started, outcome);
  }

  async health(live = false): Promise<HarnessHealth> {
    const startedAt = Date.now();
    const requestId = `local_${this.runtime.idFactory()}`;
    const checkedAt = this.runtime.clock().toISOString();
    const configured = readAgentPlanKey(this.runtime.environment) !== null;
    if (!configured) {
      return {
        service: "datapro",
        status: "unavailable",
        configured: false,
        live,
        checked_at: checkedAt,
        latency_ms: Math.max(0, Date.now() - startedAt),
        request_id: requestId,
        upstream_request_id: null,
        trace_id: null,
        detail: "AGENT_PLAN_API_KEY is not configured on the server.",
        error: createHarnessError(
          "missing_configuration",
          "AGENT_PLAN_API_KEY is not configured on the server.",
          false,
        ),
      };
    }

    if (!live) {
      return {
        service: "datapro",
        status: "ok",
        configured: true,
        live: false,
        checked_at: checkedAt,
        latency_ms: Math.max(0, Date.now() - startedAt),
        request_id: requestId,
        upstream_request_id: null,
        trace_id: null,
        detail: "Configured; live MCP probe was not requested.",
        error: null,
      };
    }

    const result = await this.listTools();
    return {
      service: "datapro",
      status: result.status === "ok" ? "ok" : "degraded",
      configured: true,
      live: true,
      checked_at: checkedAt,
      latency_ms: Math.max(0, Date.now() - startedAt),
      request_id: requestId,
      upstream_request_id: result.meta.upstream_request_id,
      trace_id: result.meta.trace_id,
      detail:
        result.status === "ok"
          ? `Live MCP probe succeeded; ${result.data?.tools.length ?? 0} tool(s) advertised.`
          : "Live MCP probe failed.",
      error: result.error,
    };
  }
}

export function createDataProClient(
  options: ClientRuntimeOptions = {},
): DataProClient {
  return new DataProClient(options);
}
