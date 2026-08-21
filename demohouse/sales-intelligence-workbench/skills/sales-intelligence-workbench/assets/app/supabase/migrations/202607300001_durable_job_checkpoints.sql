begin;

alter table public.jobs
  add column if not exists checkpoint_json jsonb not null default '{}'::jsonb,
  add column if not exists progress_detail_json jsonb not null default '{}'::jsonb;

alter table public.jobs
  drop constraint if exists jobs_checkpoint_json_object_check;
alter table public.jobs
  add constraint jobs_checkpoint_json_object_check
  check (jsonb_typeof(checkpoint_json) = 'object');

alter table public.jobs
  drop constraint if exists jobs_progress_detail_json_object_check;
alter table public.jobs
  add constraint jobs_progress_detail_json_object_check
  check (jsonb_typeof(progress_detail_json) = 'object');

update public.jobs
set
  checkpoint_json = case
    when jsonb_typeof(payload_json -> 'checkpoint') = 'object'
      then payload_json -> 'checkpoint'
    else checkpoint_json
  end,
  progress_detail_json = case
    when jsonb_typeof(payload_json -> 'progress_detail') = 'object'
      then payload_json -> 'progress_detail'
    else progress_detail_json
  end
where payload_json ? 'checkpoint' or payload_json ? 'progress_detail';

create or replace function public.checkpoint_sales_job(
  p_workspace_id uuid,
  p_job_id text,
  p_worker_id text,
  p_stage text,
  p_progress integer,
  p_progress_detail jsonb,
  p_checkpoint_patch jsonb,
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
  v_detail jsonb := coalesce(p_progress_detail, '{}'::jsonb);
  v_patch jsonb := coalesce(p_checkpoint_patch, '{}'::jsonb);
  v_lease_seconds integer := greatest(coalesce(p_lease_seconds, 600), 60);
begin
  if jsonb_typeof(v_detail) <> 'object' or jsonb_typeof(v_patch) <> 'object' then
    raise exception using message = 'sales_job_checkpoint_invalid', errcode = '22023';
  end if;
  if pg_catalog.octet_length(v_patch::text) > 524288 then
    raise exception using message = 'sales_job_checkpoint_too_large', errcode = '22023';
  end if;

  update public.jobs as j
  set
    stage = case when j.cancel_requested_at is not null then 'cancelling' else v_stage end,
    progress = case when j.cancel_requested_at is not null then j.progress else v_progress end,
    progress_detail_json = case
      when j.cancel_requested_at is not null
        then jsonb_build_object('message', '正在安全取消任务')
      else v_detail
    end,
    checkpoint_json = j.checkpoint_json || v_patch,
    heartbeat_at = v_now,
    lease_expires_at = v_now + make_interval(secs => v_lease_seconds),
    payload_json = j.payload_json || jsonb_build_object(
      'stage', case when j.cancel_requested_at is not null then 'cancelling' else v_stage end,
      'progress', case when j.cancel_requested_at is not null then j.progress else v_progress end,
      'progress_detail', case
        when j.cancel_requested_at is not null
          then jsonb_build_object('message', '正在安全取消任务')
        else v_detail
      end,
      'checkpoint', j.checkpoint_json || v_patch,
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
  v_next_retry_at timestamptz;
  v_should_retry boolean := false;
begin
  select * into v_job
  from public.jobs
  where workspace_id = p_workspace_id
    and id = p_job_id
    and status = 'running'
    and worker_id = p_worker_id
  for update;

  if not found then
    select * into v_job
    from public.jobs
    where workspace_id = p_workspace_id and id = p_job_id;
    return case when found then to_jsonb(v_job) else null end;
  end if;

  v_should_retry := coalesce(p_retry, false)
    and v_job.attempt_count < v_job.max_attempts;
  v_next_retry_at := v_now
    + make_interval(secs => greatest(coalesce(p_delay_seconds, 0), 0));

  update public.jobs as j
  set
    status = case when v_should_retry then 'queued' else 'failed' end,
    stage = case when v_should_retry then 'retry_wait' else 'failed' end,
    progress = j.progress,
    progress_detail_json = case
      when v_should_retry then jsonb_build_object(
        'message', '上游服务暂时不可用，正在自动重试',
        'next_retry_at', v_next_retry_at
      )
      else '{}'::jsonb
    end,
    scheduled_at = case when v_should_retry then v_next_retry_at else j.scheduled_at end,
    started_at = case when v_should_retry then null else j.started_at end,
    finished_at = case when v_should_retry then null else v_now end,
    error_json = coalesce(
      p_error,
      jsonb_build_object('code', 'worker_failed', 'message', '后台任务执行失败。')
    ),
    worker_id = null,
    lease_expires_at = null,
    heartbeat_at = v_now,
    payload_json = j.payload_json || jsonb_build_object(
      'status', case when v_should_retry then 'queued' else 'failed' end,
      'stage', case when v_should_retry then 'retry_wait' else 'failed' end,
      'progress', j.progress,
      'progress_detail', case
        when v_should_retry then jsonb_build_object(
          'message', '上游服务暂时不可用，正在自动重试',
          'next_retry_at', v_next_retry_at
        )
        else '{}'::jsonb
      end,
      'scheduled_at', case when v_should_retry then v_next_retry_at else j.scheduled_at end,
      'started_at', case when v_should_retry then null else j.started_at end,
      'finished_at', case when v_should_retry then null else v_now end,
      'error', coalesce(
        p_error,
        jsonb_build_object('code', 'worker_failed', 'message', '后台任务执行失败。')
      ),
      'worker_id', null,
      'lease_expires_at', null
    ),
    updated_at = v_now
  where j.workspace_id = p_workspace_id and j.id = p_job_id
  returning * into v_job;

  update public.paid_workflow_reservations
  set
    status = 'failed',
    released_at = v_now,
    payload_json = payload_json || jsonb_build_object(
      'release_reason',
      case when v_should_retry then 'retryable_worker_failure' else 'worker_failure' end
    )
  where workspace_id = p_workspace_id
    and job_id = p_job_id
    and status = 'running';

  return to_jsonb(v_job);
end;
$$;

revoke all on function public.checkpoint_sales_job(
  uuid, text, text, text, integer, jsonb, jsonb, integer
) from public, anon, authenticated;
grant execute on function public.checkpoint_sales_job(
  uuid, text, text, text, integer, jsonb, jsonb, integer
) to service_role;

insert into public.schema_migrations(version, description)
values ('202607300001', 'Add durable job checkpoints and retryable paid-stage recovery')
on conflict (version) do nothing;

commit;
