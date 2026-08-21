import { commandAvailable, credentialsPath, exists, fetchHealth, pidRunning, readCredentialEnv, readPid } from "./lib.mjs";

const configured = await exists(credentialsPath);
const environment = configured ? await readCredentialEnv() : {};
const port = Number(environment.CAR_DECISION_PORT || 3003);
const pid = await readPid();
const running = pidRunning(pid);
let health = null;
if (running) {
  try {
    health = await fetchHealth(port, false);
  } catch (error) {
    health = { error: error instanceof Error ? error.message : "health check failed" };
  }
}

console.log(
  JSON.stringify(
    {
      status: running && health?.body?.status ? "running" : configured ? "configured" : "not_configured",
      configured,
      node_ok: commandAvailable(process.execPath),
      npm_ok: commandAvailable("npm"),
      supabase_cli_ok: commandAvailable("byted-supabase-cli"),
      workspace_id: environment.SUPABASE_WORKSPACE_ID || null,
      profile: environment.SUPABASE_CLI_PROFILE || null,
      region: environment.SUPABASE_REGION || null,
      pid: running ? pid : null,
      url: running ? `http://127.0.0.1:${port}` : null,
      health,
      ready: health?.body?.status === "ok" && health?.body?.live === true,
    },
    null,
    2,
  ),
);
