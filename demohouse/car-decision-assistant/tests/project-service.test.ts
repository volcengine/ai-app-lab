import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

import {
  ConfirmationDependency,
  ConditionCategory,
  DecisionStatus,
  PendingReason,
  createDemoDecisionProject,
  summarizeCandidate,
  type DecisionCondition,
  type DecisionRuleOperator,
  type VehicleCandidate,
} from "../lib/decision/index";

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

const service = await import("../lib/project-service");
const {
  DATAPRO_COMPLETE_QUERY_TIMEOUT_MS,
  DATAPRO_FOCUSED_QUERY_TIMEOUT_MS,
  DATAPRO_IDENTITY_QUERY_TIMEOUT_MS,
  DATAPRO_VEHICLE_TIMEOUT_MS,
  buildCompleteDataProQuery,
  buildConditions,
  buildFocusedDataProQuery,
  buildFocusedDataProQueries,
  buildVehicleIdentityOptionsQuery,
  buildVehicleIdentityOptionQueries,
  classifyProjectAnswer,
  evaluateCandidateCondition,
  extractExplicitFallbackConditions,
  parseExplicitLandingQuoteCny,
  parseDataProVehiclePayload,
  queryVehicleDataPro,
  recordToDomainProject,
  requiresVehicleIdentitySelection,
  restoreUserConfirmation,
  validateNewProjectRequest,
} = service;
const { extractRequirementAtoms } = await import("../lib/requirements");
const { isProjectFormUnchanged } = await import("../lib/project-form-state");

const capturedAt = "2026-07-27T08:00:00.000Z";

test("new projects accept ordinary brand or series names", () => {
  const base = {
    city: "成都",
    purchaseTime: "半年内",
    maxBudgetWan: 18,
    need: "工作日通勤，关注安全配置。",
  };

  const validated = validateNewProjectRequest({
    ...base,
    candidates: [
      "理想 L6",
      "奔驰",
      "比亚迪海豹",
    ],
  });
  assert.deepEqual(validated.candidates, [
    "理想 L6",
    "奔驰",
    "比亚迪海豹",
  ]);
  assert.deepEqual(validated.candidateIdentityIds, [null, null, null]);
  assert.throws(
    () => validateNewProjectRequest({ ...base, candidates: ["L"] }),
    /请至少填写品牌或车系名称/,
  );
});

test("unchanged project form values do not trigger regeneration", () => {
  const baseline = {
    city: "杭州",
    purchaseTime: "还没确定",
    maxBudgetWan: 25,
    candidates: [
      "理想汽车 L6 2024款 Max",
      "问界 M9 2026款 增程 Max+版 5座",
      "小米汽车 SU7 Ultra 2025款 Ultra",
    ],
    need: "平时一个人开，周末偶尔带父母。",
  };
  assert.equal(
    isProjectFormUnchanged(
      {
        ...baseline,
        city: " 杭州 ",
        maxBudgetWan: "25.0",
        candidates: [...baseline.candidates, "  "],
        need: "平时一个人开，周末偶尔带父母。 ",
      },
      baseline,
    ),
    true,
  );
  assert.equal(
    isProjectFormUnchanged(
      {
        ...baseline,
        need: `${baseline.need} 还需要大后备厢。`,
      },
      baseline,
    ),
    false,
  );
  assert.equal(
    isProjectFormUnchanged(
      {
        ...baseline,
        candidates: baseline.candidates.slice(0, 2),
      },
      baseline,
    ),
    false,
  );
});

function dataProResult(
  status: "ok" | "error" | "unavailable" | "unparseable",
  data: Record<string, unknown> | null,
  error: { code: string; message: string; retryable: boolean } | null = null,
) {
  return {
    service: "datapro" as const,
    status,
    data,
    error,
    meta: {
      request_id: `request-${status}`,
      requested_at: capturedAt,
      received_at: capturedAt,
      upstream_request_id: null,
      trace_id: null,
      log_id: null,
    },
  };
}

test("fallback preserves explicit seat, CLTC range and four-wheel-drive rules", () => {
  const need =
    "需要5座，CLTC纯电续航至少200公里，必须双电机四驱；没有家充。";
  const explicit = extractExplicitFallbackConditions(need);
  assert.deepEqual(
    explicit.map((condition) => condition.rule),
    [
      { field: "seat_count", operator: "eq", value: 5, unit: "座" },
      {
        field: "cltc_pure_range_km",
        operator: "gte",
        value: 200,
        unit: "km",
      },
      { field: "drive_type", operator: "includes", value: "四驱" },
    ],
  );

  const conditions = buildConditions(
    {
      city: "杭州",
      purchaseTime: "三个月内",
      maxBudgetWan: 30,
      candidates: ["测试车型"],
      need,
    },
    null,
  );
  assert.ok(
    conditions.some(
      (condition) => condition.rule?.field === "landing_price_cny",
    ),
  );
  assert.ok(
    conditions.some((condition) => condition.rule?.field === "seat_count"),
  );
});

test("fallback preserves common charging, space, driver-assistance and efficiency rules", () => {
  const need =
    "快充时间不超过30分钟，电池容量至少35kWh，后备厢容积至少500L，轴距至少2900mm，" +
    "电动机总功率至少250kW，零百加速不超过6秒，亏电油耗不超过7L/100km，" +
    "百公里电耗不超过22kWh/100km，辅助驾驶至少L2，必须有主动刹车、车道居中和360度全景影像。";
  const explicit = extractExplicitFallbackConditions(need);
  const rules = new Map(
    explicit.map((condition) => [condition.rule?.field, condition.rule]),
  );
  assert.equal(rules.get("fast_charge_time_hours")?.value, 0.5);
  assert.equal(rules.get("fast_charge_time_hours")?.operator, "lte");
  assert.equal(rules.get("battery_capacity_kwh")?.value, 35);
  assert.equal(rules.get("trunk_volume_l")?.value, 500);
  assert.equal(rules.get("wheelbase_mm")?.value, 2900);
  assert.equal(rules.get("total_motor_power_kw")?.value, 250);
  assert.equal(rules.get("acceleration_0_100_s")?.value, 6);
  assert.equal(rules.get("low_soc_fuel_consumption_l100km")?.value, 7);
  assert.equal(rules.get("electricity_consumption_kwh100km")?.value, 22);
  assert.equal(rules.get("driver_assistance_level")?.value, 2);
  assert.equal(rules.get("active_braking")?.value, true);
  assert.equal(rules.get("lane_centering")?.value, true);
  assert.equal(rules.get("surround_view_360")?.value, true);
});

test("fallback preserves set, exclusion, colloquial efficiency and preference semantics", () => {
  const need =
    "需要6座或7座，希望增程或插混，不要SUV，电耗不高于15千瓦时每百公里，" +
    "零百加速希望5秒以内，四驱优先。";
  const explicit = extractExplicitFallbackConditions(need);
  const rules = new Map(
    explicit.map((condition) => [condition.rule?.field, condition]),
  );
  assert.deepEqual(rules.get("seat_count")?.rule, {
    field: "seat_count",
    operator: "in",
    value: [6, 7],
    unit: "座",
  });
  assert.deepEqual(rules.get("energy_type")?.rule, {
    field: "energy_type",
    operator: "in",
    value: ["增程", "插混"],
  });
  assert.equal(rules.get("body_style")?.rule?.operator, "not_in");
  assert.equal(
    rules.get("electricity_consumption_kwh100km")?.rule?.operator,
    "lte",
  );
  assert.equal(
    rules.get("electricity_consumption_kwh100km")?.rule?.value,
    15,
  );
  assert.equal(rules.get("acceleration_0_100_s")?.rule?.operator, "lte");
  assert.equal(rules.get("acceleration_0_100_s")?.rule?.value, 5);
  assert.equal(rules.get("drive_type")?.kind, "preference");
});

test("long natural-language needs are atomized without collapsing or dropping categories", () => {
  const need =
    "我在杭州上班，平时基本一个人开，周末偶尔带父母。每天来回大概45公里，公司可以充电。" +
    "比较在意辅助驾驶和后排舒适度，想要新能源汽车，油耗低，续航长，空间大，" +
    "外观/内饰好看，颜值高，有360°全景影像和倒车雷达、全景天窗、自动泊车、" +
    "安全气囊、安全性好，驾驶平稳，是热销款，口碑好，保值率高，黑色的车，" +
    "落地价接近不超过30万，要赠品";
  const atoms = extractRequirementAtoms(need);
  const concepts = new Set(atoms.map((atom) => atom.concept));
  for (const concept of [
    "work_city",
    "primary_driver",
    "family_passengers",
    "daily_commute_distance",
    "workplace_charging",
    "driver_assistance",
    "rear_seat_comfort",
    "energy_type",
    "fuel_economy",
    "driving_range",
    "interior_space",
    "exterior_style",
    "interior_style",
    "surround_view_360",
    "parking_sensors",
    "panoramic_sunroof",
    "automatic_parking",
    "airbag_configuration",
    "safety_quality",
    "ride_comfort",
    "market_popularity",
    "owner_reputation",
    "resale_value",
    "exterior_color",
    "landing_price",
    "gifts",
  ]) {
    assert.ok(concepts.has(concept), `missing ${concept}`);
  }
  assert.equal(concepts.has("unmapped_user_need"), false);
  for (const atom of atoms) {
    assert.equal(
      need.slice(atom.sourceStart, atom.sourceEnd),
      atom.sourceText,
    );
  }

  const conditions = buildConditions(
    {
      city: "杭州",
      purchaseTime: "还没确定",
      maxBudgetWan: 30,
      candidates: ["理想 L6 2024款 Max"],
      need,
    },
    null,
  );
  assert.ok(conditions.length >= 24);
  assert.equal(
    conditions.some((condition) =>
      condition.title.includes("其余真实用车体验"),
    ),
    false,
  );
  assert.ok(
    conditions.some(
      (condition) =>
        condition.concept === "workplace_charging" &&
        condition.scope === "context",
    ),
  );
  assert.ok(
    conditions.some(
      (condition) =>
        condition.concept === "market_popularity" &&
        condition.verificationMode === "sales_data",
    ),
  );
  assert.ok(
    conditions.some(
      (condition) =>
        condition.concept === "gifts" &&
        condition.verificationMode === "written_confirmation",
    ),
  );
});

test("shared predicates in a preference list do not hide supported vehicle data", () => {
  const need =
    "比较看重辅助驾驶、后排舒适度、空间、续航和能耗，也关注销量、口碑和保值表现。";
  const concepts = new Set(
    extractRequirementAtoms(need).map((atom) => atom.concept),
  );
  for (const concept of [
    "driver_assistance",
    "rear_seat_comfort",
    "interior_space",
    "driving_range",
    "fuel_economy",
    "market_popularity",
    "owner_reputation",
    "resale_value",
  ]) {
    assert.ok(concepts.has(concept), `missing ${concept}`);
  }
});

test("colloquial and product-specific preferences remain independently traceable", () => {
  const need =
    "我这人容易晕车，后排坐久了别顶头；最好开起来别窜，停车位又窄，" +
    "整辆车别有味儿，空调吹人不要太冲";
  const atoms = extractRequirementAtoms(need);
  const retained = atoms
    .filter((atom) => atom.concept === "unmapped_user_need")
    .map((atom) => atom.sourceText);

  assert.deepEqual(retained, [
    "后排坐久了别顶头",
    "最好开起来别窜",
    "停车位又窄",
    "整辆车别有味儿",
    "空调吹人不要太冲",
  ]);
  assert.ok(
    atoms.some(
      (atom) =>
        atom.concept === "motion_sickness" &&
        atom.sourceText === "我这人容易晕车",
    ),
  );
  for (const atom of atoms) {
    assert.equal(need.slice(atom.sourceStart, atom.sourceEnd), atom.sourceText);
  }
});

test("different buyer profiles keep objective facts separate from personal checks", () => {
  const scenarios = [
    {
      need: "一个人通勤，没有家充，重视辅助驾驶和充电方便",
      expectedFields: [],
    },
    {
      need: "三代家庭，需要6座，后备厢至少500L，重视二排舒适",
      expectedFields: ["seat_count", "trunk_volume_l"],
    },
    {
      need: "经常跨城，CLTC纯电续航至少500公里，快充不超过30分钟",
      expectedFields: ["cltc_pure_range_km", "fast_charge_time_hours"],
    },
    {
      need: "必须双电机四驱，零百加速不超过6秒",
      expectedFields: ["drive_type", "acceleration_0_100_s"],
    },
    {
      need: "首付8万元以内，月供不超过4000元，保险上牌计入总费用",
      expectedFields: [],
    },
  ];
  for (const [index, scenario] of scenarios.entries()) {
    const conditions = buildConditions(
      {
        city: "杭州",
        purchaseTime: "三个月内",
        maxBudgetWan: 30,
        candidates: [`测试车型 ${index + 1}`],
        need: scenario.need,
      },
      null,
    );
    const objectiveFields = conditions
      .map((condition) => condition.rule?.field)
      .filter(
        (field): field is string =>
          Boolean(field) && field !== "landing_price_cny",
      );
    assert.deepEqual(objectiveFields, scenario.expectedFields);
    assert.ok(
      conditions.every(
        (condition) =>
          condition.concept === "landing_price" ||
          Boolean(condition.sourceText) ||
          Boolean(condition.rule),
      ),
    );
  }
});

test("focused DataPro query stays a short single-entity query", () => {
  const query = buildFocusedDataProQuery("理想 L6 2025款 Max 智能焕新版", [
    {
      id: "range",
      title: "至少 200km",
      category: ConditionCategory.CONFIGURATION,
      kind: "hard",
      rule: {
        field: "cltc_pure_range_km",
        operator: "gte",
        value: 200,
      },
    },
  ]);
  assert.equal(
    query,
    "理想 L6 2025款 Max 智能焕新版 指导价、CLTC纯电续航里程",
  );
  assert.doesNotMatch(query, /精确查询|仅返回|用户条件|如果只能|车型编码/);
  assert.equal(DATAPRO_VEHICLE_TIMEOUT_MS, 90_000);
  assert.equal(DATAPRO_COMPLETE_QUERY_TIMEOUT_MS, 45_000);
  assert.equal(DATAPRO_FOCUSED_QUERY_TIMEOUT_MS, 60_000);
  assert.equal(DATAPRO_IDENTITY_QUERY_TIMEOUT_MS, 60_000);
});

test("focused DataPro requests keep one exact entity and one intent", () => {
  const queries = buildFocusedDataProQueries(
    "问界 M9 2026款 纯电 Ultimate 领世加长版 享六座",
    [
      {
        id: "assistance",
        title: "重视辅助驾驶",
        category: ConditionCategory.CONFIGURATION,
        kind: "preference",
        dataFieldHints: ["driver_assistance_system"],
      },
      {
        id: "rear-seat",
        title: "重视第二排座椅舒适度",
        category: ConditionCategory.PERSONAL_EXPERIENCE,
        kind: "preference",
        dataFieldHints: ["rear_seat_features"],
      },
    ],
  );
  assert.deepEqual(queries, [
    "问界 M9 2026款 纯电 Ultimate 领世加长版 享六座 指导价",
    "问界 M9 2026款 纯电 Ultimate 领世加长版 享六座 辅助驾驶系统",
    "问界 M9 2026款 纯电 Ultimate 领世加长版 享六座 第二排座椅功能",
  ]);
});

test("complete DataPro query requests one exact model and one configuration intent", () => {
  assert.equal(
    buildCompleteDataProQuery("理想 L6 2024款 Max"),
    "理想 L6 2024款 Max 完整配置详情",
  );
});

test("identity option query broadens only to the requested series and year", () => {
  assert.equal(
    buildVehicleIdentityOptionsQuery(
      "吉利银河 L6 EM-i 2025款 140km 探索版",
    ),
    "吉利银河 L6 EM-i 2025款 所有在售车型和指导价",
  );
});

test("identity option query keeps a selected version-series refinement", () => {
  assert.equal(
    buildVehicleIdentityOptionsQuery("问界M9 2026款 Ultra", true),
    "问界M9 2026款 Ultra 所有在售车型和指导价",
  );
});

test("identity matching uses two bounded professional-data query shapes", () => {
  assert.deepEqual(
    buildVehicleIdentityOptionQueries("问界M9 2026款"),
    [
      "问界M9 2026款 所有在售车型和指导价",
      "中国汽车车型配置库 问界M9 2026款 车型版本与价格",
    ],
  );
});

test("focused DataPro query covers every supported user condition without local truncation", () => {
  const conditions: DecisionCondition[] = [
    ["快充不超过30分钟", "fast_charge_time_minutes", "lte", 30],
    ["后备厢至少500L", "trunk_volume_l", "gte", 500],
    ["至少L2辅助驾驶", "autonomous_driving_level", "gte", 2],
    ["必须有主动刹车", "automatic_emergency_braking", "eq", true],
    ["必须有车道居中", "lane_centering_assist", "eq", true],
    ["必须有360影像", "camera_360", "eq", true],
    ["电池至少35kWh", "battery_capacity_kwh", "gte", 35],
    ["轴距至少2900mm", "wheelbase_mm", "gte", 2900],
    ["不支持的体验要求", "seat_comfort", "unknown", null],
  ].map(([title, field, operator, value], index) => ({
    id: `dynamic-${index}`,
    title: String(title),
    category: ConditionCategory.CONFIGURATION,
    kind: "hard",
    rule: {
      field: String(field),
      operator: operator as DecisionRuleOperator,
      value: value as string | number | boolean | null,
    },
  }));
  const query = buildFocusedDataProQuery("理想 L6 2025款 Max 智能焕新版", conditions);
  assert.match(query, /指导价、电池快充时间、后备厢容积、辅助驾驶系统/);
  assert.match(query, /主动刹车、车道居中保持、360度全景影像、电池能量/);
  assert.match(query, /轴距/);
  assert.doesNotMatch(query, /座椅舒适|seat_comfort/);
});

test("DataPro falls back from an oversized complete response to a focused exact query", async () => {
  const queries: string[] = [];
  const responses = [
    dataProResult(
      "error",
      {
        code: 4003,
        dataset_type: "vehicle_config",
        items: [
          {
            车型编码: "must-not-be-used",
            车型名称: "2025款 理想L6 Max 智能焕新版",
            座位数: "99座",
          },
        ],
      },
      {
        code: "datapro_business_4003",
        message: "返回字段超过200",
        retryable: false,
      },
    ),
    dataProResult("ok", {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型编码: "69628",
          车型名称: "2025款 理想L6 Max 智能焕新版",
          座位数: "5座",
        },
      ],
    }),
  ];
  const outcome = await queryVehicleDataPro(
    "理想L6 2025款 Max 智能焕新版",
    [],
    {
      async query(query: string) {
        queries.push(query);
        return responses.shift()!;
      },
    },
  );
  assert.deepEqual(queries, [
    "理想L6 2025款 Max 智能焕新版 完整配置详情",
    "理想L6 2025款 Max 智能焕新版 指导价",
  ]);
  assert.equal(outcome.mode, "focused");
  assert.equal(outcome.fallbackReason, "too_many_fields");
  const parsed = parseDataProVehiclePayload(
    outcome.result.data,
    "理想L6 2025款 Max 智能焕新版",
    capturedAt,
    "evidence-fallback",
  );
  assert.equal(parsed.exactModelId, "datapro:69628");
  assert.equal(
    parsed.facts.find((fact) => fact.field === "seat_count")?.normalizedValue,
    5,
  );
});

test("DataPro falls back for empty or unsupported complete queries only", async () => {
  for (const first of [
    dataProResult("ok", {
      code: 0,
      dataset_type: "vehicle_config",
      items: [],
    }),
    dataProResult(
      "error",
      { code: 4100, msg: "query不在支持范围" },
      {
        code: "datapro_business_4100",
        message: "query不在支持范围",
        retryable: false,
      },
    ),
  ]) {
    const queries: string[] = [];
    const outcome = await queryVehicleDataPro("测试车 2025款 精确版", [], {
      async query(query: string) {
        queries.push(query);
        return queries.length === 1
          ? first
          : dataProResult("ok", {
              code: 0,
              dataset_type: "vehicle_config",
              items: [{ 车型名称: "2025款 测试车 精确版" }],
            });
      },
    });
    assert.equal(outcome.mode, "focused");
    assert.equal(queries.length, 2);
    assert.equal(queries[1], "测试车 2025款 精确版 指导价");
  }

  const queries: string[] = [];
  const successful = dataProResult("ok", {
    code: 0,
    dataset_type: "vehicle_config",
    items: [{ 车型名称: "2025款 测试车 精确版" }],
  });
  const outcome = await queryVehicleDataPro("测试车 2025款 精确版", [], {
    async query(query: string) {
      queries.push(query);
      return successful;
    },
  });
  assert.equal(outcome.mode, "complete");
  assert.equal(outcome.fallbackReason, null);
  assert.equal(queries.length, 1);
});

test("focused DataPro merges independent user-relevant fields for one exact trim", async () => {
  const candidateName =
    "问界 M9 2026款 纯电 Ultimate 领世加长版 享六座";
  const conditions: DecisionCondition[] = [
    {
      id: "assistance",
      title: "重视辅助驾驶",
      category: ConditionCategory.CONFIGURATION,
      kind: "preference",
      dataFieldHints: ["driver_assistance_system"],
    },
    {
      id: "rear-seat",
      title: "重视第二排座椅舒适度",
      category: ConditionCategory.PERSONAL_EXPERIENCE,
      kind: "preference",
      dataFieldHints: ["rear_seat_features"],
    },
  ];
  const queries: string[] = [];
  const outcome = await queryVehicleDataPro(
    candidateName,
    conditions,
    {
      async query(query: string) {
        queries.push(query);
        if (query.endsWith("完整配置详情")) {
          return dataProResult(
            "error",
            { code: 5003, dataset_type: "vehicle_config", items: [] },
            {
              code: "datapro_business_5003",
              message: "完整配置查询失败",
              retryable: false,
            },
          );
        }
        const shared = {
          车型信息: {
            车型编码: "m9-2026-pure-ultimate-six",
            品牌: "问界（AITO/鸿蒙智行）",
            车系: "问界M9",
            年款: "2026款",
            版本: "纯电 Ultimate 领世加长版",
            座椅布局: "享六座（2+2+2布局）",
          },
        };
        if (query.endsWith("指导价")) {
          return dataProResult("ok", {
            code: 0,
            dataset_type: "vehicle_config",
            items: [
              {
                ...shared,
                车型信息: {
                  ...shared.车型信息,
                  官方指导价: "56.98万元",
                },
              },
            ],
          });
        }
        if (query.endsWith("辅助驾驶系统")) {
          return dataProResult("ok", {
            code: 0,
            dataset_type: "vehicle_config",
            items: [
              {
                ...shared,
                配置参数: {
                  辅助驾驶系统: {
                    系统名称: "华为乾崑智驾 ADS 5",
                    驾驶辅助级别: "L2",
                    主动安全: {
                      主动刹车: "标配",
                    },
                  },
                },
              },
            ],
          });
        }
        return dataProResult("ok", {
          code: 0,
          dataset_type: "vehicle_config",
          items: [
            {
              ...shared,
              配置参数: {
                第二排座椅功能: {
                  座椅加热: "标配",
                  座椅通风: "标配",
                  座椅按摩: "标配",
                },
              },
            },
          ],
        });
      },
    },
  );
  assert.equal(outcome.mode, "focused");
  assert.deepEqual(queries, [
    `${candidateName} 完整配置详情`,
    `${candidateName} 指导价`,
    `${candidateName} 辅助驾驶系统`,
    `${candidateName} 第二排座椅功能`,
  ]);
  const parsed = parseDataProVehiclePayload(
    outcome.result.data,
    candidateName,
    capturedAt,
    "evidence-focused-merge",
  );
  const facts = new Map(parsed.facts.map((item) => [item.field, item]));
  assert.equal(parsed.exactMatch, true);
  assert.equal(facts.get("guide_price_cny")?.normalizedValue, 569800);
  assert.equal(
    facts.get("driver_assistance_system")?.value,
    "华为乾崑智驾 ADS 5",
  );
  assert.equal(facts.get("driver_assistance_level")?.normalizedValue, 2);
  assert.equal(facts.get("active_braking")?.normalizedValue, true);
  assert.match(facts.get("rear_seat_features")?.value ?? "", /座椅按摩：标配/);
  assert.ok(parsed.facts.length >= 7);
});

test("returned professional data with incomplete trim identity stays visible but pending", () => {
  const evaluation = evaluateCandidateCondition(
    {
      id: "rear-comfort",
      title: "重视后排乘坐舒适度",
      category: ConditionCategory.PERSONAL_EXPERIENCE,
      kind: "preference",
      verificationMode: "self_check",
      dataFieldHints: ["rear_seat_features"],
    },
    {
      id: "m9",
      role: "target",
      vehicle: {
        exactModelId: "datapro:m9",
        manufacturer: "问界",
        series: "M9",
        modelYear: "2026款",
        trim: "纯电 Ultimate 领世加长版 享六座",
      },
      facts: [],
      unboundDataFields: ["rear_seat_features"],
    },
  );
  assert.equal(evaluation.status, DecisionStatus.PENDING);
  assert.equal(
    evaluation.pendingReason,
    PendingReason.PERSONAL_EXPERIENCE_REQUIRED,
  );
  assert.match(evaluation.summary, /车型身份已锁定.*未按当前车型标识返回/);
});

test("DataPro continues from identity-mismatched complete and focused results to the bare trim", async () => {
  const queries: string[] = [];
  const outcome = await queryVehicleDataPro(
    "赛力斯 问界M7 2025款 纯电 Max 长续航版 5座",
    [],
    {
      async query(query: string) {
        queries.push(query);
        if (queries.length === 1) {
          return dataProResult("ok", {
            code: 0,
            dataset_type: "vehicle_config",
            items: [
              {
                车型信息: {
                  品牌: "赛力斯",
                  车系: "问界M7",
                  年款: "2025款",
                  版本: "增程 Ultra 6座",
                  座位数: "6座",
                },
              },
            ],
          });
        }
        if (queries.length === 2) {
          return dataProResult("ok", {
            code: 0,
            dataset_type: "vehicle_config",
            items: [],
          });
        }
        return dataProResult("ok", {
          code: 0,
          dataset_type: "vehicle_config",
          items: [
            {
              车型信息: {
                车型编码: "m7-pure-max-5",
                品牌: "赛力斯",
                车系: "问界M7",
                年款: "2025款",
                版本: "纯电 Max 长续航版",
                座位数: "5座",
              },
            },
          ],
        });
      },
    },
  );
  assert.equal(outcome.mode, "bare_fallback");
  assert.equal(outcome.fallbackReason, "identity_mismatch");
  assert.equal(queries.length, 3);
  assert.equal(
    queries[2],
    "赛力斯 问界M7 2025款 纯电 Max 长续航版 5座",
  );
  assert.equal(
    parseDataProVehiclePayload(
      outcome.result.data,
      "赛力斯 问界M7 2025款 纯电 Max 长续航版 5座",
      capturedAt,
      "evidence-identity-fallback",
    ).exactModelId,
    "datapro:m7-pure-max-5",
  );
});

test("DataPro performs a bounded series query when exact lookup has no options", async () => {
  const queries: string[] = [];
  const requestedName =
    "吉利银河 L6 EM-i 2025款 140km 用户记不清";
  const outcome = await queryVehicleDataPro(
    requestedName,
    [],
    {
      async query(query: string) {
        queries.push(query);
        if (queries.length < 4) {
          return dataProResult("ok", {
            code: 0,
            dataset_type: "vehicle_config",
            items: [],
          });
        }
        return dataProResult("ok", {
          code: 0,
          dataset_type: "vehicle_config",
          items: [
            {
              车型编码: "l6-explore",
              车型名称: "2025款 吉利银河L6 EM-i 140km 探索版",
            },
            {
              车型编码: "l6-starship",
              车型名称: "2025款 吉利银河L6 EM-i 140km 星舰版",
            },
          ],
        });
      },
    },
  );

  assert.equal(outcome.mode, "identity_options");
  assert.deepEqual(queries, [
    "吉利银河 L6 EM-i 2025款 140km 用户记不清 完整配置详情",
    "吉利银河 L6 EM-i 2025款 140km 用户记不清 指导价",
    requestedName,
    "吉利银河 L6 EM-i 2025款 所有在售车型和指导价",
  ]);
  assert.deepEqual(
    parseDataProVehiclePayload(
      outcome.result.data,
      requestedName,
      capturedAt,
      "evidence-identity-options",
    ).identityOptions.map((option) => option.displayName),
    [
      "吉利银河 L6 EM-i 2025款 140km 探索版",
      "吉利银河 L6 EM-i 2025款 140km 星舰版",
    ],
  );
});

test("flat exact-trim payload creates facts and conservative evaluations", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型编码: "69628",
          车型名称: "2025款 理想L6 Max 智能焕新版",
          指导价: "279800",
          座位数: "5",
          驱动形式: "双电机四驱",
          "CLTC纯电续航里程(km)": "212",
        },
        {
          车型编码: "69673",
          车型名称: "2025款 理想L6 Pro 智能焕新版",
          指导价: "249800",
        },
      ],
    },
    "理想 L6 2025款 Max 智能焕新版",
    capturedAt,
    "evidence-l6",
  );
  assert.equal(parsed.exactMatch, true);
  assert.equal(parsed.exactModelId, "datapro:69628");
  assert.deepEqual(
    parsed.facts.map((item) => [item.field, item.normalizedValue]),
    [
      ["guide_price_cny", 279800],
      ["seat_count", 5],
      ["drive_type", "双电机四驱"],
      ["cltc_pure_range_km", 212],
    ],
  );

  const candidate: VehicleCandidate = {
    id: "l6",
    role: "target",
    vehicle: {
      exactModelId: parsed.exactModelId!,
      manufacturer: "理想汽车",
      series: "理想 L6",
      modelYear: "2025款",
      trim: "Max 智能焕新版",
    },
    facts: parsed.facts,
  };
  const rangeCondition: DecisionCondition = {
    id: "range",
    title: "CLTC 纯电续航至少 200km",
    category: ConditionCategory.CONFIGURATION,
    kind: "hard",
    rule: {
      field: "cltc_pure_range_km",
      operator: "gte",
      value: 200,
    },
  };
  assert.equal(
    evaluateCandidateCondition(rangeCondition, candidate).status,
    DecisionStatus.CONFIRMED,
  );
  const budget = evaluateCandidateCondition(
    {
      id: "budget",
      title: "落地预算不超过30万",
      category: ConditionCategory.BUDGET,
      kind: "hard",
      rule: {
        field: "landing_price_cny",
        operator: "lte",
        value: 300000,
      },
    },
    candidate,
  );
  assert.equal(budget.status, DecisionStatus.PENDING);
  assert.equal(budget.pendingReason, PendingReason.QUOTE_REQUIRED);
  assert.match(budget.summary, /指导价不是落地价/);
});

test("ambiguous vehicle results expose exact options instead of guessing", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型编码: "l6-explore",
          车型名称: "2025款 吉利银河L6 EM-i 140km 探索版",
        },
        {
          车型编码: "l6-starship",
          车型名称: "2025款 吉利银河L6 EM-i 140km 星舰版",
        },
        {
          车型编码: "l7-other",
          车型名称: "2025款 吉利银河L7 EM-i 115km 探索版",
        },
      ],
    },
    "吉利银河 L6 EM-i 2025款 140km",
    capturedAt,
    "evidence-l6-options",
  );

  assert.equal(parsed.exactMatch, false);
  assert.equal(parsed.exactModelId, null);
  assert.deepEqual(
    parsed.identityOptions.map((option) => [
      option.exactModelId,
      option.displayName,
    ]),
    [
      [
        "datapro:l6-explore",
        "吉利银河 L6 EM-i 2025款 140km 探索版",
      ],
      [
        "datapro:l6-starship",
        "吉利银河 L6 EM-i 2025款 140km 星舰版",
      ],
    ],
  );
});

test("identity options restore a missing brand and use a parseable order", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型编码: "a8l-luxury",
          车型名称: "2025款 风云A8L 1.5TGDI 145km 豪华型",
        },
      ],
    },
    "奇瑞 风云A8L 2025款 145km",
    capturedAt,
    "evidence-a8l-option",
  );

  assert.deepEqual(
    parsed.identityOptions.map((option) => option.displayName),
    ["奇瑞 风云A8L 2025款 1.5TGDI 145km 豪华型"],
  );
});

test("identity option labels collapse duplicated trim words", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型编码: "su7-ultra",
          品牌: "小米",
          车系: "SU7",
          车型名称: "2025款 SU7 Ultra Ultra",
        },
        {
          车型编码: "su7-ultra-nurburgring",
          品牌: "小米",
          车系: "SU7",
          车型名称: "2025款 SU7 Ultra 纽北限量版",
        },
      ],
    },
    "小米汽车 SU7 2025款 Ultra",
    capturedAt,
    "evidence-su7-options",
  );

  assert.deepEqual(
    parsed.identityOptions.map((option) => option.displayName),
    ["小米 SU7 2025款 Ultra", "小米 SU7 2025款 Ultra 纽北限量版"],
  );
});

test("coarse series names expose trim options without requiring a year", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型编码: "l6-ultra",
          品牌: "理想",
          厂商: "理想汽车",
          车系: "理想L6",
          车型名称: "2026款 理想L6 Ultra",
          年款: "2026款",
        },
        {
          车型编码: "l6-max",
          品牌: "理想",
          厂商: "理想汽车",
          车系: "理想L6",
          车型名称: "2025款 理想L6 Max 智能焕新版",
          年款: "2025款",
        },
      ],
    },
    "理想 L6",
    capturedAt,
    "evidence-coarse-l6",
  );

  assert.equal(parsed.exactMatch, false);
  assert.deepEqual(
    parsed.identityOptions.map((option) => option.displayName),
    [
      "理想汽车 L6 2026款 Ultra",
      "理想汽车 L6 2025款 Max 智能焕新版",
    ],
  );
});

test("every typed vehicle is verified until professional data binds an exact identity", () => {
  assert.equal(requiresVehicleIdentitySelection("理想 L6"), true);
  assert.equal(requiresVehicleIdentitySelection("问界 M9 2025款"), true);
  assert.equal(
    requiresVehicleIdentitySelection("理想汽车 L6 2026款 Ultra"),
    true,
  );
  assert.equal(
    requiresVehicleIdentitySelection("小米汽车 SU7 2025款 Ultra"),
    true,
  );
  assert.equal(
    requiresVehicleIdentitySelection("问界 M9 2026款", "datapro:m9-2026"),
    false,
  );
  assert.equal(
    requiresVehicleIdentitySelection(
      "比亚迪 海豹07 DM-i",
      "datapro-series:seal-07",
    ),
    true,
  );
});

test("a broad family name first exposes distinct series choices", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型编码: "seal-07",
          品牌: "比亚迪",
          厂商: "比亚迪",
          车系: "海豹07 DM-i",
          车型名称: "2026款 海豹07 DM-i 135km 豪华型",
        },
        {
          车型编码: "seal-05",
          品牌: "比亚迪",
          厂商: "比亚迪",
          车系: "海豹05 DM-i",
          车型名称: "2026款 海豹05 DM-i 128km 豪华型",
        },
      ],
    },
    "比亚迪海豹",
    capturedAt,
    "evidence-coarse-seal",
  );

  assert.equal(
    parsed.identityOptions.every((option) =>
      option.exactModelId.startsWith("datapro-series:"),
    ),
    true,
  );
  assert.deepEqual(
    parsed.identityOptions.map((option) => option.displayName),
    ["比亚迪 海豹07 DM-i", "比亚迪 海豹05 DM-i"],
  );
});

test("real year-level vehicle list expands into selectable exact M9 trims", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型信息: {
            品牌: "问界（AITO，鸿蒙智行）",
            车系: "问界M9",
            年款: "2026款",
            指导价区间: "47.98万-65.98万元",
          },
          具体车型与指导价: [
            {
              车型全称: "问界M9 2026款 增程 Max+ 5座（阔五座）",
              版本: "Max+",
              动力: "增程",
              座椅数: 5,
              厂商指导价: "47.98万元",
            },
            {
              车型全称: "问界M9 2026款 纯电 Ultra 6座（享六座）",
              版本: "Ultra",
              动力: "纯电",
              座椅数: 6,
              厂商指导价: "54.98万元",
            },
          ],
          配置参数: {
            动力与续航: {
              Max增程版: { CLTC纯电续航: "340km" },
              Ultra纯电版: { CLTC纯电续航: "715km" },
            },
          },
        },
      ],
    },
    "问界M9 2026款",
    capturedAt,
    "evidence-m9-options",
  );

  assert.equal(parsed.exactMatch, false);
  assert.deepEqual(
    parsed.identityOptions.map((option) => option.displayName),
    [
      "问界 M9 2026款 增程 Max+ 5座（阔五座）",
      "问界 M9 2026款 纯电 Ultra 6座（享六座）",
    ],
  );
  assert.equal(
    parsed.identityOptions.every((option) =>
      option.exactModelId.startsWith("datapro-name:"),
    ),
    true,
  );
  assert.deepEqual(parsed.facts, []);
});

test("nested power-type groups expand into exact M7 trim candidates", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型信息: {
            品牌: "问界",
            车系: "M7",
            年款: "2026款",
          },
          配置参数: {
            在售车型版本及价格: {
              "2026款增程版": [
                {
                  车型版本: "增程 Pro+四驱版 5座",
                  官方指导价: "27.98万",
                },
                {
                  车型版本: "增程 Max长续航版 6座",
                  官方指导价: "31.98万",
                },
              ],
              "2026款纯电版": [
                {
                  车型版本: "纯电 Max四驱版 5座",
                  官方指导价: "33.98万",
                },
              ],
            },
          },
        },
      ],
    },
    "问界 M7",
    capturedAt,
    "evidence-m7-nested-groups",
  );

  assert.deepEqual(
    parsed.identityOptions.map((option) => option.displayName),
    [
      "问界 M7 2026款 增程 Pro+四驱版 5座",
      "问界 M7 2026款 增程 Max长续航版 6座",
      "问界 M7 2026款 纯电 Max四驱版 5座",
    ],
  );
  assert.equal(
    parsed.identityOptions.every(
      (option) =>
        !option.exactModelId.startsWith("datapro-series:"),
    ),
    true,
  );
});

test("observed R7 EV and EREV rows become exact selectable trims", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型编码: "71421",
          品牌: "智界",
          厂商: "奇瑞汽车",
          车系: "智界R7 EREV",
          车型名称: "2026款 智界R7 增程 Max(192线激光雷达）",
          年款: "2026款",
          销售状态: "在售",
          指导价: "249800",
        },
        {
          车型编码: "71424",
          品牌: "智界",
          厂商: "奇瑞汽车",
          车系: "智界R7 EV",
          车型名称: "2026款 智界R7 纯电 Max(192线激光雷达）",
          年款: "2026款",
          销售状态: "在售",
          指导价: "249800",
        },
      ],
    },
    "智界 R7",
    capturedAt,
    "evidence-r7-options",
  );

  assert.deepEqual(
    parsed.identityOptions.map((option) => [
      option.displayName,
      option.exactModelId,
    ]),
    [
      [
        "智界 R7 2026款 增程 Max(192线激光雷达）",
        "datapro:71421",
      ],
      [
        "智界 R7 2026款 纯电 Max(192线激光雷达）",
        "datapro:71424",
      ],
    ],
  );
});

test("a selected professional-data code stays bound even when display text differs", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型编码: "71421",
          品牌: "智界",
          车系: "智界R7 EREV",
          车型名称: "2026款 智界R7 增程 Max(192线激光雷达）",
          年款: "2026款",
          座位数: "5座",
        },
        {
          车型编码: "71424",
          品牌: "智界",
          车系: "智界R7 EV",
          车型名称: "2026款 智界R7 纯电 Max(192线激光雷达）",
          年款: "2026款",
          座位数: "5座",
        },
      ],
    },
    "用户已经选择的智界 R7",
    capturedAt,
    "evidence-selected-code",
    { selectedExactModelId: "datapro:71421" },
  );

  assert.equal(parsed.exactMatch, true);
  assert.equal(parsed.exactModelId, "datapro:71421");
  assert.equal(
    parsed.matchedModelName,
    "2026款 智界R7 增程 Max(192线激光雷达）",
  );
  assert.deepEqual(parsed.identityOptions, []);
});

test("a selected professional-data name stays bound without a numeric code", () => {
  const returnedName = "2026款 轩逸经典 1.6L CVT安心版";
  const selectedExactModelId =
    `datapro-name:${encodeURIComponent(returnedName)}`;
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型信息: {
            品牌: "东风日产",
            车系: "轩逸",
            车型名称: returnedName,
          },
          座位数: "5座",
        },
      ],
    },
    "东风日产 轩逸 2026款 1.6L CVT舒适版",
    capturedAt,
    "evidence-selected-name",
    { selectedExactModelId },
  );

  assert.equal(parsed.exactMatch, true);
  assert.equal(parsed.exactModelId, selectedExactModelId);
  assert.equal(parsed.matchedModelName, returnedName);
  assert.deepEqual(parsed.identityOptions, []);
});

test("a locked identity never adopts facts from another returned trim", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型编码: "71424",
          车型名称: "2026款 智界R7 纯电 Max(192线激光雷达）",
          座位数: "5座",
        },
      ],
    },
    "智界 R7 2026款 增程 Max",
    capturedAt,
    "evidence-selected-code-missing",
    { selectedExactModelId: "datapro:71421" },
  );

  assert.equal(parsed.exactMatch, false);
  assert.equal(parsed.exactModelId, null);
  assert.deepEqual(parsed.facts, []);
  assert.deepEqual(parsed.identityOptions, []);
});

test("observed nested 轩逸 rows using 车型 become exact selectable trims", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型信息: {
            品牌: "东风日产",
            车系: "轩逸",
          },
          在售车型及指导价: {
            "2026款经典版": [
              {
                车型: "2026款 轩逸经典 1.6L CVT安心版",
                指导价: "7.99万元",
              },
            ],
            "超混电驱e-POWER版": [
              {
                车型: "e-POWER 全电驱Pro",
                指导价: "13.89万元",
              },
            ],
          },
        },
      ],
    },
    "东风日产 轩逸",
    capturedAt,
    "evidence-sylphy-options",
  );

  assert.deepEqual(
    parsed.identityOptions.map((option) => option.displayName),
    [
      "东风日产 轩逸 2026款 经典 1.6L CVT安心版",
      "东风日产 轩逸 e-POWER 全电驱Pro",
    ],
  );
  assert.equal(
    parsed.identityOptions.every((option) =>
      option.exactModelId.startsWith("datapro-name:"),
    ),
    true,
  );
});

test("nested vehicle price details expand into selectable exact M9 trims", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型信息: {
            品牌: "AITO问界",
            车系: "问界M9",
            年款: "2026款",
            指导价区间: "47.98万元-65.98万元",
            版本系列: ["Max+", "Ultra", "Ultimate 领世加长版"],
          },
          配置参数: {
            车型指导价明细: [
              {
                车型全称: "2026款 增程 Max+ 五座版",
                动力类型: "增程式混动",
                座位数: "5座",
                官方指导价: "47.98万元",
              },
              {
                车型全称: "2026款 纯电 Ultra 六座版",
                动力类型: "纯电动",
                座位数: "6座",
                官方指导价: "54.98万元",
              },
            ],
            核心标配配置: "不应混入任一具体版本的聚合字段",
          },
        },
      ],
    },
    "问界M9 2026款",
    "2026-07-29T08:00:00.000Z",
    "evidence-m9-nested",
  );

  assert.equal(parsed.exactMatch, false);
  assert.deepEqual(
    parsed.identityOptions.map((option) => option.displayName),
    [
      "AITO问界 M9 2026款 增程 Max+ 五座版",
      "AITO问界 M9 2026款 纯电 Ultra 六座版",
    ],
  );
  assert.equal(parsed.facts.length, 0);
});

test("in-sale vehicle list expands into selectable exact M9 trims", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型信息: {
            品牌: "AITO问界",
            车系: "问界M9",
            年款: "2026款",
          },
          配置参数: {
            在售车型列表: [
              {
                车型全称: "2026款 增程 Max+ 五座版",
                官方指导价: "47.98万元",
              },
              {
                车型全称: "2026款 纯电 Ultra 六座版",
                官方指导价: "54.98万元",
              },
            ],
          },
        },
      ],
    },
    "问界M9 2026款",
    capturedAt,
    "evidence-m9-in-sale",
  );

  assert.equal(parsed.exactMatch, false);
  assert.deepEqual(
    parsed.identityOptions.map((option) => option.displayName),
    [
      "AITO问界 M9 2026款 增程 Max+ 五座版",
      "AITO问界 M9 2026款 纯电 Ultra 六座版",
    ],
  );
});

test("observed dynamic in-sale price key expands and filters the selected M9 version", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型信息: {
            品牌: "问界（鸿蒙智行）",
            车系: "问界M9",
            年款: "2026款",
            版本梯度: ["Max+", "Ultra", "Ultimate领世加长版"],
          },
          配置参数: {
            "Max+在售车型及指导价": [
              {
                车型名称: "问界M9 2026款 增程 Max+ 阔五座",
                版型: "Max+",
                动力类型: "增程",
                座椅布局: "阔五座",
                指导价: "47.98万元",
              },
              {
                车型名称: "问界M9 2026款 纯电 Max+ 享六座",
                版型: "Max+",
                动力类型: "纯电",
                座椅布局: "享六座",
                指导价: "50.98万元",
              },
            ],
            "全系在售车型及完整指导价（8款常规版型）": [
              {
                车型名称: "问界M9 2026款 增程 Max+ 阔五座",
                指导价: "47.98万元",
              },
              {
                车型名称: "问界M9 2026款 增程 Ultra 阔五座",
                指导价: "53.98万元",
              },
            ],
            "Max+版本价格区间": "47.98万元-50.98万元",
          },
        },
      ],
    },
    "问界 M9 2026款 Max+",
    capturedAt,
    "evidence-m9-max-plus-observed",
    { selectedSeriesRefinement: true },
  );

  assert.equal(parsed.exactMatch, false);
  assert.deepEqual(
    parsed.identityOptions.map((option) => option.displayName),
    [
      "问界 M9 2026款 增程 Max+ 阔五座",
      "问界 M9 2026款 纯电 Max+ 享六座",
    ],
  );
  assert.equal(
    parsed.identityOptions.every((option) =>
      option.exactModelId.startsWith("datapro-name:"),
    ),
    true,
  );
});

test("observed all-version price list only returns the selected M9 version", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型信息: {
            品牌: "问界",
            车系: "问界M9",
            年款: "2026款",
          },
          配置参数: {
            在售车型及指导价: [
              {
                车型名称: "问界M9 2026款 增程 Max+ 阔五座",
                指导价: "47.98万元",
              },
              {
                车型名称: "问界M9 2026款 纯电 Max+ 享六座",
                指导价: "50.98万元",
              },
              {
                车型名称: "问界M9 2026款 增程 Ultra 阔五座",
                指导价: "53.98万元",
              },
              {
                车型名称:
                  "问界M9 2026款 纯电 Ultimate 领世加长版 享六座",
                指导价: "65.98万元",
              },
            ],
          },
        },
      ],
    },
    "问界 M9 2026款 Ultra",
    capturedAt,
    "evidence-m9-ultra-observed",
    { selectedSeriesRefinement: true },
  );

  assert.deepEqual(
    parsed.identityOptions.map((option) => option.displayName),
    ["问界 M9 2026款 增程 Ultra 阔五座"],
  );
});

test("identity option keeps the requested series when a returned trim omits it", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型信息: {
            品牌: "问界（鸿蒙智行）",
            车系: "问界M9",
            年款: "2026款",
          },
          配置参数: {
            在售车型及指导价: [
              {
                车型名称: "2026款 增程 Max+版 5座",
                指导价: "47.98万元",
              },
            ],
          },
        },
      ],
    },
    "问界 M9 2026款",
    capturedAt,
    "evidence-m9-series-name",
  );

  assert.deepEqual(
    parsed.identityOptions.map((option) => option.displayName),
    ["问界 M9 2026款 增程 Max+版 5座"],
  );
});

test("a returned version series remains a refinement instead of an exact trim", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型信息: {
            品牌: "AITO问界",
            车系: "问界M9",
            年款: "2026款",
            版本: "Max+系列",
          },
        },
      ],
    },
    "问界 M9 2026款",
    capturedAt,
    "evidence-m9-series-refinement",
  );

  assert.deepEqual(
    parsed.identityOptions.map((option) => [
      option.displayName,
      option.exactModelId.startsWith("datapro-series:"),
    ]),
    [["AITO问界 M9 2026款 Max+系列", true]],
  );
});

test("five-seat and six-seat marketing labels bind to the same exact trim", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型名称: "问界M9 2026款 增程 Max+ 阔五座",
          品牌: "问界",
          车系: "问界M9",
          年款: "2026款",
          座椅布局: "阔五座",
          指导价: "47.98万元",
        },
      ],
    },
    "问界 M9 2026款 增程 Max+版 5座",
    capturedAt,
    "evidence-m9-five-seat-alias",
  );

  assert.equal(parsed.exactMatch, true);
  assert.match(parsed.exactModelId ?? "", /^datapro-name:/);
  assert.equal(parsed.matchedModelName, "问界M9 2026款 增程 Max+ 阔五座");
});

test("an exact power and seat request never degrades to a version aggregate", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型信息: {
            品牌: "AITO问界",
            车系: "问界M9",
            年款: "2026款",
            版本: "Ultimate领世加长版",
          },
          配置参数: {
            指导价区间: "64.98万元-65.98万元",
          },
        },
      ],
    },
    "问界 M9 2026款 纯电 Ultimate 领世加长版 享六座",
    capturedAt,
    "evidence-m9-no-specificity-regression",
  );

  assert.equal(parsed.exactMatch, false);
  assert.deepEqual(parsed.identityOptions, []);
});

test("a year-level aggregate is never accepted as one exact trim", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型信息: {
            品牌: "AITO问界",
            车系: "问界M9",
            年款: "2026款",
            版本系列: ["Max+", "Ultra"],
          },
          配置参数: {
            官方指导价区间: "47.98万元-54.98万元",
          },
        },
      ],
    },
    "问界M9 2026款",
    capturedAt,
    "evidence-m9-aggregate",
  );

  assert.equal(parsed.exactMatch, false);
  assert.equal(parsed.exactModelId, null);
  assert.deepEqual(parsed.facts, []);
  assert.deepEqual(
    parsed.identityOptions.map((option) => [
      option.displayName,
      option.exactModelId.startsWith("datapro-series:"),
    ]),
    [
      ["AITO问界 M9 2026款 Max+", true],
      ["AITO问界 M9 2026款 Ultra", true],
    ],
  );
});

test("version-difference keys become refinement choices, not exact trims", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型信息: {
            品牌: "AITO问界",
            车系: "问界M9",
            年款: "2026款",
          },
          配置参数: {
            版本配置差异: {
              "Max+系列定位": "入门版本",
              "Max+增程版续航": "340km",
              Ultra系列新增配置: "二排零重力座椅",
              Ultimate领世加长版定位: "旗舰版本",
            },
          },
        },
      ],
    },
    "问界M9 2026款",
    capturedAt,
    "evidence-m9-version-refinements",
  );

  assert.deepEqual(
    parsed.identityOptions.map((option) => option.displayName),
    [
      "AITO问界 M9 2026款 Max+",
      "AITO问界 M9 2026款 Ultra",
      "AITO问界 M9 2026款 Ultimate领世加长版",
    ],
  );
  assert.equal(
    parsed.identityOptions.every((option) =>
      option.exactModelId.startsWith("datapro-series:"),
    ),
    true,
  );
});

test("brand-only input is not turned into arbitrary trim suggestions", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型编码: "glc",
          品牌: "奔驰",
          厂商: "奔驰",
          车系: "奔驰GLC",
          车型名称: "2026款 奔驰GLC 260 L",
        },
        {
          车型编码: "cle",
          品牌: "奔驰",
          厂商: "奔驰",
          车系: "奔驰CLE级",
          车型名称: "2026款 奔驰CLE 260",
        },
      ],
    },
    "奔驰",
    capturedAt,
    "evidence-brand-only",
  );

  assert.equal(parsed.exactMatch, false);
  assert.deepEqual(parsed.identityOptions, []);
});

test("decorative availability markers do not hide an exact seat count", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型编码: "69628",
          车型名称: "2025款 理想L6 Max 智能焕新版",
          座位数: "5●",
          驱动形式: "双电机四驱●",
        },
      ],
    },
    "理想 L6 2025款 Max 智能焕新版",
    capturedAt,
    "evidence-seat-marker",
  );
  assert.equal(
    parsed.facts.find((fact) => fact.field === "seat_count")?.normalizedValue,
    5,
  );
  assert.equal(
    parsed.facts.find((fact) => fact.field === "seat_count")?.value,
    "5",
  );
  assert.equal(
    parsed.facts.find((fact) => fact.field === "drive_type")?.value,
    "双电机四驱",
  );
});

test("real extended vehicle-config fields become conservative comparable facts", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型编码: "69628",
          车型名称: "2025款 理想L6 Max 智能焕新版",
          年款: "2025款",
          "电池快充时间(小时)": "0.33",
          "电池能量(kWh)": "36.8",
          "长度(mm)": "4925",
          "宽度(mm)": "1960",
          "高度(mm)": "1735",
          "轴距(mm)": "2920",
          "后备厢容积(L)": "751",
          辅助驾驶等级: "L2●",
          "主动刹车/主动安全系统": "●",
          车道居中保持: "●",
          驾驶辅助影像: "360度全景影像●/车侧盲区影像●",
          "电动机总功率(kW)": "300",
          "官方0-100km/h加速(s)": "5.4",
          "最低荷电状态油耗(L/100km)WLTC": "6.9",
          "WLTC综合油耗(L/100km)": "0.72",
          "百公里耗电量(kWh/100km)": "21.1",
          燃料类型: "增程式电动",
        },
      ],
    },
    "理想 L6 2025款 Max 智能焕新版",
    capturedAt,
    "evidence-extended",
  );
  assert.equal(parsed.exactMatch, true);
  const values = new Map(
    parsed.facts.map((item) => [item.field, item.normalizedValue]),
  );
  assert.equal(values.get("fast_charge_time_hours"), 0.33);
  assert.equal(values.get("battery_capacity_kwh"), 36.8);
  assert.equal(values.get("vehicle_length_mm"), 4925);
  assert.equal(values.get("vehicle_width_mm"), 1960);
  assert.equal(values.get("vehicle_height_mm"), 1735);
  assert.equal(values.get("wheelbase_mm"), 2920);
  assert.equal(values.get("trunk_volume_l"), 751);
  assert.equal(values.get("driver_assistance_level"), 2);
  assert.equal(values.get("active_braking"), true);
  assert.equal(values.get("lane_centering"), true);
  assert.equal(values.get("surround_view_360"), true);
  assert.equal(values.get("total_motor_power_kw"), 300);
  assert.equal(values.get("acceleration_0_100_s"), 5.4);
  assert.equal(values.get("low_soc_fuel_consumption_l100km"), 6.9);
  assert.equal(values.get("wltc_fuel_consumption_l100km"), 0.72);
  assert.equal(values.get("electricity_consumption_kwh100km"), 21.1);
  assert.equal(values.get("energy_type"), "增程式电动");

  const candidate: VehicleCandidate = {
    id: "extended-l6",
    role: "target",
    vehicle: {
      exactModelId: parsed.exactModelId!,
      manufacturer: "理想",
      series: "理想 L6",
      modelYear: "2025款",
      trim: "Max 智能焕新版",
    },
    facts: parsed.facts,
  };
  const conditions: DecisionCondition[] = [
    {
      id: "fast-charge",
      title: "快充不超过30分钟",
      category: ConditionCategory.CONFIGURATION,
      kind: "hard",
      rule: {
        field: "fast_charge_time_hours",
        operator: "lte",
        value: 0.5,
      },
    },
    {
      id: "trunk",
      title: "后备厢至少500L",
      category: ConditionCategory.CONFIGURATION,
      kind: "hard",
      rule: { field: "trunk_volume_l", operator: "gte", value: 500 },
    },
    {
      id: "aeb",
      title: "必须有主动刹车",
      category: ConditionCategory.CONFIGURATION,
      kind: "hard",
      rule: { field: "active_braking", operator: "eq", value: true },
    },
    {
      id: "acceleration",
      title: "零百加速不超过6秒",
      category: ConditionCategory.CONFIGURATION,
      kind: "hard",
      rule: { field: "acceleration_0_100_s", operator: "lte", value: 6 },
    },
  ];
  for (const condition of conditions) {
    assert.equal(
      evaluateCandidateCondition(condition, candidate).status,
      DecisionStatus.CONFIRMED,
    );
  }
});

test("complete configuration payload exposes safety, comfort, range and color facts", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型编码: "63551",
          品牌: "理想",
          车型名称: "2024款 理想L6 Max",
          "车型完整配置JSON，键为中文配置项名称，值为对应配置值": {
            车型编码: "63551",
            车型名称: "2024款 理想L6 Max",
            辅助驾驶系统: "理想AD Max●",
            "前/后驻车雷达": "前● / 后●",
            天窗类型: "不可开启全景天窗●",
            辅助泊车入位: "●",
            "主/副驾驶座安全气囊": "主● / 副●",
            "前/后排头部气囊(气帘)": "前● / 后●",
            第二排座椅功能: "加热●/通风●",
            "CLTC综合续航(km)": "1390",
            "WLTC纯电续航里程(km)": "182",
            "WLTC综合续航(km)": "1160",
            外观颜色: "灰色金属漆、黑色金属漆",
            热泵空调: "●",
          },
        },
      ],
    },
    "理想汽车 L6 2024款 Max",
    capturedAt,
    "evidence-complete",
  );
  const facts = new Map(parsed.facts.map((fact) => [fact.field, fact]));
  assert.equal(facts.get("driver_assistance_system")?.value, "理想AD Max");
  assert.equal(facts.get("parking_sensors")?.normalizedValue, true);
  assert.equal(facts.get("panoramic_sunroof")?.normalizedValue, true);
  assert.equal(facts.get("automatic_parking")?.normalizedValue, true);
  assert.equal(facts.get("airbag_configuration")?.normalizedValue, true);
  assert.equal(facts.get("rear_seat_features")?.value, "加热/通风");
  assert.equal(facts.get("cltc_total_range_km")?.normalizedValue, 1390);
  assert.equal(facts.get("wltc_pure_range_km")?.normalizedValue, 182);
  assert.equal(facts.get("wltc_total_range_km")?.normalizedValue, 1160);
  assert.match(facts.get("exterior_color")?.value ?? "", /黑色/);

  const heatPumpField = `datapro_raw:${encodeURIComponent("热泵空调")}`;
  assert.equal(facts.get(heatPumpField)?.normalizedValue, true);

  const candidate: VehicleCandidate = {
    id: "complete-l6",
    role: "target",
    vehicle: {
      exactModelId: parsed.exactModelId!,
      manufacturer: "理想汽车",
      series: "理想 L6",
      modelYear: "2024款",
      trim: "Max",
    },
    facts: parsed.facts,
  };
  const heatPumpEvaluation = evaluateCandidateCondition(
    {
      id: "heat-pump",
      title: "必须有热泵空调",
      sourceText: "必须有热泵空调",
      category: ConditionCategory.CONFIGURATION,
      kind: "hard",
      rule: {
        field: "heat_pump_air_conditioning",
        operator: "exists",
        value: true,
      },
    },
    candidate,
  );
  assert.equal(heatPumpEvaluation.status, DecisionStatus.CONFIRMED);
  assert.deepEqual(heatPumpEvaluation.factFields, [heatPumpField]);

  const assistanceEvaluation = evaluateCandidateCondition(
    {
      id: "assistance-preference",
      title: "重视辅助驾驶能力",
      sourceText: "重视辅助驾驶能力",
      category: ConditionCategory.CONFIGURATION,
      kind: "preference",
      dataFieldHints: [
        "driver_assistance_system",
        "driver_assistance_level",
      ],
    },
    candidate,
  );
  assert.equal(assistanceEvaluation.status, DecisionStatus.PENDING);
  assert.equal(
    assistanceEvaluation.pendingReason,
    PendingReason.PERSONAL_EXPERIENCE_REQUIRED,
  );
  assert.deepEqual(assistanceEvaluation.factFields, [
    "driver_assistance_system",
  ]);
});

test("nested exact M7 list uses minimum conditional CLTC value for gte only", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型信息: {
            品牌: "赛力斯汽车",
            车系: "问界M7",
            年款: "2025款",
            车型列表: [
              {
                车型编码: "m7-pure-max-5",
                车型名称: "2025款 问界M7 纯电 Max 长续航版 5座",
                指导价: "31.98万元",
                座位数: "5座",
                配置参数: {
                  驱动形式: "单电机后驱",
                  CLTC纯电续航里程: [
                    { value: 710, unit: "km", condition: "标准轮毂" },
                    { value: 680, unit: "km", condition: "大尺寸轮毂" },
                  ],
                },
              },
              {
                车型编码: "m7-other",
                车型名称: "2025款 问界M7 纯电 Ultra 四驱版 6座",
              },
            ],
          },
        },
      ],
    },
    "赛力斯 问界M7 2025款 纯电 Max 长续航版 5座",
    capturedAt,
    "evidence-m7",
  );
  assert.equal(parsed.exactMatch, true);
  assert.equal(parsed.exactModelId, "datapro:m7-pure-max-5");
  const range = parsed.facts.find(
    (item) => item.field === "cltc_pure_range_km",
  );
  assert.equal(range?.normalizedValue, 680);
  assert.match(range?.value ?? "", /710km.*680km/);

  const candidate: VehicleCandidate = {
    id: "m7",
    role: "alternative",
    vehicle: {
      exactModelId: parsed.exactModelId!,
      manufacturer: "赛力斯汽车",
      series: "问界 M7",
      modelYear: "2025款",
      trim: "纯电 Max 长续航版 5座",
    },
    facts: parsed.facts,
  };
  const drive = evaluateCandidateCondition(
    {
      id: "drive",
      title: "必须四驱",
      category: ConditionCategory.CONFIGURATION,
      kind: "hard",
      rule: { field: "drive_type", operator: "includes", value: "四驱" },
    },
    candidate,
  );
  assert.equal(drive.status, DecisionStatus.CONFLICT);
  const rangeGte = evaluateCandidateCondition(
    {
      id: "range",
      title: "至少200km",
      category: ConditionCategory.CONFIGURATION,
      kind: "hard",
      rule: {
        field: "cltc_pure_range_km",
        operator: "gte",
        value: 200,
      },
    },
    candidate,
  );
  assert.equal(rangeGte.status, DecisionStatus.CONFIRMED);
});

test("nested 车型信息 plus 配置参数 exact payload is parsed without flattening unrelated trims", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型信息: {
            车型编码: "m7-exact",
            车型名称: "2025款 问界M7 纯电 Max 长续航版 5座",
            指导价: "31.98万元",
            座位数: "5座",
          },
          配置参数: {
            驱动形式: "单电机后驱",
            CLTC纯电续航: [
              { value: 710, unit: "km", condition: "标准轮毂" },
              { value: 680, unit: "km", condition: "大尺寸轮毂" },
            ],
          },
        },
      ],
    },
    "赛力斯 问界M7 2025款 纯电 Max 长续航版 5座",
    capturedAt,
    "evidence-m7-exact",
  );
  assert.equal(parsed.exactModelId, "datapro:m7-exact");
  assert.deepEqual(
    parsed.facts.map((item) => item.field),
    [
      "guide_price_cny",
      "seat_count",
      "drive_type",
      "cltc_pure_range_km",
    ],
  );
});

test("real nested M7 shape uses version plus seat count as exact identity", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型信息: {
            车型编码: "m7-real-shape",
            品牌: "赛力斯",
            车系: "问界M7",
            年款: "2025款",
            版本: "纯电 Max 长续航版",
            座位数: "5座",
            指导价: "31.98万元",
          },
          配置参数: {
            驱动形式: "单电机后驱",
            CLTC纯电续航: "710/680 km",
          },
        },
      ],
    },
    "赛力斯 问界M7 2025款 纯电 Max 长续航版 5座",
    capturedAt,
    "evidence-m7-real",
  );
  assert.equal(parsed.exactMatch, true);
  assert.equal(parsed.exactModelId, "datapro:m7-real-shape");
  assert.equal(parsed.matchedModelName?.endsWith("5座"), true);
});

test("real M7 CLTC fields merge conditional range values but ignore charging gains", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型信息: {
            车型编码: "m7-real-cltc",
            品牌: "赛力斯",
            车系: "问界M7",
            年款: "2025款",
            版本: "纯电 Max 长续航版",
            座位数: "5座",
          },
          配置参数: {
            动力与续航: {
              CLTC纯电续航里程: "710km（标准轮毂）",
              CLTC续航说明:
                "大尺寸轮毂对应680km；充电10分钟增加400km",
            },
          },
        },
      ],
    },
    "赛力斯 问界M7 2025款 纯电 Max 长续航版 5座",
    capturedAt,
    "evidence-m7-real-cltc",
  );
  const range = parsed.facts.find(
    (item) => item.field === "cltc_pure_range_km",
  );
  assert.equal(range?.normalizedValue, 680);
  assert.match(range?.value ?? "", /710km.*680km/);
  assert.doesNotMatch(String(range?.normalizedValue), /400/);
});

test("flat multi-value CLTC keeps both values and evaluates gte from the minimum", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型编码: "m7-flat-range",
          车型名称: "2025款 问界M7 纯电 Max 长续航版 5座",
          "CLTC纯电续航里程(km)": "710/680 km",
        },
      ],
    },
    "问界M7 2025款 纯电 Max 长续航版 5座",
    capturedAt,
    "evidence-m7-flat-range",
  );
  const range = parsed.facts.find(
    (item) => item.field === "cltc_pure_range_km",
  );
  assert.equal(range?.value, "710/680 km");
  assert.equal(range?.normalizedValue, 680);
  assert.equal(
    evaluateCandidateCondition(
      {
        id: "range",
        title: "CLTC 纯电续航至少 700km",
        category: ConditionCategory.CONFIGURATION,
        kind: "hard",
        rule: {
          field: "cltc_pure_range_km",
          operator: "gte",
          value: 700,
        },
      },
      {
        id: "m7",
        role: "target",
        vehicle: {
          exactModelId: parsed.exactModelId!,
          manufacturer: "赛力斯",
          series: "问界M7",
          modelYear: "2025款",
          trim: "纯电 Max 长续航版 5座",
        },
        facts: parsed.facts,
      },
    ).status,
    DecisionStatus.CONFLICT,
  );
});

test("requested model year must be present in the same returned item", () => {
  const withoutYear = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型编码: "l6-no-year",
          车型名称: "理想L6 Max 智能焕新版",
          座位数: "5座",
        },
      ],
    },
    "理想L6 2025款 Max 智能焕新版",
    capturedAt,
    "evidence-no-year",
  );
  assert.equal(withoutYear.exactMatch, false);

  const withSeparateYear = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型编码: "l6-with-year",
          车型名称: "理想L6 Max 智能焕新版",
          年款: "2025款",
          座位数: "5座",
        },
      ],
    },
    "理想L6 2025款 Max 智能焕新版",
    capturedAt,
    "evidence-with-year",
  );
  assert.equal(withSeparateYear.exactMatch, true);
});

test("a broader requested trim never adopts a more specific returned trim", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型编码: "l6-pro-refresh",
          车型名称: "2025款 理想L6 Pro 智能焕新版",
          指导价: "249800",
        },
      ],
    },
    "理想 L6 2025款 Pro",
    capturedAt,
    "evidence-broader-trim",
  );
  assert.equal(parsed.exactMatch, false);
  assert.deepEqual(parsed.facts, []);
});

test("a precise requested trim never adopts a year-level returned model", () => {
  const parsed = parseDataProVehiclePayload(
    {
      code: 0,
      dataset_type: "vehicle_config",
      items: [
        {
          车型编码: "m7-year-only",
          品牌: "问界",
          车系: "问界M7",
          车型名称: "2025款 问界M7",
          年款: "2025款",
          座位数: "5座/6座",
        },
      ],
    },
    "问界 M7 2025款 纯电 Max 长续航版 5座",
    capturedAt,
    "evidence-m7-year-only",
  );
  assert.equal(parsed.exactMatch, false);
  assert.deepEqual(parsed.facts, []);
});

test("unsupported or aggregated M7 response never creates exact facts", () => {
  const payload = {
    code: 0,
    dataset_type: "vehicle_config",
    items: [
      {
        车型信息: {
          品牌: "问界",
          车系: "M7",
          年款: "2025款",
        },
        配置参数: {
          座位数: { 可选布局: ["大五座（5座）", "享六座（6座）"] },
        },
      },
    ],
  };
  const parsed = parseDataProVehiclePayload(
    payload,
    "问界 M7 2025款 Ultra 五座后驱版",
    capturedAt,
    "evidence-unsupported",
  );
  assert.equal(parsed.exactMatch, false);
  assert.deepEqual(parsed.facts, []);
});

test("answer disposition distinguishes conflict from uncertainty", () => {
  assert.equal(classifyProjectAnswer("符合我的需要"), "affirmative");
  assert.equal(classifyProjectAnswer("不符合我的需要"), "negative");
  assert.equal(classifyProjectAnswer("仍不确定"), "uncertain");
  assert.equal(classifyProjectAnswer("报价还缺费用项"), "uncertain");
});

test("stored user confirmation restores dependencies, basis and invalidation metadata", () => {
  const confirmation = restoreUserConfirmation(
    {
      confirmedAt: capturedAt,
      dependsOn: [
        ConfirmationDependency.MODEL_YEAR,
        ConfirmationDependency.TRIM,
        ConfirmationDependency.QUOTE_VERSION,
      ],
      basis: {
        modelYear: "2025款",
        trim: "Max 智能焕新版",
        quoteVersion: "quote-v2",
      },
      note: "本人已复核",
      invalidatedBy: [ConfirmationDependency.QUOTE_VERSION],
    },
    "2026-07-27T09:00:00.000Z",
  );
  assert.deepEqual(confirmation, {
    confirmedAt: capturedAt,
    dependsOn: [
      ConfirmationDependency.MODEL_YEAR,
      ConfirmationDependency.TRIM,
      ConfirmationDependency.QUOTE_VERSION,
    ],
    basis: {
      modelYear: "2025款",
      trim: "Max 智能焕新版",
      quoteVersion: "quote-v2",
    },
    note: "本人已复核",
    invalidatedBy: [ConfirmationDependency.QUOTE_VERSION],
  });
});

test("landing quote requires one explicit exact total", () => {
  assert.equal(
    parseExplicitLandingQuoteCny("销售给出的落地报价为 28.6 万元"),
    286000,
  );
  assert.equal(
    parseExplicitLandingQuoteCny("落地总价 286,000 元，含保险 8,000 元"),
    286000,
  );
  assert.equal(parseExplicitLandingQuoteCny("我已有完整报价"), undefined);
  assert.equal(parseExplicitLandingQuoteCny("报价是 28.6 万元"), undefined);
  assert.equal(
    parseExplicitLandingQuoteCny("落地价约 28.6 万元"),
    undefined,
  );
  assert.equal(
    parseExplicitLandingQuoteCny("落地价 28–30 万元"),
    undefined,
  );
});

test("complete landing quote is compared with the budget rule", () => {
  const condition: DecisionCondition = {
    id: "budget",
    title: "落地预算不超过 30 万元",
    category: ConditionCategory.BUDGET,
    kind: "hard",
    rule: {
      field: "landing_price_cny",
      operator: "lte",
      value: 300000,
    },
  };
  const candidate = (amount: number): VehicleCandidate => ({
    id: "quoted-car",
    role: "target",
    vehicle: {
      exactModelId: "quoted-car",
      manufacturer: "测试品牌",
      series: "测试车系",
      modelYear: "2025款",
      trim: "旗舰版",
    },
    quote: {
      version: `quote-${amount}`,
      totalAmountCny: amount,
    },
  });
  assert.equal(
    evaluateCandidateCondition(condition, candidate(286000)).status,
    DecisionStatus.CONFIRMED,
  );
  assert.equal(
    evaluateCandidateCondition(condition, candidate(319800)).status,
    DecisionStatus.CONFLICT,
  );
});

test("drive matching distinguishes front, rear, four-wheel and dual-motor intent", () => {
  const candidate = (drive: string): VehicleCandidate => ({
    id: drive,
    role: "target",
    vehicle: {
      exactModelId: drive,
      manufacturer: "测试品牌",
      series: "测试车系",
      modelYear: "2025款",
      trim: "旗舰版",
    },
    facts: [
      {
        field: "drive_type",
        label: "驱动形式",
        value: drive,
        normalizedValue: drive,
        source: "datapro",
        capturedAt,
      },
    ],
  });
  const driveCondition = (value: string): DecisionCondition => ({
    id: `drive-${value}`,
    title: `必须${value}`,
    category: ConditionCategory.CONFIGURATION,
    kind: "hard",
    rule: { field: "drive_type", operator: "includes", value },
  });
  assert.equal(
    evaluateCandidateCondition(
      driveCondition("后驱"),
      candidate("前置前驱"),
    ).status,
    DecisionStatus.CONFLICT,
  );
  assert.equal(
    evaluateCandidateCondition(
      driveCondition("后驱"),
      candidate("后置单电机后驱"),
    ).status,
    DecisionStatus.CONFIRMED,
  );
  assert.equal(
    evaluateCandidateCondition(
      driveCondition("四驱"),
      candidate("双电机四驱"),
    ).status,
    DecisionStatus.CONFIRMED,
  );
  assert.equal(
    evaluateCandidateCondition(
      driveCondition("双电机"),
      candidate("单电机后驱"),
    ).status,
    DecisionStatus.CONFLICT,
  );
});

test("stored facts, rules and source evidence are exposed without copying trace IDs into evaluations", () => {
  const now = Date.parse(capturedAt);
  const project = recordToDomainProject({
    project: {
      id: "stored-project",
      title: "测试项目",
      status: "confirmed",
      city: "杭州",
      primaryCandidateId: "stored-car",
      summary: {
        paymentMethod: "全款",
        purchaseTime: "未来 1–3 个月",
        maxBudgetWan: 35,
        need: "主要一个人通勤，周末偶尔带父母出行。",
      },
      version: 1,
      expiresAt: now + 1_000,
      createdAt: now,
      updatedAt: now,
    },
    candidateTrims: [
      {
        id: "stored-car",
        projectId: "stored-project",
        position: 0,
        role: "target",
        entityId: "datapro:69628",
        brand: "理想汽车",
        series: "理想 L6",
        modelYear: "2025款",
        trimName: "Max 智能焕新版",
        displayName: "理想 L6 2025款 Max 智能焕新版",
        status: "confirmed",
        data: {
          unboundDataFields: ["seat_count", "rear_seat_features"],
          facts: [
            {
              field: "seat_count",
              label: "座位数",
              value: "5座",
              normalizedValue: 5,
              unit: "座",
              source: "datapro",
              capturedAt,
              evidenceId: "stored-evidence",
            },
          ],
        },
        createdAt: now,
        updatedAt: now,
      },
    ],
    conditions: [
      {
        id: "stored-condition",
        projectId: "stored-project",
        sortOrder: 0,
        scope: "personal",
        kind: "hard",
        title: "需要5座",
        description: "",
        priority: "configuration",
        status: "active",
        details: {
          rule: {
            field: "seat_count",
            operator: "eq",
            value: 5,
            unit: "座",
          },
        },
        createdAt: now,
        updatedAt: now,
      },
    ],
    evaluations: [
      {
        id: "stored-evaluation",
        projectId: "stored-project",
        conditionId: "stored-condition",
        candidateTrimId: "stored-car",
        status: "confirmed",
        conclusion: "座位数为5座",
        rationale: {
          evidenceRefs: ["stored-evidence"],
          factFields: ["seat_count"],
          userConfirmation: {
            confirmedAt: capturedAt,
            dependsOn: [
              ConfirmationDependency.MODEL_YEAR,
              ConfirmationDependency.TRIM,
            ],
            basis: {
              modelYear: "2025款",
              trim: "Max 智能焕新版",
            },
            note: "D1 恢复测试",
            invalidatedBy: [ConfirmationDependency.TRIM],
          },
        },
        evaluatedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ],
    evidence: [
      {
        id: "stored-evidence",
        projectId: "stored-project",
        candidateTrimId: "stored-car",
        conditionId: null,
        evaluationId: null,
        evidenceType: "vehicle_configuration_query",
        sourceType: "datapro",
        sourceName: "专业数据集",
        title: "配置查询",
        summary: "已匹配精确配置",
        sourceUrl: null,
        traceId: "trace-in-drawer-only",
        logId: null,
        validity: "current",
        capturedAt: now,
        expiresAt: null,
        payload: {},
        createdAt: now,
        updatedAt: now,
      },
    ],
    userChecks: [],
    salesQuotes: [],
    salesClaims: [],
    cityVehicleSeries: [
      {
        id: "stored-city-series",
        projectId: "stored-project",
        candidateTrimId: "stored-car",
        city: "杭州市",
        seriesName: "理想 L6",
        periodLabel: "2026年1月",
        metricKey: "销量",
        metricLabel: "销量",
        metricDefinition: "车系月度销量",
        unit: "辆",
        dataLevel: "city",
        datasetType: "vehicle_sales",
        requestId: "request-city",
        traceId: "trace-city",
        status: "current",
        evidenceId: "stored-evidence",
        capturedAt: now,
        extra: {},
        createdAt: now,
        updatedAt: now,
      },
    ],
    cityVehicleSeriesPoints: [
      {
        id: "stored-city-point",
        seriesId: "stored-city-series",
        month: "2026-01",
        monthLabel: "1月",
        value: 162,
        extra: { 城市排名: 3 },
        createdAt: now,
      },
    ],
  });
  assert.equal(project.candidates[0].facts?.[0].normalizedValue, 5);
  assert.deepEqual(project.candidates[0].unboundDataFields, [
    "rear_seat_features",
  ]);
  assert.equal(project.conditions[0].rule?.field, "seat_count");
  assert.equal(project.evidence?.[0].traceId, "trace-in-drawer-only");
  assert.deepEqual(project.evaluations[0].evidenceRefs, ["stored-evidence"]);
  assert.deepEqual(project.evaluations[0].factFields, ["seat_count"]);
  assert.equal(project.citySales?.[0].statisticLabel, "销量");
  assert.equal(project.citySales?.[0].points[0].value, 162);
  assert.equal(project.citySales?.[0].points[0].extras?.城市排名, 3);
  assert.equal(project.context.purchaseTime, "未来 1–3 个月");
  assert.equal(project.context.maxBudgetWan, 35);
  assert.equal(
    project.context.need,
    "主要一个人通勤，周末偶尔带父母出行。",
  );
  assert.deepEqual(project.evaluations[0].userConfirmation, {
    confirmedAt: capturedAt,
    dependsOn: [
      ConfirmationDependency.MODEL_YEAR,
      ConfirmationDependency.TRIM,
    ],
    basis: {
      modelYear: "2025款",
      trim: "Max 智能焕新版",
    },
    note: "D1 恢复测试",
    invalidatedBy: [ConfirmationDependency.TRIM],
  });
  assert.doesNotMatch(
    JSON.stringify(project.evaluations),
    /trace-in-drawer-only/,
  );
});

test("selected demo counts are derived from five evaluations per candidate", () => {
  const demo = createDemoDecisionProject();
  const l6 = summarizeCandidate(demo, "candidate-l6");
  const m7 = summarizeCandidate(demo, "candidate-m7");
  assert.deepEqual(
    [l6.confirmedCount, l6.conflictCount, l6.pendingCount],
    [3, 0, 2],
  );
  assert.deepEqual(
    [m7.confirmedCount, m7.conflictCount, m7.pendingCount],
    [2, 1, 2],
  );
  assert.equal(demo.conditions.length, 5);
  assert.equal(demo.evaluations.length, 10);
  assert.ok(
    demo.evidence?.every((item) => item.sourceType === "datapro"),
  );
});
