import assert from "node:assert/strict";
import test from "node:test";
import {
  assessDossierEvidenceCoverage,
  SalesService,
} from "../src/services/salesService.js";

const permissiveTestPolicy = Object.freeze({
  fail_closed: false,
});

const strictRuntimePolicy = Object.freeze({
  fail_closed: true,
});

function envReader(values = {}) {
  return {
    value(name, fallback = "") {
      return Object.hasOwn(values, name) ? values[name] : fallback;
    },
  };
}

function seed() {
  return {
    goals: [],
    companies: {
      company_1: {
        id: "company_1",
        name: "测试科技有限公司",
        initial: "测",
        industry: "企业软件",
        location: "北京",
        tags: [],
        progress: { label: "新商机", summary: "待生成档案", evidence: "暂无", updated_at: null },
        dossier_ids: [],
        material_ids: ["material_1"],
        qa_session_id: "sales-company_1",
      },
    },
    dossiers: {},
    materials: {
      material_1: {
        id: "material_1",
        company_id: "company_1",
        title: "客户需求确认会",
        summary: "客户希望先验证知识库问答，并要求明确数据权限边界。",
        source_type: "飞书会议纪要",
        openviking_uri: "viking://resources/workspace-test/companies/company_1/materials/material_1",
        updated_at: "2026-07-20T08:00:00.000Z",
      },
    },
    qa_messages: { company_1: [] },
    sync_sources: {},
    sync_checkpoints: {},
    jobs: {},
  };
}

function stagedDossierPlan(request, { preferredPublicTitle = "" } = {}) {
  const evidenceBySection = request.payload.evidence_by_section;
  const evidence = (key, predicate = () => true, preferPublic = false) => {
    const candidates = evidenceBySection?.[key]?.allowed_evidence || [];
    if (preferPublic && preferredPublicTitle) {
      const preferred = candidates.find((item) => (
        item.title.includes(preferredPublicTitle) && predicate(item)
      ));
      if (preferred) return preferred;
    }
    return candidates.find(predicate) || candidates[0];
  };
  const complete = (value) => (
    /[。！？]$/u.test(String(value || "")) ? String(value) : `${String(value || "")}。`
  );
  let businessDynamicsEvidenceId = "";
  const builders = {
    company_overview() {
      const atom = evidence("company_overview", (item) => (
        /经营范围|面向企业|主营/.test(item.quote)
      ));
      return {
        text: "该企业经营企业软件相关业务。",
        evidence_ids: [atom.id],
      };
    },
    business_dynamics() {
      const atom = evidence("business_dynamics", (item) => (
        item.source_kind === "professional"
        && /金融数据库|汽车销量数据库|科研学术数据搜索服务/.test(item.title)
      ));
      businessDynamicsEvidenceId = atom.id;
      return { text: complete(atom.quote), evidence_ids: [atom.id] };
    },
    recent_public_updates() {
      const atom = evidence(
        "recent_public_updates",
        (item) => item.id !== businessDynamicsEvidenceId,
        true,
      );
      return { text: complete(atom.quote), evidence_ids: [atom.id] };
    },
    risk_attention() {
      const atom = evidence("risk_attention");
      return {
        text: "业务推进前需要核验企业软件的实施范围和责任边界。",
        evidence_ids: [atom.id],
      };
    },
    sales_opportunity() {
      const atom = evidence("sales_opportunity", (item) => (
        /升级|更新|项目|产品/.test(item.quote)
      ), true);
      return {
        text: "产品更新为销售知识库场景提供试点沟通窗口，但不代表企业已有采购意向。",
        evidence_ids: [atom.id],
      };
    },
    recommended_actions() {
      const atom = evidence("recommended_actions", (item) => (
        /升级|更新|项目|产品|交付/.test(item.quote)
      ), true);
      return {
        text: "销售人员应联系产品负责人确认产品更新范围、试点目标和验收边界。",
        evidence_ids: [atom.id],
      };
    },
  };
  const required = request.parameters.properties.sections.required;
  return {
    sections: Object.fromEntries(required.map((key) => [key, builders[key]()])),
  };
}

function createWorkflowService({
  sharedSessionMessages = new Map(),
  seedData = seed(),
} = {}) {
  let publicSummary = "测试科技有限公司发布了企业知识库产品更新公告。";
  const modelCalls = [];
  const sessionMessages = sharedSessionMessages;
  const modelProvider = {
    isRunEnabled: () => true,
    async callJson(input) {
      modelCalls.push(structuredClone(input));
      if (input.operation === "sales_qa") {
        const dossier = input.payload.evidence.find((item) => item.source_kind === "企业档案");
        const internal = input.payload.evidence.find((item) => item.source_kind !== "企业档案");
        return {
          ok: true,
          parsed: {
            paragraphs: [
              { text: "当前企业档案显示该企业近期更新了知识库产品。", citation_ids: [dossier.id] },
              { text: "历史沟通中，客户要求先确认数据权限边界。", citation_ids: [internal.id] },
            ],
            insufficient: false,
          },
          usage: { prompt_tokens: 120, completion_tokens: 60, total_tokens: 180 },
          raw_ref: "model:qa-1",
        };
      }
      if (input.operation === "sales_dossier_agent_plan" || input.operation === "sales_dossier_agent_replan") {
        return {
          ok: true,
          parsed: stagedDossierPlan(input, {
            preferredPublicTitle: "测试科技有限公司产品更新公告",
          }),
          usage: { prompt_tokens: 180, completion_tokens: 80, total_tokens: 260 },
          raw_ref: `model:dossier-plan-${modelCalls.length}`,
        };
      }
      throw new Error(`unexpected dossier operation: ${input.operation}`);
    },
    async callRequiredFunction(input) {
      return this.callJson(input);
    },
  };
  const service = new SalesService({
    env: envReader({ APP_WORKSPACE_ID: "workspace-test", ASYNC_JOBS_ENABLED: "false" }),
    runtimePolicy: permissiveTestPolicy,
    seed: seedData,
    dataProProvider: {
      maxSources: 1,
      isRunEnabled: () => true,
      async callTool(query) {
        return {
          ok: true,
          summary: "测试科技有限公司；统一社会信用代码：TEST0001；经营范围：企业软件。",
          raw_ref: "datapro:company_1",
          query,
        };
      },
    },
    webSearchProvider: {
      isRunEnabled: () => true,
      async search() {
        return {
          ok: true,
          results: [{
            title: "测试科技有限公司产品更新公告",
            summary: publicSummary,
            url: "https://news.test/company-1-update",
            publish_time: "2026-07-20T09:00:00.000Z",
          }],
        };
      },
    },
    modelProvider,
    openVikingProvider: {
      isConfigured: () => true,
      isRunEnabled: () => true,
      salesCompanyUri: ({ workspaceId, companyId }) => `viking://resources/${workspaceId}/companies/${companyId}`,
      salesSessionId: ({ workspaceId, companyId }) => `sales-${workspaceId}-${companyId}`,
      async findMemories() {
        return {
          ok: true,
          result: {
            resources: [
              {
                uri: "viking://resources/workspace-test/companies/company_1/materials/material_1.md",
                title: "material_1.md",
                abstract: "客户希望先验证知识库问答，并要求明确数据权限边界。",
              },
              {
                uri: "viking://resources/workspace-test/companies/company_1/materials/overview.md",
                title: "overview",
                abstract: "内部目录 company_dp_should_not_be_visible 的实现说明。",
              },
            ],
          },
        };
      },
      async getSessionContext(sessionId) {
        const messages = sessionMessages.get(sessionId) || [];
        if (!messages.length) {
          return { ok: false, http_status: 404, error: { code: "not_found", message: "Session not found" } };
        }
        return {
          ok: true,
          session_id: sessionId,
          messages,
          latest_archive_overview: "",
          raw_ref: `openviking:session:${sessionId}:context`,
        };
      },
      async addSessionMessages(sessionId, messages) {
        const existing = sessionMessages.get(sessionId) || [];
        const appended = messages.map((message, index) => ({
          id: `session-message-${existing.length + index + 1}`,
          role: message.role,
          text: message.content,
          created_at: "2026-07-26T10:00:00.000Z",
        }));
        sessionMessages.set(sessionId, [...existing, ...appended]);
        return {
          ok: true,
          session_id: sessionId,
          raw_ref: `openviking:session:${sessionId}:messages`,
        };
      },
      async recordSessionUsed() {
        return { ok: true };
      },
      async commitSession(sessionId) {
        return { ok: true, raw_ref: `openviking:session:${sessionId}:commit` };
      },
    },
  });
  return {
    service,
    modelCalls,
    sessionMessages,
    changePublicSummary(value) {
      publicSummary = value;
    },
  };
}

test("dossier generation skips unchanged evidence and versions material changes", async () => {
  const fixture = createWorkflowService();
  const first = await fixture.service.createDossier("company_1");
  const firstModelCalls = fixture.modelCalls.filter((call) => call.operation === "sales_dossier_agent_plan");

  assert.equal(first.action, "created");
  assert.equal(first.detail.version_no, 1);
  assert.equal(first.detail.previous_dossier_id, null);
  assert.equal(Object.hasOwn(first.detail, "evidence_hash"), false);
  assert.equal(Object.hasOwn(first.detail, "dossier_fingerprint"), false);
  assert.equal(Object.hasOwn(first.detail, "provider_run_id"), false);
  assert.equal(firstModelCalls.length, 1);
  assert.equal(first.detail.body.length, 6);
  assert.ok(
    first.detail.body.every((paragraph) => paragraph.citation_ids.length > 0),
    JSON.stringify({ body: first.detail.body, citations: first.detail.citations }, null, 2),
  );
  assert.ok(first.detail.citations.every((citation) => ["专业数据集", "联网搜索"].includes(citation.source_kind)));
  assert.equal(first.detail.citations.some((citation) => citation.source_kind === "内部资料"), false);
  assert.equal(firstModelCalls[0].payload.citations, undefined);
  assert.doesNotMatch(
    JSON.stringify(firstModelCalls[0].payload.evidence_by_section),
    /内部资料|openviking|viking:\/\//iu,
  );

  const unchanged = await fixture.service.createDossier("company_1");
  assert.equal(unchanged.action, "no_material_change");
  assert.equal(unchanged.detail.id, first.detail.id);
  assert.equal(fixture.modelCalls.filter((call) => call.operation === "sales_dossier_agent_plan").length, 1);
  assert.equal(Object.keys(fixture.service.data.dossiers).length, 1);

  fixture.changePublicSummary("测试科技有限公司新增了面向销售团队的知识库协作能力。");
  const changed = await fixture.service.createDossier("company_1");
  assert.equal(changed.action, "created");
  assert.equal(changed.detail.version_no, 2);
  assert.equal(changed.detail.previous_dossier_id, first.detail.id);
  assert.equal(
    fixture.modelCalls.filter((call) => call.operation === "sales_dossier_agent_plan").length,
    2,
  );
  assert.equal(Object.keys(fixture.service.data.dossiers).length, 2);

  const hiddenDossierId = "dossier-hidden-v9";
  const changedRecord = fixture.service.data.dossiers[changed.detail.id];
  fixture.service.data.dossiers[hiddenDossierId] = {
    ...structuredClone(changedRecord),
    id: hiddenDossierId,
    version_no: 9,
    summary: "测试科技有限公司是否有法律诉讼-启信宝。",
    body: changedRecord.body.map((paragraph, index) => (
      index === 2
        ? { ...paragraph, text: "近期公开动态：测试科技有限公司是否有法律诉讼-启信宝。" }
        : structuredClone(paragraph)
    )),
    evidence_hash: "hidden-low-quality-evidence",
    created_at: "2026-07-29T10:00:00.000Z",
  };
  fixture.service.data.companies.company_1.dossier_ids.unshift(hiddenDossierId);
  fixture.changePublicSummary("测试科技有限公司新增了面向销售负责人的客户洞察能力。");
  const afterHiddenVersion = await fixture.service.createDossier("company_1");
  assert.equal(afterHiddenVersion.action, "created");
  assert.equal(afterHiddenVersion.detail.version_no, 10);
  assert.equal(afterHiddenVersion.detail.previous_dossier_id, changed.detail.id);
  assert.equal(fixture.service.listDossiers("company_1").some((item) => item.id === hiddenDossierId), false);

  const jobs = await fixture.service.listJobs({ job_type: "sales_dossier_generation" });
  assert.equal(jobs.length, 4);
  assert.ok(jobs.every((job) => job.status === "succeeded"));
});

test("dossier generation does not persist a second version when added evidence leaves the public report unchanged", async () => {
  const fixture = createWorkflowService();
  const stablePublicResults = [
    {
      title: "测试科技有限公司产品更新公告",
      summary: "测试科技有限公司发布了企业知识库产品更新公告。",
      url: "https://news.test/company-1-update",
      publish_time: "2026-07-20T09:00:00.000Z",
    },
    {
      title: "测试科技有限公司产品交付说明",
      summary: "测试科技有限公司披露企业知识库产品交付范围与实施安排。",
      url: "https://news.test/company-1-delivery",
      publish_time: "2026-07-18T09:00:00.000Z",
    },
  ];
  fixture.service.webSearchProvider.search = async () => ({
    ok: true,
    results: stablePublicResults,
  });
  const first = await fixture.service.createDossier("company_1");
  fixture.service.webSearchProvider.search = async () => ({
    ok: true,
    results: [
      ...stablePublicResults,
      {
        title: "测试科技有限公司产品更新补充说明",
        summary: "测试科技有限公司补充披露了企业知识库产品更新安排。",
        url: "https://news.test/company-1-update-note",
        publish_time: "2026-07-19T09:00:00.000Z",
      },
    ],
  });
  fixture.service.modelProvider.callRequiredFunction = async (input) => {
    fixture.modelCalls.push(structuredClone(input));
    if (input.operation === "sales_dossier_agent_plan") {
      return {
        ok: true,
        parsed: stagedDossierPlan(input, {
          preferredPublicTitle: "测试科技有限公司产品更新公告",
        }),
        raw_ref: "model:same-report-plan",
      };
    }
    throw new Error(`unexpected dossier operation: ${input.operation}`);
  };

  const second = await fixture.service.createDossier("company_1");

  assert.equal(second.action, "no_report_change");
  assert.equal(second.detail.id, first.detail.id);
  assert.equal(Object.keys(fixture.service.data.dossiers).length, 1);
});

test("unchanged evidence regenerates a legacy dossier that no longer meets citation coverage", async () => {
  const fixture = createWorkflowService();
  const first = await fixture.service.createDossier("company_1");
  const stored = fixture.service.data.dossiers[first.detail.id];
  const professionalId = stored.citations.find((citation) => citation.source_kind === "专业数据集")?.id;
  assert.ok(professionalId);
  stored.body = stored.body.map((paragraph) => ({
    ...paragraph,
    citation_ids: [professionalId],
    segments: (paragraph.segments || []).map((segment) => ({
      ...segment,
      citation_ids: [professionalId],
    })),
  }));

  const regenerated = await fixture.service.createDossier("company_1");
  assert.equal(regenerated.action, "created");
  assert.equal(regenerated.detail.version_no, 2);
  assert.equal(regenerated.detail.previous_dossier_id, first.detail.id);
  assert.equal(fixture.modelCalls.filter((call) => call.operation === "sales_dossier_agent_plan").length, 2);
  assert.ok(regenerated.detail.citations.length >= 2);
});

test("dossier evidence collection supplements professional data with public risk queries", async () => {
  const webQueries = [];
  const service = new SalesService({
    env: envReader({ APP_WORKSPACE_ID: "workspace-test" }),
    runtimePolicy: permissiveTestPolicy,
    seed: seed(),
    dataProProvider: {
      maxSources: 2,
      isRunEnabled: () => true,
      planDossierQueries: () => [
        {
          label: "企业工商数据库",
          purpose: "主体与经营信息核验",
          query: "测试科技有限公司 企业工商数据",
        },
        {
          label: "企业风险数据库",
          purpose: "风险与关注事项核验",
          query: "测试科技有限公司 企业风险数据",
        },
      ],
      async callTool(query) {
        return {
          ok: true,
          summary: query.includes("风险")
            ? "企业风险信息包含经营异常、行政处罚、司法诉讼和限制高消费等核验维度。"
            : "测试科技有限公司经营范围包括企业软件与知识库产品。",
          raw_ref: `datapro:${query}`,
        };
      },
    },
    webSearchProvider: {
      isRunEnabled: () => true,
      async search(input) {
        webQueries.push(input.query);
        return {
          ok: true,
          results: [{
            title: `${input.query}公开结果`,
            summary: "公开来源披露了与该查询相关的企业事项。",
            url: `https://news.test/${webQueries.length}`,
            publish_time: "2026-07-20T09:00:00.000Z",
          }],
        };
      },
    },
  });

  await service.collectDossierEvidence(service.data.companies.company_1);

  assert.ok(webQueries.some((query) => (
    /行政处罚/.test(query)
    && /司法诉讼/.test(query)
    && /失信被执行/.test(query)
    && /经营异常/.test(query)
  )));
});

test("dossier evidence collection resumes completed provider queries from a durable checkpoint", async () => {
  let dataProCalls = 0;
  let webCalls = 0;
  let savedCheckpoint = null;
  const service = new SalesService({
    env: envReader({ APP_WORKSPACE_ID: "workspace-test" }),
    runtimePolicy: permissiveTestPolicy,
    seed: seed(),
    dataProProvider: {
      maxSources: 2,
      isRunEnabled: () => true,
      planDossierQueries: () => [
        {
          label: "企业工商数据库",
          purpose: "主体与经营信息核验",
          query: "测试科技有限公司 企业工商数据",
        },
        {
          label: "企业风险数据库",
          purpose: "风险与关注事项核验",
          query: "测试科技有限公司 企业风险数据",
        },
      ],
      async callTool(query) {
        dataProCalls += 1;
        return {
          ok: true,
          summary: query.includes("风险")
            ? "测试科技有限公司的企业风险数据包含司法诉讼、行政处罚和经营异常核验结果。"
            : "公司名称：测试科技有限公司；经营范围：企业软件与知识库产品。",
          raw_ref: `datapro:${dataProCalls}`,
        };
      },
    },
    webSearchProvider: {
      isRunEnabled: () => true,
      async search() {
        webCalls += 1;
        return {
          ok: true,
          results: [{
            title: "测试科技有限公司发布知识库项目公告",
            summary: "测试科技有限公司于2026年7月发布知识库项目公告，并披露产品交付安排。",
            url: `https://official.test/update-${webCalls}`,
            site_name: "测试科技有限公司",
            auth_level: 2,
            publish_time: "2026-07-25T09:00:00.000Z",
          }],
        };
      },
    },
  });
  const company = service.data.companies.company_1;

  const first = await service.collectDossierEvidence(company, "", {
    save_checkpoint: async (checkpoint) => {
      savedCheckpoint = structuredClone(checkpoint);
    },
  });
  const firstDataProCalls = dataProCalls;
  const firstWebCalls = webCalls;
  assert.ok(first.professional.length >= 2);
  assert.ok(first.public_sources.length >= 1);
  assert.ok(savedCheckpoint.completed_query_keys.length >= firstDataProCalls + firstWebCalls);

  const resumed = await service.collectDossierEvidence(company, "", {
    checkpoint: savedCheckpoint,
    save_checkpoint: async (checkpoint) => {
      savedCheckpoint = structuredClone(checkpoint);
    },
  });

  assert.equal(dataProCalls, firstDataProCalls);
  assert.equal(webCalls, firstWebCalls);
  assert.deepEqual(resumed.professional, first.professional);
  assert.deepEqual(resumed.public_sources, first.public_sources);
});

test("dossier evidence collection uses bounded concurrency for independent provider queries", async () => {
  let activeDataPro = 0;
  let maxActiveDataPro = 0;
  let activeWeb = 0;
  let maxActiveWeb = 0;
  const service = new SalesService({
    env: envReader({
      APP_WORKSPACE_ID: "workspace-test",
      DOSSIER_DATAPRO_CONCURRENCY: "2",
      DOSSIER_WEB_CONCURRENCY: "3",
    }),
    runtimePolicy: permissiveTestPolicy,
    seed: seed(),
    dataProProvider: {
      maxSources: 3,
      isRunEnabled: () => true,
      planDossierQueries: () => [1, 2, 3].map((index) => ({
        label: index === 1 ? "企业工商数据库" : `专业数据库 ${index}`,
        purpose: `专业核验 ${index}`,
        query: `测试科技有限公司 专业查询 ${index}`,
      })),
      async callTool() {
        activeDataPro += 1;
        maxActiveDataPro = Math.max(maxActiveDataPro, activeDataPro);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeDataPro -= 1;
        return {
          ok: true,
          summary: "公司名称：测试科技有限公司；经营范围：企业软件与知识库产品。",
        };
      },
    },
    webSearchProvider: {
      isRunEnabled: () => true,
      async search(input) {
        activeWeb += 1;
        maxActiveWeb = Math.max(maxActiveWeb, activeWeb);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeWeb -= 1;
        return {
          ok: true,
          results: [{
            title: "测试科技有限公司发布知识库项目公告",
            summary: "测试科技有限公司于2026年7月发布知识库项目公告，并披露产品交付安排。",
            url: `https://official.test/${encodeURIComponent(input.query)}`,
            publish_time: "2026-07-25T09:00:00.000Z",
          }],
        };
      },
    },
  });

  await service.collectDossierEvidence(service.data.companies.company_1);

  assert.equal(maxActiveDataPro, 2);
  assert.equal(maxActiveWeb, 3);
  assert.ok(maxActiveDataPro <= 2);
  assert.ok(maxActiveWeb <= 3);
});

test("dossier evidence collection follows coverage gaps with bounded topic queries", async () => {
  const webQueries = [];
  const service = new SalesService({
    env: envReader({ APP_WORKSPACE_ID: "workspace-test" }),
    runtimePolicy: permissiveTestPolicy,
    seed: seed(),
    dataProProvider: {
      maxSources: 1,
      isRunEnabled: () => true,
      planDossierQueries: () => [{
        label: "企业工商数据库",
        purpose: "主体信息核验",
        query: "测试科技有限公司 企业工商数据",
      }],
      async callTool() {
        return {
          ok: true,
          summary: "公司名称：测试科技有限公司；经营范围：企业软件与知识库产品。",
          raw_ref: "datapro:company",
        };
      },
    },
    webSearchProvider: {
      isRunEnabled: () => true,
      async search(input) {
        webQueries.push(input.query);
        if (input.query.includes("官方公告 项目 合作 投资")) {
          return {
            ok: true,
            results: [{
              title: "测试科技有限公司发布知识库项目合作公告",
              summary: "测试科技有限公司于2026年7月发布知识库项目合作公告，并推进产品交付。",
              url: "https://official.test/project",
              publish_time: "2026-07-25T09:00:00.000Z",
            }],
          };
        }
        if (input.query.includes("监管 处罚 诉讼 召回 经营异常")) {
          return {
            ok: true,
            results: [{
              title: "测试科技有限公司行政处罚整改公告",
              summary: "测试科技有限公司于2026年7月披露行政处罚整改进展，相关事项已进入整改阶段。",
              url: "https://regulator.test/risk",
              publish_time: "2026-07-24T09:00:00.000Z",
            }],
          };
        }
        return {
          ok: true,
          results: [{
            title: "测试科技有限公司企业介绍",
            summary: "测试科技有限公司提供企业软件、知识库和内容检索产品与服务。",
            url: "https://profile.test/company",
            publish_time: "2026-07-20T09:00:00.000Z",
          }],
        };
      },
    },
  });

  const company = service.data.companies.company_1;
  const collected = await service.collectDossierEvidence(company);
  const coverage = assessDossierEvidenceCoverage(company, collected);

  assert.ok(webQueries.length > 5);
  assert.ok(webQueries.length <= 9);
  assert.ok(webQueries.some((query) => query.includes("官方公告 项目 合作 投资")));
  assert.ok(webQueries.some((query) => query.includes("监管 处罚 诉讼 召回 经营异常")));
  assert.equal(coverage.recent_public, true);
  assert.equal(coverage.operations, true);
  assert.equal(coverage.risk, true);
});

test("dossier evidence collection searches a scoped brand alias for China investment companies", async () => {
  const webQueries = [];
  const service = new SalesService({
    env: envReader({ APP_WORKSPACE_ID: "workspace-test" }),
    runtimePolicy: permissiveTestPolicy,
    seed: seed(),
    dataProProvider: { isRunEnabled: () => false },
    webSearchProvider: {
      isRunEnabled: () => true,
      async search(input) {
        webQueries.push(input.query);
        return { ok: true, results: [] };
      },
    },
  });

  await service.collectDossierEvidence({
    id: "company_bosch",
    name: "博世（中国）投资有限公司",
    aliases: [],
  });

  assert.ok(webQueries.some((query) => /^博世 2026/.test(query)));
  assert.ok(webQueries.some((query) => /^博世（中国）投资有限公司 2026/.test(query)));
});

test("dossier evidence collection follows a discovered authoritative host when no usable recent event exists", async () => {
  const webQueries = [];
  const service = new SalesService({
    env: envReader({ APP_WORKSPACE_ID: "workspace-test" }),
    runtimePolicy: permissiveTestPolicy,
    seed: seed(),
    dataProProvider: { isRunEnabled: () => false },
    webSearchProvider: {
      isRunEnabled: () => true,
      async search(input) {
        webQueries.push(structuredClone(input));
        if (/^site:bosch\.com\.cn/.test(input.query)) {
          return {
            ok: true,
            results: [
              {
                title: "博世中国与合作伙伴签署智能驾驶战略合作协议",
                summary: "博世中国宣布与合作伙伴签署智能驾驶战略合作协议，双方将推进面向中国市场的量产应用。",
                url: "https://bosch.com.cn/news-and-stories/strategic-cooperation/",
                site_name: "博世",
                auth_level: 2,
                publish_time: "2026-07-20T09:00:00.000Z",
              },
              {
                title: "博世中国披露智能制造项目进展",
                summary: "博世中国披露智能制造项目进展，项目将加强本地研发、生产和供应链协同能力。",
                url: "https://bosch.com.cn/news-and-stories/manufacturing-project/",
                site_name: "博世",
                auth_level: 2,
                publish_time: "2026-07-21T09:00:00.000Z",
              },
            ],
          };
        }
        if (/^博世 2026/.test(input.query)) {
          return {
            ok: true,
            results: [{
              title: "博世在中国",
              summary: "博世在中国持续提供汽车技术、工业技术与消费品相关产品和服务。",
              url: "https://bosch.com.cn/our-company/bosch-in-china/",
              site_name: "博世",
              auth_level: 2,
            }],
          };
        }
        return { ok: true, results: [] };
      },
    },
  });

  const collected = await service.collectDossierEvidence({
    id: "company_bosch",
    name: "博世（中国）投资有限公司",
    aliases: [],
  });

  assert.ok(webQueries.every((input) => input.auth_level === 1));
  assert.ok(webQueries.some((input) => /^site:bosch\.com\.cn/.test(input.query)));
  assert.ok(collected.public_sources.some((source) => /智能驾驶战略合作/.test(source.label)));
  assert.ok(collected.public_sources.some((source) => /智能制造项目进展/.test(source.label)));
});

test("brand-scoped evidence must not be written as a confirmed legal-entity event", () => {
  const service = new SalesService({
    env: envReader({ APP_WORKSPACE_ID: "workspace-test" }),
    runtimePolicy: strictRuntimePolicy,
    seed: seed(),
  });
  const company = {
    id: "company_bosch",
    name: "博世（中国）投资有限公司",
    aliases: ["博世"],
  };
  const citations = [
    {
      id: "professional_bosch",
      label: "企业工商数据库",
      source_kind: "专业数据集",
      summary: "公司名称：博世（中国）投资有限公司；经营范围：机械制造、电子和信息产业投资。",
      entity_match: "verified",
    },
    {
      id: "public_bosch",
      label: "博世与合作伙伴签署智能驾驶战略合作协议",
      source_kind: "联网搜索",
      summary: "博世与合作伙伴签署智能驾驶战略合作协议，双方将推进面向中国市场的量产应用。",
      url: "https://bosch.com.cn/news-and-stories/strategic-cooperation/",
      entity_match: "alias_scoped",
    },
  ];
  const body = [
    { text: "企业与业务概览：博世（中国）投资有限公司从事机械制造、电子和信息产业相关投资与业务。", citation_ids: ["professional_bosch"] },
    { text: "经营与业务动态：该法定主体的专业资料显示其业务范围覆盖机械制造、电子和信息产业投资。", citation_ids: ["professional_bosch"] },
    { text: "近期公开动态：博世（中国）投资有限公司与合作伙伴签署智能驾驶战略合作协议。", citation_ids: ["public_bosch"] },
    { text: "风险与关注事项：商务推进前应核验具体签约主体、项目责任边界和量产安排。", citation_ids: ["professional_bosch"] },
    { text: "销售机会判断：智能驾驶合作形成技术与量产协同的沟通窗口，但不代表目标企业已经形成采购意向。", citation_ids: ["professional_bosch", "public_bosch"] },
    { text: "建议行动：1. 核验签约主体和项目阶段。\n2. 联系业务与采购负责人。\n3. 准备量产协同方案。", citation_ids: ["professional_bosch", "public_bosch"] },
  ];

  const errors = service.publicDossierQualityErrors({ body, citations }, company);
  assert.ok(errors.some((item) => item.includes("主体边界")));

  const corrected = structuredClone(body);
  corrected[2].text = "近期公开动态：博世集团相关业务与合作伙伴签署智能驾驶战略合作协议，具体法定签约主体仍需核验。";
  assert.deepEqual(service.publicDossierQualityErrors({ body: corrected, citations }, company), []);
});

test("dossier readability gate rejects a search-title fragment but accepts concise complete facts", () => {
  const service = new SalesService({
    env: envReader({ APP_WORKSPACE_ID: "workspace-test" }),
    runtimePolicy: permissiveTestPolicy,
    seed: seed(),
  });
  const company = service.data.companies.company_1;
  const citations = [
    {
      id: "professional_1",
      label: "企业工商数据库",
      source_kind: "专业数据集",
      summary: "测试科技有限公司主营企业软件和知识库产品。",
    },
    {
      id: "public_1",
      label: "测试科技有限公司项目中标公告",
      source_kind: "联网搜索",
      summary: "测试科技有限公司于2026年7月中标某企业知识库建设项目。",
      url: "https://official.test/win",
      published_at: "2026-07-22T09:00:00.000Z",
    },
  ];
  const body = [
    { text: "企业与业务概览：测试科技有限公司主营企业软件和知识库产品。", citation_ids: ["professional_1"] },
    { text: "经营与业务动态：该企业持续经营知识库建设和内容检索业务。", citation_ids: ["professional_1"] },
    { text: "近期公开动态：测试科技有限公司-最新中标结果发布。", citation_ids: ["public_1"] },
    { text: "风险与关注事项：项目交付需确认数据权限和验收范围。", citation_ids: ["professional_1", "public_1"] },
    { text: "销售机会判断：该项目为知识库交付形成了沟通窗口。", citation_ids: ["professional_1", "public_1"] },
    { text: "建议行动：1. 联系项目负责人。\n2. 核验交付范围。\n3. 准备验收方案。", citation_ids: ["professional_1", "public_1"] },
  ];

  const rejected = service.publicDossierQualityErrors({ body, citations }, company);
  assert.ok(rejected.some((item) => item.includes("搜索标题或事件标题残片")));

  const corrected = structuredClone(body);
  corrected[2].text = "近期公开动态：测试科技有限公司于2026年7月中标企业知识库建设项目。";
  assert.deepEqual(service.publicDossierQualityErrors({ body: corrected, citations }, company), []);

  const riskStatement = structuredClone(corrected);
  riskStatement[3].text = "风险与关注事项：项目推进前需要确认企业是否具备相应的数据权限和交付条件。";
  assert.deepEqual(service.publicDossierQualityErrors({ body: riskStatement, citations }, company), []);

  const directQuestion = structuredClone(corrected);
  directQuestion[3].text = "风险与关注事项：该企业是否具备相应的数据权限和交付条件？";
  assert.ok(
    service.publicDossierQualityErrors({ body: directQuestion, citations }, company)
      .some((item) => item.includes("问句")),
  );
});

test("dossier Agent revises an invalid six-section plan before deterministic compilation", async () => {
  const modelCalls = [];
  const modelProvider = {
    isRunEnabled: () => true,
    async callRequiredFunction(input) {
      modelCalls.push(structuredClone(input));
      if (input.operation === "sales_dossier_agent_plan") {
        const invalid = stagedDossierPlan(input);
        invalid.sections.company_overview.text = "企业产品更新公告";
        return {
          ok: true,
          parsed: invalid,
          raw_ref: "model:dossier-invalid-plan",
        };
      }
      return {
        ok: true,
        parsed: stagedDossierPlan(input),
        raw_ref: "model:dossier-repaired",
      };
    },
  };
  const service = new SalesService({
    env: envReader({ APP_WORKSPACE_ID: "workspace-test" }),
    runtimePolicy: strictRuntimePolicy,
    seed: seed(),
    modelProvider,
  });
  const evidencePack = {
    evidence_hash: "evidence-pack-test",
    items: [
      {
        id: "evidence_professional",
        label: "企业工商数据库",
        source_kind_label: "专业数据集",
        summary: "测试科技有限公司面向企业客户提供软件产品。",
        provider: "datapro",
        quality_tier: 1,
        independence_key: "datapro-company",
      },
      {
        id: "evidence_risk",
        label: "企业风险数据库",
        source_kind_label: "专业数据集",
        summary: "本次查询未发现可直接下结论的重大风险记录，仍需核验来源日期。",
        provider: "datapro",
        quality_tier: 1,
        independence_key: "datapro-risk",
      },
      {
        id: "evidence_professional_2",
        label: "金融数据库",
        source_kind_label: "专业数据集",
        summary: "测试科技有限公司持续经营企业软件和知识库产品相关业务，并推进内容检索能力升级。",
        provider: "datapro",
        quality_tier: 1,
        independence_key: "datapro-market",
      },
      {
        id: "evidence_public",
        label: "企业产品更新公告",
        source_kind_label: "联网搜索",
        summary: "测试科技有限公司近期发布了产品更新公告。",
        provider: "web_search",
        url: "https://news.test/company-update",
        quality_tier: 2,
        independence_key: "news.test",
      },
      {
        id: "evidence_public_2",
        label: "企业交付计划公告",
        source_kind_label: "联网搜索",
        summary: "测试科技有限公司近期披露产品交付计划，明确将分阶段推进知识库协作能力上线。",
        provider: "web_search",
        url: "https://official.test/company-delivery",
        quality_tier: 2,
        independence_key: "official.test",
      },
      {
        id: "evidence_internal",
        label: "客户需求确认会",
        source_kind_label: "内部资料",
        summary: "客户希望先验证知识库问答，并要求明确数据权限边界。",
        provider: "openviking",
        uri: "viking://resources/workspaces/test/companies/company_1/materials/material_1",
        quality_tier: 2,
        independence_key: "internal-material-1",
      },
    ],
  };

  const dossier = await service.generateDossierWithModel(
    service.data.companies.company_1,
    evidencePack,
    [],
  );

  assert.equal(modelCalls.length, 2);
  assert.equal(modelCalls[0].operation, "sales_dossier_agent_plan");
  assert.equal(modelCalls[0].payload.allowed_citation_ids, undefined);
  assert.equal(modelCalls[0].payload.citations, undefined);
  assert.ok(modelCalls[0].payload.evidence_by_section);
  assert.equal(
    JSON.stringify(modelCalls[0].payload.evidence_by_section).includes("evidence_internal"),
    false,
  );
  assert.equal(modelCalls[0].functionName, "plan_sales_dossier");
  assert.match(modelCalls[0].system, /最终引用全部由服务端根据 Evidence Atom 确定性派生/);
  assert.match(
    modelCalls[0].system,
    /企业与业务概览用于交代主体、主营方向、业务定位和来源能够直接支持的业务应用场景.*不得在本章写采购场景、采购需求、采购计划或采购意向/u,
  );
  assert.equal(modelCalls[0].parameters.properties.sections.required.length, 6);
  assert.deepEqual(
    Object.keys(
      modelCalls[0].parameters.properties.sections.properties.company_overview.properties,
    ),
    ["text", "evidence_ids"],
  );
  assert.equal(modelCalls[1].operation, "sales_dossier_agent_replan");
  assert.ok(modelCalls[1].payload.planning_errors.some((item) => item.includes("完整句子")));
  assert.doesNotMatch(JSON.stringify(dossier), /关键字段存在来源差异|来源冲突/);
  assert.equal(dossier.body.length, 6);
  assert.deepEqual(dossier.body[0].citation_ids, ["evidence_professional"]);
  assert.deepEqual(dossier.body[3].citation_ids, ["evidence_public_2"]);
  assert.equal(dossier.raw_ref, "model:dossier-repaired");
});

test("dossier Agent retries one incomplete planning response", async () => {
  const modelCalls = [];
  const modelProvider = {
    isRunEnabled: () => true,
    async callRequiredFunction(input) {
      modelCalls.push(structuredClone(input));
      if (modelCalls.length === 1) {
        return {
          ok: false,
          error: {
            code: "incomplete_response",
            message: "The function response reached its output budget.",
            retryable: true,
          },
          raw_ref: "model:dossier-incomplete",
        };
      }
      return {
        ok: true,
        parsed: stagedDossierPlan(input),
        usage: { prompt_tokens: 160, completion_tokens: 80, total_tokens: 240 },
        raw_ref: "model:dossier-retry",
      };
    },
  };
  const service = new SalesService({
    env: envReader({ APP_WORKSPACE_ID: "workspace-test" }),
    runtimePolicy: strictRuntimePolicy,
    seed: seed(),
    modelProvider,
  });
  const evidencePack = {
    evidence_hash: "evidence-pack-json-retry",
    items: [
      {
        id: "evidence_professional",
        label: "企业工商数据库",
        source_kind_label: "专业数据集",
        summary: "测试科技有限公司面向企业客户提供软件产品。",
        provider: "datapro",
        quality_tier: 1,
        independence_key: "datapro-company",
      },
      {
        id: "evidence_professional_2",
        label: "金融数据库",
        source_kind_label: "专业数据集",
        summary: "测试科技有限公司持续经营企业软件与知识库产品相关业务。",
        provider: "datapro",
        quality_tier: 1,
        independence_key: "datapro-market",
      },
      {
        id: "evidence_public",
        label: "企业产品更新公告",
        source_kind_label: "联网搜索",
        summary: "测试科技有限公司近期发布了产品更新公告。",
        provider: "web_search",
        url: "https://news.test/company-update",
        quality_tier: 2,
        independence_key: "news.test",
      },
      {
        id: "evidence_public_2",
        label: "企业交付计划公告",
        source_kind_label: "联网搜索",
        summary: "测试科技有限公司近期披露产品交付计划，明确分阶段推进知识库能力上线。",
        provider: "web_search",
        url: "https://official.test/company-delivery",
        quality_tier: 2,
        independence_key: "official.test",
      },
    ],
  };

  const dossier = await service.generateDossierWithModel(
    service.data.companies.company_1,
    evidencePack,
    [],
  );

  assert.equal(modelCalls.length, 2);
  assert.equal(modelCalls[0].operation, "sales_dossier_agent_plan");
  assert.equal(modelCalls[0].maxTokens, 2400);
  assert.equal(modelCalls[1].operation, "sales_dossier_agent_plan");
  assert.equal(modelCalls[1].maxTokens, 2400);
  assert.equal(dossier.body.length, 6);
  assert.equal(dossier.raw_ref, "model:dossier-retry");
});

test("dossier Agent fails closed after three incomplete planning responses", async () => {
  const modelCalls = [];
  const modelProvider = {
    isRunEnabled: () => true,
    async callRequiredFunction(input) {
      modelCalls.push(structuredClone(input));
      return {
        ok: false,
        error: {
          code: "incomplete_response",
          message: "Model returned an incomplete function call.",
          retryable: true,
        },
        raw_ref: `model:incomplete-function-${modelCalls.length}`,
      };
    },
  };
  const service = new SalesService({
    env: envReader({ APP_WORKSPACE_ID: "workspace-test" }),
    runtimePolicy: strictRuntimePolicy,
    seed: seed(),
    modelProvider,
  });
  const evidencePack = {
    evidence_hash: "evidence-pack-json-reconstruction",
    items: [
      {
        id: "evidence_company",
        label: "企业工商数据库",
        source_kind_label: "专业数据集",
        summary: "公司名称：测试科技有限公司；统一社会信用代码：TEST0001；经营范围：企业软件、知识库与内容检索产品。",
        provider: "datapro",
        quality_tier: 1,
        independence_key: "datapro-company",
      },
      {
        id: "evidence_market",
        label: "科研学术数据搜索服务",
        source_kind_label: "专业数据集",
        summary: "测试科技有限公司持续开展企业知识库、内容检索和智能协作相关技术研发。",
        provider: "datapro",
        quality_tier: 1,
        independence_key: "datapro-research",
      },
      {
        id: "evidence_product_update",
        label: "测试科技有限公司产品升级公告",
        source_kind_label: "联网搜索",
        summary: "测试科技有限公司于2026年7月发布销售知识库产品升级公告，新增内容检索和协作管理能力。",
        provider: "web_search",
        url: "https://news.test/product-update",
        published_at: "2026-07-20T09:00:00.000Z",
        quality_tier: 2,
        independence_key: "news.test",
      },
      {
        id: "evidence_procurement",
        label: "测试科技有限公司项目采购结果公告",
        source_kind_label: "联网搜索",
        summary: "公开采购结果显示测试科技有限公司参与企业知识库建设项目，项目范围包括内容治理与检索能力交付。",
        provider: "web_search",
        url: "https://procurement.test/project-result",
        published_at: "2026-07-21T09:00:00.000Z",
        quality_tier: 2,
        independence_key: "procurement.test",
      },
    ],
  };

  await assert.rejects(
    () => service.generateDossierWithModel(
      service.data.companies.company_1,
      evidencePack,
      [],
    ),
    (error) => (
      error.status === 503
      && error.code === "model_unavailable"
      && error.details.reason === "incomplete_response"
    ),
  );

  assert.equal(modelCalls.length, 3);
  assert.equal(modelCalls[0].operation, "sales_dossier_agent_plan");
  assert.equal(modelCalls[1].operation, "sales_dossier_agent_plan");
  assert.equal(modelCalls[2].operation, "sales_dossier_agent_plan");
});

test("QA derives paragraph citations from allowed evidence and records model usage", async () => {
  const fixture = createWorkflowService();
  await fixture.service.createDossier("company_1");
  const result = await fixture.service.askQuestion("company_1", { question: "客户最关注什么，下一步怎么推进？" });

  assert.ok(result.job_id);
  assert.ok(result.provider_run_id);
  assert.equal(result.message.paragraphs.length, 2);
  assert.equal(result.message.citations.length, 2);
  assert.ok(result.message.paragraphs.every((paragraph) => paragraph.citation_ids.length > 0));
  assert.ok(result.message.citation_ids.every((id) => result.message.citations.some((citation) => citation.id === id)));
  const qaCall = fixture.modelCalls.find((call) => call.operation === "sales_qa");
  assert.deepEqual(
    [...new Set(qaCall.payload.evidence.map((item) => item.source_kind))].sort(),
    ["企业档案", "云文档"].sort(),
  );
  const materialEvidence = qaCall.payload.evidence.find((item) => item.source_kind === "云文档");
  assert.equal(materialEvidence.label, "客户需求确认会");
  assert.doesNotMatch(JSON.stringify(qaCall.payload.evidence), /overview|company_dp_should_not_be_visible/i);
  assert.match(qaCall.system, /正式展示标题/);
  assert.match(qaCall.system, /不得输出 evidence\.uri/);
  assert.match(qaCall.system, /不得自行增加“补充”/);

  const run = await fixture.service.getProviderRun(result.provider_run_id);
  const modelStep = run.steps.find((step) => step.provider === "model");
  assert.equal(run.job_id, result.job_id);
  assert.equal(modelStep.usage.total_tokens, 180);
  assert.equal((await fixture.service.getJob(result.job_id)).status, "succeeded");
});

test("QA hydrates the full OpenViking resource before chunking and reranking", async () => {
  const fixture = createWorkflowService();
  fixture.service.openVikingProvider.readTextResource = async () => ({
    ok: true,
    content: [
      `${"一般会议背景。".repeat(180)}\n\n预算窗口：客户计划在第四季度确认预算，首批试点覆盖两个业务部门。`,
      "<!-- sales-workbench-material-v1:eyJ0ZXh0IjoicHJpdmF0ZS1zeW5jLXNuYXBzaG90In0= -->",
    ].join("\n"),
  });
  await fixture.service.createDossier("company_1");
  await fixture.service.askQuestion("company_1", { question: "客户的预算窗口和试点范围是什么？" });

  const qaCall = fixture.modelCalls.find((call) => call.operation === "sales_qa");
  assert.ok(qaCall.payload.evidence.some((item) => (
    item.source_kind === "云文档"
    && item.summary.includes("第四季度确认预算")
    && item.summary.includes("两个业务部门")
  )));
  assert.doesNotMatch(JSON.stringify(qaCall.payload.evidence), /sales-workbench-material-v1|cHJpdmF0ZS1zeW5jLXNuYXBzaG90/);
  assert.ok(qaCall.payload.retrieval_plan.answerability.supported);
});

test("QA sends bounded prior turns to the model for follow-up questions", async () => {
  const fixture = createWorkflowService();
  await fixture.service.createDossier("company_1");
  await fixture.service.askQuestion("company_1", { question: "客户最关注什么？" });
  await fixture.service.askQuestion("company_1", { question: "那下一步怎么推进？" });

  const qaCalls = fixture.modelCalls.filter((call) => call.operation === "sales_qa");
  assert.equal(qaCalls.length, 2);
  assert.deepEqual(
    qaCalls[0].payload.conversation_history,
    [],
  );
  assert.equal(qaCalls[1].payload.question, "那下一步怎么推进？");
  assert.equal(qaCalls[1].payload.conversation_history.length, 2);
  assert.equal(qaCalls[1].payload.conversation_history[0].role, "user");
  assert.equal(qaCalls[1].payload.conversation_history[0].text, "客户最关注什么？");
  assert.equal(qaCalls[1].payload.conversation_history[1].role, "assistant");
  assert.match(qaCalls[1].payload.conversation_history[1].text, /知识库产品|数据权限边界/);
  assert.equal(
    qaCalls[1].payload.conversation_history.some((message) => message.text === "那下一步怎么推进？"),
    false,
  );
});

test("QA restores recent turns and citations from OpenViking after a process restart", async () => {
  const sharedSessionMessages = new Map();
  const firstRuntime = createWorkflowService({ sharedSessionMessages });
  await firstRuntime.service.createDossier("company_1");
  await firstRuntime.service.askQuestion("company_1", { question: "客户最关注什么？" });

  const persistedSeed = structuredClone(firstRuntime.service.data);
  persistedSeed.qa_messages = { company_1: [] };
  const restartedRuntime = createWorkflowService({
    sharedSessionMessages,
    seedData: persistedSeed,
  });

  const restored = await restartedRuntime.service.getQa("company_1");
  assert.equal(restored.messages.length, 2);
  assert.equal(restored.messages[0].role, "user");
  assert.equal(restored.messages[0].text, "客户最关注什么？");
  assert.equal(restored.messages[1].role, "assistant");
  assert.equal(restored.messages[1].citations.length, 2);

  await restartedRuntime.service.askQuestion("company_1", { question: "那下一步怎么推进？" });
  const qaCall = restartedRuntime.modelCalls.find((call) => call.operation === "sales_qa");
  assert.equal(qaCall.payload.conversation_history.length, 2);
  assert.equal(qaCall.payload.conversation_history[0].text, "客户最关注什么？");
  assert.match(qaCall.payload.conversation_history[1].text, /知识库产品|数据权限边界/);
});

test("QA hides legacy dossier-memory answers and excludes them from follow-up context", async () => {
  const fixture = createWorkflowService();
  fixture.service.data.qa_messages.company_1.push(
    {
      id: "qa_user_legacy",
      role: "user",
      text: "旧问题",
      created_at: "2026-07-19T08:00:00.000Z",
    },
    {
      id: "qa_assistant_legacy",
      role: "assistant",
      text: "旧版回答",
      citations: [{
        id: "legacy_dossier_memory",
        source_kind: "内部资料",
        label: "旧档案记忆",
        uri: "viking://resources/workspaces/test/companies/company_1/dossiers/legacy.md",
      }],
      citation_ids: ["legacy_dossier_memory"],
      created_at: "2026-07-19T08:01:00.000Z",
    },
  );

  assert.deepEqual((await fixture.service.getQa("company_1")).messages, []);

  await fixture.service.createDossier("company_1");
  await fixture.service.askQuestion("company_1", { question: "当前重点是什么？" });
  const qaCall = fixture.modelCalls.find((call) => call.operation === "sales_qa");
  assert.deepEqual(qaCall.payload.conversation_history, []);
  assert.equal((await fixture.service.getQa("company_1")).messages.length, 2);
});

test("business responses do not expose OpenViking or provider raw references", async () => {
  const fixture = createWorkflowService();
  const dossier = await fixture.service.createDossier("company_1");
  const qa = await fixture.service.askQuestion("company_1", { question: "客户最关注什么？" });
  const materials = fixture.service.listMaterials("company_1");

  const publicPayload = JSON.stringify({ dossier: dossier.detail, qa: qa.message, materials });
  assert.doesNotMatch(publicPayload, /viking:\/\//i);
  assert.doesNotMatch(publicPayload, /model:/i);
  assert.equal(Object.hasOwn(materials[0], "openviking_uri"), false);
  assert.equal(materials[0].memory_ready, true);
  assert.equal(Object.hasOwn(dossier.detail, "raw_ref"), false);
  assert.equal(Object.hasOwn(dossier.detail, "evidence_pack"), false);
  assert.equal(Object.hasOwn(dossier.detail, "provider_run_id"), false);
  assert.equal(Object.hasOwn(dossier.detail, "memory_summary"), false);
});

test("QA public view hides legacy internal paths and resource identifiers", () => {
  const fixture = createWorkflowService();
  const publicMessage = fixture.service.publicQaMessage({
    id: "qa_internal_leak",
    role: "assistant",
    text: "资料位于 company_dp_1234567890 的 /materials/private 目录。",
    paragraphs: [{
      text: "OpenViking URI 是 viking://resources/private/materials/one。",
      citation_ids: [],
    }],
    citations: [],
    citation_ids: [],
  });

  assert.match(publicMessage.text, /已隐藏/);
  assert.match(publicMessage.paragraphs[0].text, /已隐藏/);
  assert.doesNotMatch(JSON.stringify(publicMessage), /company_dp_|\/materials\/|viking:\/\//i);
});

test("QA public view merges retrieval chunks from the same Feishu material", () => {
  const fixture = createWorkflowService();
  const publicMessage = fixture.service.publicQaMessage({
    id: "qa_duplicate_material_chunks",
    role: "assistant",
    text: "会议纪要显示当前仍处于方案验证阶段。",
    paragraphs: [
      {
        text: "客户首先关注数据权限边界。",
        citation_ids: ["chunk_1", "chunk_2"],
      },
      {
        text: "下一步需要确认试点范围和负责人。",
        citation_ids: ["chunk_3", "chunk_4"],
      },
    ],
    citations: [1, 2, 3, 4].map((index) => ({
      id: `chunk_${index}`,
      material_id: "material_1",
      source_kind: "飞书云文档",
      label: "客户需求确认会",
      uri: `viking://resources/workspace-test/companies/company_1/materials/material_1/chunks/${index}`,
    })),
    citation_ids: ["chunk_1", "chunk_2", "chunk_3", "chunk_4"],
  });

  assert.equal(publicMessage.citations.length, 1);
  assert.deepEqual(publicMessage.citation_ids, ["1"]);
  assert.deepEqual(publicMessage.paragraphs[0].citation_ids, ["1"]);
  assert.deepEqual(publicMessage.paragraphs[1].citation_ids, ["1"]);
  assert.equal(publicMessage.citations[0].label, "客户需求确认会");
});

test("QA public view keeps different dossier sections as separate verifiable citations", () => {
  const fixture = createWorkflowService();
  const publicMessage = fixture.service.publicQaMessage({
    id: "qa_dossier_sections",
    role: "assistant",
    text: "近期动态与风险分别有对应档案章节。",
    paragraphs: [{
      text: "近期动态如下。",
      citation_ids: ["recent_section"],
    }, {
      text: "风险与关注事项如下。",
      citation_ids: ["risk_section"],
    }],
    citations: [{
      id: "recent_section",
      source_kind: "企业档案",
      label: "测试企业 销售情报报告 V2 · 近期公开动态",
    }, {
      id: "risk_section",
      source_kind: "企业档案",
      label: "测试企业 销售情报报告 V2 · 风险与关注事项",
    }],
    citation_ids: ["recent_section", "risk_section"],
  });

  assert.equal(publicMessage.citations.length, 2);
  assert.deepEqual(publicMessage.paragraphs[0].citation_ids, ["1"]);
  assert.deepEqual(publicMessage.paragraphs[1].citation_ids, ["2"]);
  assert.match(publicMessage.citations[0].label, /近期公开动态/u);
  assert.match(publicMessage.citations[1].label, /风险与关注事项/u);
});

test("QA removes legacy answers that only cite generic internal materials", async () => {
  const fixture = createWorkflowService();
  fixture.service.data.qa_messages.company_1.push(
    {
      id: "qa_user_generic_internal",
      role: "user",
      text: "旧版资料标题是什么？",
      created_at: "2026-07-19T09:00:00.000Z",
    },
    {
      id: "qa_assistant_generic_internal",
      role: "assistant",
      text: "这是旧版本根据正文推测出的标题。",
      citations: [{
        id: "material_1",
        source_kind: "内部资料",
        label: "内部资料",
        uri: "viking://resources/workspace-test/companies/company_1/materials/material_1.md",
      }],
      citation_ids: ["material_1"],
      created_at: "2026-07-19T09:01:00.000Z",
    },
  );

  assert.deepEqual((await fixture.service.getQa("company_1")).messages, []);

  await fixture.service.createDossier("company_1");
  await fixture.service.askQuestion("company_1", { question: "请使用正式标题回答。" });
  const qaCall = fixture.modelCalls.find((call) => call.operation === "sales_qa");
  assert.deepEqual(qaCall.payload.conversation_history, []);
});

test("legacy four-section dossiers are hidden instead of being synthesized into a formal report", () => {
  const fixture = createWorkflowService();
  const publicDossier = fixture.service.publicDossier({
    id: "legacy_dossier_1",
    company_id: "company_1",
    title: "测试科技有限公司最近档案",
    summary: "企业资料已更新。",
    version_no: 1,
    body: [
      {
        text: "企业情况：企业ID(关联主键):254716 | 企业ID(关联主键):58059066。",
        citation_ids: ["professional_1"],
      },
      {
        text: "近期动态：企业近期发布产品更新公告。",
        citation_ids: ["public_1"],
      },
      {
        text: "销售判断：可继续跟进。",
        citation_ids: ["professional_1", "public_1"],
      },
      {
        text: "下一步建议：确认业务场景。",
        citation_ids: ["public_1"],
      },
    ],
    citations: [
      {
        id: "professional_1",
        label: "企业工商数据库",
        source_kind: "专业数据集",
        summary: "公司名称:测试科技有限公司;经营范围:企业软件与知识库产品。",
        conflict_fields: ["registered_capital"],
      },
      {
        id: "public_1",
        label: "测试科技有限公司产品更新公告",
        source_kind: "联网搜索",
        summary: "测试科技有限公司近期发布产品更新公告。",
        url: "https://news.test/company-update",
      },
    ],
  });

  assert.equal(publicDossier.title, "测试科技有限公司 销售情报报告");
  assert.deepEqual(publicDossier.body, []);
  assert.deepEqual(publicDossier.citations, []);
  assert.equal(publicDossier.summary, "");
  assert.doesNotMatch(JSON.stringify(publicDossier), /企业ID|关联主键|内部资料|OpenViking/i);
  assert.doesNotMatch(JSON.stringify(publicDossier), /关键字段存在来源差异|conflict_label/i);
});

test("public dossiers with retrieval diagnostics are rejected instead of template-rewritten", () => {
  const fixture = createWorkflowService();
  const publicDossier = fixture.service.publicDossier({
    id: "diagnostic_dossier_1",
    company_id: "company_1",
    title: "测试科技有限公司销售情报报告",
    summary: "企业近期发布了产品更新公告。",
    body: [
      { text: "企业与业务概览：该企业经营范围包括企业软件、知识库建设和内容检索服务。", citation_ids: ["professional_1"] },
      { text: "经营与业务动态：本次未检索到可核验的经营变化，专业数据仅覆盖工商注册记录。", citation_ids: ["professional_1", "public_1"] },
      { text: "近期公开动态：企业于2026年7月发布产品更新公告，新增销售知识库协作功能。", citation_ids: ["public_1"] },
      { text: "风险与关注事项：资料缺口包括供应链交付明细，多个公开来源的经营数字口径冲突，因此不作为确定事实。", citation_ids: ["professional_1", "risk_public_1"] },
      { text: "销售机会判断：产品更新为销售知识库问答和协作检索试点提供了明确切入场景。", citation_ids: ["professional_1", "public_1"] },
      { text: "建议行动：1. 联系销售运营负责人。\n2. 核实知识库范围。\n3. 准备试点方案。", citation_ids: ["professional_1", "public_1"] },
    ],
    citations: [
      {
        id: "professional_1",
        label: "企业工商数据库",
        source_kind: "专业数据集",
        summary: "测试科技有限公司经营范围包括企业软件、知识库建设和内容检索服务。",
        conflict_fields: ["revenue"],
      },
      {
        id: "public_1",
        label: "测试科技有限公司产品更新公告",
        source_kind: "联网搜索",
        summary: "企业于2026年7月发布产品更新公告，新增销售知识库协作功能。",
        url: "https://news.test/company-update",
      },
      {
        id: "risk_public_1",
        label: "测试科技有限公司供应链交付公告",
        source_kind: "联网搜索",
        summary: "企业公告披露部分核心组件交付周期延长，可能影响重点项目的实施排期。",
        url: "https://news.test/company-risk",
      },
    ],
  });

  const serialized = JSON.stringify(publicDossier);
  assert.equal(publicDossier.body.length, 0);
  assert.equal(publicDossier.summary, "");
  assert.equal(publicDossier.citations.length, 0);
  assert.doesNotMatch(
    serialized,
    /本次未检索到|资料缺口|关键字段存在来源差异|来源冲突|口径冲突|不作为确定事实|conflict_label/i,
  );
});

test("public dossier summary is rebuilt only from visible citation-backed sections", () => {
  const { service } = createWorkflowService();
  const longOpportunityDetail = "后续沟通仍需依次确认知识库覆盖范围、数据权限边界、部署方式、接口责任、项目排期、验收标准、运维安排、采购主体、预算审批路径、合同责任、业务牵头部门、技术评审角色、信息安全要求、试点成功标准、扩容触发条件、服务响应边界和最终决策链，在这些事项得到对方明确回复以前，不能把公开产品动作写成已经成立的采购需求、预算计划、签约安排或交付承诺。";
  const trailingOpportunityDetail = "书面确认记录还应覆盖试点负责人、双方沟通节奏、需求变更方式、交付依赖条件和最终验收责任，再据此决定是否继续投入售前资源。";
  const overflowOpportunityDetail = "最终复盘清单需要明确记录已经核验的事实、仍待确认的问题和下一次沟通的负责人。";
  const view = service.publicDossier({
    id: "dossier_grounded_summary",
    company_id: "company_1",
    title: "测试科技有限公司销售情报报告",
    summary: "未经正文和最终引用支撑的合作、诉讼与展会结论。",
    version_no: 1,
    created_at: "2026-07-25T10:00:00.000Z",
    body: [
      { text: "企业与业务概览：测试科技有限公司面向企业客户提供软件与知识库产品。", citation_ids: ["p1"] },
      { text: "经营与业务动态：专业数据反映该企业持续推进内容检索与协作管理能力。", citation_ids: ["p2"] },
      { text: "近期公开动态：测试科技有限公司于2026年7月发布知识库产品升级公告。", citation_ids: ["w1"] },
      { text: "风险与关注事项：项目推进需在商务报价前确认数据权限、合同责任和交付排期。", citation_ids: ["p1", "w2"] },
      { text: `销售机会判断：产品升级形成试点窗口，但不代表企业已经形成采购意向。${longOpportunityDetail}${trailingOpportunityDetail}${overflowOpportunityDetail}`, citation_ids: ["p2", "w1"] },
      { text: "建议行动：1. 联系产品负责人核验范围。\n2. 确认数据权限边界。\n3. 准备试点方案。", citation_ids: ["p1", "w2"] },
    ],
    citations: [
      {
        id: "p1",
        label: "企业工商数据库",
        source_kind: "专业数据集",
        summary: "测试科技有限公司经营范围包括企业软件与知识库产品。",
        independence_key: "datapro-business",
      },
      {
        id: "p2",
        label: "金融数据库",
        source_kind: "专业数据集",
        summary: "测试科技有限公司持续推进内容检索与协作管理相关业务。",
        independence_key: "datapro-market",
      },
      {
        id: "w1",
        label: "测试科技有限公司发布知识库产品升级公告",
        source_kind: "联网搜索",
        summary: "测试科技有限公司持续提供企业软件服务。测试科技有限公司于2026年7月发布知识库产品升级公告。",
        url: "https://news.test/company-update",
        independence_key: "news.test",
      },
      {
        id: "w2",
        label: "测试科技有限公司披露产品交付安排",
        source_kind: "联网搜索",
        summary: "测试科技有限公司披露知识库产品的分阶段交付安排。",
        url: "https://official.test/company-delivery",
        independence_key: "official.test",
      },
    ],
  });

  assert.doesNotMatch(view.summary, /未经正文|诉讼|展会/);
  assert.match(view.summary, /知识库产品升级公告/);
  assert.match(view.summary, /试点窗口/);
  assert.ok(view.summary.length <= 300);
  assert.match(view.summary, /[。！？]$/u);
  assert.doesNotMatch(view.summary, /最终复盘清单/);
  assert.equal(view.body.length, 6);
  assert.match(
    view.citations.find((item) => item.label.includes("知识库产品升级公告"))?.summary || "",
    /持续提供企业软件服务.*发布知识库产品升级公告/u,
  );
});

test("public dossier keeps bounded source detail needed to verify late evidence spans", () => {
  const service = new SalesService({
    env: envReader({ APP_WORKSPACE_ID: "workspace-test" }),
    runtimePolicy: strictRuntimePolicy,
    seed: seed(),
  });
  const longAction = "销售人员应联系产品负责人，依次确认内容检索场景、知识库覆盖范围、数据权限边界、部署方式、接口责任、试点排期、验收标准、运维安排、采购主体、预算审批路径、合同责任、业务牵头部门、技术评审角色、信息安全要求、试点成功标准、扩容触发条件、服务响应边界、故障升级路径、双方沟通节奏、需求变更方式、交付依赖条件、数据迁移范围、旧系统衔接方案、最终验收责任和最终决策链，再据此准备与已确认范围一致的试点方案。书面确认记录还应覆盖试点负责人、双方沟通节奏、需求变更方式、交付依赖条件和最终验收责任，再决定是否继续投入售前资源。最终复盘清单需要明确记录已经核验的事实、仍待确认的问题、下一次沟通的负责人和对应截止时间。";
  assert.ok(longAction.length > 260);
  const claims = [
    "测试科技有限公司的登记经营范围包括企业软件与知识库产品。",
    "测试科技有限公司持续开展内容检索能力研发。",
    "测试科技有限公司发布知识库产品升级公告。",
    "测试科技有限公司的项目交付排期需要持续核验。",
    "现有产品升级动作显示可从内容检索场景切入销售沟通。",
    longAction,
  ];
  const sectionTitles = [
    "企业与业务概览",
    "经营与业务动态",
    "近期公开动态",
    "风险与关注事项",
    "销售机会判断",
    "建议行动",
  ];
  const sourceSummary = [
    "公司名称：测试科技有限公司；统一社会信用代码：TEST0001；经营范围：企业软件、知识库与内容检索产品。",
    "业务资料说明。".repeat(140),
    ...claims,
  ].join(" ");
  const body = sectionTitles.map((title, index) => ({
    text: `${title}：${claims[index]}`,
    citation_ids: ["long-professional-source"],
    segments: [{
      text: claims[index],
      citation_ids: ["long-professional-source"],
    }],
  }));

  const publicView = service.publicDossier({
    id: "dossier-long-professional-source",
    company_id: "company_1",
    title: "测试科技有限公司 销售情报报告",
    summary: claims[2],
    body,
    citations: [{
      id: "long-professional-source",
      label: "企业工商数据库",
      source_kind: "专业数据集",
      summary: sourceSummary,
      entity_match: "verified",
      quality_tier: 1,
      independence_key: "internal:long-professional-source",
    }],
    created_at: "2026-08-03T00:00:00.000Z",
  });

  assert.equal(publicView.body.length, 6);
  assert.equal(publicView.citations.length, 1);
  assert.match(publicView.body[5].text, /信息安全要求.*最终决策链.*试点方案/u);
  assert.match(publicView.citations[0].summary, /销售人员应联系产品负责人/);
  assert.equal(
    Object.prototype.propertyIsEnumerable.call(publicView, "_validation_citations"),
    false,
  );
  assert.doesNotMatch(JSON.stringify(publicView), /internal:long-professional-source/u);
  assert.deepEqual(service.publicDossierQualityErrors(
    publicView,
    service.data.companies.company_1,
  ), []);

  const overreachingBody = body.map((item, index) => (index === 3 ? {
    ...item,
    text: "风险与关注事项：某个公开项目金额为87.6392万元，说明其订单结构以中小额分散采购为主。",
    segments: [{
      text: "某个公开项目金额为87.6392万元，说明其订单结构以中小额分散采购为主。",
      citation_ids: ["long-professional-source"],
    }],
  } : item));
  assert.ok(service.publicDossierQualityErrors({
    ...publicView,
    body: overreachingBody,
  }, service.data.companies.company_1).includes(
    "风险与关注事项不能把个别项目或单条公开信息外推为企业整体结构性结论",
  ));
});

test("company identity fields stay bound to the exact business registry entity", () => {
  const service = new SalesService({
    env: envReader({ APP_WORKSPACE_ID: "workspace-test" }),
    runtimePolicy: strictRuntimePolicy,
    seed: seed(),
  });
  const company = service.data.companies.company_1;
  const sectionTitles = [
    "企业与业务概览",
    "经营与业务动态",
    "近期公开动态",
    "风险与关注事项",
    "销售机会判断",
    "建议行动",
  ];
  const citations = [
    {
      id: "target-registry",
      label: "企业工商数据库 · 记录 1",
      source_kind: "专业数据集",
      summary: "公司名称:测试科技有限公司;统一社会信用代码:TEST0001;注册号:110108028740260;注册地址:北京市海淀区测试路4号;成立日期:2020-05-11T08:00:00;经营范围:企业软件与知识库产品。",
    },
    {
      id: "branch-registry",
      label: "企业工商数据库 · 记录 2",
      source_kind: "专业数据集",
      summary: "公司名称:测试科技有限公司山东分公司;统一社会信用代码:TEST0002;注册号:370102300099154;注册地址:山东省青岛市测试路168号;成立日期:2021-05-17T08:00:00;经营范围:企业软件服务。",
    },
  ];
  const completeBody = [
    "测试科技有限公司成立于2021年5月17日，注册地址为北京市海淀区测试路4号。",
    "测试科技有限公司经营企业软件与知识库产品。",
    "测试科技有限公司持续提供企业软件服务。",
    "测试科技有限公司的项目范围和交付责任需要在商务沟通中核验。",
    "测试科技有限公司的企业软件业务可作为销售沟通的应用场景。",
    "销售人员应联系业务负责人确认企业软件服务范围。",
  ].map((text, index) => ({
    text: `${sectionTitles[index]}：${text}`,
    citation_ids: index === 0 ? ["target-registry", "branch-registry"] : ["target-registry"],
    segments: [{
      text,
      citation_ids: index === 0 ? ["target-registry", "branch-registry"] : ["target-registry"],
    }],
  }));

  const invalidErrors = service.publicDossierQualityErrors({
    company_id: company.id,
    summary: completeBody[2].text,
    body: completeBody,
    citations,
  }, company);
  assert.ok(invalidErrors.some((error) => (
    error.includes("日期 2021-05-17")
    && error.includes("测试科技有限公司")
    && error.includes("对应工商记录不支持该归属")
  )));

  const correctlyScopedBody = structuredClone(completeBody);
  correctlyScopedBody[0] = {
    text: "企业与业务概览：测试科技有限公司成立于2020年5月11日。测试科技有限公司山东分公司成立于2021年5月17日。",
    citation_ids: ["target-registry", "branch-registry"],
    segments: [{
      text: "测试科技有限公司成立于2020年5月11日。测试科技有限公司山东分公司成立于2021年5月17日。",
      citation_ids: ["target-registry", "branch-registry"],
    }],
  };
  const scopedErrors = service.publicDossierQualityErrors({
    company_id: company.id,
    summary: correctlyScopedBody[2].text,
    body: correctlyScopedBody,
    citations,
  }, company);
  assert.equal(
    scopedErrors.some((error) => error.includes("对应工商记录不支持该归属")),
    false,
    JSON.stringify(scopedErrors),
  );

  const uncitedBranchBody = structuredClone(correctlyScopedBody);
  uncitedBranchBody[0].citation_ids = ["target-registry"];
  uncitedBranchBody[0].segments[0].citation_ids = ["target-registry"];
  const uncitedBranchErrors = service.publicDossierQualityErrors({
    company_id: company.id,
    summary: uncitedBranchBody[2].text,
    body: uncitedBranchBody,
    citations,
  }, company);
  assert.ok(uncitedBranchErrors.some((error) => (
    error.includes("测试科技有限公司山东分公司")
    && error.includes("没有引用该分支机构自己的工商记录")
  )));

  const trajectoryBody = structuredClone(completeBody);
  trajectoryBody[1].text = "经营与业务动态：少量项目显示其业务已从单一软件服务扩展到综合知识库能力供给。";
  trajectoryBody[1].segments[0].text = "少量项目显示其业务已从单一软件服务扩展到综合知识库能力供给。";
  assert.ok(service.publicDossierQualityErrors({
    company_id: company.id,
    summary: trajectoryBody[2].text,
    body: trajectoryBody,
    citations,
  }, company).includes("企业概览或经营动态不能把静态经营范围或少量项目外推为业务转型或能力扩展"));

  const inferredExpansionBody = structuredClone(completeBody);
  inferredExpansionBody[1].text = "经营与业务动态：公司的业务布局延伸至能源管理和数据中心基础设施。";
  inferredExpansionBody[1].segments[0].text = "公司的业务布局延伸至能源管理和数据中心基础设施。";
  assert.ok(service.publicDossierQualityErrors({
    company_id: company.id,
    summary: inferredExpansionBody[2].text,
    body: inferredExpansionBody,
    citations,
  }, company).includes("企业概览或经营动态不能把静态经营范围或少量项目外推为业务转型或能力扩展"));

  const overviewExpansionBody = structuredClone(completeBody);
  overviewExpansionBody[0].text = "企业与业务概览：该企业的登记业务布局延伸至知识库产品。";
  overviewExpansionBody[0].segments[0].text = "该企业的登记业务布局延伸至知识库产品。";
  assert.ok(service.publicDossierQualityErrors({
    company_id: company.id,
    summary: overviewExpansionBody[2].text,
    body: overviewExpansionBody,
    citations,
  }, company).includes("企业概览或经营动态不能把静态经营范围或少量项目外推为业务转型或能力扩展"));

  const registryPositionBody = structuredClone(completeBody);
  registryPositionBody[0] = {
    text: "企业与业务概览：登记范围包括企业软件与知识库产品，形成软件与知识管理并行的业务定位。",
    citation_ids: ["target-registry"],
    segments: [{
      text: "登记范围包括企业软件与知识库产品，形成软件与知识管理并行的业务定位。",
      citation_ids: ["target-registry"],
    }],
  };
  assert.ok(service.publicDossierQualityErrors({
    company_id: company.id,
    summary: registryPositionBody[2].text,
    body: registryPositionBody,
    citations,
  }, company).includes("企业与业务概览只能把工商信息表述为登记范围，不能提升为实际主营、制造主体或现实业务定位"));

  const registryOpportunityBody = structuredClone(completeBody);
  registryOpportunityBody[4] = {
    text: "销售机会判断：该主体同时承担企业软件与知识库产品业务，可从相关场景切入。",
    citation_ids: ["target-registry"],
    segments: [{
      text: "该主体同时承担企业软件与知识库产品业务，可从相关场景切入。",
      citation_ids: ["target-registry"],
    }],
  };
  assert.ok(service.publicDossierQualityErrors({
    company_id: company.id,
    summary: registryOpportunityBody[2].text,
    body: registryOpportunityBody,
    citations,
  }, company).includes("销售机会判断可以把登记范围作为对接方向，但不能写成企业已承担该业务或已具备现实能力"));

  const demandBody = structuredClone(completeBody);
  demandBody[2].text = "近期公开动态：近期项目节奏说明其配套采购需求正处于活跃期。";
  demandBody[2].segments[0].text = "近期项目节奏说明其配套采购需求正处于活跃期。";
  assert.ok(service.publicDossierQualityErrors({
    company_id: company.id,
    summary: demandBody[2].text,
    body: demandBody,
    citations,
  }, company).includes("近期公开动态不能把中标或公告节奏写成来源未披露的采购需求或采购意向"));
});

test("registry rows stay entity-scoped even when a specialized DataPro query mislabels them", () => {
  const service = new SalesService({
    env: envReader({ APP_WORKSPACE_ID: "workspace-test" }),
    runtimePolicy: strictRuntimePolicy,
    seed: seed(),
  });
  const company = service.data.companies.company_1;
  const citations = [
    {
      id: "target-registry",
      label: "企业工商数据库 · 记录 1",
      source_kind: "专业数据集",
      summary: "公司名称:测试科技有限公司;统一社会信用代码:TEST0001;注册地址:北京市海淀区测试路4号;经营范围:企业软件与知识库产品。",
    },
    {
      id: "mislabeled-branch-registry",
      label: "科研学术数据搜索服务 · 记录 2",
      source_kind: "专业数据集",
      summary: "公司名称:测试科技有限公司山东分公司;统一社会信用代码:TEST0002;注册地址:山东省青岛市测试路168号;经营范围:企业软件服务。",
    },
    {
      id: "public-event",
      label: "测试科技有限公司产品升级公告",
      source_kind: "联网搜索",
      summary: "2026年7月，测试科技有限公司发布企业知识库产品升级公告。",
      url: "https://test-company.test/news/product-update",
      published_at: "2026-07-20T09:00:00.000Z",
    },
  ];
  const body = [
    ["企业与业务概览：测试科技有限公司登记经营范围包括企业软件与知识库产品。", ["target-registry"]],
    ["经营与业务动态：测试科技有限公司登记业务覆盖企业软件服务。", ["mislabeled-branch-registry"]],
    ["近期公开动态：2026年7月，测试科技有限公司发布企业知识库产品升级公告。", ["public-event"]],
    ["风险与关注事项：对接前应核验产品升级的实施范围。", ["public-event"]],
    ["销售机会判断：产品升级可作为销售沟通的切入场景，但不代表已经形成采购意向。", ["public-event"]],
    ["建议行动：联系产品负责人核验升级范围并准备能力说明材料。", ["public-event"]],
  ].map(([text, citationIds]) => ({
    text,
    citation_ids: citationIds,
    segments: [{ text: text.replace(/^[^：]+：/u, ""), citation_ids: citationIds }],
  }));

  const invalidErrors = service.publicDossierQualityErrors({
    company_id: company.id,
    summary: body[2].text,
    body,
    citations,
  }, company);
  assert.ok(invalidErrors.some((error) => (
    error.includes("经营与业务动态")
    && error.includes("测试科技有限公司山东分公司")
    && error.includes("其他主体工商记录")
  )), JSON.stringify(invalidErrors));
  assert.equal(
    invalidErrors.includes("经营与业务动态必须优先引用语义匹配的专业数据库"),
    false,
    JSON.stringify(invalidErrors),
  );

  const explicitlyScopedBody = structuredClone(body);
  explicitlyScopedBody[1].text = "经营与业务动态：测试科技有限公司山东分公司登记经营范围包括企业软件服务。";
  explicitlyScopedBody[1].segments[0].text = "测试科技有限公司山东分公司登记经营范围包括企业软件服务。";
  const scopedErrors = service.publicDossierQualityErrors({
    company_id: company.id,
    summary: explicitlyScopedBody[2].text,
    body: explicitlyScopedBody,
    citations,
  }, company);
  assert.equal(
    scopedErrors.some((error) => error.includes("测试科技有限公司山东分公司")),
    false,
    JSON.stringify(scopedErrors),
  );

  const overreachingRegistryBody = structuredClone(body);
  overreachingRegistryBody[1] = {
    text: "经营与业务动态：公司业务动作聚焦于企业软件服务，构成独立产品线，并具备直接开展跨境业务的经营条件。",
    citation_ids: ["target-registry"],
    segments: [{
      text: "公司业务动作聚焦于企业软件服务，构成独立产品线，并具备直接开展跨境业务的经营条件。",
      citation_ids: ["target-registry"],
    }],
  };
  const overreachingErrors = service.publicDossierQualityErrors({
    company_id: company.id,
    summary: overreachingRegistryBody[2].text,
    body: overreachingRegistryBody,
    citations,
  }, company);
  assert.ok(overreachingErrors.includes(
    "经营与业务动态不能把静态工商登记范围提升为当前业务动作、独立产品线或现实经营能力",
  ));
});

test("dossier Agent normalizes duplicate registry rows and excludes non-target entities", async () => {
  const modelCalls = [];
  const service = new SalesService({
    env: envReader({ APP_WORKSPACE_ID: "workspace-test" }),
    runtimePolicy: permissiveTestPolicy,
    seed: seed(),
    modelProvider: {
      isRunEnabled: () => true,
      async callRequiredFunction(input) {
        modelCalls.push(structuredClone(input));
        return {
          ok: false,
          error: { code: "test_stop", message: "context captured", retryable: false },
        };
      },
    },
  });
  await service.generateDossierWithModel(service.data.companies.company_1, {
    evidence_hash: "mismatched-registry-dataset",
    items: [
      {
        id: "target-registry",
        label: "企业工商数据库 · 记录 1",
        source_kind_label: "专业数据集",
        summary: "公司名称:测试科技有限公司;统一社会信用代码:TEST0001;经营范围:企业软件与知识库产品。",
        provider: "datapro",
        quality_tier: 1,
        independence_key: "datapro-target-registry",
      },
      {
        id: "mislabeled-target-registry",
        label: "科研学术数据搜索服务 · 记录 1",
        source_kind_label: "专业数据集",
        summary: "公司名称:测试科技有限公司;统一社会信用代码:TEST0001;经营范围:企业软件与知识库产品。",
        provider: "datapro",
        quality_tier: 1,
        independence_key: "datapro-mislabeled-target",
      },
      {
        id: "mislabeled-branch-registry",
        label: "科研学术数据搜索服务 · 记录 2",
        source_kind_label: "专业数据集",
        summary: "公司名称:测试科技有限公司山东分公司;统一社会信用代码:TEST0002;经营范围:企业软件服务。",
        provider: "datapro",
        quality_tier: 1,
        independence_key: "datapro-mislabeled-branch",
      },
      {
        id: "business-branch-registry",
        label: "企业工商数据库 · 记录 2",
        source_kind_label: "专业数据集",
        summary: "公司名称:测试科技有限公司南京分公司;统一社会信用代码:TEST0003;经营范围:企业软件服务。",
        provider: "datapro",
        quality_tier: 1,
        independence_key: "datapro-business-branch",
      },
      {
        id: "research-evidence",
        label: "科研学术数据搜索服务 · 记录 3",
        source_kind_label: "专业数据集",
        summary: "测试科技有限公司持续开展企业知识库、内容检索和智能协作相关技术研发。",
        provider: "datapro",
        quality_tier: 1,
        independence_key: "datapro-research",
      },
      {
        id: "public-event",
        label: "测试科技有限公司产品升级公告",
        source_kind_label: "联网搜索",
        summary: "2026年7月，测试科技有限公司发布企业知识库产品升级公告。",
        provider: "web_search",
        url: "https://test-company.test/news/product-update",
        published_at: "2026-07-20T09:00:00.000Z",
        quality_tier: 2,
        independence_key: "test-company.test",
      },
    ],
  }, []);

  assert.equal(modelCalls.length, 1);
  const serializedContext = JSON.stringify(modelCalls[0].payload);
  assert.doesNotMatch(
    serializedContext,
    /mislabeled-target-registry|mislabeled-branch-registry|business-branch-registry|测试科技有限公司山东分公司|测试科技有限公司南京分公司/u,
  );
  assert.match(serializedContext, /research-evidence|智能协作相关技术研发/u);
  assert.equal(
    modelCalls[0].payload.source_selection_policy.market_database_ids.includes(
      "mislabeled-branch-registry",
    ),
    false,
  );
  assert.deepEqual(
    modelCalls[0].payload.source_selection_policy.business_dynamics_ids,
    ["research-evidence"],
  );
});

test("public dossiers are rejected when a section depends on a discarded placeholder citation", () => {
  const fixture = createWorkflowService();
  const publicDossier = fixture.service.publicDossier({
    id: "punctuation_dossier_1",
    company_id: "company_1",
    title: "测试科技有限公司销售情报报告",
    summary: "企业近期发布产品升级公告。",
    body: [
      {
        text: "企业与业务概览：测试科技有限公司(简称:“测试科技”,TEST.SZ)主营企业软件,面向销售团队提供知识库产品;",
        citation_ids: ["professional_main"],
      },
      {
        text: "经营与业务动态：公司于2026年7月发布产品升级公告,产品使用率达到25%,587Ah 规格已进入交付阶段,相关收入为2,769.17万元;",
        citation_ids: ["public_business", "public_untitled"],
      },
      {
        text: "近期公开动态：公司官网于2026年7月披露合作计划,将推进客户服务场景落地;",
        citation_ids: ["public_latest"],
      },
      {
        text: "风险与关注事项：公开公告提示部分项目交付周期可能延长,需核实实施排期;",
        citation_ids: ["public_risk"],
      },
      {
        text: "销售机会判断：产品升级形成明确切入场景,可优先确认试点部门与预算窗口;",
        citation_ids: ["professional_main", "public_business"],
      },
      {
        text: "建议行动：1. 联系销售运营负责人; 2. 核实试点范围; 3. 准备交付计划;",
        citation_ids: ["professional_main", "public_business"],
      },
    ],
    citations: [
      {
        id: "professional_main",
        label: "企业工商数据库",
        source_kind: "专业数据集",
        summary: "测试科技有限公司主营企业软件，面向销售团队提供知识库产品。",
      },
      {
        id: "public_business",
        label: "测试科技有限公司产品升级公告",
        source_kind: "联网搜索",
        summary: "公司于2026年7月发布产品升级公告，产品使用率达到25%，587Ah 规格已进入交付阶段，相关收入为2,769.17万元。",
        url: "https://news.test/product-update",
      },
      {
        id: "public_latest",
        label: "测试科技有限公司合作计划",
        source_kind: "联网搜索",
        summary: "公司官网于2026年7月披露合作计划，将推进客户服务场景落地。",
        url: "https://news.test/cooperation",
      },
      {
        id: "public_risk",
        label: "测试科技有限公司项目交付公告",
        source_kind: "联网搜索",
        summary: "公开公告提示部分项目交付周期可能延长，需核实实施排期。",
        url: "https://news.test/delivery",
      },
      {
        id: "public_untitled",
        label: "Untitled",
        source_kind: "联网搜索",
        summary: "无有效标题的搜索结果。",
        url: "https://news.test/untitled",
      },
    ],
  });

  assert.deepEqual(publicDossier.body, []);
  assert.deepEqual(publicDossier.citations, []);
  assert.equal(publicDossier.summary, "");
});

test("strict dossier runtime rejects evidence that cannot anchor the target legal entity", async () => {
  let modelCalls = 0;
  const service = new SalesService({
    env: envReader({ APP_WORKSPACE_ID: "workspace-test" }),
    runtimePolicy: strictRuntimePolicy,
    seed: seed(),
    modelProvider: {
      isRunEnabled: () => true,
      async callRequiredFunction() {
        modelCalls += 1;
        return { ok: false, error: { code: "should_not_be_called" } };
      },
    },
  });

  await assert.rejects(
    () => service.generateDossierWithModel(service.data.companies.company_1, {
      evidence_hash: "bad-public-evidence",
      items: [
        {
          id: "professional_1",
          label: "企业工商数据库",
          source_kind_label: "专业数据集",
          summary: "该记录描述企业软件与知识库产品，但没有返回可核对的法定名称或统一社会信用代码。",
          independence_key: "datapro-business",
        },
        {
          id: "professional_2",
          label: "金融数据库",
          source_kind_label: "专业数据集",
          summary: "该记录描述内容检索与协作管理业务，但没有返回可核对的法定主体。",
          independence_key: "datapro-market",
        },
        {
          id: "public_1",
          label: "测试科技有限公司安全验证",
          source_kind_label: "联网搜索",
          summary: "请完成人机验证后查看更多相关内容。",
          url: "https://blocked.test/verify",
          independence_key: "blocked.test",
        },
        {
          id: "public_2",
          label: "测试科技有限公司网站建设案例",
          source_kind_label: "联网搜索",
          summary: "网站建设服务商展示测试科技有限公司官网改版案例。",
          url: "https://agency.test/case",
          independence_key: "agency.test",
        },
      ],
    }, []),
    (error) => error.status === 422
      && error.code === "evidence_quality_insufficient"
      && error.details.validation_errors.some((item) => item.includes("目标法定主体")),
  );
  assert.equal(modelCalls, 0);
});

test("public dossiers are rejected when a section cites a removed website-production case study", () => {
  const fixture = createWorkflowService();
  const publicDossier = fixture.service.publicDossier({
    id: "source_quality_dossier_1",
    company_id: "company_1",
    title: "测试科技有限公司销售情报报告",
    summary: "测试科技有限公司近期披露客户服务产品合作计划。",
    body: [
      {
        text: "企业与业务概览：测试科技有限公司主营企业软件与知识库产品。",
        citation_ids: ["professional_main"],
      },
      {
        text: "经营与业务动态：测试科技有限公司持续推进企业软件与客户服务产品。",
        citation_ids: ["professional_main"],
      },
      {
        text: "近期公开动态：经过项目团队数月建设，测试科技有限公司全新品牌官网上线；测试科技有限公司于2026年7月签署客户服务产品合作协议。",
        citation_ids: ["website_case", "official_cooperation"],
      },
      {
        text: "风险与关注事项：商务推进应确认数据合规、合同责任与交付排期。",
        citation_ids: ["professional_main"],
      },
      {
        text: "销售机会判断：客户服务产品合作形成了可继续核验的业务切入点。",
        citation_ids: ["professional_main", "official_cooperation"],
      },
      {
        text: "建议行动：1. 确认合作项目牵头部门。\n2. 核验采购范围与预算窗口。\n3. 准备客户服务产品方案。",
        citation_ids: ["professional_main", "official_cooperation"],
      },
    ],
    citations: [
      {
        id: "professional_main",
        label: "企业工商数据库",
        source_kind: "专业数据集",
        summary: "公司名称：测试科技有限公司；经营范围：企业软件与知识库产品。",
      },
      {
        id: "website_case",
        label: "测试科技有限公司网站建设｜企业官网全面焕新",
        source_kind: "联网搜索",
        summary: "经过项目团队数月建设，测试科技有限公司全新品牌官网上线，这是网站建设服务商的客户案例。",
        url: "https://agency.test/cases/test-company",
        published_at: "2026-07-18T09:00:00.000Z",
      },
      {
        id: "generic_homepage",
        label: "测试科技有限公司 · TEST",
        source_kind: "联网搜索",
        summary: "测试科技有限公司面向企业客户提供软件与知识库产品。",
        url: "https://test-company.test/",
      },
      {
        id: "official_product",
        label: "测试科技有限公司发布企业知识库产品升级公告",
        source_kind: "联网搜索",
        summary: "测试科技有限公司于2026年7月发布企业知识库产品升级公告，新增面向销售团队的协作能力。",
        url: "https://test-company.test/news/product-update",
        published_at: "2026-07-20T09:00:00.000Z",
        auth_level: 3,
      },
      {
        id: "official_cooperation",
        label: "测试科技有限公司客户服务产品合作公告",
        source_kind: "联网搜索",
        summary: "测试科技有限公司于2026年7月签署客户服务产品合作协议，双方将推进知识库产品在客户服务场景落地。",
        url: "https://test-company.test/news/cooperation",
        published_at: "2026-07-21T09:00:00.000Z",
        auth_level: 3,
      },
    ],
  });

  const serialized = JSON.stringify(publicDossier);
  assert.doesNotMatch(serialized, /网站建设|官网全面焕新|项目团队数月建设|网站建设服务商/);
  assert.deepEqual(publicDossier.body, []);
  assert.deepEqual(publicDossier.citations, []);
  assert.equal(publicDossier.summary, "");
});

test("public dossiers discard strongly sensationalized self-media sources", () => {
  const { service } = createWorkflowService();
  const body = [
    "企业与业务概览：测试科技有限公司的登记范围包括企业软件与知识库产品。",
    "经营与业务动态：登记信息可作为业务对接范围的核验起点。",
    "近期公开动态：自媒体声称测试科技有限公司涉及一项市场事件。",
    "风险与关注事项：对接前应确认登记主体、业务范围和责任边界。",
    "销售机会判断：登记范围可作为企业软件场景的待确认对接方向。",
    "建议行动：联系相关负责人确认业务范围、项目边界和下一步安排。",
  ].map((text, index) => ({
    text,
    citation_ids: [index === 2 ? "sensational" : "registry"],
  }));
  const view = service.publicDossier({
    id: "sensational-source-dossier",
    company_id: "company_1",
    summary: body[2].text,
    body,
    citations: [
      {
        id: "registry",
        label: "企业工商数据库",
        source_kind: "专业数据集",
        summary: "公司名称:测试科技有限公司;统一社会信用代码:TEST0001;经营范围:企业软件与知识库产品。",
      },
      {
        id: "sensational",
        label: "杀人诛心！一句话让对方下不来台",
        source_kind: "联网搜索",
        summary: "自媒体声称测试科技有限公司涉及一项市场事件。",
        url: "https://self-media.test/story",
      },
    ],
  });

  assert.deepEqual(view.body, []);
  assert.deepEqual(view.citations, []);
});

test("public dossiers reject similarly named legal entities without relationship evidence", () => {
  const fixture = createWorkflowService();
  const publicDossier = fixture.service.publicDossier({
    id: "similar_entity_dossier_1",
    company_id: "company_1",
    title: "测试科技有限公司销售情报报告",
    summary: "测试科技有限公司近期披露产品升级进展。",
    body: [
      { text: "企业与业务概览：测试科技有限公司从事企业软件开发。", citation_ids: ["target_business"] },
      { text: "经营与业务动态：山西测试科技有限公司开展网络建设业务。", citation_ids: ["similar_business"] },
      { text: "近期公开动态：2026年7月，测试科技有限公司披露产品升级进展。", citation_ids: ["public_event"] },
      { text: "风险与关注事项：对接前应核验产品升级的实施范围。", citation_ids: ["public_event"] },
      { text: "销售机会判断：产品升级为技术交流提供切入点，但不代表已有采购意向。", citation_ids: ["public_event"] },
      { text: "建议行动：联系产品负责人核验升级范围并准备能力说明材料。", citation_ids: ["public_event"] },
    ],
    citations: [
      {
        id: "target_business",
        label: "企业工商数据库 · 记录 1",
        source_kind: "专业数据集",
        summary: "公司名称:测试科技有限公司;经营范围:企业软件开发。",
      },
      {
        id: "similar_business",
        label: "企业工商数据库 · 记录 2",
        source_kind: "专业数据集",
        summary: "公司名称:山西测试科技有限公司;经营范围:网络建设。",
      },
      {
        id: "public_event",
        label: "测试科技有限公司产品升级公告",
        source_kind: "联网搜索",
        summary: "2026年7月，测试科技有限公司披露产品升级进展。",
        url: "https://test-company.test/news/upgrade",
        published_at: "2026-07-20T09:00:00.000Z",
      },
    ],
  });

  assert.deepEqual(publicDossier.body, []);
  assert.deepEqual(publicDossier.citations, []);
  assert.equal(publicDossier.summary, "");
});

test("public dossiers reject malformed snippets instead of reconstructing them from other sources", () => {
  const fixture = createWorkflowService();
  const publicDossier = fixture.service.publicDossier({
    id: "malformed_dossier_1",
    company_id: "company_1",
    title: "测试科技有限公司销售情报报告",
    summary: "企业近期发布产品升级公告。",
    body: [
      { text: "企业与业务概览：测试科技有限公司持续经营企业软件业务。", citation_ids: ["professional_main"] },
      { text: "经营与业务动态：测试科技有限公司(简称:“测试科技”,TEST.SZ)发布产品升级公告,将面向销售团队推出知识库协作功能;", citation_ids: ["public_business", "public_untitled"] },
      { text: "近期公开动态：媒体 作者 7月25日 测试科技有限公司（简称“测试科技”。", citation_ids: ["public_business"] },
      { text: "风险与关注事项：公开摘要显示净利润432。", citation_ids: ["public_risk"] },
      { text: "销售机会判断：可围绕企业软件产品升级验证销售知识库场景。", citation_ids: ["professional_main", "public_business"] },
      { text: "建议行动：1. 联系产品负责人。2. 核实试点范围。3. 准备交付计划。", citation_ids: ["professional_main", "public_business"] },
    ],
    citations: [
      {
        id: "professional_main",
        label: "企业工商数据库 · 记录 1",
        source_kind: "专业数据集",
        summary: "公司名称：测试科技有限公司；统一社会信用代码：TEST0001；法定代表人：张三；注册地址：北京市海淀区；成立日期：2020-01-01。",
      },
      {
        id: "professional_branch",
        label: "企业工商数据库 · 记录 2",
        source_kind: "专业数据集",
        summary: "公司名称：测试科技有限公司上海分公司；统一社会信用代码：BRANCH0001；法定代表人：李四；注册地址：上海市徐汇区；成立日期：2023-01-01。",
      },
      {
        id: "public_business",
        label: "测试科技有限公司于2026年7月发布销售知识库产品升级公告_产业观察",
        source_kind: "联网搜索",
        summary: "媒体 作者 7月25日 测试科技有限公司（简称“测试科技”，立即注册查看更多相关信息。",
        url: "https://news.test/product-update",
      },
      {
        id: "public_risk",
        label: "测试科技有限公司核心组件交付延期公告",
        source_kind: "联网搜索",
        summary: "公司公告披露部分核心组件交付周期延长，可能影响重点项目的实施排期。",
        url: "https://news.test/delivery-risk",
      },
      {
        id: "public_untitled",
        label: "Untitled",
        source_kind: "联网搜索",
        summary: "无有效标题的搜索结果。",
        url: "https://news.test/untitled",
      },
    ],
  });

  const serialized = JSON.stringify(publicDossier);
  assert.doesNotMatch(serialized, /立即注册|查看更多|净利润432|上海分公司|BRANCH0001|Untitled/);
  assert.deepEqual(publicDossier.body, []);
  assert.deepEqual(publicDossier.citations, []);
  assert.equal(publicDossier.summary, "");
});

test("public dossiers reject repeated sections and risks attributed to another company", () => {
  const fixture = createWorkflowService();
  fixture.service.data.companies.company_1 = {
    ...fixture.service.data.companies.company_1,
    name: "宁德时代新能源科技股份有限公司",
    aliases: ["宁德时代"],
    industry: "新能源",
  };
  const repeatedBusinessPoint = "宁德时代于2026年7月披露储能合作和产线建设进展，相关项目处于持续推进阶段。";
  const publicDossier = fixture.service.publicDossier({
    id: "cross_entity_risk_dossier_1",
    company_id: "company_1",
    title: "宁德时代新能源科技股份有限公司销售情报报告",
    summary: "宁德时代近期披露多项储能合作和产线建设进展。",
    body: [
      {
        text: "企业与业务概览：宁德时代新能源科技股份有限公司主营动力电池、储能电池及相关系统产品。",
        citation_ids: ["professional_main"],
      },
      {
        text: `经营与业务动态：近期公开披露的业务动作包括：${repeatedBusinessPoint}`,
        citation_ids: ["public_business"],
      },
      {
        text: `近期公开动态：${repeatedBusinessPoint}`,
        citation_ids: ["public_business", "public_metadata"],
      },
      {
        text: "风险与关注事项：北京永勤律师事务所律师表示，相关投资者可以请求赔偿。",
        citation_ids: ["public_wrong_risk", "professional_main"],
      },
      {
        text: "销售机会判断：储能合作和产线建设为设备、系统集成和供应链协同提供了跟进场景。",
        citation_ids: ["professional_main", "public_business"],
      },
      {
        text: "建议行动：1. 核验项目阶段。2. 联系采购负责人。3. 准备供应方案。",
        citation_ids: ["professional_main", "public_business"],
      },
    ],
    citations: [
      {
        id: "professional_main",
        label: "企业工商数据库",
        source_kind: "专业数据集",
        summary: "公司名称：宁德时代新能源科技股份有限公司；统一社会信用代码：TESTCATL001；经营范围：动力电池、储能电池及相关系统产品。",
      },
      {
        id: "public_business",
        label: "宁德时代披露储能合作和产线建设进展",
        source_kind: "联网搜索",
        summary: repeatedBusinessPoint,
        url: "https://news.test/catl-business",
      },
      {
        id: "public_metadata",
        label: "1000Wh时代!宁德时代即将迈入",
        source_kind: "联网搜索",
        summary: "1000Wh时代!宁德时代即将迈入 2026年06月28日 23:53 市场资讯 (来源：连线新能源 NELinked) 近日，宁德时代发布新一代储能电池产品。",
        url: "https://news.test/catl-storage",
      },
      {
        id: "public_wrong_risk",
        label: "1200亿“画饼”宁德时代被罚，容百科技投资者可以索赔了!",
        source_kind: "联网搜索",
        summary: "文章标题提到宁德时代被罚，但北京永勤律师事务所金融律师表示，实际索赔对象为容百科技部分投资者。",
        url: "https://news.test/other-company-risk",
      },
    ],
  });

  const serialized = JSON.stringify(publicDossier);
  assert.equal(publicDossier.body.length, 0);
  assert.equal(publicDossier.summary, "");
  assert.equal(publicDossier.citations.length, 0);
  assert.doesNotMatch(serialized, /市场资讯|来源：连线新能源|北京永勤|容百科技|请求赔偿/);
});

test("dossier Agent does not persist repetitive low-quality plans", async () => {
  const modelCalls = [];
  const service = new SalesService({
    env: envReader({ APP_WORKSPACE_ID: "workspace-test" }),
    runtimePolicy: permissiveTestPolicy,
    seed: seed(),
    modelProvider: {
      isRunEnabled: () => true,
      async callRequiredFunction(input) {
        modelCalls.push(input);
        const invalid = stagedDossierPlan(input);
        const duplicateText = "企业近期发布产品升级公告并需要销售团队继续关注。";
        Object.values(invalid.sections).forEach((section) => {
          section.text = duplicateText;
        });
        return {
          ok: true,
          parsed: invalid,
          usage: { prompt_tokens: 30, completion_tokens: 20, total_tokens: 50 },
          raw_ref: `model:invalid-${modelCalls.length}`,
        };
      },
    },
  });
  const company = service.data.companies.company_1;
  const dossier = await service.generateDossierWithModel(company, {
    professional: [
      {
        label: "企业工商数据库",
        summary: "公司名称：测试科技有限公司；统一社会信用代码：TEST0001；经营范围：企业软件与知识库产品。",
      },
      {
        label: "企业风险数据库",
        summary: "风险状态需要结合公开公告持续关注。",
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
        label: "测试科技有限公司核心组件交付延期公告",
        summary: "企业公告披露部分核心组件交付周期延长，可能影响重点项目的实施排期。",
        url: "https://news.test/delivery-risk",
        published_at: "2026-07-21T09:00:00.000Z",
      },
    ],
  }, []);

  assert.equal(modelCalls.length, 3);
  assert.equal(dossier, null);
  assert.equal(modelCalls[0].operation, "sales_dossier_agent_plan");
  assert.equal(modelCalls[1].operation, "sales_dossier_agent_replan");
  assert.equal(modelCalls[2].operation, "sales_dossier_agent_replan");
  assert.ok(modelCalls[1].payload.planning_errors.length > 0);
});

test("dossier Agent fails closed when all bounded revision calls fail", async () => {
  const modelCalls = [];
  const service = new SalesService({
    env: envReader({ APP_WORKSPACE_ID: "workspace-test" }),
    runtimePolicy: strictRuntimePolicy,
    seed: seed(),
    modelProvider: {
      isRunEnabled: () => true,
      async callRequiredFunction(input) {
        modelCalls.push(input);
        if (input.operation === "sales_dossier_agent_plan") {
          const invalid = stagedDossierPlan(input);
          invalid.sections.company_overview.text = "搜索标题";
          return {
            ok: true,
            parsed: invalid,
            raw_ref: "model:invalid-plan",
          };
        }
        return {
          ok: false,
          error: {
            code: "incomplete_response",
            message: "The revision response was truncated.",
            retryable: true,
          },
        };
      },
    },
  });
  const company = {
    ...service.data.companies.company_1,
    name: "宁德时代新能源科技股份有限公司",
    aliases: ["宁德时代"],
    industry: "新能源",
  };
  await assert.rejects(
    () => service.generateDossierWithModel(company, {
      professional: [
        {
          label: "企业工商数据库",
          summary: "公司名称：宁德时代新能源科技股份有限公司；统一社会信用代码：TESTCATL001；经营范围：动力电池、储能电池及相关系统产品。",
        },
        {
          label: "金融数据库",
          summary: "宁德时代新能源科技股份有限公司持续开展动力电池、储能系统及相关产业链业务。",
        },
        {
          label: "企业风险数据库",
          summary: "宁德时代新能源科技股份有限公司的供应链履约、项目交付与合同责任需要持续核验。",
        },
      ],
      public_sources: [
        {
          label: "宁德时代与大连德泰签署战略合作协议",
          summary: "宁德时代新能源科技股份有限公司与大连德泰有限公司签署战略合作协议，双方将推进储能项目建设与运营。",
          url: "https://news.test/catl-deta-cooperation",
          published_at: "2026-07-23T09:00:00.000Z",
        },
        {
          label: "宁德时代披露储能项目交付进展",
          summary: "宁德时代新能源科技股份有限公司披露储能项目交付进展，并说明后续建设与运营计划。",
          url: "https://official.test/catl-storage-delivery",
          published_at: "2026-07-24T09:00:00.000Z",
        },
      ],
    }, []),
    (error) => error.status === 503 && error.code === "model_unavailable",
  );

  assert.equal(modelCalls.length, 3);
  assert.equal(modelCalls[1].operation, "sales_dossier_agent_replan");
  assert.equal(modelCalls[2].operation, "sales_dossier_agent_replan");
  assert.ok(modelCalls[1].payload.planning_errors.length > 0);
});

test("dossier Agent ignores empty specialized databases when enforcing section sources", async () => {
  const modelCalls = [];
  const service = new SalesService({
    env: envReader({ APP_WORKSPACE_ID: "workspace-test" }),
    runtimePolicy: permissiveTestPolicy,
    seed: seed(),
    modelProvider: {
      isRunEnabled: () => true,
      async callRequiredFunction(input) {
        modelCalls.push(structuredClone(input));
        if (
          input.operation === "sales_dossier_agent_plan"
          || input.operation === "sales_dossier_agent_replan"
        ) {
          const planned = stagedDossierPlan(input);
          const recentEvidence = input.payload.evidence_by_section.recent_public_updates.allowed_evidence;
          const distinctRecent = recentEvidence.find((item) => (
            item.id !== planned.sections.business_dynamics.evidence_ids[0]
          ));
          if (distinctRecent) {
            planned.sections.recent_public_updates = {
              text: /[。！？]$/u.test(distinctRecent.quote)
                ? distinctRecent.quote
                : `${distinctRecent.quote}。`,
              evidence_ids: [distinctRecent.id],
            };
          }
          const riskEvidence = input.payload.evidence_by_section.risk_attention.allowed_evidence;
          planned.sections.risk_attention = {
            text: "公开公告显示部分核心组件交付周期延长，项目实施排期需要提前确认。",
            evidence_ids: [riskEvidence[0].id],
          };
          planned.sections.recommended_actions = {
            text: "销售人员应联系项目负责人确认核心组件交付排期。",
            evidence_ids: [riskEvidence[0].id],
          };
          return {
            ok: true,
            parsed: planned,
            raw_ref: "model:specialized-plan",
          };
        }
        throw new Error("deterministic compilation must not request a writer call");
      },
    },
  });
  const company = service.data.companies.company_1;
  const dossier = await service.generateDossierWithModel(company, {
    professional: [
      {
        label: "企业工商数据库",
        summary: "公司名称：测试科技有限公司；统一社会信用代码：TEST0001；经营范围：企业软件与知识库产品。",
      },
      {
        label: "企业风险数据库",
        summary: "本次未检索到可核验的司法、处罚或失信记录。",
      },
      {
        label: "金融数据库",
        summary: "企业ID(关联主键):254716。",
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
        label: "测试科技有限公司核心组件交付延期公告",
        summary: "企业公告披露部分核心组件交付周期延长，可能影响重点项目的实施排期。",
        url: "https://news.test/delivery-risk",
        published_at: "2026-07-21T09:00:00.000Z",
      },
    ],
  }, []);

  assert.ok(dossier, JSON.stringify(modelCalls.map((call) => ({
    operation: call.operation,
    planning_errors: call.payload?.planning_errors || [],
    source_selection_policy: call.payload?.source_selection_policy || {},
  }))));
  assert.equal(dossier.body.length, 6);
  assert.deepEqual(modelCalls[0].payload.source_selection_policy.risk_database_ids, []);
  assert.deepEqual(modelCalls[0].payload.source_selection_policy.market_database_ids, []);
  assert.ok(modelCalls[0].payload.source_selection_policy.business_dynamics_ids.length > 0);
  assert.ok(modelCalls[0].payload.source_selection_policy.business_dynamics_ids.every((id) => (
    modelCalls[0].payload.source_selection_policy.web_search_ids.includes(id)
  )));
  assert.ok(dossier.body[1].citation_ids.every((id) => (
    dossier.citations.find((citation) => citation.id === id)?.source_kind === "联网搜索"
  )));
  assert.ok(modelCalls.every((call) => (
    call.operation === "sales_dossier_agent_plan"
    || call.operation === "sales_dossier_agent_replan"
  )));
  assert.doesNotMatch(JSON.stringify(dossier.body), /企业ID|本次未检索到/);
  assert.ok(dossier.body.every((paragraph) => (
    paragraph.text
      .split(/\n+/u)
      .filter(Boolean)
      .every((line) => /[。！？]$/u.test(line))
  )));
});

test("runtime rejects a QA answer that fabricates citation identifiers", async () => {
  const service = new SalesService({
    env: envReader(),
    runtimePolicy: strictRuntimePolicy,
    seed: seed(),
    modelProvider: {
      isRunEnabled: () => true,
      async callJson() {
        return {
          ok: true,
          parsed: {
            paragraphs: [{ text: "这是一个没有真实来源的结论。", citation_ids: ["invented-source"] }],
            insufficient: false,
          },
        };
      },
    },
  });

  await assert.rejects(
    () => service.generateQaAnswer(
      service.data.companies.company_1,
      "测试问题",
      null,
      [],
      [{ id: "evidence_real", label: "真实来源", source_kind: "专业数据集", summary: "真实内容" }],
    ),
    (error) => error.status === 503
      && error.code === "model_unavailable"
      && error.details.validation_errors.some((item) => item.includes("无效引用")),
  );
});

test("runtime repairs a malformed QA JSON response from the original model output", async () => {
  const calls = [];
  const service = new SalesService({
    env: envReader(),
    runtimePolicy: strictRuntimePolicy,
    seed: seed(),
    modelProvider: {
      isRunEnabled: () => true,
      async callJson(input) {
        calls.push(structuredClone(input));
        if (calls.length === 1) {
          return {
            ok: false,
            error: {
              code: "invalid_json",
              message: "Unterminated string in JSON response.",
            },
            invalid_content: "{\"paragraphs\":[{\"text\":\"结论：企业正在推进扩产计划",
          };
        }
        return {
          ok: true,
          parsed: {
            paragraphs: [
              {
                text: "结论：现有资料显示企业正在推进扩产计划。",
                citation_ids: ["evidence_real"],
              },
              {
                text: "下一步：核验采购时间表和预算窗口。",
                citation_ids: ["evidence_real"],
              },
            ],
            insufficient: false,
          },
          usage: { prompt_tokens: 160, completion_tokens: 80, total_tokens: 240 },
          raw_ref: "model:qa-retry",
        };
      },
    },
  });

  const answer = await service.generateQaAnswer(
    service.data.companies.company_1,
    "扩产计划和下一步行动是什么？",
    null,
    [],
    [{
      id: "evidence_real",
      label: "企业档案",
      source_kind: "企业档案",
      summary: "企业正在推进扩产计划，下一步需核验采购时间表和预算窗口。",
    }],
  );

  assert.equal(calls.length, 2);
  assert.equal(calls[0].operation, "sales_qa");
  assert.equal(calls[0].maxTokens, 1600);
  assert.equal(calls[1].operation, "sales_qa_json_repair");
  assert.equal(calls[1].maxTokens, 2200);
  assert.equal(
    calls[1].payload.invalid_json_content,
    "{\"paragraphs\":[{\"text\":\"结论：企业正在推进扩产计划",
  );
  assert.equal(answer.insufficient, false);
  assert.match(answer.text, /扩产计划/);
  assert.deepEqual(answer.citation_ids, ["evidence_real"]);
});

test("runtime retries a QA answer that omits explicit table items", async () => {
  const calls = [];
  const evidence = [{
    id: "evidence_capabilities",
    label: "个人投资助手 CookBook",
    source_kind: "飞书云文档",
    retrieval_score: 0.9,
    summary: [
      "| 能力点 | 说明 |",
      "|-|-|",
      "| 语言模型 | 完成需求理解 |",
      "| Claude code/ Agent 能力 | 负责任务编排 |",
      "| 联网搜索 | 补充公开动态 |",
      "| Data MCP：股票金融数据/国内企业工商数据 | 查询专业数据 |",
      "| 多工具兼容 | 支持多个 Agent 平台 |",
      "| 消耗统一计量 | 控制台查看消耗 |",
    ].join(" "),
  }];
  const service = new SalesService({
    env: envReader(),
    runtimePolicy: strictRuntimePolicy,
    seed: seed(),
    modelProvider: {
      isRunEnabled: () => true,
      async callJson(input) {
        calls.push(structuredClone(input));
        const complete = input.operation === "sales_qa_quality_retry";
        return {
          ok: true,
          parsed: {
            paragraphs: [{
              text: complete
                ? "文档列出的能力包括语言模型、Claude Code/Agent 能力、联网搜索、Data MCP、多工具兼容和消耗统一计量。"
                : "文档列出的能力包括语言模型、Claude Code、联网搜索和 Data MCP。",
              citation_ids: ["evidence_capabilities"],
            }],
            insufficient: false,
          },
          usage: { prompt_tokens: 160, completion_tokens: 80, total_tokens: 240 },
          raw_ref: complete ? "model:qa-quality-retry" : "model:qa-incomplete",
        };
      },
    },
  });

  const answer = await service.generateQaAnswer(
    service.data.companies.company_1,
    "这份文档明确使用了哪些核心能力？",
    null,
    [],
    evidence,
  );

  assert.equal(calls.length, 2);
  assert.equal(calls[0].operation, "sales_qa");
  assert.equal(calls[1].operation, "sales_qa_quality_retry");
  assert.deepEqual(
    calls[0].payload.enumeration_requirements.map((item) => item.label),
    ["语言模型", "Claude code/ Agent 能力", "联网搜索", "Data MCP:股票金融数据/国内企业工商数据", "多工具兼容", "消耗统一计量"],
  );
  assert.ok(calls[1].payload.validation_feedback.some((item) => item.includes("多工具兼容")));
  assert.match(answer.text, /消耗统一计量/);
});

test("runtime retries a QA answer with invalid citations and keeps fail-closed validation", async () => {
  const calls = [];
  const service = new SalesService({
    env: envReader(),
    runtimePolicy: strictRuntimePolicy,
    seed: seed(),
    modelProvider: {
      isRunEnabled: () => true,
      async callJson(input) {
        calls.push(structuredClone(input));
        const corrected = input.operation === "sales_qa_quality_retry";
        return {
          ok: true,
          parsed: {
            paragraphs: [{
              text: corrected
                ? "Trace 通过唯一 Trace ID 串联一次完整调用，Span 表示其中的单个执行节点。"
                : "Trace 通过唯一 Trace ID 串联一次完整调用，Span 表示其中的单个执行节点。",
              citation_ids: [corrected ? "evidence_trace" : "1"],
            }],
            insufficient: false,
          },
          usage: { prompt_tokens: 160, completion_tokens: 80, total_tokens: 240 },
          raw_ref: corrected ? "model:qa-citation-retry" : "model:qa-invalid-citation",
        };
      },
    },
  });

  const answer = await service.generateQaAnswer(
    service.data.companies.company_1,
    "Trace 和 Span 分别承担什么作用？",
    null,
    [],
    [{
      id: "evidence_trace",
      label: "方舟全链路数据体系建设研讨会",
      source_kind: "飞书云文档",
      summary: "Trace 通过唯一 Trace ID 串联一次完整调用；每个执行节点对应一个 Span。",
    }],
  );

  assert.equal(calls.length, 2);
  assert.equal(calls[0].operation, "sales_qa");
  assert.equal(calls[1].operation, "sales_qa_quality_retry");
  assert.ok(calls[1].payload.validation_feedback.some((item) => item.includes("无效引用")));
  assert.deepEqual(answer.citation_ids, ["evidence_trace"]);
  assert.equal(answer.citations[0].label, "方舟全链路数据体系建设研讨会");
});

test("QA workflow preserves bounded citation validation diagnostics in the failed provider run", async () => {
  const fixture = createWorkflowService();
  fixture.service.modelProvider = {
    isRunEnabled: () => true,
    async callJson() {
      return {
        ok: true,
        parsed: {
          paragraphs: [{
            text: "客户希望先验证知识库问答，并确认数据权限边界。",
            citation_ids: ["invented-source"],
          }],
          insufficient: false,
        },
      };
    },
  };
  const generateQaAnswer = fixture.service.generateQaAnswer.bind(fixture.service);
  fixture.service.generateQaAnswer = async (...args) => {
    const previousPolicy = fixture.service.runtimePolicy;
    fixture.service.runtimePolicy = { ...previousPolicy, fail_closed: true };
    try {
      return await generateQaAnswer(...args);
    } finally {
      fixture.service.runtimePolicy = previousPolicy;
    }
  };

  await assert.rejects(
    () => fixture.service.askQuestion("company_1", { question: "客户希望先验证什么？" }),
    (error) => error.code === "model_unavailable",
  );

  const [run] = await fixture.service.listProviderRuns({
    operation: "sales_qa",
    entity_id: "company_1",
  });
  assert.equal(run.status, "failed");
  assert.ok(run.error.validation_errors.some((item) => item.includes("无效引用")));
  assert.equal((await fixture.service.getJob(run.job_id)).status, "failed");
});

test("cancelled jobs remain cancelled when a late workflow completion arrives", async () => {
  const fixture = createWorkflowService();
  const job = await fixture.service.startJob({
    job_type: "sales_dossier_generation",
    entity_type: "target_enterprise",
    entity_id: "company_1",
    max_attempts: 3,
    request: {},
  });

  const cancelled = await fixture.service.cancelJob(job.id);
  assert.equal(cancelled.status, "cancelled");
  assert.ok(cancelled.cancel_requested_at);

  await fixture.service.completeJob(job.id, { result_ref: "late-result" });
  await fixture.service.failJob(job.id, { code: "late-error", message: "late error" });
  const afterLateWrites = await fixture.service.getJob(job.id);
  assert.equal(afterLateWrites.status, "cancelled");
  assert.equal(afterLateWrites.result_ref, null);
  assert.equal(afterLateWrites.error, null);
});

test("failed jobs remain failed when a late workflow completion arrives", async () => {
  const fixture = createWorkflowService();
  const job = await fixture.service.startJob({
    job_type: "sales_dossier_generation",
    entity_type: "target_enterprise",
    entity_id: "company_1",
    max_attempts: 3,
    request: {},
  });

  await fixture.service.failJob(job.id, {
    code: "provider_timeout",
    message: "provider timeout",
    retryable: true,
  });
  await fixture.service.completeJob(job.id, { result_ref: "late-result" });

  const afterLateCompletion = await fixture.service.getJob(job.id);
  assert.equal(afterLateCompletion.status, "failed");
  assert.equal(afterLateCompletion.result_ref, null);
  assert.equal(afterLateCompletion.error.code, "provider_timeout");
});

test("manual retry reuses a failed dossier job and increments its attempt", async () => {
  const fixture = createWorkflowService();
  const job = await fixture.service.startJob({
    job_type: "sales_dossier_generation",
    entity_type: "target_enterprise",
    entity_id: "company_1",
    max_attempts: 3,
    request: {},
  });
  await fixture.service.failJob(job.id, {
    code: "temporary_provider_error",
    message: "temporary provider error",
    retryable: true,
  });

  const result = await fixture.service.retryJob(job.id);
  const retried = await fixture.service.getJob(job.id);
  assert.equal(result.job_id, job.id);
  assert.equal(result.action, "created");
  assert.equal(retried.status, "succeeded");
  assert.equal(retried.attempt_count, 2);
  assert.equal(retried.error, null);
});

test("manual retry rejects terminal success and exhausted attempts", async () => {
  const fixture = createWorkflowService();
  const succeeded = await fixture.service.startJob({
    job_type: "sales_dossier_generation",
    entity_type: "target_enterprise",
    entity_id: "company_1",
    max_attempts: 3,
  });
  await fixture.service.completeJob(succeeded.id);
  await assert.rejects(
    () => fixture.service.retryJob(succeeded.id),
    (error) => error.status === 409 && error.code === "job_not_retryable",
  );

  const exhausted = await fixture.service.startJob({
    job_type: "sales_dossier_generation",
    entity_type: "target_enterprise",
    entity_id: "company_1",
    max_attempts: 1,
  });
  await fixture.service.failJob(exhausted.id, { code: "failed", message: "failed" });
  await assert.rejects(
    () => fixture.service.retryJob(exhausted.id),
    (error) => error.status === 409 && error.code === "job_attempts_exhausted",
  );
});
