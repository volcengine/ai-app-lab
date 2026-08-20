import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await fs.readFile(
  path.resolve(backendDir, "..", "frontend", "text-format.js"),
  "utf8",
);
const sandbox = {};
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox);

const {
  collapseRepeatedCitationRuns,
  dedupeCitationEntries,
  normalizeChineseTypography,
  splitReadableBlocks,
} = sandbox.SalesTextFormat;

test("Chinese typography keeps decimals and business numbers intact", () => {
  const sourceText = "公开报道分别给出2769.17亿元与9.17亿元,需进一步交叉核验。";
  const normalized = normalizeChineseTypography(sourceText);
  assert.match(normalized, /2769\.17亿元与9\.17亿元，/);
  assert.doesNotMatch(normalized, /\n/);
});

test("readable blocks never treat years or decimals as inline list markers", () => {
  const paragraphs = Array.from(splitReadableBlocks(
    "2026年7月，公司披露业务进展。风险数据需交叉核验，公开来源给出2769.17亿元与9.17亿元两个口径。",
    180,
  ));
  assert.equal(paragraphs.length, 1);
  assert.match(paragraphs[0], /2026年7月/);
  assert.match(paragraphs[0], /2769\.17亿元与9\.17亿元/);
});

test("readable blocks repair model line breaks inside percentages and amounts", () => {
  const paragraphs = Array.from(splitReadableBlocks(
    "产能利用率约\n\n9\n\n4.86%，两篇报道分别给出\n\n2\n\n7\n\n6\n\n9.17亿元与2769亿元。",
    180,
  ));
  assert.equal(paragraphs.length, 1);
  assert.match(paragraphs[0], /产能利用率约94\.86%/);
  assert.match(paragraphs[0], /分别给出2769\.17亿元与2769亿元/);
});

test("readable blocks preserve real numbered list lines", () => {
  const paragraphs = Array.from(splitReadableBlocks(
    "建议行动：\n1. 核验法定主体与公开事项归属\n2. 确认采购部门和预算窗口",
    180,
  ));
  assert.deepEqual(paragraphs, [
    "建议行动：",
    "1. 核验法定主体与公开事项归属",
    "2. 确认采购部门和预算窗口",
  ]);
});

test("readable blocks split inline Arabic numbered actions into separate lines", () => {
  const paragraphs = Array.from(splitReadableBlocks(
    "建议行动：1)核验主体。2)联系采购部门。3)确认预算窗口。",
    180,
  ));
  assert.deepEqual(paragraphs, [
    "建议行动：",
    "1)核验主体。",
    "2)联系采购部门。",
    "3)确认预算窗口。",
  ]);
});

test("readable blocks split dot-numbered actions and preserve years and decimals", () => {
  const paragraphs = Array.from(splitReadableBlocks(
    "建议行动：1. 联系采购部门。2. 核验2026年项目窗口。3. 确认9.17亿元口径。",
    180,
  ));
  assert.deepEqual(paragraphs, [
    "建议行动：",
    "1. 联系采购部门。",
    "2. 核验2026年项目窗口。",
    "3. 确认9.17亿元口径。",
  ]);
});

test("readable blocks also split compact dot-numbered actions", () => {
  const paragraphs = Array.from(splitReadableBlocks(
    "建议行动：1.联系采购部门。2.确认预算窗口。3.准备合规材料。",
    180,
  ));
  assert.deepEqual(paragraphs, [
    "建议行动：",
    "1.联系采购部门。",
    "2.确认预算窗口。",
    "3.准备合规材料。",
  ]);
});

test("readable blocks split Chinese ordinal points into separate lines", () => {
  const paragraphs = Array.from(splitReadableBlocks(
    "销售机会判断：第一，确认业务场景。第二，核验采购时机。第三，准备合规材料。",
    180,
  ));
  assert.deepEqual(paragraphs, [
    "销售机会判断：",
    "第一，确认业务场景。",
    "第二，核验采购时机。",
    "第三，准备合规材料。",
  ]);
});

test("readable blocks split 一是 style points without breaking years or decimals", () => {
  const paragraphs = Array.from(splitReadableBlocks(
    "判断如下：一是关注2026年项目。二是核验9.17亿元口径。三是确认责任部门。",
    180,
  ));
  assert.deepEqual(paragraphs, [
    "判断如下：",
    "一是关注2026年项目。",
    "二是核验9.17亿元口径。",
    "三是确认责任部门。",
  ]);
});

test("consecutive answer blocks with the same evidence show one citation at the end of the run", () => {
  const paragraphs = Array.from(collapseRepeatedCitationRuns([
    { text: "第一点。", citationIds: ["source-1"] },
    { text: "第二点。", citationIds: ["source-1"] },
    { text: "第三点。", citationIds: ["source-1"] },
    { text: "补充事实。", citationIds: ["source-2"] },
  ]));
  assert.deepEqual(
    paragraphs.map((item) => Array.from(item.displayCitationIds)),
    [[], [], ["source-1"], ["source-2"]],
  );
});

test("citation runs keep separate markers when the supporting source set changes", () => {
  const paragraphs = Array.from(collapseRepeatedCitationRuns([
    { text: "第一组。", citationIds: ["source-1", "source-2"] },
    { text: "第二组。", citationIds: ["source-2", "source-1"] },
    { text: "第三组。", citationIds: ["source-1"] },
  ]));
  assert.deepEqual(
    paragraphs.map((item) => Array.from(item.displayCitationIds)),
    [[], ["source-2", "source-1"], ["source-1"]],
  );
});

test("citation runs do not merge across original answer paragraphs", () => {
  const paragraphs = Array.from(collapseRepeatedCitationRuns([
    { text: "第一段第一点。", citationIds: ["source-1"], citationGroup: 0 },
    { text: "第一段第二点。", citationIds: ["source-1"], citationGroup: 0 },
    { text: "第二段。", citationIds: ["source-1"], citationGroup: 1 },
  ]));
  assert.deepEqual(
    paragraphs.map((item) => Array.from(item.displayCitationIds)),
    [[], ["source-1"], ["source-1"]],
  );
});

test("duplicate source labels share one visible source number without losing citation ids", () => {
  const result = dedupeCitationEntries([
    { id: "chunk-1", label: "飞书云文档：客户需求确认会" },
    { id: "chunk-2", label: "飞书云文档：客户需求确认会" },
    { id: "dossier-1", label: "最近档案 V2" },
  ]);
  assert.deepEqual(
    Array.from(result.entries, (item) => item.label),
    ["飞书云文档：客户需求确认会", "最近档案 V2"],
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.citationNumbers)),
    { "chunk-1": 1, "chunk-2": 1, "dossier-1": 2 },
  );
});
