import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDossierPlanSchema,
  DossierAgent,
} from "../src/agents/dossierAgent.js";

const SECTION_KEYS = [
  "company_overview",
  "business_dynamics",
  "recent_public_updates",
  "risk_attention",
  "sales_opportunity",
  "recommended_actions",
];

const SECTION_TITLES = [
  "企业与业务概览",
  "经营与业务动态",
  "近期公开动态",
  "风险与关注事项",
  "销售机会判断",
  "建议行动",
];

const SECTION_QUOTES = {
  company_overview: "云穹矩阵科技有限公司经营企业软件与知识库产品。",
  business_dynamics: "云穹矩阵科技有限公司发布知识库产品升级公告。",
  recent_public_updates: "2026年7月30日，云穹矩阵科技有限公司披露产品升级进展。",
  risk_attention: "云穹矩阵科技有限公司披露项目交付周期延长，需要核验实施排期。",
  sales_opportunity: "知识库产品升级为企业协作检索场景形成销售沟通窗口。",
  recommended_actions: "知识库产品升级范围和实施排期仍需由产品负责人核验。",
};

const SECTION_TEXT = {
  company_overview: "云穹矩阵科技有限公司经营企业软件与知识库产品。",
  business_dynamics: "云穹矩阵科技有限公司已发布知识库产品升级公告。",
  recent_public_updates: "2026年7月30日，云穹矩阵科技有限公司披露产品升级进展。",
  risk_attention: "云穹矩阵科技有限公司披露项目交付周期延长，需要核验实施排期。",
  sales_opportunity: "知识库产品升级形成销售沟通窗口，但不代表企业已有采购意向。",
  recommended_actions: "销售人员应联系产品负责人核验知识库产品升级范围和实施排期。",
};

function evidenceFixture() {
  const citations = [];
  const evidenceAtoms = [];
  const evidenceCoverage = {};
  SECTION_KEYS.forEach((key, index) => {
    const citationId = `citation_${key}`;
    const atomId = `E_${String(index + 1).padStart(20, "0")}`;
    const sourceKind = key === "recent_public_updates" ? "联网搜索" : "专业数据集";
    citations.push({
      id: citationId,
      source_kind: sourceKind,
      summary: SECTION_QUOTES[key],
      quality_tier: 1,
      independence_key: `independent:${key}`,
      entity_match: "verified",
    });
    evidenceAtoms.push({
      id: atomId,
      citation_id: citationId,
      source_hash: `${index + 1}`.repeat(64).slice(0, 64),
      independence_hash: `${index + 7}`.repeat(64).slice(0, 64),
      source_kind: sourceKind === "联网搜索" ? "public" : "professional",
      source_type: sourceKind === "联网搜索" ? "web" : "datapro",
      title: `${SECTION_TITLES[index]}证据`,
      url: sourceKind === "联网搜索" ? `https://example.com/${key}` : null,
      published_at: key === "recent_public_updates"
        ? "2026-07-30T00:00:00.000Z"
        : null,
      source_updated_at: null,
      source_text_field: "summary",
      quote: SECTION_QUOTES[key],
      quote_start: 0,
      quote_end: SECTION_QUOTES[key].length,
      normalized_text: SECTION_QUOTES[key],
      entity_match: "verified",
      entity_anchors: ["云穹矩阵科技有限公司"],
      section_candidates: [key],
      dates: key === "recent_public_updates" ? ["2026-07-30"] : [],
      numbers: [],
      organizations: ["云穹矩阵科技有限公司"],
      event_families: [],
      conflict_fields: [],
      reliability: "professional",
      score: 80,
    });
    evidenceCoverage[key] = {
      status: "supported",
      atom_ids: [atomId],
      reasons: [],
    };
  });
  return { citations, evidenceAtoms, evidenceCoverage };
}

function parsedPlan(request, overrides = {}) {
  return {
    sections: Object.fromEntries(
      request.parameters.properties.sections.required.map((key) => [
        key,
        {
          text: overrides[key]?.text || SECTION_TEXT[key],
          evidence_ids: overrides[key]?.evidence_ids
            || [request.payload.evidence_by_section[key].allowed_evidence[0].id],
        },
      ]),
    ),
  };
}

function agentInput(overrides = {}) {
  const fixture = evidenceFixture();
  return {
    company: {
      name: "云穹矩阵科技有限公司",
      legal_name: "云穹矩阵科技有限公司",
      industry: "企业软件",
      location: "北京",
    },
    citations: fixture.citations,
    evidenceAtoms: fixture.evidenceAtoms,
    evidenceCoverage: fixture.evidenceCoverage,
    evidencePolicy: { fail_closed: true },
    evidenceConflicts: [],
    sourceSelectionPolicy: {},
    instructions: ["只使用输入 Evidence Atom。"],
    ...overrides,
  };
}

function createAgent(callModel, validate = (answer) => ({
  body: answer.body,
  errors: [],
})) {
  return new DossierAgent({
    callModel,
    validate,
    maxCalls: 2,
  });
}

test("dossier schema exposes only text and chapter-scoped evidence_ids", () => {
  const allowed = Object.fromEntries(SECTION_KEYS.map((key, index) => [
    key,
    [`E_${String(index + 1).padStart(20, "0")}`],
  ]));
  const schema = buildDossierPlanSchema(allowed);

  assert.deepEqual(schema.properties.sections.required, SECTION_KEYS);
  for (const key of SECTION_KEYS) {
    const section = schema.properties.sections.properties[key];
    assert.deepEqual(Object.keys(section.properties), ["text", "evidence_ids"]);
    assert.deepEqual(section.required, ["text", "evidence_ids"]);
    assert.deepEqual(section.properties.evidence_ids.items.enum, allowed[key]);
    assert.equal(section.properties.quote, undefined);
    assert.equal(section.properties.citation_id, undefined);
    assert.equal(section.properties.evidence_spans, undefined);
  }
});

test("server derives verbatim quotes citations and segments from evidence ids", async () => {
  const calls = [];
  const input = agentInput();
  const agent = createAgent(async (request) => {
    calls.push(request);
    return {
      ok: true,
      parsed: parsedPlan(request),
      raw_ref: "model:atom-plan",
    };
  });

  const result = await agent.run(input);

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(result.submission.body.length, 6);
  SECTION_KEYS.forEach((key, index) => {
    const atom = input.evidenceAtoms.find((item) => item.section_candidates.includes(key));
    const section = result.approved_plan.sections[key];
    assert.deepEqual(section.evidence_ids, [atom.id]);
    assert.deepEqual(section.citation_ids, [atom.citation_id]);
    assert.deepEqual(section.evidence_spans, [{
      evidence_id: atom.id,
      citation_id: atom.citation_id,
      quote: atom.quote,
    }]);
    assert.deepEqual(result.submission.body[index].citation_ids, [atom.citation_id]);
    assert.deepEqual(
      result.submission.body[index].segments[0].citation_ids,
      [atom.citation_id],
    );
  });
  assert.doesNotMatch(JSON.stringify(calls[0].parameters), /quote|citation_id|url/iu);
});

test("alias-scoped factual evidence receives a deterministic public-information boundary", async () => {
  const input = agentInput();
  const recentAtom = input.evidenceAtoms.find((atom) => (
    atom.section_candidates.includes("recent_public_updates")
  ));
  const recentCitation = input.citations.find((citation) => citation.id === recentAtom.citation_id);
  recentAtom.entity_match = "alias_scoped";
  recentCitation.entity_match = "alias_scoped";
  const agent = createAgent(async (request) => ({
    ok: true,
    parsed: parsedPlan(request),
    raw_ref: "model:alias-boundary",
  }));

  const result = await agent.run(input);

  assert.equal(result.ok, true);
  assert.match(
    result.approved_plan.sections.recent_public_updates.text,
    /^公开信息显示，/u,
  );
  assert.match(result.submission.body[2].text, /近期公开动态：公开信息显示，/u);
});

test("registered scope wording is deterministically neutralized in the overview", async () => {
  const agent = createAgent(async (request) => ({
    ok: true,
    parsed: parsedPlan(request, {
      company_overview: {
        text: "公司经营企业软件，并延伸至知识库产品。",
      },
    }),
    raw_ref: "model:neutral-scope",
  }));

  const result = await agent.run(agentInput());

  assert.equal(result.ok, true);
  assert.equal(
    result.approved_plan.sections.company_overview.text,
    "公司经营企业软件，并包括知识库产品。",
  );
});

test("invalid evidence ids are rejected without deriving citations", async () => {
  let calls = 0;
  const agent = createAgent(async (request) => {
    calls += 1;
    const parsed = parsedPlan(request);
    parsed.sections.company_overview.evidence_ids = ["E_not_allowed"];
    return { ok: true, parsed, raw_ref: `model:${calls}` };
  });

  const result = await agent.run(agentInput());

  assert.equal(result.ok, false);
  assert.equal(result.stage, "planning");
  assert.equal(calls, 2);
  assert.ok(result.validation_errors.some((error) => (
    error.includes("企业与业务概览") && error.includes("无效 Evidence ID")
  )));
});

test("an evidence id allowed for another chapter is rejected", async () => {
  let calls = 0;
  const input = agentInput();
  const businessAtom = input.evidenceAtoms.find((item) => (
    item.section_candidates.includes("business_dynamics")
  ));
  const agent = createAgent(async (request) => {
    calls += 1;
    const parsed = parsedPlan(request);
    parsed.sections.risk_attention.evidence_ids = [businessAtom.id];
    return { ok: true, parsed, raw_ref: `model:${calls}` };
  });

  const result = await agent.run(input);

  assert.equal(result.ok, false);
  assert.equal(calls, 2);
  assert.ok(result.validation_errors.some((error) => (
    error.includes("风险与关注事项") && error.includes("不属于本章节")
  )));
});

test("missing chapter-specific coverage uses grounded cross-section evidence", async () => {
  let calls = 0;
  const input = agentInput();
  input.evidenceCoverage.risk_attention = {
    status: "missing",
    atom_ids: [],
    reasons: ["no_relevant_atoms"],
  };
  input.evidenceAtoms = input.evidenceAtoms.filter((atom) => (
    !atom.section_candidates.includes("risk_attention")
  ));
  const agent = createAgent(async (request) => {
    calls += 1;
    const parsed = parsedPlan(request, {
      risk_attention: {
        text: "云穹矩阵科技有限公司已发布知识库产品升级公告，商务推进应核验实施范围。",
      },
    });
    return { ok: true, parsed, raw_ref: "model:cross-section-grounding" };
  });

  const result = await agent.run(input);

  assert.equal(result.ok, true);
  assert.equal(result.stage, "complete");
  assert.equal(calls, 1);
  const riskInput = result.approved_plan.sections.risk_attention;
  assert.equal(riskInput.evidence_ids.length, 1);
  assert.equal(
    riskInput.evidence_ids[0],
    input.evidenceAtoms.find((atom) => (
      atom.section_candidates.includes("business_dynamics")
    )).id,
  );
});

test("the bounded repair call returns only the failed chapter", async () => {
  const calls = [];
  const agent = createAgent(async (request) => {
    calls.push(request);
    if (calls.length === 1) {
      return {
        ok: true,
        parsed: parsedPlan(request, {
          recent_public_updates: {
            text: "2026年7月31日，云穹矩阵科技有限公司披露产品升级进展。",
          },
        }),
        raw_ref: "model:first",
      };
    }
    return {
      ok: true,
      parsed: parsedPlan(request),
      raw_ref: "model:repair",
    };
  });

  const result = await agent.run(agentInput());

  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].operation, "sales_dossier_agent_replan");
  assert.deepEqual(
    calls[1].parameters.properties.sections.required,
    ["recent_public_updates"],
  );
  assert.deepEqual(
    Object.keys(calls[1].parameters.properties.sections.properties),
    ["recent_public_updates"],
  );
  assert.equal(
    result.approved_plan.sections.company_overview.text,
    SECTION_TEXT.company_overview,
  );
  assert.equal(
    result.approved_plan.sections.recent_public_updates.text,
    SECTION_TEXT.recent_public_updates,
  );
});

test("indexed final-validation errors are mapped back to the exact failed chapter", async () => {
  const calls = [];
  let validations = 0;
  const agent = createAgent(async (request) => {
    calls.push(request);
    return {
      ok: true,
      parsed: parsedPlan(request),
      raw_ref: `model:indexed-validation-${calls.length}`,
    };
  }, (answer) => ({
    body: answer.body,
    errors: validations++ === 0
      ? ["body[2].segments[0] 的净利润“680亿元”未获得双来源一致支持"]
      : [],
  }));

  const result = await agent.run(agentInput());

  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(
    calls[1].parameters.properties.sections.required,
    ["recent_public_updates"],
  );
  assert.match(
    calls[1].payload.planning_errors[0],
    /^近期公开动态第 1 条/u,
  );
});

test("two rejected semantic plans fail closed with six chapters and no fallback", async () => {
  let calls = 0;
  const agent = createAgent(async (request) => {
    calls += 1;
    return {
      ok: true,
      parsed: parsedPlan(request, {
        recommended_actions: {
          text: "销售人员应按5000万元预算准备交付方案。",
        },
      }),
      raw_ref: `model:${calls}`,
    };
  });

  const result = await agent.run(agentInput());

  assert.equal(result.ok, false);
  assert.equal(result.stage, "planning");
  assert.equal(calls, 2);
  assert.equal(result.submission, undefined);
  assert.ok(result.validation_errors.some((error) => error.includes("5000")));
});
