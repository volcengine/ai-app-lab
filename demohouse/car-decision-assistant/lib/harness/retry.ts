import type { HarnessCallResult } from "./types";

export type HarnessRetryOptions = {
  maxAttempts?: number;
  initialDelayMs?: number;
  backoffFactor?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  random?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
};

export const DEFAULT_HARNESS_MAX_ATTEMPTS = 3;

function delayForAttempt(
  retryNumber: number,
  options: Required<
    Pick<
      HarnessRetryOptions,
      | "initialDelayMs"
      | "backoffFactor"
      | "maxDelayMs"
      | "jitterRatio"
      | "random"
    >
  >,
) {
  const baseDelay = Math.min(
    options.maxDelayMs,
    options.initialDelayMs * options.backoffFactor ** (retryNumber - 1),
  );
  const jitterMultiplier =
    1 + (options.random() * 2 - 1) * options.jitterRatio;
  return Math.max(0, Math.round(baseDelay * jitterMultiplier));
}

export function shouldRetryHarnessResult(
  result: HarnessCallResult<unknown>,
) {
  return result.status !== "ok" && result.error?.retryable === true;
}

export async function retryHarnessCall<T>(
  operation: (attempt: number) => Promise<HarnessCallResult<T>>,
  options: HarnessRetryOptions = {},
): Promise<HarnessCallResult<T>> {
  const maxAttempts = Math.max(
    1,
    Math.min(
      5,
      Math.floor(options.maxAttempts ?? DEFAULT_HARNESS_MAX_ATTEMPTS),
    ),
  );
  const retryOptions = {
    initialDelayMs: Math.max(0, options.initialDelayMs ?? 300),
    backoffFactor: Math.max(1, options.backoffFactor ?? 2),
    maxDelayMs: Math.max(0, options.maxDelayMs ?? 2_000),
    jitterRatio: Math.max(0, Math.min(1, options.jitterRatio ?? 0.2)),
    random: options.random ?? Math.random,
  };
  const sleep =
    options.sleep ??
    ((delayMs: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, delayMs)));

  let result = await operation(1);
  for (
    let attempt = 2;
    attempt <= maxAttempts && shouldRetryHarnessResult(result);
    attempt += 1
  ) {
    await sleep(delayForAttempt(attempt - 1, retryOptions));
    result = await operation(attempt);
  }
  return result;
}
