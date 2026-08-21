import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDossierAgentContext,
  buildDossierSourceUsageRequirements,
  compileDossierFromPlan,
  DossierAgent,
  dossierSourceUsageErrors,
} from "../src/agents/dossierAgent.js";

const SECTION_KEYS = [
  "company_overview",
  "business_dynamics",
  "recent_public_updates",
  "risk_attention",
  "sales_opportunity",
  "recommended_actions",
];

function atomInput() {
  const citations = SECTION_KEYS.map((key, index) => ({
    id: `citation_${key}`,
    source_kind: key === "recent_public_updates" ? "联网搜索" : "专业数据集",
    summary: `测试科技有限公司为${key}提供可引用的完整业务事实。`,
    quality_tier: 1,
    independence_key: `source:${key}`,
    entity_match: "verified",
  }));
  const evidenceAtoms = SECTION_KEYS.map((key, index) => ({
    id: `E_${String(index + 1).padStart(20, "0")}`,
    citation_id: citations[index].id,
    quote: citations[index].summary,
    section_candidates: [key],
    entity_match: "verified",
    score: 80,
    source_kind: key === "recent_public_updates" ? "public" : "professional",
    source_type: key === "recent_public_updates" ? "web" : "datapro",
    title: `${key} evidence`,
    reliability: "professional",
    conflict_fields: [],
  }));
  const evidenceCoverage = Object.fromEntries(evidenceAtoms.map((atom, index) => [
    SECTION_KEYS[index],
    { status: "supported", atom_ids: [atom.id], reasons: [] },
  ]));
  return {
    company: {
      name: "测试科技有限公司",
      legal_name: "测试科技有限公司",
      industry: "企业软件",
      location: "北京",
    },
    citations,
    evidenceAtoms,
    evidenceCoverage,
    evidencePolicy: { fail_closed: true },
    evidenceConflicts: [],
    sourceSelectionPolicy: {},
    instructions: ["只使用输入 Evidence Atom。"],
  };
}

function responseFor(request, suffix = "") {
  return {
    sections: Object.fromEntries(
      request.parameters.properties.sections.required.map((key) => [
        key,
        {
          text: `测试科技有限公司为${key}提供可引用的完整业务事实${suffix}。`,
          evidence_ids: [request.payload.evidence_by_section[key].allowed_evidence[0].id],
        },
      ]),
    ),
  };
}

test("dossier Agent context keeps citation and Atom projections bounded by selected sources", () => {
  const citations = [
    ...Array.from({ length: 10 }, (_, index) => ({
      id: `professional_${index}`,
      source_kind: "专业数据集",
      label: index === 0 ? "企业工商数据库" : "金融数据库",
      summary: `专业证据 ${index} ${"业务事实".repeat(500)}`,
      quality_tier: index < 3 ? 1 : 2,
      freshness: "current",
    })),
    ...Array.from({ length: 10 }, (_, index) => ({
      id: `public_${index}`,
      source_kind: "联网搜索",
      label: `公开来源 ${index}`,
      summary: `公开事件 ${index} ${"项目进展".repeat(500)}`,
      published_at: `2026-07-${String(20 - index).padStart(2, "0")}T00:00:00.000Z`,
      quality_tier: 2,
      freshness: "current",
    })),
  ];
  const evidenceAtoms = citations.map((citation, index) => ({
    id: `E_${String(index + 1).padStart(20, "0")}`,
    citation_id: citation.id,
    quote: citation.summary.slice(0, 80),
    section_candidates: [SECTION_KEYS[index % SECTION_KEYS.length]],
    entity_match: "verified",
    score: 100 - index,
  }));
  const context = buildDossierAgentContext({
    citations,
    evidenceAtoms,
    sourceSelectionPolicy: {
      business_database_ids: ["professional_0"],
      professional_dataset_ids: citations.slice(0, 10).map((item) => item.id),
      web_search_ids: citations.slice(10).map((item) => item.id),
    },
  });

  assert.equal(context.citations.length, 10);
  assert.ok(context.metrics.professional_count >= 1);
  assert.ok(context.metrics.public_count >= 1);
  assert.equal(
    context.metrics.professional_count + context.metrics.public_count,
    context.citations.length,
  );
  assert.ok(context.metrics.serialized_chars < 10_000);
  assert.ok(context.metrics.selected_atom_count <= 10);
  assert.ok(Object.values(context.evidenceBySection).every((items) => items.length <= 6));
});

test("context cap preserves low-ranked sources that are indispensable to a section", () => {
  const citations = [
    ...Array.from({ length: 10 }, (_, index) => ({
      id: `general_${index}`,
      source_kind: "专业数据集",
      label: "企业工商数据库",
      summary: `测试科技有限公司经营企业软件业务，记录序号 ${100 + index}。`,
      quality_tier: 1,
      freshness: "current",
    })),
    {
      id: "risk_low_rank",
      source_kind: "专业数据集",
      label: "企业风险数据库",
      summary: "测试科技有限公司披露项目交付周期延长，需要核验实施排期。",
      quality_tier: 4,
    },
    {
      id: "recent_low_rank",
      source_kind: "联网搜索",
      label: "产品升级公告",
      summary: "2026年7月30日，测试科技有限公司披露产品升级进展。",
      published_at: "2026-07-30T00:00:00.000Z",
      quality_tier: 4,
    },
  ];
  const evidenceAtoms = citations.map((citation, index) => ({
    id: `E_cap_${String(index + 1).padStart(14, "0")}`,
    citation_id: citation.id,
    quote: citation.summary,
    section_candidates: citation.id === "risk_low_rank"
      ? ["risk_attention"]
      : citation.id === "recent_low_rank"
        ? ["recent_public_updates"]
        : ["company_overview", "business_dynamics", "sales_opportunity", "recommended_actions"],
    entity_match: "verified",
    score: citation.id.startsWith("general_") ? 100 - index : 10,
    source_kind: citation.source_kind === "联网搜索" ? "public" : "professional",
  }));

  const context = buildDossierAgentContext({ citations, evidenceAtoms });

  assert.equal(context.citations.length, 10);
  assert.ok(context.citations.some((citation) => citation.id === "risk_low_rank"));
  assert.ok(context.citations.some((citation) => citation.id === "recent_low_rank"));
  assert.equal(context.evidenceBySection.risk_attention[0].citation_id, "risk_low_rank");
  assert.equal(context.evidenceBySection.recent_public_updates[0].citation_id, "recent_low_rank");
});

test("chapter candidates are restricted to the same qualified source policy used by final validation", () => {
  const citations = [
    {
      id: "business_verified",
      source_kind: "专业数据集",
      label: "企业工商数据库",
      summary: "测试科技有限公司成立于2020年5月11日。",
      quality_tier: 1,
      entity_match: "verified",
    },
    {
      id: "risk_verified",
      source_kind: "专业数据集",
      label: "企业风险数据库",
      summary: "测试科技有限公司披露一条需核验的诉讼记录。",
      quality_tier: 1,
      entity_match: "verified",
    },
    {
      id: "recent_verified",
      source_kind: "联网搜索",
      label: "官方项目公告",
      summary: "2026年7月30日，测试科技有限公司公告中标人信息。",
      quality_tier: 1,
      published_at: "2026-07-30T00:00:00.000Z",
      entity_match: "verified",
    },
    {
      id: "recent_marketing",
      source_kind: "联网搜索",
      label: "品牌营销页",
      summary: "测试科技有限公司提供领先的全栈解决方案。",
      quality_tier: 2,
      entity_match: "verified",
    },
  ];
  const evidenceAtoms = citations.map((citation, index) => ({
    id: `E_policy_${String(index + 1).padStart(12, "0")}`,
    citation_id: citation.id,
    quote: citation.summary,
    section_candidates: citation.id.startsWith("recent_")
      ? ["recent_public_updates"]
      : citation.id === "risk_verified"
        ? ["risk_attention"]
        : ["company_overview"],
    entity_match: "verified",
    score: citation.id === "recent_marketing" ? 100 : 80,
    source_kind: citation.source_kind === "联网搜索" ? "public" : "professional",
  }));
  const evidenceCoverage = {
    company_overview: { status: "supported", atom_ids: [evidenceAtoms[0].id], reasons: [] },
    recent_public_updates: {
      status: "supported",
      atom_ids: [evidenceAtoms[2].id, evidenceAtoms[3].id],
      reasons: [],
    },
    risk_attention: { status: "supported", atom_ids: [evidenceAtoms[1].id], reasons: [] },
  };

  const context = buildDossierAgentContext({
    citations,
    evidenceAtoms,
    evidenceCoverage,
    sourceSelectionPolicy: {
      business_database_ids: ["business_verified"],
      risk_database_ids: ["risk_verified"],
      web_search_ids: ["recent_verified"],
    },
  });

  assert.deepEqual(
    context.evidenceBySection.company_overview.map((atom) => atom.citation_id),
    ["business_verified"],
  );
  assert.deepEqual(
    context.evidenceBySection.risk_attention.map((atom) => atom.citation_id),
    ["risk_verified"],
  );
  assert.deepEqual(
    context.evidenceBySection.recent_public_updates.map((atom) => atom.citation_id),
    ["recent_verified"],
  );
});

test("single-source critical financial figures are excluded before planning", () => {
  const citations = [
    {
      id: "recent_single_profit",
      source_kind: "联网搜索",
      label: "公开网页",
      summary: "2026年7月30日，测试科技有限公司公布净利润680亿元。",
      quality_tier: 3,
      entity_match: "verified",
      independence_key: "public:single-profit",
    },
    {
      id: "recent_regular_event",
      source_kind: "联网搜索",
      label: "项目公告",
      summary: "2026年7月29日，测试科技有限公司公告产品升级进展。",
      quality_tier: 2,
      entity_match: "verified",
      independence_key: "public:regular-event",
    },
  ];
  const evidenceAtoms = citations.map((citation, index) => ({
    id: `E_critical_${String(index + 1).padStart(10, "0")}`,
    citation_id: citation.id,
    quote: citation.summary,
    section_candidates: ["recent_public_updates"],
    entity_match: "verified",
    score: index === 0 ? 100 : 80,
    source_kind: "public",
  }));

  const context = buildDossierAgentContext({
    citations,
    evidenceAtoms,
    evidenceCoverage: {
      recent_public_updates: {
        status: "supported",
        atom_ids: evidenceAtoms.map((atom) => atom.id),
        reasons: [],
      },
    },
    sourceSelectionPolicy: {
      web_search_ids: citations.map((citation) => citation.id),
    },
  });

  assert.deepEqual(
    context.evidenceBySection.recent_public_updates.map((atom) => atom.citation_id),
    ["recent_regular_event"],
  );
  assert.equal(context.metrics.excluded_unsupported_critical_atom_count, 1);
});

test("single-source dated penalties are excluded from report and action candidates", () => {
  const citations = [{
    id: "single_penalty",
    source_kind: "联网搜索",
    label: "企业信息聚合页",
    summary: "2025-02-17行政处罚所涉工程施工安全管理要求需要核实。",
    quality_tier: 3,
    entity_match: "verified",
    independence_key: "public:single-penalty",
  }, {
    id: "ordinary_scope",
    source_kind: "专业数据集",
    label: "企业工商数据库",
    summary: "公司名称:测试科技有限公司;经营范围:工程安装和企业软件开发。",
    quality_tier: 1,
    entity_match: "verified",
    independence_key: "professional:scope",
  }];
  const evidenceAtoms = citations.map((citation, index) => ({
    id: `E_risk_${String(index + 1).padStart(14, "0")}`,
    citation_id: citation.id,
    quote: citation.summary,
    section_candidates: ["risk_attention", "recommended_actions"],
    entity_match: "verified",
    score: 100 - index,
    source_kind: citation.source_kind === "联网搜索" ? "public" : "professional",
  }));

  const context = buildDossierAgentContext({ citations, evidenceAtoms });

  assert.ok(Object.values(context.evidenceBySection).every((atoms) => (
    atoms.every((atom) => atom.citation_id !== "single_penalty")
  )));
  assert.equal(context.metrics.excluded_unsupported_critical_atom_count, 1);
});

test("business records for a different legal entity are excluded from every chapter", () => {
  const citations = [
    {
      id: "target_business",
      source_kind: "专业数据集",
      label: "企业工商数据库",
      summary: "公司名称:测试科技有限公司;经营范围:软件开发。",
      quality_tier: 1,
      entity_match: "verified",
    },
    {
      id: "similar_name_business",
      source_kind: "专业数据集",
      label: "企业工商数据库",
      summary: "公司名称:山西测试科技有限公司;经营范围:网络建设。",
      quality_tier: 1,
      entity_match: "verified",
    },
  ];
  const evidenceAtoms = citations.map((citation, index) => ({
    id: `E_entity_${String(index + 1).padStart(12, "0")}`,
    citation_id: citation.id,
    quote: citation.summary,
    section_candidates: ["company_overview", "business_dynamics", "recommended_actions"],
    entity_match: "verified",
    score: 90 - index,
    source_kind: "professional",
  }));

  const context = buildDossierAgentContext({
    citations,
    evidenceAtoms,
    sourceSelectionPolicy: {
      business_database_ids: ["target_business"],
      excluded_entity_citation_ids: ["similar_name_business"],
    },
  });

  assert.ok(Object.values(context.evidenceBySection).every((atoms) => (
    atoms.every((atom) => atom.citation_id !== "similar_name_business")
  )));
  assert.equal(context.metrics.excluded_unrelated_entity_citation_count, 1);
});

test("dossier source usage remains diagnostic with no global citation-count floor", () => {
  const citations = [
    { id: "professional", source_kind: "专业数据集", independence_key: "datapro:business" },
    { id: "public_1", source_kind: "联网搜索", independence_key: "official.example" },
    { id: "public_2", source_kind: "联网搜索", independence_key: "media.example" },
  ];
  const requirements = buildDossierSourceUsageRequirements(citations);

  assert.equal(requirements.required_distinct_source_count, 0);
  assert.deepEqual(
    dossierSourceUsageErrors(["professional"], citations, requirements),
    [],
  );
});

test("deterministic compiler keeps the fixed six-section order and derived citations", () => {
  const plan = {
    sections: Object.fromEntries(SECTION_KEYS.map((key, index) => [
      key,
      {
        id: `${key}_1`,
        text: `测试科技有限公司为${key}提供可引用的完整业务事实。`,
        evidence_ids: [`E_${String(index + 1).padStart(20, "0")}`],
        citation_ids: [`citation_${key}`],
        evidence_spans: [{
          evidence_id: `E_${String(index + 1).padStart(20, "0")}`,
          citation_id: `citation_${key}`,
          quote: `测试科技有限公司为${key}提供可引用的完整业务事实。`,
        }],
      },
    ])),
  };
  const compiled = compileDossierFromPlan(plan);

  assert.deepEqual(compiled.errors, []);
  assert.equal(compiled.submission.body.length, 6);
  assert.deepEqual(
    compiled.submission.body.map((section) => section.citation_ids[0]),
    SECTION_KEYS.map((key) => `citation_${key}`),
  );
});

test("dossier Agent retries one incomplete response and never adds a fallback call", async () => {
  let calls = 0;
  const input = atomInput();
  const agent = new DossierAgent({
    maxCalls: 2,
    callModel: async (request) => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: false,
          error: { code: "incomplete_response", retryable: true },
          raw_ref: "model:incomplete",
        };
      }
      return {
        ok: true,
        parsed: responseFor(request),
        raw_ref: "model:complete",
      };
    },
    validate: (answer) => ({ body: answer.body, errors: [] }),
  });

  const result = await agent.run(input);

  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.deepEqual(
    result.submission.body.map((section) => section.citation_ids.length),
    [1, 1, 1, 1, 1, 1],
  );
});

test("dossier Agent fails closed after two rejected complete submissions", async () => {
  let calls = 0;
  const input = atomInput();
  const agent = new DossierAgent({
    maxCalls: 2,
    callModel: async (request) => {
      calls += 1;
      return {
        ok: true,
        parsed: responseFor(request),
        raw_ref: `model:${calls}`,
      };
    },
    validate: (answer) => ({ body: answer.body, errors: ["引用覆盖不足"] }),
  });

  const result = await agent.run(input);

  assert.equal(result.ok, false);
  assert.equal(result.stage, "validation");
  assert.equal(calls, 2);
  assert.equal(result.submission, undefined);
});
