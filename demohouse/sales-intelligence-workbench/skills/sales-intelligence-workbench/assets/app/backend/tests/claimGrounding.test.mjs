import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveEvidenceDataAsOf,
  evidenceSpanErrors,
  extractGroundingOrganizations,
  groundedTextErrors,
} from "../src/evidence/claimGrounding.js";

const procurementSummary = [
  "大模型提示词攻击防护软件产品采购结果信息公开。",
  "入选供应商：北京火山引擎科技有限公司。",
  "采购价格（元）：630,088。",
  "财务会计部采购部 2026年7月15日。",
].join(" ");

test("claim grounding accepts dates and amounts that appear in the cited evidence", () => {
  assert.deepEqual(groundedTextErrors({
    text: "2026年7月15日，北京火山引擎科技有限公司入选提示词攻击防护软件采购项目，采购价格为630,088元。",
    evidenceTexts: [procurementSummary],
    path: "近期公开动态第 1 段",
    requireEventFamily: true,
  }), []);
  assert.deepEqual(groundedTextErrors({
    text: "测试科技有限公司成立于2020年5月11日。",
    evidenceTexts: ["公司名称:测试科技有限公司;成立日期:2020-05-11T08:00:00。"],
    path: "企业与业务概览第 1 条",
  }), []);
});

test("claim grounding rejects a different dated event and an unsupported named entity", () => {
  const errors = groundedTextErrors({
    text: "2026年7月16日，华夏银行发布AIBOX项目成交候选公示。",
    evidenceTexts: [procurementSummary],
    path: "近期公开动态第 1 段",
    requireEventFamily: true,
  });

  assert.ok(errors.some((item) => item.includes("日期 2026-07-16")));
  assert.ok(errors.some((item) => item.includes("实体 AIBOX")));
  assert.ok(errors.some((item) => item.includes("机构名称“华夏银行”")));
});

test("claim grounding names the unsupported event wording so a revision can repair it", () => {
  const errors = groundedTextErrors({
    text: "北京火山引擎科技有限公司已完成该软件项目交付。",
    evidenceTexts: [procurementSummary],
    path: "近期公开动态第 1 条",
    requireEventFamily: true,
  });

  assert.ok(errors.some((item) => item.includes("事件表述“交付”")));
});

test("claim grounding does not treat words inside the verified legal name as a new event", () => {
  assert.deepEqual(groundedTextErrors({
    text: "博世（中国）投资有限公司在中国开展汽车技术相关业务。",
    evidenceTexts: ["该企业在中国开展汽车技术相关业务。"],
    path: "企业与业务概览第 1 条",
    requireEventFamily: true,
    ignoredEntityNames: ["博世（中国）投资有限公司"],
  }), []);
});

test("organization grounding ignores predicate fragments before a group suffix", () => {
  assert.deepEqual(
    extractGroundingOrganizations("相关业务可能受集团统一政策影响。"),
    [],
  );
  assert.deepEqual(groundedTextErrors({
    text: "相关业务可能受集团统一政策影响。",
    evidenceTexts: ["相关业务受到统一政策影响。"],
    path: "风险与关注事项第 1 条",
  }), []);
  assert.deepEqual(
    extractGroundingOrganizations("博世集团持续推进相关业务。"),
    ["博世集团"],
  );
});

test("evidence spans must be continuous verbatim excerpts from the selected citation", () => {
  assert.deepEqual(evidenceSpanErrors({
    citation_id: "source_1",
    quote: "采购价格（元）：630,088。",
  }, {
    id: "source_1",
    summary: procurementSummary,
  }), []);
  assert.ok(evidenceSpanErrors({
    citation_id: "source_1",
    quote: "华夏银行发布成交候选公示。",
  }, {
    id: "source_1",
    summary: procurementSummary,
  }).some((item) => item.includes("连续原文")));
});

test("data-as-of uses cited public event dates when provider metadata is stale", () => {
  const value = deriveEvidenceDataAsOf([{
    source_kind: "联网搜索",
    published_at: "2026-06-10T16:00:00.000Z",
    summary: procurementSummary,
  }], "2026-07-29T10:00:00.000Z");

  assert.equal(value, "2026-07-15T00:00:00.000Z");
});

test("grounding ignores company identifiers unless the report changes them", () => {
  const evidence = "统一社会信用代码：913100007109203974；注册地址：上海市长宁区福泉北路333号1幢6楼。";
  assert.deepEqual(groundedTextErrors({
    text: "该公司的统一社会信用代码为913100007109203974，注册地址为上海市长宁区福泉北路333号1幢6楼。",
    evidenceTexts: [evidence],
    path: "企业与业务概览第 1 段",
  }), []);
  assert.ok(groundedTextErrors({
    text: "该公司的统一社会信用代码为913100007109203975。",
    evidenceTexts: [evidence],
    path: "企业与业务概览第 1 段",
  }).some((item) => item.includes("数值")));
});
