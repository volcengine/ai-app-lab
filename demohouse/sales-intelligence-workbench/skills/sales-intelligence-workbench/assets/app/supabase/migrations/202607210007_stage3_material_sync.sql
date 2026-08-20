begin;

alter table public.sales_materials
  add column if not exists source_id text,
  add column if not exists source_version text,
  add column if not exists last_synced_at timestamptz;

update public.sales_materials
set
  source_id = coalesce(source_id, nullif(payload_json ->> 'source_id', '')),
  source_version = coalesce(source_version, nullif(payload_json ->> 'source_version', '')),
  last_synced_at = coalesce(
    last_synced_at,
    case
      when coalesce(source_id, nullif(payload_json ->> 'source_id', '')) is not null then updated_at
      else null
    end
  )
where source_id is null
   or source_version is null
   or last_synced_at is null;

create unique index if not exists sales_materials_source_unique
  on public.sales_materials(workspace_id, company_id, source_id)
  where source_id is not null and deleted_at is null;

create index if not exists sales_materials_source_id_idx
  on public.sales_materials(workspace_id, source_id)
  where source_id is not null and deleted_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_materials_workspace_source_fkey'
      and conrelid = 'public.sales_materials'::regclass
  ) then
    alter table public.sales_materials
      add constraint sales_materials_workspace_source_fkey
      foreign key (workspace_id, source_id)
      references public.sync_sources(workspace_id, id)
      on delete restrict;
  end if;
end;
$$;

insert into public.schema_migrations(version, description)
values ('202607210007', 'Add stable sync-source identity and version metadata to sales materials')
on conflict (version) do nothing;

commit;
