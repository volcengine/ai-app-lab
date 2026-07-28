const WEB_CONTENT_ORIGIN = 'generated_report_claims';
const MAX_SOURCE_SUMMARY_LENGTH = 900;
const MAX_SEMANTIC_QUOTE_LENGTH = 360;

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function compactText(value, limit) {
  const text = normalizeText(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function uniqueStrings(values) {
  const result = [];
  for (const value of values) {
    const text = normalizeText(value);
    if (!text || result.some((item) => item === text)) continue;
    result.push(text);
  }
  return result;
}

function reportStatements(report) {
  const analysis = report?.analysis || {};
  const sectionClaims = (analysis.sections || []).flatMap((section) => (
    (section.claims || []).map((claim) => ({
      text: claim.text,
      evidence_ids: claim.evidence_ids || [],
      section_title: section.title || null,
      priority: 0,
    }))
  ));
  return [
    ...sectionClaims,
    {
      text: analysis.summary,
      evidence_ids: analysis.summary_evidence_ids || [],
      section_title: null,
      priority: 1,
    },
    {
      text: analysis.change_summary,
      evidence_ids: analysis.change_evidence_ids || [],
      section_title: null,
      priority: 2,
    },
    {
      text: analysis.conclusion?.text,
      evidence_ids: analysis.conclusion?.evidence_ids || [],
      section_title: null,
      priority: 3,
    },
  ].filter((item) => normalizeText(item.text) && item.evidence_ids.length);
}

function preferenceCoverageUnits(coverage) {
  return (coverage || []).flatMap((item) => (
    item?.facets?.length ? preferenceCoverageUnits(item.facets) : [item]
  )).filter(Boolean);
}

function statementsForEvidence(statements, evidenceId) {
  return statements
    .filter((item) => item.evidence_ids.includes(evidenceId))
    .sort((left, right) => {
      const leftSingle = left.evidence_ids.length === 1 ? 0 : 1;
      const rightSingle = right.evidence_ids.length === 1 ? 0 : 1;
      return leftSingle - rightSingle || left.priority - right.priority;
    });
}

function sourceSummary(statements) {
  const parts = uniqueStrings(statements.map((item) => (
    compactText(item.text, MAX_SEMANTIC_QUOTE_LENGTH)
  )));
  const selected = [];
  let length = 0;
  for (const part of parts) {
    const extraLength = part.length + (selected.length ? 1 : 0);
    if (selected.length && length + extraLength > MAX_SOURCE_SUMMARY_LENGTH) break;
    selected.push(part);
    length += extraLength;
    if (selected.length >= 3) break;
  }
  return selected.join('\n');
}

function derivedSemanticMatches(item, report, statements) {
  const originalMatches = Array.isArray(item?.semantic_matches) ? item.semantic_matches : [];
  if (!originalMatches.length) return [];
  const units = preferenceCoverageUnits(report?.preference_coverage);
  const evidenceStatements = statementsForEvidence(statements, item.id);
  const seen = new Set();
  const matches = [];

  for (const match of originalMatches) {
    const preference = normalizeText(match?.preference);
    const scope = match?.scope === 'external' ? 'external' : 'company';
    if (!preference || seen.has(`${preference}|${scope}`)) continue;
    const unit = units.find((candidate) => (
      normalizeText(candidate?.preference) === preference
      && (candidate?.evidence_ids || []).includes(item.id)
    ));
    if (!unit) continue;
    const statement = evidenceStatements.find((candidate) => (
      !unit.expected_section || candidate.section_title === unit.expected_section
    )) || evidenceStatements[0];
    const quote = compactText(statement?.text, MAX_SEMANTIC_QUOTE_LENGTH);
    if (quote.length < 12) continue;
    seen.add(`${preference}|${scope}`);
    matches.push({ preference, scope, quote });
  }
  return matches;
}

function sanitizeWebEvidence(item, report, statements) {
  const evidenceStatements = statementsForEvidence(statements, item.id);
  const semanticMatches = derivedSemanticMatches(item, report, statements);
  const content = sourceSummary([
    ...semanticMatches.map((match) => ({
      text: match.quote,
      evidence_ids: [item.id],
      priority: -1,
    })),
    ...evidenceStatements,
  ]) || normalizeText(item.title);
  const {
    content: _content,
    summary: _summary,
    snippet: _snippet,
    raw: _raw,
    cited_excerpt: _citedExcerpt,
    semantic_matches: _semanticMatches,
    semantic_binding_checked: _semanticBindingChecked,
    ...metadata
  } = item;
  return {
    ...metadata,
    content,
    content_origin: WEB_CONTENT_ORIGIN,
    ...(semanticMatches.length
      ? {
        semantic_matches: semanticMatches,
        semantic_binding_checked: true,
        semantic_match_origin: WEB_CONTENT_ORIGIN,
      }
      : {}),
  };
}

function sanitizeEvidence(item, report, statements) {
  if (!item || typeof item !== 'object') return item;
  if (item.type === 'web_search') return sanitizeWebEvidence(item, report, statements);
  if (item.type === 'datapro') {
    const { content: _content, ...structuredEvidence } = item;
    return structuredEvidence;
  }
  return structuredClone(item);
}

export function sanitizeReportForStorage(report) {
  if (!report || typeof report !== 'object') return report;
  const storedReport = structuredClone(report);
  const statements = reportStatements(storedReport);
  storedReport.evidence = (storedReport.evidence || []).map((item) => (
    sanitizeEvidence(item, storedReport, statements)
  ));
  return storedReport;
}

export const reportStorageInternals = {
  WEB_CONTENT_ORIGIN,
  reportStatements,
  preferenceCoverageUnits,
  statementsForEvidence,
};
