import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = path.resolve(backendDir, "..");
const sourcePath = path.join(rootDir, "skills", "sales-intelligence-workbench", "scripts", "setup-supabase.mjs");
const source = await fs.readFile(sourcePath, "utf8").catch((error) => {
  if (error?.code === "ENOENT") return "";
  throw error;
});
const sourceOnly = { skip: source ? false : "Skill policy is outside the standalone runtime package." };

test("Supabase setup rejects ordinary pay-as-you-go workspaces", sourceOnly, () => {
  assert.match(source, /"projects", "list"/);
  assert.match(source, /"--detail"/);
  assert.match(source, /workspace\?\.is_agent_plan/);
  assert.match(source, /workspace\?\.is_agent_plan_instance/);
  assert.match(source, /目标不是 AI Native 应用开发底座（Supabase）的 Agent Plan Workspace/);
});

test("Supabase setup supports an explicit CLI profile without leaking static credentials", sourceOnly, () => {
  assert.match(source, /SUPABASE_CLI_PROFILE/);
  assert.match(source, /delete environment\.VOLCENGINE_ACCESS_KEY/);
  assert.match(source, /delete environment\.VOLCENGINE_SECRET_KEY/);
});
