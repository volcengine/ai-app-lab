begin;

alter table public.sales_dossier_records
  add column if not exists version_no integer,
  add column if not exists previous_dossier_id text,
  add column if not exists evidence_hash text,
  add column if not exists dossier_fingerprint text,
  add column if not exists change_status text,
  add column if not exists data_as_of timestamptz,
  add column if not exists generated_at timestamptz,
  add column if not exists evidence_pack_json jsonb not null default '[]'::jsonb;

with ranked as (
  select
    id,
    row_number() over (
      partition by workspace_id, company_id
      order by created_at asc, id asc
    )::integer as version_no
  from public.sales_dossier_records
)
update public.sales_dossier_records as dossier
set version_no = ranked.version_no
from ranked
where dossier.id = ranked.id
  and dossier.version_no is null;

update public.sales_dossier_records
set
  evidence_hash = coalesce(evidence_hash, nullif(payload_json ->> 'evidence_hash', '')),
  dossier_fingerprint = coalesce(dossier_fingerprint, nullif(payload_json ->> 'dossier_fingerprint', '')),
  change_status = coalesce(change_status, nullif(payload_json ->> 'change_status', ''), 'initial'),
  data_as_of = coalesce(
    data_as_of,
    case
      when coalesce(payload_json ->> 'data_as_of', '') ~ '^\d{4}-\d{2}-\d{2}'
        then (payload_json ->> 'data_as_of')::timestamptz
      else created_at
    end
  ),
  generated_at = coalesce(
    generated_at,
    case
      when coalesce(payload_json ->> 'generated_at', '') ~ '^\d{4}-\d{2}-\d{2}'
        then (payload_json ->> 'generated_at')::timestamptz
      else created_at
    end
  ),
  evidence_pack_json = case
    when evidence_pack_json = '[]'::jsonb and jsonb_typeof(payload_json -> 'evidence_pack') = 'array'
      then payload_json -> 'evidence_pack'
    else evidence_pack_json
  end;

alter table public.sales_dossier_records
  alter column version_no set default 1,
  alter column version_no set not null,
  alter column change_status set default 'initial',
  alter column change_status set not null,
  alter column generated_at set default now(),
  alter column generated_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sales_dossier_records_change_status_check'
      and conrelid = 'public.sales_dossier_records'::regclass
  ) then
    alter table public.sales_dossier_records
      add constraint sales_dossier_records_change_status_check
      check (change_status in ('initial', 'changed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'sales_dossier_records_previous_fkey'
      and conrelid = 'public.sales_dossier_records'::regclass
  ) then
    alter table public.sales_dossier_records
      add constraint sales_dossier_records_previous_fkey
      foreign key (workspace_id, previous_dossier_id)
      references public.sales_dossier_records(workspace_id, id)
      on delete restrict;
  end if;
end;
$$;

create unique index if not exists sales_dossier_records_company_version_unique
  on public.sales_dossier_records(workspace_id, company_id, version_no)
  where deleted_at is null;

create index if not exists sales_dossier_records_evidence_hash_idx
  on public.sales_dossier_records(workspace_id, company_id, evidence_hash)
  where evidence_hash is not null and deleted_at is null;

create index if not exists sales_dossier_records_previous_idx
  on public.sales_dossier_records(workspace_id, previous_dossier_id)
  where previous_dossier_id is not null;

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

  if not exists (select 1 from public.app_workspaces where id = p_workspace_id) then
    raise exception using message = 'application workspace was not found', errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.sales_companies
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
    id, workspace_id, company_id, title, summary, memory_summary, status,
    provider_run_id, version_no, previous_dossier_id, evidence_hash,
    dossier_fingerprint, change_status, data_as_of, generated_at,
    evidence_pack_json, created_at, updated_at, payload_json
  )
  values (
    v_dossier_id,
    p_workspace_id,
    v_company_id,
    p_dossier ->> 'title',
    p_dossier ->> 'summary',
    p_dossier ->> 'memory_summary',
    coalesce(nullif(p_dossier ->> 'status', ''), 'completed'),
    nullif(p_dossier ->> 'provider_run_id', ''),
    coalesce(nullif(p_dossier ->> 'version_no', '')::integer, 1),
    nullif(p_dossier ->> 'previous_dossier_id', ''),
    nullif(p_dossier ->> 'evidence_hash', ''),
    nullif(p_dossier ->> 'dossier_fingerprint', ''),
    coalesce(nullif(p_dossier ->> 'change_status', ''), 'initial'),
    nullif(p_dossier ->> 'data_as_of', '')::timestamptz,
    coalesce(nullif(p_dossier ->> 'generated_at', '')::timestamptz, now()),
    coalesce(p_dossier -> 'evidence_pack', '[]'::jsonb),
    coalesce(nullif(p_dossier ->> 'created_at', '')::timestamptz, now()),
    coalesce(nullif(p_dossier ->> 'updated_at', '')::timestamptz, now()),
    p_dossier
  )
  on conflict (id) do update set
    title = excluded.title,
    summary = excluded.summary,
    memory_summary = excluded.memory_summary,
    status = excluded.status,
    provider_run_id = excluded.provider_run_id,
    version_no = excluded.version_no,
    previous_dossier_id = excluded.previous_dossier_id,
    evidence_hash = excluded.evidence_hash,
    dossier_fingerprint = excluded.dossier_fingerprint,
    change_status = excluded.change_status,
    data_as_of = excluded.data_as_of,
    generated_at = excluded.generated_at,
    evidence_pack_json = excluded.evidence_pack_json,
    updated_at = excluded.updated_at,
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
      id, workspace_id, dossier_id, citation_no, label, source_kind, url, created_at, payload_json
    )
    values (
      citation_id,
      p_workspace_id,
      v_dossier_id,
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
    'version_no', coalesce(nullif(p_dossier ->> 'version_no', '')::integer, 1),
    'citation_count', jsonb_array_length(coalesce(p_dossier -> 'citations', '[]'::jsonb))
  );
end;
$$;

revoke all on function public.persist_sales_dossier(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.persist_sales_dossier(uuid, jsonb) to service_role;

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
  v_job_id text := nullif(p_run ->> 'job_id', '');
  step jsonb;
  step_id text;
begin
  if v_run_id is null then
    raise exception using message = 'provider run id is required', errcode = '22023';
  end if;

  if not exists (select 1 from public.app_workspaces where id = p_workspace_id) then
    raise exception using message = 'application workspace was not found', errcode = 'P0002';
  end if;

  if v_job_id is not null and not exists (
    select 1 from public.jobs where workspace_id = p_workspace_id and id = v_job_id
  ) then
    raise exception using message = 'provider run job was not found in application workspace', errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.provider_runs
    where id = v_run_id and workspace_id <> p_workspace_id
  ) then
    raise exception using message = 'cross-workspace provider run identifier conflict', errcode = '23505';
  end if;

  insert into public.provider_runs (
    id, workspace_id, job_id, operation, status, app_mode, entity_type, entity_id,
    started_at, finished_at, duration_ms, result_ref, error_json, payload_json
  )
  values (
    v_run_id,
    p_workspace_id,
    v_job_id,
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
    job_id = excluded.job_id,
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
    payload_json = excluded.payload_json,
    updated_at = now()
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
      id, workspace_id, provider_run_id, sequence, provider, operation, status,
      input_summary, output_summary, request_id, raw_ref, usage_json, attempts,
      started_at, finished_at, latency_ms, error_json
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
    'job_id', v_job_id,
    'step_count', jsonb_array_length(coalesce(p_run -> 'steps', '[]'::jsonb))
  );
end;
$$;

revoke all on function public.persist_provider_run(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.persist_provider_run(uuid, jsonb) to service_role;

insert into public.schema_migrations(version, description)
values ('202607210008', 'Add dossier evidence versions and atomic job-linked provider runs')
on conflict (version) do nothing;

commit;
