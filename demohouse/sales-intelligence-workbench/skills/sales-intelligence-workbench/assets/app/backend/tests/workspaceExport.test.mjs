import assert from "node:assert/strict";
import test from "node:test";

import { SalesService } from "../src/services/salesService.js";

const FORBIDDEN_KEYS = new Set([
  "access_token",
  "api_key",
  "lease_token",
  "openviking_ref",
  "openviking_uri",
  "password",
  "prompt",
  "raw_ref",
  "refresh_token",
  "reservation_id",
  "secret",
  "service_role_key",
  "worker_id",
]);

function privatePaths(value, current = "$", found = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => privatePaths(item, `${current}[${index}]`, found));
    return found;
  }
  if (!value || typeof value !== "object") return found;
  for (const [key, item] of Object.entries(value)) {
    const next = `${current}.${key}`;
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) found.push(next);
    privatePaths(item, next, found);
  }
  return found;
}

function envReader() {
  return {
    value(name, fallback = "") {
      return name === "APP_WORKSPACE_ID" ? "workspace-test" : fallback;
    },
  };
}

test("workspace export retains portable business content and removes runtime internals", () => {
  const service = new SalesService({
    env: envReader(),
    runtimePolicy: {
      fail_closed: false,
    },
    seed: {
      goals: [{
        id: "goal-1",
        name: "授权客户跟进",
        description: "测试目标",
        keywords: ["知识库"],
        company_ids: ["company-1"],
        candidate_ids: ["company-1"],
        created_at: "2026-07-23T08:00:00.000Z",
        updated_at: "2026-07-23T08:00:00.000Z",
      }],
      companies: {
        "company-1": {
          id: "company-1",
          name: "测试科技有限公司",
          industry: "企业软件",
          identity_status: "verified",
          progress: { label: "需求确认", summary: "确认数据边界", evidence: "会议纪要" },
          dossier_ids: ["dossier-1"],
          material_ids: ["material-1"],
          qa_session_id: "qa-company-1",
        },
      },
      dossiers: {
        "dossier-1": {
          id: "dossier-1",
          company_id: "company-1",
          title: "测试科技有限公司最新档案",
          summary: "已确认企业主体。",
          body: [{ text: "企业主体已核验。", citation_ids: ["source-1"] }],
          citations: [{
            id: "source-1",
            label: "专业数据库",
            source_kind: "专业数据集",
            raw_ref: "must-not-export",
          }],
          openviking_uri: "viking://must-not-export",
          version_no: 1,
          created_at: "2026-07-23T08:10:00.000Z",
        },
      },
      materials: {
        "material-1": {
          id: "material-1",
          company_id: "company-1",
          title: "获授权会议纪要",
          summary: "客户要求明确数据边界。",
          text: "客户要求明确数据边界，并确认后续试点范围。",
          source_type: "feishu_chat",
          source_id: "source-material-1",
          source_external_id: "chat-stable-id",
          source_version: "v1",
          source_items: [{
            id: "message-1",
            sender: "授权测试用户",
            content: "请先确认数据边界。",
            occurred_at: "2026-07-23T08:05:00.000Z",
          }],
          openviking_uri: "viking://must-not-export/material",
          openviking_ref: "must-not-export",
          updated_at: "2026-07-23T08:05:00.000Z",
        },
      },
      qa_messages: {
        "company-1": [{
          id: "qa-1",
          role: "assistant",
          text: "客户关注数据边界。",
          citation_ids: ["material:material-1"],
          citations: [],
          raw_ref: "must-not-export",
          created_at: "2026-07-23T08:20:00.000Z",
        }],
      },
      sync_sources: {
        "source-material-1": {
          id: "source-material-1",
          source_type: "feishu_chat",
          external_id: "chat-stable-id",
          display_name: "获授权会议纪要",
          status: "active",
          secret_ref: "must-not-export",
          updated_at: "2026-07-23T08:05:00.000Z",
        },
      },
      sync_checkpoints: {},
      jobs: {
        "job-private": {
          id: "job-private",
          worker_id: "must-not-export",
          reservation_id: "must-not-export",
        },
      },
    },
  });

  const exported = service.exportWorkspaceData();

  assert.equal(exported.format_version, 1);
  assert.equal(exported.contains_private_business_data, true);
  assert.deepEqual(exported.goals[0].target_enterprise_ids, ["company-1"]);
  assert.equal(exported.enterprises[0].materials[0].raw_text, "客户要求明确数据边界，并确认后续试点范围。");
  assert.equal(exported.enterprises[0].materials[0].source_items[0].id, "message-1");
  assert.equal(exported.enterprises[0].qa.messages[0].text, "客户关注数据边界。");
  assert.deepEqual(privatePaths(exported), []);
  assert.doesNotMatch(JSON.stringify(exported), /viking:\/\/|must-not-export|job-private/);
});
