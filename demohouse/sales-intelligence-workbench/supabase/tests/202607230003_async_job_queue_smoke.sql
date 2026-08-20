begin;

do $async_job_queue_smoke$
declare
  v_workspace_id uuid;
  v_suffix text := pg_catalog.txid_current()::text;
  v_job_id text := 'smoke_async_job_' || v_suffix;
  v_reservation_id text := 'smoke_async_reservation_' || v_suffix;
  v_worker_id text := 'smoke-worker-' || v_suffix;
  v_cancel_job_id text := 'smoke_async_cancel_job_' || v_suffix;
  v_cancel_reservation_id text := 'smoke_async_cancel_reservation_' || v_suffix;
  v_job jsonb;
  v_result jsonb;
  v_status text;
begin
  select id into v_workspace_id
  from public.app_workspaces
  order by created_at
  limit 1;

  if v_workspace_id is null then
    raise exception 'async job queue smoke requires one application workspace';
  end if;

  v_job := jsonb_build_object(
    'id', v_job_id,
    'job_type', 'async_job_queue_smoke',
    'status', 'queued',
    'stage', 'queued',
    'progress', 0,
    'entity_type', 'smoke',
    'entity_id', v_suffix,
    'idempotency_key', 'async-job-smoke-' || v_suffix,
    'attempt_count', 0,
    'max_attempts', 3,
    'is_paid', true,
    'created_at', now(),
    'updated_at', now()
  );

  v_result := public.enqueue_sales_job(v_workspace_id, v_job);
  if v_result ->> 'status' <> 'queued' or (v_result ->> 'attempt_count')::integer <> 0 then
    raise exception 'async job was not queued correctly';
  end if;

  v_result := public.claim_sales_job(
    v_workspace_id,
    v_worker_id,
    array['async_job_queue_smoke']::text[],
    120
  );
  if v_result ->> 'status' <> 'running'
    or v_result ->> 'worker_id' <> v_worker_id
    or (v_result ->> 'attempt_count')::integer <> 1
  then
    raise exception 'async job was not claimed correctly';
  end if;

  v_result := public.heartbeat_sales_job(
    v_workspace_id,
    v_job_id,
    v_worker_id,
    'validating_evidence',
    50,
    120
  );
  if v_result ->> 'stage' <> 'validating_evidence' or (v_result ->> 'progress')::integer <> 50 then
    raise exception 'async job heartbeat was not persisted';
  end if;

  v_result := public.release_sales_job_claim(
    v_workspace_id,
    v_job_id,
    v_worker_id,
    jsonb_build_object('code', 'smoke_retry', 'message', 'retry safely before reservation'),
    true,
    0
  );
  if v_result ->> 'status' <> 'queued' or v_result ->> 'worker_id' is not null then
    raise exception 'unreserved async job was not safely requeued';
  end if;

  v_result := public.claim_sales_job(
    v_workspace_id,
    v_worker_id,
    array['async_job_queue_smoke']::text[],
    120
  );
  if (v_result ->> 'attempt_count')::integer <> 2 then
    raise exception 'async job retry attempt was not incremented';
  end if;

  v_result := public.reserve_paid_workflow(
    v_workspace_id,
    v_result,
    v_reservation_id,
    2147483647,
    2147483647,
    'Asia/Shanghai',
    300
  );
  if v_result #>> '{job,reservation_id}' <> v_reservation_id then
    raise exception 'async job paid reservation was not created';
  end if;

  v_job := public.heartbeat_sales_job(
    v_workspace_id,
    v_job_id,
    v_worker_id,
    'persisting_result',
    95,
    120
  );
  v_job := v_job || jsonb_build_object(
    'status', 'succeeded',
    'finished_at', now(),
    'result', jsonb_build_object('status', 'ok')
  );
  v_result := public.finish_paid_workflow(v_workspace_id, v_job, v_reservation_id);
  if v_result ->> 'status' <> 'succeeded'
    or (v_result ->> 'progress')::integer <> 100
    or v_result ->> 'worker_id' is not null
  then
    raise exception 'async job did not finish cleanly';
  end if;

  select status into v_status
  from public.paid_workflow_reservations
  where workspace_id = v_workspace_id and id = v_reservation_id;
  if v_status <> 'succeeded' then
    raise exception 'async job paid reservation was not released';
  end if;

  v_job := jsonb_build_object(
    'id', v_cancel_job_id,
    'job_type', 'async_job_queue_smoke',
    'status', 'queued',
    'stage', 'queued',
    'progress', 0,
    'entity_type', 'smoke',
    'entity_id', v_suffix,
    'idempotency_key', 'async-job-cancel-smoke-' || v_suffix,
    'attempt_count', 0,
    'max_attempts', 3,
    'is_paid', true,
    'created_at', now(),
    'updated_at', now()
  );
  perform public.enqueue_sales_job(v_workspace_id, v_job);
  v_job := public.claim_sales_job(
    v_workspace_id,
    v_worker_id,
    array['async_job_queue_smoke']::text[],
    120
  );
  v_result := public.reserve_paid_workflow(
    v_workspace_id,
    v_job,
    v_cancel_reservation_id,
    2147483647,
    2147483647,
    'Asia/Shanghai',
    300
  );

  v_result := public.request_cancel_sales_job(v_workspace_id, v_cancel_job_id);
  if v_result ->> 'status' <> 'running'
    or v_result ->> 'stage' <> 'cancelling'
    or v_result ->> 'worker_id' <> v_worker_id
  then
    raise exception 'running cancellation released the worker before a safe checkpoint';
  end if;

  select status into v_status
  from public.paid_workflow_reservations
  where workspace_id = v_workspace_id and id = v_cancel_reservation_id;
  if v_status <> 'running' then
    raise exception 'running cancellation released paid capacity too early';
  end if;

  v_result := public.acknowledge_cancel_sales_job(v_workspace_id, v_cancel_job_id, v_worker_id);
  if v_result ->> 'status' <> 'cancelled'
    or v_result ->> 'stage' <> 'cancelled'
    or v_result ->> 'worker_id' is not null
  then
    raise exception 'worker did not acknowledge cancellation cleanly';
  end if;

  select status into v_status
  from public.paid_workflow_reservations
  where workspace_id = v_workspace_id and id = v_cancel_reservation_id;
  if v_status <> 'cancelled' then
    raise exception 'acknowledged cancellation did not release paid capacity';
  end if;
end;
$async_job_queue_smoke$;

rollback;
