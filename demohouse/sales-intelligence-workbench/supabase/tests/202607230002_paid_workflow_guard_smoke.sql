begin;

do $paid_workflow_guard_smoke$
declare
  v_workspace_id uuid;
  v_suffix text := pg_catalog.txid_current()::text;
  v_job_id text := 'smoke_paid_job_' || v_suffix;
  v_reservation_id text := 'smoke_paid_reservation_' || v_suffix;
  v_job jsonb;
  v_reserved jsonb;
  v_finished jsonb;
  v_status text;
begin
  select id into v_workspace_id
  from public.app_workspaces
  order by created_at
  limit 1;

  if v_workspace_id is null then
    raise exception 'paid workflow smoke requires one application workspace';
  end if;

  v_job := jsonb_build_object(
    'id', v_job_id,
    'job_type', 'paid_workflow_guard_smoke',
    'status', 'running',
    'entity_type', 'smoke',
    'entity_id', v_suffix,
    'attempt_count', 1,
    'max_attempts', 1,
    'created_at', now(),
    'started_at', now(),
    'updated_at', now(),
    'is_paid', true
  );

  v_reserved := public.reserve_paid_workflow(
    v_workspace_id,
    v_job,
    v_reservation_id,
    2147483647,
    2147483647,
    'Asia/Shanghai',
    300
  );

  if v_reserved #>> '{job,status}' <> 'running'
    or v_reserved #>> '{job,reservation_id}' <> v_reservation_id
  then
    raise exception 'paid workflow reservation returned an invalid payload';
  end if;

  select status into v_status
  from public.paid_workflow_reservations
  where workspace_id = v_workspace_id and id = v_reservation_id;
  if v_status <> 'running' then
    raise exception 'paid workflow reservation was not persisted as running';
  end if;

  v_job := v_job || jsonb_build_object(
    'status', 'succeeded',
    'reservation_id', v_reservation_id,
    'finished_at', now(),
    'updated_at', now()
  );
  v_finished := public.finish_paid_workflow(v_workspace_id, v_job, v_reservation_id);

  if v_finished ->> 'status' <> 'succeeded' then
    raise exception 'paid workflow finish returned an invalid payload';
  end if;

  select status into v_status
  from public.paid_workflow_reservations
  where workspace_id = v_workspace_id and id = v_reservation_id;
  if v_status <> 'succeeded' then
    raise exception 'paid workflow reservation was not released';
  end if;

  select status into v_status
  from public.jobs
  where workspace_id = v_workspace_id and id = v_job_id;
  if v_status <> 'succeeded' then
    raise exception 'paid workflow job was not completed';
  end if;
end;
$paid_workflow_guard_smoke$;

rollback;
