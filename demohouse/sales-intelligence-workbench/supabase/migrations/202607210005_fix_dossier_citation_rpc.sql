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
      dossier_id,
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
    'citation_count', jsonb_array_length(coalesce(p_dossier -> 'citations', '[]'::jsonb))
  );
end;
$$;

revoke all on function public.persist_sales_dossier(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.persist_sales_dossier(uuid, jsonb) to service_role;

insert into public.schema_migrations(version, description)
values ('202607210005', 'Fix dossier citation columns in transactional Data API persistence')
on conflict (version) do nothing;

commit;
