export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export const DECISION_PROJECT_COOKIE_NAME = "car_decision_edit_token";
export const DECISION_PROJECT_TTL_DAYS = 90;
export const DECISION_PROJECT_TTL_MS =
  DECISION_PROJECT_TTL_DAYS * 24 * 60 * 60 * 1000;
export const MAX_CANDIDATE_TRIMS = 3;

// Minimal row types for Supabase store (not using Drizzle types)
export interface DecisionProjectRow {
  id: string;
  title: string;
  status: string;
  city: string | null;
  primaryCandidateId: string | null;
  summary: JsonValue;
  editTokenDigest: string;
  recoveryCodeDigest: string;
  version: number;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface CandidateTrimRow {
  id: string;
  projectId: string;
  position: number;
  role: string;
  entityId: string | null;
  brand: string | null;
  series: string | null;
  modelYear: string | null;
  trimName: string;
  displayName: string;
  status: string;
  data: JsonValue;
  createdAt: number;
  updatedAt: number;
}

export interface DecisionConditionRow {
  id: string;
  projectId: string;
  sortOrder: number;
  scope: string;
  kind: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  details: JsonValue;
  createdAt: number;
  updatedAt: number;
}

export interface ConditionEvaluationRow {
  id: string;
  projectId: string;
  conditionId: string;
  candidateTrimId: string;
  status: string;
  conclusion: string;
  rationale: JsonValue;
  evaluatedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface EvidenceRow {
  id: string;
  projectId: string;
  candidateTrimId: string | null;
  conditionId: string | null;
  evaluationId: string | null;
  evidenceType: string;
  sourceType: string;
  sourceName: string | null;
  title: string;
  summary: string;
  sourceUrl: string | null;
  traceId: string | null;
  logId: string | null;
  validity: string;
  capturedAt: number;
  expiresAt: number | null;
  payload: JsonValue;
  createdAt: number;
  updatedAt: number;
}

export interface UserCheckRow {
  id: string;
  projectId: string;
  conditionId: string | null;
  candidateTrimId: string | null;
  sortOrder: number;
  title: string;
  instructions: string;
  status: string;
  result: string | null;
  dueAt: number | null;
  completedAt: number | null;
  details: JsonValue;
  createdAt: number;
  updatedAt: number;
}

export interface SalesQuoteRow {
  id: string;
  projectId: string;
  candidateTrimId: string;
  status: string;
  dealerName: string | null;
  city: string | null;
  currency: string;
  totalAmountMinor: number | null;
  paymentMethod: string | null;
  quotedAt: number;
  expiresAt: number | null;
  lineItems: JsonValue;
  terms: JsonValue;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SalesClaimRow {
  id: string;
  projectId: string;
  candidateTrimId: string | null;
  quoteId: string | null;
  claimType: string;
  content: string;
  status: string;
  promisedAt: number | null;
  expiresAt: number | null;
  proof: JsonValue;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CityVehicleSeriesRow {
  id: string;
  projectId: string;
  candidateTrimId: string;
  city: string;
  seriesName: string;
  periodLabel: string;
  metricKey: string;
  metricLabel: string;
  metricDefinition: string | null;
  unit: string | null;
  dataLevel: string | null;
  datasetType: string;
  requestId: string | null;
  traceId: string | null;
  status: string;
  evidenceId: string | null;
  capturedAt: number;
  extra: JsonValue;
  createdAt: number;
  updatedAt: number;
}

export interface CityVehicleSeriesPointRow {
  id: string;
  seriesId: string;
  month: string;
  monthLabel: string;
  value: number;
  extra: JsonValue;
  createdAt: number;
}

type NewChildRow<T, RequiredKeys extends keyof T> = Pick<T, RequiredKeys> &
  Partial<Omit<T, "projectId" | "createdAt" | "updatedAt" | RequiredKeys>> & {
    createdAt?: number;
    updatedAt?: number;
  };

export type DecisionProject = Omit<
  DecisionProjectRow,
  "editTokenDigest" | "recoveryCodeDigest"
>;

export type CandidateTrimInput = NewChildRow<CandidateTrimRow, "trimName">;
export type DecisionConditionInput = NewChildRow<
  DecisionConditionRow,
  "title"
>;
export type ConditionEvaluationInput = NewChildRow<
  ConditionEvaluationRow,
  "conditionId" | "candidateTrimId"
>;
export type EvidenceInput = NewChildRow<EvidenceRow, "title">;
export type UserCheckInput = NewChildRow<UserCheckRow, "title">;
export type SalesQuoteInput = NewChildRow<SalesQuoteRow, "candidateTrimId">;
export type SalesClaimInput = NewChildRow<SalesClaimRow, "content">;
export type CityVehicleSeriesInput = NewChildRow<
  CityVehicleSeriesRow,
  "candidateTrimId" | "city" | "seriesName" | "metricLabel"
>;
export type CityVehicleSeriesPointInput = Omit<
  NewChildRow<CityVehicleSeriesPointRow, "seriesId" | "month" | "value">,
  "updatedAt"
>;

export interface DecisionProjectRecord {
  project: DecisionProject;
  candidateTrims: CandidateTrimRow[];
  conditions: DecisionConditionRow[];
  evaluations: ConditionEvaluationRow[];
  evidence: EvidenceRow[];
  userChecks: UserCheckRow[];
  salesQuotes: SalesQuoteRow[];
  salesClaims: SalesClaimRow[];
  cityVehicleSeries: CityVehicleSeriesRow[];
  cityVehicleSeriesPoints: CityVehicleSeriesPointRow[];
}

export interface CreateDecisionProjectInput {
  id?: string;
  title?: string;
  status?: string;
  city?: string | null;
  primaryCandidateId?: string | null;
  summary?: JsonValue;
  candidateTrims?: CandidateTrimInput[];
  conditions?: DecisionConditionInput[];
  evaluations?: ConditionEvaluationInput[];
  evidence?: EvidenceInput[];
  userChecks?: UserCheckInput[];
  salesQuotes?: SalesQuoteInput[];
  salesClaims?: SalesClaimInput[];
  cityVehicleSeries?: CityVehicleSeriesInput[];
  cityVehicleSeriesPoints?: CityVehicleSeriesPointInput[];
}

export interface UpdateDecisionProjectInput {
  expectedVersion?: number;
  title?: string;
  status?: string;
  city?: string | null;
  primaryCandidateId?: string | null;
  summary?: JsonValue;
  candidateTrims?: CandidateTrimInput[];
  conditions?: DecisionConditionInput[];
  evaluations?: ConditionEvaluationInput[];
  evidence?: EvidenceInput[];
  userChecks?: UserCheckInput[];
  salesQuotes?: SalesQuoteInput[];
  salesClaims?: SalesClaimInput[];
  cityVehicleSeries?: CityVehicleSeriesInput[];
  cityVehicleSeriesPoints?: CityVehicleSeriesPointInput[];
}

export interface CreatedDecisionProject {
  record: DecisionProjectRecord;
  recoveryCode: string;
  editToken: string;
}

export interface RecoveredDecisionProject {
  projectId: string;
  editToken: string;
  expiresAt: number;
}

export type DecisionProjectStoreErrorCode =
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "EXPIRED"
  | "INVALID_INPUT"
  | "VERSION_CONFLICT";

export class DecisionProjectStoreError extends Error {
  constructor(
    public readonly code: DecisionProjectStoreErrorCode,
    message: string
  ) {
    super(message);
    this.name = "DecisionProjectStoreError";
  }
}
