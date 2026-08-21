begin;

create or replace function public.persist_sales_dossier(
  p_workspace_id uuid,
  p_dossier jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_dossier_id text := nullif(p_dossier ->> 'id', '');
  v_company_id text := nullif(p_dossier ->> 'company_id', '');
  citation jsonb;
  citation_id text;
begin
  if v_dossier_id is null or v_company_id is null then
    raise exception using message = 'dossier id and company_id are required', errcode = '22023';
  end if;

  if not exists (
    select 1 from public.app_workspaces where id = p_workspace_id
  ) then
    raise exception using message = 'application workspace was not found', errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.sales_companies
    where workspace_id = p_workspace_id and id = v_company_id and deleted_at is null
  ) then
    raise exception using message = 'company was not found in application workspace', errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.sales_dossier_records
    where id = v_dossier_id and workspace_id <> p_workspace_id
  ) then
    raise exception using message = 'cross-workspace dossier identifier conflict', errcode = '23505';
  end if;

  insert into public.sales_dossier_records (
    id,
    workspace_id,
    company_id,
    title,
    summary,
    memory_summary,
    provider_run_id,
    created_at,
    payload_json
  )
  values (
    v_dossier_id,
    p_workspace_id,
    v_company_id,
    p_dossier ->> 'title',
    p_dossier ->> 'summary',
    p_dossier ->> 'memory_summary',
    nullif(p_dossier ->> 'provider_run_id', ''),
    coalesce(nullif(p_dossier ->> 'created_at', '')::timestamptz, now()),
    p_dossier
  )
  on conflict (id) do update set
    title = excluded.title,
    summary = excluded.summary,
    memory_summary = excluded.memory_summary,
    provider_run_id = excluded.provider_run_id,
    deleted_at = null,
    payload_json = excluded.payload_json
  where public.sales_dossier_records.workspace_id = excluded.workspace_id;

  delete from public.sales_dossier_citations
  where workspace_id = p_workspace_id and dossier_id = v_dossier_id;

  for citation in
    select value from jsonb_array_elements(coalesce(p_dossier -> 'citations', '[]'::jsonb))
  loop
    citation_id := v_dossier_id || ':' || coalesce(nullif(citation ->> 'id', ''), 'citation');
    if exists (
      select 1 from public.sales_dossier_citations
      where id = citation_id and workspace_id <> p_workspace_id
    ) then
      raise exception using message = 'cross-workspace citation identifier conflict', errcode = '23505';
    end if;

    insert into public.sales_dossier_citations (
      id,
      workspace_id,
      v_dossier_id,
      citation_no,
      label,
      source_kind,
      url,
      created_at,
      payload_json
    )
    values (
      citation_id,
      p_workspace_id,
      dossier_id,
      coalesce(nullif(citation ->> 'id', ''), 'citation'),
      citation ->> 'label',
      citation ->> 'source_kind',
      coalesce(citation ->> 'url', ''),
      now(),
      citation
    );
  end loop;

  return jsonb_build_object(
    'id', v_dossier_id,
    'workspace_id', p_workspace_id,
    'citation_count', jsonb_array_length(coalesce(p_dossier -> 'citations', '[]'::jsonb))
  );
end;
$$;

create or replace function public.persist_provider_run(
  p_workspace_id uuid,
  p_run jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_run_id text := nullif(p_run ->> 'id', '');
  step jsonb;
  step_id text;
begin
  if v_run_id is null then
    raise exception using message = 'provider run id is required', errcode = '22023';
  end if;

  if not exists (
    select 1 from public.app_workspaces where id = p_workspace_id
  ) then
    raise exception using message = 'application workspace was not found', errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.provider_runs
    where id = v_run_id and workspace_id <> p_workspace_id
  ) then
    raise exception using message = 'cross-workspace provider run identifier conflict', errcode = '23505';
  end if;

  insert into public.provider_runs (
    id,
    workspace_id,
    operation,
    status,
    app_mode,
    entity_type,
    entity_id,
    started_at,
    finished_at,
    duration_ms,
    result_ref,
    error_json,
    payload_json
  )
  values (
    v_run_id,
    p_workspace_id,
    coalesce(nullif(p_run ->> 'operation', ''), 'provider_workflow'),
    coalesce(nullif(p_run ->> 'status', ''), 'running'),
    coalesce(nullif(p_run ->> 'app_mode', ''), 'development'),
    nullif(p_run ->> 'entity_type', ''),
    nullif(p_run ->> 'entity_id', ''),
    coalesce(nullif(p_run ->> 'started_at', '')::timestamptz, now()),
    nullif(p_run ->> 'finished_at', '')::timestamptz,
    nullif(p_run ->> 'duration_ms', '')::integer,
    nullif(p_run ->> 'result_ref', ''),
    case
      when p_run -> 'error' is null or jsonb_typeof(p_run -> 'error') = 'null' then null
      else p_run -> 'error'
    end,
    p_run
  )
  on conflict (id) do update set
    operation = excluded.operation,
    status = excluded.status,
    app_mode = excluded.app_mode,
    entity_type = excluded.entity_type,
    entity_id = excluded.entity_id,
    started_at = excluded.started_at,
    finished_at = excluded.finished_at,
    duration_ms = excluded.duration_ms,
    result_ref = excluded.result_ref,
    error_json = excluded.error_json,
    payload_json = excluded.payload_json
  where public.provider_runs.workspace_id = excluded.workspace_id;

  delete from public.provider_run_steps
  where workspace_id = p_workspace_id and provider_run_id = v_run_id;

  for step in
    select value from jsonb_array_elements(coalesce(p_run -> 'steps', '[]'::jsonb))
  loop
    step_id := nullif(step ->> 'id', '');
    if step_id is null then
      raise exception using message = 'provider step id is required', errcode = '22023';
    end if;
    if exists (
      select 1 from public.provider_run_steps
      where id = step_id and workspace_id <> p_workspace_id
    ) then
      raise exception using message = 'cross-workspace provider step identifier conflict', errcode = '23505';
    end if;

    insert into public.provider_run_steps (
      id,
      workspace_id,
      provider_run_id,
      sequence,
      provider,
      operation,
      status,
      input_summary,
      output_summary,
      request_id,
      raw_ref,
      usage_json,
      attempts,
      started_at,
      finished_at,
      latency_ms,
      error_json
    )
    values (
      step_id,
      p_workspace_id,
      v_run_id,
      coalesce(nullif(step ->> 'sequence', '')::integer, 1),
      coalesce(nullif(step ->> 'provider', ''), 'unknown'),
      coalesce(nullif(step ->> 'operation', ''), 'provider_call'),
      coalesce(nullif(step ->> 'status', ''), 'running'),
      nullif(step ->> 'input_summary', ''),
      nullif(step ->> 'output_summary', ''),
      nullif(step ->> 'request_id', ''),
      nullif(step ->> 'raw_ref', ''),
      case
        when step -> 'usage' is null or jsonb_typeof(step -> 'usage') = 'null' then null
        else step -> 'usage'
      end,
      coalesce(nullif(step ->> 'attempts', '')::integer, 1),
      coalesce(nullif(step ->> 'started_at', '')::timestamptz, now()),
      nullif(step ->> 'finished_at', '')::timestamptz,
      nullif(step ->> 'latency_ms', '')::integer,
      case
        when step -> 'error' is null or jsonb_typeof(step -> 'error') = 'null' then null
        else step -> 'error'
      end
    );
  end loop;

  return jsonb_build_object(
    'id', v_run_id,
    'workspace_id', p_workspace_id,
    'step_count', jsonb_array_length(coalesce(p_run -> 'steps', '[]'::jsonb))
  );
end;
$$;

revoke all on function public.persist_sales_dossier(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.persist_provider_run(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.persist_sales_dossier(uuid, jsonb) to service_role;
grant execute on function public.persist_provider_run(uuid, jsonb) to service_role;

insert into public.schema_migrations(version, description)
values ('202607210004', 'Stage 2 transactional Data API persistence functions')
on conflict (version) do nothing;

commit;
