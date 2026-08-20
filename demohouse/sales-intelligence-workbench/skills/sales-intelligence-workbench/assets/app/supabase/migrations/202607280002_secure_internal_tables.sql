begin;

alter table public.schema_migrations enable row level security;
revoke all on table public.schema_migrations from public, anon, authenticated;
grant all on table public.schema_migrations to service_role;

insert into public.schema_migrations(version, description)
values ('202607280002', 'Enable RLS and restrict the project migration table to the service role')
on conflict(version) do nothing;

commit;
