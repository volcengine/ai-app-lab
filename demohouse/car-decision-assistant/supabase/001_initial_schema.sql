-- 购车决策助手：AI Native 应用开发底座 PostgreSQL Schema（基于 Supabase）
-- 通过 byted-supabase-cli db query -f 应用。
-- 所有业务访问先经过本站服务端 API；service_role 不得进入客户端。

create table if not exists public.decision_projects (
  id text primary key,
  owner_user_id uuid references auth.users(id) on delete set null,
  title text not null,
  status text not null,
  city text,
  primary_candidate_id text,
  summary_json jsonb not null default '{}'::jsonb,
  edit_token_digest text not null unique,
  recovery_code_digest text not null,
  version integer not null default 1 check (version > 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_decision_projects_owner_user_id
  on public.decision_projects(owner_user_id);
create index if not exists ix_decision_projects_expires_at
  on public.decision_projects(expires_at);
create index if not exists ix_decision_projects_updated_at
  on public.decision_projects(updated_at desc);

create table if not exists public.candidate_trims (
  id text primary key,
  project_id text not null references public.decision_projects(id) on delete cascade,
  position integer not null check (position between 0 and 2),
  role text not null,
  entity_id text,
  brand text,
  series text,
  model_year text,
  trim_name text not null,
  display_name text not null,
  status text not null,
  data_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_candidate_trims_project_position unique(project_id, position)
);

create index if not exists ix_candidate_trims_project_id
  on public.candidate_trims(project_id);
create index if not exists ix_candidate_trims_project_entity
  on public.candidate_trims(project_id, entity_id);

create table if not exists public.decision_conditions (
  id text primary key,
  project_id text not null references public.decision_projects(id) on delete cascade,
  sort_order integer not null,
  scope text not null,
  kind text not null,
  title text not null,
  description text not null default '',
  priority text not null,
  status text not null,
  details_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_decision_conditions_project_sort unique(project_id, sort_order)
);

create index if not exists ix_decision_conditions_project_id
  on public.decision_conditions(project_id);
create index if not exists ix_decision_conditions_project_status
  on public.decision_conditions(project_id, status);

create table if not exists public.condition_evaluations (
  id text primary key,
  project_id text not null references public.decision_projects(id) on delete cascade,
  condition_id text not null references public.decision_conditions(id) on delete cascade,
  candidate_trim_id text not null references public.candidate_trims(id) on delete cascade,
  status text not null,
  conclusion text not null default '',
  rationale_json jsonb not null default '{}'::jsonb,
  evaluated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_condition_evaluations_condition_candidate
    unique(condition_id, candidate_trim_id)
);

create index if not exists ix_condition_evaluations_project_id
  on public.condition_evaluations(project_id);
create index if not exists ix_condition_evaluations_project_status
  on public.condition_evaluations(project_id, status);
create index if not exists ix_condition_evaluations_condition_id
  on public.condition_evaluations(condition_id);
create index if not exists ix_condition_evaluations_candidate_trim_id
  on public.condition_evaluations(candidate_trim_id);

create table if not exists public.evidence (
  id text primary key,
  project_id text not null references public.decision_projects(id) on delete cascade,
  candidate_trim_id text references public.candidate_trims(id) on delete cascade,
  condition_id text references public.decision_conditions(id) on delete cascade,
  evaluation_id text references public.condition_evaluations(id) on delete cascade,
  evidence_type text not null,
  source_type text not null,
  source_name text,
  title text not null,
  summary text not null default '',
  source_url text,
  trace_id text,
  log_id text,
  validity text not null,
  captured_at timestamptz not null,
  expires_at timestamptz,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_evidence_project_id
  on public.evidence(project_id);
create index if not exists ix_evidence_project_candidate
  on public.evidence(project_id, candidate_trim_id);
create index if not exists ix_evidence_project_condition
  on public.evidence(project_id, condition_id);
create index if not exists ix_evidence_trace_id
  on public.evidence(trace_id);

create table if not exists public.user_checks (
  id text primary key,
  project_id text not null references public.decision_projects(id) on delete cascade,
  condition_id text references public.decision_conditions(id) on delete cascade,
  candidate_trim_id text references public.candidate_trims(id) on delete cascade,
  sort_order integer not null,
  title text not null,
  instructions text not null default '',
  status text not null,
  result text,
  due_at timestamptz,
  completed_at timestamptz,
  details_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_user_checks_project_sort
  on public.user_checks(project_id, sort_order);
create index if not exists ix_user_checks_project_status
  on public.user_checks(project_id, status);

create table if not exists public.sales_quotes (
  id text primary key,
  project_id text not null references public.decision_projects(id) on delete cascade,
  candidate_trim_id text not null references public.candidate_trims(id) on delete cascade,
  status text not null,
  dealer_name text,
  city text,
  currency text not null default 'CNY',
  total_amount_minor bigint,
  payment_method text,
  quoted_at timestamptz not null,
  expires_at timestamptz,
  line_items_json jsonb not null default '[]'::jsonb,
  terms_json jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_sales_quotes_project_id
  on public.sales_quotes(project_id);
create index if not exists ix_sales_quotes_project_candidate
  on public.sales_quotes(project_id, candidate_trim_id);
create index if not exists ix_sales_quotes_project_quoted_at
  on public.sales_quotes(project_id, quoted_at);

create table if not exists public.sales_claims (
  id text primary key,
  project_id text not null references public.decision_projects(id) on delete cascade,
  candidate_trim_id text references public.candidate_trims(id) on delete cascade,
  quote_id text references public.sales_quotes(id) on delete cascade,
  claim_type text not null,
  content text not null,
  status text not null,
  promised_at timestamptz,
  expires_at timestamptz,
  proof_json jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_sales_claims_project_id
  on public.sales_claims(project_id);
create index if not exists ix_sales_claims_project_status
  on public.sales_claims(project_id, status);
create index if not exists ix_sales_claims_project_candidate
  on public.sales_claims(project_id, candidate_trim_id);

create table if not exists public.city_vehicle_series (
  id text primary key,
  project_id text not null references public.decision_projects(id) on delete cascade,
  candidate_trim_id text not null references public.candidate_trims(id) on delete cascade,
  city text not null,
  series_name text not null,
  data_level text,
  dataset_type text not null default 'vehicle_sales',
  period_label text not null,
  period_start date,
  period_end date,
  metric_key text not null,
  metric_label text not null,
  metric_definition text,
  unit text,
  status text not null,
  evidence_id text references public.evidence(id) on delete set null,
  request_id text,
  trace_id text,
  captured_at timestamptz not null,
  extra_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_city_vehicle_series_period check (
    period_start is null
    or period_end is null
    or period_start <= period_end
  )
);

create index if not exists ix_city_vehicle_series_project_id
  on public.city_vehicle_series(project_id);
create index if not exists ix_city_vehicle_series_project_candidate
  on public.city_vehicle_series(project_id, candidate_trim_id);
create index if not exists ix_city_vehicle_series_candidate_captured
  on public.city_vehicle_series(candidate_trim_id, captured_at desc);

create table if not exists public.city_vehicle_series_points (
  id text primary key,
  series_id text not null references public.city_vehicle_series(id) on delete cascade,
  month date not null,
  month_label text not null,
  value numeric not null check (value >= 0),
  extra_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint uq_city_vehicle_series_points_month unique(series_id, month)
);

create index if not exists ix_city_vehicle_series_points_series_id
  on public.city_vehicle_series_points(series_id);
create index if not exists ix_city_vehicle_series_points_month
  on public.city_vehicle_series_points(month);

-- RLS：当前前端不直接访问 Data API。authenticated 策略为后续无感匿名
-- Auth 预留；service_role 仅在本站服务端使用并绕过 RLS。
alter table public.decision_projects enable row level security;
alter table public.candidate_trims enable row level security;
alter table public.decision_conditions enable row level security;
alter table public.condition_evaluations enable row level security;
alter table public.evidence enable row level security;
alter table public.user_checks enable row level security;
alter table public.sales_quotes enable row level security;
alter table public.sales_claims enable row level security;
alter table public.city_vehicle_series enable row level security;
alter table public.city_vehicle_series_points enable row level security;

drop policy if exists decision_projects_owner_all on public.decision_projects;
create policy decision_projects_owner_all on public.decision_projects
  for all to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

drop policy if exists candidate_trims_owner_all on public.candidate_trims;
create policy candidate_trims_owner_all on public.candidate_trims
  for all to authenticated
  using (
    exists (
      select 1 from public.decision_projects project
      where project.id = candidate_trims.project_id
        and project.owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.decision_projects project
      where project.id = candidate_trims.project_id
        and project.owner_user_id = (select auth.uid())
    )
  );

drop policy if exists decision_conditions_owner_all on public.decision_conditions;
create policy decision_conditions_owner_all on public.decision_conditions
  for all to authenticated
  using (
    exists (
      select 1 from public.decision_projects project
      where project.id = decision_conditions.project_id
        and project.owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.decision_projects project
      where project.id = decision_conditions.project_id
        and project.owner_user_id = (select auth.uid())
    )
  );

drop policy if exists condition_evaluations_owner_all on public.condition_evaluations;
create policy condition_evaluations_owner_all on public.condition_evaluations
  for all to authenticated
  using (
    exists (
      select 1 from public.decision_projects project
      where project.id = condition_evaluations.project_id
        and project.owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.decision_projects project
      where project.id = condition_evaluations.project_id
        and project.owner_user_id = (select auth.uid())
    )
  );

drop policy if exists evidence_owner_all on public.evidence;
create policy evidence_owner_all on public.evidence
  for all to authenticated
  using (
    exists (
      select 1 from public.decision_projects project
      where project.id = evidence.project_id
        and project.owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.decision_projects project
      where project.id = evidence.project_id
        and project.owner_user_id = (select auth.uid())
    )
  );

drop policy if exists user_checks_owner_all on public.user_checks;
create policy user_checks_owner_all on public.user_checks
  for all to authenticated
  using (
    exists (
      select 1 from public.decision_projects project
      where project.id = user_checks.project_id
        and project.owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.decision_projects project
      where project.id = user_checks.project_id
        and project.owner_user_id = (select auth.uid())
    )
  );

drop policy if exists sales_quotes_owner_all on public.sales_quotes;
create policy sales_quotes_owner_all on public.sales_quotes
  for all to authenticated
  using (
    exists (
      select 1 from public.decision_projects project
      where project.id = sales_quotes.project_id
        and project.owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.decision_projects project
      where project.id = sales_quotes.project_id
        and project.owner_user_id = (select auth.uid())
    )
  );

drop policy if exists sales_claims_owner_all on public.sales_claims;
create policy sales_claims_owner_all on public.sales_claims
  for all to authenticated
  using (
    exists (
      select 1 from public.decision_projects project
      where project.id = sales_claims.project_id
        and project.owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.decision_projects project
      where project.id = sales_claims.project_id
        and project.owner_user_id = (select auth.uid())
    )
  );

drop policy if exists city_vehicle_series_owner_all on public.city_vehicle_series;
create policy city_vehicle_series_owner_all on public.city_vehicle_series
  for all to authenticated
  using (
    exists (
      select 1 from public.decision_projects project
      where project.id = city_vehicle_series.project_id
        and project.owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.decision_projects project
      where project.id = city_vehicle_series.project_id
        and project.owner_user_id = (select auth.uid())
    )
  );

drop policy if exists city_vehicle_series_points_owner_all
  on public.city_vehicle_series_points;
create policy city_vehicle_series_points_owner_all
  on public.city_vehicle_series_points
  for all to authenticated
  using (
    exists (
      select 1
      from public.city_vehicle_series series
      join public.decision_projects project on project.id = series.project_id
      where series.id = city_vehicle_series_points.series_id
        and project.owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.city_vehicle_series series
      join public.decision_projects project on project.id = series.project_id
      where series.id = city_vehicle_series_points.series_id
        and project.owner_user_id = (select auth.uid())
    )
  );

revoke all on table
  public.decision_projects,
  public.candidate_trims,
  public.decision_conditions,
  public.condition_evaluations,
  public.evidence,
  public.user_checks,
  public.sales_quotes,
  public.sales_claims,
  public.city_vehicle_series,
  public.city_vehicle_series_points
from anon;

grant select, insert, update, delete on table
  public.decision_projects,
  public.candidate_trims,
  public.decision_conditions,
  public.condition_evaluations,
  public.evidence,
  public.user_checks,
  public.sales_quotes,
  public.sales_claims,
  public.city_vehicle_series,
  public.city_vehicle_series_points
to authenticated;

grant all on table
  public.decision_projects,
  public.candidate_trims,
  public.decision_conditions,
  public.condition_evaluations,
  public.evidence,
  public.user_checks,
  public.sales_quotes,
  public.sales_claims,
  public.city_vehicle_series,
  public.city_vehicle_series_points
to service_role;

-- 原子保存完整购车决策项目。只允许服务端 service_role 调用，前端无法执行。
create or replace function public.save_decision_project(
  p_record jsonb,
  p_mode text,
  p_edit_token_digest text default null,
  p_expected_version integer default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project public.decision_projects;
  v_project_id text;
  v_version integer;
begin
  v_project := jsonb_populate_record(
    null::public.decision_projects,
    p_record -> 'project'
  );
  v_project_id := v_project.id;

  if p_mode = 'create' then
    insert into public.decision_projects
    select * from jsonb_populate_record(
      null::public.decision_projects,
      p_record -> 'project'
    );
    v_version := v_project.version;
  elsif p_mode = 'update' then
    update public.decision_projects
    set
      title = v_project.title,
      status = v_project.status,
      city = v_project.city,
      primary_candidate_id = v_project.primary_candidate_id,
      summary_json = v_project.summary_json,
      version = v_project.version,
      expires_at = v_project.expires_at,
      updated_at = v_project.updated_at
    where id = v_project_id
      and edit_token_digest = p_edit_token_digest
      and version = p_expected_version
    returning version into v_version;

    if v_version is null then
      raise exception using
        errcode = '40001',
        message = 'VERSION_CONFLICT';
    end if;

    delete from public.city_vehicle_series
      where project_id = v_project_id;
    delete from public.sales_claims
      where project_id = v_project_id;
    delete from public.evidence
      where project_id = v_project_id;
    delete from public.condition_evaluations
      where project_id = v_project_id;
    delete from public.user_checks
      where project_id = v_project_id;
    delete from public.sales_quotes
      where project_id = v_project_id;
    delete from public.decision_conditions
      where project_id = v_project_id;
    delete from public.candidate_trims
      where project_id = v_project_id;
  else
    raise exception using
      errcode = '22023',
      message = 'INVALID_SAVE_MODE';
  end if;

  insert into public.candidate_trims
  select * from jsonb_populate_recordset(
    null::public.candidate_trims,
    coalesce(p_record -> 'candidate_trims', '[]'::jsonb)
  );
  insert into public.decision_conditions
  select * from jsonb_populate_recordset(
    null::public.decision_conditions,
    coalesce(p_record -> 'decision_conditions', '[]'::jsonb)
  );
  insert into public.condition_evaluations
  select * from jsonb_populate_recordset(
    null::public.condition_evaluations,
    coalesce(p_record -> 'condition_evaluations', '[]'::jsonb)
  );
  insert into public.evidence
  select * from jsonb_populate_recordset(
    null::public.evidence,
    coalesce(p_record -> 'evidence', '[]'::jsonb)
  );
  insert into public.user_checks
  select * from jsonb_populate_recordset(
    null::public.user_checks,
    coalesce(p_record -> 'user_checks', '[]'::jsonb)
  );
  insert into public.sales_quotes
  select * from jsonb_populate_recordset(
    null::public.sales_quotes,
    coalesce(p_record -> 'sales_quotes', '[]'::jsonb)
  );
  insert into public.sales_claims
  select * from jsonb_populate_recordset(
    null::public.sales_claims,
    coalesce(p_record -> 'sales_claims', '[]'::jsonb)
  );
  insert into public.city_vehicle_series
  select * from jsonb_populate_recordset(
    null::public.city_vehicle_series,
    coalesce(p_record -> 'city_vehicle_series', '[]'::jsonb)
  );
  insert into public.city_vehicle_series_points
  select * from jsonb_populate_recordset(
    null::public.city_vehicle_series_points,
    coalesce(p_record -> 'city_vehicle_series_points', '[]'::jsonb)
  );

  return v_version;
end;
$$;

revoke all on function public.save_decision_project(
  jsonb,
  text,
  text,
  integer
) from public, anon, authenticated;
grant execute on function public.save_decision_project(
  jsonb,
  text,
  text,
  integer
) to service_role;
