import {
  extractGroundingDates,
  extractGroundingNumbers,
  evidenceSpanErrors,
  groundedTextErrors,
} from "../evidence/claimGrounding.js";
import {
  extractCriticalClaims,
  hasHighRiskAssertion,
} from "../evidence/salesEvidence.js";

const SECTION_DEFINITIONS = Object.freeze([
  ["company_overview", "企业与业务概览"],
  ["business_dynamics", "经营与业务动态"],
  ["recent_public_updates", "近期公开动态"],
  ["risk_attention", "风险与关注事项"],
  ["sales_opportunity", "销售机会判断"],
  ["recommended_actions", "建议行动"],
]);

const PLAN_FUNCTION_NAME = "plan_sales_dossier";
const MAX_AGENT_CITATIONS = 10;
const MAX_PROFESSIONAL_CITATIONS = 5;
const MAX_PUBLIC_CITATIONS = 5;
const PROFESSIONAL_SUMMARY_CHARS = 700;
const PUBLIC_SUMMARY_CHARS = 500;
const MAX_EVIDENCE_IDS_PER_SECTION = 3;
const MAX_EVIDENCE_ATOMS_PER_SECTION = 6;
const MAX_PLAN_ITEM_CHARS = 600;
const SUBJECT_BOUNDARY_TERMS = /(?:品牌|集团|相关业务|在华业务|中国业务|公开信息显示)/u;
const ANALYTICAL_RISK_TERMS = /(?:应|需|建议|核验|确认|关注|评估|避免|前置|待明确|待沟通|对接前)/u;

const OUTPUT_BUDGET = Object.freeze({
  summary_max_chars: 160,
  section_max_chars: 1000,
  paragraph_max_chars: 600,
    paragraphs_per_section: "1",
  memory_summary_max_chars: 200,
    recommended_action_count: "1",
});

function compact(value, maxLength) {
  const normalized = String(value || "").replace(/\s+/gu, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function sourceRank(citation = {}) {
  const qualityTier = Number(citation.quality_tier);
  const qualityScore = Number.isFinite(qualityTier) ? Math.max(0, 5 - qualityTier) * 10 : 0;
  const freshnessScore = citation.freshness === "current" ? 18 : citation.freshness === "recent" ? 10 : 0;
  const officialScore = citation.official ? 12 : 0;
  const datedScore = citation.published_at ? 4 : 0;
  return qualityScore + freshnessScore + officialScore + datedScore;
}

function ranked(citations = []) {
  return [...citations].sort((left, right) => (
    sourceRank(right) - sourceRank(left)
    || String(right.published_at || "").localeCompare(String(left.published_at || ""))
    || String(left.id || "").localeCompare(String(right.id || ""))
  ));
}

function citationIndependenceKey(citation = {}) {
  return String(
    citation.independence_key
      || `${citation.source_kind || "source"}:${citation.id || citation.label || ""}`,
  );
}

function distinctCitationCount(citations = []) {
  return new Set(citations.map(citationIndependenceKey).filter(Boolean)).size;
}

function sameCriticalClaim(left = {}, right = {}) {
  return left.field === right.field
    && left.normalized_value === right.normalized_value;
}

function atomCriticalClaims(atom = {}) {
  return extractCriticalClaims(String(atom.quote || ""));
}

const SPECIFIC_RISK_TERMS = [
  "行政处罚",
  "司法诉讼",
  "失信被执行",
  "限制高消费",
  "经营异常",
  "监管处罚",
  "产品召回",
  "安全事故",
  "供应中断",
  "交付延期",
];

function atomRiskSignature(atom = {}) {
  const value = String(atom.quote || "");
  return {
    terms: SPECIFIC_RISK_TERMS.filter((term) => value.includes(term)),
    dates: extractGroundingDates(value),
    numbers: extractGroundingNumbers(value),
  };
}

function sameRiskSignature(left = {}, right = {}) {
  if (!left.terms.length || !left.terms.every((term) => right.terms.includes(term))) return false;
  if (left.dates.length && !left.dates.every((date) => right.dates.includes(date))) return false;
  if (left.numbers.length && !left.numbers.every((number) => right.numbers.includes(number))) return false;
  return true;
}

function criticalClaimSupportingAtoms(atom = {}, atoms = [], citationById = new Map()) {
  const claims = atomCriticalClaims(atom);
  const riskSignature = atomRiskSignature(atom);
  if (!claims.length && !riskSignature.terms.length) return [];
  return atoms.filter((candidate) => {
    const citation = citationById.get(String(candidate.citation_id || ""));
    if (!citation) return false;
    const candidateClaims = atomCriticalClaims(candidate);
    if (claims.length) {
      return claims.every((claim) => candidateClaims.some((candidateClaim) => (
        sameCriticalClaim(claim, candidateClaim)
      )));
    }
    return sameRiskSignature(riskSignature, atomRiskSignature(candidate));
  });
}

function hasSufficientCriticalClaimSupport(atom = {}, atoms = [], citationById = new Map()) {
  const claims = atomCriticalClaims(atom);
  if (!claims.length && !hasHighRiskAssertion(atom.quote)) return true;
  const supporters = criticalClaimSupportingAtoms(atom, atoms, citationById);
  const supportingCitations = [...new Map(supporters.map((candidate) => {
    const citation = citationById.get(String(candidate.citation_id || ""));
    return [String(candidate.citation_id || ""), citation];
  })).values()].filter(Boolean);
  return distinctCitationCount(supportingCitations) >= 2
    && supportingCitations.some((citation) => Number(citation.quality_tier) === 1);
}

export function buildDossierSourceUsageRequirements(citations = []) {
  const professional = citations.filter((citation) => citation.source_kind === "专业数据集");
  const publicSources = citations.filter((citation) => citation.source_kind === "联网搜索");
  const availableDistinct = distinctCitationCount(citations);
  const availableProfessional = distinctCitationCount(professional);
  const availablePublic = distinctCitationCount(publicSources);
  return {
    available_distinct_source_count: availableDistinct,
    required_distinct_source_count: 0,
    available_professional_source_count: availableProfessional,
    required_professional_source_count: 0,
    available_public_source_count: availablePublic,
    required_public_source_count: 0,
  };
}

export function dossierSourceUsageErrors(
  citationIds = [],
  citations = [],
  requirements = buildDossierSourceUsageRequirements(citations),
  path = "整份档案",
) {
  const citationById = new Map(citations.map((citation) => [String(citation?.id || ""), citation]));
  const used = [...new Set(citationIds.map(String))]
    .map((id) => citationById.get(id))
    .filter(Boolean);
  const usedProfessional = used.filter((citation) => citation.source_kind === "专业数据集");
  const usedPublic = used.filter((citation) => citation.source_kind === "联网搜索");
  const actual = {
    total: distinctCitationCount(used),
    professional: distinctCitationCount(usedProfessional),
    public: distinctCitationCount(usedPublic),
  };
  const errors = [];
  if (actual.total < Number(requirements.required_distinct_source_count || 0)) {
    errors.push(
      `${path}仅覆盖 ${actual.total} 个独立来源，当前证据允许覆盖至少 ${requirements.required_distinct_source_count} 个`,
    );
  }
  if (actual.professional < Number(requirements.required_professional_source_count || 0)) {
    errors.push(
      `${path}仅覆盖 ${actual.professional} 个独立专业来源，当前证据允许覆盖至少 ${requirements.required_professional_source_count} 个`,
    );
  }
  if (actual.public < Number(requirements.required_public_source_count || 0)) {
    errors.push(
      `${path}仅覆盖 ${actual.public} 个独立公开来源，当前证据允许覆盖至少 ${requirements.required_public_source_count} 个`,
    );
  }
  return errors;
}

function selectedPolicy(policy = {}, selectedIds = new Set()) {
  return Object.fromEntries(Object.entries(policy).map(([key, ids]) => [
    key,
    (Array.isArray(ids) ? ids : []).map(String).filter((id) => selectedIds.has(id)),
  ]));
}

function compactCitation(citation = {}) {
  const isPublic = citation.source_kind === "联网搜索";
  return {
    id: String(citation.id || ""),
    source_kind: String(citation.source_kind || ""),
    label: compact(citation.label, 160),
    summary: compact(
      citation.summary || citation.excerpt,
      isPublic ? PUBLIC_SUMMARY_CHARS : PROFESSIONAL_SUMMARY_CHARS,
    ),
    published_at: citation.published_at || null,
    source_quality_label: compact(citation.source_quality_label, 60),
    freshness_label: compact(citation.freshness_label, 60),
    entity_match: compact(citation.entity_match, 40),
    independence_key: compact(citation.independence_key, 160),
    conflict_fields: (Array.isArray(citation.conflict_fields) ? citation.conflict_fields : [])
      .map((item) => compact(item, 80))
      .filter(Boolean)
      .slice(0, 6),
  };
}

function compactEvidenceAtom(atom = {}) {
  return {
    id: String(atom.id || ""),
    quote: compact(atom.quote, 360),
    source_kind: String(atom.source_kind || ""),
    source_type: String(atom.source_type || ""),
    title: compact(atom.title, 160),
    published_at: atom.published_at || null,
    entity_match: compact(atom.entity_match, 40),
    reliability: compact(atom.reliability, 40),
    conflict_fields: (Array.isArray(atom.conflict_fields) ? atom.conflict_fields : [])
      .map((item) => compact(item, 80))
      .filter(Boolean)
      .slice(0, 6),
    selection_scope: atom.selection_scope === "cross_section_grounding"
      ? "cross_section_grounding"
      : "section_candidate",
  };
}

function evidenceAtomOrder(left, right) {
  return Number(right.score || 0) - Number(left.score || 0)
    || String(left.id || "").localeCompare(String(right.id || ""));
}

function atomHasUsableEntityMatch(atom = {}, section = "") {
  const entityMatch = String(atom.entity_match || "");
  if (section === "company_overview") return entityMatch === "verified";
  if (section === "risk_attention" && atom.selection_scope !== "cross_section_grounding") {
    return ["verified", "company_scoped"].includes(entityMatch);
  }
  return entityMatch && entityMatch !== "unverified";
}

function sectionEvidenceCandidates(atoms = [], section = "") {
  const usable = atoms
    .filter((atom) => atom?.id && atom?.citation_id && atom?.quote)
    .filter((atom) => atomHasUsableEntityMatch(atom, section));
  const direct = usable
    .filter((atom) => (
      Array.isArray(atom.section_candidates)
      && atom.section_candidates.includes(section)
    ))
    .sort(evidenceAtomOrder)
    .map((atom) => ({ ...atom, selection_scope: "section_candidate" }));
  if (direct.length) return direct;

  const professional = usable.filter((atom) => atom.source_kind === "professional");
  const publicSources = usable.filter((atom) => atom.source_kind === "public");
  let fallback = [];
  if (section === "recent_public_updates") {
    fallback = [
      ...professional.filter((atom) => atom.published_at || atom.source_updated_at),
      ...professional,
      ...publicSources,
    ];
  } else if (section === "risk_attention") {
    fallback = [
      ...professional.filter((atom) => (
        Array.isArray(atom.section_candidates)
        && atom.section_candidates.includes("business_dynamics")
      )),
      ...professional.filter((atom) => (
        Array.isArray(atom.section_candidates)
        && atom.section_candidates.includes("company_overview")
      )),
      ...professional,
      ...publicSources,
    ];
  } else {
    fallback = [...professional, ...publicSources];
  }
  return [...new Map(
    fallback.map((atom) => [String(atom.id), atom]),
  ).values()].map((atom) => ({
    ...atom,
    selection_scope: "cross_section_grounding",
  }));
}

const SECTION_REQUIRED_SOURCE_POLICY = Object.freeze({
  company_overview: "business_database_ids",
  business_dynamics: "business_dynamics_ids",
  recent_public_updates: "web_search_ids",
  risk_attention: "risk_database_ids",
});

function policyConstrainedSectionCandidates(candidates = [], section = "", policy = {}) {
  const policyKey = SECTION_REQUIRED_SOURCE_POLICY[section];
  const policyValues = policyKey && Array.isArray(policy?.[policyKey])
    ? policy[policyKey]
    : section === "business_dynamics" && Array.isArray(policy?.market_database_ids)
      ? policy.market_database_ids
      : [];
  const requiredCitationIds = new Set(
    policyValues
      .map(String)
      .filter(Boolean),
  );
  if (!requiredCitationIds.size) return candidates;
  return candidates.filter((atom) => requiredCitationIds.has(String(atom.citation_id || "")));
}

/**
 * Build a deterministic, bounded evidence projection for the two-stage agent.
 * The durable evidence pack remains complete and is still used by server-side
 * validators after the model calls finish.
 */
export function buildDossierAgentContext({
  citations = [],
  evidencePolicy = {},
  evidenceConflicts = [],
  sourceSelectionPolicy = {},
  evidenceAtoms = [],
  evidenceCoverage = {},
} = {}) {
  const excludedEntityCitationIds = new Set(
    (Array.isArray(sourceSelectionPolicy.excluded_entity_citation_ids)
      ? sourceSelectionPolicy.excluded_entity_citation_ids
      : [])
      .map(String)
      .filter(Boolean),
  );
  const usable = ranked(citations.filter((citation) => (
    citation?.id
    && citation?.summary
    && !excludedEntityCitationIds.has(String(citation.id))
  )));
  const byId = new Map(usable.map((citation) => [String(citation.id), citation]));
  const usableAtoms = (Array.isArray(evidenceAtoms) ? evidenceAtoms : [])
    .filter((atom) => atom?.id && atom?.citation_id && atom?.quote)
    .filter((atom) => byId.has(String(atom.citation_id)));
  const professional = usable.filter((citation) => citation.source_kind === "专业数据集");
  const publicSources = usable.filter((citation) => citation.source_kind === "联网搜索");
  const selected = [];
  const selectedIds = new Set();

  const add = (citation) => {
    const id = String(citation?.id || "");
    if (!id || selectedIds.has(id) || selected.length >= MAX_AGENT_CITATIONS) return;
    selectedIds.add(id);
    selected.push(citation);
  };
  const addPolicyHead = (key) => {
    const first = (Array.isArray(sourceSelectionPolicy[key]) ? sourceSelectionPolicy[key] : [])
      .map(String)
      .map((id) => byId.get(id))
      .find(Boolean);
    add(first);
  };

  // Preserve at least one strong source for every report section before the
  // global context cap is filled. Otherwise a low-ranked but indispensable
  // risk or recent source can be dropped even though collection succeeded.
  SECTION_DEFINITIONS.forEach(([key]) => {
    const head = sectionEvidenceCandidates(usableAtoms, key)[0];
    add(byId.get(String(head?.citation_id || "")));
  });
  addPolicyHead("business_database_ids");
  addPolicyHead("risk_database_ids");
  addPolicyHead("business_dynamics_ids");
  addPolicyHead("market_database_ids");
  professional.slice(0, MAX_PROFESSIONAL_CITATIONS).forEach(add);
  publicSources.slice(0, MAX_PUBLIC_CITATIONS).forEach(add);
  usable.forEach(add);

  const selectedProfessional = selected.filter((citation) => citation.source_kind === "专业数据集");
  const selectedPublic = selected.filter((citation) => citation.source_kind === "联网搜索");
  const compactCitations = selected.map(compactCitation);
  const sourceUsageRequirements = buildDossierSourceUsageRequirements(compactCitations);
  const policy = selectedPolicy(sourceSelectionPolicy, selectedIds);
  const conflicts = evidenceConflicts
    .map((conflict) => ({
      field: compact(conflict?.field, 80),
      field_label: compact(conflict?.field_label, 120),
      evidence_ids: [
        ...new Set((conflict?.values || [])
          .flatMap((value) => value?.evidence_ids || [])
          .map(String)
          .filter((id) => selectedIds.has(id))),
      ],
    }))
    .filter((conflict) => conflict.field && conflict.evidence_ids.length >= 2);
  const selectedAtomCandidates = usableAtoms
    .filter((atom) => selectedIds.has(String(atom.citation_id)));
  const selectedCitationById = new Map(
    selected.map((citation) => [String(citation.id || ""), citation]),
  );
  const selectedAtoms = selectedAtomCandidates.filter((atom) => (
    hasSufficientCriticalClaimSupport(atom, selectedAtomCandidates, selectedCitationById)
  ));
  const evidenceBySection = Object.fromEntries(SECTION_DEFINITIONS.map(([key]) => {
    const coverageIds = new Set(
      Array.isArray(evidenceCoverage?.[key]?.atom_ids)
        ? evidenceCoverage[key].atom_ids.map(String)
        : [],
    );
    let candidates = sectionEvidenceCandidates(selectedAtoms, key)
      .filter((atom) => (
        atom.selection_scope === "cross_section_grounding"
        || !coverageIds.size
        || coverageIds.has(String(atom.id))
      ));
    candidates = policyConstrainedSectionCandidates(candidates, key, policy);
    return [key, candidates.slice(0, MAX_EVIDENCE_ATOMS_PER_SECTION)];
  }));
  const normalizedCoverage = Object.fromEntries(SECTION_DEFINITIONS.map(([key]) => {
    const original = evidenceCoverage?.[key];
    const atoms = evidenceBySection[key] || [];
    const usesCrossSectionGrounding = atoms.some((atom) => (
      atom.selection_scope === "cross_section_grounding"
    ));
    if (atoms.length && (original?.status === "missing" || usesCrossSectionGrounding)) {
      return [key, {
        status: "partial",
        atom_ids: atoms.map((atom) => String(atom.id)),
        reasons: [...new Set([
          ...(Array.isArray(original?.reasons) ? original.reasons : []),
          "cross_section_grounded_fallback",
        ])],
      }];
    }
    return [key, original || {
      status: atoms.length ? "supported" : "missing",
      atom_ids: atoms.map((atom) => String(atom.id)),
      reasons: atoms.length ? [] : ["no_relevant_atoms"],
    }];
  }));

  return {
    citations: compactCitations,
    evidencePolicy: {
      source_counts: {
        professional: selectedProfessional.length,
        public: selectedPublic.length,
      },
      conflict_count: conflicts.length,
      warnings: (Array.isArray(evidencePolicy?.warnings) ? evidencePolicy.warnings : [])
        .map((warning) => compact(warning, 160))
        .filter(Boolean)
        .slice(0, 6),
    },
    evidenceConflicts: conflicts,
    sourceSelectionPolicy: policy,
    sourceUsageRequirements,
    evidenceBySection,
    evidenceCoverage: normalizedCoverage,
    outputBudget: OUTPUT_BUDGET,
    metrics: {
      available_citation_count: usable.length,
      selected_citation_count: compactCitations.length,
      professional_count: selectedProfessional.length,
      public_count: selectedPublic.length,
      excluded_unsupported_critical_atom_count: selectedAtomCandidates.length - selectedAtoms.length,
      excluded_unrelated_entity_citation_count: excludedEntityCitationIds.size,
      selected_atom_count: new Set(
        Object.values(evidenceBySection).flat().map((atom) => String(atom.id)),
      ).size,
      serialized_chars: JSON.stringify(compactCitations).length,
    },
  };
}

function sectionPlanSchema(evidenceIds = [], description = "") {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      text: {
        type: "string",
        minLength: 8,
        maxLength: MAX_PLAN_ITEM_CHARS,
        description,
      },
      evidence_ids: {
        type: "array",
        minItems: 1,
        maxItems: MAX_EVIDENCE_IDS_PER_SECTION,
        uniqueItems: true,
        items: {
          type: "string",
          enum: [...new Set(evidenceIds.map(String).filter(Boolean))],
        },
        description: "直接支撑本章正文、且属于本章节允许集合的 Evidence Atom ID。",
      },
    },
    required: ["text", "evidence_ids"],
  };
}

export function buildDossierPlanSchema(
  evidenceIdsBySection = {},
  sectionKeys = SECTION_DEFINITIONS.map(([key]) => key),
) {
  const selectedKeys = new Set(sectionKeys.map(String));
  const selectedSections = SECTION_DEFINITIONS.filter(([key]) => selectedKeys.has(key));
  const properties = Object.fromEntries(selectedSections.map(([key]) => [
    key,
    sectionPlanSchema(
      Array.isArray(evidenceIdsBySection?.[key]) ? evidenceIdsBySection[key] : [],
      key === "recommended_actions"
        ? "一个可直接展示的完整行动段落，写清动作、对象和待核验事项。"
        : "一个可直接展示的完整正文段落，只表达本章最重要且有直接证据的内容。",
    ),
  ]));
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      sections: {
        type: "object",
        additionalProperties: false,
        properties,
        required: selectedSections.map(([key]) => key),
      },
    },
    required: ["sections"],
  };
}

function planItemsForSection(plan = {}, key) {
  const item = plan?.sections?.[key];
  return item && typeof item === "object" && item.text ? [item] : [];
}

function normalizeClaimText(value) {
  return String(value || "").replace(/\s+/gu, " ").trim();
}

function normalizeSectionClaimText(section, value) {
  const normalized = normalizeClaimText(value);
  if (section !== "company_overview") return normalized;
  return normalized.replace(
    /[，,]?(?:并|同时)(?:还)?(?:延伸|扩展)(?:到|至)/gu,
    "，并包括",
  );
}

function normalizedPlan(
  parsed = {},
  evidenceAtoms = [],
  citations = [],
  allowedEvidenceBySection = {},
  sourceUsageRequirements = {},
  ignoredEntityNames = [],
) {
  const citationById = new Map(citations.map((item) => [String(item?.id || ""), item]));
  const atomById = new Map(evidenceAtoms.map((item) => [String(item?.id || ""), item]));
  const errors = [];
  const seen = new Set();
  const sections = {};

  SECTION_DEFINITIONS.forEach(([key, title]) => {
    const item = parsed?.sections?.[key];
    const text = normalizeSectionClaimText(key, item?.text);
    const itemPath = `${title}第 1 条`;
    const rawEvidenceIds = Array.isArray(item?.evidence_ids)
      ? item.evidence_ids.map(String).filter(Boolean)
      : [];
    const evidenceIds = [...new Set(rawEvidenceIds)];
    const allowed = new Set(
      Array.isArray(allowedEvidenceBySection?.[key])
        ? allowedEvidenceBySection[key].map(String)
        : [],
    );
    if (!item || typeof item !== "object") errors.push(`${title}必须提交一个完整章节对象`);
    if (!text) errors.push(`${itemPath}内容为空`);
    if (text.length > MAX_PLAN_ITEM_CHARS) {
      errors.push(`${itemPath}超过 ${MAX_PLAN_ITEM_CHARS} 个字符`);
    }
    if (text && !/[。！？]$/u.test(text)) errors.push(`${itemPath}不是完整句子`);
    if (!rawEvidenceIds.length) errors.push(`${itemPath}缺少 Evidence ID`);
    if (rawEvidenceIds.length > MAX_EVIDENCE_IDS_PER_SECTION) {
      errors.push(`${itemPath}最多使用 ${MAX_EVIDENCE_IDS_PER_SECTION} 个 Evidence ID`);
    }
    if (rawEvidenceIds.length !== evidenceIds.length) errors.push(`${itemPath}包含重复 Evidence ID`);

    const validAtoms = [];
    for (const evidenceId of evidenceIds.slice(0, MAX_EVIDENCE_IDS_PER_SECTION)) {
      const atom = atomById.get(evidenceId);
      if (!atom) {
        errors.push(`${itemPath}包含无效 Evidence ID：${evidenceId}`);
        continue;
      }
      if (!allowed.has(evidenceId)) {
        errors.push(`${itemPath}的 Evidence ID ${evidenceId} 不属于本章节允许集合`);
        continue;
      }
      validAtoms.push(atom);
    }
    const textCriticalClaims = extractCriticalClaims(text);
    if (textCriticalClaims.length && validAtoms.length) {
      const candidateSupporters = (Array.isArray(allowedEvidenceBySection?.[key])
        ? allowedEvidenceBySection[key]
        : [])
        .map((id) => atomById.get(String(id || "")))
        .filter(Boolean)
        .filter((atom) => {
          const claims = atomCriticalClaims(atom);
          return textCriticalClaims.every((claim) => claims.some((candidateClaim) => (
            sameCriticalClaim(claim, candidateClaim)
          )));
        });
      const currentCitationIds = new Set(validAtoms.map((atom) => String(atom.citation_id || "")));
      for (const supporter of candidateSupporters) {
        if (validAtoms.length >= MAX_EVIDENCE_IDS_PER_SECTION) break;
        const citationId = String(supporter.citation_id || "");
        if (currentCitationIds.has(citationId)) continue;
        validAtoms.push(supporter);
        currentCitationIds.add(citationId);
        const supportingCitations = validAtoms
          .map((atom) => citationById.get(String(atom.citation_id || "")))
          .filter(Boolean);
        if (
          distinctCitationCount(supportingCitations) >= 2
          && supportingCitations.some((citation) => Number(citation.quality_tier) === 1)
        ) break;
      }
    }
    const evidenceSpans = validAtoms.map((atom, index) => {
      const citationId = String(atom.citation_id || "");
      const quote = normalizeClaimText(atom.quote);
      const citation = citationById.get(citationId);
      if (!citation) {
        errors.push(`${itemPath}第 ${index + 1} 个 Evidence Atom 缺少对应引用`);
      } else {
        errors.push(...evidenceSpanErrors(
          { citation_id: citationId, quote },
          citation,
          `${itemPath}第 ${index + 1} 个 Evidence Atom`,
        ));
      }
      return {
        evidence_id: String(atom.id),
        citation_id: citationId,
        quote,
      };
    });
    const citationIds = [...new Set(
      evidenceSpans
        .map((span) => span.citation_id)
        .filter((id) => citationById.has(id)),
    )];
    if (!validAtoms.length) errors.push(`${itemPath}缺少本章节允许的 Evidence Atom`);
    if (!citationIds.length) errors.push(`${itemPath}缺少有效引用`);
    errors.push(...groundedTextErrors({
      text,
      evidenceTexts: evidenceSpans.map((span) => span.quote).filter(Boolean),
      path: itemPath,
      requireEventFamily: [
        "company_overview",
        "business_dynamics",
        "recent_public_updates",
      ].includes(key) || (key === "risk_attention" && !ANALYTICAL_RISK_TERMS.test(text)),
      ignoredEntityNames,
    }));
    const requiresSubjectBoundary = [
      "company_overview",
      "business_dynamics",
      "recent_public_updates",
      "risk_attention",
    ].includes(key)
      && validAtoms.some((atom) => atom.entity_match === "alias_scoped")
      && !validAtoms.some((atom) => atom.entity_match === "verified")
      && !SUBJECT_BOUNDARY_TERMS.test(text);
    const displayText = requiresSubjectBoundary ? `公开信息显示，${text}` : text;
    const identity = displayText
      .toLowerCase()
      .replace(/[\s，。；：！？、,.!?;:'"“”‘’（）()【】[\]《》<>-]/gu, "");
    if (identity && seen.has(identity)) errors.push(`${title}包含与其他章节重复的规划内容`);
    if (identity) seen.add(identity);
    sections[key] = {
      id: `${key}_1`,
      text: displayText,
      evidence_ids: validAtoms.map((atom) => String(atom.id)),
      citation_ids: citationIds,
      evidence_spans: evidenceSpans,
    };
  });

  const plannedCitationIds = SECTION_DEFINITIONS.flatMap(([key]) => (
    planItemsForSection({ sections }, key).flatMap((item) => item.citation_ids || [])
  ));
  errors.push(...dossierSourceUsageErrors(
    plannedCitationIds,
    citations,
    sourceUsageRequirements,
    "事实规划",
  ));

  return { plan: { sections }, errors };
}

function evidenceIdCombinations(values = [], maxItems = MAX_EVIDENCE_IDS_PER_SECTION) {
  const unique = [...new Set(values.map(String).filter(Boolean))];
  const combinations = [];
  const visit = (start, selected) => {
    if (selected.length) combinations.push([...selected]);
    if (selected.length >= maxItems) return;
    for (let index = start; index < unique.length; index += 1) {
      selected.push(unique[index]);
      visit(index + 1, selected);
      selected.pop();
    }
  };
  visit(0, []);
  return combinations;
}

function sectionPlanningErrors(errors = [], title = "") {
  return errors.filter((error) => String(error || "").startsWith(title));
}

function reselectGroundingEvidence(
  parsed = {},
  evidenceAtoms = [],
  citations = [],
  allowedEvidenceBySection = {},
  sourceUsageRequirements = {},
  ignoredEntityNames = [],
) {
  const next = JSON.parse(JSON.stringify(parsed || {}));
  const knownAtomIds = new Set(evidenceAtoms.map((atom) => String(atom?.id || "")).filter(Boolean));
  let evaluated = normalizedPlan(
    next,
    evidenceAtoms,
    citations,
    allowedEvidenceBySection,
    sourceUsageRequirements,
    ignoredEntityNames,
  );
  let changed = 0;

  for (const [key, title] of SECTION_DEFINITIONS) {
    const currentSectionErrors = sectionPlanningErrors(evaluated.errors, title);
    if (!currentSectionErrors.some((error) => /未出现在证据片段中|缺少可核验的证据片段/u.test(error))) {
      continue;
    }
    const allowedIds = Array.isArray(allowedEvidenceBySection?.[key])
      ? allowedEvidenceBySection[key]
      : [];
    const allowedSet = new Set(allowedIds.map(String));
    const currentEvidenceIds = Array.isArray(next?.sections?.[key]?.evidence_ids)
      ? next.sections[key].evidence_ids.map(String).filter(Boolean)
      : [];
    if (
      !currentEvidenceIds.length
      || currentEvidenceIds.length > MAX_EVIDENCE_IDS_PER_SECTION
      || new Set(currentEvidenceIds).size !== currentEvidenceIds.length
      || currentEvidenceIds.some((id) => !knownAtomIds.has(id) || !allowedSet.has(id))
    ) {
      continue;
    }
    const candidates = evidenceIdCombinations(allowedIds);
    if (!candidates.length || !next?.sections?.[key]) continue;

    let best = null;
    for (const evidenceIds of candidates) {
      const candidateParsed = JSON.parse(JSON.stringify(next));
      candidateParsed.sections[key].evidence_ids = evidenceIds;
      const candidateEvaluation = normalizedPlan(
        candidateParsed,
        evidenceAtoms,
        citations,
        allowedEvidenceBySection,
        sourceUsageRequirements,
        ignoredEntityNames,
      );
      const candidateSectionErrors = sectionPlanningErrors(candidateEvaluation.errors, title);
      if (candidateSectionErrors.length >= currentSectionErrors.length) continue;
      const candidateScore = (
        candidateSectionErrors.length * 10_000
        + candidateEvaluation.errors.length * 100
        + evidenceIds.length
      );
      if (!best || candidateScore < best.score) {
        best = {
          score: candidateScore,
          parsed: candidateParsed,
          evaluated: candidateEvaluation,
        };
      }
    }
    if (!best) continue;
    Object.assign(next, best.parsed);
    evaluated = best.evaluated;
    changed += 1;
  }
  return { parsed: next, evaluated, changed };
}

function reduceUnsupportedDatePrecision(parsed = {}, errors = [], evidenceAtoms = []) {
  const next = JSON.parse(JSON.stringify(parsed || {}));
  const atomById = new Map(evidenceAtoms.map((item) => [String(item?.id || ""), item]));
  let changed = 0;
  for (const error of errors) {
    const match = String(error || "").match(
      /^(.+?)第 (\d+) 条中的日期 (20\d{2})-(\d{2})-(\d{2}) 未出现在证据片段中$/u,
    );
    if (!match) continue;
    const [, title, itemNumberRaw, year, monthRaw, dayRaw] = match;
    const section = SECTION_DEFINITIONS.find(([, sectionTitle]) => sectionTitle === title);
    if (!section) continue;
    const [key] = section;
    if (Number(itemNumberRaw) !== 1) continue;
    const item = next?.sections?.[key];
    if (!item) continue;
    const support = (Array.isArray(item.evidence_ids) ? item.evidence_ids : [])
      .map((id) => atomById.get(String(id || "")))
      .map((atom) => normalizeClaimText(atom?.quote))
      .filter(Boolean)
      .join(" ");
    const month = Number(monthRaw);
    const day = Number(dayRaw);
    const supportsMonthDay = [
      `${month}月${day}日`,
      `${String(month).padStart(2, "0")}月${String(day).padStart(2, "0")}日`,
      `${month}-${day}`,
      `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      `${month}/${day}`,
      `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`,
    ].some((value) => support.includes(value));
    if (!supportsMonthDay) continue;
    const original = normalizeClaimText(item.text);
    const replacement = `${month}月${day}日`;
    const chineseDate = new RegExp(`${year}年0?${month}月0?${day}日`, "gu");
    const numericDate = new RegExp(`${year}[-/.]0?${month}[-/.]0?${day}`, "gu");
    const repaired = original.replace(chineseDate, replacement).replace(numericDate, replacement);
    if (repaired === original) continue;
    item.text = repaired;
    changed += 1;
  }
  return { parsed: next, changed };
}

function generalizeUnsupportedActionAcronyms(parsed = {}, errors = []) {
  const next = JSON.parse(JSON.stringify(parsed || {}));
  const action = next?.sections?.recommended_actions;
  if (!action || typeof action !== "object") return { parsed: next, changed: 0 };
  let changed = 0;
  for (const error of errors) {
    const match = String(error || "").match(
      /^建议行动第 (\d+) 条中的实体 ([A-Z][A-Z0-9-]{2,}) 未出现在证据片段中$/u,
    );
    if (!match || Number(match[1]) !== 1) continue;
    const token = match[2].replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const original = normalizeClaimText(action.text);
    const repaired = original
      .replace(new RegExp(`\\b${token}\\b`, "gu"), "相关业务")
      .replace(/相关业务业务/gu, "相关业务");
    if (repaired === original) continue;
    action.text = repaired;
    changed += 1;
  }
  return { parsed: next, changed };
}

function generalizeUnsupportedAnalyticalEvents(parsed = {}, errors = []) {
  const next = JSON.parse(JSON.stringify(parsed || {}));
  const allowedSections = new Set(["risk_attention", "sales_opportunity", "recommended_actions"]);
  const replacements = new Map([
    ["合作", "对接"],
    ["交付", "项目推进"],
    ["签约", "事项确认"],
    ["合同", "商务事项"],
    ["部署", "应用"],
    ["上线", "应用"],
    ["落地", "实施"],
  ]);
  let changed = 0;
  for (const error of errors) {
    const match = String(error || "").match(
      /^(.+?)第 (\d+) 条中的事件表述“([^”]+)”未出现在证据片段中$/u,
    );
    if (!match || Number(match[2]) !== 1) continue;
    const section = SECTION_DEFINITIONS.find(([, title]) => title === match[1]);
    const replacement = replacements.get(match[3]);
    if (!section || !replacement || !allowedSections.has(section[0])) continue;
    const item = next?.sections?.[section[0]];
    if (!item || typeof item !== "object") continue;
    const original = normalizeClaimText(item.text);
    if (section[0] === "risk_attention" && !ANALYTICAL_RISK_TERMS.test(original)) continue;
    const repaired = original
      .split(match[3]).join(replacement)
      .replace(/对接对接/gu, "对接")
      .replace(/应用应用/gu, "应用")
      .replace(/实施实施/gu, "实施");
    if (repaired === original) continue;
    item.text = repaired;
    changed += 1;
  }
  return { parsed: next, changed };
}

function boundedCompleteText(values = [], maxLength = 160) {
  const candidates = values.map(normalizeClaimText).filter(Boolean);
  let result = "";
  for (const candidate of candidates) {
    const next = result ? `${result} ${candidate}` : candidate;
    if (next.length <= maxLength) {
      result = next;
      continue;
    }
    if (result) break;
    const slice = candidate.slice(0, Math.max(1, maxLength - 1)).trimEnd();
    const boundaries = ["。", "！", "？", "；", "，"]
      .map((mark) => slice.lastIndexOf(mark));
    const boundary = Math.max(...boundaries);
    if (boundary >= 12) {
      result = slice.slice(0, boundary + 1).replace(/[，；]$/u, "。");
    } else {
      result = `${slice.replace(/[，；：、\s]+$/u, "")}。`;
    }
    break;
  }
  return result;
}

function compiledDossierStructureErrors(submission = {}, { requirePlanItemIds = true } = {}) {
  const errors = [];
  const body = Array.isArray(submission?.body) ? submission.body : [];
  if (body.length !== SECTION_DEFINITIONS.length) {
    errors.push(`档案必须完整保留 ${SECTION_DEFINITIONS.length} 个固定章节`);
  }
  SECTION_DEFINITIONS.forEach(([, title], index) => {
    const section = body[index] || {};
    const segments = Array.isArray(section.segments) ? section.segments : [];
    const citationIds = Array.isArray(section.citation_ids) ? section.citation_ids : [];
    if (!String(section.text || "").startsWith(`${title}：`)) {
      errors.push(`${title}缺少固定章节标题`);
    }
    if (!segments.length) errors.push(`${title}缺少完整正文`);
    if (!citationIds.length) errors.push(`${title}缺少可核验引用`);
    if (/暂无|资料不足|未检索到|没有返回/u.test(String(section.text || ""))) {
      errors.push(`${title}不能使用缺省占位内容代替正常正文`);
    }
    segments.forEach((segment, segmentIndex) => {
      const path = `${title}第 ${segmentIndex + 1} 段`;
      if (!normalizeClaimText(segment?.text)) errors.push(`${path}内容为空`);
      if (!/[。！？]$/u.test(normalizeClaimText(segment?.text))) {
        errors.push(`${path}不是完整句子`);
      }
      if (
        requirePlanItemIds
        && (!Array.isArray(segment?.plan_item_ids) || !segment.plan_item_ids.length)
      ) {
        errors.push(`${path}缺少事实规划关联`);
      }
      if (!Array.isArray(segment?.citation_ids) || !segment.citation_ids.length) {
        errors.push(`${path}缺少可核验引用`);
      }
    });
  });
  if (String(submission?.summary || "").length > OUTPUT_BUDGET.summary_max_chars) {
    errors.push(`档案摘要超过 ${OUTPUT_BUDGET.summary_max_chars} 个字符`);
  }
  if (String(submission?.memory_summary || "").length > OUTPUT_BUDGET.memory_summary_max_chars) {
    errors.push(`记忆摘要超过 ${OUTPUT_BUDGET.memory_summary_max_chars} 个字符`);
  }
  return [...new Set(errors)];
}

/**
 * Compile the approved evidence plan into the public six-section dossier
 * without another stochastic model-writing pass. Every successful dossier
 * therefore keeps the fixed chapter contract and derives citations only from
 * the plan items that already passed grounding checks.
 */
export function compileDossierFromPlan(plan = {}) {
  const body = SECTION_DEFINITIONS.map(([key, title]) => {
    const segments = planItemsForSection(plan, key).map((item) => ({
      text: normalizeClaimText(item?.text),
      plan_item_ids: [String(item?.id || "")].filter(Boolean),
      citation_ids: [...new Set(
        (Array.isArray(item?.citation_ids) ? item.citation_ids : []).map(String).filter(Boolean),
      )],
    }));
    return {
      text: `${title}：${segments.map((segment) => segment.text).join("\n\n")}`,
      citation_ids: [...new Set(segments.flatMap((segment) => segment.citation_ids))],
      segments,
    };
  });
  const recentAndOpportunity = [
    ...planItemsForSection(plan, "recent_public_updates"),
    ...planItemsForSection(plan, "sales_opportunity"),
  ].map((item) => item.text);
  const memoryCandidates = [
    ...planItemsForSection(plan, "company_overview"),
    ...planItemsForSection(plan, "recent_public_updates"),
    ...planItemsForSection(plan, "sales_opportunity"),
  ].map((item) => item.text);
  const submission = {
    summary: boundedCompleteText(recentAndOpportunity, OUTPUT_BUDGET.summary_max_chars),
    body,
    memory_summary: boundedCompleteText(memoryCandidates, OUTPUT_BUDGET.memory_summary_max_chars),
  };
  return {
    submission,
    errors: compiledDossierStructureErrors(submission),
  };
}

function shouldRetryCall(result) {
  if (result?.ok) return false;
  return Boolean(result?.error?.retryable) || [
    "incomplete_response",
    "invalid_function_arguments",
    "missing_function_call",
    "unexpected_function_call",
  ].includes(String(result?.error?.code || ""));
}

function planningRepairDirectives(errors = []) {
  const grouped = new Map();
  for (const error of errors) {
    const raw = String(error || "");
    const itemMatch = raw.match(/^(.+?)第 (\d+) 条/u);
    if (!itemMatch) continue;
    const [, section, itemNumberRaw] = itemMatch;
    const key = `${section}:${itemNumberRaw}`;
    const existing = grouped.get(key) || {
      section,
      item_number: Number(itemNumberRaw),
      unsupported_event_terms: [],
      unsupported_numbers: [],
      unsupported_dates: [],
      unsupported_entities: [],
      unsupported_organizations: [],
      requires_supported_organization: false,
      instruction: "删除不受支持的值或断言，或改选 quote 中逐字包含该值且直接支撑正文的 Evidence Atom；不得近似、补全、改写后保留或虚构替代值。",
    };

    const captures = [
      ["unsupported_event_terms", raw.match(/中的事件表述“([^”]+)”未出现在证据片段中$/u)?.[1]],
      ["unsupported_numbers", raw.match(/中的数值 (.+?) 未出现在证据片段中$/u)?.[1]],
      ["unsupported_dates", raw.match(/中的日期 (.+?) 未出现在证据片段中$/u)?.[1]],
      ["unsupported_entities", raw.match(/中的实体 (.+?) 未出现在证据片段中$/u)?.[1]],
      ["unsupported_organizations", raw.match(/中的机构名称“([^”]+)”未出现在证据片段中$/u)?.[1]],
    ];
    let recognized = false;
    for (const [field, value] of captures) {
      if (!value) continue;
      recognized = true;
      if (!existing[field].includes(value)) existing[field].push(value);
    }
    if (/中的机构名称未出现在证据片段中$/u.test(raw)) {
      existing.requires_supported_organization = true;
      recognized = true;
    }
    if (!recognized) continue;
    grouped.set(key, existing);
  }
  return [...grouped.values()].slice(0, SECTION_DEFINITIONS.length);
}

function planningRepairSectionKeys(errors = []) {
  const keys = new Set(
    SECTION_DEFINITIONS
      .filter(([, title]) => errors.some((error) => String(error || "").includes(title)))
      .map(([key]) => key),
  );
  for (const error of errors) {
    const index = Number(String(error || "").match(/^body\[(\d+)\]/u)?.[1]);
    if (Number.isInteger(index) && SECTION_DEFINITIONS[index]) {
      keys.add(SECTION_DEFINITIONS[index][0]);
    }
  }
  return keys.size ? [...keys] : SECTION_DEFINITIONS.map(([key]) => key);
}

function planningFacingValidationErrors(errors = []) {
  return errors.map((error) => {
    const value = String(error || "");
    const segmentMatch = value.match(/^body\[(\d+)\]\.segments\[(\d+)\](.*)$/u);
    if (segmentMatch) {
      const section = SECTION_DEFINITIONS[Number(segmentMatch[1])];
      if (section) return `${section[1]}第 ${Number(segmentMatch[2]) + 1} 条${segmentMatch[3]}`;
    }
    const sectionMatch = value.match(/^body\[(\d+)\](.*)$/u);
    if (sectionMatch) {
      const section = SECTION_DEFINITIONS[Number(sectionMatch[1])];
      if (section) return `${section[1]}${sectionMatch[2]}`;
    }
    return value;
  });
}

function planningRepairPreviousPlan(previousPlan = {}, sectionKeys = []) {
  const sanitized = JSON.parse(JSON.stringify(previousPlan || {}));
  if (!sanitized.sections || typeof sanitized.sections !== "object") sanitized.sections = {};
  for (const key of sectionKeys) {
    sanitized.sections[key] = {
      text: "",
      evidence_ids: [],
    };
  }
  return sanitized;
}

function planningForbiddenGroundingValues(directives = []) {
  return [...new Set(directives.flatMap((directive) => [
    ...(directive.unsupported_event_terms || []),
    ...(directive.unsupported_numbers || []),
    ...(directive.unsupported_dates || []),
    ...(directive.unsupported_entities || []),
    ...(directive.unsupported_organizations || []),
  ]).map(String).filter(Boolean))].slice(0, 24);
}

function mergePlanningRepair(previousPlan = {}, repair = {}, sectionKeys = []) {
  const merged = JSON.parse(JSON.stringify(previousPlan || {}));
  if (!merged.sections || typeof merged.sections !== "object") merged.sections = {};
  for (const key of sectionKeys) {
    const section = repair?.sections?.[key];
    if (section && typeof section === "object") merged.sections[key] = section;
  }
  return merged;
}

export class DossierAgent {
  constructor({ callModel, validate, maxCalls = 3 }) {
    this.callModel = callModel;
    this.validate = validate;
    this.maxCalls = Math.max(1, Math.min(Number(maxCalls) || 3, 3));
  }

  async run(input = {}) {
    const context = buildDossierAgentContext(input);
    const evidenceIdsBySection = Object.fromEntries(
      SECTION_DEFINITIONS.map(([key]) => [
        key,
        (context.evidenceBySection[key] || []).map((atom) => String(atom.id)),
      ]),
    );
    const coverageErrors = SECTION_DEFINITIONS.flatMap(([key, title]) => (
      evidenceIdsBySection[key].length
        ? []
        : [`${title}证据覆盖不足，缺少可用于本章节的 Evidence Atom`]
    ));
    if (coverageErrors.length) {
      return {
        ok: false,
        stage: "evidence_coverage",
        result: null,
        context_metrics: context.metrics,
        validation_errors: coverageErrors,
      };
    }
    let callCount = 0;
    let planErrors = [];
    let lastResult = null;
    let planningAttempts = 0;
    let previousPlanSubmission = null;
    let failureStage = "planning";
    const ignoredEntityNames = [
      input.company?.name,
      input.company?.legal_name,
    ].filter(Boolean);

    const maxPlanningAttempts = this.maxCalls;
    while (planningAttempts < maxPlanningAttempts && callCount < this.maxCalls) {
      const revisingPlan = previousPlanSubmission !== null;
      const repairDirectives = revisingPlan ? planningRepairDirectives(planErrors) : [];
      const repairSectionKeys = revisingPlan
        ? planningRepairSectionKeys(planErrors)
        : SECTION_DEFINITIONS.map(([key]) => key);
      const repairPreviousPlan = revisingPlan
        ? planningRepairPreviousPlan(previousPlanSubmission, repairSectionKeys)
        : null;
      const forbiddenGroundingValues = revisingPlan
        ? planningForbiddenGroundingValues(repairDirectives)
        : [];
      const planParameters = buildDossierPlanSchema(evidenceIdsBySection, repairSectionKeys);
      planningAttempts += 1;
      callCount += 1;
      lastResult = await this.callModel({
        attempt: callCount,
        operation: revisingPlan ? "sales_dossier_agent_replan" : "sales_dossier_agent_plan",
        system: [
          ...input.instructions,
          `你必须调用 ${PLAN_FUNCTION_NAME}，一次提交六个章节可直接展示的正文与 Evidence ID，不能输出普通文本。`,
          "固定六个章节必须全部保留且每章恰好提交 1 个完整段落，任何章节都不能删除、留空或用“暂无”“资料不足”等占位句代替。",
          "每章 text 必须是可以直接进入报告正文的完整段落；可以包含 1-3 个紧密相关的完整句子，但只能围绕本章一个主要主题。建议行动章必须写清动作、对象和待核验事项。",
          "采用紧凑规划：六章合计只提交 6 个段落，不得把同一事实拆成多个条目，也不得为凑长度添加弱相关内容。",
          "每章只能返回 text 和 evidence_ids。不得输出 quote、citation_id、URL、引用位置、Evidence Atom 原文副本或其他字段。",
          "evidence_ids 必须来自本章 allowed_evidence，且只选择直接支撑正文的最少 Atom。quote、citation_id、segment 和最终引用全部由服务端从 Atom 确定性派生。",
          "allowed_evidence 的 selection_scope=section_candidate 表示证据直接匹配本章；selection_scope=cross_section_grounding 表示仅可基于已核验主体或经营事实作保守分析和核验建议，不得扩写成来源没有陈述的近期事件、风险事实、采购意向、预算或客户需求。",
          "source_usage_requirements 只描述当前可用来源，不设置全局引用数量门槛。每条内容只使用直接支撑它的最少来源，把专业来源和公开来源分配到最匹配的章节，不得为覆盖数量加入弱相关引用。",
          "正文中出现的完整日期、数值、机构和事件必须逐项出现在所选 Evidence Atom 的 quote 中；若 Atom 只有月日而没有年份，不得在正文补全年份。",
          "事实章节必须沿用 Atom quote 中已经出现的事件关系词；不得把“入选、候选、公示、采购”改写或升级成“合作、签约、合同、交付、部署、上线、落地、发布产品”等更强关系。",
          "信息量由证据决定：不得因为企业规模、章节字数或 Schema 上限而添加无来源内容，也不得用通用套话凑数量。",
          "销售机会判断和建议行动只能由所选 Atom 中的事实直接推出，不能把销售建议写成客户已经存在的需求或预算。",
          "同一事实只能规划到最匹配的一个章节。搜索标题、问句、关键词列表和检索状态都不是事实。",
          ...(revisingPlan ? [
            "上一版规划或确定性组装结果没有通过质量门禁；previous_plan 保留其他已合格章节，但被点名章节的旧正文和证据 ID 已由服务端清空，防止复制已知错误。只重写 planning_errors 点名章节，不能新增证据外事实。",
            "repair_directives 是必须逐项满足的修订合同。不得原样保留任何 unsupported_event_terms、unsupported_numbers、unsupported_dates、unsupported_entities 或 unsupported_organizations；只有重新选择的 Evidence Atom quote 确实逐字包含该值并直接支撑正文时，才允许继续使用。",
            "forbidden_grounding_values 是上一版未获所选证据支持的值；本次重写不得再次输出这些值。若 allowed_evidence 中确有该值，也必须选择包含它的 Evidence ID 后才能使用。",
            "本次只提交 repair_section_keys 指定的章节补丁，不得重复输出其他章节。服务端会把补丁与 previous_plan 的其余已合格章节确定性合并后重新执行完整六章门禁。",
            "错误点名机构名称时，只能使用所选 Atom quote 中逐字出现的完整机构名称；找不到完整名称就删除该机构和对应断言，不得使用简称、补全名称或近义实体。",
            "planning_errors 若指出高风险事实缺少双来源或关键数字未获得双来源一致支持，必须删除该高风险事实和数字，改写本章其他可由单个 Atom 直接支持的普通事实；不得只更换 Evidence ID 后保留原断言。",
            "修订时仍必须保留六个完整章节；不能通过删除章节、清空章节或改写成缺省占位句来规避错误。",
          ] : []),
        ].join("\n"),
        payload: {
          task: revisingPlan ? "修订企业销售档案章节正文" : "生成企业销售档案章节正文",
          company: input.company,
          evidence_by_section: Object.fromEntries(repairSectionKeys.map((key) => [
            key,
            {
              title: SECTION_DEFINITIONS.find(([candidate]) => candidate === key)?.[1] || key,
              coverage_status: context.evidenceCoverage[key]?.status || "missing",
              coverage_reasons: context.evidenceCoverage[key]?.reasons || [],
              allowed_evidence: (context.evidenceBySection[key] || []).map(compactEvidenceAtom),
            },
          ])),
          evidence_policy: context.evidencePolicy,
          evidence_conflicts: context.evidenceConflicts,
          source_selection_policy: context.sourceSelectionPolicy,
          source_usage_requirements: context.sourceUsageRequirements,
          ...(revisingPlan ? {
            previous_plan: repairPreviousPlan,
            planning_errors: planErrors,
            repair_directives: repairDirectives,
            forbidden_grounding_values: forbiddenGroundingValues,
            repair_section_keys: repairSectionKeys,
          } : {}),
        },
        functionName: PLAN_FUNCTION_NAME,
        functionDescription: "提交固定六章的可展示正文和每章使用的 Evidence Atom ID。",
        parameters: planParameters,
        maxTokens: 2400,
      });
      if (!lastResult?.ok) {
        planErrors = [`事实规划提交失败：${lastResult?.error?.code || "provider_error"}`];
        if (
          planningAttempts < maxPlanningAttempts
          && callCount < this.maxCalls
          && shouldRetryCall(lastResult)
        ) continue;
        return {
          ok: false,
          stage: "planning",
          result: lastResult,
          context_metrics: context.metrics,
          validation_errors: planErrors,
        };
      }
      previousPlanSubmission = revisingPlan
        ? mergePlanningRepair(previousPlanSubmission, lastResult.parsed, repairSectionKeys)
        : lastResult.parsed;
      let planned = normalizedPlan(
        previousPlanSubmission,
        input.evidenceAtoms,
        input.citations,
        evidenceIdsBySection,
        context.sourceUsageRequirements,
        ignoredEntityNames,
      );
      const evidenceReselected = reselectGroundingEvidence(
        previousPlanSubmission,
        input.evidenceAtoms,
        input.citations,
        evidenceIdsBySection,
        context.sourceUsageRequirements,
        ignoredEntityNames,
      );
      if (evidenceReselected.changed > 0) {
        previousPlanSubmission = evidenceReselected.parsed;
        planned = evidenceReselected.evaluated;
      }
      const dateReduced = reduceUnsupportedDatePrecision(
        previousPlanSubmission,
        planned.errors,
        input.evidenceAtoms,
      );
      if (dateReduced.changed > 0) {
        previousPlanSubmission = dateReduced.parsed;
        planned = normalizedPlan(
          previousPlanSubmission,
          input.evidenceAtoms,
          input.citations,
          evidenceIdsBySection,
          context.sourceUsageRequirements,
          ignoredEntityNames,
        );
      }
      const actionGeneralized = generalizeUnsupportedActionAcronyms(
        previousPlanSubmission,
        planned.errors,
      );
      if (actionGeneralized.changed > 0) {
        previousPlanSubmission = actionGeneralized.parsed;
        planned = normalizedPlan(
          previousPlanSubmission,
          input.evidenceAtoms,
          input.citations,
          evidenceIdsBySection,
          context.sourceUsageRequirements,
          ignoredEntityNames,
        );
      }
      const analyticalEventGeneralized = generalizeUnsupportedAnalyticalEvents(
        previousPlanSubmission,
        planned.errors,
      );
      if (analyticalEventGeneralized.changed > 0) {
        const candidate = normalizedPlan(
          analyticalEventGeneralized.parsed,
          input.evidenceAtoms,
          input.citations,
          evidenceIdsBySection,
          context.sourceUsageRequirements,
          ignoredEntityNames,
        );
        if (candidate.errors.length < planned.errors.length) {
          previousPlanSubmission = analyticalEventGeneralized.parsed;
          planned = candidate;
        }
      }
      planErrors = planned.errors;
      if (planErrors.length) {
        failureStage = "planning";
        continue;
      }
      const compiled = compileDossierFromPlan(planned.plan);
      const validated = this.validate(compiled.submission);
      const validationErrors = planningFacingValidationErrors([
        ...compiled.errors,
        ...(validated.errors || []),
        ...compiledDossierStructureErrors({
          ...compiled.submission,
          body: validated.body,
        }, { requirePlanItemIds: false }),
      ]);
      if (!validationErrors.length) {
        return {
          ok: true,
          stage: "complete",
          result: lastResult,
          submission: {
            ...compiled.submission,
            body: validated.body,
          },
          approved_plan: planned.plan,
          context_metrics: context.metrics,
          validation_errors: [],
        };
      }
      planErrors = [...new Set(validationErrors)];
      failureStage = "validation";
    }

    return {
      ok: false,
      stage: failureStage,
      result: lastResult,
      context_metrics: context.metrics,
      validation_errors: planErrors,
    };
  }
}
