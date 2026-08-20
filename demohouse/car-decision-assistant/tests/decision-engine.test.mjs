import assert from "node:assert/strict";
import test from "node:test";

const decision = await import(
  new URL("../lib/decision/index.ts", import.meta.url).href
);

const {
  ConditionCategory,
  ConfirmationDependency,
  DecisionInputError,
  DecisionStatus,
  PendingReason,
  applyDecisionChanges,
  assertDecisionProject,
  createDemoDecisionProject,
  isSameCityScope,
  normalizeCityScope,
  selectTopPendingIssues,
  summarizeDecision,
} = decision;

test("matches city-series data with or without the 市 suffix", () => {
  assert.equal(normalizeCityScope(" 杭州市 "), "杭州");
  assert.equal(isSameCityScope("杭州市", "杭州"), true);
  assert.equal(isSameCityScope("杭州市", "宁波"), false);
});

function exactCandidate(id, role = "alternative") {
  return {
    id,
    role,
    vehicle: {
      exactModelId: `exact-${id}`,
      manufacturer: "测试厂商",
      series: `车系 ${id}`,
      modelYear: "2025款",
      trim: "测试配置",
    },
    quote: {
      version: `${id}-quote-v1`,
      totalAmountCny: 200000,
    },
  };
}

function projectWithCandidateCount(count) {
  const candidates = Array.from({ length: count }, (_, index) =>
    exactCandidate(`candidate-${index + 1}`, index === 0 ? "target" : "alternative"),
  );
  return {
    id: `candidate-count-${count}`,
    title: "候选数量测试",
    updatedAt: "2026-07-26T10:00:00+08:00",
    context: { city: "杭州", paymentMethod: "全款" },
    candidates,
    conditions: [
      {
        id: "condition-1",
        title: "动态条件",
        category: ConditionCategory.PREFERENCE,
        kind: "preference",
      },
    ],
    evaluations: candidates.map((candidate) => ({
      candidateId: candidate.id,
      conditionId: "condition-1",
      status: DecisionStatus.CONFIRMED,
      summary: "已确认",
    })),
  };
}

test("accepts one, two or three exact candidates and rejects other counts", () => {
  for (const count of [1, 2, 3]) {
    assert.doesNotThrow(() => assertDecisionProject(projectWithCandidateCount(count)));
  }

  assert.throws(
    () => assertDecisionProject(projectWithCandidateCount(0)),
    DecisionInputError,
  );
  assert.throws(
    () => assertDecisionProject(projectWithCandidateCount(4)),
    DecisionInputError,
  );
});

test("requires one independent evaluation for every dynamic condition and candidate", () => {
  const project = projectWithCandidateCount(3);
  project.conditions.push({
    id: "condition-2",
    title: "后来新增的条件",
    category: ConditionCategory.CONFIGURATION,
    kind: "hard",
  });
  project.evaluations.push(
    ...project.candidates.map((candidate) => ({
      candidateId: candidate.id,
      conditionId: "condition-2",
      status: DecisionStatus.PENDING,
      pendingReason: PendingReason.CONFIGURATION_UNVERIFIED,
      summary: "需要核验精确配置",
    })),
  );
  assert.doesNotThrow(() => assertDecisionProject(project));

  project.evaluations.pop();
  assert.throws(
    () => assertDecisionProject(project),
    /exactly one evaluation for every condition and exact candidate/,
  );
});

test("allows only the three decision statuses and requires an enumerated pending reason", () => {
  const missingReason = projectWithCandidateCount(1);
  missingReason.evaluations[0] = {
    ...missingReason.evaluations[0],
    status: DecisionStatus.PENDING,
  };
  assert.throws(
    () => assertDecisionProject(missingReason),
    /pendingReason must be a valid reason/,
  );

  const reasonOnConflict = projectWithCandidateCount(1);
  reasonOnConflict.evaluations[0] = {
    ...reasonOnConflict.evaluations[0],
    status: DecisionStatus.CONFLICT,
    pendingReason: PendingReason.QUOTE_REQUIRED,
  };
  assert.throws(
    () => assertDecisionProject(reasonOnConflict),
    /pendingReason is only allowed/,
  );

  const unknownStatus = projectWithCandidateCount(1);
  unknownStatus.evaluations[0].status = "recommended";
  assert.throws(() => assertDecisionProject(unknownStatus), /status is invalid/);
});

test("aggregates candidates deterministically and lets the target drive the top status", () => {
  const demo = createDemoDecisionProject();
  const summary = summarizeDecision(demo);

  assert.equal(summary.status, DecisionStatus.PENDING);
  assert.equal(summary.targetCandidateId, "candidate-l6");
  assert.deepEqual(
    summary.candidates.map(({ candidateId, status }) => [candidateId, status]),
    [
      ["candidate-l6", DecisionStatus.PENDING],
      ["candidate-m7", DecisionStatus.CONFLICT],
    ],
  );
  assert.equal(summary.topPendingIssues.length, 2);
  assert.deepEqual(
    summary.topPendingIssues.map((issue) => issue.conditionId),
    ["landing-budget", "charging-convenience"],
  );
});

test("ranks unresolved work, caps it at three, and never turns conflicts into todos", () => {
  const project = projectWithCandidateCount(1);
  project.conditions = [
    {
      id: "hard-conflict",
      title: "已证实的安全硬冲突",
      category: ConditionCategory.SAFETY,
      kind: "hard",
      order: 0,
    },
    {
      id: "safety",
      title: "安全确认",
      category: ConditionCategory.SAFETY,
      kind: "hard",
      order: 1,
    },
    {
      id: "budget",
      title: "预算确认",
      category: ConditionCategory.BUDGET,
      kind: "hard",
      order: 2,
    },
    {
      id: "configuration",
      title: "配置确认",
      category: ConditionCategory.CONFIGURATION,
      kind: "hard",
      order: 3,
    },
    {
      id: "experience",
      title: "本人体验",
      category: ConditionCategory.PERSONAL_EXPERIENCE,
      kind: "hard",
      order: 4,
    },
    {
      id: "sales",
      title: "销售书面确认",
      category: ConditionCategory.SALES_WRITTEN,
      kind: "hard",
      order: 5,
    },
    {
      id: "preference",
      title: "普通偏好",
      category: ConditionCategory.PREFERENCE,
      kind: "preference",
      order: 6,
    },
  ];
  project.evaluations = project.conditions.map((condition) => ({
    candidateId: "candidate-1",
    conditionId: condition.id,
    status:
      condition.id === "hard-conflict"
        ? DecisionStatus.CONFLICT
        : DecisionStatus.PENDING,
    ...(condition.id === "hard-conflict"
      ? {}
      : { pendingReason: PendingReason.MISSING_VEHICLE_DATA }),
    summary:
      condition.id === "hard-conflict" ? "已经证实，不应成为待办" : "仍待处理",
  }));

  assertDecisionProject(project);
  const issues = selectTopPendingIssues(project, { limit: 99 });
  assert.equal(issues.length, 3);
  assert.deepEqual(
    issues.map((issue) => issue.conditionId),
    ["safety", "budget", "configuration"],
  );
  assert.ok(!issues.some((issue) => issue.conditionId === "hard-conflict"));
});

test("invalidates only user confirmations whose exact basis changed", () => {
  const project = projectWithCandidateCount(2);
  project.conditions = [
    {
      id: "exact-model",
      title: "精确车型本人确认",
      category: ConditionCategory.CONFIGURATION,
      kind: "hard",
    },
    {
      id: "city",
      title: "城市条件确认",
      category: ConditionCategory.PREFERENCE,
      kind: "preference",
    },
    {
      id: "payment",
      title: "支付方式确认",
      category: ConditionCategory.BUDGET,
      kind: "hard",
    },
    {
      id: "quote",
      title: "报价确认",
      category: ConditionCategory.SALES_WRITTEN,
      kind: "hard",
    },
    {
      id: "system-fact",
      title: "系统配置事实",
      category: ConditionCategory.CONFIGURATION,
      kind: "hard",
    },
  ];

  const confirmedAt = "2026-07-25T10:00:00+08:00";
  const confirmation = (dependsOn, basis) => ({
    confirmedAt,
    dependsOn,
    basis,
  });
  project.evaluations = project.candidates.flatMap((candidate) => [
    {
      candidateId: candidate.id,
      conditionId: "exact-model",
      status: DecisionStatus.CONFIRMED,
      summary: "本人已按精确车型确认",
      userConfirmation: confirmation(
        [ConfirmationDependency.MODEL_YEAR, ConfirmationDependency.TRIM],
        { modelYear: "2025款", trim: "测试配置" },
      ),
    },
    {
      candidateId: candidate.id,
      conditionId: "city",
      status: DecisionStatus.CONFIRMED,
      summary: "本人已按城市确认",
      userConfirmation: confirmation([ConfirmationDependency.CITY], {
        city: "杭州",
      }),
    },
    {
      candidateId: candidate.id,
      conditionId: "payment",
      status: DecisionStatus.CONFIRMED,
      summary: "本人已按支付方式确认",
      userConfirmation: confirmation([ConfirmationDependency.PAYMENT_METHOD], {
        paymentMethod: "全款",
      }),
    },
    {
      candidateId: candidate.id,
      conditionId: "quote",
      status: DecisionStatus.CONFIRMED,
      summary: "本人已按报价版本确认",
      userConfirmation: confirmation([ConfirmationDependency.QUOTE_VERSION], {
        quoteVersion: `${candidate.id}-quote-v1`,
      }),
    },
    {
      candidateId: candidate.id,
      conditionId: "system-fact",
      status: DecisionStatus.CONFIRMED,
      summary: "数据源返回的静态配置",
      evidenceRefs: ["vehicle-data:trace-001"],
    },
  ]);
  assertDecisionProject(project);

  const result = applyDecisionChanges(project, {
    updatedAt: "2026-07-26T11:00:00+08:00",
    context: {
      city: "上海",
      paymentMethod: "贷款",
    },
    candidates: [
      {
        candidateId: "candidate-1",
        vehicle: {
          exactModelId: "exact-candidate-1-2026-updated",
          modelYear: "2026款",
          trim: "升级配置",
        },
        quote: {
          version: "candidate-1-quote-v2",
          totalAmountCny: 210000,
        },
      },
    ],
  });

  assert.equal(result.invalidatedConfirmations.length, 6);
  assert.deepEqual(
    result.invalidatedConfirmations
      .filter((item) => item.candidateId === "candidate-1")
      .map((item) => item.conditionId),
    ["exact-model", "city", "payment", "quote"],
  );
  assert.deepEqual(
    result.invalidatedConfirmations
      .filter((item) => item.candidateId === "candidate-2")
      .map((item) => item.conditionId),
    ["city", "payment"],
  );

  const stale = result.project.evaluations.filter(
    (evaluation) =>
      evaluation.pendingReason === PendingReason.CONFIRMATION_INVALIDATED,
  );
  assert.equal(stale.length, 6);
  assert.ok(
    stale.every((evaluation) => evaluation.status === DecisionStatus.PENDING),
  );
  assert.equal(
    result.project.evaluations.find(
      (evaluation) =>
        evaluation.candidateId === "candidate-2" &&
        evaluation.conditionId === "exact-model",
    ).status,
    DecisionStatus.CONFIRMED,
  );
  assert.equal(
    result.project.evaluations.find(
      (evaluation) =>
        evaluation.candidateId === "candidate-1" &&
        evaluation.conditionId === "system-fact",
    ).status,
    DecisionStatus.CONFIRMED,
  );
  assert.equal(project.context.city, "杭州", "the original project is immutable");
});
