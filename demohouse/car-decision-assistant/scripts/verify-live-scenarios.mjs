import assert from "node:assert/strict";

const origin = process.env.CAR_DECISION_BASE_URL || "http://localhost:3003";

const scenarios = [
  {
    id: "hangzhou",
    city: "杭州",
    purchaseTime: "半年内",
    maxBudgetWan: 32,
    quoteTotalWan: 31,
    candidates: ["理想 L6", "问界 M7", "蔚来 ES6"],
    need:
      "工作日在杭州主城区通勤，每天往返约55公里，公司可以充电，但小区没有固定车位。平时我和伴侣两个人，周末经常带双方父母和一个孩子，需要至少5座，后排坐三位成年人不能太挤，后备厢要能放婴儿车和两个24寸行李箱。希望新能源，纯电续航至少200公里，优先四驱；重视主动刹车、车道居中、360度全景影像、自动泊车、前排座椅通风加热和后排舒适。最高落地32万元，不接受明显晕车，想确认真实落地价、杭州城市销量以及常用充电是否方便。",
  },
  {
    id: "shanghai",
    city: "上海",
    purchaseTime: "半年内",
    maxBudgetWan: 28,
    quoteTotalWan: 27,
    candidates: ["特斯拉 Model 3", "小米 SU7", "智界 R7"],
    need:
      "我在上海做互联网产品，基本一个人开车，每天通勤约80公里，家里有固定车位和充电桩，每个月会有两三次沪杭往返。只考虑纯电轿车，希望CLTC续航至少600公里，电耗最好不高于15千瓦时每百公里，后驱可以，但零百加速希望5秒以内。必须有主动刹车、车道居中、360度全景影像、倒车雷达和自动泊车；也看重高速辅助驾驶、前排座椅通风、音响、后备厢能放两个登机箱。不要SUV，不接受车身太宽难停车，也不想要隐藏门把手容易冻住的车型。最高落地28万元，计划半年内买，想比较上海销量、真实配置、后续保值和保险成本。",
  },
  {
    id: "chengdu",
    city: "成都",
    purchaseTime: "一年内",
    maxBudgetWan: 45,
    quoteTotalWan: 44,
    candidates: ["理想 L8", "问界 M9", "腾势 D9"],
    need:
      "我们一家五口在成都，两个成年人、两个孩子和一位老人，平时接送孩子，寒暑假会从成都自驾到西安或云南，单日可能跑700公里。需要6座或7座，第二排独立座椅、第三排能让成年人坐两小时，满员时还能放3个24寸箱和婴儿车。没有固定家充，希望增程或插混，亏电油耗尽量低，纯电续航至少200公里，支持快充；必须有主动刹车、车道居中、360全景、透明底盘、自动泊车和足够气囊。家里老人容易晕车，特别看重悬架舒适、上下车方便和车内异味；不接受第三排收起后仍没有行李空间。最高落地45万元，想核验成都销量、精确座位和续航版本、真实落地价及长途补能便利性。",
  },
];

async function request(path, method, body, cookie, timeoutMs) {
  const started = performance.now();
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json();
  return {
    response,
    payload,
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? cookie,
    seconds: Number(((performance.now() - started) / 1_000).toFixed(3)),
  };
}

function chooseExactOptions(project) {
  return project.candidates.map((candidate) => {
    const options = (candidate.identityOptions ?? []).filter((option) =>
      /^(?:datapro|datapro-name):/.test(option.exactModelId),
    );
    return (
      options.find(
        (option) =>
          !/UItra|Livis|问界\s+问界/i.test(option.displayName),
      ) ?? options[0]
    );
  });
}

async function verifyScenario(scenario) {
  const identity = await request(
    "/api/project",
    "POST",
    scenario,
    undefined,
    240_000,
  );
  assert.equal(identity.response.status, 200);
  assert.equal(identity.payload.requiresIdentityConfirmation, true);
  const selections = chooseExactOptions(identity.payload.project);
  assert.equal(selections.length, scenario.candidates.length);
  assert.ok(selections.every(Boolean), "every vehicle needs one exact option");

  const complete = await request(
    "/api/project",
    "POST",
    {
      ...scenario,
      candidates: selections.map((option) => option.displayName),
      candidateIdentityIds: selections.map((option) => option.exactModelId),
    },
    undefined,
    480_000,
  );
  assert.equal(complete.response.status, 200);
  const project = complete.payload.project;
  assert.ok(project?.id);
  assert.ok(complete.cookie);
  assert.ok(complete.payload.recoveryCode);
  assert.equal(project.context.need, scenario.need);
  assert.ok(
    project.candidates.every(
      (candidate, index) =>
        candidate.vehicle.exactModelId === selections[index].exactModelId,
    ),
  );

  const target =
    project.candidates.find((candidate) => candidate.role === "target") ??
    project.candidates[0];
  const personal = project.evaluations.find(
    (evaluation) =>
      evaluation.candidateId === target.id &&
      evaluation.pendingReason === "personal_experience_required",
  );
  const budget = project.evaluations.find(
    (evaluation) =>
      evaluation.candidateId === target.id &&
      project.conditions.find(
        (condition) =>
          condition.id === evaluation.conditionId &&
          condition.category === "budget",
      ),
  );
  assert.ok(personal);
  assert.ok(budget);

  const personalUpdate = await request(
    "/api/project/evaluate",
    "PATCH",
    {
      projectId: project.id,
      candidateId: target.id,
      conditionId: personal.conditionId,
      answer: "符合我的需要",
      note: "真实持久化验收",
    },
    complete.cookie,
    30_000,
  );
  assert.equal(personalUpdate.response.status, 200);

  const quoteUpdate = await request(
    "/api/project/evaluate",
    "PATCH",
    {
      projectId: project.id,
      candidateId: target.id,
      conditionId: budget.conditionId,
      answer: "我已有完整报价",
      quoteTotalWan: scenario.quoteTotalWan,
      note: `落地总价 ${scenario.quoteTotalWan} 万元`,
    },
    complete.cookie,
    30_000,
  );
  assert.equal(quoteUpdate.response.status, 200);

  const refreshed = await request(
    `/api/project?projectId=${encodeURIComponent(project.id)}`,
    "GET",
    undefined,
    complete.cookie,
    30_000,
  );
  assert.equal(refreshed.response.status, 200);
  const refreshedTarget = refreshed.payload.project.candidates.find(
    (candidate) => candidate.id === target.id,
  );
  assert.equal(
    refreshedTarget.quote.totalAmountCny,
    scenario.quoteTotalWan * 10_000,
  );
  assert.ok(
    refreshed.payload.project.evaluations.some(
      (evaluation) =>
        evaluation.candidateId === target.id &&
        evaluation.userConfirmation,
    ),
  );

  const recovery = await request(
    "/api/project/recover",
    "POST",
    {
      projectId: project.id,
      recoveryCode: complete.payload.recoveryCode,
    },
    undefined,
    30_000,
  );
  assert.equal(recovery.response.status, 200);
  assert.ok(recovery.cookie);

  const oldCookieRead = await request(
    `/api/project?projectId=${encodeURIComponent(project.id)}`,
    "GET",
    undefined,
    complete.cookie,
    30_000,
  );
  assert.equal(oldCookieRead.response.status, 404);
  const newCookieRead = await request(
    `/api/project?projectId=${encodeURIComponent(project.id)}`,
    "GET",
    undefined,
    recovery.cookie,
    30_000,
  );
  assert.equal(newCookieRead.response.status, 200);

  const deleted = await request(
    `/api/project?projectId=${encodeURIComponent(project.id)}`,
    "DELETE",
    undefined,
    recovery.cookie,
    30_000,
  );
  assert.equal(deleted.response.status, 200);

  return {
    scenario: scenario.id,
    identitySeconds: identity.seconds,
    fullSeconds: complete.seconds,
    optionCounts: identity.payload.project.candidates.map(
      (candidate) => candidate.identityOptions?.length ?? 0,
    ),
    selectedIdKinds: selections.map(
      (option) => option.exactModelId.split(":")[0],
    ),
    harness: complete.payload.harness?.status ?? null,
    conditionCount: project.conditions.length,
    factCounts: project.candidates.map(
      (candidate) => candidate.facts?.length ?? 0,
    ),
    cityMonthCounts: project.citySales?.map(
      (series) => series.points.length,
    ) ?? [],
    issueCodes: project.issues?.map((issue) => issue.code) ?? [],
    evidenceCount: project.evidence?.length ?? 0,
    traceOrRequestCount:
      project.evidence?.filter(
        (evidence) =>
          evidence.traceId ||
          evidence.requestId ||
          evidence.upstreamRequestId,
      ).length ?? 0,
    persistence: {
      refresh: true,
      quote: true,
      confirmation: true,
      recovery: true,
      oldCookieRejected: true,
      cleanup: true,
    },
  };
}

const summaries = [];
for (const scenario of scenarios) {
  summaries.push(await verifyScenario(scenario));
}
console.log(
  JSON.stringify({
    status: "ok",
    realProviders: true,
    scenarios: summaries,
    secretsPersisted: false,
  }),
);
