import assert from "node:assert/strict";
import { option, repoRoot, run } from "./lib.mjs";

const args = process.argv.slice(2);
const workspaceId = option(args, "--workspace-id")?.trim();
const profile = option(args, "--profile", "agent-plan")?.trim();
const region = option(args, "--region", "cn-beijing")?.trim();
const apply = args.includes("--apply");
const yes = args.includes("--yes");

assert.ok(workspaceId, "必须通过 --workspace-id 指定用户确认的 Workspace");
const common = ["--workspace-id", workspaceId, "--profile", profile, "--region", region];

console.log(`只读核对 Workspace ${workspaceId}（${region} / ${profile}）`);
run("byted-supabase-cli", ["projects", "list", ...common, "--detail", "-o", "json"]);

if (!apply) {
  console.log(
    JSON.stringify({
      status: "planned",
      writes_applied: false,
      next: "用户确认后追加 --apply --yes",
    }),
  );
  process.exit(0);
}
assert.ok(yes, "应用数据库 Schema 必须同时提供 --apply --yes");

run("byted-supabase-cli", [
  "db",
  "query",
  ...common,
  "--file",
  `${repoRoot}/supabase/001_initial_schema.sql`,
]);
run("byted-supabase-cli", [
  "db",
  "query",
  ...common,
  "--file",
  `${repoRoot}/supabase/002_smoke_test.sql`,
]);
run("byted-supabase-cli", [
  "db",
  "advisors",
  ...common,
  "--type",
  "all",
  "--level",
  "warn",
  "--fail-on",
  "error",
]);

console.log(JSON.stringify({ status: "ok", schema_applied: true, workspace_id: workspaceId }));
