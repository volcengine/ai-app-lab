import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  backendFetch,
  extractDocUrl,
  messageMaterial,
  parseArgs,
  retryable,
  withRetry,
} from "../scripts/import-feishu-cli.mjs";

test("CLI import accepts a private auth-session path without putting tokens in arguments", () => {
  const parsed = parseArgs([
    "--company-id", "company_1",
    "--doc", "doxcnExampleToken",
    "--auth-session", "/private/state/cli-session.json",
  ]);
  assert.equal(parsed.authSession, "/private/state/cli-session.json");
});

test("backend requests refresh an expired bearer session and rotate the private file", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "siw-auth-session-"));
  const sessionFile = path.join(directory, "cli-session.json");
  fs.writeFileSync(sessionFile, JSON.stringify({
    access_token: "expired-access",
    refresh_token: "refresh-token",
  }), { mode: 0o600 });
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), authorization: new Headers(options.headers).get("authorization") });
    if (String(url).endsWith("/api/auth/cli-refresh")) {
      return new Response(JSON.stringify({
        data: {
          access_token: "fresh-access",
          refresh_token: "rotated-refresh",
          expires_in: 3600,
          user: { id: "user_1", role: "member" },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (calls.filter((call) => call.url.endsWith("/api/resource")).length === 1) {
      return new Response(JSON.stringify({ error: { code: "authentication_required" } }), { status: 401 });
    }
    return new Response(JSON.stringify({ data: { ok: true } }), { status: 200 });
  };

  try {
    const response = await backendFetch("http://127.0.0.1:8787/api/resource", {}, {
      apiUrl: "http://127.0.0.1:8787",
      authSession: sessionFile,
    });
    assert.equal(response.status, 200);
    assert.equal(calls[0].authorization, "Bearer expired-access");
    assert.equal(calls[2].authorization, "Bearer fresh-access");
    const rotated = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
    assert.equal(rotated.access_token, "fresh-access");
    assert.equal(rotated.refresh_token, "rotated-refresh");
    assert.equal(fs.statSync(sessionFile).mode & 0o077, 0);
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("a bare Feishu document token does not invent a tenant URL", () => {
  assert.equal(extractDocUrl("doxcnExampleToken"), "");
  assert.equal(
    extractDocUrl("https://example.feishu.cn/docx/doxcnExampleToken"),
    "https://example.feishu.cn/docx/doxcnExampleToken",
  );
});

test("message material sorts unordered results before advancing its checkpoint", () => {
  const source = {
    type: "feishu_search",
    external_id: "新能源汽车",
  };
  const material = messageMaterial({
    title: "飞书消息搜索：新能源汽车",
    source,
    messages: [
      { message_id: "m3", create_time: "2026-07-21T03:00:00.000Z", content: "third" },
      { message_id: "m1", create_time: "2026-07-21T01:00:00.000Z", content: "first" },
      { message_id: "m2", create_time: "2026-07-21T02:00:00.000Z", content: "second" },
    ],
    targetUser: null,
    options: { titlePrefix: "", resumeSource: false },
  });

  assert.equal(material.occurred_at, "2026-07-21T01:00:00.000Z");
  assert.equal(material.source.checkpoint_value, "2026-07-21T03:00:00.000Z");
  assert.equal(material.source.version, "m3");
  assert.deepEqual(material.source_items.map((item) => item.id), ["m1", "m2", "m3"]);
});

test("a non-retryable Feishu error reports the one attempt actually made", async () => {
  await assert.rejects(
    withRetry(
      async () => {
        throw new Error("permission denied");
      },
      { maxAttempts: 3, retryDelayMs: 0 },
    ),
    (error) => error.message === "permission denied" && error.attempts === 1,
  );
});

test("a Feishu user id does not masquerade as a 5xx response", () => {
  assert.equal(
    retryable("need_user_authorization (user: ou_fixture_user_001)"),
    false,
  );
  assert.equal(retryable("Backend sync-state failed (503)"), true);
  assert.equal(retryable("HTTP 429 too many requests"), true);
});

test("a transient Feishu error retries and reports the successful attempt", async () => {
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls += 1;
      if (calls < 3) throw new Error("temporary network timeout");
      return "ok";
    },
    { maxAttempts: 3, retryDelayMs: 0 },
  );

  assert.equal(result.value, "ok");
  assert.equal(result.attempts, 3);
  assert.equal(calls, 3);
});
