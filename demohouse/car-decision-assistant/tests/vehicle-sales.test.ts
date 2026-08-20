import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCityVehicleSalesQuery,
  normalizeVehicleSalesEntity,
  parseCityVehicleSalesPayload,
  queryCityVehicleSalesDataPro,
} from "../lib/vehicle-sales";
import type {
  DataProPayload,
  HarnessCallResult,
} from "../lib/harness";

const capturedAt = "2026-07-27T08:00:00.000Z";

test("builds one explicit city-series query for the last six complete months", () => {
  assert.equal(
    buildCityVehicleSalesQuery(
      "理想 L6",
      "杭州市",
      new Date("2026-07-27T00:00:00.000Z"),
    ),
    "理想 L6 2026年1月至2026年6月在杭州市的城市级月度销量",
  );
});

test("normalizes a sales subject without carrying a China market suffix", () => {
  assert.equal(
    normalizeVehicleSalesEntity("特斯拉中国", "Model Y L"),
    "特斯拉 Model Y L",
  );
  assert.equal(
    normalizeVehicleSalesEntity("智界", "智界 R7"),
    "智界 R7",
  );
});

test("parses the flat L6 vehicle-sales response", () => {
  const parsed = parseCityVehicleSalesPayload(
    {
      code: 0,
      dataset_type: "vehicle_sales",
      items: [
        {
          数据层级: "city",
          年份: "2026",
          月份: "2",
          城市: "杭州市",
          品牌: "理想",
          车系: "理想 L6",
          销量: 130,
        },
        {
          数据层级: "city",
          年份: "2026",
          月份: "1",
          城市: "杭州市",
          品牌: "理想",
          车系: "理想 L6",
          销量: 162,
        },
      ],
    },
    {
      candidateId: "candidate-l6",
      candidateName: "理想 L6",
      city: "杭州",
      capturedAt,
      traceId: "trace-l6",
    },
  );

  assert.equal(parsed.status, "current");
  assert.equal(parsed.series?.statisticLabel, "销量");
  assert.equal(parsed.series?.metricDefinition, "销量");
  assert.deepEqual(
    parsed.series?.points.map(({ monthKey, value }) => ({ monthKey, value })),
    [
      { monthKey: "2026-01", value: 162 },
      { monthKey: "2026-02", value: 130 },
    ],
  );
});

test("parses nested M7 up-registration data and keeps ranks auxiliary", () => {
  const parsed = parseCityVehicleSalesPayload(
    {
      code: 0,
      dataset_type: "vehicle_sales",
      items: [
        {
          查询条件: {
            品牌: "问界",
            车系: "问界M7",
            地域: "杭州市",
            统计周期: "2026-01 至 2026-06",
          },
          统计口径说明: {
            口径: "上牌量（杭州本地新车上牌数据）",
            可用字段: [
              "月份",
              "上牌量",
              "杭州上牌排名",
              "杭州SUV上牌排名",
            ],
          },
          销售数据: [
            {
              月份: "2026-01",
              上牌量: 729,
              杭州上牌排名: 6,
              杭州SUV上牌排名: 6,
            },
            {
              月份: "2026-02",
              上牌量: 342,
              杭州上牌排名: 11,
              杭州SUV上牌排名: 9,
            },
          ],
        },
      ],
    },
    {
      candidateId: "candidate-m7",
      candidateName: "问界 M7",
      city: "杭州市",
      capturedAt,
      traceId: "trace-m7",
    },
  );

  assert.equal(parsed.status, "current");
  assert.equal(parsed.series?.statisticLabel, "上牌量");
  assert.equal(
    parsed.series?.metricDefinition,
    "上牌量（杭州本地新车上牌数据）",
  );
  assert.deepEqual(parsed.auxiliaryFields.sort(), [
    "杭州SUV上牌排名",
    "杭州上牌排名",
  ]);
  assert.equal(parsed.series?.points[0]?.extras?.杭州上牌排名, 6);
});

test("parses observed nested sales rows that identify the month as 年月", () => {
  const parsed = parseCityVehicleSalesPayload(
    {
      code: 0,
      dataset_type: "vehicle_sales",
      items: [
        {
          查询条件: {
            品牌: "问界",
            车系: "问界M7",
            地域: "杭州市",
            时间范围: "2026年1月至2026年6月",
            统计口径: "上牌量",
          },
          销售数据: [
            {
              年月: "2026-01",
              地域: "杭州市",
              上牌量: 729,
              杭州上牌排名: 6,
            },
            {
              年月: "2026-02",
              地域: "杭州市",
              上牌量: 342,
              杭州上牌排名: 11,
            },
          ],
        },
      ],
    },
    {
      candidateId: "candidate-m7-observed",
      candidateName: "问界 M7",
      city: "杭州",
      capturedAt,
      traceId: "trace-m7-observed",
    },
  );

  assert.equal(parsed.status, "current");
  assert.equal(parsed.series?.statisticLabel, "上牌量");
  assert.deepEqual(
    parsed.series?.points.map(({ monthKey, value }) => ({
      monthKey,
      value,
    })),
    [
      { monthKey: "2026-01", value: 729 },
      { monthKey: "2026-02", value: 342 },
    ],
  );
});

test("parses a returned city-sales row that identifies the month as 统计年月", () => {
  const parsed = parseCityVehicleSalesPayload(
    {
      code: 0,
      dataset_type: "vehicle_sales",
      items: [
        {
          查询条件: {
            车系: "轩逸",
            地域: "苏州市",
            统计口径: "上牌量",
          },
          销售数据: [
            {
              统计年月: "2026-06",
              地域: "苏州市",
              车型: "轩逸",
              销量: 200,
            },
          ],
        },
      ],
    },
    {
      candidateId: "candidate-sylphy",
      candidateName: "东风日产 轩逸",
      city: "苏州",
      capturedAt,
    },
  );

  assert.equal(parsed.status, "current");
  assert.equal(parsed.series?.points[0]?.monthKey, "2026-06");
  assert.equal(parsed.series?.points[0]?.value, 200);
});

test("uses query year and month plus a declared generic metric value", () => {
  const parsed = parseCityVehicleSalesPayload(
    {
      code: 0,
      dataset_type: "vehicle_sales",
      items: [
        {
          查询条件: {
            车系: "轩逸",
            地域: "苏州市",
            年份: 2026,
            月份: 3,
          },
          销售数据: [
            {
              统计口径: "上牌量/上险量",
              数值: 233,
            },
          ],
        },
      ],
    },
    {
      candidateId: "candidate-sylphy",
      candidateName: "东风日产 轩逸",
      city: "苏州",
      capturedAt,
    },
  );

  assert.equal(parsed.status, "current");
  assert.equal(parsed.series?.points[0]?.monthKey, "2026-03");
  assert.equal(parsed.series?.points[0]?.value, 233);
  assert.equal(parsed.series?.metricDefinition, "上牌量/上险量");
});

test("parses an official manufacturer retail or delivery response", () => {
  const parsed = parseCityVehicleSalesPayload(
    {
      code: 0,
      dataset_type: "vehicle_sales",
      items: [
        {
          查询条件: {
            统计时间: "2022年12月",
            车型: "比亚迪汉EV",
            地域: "全国",
          },
          销售数据: [
            {
              销量数值: "13438辆",
              统计口径: "厂家零售/交付",
              环比变化: "0.4%",
              上月销量: "13383辆",
              "2022年累计销量": "144665辆",
            },
          ],
        },
      ],
    },
    {
      candidateId: "candidate-han",
      candidateName: "比亚迪汉 EV",
      city: "全国",
      capturedAt,
    },
  );

  assert.equal(parsed.status, "current");
  assert.equal(parsed.series?.statisticLabel, "零售量");
  assert.equal(parsed.series?.metricDefinition, "厂家零售/交付");
  assert.equal(parsed.series?.points[0]?.value, 13438);
});

test("rejects an entity mismatch instead of plotting a borrowed series", () => {
  const parsed = parseCityVehicleSalesPayload(
    {
      code: 0,
      dataset_type: "vehicle_sales",
      items: [
        {
          年份: "2026",
          月份: "1",
          城市: "杭州市",
          车系: "问界 M7",
          销量: 100,
        },
      ],
    },
    {
      candidateId: "candidate-l6",
      candidateName: "理想 L6",
      city: "杭州",
      capturedAt,
    },
  );

  assert.equal(parsed.status, "needs_review");
  assert.equal(parsed.series, null);
  assert.match(parsed.reason ?? "", /主体或地域/);
});

test("rejects a city-series result that omits its city or series identity", () => {
  const parsed = parseCityVehicleSalesPayload(
    {
      code: 0,
      dataset_type: "vehicle_sales",
      items: [
        { 年份: "2026", 月份: "1", 销量: 100 },
        { 年份: "2026", 月份: "2", 销量: 120 },
      ],
    },
    {
      candidateId: "candidate-l6",
      candidateName: "理想 L6",
      city: "杭州",
      capturedAt,
    },
  );

  assert.equal(parsed.status, "needs_review");
  assert.equal(parsed.series, null);
  assert.match(parsed.reason ?? "", /缺少城市或车系标识/);
});

test("keeps valid returned months when coverage is incomplete", () => {
  const parsed = parseCityVehicleSalesPayload(
    {
      code: 0,
      dataset_type: "vehicle_sales",
      coverage_complete: false,
      items: [
        { 年份: "2026", 月份: "1", 城市: "杭州市", 车系: "理想 L6", 销量: 100 },
      ],
    },
    {
      candidateId: "candidate-l6",
      candidateName: "理想 L6",
      city: "杭州",
      capturedAt,
    },
  );

  assert.equal(parsed.status, "current");
  assert.equal(parsed.series?.points.length, 1);
  assert.match(parsed.reason ?? "", /1\/6/);
});

test("accepts a complete city-level result whose rows omit the repeated city name", () => {
  const parsed = parseCityVehicleSalesPayload(
    {
      code: 0,
      dataset_type: "vehicle_sales",
      coverage_complete: true,
      missing_entities: [],
      items: [
        {
          数据层级: "city",
          年份: "2026",
          月份: "1",
          车系: "智界R7",
          销量: 122,
        },
      ],
    },
    {
      candidateId: "candidate-r7",
      candidateName: "智界 R7",
      city: "苏州",
      capturedAt,
    },
  );

  assert.equal(parsed.status, "current");
  assert.equal(parsed.series?.city, "苏州市");
  assert.equal(parsed.series?.points[0]?.value, 122);
});

test("rejects duplicate values for the same city-series month", () => {
  const parsed = parseCityVehicleSalesPayload(
    {
      code: 0,
      dataset_type: "vehicle_sales",
      items: [
        { 年份: "2026", 月份: "1", 城市: "杭州市", 车系: "理想 L6", 销量: 100 },
        { 年份: "2026", 月份: "1", 城市: "杭州市", 车系: "理想 L6", 销量: 120 },
      ],
    },
    {
      candidateId: "candidate-l6",
      candidateName: "理想 L6",
      city: "杭州",
      capturedAt,
    },
  );

  assert.equal(parsed.status, "needs_review");
  assert.match(parsed.reason ?? "", /同一月份返回了多条/);
});

function okResult(
  data: DataProPayload,
  index: number,
): HarnessCallResult<DataProPayload> {
  return {
    service: "datapro",
    status: "ok",
    data,
    error: null,
    meta: {
      request_id: `request-${index}`,
      requested_at: capturedAt,
      received_at: capturedAt,
      upstream_request_id: null,
      trace_id: `trace-${index}`,
      log_id: null,
    },
  };
}

test("fills range-query gaps with month queries and returns all available months", async () => {
  const responses = [
    okResult(
      {
        code: 0,
        dataset_type: "vehicle_sales",
        coverage_complete: false,
        items: [
          {
            数据层级: "city",
            年份: "2026",
            月份: "1",
            城市: "苏州市",
            车系: "特斯拉 Model Y L",
            销量: 26,
          },
          {
            数据层级: "city",
            年份: "2026",
            月份: "6",
            城市: "苏州市",
            车系: "特斯拉 Model Y L",
            销量: 162,
          },
        ],
      },
      0,
    ),
    ...[2, 3, 4, 5].map((month, index) =>
      okResult(
        {
          code: 0,
          dataset_type: "vehicle_sales",
          coverage_complete: true,
          missing_entities: [],
          items: [
            {
              数据层级: "city",
              年份: "2026",
              月份: String(month),
              车系: "特斯拉 Model Y L",
              销量: 100 + month,
            },
          ],
        },
        index + 1,
      ),
    ),
  ];
  let callIndex = 0;
  const result = await queryCityVehicleSalesDataPro(
    "candidate-model-y-l",
    "特斯拉 Model Y L",
    "苏州",
    {
      now: new Date("2026-07-30T00:00:00.000Z"),
      client: {
        async query() {
          return responses[callIndex++];
        },
      },
    },
  );

  assert.equal(result.queries.length, 5);
  assert.equal(result.parsed.status, "current");
  assert.deepEqual(
    result.parsed.series?.points.map(({ monthKey }) => monthKey),
    [
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
    ],
  );
  assert.equal(result.parsed.reason, null);
});

test("merges a month fallback when the field name changes but the statistic definition matches", async () => {
  const responses = [
    okResult(
      {
        code: 0,
        dataset_type: "vehicle_sales",
        items: [
          {
            统计年月: "2026-01",
            城市: "苏州市",
            车型: "轩逸",
            上牌量: 314,
            统计口径: "上牌量",
          },
        ],
      },
      0,
    ),
    ...[2, 3, 4, 5, 6].map((month, index) =>
      okResult(
        {
          code: 0,
          dataset_type: "vehicle_sales",
          items: [
            {
              统计年月: `2026-${String(month).padStart(2, "0")}`,
              城市: "苏州市",
              车型: "轩逸",
              销量: 100 + month,
              统计口径: "上牌量",
            },
          ],
        },
        index + 1,
      ),
    ),
  ];
  let callIndex = 0;
  const result = await queryCityVehicleSalesDataPro(
    "candidate-sylphy",
    "东风日产 轩逸",
    "苏州",
    {
      now: new Date("2026-07-30T00:00:00.000Z"),
      client: {
        async query() {
          return responses[callIndex++];
        },
      },
    },
  );

  assert.equal(result.parsed.status, "current");
  assert.equal(result.parsed.series?.statisticLabel, "上牌量");
  assert.equal(result.parsed.series?.points.length, 6);
  assert.equal(result.parsed.series?.points.at(-1)?.value, 106);
});

test("tries an alternate single-month query when a successful response has no usable row", async () => {
  const responses = [
    okResult(
      {
        code: 0,
        dataset_type: "vehicle_sales",
        items: [1, 2, 3, 4, 5].map((month) => ({
          年份: "2026",
          月份: String(month),
          城市: "苏州市",
          车系: "轩逸",
          上牌量: 100 + month,
          统计口径: "上牌量",
        })),
      },
      0,
    ),
    okResult(
      {
        code: 0,
        dataset_type: "vehicle_sales",
        items: [],
      },
      1,
    ),
    okResult(
      {
        code: 0,
        dataset_type: "vehicle_sales",
        items: [
          {
            统计年月: "2026-06",
            城市: "苏州市",
            车型: "轩逸",
            销量: 200,
            统计口径: "上牌量",
          },
        ],
      },
      2,
    ),
  ];
  let callIndex = 0;
  const result = await queryCityVehicleSalesDataPro(
    "candidate-sylphy",
    "东风日产 轩逸",
    "苏州",
    {
      now: new Date("2026-07-30T00:00:00.000Z"),
      client: {
        async query() {
          return responses[callIndex++];
        },
      },
    },
  );

  assert.equal(result.queries.length, 3);
  assert.equal(result.parsed.series?.points.length, 6);
  assert.equal(result.parsed.series?.points.at(-1)?.value, 200);
});
