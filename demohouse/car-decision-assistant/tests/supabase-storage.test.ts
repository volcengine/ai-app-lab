import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:workers") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export const env = {};",
      };
    }
    return nextResolve(specifier, context);
  },
});

const { buildSupabaseSaveRecord } = await import(
  "../lib/storage/supabase-decision-project-store"
);

test("Supabase payload preserves dynamic city metric metadata and traceability", () => {
  const now = Date.parse("2026-07-27T08:00:00.000Z");
  const record = buildSupabaseSaveRecord(
    {
      id: "project-1",
      title: "购车决策助手",
      city: "杭州",
      primaryCandidateId: "candidate-1",
      candidateTrims: [
        {
          id: "candidate-1",
          trimName: "2025款 Max",
          displayName: "理想 L6 2025款 Max",
        },
      ],
      evidence: [
        {
          id: "evidence-city-1",
          candidateTrimId: "candidate-1",
          title: "杭州车系数据",
          sourceType: "datapro",
          traceId: "trace-city-1",
        },
      ],
      cityVehicleSeries: [
        {
          id: "series-1",
          candidateTrimId: "candidate-1",
          city: "杭州市",
          seriesName: "理想 L6",
          periodLabel: "2026年1月—2026年2月",
          metricKey: "厂家零售量",
          metricLabel: "厂家零售量",
          metricDefinition: "厂家零售/交付",
          traceId: "trace-city-1",
          evidenceId: "evidence-city-1",
        },
      ],
      cityVehicleSeriesPoints: [
        {
          id: "point-1",
          seriesId: "series-1",
          month: "2026-01",
          monthLabel: "1月",
          value: 162,
        },
        {
          id: "point-2",
          seriesId: "series-1",
          month: "2026-02",
          monthLabel: "2月",
          value: 130,
        },
      ],
    },
    {
      projectId: "project-1",
      editTokenDigest: "edit-digest",
      recoveryCodeDigest: "recovery-digest",
      version: 1,
      now,
      expiresAt: now + 1_000,
    },
  );

  assert.equal(record.city_vehicle_series[0]?.metric_key, "厂家零售量");
  assert.equal(
    record.city_vehicle_series[0]?.metric_definition,
    "厂家零售/交付",
  );
  assert.equal(record.city_vehicle_series[0]?.period_start, "2026-01-01");
  assert.equal(record.city_vehicle_series[0]?.period_end, "2026-02-01");
  assert.equal(record.city_vehicle_series[0]?.trace_id, "trace-city-1");
  assert.deepEqual(
    record.city_vehicle_series_points.map((point) => point.month),
    ["2026-01-01", "2026-02-01"],
  );
});

test("Supabase schema protects every business table and the save transaction", async () => {
  const sql = await readFile(
    new URL("../supabase/001_initial_schema.sql", import.meta.url),
    "utf8",
  );
  const tables = [
    "decision_projects",
    "candidate_trims",
    "decision_conditions",
    "condition_evaluations",
    "evidence",
    "user_checks",
    "sales_quotes",
    "sales_claims",
    "city_vehicle_series",
    "city_vehicle_series_points",
  ];
  for (const table of tables) {
    assert.match(
      sql,
      new RegExp(`alter table public\\.${table} enable row level security`),
      `${table} must enable RLS`,
    );
  }
  assert.match(sql, /from anon/);
  assert.match(sql, /create or replace function public\.save_decision_project/);
  assert.match(sql, /security invoker/);
  assert.match(
    sql,
    /revoke all on function public\.save_decision_project[\s\S]+from public, anon, authenticated/,
  );
  assert.match(
    sql,
    /grant execute on function public\.save_decision_project[\s\S]+to service_role/,
  );
});

test("service-role configuration remains server-only", async () => {
  const source = await readFile(
    new URL("../lib/supabase/server.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /process\.env\[name\]/);
  assert.doesNotMatch(source, /process\.env\.(?:NEXT_PUBLIC|VITE)_/);
  assert.doesNotMatch(source, /export\s+const\s+SUPABASE_SERVICE_ROLE_KEY/);
});
