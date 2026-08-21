import { spawn } from "node:child_process";
import { resolveAgentPlanKey } from "./agent-plan-key.mjs";
import {
  resolveSupabaseRuntimeCredentials,
  supabaseCliTarget,
} from "./supabase-runtime.mjs";

let agentPlanKey;
try {
  agentPlanKey = await resolveAgentPlanKey();
} catch (error) {
  console.error(error instanceof Error ? error.message : "无法读取 Agent Plan API Key");
  process.exit(1);
}

const credentials = resolveSupabaseRuntimeCredentials();
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(
  npmCommand,
  ["run", "dev:vinext", "--", ...process.argv.slice(2)],
  {
    env: {
      ...process.env,
      AGENT_PLAN_API_KEY: agentPlanKey,
      PROJECT_STORAGE_BACKEND: "supabase",
      SUPABASE_URL: credentials.url,
      SUPABASE_SERVICE_ROLE_KEY: credentials.serviceRoleKey,
      SUPABASE_ANON_KEY: credentials.anonKey,
    },
    stdio: "inherit",
  },
);

const { workspaceId } = supabaseCliTarget();
console.log(`Supabase storage enabled for workspace ${workspaceId}.`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code) => process.exit(code ?? 1));
