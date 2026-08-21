import assert from "node:assert/strict";
import { commandAvailable, credentialsPath, exists, fetchHealth, readCredentialEnv } from "./lib.mjs";

const args = process.argv.slice(2);
const live = args.includes("--live");
if (live) assert.ok(args.includes("--confirm-live"), "真实 Harness 能力探测必须添加 --confirm-live");

assert.ok(commandAvailable(process.execPath), "Node.js 不可用");
assert.ok(commandAvailable("npm"), "npm 不可用");
assert.ok(commandAvailable("byted-supabase-cli"), "byted-supabase-cli 不可用");
assert.ok(await exists(credentialsPath), "尚未运行 configure.mjs");
const environment = await readCredentialEnv();
for (const key of ["AGENT_PLAN_API_KEY", "SUPABASE_WORKSPACE_ID"]) {
  assert.ok(environment[key], `私密配置缺少 ${key}`);
}
const port = Number(environment.CAR_DECISION_PORT || 3003);
const health = await fetchHealth(port, live);
if (live) {
  assert.equal(health.httpStatus, 200, "真实健康检查 HTTP 失败");
  assert.equal(health.body.status, "ok", "Agent Plan 或专业数据集真实探测未通过");
}

console.log(
  JSON.stringify({
    status: live ? "ok" : "configured",
    live,
    workspace_id: environment.SUPABASE_WORKSPACE_ID,
    services: health.body.services,
  }),
);
