import { createEnvReader } from "../src/config/runtimeEnv.js";
import { createSupabaseProvider } from "../src/providers/supabaseProvider.js";

const env = createEnvReader();
const provider = createSupabaseProvider({ env });

if (!provider.isConfigured()) {
  throw new Error("Supabase persistence is not configured.");
}

function query(sql, label) {
  const result = provider.executeSqlSync(sql);
  if (!result.ok) throw new Error(`${label}: ${result.error?.message || "query failed"}`);
  return result.rows || [];
}

const [state] = query(
  `
    select
      to_regclass('public.sales_qa_messages') as active_table,
      to_regclass('public.sales_qa_messages_legacy') as legacy_table,
      has_table_privilege('anon', 'public.sales_qa_messages_legacy', 'select') as anon_select,
      has_table_privilege('authenticated', 'public.sales_qa_messages_legacy', 'select') as authenticated_select,
      has_table_privilege('service_role', 'public.sales_qa_messages_legacy', 'select') as service_role_select
  `,
  "Unable to inspect the QA storage boundary",
);
const [count] = query(
  "select count(*)::integer as legacy_rows from public.sales_qa_messages_legacy",
  "Unable to count legacy QA rows",
);
const [migration] = query(
  "select version, description, applied_at from public.schema_migrations where version = '202607280001'",
  "Unable to inspect the QA boundary migration",
);

const checks = {
  migration_applied: migration?.version === "202607280001",
  active_table_removed: state?.active_table === null,
  legacy_table_present: String(state?.legacy_table || "").endsWith("sales_qa_messages_legacy"),
  anon_blocked: state?.anon_select === false,
  authenticated_blocked: state?.authenticated_select === false,
  service_role_can_audit: state?.service_role_select === true,
};
const ok = Object.values(checks).every(Boolean);

console.log(JSON.stringify({
  ok,
  checks,
  legacy_rows: Number(count?.legacy_rows || 0),
  migration: migration || null,
}, null, 2));

if (!ok) process.exitCode = 1;
