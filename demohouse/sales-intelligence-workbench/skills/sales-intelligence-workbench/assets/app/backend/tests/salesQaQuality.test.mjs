import assert from "node:assert/strict";
import test from "node:test";

import {
  assessQaAnswerability,
  buildQaEvidence,
  fuseQaRetrievalContexts,
} from "../src/evidence/salesEvidence.js";

const dossier = {
  id: "dossier_quality_v2",
  title: "远航能源销售情报报告",
  version_no: 2,
  body: [
    { text: "企业与业务概览：远航能源主营储能系统集成与电池管理平台。" },
    { text: "经营与业务动态：公司正在推进华东区域工商业储能项目。" },
    { text: "近期公开动态：近期公开信息显示公司启动了新一轮供应商遴选。" },
    { text: "风险与关注事项：项目尚未完成预算审批，交付周期是当前主要风险。" },
    { text: "销售机会判断：储能监控、运维和数据平台存在进一步合作机会。" },
    { text: "建议行动：先确认预算审批节点，再向信息化部门提交小范围验证方案。" },
  ],
};

const contexts = [
  {
    material_id: "doc_budget",
    title: "云文档：储能平台立项说明",
    source_kind: "云文档",
    score: 0.82,
    content: [
      "项目背景：客户计划统一管理华东区域的储能站点。",
      "技术范围：一期先接入十二个站点，验证监控告警和设备健康分析。",
      "预算与排期：首期预算为320万元，计划在第四季度完成采购，采购前需完成安全评审。",
      "验收要求：告警到达率不低于99.9%，并支持私有化部署。",
    ].join("\n\n"),
  },
  {
    material_id: "chat_people",
    title: "飞书会话：7月客户沟通",
    source_kind: "飞书会话",
    score: 0.76,
    content: [
      "销售：本轮验证由谁牵头？",
      "客户：信息化部的周敏负责方案评审，采购部的林涛负责商务流程。",
      "客户：目前主要顾虑是历史设备协议不统一，希望先做三个站点的兼容性验证。",
    ].join("\n"),
  },
  {
    material_id: "doc_unrelated",
    title: "云文档：员工活动安排",
    source_kind: "云文档",
    score: 0.2,
    content: "员工活动计划在园区举办，内容与销售项目无关。",
  },
];

const cases = [
  {
    question: "客户的预算是多少，计划什么时候采购？",
    expectedMaterialId: "doc_budget",
  },
  {
    question: "谁负责方案评审和商务流程？",
    expectedMaterialId: "chat_people",
  },
  {
    question: "客户当前最主要的顾虑是什么？",
    expectedMaterialId: "chat_people",
  },
  {
    question: "这个项目有哪些风险，下一步应该怎么推进？",
    expectedText: "预算审批",
  },
  {
    question: "一期计划接入多少个站点？",
    expectedMaterialId: "doc_budget",
  },
  {
    question: "验收时对告警到达率有什么要求？",
    expectedMaterialId: "doc_budget",
  },
  {
    question: "客户是否要求私有化部署？",
    expectedMaterialId: "doc_budget",
  },
  {
    question: "采购部由谁负责商务流程？",
    expectedMaterialId: "chat_people",
  },
];

test("QA retrieval quality gate keeps every golden fact inside top five evidence chunks", () => {
  let hits = 0;
  for (const item of cases) {
    const evidence = buildQaEvidence({
      dossier,
      contexts,
      question: item.question,
      maxItems: 8,
    });
    const topFive = evidence.slice(0, 5);
    const matched = item.expectedMaterialId
      ? topFive.some((candidate) => candidate.material_id === item.expectedMaterialId)
      : topFive.some((candidate) => candidate.summary.includes(item.expectedText));
    if (matched) hits += 1;
    assert.equal(matched, true, `未命中问题：${item.question}`);
    assert.equal(assessQaAnswerability(item.question, evidence).supported, true);
  }
  assert.equal(hits / cases.length, 1);
});

test("QA retrieval quality gate rejects an unrelated question instead of forcing an answer", () => {
  const question = "明天上海会不会下雨？";
  const evidence = buildQaEvidence({ dossier, contexts, question, maxItems: 8 });
  const assessment = assessQaAnswerability(question, evidence);
  assert.equal(assessment.supported, false);
  assert.equal(assessment.reason, "low_relevance");
});

test("QA evidence remains bounded and preserves source diversity", () => {
  const evidence = buildQaEvidence({
    dossier,
    contexts,
    question: "总结项目需求、负责人、风险和下一步行动",
    maxItems: 8,
  });
  assert.ok(evidence.length <= 8);
  assert.ok(evidence.some((item) => item.source_kind === "企业档案"));
  assert.ok(evidence.some((item) => item.source_kind !== "企业档案"));
  assert.ok(evidence.every((item) => item.summary.length <= 1600));
});

test("QA retrieval fusion promotes evidence recalled by multiple query variants", () => {
  const fused = fuseQaRetrievalContexts([
    {
      query: "远航能源 客户预算",
      contexts: [
        {
          material_id: "doc_general",
          uri: "viking://sales/workspace/company/materials/general.md",
          abstract: "一般项目背景。",
          score: 0.9,
        },
        {
          material_id: "doc_budget",
          uri: "viking://sales/workspace/company/materials/budget.md",
          abstract: "首期预算为 320 万元。",
          score: 0.8,
        },
      ],
    },
    {
      query: "远航能源 采购时间 预算窗口",
      contexts: [
        {
          material_id: "doc_budget",
          uri: "viking://sales/workspace/company/materials/budget.md",
          abstract: "第四季度完成采购。",
          score: 0.84,
        },
        {
          material_id: "doc_schedule",
          uri: "viking://sales/workspace/company/materials/schedule.md",
          abstract: "项目排期说明。",
          score: 0.79,
        },
      ],
    },
  ], {
    maxContexts: 3,
    maxPerMaterial: 2,
  });

  assert.equal(fused[0].material_id, "doc_budget");
  assert.equal(fused[0].query_hits, 2);
  assert.deepEqual(fused[0].matched_queries, [
    "远航能源 客户预算",
    "远航能源 采购时间 预算窗口",
  ]);
  assert.ok(fused[0].fusion_score > fused[1].fusion_score);
});

test("QA retrieval fusion preserves distinct sections but limits one material from crowding out others", () => {
  const fused = fuseQaRetrievalContexts([
    {
      query: "客户需求 风险 下一步",
      contexts: [
        {
          material_id: "doc_project",
          uri: "viking://sales/workspace/company/materials/project/requirements.md",
          abstract: "客户需要私有化部署。",
          score: 0.91,
        },
        {
          material_id: "doc_project",
          uri: "viking://sales/workspace/company/materials/project/risks.md",
          abstract: "预算审批尚未完成。",
          score: 0.89,
        },
        {
          material_id: "doc_project",
          uri: "viking://sales/workspace/company/materials/project/background.md",
          abstract: "一般项目背景。",
          score: 0.88,
        },
        {
          material_id: "chat_people",
          uri: "viking://sales/workspace/company/materials/chat.md",
          abstract: "周敏负责方案评审。",
          score: 0.82,
        },
      ],
    },
  ], {
    maxContexts: 4,
    maxPerMaterial: 2,
  });

  assert.equal(fused.filter((item) => item.material_id === "doc_project").length, 2);
  assert.ok(fused.some((item) => item.material_id === "chat_people"));
});

test("QA evidence does not force an unrelated dossier section into a focused internal-material answer", () => {
  const evidence = buildQaEvidence({
    dossier,
    contexts,
    question: "谁负责方案评审和商务流程？",
    maxItems: 2,
  });

  assert.equal(evidence.length, 2);
  assert.equal(evidence[0].material_id, "chat_people");
  assert.ok(evidence.every((item) => item.source_kind !== "企业档案"));
});

test("QA chunk overlap keeps a fact intact when it crosses a long-text boundary", () => {
  const boundaryContent = `${"背景".repeat(549)}第四季度确认预算，首批试点覆盖两个部门。`;
  const evidence = buildQaEvidence({
    contexts: [{
      material_id: "doc_boundary",
      title: "客户项目计划",
      source_kind: "云文档",
      content: boundaryContent,
      score: 0.8,
    }],
    question: "客户什么时候确认预算？",
    maxItems: 4,
  });

  assert.ok(evidence.some((item) => item.summary.includes("第四季度确认预算")));
});

test("QA evidence expands a matched chunk with adjacent document context", () => {
  const evidence = buildQaEvidence({
    contexts: [{
      material_id: "doc_context_window",
      title: "客户采购安排",
      source_kind: "云文档",
      content: [
        "项目范围：首批验证覆盖两个业务部门。",
        "预算窗口：客户计划在第四季度确认 320 万元预算。",
        "付款安排：合同签署后支付首款，验收通过后支付尾款。",
      ].join("\n\n"),
      score: 0.86,
    }],
    question: "客户什么时候确认预算，付款怎么安排？",
    maxItems: 3,
  });

  assert.match(evidence[0].summary, /第四季度确认 320 万元预算/);
  assert.match(evidence[0].summary, /验收通过后支付尾款/);
});
