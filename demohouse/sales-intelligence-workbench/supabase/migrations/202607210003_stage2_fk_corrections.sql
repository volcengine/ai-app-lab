begin;

alter table public.sales_company_search_results
  drop constraint if exists sales_company_search_results_workspace_id_company_id_fkey;
alter table public.sales_company_search_results
  add constraint sales_company_search_results_workspace_id_company_id_fkey
  foreign key (workspace_id, company_id)
  references public.sales_companies(workspace_id, id)
  on delete cascade;

alter table public.provider_runs
  drop constraint if exists provider_runs_workspace_id_job_id_fkey;
alter table public.provider_runs
  add constraint provider_runs_workspace_id_job_id_fkey
  foreign key (workspace_id, job_id)
  references public.jobs(workspace_id, id)
  on delete cascade;

alter table public.sales_dossier_records
  drop constraint if exists sales_dossier_records_provider_run_id_fkey;
alter table public.sales_dossier_records
  add constraint sales_dossier_records_provider_run_id_fkey
  foreign key (provider_run_id)
  references public.provider_runs(id)
  on delete set null;

alter table public.sales_qa_messages
  drop constraint if exists sales_qa_messages_provider_run_id_fkey;
alter table public.sales_qa_messages
  add constraint sales_qa_messages_provider_run_id_fkey
  foreign key (provider_run_id)
  references public.provider_runs(id)
  on delete set null;

insert into public.schema_migrations(version, description)
values ('202607210003', 'Correct composite delete actions and provider run references')
on conflict (version) do nothing;

commit;
