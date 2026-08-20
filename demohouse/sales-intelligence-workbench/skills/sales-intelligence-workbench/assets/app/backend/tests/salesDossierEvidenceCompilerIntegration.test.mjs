import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDossierEvidencePack,
} from "../src/evidence/salesEvidence.js";
import {
  SalesService,
} from "../src/services/salesService.js";

const COMPANY = {
  id: "company_fictional_cloud",
  name: "云穹矩阵科技有限公司",
  initial: "云",
  industry: "企业软件",
  location: "北京",
  tags: [],
  progress: {
    label: "新商机",
    summary: "待生成档案",
    evidence: "尚未生成",
    updated_at: null,
  },
  dossier_ids: [],
  material_ids: [],
  qa_session_id: "sales-company_fictional_cloud",
};

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
      [COMPANY.id]: structuredClone(COMPANY),
    },
    dossiers: {},
    materials: {},
    qa_messages: { [COMPANY.id]: [] },
    sync_sources: {},
    sync_checkpoints: {},
    jobs: {},
  };
}

function fullEvidencePack() {
  return buildDossierEvidencePack({
    company: {
      ...COMPANY,
      unified_social_credit_code: "91110000MA0CLOUD01",
    },
    generatedAt: "2026-07-31T10:00:00.000Z",
    collected: {
      professional: [
        {
          label: "企业工商数据库",
          query: "云穹矩阵科技有限公司 企业工商信息",
          summary: [
            "公司名称：云穹矩阵科技有限公司；",
            "统一社会信用代码：91110000MA0CLOUD01；",
            "经营范围：企业软件与知识库产品。",
          ].join(""),
          source_group: "business",
        },
        {
          label: "企业风险数据库",
          query: "云穹矩阵科技有限公司 风险信息",
          summary: "云穹矩阵科技有限公司披露项目交付周期延长，需要核验实施排期。",
          source_group: "risk",
        },
        {
          label: "企业经营数据库",
          query: "云穹矩阵科技有限公司 经营动态",
          summary: "云穹矩阵科技有限公司持续升级知识库产品与企业协作检索能力。",
          source_group: "market",
        },
      ],
      public_sources: [{
        label: "云穹矩阵产品升级公告",
        summary: "2026年7月30日，云穹矩阵科技有限公司披露知识库产品升级进展。",
        url: "https://official.example.com/cloud-product-update",
        site_name: "虚构企业官网",
        published_at: "2026-07-30T08:00:00.000Z",
        official: true,
      }],
    },
  });
}

function sectionResponse(request) {
  const evidenceBySection = request.payload.evidence_by_section;
  const evidenceId = (key, predicate = () => true) => {
    const atom = evidenceBySection[key].allowed_evidence.find(predicate)
      || evidenceBySection[key].allowed_evidence[0];
    assert.ok(atom, `${key} must have allowed evidence`);
    return atom.id;
  };
  return {
    sections: {
      company_overview: {
        text: "云穹矩阵科技有限公司经营企业软件与知识库产品。",
        evidence_ids: [evidenceId("company_overview", (atom) => atom.quote.includes("经营范围"))],
      },
      business_dynamics: {
        text: "云穹矩阵科技有限公司持续升级知识库产品与企业协作检索能力。",
        evidence_ids: [evidenceId("business_dynamics", (atom) => atom.quote.includes("持续升级"))],
      },
      recent_public_updates: {
        text: "2026年7月30日，云穹矩阵科技有限公司披露知识库产品升级进展。",
        evidence_ids: [evidenceId("recent_public_updates")],
      },
      risk_attention: {
        text: "云穹矩阵科技有限公司披露项目交付周期延长，需要核验实施排期。",
        evidence_ids: [evidenceId("risk_attention")],
      },
      sales_opportunity: {
        text: "知识库产品升级形成销售沟通窗口，但不代表企业已有采购意向。",
        evidence_ids: [evidenceId("sales_opportunity", (atom) => atom.quote.includes("持续升级"))],
      },
      recommended_actions: {
        text: "销售人员应联系产品负责人核验知识库产品升级范围和实施排期。",
        evidence_ids: [evidenceId("recommended_actions", (atom) => atom.quote.includes("持续升级"))],
      },
    },
  };
}

test("SalesService compiles evidence before the Agent and persists server-derived citations", async () => {
  const modelCalls = [];
  const service = new SalesService({
    env: envReader({ APP_WORKSPACE_ID: "workspace-test" }),
    runtimePolicy: { fail_closed: true },
    seed: seed(),
    modelProvider: {
      isRunEnabled: () => true,
      async callRequiredFunction(request) {
        modelCalls.push(structuredClone(request));
        return {
          ok: true,
          parsed: sectionResponse(request),
          raw_ref: "model:atom-contract",
        };
      },
    },
  });

  const dossier = await service.generateDossierWithModel(
    service.data.companies[COMPANY.id],
    fullEvidencePack(),
    [],
  );

  assert.equal(modelCalls.length, 1);
  assert.ok(modelCalls[0].payload.evidence_by_section);
  assert.equal(modelCalls[0].payload.citations, undefined);
  assert.equal(modelCalls[0].payload.allowed_citation_ids, undefined);
  assert.doesNotMatch(JSON.stringify(modelCalls[0].parameters), /quote|citation_id|url/iu);
  assert.equal(dossier.body.length, 6);
  assert.ok(dossier.body.every((section) => (
    section.segments.length === 1
    && section.segments[0].citation_ids.length >= 1
    && section.citation_ids.length >= 1
  )));
  assert.ok(dossier.citations.length >= 4);
  assert.equal(dossier.body[2].text.startsWith("近期公开动态："), true);
});

test("SalesService completes six grounded sections when only legal-entity evidence is available", async () => {
  let modelCalls = 0;
  const sparsePack = buildDossierEvidencePack({
    company: {
      ...COMPANY,
      unified_social_credit_code: "91110000MA0CLOUD01",
    },
    generatedAt: "2026-07-31T10:00:00.000Z",
    collected: {
      professional: [{
        label: "企业工商数据库",
        query: "云穹矩阵科技有限公司 企业工商信息",
        summary: "公司名称：云穹矩阵科技有限公司；统一社会信用代码：91110000MA0CLOUD01；经营范围：企业软件。",
      }],
    },
  });
  const service = new SalesService({
    env: envReader({ APP_WORKSPACE_ID: "workspace-test" }),
    runtimePolicy: { fail_closed: true },
    seed: seed(),
    modelProvider: {
      isRunEnabled: () => true,
      async callRequiredFunction(request) {
        modelCalls += 1;
        const evidenceId = (key) => (
          request.payload.evidence_by_section[key].allowed_evidence[0].id
        );
        return {
          ok: true,
          parsed: {
            sections: {
              company_overview: {
                text: "云穹矩阵科技有限公司的经营范围包括企业软件。",
                evidence_ids: [evidenceId("company_overview")],
              },
              business_dynamics: {
                text: "该企业从事企业软件相关经营活动。",
                evidence_ids: [evidenceId("business_dynamics")],
              },
              recent_public_updates: {
                text: "该企业当前公开登记的经营范围包含企业软件。",
                evidence_ids: [evidenceId("recent_public_updates")],
              },
              risk_attention: {
                text: "商务推进需要结合企业软件业务核验项目责任边界。",
                evidence_ids: [evidenceId("risk_attention")],
              },
              sales_opportunity: {
                text: "企业软件业务可形成方案沟通场景，但不代表企业已有采购意向。",
                evidence_ids: [evidenceId("sales_opportunity")],
              },
              recommended_actions: {
                text: "销售人员应围绕企业软件业务联系相关负责人，确认实际应用场景和决策流程。",
                evidence_ids: [evidenceId("recommended_actions")],
              },
            },
          },
          raw_ref: "model:sparse-grounded",
        };
      },
    },
  });

  const dossier = await service.generateDossierWithModel(
    service.data.companies[COMPANY.id],
    sparsePack,
    [],
  );

  assert.equal(modelCalls, 1);
  assert.equal(dossier.body.length, 6);
  assert.ok(dossier.body.every((section) => (
    section.segments.length === 1
    && section.segments[0].citation_ids.length === 1
  )));
});
