import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sales-workbench-skill-"));
const fixtureEnv = path.join(tempRoot, "fixture.env");
const fakeOpenVikingCli = path.join(tempRoot, "fake-openviking-control-plane.mjs");
const fakeOpenVikingApiKey = "test-internal-openviking-key";
const isolatedEnv = {
  ...process.env,
  HOME: path.join(tempRoot, "home"),
  SALES_WORKBENCH_HOME: path.join(tempRoot, "share"),
  SALES_WORKBENCH_CONFIG_HOME: path.join(tempRoot, "config"),
  SALES_WORKBENCH_STATE_HOME: path.join(tempRoot, "state"),
  OPENVIKING_CONTROL_PLANE_CLI: fakeOpenVikingCli,
};

function runScript(name, args = [], { expectSuccess = true } = {}) {
  const result = spawnSync(process.execPath, [path.join(scriptsDir, name), ...args], {
    env: isolatedEnv,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (expectSuccess && result.status !== 0) {
    throw new Error(`${name} 自测失败：${result.stderr || result.stdout}`);
  }
  return result;
}

try {
  fs.mkdirSync(isolatedEnv.HOME, { recursive: true });
  fs.writeFileSync(fakeOpenVikingCli, `#!/usr/bin/env node
const command = process.argv[2];
if (process.env.AGENTPLAN_API_KEY !== "test-agent-plan-key") process.exit(3);
if (command === "list") {
  process.stdout.write(JSON.stringify([
    { Name: "sales_memory", ResourceID: "ov-self-test", Status: "READY" },
  ]));
} else if (command === "get") {
  process.stdout.write(JSON.stringify({
    Name: "sales_memory",
    ResourceID: "ov-self-test",
    Status: "READY",
  }));
} else if (command === "api-key") {
  process.stdout.write(JSON.stringify({
    UserID: "default",
    Role: "admin",
    ApiKey: "${fakeOpenVikingApiKey}",
  }));
} else if (command === "create") {
  process.stdout.write(JSON.stringify({
    Name: "sales_memory",
    ResourceID: "ov-self-test",
    Status: "READY",
  }));
} else {
  process.stderr.write("unsupported command");
  process.exit(2);
}
`, { mode: 0o700 });
  fs.writeFileSync(fixtureEnv, [
    "AGENT_PLAN_API_KEY=test-agent-plan-key",
    "VOLCENGINE_ACCESS_KEY=test-access-key",
    "VOLCENGINE_SECRET_KEY=test-secret-key",
    "SUPABASE_WORKSPACE_ID=test-cloud-workspace",
    "SUPABASE_BRANCH_ID=test-branch",
    "SUPABASE_API_URL=https://supabase.invalid/rest/v1",
    "SUPABASE_SERVICE_ROLE_KEY=test-service-role",
    "FEISHU_SYNC_ENABLED=false",
    "",
  ].join("\n"), { mode: 0o600 });

  const setupInitial = runScript("setup.mjs", [
    "--init",
    "--workspace-name", "隔离测试销售工作台",
    "--sales-goal", "验证真实销售资料闭环",
    "--target-scope", "获授权测试企业",
    "--sources", "none",
    "--deployment", "local",
    "--json",
  ]);
  const initialReport = JSON.parse(setupInitial.stdout);
  assert.equal(initialReport.stages.find((item) => item.id === "brief")?.status, "complete");
  assert.equal(initialReport.stages.find((item) => item.id === "app")?.status, "pending");

  runScript("install.mjs");
  runScript("configure.mjs", ["--from-env-file", fixtureEnv]);
  const configureSource = fs.readFileSync(path.join(scriptsDir, "configure.mjs"), "utf8");
  assert.doesNotMatch(configureSource, /OpenViking 数据面 API Key|OpenViking 专用 API Key/);
  assert.doesNotMatch(configureSource, /hiddenQuestion\(rl, output, "Supabase Service Role Key"/);
  assert.doesNotMatch(configureSource, /hiddenQuestion\(rl, output, "火山 (?:Access|Secret) Key/);
  assert.doesNotMatch(configureSource, /visibleQuestion\(rl, "Supabase Data API URL"/);
  let runtimeConfig = fs.readFileSync(path.join(isolatedEnv.SALES_WORKBENCH_CONFIG_HOME, "runtime.env"), "utf8");
  assert.match(runtimeConfig, /APP_WORKSPACE_ID="[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"/i);

  const openVikingPlan = runScript("setup-openviking.mjs");
  assert.match(openVikingPlan.stdout, /sales_memory/);
  assert.match(openVikingPlan.stdout, /ov-self-test/);
  assert.match(openVikingPlan.stdout, /--apply --resource-id ov-self-test/);
  assert.doesNotMatch(openVikingPlan.stdout + openVikingPlan.stderr, new RegExp(fakeOpenVikingApiKey));

  const openVikingApply = runScript("setup-openviking.mjs", [
    "--apply",
    "--resource-id", "ov-self-test",
  ]);
  assert.match(openVikingApply.stdout, /用户侧仍只使用 Agent Plan Key/);
  assert.doesNotMatch(openVikingApply.stdout + openVikingApply.stderr, new RegExp(fakeOpenVikingApiKey));
  const credentialsPath = path.join(isolatedEnv.SALES_WORKBENCH_CONFIG_HOME, "credentials.env");
  const credentialsConfig = fs.readFileSync(credentialsPath, "utf8");
  assert.match(credentialsConfig, new RegExp(fakeOpenVikingApiKey));
  assert.equal(fs.statSync(credentialsPath).mode & 0o777, 0o600);
  runtimeConfig = fs.readFileSync(path.join(isolatedEnv.SALES_WORKBENCH_CONFIG_HOME, "runtime.env"), "utf8");
  assert.match(runtimeConfig, /OPENVIKING_RESOURCE_ID="ov-self-test"/);
  assert.match(runtimeConfig, /OPENVIKING_COLLECTION_NAME="sales_memory"/);
  assert.match(runtimeConfig, /OPENVIKING_BASE_URL="https:\/\/api\.vikingdb\.cn-beijing\.volces\.com\/openviking"/);

  const realChainHelp = runScript("verify-real-chain.mjs", ["--help"]);
  assert.match(realChainHelp.stdout, /查看本帮助不会发起任何 Provider 请求/);
  assert.equal(
    fs.existsSync(path.join(isolatedEnv.SALES_WORKBENCH_STATE_HOME, "doctor-live.json")),
    false,
  );

  const supabasePlan = runScript("setup-supabase.mjs");
  assert.match(supabasePlan.stdout, /当前未写入/);
  assert.match(supabasePlan.stdout, /不会创建、暂停或删除云 Workspace/);
  runScript("doctor.mjs");

  const setupConfigured = JSON.parse(runScript("setup.mjs", ["--json"]).stdout);
  assert.equal(setupConfigured.stages.find((item) => item.id === "app")?.status, "complete");
  assert.equal(setupConfigured.stages.find((item) => item.id === "agent_plan")?.status, "complete");
  assert.equal(setupConfigured.stages.find((item) => item.id === "supabase")?.status, "complete");
  assert.equal(setupConfigured.stages.find((item) => item.id === "openviking")?.status, "complete");
  assert.equal(setupConfigured.stages.find((item) => item.id === "feishu_cli")?.status, "skipped");
  assert.equal(setupConfigured.stages.find((item) => item.id === "live_doctor")?.status, "pending");

  const startCheck = runScript("start.mjs", ["--dry-run"]);
  assert.match(startCheck.stdout, /启动预检通过/);
  assert.match(startCheck.stderr, /没有全绿 live doctor 结果/);

  const status = runScript("status.mjs");
  const parsedStatus = JSON.parse(status.stdout);
  assert.equal(parsedStatus.installed, true);
  assert.equal(parsedStatus.running, false);
  assert.equal(parsedStatus.configuration.repository_mode, "supabase");

  runScript("uninstall.mjs", ["--purge", "--yes"]);
  process.stdout.write("Skill Builder 隔离自测通过：单 Agent Plan Key、OpenViking 与 Supabase 内部凭据不要求用户输入、业务范围、阶段判断、安装、配置、doctor、正式启动预检、状态和卸载均符合预期。\n");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
