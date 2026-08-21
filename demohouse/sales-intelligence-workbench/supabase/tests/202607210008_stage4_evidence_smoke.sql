begin;

do $$
declare
  v_workspace_id uuid;
  v_company_id text := '__stage4_smoke_company__';
  v_job_id text := '__stage4_smoke_job__';
  v_run_id text := '__stage4_smoke_run__';
  v_step_id text := '__stage4_smoke_step__';
  v_dossier_v1_id text := '__stage4_smoke_dossier_v1__';
  v_dossier_v2_id text := '__stage4_smoke_dossier_v2__';
  v_text text;
  v_integer integer;
begin
  select id
  into v_workspace_id
  from public.app_workspaces
  order by created_at asc
  limit 1;

  if v_workspace_id is null then
    raise exception 'stage4 smoke requires one application workspace';
  end if;

  insert into public.sales_companies (
    id, workspace_id, name, initial, industry, location, tags, payload_json
  )
  values (
    v_company_id,
    v_workspace_id,
    '__Stage4 Smoke Company__',
    'S',
    'smoke-test',
    'test-only',
    '["stage4-smoke"]'::jsonb,
    '{"test_only":true}'::jsonb
  );

  insert into public.jobs (
    id, workspace_id, job_type, status, entity_type, entity_id,
    idempotency_key, attempt_count, max_attempts, scheduled_at,
    started_at, finished_at, payload_json
  )
  values (
    v_job_id,
    v_workspace_id,
    'stage4_smoke',
    'succeeded',
    'company',
    v_company_id,
    v_job_id,
    1,
    1,
    now(),
    now() - interval '1 second',
    now(),
    '{"test_only":true}'::jsonb
  );

  perform public.persist_provider_run(
    v_workspace_id,
    jsonb_build_object(
      'id', v_run_id,
      'job_id', v_job_id,
      'operation', 'stage4_smoke',
      'status', 'succeeded',
      'app_mode', 'development',
      'entity_type', 'company',
      'entity_id', v_company_id,
      'started_at', now() - interval '1 second',
      'finished_at', now(),
      'duration_ms', 1000,
      'steps', jsonb_build_array(
        jsonb_build_object(
          'id', v_step_id,
          'sequence', 1,
          'provider', 'ark',
          'operation', 'structured_generation',
          'status', 'succeeded',
          'input_summary', 'stage4 smoke input',
          'output_summary', 'stage4 smoke output',
          'request_id', 'stage4-smoke-request',
          'usage', jsonb_build_object(
            'prompt_tokens', 10,
            'completion_tokens', 5,
            'total_tokens', 15
          ),
          'attempts', 1,
          'started_at', now() - interval '500 milliseconds',
          'finished_at', now(),
          'latency_ms', 500
        )
      )
    )
  );

  select job_id
  into v_text
  from public.provider_runs
  where workspace_id = v_workspace_id and id = v_run_id;

  if v_text is distinct from v_job_id then
    raise exception 'provider run job binding mismatch: %', v_text;
  end if;

  select (usage_json ->> 'total_tokens')::integer
  into v_integer
  from public.provider_run_steps
  where workspace_id = v_workspace_id and id = v_step_id;

  if v_integer is distinct from 15 then
    raise exception 'provider run token usage mismatch: %', v_integer;
  end if;

  perform public.persist_sales_dossier(
    v_workspace_id,
    jsonb_build_object(
      'id', v_dossier_v1_id,
      'company_id', v_company_id,
      'title', 'Stage 4 smoke dossier v1',
      'summary', 'Initial evidence-backed dossier.',
      'memory_summary', 'Initial memory summary.',
      'status', 'completed',
      'provider_run_id', v_run_id,
      'version_no', 1,
      'evidence_hash', 'stage4-smoke-evidence-v1',
      'dossier_fingerprint', 'stage4-smoke-fingerprint-v1',
      'change_status', 'initial',
      'data_as_of', now() - interval '1 day',
      'generated_at', now(),
      'evidence_pack', jsonb_build_array(
        jsonb_build_object(
          'id', 'evidence-professional-1',
          'source_kind', 'professional_dataset',
          'label', 'Stage 4 smoke professional evidence',
          'summary', 'Version one evidence.'
        )
      ),
      'citations', jsonb_build_array(
        jsonb_build_object(
          'id', 'evidence-professional-1',
          'source_kind', 'professional_dataset',
          'label', 'Stage 4 smoke professional evidence',
          'url', 'https://example.invalid/stage4-smoke/v1'
        )
      )
    )
  );

  perform public.persist_sales_dossier(
    v_workspace_id,
    jsonb_build_object(
      'id', v_dossier_v2_id,
      'company_id', v_company_id,
      'title', 'Stage 4 smoke dossier v2',
      'summary', 'Changed evidence-backed dossier.',
      'memory_summary', 'Changed memory summary.',
      'status', 'completed',
      'provider_run_id', v_run_id,
      'version_no', 2,
      'previous_dossier_id', v_dossier_v1_id,
      'evidence_hash', 'stage4-smoke-evidence-v2',
      'dossier_fingerprint', 'stage4-smoke-fingerprint-v2',
      'change_status', 'changed',
      'data_as_of', now(),
      'generated_at', now(),
      'evidence_pack', jsonb_build_array(
        jsonb_build_object(
          'id', 'evidence-professional-2',
          'source_kind', 'professional_dataset',
          'label', 'Stage 4 smoke changed evidence',
          'summary', 'Version two evidence.'
        )
      ),
      'citations', jsonb_build_array(
        jsonb_build_object(
          'id', 'evidence-professional-2',
          'source_kind', 'professional_dataset',
          'label', 'Stage 4 smoke changed evidence',
          'url', 'https://example.invalid/stage4-smoke/v2'
        )
      )
    )
  );

  select previous_dossier_id
  into v_text
  from public.sales_dossier_records
  where workspace_id = v_workspace_id
    and id = v_dossier_v2_id
    and version_no = 2
    and change_status = 'changed'
    and evidence_hash = 'stage4-smoke-evidence-v2'
    and jsonb_array_length(evidence_pack_json) = 1;

  if v_text is distinct from v_dossier_v1_id then
    raise exception 'dossier version chain mismatch: %', v_text;
  end if;

  select count(*)::integer
  into v_integer
  from public.sales_dossier_citations
  where workspace_id = v_workspace_id
    and dossier_id in (v_dossier_v1_id, v_dossier_v2_id);

  if v_integer is distinct from 2 then
    raise exception 'dossier citation count mismatch: %', v_integer;
  end if;
end;
$$;

select 'stage4_evidence_smoke_passed' as result;

rollback;
