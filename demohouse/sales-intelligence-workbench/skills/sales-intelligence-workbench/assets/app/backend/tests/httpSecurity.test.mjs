import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";

import { createRouter } from "../src/routes/index.js";
import { HttpError } from "../src/utils/http.js";
import { createRateLimiters } from "../src/security/rateLimiter.js";

const roles = Object.freeze({ viewer: 0, member: 1, admin: 2, owner: 3 });

function envReader(values = {}) {
  return {
    value(name, fallback = "") {
      return Object.hasOwn(values, name) ? values[name] : fallback;
    },
    number(name, fallback) {
      const value = Number(this.value(name, fallback));
      return Number.isFinite(value) ? value : fallback;
    },
  };
}

function authServiceStub() {
  const auditEvents = [];
  return {
    auditEvents,
    async sessionStatus() {
      return { enabled: true, authenticated: false, bootstrap_required: true, user: null };
    },
    async bootstrap() {
      return { authenticated: true, user: { role: "owner" } };
    },
    async login() {
      return { authenticated: true, user: { role: "member" } };
    },
    async refresh() {
      return { authenticated: true, user: { role: "member" } };
    },
    async logout() {
      return { authenticated: false };
    },
    async recordAudit(auth, event) {
      auditEvents.push({ actor_user_id: auth?.principal?.id || null, ...structuredClone(event) });
      return true;
    },
    async listAuditEvents() {
      return structuredClone(auditEvents);
    },
    async authenticateRequest(req) {
      const bearer = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i)?.[1];
      if (bearer && Object.hasOwn(roles, bearer)) {
        return { source: "bearer", principal: { id: `${bearer}-id`, role: bearer } };
      }
      if (String(req.headers.cookie || "").includes("session=member")) {
        return { source: "cookie", principal: { id: "cookie-member", role: "member" } };
      }
      return null;
    },
    requireRole(auth, required) {
      if (!auth) throw new HttpError(401, "authentication_required", "请先登录。");
      if (roles[auth.principal.role] < roles[required]) {
        throw new HttpError(403, "insufficient_role", "权限不足。");
      }
    },
    assertCsrf(req, auth) {
      if (auth?.source === "cookie" && req.headers["x-csrf-token"] !== "csrf-ok") {
        throw new HttpError(403, "csrf_failed", "CSRF failed.");
      }
    },
  };
}

function requestRouter(router, pathname, options = {}) {
  const body = options.body || "";
  const headers = Object.fromEntries(
    Object.entries(options.headers || {}).map(([name, value]) => [name.toLowerCase(), value]),
  );
  if (body && !headers["content-length"]) headers["content-length"] = String(Buffer.byteLength(body));
  const req = Readable.from(body ? [Buffer.from(body)] : []);
  req.method = options.method || "GET";
  req.url = pathname;
  req.headers = headers;
  req.socket = { remoteAddress: "127.0.0.1" };
  return new Promise((resolve, reject) => {
    const responseHeaders = {};
    const res = {
      statusCode: null,
      setHeader(name, value) {
        responseHeaders[String(name).toLowerCase()] = value;
      },
      writeHead(statusCode, extraHeaders = {}) {
        this.statusCode = statusCode;
        for (const [name, value] of Object.entries(extraHeaders)) this.setHeader(name, value);
      },
      end(responseBody = "") {
        const text = Buffer.isBuffer(responseBody) ? responseBody.toString("utf8") : String(responseBody || "");
        resolve({
          status: this.statusCode,
          headers: responseHeaders,
          text,
          json: () => JSON.parse(text || "{}"),
        });
      },
    };
    Promise.resolve(router(req, res)).catch(reject);
  });
}

async function withRouter(run, options = {}) {
  const env = envReader({
    API_MAX_BODY_BYTES: "1024",
    ALLOWED_ORIGINS: "https://allowed.example",
    API_RATE_LIMIT_PER_MIN: "1000",
    API_WRITE_RATE_LIMIT_PER_MIN: "1000",
    API_PAID_RATE_LIMIT_PER_MIN: "1000",
    AUTH_RATE_LIMIT_PER_15_MIN: "1000",
  });
  const salesService = {
    assertRuntimeReady: async () => {},
    listGoals: () => [{ id: "goal-1", name: "测试目标" }],
    createGoal: async (body) => ({ id: "goal-created", name: body.name }),
    exportWorkspaceData: () => ({ format: "sales-intelligence-workbench-workspace-export" }),
    ...(options.salesService || {}),
  };
  const service = { getProviderStatus: () => ({ providers: [] }) };
  const router = createRouter(service, {
    env,
    salesService,
    authService: options.authService || authServiceStub(),
    rateLimiters: createRateLimiters(env),
    runtimePolicy: options.runtimePolicy || {
      ready: true,
      fail_closed: false,
      blockers: [],
    },
  });
  await run((pathname, options) => requestRouter(router, pathname, options));
}

test("dossier detail reuses freshly loaded sales state instead of forcing a full Supabase refresh", async () => {
  const refreshOptions = [];
  await withRouter(async (request) => {
    const response = await request("/api/dossiers/dossier-1", {
      headers: { authorization: "Bearer viewer" },
    });
    assert.equal(response.status, 200);
    assert.equal(response.json().data.id, "dossier-1");
  }, {
    salesService: {
      refreshPersistedState: async (options) => {
        refreshOptions.push(options);
      },
      dossierDetail: () => ({ id: "dossier-1", body: [], citations: [] }),
    },
  });
  assert.deepEqual(refreshOptions, [{ minIntervalMs: 5_000 }]);
});

test("asynchronous dossier routes return 202 and expose only safe task progress", async () => {
  const calls = [];
  const publicJob = {
    id: "job-public-1",
    job_type: "sales_dossier_generation",
    status: "queued",
    stage: "queued",
    stage_label: "等待执行",
    progress: 0,
    entity_type: "target_enterprise",
    entity_id: "company-1",
    attempt_count: 0,
    max_attempts: 3,
    retryable: false,
    error: null,
    result: null,
  };
  const internalJob = {
    ...publicJob,
    request: { hidden_prompt: "private" },
    worker_id: "worker-private",
    reservation_id: "reservation-private",
    created_by: "member-id",
  };
  const toPublicJob = (job) => Object.fromEntries(
    Object.entries(job).filter(([key]) => !["request", "worker_id", "reservation_id", "created_by"].includes(key)),
  );

  await withRouter(async (request) => {
    const created = await request("/api/target-enterprises/company-1/dossiers", {
      method: "POST",
      headers: { Authorization: "Bearer member", "Content-Type": "application/json" },
      body: JSON.stringify({ idempotency_key: "request-1" }),
    });
    assert.equal(created.status, 202);
    assert.equal(created.json().data.id, publicJob.id);
    assert.equal(calls[0].body.idempotency_key, "request-1");
    assert.equal(calls[0].options.created_by, "member-id");

    const listed = await request("/api/jobs?job_type=sales_dossier_generation&entity_id=company-1&limit=1", {
      headers: { Authorization: "Bearer viewer" },
    });
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.json().data, [publicJob]);
    assert.doesNotMatch(listed.text, /hidden_prompt|worker-private|reservation-private/);

    const detail = await request(`/api/jobs/${publicJob.id}`, {
      headers: { Authorization: "Bearer viewer" },
    });
    assert.equal(detail.status, 200);
    assert.doesNotMatch(detail.text, /hidden_prompt|worker-private|reservation-private/);

    assert.equal((await request(`/api/jobs/${publicJob.id}/cancel`, {
      method: "POST",
      headers: { Authorization: "Bearer viewer" },
    })).status, 403);
    assert.equal((await request(`/api/jobs/${publicJob.id}/cancel`, {
      method: "POST",
      headers: { Authorization: "Bearer member" },
    })).status, 200);
    assert.equal((await request(`/api/jobs/${publicJob.id}/retry`, {
      method: "POST",
      headers: { Authorization: "Bearer member" },
    })).status, 200);
  }, {
    runtimePolicy: {
      ready: true,
      fail_closed: true,
      blockers: [],
    },
    salesService: {
      asyncJobsEnabled: true,
      async enqueueDossier(companyId, body, options) {
        calls.push({ companyId, body, options });
        return publicJob;
      },
      async listPublicJobs() {
        return [publicJob];
      },
      async getPublicJob() {
        return publicJob;
      },
      async cancelJob() {
        return { ...internalJob, status: "cancelled", stage: "cancelled" };
      },
      publicJob: toPublicJob,
      async retryJob() {
        return publicJob;
      },
    },
  });
});

test("health stays public while sales and provider APIs enforce role boundaries", async () => {
  await withRouter(async (request) => {
    assert.equal((await request("/api/health")).status, 200);
    assert.equal((await request("/api/sales-goals")).status, 401);
    assert.equal((await request("/api/sales-goals", {
      headers: { Authorization: "Bearer viewer" },
    })).status, 200);
    assert.equal((await request("/api/sales-goals", {
      method: "POST",
      headers: { Authorization: "Bearer viewer", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "目标" }),
    })).status, 403);
    assert.equal((await request("/api/sales-goals", {
      method: "POST",
      headers: { Authorization: "Bearer member", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "目标" }),
    })).status, 201);
    assert.equal((await request("/api/providers/status", {
      headers: { Authorization: "Bearer viewer" },
    })).status, 403);
    assert.equal((await request("/api/providers/status", {
      headers: { Authorization: "Bearer admin" },
    })).status, 200);
  });
});

test("email recovery and multi-user administration are not exposed", async () => {
  await withRouter(async (request) => {
    assert.equal((await request("/api/auth/password/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com" }),
    })).status, 404);
    assert.equal((await request("/api/auth/password/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "a-secure-password" }),
    })).status, 404);
    assert.equal((await request("/api/admin/members", {
      headers: { Authorization: "Bearer admin" },
    })).status, 404);
    assert.equal((await request("/api/admin/members", {
      method: "POST",
      headers: { Authorization: "Bearer admin", "Content-Type": "application/json" },
      body: JSON.stringify({ email: "new@example.com", role: "member" }),
    })).status, 404);
  });
});

test("workspace business export is owner-only and never cacheable", async () => {
  await withRouter(async (request) => {
    assert.equal((await request("/api/admin/workspace-export")).status, 401);
    assert.equal((await request("/api/admin/workspace-export", {
      headers: { Authorization: "Bearer admin" },
    })).status, 403);
    const exported = await request("/api/admin/workspace-export", {
      headers: { Authorization: "Bearer owner" },
    });
    assert.equal(exported.status, 200);
    assert.equal(exported.headers["cache-control"], "no-store");
    assert.equal(exported.json().data.format, "sales-intelligence-workbench-workspace-export");
  });
});

test("business mutations write metadata-only audit events and admins can list them", async () => {
  const authService = authServiceStub();
  await withRouter(async (request) => {
    const created = await request("/api/sales-goals", {
      method: "POST",
      headers: { Authorization: "Bearer member", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "华东重点客户", password: "must-not-enter-audit" }),
    });
    assert.equal(created.status, 201);
    assert.equal(authService.auditEvents.length, 1);
    assert.equal(authService.auditEvents[0].action, "sales_goal.created");
    assert.equal(authService.auditEvents[0].entity_type, "sales_goal");
    assert.equal(authService.auditEvents[0].entity_id, "goal-created");
    assert.equal(JSON.stringify(authService.auditEvents[0]).includes("must-not-enter-audit"), false);

    const denied = await request("/api/admin/audit-events", {
      headers: { Authorization: "Bearer member" },
    });
    assert.equal(denied.status, 403);

    const listed = await request("/api/admin/audit-events", {
      headers: { Authorization: "Bearer admin" },
    });
    assert.equal(listed.status, 200);
    assert.equal(listed.json().data[0].action, "sales_goal.created");
  }, { authService });
});

test("cookie mutations require CSRF and oversized JSON is rejected", async () => {
  await withRouter(async (request) => {
    assert.equal((await request("/api/sales-goals", {
      method: "POST",
      headers: { Cookie: "session=member", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "目标" }),
    })).status, 403);
    assert.equal((await request("/api/sales-goals", {
      method: "POST",
      headers: { Cookie: "session=member", "X-CSRF-Token": "csrf-ok", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "目标" }),
    })).status, 201);
    const oversized = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "local-admin", password: "x".repeat(1500) }),
    });
    assert.equal(oversized.status, 413);
    assert.equal(oversized.json().error.code, "payload_too_large");
  });
});

test("CORS reflects only explicitly allowed origins and never uses a wildcard", async () => {
  await withRouter(async (request) => {
    const sameOrigin = await request("/api/health", {
      headers: {
        Origin: "http://127.0.0.1:8877",
        Host: "127.0.0.1:8877",
      },
    });
    assert.equal(sameOrigin.status, 200);
    assert.equal(sameOrigin.headers["access-control-allow-origin"], undefined);

    const allowed = await request("/api/health", { headers: { Origin: "https://allowed.example" } });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers["access-control-allow-origin"], "https://allowed.example");
    assert.equal(allowed.headers["access-control-allow-credentials"], "true");
    const rejected = await request("/api/health", { headers: { Origin: "https://evil.example" } });
    assert.equal(rejected.status, 403);
    assert.equal(rejected.headers["access-control-allow-origin"], undefined);
    assert.notEqual(allowed.headers["content-security-policy"], undefined);
  });
});
