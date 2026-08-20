begin;

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.app_workspace_members member
    where member.workspace_id = target_workspace_id
      and member.user_id = (select auth.uid())
  );
$$;

create or replace function public.can_write_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.app_workspace_members member
    where member.workspace_id = target_workspace_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'admin', 'member')
  );
$$;

create or replace function public.can_admin_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.app_workspace_members member
    where member.workspace_id = target_workspace_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner', 'admin')
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.can_write_workspace(uuid) from public;
revoke all on function public.can_admin_workspace(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated, service_role;
grant execute on function public.can_write_workspace(uuid) to authenticated, service_role;
grant execute on function public.can_admin_workspace(uuid) to authenticated, service_role;

alter table public.app_workspaces enable row level security;
alter table public.app_workspaces force row level security;
alter table public.app_users enable row level security;
alter table public.app_users force row level security;
alter table public.app_workspace_members enable row level security;
alter table public.app_workspace_members force row level security;
alter table public.provider_connections enable row level security;
alter table public.provider_connections force row level security;

drop policy if exists app_workspaces_select on public.app_workspaces;
create policy app_workspaces_select on public.app_workspaces
  for select to authenticated
  using (public.is_workspace_member(id));

drop policy if exists app_workspaces_insert on public.app_workspaces;
create policy app_workspaces_insert on public.app_workspaces
  for insert to authenticated
  with check (created_by = (select auth.uid()));

drop policy if exists app_workspaces_update on public.app_workspaces;
create policy app_workspaces_update on public.app_workspaces
  for update to authenticated
  using (public.can_admin_workspace(id))
  with check (public.can_admin_workspace(id));

drop policy if exists app_users_select on public.app_users;
create policy app_users_select on public.app_users
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists app_users_insert on public.app_users;
create policy app_users_insert on public.app_users
  for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists app_users_update on public.app_users;
create policy app_users_update on public.app_users
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists workspace_members_select on public.app_workspace_members;
create policy workspace_members_select on public.app_workspace_members
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists workspace_members_insert on public.app_workspace_members;
create policy workspace_members_insert on public.app_workspace_members
  for insert to authenticated
  with check (public.can_admin_workspace(workspace_id));

drop policy if exists workspace_members_update on public.app_workspace_members;
create policy workspace_members_update on public.app_workspace_members
  for update to authenticated
  using (public.can_admin_workspace(workspace_id))
  with check (public.can_admin_workspace(workspace_id));

drop policy if exists workspace_members_delete on public.app_workspace_members;
create policy workspace_members_delete on public.app_workspace_members
  for delete to authenticated
  using (public.can_admin_workspace(workspace_id));

drop policy if exists provider_connections_select on public.provider_connections;
create policy provider_connections_select on public.provider_connections
  for select to authenticated
  using (public.can_admin_workspace(workspace_id));

drop policy if exists provider_connections_insert on public.provider_connections;
create policy provider_connections_insert on public.provider_connections
  for insert to authenticated
  with check (public.can_admin_workspace(workspace_id));

drop policy if exists provider_connections_update on public.provider_connections;
create policy provider_connections_update on public.provider_connections
  for update to authenticated
  using (public.can_admin_workspace(workspace_id))
  with check (public.can_admin_workspace(workspace_id));

drop policy if exists provider_connections_delete on public.provider_connections;
create policy provider_connections_delete on public.provider_connections
  for delete to authenticated
  using (public.can_admin_workspace(workspace_id));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'sales_goals', 'sales_companies', 'sales_target_enterprises', 'sales_company_search_results',
    'sales_progress_snapshots', 'sales_dossier_records', 'sales_dossier_citations', 'sales_materials',
    'sales_qa_messages', 'sales_openviking_refs', 'jobs', 'provider_runs', 'provider_run_steps',
    'sync_sources', 'sync_checkpoints'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('drop policy if exists workspace_select on public.%I', table_name);
    execute format(
      'create policy workspace_select on public.%I for select to authenticated using (public.is_workspace_member(workspace_id))',
      table_name
    );
    execute format('drop policy if exists workspace_insert on public.%I', table_name);
    execute format(
      'create policy workspace_insert on public.%I for insert to authenticated with check (public.can_write_workspace(workspace_id))',
      table_name
    );
    execute format('drop policy if exists workspace_update on public.%I', table_name);
    execute format(
      'create policy workspace_update on public.%I for update to authenticated using (public.can_write_workspace(workspace_id)) with check (public.can_write_workspace(workspace_id))',
      table_name
    );
    execute format('drop policy if exists workspace_delete on public.%I', table_name);
    execute format(
      'create policy workspace_delete on public.%I for delete to authenticated using (public.can_write_workspace(workspace_id))',
      table_name
    );
  end loop;
end;
$$;

alter table public.audit_events enable row level security;
alter table public.audit_events force row level security;

drop policy if exists audit_events_select on public.audit_events;
create policy audit_events_select on public.audit_events
  for select to authenticated
  using (public.can_admin_workspace(workspace_id));

drop policy if exists audit_events_insert on public.audit_events;
create policy audit_events_insert on public.audit_events
  for insert to authenticated
  with check (public.can_write_workspace(workspace_id));

revoke all on all tables in schema public from anon;
revoke all on public.schema_migrations from authenticated;
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.app_workspaces to authenticated;
grant select, insert, update on public.app_users to authenticated;
grant select, insert, update, delete on public.app_workspace_members to authenticated;
grant select, insert, update, delete on public.provider_connections to authenticated;
grant select, insert, update, delete on
  public.sales_goals,
  public.sales_companies,
  public.sales_target_enterprises,
  public.sales_company_search_results,
  public.sales_progress_snapshots,
  public.sales_dossier_records,
  public.sales_dossier_citations,
  public.sales_materials,
  public.sales_qa_messages,
  public.sales_openviking_refs,
  public.jobs,
  public.provider_runs,
  public.provider_run_steps,
  public.sync_sources,
  public.sync_checkpoints
to authenticated;
grant select, insert on public.audit_events to authenticated;
grant all on all tables in schema public to service_role;

insert into public.schema_migrations(version, description)
values ('202607210002', 'Stage 2 row-level security and Data API grants')
on conflict (version) do nothing;

commit;
