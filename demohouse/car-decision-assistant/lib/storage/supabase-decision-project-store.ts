import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  DECISION_PROJECT_TTL_MS,
  MAX_CANDIDATE_TRIMS,
  DecisionProjectStoreError,
  type CreateDecisionProjectInput,
  type CreatedDecisionProject,
  type DecisionProject,
  type DecisionProjectRecord,
  type RecoveredDecisionProject,
  type UpdateDecisionProjectInput,
  type CandidateTrimRow,
  type CityVehicleSeriesPointRow,
  type CityVehicleSeriesRow,
  type ConditionEvaluationRow,
  type DecisionConditionRow,
  type EvidenceRow,
  type JsonValue,
  type SalesClaimRow,
  type SalesQuoteRow,
  type UserCheckRow,
} from "./types";
import {
  createEditToken,
  createRecoveryCode,
  createStorageId,
  hashRecoveryCode,
  sha256Hex,
} from "./tokens";

type RawRow = Record<string, unknown>;

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function requiredText(value: unknown, name: string): string {
  const text = optionalText(value);
  if (!text) {
    throw new DecisionProjectStoreError("INVALID_INPUT", `${name}不能为空`);
  }
  return text;
}

function numberValue(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function jsonValue(value: unknown, fallback: JsonValue): JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string" ||
    Array.isArray(value) ||
    (typeof value === "object" && value !== null)
  ) {
    return value as JsonValue;
  }
  return fallback;
}

function timestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function timestampOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = timestamp(value);
  return parsed || null;
}

function iso(value: number): string {
  return new Date(value).toISOString();
}

function postgresMonth(value: string): string {
  const normalized = value.trim();
  if (/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(normalized)) {
    return `${normalized}-01`;
  }
  if (/^20\d{2}-(?:0[1-9]|1[0-2])-\d{2}$/.test(normalized)) {
    return normalized;
  }
  throw new DecisionProjectStoreError(
    "INVALID_INPUT",
    `城市车系数据月份无效：${value}`,
  );
}

function monthKey(value: unknown): string {
  const text = requiredText(value, "城市车系数据月份");
  return text.slice(0, 7);
}

function resultRows(value: unknown): RawRow[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is RawRow =>
          typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
}

function throwQueryError(
  error: { message?: string; code?: string } | null,
  fallback: string,
) {
  if (!error) return;
  if (
    error.code === "40001" ||
    /VERSION_CONFLICT|serialization/i.test(error.message ?? "")
  ) {
    throw new DecisionProjectStoreError(
      "VERSION_CONFLICT",
      "项目已被其他操作更新，请刷新后重试",
    );
  }
  throw new Error(error.message || fallback);
}

function mapCandidate(row: RawRow): CandidateTrimRow {
  return {
    id: requiredText(row.id, "候选车型编号"),
    projectId: requiredText(row.project_id, "项目编号"),
    position: numberValue(row.position),
    role: requiredText(row.role, "候选车型角色"),
    entityId: optionalText(row.entity_id),
    brand: optionalText(row.brand),
    series: optionalText(row.series),
    modelYear: optionalText(row.model_year),
    trimName: requiredText(row.trim_name, "精确配置"),
    displayName: requiredText(row.display_name, "车型名称"),
    status: requiredText(row.status, "车型状态"),
    data: jsonValue(row.data_json, {}),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function mapCondition(row: RawRow): DecisionConditionRow {
  return {
    id: requiredText(row.id, "条件编号"),
    projectId: requiredText(row.project_id, "项目编号"),
    sortOrder: numberValue(row.sort_order),
    scope: requiredText(row.scope, "条件范围"),
    kind: requiredText(row.kind, "条件类型"),
    title: requiredText(row.title, "条件名称"),
    description: optionalText(row.description) ?? "",
    priority: requiredText(row.priority, "条件优先级"),
    status: requiredText(row.status, "条件状态"),
    details: jsonValue(row.details_json, {}),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function mapEvaluation(row: RawRow): ConditionEvaluationRow {
  return {
    id: requiredText(row.id, "评估编号"),
    projectId: requiredText(row.project_id, "项目编号"),
    conditionId: requiredText(row.condition_id, "条件编号"),
    candidateTrimId: requiredText(row.candidate_trim_id, "候选车型编号"),
    status: requiredText(row.status, "评估状态"),
    conclusion: optionalText(row.conclusion) ?? "",
    rationale: jsonValue(row.rationale_json, {}),
    evaluatedAt: timestampOrNull(row.evaluated_at),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function mapEvidence(row: RawRow): EvidenceRow {
  return {
    id: requiredText(row.id, "证据编号"),
    projectId: requiredText(row.project_id, "项目编号"),
    candidateTrimId: optionalText(row.candidate_trim_id),
    conditionId: optionalText(row.condition_id),
    evaluationId: optionalText(row.evaluation_id),
    evidenceType: requiredText(row.evidence_type, "证据类型"),
    sourceType: requiredText(row.source_type, "来源类型"),
    sourceName: optionalText(row.source_name),
    title: requiredText(row.title, "证据标题"),
    summary: optionalText(row.summary) ?? "",
    sourceUrl: optionalText(row.source_url),
    traceId: optionalText(row.trace_id),
    logId: optionalText(row.log_id),
    validity: requiredText(row.validity, "证据状态"),
    capturedAt: timestamp(row.captured_at),
    expiresAt: timestampOrNull(row.expires_at),
    payload: jsonValue(row.payload_json, {}),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function mapUserCheck(row: RawRow): UserCheckRow {
  return {
    id: requiredText(row.id, "用户核验编号"),
    projectId: requiredText(row.project_id, "项目编号"),
    conditionId: optionalText(row.condition_id),
    candidateTrimId: optionalText(row.candidate_trim_id),
    sortOrder: numberValue(row.sort_order),
    title: requiredText(row.title, "用户核验标题"),
    instructions: optionalText(row.instructions) ?? "",
    status: requiredText(row.status, "用户核验状态"),
    result: optionalText(row.result),
    dueAt: timestampOrNull(row.due_at),
    completedAt: timestampOrNull(row.completed_at),
    details: jsonValue(row.details_json, {}),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function mapSalesQuote(row: RawRow): SalesQuoteRow {
  return {
    id: requiredText(row.id, "报价编号"),
    projectId: requiredText(row.project_id, "项目编号"),
    candidateTrimId: requiredText(row.candidate_trim_id, "候选车型编号"),
    status: requiredText(row.status, "报价状态"),
    dealerName: optionalText(row.dealer_name),
    city: optionalText(row.city),
    currency: optionalText(row.currency) ?? "CNY",
    totalAmountMinor:
      row.total_amount_minor === null
        ? null
        : numberValue(row.total_amount_minor),
    paymentMethod: optionalText(row.payment_method),
    quotedAt: timestamp(row.quoted_at),
    expiresAt: timestampOrNull(row.expires_at),
    lineItems: jsonValue(row.line_items_json, []),
    terms: jsonValue(row.terms_json, {}),
    notes: optionalText(row.notes),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function mapSalesClaim(row: RawRow): SalesClaimRow {
  return {
    id: requiredText(row.id, "销售承诺编号"),
    projectId: requiredText(row.project_id, "项目编号"),
    candidateTrimId: optionalText(row.candidate_trim_id),
    quoteId: optionalText(row.quote_id),
    claimType: requiredText(row.claim_type, "销售承诺类型"),
    content: requiredText(row.content, "销售承诺内容"),
    status: requiredText(row.status, "销售承诺状态"),
    promisedAt: timestampOrNull(row.promised_at),
    expiresAt: timestampOrNull(row.expires_at),
    proof: jsonValue(row.proof_json, {}),
    notes: optionalText(row.notes),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function mapCitySeries(row: RawRow): CityVehicleSeriesRow {
  return {
    id: requiredText(row.id, "城市车系序列编号"),
    projectId: requiredText(row.project_id, "项目编号"),
    candidateTrimId: requiredText(row.candidate_trim_id, "候选车型编号"),
    city: requiredText(row.city, "城市"),
    seriesName: requiredText(row.series_name, "车系"),
    periodLabel: requiredText(row.period_label, "统计周期"),
    metricKey: requiredText(row.metric_key, "统计字段"),
    metricLabel: requiredText(row.metric_label, "统计口径"),
    metricDefinition: optionalText(row.metric_definition),
    unit: optionalText(row.unit),
    dataLevel: optionalText(row.data_level),
    datasetType: requiredText(row.dataset_type, "数据集类型"),
    requestId: optionalText(row.request_id),
    traceId: optionalText(row.trace_id),
    status: requiredText(row.status, "数据状态"),
    evidenceId: optionalText(row.evidence_id),
    capturedAt: timestamp(row.captured_at),
    extra: jsonValue(row.extra_json, {}),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function mapCityPoint(row: RawRow): CityVehicleSeriesPointRow {
  return {
    id: requiredText(row.id, "城市车系数据点编号"),
    seriesId: requiredText(row.series_id, "城市车系序列编号"),
    month: monthKey(row.month),
    monthLabel: requiredText(row.month_label, "月份"),
    value: numberValue(row.value),
    extra: jsonValue(row.extra_json, {}),
    createdAt: timestamp(row.created_at),
  };
}

function publicProject(row: RawRow): DecisionProject {
  return {
    id: requiredText(row.id, "项目编号"),
    title: requiredText(row.title, "项目标题"),
    status: requiredText(row.status, "项目状态"),
    city: optionalText(row.city),
    primaryCandidateId: optionalText(row.primary_candidate_id),
    summary: jsonValue(row.summary_json, {}),
    version: numberValue(row.version, 1),
    expiresAt: timestamp(row.expires_at),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

async function rawProject(projectId: string): Promise<RawRow | null> {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .from("decision_projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  throwQueryError(error, "无法读取 Supabase 项目");
  return data && typeof data === "object" ? (data as RawRow) : null;
}

async function requireAuthorizedProject(
  projectId: string,
  editToken: string,
  now = Date.now(),
): Promise<RawRow> {
  if (!editToken) {
    throw new DecisionProjectStoreError("UNAUTHORIZED", "需要项目编辑令牌");
  }
  const project = await rawProject(projectId);
  if (!project) {
    throw new DecisionProjectStoreError("NOT_FOUND", "Project not found");
  }
  if (timestamp(project.expires_at) <= now) {
    throw new DecisionProjectStoreError("EXPIRED", "Project has expired");
  }
  if ((await sha256Hex(editToken)) !== project.edit_token_digest) {
    throw new DecisionProjectStoreError(
      "UNAUTHORIZED",
      "The edit token is invalid",
    );
  }
  return project;
}

async function loadRecord(project: RawRow): Promise<DecisionProjectRecord> {
  const client = getSupabaseServerClient();
  const projectId = requiredText(project.id, "项目编号");
  const [
    candidates,
    conditions,
    evaluations,
    evidence,
    checks,
    quotes,
    claims,
    citySeries,
  ] = await Promise.all([
    client
      .from("candidate_trims")
      .select("*")
      .eq("project_id", projectId)
      .order("position")
      .order("created_at"),
    client
      .from("decision_conditions")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order")
      .order("created_at"),
    client
      .from("condition_evaluations")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at"),
    client
      .from("evidence")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at"),
    client
      .from("user_checks")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order")
      .order("created_at"),
    client
      .from("sales_quotes")
      .select("*")
      .eq("project_id", projectId)
      .order("quoted_at")
      .order("created_at"),
    client
      .from("sales_claims")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at"),
    client
      .from("city_vehicle_series")
      .select("*")
      .eq("project_id", projectId)
      .order("candidate_trim_id")
      .order("captured_at"),
  ]);
  for (const result of [
    candidates,
    conditions,
    evaluations,
    evidence,
    checks,
    quotes,
    claims,
    citySeries,
  ]) {
    throwQueryError(result.error, "无法读取 Supabase 项目明细");
  }
  const seriesRows = resultRows(citySeries.data);
  const seriesIds = seriesRows.map((row) => requiredText(row.id, "序列编号"));
  const cityPoints = seriesIds.length
    ? await client
        .from("city_vehicle_series_points")
        .select("*")
        .in("series_id", seriesIds)
        .order("series_id")
        .order("month")
    : { data: [], error: null };
  throwQueryError(cityPoints.error, "无法读取城市车系数据点");

  return {
    project: publicProject(project),
    candidateTrims: resultRows(candidates.data).map(mapCandidate),
    conditions: resultRows(conditions.data).map(mapCondition),
    evaluations: resultRows(evaluations.data).map(mapEvaluation),
    evidence: resultRows(evidence.data).map(mapEvidence),
    userChecks: resultRows(checks.data).map(mapUserCheck),
    salesQuotes: resultRows(quotes.data).map(mapSalesQuote),
    salesClaims: resultRows(claims.data).map(mapSalesClaim),
    cityVehicleSeries: seriesRows.map(mapCitySeries),
    cityVehicleSeriesPoints: resultRows(cityPoints.data).map(mapCityPoint),
  };
}

export function buildSupabaseSaveRecord(
  input: CreateDecisionProjectInput,
  options: {
    projectId: string;
    editTokenDigest: string;
    recoveryCodeDigest: string;
    version: number;
    now: number;
    expiresAt: number;
  },
) {
  const {
    projectId,
    editTokenDigest,
    recoveryCodeDigest,
    version,
    now,
    expiresAt,
  } = options;
  const candidateRows = (input.candidateTrims ?? []).map((row, index) => ({
    id: row.id || createStorageId("trim"),
    project_id: projectId,
    position: row.position ?? index,
    role: row.role || (index === 0 ? "target" : "alternate"),
    entity_id: row.entityId ?? null,
    brand: row.brand ?? null,
    series: row.series ?? null,
    model_year: row.modelYear ?? null,
    trim_name: row.trimName,
    display_name: row.displayName || row.trimName,
    status: row.status || "active",
    data_json: row.data ?? {},
    created_at: iso(row.createdAt ?? now),
    updated_at: iso(now),
  }));
  if (candidateRows.length > MAX_CANDIDATE_TRIMS) {
    throw new DecisionProjectStoreError(
      "INVALID_INPUT",
      `A project supports at most ${MAX_CANDIDATE_TRIMS} candidate trims`,
    );
  }
  const primaryCandidateId =
    input.primaryCandidateId ??
    candidateRows.find((row) => row.role === "target")?.id ??
    candidateRows[0]?.id ??
    null;
  const conditionRows = (input.conditions ?? []).map((row, index) => ({
    id: row.id || createStorageId("condition"),
    project_id: projectId,
    sort_order: row.sortOrder ?? index,
    scope: row.scope || "personal",
    kind: row.kind || "other",
    title: row.title,
    description: row.description || "",
    priority: row.priority || "medium",
    status: row.status || "pending",
    details_json: row.details ?? {},
    created_at: iso(row.createdAt ?? now),
    updated_at: iso(now),
  }));
  const evaluationRows = (input.evaluations ?? []).map((row) => ({
    id: row.id || createStorageId("evaluation"),
    project_id: projectId,
    condition_id: row.conditionId,
    candidate_trim_id: row.candidateTrimId,
    status: row.status || "unknown",
    conclusion: row.conclusion || "",
    rationale_json: row.rationale ?? {},
    evaluated_at:
      row.evaluatedAt === null || row.evaluatedAt === undefined
        ? null
        : iso(row.evaluatedAt),
    created_at: iso(row.createdAt ?? now),
    updated_at: iso(now),
  }));
  const evidenceRows = (input.evidence ?? []).map((row) => ({
    id: row.id || createStorageId("evidence"),
    project_id: projectId,
    candidate_trim_id: row.candidateTrimId ?? null,
    condition_id: row.conditionId ?? null,
    evaluation_id: row.evaluationId ?? null,
    evidence_type: row.evidenceType || "fact",
    source_type: row.sourceType || "user",
    source_name: row.sourceName ?? null,
    title: row.title,
    summary: row.summary || "",
    source_url: row.sourceUrl ?? null,
    trace_id: row.traceId ?? null,
    log_id: row.logId ?? null,
    validity: row.validity || "current",
    captured_at: iso(row.capturedAt ?? now),
    expires_at:
      row.expiresAt === null || row.expiresAt === undefined
        ? null
        : iso(row.expiresAt),
    payload_json: row.payload ?? {},
    created_at: iso(row.createdAt ?? now),
    updated_at: iso(now),
  }));
  const checkRows = (input.userChecks ?? []).map((row, index) => ({
    id: row.id || createStorageId("check"),
    project_id: projectId,
    condition_id: row.conditionId ?? null,
    candidate_trim_id: row.candidateTrimId ?? null,
    sort_order: row.sortOrder ?? index,
    title: row.title,
    instructions: row.instructions || "",
    status: row.status || "pending",
    result: row.result ?? null,
    due_at:
      row.dueAt === null || row.dueAt === undefined ? null : iso(row.dueAt),
    completed_at:
      row.completedAt === null || row.completedAt === undefined
        ? null
        : iso(row.completedAt),
    details_json: row.details ?? {},
    created_at: iso(row.createdAt ?? now),
    updated_at: iso(now),
  }));
  const quoteRows = (input.salesQuotes ?? []).map((row) => ({
    id: row.id || createStorageId("quote"),
    project_id: projectId,
    candidate_trim_id: row.candidateTrimId,
    status: row.status || "active",
    dealer_name: row.dealerName ?? null,
    city: row.city ?? null,
    currency: row.currency || "CNY",
    total_amount_minor: row.totalAmountMinor ?? null,
    payment_method: row.paymentMethod ?? null,
    quoted_at: iso(row.quotedAt ?? now),
    expires_at:
      row.expiresAt === null || row.expiresAt === undefined
        ? null
        : iso(row.expiresAt),
    line_items_json: row.lineItems ?? [],
    terms_json: row.terms ?? {},
    notes: row.notes ?? null,
    created_at: iso(row.createdAt ?? now),
    updated_at: iso(now),
  }));
  const claimRows = (input.salesClaims ?? []).map((row) => ({
    id: row.id || createStorageId("claim"),
    project_id: projectId,
    candidate_trim_id: row.candidateTrimId ?? null,
    quote_id: row.quoteId ?? null,
    claim_type: row.claimType || "other",
    content: row.content,
    status: row.status || "unverified",
    promised_at:
      row.promisedAt === null || row.promisedAt === undefined
        ? null
        : iso(row.promisedAt),
    expires_at:
      row.expiresAt === null || row.expiresAt === undefined
        ? null
        : iso(row.expiresAt),
    proof_json: row.proof ?? {},
    notes: row.notes ?? null,
    created_at: iso(row.createdAt ?? now),
    updated_at: iso(now),
  }));
  const pointRows = (input.cityVehicleSeriesPoints ?? []).map((row) => ({
    id: row.id || createStorageId("city_point"),
    series_id: row.seriesId,
    month: postgresMonth(row.month),
    month_label: row.monthLabel || row.month,
    value: row.value,
    extra_json: row.extra ?? {},
    created_at: iso(row.createdAt ?? now),
  }));
  const pointsBySeries = new Map<string, string[]>();
  for (const point of pointRows) {
    const values = pointsBySeries.get(point.series_id) ?? [];
    values.push(point.month);
    pointsBySeries.set(point.series_id, values);
  }
  const citySeriesRows = (input.cityVehicleSeries ?? []).map((row) => {
    const months = (pointsBySeries.get(row.id || "") ?? []).sort();
    return {
      id: row.id || createStorageId("city_series"),
      project_id: projectId,
      candidate_trim_id: row.candidateTrimId,
      city: row.city,
      series_name: row.seriesName,
      data_level: row.dataLevel ?? null,
      dataset_type: row.datasetType || "vehicle_sales",
      period_label: row.periodLabel || "",
      period_start: months[0] ?? null,
      period_end: months.at(-1) ?? null,
      metric_key: row.metricKey || row.metricLabel,
      metric_label: row.metricLabel,
      metric_definition: row.metricDefinition ?? null,
      unit: row.unit ?? null,
      status: row.status || "current",
      evidence_id: row.evidenceId ?? null,
      request_id: row.requestId ?? null,
      trace_id: row.traceId ?? null,
      captured_at: iso(row.capturedAt ?? now),
      extra_json: row.extra ?? {},
      created_at: iso(row.createdAt ?? now),
      updated_at: iso(now),
    };
  });

  return {
    project: {
      id: projectId,
      owner_user_id: null,
      title: input.title?.trim() || "我的购车决策",
      status: input.status || "pending",
      city: input.city ?? null,
      primary_candidate_id: primaryCandidateId,
      summary_json: input.summary ?? {},
      edit_token_digest: editTokenDigest,
      recovery_code_digest: recoveryCodeDigest,
      version,
      expires_at: iso(expiresAt),
      created_at: iso(now),
      updated_at: iso(now),
    },
    candidate_trims: candidateRows,
    decision_conditions: conditionRows,
    condition_evaluations: evaluationRows,
    evidence: evidenceRows,
    user_checks: checkRows,
    sales_quotes: quoteRows,
    sales_claims: claimRows,
    city_vehicle_series: citySeriesRows,
    city_vehicle_series_points: pointRows,
  };
}

async function saveRecord(
  record: ReturnType<typeof buildSupabaseSaveRecord>,
  mode: "create" | "update",
  editTokenDigest: string | null,
  expectedVersion: number | null,
) {
  const { error } = await getSupabaseServerClient().rpc(
    "save_decision_project",
    {
      p_record: record,
      p_mode: mode,
      p_edit_token_digest: editTokenDigest,
      p_expected_version: expectedVersion,
    },
  );
  throwQueryError(error, "Supabase 项目保存失败");
}

export async function createDecisionProject(
  input: CreateDecisionProjectInput = {},
): Promise<CreatedDecisionProject> {
  const now = Date.now();
  const projectId = input.id || createStorageId("project");
  const editToken = createEditToken();
  const recoveryCode = createRecoveryCode();
  const [editTokenDigest, recoveryCodeDigest] = await Promise.all([
    sha256Hex(editToken),
    hashRecoveryCode(recoveryCode),
  ]);
  const record = buildSupabaseSaveRecord(input, {
    projectId,
    editTokenDigest,
    recoveryCodeDigest,
    version: 1,
    now,
    expiresAt: now + DECISION_PROJECT_TTL_MS,
  });
  await saveRecord(record, "create", null, null);
  const stored = await rawProject(projectId);
  if (!stored) {
    throw new Error("Supabase 已保存项目，但无法重新读取");
  }
  return {
    record: await loadRecord(stored),
    recoveryCode,
    editToken,
  };
}

export async function readDecisionProject(
  projectId: string,
  editToken: string,
): Promise<DecisionProjectRecord> {
  return loadRecord(await requireAuthorizedProject(projectId, editToken));
}

export async function updateDecisionProject(
  projectId: string,
  editToken: string,
  input: UpdateDecisionProjectInput,
): Promise<DecisionProjectRecord> {
  const now = Date.now();
  const storedRaw = await requireAuthorizedProject(projectId, editToken, now);
  const stored = await loadRecord(storedRaw);
  if (
    input.expectedVersion !== undefined &&
    input.expectedVersion !== stored.project.version
  ) {
    throw new DecisionProjectStoreError(
      "VERSION_CONFLICT",
      `Expected version ${input.expectedVersion}, found ${stored.project.version}`,
    );
  }
  const merged: CreateDecisionProjectInput = {
    id: projectId,
    title: input.title ?? stored.project.title,
    status: input.status ?? stored.project.status,
    city: input.city !== undefined ? input.city : stored.project.city,
    primaryCandidateId:
      input.primaryCandidateId !== undefined
        ? input.primaryCandidateId
        : stored.project.primaryCandidateId,
    summary: input.summary ?? stored.project.summary,
    candidateTrims: input.candidateTrims ?? stored.candidateTrims,
    conditions: input.conditions ?? stored.conditions,
    evaluations: input.evaluations ?? stored.evaluations,
    evidence: input.evidence ?? stored.evidence,
    userChecks: input.userChecks ?? stored.userChecks,
    salesQuotes: input.salesQuotes ?? stored.salesQuotes,
    salesClaims: input.salesClaims ?? stored.salesClaims,
    cityVehicleSeries:
      input.cityVehicleSeries ?? stored.cityVehicleSeries,
    cityVehicleSeriesPoints:
      input.cityVehicleSeriesPoints ?? stored.cityVehicleSeriesPoints,
  };
  const editTokenDigest = requiredText(
    storedRaw.edit_token_digest,
    "编辑令牌摘要",
  );
  const record = buildSupabaseSaveRecord(merged, {
    projectId,
    editTokenDigest,
    recoveryCodeDigest: requiredText(
      storedRaw.recovery_code_digest,
      "恢复码摘要",
    ),
    version: stored.project.version + 1,
    now,
    expiresAt: now + DECISION_PROJECT_TTL_MS,
  });
  record.project.created_at = iso(stored.project.createdAt);
  await saveRecord(
    record,
    "update",
    editTokenDigest,
    stored.project.version,
  );
  const updated = await rawProject(projectId);
  if (!updated) {
    throw new DecisionProjectStoreError("NOT_FOUND", "Project not found");
  }
  return loadRecord(updated);
}

export async function deleteDecisionProject(
  projectId: string,
  editToken: string,
) {
  const stored = await requireAuthorizedProject(projectId, editToken);
  const { error } = await getSupabaseServerClient()
    .from("decision_projects")
    .delete()
    .eq("id", projectId)
    .eq(
      "edit_token_digest",
      requiredText(stored.edit_token_digest, "编辑令牌摘要"),
    );
  throwQueryError(error, "Supabase 项目删除失败");
}

export async function recoverDecisionProject(
  projectId: string,
  recoveryCode: string,
): Promise<RecoveredDecisionProject> {
  const now = Date.now();
  const recoveryCodeDigest = await hashRecoveryCode(recoveryCode);
  const project = await rawProject(projectId);
  if (
    !project ||
    project.recovery_code_digest !== recoveryCodeDigest
  ) {
    throw new DecisionProjectStoreError(
      "UNAUTHORIZED",
      "Project id or recovery code is invalid",
    );
  }
  if (timestamp(project.expires_at) <= now) {
    throw new DecisionProjectStoreError("EXPIRED", "Project has expired");
  }
  const editToken = createEditToken();
  const editTokenDigest = await sha256Hex(editToken);
  const expiresAt = now + DECISION_PROJECT_TTL_MS;
  const currentVersion = numberValue(project.version, 1);
  const { data, error } = await getSupabaseServerClient()
    .from("decision_projects")
    .update({
      edit_token_digest: editTokenDigest,
      expires_at: iso(expiresAt),
      updated_at: iso(now),
      version: currentVersion + 1,
    })
    .eq("id", projectId)
    .eq("recovery_code_digest", recoveryCodeDigest)
    .eq("version", currentVersion)
    .select("id");
  throwQueryError(error, "Supabase 项目恢复失败");
  if (!Array.isArray(data) || data.length !== 1) {
    throw new DecisionProjectStoreError(
      "VERSION_CONFLICT",
      "项目恢复期间发生版本冲突，请重试",
    );
  }
  return { projectId, editToken, expiresAt };
}

export async function purgeExpiredDecisionProjects(now = Date.now()) {
  const { data, error } = await getSupabaseServerClient()
    .from("decision_projects")
    .delete()
    .lte("expires_at", iso(now))
    .select("id");
  throwQueryError(error, "清理过期 Supabase 项目失败");
  return { deleted: Array.isArray(data) ? data.length : 0 };
}
