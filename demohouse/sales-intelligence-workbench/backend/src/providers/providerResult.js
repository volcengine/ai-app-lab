const AUTH_CODES = new Set(["401", "403", "unauthorized", "forbidden", "invalid_api_key", "authentication_error"]);
const VALIDATION_CODES = new Set([
  "4003",
  "bad_request",
  "invalid_query",
  "missing_sources",
  "invalid_json",
  "invalid_function_arguments",
  "missing_function_call",
  "unexpected_function_call",
  "validation_error",
]);
const CONFIG_CODES = new Set(["missing_config", "missing_http_config", "missing_cli", "disabled", "provider_disabled"]);
const NETWORK_CODES = new Set(["network_error", "econnreset", "econnrefused", "enotfound"]);

function normalizedCode(value) {
  return String(value || "provider_error").trim().toLowerCase();
}

export function classifyProviderError(input = {}) {
  const code = normalizedCode(input.code);
  const httpStatus = Number(input.http_status || input.httpStatus || 0);
  const message = String(input.message || "").toLowerCase();

  if (CONFIG_CODES.has(code)) return { category: "configuration", retryable: false };
  if (AUTH_CODES.has(code) || httpStatus === 401 || httpStatus === 403 || /auth|api.?key|鉴权/.test(message)) {
    return { category: "authentication", retryable: false };
  }
  if (VALIDATION_CODES.has(code) || (httpStatus >= 400 && httpStatus < 422)) {
    return { category: "validation", retryable: false };
  }
  if (code === "timeout" || /timed? out|超时/.test(message)) return { category: "timeout", retryable: true };
  if (NETWORK_CODES.has(code)) return { category: "network", retryable: true };
  if (code === "429" || httpStatus === 429 || /rate.?limit|too many requests|限流/.test(message)) {
    return { category: "rate_limit", retryable: true };
  }
  if (
    httpStatus >= 500
    || /temporar|unavailable|service busy|internal (?:server )?error|暂时不可用|内部错误/.test(message)
  ) {
    return { category: "upstream", retryable: true };
  }
  return { category: "unknown", retryable: false };
}

export function providerFailure(provider, error = {}, metadata = {}) {
  const httpStatus = Number(metadata.http_status || error.http_status || 0) || undefined;
  const classified = classifyProviderError({
    code: error.code,
    message: error.message,
    http_status: httpStatus,
  });
  return {
    ok: false,
    provider,
    provider_mode: "real",
    ...metadata,
    ...(httpStatus ? { http_status: httpStatus } : {}),
    error: {
      code: String(error.code || "provider_error"),
      message: String(error.message || "Provider call failed."),
      category: error.category || classified.category,
      retryable: error.retryable ?? classified.retryable,
    },
  };
}

export function providerSuccess(provider, data = {}) {
  return {
    ok: true,
    provider,
    provider_mode: "real",
    ...data,
  };
}

function defaultSleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function executeProviderCall(operation, options = {}) {
  const maxRetries = Math.max(0, Math.min(Number(options.max_retries || 0), 3));
  const baseDelayMs = Math.max(0, Number(options.base_delay_ms || 150));
  const sleep = options.sleep || defaultSleep;
  let attempts = 0;
  let result;

  while (attempts <= maxRetries) {
    attempts += 1;
    result = await operation(attempts);
    if (result?.ok || !result?.error?.retryable || attempts > maxRetries) {
      return { ...(result || {}), attempts };
    }
    await sleep(baseDelayMs * attempts);
  }

  return { ...(result || {}), attempts };
}
