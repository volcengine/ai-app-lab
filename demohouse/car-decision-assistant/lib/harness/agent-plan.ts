import {
  createHarnessError,
  createRuntime,
  finishRequest,
  getHeaderRequestId,
  isHarnessTimeoutError,
  isRecord,
  readAgentPlanKey,
  redactSecret,
  startRequest,
} from "./runtime";
import type {
  ClientRuntimeOptions,
  HarnessCallResult,
  HarnessHealth,
} from "./types";

export const AGENT_PLAN_BASE_URL =
  "https://ark.cn-beijing.volces.com/api/plan";
export const AGENT_PLAN_MESSAGES_URL = `${AGENT_PLAN_BASE_URL}/v1/messages`;
export const DEFAULT_AGENT_PLAN_MODEL = "ark-code-latest";

const CONDITION_CATEGORIES = new Set([
  "budget",
  "usage",
  "charging",
  "space",
  "comfort",
  "safety",
  "driver_assistance",
  "appearance",
  "market",
  "ownership",
  "context",
  "delivery",
  "payment",
  "transaction",
  "other",
]);
const CONDITION_SUBJECTS = new Set([
  "driver",
  "passenger",
  "vehicle",
  "purchase",
  "household",
  "route",
  "other",
]);
const IMPORTANCE_VALUES = new Set(["must", "prefer", "avoid"]);
const EVALUATION_MODES = new Set([
  "rule",
  "self_check",
  "sales_check",
  "sales_data",
  "web_research",
  "context",
  "out_of_scope",
]);
const OPERATORS = new Set([
  "lte",
  "gte",
  "eq",
  "ne",
  "includes",
  "between",
  "in",
  "not_in",
  "exists",
  "not_exists",
  "unknown",
]);

export type ConditionCategory =
  | "budget"
  | "usage"
  | "charging"
  | "space"
  | "comfort"
  | "safety"
  | "driver_assistance"
  | "appearance"
  | "market"
  | "ownership"
  | "context"
  | "delivery"
  | "payment"
  | "transaction"
  | "other";

export type ConditionSubject =
  | "driver"
  | "passenger"
  | "vehicle"
  | "purchase"
  | "household"
  | "route"
  | "other";

export type ConditionImportance = "must" | "prefer" | "avoid";

export type ConditionEvaluationMode =
  | "rule"
  | "self_check"
  | "sales_check"
  | "sales_data"
  | "web_research"
  | "context"
  | "out_of_scope";

export type ConditionOperator =
  | "lte"
  | "gte"
  | "eq"
  | "ne"
  | "includes"
  | "between"
  | "in"
  | "not_in"
  | "exists"
  | "not_exists"
  | "unknown";

export type StructuredCondition = {
  id: string;
  source_text: string;
  subject: ConditionSubject;
  category: ConditionCategory;
  importance: ConditionImportance;
  evaluation_mode: ConditionEvaluationMode;
  normalized: {
    field: string | null;
    operator: ConditionOperator;
    value:
      | string
      | number
      | boolean
      | null
      | Array<string | number | boolean>;
    unit: string | null;
  };
  needs_clarification: boolean;
  clarification_question: string | null;
};

export type ConditionExtraction = {
  schema_version: "1.0";
  conditions: StructuredCondition[];
  clarifying_questions: string[];
  invalid_conditions?: Array<{
    source_text: string;
    reason: string;
  }>;
};

export type StructureConditionsOptions = {
  signal?: AbortSignal;
};

type ValidationResult =
  | { ok: true; value: ConditionExtraction }
  | { ok: false; reason: string };

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function validScalar(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function validConditionValue(
  value: unknown,
): value is StructuredCondition["normalized"]["value"] {
  return (
    validScalar(value) ||
    (Array.isArray(value) &&
      value.length > 0 &&
      value.length <= 20 &&
      value.every(
        (item) =>
          typeof item === "string" ||
          typeof item === "boolean" ||
          (typeof item === "number" && Number.isFinite(item)),
      ))
  );
}

export function validateConditionExtraction(
  value: unknown,
  originalText?: string,
): ValidationResult {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schema_version",
      "conditions",
      "clarifying_questions",
    ])
  ) {
    return {
      ok: false,
      reason: "Root object must contain only the documented schema keys.",
    };
  }
  if (value.schema_version !== "1.0") {
    return { ok: false, reason: "Unsupported condition schema version." };
  }
  if (
    !Array.isArray(value.conditions) ||
    value.conditions.length > 50 ||
    !Array.isArray(value.clarifying_questions) ||
    value.clarifying_questions.length > 3
  ) {
    return {
      ok: false,
      reason: "conditions or clarifying_questions has an invalid size.",
    };
  }

  const questions: string[] = [];
  for (const question of value.clarifying_questions) {
    if (
      typeof question !== "string" ||
      !question.trim() ||
      question.length > 200
    ) {
      return { ok: false, reason: "A clarifying question is invalid." };
    }
    questions.push(question.trim());
  }

  const ids = new Set<string>();
  const conditions: StructuredCondition[] = [];
  for (const condition of value.conditions) {
    if (
      !isRecord(condition) ||
      !hasExactKeys(condition, [
        "id",
        "source_text",
        "subject",
        "category",
        "importance",
        "evaluation_mode",
        "normalized",
        "needs_clarification",
        "clarification_question",
      ])
    ) {
      return {
        ok: false,
        reason: "A condition contains missing or undocumented fields.",
      };
    }
    if (
      typeof condition.id !== "string" ||
      !/^condition_[a-z0-9_-]{1,48}$/i.test(condition.id) ||
      ids.has(condition.id)
    ) {
      return { ok: false, reason: "A condition ID is invalid or duplicated." };
    }
    ids.add(condition.id);
    if (
      typeof condition.source_text !== "string" ||
      !condition.source_text.trim() ||
      condition.source_text.length > 500
    ) {
      return { ok: false, reason: "A condition source_text is invalid." };
    }
    if (
      originalText !== undefined &&
      !originalText.includes(condition.source_text)
    ) {
      return {
        ok: false,
        reason:
          "A condition source_text was not a verbatim fragment of the user input.",
      };
    }
    if (
      typeof condition.subject !== "string" ||
      !CONDITION_SUBJECTS.has(condition.subject) ||
      typeof condition.category !== "string" ||
      !CONDITION_CATEGORIES.has(condition.category) ||
      typeof condition.importance !== "string" ||
      !IMPORTANCE_VALUES.has(condition.importance) ||
      typeof condition.evaluation_mode !== "string" ||
      !EVALUATION_MODES.has(condition.evaluation_mode)
    ) {
      return { ok: false, reason: "A condition enum value is invalid." };
    }
    if (
      !isRecord(condition.normalized) ||
      !hasExactKeys(condition.normalized, [
        "field",
        "operator",
        "value",
        "unit",
      ])
    ) {
      return { ok: false, reason: "A normalized condition is invalid." };
    }
    const normalized = condition.normalized;
    if (
      !(
        normalized.field === null ||
        (typeof normalized.field === "string" &&
          /^[a-z][a-z0-9_]{0,63}$/.test(normalized.field))
      ) ||
      typeof normalized.operator !== "string" ||
      !OPERATORS.has(normalized.operator) ||
      !validConditionValue(normalized.value) ||
      !(
        normalized.unit === null ||
        (typeof normalized.unit === "string" && normalized.unit.length <= 32)
      )
    ) {
      return {
        ok: false,
        reason: "A normalized condition value is outside the strict schema.",
      };
    }
    if (typeof condition.needs_clarification !== "boolean") {
      return { ok: false, reason: "needs_clarification must be boolean." };
    }
    if (
      !(
        condition.clarification_question === null ||
        (typeof condition.clarification_question === "string" &&
          condition.clarification_question.trim().length > 0 &&
          condition.clarification_question.length <= 200)
      )
    ) {
      return { ok: false, reason: "clarification_question is invalid." };
    }
    if (
      condition.needs_clarification !==
      (condition.clarification_question !== null)
    ) {
      return {
        ok: false,
        reason:
          "needs_clarification and clarification_question are inconsistent.",
      };
    }

    conditions.push({
      id: condition.id,
      source_text: condition.source_text,
      subject: condition.subject as ConditionSubject,
      category: condition.category as ConditionCategory,
      importance: condition.importance as ConditionImportance,
      evaluation_mode:
        condition.evaluation_mode as ConditionEvaluationMode,
      normalized: {
        field: normalized.field as string | null,
        operator: normalized.operator as ConditionOperator,
        value: normalized.value,
        unit: normalized.unit as string | null,
      },
      needs_clarification: condition.needs_clarification,
      clarification_question: condition.clarification_question as string | null,
    });
  }

  return {
    ok: true,
    value: {
      schema_version: "1.0",
      conditions,
      clarifying_questions: questions,
    },
  };
}

export function salvageConditionExtraction(
  value: unknown,
  originalText: string,
): ConditionExtraction | null {
  if (
    !isRecord(value) ||
    value.schema_version !== "1.0" ||
    !Array.isArray(value.conditions)
  ) {
    return null;
  }
  const conditions: StructuredCondition[] = [];
  const invalidConditions: NonNullable<
    ConditionExtraction["invalid_conditions"]
  > = [];
  const seenIds = new Set<string>();
  for (const item of value.conditions.slice(0, 50)) {
    const sourceText =
      isRecord(item) && typeof item.source_text === "string"
        ? item.source_text
        : "";
    const validated = validateConditionExtraction(
      {
        schema_version: "1.0",
        conditions: [item],
        clarifying_questions: [],
      },
      originalText,
    );
    if (
      validated.ok &&
      !seenIds.has(validated.value.conditions[0].id)
    ) {
      const condition = validated.value.conditions[0];
      seenIds.add(condition.id);
      conditions.push(condition);
    } else {
      invalidConditions.push({
        source_text:
          sourceText && originalText.includes(sourceText)
            ? sourceText
            : originalText,
        reason: validated.ok
          ? "A condition ID is duplicated."
          : validated.reason,
      });
    }
  }
  const clarifyingQuestions = Array.isArray(value.clarifying_questions)
    ? value.clarifying_questions
        .filter(
          (item): item is string =>
            typeof item === "string" &&
            item.trim().length > 0 &&
            item.length <= 200,
        )
        .slice(0, 3)
    : [];
  if (!conditions.length && !invalidConditions.length) return null;
  return {
    schema_version: "1.0",
    conditions,
    clarifying_questions: clarifyingQuestions,
    invalid_conditions: invalidConditions.length
      ? invalidConditions
      : undefined,
  };
}

function extractMessageText(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.content)) {
    return null;
  }
  const text = payload.content
    .filter(
      (part): part is Record<string, unknown> =>
        isRecord(part) && part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("")
    .trim();
  return text || null;
}

const CONDITION_SYSTEM_PROMPT = `你是购车决策助手的“用户需求结构化器”，不是选车顾问。
只把用户原话拆成可追溯的原子需求 JSON，不查询、不补充、不推断任何车型、配置、价格、销量、政策或市场事实。

必须遵守：
1. 一条 condition 只表达一个需求；包含“和、以及、/、顿号、逗号”的清单必须逐项拆开。
   并列项省略共同谓语时也要恢复为独立需求，例如“看重空间、续航和能耗”必须拆成空间、续航、能耗三条。
2. 不得丢弃场景、硬约束、偏好、主观体验、市场/保值诉求和交易诉求。
3. source_text 必须逐字摘自用户输入，可让多个原子需求引用同一个原文片段。
4. 模糊偏好也必须保留；无法量化不等于丢弃，normalized.value 设为 null、operator 设为 unknown。
5. 只有确实需要用户补充才能继续核验时才提问，最多 3 个问题。
6. “A 或 B”使用 operator=in 和数组 value；“不要/不接受”使用 not_in 或 ne；
   数值区间使用 between 和两个数字；优先/最好属于 prefer，不得升级成 must。

normalized.field 优先使用稳定语义字段，例如：
seat_count、energy_type、cltc_pure_range_km、cltc_total_range_km、
wltc_pure_range_km、wltc_total_range_km、fast_charge_time_hours、
battery_capacity_kwh、trunk_volume_l、wheelbase_mm、vehicle_length_mm、
vehicle_width_mm、vehicle_height_mm、driver_assistance_system、
driver_assistance_level、active_braking、lane_centering、surround_view_360、
parking_sensors、panoramic_sunroof、automatic_parking、airbag_configuration、
rear_seat_features、exterior_color、total_motor_power_kw、
acceleration_0_100_s、low_soc_fuel_consumption_l100km、
wltc_fuel_consumption_l100km、electricity_consumption_kwh100km。
体验、场景、审美、口碑、保值或交易条件可使用清晰的英文小写下划线语义字段；
不要把这些内容伪装成已可自动核验的车型事实。
只输出一个 JSON 对象，不使用 Markdown。根对象和每个子对象都不得增加字段。

严格输出结构：
{
  "schema_version": "1.0",
  "conditions": [{
    "id": "condition_1",
    "source_text": "用户原文片段",
    "subject": "driver|passenger|vehicle|purchase|household|route|other",
    "category": "budget|usage|charging|space|comfort|safety|driver_assistance|appearance|market|ownership|context|delivery|payment|transaction|other",
    "importance": "must|prefer|avoid",
    "evaluation_mode": "rule|self_check|sales_check|sales_data|web_research|context|out_of_scope",
    "normalized": {
      "field": "英文小写下划线字段或 null",
      "operator": "lte|gte|eq|ne|includes|between|in|not_in|exists|not_exists|unknown",
      "value": "string|number|boolean|(string|number|boolean)[]|null",
      "unit": "单位或 null"
    },
    "needs_clarification": false,
    "clarification_question": null
  }],
  "clarifying_questions": []
}`;

export class AgentPlanClient {
  private readonly runtime: ReturnType<typeof createRuntime>;

  constructor(options: ClientRuntimeOptions = {}) {
    this.runtime = createRuntime(options);
  }

  async structureConditions(
    text: string,
    options: StructureConditionsOptions = {},
  ): Promise<HarnessCallResult<ConditionExtraction>> {
    const started = startRequest(this.runtime.clock, this.runtime.idFactory);
    const key = readAgentPlanKey(this.runtime.environment);
    if (!key) {
      return {
        service: "agent_plan",
        status: "unavailable",
        data: null,
        error: createHarnessError(
          "missing_configuration",
          "AGENT_PLAN_API_KEY is not configured on the server.",
          false,
        ),
        meta: finishRequest(started, this.runtime.clock),
      };
    }

    const normalizedText = text.trim();
    if (!normalizedText || normalizedText.length > 4_000) {
      return {
        service: "agent_plan",
        status: "error",
        data: null,
        error: createHarnessError(
          "invalid_condition_text",
          "Condition text must contain between 1 and 4000 characters.",
          false,
        ),
        meta: finishRequest(started, this.runtime.clock),
      };
    }

    const model =
      this.runtime.environment.AGENT_PLAN_MODEL?.trim() ||
      DEFAULT_AGENT_PLAN_MODEL;
    let response: Response;
    try {
      response = await this.runtime.fetchImpl(AGENT_PLAN_MESSAGES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          "x-api-key": key,
        },
        body: JSON.stringify({
          model,
          max_tokens: 4_096,
          temperature: 0,
          system: CONDITION_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: normalizedText,
            },
          ],
        }),
        signal: options.signal,
      });
    } catch (error) {
      const timedOut = isHarnessTimeoutError(error);
      return {
        service: "agent_plan",
        status: timedOut ? "unavailable" : "error",
        data: null,
        error: createHarnessError(
          timedOut ? "request_timeout" : "network_error",
          timedOut
            ? "Agent Plan timed out; conditions will use the conservative fallback."
            : "Agent Plan model could not be reached.",
          true,
        ),
        meta: finishRequest(started, this.runtime.clock),
      };
    }

    const upstreamRequestId = getHeaderRequestId(response.headers);
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return {
        service: "agent_plan",
        status: "unparseable",
        data: null,
        error: createHarnessError(
          "agent_plan_unparseable_response",
          "Agent Plan returned a response that was not valid JSON.",
          false,
        ),
        meta: finishRequest(started, this.runtime.clock, {
          upstream_request_id: upstreamRequestId,
        }),
      };
    }

    if (!response.ok) {
      let message = `Agent Plan request failed with HTTP ${response.status}.`;
      if (isRecord(payload) && isRecord(payload.error)) {
        const upstreamMessage = payload.error.message;
        if (typeof upstreamMessage === "string") {
          message = redactSecret(upstreamMessage, key);
        }
      }
      return {
        service: "agent_plan",
        status: "error",
        data: null,
        error: createHarnessError(
          `http_${response.status}`,
          message,
          response.status === 429 || response.status >= 500,
        ),
        meta: finishRequest(started, this.runtime.clock, {
          upstream_request_id: upstreamRequestId,
        }),
      };
    }

    const textResult = extractMessageText(payload);
    if (!textResult) {
      return {
        service: "agent_plan",
        status: "unparseable",
        data: null,
        error: createHarnessError(
          "missing_model_text",
          "Agent Plan response did not include a text output.",
          false,
        ),
        meta: finishRequest(started, this.runtime.clock, {
          upstream_request_id: upstreamRequestId,
        }),
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(textResult);
    } catch {
      return {
        service: "agent_plan",
        status: "unparseable",
        data: null,
        error: createHarnessError(
          "condition_json_invalid",
          "Agent Plan condition output was not valid JSON.",
          false,
        ),
        meta: finishRequest(started, this.runtime.clock, {
          upstream_request_id: upstreamRequestId,
        }),
      };
    }

    const validated = validateConditionExtraction(parsed, normalizedText);
    if (!validated.ok) {
      const originalPartial = salvageConditionExtraction(
        parsed,
        normalizedText,
      );
      let repaired: unknown = null;
      let repairRequestId: string | null = null;
      try {
        const repairResponse = await this.runtime.fetchImpl(
          AGENT_PLAN_MESSAGES_URL,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "anthropic-version": "2023-06-01",
              "x-api-key": key,
            },
            body: JSON.stringify({
              model,
              max_tokens: 4_096,
              temperature: 0,
              system: CONDITION_SYSTEM_PROMPT,
              messages: [
                { role: "user", content: normalizedText },
                { role: "assistant", content: textResult },
                {
                  role: "user",
                  content:
                    `只修复不符合 Schema 的条件，不新增事实，不改写 source_text。` +
                    `诊断：${validated.reason}。重新输出完整 JSON。`,
                },
              ],
            }),
            signal: options.signal,
          },
        );
        repairRequestId = getHeaderRequestId(repairResponse.headers);
        if (repairResponse.ok) {
          const repairPayload: unknown = await repairResponse.json();
          const repairText = extractMessageText(repairPayload);
          if (repairText) repaired = JSON.parse(repairText);
        }
      } catch {
        repaired = null;
      }
      const repairedValidation = validateConditionExtraction(
        repaired,
        normalizedText,
      );
      if (repairedValidation.ok) {
        return {
          service: "agent_plan",
          status: "ok",
          data: repairedValidation.value,
          error: null,
          meta: finishRequest(started, this.runtime.clock, {
            upstream_request_id: repairRequestId ?? upstreamRequestId,
          }),
        };
      }
      const partial =
        salvageConditionExtraction(repaired, normalizedText) ??
        originalPartial;
      if (partial) {
        return {
          service: "agent_plan",
          status: "ok",
          data: partial,
          error: null,
          meta: finishRequest(started, this.runtime.clock, {
            upstream_request_id: repairRequestId ?? upstreamRequestId,
          }),
        };
      }
      return {
        service: "agent_plan",
        status: "unparseable",
        data: null,
        error: createHarnessError(
          "condition_schema_invalid",
          `Agent Plan output failed strict condition schema validation: ${validated.reason}`,
          false,
        ),
        meta: finishRequest(started, this.runtime.clock, {
          upstream_request_id: upstreamRequestId,
        }),
      };
    }

    return {
      service: "agent_plan",
      status: "ok",
      data: validated.value,
      error: null,
      meta: finishRequest(started, this.runtime.clock, {
        upstream_request_id: upstreamRequestId,
      }),
    };
  }

  async health(live = false): Promise<HarnessHealth> {
    const startedAt = Date.now();
    const requestId = `local_${this.runtime.idFactory()}`;
    const checkedAt = this.runtime.clock().toISOString();
    const configured = readAgentPlanKey(this.runtime.environment) !== null;
    if (!configured) {
      return {
        service: "agent_plan",
        status: "unavailable",
        configured: false,
        live,
        checked_at: checkedAt,
        latency_ms: Math.max(0, Date.now() - startedAt),
        request_id: requestId,
        upstream_request_id: null,
        trace_id: null,
        detail: "AGENT_PLAN_API_KEY is not configured on the server.",
        error: createHarnessError(
          "missing_configuration",
          "AGENT_PLAN_API_KEY is not configured on the server.",
          false,
        ),
      };
    }
    if (!live) {
      return {
        service: "agent_plan",
        status: "ok",
        configured: true,
        live: false,
        checked_at: checkedAt,
        latency_ms: Math.max(0, Date.now() - startedAt),
        request_id: requestId,
        upstream_request_id: null,
        trace_id: null,
        detail: "Configured; live model probe was not requested.",
        error: null,
      };
    }

    const result = await this.structureConditions("预算不超过20万元");
    return {
      service: "agent_plan",
      status: result.status === "ok" ? "ok" : "degraded",
      configured: true,
      live: true,
      checked_at: checkedAt,
      latency_ms: Math.max(0, Date.now() - startedAt),
      request_id: requestId,
      upstream_request_id: result.meta.upstream_request_id,
      trace_id: null,
      detail:
        result.status === "ok"
          ? "Live condition-structure probe succeeded."
          : "Live condition-structure probe failed.",
      error: result.error,
    };
  }
}

export function createAgentPlanClient(
  options: ClientRuntimeOptions = {},
): AgentPlanClient {
  return new AgentPlanClient(options);
}
