import {
  ConditionCategory,
  DecisionStatus,
  PendingReason,
  type DecisionProject,
  type VehicleFact,
} from "./types";

const capturedAt = "2026-07-27T08:00:00+08:00";

function demoFact(
  field: string,
  label: string,
  value: string,
  normalizedValue: string | number,
  unit: string | undefined,
  evidenceId: string,
): VehicleFact {
  return {
    field,
    label,
    value,
    normalizedValue,
    unit,
    source: "datapro",
    capturedAt,
    evidenceId,
  };
}

/**
 * The guide prices remain pending against the landing-price budget. Search
 * candidates stay in needs_review and never drive any matrix result.
 */
export function createDemoDecisionProject(): DecisionProject {
  return {
    id: "demo-my-car-decision",
    title: "购车决策助手",
    isDemo: true,
    updatedAt: capturedAt,
    context: {
      city: "杭州",
      paymentMethod: "支付方式待确认",
    },
    candidates: [
      {
        id: "candidate-l6",
        role: "target",
        vehicle: {
          exactModelId: "demo-datapro-69628",
          manufacturer: "理想汽车",
          series: "理想 L6",
          modelYear: "2025款",
          trim: "Max 智能焕新版",
        },
        facts: [
          demoFact(
            "guide_price_cny",
            "厂商指导价",
            "27.98 万元",
            279800,
            "CNY",
            "evidence-l6-datapro",
          ),
          demoFact(
            "seat_count",
            "座位数",
            "5 座",
            5,
            "座",
            "evidence-l6-datapro",
          ),
          demoFact(
            "drive_type",
            "驱动形式",
            "双电机四驱",
            "双电机四驱",
            undefined,
            "evidence-l6-datapro",
          ),
          demoFact(
            "cltc_pure_range_km",
            "CLTC 纯电续航",
            "212 km",
            212,
            "km",
            "evidence-l6-datapro",
          ),
        ],
      },
      {
        id: "candidate-m7",
        role: "alternative",
        vehicle: {
          exactModelId: "demo-datapro-m7-pure-max-long-range-5-rwd",
          manufacturer: "赛力斯汽车",
          series: "问界 M7",
          modelYear: "2025款",
          trim: "纯电 Max 长续航版 5座",
        },
        facts: [
          demoFact(
            "guide_price_cny",
            "厂商指导价",
            "31.98 万元",
            319800,
            "CNY",
            "evidence-m7-datapro",
          ),
          demoFact(
            "seat_count",
            "座位数",
            "5 座",
            5,
            "座",
            "evidence-m7-datapro",
          ),
          demoFact(
            "drive_type",
            "驱动形式",
            "后置单电机后驱",
            "后置单电机后驱",
            undefined,
            "evidence-m7-datapro",
          ),
          demoFact(
            "cltc_pure_range_km",
            "CLTC 纯电续航",
            "680–710 km（视轮毂/选装）",
            680,
            "km",
            "evidence-m7-datapro",
          ),
        ],
      },
    ],
    conditions: [
      {
        id: "five-seats",
        title: "需要 5 座",
        category: ConditionCategory.CONFIGURATION,
        kind: "hard",
        rule: {
          field: "seat_count",
          operator: "eq",
          value: 5,
          unit: "座",
        },
        order: 0,
      },
      {
        id: "pure-range",
        title: "CLTC 纯电续航至少 200 km",
        category: ConditionCategory.CONFIGURATION,
        kind: "hard",
        rule: {
          field: "cltc_pure_range_km",
          operator: "gte",
          value: 200,
          unit: "km",
        },
        order: 1,
      },
      {
        id: "four-wheel-drive",
        title: "必须四驱",
        category: ConditionCategory.CONFIGURATION,
        kind: "hard",
        rule: {
          field: "drive_type",
          operator: "includes",
          value: "四驱",
        },
        order: 2,
      },
      {
        id: "charging-convenience",
        title: "没有家充，常用充电是否方便",
        detail: "需要本人按常用地点和实际时段确认",
        category: ConditionCategory.PERSONAL_EXPERIENCE,
        kind: "hard",
        order: 3,
      },
      {
        id: "landing-budget",
        title: "落地预算不超过 30 万",
        category: ConditionCategory.BUDGET,
        kind: "hard",
        rule: {
          field: "landing_price_cny",
          operator: "lte",
          value: 300000,
          unit: "CNY",
        },
        order: 4,
      },
    ],
    evidence: [
      {
        id: "evidence-l6-datapro",
        candidateId: "candidate-l6",
        sourceType: "datapro",
        sourceName: "专业数据集",
        title: "理想 L6 2025款 Max 智能焕新版配置",
        summary:
          "已核验该精确车型的指导价、座位数、驱动形式和 CLTC 纯电续航。",
        status: "current",
        capturedAt,
      },
      {
        id: "evidence-m7-datapro",
        candidateId: "candidate-m7",
        sourceType: "datapro",
        sourceName: "专业数据集",
        title: "问界 M7 2025款 纯电 Max 长续航版 5座配置",
        summary:
          "已核验该精确车型的座位、驱动形式和 CLTC 纯电续航，不使用车系级信息替代该版本。",
        status: "current",
        capturedAt,
      },
    ],
    // Demonstration content must never impersonate a live city-series query.
    // Real projects populate this only after DataPro returns a verified scope.
    citySales: [],
    evaluations: [
      {
        conditionId: "five-seats",
        candidateId: "candidate-l6",
        status: DecisionStatus.CONFIRMED,
        summary: "座位数为 5 座，满足“需要 5 座”",
        evidenceRefs: ["evidence-l6-datapro"],
      },
      {
        conditionId: "pure-range",
        candidateId: "candidate-l6",
        status: DecisionStatus.CONFIRMED,
        summary: "CLTC 纯电续航为 212 km，满足至少 200 km",
        evidenceRefs: ["evidence-l6-datapro"],
      },
      {
        conditionId: "four-wheel-drive",
        candidateId: "candidate-l6",
        status: DecisionStatus.CONFIRMED,
        summary: "驱动形式为双电机四驱，满足四驱要求",
        evidenceRefs: ["evidence-l6-datapro"],
      },
      {
        conditionId: "charging-convenience",
        candidateId: "candidate-l6",
        status: DecisionStatus.PENDING,
        pendingReason: PendingReason.PERSONAL_EXPERIENCE_REQUIRED,
        summary: "需要本人核对常用充电点在实际时段的可用性",
      },
      {
        conditionId: "landing-budget",
        candidateId: "candidate-l6",
        status: DecisionStatus.PENDING,
        pendingReason: PendingReason.QUOTE_REQUIRED,
        summary:
          "厂商指导价为 27.98 万元，但指导价不是落地价；仍需完整报价",
        evidenceRefs: ["evidence-l6-datapro"],
      },
      {
        conditionId: "five-seats",
        candidateId: "candidate-m7",
        status: DecisionStatus.CONFIRMED,
        summary: "座位数为 5 座，满足“需要 5 座”",
        evidenceRefs: ["evidence-m7-datapro"],
      },
      {
        conditionId: "pure-range",
        candidateId: "candidate-m7",
        status: DecisionStatus.CONFIRMED,
        summary:
          "CLTC 纯电续航为 680–710 km（视轮毂/选装）；按最低 680 km 保守判断，满足至少 200 km",
        evidenceRefs: ["evidence-m7-datapro"],
      },
      {
        conditionId: "four-wheel-drive",
        candidateId: "candidate-m7",
        status: DecisionStatus.CONFLICT,
        summary: "驱动形式为后驱，不满足四驱要求",
        evidenceRefs: ["evidence-m7-datapro"],
      },
      {
        conditionId: "charging-convenience",
        candidateId: "candidate-m7",
        status: DecisionStatus.PENDING,
        pendingReason: PendingReason.PERSONAL_EXPERIENCE_REQUIRED,
        summary: "需要本人核对常用充电点在实际时段的可用性",
      },
      {
        conditionId: "landing-budget",
        candidateId: "candidate-m7",
        status: DecisionStatus.PENDING,
        pendingReason: PendingReason.QUOTE_REQUIRED,
        summary:
          "厂商指导价为 31.98 万元，但指导价不是落地价；仍需完整报价",
        evidenceRefs: ["evidence-m7-datapro"],
      },
    ],
  };
}
