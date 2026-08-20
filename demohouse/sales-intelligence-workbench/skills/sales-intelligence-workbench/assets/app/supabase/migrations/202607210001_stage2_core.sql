begin;

create table if not exists public.schema_migrations (
  version text primary key,
  description text not null,
  applied_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.app_workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  plan_mode text not null default 'standard' check (plan_mode in ('standard', 'agent_plan')),
  created_by uuid references auth.users(id) on delete set null,
  settings_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_workspace_members (
  workspace_id uuid not null references public.app_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.provider_connections (
  id text primary key,
  workspace_id uuid not null references public.app_workspaces(id) on delete cascade,
  provider text not null,
  status text not null default 'configured',
  secret_ref text,
  config_json jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider)
);

create table if not exists public.sales_goals (
  id text primary key,
  workspace_id uuid not null references public.app_workspaces(id) on delete cascade,
  name text not null,
  description text,
  keywords jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload_json jsonb not null default '{}'::jsonb,
  unique (workspace_id, id)
);

create table if not exists public.sales_companies (
  id text primary key,
  workspace_id uuid not null references public.app_workspaces(id) on delete cascade,
  name text not null,
  normalized_name text generated always as (lower(btrim(name))) stored,
  initial text,
  industry text,
  location text,
  tags jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload_json jsonb not null default '{}'::jsonb,
  unique (workspace_id, id),
  unique (workspace_id, normalized_name)
);

create table if not exists public.sales_target_enterprises (
  id text primary key,
  workspace_id uuid not null references public.app_workspaces(id) on delete cascade,
  goal_id text not null,
  company_id text not null,
  status text not null default 'new',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload_json jsonb not null default '{}'::jsonb,
  unique (workspace_id, id),
  unique (workspace_id, goal_id, company_id),
  foreign key (workspace_id, goal_id) references public.sales_goals(workspace_id, id) on delete cascade,
  foreign key (workspace_id, company_id) references public.sales_companies(workspace_id, id) on delete cascade
);

create table if not exists public.sales_company_search_results (
  id text primary key,
  workspace_id uuid not null references public.app_workspaces(id) on delete cascade,
  goal_id text not null,
  company_id text,
  query text not null,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  payload_json jsonb not null default '{}'::jsonb,
  unique (workspace_id, id),
  foreign key (workspace_id, goal_id) references public.sales_goals(workspace_id, id) on delete cascade,
  foreign key (workspace_id, company_id) references public.sales_companies(workspace_id, id) on delete cascade
);

create table if not exists public.sales_progress_snapshots (
  id text primary key,
  workspace_id uuid not null references public.app_workspaces(id) on delete cascade,
  company_id text not null,
  label text,
  summary text,
  evidence text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  payload_json jsonb not null default '{}'::jsonb,
  unique (workspace_id, id),
  foreign key (workspace_id, company_id) references public.sales_companies(workspace_id, id) on delete cascade
);

create table if not exists public.sales_dossier_records (
  id text primary key,
  workspace_id uuid not null references public.app_workspaces(id) on delete cascade,
  company_id text not null,
  title text,
  summary text,
  memory_summary text,
  status text not null default 'completed',
  provider_run_id text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload_json jsonb not null default '{}'::jsonb,
  unique (workspace_id, id),
  foreign key (workspace_id, company_id) references public.sales_companies(workspace_id, id) on delete cascade
);

create table if not exists public.sales_dossier_citations (
  id text primary key,
  workspace_id uuid not null references public.app_workspaces(id) on delete cascade,
  dossier_id text not null,
  citation_no text not null,
  label text,
  source_kind text,
  url text,
  created_at timestamptz not null default now(),
  payload_json jsonb not null default '{}'::jsonb,
  unique (workspace_id, id),
  unique (workspace_id, dossier_id, citation_no),
  foreign key (workspace_id, dossier_id) references public.sales_dossier_records(workspace_id, id) on delete cascade
);

create table if not exists public.sales_materials (
  id text primary key,
  workspace_id uuid not null references public.app_workspaces(id) on delete cascade,
  company_id text not null,
  title text not null,
  source_type text,
  source_url text,
  content_hash text,
  summary text,
  occurred_at timestamptz,
  openviking_uri text,
  openviking_status text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload_json jsonb not null default '{}'::jsonb,
  unique (workspace_id, id),
  foreign key (workspace_id, company_id) references public.sales_companies(workspace_id, id) on delete cascade
);

create unique index if not exists sales_materials_content_unique
  on public.sales_materials(workspace_id, company_id, content_hash)
  where content_hash is not null and deleted_at is null;

create table if not exists public.sales_qa_messages (
  id text primary key,
  workspace_id uuid not null references public.app_workspaces(id) on delete cascade,
  company_id text not null,
  session_id text not null,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  text text not null,
  provider_run_id text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  payload_json jsonb not null default '{}'::jsonb,
  unique (workspace_id, id),
  foreign key (workspace_id, company_id) references public.sales_companies(workspace_id, id) on delete cascade
);

create table if not exists public.sales_openviking_refs (
  id text primary key,
  workspace_id uuid not null references public.app_workspaces(id) on delete cascade,
  company_id text,
  related_type text not null,
  related_id text,
  ref_kind text not null,
  uri text not null,
  summary text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  payload_json jsonb not null default '{}'::jsonb,
  unique (workspace_id, id),
  unique (workspace_id, related_type, related_id, ref_kind),
  foreign key (workspace_id, company_id) references public.sales_companies(workspace_id, id) on delete cascade
);

create table if not exists public.jobs (
  id text primary key,
  workspace_id uuid not null references public.app_workspaces(id) on delete cascade,
  job_type text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  entity_type text,
  entity_id text,
  idempotency_key text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts > 0),
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  error_json jsonb,
  payload_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create unique index if not exists jobs_workspace_idempotency_unique
  on public.jobs(workspace_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists public.provider_runs (
  id text primary key,
  workspace_id uuid not null references public.app_workspaces(id) on delete cascade,
  job_id text,
  operation text not null,
  status text not null check (status in ('running', 'succeeded', 'succeeded_with_issues', 'failed', 'cancelled')),
  app_mode text not null,
  entity_type text,
  entity_id text,
  started_at timestamptz not null,
  finished_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  result_ref text,
  error_json jsonb,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, job_id) references public.jobs(workspace_id, id) on delete cascade
);

create table if not exists public.provider_run_steps (
  id text primary key,
  workspace_id uuid not null references public.app_workspaces(id) on delete cascade,
  provider_run_id text not null,
  sequence integer not null check (sequence > 0),
  provider text not null,
  operation text not null,
  status text not null check (status in ('running', 'succeeded', 'failed', 'skipped', 'cancelled')),
  input_summary text,
  output_summary text,
  request_id text,
  raw_ref text,
  usage_json jsonb,
  attempts integer not null default 1 check (attempts > 0),
  started_at timestamptz not null,
  finished_at timestamptz,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, provider_run_id, sequence),
  foreign key (workspace_id, provider_run_id) references public.provider_runs(workspace_id, id) on delete cascade
);

create table if not exists public.sync_sources (
  id text primary key,
  workspace_id uuid not null references public.app_workspaces(id) on delete cascade,
  source_type text not null,
  external_id text not null,
  display_name text,
  status text not null default 'active' check (status in ('active', 'paused', 'error', 'deleted')),
  config_json jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, source_type, external_id)
);

create table if not exists public.sync_checkpoints (
  id text primary key,
  workspace_id uuid not null references public.app_workspaces(id) on delete cascade,
  source_id text not null,
  checkpoint_key text not null,
  checkpoint_value text,
  content_hash text,
  last_success_at timestamptz,
  error_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, source_id, checkpoint_key),
  foreign key (workspace_id, source_id) references public.sync_sources(workspace_id, id) on delete cascade
);

create table if not exists public.audit_events (
  id text primary key,
  workspace_id uuid not null references public.app_workspaces(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  request_id text,
  ip_hash text,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create index if not exists app_workspace_members_user_idx on public.app_workspace_members(user_id, workspace_id);
create index if not exists provider_connections_workspace_idx on public.provider_connections(workspace_id, provider);
create index if not exists sales_goals_workspace_idx on public.sales_goals(workspace_id, updated_at desc) where deleted_at is null;
create index if not exists sales_companies_workspace_idx on public.sales_companies(workspace_id, updated_at desc) where deleted_at is null;
create index if not exists sales_targets_goal_idx on public.sales_target_enterprises(workspace_id, goal_id, updated_at desc) where deleted_at is null;
create index if not exists sales_search_goal_idx on public.sales_company_search_results(workspace_id, goal_id, created_at desc);
create index if not exists sales_progress_company_idx on public.sales_progress_snapshots(workspace_id, company_id, created_at desc);
create index if not exists sales_dossiers_company_idx on public.sales_dossier_records(workspace_id, company_id, created_at desc) where deleted_at is null;
create index if not exists sales_materials_company_idx on public.sales_materials(workspace_id, company_id, updated_at desc) where deleted_at is null;
create index if not exists sales_qa_company_idx on public.sales_qa_messages(workspace_id, company_id, created_at);
create index if not exists sales_openviking_company_idx on public.sales_openviking_refs(workspace_id, company_id, created_at desc);
create index if not exists jobs_queue_idx on public.jobs(workspace_id, status, scheduled_at, created_at);
create index if not exists provider_runs_entity_idx on public.provider_runs(workspace_id, entity_type, entity_id, started_at desc);
create index if not exists provider_run_steps_run_idx on public.provider_run_steps(workspace_id, provider_run_id, sequence);
create index if not exists sync_sources_workspace_idx on public.sync_sources(workspace_id, source_type, status);
create index if not exists audit_events_entity_idx on public.audit_events(workspace_id, entity_type, entity_id, created_at desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'app_workspaces', 'app_users', 'app_workspace_members', 'provider_connections',
    'sales_goals', 'sales_companies', 'sales_target_enterprises', 'sales_dossier_records',
    'sales_materials', 'jobs', 'provider_runs', 'provider_run_steps', 'sync_sources', 'sync_checkpoints'
  ]
  loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end;
$$;

insert into public.schema_migrations(version, description)
values ('202607210001', 'Stage 2 multi-tenant sales workbench core schema')
on conflict (version) do nothing;

commit;
