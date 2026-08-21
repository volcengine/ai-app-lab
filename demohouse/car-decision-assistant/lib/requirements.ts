import {
  ConditionCategory,
  type ConditionCategory as DomainConditionCategory,
  type ConditionKind,
  type DecisionRule,
} from "./decision";

export type RequirementScope = "context" | "comparison" | "transaction";

export type RequirementVerificationMode =
  | "vehicle_data"
  | "sales_data"
  | "web_research"
  | "self_check"
  | "written_confirmation"
  | "context";

export interface RequirementAtom {
  concept: string;
  title: string;
  sourceText: string;
  sourceStart: number;
  sourceEnd: number;
  category: DomainConditionCategory;
  kind: ConditionKind;
  scope: RequirementScope;
  verificationMode: RequirementVerificationMode;
  rule?: DecisionRule;
  dataFieldHints: string[];
}

type RequirementDefinition = {
  concept: string;
  title: string;
  patterns: RegExp[];
  category: DomainConditionCategory;
  defaultKind: ConditionKind;
  scope: RequirementScope;
  verificationMode: RequirementVerificationMode;
  rule?: DecisionRule;
  dataFieldHints?: string[];
};

const DEFINITIONS: RequirementDefinition[] = [
  {
    concept: "work_city",
    title: "日常在本地通勤",
    patterns: [/在[\p{Script=Han}]{2,12}(?:上班|工作)/u],
    category: ConditionCategory.PERSONAL_EXPERIENCE,
    defaultKind: "preference",
    scope: "context",
    verificationMode: "context",
  },
  {
    concept: "primary_driver",
    title: "平时以本人单独驾驶为主",
    patterns: [/(?:平时|日常|基本).{0,6}(?:一个人|自己)(?:开|驾驶)/],
    category: ConditionCategory.PERSONAL_EXPERIENCE,
    defaultKind: "preference",
    scope: "context",
    verificationMode: "context",
  },
  {
    concept: "family_passengers",
    title: "需要兼顾家人乘坐",
    patterns: [/(?:周末|偶尔|经常)?.{0,6}(?:带|接送)(?:父母|老人|孩子|家人)/],
    category: ConditionCategory.PERSONAL_EXPERIENCE,
    defaultKind: "preference",
    scope: "context",
    verificationMode: "context",
  },
  {
    concept: "daily_commute_distance",
    title: "日常通勤里程",
    patterns: [/(?:每天|每日|日常).{0,8}(?:来回|往返|通勤)?.{0,5}\d+(?:\.\d+)?\s*(?:公里|km)/i],
    category: ConditionCategory.PERSONAL_EXPERIENCE,
    defaultKind: "preference",
    scope: "context",
    verificationMode: "context",
  },
  {
    concept: "workplace_charging",
    title: "公司具备充电条件",
    patterns: [/(?:公司|单位|工作地点).{0,8}(?:可以|能|方便|支持)?充电/],
    category: ConditionCategory.PERSONAL_EXPERIENCE,
    defaultKind: "preference",
    scope: "context",
    verificationMode: "context",
  },
  {
    concept: "home_charging",
    title: "家庭充电条件",
    patterns: [/(?:没有|无|有|具备|安装不了|可安装)?家充(?:桩)?/],
    category: ConditionCategory.PERSONAL_EXPERIENCE,
    defaultKind: "preference",
    scope: "context",
    verificationMode: "self_check",
  },
  {
    concept: "seat_count",
    title: "座位数量",
    patterns: [/\d{1,2}\s*座/],
    category: ConditionCategory.CONFIGURATION,
    defaultKind: "hard",
    scope: "comparison",
    verificationMode: "vehicle_data",
    dataFieldHints: ["seat_count"],
  },
  {
    concept: "energy_type",
    title: "新能源车型",
    patterns: [/(?:新能源|纯电(?!续航)|增程|插混|混动)(?:汽车|车型|车)?/],
    category: ConditionCategory.CONFIGURATION,
    defaultKind: "preference",
    scope: "comparison",
    verificationMode: "vehicle_data",
    dataFieldHints: ["energy_type"],
  },
  {
    concept: "driver_assistance",
    title: "重视辅助驾驶能力",
    patterns: [/(?:辅助|智能)驾驶(?:能力|系统|功能|等级)?/],
    category: ConditionCategory.CONFIGURATION,
    defaultKind: "preference",
    scope: "comparison",
    verificationMode: "vehicle_data",
    dataFieldHints: [
      "driver_assistance_system",
      "driver_assistance_level",
    ],
  },
  {
    concept: "rear_seat_comfort",
    title: "重视后排乘坐舒适度",
    patterns: [/(?:第二排|二排|后排).{0,5}(?:舒适|座椅功能|乘坐体验)/],
    category: ConditionCategory.PERSONAL_EXPERIENCE,
    defaultKind: "preference",
    scope: "comparison",
    verificationMode: "self_check",
    dataFieldHints: ["rear_seat_features"],
  },
  {
    concept: "fuel_economy",
    title: "希望能耗较低",
    patterns: [
      /(?:油耗|电耗|能耗)(?:要|比较|尽量|足够)?(?:低|省)/,
      /(?:油耗|电耗|能耗)/,
    ],
    category: ConditionCategory.PREFERENCE,
    defaultKind: "preference",
    scope: "comparison",
    verificationMode: "vehicle_data",
    dataFieldHints: [
      "wltc_fuel_consumption_l100km",
      "low_soc_fuel_consumption_l100km",
      "electricity_consumption_kwh100km",
    ],
  },
  {
    concept: "driving_range",
    title: "希望续航较长",
    patterns: [
      /(?:纯电|综合)?续航(?:里程)?(?:要|比较|尽量|足够)?(?:长|高|多)/,
      /(?:纯电|综合)?续航(?:里程)?/,
    ],
    category: ConditionCategory.PREFERENCE,
    defaultKind: "preference",
    scope: "comparison",
    verificationMode: "vehicle_data",
    dataFieldHints: [
      "cltc_pure_range_km",
      "cltc_total_range_km",
      "wltc_pure_range_km",
      "wltc_total_range_km",
    ],
  },
  {
    concept: "interior_space",
    title: "希望车内空间宽敞",
    patterns: [
      /(?:车内|乘坐|后排|整体)?空间(?:要|比较|足够)?(?:大|宽敞|充裕)/,
      /(?:车内|乘坐|后排)?空间/,
    ],
    category: ConditionCategory.PREFERENCE,
    defaultKind: "preference",
    scope: "comparison",
    verificationMode: "self_check",
    dataFieldHints: [
      "vehicle_length_mm",
      "vehicle_width_mm",
      "vehicle_height_mm",
      "wheelbase_mm",
      "trunk_volume_l",
    ],
  },
  {
    concept: "luggage_fit",
    title: "行李和婴儿车装载能力",
    patterns: [/(?:后备[厢箱]|满员时).{0,24}(?:行李箱|登机箱|婴儿车)/],
    category: ConditionCategory.PERSONAL_EXPERIENCE,
    defaultKind: "preference",
    scope: "comparison",
    verificationMode: "self_check",
    dataFieldHints: ["trunk_volume_l"],
  },
  {
    concept: "seat_ventilation",
    title: "座椅通风",
    patterns: [/(?:前排|第二排|后排)?座椅通风/],
    category: ConditionCategory.CONFIGURATION,
    defaultKind: "preference",
    scope: "comparison",
    verificationMode: "vehicle_data",
    dataFieldHints: ["seat_ventilation"],
  },
  {
    concept: "seat_heating",
    title: "座椅加热",
    patterns: [/(?:前排|第二排|后排)?(?:座椅)?(?:通风)?加热/],
    category: ConditionCategory.CONFIGURATION,
    defaultKind: "preference",
    scope: "comparison",
    verificationMode: "vehicle_data",
    dataFieldHints: ["seat_heating"],
  },
  {
    concept: "audio_system",
    title: "重视车载音响",
    patterns: [/(?:车载)?音响(?:系统|效果)?/],
    category: ConditionCategory.PERSONAL_EXPERIENCE,
    defaultKind: "preference",
    scope: "comparison",
    verificationMode: "self_check",
    dataFieldHints: ["audio_system"],
  },
  {
    concept: "vehicle_width",
    title: "车身宽度适合停车",
    patterns: [/(?:不接受|不要|不想要)?.{0,8}车身(?:太)?宽.{0,8}(?:停车)?/],
    category: ConditionCategory.CONFIGURATION,
    defaultKind: "hard",
    scope: "comparison",
    verificationMode: "self_check",
    dataFieldHints: ["vehicle_width_mm"],
  },
  {
    concept: "hidden_door_handles",
    title: "不接受隐藏式门把手使用风险",
    patterns: [/(?:不接受|不要|不想要)?.{0,6}隐藏(?:式)?门把手.{0,12}/],
    category: ConditionCategory.PERSONAL_EXPERIENCE,
    defaultKind: "hard",
    scope: "comparison",
    verificationMode: "self_check",
  },
  {
    concept: "motion_sickness",
    title: "不接受明显晕车",
    patterns: [/(?:不接受|容易|担心|避免)?.{0,6}晕车/],
    category: ConditionCategory.PERSONAL_EXPERIENCE,
    defaultKind: "hard",
    scope: "comparison",
    verificationMode: "self_check",
  },
  {
    concept: "third_row_comfort",
    title: "第三排成年人乘坐体验",
    patterns: [/第三排.{0,18}(?:成年人|坐两小时|舒适)/],
    category: ConditionCategory.PERSONAL_EXPERIENCE,
    defaultKind: "preference",
    scope: "comparison",
    verificationMode: "self_check",
    dataFieldHints: ["rear_seat_features"],
  },
  {
    concept: "cabin_odor",
    title: "关注车内异味",
    patterns: [/车内异味|新车异味/],
    category: ConditionCategory.PERSONAL_EXPERIENCE,
    defaultKind: "preference",
    scope: "comparison",
    verificationMode: "self_check",
  },
  {
    concept: "ingress_egress",
    title: "上下车方便",
    patterns: [/上下车.{0,6}(?:方便|便利)/],
    category: ConditionCategory.PERSONAL_EXPERIENCE,
    defaultKind: "preference",
    scope: "comparison",
    verificationMode: "self_check",
  },
  {
    concept: "charging_convenience",
    title: "确认日常或长途补能便利性",
    patterns: [/(?:常用充电|长途补能|充电).{0,10}(?:方便|便利|便利性)/],
    category: ConditionCategory.PERSONAL_EXPERIENCE,
    defaultKind: "preference",
    scope: "comparison",
    verificationMode: "self_check",
  },
  {
    concept: "fast_charging_support",
    title: "支持快充",
    patterns: [/支持快充|需要快充/],
    category: ConditionCategory.CONFIGURATION,
    defaultKind: "hard",
    scope: "comparison",
    verificationMode: "vehicle_data",
    dataFieldHints: ["fast_charge_time_hours"],
  },
  {
    concept: "transparent_chassis",
    title: "支持透明底盘",
    patterns: [/透明底盘/],
    category: ConditionCategory.CONFIGURATION,
    defaultKind: "hard",
    scope: "comparison",
    verificationMode: "vehicle_data",
    dataFieldHints: ["transparent_chassis"],
  },
  {
    concept: "insurance_cost",
    title: "确认保险成本",
    patterns: [/保险(?:成本|费用|价格)/],
    category: ConditionCategory.SALES_WRITTEN,
    defaultKind: "preference",
    scope: "transaction",
    verificationMode: "written_confirmation",
  },
  {
    concept: "exterior_style",
    title: "外观符合个人审美",
    patterns: [
      /(?:外观|造型).{0,8}(?:好看|漂亮|颜值高|耐看|设计感)/,
      /颜值(?:要|比较)?高/,
    ],
    category: ConditionCategory.PERSONAL_EXPERIENCE,
    defaultKind: "preference",
    scope: "comparison",
    verificationMode: "self_check",
  },
  {
    concept: "interior_style",
    title: "内饰符合个人审美",
    patterns: [
      /(?:内饰|座舱).{0,8}(?:好看|漂亮|有质感|高级|设计感)/,
    ],
    category: ConditionCategory.PERSONAL_EXPERIENCE,
    defaultKind: "preference",
    scope: "comparison",
    verificationMode: "self_check",
  },
  {
    concept: "surround_view_360",
    title: "配备 360° 全景影像",
    patterns: [/360\s*(?:°|度)?(?:全景)?影像/, /全景影像/],
    category: ConditionCategory.CONFIGURATION,
    defaultKind: "hard",
    scope: "comparison",
    verificationMode: "vehicle_data",
    rule: {
      field: "surround_view_360",
      operator: "eq",
      value: true,
    },
    dataFieldHints: ["surround_view_360"],
  },
  {
    concept: "parking_sensors",
    title: "配备倒车雷达",
    patterns: [/(?:倒车|后驻车|前\/后驻车)雷达/],
    category: ConditionCategory.CONFIGURATION,
    defaultKind: "hard",
    scope: "comparison",
    verificationMode: "vehicle_data",
    rule: {
      field: "parking_sensors",
      operator: "exists",
      value: true,
    },
    dataFieldHints: ["parking_sensors"],
  },
  {
    concept: "panoramic_sunroof",
    title: "配备全景天窗",
    patterns: [/全景天窗/],
    category: ConditionCategory.CONFIGURATION,
    defaultKind: "hard",
    scope: "comparison",
    verificationMode: "vehicle_data",
    rule: {
      field: "panoramic_sunroof",
      operator: "exists",
      value: true,
    },
    dataFieldHints: ["panoramic_sunroof"],
  },
  {
    concept: "automatic_parking",
    title: "支持自动泊车",
    patterns: [/(?:自动|辅助)泊车(?:入位)?/],
    category: ConditionCategory.CONFIGURATION,
    defaultKind: "hard",
    scope: "comparison",
    verificationMode: "vehicle_data",
    rule: {
      field: "automatic_parking",
      operator: "eq",
      value: true,
    },
    dataFieldHints: ["automatic_parking"],
  },
  {
    concept: "airbag_configuration",
    title: "配备安全气囊",
    patterns: [/(?:安全)?气囊(?:数量|配置)?/],
    category: ConditionCategory.SAFETY,
    defaultKind: "hard",
    scope: "comparison",
    verificationMode: "vehicle_data",
    rule: {
      field: "airbag_configuration",
      operator: "exists",
      value: true,
    },
    dataFieldHints: ["airbag_configuration"],
  },
  {
    concept: "safety_quality",
    title: "重视整车安全表现",
    patterns: [/(?:安全性|安全表现|碰撞安全)(?:要|比较|足够)?(?:好|高|可靠)?/],
    category: ConditionCategory.SAFETY,
    defaultKind: "preference",
    scope: "comparison",
    verificationMode: "web_research",
    dataFieldHints: [
      "active_braking",
      "lane_centering",
      "airbag_configuration",
    ],
  },
  {
    concept: "ride_comfort",
    title: "重视行驶平稳与舒适",
    patterns: [
      /(?:驾驶|行驶|开起来)(?:感受|质感|表现)?(?:平稳|舒适|不晕车)/,
    ],
    category: ConditionCategory.PERSONAL_EXPERIENCE,
    defaultKind: "preference",
    scope: "comparison",
    verificationMode: "self_check",
  },
  {
    concept: "market_popularity",
    title: "关注市场销量表现",
    patterns: [
      /(?:热销|畅销|销量高|卖得好)(?:款|车型|车)?/,
      /销量(?:表现)?/,
    ],
    category: ConditionCategory.PREFERENCE,
    defaultKind: "preference",
    scope: "comparison",
    verificationMode: "sales_data",
  },
  {
    concept: "owner_reputation",
    title: "关注真实车主口碑",
    patterns: [/(?:车主)?口碑(?:要|比较)?(?:好|高)?/],
    category: ConditionCategory.PREFERENCE,
    defaultKind: "preference",
    scope: "comparison",
    verificationMode: "web_research",
  },
  {
    concept: "resale_value",
    title: "关注保值表现",
    patterns: [/(?:保值率|保值表现)(?:要|比较)?(?:高|好)?/],
    category: ConditionCategory.PREFERENCE,
    defaultKind: "preference",
    scope: "comparison",
    verificationMode: "web_research",
  },
  {
    concept: "exterior_color",
    title: "提供黑色外观",
    patterns: [/黑色(?:的)?(?:外观|车漆|车身|车)/],
    category: ConditionCategory.CONFIGURATION,
    defaultKind: "preference",
    scope: "comparison",
    verificationMode: "vehicle_data",
    rule: {
      field: "exterior_color",
      operator: "includes",
      value: "黑色",
    },
    dataFieldHints: ["exterior_color"],
  },
  {
    concept: "landing_price",
    title: "落地总价不超过预算",
    patterns: [/(?:落地|总价).{0,8}(?:不超过|不高于|以内|接近).{0,5}\d+(?:\.\d+)?\s*万/],
    category: ConditionCategory.BUDGET,
    defaultKind: "hard",
    scope: "transaction",
    verificationMode: "written_confirmation",
    dataFieldHints: ["guide_price_cny"],
  },
  {
    concept: "down_payment",
    title: "首付款符合预算",
    patterns: [/首付.{0,8}(?:不超过|不高于|以内|最多).{0,5}\d+(?:\.\d+)?\s*万/],
    category: ConditionCategory.SALES_WRITTEN,
    defaultKind: "hard",
    scope: "transaction",
    verificationMode: "written_confirmation",
  },
  {
    concept: "monthly_payment",
    title: "月供符合预算",
    patterns: [/月供.{0,8}(?:不超过|不高于|以内|最多).{0,5}\d+(?:\.\d+)?\s*元/],
    category: ConditionCategory.SALES_WRITTEN,
    defaultKind: "hard",
    scope: "transaction",
    verificationMode: "written_confirmation",
  },
  {
    concept: "included_transaction_costs",
    title: "全部必要费用计入总价",
    patterns: [/(?:保险|上牌|购置税|金融服务费).{0,12}(?:计入|包含|算入)(?:总费用|总价|落地价)/],
    category: ConditionCategory.SALES_WRITTEN,
    defaultKind: "hard",
    scope: "transaction",
    verificationMode: "written_confirmation",
  },
  {
    concept: "gifts",
    title: "赠品写入正式报价或订单",
    patterns: [/(?:要|需要|希望|包含)?赠品/],
    category: ConditionCategory.SALES_WRITTEN,
    defaultKind: "preference",
    scope: "transaction",
    verificationMode: "written_confirmation",
  },
];

const SEGMENT_PATTERN = /[^，,。；;\n]+/gu;

function requirementKind(
  sourceText: string,
  fallback: ConditionKind,
): ConditionKind {
  if (/不接受|不能|必须|一定|务必|至少|不超过|不高于|要有|配备/.test(sourceText)) {
    return "hard";
  }
  if (/比较|在意|希望|想要|尽量|关注|最好|偶尔/.test(sourceText)) {
    return "preference";
  }
  return fallback;
}

function uniqueAtoms(atoms: RequirementAtom[]) {
  const seen = new Set<string>();
  return atoms.filter((atom) => {
    const key = `${atom.concept}:${atom.sourceStart}:${atom.sourceEnd}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createRule(
  definition: RequirementDefinition,
  sourceText: string,
): DecisionRule | undefined {
  if (definition.rule) return { ...definition.rule };
  if (definition.concept === "seat_count") {
    const value = Number(sourceText.match(/\d{1,2}/)?.[0]);
    if (Number.isFinite(value)) {
      return {
        field: "seat_count",
        operator: /至少|不少于|不低于/.test(sourceText) ? "gte" : "eq",
        value,
        unit: "座",
      };
    }
  }
  if (definition.concept === "energy_type") {
    const value = sourceText.match(/纯电|增程|插混|混动/)?.[0];
    if (value) {
      return {
        field: "energy_type",
        operator: "includes",
        value,
      };
    }
  }
  return undefined;
}

/**
 * Lossless deterministic extraction:
 * - known concepts become one atomic requirement each;
 * - every meaningful unmatched clause is retained as its own explicit item;
 * - all items keep exact source spans so a model outage cannot erase input.
 */
export function extractRequirementAtoms(need: string): RequirementAtom[] {
  const atoms: RequirementAtom[] = [];
  for (const segmentMatch of need.matchAll(SEGMENT_PATTERN)) {
    const rawSegment = segmentMatch[0];
    const leading = rawSegment.length - rawSegment.trimStart().length;
    const segment = rawSegment.trim();
    if (!segment) continue;
    const segmentStart = (segmentMatch.index ?? 0) + leading;
    let matchedAny = false;

    for (const definition of DEFINITIONS) {
      for (const pattern of definition.patterns) {
        const localMatch = segment.match(pattern);
        if (!localMatch || localMatch.index === undefined) continue;
        matchedAny = true;
        const sourceText = localMatch[0];
        const sourceStart = segmentStart + localMatch.index;
        atoms.push({
          concept: definition.concept,
          title: definition.title,
          sourceText,
          sourceStart,
          sourceEnd: sourceStart + sourceText.length,
          category: definition.category,
          kind: requirementKind(segment, definition.defaultKind),
          scope: definition.scope,
          verificationMode: definition.verificationMode,
          rule: createRule(definition, segment),
          dataFieldHints: [...(definition.dataFieldHints ?? [])],
        });
        break;
      }
    }

    if (!matchedAny) {
      atoms.push({
        concept: "unmapped_user_need",
        title: segment,
        sourceText: segment,
        sourceStart: segmentStart,
        sourceEnd: segmentStart + segment.length,
        category: ConditionCategory.PERSONAL_EXPERIENCE,
        kind: requirementKind(segment, "preference"),
        scope: "comparison",
        verificationMode: "self_check",
        dataFieldHints: [],
      });
    }
  }
  return uniqueAtoms(atoms).sort(
    (left, right) =>
      left.sourceStart - right.sourceStart ||
      left.sourceEnd - right.sourceEnd ||
      left.concept.localeCompare(right.concept),
  );
}

export function requirementVerificationLabel(
  mode: RequirementVerificationMode,
) {
  const labels: Record<RequirementVerificationMode, string> = {
    vehicle_data: "汽车专业数据核验",
    sales_data: "汽车销量数据核验",
    web_research: "公开来源补充核验",
    self_check: "本人试驾或实车确认",
    written_confirmation: "正式报价或订单确认",
    context: "用车场景信息",
  };
  return labels[mode];
}
