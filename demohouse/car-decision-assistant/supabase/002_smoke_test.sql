-- 可重复执行的云端事务烟测：验证完整项目创建、更新、关联数据和版本冲突。
-- 整个测试最终 rollback，不会在工作区留下数据。

begin;

create temporary table smoke_record (payload jsonb) on commit drop;

insert into smoke_record(payload)
values (
  jsonb_build_object(
    'project', jsonb_build_object(
      'id', 'smoke-project',
      'owner_user_id', null,
      'title', 'Supabase smoke create',
      'status', 'pending',
      'city', '杭州市',
      'primary_candidate_id', 'smoke-candidate',
      'summary_json', '{}'::jsonb,
      'edit_token_digest', 'smoke-edit-digest',
      'recovery_code_digest', 'smoke-recovery-digest',
      'version', 1,
      'expires_at', '2026-08-27T00:00:00Z',
      'created_at', '2026-07-27T00:00:00Z',
      'updated_at', '2026-07-27T00:00:00Z'
    ),
    'candidate_trims', jsonb_build_array(
      jsonb_build_object(
        'id', 'smoke-candidate',
        'project_id', 'smoke-project',
        'position', 0,
        'role', 'target',
        'entity_id', 'datapro:smoke',
        'brand', '测试品牌',
        'series', '测试车系',
        'model_year', '2026款',
        'trim_name', '测试配置',
        'display_name', '测试车系 2026款 测试配置',
        'status', 'active',
        'data_json', '{}'::jsonb,
        'created_at', '2026-07-27T00:00:00Z',
        'updated_at', '2026-07-27T00:00:00Z'
      )
    ),
    'decision_conditions', '[]'::jsonb,
    'condition_evaluations', '[]'::jsonb,
    'evidence', jsonb_build_array(
      jsonb_build_object(
        'id', 'smoke-evidence',
        'project_id', 'smoke-project',
        'candidate_trim_id', 'smoke-candidate',
        'condition_id', null,
        'evaluation_id', null,
        'evidence_type', 'city_vehicle_series_query',
        'source_type', 'datapro',
        'source_name', '中国汽车品牌销量数据',
        'title', '城市车系数据',
        'summary', '事务烟测',
        'source_url', null,
        'trace_id', 'smoke-trace',
        'log_id', null,
        'validity', 'current',
        'captured_at', '2026-07-27T00:00:00Z',
        'expires_at', null,
        'payload_json', '{}'::jsonb,
        'created_at', '2026-07-27T00:00:00Z',
        'updated_at', '2026-07-27T00:00:00Z'
      )
    ),
    'user_checks', '[]'::jsonb,
    'sales_quotes', '[]'::jsonb,
    'sales_claims', '[]'::jsonb,
    'city_vehicle_series', jsonb_build_array(
      jsonb_build_object(
        'id', 'smoke-series',
        'project_id', 'smoke-project',
        'candidate_trim_id', 'smoke-candidate',
        'city', '杭州市',
        'series_name', '测试车系',
        'data_level', 'city',
        'dataset_type', 'vehicle_sales',
        'period_label', '2026年1月',
        'period_start', '2026-01-01',
        'period_end', '2026-01-01',
        'metric_key', '销量',
        'metric_label', '销量',
        'metric_definition', '月度销量',
        'unit', '辆',
        'status', 'current',
        'evidence_id', 'smoke-evidence',
        'request_id', 'smoke-request',
        'trace_id', 'smoke-trace',
        'captured_at', '2026-07-27T00:00:00Z',
        'extra_json', '{}'::jsonb,
        'created_at', '2026-07-27T00:00:00Z',
        'updated_at', '2026-07-27T00:00:00Z'
      )
    ),
    'city_vehicle_series_points', jsonb_build_array(
      jsonb_build_object(
        'id', 'smoke-point',
        'series_id', 'smoke-series',
        'month', '2026-01-01',
        'month_label', '1月',
        'value', 162,
        'extra_json', '{}'::jsonb,
        'created_at', '2026-07-27T00:00:00Z'
      )
    )
  )
);

select public.save_decision_project(
  payload,
  'create',
  null,
  null
)
from smoke_record;

update smoke_record
set payload = jsonb_set(
  jsonb_set(payload, '{project,version}', '2'::jsonb),
  '{project,title}',
  to_jsonb('Supabase smoke update'::text)
);

select public.save_decision_project(
  payload,
  'update',
  'smoke-edit-digest',
  1
)
from smoke_record;

do $$
declare
  v_project_count integer;
  v_candidate_count integer;
  v_evidence_count integer;
  v_series_count integer;
  v_point_count integer;
  v_version integer;
  v_title text;
begin
  select count(*), max(version), max(title)
  into v_project_count, v_version, v_title
  from public.decision_projects
  where id = 'smoke-project';

  select count(*) into v_candidate_count
  from public.candidate_trims
  where project_id = 'smoke-project';

  select count(*) into v_evidence_count
  from public.evidence
  where project_id = 'smoke-project';

  select count(*) into v_series_count
  from public.city_vehicle_series
  where project_id = 'smoke-project';

  select count(*) into v_point_count
  from public.city_vehicle_series_points
  where series_id = 'smoke-series';

  if v_project_count <> 1
    or v_candidate_count <> 1
    or v_evidence_count <> 1
    or v_series_count <> 1
    or v_point_count <> 1
    or v_version <> 2
    or v_title <> 'Supabase smoke update'
  then
    raise exception 'SUPABASE_SMOKE_ASSERTION_FAILED';
  end if;
end;
$$;

do $$
declare
  v_payload jsonb;
begin
  select jsonb_set(payload, '{project,version}', '3'::jsonb)
  into v_payload
  from smoke_record;

  begin
    perform public.save_decision_project(
      v_payload,
      'update',
      'smoke-edit-digest',
      1
    );
    raise exception 'STALE_VERSION_WAS_ACCEPTED';
  exception
    when serialization_failure then
      null;
  end;
end;
$$;

rollback;

select 'smoke_ok' as status;
