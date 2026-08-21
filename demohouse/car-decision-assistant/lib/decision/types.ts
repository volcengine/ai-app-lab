export const MAX_CANDIDATES = 3;

export const DecisionStatus = {
  CONFIRMED: "confirmed",
  CONFLICT: "conflict",
  PENDING: "pending",
} as const;

export type DecisionStatus =
  (typeof DecisionStatus)[keyof typeof DecisionStatus];

export const PendingReason = {
  MISSING_VEHICLE_DATA: "missing_vehicle_data",
  CONFIGURATION_UNVERIFIED: "configuration_unverified",
  PERSONAL_EXPERIENCE_REQUIRED: "personal_experience_required",
  SALES_WRITTEN_CONFIRMATION_REQUIRED:
    "sales_written_confirmation_required",
  QUOTE_REQUIRED: "quote_required",
  CONFIRMATION_INVALIDATED: "confirmation_invalidated",
} as const;

export type PendingReason =
  (typeof PendingReason)[keyof typeof PendingReason];

export const ConditionCategory = {
  SAFETY: "safety",
  BUDGET: "budget",
  CONFIGURATION: "configuration",
  PERSONAL_EXPERIENCE: "personal_experience",
  SALES_WRITTEN: "sales_written",
  PREFERENCE: "preference",
} as const;

export type ConditionCategory =
  (typeof ConditionCategory)[keyof typeof ConditionCategory];

export type ConditionKind = "hard" | "preference";
export type CandidateRole = "target" | "alternative";

export type DecisionRuleOperator =
  | "lte"
  | "gte"
  | "eq"
  | "ne"
  | "includes"
  | "between"
  | "in"
  | "not_in"
  | "exists"
  | "not_exists"
  | "unknown";

export type DecisionRuleValue =
  | string
  | number
  | boolean
  | null
  | Array<string | number | boolean>;

export interface DecisionRule {
  field: string;
  operator: DecisionRuleOperator;
  value: DecisionRuleValue;
  unit?: string;
}

export interface VehicleFact {
  field: string;
  label: string;
  value: string;
  normalizedValue?: string | number | boolean;
  unit?: string;
  source: "datapro" | "user_quote";
  capturedAt: string;
  evidenceId?: string;
}

export interface DecisionEvidence {
  id: string;
  candidateId?: string;
  sourceType: "datapro" | "user";
  sourceName: string;
  title: string;
  summary: string;
  status: "current" | "needs_review" | "unavailable";
  sourceUrl?: string;
  capturedAt: string;
  requestId?: string;
  upstreamRequestId?: string;
  traceId?: string;
  logId?: string;
}

export interface CitySalesPoint {
  month: string;
  monthKey?: string;
  value: number;
  extras?: Record<string, unknown>;
}

/**
 * City-level series data is market background only. It is never used as a
 * condition-matching fact for an exact vehicle configuration.
 */
export interface CitySalesSeries {
  id: string;
  candidateId: string;
  city: string;
  series: string;
  periodLabel: string;
  statisticLabel: string;
  metricKey?: string;
  metricDefinition?: string;
  unit?: string;
  dataLevel?: string;
  datasetType?: string;
  requestId?: string;
  traceId?: string;
  points: CitySalesPoint[];
  capturedAt: string;
  evidenceId?: string;
}

export const ConfirmationDependency = {
  MODEL_YEAR: "modelYear",
  TRIM: "trim",
  CITY: "city",
  PAYMENT_METHOD: "paymentMethod",
  QUOTE_VERSION: "quoteVersion",
} as const;

export type ConfirmationDependency =
  (typeof ConfirmationDependency)[keyof typeof ConfirmationDependency];

export interface ExactVehicle {
  /**
   * A stable ID returned by the vehicle data source. It must identify one exact
   * model year and trim, not merely a model series.
   */
  exactModelId: string;
  manufacturer: string;
  series: string;
  modelYear: string;
  trim: string;
}

export interface QuoteSnapshot {
  /**
   * Changes whenever any price component, payment condition or promised item
   * changes. Confirmations may depend on this version.
   */
  version: string;
  totalAmountCny?: number;
  capturedAt?: string;
}

export interface VehicleIdentityOption {
  exactModelId: string;
  displayName: string;
}

export interface ProjectDataIssue {
  code:
    | "EXACT_CONFIG_NO_DATA"
    | "CITY_SALES_NO_DATA"
    | "PROVIDER_TIMEOUT"
    | "REQUIREMENT_PARSE_FAILED"
    | "PROJECT_SAVE_FAILED";
  stage:
    | "requirement_parsing"
    | "vehicle_configuration"
    | "city_sales"
    | "project_finalize";
  candidateId?: string;
  candidateName?: string;
  message: string;
  retryable: boolean;
}

export interface VehicleCandidate {
  id: string;
  role: CandidateRole;
  vehicle: ExactVehicle;
  quote?: QuoteSnapshot;
  facts?: VehicleFact[];
  /**
   * Professional-data dimensions that returned content but whose response
   * omitted enough trim identity that they cannot be bound to this exact
   * vehicle without user/source confirmation.
   */
  unboundDataFields?: string[];
  identityOptions?: VehicleIdentityOption[];
}

export interface DecisionCondition {
  id: string;
  title: string;
  detail?: string;
  category: ConditionCategory;
  kind: ConditionKind;
  rule?: DecisionRule;
  /**
   * Exact fragment from the user's original input. The normalized title above
   * is never allowed to replace this provenance record.
   */
  sourceText?: string;
  sourceStart?: number;
  sourceEnd?: number;
  concept?: string;
  scope?: "context" | "comparison" | "transaction";
  verificationMode?:
    | "vehicle_data"
    | "sales_data"
    | "web_research"
    | "self_check"
    | "written_confirmation"
    | "context";
  dataFieldHints?: string[];
  /**
   * Stable user-controlled order used only as a final tie-breaker.
   */
  order?: number;
}

export interface ConfirmationBasis {
  modelYear?: string;
  trim?: string;
  city?: string;
  paymentMethod?: string;
  quoteVersion?: string;
}

export interface UserConfirmation {
  confirmedAt: string;
  dependsOn: ConfirmationDependency[];
  basis: ConfirmationBasis;
  note?: string;
  /**
   * Kept for auditability after the former answer becomes stale.
   */
  invalidatedBy?: ConfirmationDependency[];
}

export interface ConditionEvaluation {
  conditionId: string;
  candidateId: string;
  status: DecisionStatus;
  summary: string;
  pendingReason?: PendingReason;
  evidenceRefs?: string[];
  /**
   * Exact professional-data facts used for this cell. Keeping the field IDs
   * explicit lets the UI distinguish "data returned, judgement still needed"
   * from "the dataset returned no relevant field" without parsing copy.
   */
  factFields?: string[];
  /**
   * Present only for an answer supplied or verified by the user. System facts
   * do not carry this field and are therefore never invalidated as a user
   * confirmation.
   */
  userConfirmation?: UserConfirmation;
}

export interface DecisionContext {
  city: string;
  paymentMethod: string;
  /**
   * Original setup inputs are retained so reopening the setup form does not
   * silently replace the user's current answers with demo defaults.
   */
  purchaseTime?: string;
  maxBudgetWan?: number;
  need?: string;
}

export interface DecisionProject {
  id: string;
  title: string;
  isDemo?: boolean;
  updatedAt: string;
  context: DecisionContext;
  candidates: VehicleCandidate[];
  conditions: DecisionCondition[];
  evidence?: DecisionEvidence[];
  citySales?: CitySalesSeries[];
  issues?: ProjectDataIssue[];
  /**
   * A complete matrix: every condition has exactly one independent evaluation
   * for every exact candidate.
   */
  evaluations: ConditionEvaluation[];
}

export interface CandidateDecisionSummary {
  candidateId: string;
  status: DecisionStatus;
  confirmedCount: number;
  pendingCount: number;
  conflictCount: number;
}

export interface PendingIssue {
  id: string;
  candidateId: string;
  conditionId: string;
  title: string;
  detail?: string;
  category: ConditionCategory;
  kind: ConditionKind;
  pendingReason: PendingReason;
  summary: string;
  factFields?: string[];
}

export interface DecisionSummary {
  status: DecisionStatus;
  targetCandidateId: string;
  candidates: CandidateDecisionSummary[];
  topPendingIssues: PendingIssue[];
}

export interface CandidateChange {
  candidateId: string;
  vehicle?: Partial<
    Pick<ExactVehicle, "exactModelId" | "modelYear" | "trim">
  >;
  quote?: QuoteSnapshot | null;
}

export interface DecisionChanges {
  context?: Partial<DecisionContext>;
  candidates?: CandidateChange[];
  updatedAt: string;
}

export interface InvalidatedConfirmation {
  candidateId: string;
  conditionId: string;
  invalidatedBy: ConfirmationDependency[];
}

export interface ApplyDecisionChangesResult {
  project: DecisionProject;
  invalidatedConfirmations: InvalidatedConfirmation[];
}
