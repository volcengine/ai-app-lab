import assert from "node:assert/strict";
import { readCredentialEnv, run } from "./lib.mjs";

assert.ok(
  process.argv.includes("--confirm-live"),
  "真实验收会调用 Agent Plan、专业数据集并写入 AI Native 应用开发底座；确认后添加 --confirm-live",
);
const environment = await readCredentialEnv();
const port = Number(environment.CAR_DECISION_PORT || 3003);
const childEnvironment = {
  ...process.env,
  ...environment,
  CAR_DECISION_BASE_URL: `http://127.0.0.1:${port}`,
};

run("npm", ["run", "test:supabase:live"], { env: childEnvironment });
run("npm", ["run", "test:scenarios:live"], { env: childEnvironment });
console.log(
  JSON.stringify({
    status: "ok",
    supabase_live: true,
    scenarios_live: true,
    browser_acceptance_required: true,
  }),
);
