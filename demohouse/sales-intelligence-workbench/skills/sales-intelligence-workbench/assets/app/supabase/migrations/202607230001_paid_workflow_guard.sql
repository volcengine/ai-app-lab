begin;

alter table public.jobs
  add column if not exists is_paid boolean not null default false;

create table if not exists public.paid_workflow_reservations (
  id text primary key,
  workspace_id uuid not null references public.app_workspaces(id) on delete cascade,
  job_id text not null,
  job_type text not null,
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed', 'cancelled', 'expired')),
  reserved_at timestamptz not null default now(),
  released_at timestamptz,
  expires_at timestamptz not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, job_id) references public.jobs(workspace_id, id) on delete cascade
);

create index if not exists paid_workflow_reservations_active_idx
  on public.paid_workflow_reservations(workspace_id, status, expires_at);

create index if not exists paid_workflow_reservations_daily_idx
  on public.paid_workflow_reservations(workspace_id, reserved_at desc);

alter table public.paid_workflow_reservations enable row level security;
revoke all on table public.paid_workflow_reservations from public, anon, authenticated;

drop trigger if exists set_paid_workflow_reservations_updated_at on public.paid_workflow_reservations;
create trigger set_paid_workflow_reservations_updated_at
before update on public.paid_workflow_reservations
for each row execute function public.set_updated_at();

create or replace function public.reserve_paid_workflow(
  p_workspace_id uuid,
  p_job jsonb,
  p_reservation_id text,
  p_max_concurrent integer,
  p_daily_limit integer,
  p_budget_timezone text,
  p_stale_after_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job_id text := nullif(p_job ->> 'id', '');
  v_job_type text := nullif(p_job ->> 'job_type', '');
  v_now timestamptz := now();
  v_running integer := 0;
  v_daily integer := 0;
  v_timezone text := coalesce(nullif(p_budget_timezone, ''), 'UTC');
  v_stale_seconds integer := greatest(coalesce(p_stale_after_seconds, 1800), 60);
begin
  if v_job_id is null or v_job_type is null or nullif(p_reservation_id, '') is null then
    raise exception using message = 'paid_workflow_reservation_invalid', errcode = '22023';
  end if;
  if coalesce(p_max_concurrent, 0) < 0 or coalesce(p_daily_limit, 0) < 0 then
    raise exception using message = 'paid_workflow_limit_invalid', errcode = '22023';
  end if;
  if not exists (select 1 from public.app_workspaces where id = p_workspace_id) then
    raise exception using message = 'application workspace was not found', errcode = 'P0002';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_timezone) then
    raise exception using message = 'paid_workflow_timezone_invalid', errcode = '22023';
  end if;
  if exists (
    select 1 from public.jobs where id = v_job_id and workspace_id <> p_workspace_id
  ) then
    raise exception using message = 'cross-workspace job identifier conflict', errcode = '23505';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_workspace_id::text));

  update public.paid_workflow_reservations
  set
    status = 'expired',
    released_at = v_now,
    payload_json = payload_json || jsonb_build_object('release_reason', 'reservation_expired')
  where workspace_id = p_workspace_id
    and status = 'running'
    and expires_at <= v_now;

  update public.jobs as job
  set
    status = 'failed',
    finished_at = v_now,
    error_json = jsonb_build_object(
      'code', 'paid_workflow_reservation_expired',
      'message', '任务执行超过预约时限，已自动释放并发名额。',
      'retryable', true
    ),
    payload_json = jsonb_set(
      jsonb_set(job.payload_json, '{status}', '"failed"'::jsonb, true),
      '{error}',
      jsonb_build_object(
        'code', 'paid_workflow_reservation_expired',
        'message', '任务执行超过预约时限，已自动释放并发名额。',
        'retryable', true
      ),
      true
    )
  where job.workspace_id = p_workspace_id
    and job.status = 'running'
    and exists (
      select 1
      from public.paid_workflow_reservations as reservation
      where reservation.workspace_id = job.workspace_id
        and reservation.job_id = job.id
        and reservation.status = 'expired'
        and reservation.released_at = v_now
    );

  select count(*)::integer
  into v_running
  from public.paid_workflow_reservations
  where workspace_id = p_workspace_id and status = 'running';

  if coalesce(p_max_concurrent, 0) > 0 and v_running >= p_max_concurrent then
    raise exception using
      message = 'paid_workflow_concurrency_exceeded',
      detail = jsonb_build_object(
        'running', v_running,
        'limit', p_max_concurrent,
        'retry_after_seconds', least(v_stale_seconds, 60)
      )::text,
      errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_daily
  from public.paid_workflow_reservations
  where workspace_id = p_workspace_id
    and pg_catalog.timezone(v_timezone, reserved_at)::date = pg_catalog.timezone(v_timezone, v_now)::date;

  if coalesce(p_daily_limit, 0) > 0 and v_daily >= p_daily_limit then
    raise exception using
      message = 'paid_workflow_daily_limit_exceeded',
      detail = jsonb_build_object('used', v_daily, 'limit', p_daily_limit, 'timezone', v_timezone)::text,
      errcode = 'P0001';
  end if;

  insert into public.jobs (
    id, workspace_id, job_type, status, entity_type, entity_id, idempotency_key,
    attempt_count, max_attempts, scheduled_at, started_at, finished_at,
    error_json, payload_json, is_paid, created_at, updated_at
  )
  values (
    v_job_id,
    p_workspace_id,
    v_job_type,
    'running',
    nullif(p_job ->> 'entity_type', ''),
    nullif(p_job ->> 'entity_id', ''),
    nullif(p_job ->> 'idempotency_key', ''),
    greatest(coalesce(nullif(p_job ->> 'attempt_count', '')::integer, 1), 1),
    greatest(coalesce(nullif(p_job ->> 'max_attempts', '')::integer, 1), 1),
    coalesce(nullif(p_job ->> 'scheduled_at', '')::timestamptz, v_now),
    coalesce(nullif(p_job ->> 'started_at', '')::timestamptz, v_now),
    null,
    null,
    p_job || jsonb_build_object('status', 'running', 'is_paid', true, 'reservation_id', p_reservation_id),
    true,
    coalesce(nullif(p_job ->> 'created_at', '')::timestamptz, v_now),
    v_now
  )
  on conflict (id) do update set
    job_type = excluded.job_type,
    status = excluded.status,
    entity_type = excluded.entity_type,
    entity_id = excluded.entity_id,
    idempotency_key = excluded.idempotency_key,
    attempt_count = excluded.attempt_count,
    max_attempts = excluded.max_attempts,
    scheduled_at = excluded.scheduled_at,
    started_at = excluded.started_at,
    finished_at = null,
    error_json = null,
    payload_json = excluded.payload_json,
    is_paid = true,
    updated_at = excluded.updated_at
  where public.jobs.workspace_id = excluded.workspace_id;

  insert into public.paid_workflow_reservations (
    id, workspace_id, job_id, job_type, status, reserved_at, expires_at, payload_json
  )
  values (
    p_reservation_id,
    p_workspace_id,
    v_job_id,
    v_job_type,
    'running',
    v_now,
    v_now + make_interval(secs => v_stale_seconds),
    jsonb_build_object('attempt_count', coalesce(nullif(p_job ->> 'attempt_count', '')::integer, 1))
  );

  return jsonb_build_object(
    'job', p_job || jsonb_build_object('status', 'running', 'is_paid', true, 'reservation_id', p_reservation_id),
    'budget', jsonb_build_object(
      'running', v_running + 1,
      'max_concurrent', p_max_concurrent,
      'used_today', v_daily + 1,
      'daily_limit', p_daily_limit,
      'timezone', v_timezone
    )
  );
end;
$$;

create or replace function public.finish_paid_workflow(
  p_workspace_id uuid,
  p_job jsonb,
  p_reservation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job_id text := nullif(p_job ->> 'id', '');
  v_status text := coalesce(nullif(p_job ->> 'status', ''), 'failed');
  v_now timestamptz := now();
begin
  if v_job_id is null then
    raise exception using message = 'paid_workflow_job_invalid', errcode = '22023';
  end if;
  if v_status not in ('succeeded', 'failed', 'cancelled') then
    raise exception using message = 'paid_workflow_terminal_status_invalid', errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_workspace_id::text));

  update public.jobs
  set
    status = v_status,
    finished_at = coalesce(nullif(p_job ->> 'finished_at', '')::timestamptz, v_now),
    error_json = case
      when p_job -> 'error' is null or jsonb_typeof(p_job -> 'error') = 'null' then null
      else p_job -> 'error'
    end,
    payload_json = p_job,
    updated_at = v_now
  where workspace_id = p_workspace_id and id = v_job_id;

  if not found then
    raise exception using message = 'paid workflow job was not found', errcode = 'P0002';
  end if;

  if nullif(p_reservation_id, '') is not null then
    update public.paid_workflow_reservations
    set status = v_status, released_at = v_now
    where workspace_id = p_workspace_id
      and id = p_reservation_id
      and job_id = v_job_id
      and status = 'running';
  end if;

  return p_job;
end;
$$;

create or replace function public.get_paid_workflow_usage(
  p_workspace_id uuid,
  p_budget_timezone text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select jsonb_build_object(
    'running', count(*) filter (where status = 'running' and expires_at > now()),
    'used_today', count(*) filter (
      where pg_catalog.timezone(coalesce(nullif(p_budget_timezone, ''), 'UTC'), reserved_at)::date
        = pg_catalog.timezone(coalesce(nullif(p_budget_timezone, ''), 'UTC'), now())::date
    ),
    'by_job_type', coalesce((
      select jsonb_object_agg(grouped.job_type, grouped.usage_count)
      from (
        select job_type, count(*)::integer as usage_count
        from public.paid_workflow_reservations
        where workspace_id = p_workspace_id
          and pg_catalog.timezone(coalesce(nullif(p_budget_timezone, ''), 'UTC'), reserved_at)::date
            = pg_catalog.timezone(coalesce(nullif(p_budget_timezone, ''), 'UTC'), now())::date
        group by job_type
      ) as grouped
    ), '{}'::jsonb)
  )
  from public.paid_workflow_reservations
  where workspace_id = p_workspace_id;
$$;

revoke all on function public.reserve_paid_workflow(uuid, jsonb, text, integer, integer, text, integer)
  from public, anon, authenticated;
revoke all on function public.finish_paid_workflow(uuid, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.get_paid_workflow_usage(uuid, text)
  from public, anon, authenticated;
grant execute on function public.reserve_paid_workflow(uuid, jsonb, text, integer, integer, text, integer)
  to service_role;
grant execute on function public.finish_paid_workflow(uuid, jsonb, text)
  to service_role;
grant execute on function public.get_paid_workflow_usage(uuid, text)
  to service_role;

insert into public.schema_migrations(version, description)
values ('202607230001', 'Add atomic paid workflow concurrency and daily usage guard')
on conflict (version) do nothing;

commit;
