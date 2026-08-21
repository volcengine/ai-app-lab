begin;

create index if not exists app_workspaces_created_by_idx
  on public.app_workspaces(created_by);
create index if not exists audit_events_actor_user_id_idx
  on public.audit_events(actor_user_id);
create index if not exists jobs_created_by_idx
  on public.jobs(created_by);
create index if not exists provider_connections_created_by_idx
  on public.provider_connections(created_by);
create index if not exists provider_connections_updated_by_idx
  on public.provider_connections(updated_by);
create index if not exists provider_runs_workspace_job_idx
  on public.provider_runs(workspace_id, job_id);

create index if not exists sales_companies_created_by_idx
  on public.sales_companies(created_by);
create index if not exists sales_companies_updated_by_idx
  on public.sales_companies(updated_by);
create index if not exists sales_company_search_results_created_by_idx
  on public.sales_company_search_results(created_by);
create index if not exists sales_company_search_results_workspace_company_idx
  on public.sales_company_search_results(workspace_id, company_id);
create index if not exists sales_dossier_records_created_by_idx
  on public.sales_dossier_records(created_by);
create index if not exists sales_dossier_records_provider_run_id_idx
  on public.sales_dossier_records(provider_run_id);
create index if not exists sales_dossier_records_updated_by_idx
  on public.sales_dossier_records(updated_by);
create index if not exists sales_goals_created_by_idx
  on public.sales_goals(created_by);
create index if not exists sales_goals_updated_by_idx
  on public.sales_goals(updated_by);
create index if not exists sales_materials_created_by_idx
  on public.sales_materials(created_by);
create index if not exists sales_materials_updated_by_idx
  on public.sales_materials(updated_by);
create index if not exists sales_openviking_refs_created_by_idx
  on public.sales_openviking_refs(created_by);
create index if not exists sales_progress_snapshots_created_by_idx
  on public.sales_progress_snapshots(created_by);
create index if not exists sales_qa_messages_created_by_idx
  on public.sales_qa_messages(created_by);
create index if not exists sales_qa_messages_provider_run_id_idx
  on public.sales_qa_messages(provider_run_id);
create index if not exists sales_target_enterprises_created_by_idx
  on public.sales_target_enterprises(created_by);
create index if not exists sales_target_enterprises_updated_by_idx
  on public.sales_target_enterprises(updated_by);
create index if not exists sales_target_enterprises_workspace_company_idx
  on public.sales_target_enterprises(workspace_id, company_id);
create index if not exists sync_sources_created_by_idx
  on public.sync_sources(created_by);
create index if not exists sync_sources_updated_by_idx
  on public.sync_sources(updated_by);

insert into public.schema_migrations(version, description)
values ('202607210006', 'Add covering indexes for public schema foreign keys')
on conflict (version) do nothing;

commit;
