begin;

do $$
begin
  if to_regclass('public.sales_qa_messages') is not null
    and to_regclass('public.sales_qa_messages_legacy') is null then
    alter table public.sales_qa_messages rename to sales_qa_messages_legacy;
  end if;
end
$$;

do $$
begin
  if to_regclass('public.sales_qa_messages_legacy') is not null then
    revoke all on table public.sales_qa_messages_legacy from public, anon, authenticated;
    grant all on table public.sales_qa_messages_legacy to service_role;
    comment on table public.sales_qa_messages_legacy is
      'Read-only migration archive. Current QA content is stored and restored by OpenViking.';
  end if;
end
$$;

insert into public.schema_migrations(version, description)
values ('202607280001', 'Quarantine legacy QA message rows and make OpenViking the sole QA content store')
on conflict(version) do nothing;

commit;
