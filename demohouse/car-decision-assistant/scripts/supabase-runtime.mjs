import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

export function supabaseCliTarget() {
  const workspaceId = process.env.SUPABASE_WORKSPACE_ID?.trim();
  assert.ok(
    workspaceId,
    "缺少 SUPABASE_WORKSPACE_ID；请通过 Skill 配置你自己的 AI Native 应用开发底座 Workspace",
  );
  return {
    workspaceId,
    profile: process.env.SUPABASE_CLI_PROFILE?.trim() || "agent-plan",
    region: process.env.SUPABASE_REGION?.trim() || "cn-beijing",
  };
}

export function resolveSupabaseRuntimeCredentials() {
  const { workspaceId, profile, region } = supabaseCliTarget();
  const common = ["--profile", profile, "--region", region];
  const cliJson = (args) =>
    JSON.parse(
      execFileSync("byted-supabase-cli", [...args, "-o", "json", ...common], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );

  const endpoints = cliJson([
    "endpoints",
    "list",
    "--workspace-id",
    workspaceId,
  ]);
  const address = endpoints.Endpoints?.flatMap(
    (endpoint) => endpoint.Addresses ?? [],
  ).find((item) => item.AddressType === "Public");
  assert.ok(address?.AddressDomain, "Supabase public endpoint is unavailable");

  const keys = cliJson([
    "projects",
    "api-keys",
    "--workspace-id",
    workspaceId,
  ]);
  const serviceRoleKey = keys.find(
    (item) => item.name === "ServiceRoleKey" && item.type === "Service",
  )?.api_key;
  const anonKey = keys.find(
    (item) => item.name === "AnonKey" && item.type === "Public",
  )?.api_key;
  assert.ok(serviceRoleKey, "Supabase service-role key is unavailable");
  assert.ok(anonKey, "Supabase anon key is unavailable");

  return {
    workspaceId,
    url: `https://${address.AddressDomain}`,
    serviceRoleKey,
    anonKey,
  };
}
