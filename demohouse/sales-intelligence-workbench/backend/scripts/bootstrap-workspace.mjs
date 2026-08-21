import { createEnvReader } from "../src/config/runtimeEnv.js";
import { createSupabaseProvider } from "../src/providers/supabaseProvider.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const env = createEnvReader();
const provider = createSupabaseProvider({
  env: {
    ...env,
    value(name, fallback = "") {
      if (name === "SUPABASE_READ_ONLY") return "false";
      return env.value(name, fallback);
    },
  },
});
const workspaceId = env.value("APP_WORKSPACE_ID").trim();
const slug = env.value("APP_WORKSPACE_SLUG", "default").trim();
const name = env.value("APP_WORKSPACE_NAME", "Sales Workbench").trim();
const planMode = env.value("APP_WORKSPACE_PLAN_MODE", "standard").trim();

if (!UUID_PATTERN.test(workspaceId)) throw new Error("APP_WORKSPACE_ID must be a valid UUID.");
if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) throw new Error("APP_WORKSPACE_SLUG must contain 2-63 lowercase letters, numbers or hyphens.");
if (!name) throw new Error("APP_WORKSPACE_NAME is required.");
if (!new Set(["standard", "agent_plan"]).has(planMode)) throw new Error("APP_WORKSPACE_PLAN_MODE must be standard or agent_plan.");

const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;
const result = provider.executeSqlSync(`
  insert into public.app_workspaces (id, slug, name, plan_mode, settings_json)
  values (${quote(workspaceId)}::uuid, ${quote(slug)}, ${quote(name)}, ${quote(planMode)}, '{}'::jsonb)
  on conflict (id) do update set
    slug = excluded.slug,
    name = excluded.name,
    plan_mode = excluded.plan_mode,
    updated_at = now()
  returning id, slug, name, plan_mode, created_at, updated_at;
`);
if (!result.ok) throw new Error(result.error?.message || "Application workspace bootstrap failed.");

const verify = provider.executeSqlSync(`
  select id, slug, name, plan_mode
  from public.app_workspaces
  where id = ${quote(workspaceId)}::uuid;
`);
if (!verify.ok || verify.rows?.length !== 1) throw new Error(verify.error?.message || "Application workspace verification failed.");
console.log(JSON.stringify({ ok: true, workspace: verify.rows[0] }, null, 2));
