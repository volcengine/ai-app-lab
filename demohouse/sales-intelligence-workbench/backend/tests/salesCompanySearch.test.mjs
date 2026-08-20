import assert from "node:assert/strict";
import test from "node:test";
import { SalesService } from "../src/services/salesService.js";

const permissiveTestPolicy = Object.freeze({
  fail_closed: false,
});

const strictRuntimePolicy = Object.freeze({
  fail_closed: true,
});

function emptyState() {
  return {
    goals: [],
    companies: {},
    dossiers: {},
    materials: {},
    qa_messages: {},
    sync_sources: {},
    sync_checkpoints: {},
    jobs: {},
  };
}

function envReader(values = {}) {
  return {
    value(name, fallback = "") {
      return Object.hasOwn(values, name) ? values[name] : fallback;
    },
  };
}

function createRepository() {
  const persistedCompanies = [];
  const jobs = new Map();
  return {
    persistedCompanies,
    async getSalesState() {
      return emptyState();
    },
    async persistSalesGoal() {},
    async persistSalesSearchResults() {},
    async persistSalesCompany(company) {
      persistedCompanies.push(structuredClone(company));
    },
    async persistJob(job) {
      jobs.set(job.id, structuredClone(job));
    },
    async reservePaidWorkflow(job, reservationId) {
      const reserved = { ...structuredClone(job), reservation_id: reservationId, is_paid: true };
      jobs.set(reserved.id, reserved);
      return { job: reserved, budget: { running: 1, used_today: jobs.size } };
    },
    async finishPaidWorkflow(job) {
      jobs.set(job.id, structuredClone(job));
      return structuredClone(job);
    },
    async getJob(jobId) {
      return jobs.has(jobId) ? structuredClone(jobs.get(jobId)) : null;
    },
    async persistProviderRun() {},
  };
}

function webProvider() {
  return {
    isRunEnabled: () => true,
    async search() {
      return {
        ok: true,
        results: [{
          title: "测试企业官网动态",
          summary: "测试企业发布了最新业务公告。",
          url: "https://company.test/news",
        }],
      };
    },
  };
}

test("company search uses structured DataPro identities and deduplicates repeated searches", async () => {
  const repository = createRepository();
  const service = new SalesService({
    env: envReader({ APP_WORKSPACE_ID: "workspace-test" }),
    runtimePolicy: permissiveTestPolicy,
    seed: emptyState(),
    repository,
    dataProProvider: {
      isRunEnabled: () => true,
      async callTool() {
        return {
          ok: true,
          raw_ref: "datapro:trace-company-search",
          parsed: {
            code: 0,
            data: {
              items: [{
                公司名称: "北京测试科技有限公司",
                统一社会信用代码: "91110000TEST000001",
                法定代表人: "张三",
                注册资本: "1000万元人民币",
                企业状态: "存续",
                所属行业: "企业软件",
                注册地址: "北京市海淀区测试路1号",
                成立日期: "2020-01-02",
                经营范围: "软件开发与技术服务。",
              }],
            },
          },
          summary: "公司名称：北京测试科技有限公司；统一社会信用代码：91110000TEST000001",
        };
      },
    },
    webSearchProvider: webProvider(),
  });
  await service.assertRuntimeReady();
  const goal = await service.createGoal({ name: "测试销售目标" });

  const first = await service.searchCompanies(goal.id, { query: "测试科技" });
  const second = await service.searchCompanies(goal.id, { query: "测试科技" });

  assert.equal(first.length, 1);
  assert.equal(first[0].name, "北京测试科技有限公司");
  assert.equal(first[0].identity_status, "verified");
  assert.equal(first[0].unified_social_credit_code, "91110000TEST000001");
  assert.equal(first[0].legal_representative, "张三");
  assert.equal(first[0].registered_capital, "1000万元人民币");
  assert.equal(first[0].location, "北京市");
  assert.match(first[0].reason, /专业数据集已核验/);
  assert.equal(second[0].id, first[0].id);
  assert.equal(Object.keys(service.data.companies).length, 1);
  assert.ok(first[0].id.startsWith("company_dp_"));
  assert.equal(repository.persistedCompanies.at(-1).professional_source_ref, "datapro:trace-company-search");
  assert.ok(repository.persistedCompanies.at(-1).aliases.includes("测试科技"));
  const runs = await service.listProviderRuns({ operation: "sales_company_search" });
  assert.equal(runs.length, 2);
  assert.deepEqual(runs[0].steps.map((step) => step.provider), ["datapro", "web_search"]);
  assert.ok(runs.every((run) => run.status === "succeeded"));
});

test("company search can parse a DataPro text summary when structured items are absent", async () => {
  const service = new SalesService({
    env: envReader(),
    runtimePolicy: permissiveTestPolicy,
    seed: emptyState(),
    dataProProvider: {
      isRunEnabled: () => true,
      async callTool() {
        return {
          ok: true,
          summary: "公司名称：上海示例信息技术有限公司；统一社会信用代码：91310000TEST000002；法人姓名：李四；企业状态：存续；注册地址：上海市浦东新区示例路2号",
        };
      },
    },
    webSearchProvider: webProvider(),
  });
  const goal = await service.createGoal({ name: "文本结果测试" });
  const results = await service.searchCompanies(goal.id, { query: "示例信息" });

  assert.equal(results.length, 1);
  assert.equal(results[0].name, "上海示例信息技术有限公司");
  assert.equal(results[0].unified_social_credit_code, "91310000TEST000002");
  assert.equal(results[0].legal_representative, "李四");
  assert.equal(results[0].location, "上海市");
});

test("runtime search rejects a successful DataPro response without an identifiable company", async () => {
  const repository = createRepository();
  const service = new SalesService({
    env: envReader(),
    runtimePolicy: strictRuntimePolicy,
    seed: emptyState(),
    repository,
    dataProProvider: {
      isRunEnabled: () => true,
      async callTool() {
        return { ok: true, summary: "DataPro 返回成功，但没有企业主体字段。", parsed: { code: 0, items: [] } };
      },
    },
    webSearchProvider: webProvider(),
  });
  await service.assertRuntimeReady();
  const goal = await service.createGoal({ name: "生产校验" });

  await assert.rejects(
    () => service.searchCompanies(goal.id, { query: "无法识别的公司" }),
    (error) => error.status === 503
      && error.code === "datapro_unavailable"
      && error.details.reason === "company_identity_unavailable",
  );
  assert.equal(Object.keys(service.data.companies).length, 0);
});

test("runtime search keeps a verified DataPro candidate when optional web search is unavailable", async () => {
  const repository = createRepository();
  const service = new SalesService({
    env: envReader(),
    runtimePolicy: strictRuntimePolicy,
    seed: emptyState(),
    repository,
    dataProProvider: {
      isRunEnabled: () => true,
      async callTool() {
        return {
          ok: true,
          raw_ref: "datapro:verified-without-web",
          parsed: {
            items: [{
              企业名称: "广州可靠数据有限公司",
              统一社会信用代码: "91440100TEST000003",
              经营状态: "存续",
              注册地址: "广东省广州市天河区可靠路3号",
            }],
          },
        };
      },
    },
    webSearchProvider: {
      isRunEnabled: () => true,
      async search() {
        return { ok: false, error: { code: "10500", message: "upstream unavailable" } };
      },
    },
  });
  await service.assertRuntimeReady();
  const goal = await service.createGoal({ name: "降级搜索" });
  const results = await service.searchCompanies(goal.id, { query: "可靠数据" });

  assert.equal(results.length, 1);
  assert.equal(results[0].identity_status, "verified");
  assert.match(results[0].reason, /联网公开信息暂不可用/);
  assert.ok(results[0].warnings.some((warning) => warning.includes("10500")));
  const run = (await service.listProviderRuns({ operation: "sales_company_search" }))[0];
  assert.equal(run.status, "succeeded_with_issues");
  assert.equal(run.steps.find((step) => step.provider === "web_search").status, "failed");
});
