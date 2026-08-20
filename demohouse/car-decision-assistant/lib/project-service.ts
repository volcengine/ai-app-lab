import {
  ConfirmationDependency,
  ConditionCategory,
  DecisionStatus,
  PendingReason,
  assertDecisionProject,
  summarizeDecision,
  type ConditionCategory as DomainConditionCategory,
  type ConfirmationBasis,
  type DecisionCondition,
  type DecisionEvidence,
  type ConditionEvaluation,
  type CitySalesSeries,
  type DecisionProject,
  type DecisionRule,
  type PendingReason as DomainPendingReason,
  type ProjectDataIssue,
  type UserConfirmation,
  type VehicleCandidate,
  type VehicleFact,
  type VehicleIdentityOption,
} from "@/lib/decision";
import {
  createHarnessClients,
  createDataProClient,
  retryHarnessCall,
  type ConditionExtraction,
  type DataProPayload,
  type HarnessCallResult,
  type StructuredCondition,
} from "@/lib/harness";
import {
  createDecisionProject,
  readDecisionProject,
  updateDecisionProject,
  type CreateDecisionProjectInput,
  type DecisionProjectRecord,
  type EvidenceInput,
  type UpdateDecisionProjectInput,
} from "@/lib/storage";
import type { JsonValue } from "@/lib/storage/types";
import {
  normalizeVehicleSalesEntity,
  queryCityVehicleSalesDataPro,
  type CityVehicleSalesQueryResult,
} from "@/lib/vehicle-sales";
import {
  extractRequirementAtoms,
  requirementVerificationLabel,
  type RequirementAtom,
} from "@/lib/requirements";
import {
  ProjectErrorCode,
  ProjectServiceError,
  logProjectStage,
  projectApiError,
  safeErrorDiagnostic,
  toProjectApiError,
} from "@/lib/project-errors";

export interface NewDecisionProjectRequest {
  city: string;
  purchaseTime: string;
  maxBudgetWan: number;
  candidates: string[];
  candidateIdentityIds?: Array<string | null>;
  need: string;
  replaceProjectId?: string;
}

export interface HarnessProjectStatus {
  status: "ok" | "partial" | "unavailable";
  message: string;
}

export interface CreatedProjectView {
  project: DecisionProject;
  recoveryCode?: string;
  editToken?: string;
  requiresIdentityConfirmation?: boolean;
  code?: ProjectErrorCode;
  harness: HarnessProjectStatus;
}

function safeId(prefix: string) {
  return `${prefix}_${globalThis.crypto.randomUUID()}`;
}

function requiredText(value: unknown, name: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name}不能为空`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new Error(`${name}内容过长`);
  }
  return normalized;
}

function requiredCandidateName(
  value: unknown,
  name: string,
  maxLength: number,
) {
  const normalized = requiredText(value, name, maxLength);
  if (normalized.replace(/\s+/g, "").length < 2) {
    throw new Error(`${name}请至少填写品牌或车系名称`);
  }
  return normalized;
}

export function validateNewProjectRequest(
  value: unknown,
): NewDecisionProjectRequest {
  if (typeof value !== "object" || value === null) {
    throw new Error("请求内容无效");
  }
  const input = value as Record<string, unknown>;
  if (
    !Array.isArray(input.candidates) ||
    input.candidates.length < 1 ||
    input.candidates.length > 3
  ) {
    throw new Error("请填写 1–3 款候选车型");
  }
  const candidates = input.candidates.map((candidate, index) =>
    requiredCandidateName(candidate, `候选车型 ${index + 1}`, 120),
  );
  const rawIdentityIds = Array.isArray(input.candidateIdentityIds)
    ? input.candidateIdentityIds
    : [];
  const candidateIdentityIds = candidates.map((_, index) => {
    const value = rawIdentityIds[index];
    return typeof value === "string" &&
      /^(?:datapro|datapro-name|datapro-series):/.test(value)
      ? value
      : null;
  });
  const maxBudgetWan = Number(input.maxBudgetWan);
  if (
    !Number.isFinite(maxBudgetWan) ||
    maxBudgetWan <= 0 ||
    maxBudgetWan > 500
  ) {
    throw new Error("最高落地预算应在 0–500 万元之间");
  }
  return {
    city: requiredText(input.city, "所在城市", 40),
    purchaseTime: requiredText(input.purchaseTime, "购车时间", 40),
    maxBudgetWan,
    candidates,
    candidateIdentityIds,
    need: requiredText(input.need, "用车需求", 4000),
    replaceProjectId:
      typeof input.replaceProjectId === "string" &&
      /^project_[a-zA-Z0-9_-]+$/.test(input.replaceProjectId.trim())
        ? input.replaceProjectId.trim()
        : undefined,
  };
}

function parseVehicleName(input: string, index: number) {
  const modelYearMatch = input.match(/(?:19|20)\d{2}\s*款?/);
  const modelYear = modelYearMatch?.[0].replace(/\s+/g, "") ?? "年款待确认";
  const beforeYear = modelYearMatch
    ? input.slice(0, modelYearMatch.index).trim()
    : input.trim();
  const afterYear = modelYearMatch
    ? input.slice((modelYearMatch.index ?? 0) + modelYearMatch[0].length).trim()
    : "";
  const nameParts = beforeYear.split(/\s+/).filter(Boolean);
  const manufacturer =
    nameParts.length > 1 ? nameParts[0] : "品牌待确认";
  const series =
    (nameParts.length > 1 ? nameParts.slice(1).join(" ") : beforeYear) ||
    `候选 ${index + 1}`;

  return {
    exactModelId: `user:${encodeURIComponent(input)}`,
    manufacturer,
    series,
    modelYear,
    trim: afterYear || "配置待确认",
  };
}

function mapConditionCategory(
  condition: StructuredCondition,
): DomainConditionCategory {
  if (condition.category === "budget") return ConditionCategory.BUDGET;
  if (condition.category === "safety") return ConditionCategory.SAFETY;
  const structuredField = canonicalRuleField(
    condition.normalized.field ?? undefined,
    condition.source_text,
  );
  if (
    SUPPORTED_AUTOMATIC_FIELDS.has(structuredField) &&
    condition.normalized.operator !== "unknown" &&
    condition.normalized.value !== null
  ) {
    return ConditionCategory.CONFIGURATION;
  }
  if (condition.evaluation_mode === "rule") {
    return ConditionCategory.CONFIGURATION;
  }
  if (condition.category === "driver_assistance") {
    return ConditionCategory.CONFIGURATION;
  }
  if (
    condition.evaluation_mode === "sales_check" ||
    condition.category === "delivery" ||
    condition.category === "payment" ||
    condition.category === "transaction"
  ) {
    return ConditionCategory.SALES_WRITTEN;
  }
  if (
    condition.evaluation_mode === "self_check" ||
    condition.evaluation_mode === "context" ||
    ["charging", "comfort", "space", "usage", "appearance", "context"].includes(
      condition.category,
    )
  ) {
    return ConditionCategory.PERSONAL_EXPERIENCE;
  }
  return ConditionCategory.PREFERENCE;
}

function conditionPendingReason(
  condition: DecisionCondition,
): DomainPendingReason {
  if (condition.category === ConditionCategory.SALES_WRITTEN) {
    return PendingReason.SALES_WRITTEN_CONFIRMATION_REQUIRED;
  }
  if (condition.category === ConditionCategory.PERSONAL_EXPERIENCE) {
    return PendingReason.PERSONAL_EXPERIENCE_REQUIRED;
  }
  if (condition.category === ConditionCategory.BUDGET) {
    return PendingReason.QUOTE_REQUIRED;
  }
  return PendingReason.CONFIGURATION_UNVERIFIED;
}

const RULE_FIELD_ALIASES: Record<string, string> = {
  seat: "seat_count",
  seats: "seat_count",
  seat_count: "seat_count",
  seating_capacity: "seat_count",
  passenger_capacity: "seat_count",
  number_of_seats: "seat_count",
  座位数: "seat_count",
  pure_electric_range: "cltc_pure_range_km",
  pure_electric_range_km: "cltc_pure_range_km",
  cltc_range: "cltc_pure_range_km",
  cltc_range_km: "cltc_pure_range_km",
  cltc_pure_electric_range: "cltc_pure_range_km",
  cltc_pure_electric_range_km: "cltc_pure_range_km",
  cltc_pure_range_km: "cltc_pure_range_km",
  纯电续航: "cltc_pure_range_km",
  drive: "drive_type",
  drive_form: "drive_type",
  drive_type: "drive_type",
  drivetrain: "drive_type",
  four_wheel_drive: "drive_type",
  驱动形式: "drive_type",
  budget: "landing_price_cny",
  max_budget: "landing_price_cny",
  max_budget_cny: "landing_price_cny",
  landing_price: "landing_price_cny",
  landing_price_cny: "landing_price_cny",
  guide_price: "guide_price_cny",
  guide_price_cny: "guide_price_cny",
  fast_charge_time: "fast_charge_time_hours",
  fast_charge_time_hour: "fast_charge_time_hours",
  fast_charge_time_hours: "fast_charge_time_hours",
  fast_charge_time_minutes: "fast_charge_time_hours",
  battery_fast_charge_time: "fast_charge_time_hours",
  battery_capacity: "battery_capacity_kwh",
  battery_capacity_kwh: "battery_capacity_kwh",
  battery_energy: "battery_capacity_kwh",
  battery_energy_kwh: "battery_capacity_kwh",
  trunk_capacity: "trunk_volume_l",
  trunk_capacity_l: "trunk_volume_l",
  trunk_volume: "trunk_volume_l",
  trunk_volume_l: "trunk_volume_l",
  wheelbase: "wheelbase_mm",
  wheelbase_mm: "wheelbase_mm",
  vehicle_length: "vehicle_length_mm",
  vehicle_length_mm: "vehicle_length_mm",
  vehicle_width: "vehicle_width_mm",
  vehicle_width_mm: "vehicle_width_mm",
  vehicle_height: "vehicle_height_mm",
  vehicle_height_mm: "vehicle_height_mm",
  assisted_driving_level: "driver_assistance_level",
  driver_assistance_level: "driver_assistance_level",
  autonomous_driving_level: "driver_assistance_level",
  active_brake: "active_braking",
  active_braking: "active_braking",
  automatic_emergency_braking: "active_braking",
  lane_centering: "lane_centering",
  lane_centering_assist: "lane_centering",
  surround_view_360: "surround_view_360",
  camera_360: "surround_view_360",
  motor_power: "total_motor_power_kw",
  motor_power_kw: "total_motor_power_kw",
  total_motor_power: "total_motor_power_kw",
  total_motor_power_kw: "total_motor_power_kw",
  acceleration_0_100: "acceleration_0_100_s",
  acceleration_0_100_s: "acceleration_0_100_s",
  zero_to_hundred_acceleration: "acceleration_0_100_s",
  low_soc_fuel_consumption: "low_soc_fuel_consumption_l100km",
  low_soc_fuel_consumption_l100km: "low_soc_fuel_consumption_l100km",
  wltc_fuel_consumption: "wltc_fuel_consumption_l100km",
  wltc_fuel_consumption_l100km: "wltc_fuel_consumption_l100km",
  electricity_consumption: "electricity_consumption_kwh100km",
  electricity_consumption_kwh100km: "electricity_consumption_kwh100km",
  energy_type: "energy_type",
  fuel_type: "energy_type",
  driver_assistance_system: "driver_assistance_system",
  parking_sensor: "parking_sensors",
  parking_sensors: "parking_sensors",
  rear_parking_sensor: "parking_sensors",
  panoramic_sunroof: "panoramic_sunroof",
  sunroof_type: "panoramic_sunroof",
  automatic_parking: "automatic_parking",
  automatic_parking_assist: "automatic_parking",
  airbag: "airbag_configuration",
  airbags: "airbag_configuration",
  airbag_configuration: "airbag_configuration",
  exterior_color: "exterior_color",
  body_color: "exterior_color",
  body_style: "body_style",
  vehicle_type: "body_style",
  车身结构: "body_style",
  rear_seat_features: "rear_seat_features",
  second_row_seat_features: "rear_seat_features",
  cltc_total_range: "cltc_total_range_km",
  cltc_total_range_km: "cltc_total_range_km",
  wltc_pure_range: "wltc_pure_range_km",
  wltc_pure_range_km: "wltc_pure_range_km",
  wltc_total_range: "wltc_total_range_km",
  wltc_total_range_km: "wltc_total_range_km",
};

const AUTOMATIC_FIELD_QUERY_LABELS: Record<string, string> = {
  guide_price_cny: "指导价",
  seat_count: "座位数",
  drive_type: "驱动形式",
  cltc_pure_range_km: "CLTC纯电续航里程",
  fast_charge_time_hours: "电池快充时间",
  battery_capacity_kwh: "电池能量",
  trunk_volume_l: "后备厢容积",
  wheelbase_mm: "轴距",
  vehicle_length_mm: "长度",
  vehicle_width_mm: "宽度",
  vehicle_height_mm: "高度",
  // The system response already includes the exact assistance level and its
  // related safety/parking configuration, so keep this as one clear intent.
  driver_assistance_level: "辅助驾驶系统",
  active_braking: "主动刹车",
  lane_centering: "车道居中保持",
  surround_view_360: "360度全景影像",
  total_motor_power_kw: "电动机总功率",
  acceleration_0_100_s: "官方0-100km/h加速",
  low_soc_fuel_consumption_l100km: "最低荷电状态油耗",
  wltc_fuel_consumption_l100km: "WLTC综合油耗",
  electricity_consumption_kwh100km: "百公里耗电量",
  energy_type: "燃料类型",
  driver_assistance_system: "辅助驾驶系统",
  parking_sensors: "前/后驻车雷达",
  panoramic_sunroof: "天窗类型",
  automatic_parking: "辅助泊车入位",
  airbag_configuration: "安全气囊配置",
  exterior_color: "外观颜色",
  body_style: "车身结构",
  rear_seat_features: "第二排座椅功能",
  cltc_total_range_km: "CLTC综合续航",
  wltc_pure_range_km: "WLTC纯电续航里程",
  wltc_total_range_km: "WLTC综合续航",
};

const SUPPORTED_AUTOMATIC_FIELDS = new Set(
  Object.keys(AUTOMATIC_FIELD_QUERY_LABELS),
);

const RAW_DATAPRO_FIELD_PREFIX = "datapro_raw:";

function isRawDataProFact(item: VehicleFact) {
  return item.field.startsWith(RAW_DATAPRO_FIELD_PREFIX);
}

function rawDataProFactField(label: string) {
  return `${RAW_DATAPRO_FIELD_PREFIX}${encodeURIComponent(label)}`;
}

function inferredRuleField(sourceText: string): string {
  const text = sourceText.replace(/\s+/g, "");
  if (/座/.test(text)) return "seat_count";
  if (/CLTC.*纯电.*续航|纯电续航.*CLTC/i.test(text)) {
    return "cltc_pure_range_km";
  }
  if (/四驱|前驱|后驱|驱动形式|驱动方式/.test(text)) return "drive_type";
  if (/快充.*(?:时间|分钟|小时)|充电时间/.test(text)) {
    return "fast_charge_time_hours";
  }
  if (/电池(?:容量|能量)/.test(text)) return "battery_capacity_kwh";
  if (/后备[厢箱](?:容积|空间)?/.test(text)) return "trunk_volume_l";
  if (/轴距/.test(text)) return "wheelbase_mm";
  if (/车长|车辆长度/.test(text)) return "vehicle_length_mm";
  if (/车宽|车辆宽度/.test(text)) return "vehicle_width_mm";
  if (/车高|车辆高度/.test(text)) return "vehicle_height_mm";
  if (/辅助驾驶等级|驾驶辅助(?:等级|级别)|L[0-5]/i.test(text)) {
    return "driver_assistance_level";
  }
  if (/主动刹车|AEB/i.test(text)) return "active_braking";
  if (/车道居中/.test(text)) return "lane_centering";
  if (/360.*(?:影像|全景)|全景影像/.test(text)) return "surround_view_360";
  if (/(?:电动机|电机|系统).*(?:总)?功率/.test(text)) {
    return "total_motor_power_kw";
  }
  if (/0[-—~至到]?100.*(?:加速|秒)|零百加速/.test(text)) {
    return "acceleration_0_100_s";
  }
  if (/最低荷电状态油耗|亏电油耗/.test(text)) {
    return "low_soc_fuel_consumption_l100km";
  }
  if (/WLTC.*油耗|油耗.*WLTC/i.test(text)) {
    return "wltc_fuel_consumption_l100km";
  }
  if (/百公里(?:耗电量|电耗)|电耗.*100/.test(text)) {
    return "electricity_consumption_kwh100km";
  }
  if (/能源类型|燃料类型|纯电车型|增程车型|插混车型/.test(text)) {
    return "energy_type";
  }
  if (/不要SUV|不接受SUV|排除SUV|车身结构|车型级别/i.test(text)) {
    return "body_style";
  }
  if (/辅助驾驶系统|智能驾驶系统/.test(text)) {
    return "driver_assistance_system";
  }
  if (/倒车雷达|驻车雷达/.test(text)) return "parking_sensors";
  if (/全景天窗|天窗类型/.test(text)) return "panoramic_sunroof";
  if (/自动泊车|辅助泊车/.test(text)) return "automatic_parking";
  if (/安全气囊|气帘/.test(text)) return "airbag_configuration";
  if (/外观颜色|车身颜色|车漆颜色/.test(text)) return "exterior_color";
  if (/第二排座椅功能|后排座椅功能/.test(text)) {
    return "rear_seat_features";
  }
  if (/(?:第二排|后排).*(?:舒适|乘坐)/.test(text)) {
    return "rear_seat_features";
  }
  if (/CLTC.*综合续航|综合续航.*CLTC/i.test(text)) {
    return "cltc_total_range_km";
  }
  if (/WLTC.*纯电.*续航|纯电续航.*WLTC/i.test(text)) {
    return "wltc_pure_range_km";
  }
  if (/WLTC.*综合续航|综合续航.*WLTC/i.test(text)) {
    return "wltc_total_range_km";
  }
  return "";
}

function canonicalRuleField(
  field: string | undefined,
  sourceText = "",
): string {
  const normalized = field?.trim().toLocaleLowerCase("en-US") ?? "";
  const aliased = normalized ? RULE_FIELD_ALIASES[normalized] ?? normalized : "";
  if (SUPPORTED_AUTOMATIC_FIELDS.has(aliased)) return aliased;
  return inferredRuleField(sourceText) || aliased;
}

function normalizeStructuredRuleValue(
  field: string,
  value: DecisionRule["value"],
  unit: string | null,
  sourceText: string,
): Pick<DecisionRule, "value" | "unit"> {
  let normalizedValue = value;
  let normalizedUnit = unit ?? undefined;
  const source = sourceText.toLocaleLowerCase();
  const normalizedUnitText = unit?.toLocaleLowerCase() ?? "";

  if (field === "fast_charge_time_hours" && typeof value === "number") {
    if (/分钟|min/.test(normalizedUnitText) || /分钟|min/.test(source)) {
      normalizedValue = value / 60;
    }
    normalizedUnit = "小时";
  }
  if (
    ["vehicle_length_mm", "vehicle_width_mm", "vehicle_height_mm", "wheelbase_mm"].includes(
      field,
    ) &&
    typeof value === "number"
  ) {
    if (/厘米|cm/.test(normalizedUnitText) || /厘米|cm/.test(source)) {
      normalizedValue = value * 10;
    } else if (
      /(?:^|[^m])米|(?:^|[^m])m(?:$|[^m])/.test(normalizedUnitText) ||
      /(?:\d)米/.test(source)
    ) {
      normalizedValue = value * 1000;
    }
    normalizedUnit = "mm";
  }
  if (field === "driver_assistance_level" && typeof value === "string") {
    const level = value.match(/L([0-5])/i);
    if (level) normalizedValue = Number(level[1]);
    normalizedUnit = "级";
  }
  return { value: normalizedValue, unit: normalizedUnit };
}

function structuredRule(condition: StructuredCondition): DecisionRule | undefined {
  if (!condition.normalized.field) return undefined;
  const field = canonicalRuleField(
    condition.normalized.field,
    condition.source_text,
  );
  const normalized = normalizeStructuredRuleValue(
    field,
    condition.normalized.value,
    condition.normalized.unit,
    condition.source_text,
  );
  return {
    field,
    operator: condition.normalized.operator,
    value: normalized.value,
    unit: normalized.unit,
  };
}

function operatorFromModifier(modifier: string | undefined) {
  if (!modifier) return "eq" as const;
  if (/不超过|不高于|最多|至多|以内|以下|≤|<=/.test(modifier)) {
    return "lte" as const;
  }
  if (/至少|最少|不少于|不低于|达到|≥|>=/.test(modifier)) {
    return "gte" as const;
  }
  return "eq" as const;
}

/**
 * A deterministic safety net for the most common objective requirements.
 * These rules only come from explicit phrases in the user's own text; no
 * vehicle fact is invented when Agent Plan is unavailable or omits one.
 */
export function extractExplicitFallbackConditions(
  need: string,
): DecisionCondition[] {
  const conditions: DecisionCondition[] = [];
  const addNumericCondition = ({
    match,
    field,
    category = ConditionCategory.CONFIGURATION,
    unit,
    value,
    operator,
  }: {
    match: RegExpMatchArray | null;
    field: string;
    category?: DomainConditionCategory;
    unit: string;
    value?: (match: RegExpMatchArray) => number;
    operator?: (match: RegExpMatchArray) => DecisionRule["operator"];
  }) => {
    if (!match) return;
    conditions.push({
      id: safeId("condition"),
      title: match[0].trim(),
      category,
      kind: "hard",
      rule: {
        field,
        operator: operator
          ? operator(match)
          : operatorFromModifier(match[1]),
        value: value ? value(match) : Number(match[2]),
        unit,
      },
    });
  };
  const seatChoice = need.match(
    /(\d{1,2})\s*座\s*(?:或|或者|\/|、)\s*(\d{1,2})\s*座/,
  );
  if (seatChoice) {
    conditions.push({
      id: safeId("condition"),
      title: seatChoice[0].trim(),
      category: ConditionCategory.CONFIGURATION,
      kind: "hard",
      rule: {
        field: "seat_count",
        operator: "in",
        value: [Number(seatChoice[1]), Number(seatChoice[2])],
        unit: "座",
      },
    });
  }
  const seatMatch = seatChoice
    ? null
    : need.match(
    /(至少|最少|不少于|不低于|不超过|最多|至多|≥|>=|≤|<=)?\s*(\d{1,2})\s*座/,
  );
  if (seatMatch) {
    const sourceText = seatMatch[0].trim();
    conditions.push({
      id: safeId("condition"),
      title: sourceText,
      category: ConditionCategory.CONFIGURATION,
      kind: "hard",
      rule: {
        field: "seat_count",
        operator: operatorFromModifier(seatMatch[1]),
        value: Number(seatMatch[2]),
        unit: "座",
      },
    });
  }

  const energyChoice = need.match(/(增程)\s*(?:或|或者|\/|、)\s*(插混|插电混动)/);
  if (energyChoice) {
    conditions.push({
      id: safeId("condition"),
      title: energyChoice[0],
      category: ConditionCategory.CONFIGURATION,
      kind: "hard",
      rule: {
        field: "energy_type",
        operator: "in",
        value: ["增程", "插混"],
      },
    });
  }
  const excludedBody = need.match(/(?:不要|不接受|排除)\s*(SUV|轿车|MPV)/i);
  if (excludedBody) {
    conditions.push({
      id: safeId("condition"),
      title: excludedBody[0],
      category: ConditionCategory.CONFIGURATION,
      kind: "hard",
      rule: {
        field: "body_style",
        operator: "not_in",
        value: [excludedBody[1].toUpperCase()],
      },
    });
  }

  const rangeMatch = need.match(
    /((?:CLTC\s*)?(?:纯电)?续航(?:里程)?\s*(至少|最少|不少于|不低于|不超过|最多|至多|达到|≥|>=|≤|<=)?\s*(\d{2,4})\s*(?:公里|km))/i,
  );
  if (rangeMatch) {
    conditions.push({
      id: safeId("condition"),
      title: rangeMatch[1].trim(),
      category: ConditionCategory.CONFIGURATION,
      kind: "hard",
      rule: {
        field: "cltc_pure_range_km",
        operator: operatorFromModifier(rangeMatch[2]),
        value: Number(rangeMatch[3]),
        unit: "km",
      },
    });
  }

  const driveMatch = need.match(/(?:双电机\s*)?四驱/);
  if (driveMatch) {
    const driveContext = need.slice(
      Math.max(0, (driveMatch.index ?? 0) - 6),
      (driveMatch.index ?? 0) + driveMatch[0].length + 6,
    );
    conditions.push({
      id: safeId("condition"),
      title: driveMatch[0],
      category: ConditionCategory.CONFIGURATION,
      kind: /优先|最好|希望|可以/.test(driveContext)
        ? "preference"
        : "hard",
      rule: {
        field: "drive_type",
        operator: "includes",
        value: "四驱",
      },
    });
  }
  addNumericCondition({
    match: need.match(
      /(?:电池)?快充(?:时间)?\s*(至少|最少|不少于|不低于|不超过|最多|至多|≤|<=|≥|>=)?\s*(\d+(?:\.\d+)?)\s*(分钟|min|小时|h)/i,
    ),
    field: "fast_charge_time_hours",
    category: ConditionCategory.CONFIGURATION,
    unit: "小时",
    value: (match) =>
      /分钟|min/i.test(match[3]) ? Number(match[2]) / 60 : Number(match[2]),
  });
  addNumericCondition({
    match: need.match(
      /电池(?:容量|能量)\s*(至少|最少|不少于|不低于|不超过|最多|至多|≤|<=|≥|>=)?\s*(\d+(?:\.\d+)?)\s*(?:kwh|度)/i,
    ),
    field: "battery_capacity_kwh",
    unit: "kWh",
  });
  addNumericCondition({
    match: need.match(
      /后备[厢箱](?:容积|空间)?\s*(至少|最少|不少于|不低于|不超过|最多|至多|≤|<=|≥|>=)?\s*(\d+(?:\.\d+)?)\s*(?:L|升)/i,
    ),
    field: "trunk_volume_l",
    unit: "L",
  });
  addNumericCondition({
    match: need.match(
      /轴距\s*(至少|最少|不少于|不低于|不超过|最多|至多|≤|<=|≥|>=)?\s*(\d+(?:\.\d+)?)\s*(mm|毫米|cm|厘米|m|米)/i,
    ),
    field: "wheelbase_mm",
    unit: "mm",
    value: (match) => {
      const amount = Number(match[2]);
      if (/cm|厘米/i.test(match[3])) return amount * 10;
      if (/^m$|米/i.test(match[3])) return amount * 1000;
      return amount;
    },
  });
  addNumericCondition({
    match: need.match(
      /(?:电动机|电机|系统)(?:总)?功率\s*(至少|最少|不少于|不低于|不超过|最多|至多|≤|<=|≥|>=)?\s*(\d+(?:\.\d+)?)\s*kW/i,
    ),
    field: "total_motor_power_kw",
    unit: "kW",
  });
  addNumericCondition({
    match: need.match(
      /(?:官方)?(?:0[-—~至到]?100km\/h|零百)(?:加速)?(?:希望|最好|要求)?\s*(至少|最少|不少于|不低于|不超过|不高于|最多|至多|≤|<=|≥|>=)?\s*(\d+(?:\.\d+)?)\s*(?:秒|s)(?:以内|以下)?/i,
    ),
    field: "acceleration_0_100_s",
    unit: "s",
    operator: (match) =>
      /以内|以下/.test(match[0])
        ? "lte"
        : operatorFromModifier(match[1]),
  });
  addNumericCondition({
    match: need.match(
      /(?:最低荷电状态油耗|亏电油耗)\s*(至少|最少|不少于|不低于|不超过|最多|至多|≤|<=|≥|>=)?\s*(\d+(?:\.\d+)?)\s*(?:L\/100km|升\/百公里)/i,
    ),
    field: "low_soc_fuel_consumption_l100km",
    unit: "L/100km",
  });
  addNumericCondition({
    match: need.match(
      /(?:百公里耗电量|百公里电耗|电耗)(?:最好|希望|尽量)?\s*(至少|最少|不少于|不低于|不超过|不高于|最多|至多|≤|<=|≥|>=)?\s*(\d+(?:\.\d+)?)\s*(?:kWh\/100km|千瓦时(?:每|\/)百公里|度)/i,
    ),
    field: "electricity_consumption_kwh100km",
    unit: "kWh/100km",
  });
  const assistanceLevel = need.match(
    /辅助驾驶(?:等级)?\s*(至少|不低于|达到|≥|>=)?\s*L([0-5])/i,
  );
  if (assistanceLevel) {
    conditions.push({
      id: safeId("condition"),
      title: assistanceLevel[0].trim(),
      category: ConditionCategory.CONFIGURATION,
      kind: "hard",
      rule: {
        field: "driver_assistance_level",
        operator: assistanceLevel[1] ? "gte" : "eq",
        value: Number(assistanceLevel[2]),
        unit: "级",
      },
    });
  }
  const featureRules = [
    { pattern: /(?:必须|需要|要有|配备)?\s*(主动刹车|AEB)/i, field: "active_braking" },
    { pattern: /(?:必须|需要|要有|配备)?\s*(车道居中(?:保持)?)/, field: "lane_centering" },
    { pattern: /(?:必须|需要|要有|配备)?\s*(360度全景影像|360影像|全景影像)/, field: "surround_view_360" },
  ];
  for (const feature of featureRules) {
    const match = need.match(feature.pattern);
    if (!match) continue;
    conditions.push({
      id: safeId("condition"),
      title: match[0].trim(),
      category: ConditionCategory.CONFIGURATION,
      kind: "hard",
      rule: {
        field: feature.field,
        operator: "eq",
        value: true,
      },
    });
  }
  return conditions;
}

function budgetCondition(input: NewDecisionProjectRequest): DecisionCondition {
  return {
    id: safeId("condition"),
    title: `落地预算不超过 ${input.maxBudgetWan} 万`,
    detail: "以包含全部费用项的正式落地报价为准",
    category: ConditionCategory.BUDGET,
    kind: "hard",
    concept: "landing_price",
    scope: "transaction",
    verificationMode: "written_confirmation",
    dataFieldHints: ["guide_price_cny"],
    order: 0,
    rule: {
      field: "landing_price_cny",
      operator: "lte",
      value: input.maxBudgetWan * 10_000,
      unit: "CNY",
    },
  };
}

function conditionFromRequirementAtom(
  atom: RequirementAtom,
): DecisionCondition {
  return {
    id: safeId("condition"),
    title: atom.title,
    detail: `原文：${atom.sourceText} · ${requirementVerificationLabel(atom.verificationMode)}`,
    category: atom.category,
    kind: atom.kind,
    rule: atom.rule,
    sourceText: atom.sourceText,
    sourceStart: atom.sourceStart,
    sourceEnd: atom.sourceEnd,
    concept: atom.concept,
    scope: atom.scope,
    verificationMode: atom.verificationMode,
    dataFieldHints: atom.dataFieldHints,
  };
}

function conditionFromStructured(
  condition: StructuredCondition,
  need: string,
): DecisionCondition {
  const sourceStart = need.indexOf(condition.source_text);
  const category = mapConditionCategory(condition);
  const verificationMode =
    category === ConditionCategory.SALES_WRITTEN
      ? "written_confirmation"
      : category === ConditionCategory.PERSONAL_EXPERIENCE
        ? condition.evaluation_mode === "context"
          ? "context"
          : "self_check"
        : condition.evaluation_mode === "sales_data"
          ? "sales_data"
          : condition.evaluation_mode === "web_research"
            ? "web_research"
        : condition.evaluation_mode === "rule"
          ? "vehicle_data"
          : "web_research";
  const rule = structuredRule(condition);
  const field = canonicalRuleField(rule?.field, condition.source_text);
  return {
    id: safeId("condition"),
    title: condition.source_text,
    detail: condition.clarification_question
      ? `需要补充：${condition.clarification_question}`
      : `原文：${condition.source_text}`,
    category,
    kind: condition.importance === "prefer" ? "preference" : "hard",
    rule,
    sourceText: condition.source_text,
    sourceStart: sourceStart >= 0 ? sourceStart : undefined,
    sourceEnd:
      sourceStart >= 0
        ? sourceStart + condition.source_text.length
        : undefined,
    concept: field || condition.category,
    scope:
      category === ConditionCategory.SALES_WRITTEN
        ? "transaction"
        : condition.evaluation_mode === "context"
          ? "context"
        : "comparison",
    verificationMode,
    dataFieldHints:
      field && SUPPORTED_AUTOMATIC_FIELDS.has(field) ? [field] : [],
  };
}

function conditionIdentity(condition: DecisionCondition) {
  const field = canonicalRuleField(condition.rule?.field, condition.title);
  const scope = condition.scope ?? "comparison";
  if (field) {
    return `field:${field}:${condition.rule?.operator ?? "unknown"}:${JSON.stringify(
      condition.rule?.value ?? null,
    )}:${scope}`;
  }
  if (condition.concept) return `concept:${condition.concept}:${scope}`;
  return `text:${condition.title.replace(/\s+/g, "")}:${scope}`;
}

export function buildConditions(
  input: NewDecisionProjectRequest,
  extraction: ConditionExtraction | null,
): DecisionCondition[] {
  const budget = budgetCondition(input);
  const structured = (extraction?.conditions ?? [])
    .filter((condition) => {
      const field = canonicalRuleField(condition.normalized.field ?? undefined);
      return !(
        condition.category === "budget" ||
        field === "landing_price_cny" ||
        field === "guide_price_cny"
      );
    })
    .slice(0, 50)
    .map((condition) => conditionFromStructured(condition, input.need));

  const explicitFallbacks = extractExplicitFallbackConditions(input.need);
  const explicitFields = new Set(
    explicitFallbacks.map((condition) =>
      canonicalRuleField(condition.rule?.field, condition.title),
    ),
  );
  const explicitSetFields = new Set(
    explicitFallbacks
      .filter((condition) =>
        ["in", "not_in", "between"].includes(
          condition.rule?.operator ?? "",
        ),
      )
      .map((condition) =>
        canonicalRuleField(condition.rule?.field, condition.title),
      ),
  );
  const atomConditions = extractRequirementAtoms(input.need)
    .filter((atom) => atom.concept !== "landing_price")
    .filter(
      (atom) =>
        !(
          atom.concept === "driving_range" &&
          explicitFields.has("cltc_pure_range_km")
        ) &&
        !(
          atom.concept === "fuel_economy" &&
          explicitFields.has("electricity_consumption_kwh100km")
        ) &&
        !(
          atom.concept === "seat_count" &&
          explicitSetFields.has("seat_count")
        ) &&
        !(
          atom.concept === "energy_type" &&
          explicitSetFields.has("energy_type")
        ),
    )
    .filter((atom) => {
      if (atom.concept !== "unmapped_user_need") return true;
      const representedByStructure = structured.some((condition) => {
        const source = condition.sourceText ?? "";
        return (
          source &&
          (atom.sourceText.includes(source) ||
            source.includes(atom.sourceText))
        );
      });
      const representedByExplicitRule = explicitFallbacks.some(
        (condition) =>
          atom.sourceText.includes(condition.title) ||
          condition.title.includes(atom.sourceText),
      );
      return !representedByStructure && !representedByExplicitRule;
    })
    .map(conditionFromRequirementAtom);
  const invalidStructured = (extraction?.invalid_conditions ?? []).map(
    (invalid): DecisionCondition => {
      const sourceStart = input.need.indexOf(invalid.source_text);
      return {
        id: safeId("condition"),
        title: invalid.source_text,
        detail: `Agent Plan 条件需要本人确认：${invalid.reason}`,
        category: ConditionCategory.PERSONAL_EXPERIENCE,
        kind: "preference",
        sourceText: invalid.source_text,
        sourceStart: sourceStart >= 0 ? sourceStart : undefined,
        sourceEnd:
          sourceStart >= 0
            ? sourceStart + invalid.source_text.length
            : undefined,
        concept: "invalid_agent_condition",
        scope: "comparison",
        verificationMode: "self_check",
        dataFieldHints: [],
      };
    },
  );

  const ordered = [
    budget,
    ...atomConditions,
    ...structured,
    ...invalidStructured,
    ...explicitFallbacks,
  ];
  const seen = new Set<string>();
  const userConditions = ordered.filter((condition) => {
    const identity = conditionIdentity(condition);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });

  if (userConditions.length === 1) {
    userConditions.push({
      id: safeId("condition"),
      title: input.need,
      detail: `原文：${input.need} · 本人试驾或实车确认`,
      category: ConditionCategory.PERSONAL_EXPERIENCE,
      kind: "preference",
      sourceText: input.need,
      sourceStart: 0,
      sourceEnd: input.need.length,
      concept: "unmapped_user_need",
      scope: "comparison",
      verificationMode: "self_check",
      dataFieldHints: [],
    });
  }

  return userConditions.slice(0, 50).map(
    (condition, order) => ({ ...condition, order }),
  );
}

/**
 * Keep the first request to one exact entity and the four decision fields.
 * Identity fields are returned by the vehicle dataset itself.
 */
export function buildFocusedDataProQuery(
  candidateName: string,
  conditions: DecisionCondition[],
) {
  return buildFocusedDataProQueries(candidateName, conditions)
    .map((query) => query.replace(`${candidateName.trim()} `, ""))
    .reduce(
      (query, label) => `${query}${query.endsWith(" ") ? "" : "、"}${label}`,
      `${candidateName.trim()} `,
    )
    .trim();
}

function focusedDataProFields(conditions: DecisionCondition[]) {
  return Array.from(
    new Set([
      "guide_price_cny",
      ...conditions
        .flatMap((condition) => [
          condition.rule?.field || !(condition.dataFieldHints?.length)
            ? canonicalRuleField(condition.rule?.field, condition.title)
            : "",
          ...(condition.dataFieldHints ?? []).map((field) =>
            canonicalRuleField(field),
          ),
        ])
        .filter((field) => SUPPORTED_AUTOMATIC_FIELDS.has(field)),
    ]),
  );
}

/**
 * DataPro recommends one exact entity plus one clear intent per query.
 * Keep every user-relevant field independent so one unsupported dimension
 * cannot suppress fields the professional dataset can return.
 */
export function buildFocusedDataProQueries(
  candidateName: string,
  conditions: DecisionCondition[],
) {
  return Array.from(
    new Set(
      focusedDataProFields(conditions)
        .map((field) => AUTOMATIC_FIELD_QUERY_LABELS[field])
        .filter(Boolean),
    ),
  )
    .map((label) => `${candidateName.trim()} ${label}`);
}

export function buildCompleteDataProQuery(candidateName: string) {
  return `${candidateName.trim()} 完整配置详情`;
}

export function buildVehicleIdentityOptionsQuery(
  candidateName: string,
  includeRefinement = false,
) {
  const yearMatch = candidateName.match(/(?:19|20)\d{2}\s*款?/);
  const subject = yearMatch
    ? candidateName.slice(0, yearMatch.index).trim()
    : candidateName.trim();
  const year = yearMatch?.[0].replace(/\s+/g, "") ?? "";
  const refinement =
    includeRefinement && yearMatch
      ? candidateName
          .slice((yearMatch.index ?? 0) + yearMatch[0].length)
          .replace(/(?:配置|车型)?待确认/g, "")
          .trim()
      : "";
  return `${subject || candidateName.trim()} ${year} ${refinement} 所有在售车型和指导价`
    .replace(/\s+/g, " ")
    .trim();
}

export function buildVehicleIdentityOptionQueries(
  candidateName: string,
  includeRefinement = false,
) {
  const primary = buildVehicleIdentityOptionsQuery(
    candidateName,
    includeRefinement,
  );
  const subject = primary.replace(/所有在售车型和指导价$/u, "").trim();
  return Array.from(
    new Set([
      primary,
      `中国汽车车型配置库 ${subject} 车型版本与价格`,
    ]),
  );
}

function candidateNameNeedsMoreIdentityDetail(candidateName: string) {
  const yearMatch = candidateName.match(/(?:19|20)\d{2}\s*款?/);
  if (!yearMatch) return true;
  const afterYear = candidateName
    .slice((yearMatch.index ?? 0) + yearMatch[0].length)
    .replace(/(?:配置)?待确认/g, "")
    .trim();
  return afterYear.length < 2;
}

export function requiresVehicleIdentitySelection(
  _candidateName: string,
  exactModelId?: string | null,
) {
  return !(
    exactModelId &&
    /^(?:datapro|datapro-name):/.test(exactModelId)
  );
}

export const DATAPRO_VEHICLE_TIMEOUT_MS = 90_000;
export const DATAPRO_COMPLETE_QUERY_TIMEOUT_MS = 45_000;
export const DATAPRO_FOCUSED_QUERY_TIMEOUT_MS = 60_000;
export const DATAPRO_IDENTITY_QUERY_TIMEOUT_MS = 60_000;
const DATAPRO_CITY_QUERY_TIMEOUT_MS = 60_000;

type DataProQueryClient = {
  query(
    query: string,
    options?: { signal?: AbortSignal },
  ): Promise<HarnessCallResult<DataProPayload>>;
};

export type VehicleDataProQueryMode =
  | "complete"
  | "focused"
  | "bare_fallback"
  | "identity_options";

export interface VehicleDataProQueryResult {
  result: HarnessCallResult<DataProPayload>;
  mode: VehicleDataProQueryMode;
  queries: string[];
  traceIds: string[];
  unboundFieldIds: string[];
  diagnostics: Array<{
    query: string;
    status: HarnessCallResult<DataProPayload>["status"];
    errorCode: string | null;
    traceId: string | null;
    payloadCode: string | null;
    exactMatch: boolean;
    returnedModelNames: string[];
    identityOptions: string[];
  }>;
  fallbackReason:
    | "too_many_fields"
    | "empty_items"
    | "unsupported_query"
    | "identity_mismatch"
    | "request_failed"
    | null;
}

function unboundDataProFieldIds(
  records: Array<{
    query: string;
    result: HarnessCallResult<DataProPayload>;
  }>,
  candidateName: string,
  selectedExactModelId?: string | null,
) {
  const candidatePrefix = `${candidateName.trim()} `;
  return Array.from(
    new Set(
      records.flatMap(({ query, result }) => {
        if (result.status !== "ok") return [];
        const parsed = parseDataProVehiclePayload(
          result.data,
          candidateName,
          result.meta.received_at,
          "unbound-field-check-only",
          { selectedExactModelId },
        );
        if (parsed.exactMatch) return [];
        const returnedModels =
          isPlainRecord(result.data) && Array.isArray(result.data.items)
            ? expandVehicleItems(result.data.items)
                .map(returnedModelName)
                .filter((value): value is string => Boolean(value))
            : [];
        if (!returnedModels.length) return [];
        const intent = query.startsWith(candidatePrefix)
          ? query.slice(candidatePrefix.length).trim()
          : "";
        return Object.entries(AUTOMATIC_FIELD_QUERY_LABELS)
          .filter(([, label]) => label === intent)
          .map(([field]) => field);
      }),
    ),
  );
}

function dataProQueryDiagnostics(
  records: Array<{
    query: string;
    result: HarnessCallResult<DataProPayload>;
  }>,
  candidateName: string,
  selectedExactModelId?: string | null,
): VehicleDataProQueryResult["diagnostics"] {
  return records.map(({ query, result }) => {
    const parsed = parseDataProVehiclePayload(
      result.status === "ok" ? result.data : null,
      candidateName,
      result.meta.received_at,
      "query-diagnostic-only",
      { selectedExactModelId },
    );
    const returnedModelNames =
      result.status === "ok" &&
      isPlainRecord(result.data) &&
      Array.isArray(result.data.items)
        ? Array.from(
            new Set(
              expandVehicleItems(result.data.items)
                .map(returnedModelName)
                .filter((value): value is string => Boolean(value)),
            ),
          ).slice(0, 10)
        : [];
    return {
      query,
      status: result.status,
      errorCode: result.error?.code ?? null,
      traceId: result.meta.trace_id,
      payloadCode: isPlainRecord(result.data)
        ? optionalText(result.data.code)
        : null,
      exactMatch: parsed.exactMatch,
      returnedModelNames,
      identityOptions: parsed.identityOptions
        .map((option) => option.displayName)
        .slice(0, 10),
    };
  });
}

function queryTraceIds(results: HarnessCallResult<DataProPayload>[]) {
  return Array.from(
    new Set(
      results
        .flatMap((result) => [result.meta.trace_id, result.meta.log_id])
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function mergeDataProValue(current: unknown, incoming: unknown): unknown {
  if (current === undefined || current === null) return incoming;
  if (incoming === undefined || incoming === null) return current;
  if (isPlainRecord(current) && isPlainRecord(incoming)) {
    const merged: Record<string, unknown> = { ...current };
    for (const [key, value] of Object.entries(incoming)) {
      merged[key] = mergeDataProValue(merged[key], value);
    }
    return merged;
  }
  if (Array.isArray(current) && Array.isArray(incoming)) {
    const seen = new Set<string>();
    return [...current, ...incoming].filter((value) => {
      const identity = JSON.stringify(value);
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  }
  return current;
}

function exactDataProItem(
  result: HarnessCallResult<DataProPayload>,
  candidateName: string,
  selectedExactModelId?: string | null,
) {
  if (
    result.status !== "ok" ||
    !isPlainRecord(result.data) ||
    !Array.isArray(result.data.items)
  ) {
    return null;
  }
  const exactItems = expandVehicleItems(result.data.items).filter((item) =>
    selectedExactModelId
      ? itemMatchesSelectedIdentity(item, selectedExactModelId)
      : itemMatchesExactRequest(item, candidateName),
  );
  return exactItems.length === 1 ? exactItems[0] : null;
}

function mergeFocusedDataProResults(
  results: HarnessCallResult<DataProPayload>[],
  candidateName: string,
  selectedExactModelId?: string | null,
): HarnessCallResult<DataProPayload> | null {
  const exactResults = results.flatMap((result) => {
    const item = exactDataProItem(
      result,
      candidateName,
      selectedExactModelId,
    );
    return item ? [{ result, item }] : [];
  });
  if (!exactResults.length) return null;

  const base = exactResults[0].result;
  const mergedItem = exactResults
    .map(({ item }) => item)
    .reduce<Record<string, unknown>>(
      (current, item) =>
        mergeDataProValue(current, item) as Record<string, unknown>,
      {},
    );
  return {
    ...base,
    data: {
      ...(isPlainRecord(base.data) ? base.data : {}),
      code: 0,
      dataset_type: "vehicle_config",
      items: [mergedItem],
    },
    meta: {
      ...base.meta,
      received_at: exactResults.at(-1)?.result.meta.received_at ??
        base.meta.received_at,
    },
  };
}

export function dataProFallbackReason(
  result: HarnessCallResult<DataProPayload>,
): VehicleDataProQueryResult["fallbackReason"] {
  const payloadCode = isPlainRecord(result.data)
    ? optionalText(result.data.code)
    : null;
  if (
    payloadCode === "4003" ||
    result.error?.code === "datapro_business_4003"
  ) {
    return "too_many_fields";
  }
  if (
    result.status === "ok" &&
    isPlainRecord(result.data) &&
    Array.isArray(result.data.items) &&
    result.data.items.length === 0
  ) {
    return "empty_items";
  }
  const message = [
    result.error?.message,
    isPlainRecord(result.data) ? optionalText(result.data.msg) : null,
    isPlainRecord(result.data) ? optionalText(result.data.message) : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
  return /不在支持范围|不支持.{0,12}(?:query|查询)|(?:query|request).{0,12}(?:not supported|out of scope)/i.test(
    message,
  )
    ? "unsupported_query"
    : null;
}

async function boundedDataProQuery(
  client: DataProQueryClient,
  query: string,
  timeoutMs: number,
) {
  return retryHarnessCall(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await client.query(query, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  });
}

export async function queryVehicleDataPro(
  candidateName: string,
  conditions: DecisionCondition[],
  client: DataProQueryClient = createDataProClient({
    timeoutMs: DATAPRO_VEHICLE_TIMEOUT_MS,
  }),
  selectedExactModelId?: string | null,
): Promise<VehicleDataProQueryResult> {
  const executedQueries: string[] = [];
  const executedResults: HarnessCallResult<DataProPayload>[] = [];
  const queryRecords: Array<{
    query: string;
    result: HarnessCallResult<DataProPayload>;
  }> = [];
  const runQuery = async (query: string, timeoutMs: number) => {
    executedQueries.push(query);
    const result = await boundedDataProQuery(client, query, timeoutMs);
    executedResults.push(result);
    queryRecords.push({ query, result });
    return result;
  };
  const complete = await runQuery(
    buildCompleteDataProQuery(candidateName),
    DATAPRO_COMPLETE_QUERY_TIMEOUT_MS,
  );
  let fallbackReason = dataProFallbackReason(complete);
  if (!fallbackReason && complete.status !== "ok") {
    fallbackReason = "request_failed";
  }
  if (
    !fallbackReason &&
    complete.status === "ok" &&
    isPlainRecord(complete.data) &&
    Array.isArray(complete.data.items) &&
    complete.data.items.length > 0 &&
    !parseDataProVehiclePayload(
      complete.data,
      candidateName,
      complete.meta.received_at,
      "identity-check-only",
      { selectedExactModelId },
    ).exactMatch
  ) {
    fallbackReason = "identity_mismatch";
  }
  if (!fallbackReason) {
    return {
      result: complete,
      mode: "complete",
      queries: executedQueries,
      traceIds: queryTraceIds(executedResults),
      unboundFieldIds: unboundDataProFieldIds(
        queryRecords,
        candidateName,
        selectedExactModelId,
      ),
      diagnostics: dataProQueryDiagnostics(
        queryRecords,
        candidateName,
        selectedExactModelId,
      ),
      fallbackReason: null,
    };
  }

  const focusedQueries = buildFocusedDataProQueries(
    candidateName,
    conditions,
  );
  const focusedSettled = await Promise.allSettled(
    focusedQueries.map((query) =>
      runQuery(query, DATAPRO_FOCUSED_QUERY_TIMEOUT_MS),
    ),
  );
  const focusedResults = focusedSettled.flatMap((outcome) =>
    outcome.status === "fulfilled" ? [outcome.value] : [],
  );
  const focused = mergeFocusedDataProResults(
    focusedResults,
    candidateName,
    selectedExactModelId,
  );
  if (focused) {
    return {
      result: focused,
      mode: "focused",
      queries: executedQueries,
      traceIds: queryTraceIds(executedResults),
      unboundFieldIds: unboundDataProFieldIds(
        queryRecords,
        candidateName,
        selectedExactModelId,
      ),
      diagnostics: dataProQueryDiagnostics(
        queryRecords,
        candidateName,
        selectedExactModelId,
      ),
      fallbackReason,
    };
  }

  const fallback = await runQuery(
    candidateName.trim(),
    DATAPRO_IDENTITY_QUERY_TIMEOUT_MS,
  );
  const fallbackParsed = parseDataProVehiclePayload(
    fallback.status === "ok" ? fallback.data : null,
    candidateName,
    fallback.meta.received_at,
    "identity-options-check-only",
    { selectedExactModelId },
  );
  if (
    !selectedExactModelId &&
    !fallbackParsed.exactMatch &&
    fallbackParsed.identityOptions.length === 0
  ) {
    const identityOptions = await runQuery(
      buildVehicleIdentityOptionsQuery(candidateName),
      DATAPRO_IDENTITY_QUERY_TIMEOUT_MS,
    );
    const identityOptionsParsed = parseDataProVehiclePayload(
      identityOptions.status === "ok" ? identityOptions.data : null,
      candidateName,
      identityOptions.meta.received_at,
      "identity-options-check-only",
    );
    if (
      identityOptionsParsed.exactMatch ||
      identityOptionsParsed.identityOptions.length > 0
    ) {
      return {
        result: identityOptions,
        mode: "identity_options",
        queries: executedQueries,
        traceIds: queryTraceIds(executedResults),
        unboundFieldIds: unboundDataProFieldIds(
          queryRecords,
          candidateName,
          selectedExactModelId,
        ),
        diagnostics: dataProQueryDiagnostics(
          queryRecords,
          candidateName,
          selectedExactModelId,
        ),
        fallbackReason,
      };
    }
  }
  return {
    result: fallback,
    mode: "bare_fallback",
    queries: executedQueries,
    traceIds: queryTraceIds(executedResults),
    unboundFieldIds: unboundDataProFieldIds(
      queryRecords,
      candidateName,
      selectedExactModelId,
    ),
    diagnostics: dataProQueryDiagnostics(
      queryRecords,
      candidateName,
      selectedExactModelId,
    ),
    fallbackReason,
  };
}

type FlatEntry = {
  path: string;
  key: string;
  value: unknown;
};

export interface ParsedDataProVehicle {
  exactMatch: boolean;
  exactModelId: string | null;
  matchedModelName: string | null;
  facts: VehicleFact[];
  identityOptions: VehicleIdentityOption[];
}

function mergeParsedVehicleIdentities(
  parsedResults: ParsedDataProVehicle[],
): ParsedDataProVehicle {
  const exact = parsedResults.find((parsed) => parsed.exactMatch);
  if (exact) return exact;

  const seen = new Set<string>();
  const mergedOptions = parsedResults.flatMap((parsed) =>
    parsed.identityOptions.filter((option) => {
      if (seen.has(option.exactModelId)) return false;
      seen.add(option.exactModelId);
      return true;
    }),
  );
  const exactIdentityOptions = mergedOptions.filter(
    (option) => !option.exactModelId.startsWith("datapro-series:"),
  );
  const identityOptions = exactIdentityOptions.length
    ? exactIdentityOptions
    : mergedOptions;
  return {
    exactMatch: false,
    exactModelId: null,
    matchedModelName: null,
    facts: [],
    identityOptions: identityOptions.slice(0, 20),
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function flattenEntries(
  value: unknown,
  path: string[] = [],
  output: FlatEntry[] = [],
): FlatEntry[] {
  if (Array.isArray(value)) {
    output.push({
      path: path.join("."),
      key: path.at(-1) ?? "",
      value,
    });
    return output;
  }
  if (!isPlainRecord(value)) {
    output.push({
      path: path.join("."),
      key: path.at(-1) ?? "",
      value,
    });
    return output;
  }
  if (
    Object.hasOwn(value, "value") &&
    (typeof value.value === "string" || typeof value.value === "number")
  ) {
    output.push({
      path: path.join("."),
      key: path.at(-1) ?? "",
      value,
    });
    return output;
  }
  for (const [key, nested] of Object.entries(value)) {
    flattenEntries(nested, [...path, key], output);
  }
  return output;
}

function returnedModelName(item: Record<string, unknown>): string | null {
  const direct =
    optionalText(item["车型全称"]) ??
    optionalText(item["车型名称"]) ??
    optionalText(item["车型"]) ??
    optionalText(item["车型版本"]) ??
    optionalText(item["款型名称"]) ??
    optionalText(item["配置名称"]);
  if (direct) return direct;

  const info = isPlainRecord(item["车型信息"])
    ? item["车型信息"]
    : null;
  if (!info) return null;
  const nestedDirect =
    optionalText(info["车型名称"]) ??
    optionalText(info["车型"]) ??
    optionalText(info["款型名称"]) ??
    optionalText(info["配置名称"]);
  if (nestedDirect) return nestedDirect;
  const brand = optionalText(info["品牌"])
    ?.replace(/[（(][^）)]*[）)]/g, "")
    .trim();
  const series = optionalText(info["车系"]);
  const seatLayout = (
    optionalText(info["座位数"]) ?? optionalText(info["座椅布局"])
  )
    ?.replace(/[（(][^）)]*[）)]/g, "")
    .trim();
  const version =
    optionalText(info["版本"]) ?? optionalText(info["配置"]);
  const energyType =
    optionalText(info["能源类型"]) ?? optionalText(info["燃料类型"]);
  const versionWithEnergy =
    energyType && version && !version.includes(energyType)
      ? `${energyType} ${version}`
      : version ?? energyType;
  const parts = [
    brand && series
      ? displayBrandAndSeries(brand, series)
      : brand ?? series,
    optionalText(info["年款"]),
    versionWithEnergy,
    seatLayout,
  ].filter((part): part is string => Boolean(part));
  return parts.length >= 3 ? parts.join(" ") : null;
}

function returnedModelCode(item: Record<string, unknown>): string | null {
  const entry = flattenEntries(item).find((candidate) =>
    /^(车型|款型|配置)(编码|ID)$/i.test(candidate.key),
  );
  return entryText(entry);
}

function exactModelIdForItem(
  item: Record<string, unknown>,
): string | null {
  const code = returnedModelCode(item);
  if (code) return `datapro:${code}`;
  const name = returnedModelName(item);
  return name ? `datapro-name:${encodeURIComponent(name)}` : null;
}

function decodedDataProName(exactModelId: string): string | null {
  if (!exactModelId.startsWith("datapro-name:")) return null;
  try {
    return decodeURIComponent(exactModelId.slice("datapro-name:".length));
  } catch {
    return null;
  }
}

function itemMatchesSelectedIdentity(
  item: Record<string, unknown>,
  selectedExactModelId: string,
) {
  if (selectedExactModelId.startsWith("datapro:")) {
    return (
      returnedModelCode(item) ===
      selectedExactModelId.slice("datapro:".length)
    );
  }
  const selectedName = decodedDataProName(selectedExactModelId);
  const returnedName = returnedModelName(item);
  return Boolean(
    selectedName &&
      returnedName &&
      normalizeModelDescriptor(returnedName) ===
        normalizeModelDescriptor(selectedName),
  );
}

function isGenericVehicleHeading(value: string) {
  const compact = value.replace(/\s+/g, "");
  return (
    /^(?:增程版|纯电版)?版本(?:及价格|及指导价|配置差异|价格|配置)$/u.test(
      compact,
    ) ||
    /(?:终端)?优惠行情$/u.test(compact)
  );
}

function vehicleCollectionContext(
  vehicle: Record<string, unknown>,
  labels: string[],
) {
  let enriched = vehicle;
  const versionName = optionalText(vehicle["车型版本"]);
  if (
    versionName &&
    !optionalText(vehicle["车型名称"]) &&
    !optionalText(vehicle["车型全称"])
  ) {
    const year =
      labels.join(" ").match(/(?:19|20)\d{2}\s*款?/)?.[0] ?? "";
    enriched = {
      ...enriched,
      车型名称: [year, versionName].filter(Boolean).join(" "),
    };
  }
  if (
    optionalText(enriched["能源类型"]) ||
    optionalText(enriched["燃料类型"])
  ) {
    return enriched;
  }
  const context = labels.join(" ");
  const energyType = context.match(/纯电|增程|插混|混动/)?.[0];
  return energyType ? { ...enriched, 能源类型: energyType } : enriched;
}

function explicitVehicleEntries(
  value: unknown,
  labels: string[] = [],
): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value
      .filter(isPlainRecord)
      .map((vehicle) => vehicleCollectionContext(vehicle, labels));
  }
  if (!isPlainRecord(value)) return [];
  if (returnedModelName(value)) {
    return [vehicleCollectionContext(value, labels)];
  }

  return Object.entries(value).flatMap(([label, entry]) => {
    if (Array.isArray(entry)) {
      return explicitVehicleEntries(entry, [...labels, label]);
    }
    if (isPlainRecord(entry)) {
      const nested = explicitVehicleEntries(entry, [...labels, label]);
      if (nested.length) return nested;
    }
    const looksLikeVehicleLabel =
      /(?:19|20)\d{2}|款|版|座|Max|Ultra|Pro|Plus|旗舰|尊享|智驾|续航/iu.test(
        label,
      );
    if (!looksLikeVehicleLabel) return [];
    if (isPlainRecord(entry)) {
      return [
        vehicleCollectionContext(
          {
            车型全称: label,
            ...entry,
          },
          labels,
        ),
      ];
    }
    if (
      typeof entry === "string" ||
      typeof entry === "number"
    ) {
      return [{ 车型全称: label, 官方指导价: entry }];
    }
    return [];
  });
}

function isVehiclePriceCollectionKey(key: string) {
  const compact = key.replace(/\s+/g, "");
  return (
    /(?:车型|款型).*(?:在售|指导价|价格)|(?:在售|指导价|价格).*(?:车型|款型)/u.test(
      compact,
    ) ||
    /版本.*(?:指导价|价格)|(?:指导价|价格).*版本/u.test(compact)
  );
}

function explicitVehicleCollections(
  source: Record<string, unknown> | null,
): Record<string, unknown>[] {
  if (!source) return [];
  return Object.entries(source).flatMap(([key, value]) => {
    if (!isVehiclePriceCollectionKey(key)) return [];
    if (!Array.isArray(value) && !isPlainRecord(value)) return [];
    return explicitVehicleEntries(value);
  });
}

function expandVehicleItems(items: unknown[]): Record<string, unknown>[] {
  return items.filter(isPlainRecord).flatMap((item) => {
    const info = isPlainRecord(item["车型信息"])
      ? item["车型信息"]
      : null;
    const configuration = isPlainRecord(item["配置参数"])
      ? item["配置参数"]
      : null;
    const listKeys = [
      "具体车型与指导价",
      "车型版本与价格",
      "在售车型及指导价",
      "在售车型列表",
      "车型指导价明细",
      "指导价明细",
      "官方指导价",
    ];
    const explicitVehicles = [
      ...listKeys.flatMap((key) => explicitVehicleEntries(item[key])),
      ...listKeys.flatMap((key) =>
        explicitVehicleEntries(configuration?.[key]),
      ),
      ...explicitVehicleCollections(item),
      ...explicitVehicleCollections(configuration),
    ].filter((vehicle, index, all) => {
      const name = returnedModelName(vehicle);
      if (!name || isGenericVehicleHeading(name)) return false;
      const normalizedName = normalizeModelDescriptor(name);
      return (
        all.findIndex(
          (candidate) =>
            normalizeModelDescriptor(returnedModelName(candidate) ?? "") ===
            normalizedName,
        ) === index
      );
    });
    if (explicitVehicles.length) {
      const sharedItem = Object.fromEntries(
        Object.entries(item).filter(
          ([key]) =>
            key !== "具体车型与指导价" &&
            key !== "配置参数",
        ),
      );
      return explicitVehicles.map((vehicle) => {
        const fullName =
          optionalText(vehicle["车型全称"]) ??
          optionalText(vehicle["车型名称"]) ??
          optionalText(vehicle["车型"]);
        return {
          ...sharedItem,
          ...vehicle,
          ...(fullName ? { 车型名称: fullName } : {}),
          车型信息: {
            ...(info ?? {}),
            ...vehicle,
            ...(fullName ? { 车型名称: fullName } : {}),
          },
        };
      });
    }
    const nested = info && Array.isArray(info["车型列表"])
      ? info["车型列表"].filter(isPlainRecord)
      : [];
    if (!nested.length) return [item];
    const sharedInfo = Object.fromEntries(
      Object.entries(info ?? {}).filter(([key]) => key !== "车型列表"),
    );
    return nested.map((vehicle) => ({
      ...item,
      ...vehicle,
      车型信息: {
        ...sharedInfo,
        ...vehicle,
      },
    }));
  });
}

function normalizeModelDescriptor(value: string): string {
  return value
    .toLocaleLowerCase("zh-CN")
    .replace(/(?:19|20)\d{2}\s*款?/g, "")
    .replace(/(?:阔|大)?五座/g, "5座")
    .replace(/(?:享)?六座/g, "6座")
    .replace(/七座/g, "7座")
    .replace(/汽车/g, "")
    .replace(/版/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function modelYear(value: string): string | null {
  return value.match(/(?:19|20)\d{2}/)?.[0] ?? null;
}

function returnedModelYears(item: Record<string, unknown>): Set<string> {
  const info = isPlainRecord(item["车型信息"]) ? item["车型信息"] : null;
  const values = [
    returnedModelName(item),
    optionalText(item["年款"]),
    optionalText(item["车型年款"]),
    optionalText(info?.["年款"]),
    optionalText(info?.["车型年款"]),
  ];
  return new Set(
    values.flatMap((value) => {
      const year = value ? modelYear(value) : null;
      return year ? [year] : [];
    }),
  );
}

function returnedBrandName(item: Record<string, unknown>) {
  const info = isPlainRecord(item["车型信息"]) ? item["车型信息"] : null;
  return optionalText(item["品牌"]) ?? optionalText(info?.["品牌"]);
}

function returnedManufacturerName(item: Record<string, unknown>) {
  const info = isPlainRecord(item["车型信息"]) ? item["车型信息"] : null;
  return optionalText(item["厂商"]) ?? optionalText(info?.["厂商"]);
}

function returnedSeriesName(item: Record<string, unknown>) {
  const info = isPlainRecord(item["车型信息"]) ? item["车型信息"] : null;
  return optionalText(item["车系"]) ?? optionalText(info?.["车系"]);
}

function stripLeadingNormalizedBrand(value: string, brand: string | null) {
  const normalizedValue = normalizeModelDescriptor(value);
  const normalizedBrand = brand ? normalizeModelDescriptor(brand) : "";
  return normalizedBrand && normalizedValue.startsWith(normalizedBrand)
    ? normalizedValue.slice(normalizedBrand.length)
    : normalizedValue;
}

function stripVisibleLeadingBrand(value: string, brand: string | null) {
  if (!brand) return value;
  const escapedBrand = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    value.replace(new RegExp(`^${escapedBrand}`, "iu"), "").trim() || value
  );
}

function collapseAdjacentDuplicateWords(value: string) {
  return value
    .split(/\s+/)
    .filter(
      (word, index, words) =>
        index === 0 ||
        normalizeModelDescriptor(word) !==
          normalizeModelDescriptor(words[index - 1]),
    )
    .join(" ");
}

function displayBrandAndSeries(
  brand: string | null | undefined,
  series: string,
) {
  const cleanBrand = brand?.trim();
  const cleanSeries = series.trim();
  if (!cleanBrand) return cleanSeries;
  if (cleanSeries.startsWith(cleanBrand)) {
    return [cleanBrand, cleanSeries.slice(cleanBrand.length)]
      .filter(Boolean)
      .join(" ");
  }
  for (
    let overlap = Math.min(cleanBrand.length, cleanSeries.length);
    overlap >= 2;
    overlap -= 1
  ) {
    if (cleanBrand.slice(-overlap) === cleanSeries.slice(0, overlap)) {
      return [cleanBrand, cleanSeries.slice(overlap)]
        .filter(Boolean)
        .join(" ");
    }
  }
  return `${cleanBrand} ${cleanSeries}`;
}

function preferredDisplayBrand(
  brand: string | null | undefined,
  manufacturer: string | null | undefined,
) {
  const cleanBrand = brand
    ?.replace(/[（(][^）)]*[）)]/g, "")
    .trim();
  const cleanManufacturer = manufacturer?.trim();
  if (!cleanBrand) return cleanManufacturer;
  if (!cleanManufacturer) return cleanBrand;
  return normalizeModelDescriptor(cleanManufacturer).startsWith(
    normalizeModelDescriptor(cleanBrand),
  )
    ? cleanManufacturer
    : cleanBrand;
}

function identityOptionDisplayName(
  returnedName: string,
  candidateName: string,
  returnedBrand?: string | null,
  returnedSeries?: string | null,
  returnedManufacturer?: string | null,
) {
  const displayBrand = returnedBrand
    ?.replace(/[（(][^）)]*[）)]/g, "")
    .trim();
  const requestedYearMatch = candidateName.match(/(?:19|20)\d{2}\s*款?/);
  const returnedYearMatch = returnedName.match(/(?:19|20)\d{2}\s*款?/);
  const year =
    returnedYearMatch?.[0].replace(/\s+/g, "") ??
    requestedYearMatch?.[0].replace(/\s+/g, "");
  if (!requestedYearMatch && year && returnedSeries) {
    const canonicalBrand = preferredDisplayBrand(
      returnedBrand,
      returnedManufacturer,
    );
    const series = stripVisibleLeadingBrand(
      returnedSeries,
      returnedBrand ?? null,
    ).replace(/\s*(?:EREV|PHEV|HEV|EV)$/iu, "");
    const returnedWithoutYear = returnedName
      .replace(/(?:19|20)\d{2}\s*款?/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const seriesPattern = Array.from(series.replace(/\s+/g, ""))
      .map((character) =>
        character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      )
      .join("\\s*");
    const seriesMatch = returnedWithoutYear.match(
      new RegExp(seriesPattern, "iu"),
    );
    const remainder = seriesMatch
      ? returnedWithoutYear
          .slice((seriesMatch.index ?? 0) + seriesMatch[0].length)
          .trim()
      : returnedWithoutYear;
    const remainderWithoutBrand = canonicalBrand
      ? remainder
          .replace(
            new RegExp(
              `^${canonicalBrand.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&",
              )}\\s*`,
              "iu",
            ),
            "",
          )
          .trim()
      : remainder;
    return [canonicalBrand, series, year, remainderWithoutBrand]
      .filter(Boolean)
      .join(" ");
  }
  if (!requestedYearMatch || !year) {
    const canonicalBrand = preferredDisplayBrand(
      returnedBrand,
      returnedManufacturer,
    );
    const canonicalSeries = returnedSeries
      ? stripVisibleLeadingBrand(returnedSeries, returnedBrand ?? null)
      : null;
    const normalizedReturnedName = normalizeModelDescriptor(returnedName);
    const missingBrand =
      canonicalBrand &&
      !normalizedReturnedName.includes(
        normalizeModelDescriptor(canonicalBrand),
      );
    const missingSeries =
      canonicalSeries &&
      !normalizedReturnedName.includes(
        normalizeModelDescriptor(canonicalSeries),
      );
    return [missingBrand ? canonicalBrand : null, missingSeries ? canonicalSeries : null, returnedName]
      .filter(Boolean)
      .join(" ");
  }

  const requestedPrefix = candidateName
    .slice(0, requestedYearMatch.index)
    .trim();
  const prefixParts = requestedPrefix.split(/\s+/).filter(Boolean);
  if (prefixParts.length < 2) {
    const canonicalPrefix = displayBrandAndSeries(
      displayBrand ?? returnedManufacturer,
      returnedSeries ?? requestedPrefix,
    );
    const returnedWithoutYear = returnedName
      .replace(/(?:19|20)\d{2}\s*款?/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const seriesPattern = returnedSeries
      ? Array.from(returnedSeries.replace(/\s+/g, ""))
          .map((character) =>
            character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          )
          .join("\\s*")
      : null;
    const seriesMatch = seriesPattern
      ? returnedWithoutYear.match(new RegExp(seriesPattern, "iu"))
      : null;
    const remainder = seriesMatch
      ? returnedWithoutYear
          .slice((seriesMatch.index ?? 0) + seriesMatch[0].length)
          .trim()
      : returnedWithoutYear;
    return collapseAdjacentDuplicateWords(
      [canonicalPrefix, year, remainder].filter(Boolean).join(" "),
    );
  }

  const series = prefixParts.slice(1).join(" ");
  const seriesPattern = Array.from(series.replace(/\s+/g, ""))
    .map((character) => character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s*");
  const returnedWithoutYear = returnedName
    .replace(/(?:19|20)\d{2}\s*款?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const seriesMatch = returnedWithoutYear.match(new RegExp(seriesPattern, "iu"));
  if (!seriesMatch) {
    const canonicalPrefix = [
      displayBrand ?? returnedManufacturer ?? prefixParts[0],
      ...prefixParts.slice(1),
    ].join(" ");
    const remainderWithoutBrand = returnedBrand
      ? returnedWithoutYear
          .replace(
            new RegExp(
              `^${returnedBrand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`,
              "iu",
            ),
            "",
          )
          .trim()
      : returnedWithoutYear;
    return collapseAdjacentDuplicateWords(
      [canonicalPrefix, year, remainderWithoutBrand]
        .filter(Boolean)
        .join(" "),
    );
  }

  const remainder = returnedWithoutYear
    .slice((seriesMatch.index ?? 0) + seriesMatch[0].length)
    .trim();
  const canonicalPrefix = [
    displayBrand ?? prefixParts[0],
    ...prefixParts.slice(1),
  ].join(" ");
  return collapseAdjacentDuplicateWords(
    [canonicalPrefix, year, remainder].filter(Boolean).join(" "),
  );
}

function itemMatchesExactRequest(
  item: Record<string, unknown>,
  candidateName: string,
  requireMoreSpecificIdentity = false,
) {
  if (candidateNameNeedsMoreIdentityDetail(candidateName)) return false;
  const returnedName = returnedModelName(item);
  if (!returnedName) return false;
  const requestedYear = modelYear(candidateName);
  if (!requestedYear) return false;
  const returnedYears = returnedModelYears(item);
  if (returnedYears.size !== 1 || !returnedYears.has(requestedYear)) {
    return false;
  }
  const brand = returnedBrandName(item);
  const requestedWithoutYear = candidateName.replace(
    /(?:19|20)\d{2}\s*款?/g,
    " ",
  );
  const returnedWithoutYear = returnedName.replace(
    /(?:19|20)\d{2}\s*款?/g,
    " ",
  );
  const returnedCompositeWithoutYear = [
    brand,
    returnedSeriesName(item),
    returnedName,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/(?:19|20)\d{2}\s*款?/g, " ");
  const requestedVariants = new Set([
    normalizeModelDescriptor(requestedWithoutYear),
    stripLeadingNormalizedBrand(requestedWithoutYear, brand),
    normalizeModelDescriptor(
      requestedWithoutYear.split(/\s+/).filter(Boolean).slice(1).join(" "),
    ),
  ]);
  const returnedVariants = new Set([
    normalizeModelDescriptor(returnedWithoutYear),
    stripLeadingNormalizedBrand(returnedWithoutYear, brand),
    normalizeModelDescriptor(returnedCompositeWithoutYear),
    stripLeadingNormalizedBrand(returnedCompositeWithoutYear, brand),
    normalizeModelDescriptor(
      [returnedSeriesName(item), returnedName].filter(Boolean).join(" "),
    ),
  ]);
  const exactDescriptorMatch = Array.from(requestedVariants)
    .filter((value) => value.length >= 4)
    .some((requested) =>
      Array.from(returnedVariants).some(
        (returned) => returned === requested,
      ),
    );
  return exactDescriptorMatch && !requireMoreSpecificIdentity;
}

function cleanVersionRefinement(value: string) {
  const trimmed = value
    .replace(/[：:].*$/u, "")
    .replace(/(?:增程|纯电)(?:式)?版?.*$/u, "")
    .replace(
      /(?:系列)?(?:定位|新增配置|专属配置|配置差异|核心差异|价格规律|价格|指导价|售价|续航|动力)$/u,
      "",
    )
    .trim();
  if (
    !trimmed ||
    trimmed.length > 40 ||
    /^(?:综合(?:续航|功率|扭矩)|亮点|选装|相比)/u.test(trimmed) ||
    /^(?:版本|配置|车型|价格|指导价|官方指导价|全系|标配)$/u.test(
      trimmed,
    )
  ) {
    return null;
  }
  return trimmed;
}

function versionRefinementsFromItem(item: Record<string, unknown>) {
  const info = isPlainRecord(item["车型信息"])
    ? item["车型信息"]
    : null;
  const configuration = isPlainRecord(item["配置参数"])
    ? item["配置参数"]
    : null;
  const refinements: string[] = [];
  for (const value of [
    item["版本系列"],
    item["版本序列"],
    info?.["版本系列"],
    info?.["版本序列"],
  ]) {
    if (!Array.isArray(value)) continue;
    for (const entry of value) {
      const text = optionalText(entry);
      if (text) refinements.push(text);
    }
  }

  for (const source of [item, configuration]) {
    if (!source) continue;
    for (const [key, value] of Object.entries(source)) {
      if (!/版本.*(?:差异|定位|配置|价格)/u.test(key)) continue;
      if (isPlainRecord(value)) {
        refinements.push(...Object.keys(value));
      } else if (Array.isArray(value)) {
        for (const entry of value) {
          const text = optionalText(entry);
          if (text) refinements.push(text);
        }
      }
    }
  }
  return Array.from(
    new Set(
      refinements
        .map(cleanVersionRefinement)
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function identityOptionsFromItems(
  items: Record<string, unknown>[],
  candidateName: string,
  exactMatches: Record<string, unknown>[],
  restrictToSelectedRefinement = false,
): VehicleIdentityOption[] {
  const requestedYear = modelYear(candidateName);
  const yearMatch = candidateName.match(/(?:19|20)\d{2}\s*款?/);
  const seriesText = yearMatch
    ? candidateName.slice(0, yearMatch.index).trim()
    : candidateName;
  const seriesParts = seriesText.split(/\s+/).filter(Boolean);
  const requestedSeriesVariants = [
    normalizeModelDescriptor(seriesText),
    normalizeModelDescriptor(seriesParts.slice(1).join(" ")),
  ].filter((value) => value.length >= 3);
  const requestedRefinement = yearMatch
    ? normalizeModelDescriptor(
        candidateName
          .slice((yearMatch.index ?? 0) + yearMatch[0].length)
          .replace(/(?:配置|车型)?待确认/g, "")
          .trim(),
      )
    : "";
  const normalizedCandidateIdentity = normalizeModelDescriptor(candidateName);
  const requiredIdentityTokens = [
    ...(candidateName.includes("纯电") ? ["纯电"] : []),
    ...(candidateName.includes("增程") ? ["增程"] : []),
    ...Array.from(normalizedCandidateIdentity.matchAll(/[4-9]座/gu)).map(
      (match) => match[0],
    ),
  ];
  const optionItems =
    exactMatches.length > 1
      ? exactMatches
      : items.filter((item) => {
          const returnedName = returnedModelName(item);
          if (!returnedName) return false;
          if (requestedYear) {
            const years = returnedModelYears(item);
            if (!years.has(requestedYear)) return false;
          }
          const brand = returnedBrandName(item);
          const normalizedCandidate = normalizeModelDescriptor(seriesText);
          const normalizedBrand = brand
            ? normalizeModelDescriptor(brand)
            : "";
          if (
            normalizedBrand &&
            normalizedCandidate === normalizedBrand
          ) {
            return false;
          }
          const candidateWithoutBrand = stripLeadingNormalizedBrand(
            seriesText,
            brand,
          );
          const returned = normalizeModelDescriptor(
            [brand, returnedSeriesName(item), returnedName]
              .filter(Boolean)
              .join(" "),
          );
          const variants = Array.from(
            new Set([...requestedSeriesVariants, candidateWithoutBrand]),
          ).filter((series) => series.length >= 2);
          if (!variants.some((series) => returned.includes(series))) {
            return false;
          }
          if (!restrictToSelectedRefinement || !requestedRefinement) {
            return true;
          }
          const returnedDetail = normalizeModelDescriptor(
            returnedName.replace(/(?:19|20)\d{2}\s*款?/g, " "),
          );
          return returnedDetail.includes(requestedRefinement);
        });

  if (!requestedYear) {
    const uniqueSeries = new Map<
      string,
      { brand: string | null; manufacturer: string | null; series: string }
    >();
    const logicalSeries = new Set<string>();
    for (const item of optionItems) {
      const series = returnedSeriesName(item);
      if (!series) continue;
      const brand = returnedBrandName(item);
      const manufacturer = returnedManufacturerName(item);
      const seriesWithoutBrand = stripVisibleLeadingBrand(series, brand);
      const key = normalizeModelDescriptor(
        [preferredDisplayBrand(brand, manufacturer), seriesWithoutBrand]
          .filter(Boolean)
          .join(" "),
      );
      if (!uniqueSeries.has(key)) {
        uniqueSeries.set(key, { brand, manufacturer, series });
      }
      logicalSeries.add(
        normalizeModelDescriptor(seriesWithoutBrand).replace(
          /(?:erev|phev|hev|ev|dmi|增程|纯电|插混|混动)$/u,
          "",
        ),
      );
    }
    if (logicalSeries.size > 1) {
      return Array.from(uniqueSeries.values())
        .slice(0, 5)
        .map(({ brand, manufacturer, series }) => {
          const displayName = displayBrandAndSeries(
            preferredDisplayBrand(brand, manufacturer),
            stripVisibleLeadingBrand(series, brand),
          );
          return {
            exactModelId: `datapro-series:${encodeURIComponent(displayName)}`,
            displayName,
          };
        });
    }
  }

  const seen = new Set<string>();
  const exactOptions = optionItems.flatMap((item): VehicleIdentityOption[] => {
    const returnedName = returnedModelName(item);
    if (!returnedName) return [];
    const info = isPlainRecord(item["车型信息"])
      ? item["车型信息"]
      : null;
    const displayName = identityOptionDisplayName(
      returnedName,
      candidateName,
      optionalText(item["品牌"]) ?? optionalText(info?.["品牌"]),
      optionalText(item["车系"]) ?? optionalText(info?.["车系"]),
      optionalText(item["厂商"]) ?? optionalText(info?.["厂商"]),
    );
    if (
      requestedYear &&
      candidateNameNeedsMoreIdentityDetail(displayName)
    ) {
      return [];
    }
    const normalizedDisplayName = normalizeModelDescriptor(displayName);
    if (
      requiredIdentityTokens.some(
        (token) => !normalizedDisplayName.includes(token),
      )
    ) {
      return [];
    }
    if (seen.has(displayName)) return [];
    seen.add(displayName);
    const code =
      optionalText(item["车型编码"]) ??
      optionalText(item["款型编码"]) ??
      optionalText(item["配置编码"]);
    const displayAfterYear = displayName
      .replace(/^.*?(?:19|20)\d{2}\s*款?/u, "")
      .trim();
    const isVersionSeriesOnly = /系列$/u.test(displayAfterYear);
    return [
      {
        exactModelId: isVersionSeriesOnly
          ? `datapro-series:${encodeURIComponent(displayName)}`
          : code
          ? `datapro:${code}`
          : `datapro-name:${encodeURIComponent(returnedName)}`,
        displayName,
      },
    ];
  }).slice(0, 20);
  if (exactOptions.length || !requestedYear) return exactOptions;

  const afterYear = yearMatch
    ? candidateName
        .slice((yearMatch.index ?? 0) + yearMatch[0].length)
        .replace(/(?:配置|车型)?待确认/g, "")
        .trim()
    : "";
  if (afterYear) return [];

  const refinementSeen = new Set<string>();
  const refinementYear =
    yearMatch?.[0].replace(/\s+/g, "") ?? requestedYear;
  return items.flatMap((item): VehicleIdentityOption[] => {
    const info = isPlainRecord(item["车型信息"])
      ? item["车型信息"]
      : null;
    const versions = versionRefinementsFromItem(item);
    if (!versions.length) return [];
    const brand =
      optionalText(item["品牌"]) ??
      optionalText(info?.["品牌"]) ??
      returnedManufacturerName(item);
    const series = returnedSeriesName(item) ?? seriesText;
    const prefix = displayBrandAndSeries(
      brand?.replace(/[（(][^）)]*[）)]/g, "").trim(),
      series,
    );
    return versions.flatMap((versionText): VehicleIdentityOption[] => {
      const displayName = collapseAdjacentDuplicateWords(
        `${prefix} ${refinementYear} ${versionText}`,
      );
      if (refinementSeen.has(displayName)) return [];
      refinementSeen.add(displayName);
      return [
        {
          exactModelId: `datapro-series:${encodeURIComponent(displayName)}`,
          displayName,
        },
      ];
    });
  }).slice(0, 10);
}

function entryText(entry: FlatEntry | undefined): string | null {
  if (!entry) return null;
  if (Array.isArray(entry.value)) {
    const values = entry.value
      .map((item) => {
        if (!isPlainRecord(item)) return optionalText(item);
        const value = optionalText(item.value);
        const unit = optionalText(item.unit);
        const condition =
          optionalText(item.condition) ??
          optionalText(item.条件) ??
          optionalText(item.适用条件);
        return value
          ? `${value}${unit ?? ""}${condition ? `（${condition}）` : ""}`
          : null;
      })
      .filter((value): value is string => Boolean(value));
    return values.length ? values.join(" / ") : null;
  }
  if (isPlainRecord(entry.value)) {
    const value = optionalText(entry.value.value);
    const unit = optionalText(entry.value.unit);
    return value ? `${value}${unit ?? ""}` : null;
  }
  return optionalText(entry.value);
}

function rangeNumbersFromText(text: string): number[] {
  const normalized = text.replace(/,/g, "").trim();
  if (
    /^\d+(?:\.\d+)?(?:\s*[/–~至到-]\s*\d+(?:\.\d+)?)+\s*(?:km|公里)?$/i.test(
      normalized,
    )
  ) {
    return Array.from(normalized.matchAll(/\d+(?:\.\d+)?/g), (match) =>
      Number(match[0]),
    ).filter(Number.isFinite);
  }
  const numbers: number[] = [];
  for (const match of normalized.matchAll(/(\d+(?:\.\d+)?)\s*(?:km|公里)/gi)) {
    const index = match.index ?? 0;
    const nearby = normalized.slice(
      Math.max(0, index - 12),
      index + match[0].length,
    );
    if (/充电|补能|增加|补充|充入|充至/.test(nearby)) continue;
    const number = Number(match[1]);
    if (Number.isFinite(number)) numbers.push(number);
  }
  if (numbers.length) return numbers;
  if (/^\d+(?:\.\d+)?$/.test(normalized)) {
    const number = Number(normalized);
    return Number.isFinite(number) ? [number] : [];
  }
  return [];
}

function entryRangeNumbers(entry: FlatEntry): number[] {
  const values = Array.isArray(entry.value) ? entry.value : [entry.value];
  const numbers: number[] = [];
  for (const value of values) {
    const scalar = isPlainRecord(value) ? value.value : value;
    const text = optionalText(scalar);
    if (!text) return [];
    const parsed = rangeNumbersFromText(text);
    if (!parsed.length) return [];
    numbers.push(...parsed);
  }
  return numbers;
}

function findEntry(
  entries: FlatEntry[],
  predicates: Array<(entry: FlatEntry) => boolean>,
) {
  for (const predicate of predicates) {
    const entry = entries.find(predicate);
    if (entry) return entry;
  }
  return undefined;
}

function normalizedNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : undefined;
}

function normalizedGuidePrice(value: string | null): number | undefined {
  if (!value || /[-–~至]/.test(value)) return undefined;
  const number = normalizedNumber(value);
  if (number === undefined) return undefined;
  return /万/.test(value) ? Math.round(number * 10_000) : number;
}

/**
 * Reads only a single, explicitly labelled landing-total amount. Component
 * prices, unlabeled numbers, ranges and approximate amounts are deliberately
 * rejected instead of guessed.
 */
export function parseExplicitLandingQuoteCny(
  note: string | undefined,
): number | undefined {
  const text = note?.trim();
  if (!text) return undefined;
  if (
    /\d[\d,.]*\s*(?:万(?:元)?|元)?\s*[-–~至到]\s*\d/i.test(text)
  ) {
    return undefined;
  }
  const pattern =
    /(?:落地(?:总价|价|报价)?|总价|总金额|合计(?:金额)?|完整报价)\s*(?:为|是|[:：])?\s*[¥￥]?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(万(?:元)?|元)/g;
  const matches = Array.from(text.matchAll(pattern));
  if (matches.length !== 1) return undefined;
  const match = matches[0];
  const nearby = text.slice(
    Math.max(0, (match.index ?? 0) - 4),
    (match.index ?? 0) + match[0].length + 4,
  );
  if (
    /约|大约|预计|预估|左右|上下|起|不超过|不高于|最高|最低|以上|以下/.test(
      nearby,
    )
  ) {
    return undefined;
  }
  const amount = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return match[2].startsWith("万")
    ? Math.round(amount * 10_000)
    : Math.round(amount);
}

function normalizedSeatCount(value: string | null): number | undefined {
  if (!value) return undefined;
  const counts = Array.from(value.matchAll(/(\d{1,2})\s*座/g)).map((match) =>
    Number(match[1]),
  );
  const singleDecoratedValue = value
    .trim()
    .match(/^(\d{1,2})\s*(?:座)?\s*[●○✓√★☆]*$/);
  if (!counts.length && singleDecoratedValue) {
    counts.push(Number(singleDecoratedValue[1]));
  }
  const unique = Array.from(new Set(counts.filter(Number.isFinite)));
  return unique.length === 1 ? unique[0] : undefined;
}

function cleanExactFactValue(value: string): string {
  return value.replace(/([\p{L}\p{N}])\s*[●✓√★]+/gu, "$1").trim();
}

function normalizedSingleNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const values = Array.from(
    value.matchAll(/-?\d+(?:\.\d+)?/g),
    (match) => Number(match[0]),
  ).filter(Number.isFinite);
  const unique = Array.from(new Set(values));
  return unique.length === 1 ? unique[0] : undefined;
}

function normalizedAvailability(
  value: string | null,
  expectedText?: string,
): boolean | undefined {
  if (!value) return undefined;
  const compact = value.replace(/\s+/g, "");
  if (expectedText && compact.includes(expectedText.replace(/\s+/g, ""))) {
    return true;
  }
  if (/^(?:-|—|无|否|不支持|未配备|false|○)$/i.test(compact)) return false;
  if (/●|✓|√|★|标配|支持|配备|有|true/i.test(compact)) return true;
  return undefined;
}

const RAW_DATAPRO_METADATA_KEYS = new Set([
  "车型编码",
  "品牌",
  "厂商",
  "车系",
  "车型名称",
  "年款",
]);

function genericDataProNormalizedValue(
  label: string,
  rawValue: string,
): string | number | boolean {
  const numeric = normalizedSingleNumber(rawValue);
  if (
    numeric !== undefined &&
    (/\([^)]{1,24}\)$/.test(label) ||
      /(?:数量|尺寸|功率|扭矩|质量|容积|距离|里程|时间|油耗|耗电|加速|速度|角度|高度|宽度|长度|轴距)$/.test(
        label,
      ))
  ) {
    return numeric;
  }
  const availability = normalizedAvailability(rawValue);
  return availability ?? cleanExactFactValue(rawValue);
}

function genericDataProUnit(label: string) {
  return label.match(/\(([^()]{1,24})\)$/)?.[1];
}

function rawDataProEntryLabel(entry: FlatEntry) {
  const parts = entry.path.split(".").filter(Boolean);
  const rootIndex = parts.findIndex((part) =>
    /^(?:车型完整配置JSON|配置参数)$/.test(part),
  );
  const relative = rootIndex >= 0 ? parts.slice(rootIndex + 1) : [entry.key];
  return relative.join(" · ") || entry.key;
}

function nestedFactSummary(
  entries: FlatEntry[],
  pathPattern: RegExp,
  limit = 12,
) {
  return entries
    .filter((entry) => pathPattern.test(entry.path))
    .flatMap((entry) => {
      const value = entryText(entry);
      return value
        ? [`${entry.key}：${cleanExactFactValue(value)}`]
        : [];
    })
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, limit)
    .join("；");
}

function fact(
  field: string,
  label: string,
  rawValue: string,
  normalizedValue: string | number | boolean | undefined,
  unit: string | undefined,
  capturedAt: string,
  evidenceId: string,
): VehicleFact {
  return {
    field,
    label,
    value: rawValue,
    normalizedValue,
    unit,
    source: "datapro",
    capturedAt,
    evidenceId,
  };
}

/**
 * Supports both observed vehicle payloads:
 * 1) flat items with 车型编码/车型名称/指导价/...;
 * 2) nested 车型信息 + 配置参数.
 *
 * Facts are returned only when exactly one item can be tied to the complete
 * requested trim. A year-level aggregate (for example, both five- and
 * six-seat M7 layouts) therefore remains pending.
 */
export function parseDataProVehiclePayload(
  payload: DataProPayload | null,
  candidateName: string,
  capturedAt: string,
  evidenceId: string,
  options: {
    selectedSeriesRefinement?: boolean;
    selectedExactModelId?: string | null;
  } = {},
): ParsedDataProVehicle {
  if (
    !payload ||
    (payload.code !== undefined && String(payload.code) !== "0") ||
    payload.dataset_type !== "vehicle_config" ||
    !Array.isArray(payload.items)
  ) {
    return {
      exactMatch: false,
      exactModelId: null,
      matchedModelName: null,
      facts: [],
      identityOptions: [],
    };
  }

  const items = expandVehicleItems(payload.items);
  const matches = items.filter((item) =>
    options.selectedExactModelId
      ? itemMatchesSelectedIdentity(item, options.selectedExactModelId)
      : itemMatchesExactRequest(
          item,
          candidateName,
          options.selectedSeriesRefinement,
        ),
  );
  if (matches.length !== 1) {
    return {
      exactMatch: false,
      exactModelId: null,
      matchedModelName: null,
      facts: [],
      identityOptions: options.selectedExactModelId
        ? []
        : identityOptionsFromItems(
            items,
            candidateName,
            matches,
            options.selectedSeriesRefinement,
          ),
    };
  }

  const matched = matches[0];
  const matchedModelName = returnedModelName(matched);
  const entries = flattenEntries(matched);
  const exactModelId =
    options.selectedExactModelId ?? exactModelIdForItem(matched);

  const guidePriceEntry = findEntry(entries, [
    (entry) =>
      /^(?:厂商|官方)?指导价(?:\(元\))?$/i.test(entry.key) ||
      /^(?:19|20)\d{2}款.+指导价$/.test(entry.key),
  ]);
  const seatEntry = findEntry(entries, [
    (entry) => /^(座位数|座椅数|乘员数)$/.test(entry.key),
    (entry) => /座位数|座位布局|车身结构/.test(entry.path),
  ]);
  const driveEntry = findEntry(entries, [
    (entry) => /^(驱动形式|驱动方式|驱动类型)$/.test(entry.key),
    (entry) => /驱动形式|驱动方式|驱动类型/.test(entry.path),
  ]);
  const rangeEntries = entries.filter((entry) => {
    if (/充电|补能|快充|慢充/.test(entry.path)) return false;
    const explicitPureRange =
      /CLTC/i.test(entry.path) &&
      /纯电/.test(entry.path) &&
      /续航/.test(entry.path);
    const cltcRangeExplanation =
      /CLTC/i.test(entry.path) &&
      /续航/.test(entry.path) &&
      /说明/.test(entry.path);
    return explicitPureRange || cltcRangeExplanation;
  });
  const extendedEntries = {
    fastCharge: findEntry(entries, [
      (entry) => /^电池快充时间(?:\(小时\))?$/.test(entry.key),
    ]),
    batteryCapacity: findEntry(entries, [
      (entry) => /^电池(?:能量|容量)(?:\(kWh\))?$/i.test(entry.key),
    ]),
    trunkVolume: findEntry(entries, [
      (entry) => /^后备[厢箱]容积(?:\(L\))?$/i.test(entry.key),
    ]),
    wheelbase: findEntry(entries, [
      (entry) => /^轴距(?:\(mm\))?$/i.test(entry.key),
    ]),
    vehicleLength: findEntry(entries, [
      (entry) => /^(?:车身)?长度(?:\(mm\))?$/i.test(entry.key),
    ]),
    vehicleWidth: findEntry(entries, [
      (entry) => /^(?:车身)?宽度(?:\(mm\))?$/i.test(entry.key),
    ]),
    vehicleHeight: findEntry(entries, [
      (entry) => /^(?:车身)?高度(?:\(mm\))?$/i.test(entry.key),
    ]),
    assistanceLevel: findEntry(entries, [
      (entry) =>
        /^(?:辅助|智能)驾驶等级$/i.test(entry.key) ||
        /^驾驶辅助(?:等级|级别)$/i.test(entry.key),
    ]),
    activeBraking: findEntry(entries, [
      (entry) => /^主动刹车(?:\/主动安全系统)?$/i.test(entry.key),
      (entry) => /主动刹车|AEB/i.test(entry.key),
    ]),
    laneCentering: findEntry(entries, [
      (entry) => /^车道居中(?:保持)?$/i.test(entry.key),
    ]),
    surroundView: findEntry(entries, [
      (entry) => /360度全景影像|全景影像/i.test(entry.key),
      (entry) =>
        /驾驶辅助影像/.test(entry.key) &&
        /360度全景影像|360影像/.test(entryText(entry) ?? ""),
    ]),
    motorPower: findEntry(entries, [
      (entry) => /^电动机总功率(?:\(kW\))?$/i.test(entry.key),
      (entry) => /^系统综合功率(?:\(kW\))?$/i.test(entry.key),
    ]),
    acceleration: findEntry(entries, [
      (entry) => /^官方0-100km\/h加速(?:\(s\))?$/i.test(entry.key),
    ]),
    lowSocFuel: findEntry(entries, [
      (entry) =>
        /^最低荷电状态油耗(?:\(L\/100km\))?(?:WLTC)?$/i.test(entry.key),
    ]),
    wltcFuel: findEntry(entries, [
      (entry) => /^WLTC综合油耗(?:\(L\/100km\))?$/i.test(entry.key),
    ]),
    electricityConsumption: findEntry(entries, [
      (entry) => /^百公里耗电量(?:\(kWh\/100km\))?$/i.test(entry.key),
    ]),
    cltcTotalRange: findEntry(entries, [
      (entry) => /^CLTC综合续航(?:\(km\))?$/i.test(entry.key),
    ]),
    wltcPureRange: findEntry(entries, [
      (entry) => /^WLTC纯电续航里程(?:\(km\))?$/i.test(entry.key),
    ]),
    wltcTotalRange: findEntry(entries, [
      (entry) => /^WLTC综合续航(?:\(km\))?$/i.test(entry.key),
    ]),
    energyType: findEntry(entries, [
      (entry) => /^(?:燃料|能源)类型$/i.test(entry.key),
    ]),
    bodyStyle: findEntry(entries, [
      (entry) => /^(?:车身结构|车型级别|车辆类型)$/i.test(entry.key),
    ]),
    assistanceSystem: findEntry(entries, [
      (entry) => /^(?:辅助|智能)驾驶系统$/i.test(entry.key),
      (entry) =>
        /辅助驾驶系统/.test(entry.path) &&
        /^(?:系统名称|辅助驾驶系统名称)$/i.test(entry.key),
    ]),
    parkingSensors: findEntry(entries, [
      (entry) => /^(?:前\/后)?驻车雷达$|倒车雷达/i.test(entry.key),
    ]),
    panoramicSunroof: findEntry(entries, [
      (entry) => /^天窗类型$/i.test(entry.key),
      (entry) => /全景天窗/i.test(entry.key),
    ]),
    automaticParking: findEntry(entries, [
      (entry) => /^(?:自动|辅助)泊车(?:入位)?$/i.test(entry.key),
    ]),
    rearSeatFeatures: findEntry(entries, [
      (entry) => /^(?:第二排|后排)座椅功能$/i.test(entry.key),
    ]),
    exteriorColor: findEntry(entries, [
      (entry) => /^(?:外观|车身)颜色$/i.test(entry.key),
    ]),
  };
  const airbagEntries = entries.filter((entry) =>
    /气囊|气帘/.test(entry.key),
  );

  const facts: VehicleFact[] = [];
  const guidePrice = entryText(guidePriceEntry);
  if (guidePrice) {
    const normalized = normalizedGuidePrice(guidePrice);
    facts.push(
      fact(
        "guide_price_cny",
        "厂商指导价",
        normalized !== undefined
          ? `${(normalized / 10_000).toFixed(2)} 万元`
          : guidePrice,
        normalized,
        "CNY",
        capturedAt,
        evidenceId,
      ),
    );
  }
  const rawSeats = entryText(seatEntry);
  if (rawSeats) {
    const seats = cleanExactFactValue(rawSeats);
    facts.push(
      fact(
        "seat_count",
        "座位数",
        seats,
        normalizedSeatCount(seats),
        "座",
        capturedAt,
        evidenceId,
      ),
    );
  }
  const rawDrive = entryText(driveEntry);
  if (rawDrive) {
    const drive = cleanExactFactValue(rawDrive);
    facts.push(
      fact(
        "drive_type",
        "驱动形式",
        drive,
        drive,
        undefined,
        capturedAt,
        evidenceId,
      ),
    );
  }
  const ranges = Array.from(
    new Set(
      rangeEntries
        .map((entry) => entryText(entry))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  if (ranges.length) {
    const rangeValues = rangeEntries.flatMap(entryRangeNumbers);
    facts.push(
      fact(
        "cltc_pure_range_km",
        "CLTC 纯电续航",
        ranges.join(" / "),
        rangeValues.length
          ? Math.min(...rangeValues)
          : undefined,
        "km",
        capturedAt,
        evidenceId,
      ),
    );
  }
  const pushNumericFact = (
    entry: FlatEntry | undefined,
    field: string,
    label: string,
    unit: string,
  ) => {
    const rawValue = entryText(entry);
    if (!rawValue) return;
    facts.push(
      fact(
        field,
        label,
        cleanExactFactValue(rawValue),
        normalizedSingleNumber(rawValue),
        unit,
        capturedAt,
        evidenceId,
      ),
    );
  };
  pushNumericFact(
    extendedEntries.fastCharge,
    "fast_charge_time_hours",
    "电池快充时间",
    "小时",
  );
  pushNumericFact(
    extendedEntries.batteryCapacity,
    "battery_capacity_kwh",
    "电池能量",
    "kWh",
  );
  pushNumericFact(
    extendedEntries.trunkVolume,
    "trunk_volume_l",
    "后备厢容积",
    "L",
  );
  pushNumericFact(
    extendedEntries.wheelbase,
    "wheelbase_mm",
    "轴距",
    "mm",
  );
  pushNumericFact(
    extendedEntries.vehicleLength,
    "vehicle_length_mm",
    "车身长度",
    "mm",
  );
  pushNumericFact(
    extendedEntries.vehicleWidth,
    "vehicle_width_mm",
    "车身宽度",
    "mm",
  );
  pushNumericFact(
    extendedEntries.vehicleHeight,
    "vehicle_height_mm",
    "车身高度",
    "mm",
  );
  pushNumericFact(
    extendedEntries.motorPower,
    "total_motor_power_kw",
    "电动机总功率",
    "kW",
  );
  pushNumericFact(
    extendedEntries.acceleration,
    "acceleration_0_100_s",
    "官方 0-100km/h 加速",
    "s",
  );
  pushNumericFact(
    extendedEntries.lowSocFuel,
    "low_soc_fuel_consumption_l100km",
    "最低荷电状态油耗",
    "L/100km",
  );
  pushNumericFact(
    extendedEntries.wltcFuel,
    "wltc_fuel_consumption_l100km",
    "WLTC 综合油耗",
    "L/100km",
  );
  pushNumericFact(
    extendedEntries.electricityConsumption,
    "electricity_consumption_kwh100km",
    "百公里耗电量",
    "kWh/100km",
  );
  pushNumericFact(
    extendedEntries.cltcTotalRange,
    "cltc_total_range_km",
    "CLTC 综合续航",
    "km",
  );
  pushNumericFact(
    extendedEntries.wltcPureRange,
    "wltc_pure_range_km",
    "WLTC 纯电续航",
    "km",
  );
  pushNumericFact(
    extendedEntries.wltcTotalRange,
    "wltc_total_range_km",
    "WLTC 综合续航",
    "km",
  );

  const assistanceLevel = entryText(extendedEntries.assistanceLevel);
  if (assistanceLevel) {
    facts.push(
      fact(
        "driver_assistance_level",
        "辅助驾驶等级",
        cleanExactFactValue(assistanceLevel),
        normalizedSingleNumber(assistanceLevel),
        "级",
        capturedAt,
        evidenceId,
      ),
    );
  }
  const pushAvailabilityFact = (
    entry: FlatEntry | undefined,
    field: string,
    label: string,
    expectedText?: string,
  ) => {
    const rawValue = entryText(entry);
    if (!rawValue) return;
    const available = normalizedAvailability(rawValue, expectedText);
    facts.push(
      fact(
        field,
        label,
        available === true
          ? "配备"
          : available === false
            ? "未配备"
            : cleanExactFactValue(rawValue),
        available,
        undefined,
        capturedAt,
        evidenceId,
      ),
    );
  };
  pushAvailabilityFact(
    extendedEntries.activeBraking,
    "active_braking",
    "主动刹车",
  );
  pushAvailabilityFact(
    extendedEntries.laneCentering,
    "lane_centering",
    "车道居中保持",
  );
  pushAvailabilityFact(
    extendedEntries.surroundView,
    "surround_view_360",
    "360度全景影像",
    "360",
  );
  pushAvailabilityFact(
    extendedEntries.parkingSensors,
    "parking_sensors",
    "驻车雷达",
  );
  pushAvailabilityFact(
    extendedEntries.panoramicSunroof,
    "panoramic_sunroof",
    "全景天窗",
    "全景天窗",
  );
  pushAvailabilityFact(
    extendedEntries.automaticParking,
    "automatic_parking",
    "自动泊车",
  );
  const airbagValues = airbagEntries.flatMap((entry) => {
    const rawValue = entryText(entry);
    return rawValue &&
      normalizedAvailability(rawValue) !== false
      ? [`${entry.key}：${cleanExactFactValue(rawValue)}`]
      : [];
  });
  if (airbagValues.length) {
    facts.push(
      fact(
        "airbag_configuration",
        "安全气囊配置",
        airbagValues.join("；"),
        true,
        undefined,
        capturedAt,
        evidenceId,
      ),
    );
  }
  const assistanceSystem = entryText(extendedEntries.assistanceSystem);
  if (assistanceSystem) {
    const cleaned = cleanExactFactValue(assistanceSystem);
    facts.push(
      fact(
        "driver_assistance_system",
        "辅助驾驶系统",
        cleaned,
        cleaned,
        undefined,
        capturedAt,
        evidenceId,
      ),
    );
  }
  const rearSeatFeatures =
    entryText(extendedEntries.rearSeatFeatures) ||
    nestedFactSummary(entries, /(?:第二排|后排)座椅功能/);
  if (rearSeatFeatures) {
    const cleaned = cleanExactFactValue(rearSeatFeatures);
    facts.push(
      fact(
        "rear_seat_features",
        "第二排座椅功能",
        cleaned,
        cleaned,
        undefined,
        capturedAt,
        evidenceId,
      ),
    );
  }
  const exteriorColor = entryText(extendedEntries.exteriorColor);
  if (exteriorColor) {
    const cleaned = cleanExactFactValue(exteriorColor);
    facts.push(
      fact(
        "exterior_color",
        "外观颜色",
        cleaned,
        cleaned,
        undefined,
        capturedAt,
        evidenceId,
      ),
    );
  }
  const energyType = entryText(extendedEntries.energyType);
  if (energyType) {
    const cleaned = cleanExactFactValue(energyType);
    facts.push(
      fact(
        "energy_type",
        "能源类型",
        cleaned,
        cleaned,
        undefined,
        capturedAt,
        evidenceId,
      ),
    );
  }
  const bodyStyle = entryText(extendedEntries.bodyStyle);
  if (bodyStyle) {
    const cleaned = cleanExactFactValue(bodyStyle);
    facts.push(
      fact(
        "body_style",
        "车身结构",
        cleaned,
        cleaned,
        undefined,
        capturedAt,
        evidenceId,
      ),
    );
  }

  // The configuration dataset can return hundreds of exact-trim fields. Keep
  // every scalar field from either a complete-configuration response or a
  // focused 配置参数 response so a user need is not silently lost just because
  // it is outside the first-party comparison registry. These raw fields are
  // displayable and traceable, but they never become an automatic conclusion
  // unless the condition can be tied to the exact field and compared
  // conservatively below.
  const seenRawLabels = new Set<string>();
  for (const entry of entries) {
    const rawLabel = rawDataProEntryLabel(entry);
    const mappedField =
      /辅助驾驶系统/.test(entry.path) &&
      /^(?:系统名称|辅助驾驶系统名称)$/.test(entry.key)
        ? "driver_assistance_system"
        : canonicalRuleField(undefined, entry.key);
    const alreadyStructured =
      mappedField &&
      facts.some((item) => item.field === mappedField);
    if (
      !/(?:车型完整配置JSON|配置参数)/.test(entry.path) ||
      !entry.key ||
      RAW_DATAPRO_METADATA_KEYS.has(entry.key) ||
      /^车系最近第\d+个月(?:年月|销量)$/.test(entry.key) ||
      alreadyStructured ||
      seenRawLabels.has(rawLabel)
    ) {
      continue;
    }
    const rawValue = entryText(entry);
    if (!rawValue) continue;
    seenRawLabels.add(rawLabel);
    const cleaned = cleanExactFactValue(rawValue);
    facts.push(
      fact(
        rawDataProFactField(rawLabel),
        rawLabel,
        cleaned,
        genericDataProNormalizedValue(rawLabel, rawValue),
        genericDataProUnit(rawLabel),
        capturedAt,
        evidenceId,
      ),
    );
  }

  return {
    exactMatch: Boolean(exactModelId),
    exactModelId,
    matchedModelName,
    facts,
    identityOptions: [],
  };
}

type DriveIntent = "front" | "rear" | "four_wheel" | "dual_motor";

function driveIntents(value: string): Set<DriveIntent> {
  const normalized = value.replace(/\s+/g, "").toLocaleLowerCase();
  const intents = new Set<DriveIntent>();
  if (/前驱|前轮驱动|fwd/i.test(normalized)) intents.add("front");
  if (/后驱|后轮驱动|rwd/i.test(normalized)) intents.add("rear");
  if (/四驱|全轮驱动|4wd|awd/i.test(normalized)) {
    intents.add("four_wheel");
  }
  if (/双电机|双马达|dualmotor/i.test(normalized)) {
    intents.add("dual_motor");
  }
  return intents;
}

function comparisonResult(
  rule: DecisionRule,
  actual: string | number | boolean,
): boolean | null {
  if (rule.operator === "unknown" || rule.value === null) return null;
  if (Array.isArray(rule.value)) {
    if (
      rule.operator === "between" &&
      typeof actual === "number" &&
      rule.value.length === 2
    ) {
      const [minimum, maximum] = rule.value.map(Number);
      return Number.isFinite(minimum) && Number.isFinite(maximum)
        ? actual >= minimum && actual <= maximum
        : null;
    }
    const actualText = String(actual).replace(/\s+/g, "").toLocaleLowerCase();
    const included = rule.value.some((value) => {
      if (typeof actual === "number" && typeof value === "number") {
        return actual === value;
      }
      const expected = String(value)
        .replace(/\s+/g, "")
        .toLocaleLowerCase();
      return actualText === expected || actualText.includes(expected);
    });
    if (rule.operator === "in") return included;
    if (rule.operator === "not_in") return !included;
    return null;
  }
  if (typeof actual === "boolean") {
    if (rule.operator === "exists") return actual;
    if (rule.operator === "not_exists") return !actual;
    if (rule.operator === "eq" || rule.operator === "includes") {
      const expected =
        typeof rule.value === "boolean"
          ? rule.value
          : /^(?:true|1|有|配备|支持)$/i.test(String(rule.value).trim());
      return actual === expected;
    }
    if (rule.operator === "ne") {
      return actual !== Boolean(rule.value);
    }
    return null;
  }
  if (
    typeof actual === "number" &&
    (typeof rule.value === "number" ||
      (typeof rule.value === "string" && rule.value.trim()))
  ) {
    const expected = Number(rule.value);
    if (!Number.isFinite(expected)) return null;
    if (rule.operator === "gte") return actual >= expected;
    if (rule.operator === "lte") return actual <= expected;
    if (rule.operator === "eq") return actual === expected;
    if (rule.operator === "ne") return actual !== expected;
    return null;
  }
  const actualText = String(actual).replace(/\s+/g, "").toLocaleLowerCase();
  if (canonicalRuleField(rule.field) === "drive_type") {
    const expectedText =
      rule.value === true ? "四驱" : String(rule.value).trim();
    const expectedIntents = driveIntents(expectedText);
    const actualIntents = driveIntents(actualText);
    if (rule.operator === "eq" || rule.operator === "includes") {
      if (expectedIntents.size) {
        return Array.from(expectedIntents).every((intent) =>
          actualIntents.has(intent),
        );
      }
      const normalizedExpected = expectedText
        .replace(/\s+/g, "")
        .toLocaleLowerCase();
      return normalizedExpected
        ? actualText.includes(normalizedExpected)
        : null;
    }
    return null;
  }
  const expectedText = String(rule.value)
    .replace(/\s+/g, "")
    .toLocaleLowerCase();
  if (rule.operator === "eq") return actualText === expectedText;
  if (rule.operator === "ne") return actualText !== expectedText;
  if (rule.operator === "includes") return actualText.includes(expectedText);
  if (rule.operator === "exists") return actualText.length > 0;
  if (rule.operator === "not_exists") return actualText.length === 0;
  return null;
}

function guidePriceFact(candidate: VehicleCandidate) {
  return candidate.facts?.find((item) => item.field === "guide_price_cny");
}

function compactFeatureText(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(
      /(?:非常|比较|尤其|更|最|重视|关注|希望|想要|需要|必须|一定|务必|最好有|最好|要有|配备|支持|能力|表现|功能|配置|车型|汽车)/g,
      "",
    )
    .replace(/[^\p{Script=Han}a-z0-9]+/gu, "");
}

function dataProFactsForCondition(
  condition: DecisionCondition,
  candidate: VehicleCandidate,
) {
  const facts = (candidate.facts ?? []).filter(
    (item) => item.source === "datapro",
  );
  const requestedFields = new Set(
    [
      canonicalRuleField(condition.rule?.field, condition.title),
      ...(condition.dataFieldHints ?? []).map((field) =>
        canonicalRuleField(field),
      ),
    ].filter(Boolean),
  );
  const registeredFacts = facts.filter((item) =>
    requestedFields.has(item.field),
  );
  if (registeredFacts.length) return registeredFacts;

  const conditionTexts = [condition.sourceText, condition.title]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(compactFeatureText)
    .filter((value) => value.length >= 2);
  if (!conditionTexts.length) return [];

  return facts
    .filter(isRawDataProFact)
    .filter((item) => {
      const label = compactFeatureText(item.label);
      return (
        label.length >= 2 &&
        conditionTexts.some(
          (text) => text.includes(label) || label.includes(text),
        )
      );
    })
    .slice(0, 4);
}

function dataProFieldIdsForCondition(condition: DecisionCondition) {
  return Array.from(
    new Set(
      [
        condition.rule?.field || !(condition.dataFieldHints?.length)
          ? canonicalRuleField(condition.rule?.field, condition.title)
          : "",
        ...(condition.dataFieldHints ?? []).map((field) =>
          canonicalRuleField(field),
        ),
      ].filter(Boolean),
    ),
  );
}

function hasUnboundDataForCondition(
  condition: DecisionCondition,
  candidate: VehicleCandidate,
) {
  const unbound = new Set(candidate.unboundDataFields ?? []);
  return dataProFieldIdsForCondition(condition).some((field) =>
    unbound.has(field),
  );
}

function evaluationFactFields(facts: VehicleFact[]) {
  const fields = Array.from(new Set(facts.map((item) => item.field)));
  return fields.length ? fields : undefined;
}

function formatCny(amount: number) {
  return `${(amount / 10_000).toFixed(2)} 万元`;
}

export function evaluateCandidateCondition(
  condition: DecisionCondition,
  candidate: VehicleCandidate,
): ConditionEvaluation {
  const base = {
    conditionId: condition.id,
    candidateId: candidate.id,
  };
  if (condition.verificationMode === "context") {
    return {
      ...base,
      status: DecisionStatus.CONFIRMED,
      summary: "已作为用车场景记录，不直接作为单款车型的满足结论",
    };
  }
  if (condition.verificationMode === "sales_data") {
    return {
      ...base,
      status: DecisionStatus.PENDING,
      pendingReason: PendingReason.CONFIGURATION_UNVERIFIED,
      summary: "销量按车系、地区和月份展示为市场背景，需先明确“热销”的统计口径",
    };
  }
  const conditionDataFacts = dataProFactsForCondition(condition, candidate);
  const hasUnboundProfessionalData = hasUnboundDataForCondition(
    condition,
    candidate,
  );
  if (condition.verificationMode === "web_research") {
    return {
      ...base,
      status: DecisionStatus.PENDING,
      pendingReason: PendingReason.CONFIGURATION_UNVERIFIED,
      summary: conditionDataFacts.length
        ? `专业数据已返回${conditionDataFacts
            .map((item) => `${item.label} ${item.value}`)
            .join("、")}；仍需补充可追溯的公开来源并核对评价口径`
        : hasUnboundProfessionalData
          ? "车型身份已锁定，但相关专业数据字段未按当前车型标识返回；仍需补充可追溯公开来源"
          : "需要补充可追溯的公开来源，并核对车型、时间和评价口径",
      evidenceRefs: conditionDataFacts
        .map((item) => item.evidenceId)
        .filter((id): id is string => Boolean(id)),
      factFields: evaluationFactFields(conditionDataFacts),
    };
  }
  if (condition.category === ConditionCategory.BUDGET) {
    const totalAmountCny = candidate.quote?.totalAmountCny;
    if (
      typeof totalAmountCny === "number" &&
      Number.isFinite(totalAmountCny) &&
      totalAmountCny > 0 &&
      condition.rule &&
      canonicalRuleField(condition.rule.field) === "landing_price_cny"
    ) {
      const matches = comparisonResult(condition.rule, totalAmountCny);
      if (matches !== null) {
        return {
          ...base,
          status: matches
            ? DecisionStatus.CONFIRMED
            : DecisionStatus.CONFLICT,
          summary: matches
            ? `完整落地报价为 ${formatCny(totalAmountCny)}，满足“${condition.title}”`
            : `完整落地报价为 ${formatCny(totalAmountCny)}，不满足“${condition.title}”`,
        };
      }
    }
    const price = guidePriceFact(candidate);
    return {
      ...base,
      status: DecisionStatus.PENDING,
      pendingReason: PendingReason.QUOTE_REQUIRED,
      summary: price
        ? `厂商指导价为 ${price.value}，但指导价不是落地价；仍需录入包含全部费用的正式报价`
        : hasUnboundProfessionalData
          ? "车型身份已锁定，但指导价字段未按当前车型标识返回；仍需录入完整落地报价"
        : "尚未录入包含全部费用项的落地报价",
      evidenceRefs: price?.evidenceId ? [price.evidenceId] : undefined,
      factFields: price ? [price.field] : undefined,
    };
  }
  if (condition.category === ConditionCategory.SALES_WRITTEN) {
    return {
      ...base,
      status: DecisionStatus.PENDING,
      pendingReason: PendingReason.SALES_WRITTEN_CONFIRMATION_REQUIRED,
      summary: "尚未记录正式报价或订单中的书面确认",
    };
  }
  if (condition.category === ConditionCategory.PERSONAL_EXPERIENCE) {
    return {
      ...base,
      status: DecisionStatus.PENDING,
      pendingReason: PendingReason.PERSONAL_EXPERIENCE_REQUIRED,
      summary: conditionDataFacts.length
        ? `专业数据已返回${conditionDataFacts
            .map((fact) => `${fact.label} ${fact.value}`)
            .join("、")}；舒适或空间感受仍需本人按真实场景确认`
        : hasUnboundProfessionalData
          ? "车型身份已锁定，但相关配置字段未按当前车型标识返回；舒适感受仍需本人体验"
        : "需要本人按真实场景确认",
      evidenceRefs: conditionDataFacts
        .map((fact) => fact.evidenceId)
        .filter((id): id is string => Boolean(id)),
      factFields: evaluationFactFields(conditionDataFacts),
    };
  }

  const field = canonicalRuleField(condition.rule?.field, condition.title);
  if (!condition.rule || !SUPPORTED_AUTOMATIC_FIELDS.has(field)) {
    const comparableFact = conditionDataFacts.find(
      (item) => item.normalizedValue !== undefined,
    );
    const genericComparison =
      condition.rule && comparableFact?.normalizedValue !== undefined
        ? comparisonResult(condition.rule, comparableFact.normalizedValue)
        : null;
    if (genericComparison !== null && comparableFact) {
      return {
        ...base,
        status: genericComparison
          ? DecisionStatus.CONFIRMED
          : DecisionStatus.CONFLICT,
        summary: genericComparison
          ? `${comparableFact.label}为 ${comparableFact.value}，满足“${condition.title}”`
          : `${comparableFact.label}为 ${comparableFact.value}，不满足“${condition.title}”`,
        evidenceRefs: comparableFact.evidenceId
          ? [comparableFact.evidenceId]
          : undefined,
        factFields: [comparableFact.field],
      };
    }
    return {
      ...base,
      status: DecisionStatus.PENDING,
      pendingReason: conditionDataFacts.length
        ? PendingReason.PERSONAL_EXPERIENCE_REQUIRED
        : PendingReason.CONFIGURATION_UNVERIFIED,
      summary: conditionDataFacts.length
        ? `专业数据已返回${conditionDataFacts
            .map((fact) => `${fact.label} ${fact.value}`)
            .join("、")}；仍需按你的标准判断是否符合`
        : hasUnboundProfessionalData
          ? "车型身份已锁定，但相关配置字段未按当前车型标识返回，因此暂不写入结论"
          : "该条件尚无可自动核验的精确车型字段",
      evidenceRefs: conditionDataFacts
        .map((fact) => fact.evidenceId)
        .filter((id): id is string => Boolean(id)),
      factFields: evaluationFactFields(conditionDataFacts),
    };
  }
  const matchedFact = candidate.facts?.find((item) => item.field === field);
  if (matchedFact?.normalizedValue === undefined) {
    return {
      ...base,
      status: DecisionStatus.PENDING,
      pendingReason: hasUnboundProfessionalData
        ? PendingReason.CONFIGURATION_UNVERIFIED
        : PendingReason.MISSING_VEHICLE_DATA,
      summary: hasUnboundProfessionalData
        ? "车型身份已锁定，但相关字段未按当前车型标识返回，因此暂不写入结论"
        : "专业数据未返回可绑定到该精确配置的明确字段",
      evidenceRefs: matchedFact?.evidenceId
        ? [matchedFact.evidenceId]
        : undefined,
    };
  }
  if (
    field === "cltc_pure_range_km" &&
    /\/|–|~|至/.test(matchedFact.value) &&
    condition.rule.operator !== "gte"
  ) {
    return {
      ...base,
      status: DecisionStatus.PENDING,
      pendingReason: PendingReason.CONFIGURATION_UNVERIFIED,
      summary:
        "该精确配置返回多个有条件续航值；当前规则不能用单一数字保守判断",
      evidenceRefs: matchedFact.evidenceId
        ? [matchedFact.evidenceId]
        : undefined,
      factFields: [matchedFact.field],
    };
  }
  const matches = comparisonResult(condition.rule, matchedFact.normalizedValue);
  if (matches === null) {
    return {
      ...base,
      status: DecisionStatus.PENDING,
      pendingReason: PendingReason.CONFIGURATION_UNVERIFIED,
      summary: "返回字段存在，但当前规则无法做保守的自动判断",
      evidenceRefs: matchedFact.evidenceId
        ? [matchedFact.evidenceId]
        : undefined,
      factFields: [matchedFact.field],
    };
  }
  return {
    ...base,
    status: matches ? DecisionStatus.CONFIRMED : DecisionStatus.CONFLICT,
    summary: matches
      ? `${matchedFact.label}为 ${matchedFact.value}，满足“${condition.title}”`
      : `${matchedFact.label}为 ${matchedFact.value}，不满足“${condition.title}”`,
    evidenceRefs: matchedFact.evidenceId
      ? [matchedFact.evidenceId]
      : undefined,
    factFields: [matchedFact.field],
  };
}

function dataProEvidenceSummary(
  parsed: ParsedDataProVehicle,
  action: "返回" | "刷新",
  unboundFieldCount = 0,
) {
  const rawFieldCount = parsed.facts.filter(isRawDataProFact).length;
  const comparableFieldCount = parsed.facts.filter(
    (item) => !isRawDataProFact(item),
  ).length;
  const returnedFieldCount = rawFieldCount || comparableFieldCount;
  if (!returnedFieldCount) {
    if (unboundFieldCount) {
      return `专业数据已返回 ${unboundFieldCount} 个相关维度，但未按当前已选车型的专业数据标识返回，因此未写入结论。`;
    }
    return "已匹配精确配置，但本次未返回可提取的配置字段，相关条件保持待确认。";
  }
  const unboundSummary = unboundFieldCount
    ? `另有 ${unboundFieldCount} 个相关维度未按当前已选车型的专业数据标识返回，因此未写入结论。`
    : "";
  return `已匹配精确配置，专业数据${action} ${returnedFieldCount} 个配置字段，其中 ${comparableFieldCount} 个字段已转为可直接比较或辅助判断的结构化事实。${unboundSummary}`;
}

function projectToStorage(
  project: DecisionProject,
  evidence: EvidenceInput[] = [],
): CreateDecisionProjectInput {
  const summary = summarizeDecision(project);
  const hasDisplayData =
    project.candidates.some(
      (candidate) => (candidate.facts?.length ?? 0) > 0,
    ) || (project.citySales?.length ?? 0) > 0;
  const cityVehicleSeries = (project.citySales ?? []).map((series) => ({
    id: series.id,
    candidateTrimId: series.candidateId,
    city: series.city,
    seriesName: series.series,
    periodLabel: series.periodLabel,
    metricKey: series.metricKey ?? series.statisticLabel,
    metricLabel: series.statisticLabel,
    metricDefinition: series.metricDefinition ?? null,
    unit: series.unit ?? null,
    dataLevel: series.dataLevel ?? null,
    datasetType: series.datasetType ?? "vehicle_sales",
    requestId: series.requestId ?? null,
    traceId: series.traceId ?? null,
    status: "current",
    evidenceId: series.evidenceId ?? null,
    capturedAt: Date.parse(series.capturedAt) || Date.now(),
    extra: {},
  }));
  const cityVehicleSeriesPoints = (project.citySales ?? []).flatMap((series) =>
    series.points.map((point) => {
      const storedMonth = point.monthKey ?? point.month;
      return {
        id: `${series.id}:${storedMonth}`,
        seriesId: series.id,
        month: storedMonth,
        monthLabel: point.month,
        value: point.value,
        extra: (point.extras ?? {}) as unknown as JsonValue,
      };
    }),
  );
  return {
    id: project.id,
    title: project.title,
    status: project.issues?.length
      ? hasDisplayData
        ? "partial"
        : "unavailable"
      : summary.status,
    city: project.context.city,
    primaryCandidateId:
      project.candidates.find((candidate) => candidate.role === "target")?.id ??
      null,
    summary: {
      paymentMethod: project.context.paymentMethod,
      purchaseTime: project.context.purchaseTime ?? null,
      maxBudgetWan: project.context.maxBudgetWan ?? null,
      need: project.context.need ?? null,
      raw_need_text: project.context.need ?? null,
      requirement_atoms: project.context.need
        ? (extractRequirementAtoms(project.context.need) as unknown as JsonValue)
        : [],
      isDemo: project.isDemo ?? false,
      issues: (project.issues ?? []) as unknown as JsonValue,
    },
    candidateTrims: project.candidates.map((candidate, position) => ({
      id: candidate.id,
      position,
      role: candidate.role,
      entityId: candidate.vehicle.exactModelId,
      brand: candidate.vehicle.manufacturer,
      series: candidate.vehicle.series,
      modelYear: candidate.vehicle.modelYear,
      trimName: candidate.vehicle.trim,
      displayName: [
        candidate.vehicle.manufacturer,
        candidate.vehicle.series,
        candidate.vehicle.modelYear,
        candidate.vehicle.trim,
      ]
        .filter(Boolean)
        .join(" "),
      status:
        summary.candidates.find((item) => item.candidateId === candidate.id)
          ?.status ?? DecisionStatus.PENDING,
      data: {
        exactModelId: candidate.vehicle.exactModelId,
        quoteVersion: candidate.quote?.version ?? null,
        totalAmountCny: candidate.quote?.totalAmountCny ?? null,
        quoteCapturedAt: candidate.quote?.capturedAt ?? null,
        facts: (candidate.facts ?? []) as unknown as JsonValue,
        unboundDataFields: (candidate.unboundDataFields ??
          []) as unknown as JsonValue,
        identityOptions: (candidate.identityOptions ??
          []) as unknown as JsonValue,
      },
    })),
    conditions: project.conditions.map((condition, sortOrder) => ({
      id: condition.id,
      sortOrder,
      scope: "personal",
      kind: condition.kind,
      title: condition.title,
      description: condition.detail ?? "",
      priority: condition.category,
      status: "active",
      details: {
        category: condition.category,
        order: condition.order ?? sortOrder,
        sourceText: condition.sourceText ?? null,
        sourceStart: condition.sourceStart ?? null,
        sourceEnd: condition.sourceEnd ?? null,
        concept: condition.concept ?? null,
        scope: condition.scope ?? "comparison",
        verificationMode: condition.verificationMode ?? null,
        dataFieldHints: condition.dataFieldHints ?? [],
        rule: condition.rule
          ? (condition.rule as unknown as JsonValue)
          : null,
      },
    })),
    evaluations: project.evaluations.map((evaluation) => ({
      id: safeId("evaluation"),
      conditionId: evaluation.conditionId,
      candidateTrimId: evaluation.candidateId,
      status: evaluation.status,
      conclusion: evaluation.summary,
      rationale: {
        pendingReason: evaluation.pendingReason ?? null,
        evidenceRefs: evaluation.evidenceRefs ?? [],
        factFields: evaluation.factFields ?? [],
        userConfirmation: evaluation.userConfirmation
          ? (evaluation.userConfirmation as unknown as JsonValue)
          : null,
      },
      evaluatedAt: Date.parse(project.updatedAt) || Date.now(),
    })),
    evidence,
    cityVehicleSeries,
    cityVehicleSeriesPoints,
  };
}

function readString(
  value: JsonValue,
  key: string,
  fallback: string,
): string {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value[key] === "string"
  ) {
    return value[key] as string;
  }
  return fallback;
}

function readNumber(value: JsonValue, key: string): number | undefined {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value[key] === "number"
  ) {
    return value[key] as number;
  }
  return undefined;
}

function readStringArray(value: JsonValue, key: string): string[] | undefined {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Array.isArray(value[key]) &&
    value[key].every((item) => typeof item === "string")
  ) {
    return value[key] as string[];
  }
  return undefined;
}

function readObject(value: JsonValue, key: string): Record<string, unknown> | null {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value[key] === "object" &&
    value[key] !== null &&
    !Array.isArray(value[key])
  ) {
    return value[key] as Record<string, unknown>;
  }
  return null;
}

function jsonRecord(value: JsonValue): Record<string, unknown> | undefined {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readProjectIssues(value: JsonValue): ProjectDataIssue[] | undefined {
  if (!isPlainRecord(value) || !Array.isArray(value.issues)) return undefined;
  const issues = value.issues.flatMap((item): ProjectDataIssue[] => {
    if (
      !isPlainRecord(item) ||
      ![
        "EXACT_CONFIG_NO_DATA",
        "CITY_SALES_NO_DATA",
        "PROVIDER_TIMEOUT",
        "REQUIREMENT_PARSE_FAILED",
        "PROJECT_SAVE_FAILED",
      ].includes(String(item.code)) ||
      ![
        "requirement_parsing",
        "vehicle_configuration",
        "city_sales",
        "project_finalize",
      ].includes(String(item.stage)) ||
      typeof item.message !== "string" ||
      typeof item.retryable !== "boolean"
    ) {
      return [];
    }
    return [{
      code: item.code as ProjectDataIssue["code"],
      stage: item.stage as ProjectDataIssue["stage"],
      candidateId:
        typeof item.candidateId === "string" ? item.candidateId : undefined,
      candidateName:
        typeof item.candidateName === "string" ? item.candidateName : undefined,
      message: item.message,
      retryable: item.retryable,
    }];
  });
  return issues.length ? issues : undefined;
}

function confirmationDependencies(value: unknown) {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(Object.values(ConfirmationDependency));
  return Array.from(
    new Set(
      value.filter(
        (item): item is (typeof ConfirmationDependency)[keyof typeof ConfirmationDependency] =>
          typeof item === "string" &&
          allowed.has(
            item as (typeof ConfirmationDependency)[keyof typeof ConfirmationDependency],
          ),
      ),
    ),
  );
}

export function restoreUserConfirmation(
  confirmation: Record<string, unknown> | null,
  fallbackConfirmedAt: string,
): UserConfirmation | undefined {
  if (!confirmation) return undefined;
  const storedBasis = isPlainRecord(confirmation.basis)
    ? confirmation.basis
    : {};
  const basis: ConfirmationBasis = {};
  for (const dependency of Object.values(ConfirmationDependency)) {
    const value = storedBasis[dependency];
    if (typeof value === "string") {
      basis[dependency] = value;
    }
  }
  const dependsOn = confirmationDependencies(confirmation.dependsOn).filter(
    (dependency) => basis[dependency] !== undefined,
  );
  const invalidatedBy = confirmationDependencies(confirmation.invalidatedBy);
  return {
    confirmedAt:
      typeof confirmation.confirmedAt === "string" &&
      confirmation.confirmedAt.trim()
        ? confirmation.confirmedAt
        : fallbackConfirmedAt,
    dependsOn,
    basis,
    note:
      typeof confirmation.note === "string"
        ? confirmation.note
        : undefined,
    invalidatedBy: invalidatedBy.length ? invalidatedBy : undefined,
  };
}

function readFacts(value: JsonValue): VehicleFact[] | undefined {
  if (
    !isPlainRecord(value) ||
    !Array.isArray(value.facts)
  ) {
    return undefined;
  }
  const facts = value.facts.flatMap((item): VehicleFact[] => {
    if (
      !isPlainRecord(item) ||
      typeof item.field !== "string" ||
      typeof item.label !== "string" ||
      typeof item.value !== "string" ||
      item.source !== "datapro" && item.source !== "user_quote" ||
      typeof item.capturedAt !== "string"
    ) {
      return [];
    }
    const normalizedValue =
      typeof item.normalizedValue === "string" ||
      typeof item.normalizedValue === "number" ||
      typeof item.normalizedValue === "boolean"
        ? item.normalizedValue
        : undefined;
    return [{
      field: item.field,
      label: item.label,
      value: item.value,
      normalizedValue,
      unit: typeof item.unit === "string" ? item.unit : undefined,
      source: item.source,
      capturedAt: item.capturedAt,
      evidenceId:
        typeof item.evidenceId === "string" ? item.evidenceId : undefined,
    }];
  });
  return facts.length ? facts : undefined;
}

function readIdentityOptions(
  value: JsonValue,
  candidateName: string,
): VehicleIdentityOption[] | undefined {
  if (!isPlainRecord(value) || !Array.isArray(value.identityOptions)) {
    return undefined;
  }
  const options = value.identityOptions.flatMap(
    (item): VehicleIdentityOption[] => {
      if (
        !isPlainRecord(item) ||
        typeof item.exactModelId !== "string" ||
        typeof item.displayName !== "string"
      ) {
        return [];
      }
      return [
        {
          exactModelId: item.exactModelId,
          displayName: identityOptionDisplayName(
            item.displayName,
            candidateName,
          ),
        },
      ];
    },
  );
  return options.length ? options : undefined;
}

function readRule(value: JsonValue): DecisionRule | undefined {
  const rule = readObject(value, "rule");
  if (
    !rule ||
    typeof rule.field !== "string" ||
    ![
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
    ].includes(String(rule.operator)) ||
    !(
      rule.value === null ||
      typeof rule.value === "string" ||
      typeof rule.value === "number" ||
      typeof rule.value === "boolean" ||
      (Array.isArray(rule.value) &&
        rule.value.every(
          (item) =>
            typeof item === "string" ||
            typeof item === "number" ||
            typeof item === "boolean",
        ))
    )
  ) {
    return undefined;
  }
  return {
    field: rule.field,
    operator: rule.operator as DecisionRule["operator"],
    value: rule.value,
    unit: typeof rule.unit === "string" ? rule.unit : undefined,
  };
}

function recordEvidence(
  record: DecisionProjectRecord,
): DecisionEvidence[] | undefined {
  const evidence = record.evidence.map((item): DecisionEvidence => {
    const sourceType =
      item.sourceType === "datapro" ? "datapro" : "user";
    const status =
      item.validity === "current" || item.validity === "needs_review"
        ? item.validity
        : "unavailable";
    const payload = isPlainRecord(item.payload) ? item.payload : {};
    return {
      id: item.id,
      candidateId: item.candidateTrimId ?? undefined,
      sourceType,
      sourceName: item.sourceName ?? sourceType,
      title: item.title,
      summary: item.summary,
      status,
      sourceUrl: item.sourceUrl ?? undefined,
      capturedAt: new Date(item.capturedAt).toISOString(),
      requestId:
        typeof payload.requestId === "string" ? payload.requestId : undefined,
      upstreamRequestId:
        typeof payload.upstreamRequestId === "string"
          ? payload.upstreamRequestId
          : undefined,
      traceId: item.traceId ?? undefined,
      logId: item.logId ?? undefined,
    };
  });
  return evidence.length ? evidence : undefined;
}

function recordCitySales(record: DecisionProjectRecord): CitySalesSeries[] | undefined {
  const citySales = record.cityVehicleSeries.map((series) => ({
    id: series.id,
    candidateId: series.candidateTrimId,
    city: series.city,
    series: series.seriesName,
    periodLabel: series.periodLabel,
    statisticLabel: series.metricLabel,
    metricKey: series.metricKey,
    metricDefinition: series.metricDefinition ?? undefined,
    unit: series.unit ?? undefined,
    dataLevel: series.dataLevel ?? undefined,
    datasetType: series.datasetType,
    requestId: series.requestId ?? undefined,
    traceId: series.traceId ?? undefined,
    points: record.cityVehicleSeriesPoints
      .filter((point) => point.seriesId === series.id)
      .map((point) => ({
        month: point.monthLabel,
        monthKey: point.month,
        value: point.value,
        extras: jsonRecord(point.extra),
      })),
    capturedAt: new Date(series.capturedAt).toISOString(),
    evidenceId: series.evidenceId ?? undefined,
  }));
  return citySales.length ? citySales : undefined;
}

function recordUnboundDataFields(
  record: DecisionProjectRecord,
  candidateTrimId: string,
  candidateData: JsonValue,
) {
  const exactFactFields = new Set(
    (readFacts(candidateData) ?? []).map((fact) => fact.field),
  );
  const keepOnlyUnboundFields = (fields: string[] | undefined) => {
    const filtered = Array.from(
      new Set(
        (fields ?? []).filter((field) => !exactFactFields.has(field)),
      ),
    );
    return filtered.length ? filtered : undefined;
  };
  const stored = readStringArray(candidateData, "unboundDataFields");
  if (stored?.length) return keepOnlyUnboundFields(stored);

  const latestDataProEvidence = [...record.evidence]
    .filter(
      (item) =>
        item.candidateTrimId === candidateTrimId &&
        item.sourceType === "datapro",
    )
    .sort((left, right) => right.capturedAt - left.capturedAt)[0];
  if (!latestDataProEvidence || !isPlainRecord(latestDataProEvidence.payload)) {
    return undefined;
  }
  const explicit = readStringArray(
    latestDataProEvidence.payload,
    "unboundFieldIds",
  );
  if (explicit?.length) return keepOnlyUnboundFields(explicit);

  const diagnostics = latestDataProEvidence.payload.diagnostics;
  if (!Array.isArray(diagnostics)) return undefined;
  const inferred = Array.from(
    new Set(
      diagnostics.flatMap((item) => {
        if (
          !isPlainRecord(item) ||
          item.status !== "ok" ||
          item.exactMatch === true ||
          !Array.isArray(item.returnedModelNames) ||
          item.returnedModelNames.length === 0 ||
          typeof item.query !== "string"
        ) {
          return [];
        }
        const query = item.query;
        return Object.entries(AUTOMATIC_FIELD_QUERY_LABELS)
          .filter(([, label]) => query.endsWith(` ${label}`))
          .map(([field]) => field);
      }),
    ),
  );
  return keepOnlyUnboundFields(inferred);
}

export function recordToDomainProject(
  record: DecisionProjectRecord,
): DecisionProject {
  const storedEvidenceIds = new Set(record.evidence.map((item) => item.id));
  const project: DecisionProject = {
    id: record.project.id,
    title: record.project.title,
    isDemo: false,
    updatedAt: new Date(record.project.updatedAt).toISOString(),
    context: {
      city: record.project.city ?? "城市待确认",
      paymentMethod: readString(
        record.project.summary,
        "paymentMethod",
        "支付方式待确认",
      ),
      purchaseTime:
        readString(record.project.summary, "purchaseTime", "") || undefined,
      maxBudgetWan: readNumber(record.project.summary, "maxBudgetWan"),
      need:
        readString(record.project.summary, "raw_need_text", "") ||
        readString(record.project.summary, "need", "") ||
        undefined,
    },
    issues: readProjectIssues(record.project.summary),
    candidates: record.candidateTrims.map((candidate) => ({
      id: candidate.id,
      role:
        candidate.id === record.project.primaryCandidateId
          ? "target"
          : "alternative",
      vehicle: {
        exactModelId: candidate.entityId ?? `local:${candidate.id}`,
        manufacturer: candidate.brand ?? "品牌待确认",
        series: candidate.series ?? candidate.displayName,
        modelYear: candidate.modelYear ?? "年款待确认",
        trim: candidate.trimName,
      },
      facts: readFacts(candidate.data),
      unboundDataFields: recordUnboundDataFields(
        record,
        candidate.id,
        candidate.data,
      ),
      identityOptions: readIdentityOptions(
        candidate.data,
        [
          candidate.brand,
          candidate.series,
          candidate.modelYear,
          candidate.trimName,
        ]
          .filter(Boolean)
          .join(" "),
      ),
      quote:
        readString(candidate.data, "quoteVersion", "") ||
        readNumber(candidate.data, "totalAmountCny") !== undefined
          ? {
              version: readString(candidate.data, "quoteVersion", "quote-v1"),
              totalAmountCny: readNumber(candidate.data, "totalAmountCny"),
              capturedAt:
                readString(candidate.data, "quoteCapturedAt", "") || undefined,
            }
          : undefined,
    })),
    conditions: record.conditions.map((condition) => ({
      id: condition.id,
      title: condition.title,
      detail: condition.description || undefined,
      category: (
        Object.values(ConditionCategory) as string[]
      ).includes(condition.priority)
        ? (condition.priority as DomainConditionCategory)
        : ConditionCategory.PREFERENCE,
      kind: condition.kind === "hard" ? "hard" : "preference",
      rule: readRule(condition.details),
      sourceText:
        readString(condition.details, "sourceText", "") || undefined,
      sourceStart: readNumber(condition.details, "sourceStart"),
      sourceEnd: readNumber(condition.details, "sourceEnd"),
      concept: readString(condition.details, "concept", "") || undefined,
      scope: (() => {
        const value = readString(condition.details, "scope", "");
        return ["context", "comparison", "transaction"].includes(value)
          ? (value as "context" | "comparison" | "transaction")
          : undefined;
      })(),
      verificationMode: (() => {
        const value = readString(
          condition.details,
          "verificationMode",
          "",
        );
        return [
          "vehicle_data",
          "sales_data",
          "web_research",
          "self_check",
          "written_confirmation",
          "context",
        ].includes(value)
          ? (value as NonNullable<
              DecisionCondition["verificationMode"]
            >)
          : undefined;
      })(),
      dataFieldHints: readStringArray(
        condition.details,
        "dataFieldHints",
      ),
      order: condition.sortOrder,
    })),
    evidence: recordEvidence(record),
    citySales: recordCitySales(record),
    evaluations: record.evaluations.map((evaluation) => {
      const pendingReason = readString(
        evaluation.rationale,
        "pendingReason",
        "",
      );
      const confirmation = readObject(
        evaluation.rationale,
        "userConfirmation",
      );
      return {
        conditionId: evaluation.conditionId,
        candidateId: evaluation.candidateTrimId,
        status: evaluation.status as
          | typeof DecisionStatus.CONFIRMED
          | typeof DecisionStatus.CONFLICT
          | typeof DecisionStatus.PENDING,
        summary: evaluation.conclusion,
        pendingReason:
          evaluation.status === DecisionStatus.PENDING &&
          (Object.values(PendingReason) as string[]).includes(pendingReason)
            ? (pendingReason as DomainPendingReason)
            : undefined,
        evidenceRefs: readStringArray(
          evaluation.rationale,
          "evidenceRefs",
        )?.filter((reference) => storedEvidenceIds.has(reference)),
        factFields: readStringArray(
          evaluation.rationale,
          "factFields",
        ),
        userConfirmation: restoreUserConfirmation(
          confirmation,
          new Date(evaluation.updatedAt).toISOString(),
        ),
      };
    }),
  };
  project.evaluations = project.evaluations.map((evaluation) => {
    if (
      evaluation.status !== DecisionStatus.PENDING ||
      evaluation.userConfirmation
    ) {
      return evaluation;
    }
    const candidate = project.candidates.find(
      (item) => item.id === evaluation.candidateId,
    );
    const condition = project.conditions.find(
      (item) => item.id === evaluation.conditionId,
    );
    return candidate &&
      condition &&
      hasUnboundDataForCondition(condition, candidate)
      ? evaluateCandidateCondition(condition, candidate)
      : evaluation;
  });
  assertDecisionProject(project);
  return project;
}

function domainEvaluationsUpdate(
  project: DecisionProject,
): UpdateDecisionProjectInput {
  const summary = summarizeDecision(project);
  return {
    status: summary.status,
    evaluations: project.evaluations.map((evaluation) => ({
      id: safeId("evaluation"),
      conditionId: evaluation.conditionId,
      candidateTrimId: evaluation.candidateId,
      status: evaluation.status,
      conclusion: evaluation.summary,
      rationale: {
        pendingReason: evaluation.pendingReason ?? null,
        evidenceRefs: evaluation.evidenceRefs ?? [],
        factFields: evaluation.factFields ?? [],
        userConfirmation: evaluation.userConfirmation
          ? (evaluation.userConfirmation as unknown as JsonValue)
          : null,
      },
      evaluatedAt: Date.parse(project.updatedAt) || Date.now(),
    })),
  };
}

function domainCandidatesUpdate(project: DecisionProject) {
  return projectToStorage(project).candidateTrims ?? [];
}

function harnessStatus(results: HarnessCallResult<unknown>[]): HarnessProjectStatus {
  const successful = results.filter((result) => result.status === "ok").length;
  if (successful === results.length) {
    return {
      status: "ok",
      message:
        "首次生成已完成：Agent Plan 已整理条件，专业配置与城市车系数据均已查询；只有可核验字段进入比较结果。",
    };
  }
  if (successful === 0) {
    return {
      status: "unavailable",
      message:
        "首次生成已完成，但外部能力暂不可用；相关项已标记“暂无可靠数据”，没有使用模型记忆补答案，也无需手动刷新。",
    };
  }
  return {
    status: "partial",
    message:
      "首次生成已完成；部分外部数据未返回，相关项已标记“暂无可靠数据”，不会要求再次刷新。",
  };
}

function failedDataProResult(
  error: unknown,
): HarnessCallResult<DataProPayload> {
  const timeout =
    error instanceof Error && /timeout|timed out|abort/i.test(error.message);
  const now = new Date().toISOString();
  return {
    service: "datapro",
    status: timeout ? "unavailable" : "error",
    data: null,
    error: {
      code: timeout ? "request_timeout" : "unexpected_error",
      message: timeout
        ? "DataPro request timed out."
        : "DataPro request did not complete.",
      retryable: timeout,
    },
    meta: {
      request_id: safeId("request"),
      requested_at: now,
      received_at: now,
      upstream_request_id: null,
      trace_id: null,
      log_id: null,
    },
  };
}

function failedVehicleQuery(error: unknown): VehicleDataProQueryResult {
  return {
    result: failedDataProResult(error),
    mode: "bare_fallback",
    queries: [],
    traceIds: [],
    unboundFieldIds: [],
    diagnostics: [],
    fallbackReason: "request_failed",
  };
}

function failedCityQuery(error: unknown): CityVehicleSalesQueryResult {
  const result = failedDataProResult(error);
  return {
    result,
    results: [result],
    query: "",
    queries: [],
    parsed: {
      status: "unavailable",
      series: null,
      reason:
        result.error?.code === "request_timeout"
          ? "城市车系数据查询超时"
          : "城市车系数据查询未完成",
      auxiliaryFields: [],
    },
  };
}

function issueForFailure(
  code: ProjectDataIssue["code"],
  stage: ProjectDataIssue["stage"],
  candidate: VehicleCandidate,
): ProjectDataIssue {
  const detail = projectApiError(code);
  return {
    code,
    stage,
    candidateId: candidate.id,
    candidateName: [
      candidate.vehicle.manufacturer,
      candidate.vehicle.series,
      candidate.vehicle.modelYear,
      candidate.vehicle.trim,
    ]
      .filter(Boolean)
      .join(" "),
    message: detail.message,
    retryable: detail.retryable,
  };
}

async function resolveVehicleIdentityInOnePass(
  candidateName: string,
  evidenceId: string,
) {
  const identityQueries = buildVehicleIdentityOptionQueries(candidateName);
  const initialClient = createDataProClient({
    timeoutMs: DATAPRO_IDENTITY_QUERY_TIMEOUT_MS,
  });
  const initialResults = await Promise.all(
    identityQueries.map((query) =>
      boundedDataProQuery(
        initialClient,
        query,
        DATAPRO_IDENTITY_QUERY_TIMEOUT_MS,
      ),
    ),
  );
  const allInitialResults = [...initialResults];
  const initialParsed = initialResults.map((result) =>
    parseDataProVehiclePayload(
      result.status === "ok" ? result.data : null,
      candidateName,
      result.meta.received_at,
      evidenceId,
    ),
  );
  let parsed = mergeParsedVehicleIdentities(initialParsed);
  if (!parsed.exactMatch && parsed.identityOptions.length === 0) {
    for (const query of identityQueries) {
      const retryClient = createDataProClient({
        timeoutMs: DATAPRO_IDENTITY_QUERY_TIMEOUT_MS,
      });
      const retryResult = await boundedDataProQuery(
        retryClient,
        query,
        DATAPRO_IDENTITY_QUERY_TIMEOUT_MS,
      );
      allInitialResults.push(retryResult);
      initialParsed.push(
        parseDataProVehiclePayload(
          retryResult.status === "ok" ? retryResult.data : null,
          candidateName,
          retryResult.meta.received_at,
          evidenceId,
        ),
      );
      parsed = mergeParsedVehicleIdentities(initialParsed);
      if (parsed.exactMatch || parsed.identityOptions.length > 0) break;
    }
  }
  if (parsed.exactMatch) {
    return { results: allInitialResults, parsed };
  }

  const refinementOptions = parsed.identityOptions
    .filter((option) =>
      option.exactModelId.startsWith("datapro-series:"),
    )
    .slice(0, 5);
  if (!refinementOptions.length) {
    return { results: allInitialResults, parsed };
  }

  const refinementBatches = await Promise.all(
    refinementOptions.map(async (option) => {
      const client = createDataProClient({
        timeoutMs: DATAPRO_IDENTITY_QUERY_TIMEOUT_MS,
      });
      const results = await Promise.all(
        buildVehicleIdentityOptionQueries(option.displayName, true).map(
          (query) =>
            boundedDataProQuery(
              client,
              query,
              DATAPRO_IDENTITY_QUERY_TIMEOUT_MS,
            ),
        ),
      );
      return {
        results,
        parsed: results.map((result) =>
          parseDataProVehiclePayload(
            result.status === "ok" ? result.data : null,
            option.displayName,
            result.meta.received_at,
            evidenceId,
            { selectedSeriesRefinement: true },
          ),
        ),
      };
    }),
  );
  const refinementResults = refinementBatches.flatMap(
    (batch) => batch.results,
  );
  parsed = mergeParsedVehicleIdentities([
    ...initialParsed,
    ...refinementBatches.flatMap((batch) => batch.parsed),
  ]);
  if (!parsed.exactMatch) {
    parsed = {
      ...parsed,
      identityOptions: parsed.identityOptions.filter(
        (option) =>
          !option.exactModelId.startsWith("datapro-series:"),
      ),
    };
  }
  return {
    results: [...allInitialResults, ...refinementResults],
    parsed,
  };
}

export async function createProjectWithHarness(
  input: NewDecisionProjectRequest,
): Promise<CreatedProjectView> {
  const operationId = safeId("operation");
  const operationStartedAt = Date.now();
  const clients = createHarnessClients();
  const candidateNames = [...input.candidates];
  const candidateIdentityIds = input.candidates.map(
    (_, index) => input.candidateIdentityIds?.[index] ?? null,
  );
  let prefetchedExtractionResult: HarnessCallResult<ConditionExtraction> | null =
    null;
  let candidates: VehicleCandidate[] = candidateNames.map(
    (candidateName, index) => {
      const vehicle = parseVehicleName(candidateName, index);
      return {
        id: safeId("candidate"),
        role: index === 0 ? ("target" as const) : ("alternative" as const),
        vehicle: {
          ...vehicle,
          exactModelId: candidateIdentityIds[index] ?? vehicle.exactModelId,
        },
      };
    },
  );
  const identityIndexes = candidateNames
    .map((candidateName, index) =>
      requiresVehicleIdentitySelection(
        candidateName,
        candidateIdentityIds[index],
      )
        ? index
        : -1,
    )
    .filter((index) => index >= 0);

  if (identityIndexes.length > 0) {
    logProjectStage(operationId, "vehicle_resolution", "start");
    const identityEvidenceIds = candidates.map(() => safeId("evidence"));
    const [extractionResult, identityQueries] = await Promise.all([
      retryHarnessCall(() =>
        clients.agentPlan.structureConditions(input.need),
      ),
      Promise.all(
        identityIndexes.map(async (index) => {
          const resolved = await resolveVehicleIdentityInOnePass(
            candidateNames[index],
            identityEvidenceIds[index],
          );
          return {
            index,
            ...resolved,
          };
        }),
      ),
    ]);
    prefetchedExtractionResult = extractionResult;
    const extraction =
      extractionResult.status === "ok" ? extractionResult.data : null;
    const conditions = buildConditions(input, extraction);
    const identityByIndex = new Map(
      identityQueries.map((query) => [query.index, query]),
    );
    let needsIdentityConfirmation = false;
    let hasMissingSeries = false;
    for (const query of identityQueries) {
      const exactOptions = query.parsed.identityOptions.filter(
        (option) =>
          !option.exactModelId.startsWith("datapro-series:"),
      );
      if (query.parsed.exactMatch && query.parsed.exactModelId) {
        candidateIdentityIds[query.index] = query.parsed.exactModelId;
        continue;
      }
      if (exactOptions.length === 1) {
        candidateNames[query.index] = exactOptions[0].displayName;
        candidateIdentityIds[query.index] = exactOptions[0].exactModelId;
        continue;
      }
      if (exactOptions.length === 0) hasMissingSeries = true;
      needsIdentityConfirmation = true;
    }
    candidates = candidates.map((candidate, index) => {
      const identity = identityByIndex.get(index);
      const selectedIdentityId = candidateIdentityIds[index];
      const vehicle = parseVehicleName(candidateNames[index], index);
      if (!identity) {
        return {
          ...candidate,
          vehicle: {
            ...vehicle,
            exactModelId:
              selectedIdentityId ??
              `datapro-name:${encodeURIComponent(candidateNames[index])}`,
          },
        };
      }
      const exactOptions = identity.parsed.identityOptions.filter(
        (option) =>
          !option.exactModelId.startsWith("datapro-series:"),
      );
      if (selectedIdentityId) {
        return {
          ...candidate,
          vehicle: {
            ...vehicle,
            exactModelId: selectedIdentityId,
          },
        };
      }
      return {
        ...candidate,
        vehicle: {
          ...vehicle,
          exactModelId: identity.parsed.exactModelId ?? vehicle.exactModelId,
        },
        facts: identity.parsed.facts,
        identityOptions: identity.parsed.exactMatch
          ? undefined
          : exactOptions,
      };
    });
    if (needsIdentityConfirmation) {
      const now = new Date().toISOString();
      const project: DecisionProject = {
        id: safeId("project"),
        title: "购车决策助手",
        updatedAt: now,
        context: {
          city: input.city,
          paymentMethod: "支付方式待确认",
          purchaseTime: input.purchaseTime,
          maxBudgetWan: input.maxBudgetWan,
          need: input.need,
        },
        candidates,
        conditions,
        citySales: [],
        evaluations: conditions.flatMap((condition) =>
          candidates.map((candidate) =>
            evaluateCandidateCondition(condition, candidate),
          ),
        ),
      };
      assertDecisionProject(project);
      const harness = harnessStatus([
        extractionResult,
        ...identityQueries.flatMap((query) => query.results),
      ]);
      logProjectStage(operationId, "vehicle_resolution", "ok", {
        durationMs: Date.now() - operationStartedAt,
      });
      return {
        project,
        requiresIdentityConfirmation: true,
        code: hasMissingSeries
          ? ProjectErrorCode.VEHICLE_SERIES_NOT_FOUND
          : ProjectErrorCode.VEHICLE_SELECTION_REQUIRED,
        harness: {
          ...harness,
          message: hasMissingSeries
            ? "部分车型没有返回可核验版本。VEHICLE_SERIES_NOT_FOUND"
            : "已一次检索到可核验的精确车型候选；请选择一次后生成配置与城市车系数据。",
        },
      };
    }
  }

  const extractionResult =
    prefetchedExtractionResult ??
    (await retryHarnessCall(() =>
      clients.agentPlan.structureConditions(input.need),
    ));
  const extraction =
    extractionResult.status === "ok" ? extractionResult.data : null;
  const conditions = buildConditions(input, extraction);
  const initialIssues: ProjectDataIssue[] =
    extractionResult.status === "ok"
      ? []
      : [{
          code: "REQUIREMENT_PARSE_FAILED",
          stage: "requirement_parsing",
          message: projectApiError(
            ProjectErrorCode.REQUIREMENT_PARSE_FAILED,
          ).message,
          retryable: false,
        }];
  const initialNow = new Date().toISOString();
  const initialProject: DecisionProject = {
    id: safeId("project"),
    title: "购车决策助手",
    updatedAt: initialNow,
    context: {
      city: input.city,
      paymentMethod: "支付方式待确认",
      purchaseTime: input.purchaseTime,
      maxBudgetWan: input.maxBudgetWan,
      need: input.need,
    },
    candidates,
    conditions,
    citySales: [],
    issues: initialIssues,
    evaluations: conditions.flatMap((condition) =>
      candidates.map((candidate) =>
        evaluateCandidateCondition(condition, candidate),
      ),
    ),
  };
  assertDecisionProject(initialProject);
  logProjectStage(operationId, "project_create", "start");
  let initialCreated;
  try {
    initialCreated = await createDecisionProject(
      projectToStorage(initialProject),
    );
    logProjectStage(operationId, "project_create", "ok");
  } catch (error) {
    logProjectStage(operationId, "project_create", "error", {
      code: ProjectErrorCode.PROJECT_SAVE_FAILED,
      diagnostic: safeErrorDiagnostic(error),
    });
    throw new ProjectServiceError(
      projectApiError(ProjectErrorCode.PROJECT_SAVE_FAILED, {
        stage: "project_create",
        action: "项目尚未创建，请稍后重试",
      }),
      { cause: error },
    );
  }
  const cityEvidenceIds = candidates.map(() => safeId("evidence"));
  const dataClients = candidates.map(() =>
    createDataProClient({
      timeoutMs: DATAPRO_VEHICLE_TIMEOUT_MS,
    }),
  );
  const cityDataClients = candidates.map(() =>
    createDataProClient({
      timeoutMs: DATAPRO_CITY_QUERY_TIMEOUT_MS,
    }),
  );

  logProjectStage(operationId, "vehicle_configuration", "start");
  logProjectStage(operationId, "city_sales", "start");
  const [dataQueryOutcomes, cityQueryOutcomes] = await Promise.all([
    Promise.allSettled(
      candidateNames.map((candidateName, index) =>
        queryVehicleDataPro(
          candidateName,
          conditions,
          dataClients[index],
          candidateIdentityIds[index],
        ),
      ),
    ),
    Promise.allSettled(
      candidates.map((candidate, index) =>
        queryCityVehicleSalesDataPro(
          candidate.id,
          normalizeVehicleSalesEntity(
            candidate.vehicle.manufacturer,
            candidate.vehicle.series,
          ),
          input.city,
          {
            evidenceId: cityEvidenceIds[index],
            client: cityDataClients[index],
          },
        ),
      ),
    ),
  ]);
  const dataQueries = dataQueryOutcomes.map((outcome) =>
    outcome.status === "fulfilled"
      ? outcome.value
      : failedVehicleQuery(outcome.reason),
  );
  const cityQueries = cityQueryOutcomes.map((outcome) =>
    outcome.status === "fulfilled"
      ? outcome.value
      : failedCityQuery(outcome.reason),
  );
  const dataResults = dataQueries.map((query) => query.result);

  const dataEvidenceIds = candidates.map(() => safeId("evidence"));
  const parsedVehicles = dataResults.map((result, index) =>
    parseDataProVehiclePayload(
      result.status === "ok" ? result.data : null,
      candidateNames[index],
      result.meta.received_at,
      dataEvidenceIds[index],
      { selectedExactModelId: candidateIdentityIds[index] },
    ),
  );
  candidates = candidates.map((candidate, index) => {
    const parsed = parsedVehicles[index];
    return {
      ...candidate,
      vehicle: {
        ...candidate.vehicle,
        exactModelId:
          candidateIdentityIds[index] ??
          parsed.exactModelId ??
          candidate.vehicle.exactModelId,
      },
      facts: parsed.facts,
      unboundDataFields: dataQueries[index].unboundFieldIds.filter(
        (field) => !parsed.facts.some((fact) => fact.field === field),
      ),
      identityOptions: undefined,
    };
  });

  const conditionsWithMatrix = conditions.flatMap((condition) =>
    candidates.map((candidate) =>
      evaluateCandidateCondition(condition, candidate),
    ),
  );
  const issues: ProjectDataIssue[] = [...initialIssues];
  candidates.forEach((candidate, index) => {
    const dataResult = dataResults[index];
    const parsed = parsedVehicles[index];
    if (
      dataResult.error?.code === "request_timeout" ||
      dataResult.error?.code === "network_error"
    ) {
      issues.push(
        issueForFailure(
          "PROVIDER_TIMEOUT",
          "vehicle_configuration",
          candidate,
        ),
      );
      logProjectStage(operationId, "vehicle_configuration", "error", {
        candidateIndex: index,
        code: ProjectErrorCode.PROVIDER_TIMEOUT,
      });
    } else if (!parsed.exactMatch || parsed.facts.length === 0) {
      issues.push(
        issueForFailure(
          "EXACT_CONFIG_NO_DATA",
          "vehicle_configuration",
          candidate,
        ),
      );
      logProjectStage(operationId, "vehicle_configuration", "partial", {
        candidateIndex: index,
        code: ProjectErrorCode.EXACT_CONFIG_NO_DATA,
      });
    } else {
      logProjectStage(operationId, "vehicle_configuration", "ok", {
        candidateIndex: index,
      });
    }

    const cityQuery = cityQueries[index];
    if (
      cityQuery.result.error?.code === "request_timeout" ||
      cityQuery.result.error?.code === "network_error"
    ) {
      issues.push(
        issueForFailure("PROVIDER_TIMEOUT", "city_sales", candidate),
      );
      logProjectStage(operationId, "city_sales", "error", {
        candidateIndex: index,
        code: ProjectErrorCode.PROVIDER_TIMEOUT,
      });
    } else if (
      cityQuery.parsed.status !== "current" ||
      !cityQuery.parsed.series
    ) {
      issues.push(
        issueForFailure("CITY_SALES_NO_DATA", "city_sales", candidate),
      );
      logProjectStage(operationId, "city_sales", "partial", {
        candidateIndex: index,
        code: ProjectErrorCode.CITY_SALES_NO_DATA,
      });
    } else {
      logProjectStage(operationId, "city_sales", "ok", {
        candidateIndex: index,
      });
    }
  });

  const now = new Date().toISOString();
  const project: DecisionProject = {
    id: initialProject.id,
    title: "购车决策助手",
    updatedAt: now,
    context: {
      city: input.city,
      paymentMethod: "支付方式待确认",
      purchaseTime: input.purchaseTime,
      maxBudgetWan: input.maxBudgetWan,
      need: input.need,
    },
    candidates,
    conditions,
    issues,
    citySales: cityQueries.flatMap((query) =>
      query.parsed.status === "current" && query.parsed.series
        ? [query.parsed.series]
        : [],
    ),
    evaluations: conditionsWithMatrix,
  };
  assertDecisionProject(project);

  const baseHarness = harnessStatus([
    extractionResult,
    ...dataResults,
    ...cityQueries.flatMap((query) => query.results),
  ]);
  const hasDisplayData =
    candidates.some((candidate) => (candidate.facts?.length ?? 0) > 0) ||
    (project.citySales?.length ?? 0) > 0;
  const harness: HarnessProjectStatus = issues.length
    ? {
        status: hasDisplayData ? "partial" : "unavailable",
        message: `首次生成已完成；已保留全部成功数据。${Array.from(
          new Set(issues.map((issue) => issue.code)),
        ).join("、")}`,
      }
    : baseHarness;
  const evidenceInputs: EvidenceInput[] = dataResults.map((result, index) => ({
    id: dataEvidenceIds[index],
    candidateTrimId: candidates[index].id,
    evidenceType: "vehicle_configuration_query",
    sourceType: "datapro",
    sourceName: "专业数据集",
    title: `${candidateNames[index]} 配置查询`,
    summary:
      result.status !== "ok"
        ? "本次专业数据查询未成功，相关事实保持待确认。"
        : parsedVehicles[index].exactMatch
          ? dataProEvidenceSummary(
              parsedVehicles[index],
              "返回",
              dataQueries[index].unboundFieldIds.length,
            )
          : "车型身份已锁定，但本次配置数据未能按该专业数据标识返回；未将其他版本字段写入结论。",
    traceId: result.meta.trace_id,
    validity:
      result.status !== "ok"
        ? "unavailable"
        : parsedVehicles[index].exactMatch
          ? "current"
          : "needs_review",
    capturedAt: Date.parse(result.meta.received_at) || Date.now(),
    payload: {
      requestId: result.meta.request_id,
      upstreamRequestId: result.meta.upstream_request_id,
      status: result.status,
      errorCode: result.error?.code ?? null,
      queryMode: dataQueries[index].mode,
      queries: dataQueries[index].queries,
      traceIds: dataQueries[index].traceIds,
      diagnostics: dataQueries[index].diagnostics,
      unboundFieldIds: dataQueries[index].unboundFieldIds,
      fallbackReason: dataQueries[index].fallbackReason,
      exactMatch: parsedVehicles[index].exactMatch,
      matchedModelName: parsedVehicles[index].matchedModelName,
      returnedFieldCount:
        parsedVehicles[index].facts.filter(isRawDataProFact).length ||
        parsedVehicles[index].facts.length,
      fields: parsedVehicles[index].facts
        .filter((item) => !isRawDataProFact(item))
        .map((item) => item.field),
    },
  }));
  evidenceInputs.push(
    ...cityQueries.map((query, index): EvidenceInput => ({
      id: cityEvidenceIds[index],
      candidateTrimId: candidates[index].id,
      evidenceType: "city_vehicle_series_query",
      sourceType: "datapro",
      sourceName: "中国汽车品牌销量数据",
      title: `${query.parsed.series?.series ?? candidateNames[index]} 城市车系数据`,
      summary:
        query.parsed.status === "current" && query.parsed.series
          ? `已返回${query.parsed.series.city}、${query.parsed.series.statisticLabel}口径的 ${query.parsed.series.points.length} 个月数据。`
          : `本次城市车系数据未进入图表：${query.parsed.reason ?? "没有可用结果"}。`,
      traceId: query.result.meta.trace_id,
      validity: query.parsed.status,
      capturedAt:
        Date.parse(query.result.meta.received_at) || Date.now(),
      payload: {
        requestId: query.result.meta.request_id,
        upstreamRequestId: query.result.meta.upstream_request_id,
        status: query.result.status,
        query: query.query,
        queries: query.queries,
        traceIds: query.results
          .map((result) => result.meta.trace_id)
          .filter(Boolean),
        reason: query.parsed.reason,
        metricKey: query.parsed.series?.metricKey ?? null,
        metricDefinition: query.parsed.series?.metricDefinition ?? null,
        auxiliaryFields: query.parsed.auxiliaryFields,
      },
    })),
  );

  const storage = projectToStorage(project, evidenceInputs);
  logProjectStage(operationId, "project_finalize", "start");
  try {
    const finalized = await updateDecisionProject(
      initialProject.id,
      initialCreated.editToken,
      {
        expectedVersion: initialCreated.record.project.version,
        title: storage.title,
        status: storage.status,
        city: storage.city,
        primaryCandidateId: storage.primaryCandidateId,
        summary: storage.summary,
        candidateTrims: storage.candidateTrims,
        conditions: storage.conditions,
        evaluations: storage.evaluations,
        evidence: storage.evidence,
        cityVehicleSeries: storage.cityVehicleSeries,
        cityVehicleSeriesPoints: storage.cityVehicleSeriesPoints,
      },
    );
    logProjectStage(operationId, "project_finalize", "ok", {
      durationMs: Date.now() - operationStartedAt,
    });
    return {
      project: recordToDomainProject(finalized),
      recoveryCode: initialCreated.recoveryCode,
      editToken: initialCreated.editToken,
      requiresIdentityConfirmation: false,
      harness,
    };
  } catch (error) {
    logProjectStage(operationId, "project_finalize", "error", {
      code: ProjectErrorCode.PROJECT_SAVE_FAILED,
      durationMs: Date.now() - operationStartedAt,
      diagnostic: safeErrorDiagnostic(error),
    });
    const savedProject = recordToDomainProject(initialCreated.record);
    savedProject.issues = [
      ...(savedProject.issues ?? []),
      {
        code: "PROJECT_SAVE_FAILED",
        stage: "project_finalize",
        message: projectApiError(ProjectErrorCode.PROJECT_SAVE_FAILED).message,
        retryable: true,
      },
    ];
    return {
      project: savedProject,
      recoveryCode: initialCreated.recoveryCode,
      editToken: initialCreated.editToken,
      requiresIdentityConfirmation: false,
      harness: {
        status: "unavailable",
        message:
          "初始项目和精确车型已保存，但本次查询结果未能完成保存。PROJECT_SAVE_FAILED",
      },
    };
  }
}

export async function readProjectView(projectId: string, editToken: string) {
  const record = await readDecisionProject(projectId, editToken);
  return recordToDomainProject(record);
}

export type ProjectAnswerDisposition = "affirmative" | "negative" | "uncertain";

export function classifyProjectAnswer(answer: string): ProjectAnswerDisposition {
  if (
    [
      "符合我的需要",
      "已写入正式材料",
      "我已有完整报价",
      "重新确认",
    ].includes(answer)
  ) {
    return "affirmative";
  }
  if (
    [
      "不符合我的需要",
      "仍是口头说法",
      "更换精确配置",
      "更换条件",
    ].includes(answer)
  ) {
    return "negative";
  }
  return "uncertain";
}

export async function recordProjectAnswer(
  projectId: string,
  editToken: string,
  input: {
    candidateId: string;
    conditionId: string;
    answer: string;
    note?: string;
    quoteTotalWan?: number;
  },
) {
  const record = await readDecisionProject(projectId, editToken);
  const project = recordToDomainProject(record);
  const evaluation = project.evaluations.find(
    (item) =>
      item.candidateId === input.candidateId &&
      item.conditionId === input.conditionId,
  );
  if (!evaluation) throw new Error("没有找到对应的未决事项");

  const condition = project.conditions.find(
    (item) => item.id === input.conditionId,
  );
  if (!condition) throw new Error("没有找到对应条件");
  const candidate = project.candidates.find(
    (item) => item.id === input.candidateId,
  );
  if (!candidate) throw new Error("没有找到对应候选车型");
  const disposition = classifyProjectAnswer(input.answer);
  const now = new Date().toISOString();
  evaluation.summary = `本人记录：${input.answer}${
    input.note ? `；${input.note.trim()}` : ""
  }`;
  let candidateChanged = false;
  if (
    condition.category === ConditionCategory.BUDGET &&
    disposition === "affirmative"
  ) {
    const explicitWan =
      typeof input.quoteTotalWan === "number" &&
      Number.isFinite(input.quoteTotalWan) &&
      input.quoteTotalWan > 0
        ? input.quoteTotalWan
        : undefined;
    const totalAmountCny =
      explicitWan !== undefined
        ? Math.round(explicitWan * 10_000)
        : parseExplicitLandingQuoteCny(input.note);
    if (totalAmountCny === undefined) {
      evaluation.status = DecisionStatus.PENDING;
      evaluation.pendingReason = PendingReason.QUOTE_REQUIRED;
      evaluation.summary =
        "已选择“我已有完整报价”，但尚未提供可解析的明确落地总价；预算仍待确认";
      evaluation.userConfirmation = undefined;
    } else {
      const quoteVersion = `user-quote:${now}`;
      candidate.quote = {
        version: quoteVersion,
        totalAmountCny,
        capturedAt: now,
      };
      candidateChanged = true;
      const budgetResult = evaluateCandidateCondition(condition, candidate);
      evaluation.status = budgetResult.status;
      evaluation.pendingReason = budgetResult.pendingReason;
      evaluation.summary = budgetResult.summary;
      evaluation.evidenceRefs = budgetResult.evidenceRefs;
      evaluation.userConfirmation =
        budgetResult.status === DecisionStatus.PENDING
          ? undefined
          : {
              confirmedAt: now,
              dependsOn: [ConfirmationDependency.QUOTE_VERSION],
              basis: { quoteVersion },
              note: input.note?.trim() || undefined,
            };
    }
  } else if (disposition !== "uncertain") {
    evaluation.status =
      disposition === "affirmative"
        ? DecisionStatus.CONFIRMED
        : DecisionStatus.CONFLICT;
    evaluation.pendingReason = undefined;
    evaluation.userConfirmation = {
      confirmedAt: now,
      dependsOn: [],
      basis: {},
      note: input.note?.trim() || undefined,
    };
  } else {
    evaluation.status = DecisionStatus.PENDING;
    evaluation.pendingReason = conditionPendingReason(condition);
    evaluation.userConfirmation = undefined;
  }
  project.updatedAt = now;
  const update: UpdateDecisionProjectInput = {
    ...domainEvaluationsUpdate(project),
    expectedVersion: record.project.version,
  };
  if (candidateChanged) {
    update.candidateTrims = domainCandidatesUpdate(project);
  }
  const updated = await updateDecisionProject(
    projectId,
    editToken,
    update,
  );
  return recordToDomainProject(updated);
}

export function toSafeError(error: unknown) {
  return toProjectApiError(error).message;
}
