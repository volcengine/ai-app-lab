import type {
  ClientRuntimeOptions,
  FetchLike,
  HarnessError,
  HarnessRequestMetadata,
  ServerEnvironment,
} from "./types";

type ProcessWithEnv = {
  env?: Record<string, string | undefined>;
};

export const DEFAULT_HARNESS_TIMEOUT_MS = 8_000;

export class HarnessTimeoutError extends Error {
  readonly code = "request_timeout";

  constructor(timeoutMs: number) {
    super(`Harness upstream request timed out after ${timeoutMs}ms.`);
    this.name = "HarnessTimeoutError";
  }
}

export function isHarnessTimeoutError(
  error: unknown,
): error is HarnessTimeoutError {
  return (
    error instanceof HarnessTimeoutError ||
    (error instanceof Error &&
      error.name === "HarnessTimeoutError" &&
      "code" in error &&
      error.code === "request_timeout")
  );
}

function abortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) {
    return signal.reason;
  }
  const error = new Error("Harness upstream request was aborted.");
  error.name = "AbortError";
  return error;
}

function normalizeTimeoutMs(value: number | undefined): number {
  if (value === undefined) return DEFAULT_HARNESS_TIMEOUT_MS;
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_HARNESS_TIMEOUT_MS;
  }
  return Math.min(Math.round(value), 120_000);
}

/**
 * Wraps fetch with a Worker-compatible timeout and merges a caller-provided
 * AbortSignal. The response body is buffered before the timer is cleared so a
 * server that sends headers but stalls the body is bounded as well.
 */
function createBoundedFetch(
  baseFetch: FetchLike,
  timeoutMs: number,
): FetchLike {
  return async (input, init = {}) => {
    const callerSignal = init.signal ?? undefined;
    const controller = new AbortController();
    let settled = false;

    return new Promise<Response>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeoutId);
        callerSignal?.removeEventListener("abort", onCallerAbort);
      };
      const finish = <T>(callback: (value: T) => void, value: T) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback(value);
      };
      const onCallerAbort = () => {
        const error = abortError(callerSignal!);
        controller.abort(callerSignal!.reason);
        finish(reject, error);
      };
      const timeoutId = setTimeout(() => {
        const error = new HarnessTimeoutError(timeoutMs);
        controller.abort(error);
        finish(reject, error);
      }, timeoutMs);

      if (callerSignal?.aborted) {
        onCallerAbort();
        return;
      }
      callerSignal?.addEventListener("abort", onCallerAbort, { once: true });

      void (async () => {
        try {
          const response = await baseFetch(input, {
            ...init,
            signal: controller.signal,
          });
          const bytes = await response.arrayBuffer();
          const body =
            response.status === 204 ||
            response.status === 205 ||
            response.status === 304
              ? null
              : bytes;
          finish(
            resolve,
            new Response(body, {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            }),
          );
        } catch (error) {
          finish(
            reject,
            error instanceof Error
              ? error
              : new Error("Harness upstream request failed."),
          );
        }
      })();
    });
  };
}

function processEnvironment(): ServerEnvironment {
  const maybeProcess = (
    globalThis as typeof globalThis & { process?: ProcessWithEnv }
  ).process;

  return {
    AGENT_PLAN_API_KEY: maybeProcess?.env?.AGENT_PLAN_API_KEY,
    AGENT_PLAN_MODEL: maybeProcess?.env?.AGENT_PLAN_MODEL,
  };
}

export function resolveServerEnvironment(
  provided?: ServerEnvironment,
): ServerEnvironment {
  return provided ?? processEnvironment();
}

export function readAgentPlanKey(environment: ServerEnvironment): string | null {
  const value = environment.AGENT_PLAN_API_KEY?.trim();
  return value ? value : null;
}

export function defaultIdFactory(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createRuntime(options: ClientRuntimeOptions = {}) {
  const environment = resolveServerEnvironment(options.env);
  const baseFetch: FetchLike =
    options.fetchImpl ??
    ((input, init) => {
      return globalThis.fetch(input, init);
    });
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const fetchImpl = createBoundedFetch(baseFetch, timeoutMs);
  const clock = options.clock ?? (() => new Date());
  const idFactory = options.idFactory ?? defaultIdFactory;

  return {
    environment,
    fetchImpl,
    clock,
    idFactory,
    timeoutMs,
  };
}

export function startRequest(
  clock: () => Date,
  idFactory: () => string,
): Pick<HarnessRequestMetadata, "request_id" | "requested_at"> {
  return {
    request_id: `local_${idFactory()}`,
    requested_at: clock().toISOString(),
  };
}

export function finishRequest(
  started: Pick<HarnessRequestMetadata, "request_id" | "requested_at">,
  clock: () => Date,
  values: Partial<
    Pick<
      HarnessRequestMetadata,
      "upstream_request_id" | "trace_id" | "log_id"
    >
  > = {},
): HarnessRequestMetadata {
  return {
    ...started,
    received_at: clock().toISOString(),
    upstream_request_id: values.upstream_request_id ?? null,
    trace_id: values.trace_id ?? null,
    log_id: values.log_id ?? null,
  };
}

export function createHarnessError(
  code: string,
  message: string,
  retryable = false,
): HarnessError {
  return { code, message, retryable };
}

export function redactSecret(value: string, secret: string | null): string {
  if (!secret) {
    return value;
  }
  return value.split(secret).join("[REDACTED]");
}

export function getHeaderRequestId(headers: Headers): string | null {
  return (
    headers.get("request-id") ??
    headers.get("x-request-id") ??
    headers.get("x-tt-logid") ??
    null
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getNestedString(
  value: unknown,
  paths: ReadonlyArray<ReadonlyArray<string>>,
): string | null {
  for (const path of paths) {
    let cursor: unknown = value;
    for (const segment of path) {
      if (!isRecord(cursor)) {
        cursor = null;
        break;
      }
      cursor = cursor[segment];
    }
    if (typeof cursor === "string" && cursor.trim()) {
      return cursor;
    }
  }
  return null;
}

export function elapsedMilliseconds(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}
