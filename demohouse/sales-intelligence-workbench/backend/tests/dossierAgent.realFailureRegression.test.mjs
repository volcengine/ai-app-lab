import assert from "node:assert/strict";
import test from "node:test";

import { DossierAgent } from "../src/agents/dossierAgent.js";
import {
  evidenceSpanErrors,
  groundedTextErrors,
} from "../src/evidence/claimGrounding.js";

const SECTION_KEYS = [
  "company_overview",
  "business_dynamics",
  "recent_public_updates",
  "risk_attention",
  "sales_opportunity",
  "recommended_actions",
];

const PROCUREMENT_SUMMARY = [
  "虚构软件产品采购结果信息公开。",
  "入选供应商：云穹矩阵科技有限公司。",
  "采购价格（元）：630,088。",
  "采购部 2026年7月15日。",
].join(" ");

function fixture() {
  const citations = SECTION_KEYS.map((key, index) => ({
    id: `citation_${key}`,
    source_kind: key === "recent_public_updates" ? "联网搜索" : "专业数据集",
    summary: index === 0
      ? PROCUREMENT_SUMMARY
      : `云穹矩阵科技有限公司为${key}提供可引用的完整业务事实。`,
    quality_tier: 1,
    independence_key: `source:${key}`,
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
  return {
    company: {
      name: "云穹矩阵科技有限公司",
      legal_name: "云穹矩阵科技有限公司",
      industry: "企业软件",
      location: "北京",
    },
    citations,
    evidenceAtoms,
    evidenceCoverage: Object.fromEntries(evidenceAtoms.map((atom, index) => [
      SECTION_KEYS[index],
      { status: "supported", atom_ids: [atom.id], reasons: [] },
    ])),
    evidencePolicy: { fail_closed: true },
    evidenceConflicts: [],
    sourceSelectionPolicy: {},
    instructions: ["只使用输入 Evidence Atom。"],
  };
}

function validResponse(request) {
  return {
    sections: Object.fromEntries(
      request.parameters.properties.sections.required.map((key) => [
        key,
        {
          text: key === "company_overview"
            ? "云穹矩阵科技有限公司入选虚构软件产品采购项目。"
            : `云穹矩阵科技有限公司为${key}提供可引用的完整业务事实。`,
          evidence_ids: [request.payload.evidence_by_section[key].allowed_evidence[0].id],
        },
      ]),
    ),
  };
}

function createAgent(factory) {
  return new DossierAgent({
    maxCalls: 2,
    callModel: factory,
    validate: (answer) => ({ body: answer.body, errors: [] }),
  });
}

test("regression 1a: paraphrased or fabricated quote remains invalid", () => {
  assert.ok(evidenceSpanErrors({
    citation_id: "source_1",
    quote: "采购价格630,088元",
  }, {
    id: "source_1",
    summary: PROCUREMENT_SUMMARY,
  }).some((error) => error.includes("连续原文")));
  assert.deepEqual(evidenceSpanErrors({
    citation_id: "source_1",
    quote: "采购价格（元）：630,088。",
  }, {
    id: "source_1",
    summary: PROCUREMENT_SUMMARY,
  }), []);
});

test("regression 1b: model-supplied quote fields cannot change the server-derived quote", async () => {
  const input = fixture();
  const agent = createAgent(async (request) => {
    const parsed = validResponse(request);
    parsed.sections.company_overview.quote = "采购价格630,088元";
    parsed.sections.company_overview.citation_id = "fabricated";
    return { ok: true, parsed, raw_ref: "model:ignored-extra-fields" };
  });

  const result = await agent.run(input);
  const atom = input.evidenceAtoms[0];

  assert.equal(result.ok, true);
  assert.deepEqual(result.approved_plan.sections.company_overview.evidence_spans, [{
    evidence_id: atom.id,
    citation_id: atom.citation_id,
    quote: atom.quote,
  }]);
  assert.doesNotMatch(
    JSON.stringify(result.approved_plan.sections.company_overview),
    /采购价格630,088元|fabricated/,
  );
});

test("regression 2a: unsupported organization names remain rejected", () => {
  const errors = groundedTextErrors({
    text: "远川样例银行与云穹矩阵科技有限公司存在未披露的关联安排。",
    evidenceTexts: [PROCUREMENT_SUMMARY],
    path: "风险与关注事项第 1 条",
    requireEventFamily: true,
  });
  assert.ok(errors.some((error) => error.includes("机构名称")));
});

test("regression 2b: the Agent fails closed on an unsupported organization", async () => {
  let calls = 0;
  const agent = createAgent(async (request) => {
    calls += 1;
    const parsed = validResponse(request);
    parsed.sections.risk_attention.text = "远川样例银行与云穹矩阵科技有限公司存在未披露的关联风险。";
    return { ok: true, parsed, raw_ref: `model:${calls}` };
  });

  const result = await agent.run(fixture());

  assert.equal(result.ok, false);
  assert.equal(result.stage, "planning");
  assert.equal(calls, 2);
  assert.ok(result.validation_errors.some((error) => error.includes("机构名称")));
});

test("regression 3a: unsupported numbers in action text remain rejected", () => {
  const errors = groundedTextErrors({
    text: "建议针对5000万元预算联系产品负责人。",
    evidenceTexts: [PROCUREMENT_SUMMARY],
    path: "建议行动第 1 条",
  });
  assert.ok(errors.some((error) => error.includes("5000")));
});

test("regression 3b: the Agent fails closed when an action fabricates numbers", async () => {
  let calls = 0;
  const agent = createAgent(async (request) => {
    calls += 1;
    const parsed = validResponse(request);
    parsed.sections.recommended_actions.text = "销售人员应按5000万元预算准备交付方案。";
    return { ok: true, parsed, raw_ref: `model:${calls}` };
  });

  const result = await agent.run(fixture());

  assert.equal(result.ok, false);
  assert.equal(result.stage, "planning");
  assert.equal(calls, 2);
  assert.ok(result.validation_errors.some((error) => error.includes("5000")));
  assert.equal(result.submission, undefined);
});

test("regression 3c: a second localized repair removes an unsupported number without weakening validation", async () => {
  const calls = [];
  const agent = new DossierAgent({
    maxCalls: 3,
    callModel: async (request) => {
      calls.push(structuredClone(request));
      const parsed = validResponse(request);
      if (calls.length < 3) {
        parsed.sections.company_overview.text = "云穹矩阵科技有限公司入选1309项虚构软件产品采购项目。";
      }
      return { ok: true, parsed, raw_ref: `model:${calls.length}` };
    },
    validate: (answer) => ({ body: answer.body, errors: [] }),
  });

  const result = await agent.run(fixture());

  assert.equal(result.ok, true);
  assert.equal(calls.length, 3);
  assert.equal(calls[1].operation, "sales_dossier_agent_replan");
  assert.equal(calls[2].operation, "sales_dossier_agent_replan");
  assert.deepEqual(calls[1].payload.repair_section_keys, ["company_overview"]);
  assert.deepEqual(calls[2].payload.repair_section_keys, ["company_overview"]);
  assert.deepEqual(calls[1].payload.repair_directives[0].unsupported_numbers, ["1309"]);
  assert.deepEqual(calls[2].payload.repair_directives[0].unsupported_numbers, ["1309"]);
  assert.deepEqual(calls[1].payload.forbidden_grounding_values, ["1309"]);
  assert.deepEqual(calls[2].payload.forbidden_grounding_values, ["1309"]);
  assert.deepEqual(calls[1].payload.previous_plan.sections.company_overview, {
    text: "",
    evidence_ids: [],
  });
  assert.deepEqual(calls[2].payload.previous_plan.sections.company_overview, {
    text: "",
    evidence_ids: [],
  });
  assert.doesNotMatch(result.submission.body[0].text, /1309/u);
});

test("regression 3d: the server deterministically selects the supporting same-section Atom", async () => {
  const input = fixture();
  const supportingCitation = {
    id: "citation_company_overview_supporting",
    source_kind: "专业数据集",
    summary: "云穹矩阵科技有限公司产品包括矩阵知识库，并与客户开展合作。",
    quality_tier: 1,
    independence_key: "source:company-overview-supporting",
  };
  const supportingAtom = {
    id: "E_00000000000000000099",
    citation_id: supportingCitation.id,
    quote: supportingCitation.summary,
    section_candidates: ["company_overview"],
    entity_match: "verified",
    score: 70,
    source_kind: "professional",
    source_type: "datapro",
    title: "company overview supporting evidence",
    reliability: "professional",
    conflict_fields: [],
  };
  input.citations.push(supportingCitation);
  input.evidenceAtoms.push(supportingAtom);
  input.evidenceCoverage.company_overview.atom_ids.push(supportingAtom.id);
  const calls = [];
  const agent = new DossierAgent({
    maxCalls: 1,
    callModel: async (request) => {
      calls.push(structuredClone(request));
      const parsed = validResponse(request);
      parsed.sections.company_overview = {
        text: supportingCitation.summary,
        evidence_ids: [input.evidenceAtoms[0].id],
      };
      return { ok: true, parsed, raw_ref: "model:wrong-evidence-id" };
    },
    validate: (answer) => ({ body: answer.body, errors: [] }),
  });

  const result = await agent.run(input);

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(
    result.approved_plan.sections.company_overview.evidence_ids,
    [supportingAtom.id],
  );
  assert.deepEqual(
    result.approved_plan.sections.company_overview.citation_ids,
    [supportingCitation.id],
  );
});

test("regression 3e: analytical risk checklists do not treat generic cooperation wording as an asserted event", async () => {
  const calls = [];
  const agent = new DossierAgent({
    maxCalls: 1,
    callModel: async (request) => {
      calls.push(structuredClone(request));
      const parsed = validResponse(request);
      parsed.sections.risk_attention.text = "销售合作前应核验项目边界和责任范围。";
      return { ok: true, parsed, raw_ref: "model:analytical-event" };
    },
    validate: (answer) => ({ body: answer.body, errors: [] }),
  });

  const result = await agent.run(fixture());

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.match(result.submission.body[3].text, /销售合作前应核验项目边界和责任范围/u);
});

test("generic supplier roles in a risk checklist do not masquerade as unsupported procurement events", async () => {
  const agent = createAgent(async (request) => {
    const parsed = validResponse(request);
    parsed.sections.risk_attention.text = "销售对接前应核验供应商准入要求、数据合规边界和交付责任。";
    return { ok: true, parsed, raw_ref: "model:generic-supplier-role" };
  });

  const result = await agent.run(fixture());

  assert.equal(result.ok, true);
  assert.match(result.submission.body[3].text, /供应商准入要求/u);
});

test("factual risk statements still reject an unsupported completed event", async () => {
  const agent = createAgent(async (request) => {
    const parsed = validResponse(request);
    parsed.sections.risk_attention.text = "云穹矩阵科技有限公司已完成该项目交付。";
    return { ok: true, parsed, raw_ref: "model:unsupported-risk-event" };
  });

  const result = await agent.run(fixture());

  assert.equal(result.ok, false);
  assert.ok(result.validation_errors.some((error) => error.includes("事件表述“交付”")));
});

test("detailed complete sections are not rejected by the former 260-character limit", async () => {
  const detailedAction = "销售人员应联系产品负责人，依次确认知识库覆盖范围、数据权限边界、部署方式、接口责任、试点排期、验收标准、运维安排、采购主体、预算审批路径、合同责任、业务牵头部门、技术评审角色、信息安全要求、扩容触发条件、服务响应边界、故障升级路径、需求变更方式、交付依赖条件和最终决策链，再准备与已确认范围一致的试点方案。书面确认记录还应覆盖沟通节奏、双方负责人、需求变更规则、交付依赖条件、上线回退方案、故障升级路径和最终验收责任。最终复盘清单需要明确记录已经核验的事实、仍待确认的问题、下一次沟通的负责人、对应截止时间、预期交付物和书面确认方式。";
  assert.ok(detailedAction.length > 260);
  const agent = createAgent(async (request) => {
    const parsed = validResponse(request);
    parsed.sections.recommended_actions.text = detailedAction;
    return { ok: true, parsed, raw_ref: "model:detailed-action" };
  });

  const result = await agent.run(fixture());

  assert.equal(result.ok, true);
  assert.match(result.submission.body[5].text, /最终验收责任/u);
});

test("regression combined: invalid IDs, unsupported organizations and numbers all remain visible", async () => {
  let calls = 0;
  const agent = createAgent(async (request) => {
    calls += 1;
    const parsed = validResponse(request);
    parsed.sections.company_overview.evidence_ids = ["E_invalid"];
    parsed.sections.risk_attention.text = "远川样例银行与云穹矩阵科技有限公司存在关联风险。";
    parsed.sections.recommended_actions.text = "销售人员应按5000万元预算准备方案。";
    return { ok: true, parsed, raw_ref: `model:${calls}` };
  });

  const result = await agent.run(fixture());
  const errors = result.validation_errors.join("\n");

  assert.equal(result.ok, false);
  assert.equal(calls, 2);
  assert.match(errors, /无效 Evidence ID/);
  assert.match(errors, /机构名称/);
  assert.match(errors, /5000/);
});
