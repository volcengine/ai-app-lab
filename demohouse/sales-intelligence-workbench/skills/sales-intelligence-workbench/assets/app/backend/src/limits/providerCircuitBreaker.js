const RETRYABLE_CATEGORIES = new Set(["network", "timeout", "rate_limit", "upstream"]);

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function shouldCountFailure(error) {
  if (!error) return false;
  if (error.code === "provider_circuit_open") return false;
  return Boolean(error.retryable) || RETRYABLE_CATEGORIES.has(String(error.category || "").toLowerCase());
}

function circuitOpenError(provider, retryAfterSeconds) {
  const error = new Error(`${provider} is temporarily unavailable after repeated upstream failures.`);
  error.code = "provider_circuit_open";
  error.category = "upstream";
  error.retryable = true;
  error.retry_after_seconds = Math.max(1, retryAfterSeconds);
  return error;
}

export class ProviderCircuitBreaker {
  constructor(options = {}) {
    this.enabled = Boolean(options.enabled);
    this.failureThreshold = positiveInteger(options.failureThreshold, 5);
    this.cooldownMs = positiveInteger(options.cooldownSeconds, 60) * 1000;
    this.now = options.now || (() => Date.now());
    this.states = new Map();
  }

  beforeCall(providerName) {
    if (!this.enabled) return { provider: String(providerName || "unknown"), halfOpen: false };
    const provider = String(providerName || "unknown");
    const state = this.states.get(provider);
    if (!state?.openUntil) return { provider, halfOpen: false };

    const remainingMs = state.openUntil - this.now();
    if (remainingMs > 0 || state.probeInFlight) {
      throw circuitOpenError(provider, Math.ceil(Math.max(remainingMs, 1000) / 1000));
    }

    state.probeInFlight = true;
    return { provider, halfOpen: true };
  }

  recordSuccess(token = {}) {
    if (!this.enabled) return;
    this.states.delete(String(token.provider || "unknown"));
  }

  recordFailure(token = {}, error = null) {
    if (!this.enabled) return;
    const provider = String(token.provider || "unknown");
    const existing = this.states.get(provider) || {
      consecutiveFailures: 0,
      openUntil: 0,
      probeInFlight: false,
    };
    existing.probeInFlight = false;

    if (!shouldCountFailure(error)) {
      this.states.delete(provider);
      return;
    }

    existing.consecutiveFailures += 1;
    if (token.halfOpen || existing.consecutiveFailures >= this.failureThreshold) {
      existing.openUntil = this.now() + this.cooldownMs;
      existing.consecutiveFailures = this.failureThreshold;
    }
    this.states.set(provider, existing);
  }

  snapshot() {
    const now = this.now();
    return [...this.states.entries()].map(([provider, state]) => ({
      provider,
      consecutive_failures: state.consecutiveFailures,
      open: Boolean(state.openUntil && state.openUntil > now),
      retry_after_seconds: state.openUntil > now ? Math.ceil((state.openUntil - now) / 1000) : 0,
      half_open_probe: Boolean(state.probeInFlight),
    }));
  }
}
