export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type ServerEnvironment = {
  AGENT_PLAN_API_KEY?: string;
  AGENT_PLAN_MODEL?: string;
};

export type HarnessService = "agent_plan" | "datapro";

export type HarnessCallStatus =
  | "ok"
  | "error"
  | "unavailable"
  | "unparseable";

export type HarnessError = {
  code: string;
  message: string;
  retryable: boolean;
};

export type HarnessRequestMetadata = {
  request_id: string;
  requested_at: string;
  received_at: string;
  upstream_request_id: string | null;
  trace_id: string | null;
  log_id: string | null;
};

export type HarnessCallResult<T> = {
  service: HarnessService;
  status: HarnessCallStatus;
  data: T | null;
  error: HarnessError | null;
  meta: HarnessRequestMetadata;
};

export type HarnessHealthStatus = "ok" | "degraded" | "unavailable";

export type HarnessHealth = {
  service: HarnessService;
  status: HarnessHealthStatus;
  configured: boolean;
  live: boolean;
  checked_at: string;
  latency_ms: number;
  request_id: string;
  upstream_request_id: string | null;
  trace_id: string | null;
  detail: string;
  error: HarnessError | null;
};

export type ClientRuntimeOptions = {
  env?: ServerEnvironment;
  fetchImpl?: FetchLike;
  clock?: () => Date;
  idFactory?: () => string;
  /**
   * Maximum time for one upstream HTTP exchange, including reading its body.
   * A finite default is always applied so a stalled Harness service cannot
   * keep a Worker request open indefinitely.
   */
  timeoutMs?: number;
};
