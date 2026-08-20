import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { createEnvReader } from "../src/config/runtimeEnv.js";
import { createSupabaseProvider } from "../src/providers/supabaseProvider.js";

process.env.REPOSITORY_MODE = "supabase";

const env = createEnvReader();
const provider = createSupabaseProvider({ env });
const workspaceId = env.value("APP_WORKSPACE_ID");
const suffix = `${Date.now()}_${randomUUID().slice(0, 8)}`;
const goalName = `Stage 2 API 持久化测试 ${suffix}`;
let goalId = "";
let firstServer = null;
let secondServer = null;
let primaryError = null;
let report = null;

function sqlString(value) {
  if (value === null || value === undefined || value === "") return "null";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function assertOk(condition, message) {
  if (!condition) throw new Error(`Stage 2 API smoke assertion failed: ${message}`);
}

function executeSql(sql) {
  const result = provider.executeSqlSync(sql);
  if (!result.ok) throw new Error(result.error?.message || "Supabase SQL failed.");
  return result.rows || [];
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function request(baseUrl, method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${method} ${path} returned ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

if (!provider.isConfigured() || !provider.isRunEnabled() || provider.readOnly) {
  throw new Error("Writable Supabase configuration is required for the Stage 2 API smoke test.");
}
if (!workspaceId) throw new Error("APP_WORKSPACE_ID is required for the Stage 2 API smoke test.");

try {
  firstServer = createApp();
  const firstPort = await listen(firstServer);
  const firstBaseUrl = `http://127.0.0.1:${firstPort}`;
  const health = await request(firstBaseUrl, "GET", "/api/health");
  assertOk(health.data?.runtime_ready === true, "first app instance is not runtime-ready");

  const created = await request(firstBaseUrl, "POST", "/api/sales-goals", {
    name: goalName,
    description: "仅用于 Stage 2 HTTP 持久化测试，结束后自动删除。",
    keywords: ["stage2", "api-smoke"],
  });
  goalId = created.data?.id || "";
  assertOk(goalId, "POST /api/sales-goals did not return an id");

  const firstRead = await request(firstBaseUrl, "GET", "/api/sales-goals");
  assertOk(firstRead.data?.some((goal) => goal.id === goalId), "first app instance cannot read the created goal");
  await close(firstServer);
  firstServer = null;

  secondServer = createApp();
  const secondPort = await listen(secondServer);
  const secondBaseUrl = `http://127.0.0.1:${secondPort}`;
  const secondRead = await request(secondBaseUrl, "GET", "/api/sales-goals");
  assertOk(secondRead.data?.some((goal) => goal.id === goalId), "fresh app instance did not reload the goal from Supabase");

  const databaseRows = executeSql(`
    select id, name
    from public.sales_goals
    where workspace_id = ${sqlString(workspaceId)}::uuid and id = ${sqlString(goalId)};
  `);
  assertOk(databaseRows.length === 1, "created API record is missing from Supabase");

  report = {
    ok: true,
    test_run: suffix,
    verified: {
      fail_closed_path: true,
      http_create_and_read: true,
      fresh_app_instance_reload: true,
      direct_database_record: true,
    },
  };
} catch (error) {
  primaryError = error;
  throw error;
} finally {
  await close(firstServer);
  await close(secondServer);
  if (goalId) {
    const cleanup = provider.executeSqlSync(`
      delete from public.sales_goals
      where workspace_id = ${sqlString(workspaceId)}::uuid and id = ${sqlString(goalId)};
    `);
    if (!cleanup.ok) {
      const cleanupError = new Error(`Stage 2 API smoke cleanup failed: ${cleanup.error?.message || "unknown error"}`);
      if (!primaryError) throw cleanupError;
      console.error(cleanupError.message);
    } else {
      const remaining = executeSql(`
        select count(*)::int as count
        from public.sales_goals
        where workspace_id = ${sqlString(workspaceId)}::uuid and id = ${sqlString(goalId)};
      `);
      assertOk(Number(remaining[0]?.count || 0) === 0, "temporary API record was not cleaned up");
      if (report) report.cleanup_verified = true;
    }
  }
}

console.log(JSON.stringify(report, null, 2));
