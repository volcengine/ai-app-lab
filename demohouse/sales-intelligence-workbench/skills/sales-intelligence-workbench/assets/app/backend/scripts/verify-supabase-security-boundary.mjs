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

const managementRoutines = [
  "persist_sales_dossier",
  "persist_provider_run",
  "reserve_paid_workflow",
  "finish_paid_workflow",
  "get_paid_workflow_usage",
  "enqueue_sales_job",
  "claim_sales_job",
  "heartbeat_sales_job",
  "release_sales_job_claim",
  "request_cancel_sales_job",
  "acknowledge_cancel_sales_job",
  "retry_sales_job",
];
const routineList = managementRoutines.map((name) => `'${name}'`).join(", ");
const platformManagedTables = new Set(["health_check"]);

const tables = query(
  `
    select
      c.relname as table_name,
      pg_get_userbyid(c.relowner) as owner,
      c.relrowsecurity as rls_enabled,
      has_table_privilege('anon', c.oid, 'select') as anon_select,
      has_table_privilege('authenticated', c.oid, 'select') as authenticated_select
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
    order by c.relname
  `,
  "Unable to inspect public table RLS",
);
const ordinaryExecuteGrants = query(
  `
    select distinct routine_name, grantee
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name in (${routineList})
      and privilege_type = 'EXECUTE'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
    order by routine_name, grantee
  `,
  "Unable to inspect ordinary-role RPC grants",
);
const serviceRoleExecuteGrants = query(
  `
    select distinct routine_name
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name in (${routineList})
      and privilege_type = 'EXECUTE'
      and grantee = 'service_role'
    order by routine_name
  `,
  "Unable to inspect service-role RPC grants",
);

const projectTables = tables.filter((table) => !platformManagedTables.has(table.table_name));
const platformTables = tables.filter((table) => platformManagedTables.has(table.table_name));
const tablesWithoutRls = projectTables
  .filter((table) => table.rls_enabled !== true)
  .map((table) => table.table_name);
const exposedPlatformTables = platformTables
  .filter((table) => table.anon_select === true || table.authenticated_select === true)
  .map((table) => table.table_name);
const serviceRoleRoutines = new Set(serviceRoleExecuteGrants.map((row) => row.routine_name));
const missingServiceRoleGrants = managementRoutines.filter((name) => !serviceRoleRoutines.has(name));
const checks = {
  project_public_tables_use_rls: tablesWithoutRls.length === 0,
  platform_managed_tables_fail_closed: exposedPlatformTables.length === 0,
  ordinary_roles_cannot_execute_management_rpcs: ordinaryExecuteGrants.length === 0,
  service_role_can_execute_management_rpcs: missingServiceRoleGrants.length === 0,
};
const ok = Object.values(checks).every(Boolean);

console.log(JSON.stringify({
  ok,
  checks,
  inspected_project_tables: projectTables.length,
  platform_managed_tables: platformTables,
  tables_without_rls: tablesWithoutRls,
  exposed_platform_tables: exposedPlatformTables,
  ordinary_execute_grants: ordinaryExecuteGrants,
  missing_service_role_grants: missingServiceRoleGrants,
}, null, 2));

if (!ok) process.exitCode = 1;
