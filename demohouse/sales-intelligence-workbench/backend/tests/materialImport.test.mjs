import assert from "node:assert/strict";
import test from "node:test";
import { SalesService } from "../src/services/salesService.js";

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
      company_a: {
        id: "company_a",
        name: "企业 A",
        industry: "测试行业",
        material_ids: [],
        dossier_ids: [],
      },
      company_b: {
        id: "company_b",
        name: "企业 B",
        industry: "测试行业",
        material_ids: [],
        dossier_ids: [],
      },
    },
    dossiers: {},
    materials: {},
    qa_messages: {},
    sync_sources: {},
    sync_checkpoints: {},
  };
}

function openVikingFake() {
  const writes = [];
  const finds = [];
  const resources = new Map();
  return {
    writes,
    finds,
    resources,
    reads: [],
    removals: [],
    sessionMessages: [],
    sessionUses: [],
    sessionCommits: [],
    isConfigured: () => true,
    isRunEnabled: () => true,
    salesCompanyUri: ({ workspaceId, companyId }) => `viking://sales/${workspaceId}/${companyId}`,
    salesMaterialUri: ({ workspaceId, companyId, sourceId }) => `viking://sales/${workspaceId}/${companyId}/${sourceId}.md`,
    salesDossierUri: ({ workspaceId, companyId, dossierId }) => `viking://sales/${workspaceId}/${companyId}/dossiers/${dossierId}.md`,
    salesSessionId: ({ workspaceId, companyId }) => `sales-${workspaceId}-${companyId}`,
    async upsertTextResource(input) {
      writes.push(input);
      resources.set(input.uri, input.content);
      return {
        ok: true,
        uri: input.uri,
        raw_ref: input.uri,
        summary: "stored",
      };
    },
    async readTextResource(uri) {
      this.reads.push(uri);
      if (!resources.has(uri)) {
        return {
          ok: false,
          http_status: 404,
          error: { code: "not_found", message: "Resource not found" },
        };
      }
      return {
        ok: true,
        uri,
        content: resources.get(uri),
        raw_ref: uri,
      };
    },
    async findMemories(query, options) {
      finds.push({ query, options });
      return { ok: true, result: { resources: [] } };
    },
    async removeResource(uri) {
      this.removals.push(uri);
      return { ok: true, uri, raw_ref: uri };
    },
    async addSessionMessages(sessionId, messages) {
      this.sessionMessages.push({ sessionId, messages });
      return { ok: true, raw_ref: `openviking:session:${sessionId}:messages` };
    },
    async recordSessionUsed(sessionId, contexts) {
      this.sessionUses.push({ sessionId, contexts });
      return { ok: true, raw_ref: `openviking:session:${sessionId}:used` };
    },
    async commitSession(sessionId) {
      this.sessionCommits.push(sessionId);
      return { ok: true, raw_ref: `openviking:session:${sessionId}:commit` };
    },
  };
}

function createService(provider = openVikingFake()) {
  return {
    provider,
    service: new SalesService({
      env: envReader({ APP_WORKSPACE_ID: "workspace-test" }),
      runtimePolicy: permissiveTestPolicy,
      seed: seed(),
      openVikingProvider: provider,
    }),
  };
}

test("same source and content is skipped while changed content updates one material", async () => {
  const { service, provider } = createService();
  const source = {
    type: "feishu_doc",
    external_id: "doc-token-1",
    checkpoint_key: "revision_id",
    checkpoint_value: "1",
    config: { document_id: "doc-1", access_token: "must-not-persist" },
  };

  const created = await service.importMaterial("company_a", {
    title: "客户方案",
    source,
    source_url: "https://example.feishu.cn/wiki/doc-token-1",
    raw_text: "第一版内容",
  });
  const unchanged = await service.importMaterial("company_a", {
    title: "客户方案",
    source,
    source_url: "https://example.feishu.cn/wiki/doc-token-1",
    raw_text: "第一版内容",
  });
  const updated = await service.importMaterial("company_a", {
    title: "客户方案",
    source: { ...source, checkpoint_value: "2" },
    source_url: "https://example.feishu.cn/wiki/doc-token-1",
    raw_text: "第二版内容",
  });

  assert.equal(created.action, "created");
  assert.equal(unchanged.action, "unchanged");
  assert.equal(updated.action, "updated");
  assert.equal(created.material.id, unchanged.material.id);
  assert.equal(created.material.id, updated.material.id);
  assert.equal(provider.writes.length, 2);
  assert.equal(provider.writes[0].mode, "create");
  assert.equal(provider.writes[1].mode, "replace");
  assert.equal(updated.checkpoint.checkpoint_value, "2");
  assert.equal(Object.hasOwn(updated.source.config, "access_token"), false);
  assert.ok(created.provider_run_id);
  assert.equal(service.listMaterials("company_a").length, 1);
});

test("incremental Feishu messages merge by id instead of replacing history", async () => {
  const { service, provider } = createService();
  const source = {
    type: "feishu_p2p",
    external_id: "oc_p2p_1",
    checkpoint_key: "last_message",
  };

  const first = await service.importMaterial("company_a", {
    title: "客户沟通",
    source: { ...source, checkpoint_value: "2026-07-20T10:00:00Z" },
    source_items: [
      { id: "om_1", occurred_at: "2026-07-20T10:00:00Z", sender: "客户", content: "需要私有化部署" },
    ],
  });
  const second = await service.importMaterial("company_a", {
    title: "客户沟通",
    source: { ...source, checkpoint_value: "2026-07-20T11:00:00Z" },
    source_items: [
      { id: "om_1", occurred_at: "2026-07-20T10:00:00Z", sender: "客户", content: "需要私有化部署" },
      { id: "om_2", occurred_at: "2026-07-20T11:00:00Z", sender: "销售", content: "已安排方案评审" },
    ],
  });

  const stored = service.data.materials[first.material.id];
  assert.equal(second.action, "updated");
  assert.deepEqual(stored.source_items.map((item) => item.id), ["om_1", "om_2"]);
  assert.match(stored.text, /需要私有化部署/);
  assert.match(stored.text, /已安排方案评审/);
  assert.equal(provider.writes.length, 2);
});

test("incremental Feishu import restores prior content from OpenViking after a process restart", async () => {
  const provider = openVikingFake();
  const firstService = createService(provider).service;
  const source = {
    type: "feishu_p2p",
    external_id: "oc_restart_1",
    checkpoint_key: "last_message",
  };

  const first = await firstService.importMaterial("company_a", {
    title: "重启恢复沟通",
    source: { ...source, checkpoint_value: "2026-07-20T10:00:00Z" },
    source_items: [
      { id: "om_restart_1", occurred_at: "2026-07-20T10:00:00Z", sender: "客户", content: "需要私有化部署" },
    ],
  });

  const persistedSeed = structuredClone(firstService.data);
  persistedSeed.materials[first.material.id].summary = "";
  persistedSeed.materials[first.material.id].text = "";
  persistedSeed.materials[first.material.id].source_items = [];
  const restartedService = new SalesService({
    env: envReader({ APP_WORKSPACE_ID: "workspace-test" }),
    runtimePolicy: permissiveTestPolicy,
    seed: persistedSeed,
    openVikingProvider: provider,
  });

  const second = await restartedService.importMaterial("company_a", {
    title: "重启恢复沟通",
    source: { ...source, checkpoint_value: "2026-07-20T11:00:00Z" },
    source_items: [
      { id: "om_restart_2", occurred_at: "2026-07-20T11:00:00Z", sender: "销售", content: "已安排方案评审" },
    ],
  });

  const stored = restartedService.data.materials[first.material.id];
  assert.equal(second.action, "updated");
  assert.deepEqual(stored.source_items.map((item) => item.id), ["om_restart_1", "om_restart_2"]);
  assert.match(stored.text, /需要私有化部署/);
  assert.match(stored.text, /已安排方案评审/);
  assert.deepEqual(provider.reads, [stored.openviking_uri]);
});

test("OpenViking retrieval is restricted to the selected company's Feishu materials subtree", async () => {
  const { service, provider } = createService();

  await service.searchOpenViking(service.data.companies.company_a, "预算情况");
  await service.searchOpenViking(service.data.companies.company_b, "预算情况");

  assert.equal(provider.finds[0].options.uri, "viking://sales/workspace-test/company_a/materials");
  assert.equal(provider.finds[1].options.uri, "viking://sales/workspace-test/company_b/materials");
  assert.notEqual(provider.finds[0].options.uri, provider.finds[1].options.uri);
});

test("runtime does not disguise an empty OpenViking retrieval with local materials", async () => {
  const provider = openVikingFake();
  const service = new SalesService({
    env: envReader({ APP_WORKSPACE_ID: "workspace-test" }),
    runtimePolicy: strictRuntimePolicy,
    seed: seed(),
    openVikingProvider: provider,
  });
  service.data.materials.material_1 = {
    id: "material_1",
    company_id: "company_a",
    title: "客户沟通纪要",
    source_type: "飞书会议纪要",
    text: "客户预算为 100 万元。",
    summary: "客户预算为 100 万元。",
    openviking_uri: "viking://sales/workspace-test/company_a/material_1.md",
  };
  service.data.companies.company_a.material_ids.push("material_1");

  const contexts = await service.searchOpenViking(
    service.data.companies.company_a,
    "客户预算是多少？",
  );

  assert.deepEqual(contexts, []);
  assert.equal(provider.finds.length, 1);
});

test("test policy does not disguise an empty OpenViking retrieval with local material content", async () => {
  const { service } = createService();
  service.data.materials.material_1 = {
    id: "material_1",
    company_id: "company_a",
    title: "客户沟通纪要",
    source_type: "飞书会议纪要",
    text: "客户预算为 100 万元。",
    summary: "客户预算为 100 万元。",
    openviking_uri: "viking://sales/workspace-test/company_a/material_1.md",
  };
  service.data.companies.company_a.material_ids.push("material_1");

  const contexts = await service.searchOpenViking(
    service.data.companies.company_a,
    "客户预算是多少？",
  );

  assert.deepEqual(contexts, []);
});

test("QA material fallback excludes local records that were not imported from Feishu", async () => {
  const { service } = createService();
  service.data.materials.material_1 = {
    id: "material_1",
    company_id: "company_a",
    title: "手工备注",
    source_type: "manual",
    text: "这条内容不是用户导入的飞书资料。",
    summary: "这条内容不是用户导入的飞书资料。",
  };
  service.data.companies.company_a.material_ids.push("material_1");

  const contexts = await service.searchOpenViking(
    service.data.companies.company_a,
    "客户预算是多少？",
  );

  assert.deepEqual(contexts, []);
});

test("QA writes use a workspace-and-company-scoped OpenViking session", async () => {
  const { service, provider } = createService();
  const company = service.data.companies.company_a;

  await service.captureQaSession(
    company,
    { text: "预算是多少？" },
    { text: "当前资料未提供明确预算。" },
    [{ uri: "viking://sales/workspace-test/company_a/materials/source.md" }],
  );
  const committed = await service.commitQaMemory("company_a");

  assert.equal(provider.writes.length, 0);
  assert.equal(provider.sessionMessages[0].sessionId, "sales-workspace-test-company_a");
  assert.equal(provider.sessionUses[0].sessionId, "sales-workspace-test-company_a");
  assert.deepEqual(provider.sessionCommits, ["sales-workspace-test-company_a"]);
  assert.equal(committed.status, "ready");
  assert.ok(committed.job_id);
  assert.ok(committed.provider_run_id);
  assert.equal((await service.getJob(committed.job_id)).status, "succeeded");
  assert.equal((await service.getProviderRun(committed.provider_run_id)).job_id, committed.job_id);
  assert.equal(Object.hasOwn(committed, "raw_ref"), false);
});

test("QA capture keeps the actual OpenViking session id for later persistence and commit", async () => {
  const provider = openVikingFake();
  provider.addSessionMessages = async function addSessionMessages(sessionId, messages) {
    this.sessionMessages.push({ sessionId, messages });
    return {
      ok: true,
      session_id: "server-session-company-a",
      raw_ref: "openviking:session:server-session-company-a:messages",
    };
  };
  const { service } = createService(provider);
  const company = service.data.companies.company_a;

  const captured = await service.captureQaSession(
    company,
    { text: "客户关心什么？" },
    { text: "客户关心数据权限边界。" },
    [{ uri: "viking://sales/workspace-test/company_a/materials/source.md" }],
  );
  await service.commitQaMemory("company_a");

  assert.equal(captured.session_id, "server-session-company-a");
  assert.equal(company.qa_session_id, "server-session-company-a");
  assert.equal(provider.sessionUses[0].sessionId, "server-session-company-a");
  assert.deepEqual(provider.sessionCommits, ["server-session-company-a"]);
});

test("paused sources require an explicit resume before importing", async () => {
  const { service } = createService();
  const body = {
    title: "暂停资料",
    source: { type: "feishu_doc", external_id: "paused-doc" },
    raw_text: "内容",
  };
  const identity = service.getMaterialSyncState("company_a", body);
  service.data.sync_sources[identity.source_id] = {
    id: identity.source_id,
    status: "paused",
  };

  await assert.rejects(
    () => service.importMaterial("company_a", body),
    (error) => error.status === 409 && error.code === "sync_source_paused",
  );
  const resumed = await service.importMaterial("company_a", { ...body, resume_source: true });
  assert.equal(resumed.action, "created");
});

test("source lifecycle supports pause, resume and deletion from Supabase/OpenViking state", async () => {
  const { service, provider } = createService();
  const body = {
    title: "待维护资料",
    source: { type: "feishu_doc", external_id: "lifecycle-doc" },
    raw_text: "内容",
  };
  const imported = await service.importMaterial("company_a", body);
  const openVikingUri = service.data.materials[imported.material.id].openviking_uri;

  const sources = service.listMaterialSyncSources("company_a");
  const paused = await service.updateMaterialSyncSource("company_a", { source_id: imported.source.id, action: "pause" });
  const resumed = await service.updateMaterialSyncSource("company_a", { source_id: imported.source.id, action: "resume" });
  const deleted = await service.updateMaterialSyncSource("company_a", { source_id: imported.source.id, action: "delete" });

  assert.equal(sources.length, 1);
  assert.equal(sources[0].id, imported.source.id);
  assert.equal(sources[0].material_count, 1);
  assert.deepEqual(sources[0].material_ids, [imported.material.id]);
  assert.equal(sources[0].checkpoint.last_success_at, imported.checkpoint.last_success_at);
  assert.equal(sources[0].openviking_statuses.ready, 1);
  assert.equal(paused.source.status, "paused");
  assert.equal(resumed.source.status, "active");
  assert.equal(deleted.source.status, "deleted");
  assert.deepEqual(deleted.affected_material_ids, [imported.material.id]);
  assert.deepEqual(provider.removals, [openVikingUri]);
  assert.ok(deleted.job_id);
  assert.ok(deleted.provider_run_id);
  assert.equal((await service.getJob(deleted.job_id)).status, "succeeded");
  assert.equal((await service.getProviderRun(deleted.provider_run_id)).job_id, deleted.job_id);
  assert.doesNotMatch(JSON.stringify(imported.openviking_record), /viking:\/\//i);
  assert.equal(service.data.materials[imported.material.id], undefined);
  assert.deepEqual(service.data.companies.company_a.material_ids, []);
});

test("batch material sync is guarded, traceable and keeps raw OpenViking refs private", async () => {
  const { service, provider } = createService();
  const imported = await service.importMaterial("company_a", {
    title: "客户需求纪要",
    source: { type: "feishu_doc", external_id: "batch-sync-doc" },
    raw_text: "客户计划在第三季度完成技术评估。",
  });
  provider.writes.length = 0;

  const synced = await service.syncMaterialsToOpenViking("company_a");

  assert.equal(synced.status, "ready");
  assert.equal(synced.records.length, 1);
  assert.equal(synced.records[0].material_id, imported.material.id);
  assert.ok(synced.job_id);
  assert.ok(synced.provider_run_id);
  assert.equal((await service.getJob(synced.job_id)).status, "succeeded");
  assert.equal((await service.getProviderRun(synced.provider_run_id)).job_id, synced.job_id);
  assert.equal(provider.writes.length, 1);
  assert.doesNotMatch(JSON.stringify(synced), /viking:\/\//i);
});

test("source lifecycle rejects a source_id that is not attached to the selected company", async () => {
  const { service } = createService();
  const imported = await service.importMaterial("company_a", {
    title: "企业 A 私有资料",
    source: { type: "feishu_doc", external_id: "company-a-doc" },
    raw_text: "仅属于企业 A 的内容",
  });

  await assert.rejects(
    () => service.updateMaterialSyncSource("company_b", { source_id: imported.source.id, action: "pause" }),
    (error) => error.status === 404
      && error.code === "sync_source_not_found"
      && error.details?.company_id === "company_b",
  );
  assert.equal(service.data.sync_sources[imported.source.id].status, "active");
});
