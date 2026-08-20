import assert from "node:assert/strict";
import test from "node:test";

import { AuthService } from "../src/security/authService.js";

const workspaceId = "54768bef-53aa-47d0-a9e3-bbca4593cf58";
const userId = "11111111-2222-4333-8444-555555555555";

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

function responseRecorder() {
  return {
    headers: {},
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
  };
}

function dataProviderFixture(role = null) {
  const state = {
    profiles: role ? [{ id: userId, display_name: "测试用户" }] : [],
    members: role ? [{ workspace_id: workspaceId, user_id: userId, role }] : [],
    workspaceUpdates: [],
  };
  return {
    state,
    isConfigured: () => true,
    async select(table) {
      if (table === "app_workspace_members") return structuredClone(state.members);
      if (table === "app_users") return structuredClone(state.profiles);
      return [];
    },
    async upsert(table, rows) {
      if (table === "app_users") state.profiles = structuredClone(rows);
      if (table === "app_workspace_members") state.members = structuredClone(rows);
      return structuredClone(rows);
    },
    async update(table, values, filters) {
      state.workspaceUpdates.push({ table, values, filters });
      return [];
    },
  };
}

function authFetchFixture() {
  const calls = [];
  return {
    calls,
    async fetch(url, options) {
      const parsed = new URL(url);
      calls.push({ pathname: parsed.pathname, search: parsed.search, method: options.method, body: options.body });
      if (parsed.pathname.endsWith("/admin/users") && options.method === "POST") {
        return new Response(JSON.stringify({ id: userId, email: "owner@example.com" }), { status: 200 });
      }
      if (parsed.pathname.endsWith(`/admin/users/${userId}`) && options.method === "GET") {
        return new Response(JSON.stringify({ id: userId, email: "owner@example.com" }), { status: 200 });
      }
      if (parsed.pathname.endsWith(`/admin/users/${userId}`) && options.method === "PUT") {
        return new Response(JSON.stringify({ id: userId, email: "owner@example.com" }), { status: 200 });
      }
      if (parsed.pathname.endsWith("/token") && parsed.searchParams.get("grant_type") === "password") {
        return new Response(JSON.stringify({
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: 3600,
        }), { status: 200 });
      }
      if (parsed.pathname.endsWith("/token") && parsed.searchParams.get("grant_type") === "refresh_token") {
        return new Response(JSON.stringify({
          access_token: "refreshed-access-token",
          refresh_token: "rotated-refresh-token",
          expires_in: 7200,
        }), { status: 200 });
      }
      if (parsed.pathname.endsWith("/user")) {
        return new Response(JSON.stringify({
          id: userId,
          email: "owner@example.com",
          user_metadata: { display_name: "测试用户" },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ message: "unexpected" }), { status: 500 });
    },
  };
}

function createService(provider, fetchFixture) {
  return new AuthService({
    env: envReader({
      SUPABASE_API_URL: "https://supabase.example.test/rest/v1",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
      APP_WORKSPACE_ID: workspaceId,
      HTTP_AUTH_ENABLED: "true",
      AUTH_BOOTSTRAP_ENABLED: "true",
    }),
    dataProvider: provider,
    fetchImpl: fetchFixture.fetch,
  });
}

test("first-run setup creates one confirmed local administrator without exposing email", async () => {
  const provider = dataProviderFixture();
  const authFetch = authFetchFixture();
  const service = createService(provider, authFetch);
  const response = responseRecorder();

  const result = await service.bootstrap({
    username: "测试用户",
    password: "a-secure-password",
  }, response);

  assert.equal(result.authenticated, true);
  assert.equal(result.user.username, "测试用户");
  assert.equal(Object.hasOwn(result.user, "email"), false);
  assert.equal(Object.hasOwn(result.user, "role"), false);
  assert.deepEqual(provider.state.members, [{ workspace_id: workspaceId, user_id: userId, role: "owner" }]);
  assert.equal(provider.state.workspaceUpdates[0].values.created_by, userId);
  const createBody = JSON.parse(authFetch.calls.find((call) => call.pathname.endsWith("/admin/users"))?.body || "{}");
  assert.equal(createBody.email_confirm, true);
  assert.match(createBody.email, /^owner-[a-f0-9]{24}@sales-workbench\.invalid$/);
  assert.equal(createBody.user_metadata.username, "测试用户");
  assert.equal(response.headers["set-cookie"].length, 3);
  assert.match(response.headers["set-cookie"][0], /siw_access=.*HttpOnly.*SameSite=Strict/);
  assert.match(response.headers["set-cookie"][1], /siw_refresh=.*Max-Age=31536000.*HttpOnly.*SameSite=Strict/);
  assert.doesNotMatch(response.headers["set-cookie"].join(" | "), /service-role-secret/);
});

test("a valid long-lived cookie restores login after the short-lived access cookie expires", async () => {
  const provider = dataProviderFixture("owner");
  const authFetch = authFetchFixture();
  const service = createService(provider, authFetch);
  const response = responseRecorder();

  const auth = await service.authenticateRequest({
    headers: {
      cookie: "siw_refresh=refresh-token; siw_csrf=csrf-token",
    },
  }, response);

  assert.equal(auth.source, "cookie");
  assert.equal(auth.principal.username, "测试用户");
  assert.ok(authFetch.calls.some(
    (call) => call.pathname.endsWith("/token")
      && call.search.includes("grant_type=refresh_token"),
  ));
  assert.match(response.headers["set-cookie"][0], /siw_access=refreshed-access-token/);
  assert.match(response.headers["set-cookie"][1], /siw_refresh=rotated-refresh-token.*Max-Age=31536000/);
});

test("an expired Supabase JWT is reported as an expired session so clients can refresh", async () => {
  const provider = dataProviderFixture("owner");
  const service = createService(provider, {
    async fetch() {
      return new Response(JSON.stringify({
        error_code: "bad_jwt",
        msg: "invalid JWT: token is expired",
      }), { status: 403 });
    },
  });

  await assert.rejects(
    () => service.authenticateRequest({
      headers: { authorization: "Bearer expired-access-token" },
    }, responseRecorder()),
    (error) => error.status === 401 && error.code === "invalid_credentials",
  );
});

test("username login keeps authorization internal and supports the existing account binding", async () => {
  const provider = dataProviderFixture("viewer");
  const authFetch = authFetchFixture();
  const service = createService(provider, authFetch);
  const result = await service.login({
    username: "测试用户",
    password: "a-secure-password",
  }, responseRecorder());

  assert.equal(result.user.username, "测试用户");
  assert.equal(Object.hasOwn(result.user, "role"), false);
  const session = await service.passwordSession("测试用户", "a-secure-password");
  service.requireRole({ principal: session.principal }, "viewer");
  assert.throws(
    () => service.requireRole({ principal: session.principal }, "member"),
    (error) => error.status === 403 && error.code === "insufficient_role",
  );
});

test("legacy email credentials remain compatible without exposing email in the public session", async () => {
  const provider = dataProviderFixture("owner");
  const authFetch = authFetchFixture();
  const service = createService(provider, authFetch);
  const result = await service.login({
    email: "owner@example.com",
    password: "a-secure-password",
  }, responseRecorder());

  assert.equal(result.authenticated, true);
  assert.equal(result.user.username, "测试用户");
  assert.equal(Object.hasOwn(result.user, "email"), false);
  assert.equal(Object.hasOwn(result.user, "role"), false);
  assert.equal(
    authFetch.calls.some((call) => call.pathname.endsWith(`/admin/users/${userId}`) && call.method === "GET"),
    false,
  );
});

test("cookie-authenticated mutations require a matching CSRF token", () => {
  const provider = dataProviderFixture("member");
  const service = createService(provider, authFetchFixture());
  const auth = { source: "cookie", principal: { id: userId, role: "member" } };

  assert.throws(
    () => service.assertCsrf({ headers: { cookie: "siw_csrf=expected", "x-csrf-token": "wrong" } }, auth),
    (error) => error.status === 403 && error.code === "csrf_failed",
  );
  assert.doesNotThrow(() => service.assertCsrf({
    headers: { cookie: "siw_csrf=expected", "x-csrf-token": "expected" },
  }, auth));
  assert.doesNotThrow(() => service.assertCsrf({ headers: {} }, { ...auth, source: "bearer" }));
});

test("CLI login and refresh return only user-scoped bearer sessions", async () => {
  const provider = dataProviderFixture("member");
  const authFetch = authFetchFixture();
  const service = createService(provider, authFetch);

  const loggedIn = await service.cliLogin({
    username: "测试用户",
    password: "a-secure-password",
  });
  assert.equal(loggedIn.token_type, "bearer");
  assert.equal(loggedIn.access_token, "access-token");
  assert.equal(loggedIn.refresh_token, "refresh-token");
  assert.equal(loggedIn.user.username, "测试用户");
  assert.equal(Object.hasOwn(loggedIn.user, "role"), false);
  assert.equal(Object.hasOwn(loggedIn.user, "email"), false);
  assert.equal(Object.hasOwn(loggedIn, "service_role_key"), false);

  const refreshed = await service.cliRefresh({ refresh_token: loggedIn.refresh_token });
  assert.equal(refreshed.access_token, "refreshed-access-token");
  assert.equal(refreshed.refresh_token, "rotated-refresh-token");
  assert.equal(refreshed.expires_in, 7200);
});
