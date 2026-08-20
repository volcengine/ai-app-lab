import { spawnSync } from "node:child_process";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { createEnvReader, loadLocalEnv, localEnvUrl } from "../src/config/runtimeEnv.js";

function setEnvLine(content, name, value) {
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, "m");
  if (pattern.test(content)) return content.replace(pattern, line);
  return `${content.trimEnd()}\n${line}\n`;
}

const localEnv = loadLocalEnv();
const env = createEnvReader(localEnv);
const workspaceId = env.value("SUPABASE_WORKSPACE_ID");
const branchId = env.value("SUPABASE_BRANCH_ID");
const apiUrl = env.value("SUPABASE_API_URL").replace(/\/$/, "");
const command = env.value("SUPABASE_CLI_BIN", "byted-supabase-cli");
if (!workspaceId || !branchId || !apiUrl) {
  throw new Error("SUPABASE_WORKSPACE_ID, SUPABASE_BRANCH_ID and SUPABASE_API_URL are required.");
}

const runtimeEnv = { ...process.env, ...localEnv };
const result = spawnSync(command, [
  "projects", "api-keys",
  "--workspace-id", workspaceId,
  "--branch-id", branchId,
  "-o", "json",
], { encoding: "utf8", env: runtimeEnv });
if (result.status !== 0) throw new Error(result.stderr || "Unable to read Supabase API keys.");
const keys = JSON.parse(result.stdout || "[]");
const serviceKey = keys.find((item) => item.name === "ServiceRoleKey")?.api_key;
if (!serviceKey) throw new Error("ServiceRoleKey was not returned for the configured Supabase branch.");

const response = await fetch(`${apiUrl}/rest/v1/app_workspaces?select=id&limit=1`, {
  headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
});
if (!response.ok) throw new Error(`Supabase Data API probe failed with HTTP ${response.status}.`);

let content = readFileSync(localEnvUrl, "utf8");
content = setEnvLine(content, "SUPABASE_SERVICE_ROLE_KEY", serviceKey);
content = setEnvLine(content, "SUPABASE_DATA_API_TIMEOUT_MS", "15000");
writeFileSync(localEnvUrl, content, { encoding: "utf8", mode: 0o600 });
chmodSync(localEnvUrl, 0o600);

console.log(JSON.stringify({
  ok: true,
  api_url: apiUrl,
  key_name: "ServiceRoleKey",
  key_type: "Service",
  probe_status: response.status,
  stored_in: "backend/.env.local",
}, null, 2));
