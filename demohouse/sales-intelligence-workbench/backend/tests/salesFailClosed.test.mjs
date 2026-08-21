import assert from "node:assert/strict";
import test from "node:test";
import { SalesService } from "../src/services/salesService.js";

const strictRuntimePolicy = Object.freeze({
  fail_closed: true,
});

const permissiveTestPolicy = Object.freeze({
  fail_closed: false,
});

function envReader(values = {}) {
  return {
    value(name, fallback = "") {
      return Object.hasOwn(values, name) ? values[name] : fallback;
    },
  };
}

function unavailableProviders() {
  return {
    dataProProvider: {
      maxSources: 1,
      isRunEnabled: () => true,
      callTool: async () => ({ ok: false, error: { code: "temporarily_unavailable" } }),
    },
    webSearchProvider: {
      isRunEnabled: () => true,
      search: async () => ({ ok: false, error: { code: "temporarily_unavailable" }, results: [] }),
    },
  };
}

test("the runtime starts with no business data", () => {
  const service = new SalesService({
    env: envReader(),
    runtimePolicy: permissiveTestPolicy,
  });

  assert.deepEqual(service.data.goals, []);
  assert.deepEqual(service.data.companies, {});
});

test("test data is loaded only when a test explicitly injects a seed", () => {
  const seed = {
    goals: [{ id: "goal-1", name: "Test goal" }],
    companies: {},
    dossiers: {},
    materials: {},
    qa_messages: {},
  };
  const service = new SalesService({
    env: envReader(),
    runtimePolicy: permissiveTestPolicy,
    seed,
  });

  assert.deepEqual(service.data.goals, seed.goals);
});

test("an empty persistent repository replaces injected test data", async () => {
  const service = new SalesService({
    env: envReader(),
    runtimePolicy: strictRuntimePolicy,
    seed: {
      goals: [{ id: "seed-goal", name: "Seed" }],
      companies: { seed: { id: "seed", name: "Seed Company" } },
      dossiers: {},
      materials: {},
      qa_messages: {},
    },
    repository: {
      getSalesState() {
        return {
          goals: [],
          companies: {},
          dossiers: {},
          materials: {},
          qa_messages: {},
        };
      },
    },
  });

  await service.assertRuntimeReady();
  assert.deepEqual(service.data.goals, []);
  assert.deepEqual(service.data.companies, {});
  assert.equal(service.persistence.enabled, true);
});

test("the runtime refuses to continue when verified professional evidence is unavailable", async () => {
  const service = new SalesService({
    env: envReader(),
    runtimePolicy: strictRuntimePolicy,
    ...unavailableProviders(),
  });

  await assert.rejects(
    () => service.collectDossierEvidence({ id: "company-1", name: "测试企业" }),
    (error) => error.status === 503 && error.code === "datapro_unavailable",
  );
});

test("the runtime preserves retryability when public evidence has a transient provider failure", async () => {
  const service = new SalesService({
    env: envReader(),
    runtimePolicy: strictRuntimePolicy,
    dataProProvider: {
      maxSources: 1,
      isRunEnabled: () => true,
      callTool: async () => ({
        ok: true,
        summary: "已核验的企业专业资料",
        raw_ref: "datapro:test",
      }),
    },
    webSearchProvider: {
      isRunEnabled: () => true,
      search: async () => ({
        ok: false,
        error: {
          code: "10500",
          category: "upstream",
          retryable: true,
        },
        results: [],
      }),
    },
  });

  await assert.rejects(
    () => service.collectDossierEvidence({ id: "company-1", name: "测试企业" }),
    (error) => (
      error.status === 503
      && error.code === "web_search_unavailable"
      && error.retryable === true
      && error.details.retryable === true
    ),
  );
});

test("a unit-test policy can inspect issues without inventing professional evidence", async () => {
  const service = new SalesService({
    env: envReader(),
    runtimePolicy: permissiveTestPolicy,
    ...unavailableProviders(),
  });

  const evidence = await service.collectDossierEvidence({ id: "company-1", name: "测试企业" });
  assert.deepEqual(evidence.professional, []);
  assert.deepEqual(evidence.public_sources, []);
  assert.ok(evidence.issues.length >= 2);
});

test("the runtime refuses rule-based dossier fallback when the model is disabled", async () => {
  const service = new SalesService({
    env: envReader(),
    runtimePolicy: strictRuntimePolicy,
    modelProvider: { isRunEnabled: () => false },
  });

  await assert.rejects(
    () => service.generateDossierWithModel(
      { id: "company-1", name: "测试企业有限公司", industry: "测试行业", location: "测试地区" },
      {
        professional: [
          { label: "企业工商数据库", summary: "测试企业有限公司经营测试行业相关的软件与技术服务业务。" },
          { label: "金融数据库", summary: "测试企业有限公司持续推进软件产品研发与客户交付。" },
        ],
        public_sources: [
          {
            label: "测试企业有限公司发布产品升级公告",
            summary: "测试企业有限公司于2026年7月发布产品升级公告。",
            url: "https://news.test/company-update",
            published_at: "2026-07-20T09:00:00.000Z",
          },
          {
            label: "测试企业有限公司披露项目交付计划",
            summary: "测试企业有限公司披露项目分阶段交付计划。",
            url: "https://official.test/company-delivery",
            published_at: "2026-07-21T09:00:00.000Z",
          },
        ],
      },
      [],
    ),
    (error) => error.status === 503 && error.code === "model_unavailable",
  );
});

test("the runtime does not persist a rule dossier when the final model quality gate returns no dossier", async () => {
  const service = new SalesService({
    env: envReader({ APP_WORKSPACE_ID: "workspace-test", ASYNC_JOBS_ENABLED: "false" }),
    runtimePolicy: strictRuntimePolicy,
    seed: {
      goals: [],
      companies: {
        company_1: {
          id: "company_1",
          name: "测试科技有限公司",
          industry: "企业软件",
          location: "北京",
          dossier_ids: [],
          material_ids: [],
        },
      },
      dossiers: {},
      materials: {},
      qa_messages: {},
      jobs: {},
    },
    providerRunStore: {
      startRun: async () => ({ id: "run-1" }),
      failRun: async () => null,
    },
  });
  service.startJob = async () => ({ id: "job-1" });
  service.assertJobActive = async () => ({ id: "job-1" });
  service.trackProviderStep = async (_runId, _input, operation) => operation();
  service.collectDossierEvidence = async () => ({
    professional: [{
      label: "企业工商数据库",
      summary: "公司名称：测试科技有限公司；统一社会信用代码：TEST0001；经营范围：企业软件。",
    }],
    public_sources: [{
      label: "测试科技有限公司发布产品升级公告",
      summary: "测试科技有限公司于2026年7月发布企业知识库产品升级公告。",
      url: "https://news.test/product-update",
      published_at: "2026-07-20T09:00:00.000Z",
    }],
    issues: [],
  });
  service.generateDossierWithModel = async () => null;
  service.buildRuleDossier = () => {
    throw new Error("rule fallback must not run");
  };
  service.failJob = async () => null;

  await assert.rejects(
    () => service.createDossier("company_1"),
    (error) => (
      error.status === 503
      && error.code === "model_unavailable"
      && error.details.reason === "dossier_quality_gate_failed"
    ),
  );
  assert.deepEqual(service.data.dossiers, {});
});

test("the runtime requires the actually cited sources to anchor the legal entity", async () => {
  const service = new SalesService({
    env: envReader({ APP_WORKSPACE_ID: "workspace-test", ASYNC_JOBS_ENABLED: "false" }),
    runtimePolicy: strictRuntimePolicy,
    seed: {
      goals: [],
      companies: {
        company_1: {
          id: "company_1",
          name: "测试科技有限公司",
          industry: "企业软件",
          location: "北京",
          dossier_ids: [],
          material_ids: [],
        },
      },
      dossiers: {},
      materials: {},
      qa_messages: {},
      jobs: {},
    },
    providerRunStore: {
      startRun: async () => ({ id: "run-1" }),
      failRun: async () => null,
    },
  });
  service.startJob = async () => ({ id: "job-1" });
  service.assertJobActive = async () => ({ id: "job-1" });
  service.trackProviderStep = async (_runId, _input, operation) => operation();
  service.collectDossierEvidence = async () => ({
    professional: [
      {
        label: "企业工商数据库",
        summary: "公司名称：测试科技有限公司；统一社会信用代码：TEST0001；经营范围：企业软件与知识库产品。",
      },
      {
        label: "企业风险数据库",
        summary: "项目交付、合同责任和供应保障事项需要持续核验。",
      },
    ],
    public_sources: [
      {
        label: "测试科技有限公司产品升级公告",
        summary: "测试科技有限公司于2026年7月发布销售知识库产品升级公告。",
        url: "https://news.test/product-update",
        published_at: "2026-07-20T09:00:00.000Z",
      },
      {
        label: "测试科技有限公司项目交付公告",
        summary: "测试科技有限公司于2026年7月披露企业软件项目的分阶段交付安排。",
        url: "https://official.test/project-delivery",
        published_at: "2026-07-21T09:00:00.000Z",
      },
    ],
    issues: [],
  });
  service.generateDossierWithModel = async () => ({
    id: "under-sourced-model-dossier",
    company_id: "company_1",
    title: "测试科技有限公司 销售情报报告",
    summary: "测试科技有限公司近期升级企业知识库产品。",
    body: [
      { text: "企业与业务概览：测试科技有限公司面向企业客户提供知识库软件。", citation_ids: ["p2"] },
      { text: "经营与业务动态：公司持续升级企业知识库产品与内容检索能力。", citation_ids: ["p2"] },
      { text: "近期公开动态：测试科技有限公司于2026年7月发布产品升级公告。", citation_ids: ["w1"] },
      { text: "风险与关注事项：项目推进前需要确认实施排期和合同责任边界。", citation_ids: ["p2", "w1"] },
      { text: "销售机会判断：产品升级形成沟通窗口，但不代表客户已经形成采购意向。", citation_ids: ["p2", "w1"] },
      { text: "建议行动：1. 联系产品负责人。\n2. 核验实施排期。\n3. 准备试点方案。", citation_ids: ["p2", "w1"] },
    ],
    citations: [
      { id: "p1", label: "企业工商数据库", source_kind: "专业数据集", summary: "测试科技有限公司主营企业软件与知识库产品。" },
      { id: "p2", label: "企业风险数据库", source_kind: "专业数据集", summary: "项目交付和合同责任需要持续核验。" },
      { id: "w1", label: "测试科技有限公司产品升级公告", source_kind: "联网搜索", url: "https://news.test/product-update", summary: "测试科技有限公司于2026年7月发布产品升级公告。" },
      { id: "w2", label: "测试科技有限公司项目交付公告", source_kind: "联网搜索", url: "https://official.test/project-delivery", summary: "测试科技有限公司于2026年7月披露项目交付安排。" },
    ],
    memory_summary: "测试科技有限公司近期升级企业知识库产品。",
    created_at: "2026-07-29T10:00:00.000Z",
  });
  service.failJob = async () => null;

  await assert.rejects(
    () => service.createDossier("company_1"),
    (error) => (
      error.status === 503
      && error.code === "model_unavailable"
      && error.details.reason === "public_dossier_quality_gate_failed"
      && error.details.validation_errors.some((message) => /目标法定主体/.test(message))
    ),
  );
  assert.deepEqual(service.data.dossiers, {});
});

test("dossier lists hide six-section records that contain search debris or question-like facts", () => {
  const goodBody = [
    { text: "企业与业务概览：测试科技有限公司面向企业客户提供知识库软件，并持续服务销售团队的信息管理场景。", citation_ids: ["professional-1"] },
    { text: "经营与业务动态：公司在2026年持续升级企业知识库产品，重点增强权限管理、内容检索和协作能力。", citation_ids: ["professional-1"] },
    { text: "近期公开动态：公司于2026年7月发布产品升级公告，披露了面向销售团队的新协作功能。", citation_ids: ["public-1"] },
    { text: "风险与关注事项：公开公告提示交付计划仍受实施资源影响，商务推进前应确认项目排期和责任边界。", citation_ids: ["public-1"] },
    { text: "销售机会判断：产品升级形成了知识库集成和数据治理的沟通窗口，但不代表客户已经形成采购意向。", citation_ids: ["professional-1", "public-1"] },
    { text: "建议行动：1. 联系产品负责人确认升级范围和试点计划。\n2. 准备权限治理与交付边界材料。\n3. 核验预算窗口和采购流程。", citation_ids: ["professional-1", "public-1"] },
  ];
  const citations = [
    { id: "professional-1", label: "企业工商数据库", source_kind: "专业数据集", summary: "测试科技有限公司主营企业软件。" },
    { id: "public-1", label: "测试科技有限公司产品升级公告", source_kind: "联网搜索", summary: "测试科技有限公司于2026年7月发布产品升级公告。" },
  ];
  const service = new SalesService({
    env: envReader(),
    runtimePolicy: permissiveTestPolicy,
    seed: {
      goals: [],
      companies: {
        company_1: {
          id: "company_1",
          name: "测试科技有限公司",
          dossier_ids: ["bad-dossier", "good-dossier"],
          material_ids: [],
        },
      },
      dossiers: {
        "bad-dossier": {
          id: "bad-dossier",
          company_id: "company_1",
          summary: "测试科技有限公司是否有法律诉讼-启信宝。",
          body: goodBody.map((paragraph, index) => (
            index === 2
              ? { text: "近期公开动态：测试科技有限公司是否有法律诉讼-启信宝。", citation_ids: ["public-1"] }
              : paragraph
          )),
          citations,
          version_no: 2,
          created_at: "2026-07-29T10:00:00.000Z",
        },
        "good-dossier": {
          id: "good-dossier",
          company_id: "company_1",
          summary: "测试科技有限公司近期升级企业知识库产品，销售侧可围绕权限治理、系统集成和试点交付窗口继续核验。",
          body: goodBody,
          citations,
          version_no: 1,
          created_at: "2026-07-28T10:00:00.000Z",
        },
      },
      materials: {},
      qa_messages: {},
      jobs: {},
    },
  });

  assert.deepEqual(service.listDossiers("company_1").map((item) => item.id), ["good-dossier"]);
});

test("strict dossier detail keeps a concise record when its claims are grounded and the subject is anchored", () => {
  const body = [
    { text: "企业与业务概览：测试科技有限公司面向企业客户提供知识库软件，并持续服务销售团队的信息管理场景。", citation_ids: ["professional-1"] },
    { text: "经营与业务动态：公司持续升级企业知识库产品，重点增强权限管理、内容检索和协作能力。", citation_ids: ["professional-1"] },
    { text: "近期公开动态：测试科技有限公司于2026年7月发布产品升级公告，披露面向销售团队的新协作功能。", citation_ids: ["public-1"] },
    { text: "风险与关注事项：公开公告提示交付计划仍受实施资源影响，商务推进前应确认项目排期和责任边界。", citation_ids: ["public-1"] },
    { text: "销售机会判断：产品升级形成知识库集成和数据治理的沟通窗口，但不代表客户已经形成采购意向。", citation_ids: ["professional-1", "public-1"] },
    { text: "建议行动：1. 联系产品负责人确认升级范围。\n2. 准备权限治理材料。\n3. 核验预算窗口。", citation_ids: ["professional-1", "public-1"] },
  ];
  const service = new SalesService({
    env: envReader(),
    runtimePolicy: strictRuntimePolicy,
    seed: {
      goals: [],
      companies: {
        company_1: {
          id: "company_1",
          name: "测试科技有限公司",
          dossier_ids: ["under-sourced-dossier"],
          material_ids: [],
        },
      },
      dossiers: {
        "under-sourced-dossier": {
          id: "under-sourced-dossier",
          company_id: "company_1",
          summary: "测试科技有限公司近期升级企业知识库产品。",
          body,
          citations: [
            {
              id: "professional-1",
              label: "企业工商数据库",
              source_kind: "专业数据集",
              summary: "测试科技有限公司主营企业软件与知识库产品。",
            },
            {
              id: "public-1",
              label: "测试科技有限公司产品升级公告",
              source_kind: "联网搜索",
              url: "https://news.test/product-update",
              summary: "测试科技有限公司于2026年7月发布产品升级公告。",
            },
          ],
          version_no: 1,
          created_at: "2026-07-29T10:00:00.000Z",
        },
      },
      materials: {},
      qa_messages: {},
      jobs: {},
    },
  });

  assert.deepEqual(
    service.listDossiers("company_1").map((item) => item.id),
    ["under-sourced-dossier"],
  );
  assert.equal(service.dossierDetail("under-sourced-dossier").citations.length, 2);
});

test("business access requires a working persistent repository", async () => {
  const service = new SalesService({
    env: envReader(),
    runtimePolicy: strictRuntimePolicy,
  });

  await assert.rejects(
    () => service.assertRuntimeReady(),
    (error) => error.status === 503 && error.code === "supabase_unavailable",
  );
});
