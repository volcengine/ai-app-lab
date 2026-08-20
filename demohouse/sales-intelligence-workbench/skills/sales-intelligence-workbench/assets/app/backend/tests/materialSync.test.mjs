import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMaterialSyncIdentity,
  makeMaterialContentHash,
  makeMaterialId,
  makeSyncSourceId,
  mergeSourceItems,
  normalizeExternalId,
  renderSourceItems,
} from "../src/sync/materialSync.js";

test("Feishu document URLs resolve to one stable source and material identity", () => {
  const first = buildMaterialSyncIdentity("company-1", {
    title: "销售方案",
    source_type: "飞书云文档",
    source_url: "https://example.feishu.cn/wiki/AbCdEf?from=copy#section",
  });
  const second = buildMaterialSyncIdentity("company-1", {
    title: "销售方案（改名）",
    source: {
      type: "feishu_doc",
      external_id: "AbCdEf",
    },
  });

  assert.equal(normalizeExternalId("feishu_doc", first.source_url), "AbCdEf");
  assert.equal(first.source_id, second.source_id);
  assert.equal(first.material_id, second.material_id);
  assert.equal(first.source_type, "feishu_doc");
});

test("stable identifiers are isolated by source and company", () => {
  const sourceA = makeSyncSourceId("feishu_chat", "oc_a");
  const sourceB = makeSyncSourceId("feishu_chat", "oc_b");

  assert.notEqual(sourceA, sourceB);
  assert.notEqual(makeMaterialId("company-a", sourceA), makeMaterialId("company-b", sourceA));
});

test("material hashes ignore line-ending noise but change with business content", () => {
  const first = makeMaterialContentHash({ title: "纪要", text: "第一行\r\n第二行" });
  const same = makeMaterialContentHash({ title: "纪要", text: "第一行\n第二行" });
  const changed = makeMaterialContentHash({ title: "纪要", text: "第一行\n内容已更新" });

  assert.equal(first, same);
  assert.notEqual(first, changed);
});

test("incremental message items merge by message id and honor deletions", () => {
  const merged = mergeSourceItems(
    [
      { id: "om_1", occurred_at: "2026-07-20T10:00:00Z", sender: "甲", content: "旧内容" },
      { id: "om_2", occurred_at: "2026-07-20T11:00:00Z", sender: "乙", content: "待删除" },
    ],
    [
      { id: "om_1", occurred_at: "2026-07-20T10:00:00Z", sender: "甲", content: "更新内容" },
      { id: "om_2", deleted: true },
      { id: "om_3", occurred_at: "2026-07-20T12:00:00Z", sender: "乙", content: "新增内容" },
    ],
  );

  assert.deepEqual(merged.map((item) => item.id), ["om_1", "om_3"]);
  assert.match(renderSourceItems(merged), /更新内容/);
  assert.doesNotMatch(renderSourceItems(merged), /待删除/);
});

