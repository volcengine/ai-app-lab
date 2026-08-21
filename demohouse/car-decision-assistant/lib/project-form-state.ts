export interface ProjectFormState {
  city: string;
  purchaseTime: string;
  maxBudgetWan: string | number;
  candidates: string[];
  need: string;
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeBudget(value: string | number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : normalizeText(String(value));
}

function normalizeCandidates(candidates: string[]) {
  return candidates
    .map(normalizeText)
    .filter(Boolean);
}

export function isProjectFormUnchanged(
  current: ProjectFormState,
  baseline: ProjectFormState,
) {
  return (
    normalizeText(current.city) === normalizeText(baseline.city) &&
    normalizeText(current.purchaseTime) ===
      normalizeText(baseline.purchaseTime) &&
    normalizeBudget(current.maxBudgetWan) ===
      normalizeBudget(baseline.maxBudgetWan) &&
    normalizeText(current.need) === normalizeText(baseline.need) &&
    JSON.stringify(normalizeCandidates(current.candidates)) ===
      JSON.stringify(normalizeCandidates(baseline.candidates))
  );
}
