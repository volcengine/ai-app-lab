import assert from "node:assert/strict";
import test from "node:test";
import { FeishuImportTaskService } from "../src/services/feishuImportTaskService.js";

function envReader(values = {}) {
  return {
    value(name, fallback = "") {
      return Object.hasOwn(values, name) ? values[name] : fallback;
    },
  };
}

function salesServiceFake() {
  return {
    imports: [],
    requireCompany(companyId) {
      if (companyId !== "company_1") throw new Error("unknown company");
      return { id: companyId };
    },
    getMaterialSyncState(companyId, input) {
      return {
        company_id: companyId,
        source_id: input.source.external_id,
        source: { status: "active" },
        checkpoint: null,
      };
    },
    async importMaterial(companyId, material) {
      this.imports.push({ companyId, material });
      return {
        action: "created",
        material: { id: "material_1", openviking_status: "ready" },
        source: { id: "source_1" },
        openviking_record: {
          status: "ready",
          raw_ref: "viking://private/resource",
        },
      };
    },
  };
}

async function waitForTask(service, companyId, taskId) {
  for (let index = 0; index < 20; index += 1) {
    const task = service.get(companyId, taskId);
    if (!["queued", "running"].includes(task.status)) return task;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("Task did not complete.");
}

test("controlled Feishu import runs through local adapters and exposes only public task fields", async () => {
  const salesService = salesServiceFake();
  let receivedOptions = null;
  const service = new FeishuImportTaskService({
    env: envReader({ FEISHU_CLI_IMPORT_ENABLED: "true" }),
    salesService,
    async runner(options) {
      receivedOptions = options;
      const state = await options.syncStateLoader({
        type: "feishu_doc",
        external_id: "doc-token-123",
        display_name: "客户方案",
      });
      assert.equal(state.company_id, "company_1");
      const imported = await options.materialImporter({
        title: "飞书云文档：客户方案",
        source: { type: "feishu_doc", external_id: "doc-token-123" },
        raw_text: "客户希望先完成小范围验证。",
      });
      return {
        ok: true,
        summary: { created: 1, updated: 0, unchanged: 0, failed: 0 },
        imports: [{
          source_type: "feishu_doc",
          title: "飞书云文档：客户方案",
          action: imported.action,
          status: imported.openviking_record.status,
          imported_material_id: imported.material.id,
          openviking_ref: imported.openviking_record.raw_ref,
          provider_run_id: "provider-run-private",
          duration_ms: 12,
        }],
      };
    },
  });

  const started = await service.start("company_1", {
    source_kind: "document",
    target: "https://example.feishu.cn/wiki/doc-token-123",
  });
  const completed = await waitForTask(service, "company_1", started.id);

  assert.equal(completed.status, "succeeded");
  assert.deepEqual(receivedOptions.docs, ["https://example.feishu.cn/wiki/doc-token-123"]);
  assert.equal(receivedOptions.materialImporter instanceof Function, true);
  assert.equal(salesService.imports.length, 1);
  assert.equal(completed.result.imports[0].material_id, "material_1");
  assert.doesNotMatch(JSON.stringify(completed), /viking:\/\//i);
  assert.doesNotMatch(JSON.stringify(completed), /provider-run-private/i);
});

test("conversation targets are bounded and only one import can run per company", async () => {
  let release;
  const runnerWait = new Promise((resolve) => {
    release = resolve;
  });
  const service = new FeishuImportTaskService({
    env: envReader({ FEISHU_CLI_IMPORT_ENABLED: "true" }),
    salesService: salesServiceFake(),
    async runner(options) {
      await runnerWait;
      return {
        ok: true,
        summary: { created: 0, updated: 0, unchanged: 1, failed: 0 },
        imports: [{
          source_type: options.chatId ? "feishu_chat" : "feishu_p2p",
          action: "unchanged",
          status: "skipped",
        }],
      };
    },
  });

  const first = await service.start("company_1", {
    source_kind: "conversation",
    target: "oc_91c21c3c611da52e7555c92866e63a04",
  });
  await assert.rejects(
    () => service.start("company_1", {
      source_kind: "conversation",
      target: "联系人姓名",
    }),
    (error) => error.status === 409 && error.code === "feishu_import_in_progress",
  );
  release();
  const completed = await waitForTask(service, "company_1", first.id);
  assert.equal(completed.status, "succeeded");
});

test("product import accepts names and chat IDs but rejects Open ID and bare document tokens", () => {
  const service = new FeishuImportTaskService({
    env: envReader({ FEISHU_CLI_IMPORT_ENABLED: "true" }),
    salesService: salesServiceFake(),
  });

  assert.equal(
    service.normalizeRequest("company_1", {
      source_kind: "conversation",
      target: "客户联系人姓名",
    }).target,
    "客户联系人姓名",
  );
  assert.equal(
    service.normalizeRequest("company_1", {
      source_kind: "conversation",
      target: "oc_91c21c3c611da52e7555c92866e63a04",
    }).target,
    "oc_91c21c3c611da52e7555c92866e63a04",
  );
  assert.throws(
    () => service.normalizeRequest("company_1", {
      source_kind: "conversation",
      target: "ou_91c21c3c611da52e7555c92866e63a04",
    }),
    /不支持 Open ID/,
  );
  assert.throws(
    () => service.normalizeRequest("company_1", {
      source_kind: "document",
      target: "CmTHwndaGi6Uask3bvRcyDYInhf",
    }),
    /完整的 https:\/\//,
  );
  assert.equal(
    service.normalizeRequest("company_1", {
      source_kind: "document",
      target: "https://example.feishu.cn/wiki/CmTHwndaGi6Uask3bvRcyDYInhf",
    }).target,
    "https://example.feishu.cn/wiki/CmTHwndaGi6Uask3bvRcyDYInhf",
  );
});

test("legacy Feishu sync configuration keeps the controlled import available after upgrade", () => {
  const service = new FeishuImportTaskService({
    env: envReader({ FEISHU_SYNC_ENABLED: "true" }),
    salesService: {
      requireCompany() {
        return { id: "company-1" };
      },
    },
  });

  assert.deepEqual(service.status(), {
    available: true,
    supported_sources: ["conversation", "document"],
  });
});
