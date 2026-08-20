import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { registerHooks } from "node:module";
import {
  resolveSupabaseRuntimeCredentials,
  supabaseCliTarget,
} from "./supabase-runtime.mjs";

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

async function assertAnonCannotReadProject(url, anonKey, projectId) {
  const response = await fetch(
    `${url}/rest/v1/decision_projects?select=id&id=eq.${encodeURIComponent(projectId)}`,
    {
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
      },
    },
  );
  if (!response.ok) return;
  const rows = await response.json();
  assert.deepEqual(rows, [], "anon must not read an anonymous server project");
}

const environmentCredentials =
  process.env.SUPABASE_URL &&
  process.env.SUPABASE_SERVICE_ROLE_KEY
    ? {
        url: process.env.SUPABASE_URL,
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        anonKey: process.env.SUPABASE_ANON_KEY ?? null,
      }
    : null;
const credentials =
  environmentCredentials ?? resolveSupabaseRuntimeCredentials();
const { workspaceId } = supabaseCliTarget();
process.env.PROJECT_STORAGE_BACKEND = "supabase";
process.env.SUPABASE_URL = credentials.url;
process.env.SUPABASE_SERVICE_ROLE_KEY = credentials.serviceRoleKey;

const {
  createDecisionProject,
  deleteDecisionProject,
  readDecisionProject,
  recoverDecisionProject,
  updateDecisionProject,
} = await import("../lib/storage/supabase-decision-project-store.ts");

const suffix = randomUUID();
const projectId = `runtime_smoke_${suffix}`;
const candidateId = `runtime_trim_${suffix}`;
const seriesId = `runtime_series_${suffix}`;
let activeEditToken = null;

try {
  const created = await createDecisionProject({
    id: projectId,
    title: "Supabase 运行链路检查",
    city: "杭州",
    primaryCandidateId: candidateId,
    candidateTrims: [
      {
        id: candidateId,
        role: "target",
        position: 0,
        trimName: "2025款 Max",
        displayName: "理想 L6 2025款 Max",
      },
    ],
    cityVehicleSeries: [
      {
        id: seriesId,
        candidateTrimId: candidateId,
        city: "杭州市",
        seriesName: "理想 L6",
        periodLabel: "2026年1月—2026年2月",
        metricKey: "销量",
        metricLabel: "销量",
        metricDefinition: "数据源返回的车系月度统计口径",
        unit: "辆",
        dataLevel: "地级市",
        datasetType: "vehicle_sales",
        requestId: "runtime-smoke-request",
        traceId: "runtime-smoke-trace",
        status: "current",
      },
    ],
    cityVehicleSeriesPoints: [
      {
        id: `runtime_point_jan_${suffix}`,
        seriesId,
        month: "2026-01",
        monthLabel: "1月",
        value: 162,
      },
      {
        id: `runtime_point_feb_${suffix}`,
        seriesId,
        month: "2026-02",
        monthLabel: "2月",
        value: 130,
      },
    ],
  });
  activeEditToken = created.editToken;

  const read = await readDecisionProject(projectId, activeEditToken);
  assert.equal(read.project.version, 1);
  assert.equal(read.candidateTrims[0]?.displayName, "理想 L6 2025款 Max");
  assert.deepEqual(
    read.cityVehicleSeriesPoints.map((point) => point.value),
    [162, 130],
  );

  const concurrentUpdates = await Promise.allSettled([
    updateDecisionProject(projectId, activeEditToken, {
      title: "Supabase 运行链路检查（并发 A）",
      expectedVersion: 1,
    }),
    updateDecisionProject(projectId, activeEditToken, {
      title: "Supabase 运行链路检查（并发 B）",
      expectedVersion: 1,
    }),
  ]);
  assert.equal(
    concurrentUpdates.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    concurrentUpdates.filter((result) => result.status === "rejected").length,
    1,
  );
  const updated = await readDecisionProject(projectId, activeEditToken);
  assert.equal(updated.project.version, 2);

  const recovered = await recoverDecisionProject(
    projectId,
    created.recoveryCode,
  );
  await assert.rejects(
    () => readDecisionProject(projectId, activeEditToken),
    /edit token is invalid|编辑令牌/i,
  );
  activeEditToken = recovered.editToken;
  assert.equal(
    (await readDecisionProject(projectId, activeEditToken)).project.version,
    3,
  );

  if (credentials.anonKey) {
    await assertAnonCannotReadProject(
      credentials.url,
      credentials.anonKey,
      projectId,
    );
  }
  await deleteDecisionProject(projectId, activeEditToken);
  activeEditToken = null;
  await assert.rejects(
    () => readDecisionProject(projectId, recovered.editToken),
    /not found/i,
  );

  console.log(
    JSON.stringify({
      status: "ok",
      workspace_id: workspaceId,
      checks: [
        "create",
        "read-linked-records",
        "atomic-update",
        "concurrent-version-conflict",
        "recovery-token-rotation",
        ...(credentials.anonKey ? ["anon-isolation"] : []),
        "delete",
      ],
      anon_isolation_checked: Boolean(credentials.anonKey),
      secrets_persisted: false,
    }),
  );
} finally {
  if (activeEditToken) {
    await deleteDecisionProject(projectId, activeEditToken).catch(() => {});
  }
}
