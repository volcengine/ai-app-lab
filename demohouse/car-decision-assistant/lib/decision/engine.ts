import {
  ConditionCategory,
  ConfirmationDependency,
  DecisionStatus,
  MAX_CANDIDATES,
  PendingReason,
  type ApplyDecisionChangesResult,
  type CandidateDecisionSummary,
  type ConditionEvaluation,
  type ConfirmationBasis,
  type ConfirmationDependency as ConfirmationDependencyType,
  type DecisionChanges,
  type DecisionProject,
  type DecisionStatus as DecisionStatusType,
  type DecisionSummary,
  type PendingIssue,
  type VehicleCandidate,
} from "./types";

const PENDING_PRIORITY: Record<ConditionCategory, number> = {
  [ConditionCategory.SAFETY]: 0,
  [ConditionCategory.BUDGET]: 0,
  [ConditionCategory.CONFIGURATION]: 1,
  [ConditionCategory.PERSONAL_EXPERIENCE]: 2,
  [ConditionCategory.SALES_WRITTEN]: 3,
  [ConditionCategory.PREFERENCE]: 4,
};

const VALID_STATUSES = new Set<string>(Object.values(DecisionStatus));
const VALID_PENDING_REASONS = new Set<string>(Object.values(PendingReason));
const VALID_CATEGORIES = new Set<string>(Object.values(ConditionCategory));
const VALID_DEPENDENCIES = new Set<string>(
  Object.values(ConfirmationDependency),
);

export class DecisionInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecisionInputError";
  }
}

function assertNonEmpty(value: string, path: string): void {
  if (value.trim().length === 0) {
    throw new DecisionInputError(`${path} must not be empty`);
  }
}

function assertUnique(values: string[], path: string): void {
  if (new Set(values).size !== values.length) {
    throw new DecisionInputError(`${path} must contain unique values`);
  }
}

/**
 * Validates the domain invariant at an API or persistence boundary.
 */
export function assertDecisionProject(
  project: DecisionProject,
): asserts project is DecisionProject {
  assertNonEmpty(project.id, "project.id");
  assertNonEmpty(project.title, "project.title");
  assertNonEmpty(project.updatedAt, "project.updatedAt");
  assertNonEmpty(project.context.city, "project.context.city");
  assertNonEmpty(
    project.context.paymentMethod,
    "project.context.paymentMethod",
  );

  if (
    project.candidates.length < 1 ||
    project.candidates.length > MAX_CANDIDATES
  ) {
    throw new DecisionInputError(
      `project.candidates must contain between 1 and ${MAX_CANDIDATES} candidates`,
    );
  }

  assertUnique(
    project.candidates.map((candidate) => candidate.id),
    "candidate ids",
  );
  assertUnique(
    project.candidates.map((candidate) => candidate.vehicle.exactModelId),
    "candidate exactModelIds",
  );

  const targets = project.candidates.filter(
    (candidate) => candidate.role === "target",
  );
  if (targets.length !== 1) {
    throw new DecisionInputError(
      "project.candidates must contain exactly one target",
    );
  }

  for (const [index, candidate] of project.candidates.entries()) {
    assertCandidate(candidate, `project.candidates[${index}]`);
  }

  if (project.conditions.length < 1) {
    throw new DecisionInputError(
      "project.conditions must contain at least one condition",
    );
  }
  assertUnique(
    project.conditions.map((condition) => condition.id),
    "condition ids",
  );

  for (const [index, condition] of project.conditions.entries()) {
    assertNonEmpty(condition.id, `project.conditions[${index}].id`);
    assertNonEmpty(condition.title, `project.conditions[${index}].title`);
    if (!VALID_CATEGORIES.has(condition.category)) {
      throw new DecisionInputError(
        `project.conditions[${index}].category is invalid`,
      );
    }
    if (condition.kind !== "hard" && condition.kind !== "preference") {
      throw new DecisionInputError(
        `project.conditions[${index}].kind is invalid`,
      );
    }
  }

  const candidateIds = new Set(
    project.candidates.map((candidate) => candidate.id),
  );
  const conditionIds = new Set(
    project.conditions.map((condition) => condition.id),
  );
  const matrixKeys = new Set<string>();

  for (const [index, evaluation] of project.evaluations.entries()) {
    if (!candidateIds.has(evaluation.candidateId)) {
      throw new DecisionInputError(
        `project.evaluations[${index}] references an unknown candidate`,
      );
    }
    if (!conditionIds.has(evaluation.conditionId)) {
      throw new DecisionInputError(
        `project.evaluations[${index}] references an unknown condition`,
      );
    }
    assertEvaluation(evaluation, `project.evaluations[${index}]`);

    const key = evaluationKey(
      evaluation.conditionId,
      evaluation.candidateId,
    );
    if (matrixKeys.has(key)) {
      throw new DecisionInputError(
        `duplicate evaluation for condition "${evaluation.conditionId}" and candidate "${evaluation.candidateId}"`,
      );
    }
    matrixKeys.add(key);
  }

  const expectedEvaluationCount =
    project.candidates.length * project.conditions.length;
  if (matrixKeys.size !== expectedEvaluationCount) {
    throw new DecisionInputError(
      "project.evaluations must contain exactly one evaluation for every condition and exact candidate",
    );
  }
}

function assertCandidate(candidate: VehicleCandidate, path: string): void {
  assertNonEmpty(candidate.id, `${path}.id`);
  if (candidate.role !== "target" && candidate.role !== "alternative") {
    throw new DecisionInputError(`${path}.role is invalid`);
  }
  assertNonEmpty(candidate.vehicle.exactModelId, `${path}.vehicle.exactModelId`);
  assertNonEmpty(candidate.vehicle.manufacturer, `${path}.vehicle.manufacturer`);
  assertNonEmpty(candidate.vehicle.series, `${path}.vehicle.series`);
  assertNonEmpty(candidate.vehicle.modelYear, `${path}.vehicle.modelYear`);
  assertNonEmpty(candidate.vehicle.trim, `${path}.vehicle.trim`);
  if (candidate.quote) {
    assertNonEmpty(candidate.quote.version, `${path}.quote.version`);
    if (
      candidate.quote.totalAmountCny !== undefined &&
      (!Number.isFinite(candidate.quote.totalAmountCny) ||
        candidate.quote.totalAmountCny < 0)
    ) {
      throw new DecisionInputError(
        `${path}.quote.totalAmountCny must be a non-negative finite number`,
      );
    }
  }
}

function assertEvaluation(
  evaluation: ConditionEvaluation,
  path: string,
): void {
  if (!VALID_STATUSES.has(evaluation.status)) {
    throw new DecisionInputError(`${path}.status is invalid`);
  }
  assertNonEmpty(evaluation.summary, `${path}.summary`);

  if (evaluation.status === DecisionStatus.PENDING) {
    if (
      evaluation.pendingReason === undefined ||
      !VALID_PENDING_REASONS.has(evaluation.pendingReason)
    ) {
      throw new DecisionInputError(
        `${path}.pendingReason must be a valid reason when status is pending`,
      );
    }
  } else if (evaluation.pendingReason !== undefined) {
    throw new DecisionInputError(
      `${path}.pendingReason is only allowed when status is pending`,
    );
  }

  const confirmation = evaluation.userConfirmation;
  if (!confirmation) {
    return;
  }

  assertNonEmpty(confirmation.confirmedAt, `${path}.userConfirmation.confirmedAt`);
  assertUnique(
    confirmation.dependsOn,
    `${path}.userConfirmation.dependsOn`,
  );
  for (const dependency of confirmation.dependsOn) {
    if (!VALID_DEPENDENCIES.has(dependency)) {
      throw new DecisionInputError(
        `${path}.userConfirmation.dependsOn contains an invalid dependency`,
      );
    }
    if (confirmation.basis[dependency] === undefined) {
      throw new DecisionInputError(
        `${path}.userConfirmation.basis.${dependency} is required`,
      );
    }
  }
}

function evaluationKey(conditionId: string, candidateId: string): string {
  return `${conditionId}\u0000${candidateId}`;
}

/**
 * Conflict always outranks pending; pending outranks confirmed.
 */
export function aggregateStatuses(
  statuses: readonly DecisionStatusType[],
): DecisionStatusType {
  if (statuses.some((status) => status === DecisionStatus.CONFLICT)) {
    return DecisionStatus.CONFLICT;
  }
  if (statuses.some((status) => status === DecisionStatus.PENDING)) {
    return DecisionStatus.PENDING;
  }
  return DecisionStatus.CONFIRMED;
}

export function summarizeCandidate(
  project: DecisionProject,
  candidateId: string,
): CandidateDecisionSummary {
  const candidate = project.candidates.find((item) => item.id === candidateId);
  if (!candidate) {
    throw new DecisionInputError(`unknown candidate "${candidateId}"`);
  }

  const evaluations = project.evaluations.filter(
    (evaluation) => evaluation.candidateId === candidateId,
  );
  const count = (status: DecisionStatusType) =>
    evaluations.filter((evaluation) => evaluation.status === status).length;

  return {
    candidateId,
    status: aggregateStatuses(
      evaluations.map((evaluation) => evaluation.status),
    ),
    confirmedCount: count(DecisionStatus.CONFIRMED),
    pendingCount: count(DecisionStatus.PENDING),
    conflictCount: count(DecisionStatus.CONFLICT),
  };
}

export interface SelectPendingIssueOptions {
  /**
   * The product home focuses on the current target. "all" is available for a
   * comparison drawer, while the result is still capped at three.
   */
  scope?: "target" | "all";
  limit?: number;
}

export function selectTopPendingIssues(
  project: DecisionProject,
  options: SelectPendingIssueOptions = {},
): PendingIssue[] {
  const targetId = getTargetCandidate(project).id;
  const scope = options.scope ?? "target";
  const limit = Math.max(0, Math.min(MAX_CANDIDATES, options.limit ?? 3));
  const conditionOrder = new Map(
    project.conditions.map((condition, index) => [
      condition.id,
      condition.order ?? index,
    ]),
  );
  const candidateOrder = new Map(
    project.candidates.map((candidate, index) => [candidate.id, index]),
  );

  return project.evaluations
    .filter(
      (evaluation) =>
        evaluation.status === DecisionStatus.PENDING &&
        (scope === "all" || evaluation.candidateId === targetId),
    )
    .map((evaluation): PendingIssue => {
      const condition = project.conditions.find(
        (item) => item.id === evaluation.conditionId,
      );
      if (!condition || !evaluation.pendingReason) {
        throw new DecisionInputError(
          "cannot select pending issue from an invalid evaluation matrix",
        );
      }
      return {
        id: evaluationKey(evaluation.conditionId, evaluation.candidateId),
        candidateId: evaluation.candidateId,
        conditionId: evaluation.conditionId,
        title: condition.title,
        detail: condition.detail,
        category: condition.category,
        kind: condition.kind,
        pendingReason: evaluation.pendingReason,
        summary: evaluation.summary,
      };
    })
    .sort((left, right) => {
      const priority =
        PENDING_PRIORITY[left.category] - PENDING_PRIORITY[right.category];
      if (priority !== 0) {
        return priority;
      }

      const targetPriority =
        Number(right.candidateId === targetId) -
        Number(left.candidateId === targetId);
      if (targetPriority !== 0) {
        return targetPriority;
      }

      const kindPriority =
        Number(left.kind === "preference") -
        Number(right.kind === "preference");
      if (kindPriority !== 0) {
        return kindPriority;
      }

      const conditionPriority =
        (conditionOrder.get(left.conditionId) ?? 0) -
        (conditionOrder.get(right.conditionId) ?? 0);
      if (conditionPriority !== 0) {
        return conditionPriority;
      }

      const candidatePriority =
        (candidateOrder.get(left.candidateId) ?? 0) -
        (candidateOrder.get(right.candidateId) ?? 0);
      if (candidatePriority !== 0) {
        return candidatePriority;
      }

      return left.id.localeCompare(right.id);
    })
    .slice(0, limit);
}

/**
 * The top status intentionally follows the current target. A hard conflict in
 * an alternative must not turn a viable target into a conflict.
 */
export function summarizeDecision(project: DecisionProject): DecisionSummary {
  assertDecisionProject(project);
  const target = getTargetCandidate(project);
  const candidates = project.candidates.map((candidate) =>
    summarizeCandidate(project, candidate.id),
  );
  const targetSummary = candidates.find(
    (candidate) => candidate.candidateId === target.id,
  );

  if (!targetSummary) {
    throw new DecisionInputError("target candidate summary is missing");
  }

  return {
    status: targetSummary.status,
    targetCandidateId: target.id,
    candidates,
    topPendingIssues: selectTopPendingIssues(project),
  };
}

function getTargetCandidate(project: DecisionProject): VehicleCandidate {
  const target = project.candidates.find(
    (candidate) => candidate.role === "target",
  );
  if (!target) {
    throw new DecisionInputError("project has no target candidate");
  }
  return target;
}

function currentBasis(
  project: DecisionProject,
  candidate: VehicleCandidate,
): Required<ConfirmationBasis> {
  return {
    modelYear: candidate.vehicle.modelYear,
    trim: candidate.vehicle.trim,
    city: project.context.city,
    paymentMethod: project.context.paymentMethod,
    quoteVersion: candidate.quote?.version ?? "",
  };
}

function findInvalidatedDependencies(
  evaluation: ConditionEvaluation,
  project: DecisionProject,
): ConfirmationDependencyType[] {
  const confirmation = evaluation.userConfirmation;
  if (!confirmation) {
    return [];
  }

  const candidate = project.candidates.find(
    (item) => item.id === evaluation.candidateId,
  );
  if (!candidate) {
    return [];
  }

  const basis = currentBasis(project, candidate);
  return confirmation.dependsOn.filter(
    (dependency) => confirmation.basis[dependency] !== basis[dependency],
  );
}

/**
 * Applies context/candidate changes without mutating the original project and
 * turns only affected user confirmations back into pending work.
 */
export function applyDecisionChanges(
  project: DecisionProject,
  changes: DecisionChanges,
): ApplyDecisionChangesResult {
  assertDecisionProject(project);
  assertNonEmpty(changes.updatedAt, "changes.updatedAt");

  const patches = new Map(
    (changes.candidates ?? []).map((change) => [
      change.candidateId,
      change,
    ]),
  );
  for (const candidateId of patches.keys()) {
    if (!project.candidates.some((candidate) => candidate.id === candidateId)) {
      throw new DecisionInputError(
        `change references unknown candidate "${candidateId}"`,
      );
    }
  }

  const nextCandidates = project.candidates.map((candidate) => {
    const patch = patches.get(candidate.id);
    if (!patch) {
      return candidate;
    }
    return {
      ...candidate,
      vehicle: {
        ...candidate.vehicle,
        ...patch.vehicle,
      },
      quote:
        patch.quote === undefined
          ? candidate.quote
          : patch.quote === null
            ? undefined
            : { ...patch.quote },
    };
  });

  const nextProjectWithoutEvaluations: DecisionProject = {
    ...project,
    updatedAt: changes.updatedAt,
    context: {
      ...project.context,
      ...changes.context,
    },
    candidates: nextCandidates,
    evaluations: project.evaluations,
  };

  const invalidatedConfirmations: ApplyDecisionChangesResult["invalidatedConfirmations"] =
    [];
  const nextEvaluations = project.evaluations.map((evaluation) => {
    const invalidatedBy = findInvalidatedDependencies(
      evaluation,
      nextProjectWithoutEvaluations,
    );
    if (invalidatedBy.length === 0 || !evaluation.userConfirmation) {
      return evaluation;
    }

    invalidatedConfirmations.push({
      candidateId: evaluation.candidateId,
      conditionId: evaluation.conditionId,
      invalidatedBy,
    });
    return {
      ...evaluation,
      status: DecisionStatus.PENDING,
      pendingReason: PendingReason.CONFIRMATION_INVALIDATED,
      summary: "原确认所依据的信息已变化，需要重新确认",
      userConfirmation: {
        ...evaluation.userConfirmation,
        invalidatedBy,
      },
    };
  });

  const nextProject: DecisionProject = {
    ...nextProjectWithoutEvaluations,
    evaluations: nextEvaluations,
  };
  assertDecisionProject(nextProject);

  return {
    project: nextProject,
    invalidatedConfirmations,
  };
}
