begin;

alter table public.jobs
  add column if not exists stage text not null default 'queued',
  add column if not exists progress smallint not null default 0,
  add column if not exists worker_id text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists cancel_requested_at timestamptz;

alter table public.jobs
  drop constraint if exists jobs_progress_check;
alter table public.jobs
  add constraint jobs_progress_check check (progress between 0 and 100);

update public.jobs
set
  stage = case status
    when 'queued' then 'queued'
    when 'running' then 'running'
    when 'succeeded' then 'succeeded'
    when 'failed' then 'failed'
    when 'cancelled' then 'cancelled'
    else stage
  end,
  progress = case when status = 'succeeded' then 100 else progress end
where stage = 'queued' or (status = 'succeeded' and progress <> 100);

create index if not exists jobs_claim_queue_idx
  on public.jobs(workspace_id, scheduled_at, created_at)
  where status = 'queued';

create index if not exists jobs_running_lease_idx
  on public.jobs(workspace_id, lease_expires_at)
  where status = 'running';

create or replace function public.enqueue_sales_job(
  p_workspace_id uuid,
  p_job jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.jobs%rowtype;
  v_job_id text := nullif(p_job ->> 'id', '');
  v_job_type text := nullif(p_job ->> 'job_type', '');
  v_idempotency_key text := nullif(p_job ->> 'idempotency_key', '');
  v_now timestamptz := now();
begin
  if v_job_id is null or v_job_type is null then
    raise exception using message = 'sales_job_invalid', errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_workspace_id::text));

  if v_idempotency_key is not null then
    select * into v_job
    from public.jobs
    where workspace_id = p_workspace_id and idempotency_key = v_idempotency_key
    limit 1;
    if found then
      return to_jsonb(v_job);
    end if;
  end if;

  select * into v_job
  from public.jobs
  where workspace_id = p_workspace_id and id = v_job_id
  limit 1;
  if found then
    return to_jsonb(v_job);
  end if;

  insert into public.jobs (
    id, workspace_id, job_type, status, entity_type, entity_id, idempotency_key,
    attempt_count, max_attempts, scheduled_at, started_at, finished_at,
    error_json, payload_json, is_paid, stage, progress, worker_id,
    lease_expires_at, heartbeat_at, created_by, created_at, updated_at
  )
  values (
    v_job_id,
    p_workspace_id,
    v_job_type,
    'queued',
    nullif(p_job ->> 'entity_type', ''),
    nullif(p_job ->> 'entity_id', ''),
    v_idempotency_key,
    0,
    greatest(coalesce(nullif(p_job ->> 'max_attempts', '')::integer, 3), 1),
    coalesce(nullif(p_job ->> 'scheduled_at', '')::timestamptz, v_now),
    null,
    null,
    null,
    p_job || jsonb_build_object(
      'status', 'queued',
      'stage', 'queued',
      'progress', 0,
      'attempt_count', 0,
      'started_at', null,
      'finished_at', null,
      'error', null
    ),
    coalesce(nullif(p_job ->> 'is_paid', '')::boolean, true),
    'queued',
    0,
    null,
    null,
    null,
    nullif(p_job ->> 'created_by', '')::uuid,
    coalesce(nullif(p_job ->> 'created_at', '')::timestamptz, v_now),
    v_now
  )
  returning * into v_job;

  return to_jsonb(v_job);
end;
$$;

create or replace function public.claim_sales_job(
  p_workspace_id uuid,
  p_worker_id text,
  p_job_types text[],
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
  v_lease_seconds integer := greatest(coalesce(p_lease_seconds, 600), 60);
begin
  if nullif(btrim(p_worker_id), '') is null then
    raise exception using message = 'sales_job_worker_invalid', errcode = '22023';
  end if;

  -- A paid task may already have reached an external provider. Do not silently
  -- replay it after a worker crash; fail it and require an explicit user retry.
  update public.jobs as j
  set
    status = 'failed',
    stage = 'failed',
    finished_at = v_now,
    worker_id = null,
    lease_expires_at = null,
    heartbeat_at = v_now,
    error_json = jsonb_build_object(
      'code', 'worker_lease_expired',
      'message', '后台任务执行中断，请确认后重试。',
      'retryable', true
    ),
    payload_json = j.payload_json || jsonb_build_object(
      'status', 'failed',
      'stage', 'failed',
      'finished_at', v_now,
      'worker_id', null,
      'lease_expires_at', null,
      'error', jsonb_build_object(
        'code', 'worker_lease_expired',
        'message', '后台任务执行中断，请确认后重试。',
        'retryable', true
      )
    ),
    updated_at = v_now
  where j.workspace_id = p_workspace_id
    and j.status = 'running'
    and j.lease_expires_at is not null
    and j.lease_expires_at <= v_now
    and exists (
      select 1
      from public.paid_workflow_reservations as r
      where r.workspace_id = j.workspace_id
        and r.job_id = j.id
        and r.status = 'running'
    );

  update public.paid_workflow_reservations as r
  set status = 'expired', released_at = v_now
  where r.workspace_id = p_workspace_id
    and r.status = 'running'
    and exists (
      select 1
      from public.jobs as j
      where j.workspace_id = r.workspace_id
        and j.id = r.job_id
        and j.status = 'failed'
        and j.error_json ->> 'code' = 'worker_lease_expired'
    );

  -- A worker that died before reserving paid capacity is safe to retry.
  update public.jobs as j
  set
    status = case when j.attempt_count < j.max_attempts then 'queued' else 'failed' end,
    stage = case when j.attempt_count < j.max_attempts then 'queued' else 'failed' end,
    progress = case when j.attempt_count < j.max_attempts then 0 else j.progress end,
    scheduled_at = case when j.attempt_count < j.max_attempts then v_now else j.scheduled_at end,
    finished_at = case when j.attempt_count < j.max_attempts then null else v_now end,
    worker_id = null,
    lease_expires_at = null,
    heartbeat_at = v_now,
    error_json = jsonb_build_object(
      'code', 'worker_lease_expired',
      'message', '后台任务执行中断。',
      'retryable', j.attempt_count < j.max_attempts
    ),
    payload_json = j.payload_json || jsonb_build_object(
      'status', case when j.attempt_count < j.max_attempts then 'queued' else 'failed' end,
      'stage', case when j.attempt_count < j.max_attempts then 'queued' else 'failed' end,
      'progress', case when j.attempt_count < j.max_attempts then 0 else j.progress end,
      'scheduled_at', case when j.attempt_count < j.max_attempts then v_now else j.scheduled_at end,
      'finished_at', case when j.attempt_count < j.max_attempts then null else v_now end,
      'worker_id', null,
      'lease_expires_at', null,
      'error', jsonb_build_object(
        'code', 'worker_lease_expired',
        'message', '后台任务执行中断。',
        'retryable', j.attempt_count < j.max_attempts
      )
    ),
    updated_at = v_now
  where j.workspace_id = p_workspace_id
    and j.status = 'running'
    and j.lease_expires_at is not null
    and j.lease_expires_at <= v_now;

  select * into v_job
  from public.jobs
  where workspace_id = p_workspace_id
    and status = 'queued'
    and coalesce(scheduled_at, created_at) <= v_now
    and attempt_count < max_attempts
    and (coalesce(array_length(p_job_types, 1), 0) = 0 or job_type = any(p_job_types))
  order by coalesce(scheduled_at, created_at), created_at, id
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.jobs as j
  set
    status = 'running',
    stage = 'starting',
    progress = 1,
    attempt_count = j.attempt_count + 1,
    started_at = v_now,
    finished_at = null,
    error_json = null,
    worker_id = left(p_worker_id, 160),
    lease_expires_at = v_now + make_interval(secs => v_lease_seconds),
    heartbeat_at = v_now,
    payload_json = j.payload_json || jsonb_build_object(
      'status', 'running',
      'stage', 'starting',
      'progress', 1,
      'attempt_count', j.attempt_count + 1,
      'started_at', v_now,
      'finished_at', null,
      'error', null,
      'worker_id', left(p_worker_id, 160),
      'lease_expires_at', v_now + make_interval(secs => v_lease_seconds)
    ),
    updated_at = v_now
  where j.workspace_id = p_workspace_id and j.id = v_job.id
  returning * into v_job;

  return to_jsonb(v_job);
end;
$$;

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
    -- Running provider calls cannot be force-aborted safely. Keep the worker
    -- lease and paid reservation until it reaches the next safe checkpoint.
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

create or replace function public.release_sales_job_claim(
  p_workspace_id uuid,
  p_job_id text,
  p_worker_id text,
  p_error jsonb,
  p_retry boolean,
  p_delay_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.jobs%rowtype;
  v_now timestamptz := now();
  v_has_reservation boolean := false;
  v_should_retry boolean := false;
begin
  select exists (
    select 1 from public.paid_workflow_reservations
    where workspace_id = p_workspace_id and job_id = p_job_id and status = 'running'
  ) into v_has_reservation;

  select * into v_job
  from public.jobs
  where workspace_id = p_workspace_id
    and id = p_job_id
    and status = 'running'
    and worker_id = p_worker_id
  for update;

  if not found then
    select * into v_job from public.jobs where workspace_id = p_workspace_id and id = p_job_id;
    return case when found then to_jsonb(v_job) else null end;
  end if;

  v_should_retry := coalesce(p_retry, false)
    and not v_has_reservation
    and v_job.attempt_count < v_job.max_attempts;

  update public.jobs as j
  set
    status = case when v_should_retry then 'queued' else 'failed' end,
    stage = case when v_should_retry then 'queued' else 'failed' end,
    progress = case when v_should_retry then 0 else j.progress end,
    scheduled_at = case
      when v_should_retry then v_now + make_interval(secs => greatest(coalesce(p_delay_seconds, 0), 0))
      else j.scheduled_at
    end,
    started_at = case when v_should_retry then null else j.started_at end,
    finished_at = case when v_should_retry then null else v_now end,
    error_json = coalesce(p_error, jsonb_build_object('code', 'worker_failed', 'message', '后台任务执行失败。')),
    worker_id = null,
    lease_expires_at = null,
    heartbeat_at = v_now,
    payload_json = j.payload_json || jsonb_build_object(
      'status', case when v_should_retry then 'queued' else 'failed' end,
      'stage', case when v_should_retry then 'queued' else 'failed' end,
      'progress', case when v_should_retry then 0 else j.progress end,
      'scheduled_at', case
        when v_should_retry then v_now + make_interval(secs => greatest(coalesce(p_delay_seconds, 0), 0))
        else j.scheduled_at
      end,
      'started_at', case when v_should_retry then null else j.started_at end,
      'finished_at', case when v_should_retry then null else v_now end,
      'error', coalesce(p_error, jsonb_build_object('code', 'worker_failed', 'message', '后台任务执行失败。')),
      'worker_id', null,
      'lease_expires_at', null
    ),
    updated_at = v_now
  where j.workspace_id = p_workspace_id and j.id = p_job_id
  returning * into v_job;

  if v_has_reservation then
    update public.paid_workflow_reservations
    set status = 'failed', released_at = v_now
    where workspace_id = p_workspace_id and job_id = p_job_id and status = 'running';
  end if;

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

revoke all on function public.enqueue_sales_job(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.claim_sales_job(uuid, text, text[], integer) from public, anon, authenticated;
revoke all on function public.heartbeat_sales_job(uuid, text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.release_sales_job_claim(uuid, text, text, jsonb, boolean, integer) from public, anon, authenticated;
revoke all on function public.request_cancel_sales_job(uuid, text) from public, anon, authenticated;
revoke all on function public.acknowledge_cancel_sales_job(uuid, text, text) from public, anon, authenticated;
revoke all on function public.retry_sales_job(uuid, text) from public, anon, authenticated;
grant execute on function public.enqueue_sales_job(uuid, jsonb) to service_role;
grant execute on function public.claim_sales_job(uuid, text, text[], integer) to service_role;
grant execute on function public.heartbeat_sales_job(uuid, text, text, text, integer, integer) to service_role;
grant execute on function public.release_sales_job_claim(uuid, text, text, jsonb, boolean, integer) to service_role;
grant execute on function public.request_cancel_sales_job(uuid, text) to service_role;
grant execute on function public.acknowledge_cancel_sales_job(uuid, text, text) to service_role;
grant execute on function public.retry_sales_job(uuid, text) to service_role;

insert into public.schema_migrations(version, description)
values ('202607230002', 'Add persistent asynchronous sales job queue and worker leases')
on conflict (version) do nothing;

commit;
