import {
  createDataProClient,
  retryHarnessCall,
} from "./harness";
import type {
  DataProPayload,
  HarnessCallResult,
} from "./harness";
import type {
  CitySalesPoint,
  CitySalesSeries,
} from "./decision";

const PRIMARY_METRIC_HINT =
  /(销量(?:数值)?|上牌量|交付量|零售量|批发量|注册量|终端量|出口量|销售量|成交量)$/;
const AUXILIARY_METRIC_HINT =
  /(排名|环比|同比|累计|上月|占比|份额|增幅|增长率|变化|合计)/;
const MAX_SERIES_MONTHS = 6;

type RecordValue = Record<string, unknown>;

type DataProQueryClient = {
  query(query: string): Promise<HarnessCallResult<DataProPayload>>;
};

export interface ParsedCityVehicleSeries {
  status: "current" | "needs_review" | "unavailable";
  series: CitySalesSeries | null;
  reason: string | null;
  auxiliaryFields: string[];
}

export interface CityVehicleSalesQueryResult {
  result: HarnessCallResult<DataProPayload>;
  results: HarnessCallResult<DataProPayload>[];
  parsed: ParsedCityVehicleSeries;
  query: string;
  queries: string[];
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedText(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, "").toLowerCase()
    : "";
}

function optionalText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") return null;
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function monthKey(value: unknown): string | null {
  const text = optionalText(value);
  if (!text) return null;
  const match = text.match(/(20\d{2})\D{0,3}(1[0-2]|0?[1-9])/);
  if (!match) return null;
  return `${match[1]}-${String(Number(match[2])).padStart(2, "0")}`;
}

function rowMonth(
  row: RecordValue,
  fallbackYear?: unknown,
  fallbackMonth?: unknown,
): string | null {
  const direct =
    monthKey(row.年月) ??
    monthKey(row.统计年月) ??
    monthKey(row.月份) ??
    monthKey(row.统计时间) ??
    monthKey(row.统计月份) ??
    monthKey(row.month) ??
    monthKey(fallbackMonth);
  if (direct) return direct;
  const year = optionalText(row.年份 ?? fallbackYear);
  const month = optionalText(row.月份 ?? row.month ?? fallbackMonth);
  if (!year || !month || !/^20\d{2}$/.test(year)) return null;
  const monthNumber = Number(month);
  if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    return null;
  }
  return `${year}-${String(monthNumber).padStart(2, "0")}`;
}

function displayMonth(key: string): string {
  return `${Number(key.slice(5, 7))}月`;
}

function completeMonthKeys(now = new Date()): string[] {
  const lastCompleteMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0),
  );
  return Array.from({ length: MAX_SERIES_MONTHS }, (_, index) => {
    const date = new Date(
      Date.UTC(
        lastCompleteMonth.getUTCFullYear(),
        lastCompleteMonth.getUTCMonth() - (MAX_SERIES_MONTHS - 1 - index),
        1,
      ),
    );
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
      2,
      "0",
    )}`;
  });
}

function queryMonthText(key: string): string {
  return `${key.slice(0, 4)}年${Number(key.slice(5, 7))}月`;
}

function normalizedCityName(city: string): string {
  return /市$/.test(city.trim()) ? city.trim() : `${city.trim()}市`;
}

export function normalizeVehicleSalesEntity(
  manufacturer: string,
  series: string,
): string {
  const normalizedManufacturer = manufacturer
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/中国/g, "")
    .replace(/汽车$/g, "")
    .trim();
  const normalizedSeries = series.trim();
  if (!normalizedManufacturer) return normalizedSeries;
  if (!normalizedSeries) return normalizedManufacturer;
  if (
    normalizedText(normalizedSeries).includes(
      normalizedText(normalizedManufacturer),
    )
  ) {
    return normalizedSeries;
  }
  return `${normalizedManufacturer} ${normalizedSeries}`;
}

function metricCandidates(row: RecordValue): string[] {
  return Object.entries(row)
    .filter(([key, value]) => {
      if (AUXILIARY_METRIC_HINT.test(key)) return false;
      if (numericValue(value) === null) return false;
      if (/^(年份|月份|月|year|month)$/i.test(key)) return false;
      return PRIMARY_METRIC_HINT.test(key) || /量$/.test(key);
    })
    .map(([key]) => key);
}

function nestedObjects(value: unknown, output: RecordValue[] = []): RecordValue[] {
  if (Array.isArray(value)) {
    value.forEach((item) => nestedObjects(item, output));
    return output;
  }
  if (!isRecord(value)) return output;
  output.push(value);
  Object.values(value).forEach((item) => nestedObjects(item, output));
  return output;
}

function findTextByKeys(
  value: unknown,
  keys: RegExp,
): string | null {
  for (const item of nestedObjects(value)) {
    for (const [key, nested] of Object.entries(item)) {
      if (!keys.test(key)) continue;
      const text = optionalText(nested);
      if (text) return text;
    }
  }
  return null;
}

function allRows(payload: DataProPayload): RecordValue[] {
  const rows: RecordValue[] = [];
  const items = Array.isArray(payload.items) ? payload.items : [];
  for (const item of items) {
    if (!isRecord(item)) continue;
    const nestedSales =
      (Array.isArray(item.销售数据) && item.销售数据) ||
      (Array.isArray(item.销量数据) && item.销量数据) ||
      (Array.isArray(item.月度数据) && item.月度数据);
    if (nestedSales) {
      for (const row of nestedSales) {
        if (isRecord(row)) rows.push(row);
      }
      continue;
    }
    rows.push(item);
  }
  return rows;
}

function explicitMetricFields(payload: DataProPayload): string[] {
  for (const object of nestedObjects(payload)) {
    const fields = object.可用字段;
    if (!Array.isArray(fields)) continue;
    return fields.filter(
      (field): field is string =>
        typeof field === "string" &&
        !AUXILIARY_METRIC_HINT.test(field) &&
        (PRIMARY_METRIC_HINT.test(field) || /量$/.test(field)),
    );
  }
  return [];
}

function chooseMetricKey(
  payload: DataProPayload,
  rows: RecordValue[],
): { key: string | null; auxiliaryFields: string[] } {
  const explicit = explicitMetricFields(payload);
  const candidateCounts = new Map<string, number>();
  const auxiliary = new Set<string>();
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (numericValue(value) === null) continue;
      if (AUXILIARY_METRIC_HINT.test(key)) auxiliary.add(key);
    }
    for (const key of metricCandidates(row)) {
      candidateCounts.set(key, (candidateCounts.get(key) ?? 0) + 1);
    }
  }
  const declaredMetric = findTextByKeys(payload, /^(口径|统计口径)$/);
  if (
    declaredMetric &&
    /(销量|上牌量|上险量|注册量|交付量|零售量|批发量|销售量|成交量)/.test(
      declaredMetric,
    )
  ) {
    const genericValueCount = rows.filter(
      (row) => numericValue(row.数值) !== null,
    ).length;
    if (genericValueCount) candidateCounts.set("数值", genericValueCount);
  }
  const ranked = [...candidateCounts.entries()]
    .filter(([, count]) => count > 0)
    .sort((left, right) => {
      const explicitLeft = explicit.indexOf(left[0]);
      const explicitRight = explicit.indexOf(right[0]);
      if (explicitLeft >= 0 || explicitRight >= 0) {
        if (explicitLeft < 0) return 1;
        if (explicitRight < 0) return -1;
        if (explicitLeft !== explicitRight) return explicitLeft - explicitRight;
      }
      const preferredLeft = PRIMARY_METRIC_HINT.test(left[0]) ? 1 : 0;
      const preferredRight = PRIMARY_METRIC_HINT.test(right[0]) ? 1 : 0;
      if (preferredLeft !== preferredRight) return preferredRight - preferredLeft;
      return right[1] - left[1] || left[0].localeCompare(right[0], "zh-CN");
    });
  return {
    key: ranked[0]?.[0] ?? null,
    auxiliaryFields: [...auxiliary],
  };
}

function extractContext(payload: DataProPayload, key: RegExp): string | null {
  return findTextByKeys(payload, key);
}

function recordContextValues(
  payload: DataProPayload,
  rows: RecordValue[],
  key: RegExp,
): string[] {
  const values = new Set<string>();
  const payloadValue = extractContext(payload, key);
  if (payloadValue) values.add(payloadValue);
  for (const row of rows) {
    for (const [field, value] of Object.entries(row)) {
      if (!key.test(field)) continue;
      const text = optionalText(value);
      if (text) values.add(text);
    }
  }
  return [...values];
}

function contextMatches(actual: string | null, expected: string): boolean {
  if (!actual) return false;
  const left = normalizedText(actual).replace(/[市省区县]$/, "");
  const right = normalizedText(expected).replace(/[市省区县]$/, "");
  return Boolean(left && right && (left.includes(right) || right.includes(left)));
}

function payloadBusinessSucceeded(payload: DataProPayload): boolean {
  if (!Object.hasOwn(payload, "code")) return true;
  return payload.code === 0 || payload.code === "0";
}

function periodLabel(points: CitySalesPoint[]): string {
  if (!points.length) return "";
  const months = points
    .map((point) => point.monthKey)
    .filter((value): value is string => Boolean(value));
  if (!months.length) return `最近 ${points.length} 个月`;
  const start = months[0];
  const end = months.at(-1)!;
  return start === end
    ? `${start.slice(0, 4)}年${Number(start.slice(5, 7))}月`
    : `${start.slice(0, 4)}年${Number(start.slice(5, 7))}月—${end.slice(0, 4)}年${Number(end.slice(5, 7))}月`;
}

function comparableMetricIdentity(series: CitySalesSeries): string {
  const definition = normalizedText(series.metricDefinition);
  if (/上牌|注册/.test(definition)) return "registration";
  if (/零售/.test(definition)) return "retail";
  if (/批发/.test(definition)) return "wholesale";
  if (/交付/.test(definition)) return "delivery";
  return normalizedText(series.statisticLabel);
}

function canonicalMetricLabel(metricKey: string, metricDefinition: string): string {
  const definition = normalizedText(metricDefinition);
  if (/上牌/.test(definition)) return "上牌量";
  if (/上险|注册/.test(definition)) return "注册量";
  if (/零售/.test(definition)) return "零售量";
  if (/批发/.test(definition)) return "批发量";
  if (/交付/.test(definition)) return "交付量";
  return metricKey;
}

export function buildCityVehicleSalesQuery(
  candidateName: string,
  city: string,
  now = new Date(),
): string {
  const months = completeMonthKeys(now);
  return `${candidateName.trim()} ${queryMonthText(months[0])}至${queryMonthText(
    months.at(-1)!,
  )}在${normalizedCityName(
    city,
  )}的城市级月度销量`;
}

export function buildCityVehicleSalesMonthQuery(
  candidateName: string,
  city: string,
  month: string,
): string {
  return `${candidateName.trim()} ${queryMonthText(month)}在${normalizedCityName(
    city,
  )}的城市级月度销量`;
}

function buildCityVehicleSalesMonthQueries(
  candidateName: string,
  city: string,
  month: string,
): string[] {
  const candidate = candidateName.trim();
  const monthText = queryMonthText(month);
  const cityName = normalizedCityName(city);
  return [
    buildCityVehicleSalesMonthQuery(candidateName, city, month),
    `${candidate} ${monthText} ${cityName}城市级销量`,
    `${candidate} ${monthText}在${cityName}的销量（城市级）`,
  ];
}

export function parseCityVehicleSalesPayload(
  payload: DataProPayload | null,
  options: {
    candidateId: string;
    candidateName: string;
    city: string;
    capturedAt: string;
    evidenceId?: string;
    requestId?: string | null;
    traceId?: string | null;
  },
): ParsedCityVehicleSeries {
  if (!payload || !payloadBusinessSucceeded(payload)) {
    return {
      status: "unavailable",
      series: null,
      reason: "专业数据查询未成功",
      auxiliaryFields: [],
    };
  }
  if (payload.dataset_type !== "vehicle_sales") {
    return {
      status: "needs_review",
      series: null,
      reason: "返回结果不是汽车车系销量数据集",
      auxiliaryFields: [],
    };
  }
  const rows = allRows(payload);
  if (!rows.length) {
    return {
      status: "unavailable",
      series: null,
      reason: "专业数据没有返回月度记录",
      auxiliaryFields: [],
    };
  }
  const { key: metricKey, auxiliaryFields } = chooseMetricKey(payload, rows);
  if (!metricKey) {
    return {
      status: "needs_review",
      series: null,
      reason: "无法唯一识别月度核心数值字段",
      auxiliaryFields,
    };
  }

  const fallbackYear = findTextByKeys(payload, /^年份$/);
  const fallbackMonth = findTextByKeys(
    payload,
    /^(统计时间|统计月份|统计周期|统计年月|月份|月)$/,
  );
  const returnedCities = recordContextValues(payload, rows, /^(城市|地域)$/);
  const returnedSeriesValues = recordContextValues(
    payload,
    rows,
    /^(车系|车型)$/,
  );
  const returnedDataLevels = recordContextValues(
    payload,
    rows,
    /^(数据层级|统计层级)$/,
  );
  const missingEntities = Array.isArray(payload.missing_entities)
    ? payload.missing_entities.filter(
        (item): item is string => typeof item === "string" && Boolean(item.trim()),
      )
    : [];
  const canUseRequestedCityScope =
    !returnedCities.length &&
    payload.coverage_complete === true &&
    !missingEntities.length &&
    returnedDataLevels.length > 0 &&
    returnedDataLevels.every((level) => /^(city|城市|地级)/i.test(level.trim()));
  if (
    (!returnedCities.length && !canUseRequestedCityScope) ||
    !returnedSeriesValues.length
  ) {
    return {
      status: "needs_review",
      series: null,
      reason: "返回缺少城市或车系标识，无法作为城市车系趋势展示",
      auxiliaryFields,
    };
  }
  if (
    (returnedCities.length > 0 &&
      returnedCities.some((value) => !contextMatches(value, options.city))) ||
    returnedSeriesValues.some(
      (value) => !contextMatches(value, options.candidateName),
    )
  ) {
    return {
      status: "needs_review",
      series: null,
      reason: "返回主体或地域与请求不一致",
      auxiliaryFields,
    };
  }

  const pointsByMonth = new Map<string, CitySalesPoint>();
  for (const row of rows) {
    const month = rowMonth(row, fallbackYear, fallbackMonth);
    const value = numericValue(row[metricKey]);
    if (!month || value === null || value < 0) continue;
    const extras = Object.fromEntries(
      Object.entries(row).filter(
        ([key, nested]) =>
          key !== metricKey &&
          key !== "年月" &&
          key !== "统计年月" &&
          key !== "月份" &&
          key !== "年份" &&
          numericValue(nested) !== null,
      ),
    );
    if (pointsByMonth.has(month)) {
      return {
        status: "needs_review",
        series: null,
        reason: `同一月份返回了多条“${metricKey}”记录，无法确认应展示哪一条`,
        auxiliaryFields,
      };
    }
    pointsByMonth.set(month, {
      month: displayMonth(month),
      monthKey: month,
      value,
      extras,
    });
  }
  const points = [...pointsByMonth.values()]
    .sort((left, right) =>
      String(left.monthKey).localeCompare(String(right.monthKey)),
    )
    .slice(-MAX_SERIES_MONTHS);
  if (!points.length) {
    return {
      status: "needs_review",
      series: null,
      reason: `识别到“${metricKey}”，但没有可用的月份与数值`,
      auxiliaryFields,
    };
  }

  const metricDefinition =
    extractContext(payload, /^(口径|统计口径)$/) ?? metricKey;
  const statisticLabel = canonicalMetricLabel(metricKey, metricDefinition);
  const datasetType = optionalText(payload.dataset_type) ?? "vehicle_sales";
  const returnedCity = returnedCities[0] ?? normalizedCityName(options.city);
  const incompleteReason =
    payload.coverage_complete === false || points.length < MAX_SERIES_MONTHS
      ? `专业数据本次返回 ${points.length}/${MAX_SERIES_MONTHS} 个可用月份`
      : null;
  return {
    status: "current",
    reason: incompleteReason,
    auxiliaryFields,
    series: {
      id: `city-series-${options.candidateId}-${points.at(-1)?.monthKey ?? "latest"}`,
      candidateId: options.candidateId,
      city: returnedCity,
      series: returnedSeriesValues[0],
      periodLabel: periodLabel(points),
      statisticLabel,
      metricKey,
      metricDefinition,
      unit: "辆",
      dataLevel: extractContext(payload, /^(数据层级|统计层级)$/) ?? "city",
      datasetType,
      requestId: options.requestId ?? undefined,
      traceId: options.traceId ?? undefined,
      points,
      capturedAt: options.capturedAt,
      evidenceId: options.evidenceId,
    },
  };
}

function mergeParsedCityVehicleSeries(
  parsedResults: ParsedCityVehicleSeries[],
  expectedMonths: string[],
): ParsedCityVehicleSeries {
  const usable = parsedResults.filter(
    (
      item,
    ): item is ParsedCityVehicleSeries & {
      series: CitySalesSeries;
    } => item.status === "current" && Boolean(item.series),
  );
  if (!usable.length) {
    return (
      parsedResults.find((item) => item.status === "needs_review") ??
      parsedResults[0] ?? {
        status: "unavailable",
        series: null,
        reason: "专业数据没有返回可核验的城市车系月份",
        auxiliaryFields: [],
      }
    );
  }

  const base = [...usable].sort(
    (left, right) => right.series.points.length - left.series.points.length,
  )[0];
  const pointsByMonth = new Map(
    base.series.points.map((point) => [point.monthKey ?? point.month, point]),
  );
  const auxiliaryFields = new Set(base.auxiliaryFields);
  for (const item of usable) {
    item.auxiliaryFields.forEach((field) => auxiliaryFields.add(field));
    if (
      !contextMatches(item.series.city, base.series.city) ||
      !contextMatches(item.series.series, base.series.series) ||
      comparableMetricIdentity(item.series) !==
        comparableMetricIdentity(base.series)
    ) {
      continue;
    }
    for (const point of item.series.points) {
      const key = point.monthKey ?? point.month;
      if (!pointsByMonth.has(key)) pointsByMonth.set(key, point);
    }
  }
  const points = [...pointsByMonth.values()]
    .filter((point) => expectedMonths.includes(point.monthKey ?? point.month))
    .sort((left, right) =>
      String(left.monthKey ?? left.month).localeCompare(
        String(right.monthKey ?? right.month),
      ),
    )
    .slice(-MAX_SERIES_MONTHS);
  return {
    status: "current",
    reason:
      points.length < expectedMonths.length
        ? `专业数据本次返回 ${points.length}/${expectedMonths.length} 个可用月份；其余月份未返回可核验记录`
        : null,
    auxiliaryFields: [...auxiliaryFields],
    series: {
      ...base.series,
      id: `city-series-${base.series.candidateId}-${points.at(-1)?.monthKey ?? "latest"}`,
      periodLabel: periodLabel(points),
      points,
      capturedAt:
        usable
          .map((item) => item.series.capturedAt)
          .sort()
          .at(-1) ?? base.series.capturedAt,
    },
  };
}

export async function queryCityVehicleSalesDataPro(
  candidateId: string,
  candidateName: string,
  city: string,
  options: {
    evidenceId?: string;
    now?: Date;
    client?: DataProQueryClient;
  } = {},
): Promise<CityVehicleSalesQueryResult> {
  const now = options.now ?? new Date();
  const expectedMonths = completeMonthKeys(now);
  const query = buildCityVehicleSalesQuery(candidateName, city, now);
  const client =
    options.client ?? createDataProClient({ timeoutMs: 45_000 });
  const result = await retryHarnessCall(() => client.query(query));
  const results = [result];
  const queries = [query];
  const parsedResults = [
    parseCityVehicleSalesPayload(
      result.status === "ok" ? result.data : null,
      {
        candidateId,
        candidateName,
        city,
        capturedAt: result.meta.received_at,
        evidenceId: options.evidenceId,
        requestId: result.meta.request_id,
        traceId: result.meta.trace_id,
      },
    ),
  ];
  const returnedMonths = new Set(
    parsedResults[0].series?.points.map(
      (point) => point.monthKey ?? point.month,
    ) ?? [],
  );
  const missingMonths = expectedMonths.filter(
    (month) => !returnedMonths.has(month),
  );
  if (missingMonths.length) {
    const monthAttempts = await Promise.all(
      missingMonths.map(async (month) => {
        const attemptedQueries: string[] = [];
        const attemptedResults: HarnessCallResult<DataProPayload>[] = [];
        const attemptedParsed: ParsedCityVehicleSeries[] = [];
        for (const monthQuery of buildCityVehicleSalesMonthQueries(
          candidateName,
          city,
          month,
        )) {
          const monthResult = await retryHarnessCall(() =>
            client.query(monthQuery),
          );
          const parsed = parseCityVehicleSalesPayload(
            monthResult.status === "ok" ? monthResult.data : null,
            {
              candidateId,
              candidateName,
              city,
              capturedAt: monthResult.meta.received_at,
              evidenceId: options.evidenceId,
              requestId: monthResult.meta.request_id,
              traceId: monthResult.meta.trace_id,
            },
          );
          attemptedQueries.push(monthQuery);
          attemptedResults.push(monthResult);
          attemptedParsed.push(parsed);
          if (
            parsed.status === "current" &&
            parsed.series?.points.some(
              (point) => (point.monthKey ?? point.month) === month,
            )
          ) {
            break;
          }
        }
        return {
          attemptedQueries,
          attemptedResults,
          attemptedParsed,
        };
      }),
    );
    for (const attempt of monthAttempts) {
      queries.push(...attempt.attemptedQueries);
      results.push(...attempt.attemptedResults);
      parsedResults.push(...attempt.attemptedParsed);
    }
  }
  return {
    result,
    results,
    query,
    queries,
    parsed: mergeParsedCityVehicleSeries(parsedResults, expectedMonths),
  };
}
