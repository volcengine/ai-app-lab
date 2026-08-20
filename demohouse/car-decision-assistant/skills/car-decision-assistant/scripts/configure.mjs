import assert from "node:assert/strict";
import { chmod, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { option, ensureRuntimeHome, credentialsPath, repoRoot } from "./lib.mjs";

const args = process.argv.slice(2);
const workspaceId = option(args, "--workspace-id")?.trim();
const profile = option(args, "--profile", "agent-plan")?.trim();
const region = option(args, "--region", "cn-beijing")?.trim();
const port = option(args, "--port", "3003")?.trim();

assert.ok(workspaceId, "必须通过 --workspace-id 指定用户确认的 Workspace");
for (const [label, value] of Object.entries({ workspaceId, profile, region, port })) {
  assert.match(value, /^[A-Za-z0-9._-]+$/, `${label} 包含不允许的字符`);
}

const { resolveAgentPlanKey } = await import(
  pathToFileURL(`${repoRoot}/scripts/agent-plan-key.mjs`).href
);
const agentPlanKey = await resolveAgentPlanKey();
assert.ok(agentPlanKey.length >= 20 && !/[\r\n]/.test(agentPlanKey), "Agent Plan Key 格式无效");

await ensureRuntimeHome();
const body = [
  `AGENT_PLAN_API_KEY=${agentPlanKey}`,
  `SUPABASE_WORKSPACE_ID=${workspaceId}`,
  `SUPABASE_CLI_PROFILE=${profile}`,
  `SUPABASE_REGION=${region}`,
  `CAR_DECISION_PORT=${port}`,
  "",
].join("\n");
await writeFile(credentialsPath, body, { mode: 0o600 });
await chmod(credentialsPath, 0o600);

console.log(
  JSON.stringify({
    status: "ok",
    credentials_path: credentialsPath,
    workspace_id: workspaceId,
    profile,
    region,
    port: Number(port),
    key_persisted_privately: true,
  }),
);
