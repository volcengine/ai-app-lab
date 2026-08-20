begin;

create or replace function public.reconcile_terminal_job_provider_runs()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_finished_at timestamptz := coalesce(new.finished_at, now());
  v_status text;
  v_error jsonb;
begin
  if new.status not in ('failed', 'cancelled') then
    return new;
  end if;

  v_status := case when new.status = 'cancelled' then 'cancelled' else 'failed' end;
  v_error := case
    when v_status = 'cancelled' then null
    else jsonb_build_object(
      'code', coalesce(nullif(new.error_json ->> 'code', ''), 'job_terminated'),
      'message', '任务执行已终止，未继续等待上游返回。',
      'category', 'workflow',
      'retryable', lower(coalesce(new.error_json ->> 'retryable', 'false')) in ('1', 'true', 'yes', 'on')
    )
  end;

  update public.provider_run_steps as s
  set
    status = v_status,
    output_summary = case
      when v_status = 'cancelled' then '任务已取消，未继续等待上游返回。'
      else '任务执行已终止，未继续等待上游返回。'
    end,
    finished_at = v_finished_at,
    latency_ms = least(
      2147483647,
      greatest(0, floor(extract(epoch from (v_finished_at - s.started_at)) * 1000))
    )::integer,
    error_json = v_error,
    updated_at = v_finished_at
  where s.workspace_id = new.workspace_id
    and s.status = 'running'
    and exists (
      select 1
      from public.provider_runs as r
      where r.workspace_id = s.workspace_id
        and r.id = s.provider_run_id
        and r.job_id = new.id
        and r.status = 'running'
    );

  update public.provider_runs as r
  set
    status = v_status,
    finished_at = v_finished_at,
    duration_ms = least(
      2147483647,
      greatest(0, floor(extract(epoch from (v_finished_at - r.started_at)) * 1000))
    )::integer,
    error_json = v_error,
    payload_json = r.payload_json || jsonb_build_object(
      'status', v_status,
      'finished_at', v_finished_at,
      'duration_ms', least(
        2147483647,
        greatest(0, floor(extract(epoch from (v_finished_at - r.started_at)) * 1000))
      )::integer,
      'error', v_error
    ),
    updated_at = v_finished_at
  where r.workspace_id = new.workspace_id
    and r.job_id = new.id
    and r.status = 'running';

  return new;
end;
$$;

revoke all on function public.reconcile_terminal_job_provider_runs() from public, anon, authenticated;
grant execute on function public.reconcile_terminal_job_provider_runs() to service_role;

drop trigger if exists reconcile_terminal_job_provider_runs_after_update on public.jobs;
create trigger reconcile_terminal_job_provider_runs_after_update
after update of status, error_json on public.jobs
for each row
execute function public.reconcile_terminal_job_provider_runs();

-- Reconcile runs that were orphaned before this trigger was installed.
update public.jobs as j
set status = j.status
where j.status in ('failed', 'cancelled')
  and exists (
    select 1
    from public.provider_runs as r
    where r.workspace_id = j.workspace_id
      and r.job_id = j.id
      and r.status = 'running'
  );

insert into public.schema_migrations(version, description)
values ('202607290001', 'Reconcile running provider traces when their worker job terminates')
on conflict (version) do nothing;

commit;
