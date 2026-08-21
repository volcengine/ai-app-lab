"use client";

import {
  ConditionCategory,
  DecisionStatus,
  PendingReason,
  isSameCityScope,
  type CitySalesSeries,
  type ConditionEvaluation,
  type DecisionCondition,
  type DecisionEvidence,
  type DecisionProject,
  type PendingIssue,
  type VehicleCandidate,
  type VehicleFact,
} from "@/lib/decision";
import {
  ArrowClockwise,
  ArrowRight,
  CaretRight,
  Car,
  ChartLineUp,
  CheckCircle,
  Database,
  Lightning,
  MapPin,
  MinusCircle,
  PencilSimple,
  Plus,
  RoadHorizon,
  ShieldCheck,
  SteeringWheel,
  SuitcaseRolling,
  UserCircle,
  Wallet,
  XCircle,
} from "@phosphor-icons/react";
import {
  FormEvent,
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { isProjectFormUnchanged } from "../lib/project-form-state";

type Overlay =
  | "create"
  | "recover"
  | "evidence"
  | "conditions"
  | "task"
  | null;
type Notice = { tone: "success" | "warning" | "neutral"; message: string };
type CreateMode = "new" | "add";

interface ProjectResponse {
  project: DecisionProject;
  recoveryCode?: string;
  requiresIdentityConfirmation?: boolean;
  code?: string;
  harness?: {
    status: "ok" | "partial" | "unavailable";
    message: string;
  };
}

interface CreateProjectDraft {
  city: string;
  purchaseTime: string;
  maxBudget: string;
  need: string;
  candidates: string[];
  candidateIdentityIds: string[];
  identityProject?: DecisionProject;
}

function readCreateProjectDraft(key: string): CreateProjectDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const draft = JSON.parse(
      window.localStorage.getItem(key) ?? "null",
    ) as Partial<CreateProjectDraft> | null;
    if (
      !draft ||
      typeof draft.city !== "string" ||
      typeof draft.purchaseTime !== "string" ||
      typeof draft.maxBudget !== "string" ||
      typeof draft.need !== "string" ||
      !Array.isArray(draft.candidates) ||
      draft.candidates.length < 1 ||
      draft.candidates.length > 3 ||
      !draft.candidates.every((candidate) => typeof candidate === "string")
    ) {
      return null;
    }
    return {
      city: draft.city,
      purchaseTime: draft.purchaseTime,
      maxBudget: draft.maxBudget,
      need: draft.need,
      candidates: draft.candidates,
      candidateIdentityIds: Array.isArray(draft.candidateIdentityIds)
        ? draft.candidateIdentityIds
            .filter((identityId) => typeof identityId === "string")
            .slice(0, draft.candidates.length)
        : [],
      identityProject:
        draft.identityProject && typeof draft.identityProject === "object"
          ? draft.identityProject
          : undefined,
    };
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
}

const issueMeta: Record<
  PendingIssue["pendingReason"],
  { owner: string; helper: string; options: string[] }
> = {
  [PendingReason.MISSING_VEHICLE_DATA]: {
    owner: "本次查询结果",
    helper: "首次生成已经完成全部查询；没有可靠返回的字段不会由模型猜测补齐。",
    options: [],
  },
  [PendingReason.CONFIGURATION_UNVERIFIED]: {
    owner: "本次查询结果",
    helper:
      "车型身份已经锁定，但该字段未按已选车型的数据标识返回，因此不会采用其他版本的数据。",
    options: [],
  },
  [PendingReason.PERSONAL_EXPERIENCE_REQUIRED]: {
    owner: "需要本人确认",
    helper: "请按自己的真实场景记录，不由模型替你判断体验。",
    options: ["符合我的需要", "不符合我的需要", "仍不确定"],
  },
  [PendingReason.SALES_WRITTEN_CONFIRMATION_REQUIRED]: {
    owner: "需要销售书面确认",
    helper: "只记录是否写进正式报价或订单，不要求上传合同。",
    options: ["已写入正式材料", "仍是口头说法", "还没有确认"],
  },
  [PendingReason.QUOTE_REQUIRED]: {
    owner: "需要录入报价",
    helper: "手动填写关键费用即可，不需要上传报价单。",
    options: ["我已有完整报价", "报价还缺费用项", "还没有报价"],
  },
  [PendingReason.CONFIRMATION_INVALIDATED]: {
    owner: "需要重新确认",
    helper: "车型、城市、支付方式或报价版本发生变化，旧结论已失效。",
    options: ["重新确认", "仍不确定", "更换条件"],
  },
};

function formatCandidateName(project: DecisionProject, candidateId: string) {
  const candidate = project.candidates.find((item) => item.id === candidateId);
  if (!candidate) return "未找到车型";
  const { manufacturer, series, modelYear, trim } = candidate.vehicle;
  return [manufacturer, series, modelYear, trim].filter(Boolean).join(" ");
}

function formatCandidateTitle(candidate: VehicleCandidate) {
  const { manufacturer, series, modelYear, trim } = candidate.vehicle;
  return [manufacturer, series, modelYear, trim].filter(Boolean).join(" ");
}

function candidateNameIssue(value: string) {
  return value.trim().replace(/\s+/g, "").length < 2
    ? "请至少填写品牌或车系名称"
    : null;
}

function vehicleIdentityStatus(candidate: VehicleCandidate) {
  return /^(?:datapro|datapro-name):/.test(
    candidate.vehicle.exactModelId,
  )
    ? { tone: "verified", label: "车型身份已锁定" }
    : { tone: "pending", label: "车型待唯一核验" };
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(date);
}

function formatSourceTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(date);
}

function cleanSourceDisplayText(value: string) {
  return value.replace(/([\p{L}\p{N}])\s*[●✓√★]+/gu, "$1");
}

function formatFactValue(fact: VehicleFact) {
  const displayValue = cleanSourceDisplayText(fact.value);
  if (fact.field === "cltc_pure_range_km") {
    const rangeValues = Array.from(
      displayValue.matchAll(/(\d{2,4}(?:\.\d+)?)\s*(?:km|公里)/gi),
      (match) => Number(match[1]),
    ).filter((value) => Number.isFinite(value));
    if (rangeValues.length > 1) {
      const minimum = Math.min(...rangeValues);
      const maximum = Math.max(...rangeValues);
      if (minimum !== maximum) return `${minimum}–${maximum} km`;
    }
  }
  if (
    fact.unit &&
    /^(?:cny|rmb|元)$/i.test(fact.unit) &&
    /(?:元|万)/.test(displayValue)
  ) {
    return displayValue;
  }
  if (!fact.unit || displayValue.includes(fact.unit)) return displayValue;
  return `${displayValue}${fact.unit}`;
}

function formatFactList(facts: VehicleFact[]) {
  return facts
    .slice(0, 3)
    .map((fact) => `${fact.label} ${formatFactValue(fact)}`)
    .join(" · ");
}

function normalizedFactText(fact: VehicleFact) {
  return `${fact.field} ${fact.label}`.toLowerCase();
}

function factsForEvaluation(
  candidate: VehicleCandidate,
  condition: DecisionCondition,
  evaluation?: ConditionEvaluation,
) {
  const facts = candidate.facts ?? [];
  const explicitFields = new Set(evaluation?.factFields ?? []);
  const explicitFacts = facts.filter((fact) => explicitFields.has(fact.field));
  if (explicitFacts.length) return explicitFacts;

  const ruleField = condition.rule?.field.toLowerCase();
  if (ruleField) {
    const exact = facts.find((fact) => fact.field.toLowerCase() === ruleField);
    if (exact) return [exact];
  }

  const title = condition.title.toLowerCase();
  const aliases: string[][] = [];
  if (/座|seat/.test(title)) aliases.push(["座位", "seat"]);
  if (/续航|cltc|wltc|range/.test(title)) {
    aliases.push(["续航", "range", "cltc", "wltc"]);
  }
  if (/四驱|两驱|后驱|前驱|驱动/.test(title)) {
    aliases.push(["驱动", "drive"]);
  }
  if (/预算|价格|落地|报价/.test(title)) {
    aliases.push(["指导价", "价格", "price", "guide_price", "报价"]);
  }
  if (/充电/.test(title)) aliases.push(["充电", "charge"]);

  for (const group of aliases) {
    const matched = facts.find((fact) =>
      group.some((alias) => normalizedFactText(fact).includes(alias)),
    );
    if (matched) return [matched];
  }
  return [];
}

function findEvidence(
  project: DecisionProject,
  candidate: VehicleCandidate,
  evaluation: ConditionEvaluation,
  fact?: VehicleFact,
) {
  const refs = new Set(evaluation.evidenceRefs ?? []);
  if (fact?.evidenceId) refs.add(fact.evidenceId);
  const evidence = project.evidence ?? [];
  const exact = evidence.find((item) => refs.has(item.id));
  if (exact || !fact) return exact;
  const expectedSource = fact.source === "user_quote" ? "user" : "datapro";
  return evidence
    .filter(
      (item) =>
        item.candidateId === candidate.id &&
        item.sourceType === expectedSource,
    )
    .sort(
      (left, right) =>
        new Date(right.capturedAt).getTime() -
        new Date(left.capturedAt).getTime(),
    )[0];
}

function outcomeSource(
  project: DecisionProject,
  candidate: VehicleCandidate,
  evaluation: ConditionEvaluation,
  fact?: VehicleFact,
) {
  const evidence = findEvidence(project, candidate, evaluation, fact);
  if (evidence) {
    const time = formatSourceTime(evidence.capturedAt);
    return `${evidence.sourceName}${time ? ` · ${time}` : ""}`;
  }
  if (fact) {
    const source = fact.source === "datapro" ? "专业数据集" : "用户报价";
    const time = formatSourceTime(fact.capturedAt);
    return `${source}${time ? ` · ${time}` : ""}`;
  }
  if (evaluation.userConfirmation) return "用户本人确认";
  if (evaluation.status === DecisionStatus.PENDING) return "仍需补充信息";
  return "已核验信息";
}

function evidenceStatusCopy(evidence: DecisionEvidence) {
  if (evidence.status === "current") return "已采用";
  if (evidence.status === "needs_review") return "待核验，未采用";
  return "服务暂不可用";
}

function MarketSalesChart({
  series,
  candidateOrder,
}: {
  series: CitySalesSeries[];
  candidateOrder: string[];
}) {
  const [activeMonth, setActiveMonth] = useState<{
    key: string;
    label: string;
    x: number;
  } | null>(null);
  const monthKeys = [
    ...new Set(
      series.flatMap((item) =>
        item.points.map((point) => point.monthKey ?? point.month),
      ),
    ),
  ]
    .sort()
    .slice(-6);
  const monthLabel = (key: string) =>
    series
      .flatMap((item) => item.points)
      .find((point) => (point.monthKey ?? point.month) === key)?.month ?? key;
  const maximum = Math.max(
    ...series.flatMap((item) => item.points.map((point) => point.value)),
    1,
  );
  const chartWidth = 420;
  const chartHeight = 230;
  const chartLeft = 46;
  const chartRight = 18;
  const chartTop = 20;
  const chartBottom = 34;
  const plotWidth = chartWidth - chartLeft - chartRight;
  const plotHeight = chartHeight - chartTop - chartBottom;
  const xPosition = (index: number) =>
    chartLeft + (index * plotWidth) / Math.max(monthKeys.length - 1, 1);
  const yPosition = (value: number) =>
    chartTop + plotHeight - (value / maximum) * plotHeight;
  const chartDescription = series
    .map(
      (item) =>
        `${item.series}（${item.statisticLabel}）：${item.points
          .map((point) => `${point.month}${point.value}`)
          .join("，")}`,
    )
    .join("；");

  return (
    <div
      className="market-chart"
      role="group"
      aria-label={`${series[0]?.city ?? ""}近 6 个月城市车系趋势：${chartDescription}`}
    >
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
        {[maximum, maximum / 2, 0].map((value, index) => {
          const y = chartTop + (index * plotHeight) / 2;
          return (
            <g className="market-grid-line" key={value}>
              <line x1={chartLeft} x2={chartWidth - chartRight} y1={y} y2={y} />
            </g>
          );
        })}
        {monthKeys.map((monthKey, index) => (
          <text
            className="market-month-label"
            key={monthKey}
            x={xPosition(index)}
            y={chartHeight - 7}
          >
            {monthLabel(monthKey)}
          </text>
        ))}
        {activeMonth ? (
          <line
            className="market-active-month"
            x1={activeMonth.x}
            x2={activeMonth.x}
            y1={chartTop}
            y2={chartTop + plotHeight}
          />
        ) : null}
        {series.map((item, seriesIndex) => {
          const toneIndex = Math.max(
            candidateOrder.indexOf(item.candidateId),
            seriesIndex,
          );
          const points = monthKeys.map((key, monthIndex) => {
            const point = item.points.find(
              (candidatePoint) =>
                (candidatePoint.monthKey ?? candidatePoint.month) === key,
            );
            return point
              ? {
                  key,
                  label: point.month,
                  value: point.value,
                  x: xPosition(monthIndex),
                  y: yPosition(point.value),
                }
              : null;
          });
          const lineSegments = points.reduce<Array<Array<NonNullable<(typeof points)[number]>>>>(
            (segments, point) => {
              if (!point) {
                if (segments.at(-1)?.length) segments.push([]);
                return segments;
              }
              if (!segments.length) segments.push([]);
              segments.at(-1)!.push(point);
              return segments;
            },
            [],
          );

          return (
            <g className={`market-line-series market-tone-${toneIndex}`} key={item.id}>
              {lineSegments
                .filter((segment) => segment.length > 1)
                .map((segment, segmentIndex) => (
                  <polyline
                    key={`${item.id}-segment-${segmentIndex}`}
                    points={segment
                      .map((point) => `${point.x},${point.y}`)
                      .join(" ")}
                  />
                ))}
              {points.filter(Boolean).map((point) => (
                <g
                  className="market-point"
                  key={`${item.id}-${point!.key}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${point!.label}，查看全部车系数据`}
                  onMouseEnter={() =>
                    setActiveMonth({
                      key: point!.key,
                      label: point!.label,
                      x: point!.x,
                    })
                  }
                  onMouseLeave={() => setActiveMonth(null)}
                  onFocus={() =>
                    setActiveMonth({
                      key: point!.key,
                      label: point!.label,
                      x: point!.x,
                    })
                  }
                  onBlur={() => setActiveMonth(null)}
                >
                  <circle className="market-point-hit" cx={point!.x} cy={point!.y} r="11" />
                  <circle className="market-point-dot" cx={point!.x} cy={point!.y} r="3.5" />
                </g>
              ))}
            </g>
          );
        })}
      </svg>
      {activeMonth ? (
        <div
          className={`market-tooltip below ${
            activeMonth.x < chartWidth * 0.12 ? "start" : ""
          } ${
            activeMonth.x > chartWidth * 0.88 ? "end" : ""
          }`}
          role="status"
          style={{
            left: `${(activeMonth.x / chartWidth) * 100}%`,
            top: `${((chartTop - 4) / chartHeight) * 100}%`,
          }}
        >
          <strong className="market-tooltip-title">{activeMonth.label}车系数据</strong>
          <div className="market-tooltip-rows">
            {series.map((item, seriesIndex) => {
              const toneIndex = Math.max(
                candidateOrder.indexOf(item.candidateId),
                seriesIndex,
              );
              const value = item.points.find(
                (point) =>
                  (point.monthKey ?? point.month) === activeMonth.key,
              )?.value;
              return (
                <div className="market-tooltip-row" key={item.id}>
                  <i className={`market-tone-${toneIndex}`} aria-hidden="true" />
                  <span>{item.series}</span>
                  <strong>{value ?? "—"}</strong>
                  <small>{item.statisticLabel}</small>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function makePendingIssue(
  project: DecisionProject,
  evaluation: ConditionEvaluation,
): PendingIssue | null {
  if (
    evaluation.status !== DecisionStatus.PENDING ||
    !evaluation.pendingReason
  ) {
    return null;
  }
  const condition = project.conditions.find(
    (item) => item.id === evaluation.conditionId,
  );
  if (!condition) return null;
  return {
    id: `${evaluation.conditionId}\u0000${evaluation.candidateId}`,
    candidateId: evaluation.candidateId,
    conditionId: evaluation.conditionId,
    title: condition.title,
    detail: condition.detail,
    category: condition.category,
    kind: condition.kind,
    pendingReason: evaluation.pendingReason,
    summary: evaluation.summary,
    factFields: evaluation.factFields,
  };
}

function pendingActionLabel(issue: PendingIssue) {
  if (issue.pendingReason === PendingReason.QUOTE_REQUIRED) {
    return "录入落地报价";
  }
  if (
    issue.pendingReason === PendingReason.SALES_WRITTEN_CONFIRMATION_REQUIRED
  ) {
    return "记录书面确认";
  }
  if (issue.pendingReason === PendingReason.PERSONAL_EXPERIENCE_REQUIRED) {
    return issue.factFields?.length ? "结合数据确认" : "记录本人体验";
  }
  if (
    issue.pendingReason === PendingReason.MISSING_VEHICLE_DATA ||
    issue.pendingReason === PendingReason.CONFIGURATION_UNVERIFIED
  ) {
    return "暂无可靠数据";
  }
  return "处理待确认项";
}

function isSystemDataGap(issue: PendingIssue | null) {
  return (
    issue?.pendingReason === PendingReason.MISSING_VEHICLE_DATA ||
    issue?.pendingReason === PendingReason.CONFIGURATION_UNVERIFIED
  );
}

function pendingActionRank(issue: PendingIssue) {
  if (
    issue.pendingReason === PendingReason.QUOTE_REQUIRED ||
    issue.pendingReason === PendingReason.SALES_WRITTEN_CONFIRMATION_REQUIRED
  ) {
    return 0;
  }
  if (issue.pendingReason === PendingReason.PERSONAL_EXPERIENCE_REQUIRED) return 1;
  return 2;
}

function ConditionIcon({ condition }: { condition: DecisionCondition }) {
  const text = `${condition.title} ${condition.detail ?? ""}`;
  if (/预算|价格|落地|报价/.test(text)) {
    return <Wallet aria-hidden="true" weight="regular" />;
  }
  if (/通勤|里程|续航/.test(text)) {
    return <RoadHorizon aria-hidden="true" weight="regular" />;
  }
  if (/装载|后备厢|空间|座位/.test(text)) {
    return <SuitcaseRolling aria-hidden="true" weight="regular" />;
  }
  if (/辅助驾驶|驾驶|四驱|两驱|后驱|前驱/.test(text)) {
    return <SteeringWheel aria-hidden="true" weight="regular" />;
  }
  if (/充电|补能|能源/.test(text)) {
    return <Lightning aria-hidden="true" weight="regular" />;
  }
  return <Car aria-hidden="true" weight="regular" />;
}

function updateDemoEvaluation(
  project: DecisionProject,
  issue: PendingIssue,
  answer: string,
  note: string,
  quoteTotalWan?: number,
) {
  const affirmative =
    answer === "符合我的需要" ||
    answer === "已写入正式材料" ||
    answer === "我已有完整报价" ||
    answer === "重新确认";
  const negativeConflict = [
    "不符合我的需要",
    "仍是口头说法",
    "更换精确配置",
    "更换条件",
  ].includes(answer);
  const now = new Date().toISOString();
  const condition = project.conditions.find(
    (item) => item.id === issue.conditionId,
  );
  const isCompleteQuote =
    issue.pendingReason === PendingReason.QUOTE_REQUIRED &&
    answer === "我已有完整报价" &&
    typeof quoteTotalWan === "number" &&
    quoteTotalWan > 0;
  const quoteTotalCny = isCompleteQuote
    ? Math.round(quoteTotalWan * 10000)
    : undefined;
  const quoteWithinRule =
    isCompleteQuote &&
    condition?.rule?.operator === "lte" &&
    typeof condition.rule.value === "number"
      ? (quoteTotalCny ?? 0) <= condition.rule.value
      : true;
  const evaluations = project.evaluations.map((evaluation) => {
    if (
      evaluation.candidateId !== issue.candidateId ||
      evaluation.conditionId !== issue.conditionId
    ) {
      return evaluation;
    }

    if (isCompleteQuote) {
      return {
        ...evaluation,
        status: quoteWithinRule
          ? DecisionStatus.CONFIRMED
          : DecisionStatus.CONFLICT,
        pendingReason: undefined,
        summary: `本人录入落地总价 ${Number(quoteTotalWan).toFixed(2)} 万元，${
          quoteWithinRule ? "在当前预算范围内" : "超过当前预算上限"
        }${note ? `；${note}` : ""}`,
        userConfirmation: {
          confirmedAt: now,
          dependsOn: [],
          basis: {},
          note: note || undefined,
        },
      } satisfies ConditionEvaluation;
    }

    if (negativeConflict) {
      return {
        ...evaluation,
        status: DecisionStatus.CONFLICT,
        pendingReason: undefined,
        summary: `本人记录：${answer}${note ? `；${note}` : ""}`,
        userConfirmation: {
          confirmedAt: now,
          dependsOn: [],
          basis: {},
          note: note || undefined,
        },
      } satisfies ConditionEvaluation;
    }

    if (!affirmative) {
      return {
        ...evaluation,
        summary: `本人记录：${answer}${note ? `；${note}` : ""}`,
      };
    }

    return {
      ...evaluation,
      status: DecisionStatus.CONFIRMED,
      pendingReason: undefined,
      summary: `本人记录：${answer}${note ? `；${note}` : ""}`,
      userConfirmation: {
        confirmedAt: now,
        dependsOn: [],
        basis: {},
        note: note || undefined,
      },
    } satisfies ConditionEvaluation;
  });

  return {
    ...project,
    updatedAt: now,
    candidates: quoteTotalCny
      ? project.candidates.map((candidate) =>
          candidate.id === issue.candidateId
            ? {
                ...candidate,
                quote: {
                  version: `demo-quote-${now}`,
                  totalAmountCny: quoteTotalCny,
                  capturedAt: now,
                },
              }
            : candidate,
        )
      : project.candidates,
    evaluations,
  };
}

export default function DecisionApp({
  initialProject,
}: {
  initialProject: DecisionProject;
}) {
  const [project, setProject] = useState(initialProject);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [createMode, setCreateMode] = useState<CreateMode>("new");
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [answerNote, setAnswerNote] = useState("");
  const [quoteTotalWan, setQuoteTotalWan] = useState("");
  const [taskError, setTaskError] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [projectCode, setProjectCode] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  const shouldFocusNextIssue = useRef(false);

  const pendingIssues = useMemo(
    () =>
      project.evaluations
        .filter(
          (evaluation) => evaluation.status === DecisionStatus.PENDING,
        )
        .map((evaluation) => makePendingIssue(project, evaluation))
        .filter((issue): issue is PendingIssue => issue !== null)
        .sort((left, right) => {
          const actionPriority = pendingActionRank(left) - pendingActionRank(right);
          if (actionPriority !== 0) return actionPriority;
          const leftOrder = project.conditions.findIndex(
            (condition) => condition.id === left.conditionId,
          );
          const rightOrder = project.conditions.findIndex(
            (condition) => condition.id === right.conditionId,
          );
          return leftOrder - rightOrder;
        }),
    [project],
  );
  const activeIssue = pendingIssues.find(
    (issue) => issue.id === activeIssueId,
  );
  const sourceEvidence = useMemo(
    () =>
      [...(project.evidence ?? [])]
        .sort(
          (left, right) =>
            new Date(right.capturedAt).getTime() -
            new Date(left.capturedAt).getTime(),
        ),
    [project.evidence],
  );
  const citySales = useMemo(
    () =>
      (project.citySales ?? []).filter(
        (series) =>
          isSameCityScope(series.city, project.context.city) &&
          series.points.length > 0,
      ),
    [project.citySales, project.context.city],
  );
  const citySalesPeriodLabel = useMemo(() => {
    const periods = [...new Set(citySales.map((series) => series.periodLabel))];
    if (periods.length === 1) return periods[0];
    if (periods.length > 1) return "统计周期见图例";
    return "等待真实查询";
  }, [citySales]);
  const contextConditions = project.conditions.filter(
    (condition) => condition.scope === "context",
  );
  const comparisonConditions = project.conditions.filter(
    (condition) => condition.scope !== "context",
  );
  const visibleConditions = showPendingOnly
    ? comparisonConditions.filter((condition) =>
        project.evaluations.some(
          (evaluation) =>
            evaluation.conditionId === condition.id &&
            evaluation.status === DecisionStatus.PENDING,
        ),
      )
    : comparisonConditions;
  const pendingConditionCount = new Set(
    pendingIssues.map((issue) => issue.conditionId),
  ).size;
  const professionalDataStats = useMemo(() => {
    const returnedFieldCount = project.candidates.reduce((total, candidate) => {
      const dataFacts = (candidate.facts ?? []).filter(
        (fact) => fact.source === "datapro",
      );
      const rawFieldCount = dataFacts.filter((fact) =>
        fact.field.startsWith("datapro_raw:"),
      ).length;
      return total + (rawFieldCount || dataFacts.length);
    }, 0);
    const backedEvaluationCount = project.evaluations.filter((evaluation) => {
      const candidate = project.candidates.find(
        (item) => item.id === evaluation.candidateId,
      );
      const condition = project.conditions.find(
        (item) => item.id === evaluation.conditionId,
      );
      return (
        candidate &&
        condition &&
        factsForEvaluation(candidate, condition, evaluation).some(
          (fact) => fact.source === "datapro",
        )
      );
    }).length;
    const unboundFieldCount = project.candidates.reduce(
      (total, candidate) =>
        total + new Set(candidate.unboundDataFields ?? []).size,
      0,
    );
    return {
      returnedFieldCount,
      backedEvaluationCount,
      unboundFieldCount,
    };
  }, [project]);
  const requiresQuoteTotal =
    activeIssue?.pendingReason === PendingReason.QUOTE_REQUIRED &&
    selectedAnswer === "我已有完整报价";
  const quoteTotalIsValid =
    Number.isFinite(Number(quoteTotalWan)) && Number(quoteTotalWan) > 0;
  useEffect(() => {
    if (!shouldFocusNextIssue.current || overlay !== null) return;
    shouldFocusNextIssue.current = false;
    window.requestAnimationFrame(() => {
      const nextButton = document.querySelector<HTMLButtonElement>(
        "[data-pending-action='true']",
      );
      nextButton?.scrollIntoView({ behavior: "smooth", block: "center" });
      nextButton?.focus({ preventScroll: true });
    });
  }, [overlay, pendingIssues]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("demo") === "1") {
      return;
    }
    const savedProjectId = window.localStorage.getItem(
      "car-decision-project-id",
    );
    if (!savedProjectId) return;

    fetch(`/api/project?projectId=${encodeURIComponent(savedProjectId)}`, {
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("无法恢复当前浏览器中的项目");
        return (await response.json()) as ProjectResponse;
      })
      .then((payload) => {
        startTransition(() => setProject(payload.project));
      })
      .catch(() => {
        window.localStorage.removeItem("car-decision-project-id");
      });
  }, []);

  async function submitIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeIssue || !selectedAnswer) return;
    const needsQuoteTotal =
      activeIssue.pendingReason === PendingReason.QUOTE_REQUIRED &&
      selectedAnswer === "我已有完整报价";
    const parsedQuoteTotalWan = Number(quoteTotalWan);
    if (
      needsQuoteTotal &&
      (!Number.isFinite(parsedQuoteTotalWan) || parsedQuoteTotalWan <= 0)
    ) {
      setTaskError("请输入大于 0 的落地总价，才能重新判断是否满足预算。");
      return;
    }
    setTaskError("");
    setIsSaving(true);
    let saved = false;

    try {
      if (project.isDemo) {
        setProject((current) =>
          updateDemoEvaluation(
            current,
            activeIssue,
            selectedAnswer,
            answerNote,
            needsQuoteTotal ? parsedQuoteTotalWan : undefined,
          ),
        );
        setNotice({
          tone: [
            "符合我的需要",
            "已写入正式材料",
            "我已有完整报价",
            "重新确认",
          ].includes(selectedAnswer)
            ? "success"
            : "warning",
          message: "已记录，并重新计算当前状态。",
        });
      } else {
        const response = await fetch("/api/project/evaluate", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            projectId: project.id,
            candidateId: activeIssue.candidateId,
            conditionId: activeIssue.conditionId,
            answer: selectedAnswer,
            note: answerNote,
            ...(needsQuoteTotal
              ? { quoteTotalWan: parsedQuoteTotalWan }
              : {}),
          }),
        });
        const payload = (await response.json()) as ProjectResponse & {
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "保存失败");
        setProject(payload.project);
        setNotice({ tone: "success", message: "已记录，并重新计算当前状态。" });
      }
      saved = true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "保存失败，请稍后重试。";
      setTaskError(message);
      setNotice({
        tone: "warning",
        message,
      });
    } finally {
      if (saved) {
        shouldFocusNextIssue.current = true;
        setOverlay(null);
        setActiveIssueId(null);
        setSelectedAnswer("");
        setAnswerNote("");
        setQuoteTotalWan("");
        setTaskError("");
      }
      setIsSaving(false);
    }
  }

  async function deleteProject() {
    if (project.isDemo) {
      setProject(initialProject);
      setNotice({ tone: "neutral", message: "已恢复初始状态。" });
      return;
    }
    if (!window.confirm("删除后恢复码也会失效，且无法撤销。确定删除吗？")) {
      return;
    }

    const response = await fetch(
      `/api/project?projectId=${encodeURIComponent(project.id)}`,
      { method: "DELETE" },
    );
    if (response.ok) {
      window.localStorage.removeItem("car-decision-project-id");
      setProject(initialProject);
      setNotice({ tone: "success", message: "你的购车决策项目及关联记录已删除。" });
    } else {
      setNotice({ tone: "warning", message: "删除失败，请稍后重试。" });
    }
  }

  function openTask(issue: PendingIssue) {
    setActiveIssueId(issue.id);
    setSelectedAnswer("");
    setAnswerNote("");
    setQuoteTotalWan("");
    setTaskError("");
    setOverlay("task");
  }

  function openCreate(mode: CreateMode) {
    setCreateMode(mode);
    setOverlay("create");
  }

  function renderOutcome(
    candidate: VehicleCandidate,
    condition: DecisionCondition,
  ) {
    const evaluation = project.evaluations.find(
      (item) =>
        item.candidateId === candidate.id &&
        item.conditionId === condition.id,
    );
    if (!evaluation) {
      return (
        <div className="outcome-content pending">
          <div className="outcome-status">
            <MinusCircle aria-hidden="true" weight="regular" />
            <strong>待确认</strong>
          </div>
          <p>还没有形成这一项的判断</p>
          <small>仍需补充信息</small>
        </div>
      );
    }

    const quoteAmount =
      condition.category === ConditionCategory.BUDGET &&
      typeof candidate.quote?.totalAmountCny === "number"
        ? candidate.quote.totalAmountCny
        : null;
    const relevantFacts = quoteAmount
      ? []
      : factsForEvaluation(candidate, condition, evaluation);
    const fact = relevantFacts[0];
    const hasProfessionalData = relevantFacts.some(
      (item) => item.source === "datapro",
    );
    const hasUnboundProfessionalData =
      !hasProfessionalData &&
      evaluation.summary.includes("专业数据已返回");
    const hasAnyProfessionalData =
      hasProfessionalData || hasUnboundProfessionalData;
    const status = evaluation.status;
    const statusLabel =
      status === DecisionStatus.CONFIRMED
        ? "满足"
        : status === DecisionStatus.CONFLICT
          ? "不符合"
          : "待确认";
    const StatusIcon =
      status === DecisionStatus.CONFIRMED
        ? CheckCircle
        : status === DecisionStatus.CONFLICT
          ? XCircle
          : MinusCircle;
    const issue = makePendingIssue(project, evaluation);
    const systemDataGap = isSystemDataGap(issue);
    const primaryValue = quoteAmount
      ? `本人录入落地总价 ${(quoteAmount / 10_000).toFixed(2)} 万元`
      : relevantFacts.length
        ? formatFactList(relevantFacts)
        : cleanSourceDisplayText(evaluation.summary);
    const dataStateClass = hasAnyProfessionalData
      ? status === DecisionStatus.PENDING
        ? "data-returned"
        : "data-verified"
      : status === DecisionStatus.PENDING
        ? "data-missing"
        : "";
    const content = (
      <>
        {hasAnyProfessionalData ? (
          <span className="outcome-data-badge">
            <Database aria-hidden="true" weight="regular" />
            {hasUnboundProfessionalData
              ? "专业数据已返回 · 当前字段待补"
              : status === DecisionStatus.PENDING
                ? "专业数据已返回"
              : "专业数据已核验"}
          </span>
        ) : null}
        <p className="outcome-primary">{primaryValue}</p>
        <div className="outcome-status">
          <StatusIcon aria-hidden="true" weight="regular" />
          <strong>{issue ? pendingActionLabel(issue) : statusLabel}</strong>
          {issue && !systemDataGap ? <ArrowRight aria-hidden="true" /> : null}
        </div>
        <small className="outcome-source">
          {quoteAmount
            ? "用户本人录入"
            : outcomeSource(project, candidate, evaluation, fact)}
        </small>
      </>
    );

    if (issue && !systemDataGap) {
      return (
        <button
          type="button"
          className={`outcome-content ${status} ${dataStateClass} actionable`}
          onClick={() => openTask(issue)}
          aria-label={`补充${condition.title}`}
        >
          {content}
        </button>
      );
    }
    return (
      <div className={`outcome-content ${status} ${dataStateClass}`}>
        {content}
      </div>
    );
  }

  const candidateSlots = Array.from(
    { length: 3 },
    (_, index) => project.candidates[index] ?? null,
  );
  const currentDate = new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(new Date());
  const latestDataProEvidence = sourceEvidence.find(
    (item) => item.sourceType === "datapro",
  );
  const latestUserConfirmation = project.evaluations
    .filter((evaluation) => evaluation.userConfirmation)
    .sort(
      (left, right) =>
        new Date(right.userConfirmation?.confirmedAt ?? 0).getTime() -
        new Date(left.userConfirmation?.confirmedAt ?? 0).getTime(),
    )[0]?.userConfirmation;

  return (
    <main className="decision-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <button
            className="wordmark"
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <Image
              src="/assets/decision-data-mark.png"
              width="44"
              height="44"
              alt=""
              priority
              unoptimized
            />
            <span>购车决策助手</span>
          </button>
          <div className="header-actions">
            <span className="header-location">
              <MapPin aria-hidden="true" weight="regular" />
              {project.context.city}
            </span>
            <time dateTime={currentDate}>{currentDate}</time>
            <button
              type="button"
              className="header-secondary"
              onClick={() => openCreate("new")}
            >
              <ArrowClockwise aria-hidden="true" weight="regular" />
              重新选择车型
            </button>
          </div>
        </div>
      </header>

      {notice ? (
        <div
          className={`notice ${notice.tone}`}
          role="status"
          aria-live="polite"
        >
          <span>{notice.message}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="关闭提示"
          >
            关闭
          </button>
        </div>
      ) : null}

      <div className="page-frame">
        <section className="decision-hero" aria-labelledby="page-title">
          <div>
            <h1 id="page-title">
              按你的<span>真实需求</span>，<span>验清</span>每一款车
            </h1>
            <p>对比 3 款精确车型，一眼看清满足、冲突与待确认项</p>
          </div>
        </section>

        <div className="decision-workspace">
          <section
            className="comparison-matrix-panel"
            aria-label="候选车型条件对比"
          >
            <header className="matrix-toolbar">
              <div>
                <h2>我的条件</h2>
                <button
                  type="button"
                  onClick={() => setOverlay("conditions")}
                >
                  调整条件
                  <PencilSimple aria-hidden="true" weight="regular" />
                </button>
              </div>
              <div>
                <strong className="pending-summary">
                  <i aria-hidden="true" />
                  {pendingConditionCount} 条需求待核验
                </strong>
                <label className="pending-filter">
                  <span>只看待确认项</span>
                  <input
                    type="checkbox"
                    checked={showPendingOnly}
                    onChange={(event) =>
                      setShowPendingOnly(event.target.checked)
                    }
                  />
                  <i aria-hidden="true" />
                </label>
              </div>
            </header>

            {contextConditions.length ? (
              <div className="requirement-context-strip">
                <strong>已识别用车场景</strong>
                <div>
                  {contextConditions.map((condition) => (
                    <span key={condition.id} title={condition.sourceText}>
                      {condition.title}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="matrix-header-row" role="row">
              <div className="matrix-corner" role="columnheader">
                <span>同一组条件，逐项核验</span>
              </div>
              {candidateSlots.map((candidate, slotIndex) =>
                candidate ? (
                  <div
                    className="matrix-candidate-head"
                    role="columnheader"
                    key={candidate.id}
                  >
                    <strong>{candidate.vehicle.manufacturer}</strong>
                    <span>
                      {[
                        candidate.vehicle.series,
                        candidate.vehicle.modelYear,
                        candidate.vehicle.trim,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    </span>
                    {!project.isDemo ? (
                      <small
                        className={`candidate-identity ${
                          vehicleIdentityStatus(candidate).tone
                        }`}
                      >
                        {vehicleIdentityStatus(candidate).label}
                      </small>
                    ) : null}
                  </div>
                ) : (
                  <button
                    type="button"
                    className="matrix-add-candidate"
                    key={`empty-${slotIndex}`}
                    onClick={() => openCreate("add")}
                  >
                    <Plus aria-hidden="true" weight="regular" />
                    <span>添加第 {slotIndex + 1} 款车</span>
                  </button>
                ),
              )}
            </div>

            <div className="matrix-body">
              {visibleConditions.map((condition) => (
                <div
                  className="matrix-data-row"
                  role="row"
                  key={condition.id}
                >
                  <div className="matrix-condition-cell" role="rowheader">
                    <span className="matrix-condition-icon">
                      <ConditionIcon condition={condition} />
                    </span>
                    <div>
                      <strong>{condition.title}</strong>
                      {condition.detail ? <small>{condition.detail}</small> : null}
                    </div>
                  </div>
                  {candidateSlots.map((candidate, slotIndex) => (
                    <div
                      className="matrix-outcome-cell"
                      role="cell"
                      key={`${condition.id}-${candidate?.id ?? slotIndex}`}
                    >
                      {candidate ? (
                        renderOutcome(candidate, condition)
                      ) : (
                        <span className="matrix-empty-value">—</span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
              {!visibleConditions.length ? (
                <div className="matrix-filter-empty">
                  当前没有待确认项，可以关闭筛选查看全部条件。
                </div>
              ) : null}
            </div>
          </section>

          <aside className="decision-sidebar" aria-label="市场背景与数据来源">
            <section
              className="sidebar-market"
              aria-labelledby="market-title"
            >
              <header className="sidebar-heading">
                <div>
                  <ChartLineUp aria-hidden="true" weight="regular" />
                  <h2 id="market-title">城市车系数据趋势</h2>
                </div>
                <span>{project.context.city} · {citySalesPeriodLabel}</span>
              </header>
              {!project.isDemo ? (
                <div className="market-legend" aria-label="图例">
                  {project.candidates.slice(0, 3).map((candidate, index) => {
                    const series = citySales.find(
                      (item) => item.candidateId === candidate.id,
                    );
                    return (
                      <span
                        className={series ? undefined : "is-unavailable"}
                        key={candidate.id}
                      >
                        <i
                          className={`market-tone-${index}`}
                          aria-hidden="true"
                        />
                        <b>{series?.series ?? candidate.vehicle.series}</b>
                        <small>
                          {series
                            ? `${series.statisticLabel} · 已返回 ${series.points.length}/6 月`
                            : "本次未返回可核验数据"}
                        </small>
                        <strong>
                          {series?.points.at(-1)
                            ? `${series.points.at(-1)?.month} ${series.points
                                .at(-1)
                                ?.value.toLocaleString("zh-CN")}${series.unit ?? "辆"}`
                            : "—"}
                        </strong>
                      </span>
                    );
                  })}
                </div>
              ) : null}
              {citySales.length ? (
                <>
                  <MarketSalesChart
                    candidateOrder={project.candidates
                      .slice(0, 3)
                      .map((candidate) => candidate.id)}
                    series={citySales.slice(0, 3)}
                  />
                  <p className="market-context-note">
                    不同统计口径仅查看各自趋势，不比较数值高低；仅作市场背景，不参与需求匹配结论。
                  </p>
                </>
              ) : (
                <p className="sidebar-empty">
                  {project.isDemo
                    ? "请填写车型并生成方案后查询真实城市车系数据；演示页不展示固定销量。"
                    : "本次未获得同时具备城市、车系、月份与统计口径的可核验趋势数据。"}
                </p>
              )}
            </section>

            <section
              className="sidebar-sources"
              aria-labelledby="sources-title"
            >
              <header className="sidebar-heading source-heading">
                <div>
                  <Database aria-hidden="true" weight="regular" />
                  <h2 id="sources-title">数据来源</h2>
                </div>
                <button type="button" onClick={() => setOverlay("evidence")}>
                  查看依据
                  <CaretRight aria-hidden="true" />
                </button>
              </header>
              <div className="source-summary-list">
                <div className="professional-source-summary">
                  <Database aria-hidden="true" weight="regular" />
                  <span>
                    <strong>专业数据集</strong>
                    <small>
                      {professionalDataStats.returnedFieldCount > 0
                        ? `已绑定 ${professionalDataStats.returnedFieldCount} 个车型字段 · 已用于 ${professionalDataStats.backedEvaluationCount} 个对比项${
                            professionalDataStats.unboundFieldCount
                              ? ` · 另 ${professionalDataStats.unboundFieldCount} 个维度未按已选车型返回`
                              : ""
                          } · `
                        : professionalDataStats.unboundFieldCount
                          ? `已返回 ${professionalDataStats.unboundFieldCount} 个相关维度 · 当前字段待补 · `
                          : "本次尚无可绑定字段 · "}
                      更新于{" "}
                      {formatUpdatedAt(
                        latestDataProEvidence?.capturedAt ?? project.updatedAt,
                      )}
                    </small>
                  </span>
                </div>
                <div>
                  <UserCircle aria-hidden="true" weight="regular" />
                  <span>
                    <strong>我的确认信息</strong>
                    <small>
                      {latestUserConfirmation
                        ? `更新于 ${formatUpdatedAt(
                            latestUserConfirmation.confirmedAt,
                          )}`
                        : "尚未补充本人确认"}
                    </small>
                  </span>
                </div>
              </div>
            </section>
          </aside>
        </div>

        <footer className="data-source-footer">
          <ShieldCheck aria-hidden="true" weight="regular" />
          <p>你的数据仅用于当前购车决策，不会向经销商发送线索。</p>
          <span>最后更新 {formatUpdatedAt(project.updatedAt)}</span>
          <button type="button" className="delete-link" onClick={deleteProject}>
            {project.isDemo ? "重新开始" : "删除当前项目"}
          </button>
        </footer>
      </div>

      {overlay === "create" ? (
        <CreateProjectDialog
          mode={createMode}
          initialProject={project}
          onClose={() => setOverlay(null)}
          onUnchanged={() => {
            setOverlay(null);
            setNotice({
              tone: "neutral",
              message: "内容没有变化，已保留当前结果。",
            });
          }}
          onRecover={() => setOverlay("recover")}
          onCreated={(payload) => {
            setProject(payload.project);
            if (payload.requiresIdentityConfirmation) {
              setRecoveryCode("");
              setNotice({
                tone: "neutral",
                message:
                  payload.harness?.message ||
                  "请先确认专业数据匹配到的具体车型。",
              });
              return;
            }
            setRecoveryCode(payload.recoveryCode ?? "");
            window.localStorage.setItem(
              "car-decision-project-id",
              payload.project.id,
            );
            setOverlay(null);
            setNotice({
              tone: payload.harness?.status === "ok" ? "success" : "warning",
              message:
                payload.harness?.message ||
                "项目已建立，可以按同一组条件查看车型差异。",
            });
          }}
        />
      ) : null}

      {overlay === "task" && activeIssue ? (
        <Dialog
          title={pendingActionLabel(activeIssue)}
          onClose={() => {
            setOverlay(null);
            setActiveIssueId(null);
          }}
        >
          <div className="task-dialog-copy">
            <span>
              {activeIssue.factFields?.length
                ? "专业数据已返回，待你判断"
                : issueMeta[activeIssue.pendingReason].owner}
            </span>
            <h3>{activeIssue.title}</h3>
            <p>{cleanSourceDisplayText(activeIssue.summary)}</p>
            <small>
              {activeIssue.factFields?.length
                ? "页面保留数据原值与来源；你只需要判断这些客观信息是否符合自己的标准。"
                : issueMeta[activeIssue.pendingReason].helper}
            </small>
          </div>
          <form className="task-form" onSubmit={submitIssue}>
            <fieldset className="answer-options">
              <legend>记录你的结果</legend>
              {issueMeta[activeIssue.pendingReason].options.map((option) => (
                <label
                  key={option}
                  className={selectedAnswer === option ? "selected" : ""}
                >
                  <input
                    type="radio"
                    name="task-result"
                    value={option}
                    checked={selectedAnswer === option}
                    onChange={(event) => {
                      setSelectedAnswer(event.target.value);
                      setTaskError("");
                      if (event.target.value !== "我已有完整报价") {
                        setQuoteTotalWan("");
                      }
                    }}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </fieldset>
            {requiresQuoteTotal ? (
              <label className="quote-total-field">
                <span>落地总价（万元）</span>
                <span className="quote-total-input">
                  <input
                    required
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    value={quoteTotalWan}
                    onChange={(event) => {
                      setQuoteTotalWan(event.target.value);
                      setTaskError("");
                    }}
                    placeholder="例如：28.60"
                    aria-describedby="quote-total-helper"
                  />
                  <small>万元</small>
                </span>
                <small id="quote-total-helper">
                  请输入大于 0 的真实落地总价，系统才会重新判断是否满足预算。
                </small>
              </label>
            ) : null}
            <label className="note-field">
              <span>补充说明（选填）</span>
              <textarea
              value={answerNote}
              onChange={(event) => setAnswerNote(event.target.value)}
              placeholder={
                activeIssue.pendingReason === PendingReason.QUOTE_REQUIRED
                  ? "例如：销售给出的完整落地报价为 28.6 万元"
                  : activeIssue.pendingReason ===
                      PendingReason.PERSONAL_EXPERIENCE_REQUIRED
                    ? "例如：记录你在实际地点、时段或试用中的体验"
                    : "补充这次确认的时间、依据或具体情况"
              }
              rows={3}
              />
            </label>
            {taskError ? (
              <p className="task-error" role="alert">
                {taskError}
              </p>
            ) : null}
            <button
              className="primary-action task-submit"
              type="submit"
              disabled={
                !selectedAnswer ||
                isSaving ||
                (requiresQuoteTotal && !quoteTotalIsValid)
              }
            >
              {isSaving ? "正在记录" : "记录并更新比较结果"}
            </button>
          </form>
        </Dialog>
      ) : null}

      {overlay === "recover" ? (
        <Dialog title="恢复购车决策助手项目" onClose={() => setOverlay(null)}>
          <form
            className="recover-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setIsSaving(true);
              try {
                const response = await fetch("/api/project/recover", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ projectId: projectCode, recoveryCode }),
                });
                const payload = (await response.json()) as ProjectResponse & {
                  error?: string;
                };
                if (!response.ok) {
                  throw new Error(payload.error || "无法恢复该项目");
                }
                setProject(payload.project);
                window.localStorage.setItem(
                  "car-decision-project-id",
                  payload.project.id,
                );
                setOverlay(null);
                setNotice({ tone: "success", message: "项目已恢复。" });
              } catch (error) {
                setNotice({
                  tone: "warning",
                  message:
                    error instanceof Error ? error.message : "无法恢复该项目",
                });
              } finally {
                setIsSaving(false);
              }
            }}
          >
            <label>
              <span>项目编号</span>
              <input
                required
                value={projectCode}
                onChange={(event) => setProjectCode(event.target.value)}
                placeholder="project_..."
              />
            </label>
            <label>
              <span>恢复码</span>
              <input
                required
                value={recoveryCode}
                onChange={(event) => setRecoveryCode(event.target.value)}
                placeholder="XXXX-XXXX-XXXX-XXXX"
              />
            </label>
            <button className="primary-action" type="submit" disabled={isSaving}>
              {isSaving ? "正在恢复" : "恢复项目"}
            </button>
          </form>
        </Dialog>
      ) : null}

      {overlay === "conditions" ? (
        <Dialog title="当前购车需求" onClose={() => setOverlay(null)}>
          <p className="dialog-intro">
            这些条件会同时用于每款候选车，避免比较时偷偷更换标准。
          </p>
          <div className="dialog-condition-list">
            <div>
              <span>城市</span>
              <strong>{project.context.city}</strong>
            </div>
            {project.conditions.map((condition) => (
              <div key={condition.id}>
                <span>
                  {condition.scope === "context"
                    ? "用车场景"
                    : condition.scope === "transaction"
                      ? "交易条件"
                      : condition.kind === "hard"
                        ? "硬条件"
                        : "偏好"}
                </span>
                <strong>{condition.title}</strong>
                {condition.detail ? <small>{condition.detail}</small> : null}
              </div>
            ))}
          </div>
          <button
            className="secondary-action"
            type="button"
            onClick={() => openCreate("add")}
          >
            修改条件并更新结果
          </button>
        </Dialog>
      ) : null}

      {overlay === "evidence" ? (
        <Dialog title="数据来源与计算依据" onClose={() => setOverlay(null)} wide>
          <div className="evidence-toolbar">
            <p className="dialog-intro">
              这里展示首次生成时使用的数据来源与核验状态。查询时间不等于数据生效时间；未经核验的搜索信息不会进入结论。
            </p>
          </div>
          <div
            className="evidence-data-summary"
            aria-label="专业数据集使用状态"
          >
            <div className="exact">
              <span>精确绑定到当前车型</span>
              <strong>{professionalDataStats.returnedFieldCount}</strong>
              <small>个字段</small>
            </div>
            <div className="used">
              <span>已用于需求对比</span>
              <strong>{professionalDataStats.backedEvaluationCount}</strong>
              <small>项</small>
            </div>
            <div className="unbound">
              <span>未按已选车型返回</span>
              <strong>{professionalDataStats.unboundFieldCount}</strong>
              <small>个维度</small>
            </div>
          </div>
          <div className="evidence-list">
            {(project.issues ?? []).map((issue, index) => (
              <article key={`${issue.code}-${issue.candidateId ?? index}`}>
                <div>
                  <span className="evidence-source needs_review">
                    {issue.code}
                  </span>
                  <h3>{issue.candidateName ?? "项目数据状态"}</h3>
                  <p>{issue.message}</p>
                  <small>
                    阶段：{issue.stage}
                    {issue.retryable ? " · 可重试" : " · 无需重新选择车型"}
                  </small>
                </div>
              </article>
            ))}
            {sourceEvidence.map((evidence) => (
              <article key={evidence.id}>
                <div>
                  <span
                    className={`evidence-source ${evidence.status}`}
                  >
                    {evidence.sourceName} · {evidenceStatusCopy(evidence)}
                  </span>
                  <h3>{evidence.title}</h3>
                  <p>{cleanSourceDisplayText(evidence.summary)}</p>
                  <small>查询于 {formatUpdatedAt(evidence.capturedAt)}</small>
                  {evidence.traceId ||
                  evidence.requestId ||
                  evidence.upstreamRequestId ? (
                    <code>
                      {[
                        evidence.traceId
                          ? `trace: ${evidence.traceId}`
                          : null,
                        evidence.requestId
                          ? `request: ${evidence.requestId}`
                          : null,
                        evidence.upstreamRequestId
                          ? `upstream: ${evidence.upstreamRequestId}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join("\n")}
                    </code>
                  ) : null}
                  {evidence.sourceUrl ? (
                    <a
                      href={evidence.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      打开来源
                    </a>
                  ) : null}
                </div>
              </article>
            ))}
            {!sourceEvidence.length
              ? project.evaluations
                  .filter((evaluation) => evaluation.evidenceRefs?.length)
                  .map((evaluation) => {
                    const condition = project.conditions.find(
                      (item) => item.id === evaluation.conditionId,
                    );
                    const candidate = project.candidates.find(
                      (item) => item.id === evaluation.candidateId,
                    );
                    return (
                      <article
                        key={`${evaluation.candidateId}-${evaluation.conditionId}`}
                      >
                        <div>
                          <span className="evidence-source needs_review">
                            已核验信息
                          </span>
                          <h3>{condition?.title}</h3>
                          <p>
                            {candidate
                              ? `${formatCandidateTitle(candidate)}：`
                              : ""}
                            {cleanSourceDisplayText(evaluation.summary)}
                          </p>
                        </div>
                        <code>{evaluation.evidenceRefs?.join("\n")}</code>
                      </article>
                    );
                  })
              : null}
            {!sourceEvidence.length &&
            !project.evaluations.some(
              (evaluation) => evaluation.evidenceRefs?.length,
            ) ? (
              <div className="empty-evidence">
                首次生成未获得可展示的来源记录，系统没有使用模型记忆补齐。
              </div>
            ) : null}
          </div>
        </Dialog>
      ) : null}

      {!project.isDemo && recoveryCode ? (
        <div className="recovery-banner" role="status" aria-live="polite">
          <div>
            <strong>请记录恢复信息</strong>
            <span>项目编号 {project.id}</span>
            <code>{recoveryCode}</code>
          </div>
          <button type="button" onClick={() => setRecoveryCode("")}>
            我已记录
          </button>
        </div>
      ) : null}
    </main>
  );
}

function Dialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    closeButtonRef.current?.focus();
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`dialog-card ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-heading">
          <h2 id="dialog-title">{title}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="关闭弹窗"
          >
            关闭
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function CreateProjectDialog({
  mode,
  initialProject,
  onClose,
  onUnchanged,
  onRecover,
  onCreated,
}: {
  mode: CreateMode;
  initialProject?: DecisionProject;
  onClose: () => void;
  onUnchanged: () => void;
  onRecover: () => void;
  onCreated: (payload: ProjectResponse) => void;
}) {
  const draftKey = `car-decision-form-draft:v1:${mode}:${
    initialProject?.id ?? "new"
  }`;
  const [savedDraft] = useState(() => readCreateProjectDraft(draftKey));
  const initialCandidates =
    savedDraft?.candidates ??
    (initialProject
      ? initialProject.candidates.map((candidate) =>
          formatCandidateName(initialProject, candidate.id),
        )
      : [
          "理想 L6 2025款 Max 智能焕新版",
          "问界 M7 2025款 纯电 Max 长续航版 5座",
        ]);
  const candidatesWithEmptySlot =
    mode === "add" && initialCandidates.length < 3
      ? [...initialCandidates, ""]
      : initialCandidates;
  const storedBudgetWan =
    initialProject?.context.maxBudgetWan ??
    (() => {
      const budgetRule = initialProject?.conditions.find(
        (condition) =>
          condition.category === ConditionCategory.BUDGET &&
          condition.rule?.field === "landing_price_cny" &&
          typeof condition.rule.value === "number",
      )?.rule;
      return typeof budgetRule?.value === "number"
        ? budgetRule.value / 10_000
        : 30;
    })();
  const storedNeed =
    initialProject?.context.need?.trim() ||
    initialProject?.conditions.find(
      (condition) =>
        condition.category === ConditionCategory.PERSONAL_EXPERIENCE &&
        condition.detail?.trim(),
    )?.detail?.trim() ||
    initialProject?.conditions.map((condition) => condition.title).join("；") ||
    "一个人开，每天通勤30km，没有家充，必须5座，CLTC纯电续航至少200km，必须双电机四驱。";
  const [city, setCity] = useState(
    savedDraft?.city ?? initialProject?.context.city ?? "杭州",
  );
  const [purchaseTime, setPurchaseTime] = useState(
    savedDraft?.purchaseTime ??
      initialProject?.context.purchaseTime ??
      "未来 1–3 个月",
  );
  const [maxBudget, setMaxBudget] = useState(
    savedDraft?.maxBudget ?? String(storedBudgetWan),
  );
  const [need, setNeed] = useState(savedDraft?.need ?? storedNeed);
  const [candidates, setCandidates] = useState(candidatesWithEmptySlot);
  const [candidateIdentityIds, setCandidateIdentityIds] = useState(() =>
    candidatesWithEmptySlot.map(
      (_, index) => savedDraft?.candidateIdentityIds[index] ?? "",
    ),
  );
  const [identityProject, setIdentityProject] = useState<
    DecisionProject | undefined
  >(savedDraft?.identityProject ?? initialProject);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasPendingIdentityChoice = Boolean(
    identityProject?.candidates.some(
      (candidate) => candidate.identityOptions?.length,
    ),
  );
  const formIsUnchanged = Boolean(
    initialProject &&
      !hasPendingIdentityChoice &&
      isProjectFormUnchanged(
        {
          city,
          purchaseTime,
          maxBudgetWan: maxBudget,
          candidates,
          need,
        },
        {
          city: initialProject.context.city,
          purchaseTime:
            initialProject.context.purchaseTime ?? "未来 1–3 个月",
          maxBudgetWan: storedBudgetWan,
          candidates: initialProject.candidates.map((candidate) =>
            formatCandidateName(initialProject, candidate.id),
          ),
          need: storedNeed,
        },
      ),
  );

  useEffect(() => {
    const draft: CreateProjectDraft = {
      city,
      purchaseTime,
      maxBudget,
      need,
      candidates,
      candidateIdentityIds,
      identityProject:
        identityProject && !identityProject.isDemo
          ? identityProject
          : undefined,
    };
    window.localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [
    candidateIdentityIds,
    candidates,
    city,
    draftKey,
    identityProject,
    maxBudget,
    need,
    purchaseTime,
  ]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (formIsUnchanged) {
      window.localStorage.removeItem(draftKey);
      setError("");
      onUnchanged();
      return;
    }
    const usableCandidateEntries = candidates
      .map((item, index) => {
        const identityId = candidateIdentityIds[index] || null;
        const identityCandidate = identityProject?.candidates[index];
        const selectedOption = identityCandidate?.identityOptions?.find(
          (option) => option.exactModelId === identityId,
        );
        const automaticallyResolvedName =
          identityId &&
          identityCandidate &&
          /^(?:datapro|datapro-name):/.test(
            identityCandidate.vehicle.exactModelId,
          ) &&
          !identityCandidate.identityOptions?.length
            ? formatCandidateTitle(identityCandidate)
            : null;
        return {
          name:
            selectedOption?.displayName ??
            automaticallyResolvedName ??
            item.trim(),
          identityId,
        };
      })
      .filter((candidate) => candidate.name);
    const usableCandidates = usableCandidateEntries.map(
      (candidate) => candidate.name,
    );
    if (!usableCandidates.length || usableCandidates.length > 3) {
      setError("请填写 1–3 款想对比的车型。");
      return;
    }
    const missingIdentitySelectionIndex = candidates.findIndex(
      (candidate, index) =>
        Boolean(candidate.trim()) &&
        Boolean(
          identityProject?.candidates[index]?.identityOptions?.length,
        ) &&
        !candidateIdentityIds[index],
    );
    if (missingIdentitySelectionIndex >= 0) {
      setError(
        `请先为候选车型 ${missingIdentitySelectionIndex + 1} 选择具体版本。`,
      );
      return;
    }
    const invalidCandidateIndex = usableCandidates.findIndex((candidate) =>
      candidateNameIssue(candidate),
    );
    if (invalidCandidateIndex >= 0) {
      setError(
        `候选车型 ${invalidCandidateIndex + 1}${candidateNameIssue(
          usableCandidates[invalidCandidateIndex],
        )}`,
      );
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/project", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          city,
          purchaseTime,
          maxBudgetWan: Number(maxBudget),
          candidates: usableCandidates,
          candidateIdentityIds: usableCandidateEntries.map(
            (candidate) => candidate.identityId,
          ),
          need,
          ...(mode === "add" &&
          initialProject &&
          !initialProject.isDemo
            ? { replaceProjectId: initialProject.id }
            : {}),
        }),
      });
      const payload = (await response.json()) as ProjectResponse & {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "建立项目失败");
      if (payload.requiresIdentityConfirmation) {
        setIdentityProject(payload.project);
        setCandidates((current) =>
          payload.project.candidates.map((candidate, index) => {
            if (candidate.identityOptions?.length) {
              return current[index] ?? "";
            }
            return /^(?:datapro|datapro-name):/.test(
              candidate.vehicle.exactModelId,
            )
              ? formatCandidateTitle(candidate)
              : current[index] ?? "";
          }),
        );
        setCandidateIdentityIds((current) =>
          payload.project.candidates.map((candidate, index) => {
            if (candidate.identityOptions?.length) {
              return current[index] ?? "";
            }
            return /^(?:datapro|datapro-name):/.test(
              candidate.vehicle.exactModelId,
            )
              ? candidate.vehicle.exactModelId
              : current[index] ?? "";
          }),
        );
        const identityOptionCount = payload.project.candidates.reduce(
          (count, candidate) =>
            count + (candidate.identityOptions?.length ?? 0),
          0,
        );
        setError(
          payload.code === "VEHICLE_SERIES_NOT_FOUND"
            ? "部分车型没有返回可核验版本，请补充品牌、年款或配置名称。"
            : identityOptionCount > 1
            ? "已找到多个匹配版本。请在对应车型下方选择具体版本。"
            : identityOptionCount === 1
              ? "已找到 1 个可能版本。请确认是否为你想对比的车型。"
            : "专业数据暂未返回可唯一绑定的版本，请补充车系、年款或配置后重试。",
        );
        return;
      }
      window.localStorage.removeItem(draftKey);
      onCreated(payload);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "建立项目失败，请稍后重试。",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      title={mode === "add" ? "调整车型或需求" : "重新选择车型"}
      onClose={onClose}
      wide
    >
      <form className="create-form" onSubmit={submit}>
        <p className="dialog-intro">
          填写你知道的品牌或车系即可。系统会先匹配具体车型，再用同一组条件完成对比。
        </p>
        <div className="setup-grid">
          <label>
            <span>所在城市</span>
            <input
              required
              value={city}
              onChange={(event) => setCity(event.target.value)}
            />
          </label>
          <label>
            <span>计划购车时间</span>
            <select
              value={purchaseTime}
              onChange={(event) => setPurchaseTime(event.target.value)}
            >
              <option>一个月内</option>
              <option>未来 1–3 个月</option>
              <option>半年内</option>
              <option>还没确定</option>
            </select>
          </label>
          <label>
            <span>最高落地预算</span>
            <span className="suffix-input">
              <input
                required
                min="1"
                max="500"
                type="number"
                value={maxBudget}
                onChange={(event) => setMaxBudget(event.target.value)}
              />
              <small>万元</small>
            </span>
          </label>
        </div>

        <fieldset className="candidate-fields">
          <legend>想对比的车（品牌或车系即可）</legend>
          {candidates.map((candidate, index) => (
            <div key={index}>
              <span>{index === 0 ? "当前目标" : `候选 ${index + 1}`}</span>
              <input
                required={index === 0}
                value={candidate}
                onChange={(event) => {
                  setIdentityProject(undefined);
                  setCandidates((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? event.target.value : item,
                    ),
                  );
                  setCandidateIdentityIds((current) =>
                    current.map((identityId, itemIndex) =>
                      itemIndex === index ? "" : identityId,
                    ),
                  );
                }}
                placeholder="例如：理想 L6、奔驰 GLC"
              />
              {candidates.length > 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    setIdentityProject(undefined);
                    setCandidates((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    );
                    setCandidateIdentityIds((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    );
                  }}
                >
                  移除
                </button>
              ) : null}
              {identityProject?.candidates[index]?.identityOptions?.length ? (
                <select
                  className="candidate-match-select"
                  aria-label={`候选车型 ${index + 1} 的专业数据匹配结果`}
                  value={candidateIdentityIds[index] ?? ""}
                  onChange={(event) => {
                    if (!event.target.value) return;
                    const selected =
                      identityProject.candidates[index].identityOptions?.find(
                        (option) =>
                          option.exactModelId === event.target.value,
                      );
                    if (!selected) return;
                    setCandidates((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? selected.displayName : item,
                      ),
                    );
                    setCandidateIdentityIds((current) =>
                      current.map((identityId, itemIndex) =>
                        itemIndex === index
                          ? selected.exactModelId
                          : identityId,
                      ),
                    );
                  }}
                >
                <option value="">
                  请选择专业数据匹配到的具体车型
                </option>
                  {identityProject.candidates[index].identityOptions?.map(
                    (option) => (
                      <option
                        value={option.exactModelId}
                        key={option.exactModelId}
                      >
                        {option.displayName}
                      </option>
                    ),
                  )}
                </select>
              ) : identityProject &&
                !identityProject.isDemo &&
                !/^(?:datapro|datapro-name):/.test(
                  identityProject.candidates[index]?.vehicle.exactModelId ?? "",
              ) ? (
                <small className="candidate-match-help">
                  专业数据暂未返回可唯一绑定的车型，请补充车系、年款或配置后重试。
                </small>
              ) : null}
            </div>
          ))}
          {candidates.length < 3 ? (
            <button
              type="button"
              className="add-candidate"
              onClick={() => {
                setIdentityProject(undefined);
                setCandidates((current) => [...current, ""]);
                setCandidateIdentityIds((current) => [...current, ""]);
              }}
            >
              <Plus aria-hidden="true" />
              再加一款候选
            </button>
          ) : null}
          <small className="candidate-fields-help">
            不知道年款和配置没关系；匹配到多个版本时，再从专业数据结果中选择。
          </small>
        </fieldset>

        <label className="need-field">
          <span>平时怎么用车、最看重什么、最不能接受什么？</span>
          <textarea
            required
            value={need}
            onChange={(event) => setNeed(event.target.value)}
            rows={4}
          />
          <small>模型只负责整理成可编辑条件，不会凭记忆生成车型事实。</small>
        </label>

        {error ? <p className="form-error">{error}</p> : null}
        <div className="dialog-actions">
          <button className="dialog-recover" type="button" onClick={onRecover}>
            恢复已有项目
          </button>
          <button className="secondary-action" type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary-action" type="submit" disabled={isSubmitting}>
            {formIsUnchanged
              ? "确定"
              : isSubmitting
              ? identityProject && !identityProject.isDemo
                ? "正在核验并生成结果"
                : "正在匹配车型与需求"
              : identityProject && !identityProject.isDemo
                ? "确认车型并生成结果"
                : "匹配车型并生成结果"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
