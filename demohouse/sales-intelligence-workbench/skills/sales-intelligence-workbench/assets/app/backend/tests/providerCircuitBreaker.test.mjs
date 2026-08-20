import assert from "node:assert/strict";
import test from "node:test";
import { ProviderCircuitBreaker } from "../src/limits/providerCircuitBreaker.js";

const retryableFailure = {
  code: "timeout",
  category: "timeout",
  retryable: true,
};

test("provider circuit opens after repeated retryable failures and recovers after one probe", () => {
  let now = 1_000;
  const breaker = new ProviderCircuitBreaker({
    enabled: true,
    failureThreshold: 2,
    cooldownSeconds: 10,
    now: () => now,
  });

  const first = breaker.beforeCall("model");
  breaker.recordFailure(first, retryableFailure);
  assert.equal(breaker.snapshot()[0].open, false);

  const second = breaker.beforeCall("model");
  breaker.recordFailure(second, retryableFailure);
  assert.equal(breaker.snapshot()[0].open, true);
  assert.throws(
    () => breaker.beforeCall("model"),
    (error) => error.code === "provider_circuit_open" && error.retry_after_seconds === 10,
  );

  now += 10_000;
  const probe = breaker.beforeCall("model");
  assert.equal(probe.halfOpen, true);
  assert.throws(() => breaker.beforeCall("model"), /temporarily unavailable/);
  breaker.recordSuccess(probe);

  assert.deepEqual(breaker.snapshot(), []);
  assert.equal(breaker.beforeCall("model").halfOpen, false);
});

test("half-open retryable failure reopens the circuit", () => {
  let now = 2_000;
  const breaker = new ProviderCircuitBreaker({
    enabled: true,
    failureThreshold: 1,
    cooldownSeconds: 5,
    now: () => now,
  });

  const initial = breaker.beforeCall("datapro");
  breaker.recordFailure(initial, retryableFailure);
  now += 5_000;
  const probe = breaker.beforeCall("datapro");
  breaker.recordFailure(probe, retryableFailure);

  const state = breaker.snapshot()[0];
  assert.equal(state.open, true);
  assert.equal(state.retry_after_seconds, 5);
});

test("configuration and validation failures do not open the provider circuit", () => {
  const breaker = new ProviderCircuitBreaker({
    enabled: true,
    failureThreshold: 1,
    cooldownSeconds: 5,
  });

  const token = breaker.beforeCall("web_search");
  breaker.recordFailure(token, {
    code: "missing_config",
    category: "configuration",
    retryable: false,
  });

  assert.deepEqual(breaker.snapshot(), []);
  assert.equal(breaker.beforeCall("web_search").halfOpen, false);
});

test("a non-retryable response resets the consecutive retryable failure count", () => {
  const breaker = new ProviderCircuitBreaker({
    enabled: true,
    failureThreshold: 2,
    cooldownSeconds: 5,
  });

  const first = breaker.beforeCall("openviking");
  breaker.recordFailure(first, retryableFailure);
  const validation = breaker.beforeCall("openviking");
  breaker.recordFailure(validation, {
    code: "validation_error",
    category: "validation",
    retryable: false,
  });
  const next = breaker.beforeCall("openviking");
  breaker.recordFailure(next, retryableFailure);

  const state = breaker.snapshot()[0];
  assert.equal(state.consecutive_failures, 1);
  assert.equal(state.open, false);
});
