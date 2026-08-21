import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertDossierPersistenceBoundary,
  assertProviderRun,
  collectPrivatePaths,
  parseArgs,
  pollJob,
  selectCandidate,
  usageSummary,
  validateDossier,
  validateQa,
} from "../scripts/verify-business-chain.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));

test("legacy real-chain script cannot be mistaken for real runtime evidence", () => {
  const source = fs.readFileSync(path.join(testDir, "..", "scripts", "real-chain-check.mjs"), "utf8");
  assert.doesNotMatch(source, /createMockProviders|MemoryRepository|DemoService/);
  assert.match(source, /旧脚本已停用/);
});

test("business verifier requires explicit live confirmation, enterprise identity, and a QA question", () => {
  assert.throws(
    () => parseArgs(["--enterprise-id", "company-1", "--question", "当前重点？"]),
    /--confirm-live/,
  );
  assert.throws(
    () => parseArgs(["--enterprise-id", "company-1", "--confirm-live"]),
    /--question/,
  );
  const parsed = parseArgs([
    "--enterprise-id", "company-1",
    "--question", "当前重点？",
    "--confirm-live",
  ]);
  assert.equal(parsed.enterpriseId, "company-1");
  assert.equal(parsed.confirmLive, true);
});

test("company selection never picks an ambiguous first result", () => {
  const candidates = [
    { id: "one", name: "示例科技有限公司", identity_status: "verified" },
    { id: "two", name: "示例科技（北京）有限公司", identity_status: "verified" },
  ];
  assert.equal(
    selectCandidate(candidates, { companyQuery: "示例科技有限公司", candidateId: "" }).id,
    "one",
  );
  assert.throws(
    () => selectCandidate(candidates, { companyQuery: "示例科技", candidateId: "" }),
    /无法唯一确定企业主体/,
  );
  assert.throws(
    () => selectCandidate([{ id: "draft", name: "待核验", identity_status: "unverified" }], {
      companyQuery: "待核验",
      candidateId: "",
    }),
    /未通过专业数据集主体核验/,
  );
});

test("dossier and QA acceptance require scoped citations and reject internal fields", () => {
  const dossier = {
    id: "dossier-1",
    company_id: "company-1",
    citations: [
      { id: "1", source_kind: "专业数据集", label: "企业工商数据库" },
      { id: "2", source_kind: "联网搜索", label: "企业官网公告" },
    ],
    body: [
      { text: "企业情况：已核验。", citation_ids: ["1"] },
      { text: "近期动态：有公开公告。", citation_ids: ["2"] },
    ],
  };
  const dossierChecks = validateDossier(dossier, "company-1");
  assert.equal(dossierChecks.citationCount, 2);
  assert.throws(
    () => validateDossier({ ...dossier, raw_ref: "internal" }, "company-1"),
    /暴露了内部字段/,
  );
  assert.throws(
    () => validateDossier({ ...dossier, body: [{ text: "没有引用", citation_ids: [] }] }, "company-1"),
    /缺少引用/,
  );

  const qaChecks = validateQa({
    message: {
      id: "qa-1",
      role: "assistant",
      insufficient: false,
      citations: [{ id: "1", label: "最近档案" }],
      paragraphs: [{ text: "可核验回答。", citation_ids: ["1"] }],
    },
  });
  assert.equal(qaChecks.citationCount, 1);
});

test("provider evidence requires each expected real provider to succeed", () => {
  const run = {
    id: "run-1",
    status: "succeeded",
    steps: [
      { provider: "datapro", status: "succeeded" },
      { provider: "web_search", status: "succeeded" },
    ],
  };
  assert.doesNotThrow(() => assertProviderRun(run, ["datapro", "web_search"], "企业搜索"));
  assert.throws(
    () => assertProviderRun({
      ...run,
      status: "succeeded_with_issues",
      steps: [{ provider: "datapro", status: "succeeded" }, { provider: "web_search", status: "failed" }],
    }, ["datapro", "web_search"], "企业搜索"),
    /未成功：web_search/,
  );
});

test("dossier acceptance enforces Supabase persistence without duplicating the report in OpenViking", () => {
  assert.doesNotThrow(() => assertDossierPersistenceBoundary({
    steps: [{
      provider: "openviking",
      operation: "store_dossier_memory",
      status: "skipped",
      output_summary: "档案属于结构化业务记录，由 Supabase 保存，不重复写入 OpenViking。",
    }],
  }));
  assert.throws(
    () => assertDossierPersistenceBoundary({
      steps: [{
        provider: "openviking",
        operation: "store_dossier_memory",
        status: "succeeded",
        output_summary: "已重复保存。",
      }],
    }),
    /未遵守 Supabase 持久化/,
  );
});

test("job polling returns a succeeded job and usage aggregation uses recorded attempts", async () => {
  const jobs = [
    { id: "job-1", status: "running", stage: "generating", progress: 50 },
    { id: "job-1", status: "succeeded", stage: "succeeded", progress: 100, result: { dossier_id: "d-1" } },
  ];
  const job = await pollJob({ timeoutMs: 1000, pollMs: 250 }, "job-1", async () => jobs.shift());
  assert.equal(job.result.dossier_id, "d-1");

  const usage = usageSummary([{
    steps: [
      { provider: "model", attempts: 1, usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 } },
      { provider: "web_search", attempts: 2, usage: null },
    ],
  }]);
  assert.deepEqual(usage.model, { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 });
  assert.equal(usage.provider_attempts.web_search, 2);
});

test("recursive public response scan catches nested secret-bearing keys", () => {
  assert.deepEqual(collectPrivatePaths({ safe: { access_token: "hidden" } }), ["$.safe.access_token"]);
  assert.deepEqual(collectPrivatePaths({ safe: [{ label: "ok" }] }), []);
});
