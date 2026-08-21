import test from "node:test";
import assert from "node:assert/strict";
import {
  assessQaAnswerability,
  buildDossierEvidencePack,
  buildQaEnumerationRequirements,
  buildQaEvidence,
  evidencePackCitations,
  makeDossierFingerprint,
  validateDossierModelAnswer,
  validateProductionEvidencePack,
  validateQaModelAnswer,
} from "../src/evidence/salesEvidence.js";

const company = { id: "company_xinlan", name: "星蓝新能源科技有限公司" };

test("evidence packs keep stable ids and reject unrelated public results", () => {
  const pack = buildDossierEvidencePack({
    company,
    generatedAt: "2026-07-21T10:00:00.000Z",
    collected: {
      professional: [{
        label: "企业工商数据库",
        query: "星蓝新能源科技有限公司 企业工商信息",
        summary: "公司名称：星蓝新能源科技有限公司；经营范围：新能源汽车相关业务。",
      }],
      public_sources: [
        {
          label: "星蓝发布最新公告",
          summary: "星蓝新能源科技有限公司发布最新公告。",
          url: "https://example.org/xinlan?a=1&utm_source=test",
          site_name: "星蓝官网",
          published_at: "2026-07-20T08:00:00Z",
        },
        {
          label: "无关企业新闻",
          summary: "另一家公司发布公告。",
          url: "https://example.org/unrelated",
        },
      ],
    },
  });

  assert.equal(pack.items.length, 2);
  assert.equal(pack.rejected.length, 1);
  assert.equal(pack.rejected[0].reason, "entity_not_verified");
  assert.equal(pack.data_as_of, "2026-07-20T08:00:00.000Z");
  assert.match(pack.items[1].url, /^https:\/\/example\.org\/xinlan\?a=1$/);
  assert.equal(pack.items[0].source_quality_label, "专业权威来源");
  assert.equal(pack.items[1].freshness_label, "近期资料");
  assert.equal(pack.items[1].site_name, "星蓝官网");
  assert.equal(evidencePackCitations(pack)[1].site_name, "星蓝官网");
  assert.equal(pack.policy.current_public_count, 1);
  assert.equal(validateProductionEvidencePack(pack).ok, true);
});

test("evidence packs retain brand-alias public news without treating it as the legal entity", () => {
  const pack = buildDossierEvidencePack({
    company: {
      id: "company_byd_industry",
      name: "比亚迪汽车工业有限公司",
      aliases: ["比亚迪"],
    },
    generatedAt: "2026-07-24T10:00:00.000Z",
    collected: {
      professional: [{
        label: "企业工商数据库",
        query: "比亚迪汽车工业有限公司 企业工商信息",
        summary: "公司名称：比亚迪汽车工业有限公司；经营范围：汽车制造。",
      }],
      public_sources: [
        {
          label: "比亚迪发布供应链合作动态",
          summary: "比亚迪与合作伙伴发布供应链合作计划。",
          url: "https://news.example.org/byd-cooperation",
          published_at: "2026-07-20T08:00:00Z",
          query: "比亚迪 2026 最新项目 合作",
        },
        {
          label: "其他汽车品牌新闻",
          summary: "其他汽车品牌发布新车型。",
          url: "https://news.example.org/other",
          published_at: "2026-07-20T08:00:00Z",
        },
      ],
    },
  });

  const aliasEvidence = pack.items.find((item) => item.label.includes("供应链合作"));
  assert.equal(aliasEvidence.entity_match, "alias_scoped");
  assert.ok(pack.rejected.some((item) => item.label === "其他汽车品牌新闻"));
});

test("evidence packs derive a scoped brand alias from China investment-company names", () => {
  const pack = buildDossierEvidencePack({
    company: {
      id: "company_bosch_china",
      name: "博世（中国）投资有限公司",
    },
    generatedAt: "2026-07-29T10:00:00.000Z",
    collected: {
      professional: [{
        label: "企业工商数据库",
        query: "博世（中国）投资有限公司 企业工商信息",
        summary: "公司名称：博世（中国）投资有限公司；经营范围：机械制造、电子和信息产业投资。",
      }],
      public_sources: [{
        label: "博世发布在华合作项目动态",
        summary: "博世与合作伙伴发布在华技术合作项目计划。",
        url: "https://news.example.org/bosch-cooperation",
        published_at: "2026-07-28T08:00:00Z",
        query: "博世 2026 合作 项目",
      }],
    },
  });

  const aliasEvidence = pack.items.find((item) => item.source_kind === "public");
  assert.equal(aliasEvidence.entity_match, "alias_scoped");
});

test("evidence packs reject verification-gate pages instead of treating them as report sources", () => {
  const pack = buildDossierEvidencePack({
    company,
    generatedAt: "2026-07-29T10:00:00.000Z",
    collected: {
      professional: [{
        label: "企业工商数据库",
        query: "星蓝新能源科技有限公司 企业工商信息",
        summary: "公司名称：星蓝新能源科技有限公司；经营范围：新能源汽车相关业务。",
      }],
      public_sources: [{
        label: "星蓝新能源科技有限公司法律风险",
        summary: "For better experience, please complete the verification process. TIME: 2026-07-29 09:00:00",
        url: "https://example.org/verification-gate",
        published_at: "2026-07-28T08:00:00Z",
      }],
    },
  });

  assert.equal(pack.items.length, 1);
  assert.equal(pack.rejected.length, 1);
  assert.equal(pack.rejected[0].reason, "content_not_substantive");
  assert.equal(pack.policy.traceable_public_count, 0);
});

test("evidence hash ignores collection time but changes with source content", () => {
  const input = {
    company,
    collected: {
      professional: [{
        label: "企业工商数据库",
        query: "星蓝新能源科技有限公司 企业工商信息",
        summary: "公司名称：星蓝新能源科技有限公司。",
      }],
    },
  };
  const first = buildDossierEvidencePack({ ...input, generatedAt: "2026-07-21T10:00:00Z" });
  const second = buildDossierEvidencePack({ ...input, generatedAt: "2026-07-21T11:00:00Z" });
  const changed = buildDossierEvidencePack({
    ...input,
    generatedAt: "2026-07-21T11:00:00Z",
    collected: {
      professional: [{
        ...input.collected.professional[0],
        summary: "公司名称：星蓝新能源科技有限公司；经营范围已更新。",
      }],
    },
  });

  assert.equal(first.evidence_hash, second.evidence_hash);
  assert.notEqual(first.evidence_hash, changed.evidence_hash);
  assert.equal(evidencePackCitations(first)[0].entity_match, "verified");
});

test("dossier fingerprints are deterministic and include citation-backed content", () => {
  const dossier = {
    title: "星蓝最近档案",
    summary: "近期信息已更新。",
    body: [{ text: "近期动态：已发布公告。", citation_ids: ["evidence_1"] }],
    citations: [{ id: "evidence_1", summary: "公告摘要" }],
  };
  assert.equal(makeDossierFingerprint(dossier), makeDossierFingerprint(structuredClone(dossier)));
  assert.notEqual(
    makeDossierFingerprint(dossier),
    makeDossierFingerprint({ ...dossier, summary: "近期信息发生变化。" }),
  );
});

test("QA validation derives citations from allowed evidence and rejects fabricated ids", () => {
  const evidence = buildQaEvidence({
    dossier: {
      id: "dossier_1",
      title: "星蓝新能源科技有限公司销售情报报告",
      version_no: 2,
      summary: "企业近期发布了产品更新公告。",
      body: [{ text: "近期公开动态：企业近期发布了产品更新公告。" }],
    },
    contexts: [{ uri: "viking://resources/workspace/company/materials/a.md", title: "会议纪要", abstract: "客户关注预算窗口。" }],
  });
  const dossierEvidence = evidence.find((item) => item.source_kind === "企业档案");
  const result = validateQaModelAnswer({
    paragraphs: [
      { text: "企业近期发布了产品更新公告。", citation_ids: [dossierEvidence.id] },
      { text: "客户关注预算窗口。", citation_ids: ["fabricated"] },
    ],
    insufficient: false,
  }, evidence);

  assert.equal(result.citations.length, 1);
  assert.equal(result.citations[0].source_kind, "企业档案");
  assert.deepEqual(evidence.map((item) => item.source_kind).sort(), ["企业档案", "内部资料"]);
  assert.ok(result.errors.some((item) => item.includes("无效引用")));
  assert.ok(result.errors.some((item) => item.includes("缺少有效引用")));
});

test("QA removes an unrequested gap paragraph and rejects a risk paragraph citing the wrong dossier section", () => {
  const evidence = [{
    id: "recent_section",
    label: "测试企业 销售情报报告 V2 · 近期公开动态",
    source_kind: "企业档案",
    source_quality: "verified_dossier",
    summary: "近期公开动态：2026年7月30日，测试企业发布产品升级公告。",
  }];
  const result = validateQaModelAnswer({
    paragraphs: [{
      text: "风险：该企业的交付周期需要核验。",
      citation_ids: ["recent_section"],
    }, {
      text: "缺口：还需要补充更多资料。",
      citation_ids: ["recent_section"],
    }],
    insufficient: false,
  }, evidence, { question: "说明该企业的主要风险。" });

  assert.equal(result.paragraphs.length, 1);
  assert.ok(result.errors.some((item) => item.includes("风险与关注事项")));

  const requested = validateQaModelAnswer({
    paragraphs: [{
      text: "缺口：还需要补充交付记录。",
      citation_ids: ["recent_section"],
    }],
    insufficient: false,
  }, evidence, { question: "还有哪些资料缺口？" });
  assert.equal(requested.paragraphs.length, 1);
});

test("QA evidence reads and ranks the relevant chunk instead of sending one long material blob", () => {
  const evidence = buildQaEvidence({
    question: "客户的预算窗口和试点范围是什么？",
    dossier: {
      id: "dossier_qa_1",
      title: "测试企业销售情报报告",
      version_no: 2,
      body: [
        { text: "企业与业务概览：该企业提供知识库产品。" },
        { text: "建议行动：确认试点范围和预算窗口。" },
      ],
    },
    contexts: [{
      material_id: "material_long",
      title: "客户需求确认会",
      source_kind: "会议纪要",
      uri: "viking://resources/material_long.md",
      score: 0.72,
      content: `${"一般背景信息。".repeat(220)}\n\n预算窗口：客户计划在第四季度确认预算；试点范围为两个业务部门。`,
    }],
    maxItems: 6,
  });

  assert.ok(evidence.length >= 3);
  assert.ok(evidence.some((item) => item.summary.includes("第四季度确认预算")));
  assert.ok(evidence[0].summary.includes("预算") || evidence[0].summary.includes("试点范围"));
  assert.ok(evidence.every((item) => item.summary.length <= 1800));
  assert.equal(assessQaAnswerability("客户的预算窗口是什么？", evidence).supported, true);
});

test("QA evidence carries a Markdown heading into the following table block", () => {
  const content = [
    "# Agent Plan CookBook",
    "## 项目介绍",
    "这是一份个人投资助手搭建教程。",
    "### 核心使用能力",
    "| 能力点 | 说明 |",
    "|-|-|",
    "| 语言模型 | 完成需求理解和网站交付 |",
    "| 联网搜索 | 补充公开新闻和行业动态 |",
    "| 专业数据集 | 查询股票金融和企业工商数据 |",
    "## 前置准备",
    "购买套餐并完成环境配置。",
    "## 网站开发流程",
    "生成方案、开发页面并完成调试。",
  ].join("\n\n");

  const evidence = buildQaEvidence({
    question: "文档的核心使用能力有哪些？",
    contexts: [{
      material_id: "material_doc",
      title: "个人投资助手 CookBook",
      source_kind: "云文档",
      content,
    }],
    maxItems: 2,
  });

  assert.match(evidence[0].summary, /核心使用能力/);
  assert.match(evidence[0].summary, /语言模型/);
  assert.match(evidence[0].summary, /联网搜索/);
  assert.doesNotMatch(evidence[0].summary, /^### 核心使用能力$/);
});

test("QA evidence ranks the complete capability table above title-only noise", () => {
  const content = [
    "<title>Agent Plan CookBook -「个人投资助手」</title>",
    "更多 CookBook 可见：<cite title=\"方舟 Agent Plan CookBook\"></cite>",
    "---",
    "# 一、项目介绍",
    "「**核心使用能力**」",
    "| **能力点** | 说明 |",
    "|-|-|",
    "| **语言模型** | 支持模型切换与网站交付 |",
    "| **Claude code/ Agent 能力** | 承接需求理解、任务编排与开发 |",
    "| **联网搜索** | 补充公开新闻和行业动态 |",
    "| **Data MCP：股票金融数据/国内企业工商数据** | 查询专业结构化数据 |",
    "| **多工具兼容** | 可在多个主流 Agent 平台中使用 |",
    "| **消耗统一计量** | 在控制台查看统一计量结果 |",
    "---",
    "# 二、前置准备",
    "购买套餐并完成环境配置。",
  ].join("\n\n");

  const evidence = buildQaEvidence({
    question: "这份个人投资助手文档明确使用了哪些核心能力？",
    contexts: [{
      material_id: "material_full_table",
      title: "飞书云文档：Agent Plan CookBook -「个人投资助手」",
      source_kind: "云文档",
      score: 0.7,
      content,
    }],
    maxItems: 3,
  });

  assert.match(evidence[0].summary, /核心使用能力/);
  assert.match(evidence[0].summary, /语言模型/);
  assert.match(evidence[0].summary, /Claude code\/ Agent 能力/);
  assert.match(evidence[0].summary, /联网搜索/);
  assert.match(evidence[0].summary, /Data MCP/);
  assert.match(evidence[0].summary, /多工具兼容/);
  assert.match(evidence[0].summary, /消耗统一计量/);
  assert.ok(evidence.every((item) => item.summary !== "---"));

  const competingEvidence = [{
    id: "evidence_demand_types",
    label: "个人投资助手 CookBook",
    source_kind: "云文档",
    retrieval_score: 0.99,
    summary: "### Step2 识别核心需求 | 需求类型 | 核心诉求 | |-|-| | 主动查看 | 想快速了解某只股票最近有没有值得关注的变化 | | 持续跟踪 | 不想每天手动查公告、新闻和风险事件 |",
  }];
  const requirements = buildQaEnumerationRequirements(
    "这份个人投资助手文档明确使用了哪些核心能力？",
    [...competingEvidence, ...evidence],
  );
  assert.deepEqual(
    requirements.map((item) => item.label),
    [
      "语言模型",
      "Claude code/ Agent 能力",
      "联网搜索",
      "Data MCP:股票金融数据/国内企业工商数据",
      "多工具兼容",
      "消耗统一计量",
    ],
  );
  const incomplete = validateQaModelAnswer({
    paragraphs: [{
      text: "文档使用语言模型、Claude Code、联网搜索和 Data MCP。",
      citation_ids: [evidence[0].id],
    }],
    insufficient: false,
  }, evidence, { enumerationRequirements: requirements });
  assert.deepEqual(
    incomplete.missing_enumeration_items.map((item) => item.label),
    ["多工具兼容", "消耗统一计量"],
  );
  assert.ok(incomplete.errors.some((item) => item.includes("回答遗漏枚举项")));
});

test("QA enumeration completeness ignores unrelated tables for compare-style questions", () => {
  const evidence = [{
    id: "evidence_trace_span",
    label: "全链路数据体系建设研讨会",
    source_kind: "飞书云文档",
    retrieval_score: 0.99,
    summary: [
      "Trace 通过唯一 Trace ID 串联一次完整调用，每个执行节点对应一个 Span。",
      "| 阶段 | 说明 |",
      "|-|-|",
      "| 接入 | 完成数据接入 |",
      "| 路由 | 完成请求路由 |",
      "| 调用 | 完成模型调用 |",
      "| 验收 | 完成效果验收 |",
    ].join(" "),
  }];

  const requirements = buildQaEnumerationRequirements(
    "Trace 和 Span 分别承担什么作用？请用三点说明。",
    evidence,
  );

  assert.deepEqual(requirements, []);
});

test("QA answerability rejects unrelated questions even when enterprise evidence exists", () => {
  const evidence = buildQaEvidence({
    question: "今天当地天气怎么样？",
    dossier: {
      id: "dossier_qa_2",
      title: "测试企业销售情报报告",
      body: [{ text: "企业与业务概览：该企业提供知识库产品。" }],
    },
    contexts: [{
      material_id: "material_qa_2",
      title: "客户需求确认会",
      source_kind: "会议纪要",
      content: "客户希望先验证知识库问答，并确认数据权限边界。",
    }],
  });

  assert.equal(assessQaAnswerability("今天当地天气怎么样？", evidence).supported, false);
});

test("runtime evidence policy records public-source gaps without rejecting a legally anchored dossier", () => {
  const pack = buildDossierEvidencePack({
    company,
    generatedAt: "2026-07-21T10:00:00.000Z",
    collected: {
      professional: [{
        label: "企业工商数据库",
        query: "星蓝新能源科技有限公司 企业工商信息",
        summary: "星蓝新能源科技有限公司主体信息。",
      }],
      public_sources: [{
        label: "星蓝动态摘要",
        summary: "星蓝新能源科技有限公司发布业务动态。",
      }],
    },
  });

  const validation = validateProductionEvidencePack(pack);
  assert.equal(pack.data_as_of, null);
  assert.equal(validation.ok, true);
  assert.equal(validation.policy.traceable_public_count, 0);
  assert.equal(validation.policy.current_public_count, 0);
  assert.equal(validation.policy.legal_entity_anchor_count, 1);
});

test("runtime evidence policy rejects a professional result that does not anchor the legal entity", () => {
  const pack = buildDossierEvidencePack({
    company,
    generatedAt: "2026-07-21T10:00:00.000Z",
    collected: {
      professional: [{
        label: "企业工商数据库",
        query: "星蓝新能源科技有限公司 企业工商信息",
        summary: "该记录仅描述新能源汽车相关业务，没有返回可核对的企业名称或统一社会信用代码。",
      }],
    },
  });

  const validation = validateProductionEvidencePack(pack);
  assert.equal(validation.ok, false);
  assert.equal(validation.policy.legal_entity_anchor_count, 0);
  assert.ok(validation.errors.some((item) => item.includes("目标主体")));
});

test("evidence packs detect competing critical numbers from contemporaneous sources", () => {
  const pack = buildDossierEvidencePack({
    company,
    generatedAt: "2026-07-21T10:00:00.000Z",
    collected: {
      professional: [
        {
          label: "企业工商数据库",
          query: "星蓝新能源科技有限公司 注册资本",
          summary: "星蓝新能源科技有限公司注册资本为1000万元。",
        },
        {
          label: "企业风险数据库",
          query: "星蓝新能源科技有限公司 注册资本",
          summary: "星蓝新能源科技有限公司注册资本为2000万元。",
        },
      ],
    },
  });

  assert.equal(pack.conflicts.length, 1);
  assert.equal(pack.conflicts[0].field, "registered_capital");
  assert.equal(pack.policy.conflict_count, 1);
  assert.ok(pack.items.every((item) => item.conflict_fields.includes("registered_capital")));
});

test("dossier validation requires two sources to agree on a critical number", () => {
  const disagreeing = [
    {
      id: "professional-1",
      label: "企业工商数据库",
      source_kind: "专业数据集",
      quality_tier: 1,
      independence_key: "datapro:business",
      summary: "星蓝新能源科技有限公司注册资本为1000万元。",
    },
    {
      id: "professional-2",
      label: "企业风险数据库",
      source_kind: "专业数据集",
      quality_tier: 1,
      independence_key: "datapro:risk",
      summary: "星蓝新能源科技有限公司注册资本为2000万元。",
    },
    {
      id: "public-1",
      label: "近期公告",
      source_kind: "联网搜索",
      quality_tier: 2,
      independence_key: "example.org",
      summary: "星蓝新能源科技有限公司发布近期公告。",
    },
  ];
  const parsed = {
    body: [
      { text: "企业与业务概览：该企业注册资本为1000万元，并面向企业客户提供相关服务。", citation_ids: ["professional-1", "professional-2"] },
      { text: "经营与业务动态：专业数据可用于核验该企业当前经营主体。", citation_ids: ["professional-1"] },
      { text: "近期公开动态：企业发布了近期公告。", citation_ids: ["public-1"] },
      { text: "风险与关注事项：当前仍需交叉核验关键经营数字。", citation_ids: ["professional-1", "public-1"] },
      { text: "销售机会判断：当前可继续核验业务需求与合作场景。", citation_ids: ["professional-1", "public-1"] },
      { text: "建议行动：确认业务部门、采购计划和数据合规要求。", citation_ids: ["professional-1", "public-1"] },
    ],
  };

  const rejected = validateDossierModelAnswer(parsed, disagreeing);
  assert.ok(rejected.errors.some((item) => item.includes("未获得双来源一致支持")));

  const agreeing = disagreeing.map((item) => item.id === "professional-2"
    ? { ...item, summary: "星蓝新能源科技有限公司注册资本为1000万元。" }
    : item);
  assert.deepEqual(validateDossierModelAnswer(parsed, agreeing).errors, []);
});

test("dossier validation does not require unrelated sources to pad citation counts", () => {
  const evidence = [
    {
      id: "professional-business",
      label: "企业工商数据库",
      source_kind: "专业数据集",
      independence_key: "datapro:business",
      summary: "星蓝新能源科技有限公司从事新能源汽车相关业务。",
    },
    {
      id: "professional-market",
      label: "金融数据库",
      source_kind: "专业数据集",
      independence_key: "datapro:finance",
      summary: "星蓝新能源科技有限公司持续推进新能源业务。",
    },
    {
      id: "public-project",
      label: "星蓝新能源项目合作公告",
      source_kind: "联网搜索",
      independence_key: "official.example.org",
      summary: "星蓝新能源科技有限公司发布新能源项目合作公告。",
    },
    {
      id: "public-delivery",
      label: "星蓝新能源设备交付公告",
      source_kind: "联网搜索",
      independence_key: "news.example.net",
      summary: "星蓝新能源科技有限公司披露设备交付进展。",
    },
  ];
  const titles = [
    "企业与业务概览",
    "经营与业务动态",
    "近期公开动态",
    "风险与关注事项",
    "销售机会判断",
    "建议行动",
  ];
  const sparse = {
    body: titles.map((title) => ({
      text: `${title}：这是由已核验来源支持的完整业务事实说明。`,
      citation_ids: ["professional-business", "public-project"],
    })),
  };
  const sparseValidation = validateDossierModelAnswer(sparse, evidence);
  assert.deepEqual(sparseValidation.errors, []);

  const covered = {
    body: titles.map((title, index) => ({
      text: `${title}：这是由已核验来源支持的完整业务事实说明。`,
      citation_ids: index % 2
        ? ["professional-market", "public-delivery"]
        : ["professional-business", "public-project"],
    })),
  };
  assert.deepEqual(validateDossierModelAnswer(covered, evidence).errors, []);
});
