begin;

alter table public.jobs
  add column if not exists cancel_requested_at timestamptz;

create or replace function public.heartbeat_sales_job(
  p_workspace_id uuid,
  p_job_id text,
  p_worker_id text,
  p_stage text,
  p_progress integer,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.jobs%rowtype;
  v_now timestamptz := now();
  v_stage text := left(coalesce(nullif(btrim(p_stage), ''), 'running'), 80);
  v_progress integer := greatest(1, least(coalesce(p_progress, 1), 99));
  v_lease_seconds integer := greatest(coalesce(p_lease_seconds, 600), 60);
begin
  update public.jobs as j
  set
    stage = case when j.cancel_requested_at is not null then 'cancelling' else v_stage end,
    progress = case when j.cancel_requested_at is not null then j.progress else v_progress end,
    heartbeat_at = v_now,
    lease_expires_at = v_now + make_interval(secs => v_lease_seconds),
    payload_json = j.payload_json || jsonb_build_object(
      'stage', case when j.cancel_requested_at is not null then 'cancelling' else v_stage end,
      'progress', case when j.cancel_requested_at is not null then j.progress else v_progress end,
      'heartbeat_at', v_now,
      'lease_expires_at', v_now + make_interval(secs => v_lease_seconds)
    ),
    updated_at = v_now
  where j.workspace_id = p_workspace_id
    and j.id = p_job_id
    and j.status = 'running'
    and j.worker_id = p_worker_id
  returning * into v_job;

  if not found then
    raise exception using message = 'sales_job_claim_lost', errcode = 'P0001';
  end if;

  update public.paid_workflow_reservations
  set expires_at = greatest(expires_at, v_now + make_interval(secs => v_lease_seconds))
  where workspace_id = p_workspace_id
    and job_id = p_job_id
    and status = 'running';

  return to_jsonb(v_job);
end;
$$;

create or replace function public.request_cancel_sales_job(
  p_workspace_id uuid,
  p_job_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.jobs%rowtype;
  v_now timestamptz := now();
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_workspace_id::text));

  select * into v_job
  from public.jobs
  where workspace_id = p_workspace_id and id = p_job_id
  for update;

  if not found then
    raise exception using message = 'sales_job_not_found', errcode = 'P0002';
  end if;
  if v_job.status in ('succeeded', 'failed', 'cancelled') then
    return to_jsonb(v_job);
  end if;

  if v_job.status = 'queued' then
    update public.jobs as j
    set
      status = 'cancelled',
      stage = 'cancelled',
      cancel_requested_at = v_now,
      finished_at = v_now,
      error_json = null,
      worker_id = null,
      lease_expires_at = null,
      heartbeat_at = v_now,
      payload_json = j.payload_json || jsonb_build_object(
        'status', 'cancelled',
        'stage', 'cancelled',
        'cancel_requested_at', v_now,
        'finished_at', v_now,
        'error', null,
        'worker_id', null,
        'lease_expires_at', null,
        'heartbeat_at', v_now
      ),
      updated_at = v_now
    where j.workspace_id = p_workspace_id and j.id = p_job_id
    returning * into v_job;
  else
    update public.jobs as j
    set
      stage = 'cancelling',
      cancel_requested_at = coalesce(j.cancel_requested_at, v_now),
      payload_json = j.payload_json || jsonb_build_object(
        'stage', 'cancelling',
        'cancel_requested_at', coalesce(j.cancel_requested_at, v_now)
      ),
      updated_at = v_now
    where j.workspace_id = p_workspace_id and j.id = p_job_id
    returning * into v_job;
  end if;

  return to_jsonb(v_job);
end;
$$;

create or replace function public.acknowledge_cancel_sales_job(
  p_workspace_id uuid,
  p_job_id text,
  p_worker_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.jobs%rowtype;
  v_now timestamptz := now();
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_workspace_id::text));

  select * into v_job
  from public.jobs
  where workspace_id = p_workspace_id and id = p_job_id
  for update;

  if not found then
    raise exception using message = 'sales_job_not_found', errcode = 'P0002';
  end if;
  if v_job.status = 'cancelled' then
    return to_jsonb(v_job);
  end if;
  if v_job.status <> 'running' or v_job.cancel_requested_at is null then
    raise exception using message = 'sales_job_cancel_not_requested', errcode = 'P0001';
  end if;
  if nullif(btrim(p_worker_id), '') is null or v_job.worker_id <> p_worker_id then
    raise exception using message = 'sales_job_claim_lost', errcode = 'P0001';
  end if;

  update public.jobs as j
  set
    status = 'cancelled',
    stage = 'cancelled',
    finished_at = v_now,
    error_json = null,
    worker_id = null,
    lease_expires_at = null,
    heartbeat_at = v_now,
    payload_json = j.payload_json || jsonb_build_object(
      'status', 'cancelled',
      'stage', 'cancelled',
      'finished_at', v_now,
      'error', null,
      'worker_id', null,
      'lease_expires_at', null,
      'heartbeat_at', v_now
    ),
    updated_at = v_now
  where j.workspace_id = p_workspace_id and j.id = p_job_id
  returning * into v_job;

  update public.paid_workflow_reservations
  set status = 'cancelled', released_at = v_now
  where workspace_id = p_workspace_id
    and job_id = p_job_id
    and status = 'running';

  return to_jsonb(v_job);
end;
$$;

create or replace function public.retry_sales_job(
  p_workspace_id uuid,
  p_job_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.jobs%rowtype;
  v_now timestamptz := now();
begin
  select * into v_job
  from public.jobs
  where workspace_id = p_workspace_id and id = p_job_id
  for update;

  if not found then
    raise exception using message = 'sales_job_not_found', errcode = 'P0002';
  end if;
  if v_job.status not in ('failed', 'cancelled') then
    raise exception using message = 'sales_job_not_retryable', errcode = 'P0001';
  end if;
  if v_job.attempt_count >= v_job.max_attempts then
    raise exception using message = 'sales_job_attempts_exhausted', errcode = 'P0001';
  end if;

  update public.jobs as j
  set
    status = 'queued',
    stage = 'queued',
    progress = 0,
    scheduled_at = v_now,
    started_at = null,
    finished_at = null,
    error_json = null,
    worker_id = null,
    lease_expires_at = null,
    heartbeat_at = null,
    cancel_requested_at = null,
    payload_json = j.payload_json || jsonb_build_object(
      'status', 'queued',
      'stage', 'queued',
      'progress', 0,
      'scheduled_at', v_now,
      'started_at', null,
      'finished_at', null,
      'error', null,
      'worker_id', null,
      'lease_expires_at', null,
      'heartbeat_at', null,
      'cancel_requested_at', null,
      'reservation_id', null
    ),
    updated_at = v_now
  where j.workspace_id = p_workspace_id and j.id = p_job_id
  returning * into v_job;

  return to_jsonb(v_job);
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
  v_job public.jobs%rowtype;
begin
  if v_job_id is null then
    raise exception using message = 'paid_workflow_job_invalid', errcode = '22023';
  end if;
  if v_status not in ('succeeded', 'failed', 'cancelled') then
    raise exception using message = 'paid_workflow_terminal_status_invalid', errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_workspace_id::text));

  update public.jobs as j
  set
    status = v_status,
    stage = v_status,
    progress = case when v_status = 'succeeded' then 100 else j.progress end,
    finished_at = coalesce(nullif(p_job ->> 'finished_at', '')::timestamptz, v_now),
    error_json = case
      when p_job -> 'error' is null or jsonb_typeof(p_job -> 'error') = 'null' then null
      else p_job -> 'error'
    end,
    worker_id = null,
    lease_expires_at = null,
    heartbeat_at = v_now,
    cancel_requested_at = case when v_status = 'succeeded' then null else j.cancel_requested_at end,
    payload_json = p_job || jsonb_build_object(
      'status', v_status,
      'stage', v_status,
      'progress', case when v_status = 'succeeded' then 100 else j.progress end,
      'worker_id', null,
      'lease_expires_at', null,
      'heartbeat_at', v_now,
      'cancel_requested_at', case when v_status = 'succeeded' then null else j.cancel_requested_at end
    ),
    updated_at = v_now
  where j.workspace_id = p_workspace_id
    and j.id = v_job_id
    and j.status = 'running'
  returning * into v_job;

  if not found then
    select * into v_job
    from public.jobs
    where workspace_id = p_workspace_id and id = v_job_id;
    if found and v_job.status in ('succeeded', 'failed', 'cancelled') then
      return to_jsonb(v_job);
    end if;
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

  return to_jsonb(v_job);
end;
$$;

revoke all on function public.request_cancel_sales_job(uuid, text) from public, anon, authenticated;
revoke all on function public.acknowledge_cancel_sales_job(uuid, text, text) from public, anon, authenticated;
grant execute on function public.request_cancel_sales_job(uuid, text) to service_role;
grant execute on function public.acknowledge_cancel_sales_job(uuid, text, text) to service_role;

insert into public.schema_migrations(version, description)
values ('202607230003', 'Add safe cancellation checkpoints for asynchronous paid jobs')
on conflict (version) do nothing;

commit;
