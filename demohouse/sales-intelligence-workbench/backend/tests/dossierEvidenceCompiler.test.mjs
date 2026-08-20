import assert from "node:assert/strict";
import test from "node:test";

import {
  compileDossierEvidenceAtoms,
} from "../src/evidence/dossierEvidenceCompiler.js";

const ENTITY = Object.freeze({
  id: "company_fictional_matrix",
  canonical_name: "云岚矩阵科技有限公司",
  normalized_name: "云岚矩阵科技有限公司",
  aliases: ["云岚矩阵科技有限公司", "云岚矩阵", "云岚"],
  strict_aliases: ["云岚矩阵科技有限公司", "云岚矩阵"],
  contextual_aliases: ["云岚"],
  identifiers: {
    unified_social_credit_code: "91110000MA0FAKE001",
  },
});

const unixPath = (...parts) => ["", ...parts].join("/");
const macosPrivatePath = unixPath("Users", "example", "private.env");
const macosProviderPath = unixPath("Users", "example", "private", "provider.json");
const macosIndependencePath = unixPath("Users", "fictional", "private-record.json");
const linuxPrivatePath = unixPath("home", "example", "private.json");
const windowsPrivatePath = ["C:", "Users", "example", "secret.env"].join("\\");

function source(overrides = {}) {
  const id = overrides.id || "evidence_professional_business";
  return {
    id,
    source_key: overrides.source_key || `source:${id}`,
    source_kind: "professional",
    source_kind_label: "专业数据集",
    label: "虚构企业工商记录",
    summary: [
      "公司名称：云岚矩阵科技有限公司；",
      "统一社会信用代码：91110000MA0FAKE001；",
      "经营范围：企业软件技术服务。",
    ].join(""),
    excerpt: "",
    url: "",
    published_at: null,
    source_updated_at: "2026-07-30T08:00:00.000Z",
    entity_match: "verified",
    source_quality: "professional",
    quality_tier: 1,
    official: true,
    freshness: "current",
    independence_key: `independence:${id}`,
    conflict_fields: [],
    provider: "datapro",
    raw_ref: "",
    ...overrides,
  };
}

function evidencePack(items, overrides = {}) {
  return {
    entity: structuredClone(ENTITY),
    items,
    rejected: [],
    conflicts: [],
    policy: {},
    ...overrides,
  };
}

function compile(items, overrides = {}) {
  return compileDossierEvidenceAtoms({
    evidencePack: evidencePack(items, overrides),
  });
}

function atomSourceText(atom, pack) {
  const item = pack.items.find((candidate) => String(candidate.id) === atom.citation_id);
  return String(item?.[atom.source_text_field] || "");
}

test("compiler is deterministic for repeated identical input", () => {
  const pack = evidencePack([
    source(),
    source({
      id: "evidence_public_update",
      source_kind: "public",
      source_kind_label: "联网搜索",
      label: "云岚产品更新公告",
      summary: "2026年7月28日，云岚矩阵科技有限公司发布企业软件产品更新。",
      url: "https://news.example.com/matrix-update",
      published_at: "2026-07-28T08:00:00.000Z",
      source_quality: "traceable",
      quality_tier: 2,
      official: false,
    }),
  ]);

  assert.deepEqual(
    compileDossierEvidenceAtoms({ evidencePack: pack }),
    compileDossierEvidenceAtoms({ evidencePack: structuredClone(pack) }),
  );
});

test("source order does not change atom ids or stable output ordering", () => {
  const firstSource = source();
  const secondSource = source({
    id: "evidence_public_procurement",
    source_kind: "public",
    source_kind_label: "联网搜索",
    label: "采购结果公告",
    summary: "2026年7月29日，云岚矩阵科技有限公司入选虚构软件采购项目。",
    url: "https://notice.example.com/procurement",
    published_at: "2026-07-29T08:00:00.000Z",
    source_quality: "official",
    quality_tier: 1,
    official: true,
  });

  const forward = compile([firstSource, secondSource]);
  const reversed = compile([secondSource, firstSource]);

  assert.deepEqual(forward, reversed);
  assert.deepEqual(
    forward.atoms.map((atom) => atom.id),
    reversed.atoms.map((atom) => atom.id),
  );
});

test("every quote can be sliced verbatim from its recorded source field", () => {
  const pack = evidencePack([source()]);
  const result = compileDossierEvidenceAtoms({ evidencePack: pack });

  assert.ok(result.atoms.length >= 3);
  for (const atom of result.atoms) {
    const sourceText = atomSourceText(atom, pack);
    assert.equal(
      sourceText.slice(atom.quote_start, atom.quote_end),
      atom.quote,
      atom.id,
    );
  }
});

test("Chinese and English sentence punctuation creates natural atom boundaries", () => {
  const item = source({
    summary: [
      "云岚矩阵科技有限公司完成软件版本更新。",
      "客户是否进入下一轮验证？",
      "项目团队确认测试通过！",
      "后续将核验采购范围；",
      "The fictional release remains traceable;",
    ].join(""),
  });
  const result = compile([item]);
  const quotes = result.atoms.map((atom) => atom.quote);

  assert.ok(quotes.includes("云岚矩阵科技有限公司完成软件版本更新。"));
  assert.ok(quotes.includes("客户是否进入下一轮验证？"));
  assert.ok(quotes.includes("项目团队确认测试通过！"));
  assert.ok(quotes.includes("后续将核验采购范围；"));
  assert.ok(quotes.includes("The fictional release remains traceable;"));
});

test("DataPro structured fields remain separate verbatim records", () => {
  const item = source();
  const result = compile([item]);
  const quotes = result.atoms.map((atom) => atom.quote);

  assert.ok(quotes.includes("公司名称：云岚矩阵科技有限公司；"));
  assert.ok(quotes.includes("统一社会信用代码：91110000MA0FAKE001；"));
  assert.ok(quotes.includes("经营范围：企业软件技术服务。"));
  assert.ok(result.atoms.every((atom) => (
    !atom.quote.includes("；统一社会信用代码")
  )));
});

test("numbered and bullet list items compile into complete atoms", () => {
  const item = source({
    summary: [
      "1. 云岚矩阵科技有限公司负责虚构平台研发",
      "2、项目团队计划验证数据权限",
      "- 采购团队将核验交付边界",
    ].join("\n"),
  });
  const result = compile([item]);
  const quotes = result.atoms.map((atom) => atom.quote);

  assert.ok(quotes.some((quote) => quote.startsWith("1. ")));
  assert.ok(quotes.some((quote) => quote.startsWith("2、")));
  assert.ok(quotes.some((quote) => quote.startsWith("- ")));
  assert.ok(quotes.every((quote) => !quote.includes("\n")));
});

test("bounded long-sentence splitting preserves dates amounts and legal names", () => {
  const legalName = "云岚矩阵科技有限公司";
  const date = "2026年7月30日";
  const amount = "人民币320万元";
  const item = source({
    summary: `${"虚构技术背景说明，".repeat(30)}${date}${legalName}记录项目金额${amount}`
      + `${"并继续描述测试范围，".repeat(30)}本段结束`,
  });
  const result = compile([item]);

  assert.ok(result.atoms.length > 1);
  assert.ok(result.atoms.some((atom) => atom.quote.includes(legalName)));
  assert.ok(result.atoms.some((atom) => atom.quote.includes(date)));
  assert.ok(result.atoms.some((atom) => atom.quote.includes(amount)));
  assert.ok(result.atoms.every((atom) => atom.quote.length <= 360));
});

test("date amount ratio and quantity metadata are retained", () => {
  const item = source({
    summary: "2026年7月30日，云岚矩阵科技有限公司记录金额320万元、比例18.5%和设备12台。",
  });
  const result = compile([item]);
  const atom = result.atoms[0];

  assert.deepEqual(atom.dates, ["2026-07-30"]);
  assert.ok(atom.numbers.includes("320"));
  assert.ok(atom.numbers.includes("18.5"));
  assert.ok(atom.numbers.includes("12"));
});

test("legal name and unified social credit code remain strong entity anchors", () => {
  const result = compile([source()]);
  const legalNameAtom = result.atoms.find((atom) => atom.quote.includes(ENTITY.canonical_name));
  const creditCodeAtom = result.atoms.find((atom) => (
    atom.quote.includes(ENTITY.identifiers.unified_social_credit_code)
  ));

  assert.equal(legalNameAtom.entity_match, "verified");
  assert.ok(legalNameAtom.entity_anchors.includes(ENTITY.canonical_name));
  assert.equal(creditCodeAtom.entity_match, "verified");
  assert.ok(creditCodeAtom.entity_anchors.includes(
    ENTITY.identifiers.unified_social_credit_code,
  ));
});

test("brand aliases remain alias_scoped and are not upgraded to legal-entity anchors", () => {
  const item = source({
    id: "evidence_alias_news",
    source_kind: "public",
    source_kind_label: "联网搜索",
    label: "云岚发布虚构产品动态",
    summary: "云岚发布虚构产品动态并介绍测试计划。",
    entity_match: "alias_scoped",
    source_quality: "traceable",
    quality_tier: 2,
    official: false,
    url: "https://news.example.com/alias-update",
  });
  const result = compile([item]);

  assert.equal(result.atoms.length, 1);
  assert.equal(result.atoms[0].entity_match, "alias_scoped");
  assert.deepEqual(result.atoms[0].entity_anchors, ["云岚"]);
});

test("another company's risk fact is never marked as a strong target-company match", () => {
  const item = source({
    id: "evidence_mixed_risk",
    summary: "云岚矩阵科技有限公司关注远川样例科技有限公司受到行政处罚的公开信息。",
    entity_match: "verified",
  });
  const result = compile([item]);
  const riskAtom = result.atoms.find((atom) => atom.quote.includes("行政处罚"));

  assert.ok(riskAtom);
  assert.equal(riskAtom.entity_match, "unverified");
  assert.ok(riskAtom.event_families.includes("risk"));
  assert.ok(result.diagnostics.some((item) => (
    item.code === "risk_subject_not_strongly_anchored"
    && item.atom_id === riskAtom.id
  )));
});

test("parent and subsidiary risk facts do not inherit the target company's identity", () => {
  const result = compile([
    source({
      id: "parent_company_risk",
      summary: "云岚矩阵科技有限公司关注远川控股有限公司受到监管处罚的公开信息。",
      entity_match: "verified",
    }),
    source({
      id: "subsidiary_company_risk",
      summary: "云岚矩阵科技有限公司关注云岚样例子公司有限公司涉及诉讼的公开信息。",
      entity_match: "verified",
    }),
  ]);
  const riskAtoms = result.atoms.filter((atom) => atom.event_families.includes("risk"));

  assert.equal(riskAtoms.length, 2);
  assert.ok(riskAtoms.every((atom) => atom.entity_match === "unverified"));
  assert.ok(result.diagnostics.filter((item) => (
    item.code === "risk_subject_not_strongly_anchored"
  )).length >= 2);
});

test("identical and republished content is deduplicated deterministically", () => {
  const shared = "2026年7月29日，云岚矩阵科技有限公司发布虚构软件更新。";
  const sharedIndependenceKey = "official.example.com/update";
  const official = source({
    id: "evidence_official_reprint",
    source_kind: "public",
    source_kind_label: "联网搜索",
    label: "官方更新",
    summary: shared,
    url: "https://official.example.com/update",
    source_quality: "official",
    quality_tier: 1,
    official: true,
    independence_key: sharedIndependenceKey,
  });
  const reprint = source({
    id: "evidence_media_reprint",
    source_kind: "public",
    source_kind_label: "联网搜索",
    label: "转载更新",
    summary: ` ${shared} `,
    url: "https://media.example.com/reprint",
    source_quality: "traceable",
    quality_tier: 2,
    official: false,
    independence_key: sharedIndependenceKey,
  });
  const forward = compile([reprint, official]);
  const reversed = compile([official, reprint]);

  assert.deepEqual(forward, reversed);
  assert.equal(forward.atoms.filter((atom) => atom.normalized_text.includes("虚构软件更新")).length, 1);
  assert.ok(forward.rejected.some((item) => item.reason === "duplicate_content"));
  assert.equal(
    forward.atoms.find((atom) => atom.normalized_text.includes("虚构软件更新")).citation_id,
    official.id,
  );
});

test("identical content from independent professional and official sources is retained", () => {
  const shared = "云岚矩阵科技有限公司完成虚构软件项目验收。";
  const professional = source({
    id: "independent_professional",
    summary: shared,
    independence_key: "datapro:fictional-business-record",
  });
  const official = source({
    id: "independent_official",
    source_kind: "public",
    source_kind_label: "联网搜索",
    summary: shared,
    url: "https://official.example.com/independent-verification",
    source_quality: "official",
    quality_tier: 1,
    official: true,
    independence_key: "official.example.com:independent-verification",
  });

  const forward = compile([professional, official]);
  const reversed = compile([official, professional]);
  const matching = forward.atoms.filter((atom) => atom.normalized_text === shared);

  assert.deepEqual(forward, reversed);
  assert.equal(matching.length, 2);
  assert.deepEqual(
    new Set(matching.map((atom) => atom.citation_id)),
    new Set([professional.id, official.id]),
  );
  assert.equal(new Set(matching.map((atom) => atom.independence_hash)).size, 2);
});

test("missing independence keys fall back to distinct stable source identities", () => {
  const shared = "云岚矩阵科技有限公司记录虚构产品交付进展。";
  const first = source({
    id: "fallback_domain_one",
    source_kind: "public",
    source_kind_label: "联网搜索",
    summary: shared,
    url: "https://one.example.com/update",
    independence_key: "",
  });
  const second = source({
    id: "fallback_domain_two",
    source_kind: "public",
    source_kind_label: "联网搜索",
    summary: shared,
    url: "https://two.example.com/update",
    independence_key: "",
  });
  const result = compile([first, second]);
  const matching = result.atoms.filter((atom) => atom.normalized_text === shared);

  assert.equal(matching.length, 2);
  assert.equal(new Set(matching.map((atom) => atom.independence_hash)).size, 2);
});

test("raw independence keys never enter atom rejected or diagnostic output", () => {
  const privateIndependenceKey = `local-source:${macosIndependencePath}`;
  const result = compile([source({
    id: "private_source_identity",
    independence_key: privateIndependenceKey,
  })]);
  const serialized = JSON.stringify(result);

  assert.ok(result.atoms.every((atom) => /^[a-f0-9]{64}$/u.test(atom.independence_hash)));
  assert.doesNotMatch(serialized, /local-source|\/Users\/fictional|independence_key/);
});

test("empty navigation search-status and title-fragment content is rejected with reasons", () => {
  const result = compile([
    source({ id: "empty", summary: "", excerpt: "" }),
    source({ id: "navigation", summary: "首页 > 产品中心 > 点击查看详情" }),
    source({ id: "search_status", summary: "正在搜索相关结果，请稍候加载更多" }),
    source({ id: "title_fragment", summary: "云岚矩阵公司最新消息" }),
  ]);
  const reasons = new Set(result.rejected.map((item) => item.reason));

  assert.equal(result.atoms.length, 0);
  assert.ok(reasons.has("missing_source_text"));
  assert.ok(reasons.has("navigation_or_search_status"));
  assert.ok(reasons.has("non_substantive_fragment"));
});

test("summary and excerpt origins keep their own exact offsets", () => {
  const summaryItem = source({
    id: "from_summary",
    summary: "云岚矩阵科技有限公司完成虚构产品测试。",
    excerpt: "不应优先使用的摘录。",
  });
  const excerptItem = source({
    id: "from_excerpt",
    summary: "",
    excerpt: "云岚矩阵科技有限公司记录虚构项目进度。",
  });
  const pack = evidencePack([summaryItem, excerptItem]);
  const result = compileDossierEvidenceAtoms({ evidencePack: pack });
  const summaryAtom = result.atoms.find((atom) => atom.citation_id === summaryItem.id);
  const excerptAtom = result.atoms.find((atom) => atom.citation_id === excerptItem.id);

  assert.equal(summaryAtom.source_text_field, "summary");
  assert.equal(excerptAtom.source_text_field, "excerpt");
  assert.equal(
    summaryItem.summary.slice(summaryAtom.quote_start, summaryAtom.quote_end),
    summaryAtom.quote,
  );
  assert.equal(
    excerptItem.excerpt.slice(excerptAtom.quote_start, excerptAtom.quote_end),
    excerptAtom.quote,
  );
});

test("sparse evidence returns partial and missing coverage without global failure", () => {
  const result = compile([source({
    summary: "公司名称：云岚矩阵科技有限公司；经营范围：企业软件技术服务。",
  })]);

  assert.ok(result.atoms.length > 0);
  assert.equal(result.coverage.company_overview.status, "supported");
  assert.ok(["partial", "missing"].includes(result.coverage.recent_public_updates.status));
  assert.ok(["partial", "missing"].includes(result.coverage.risk_attention.status));
  assert.deepEqual(Object.keys(result.coverage), [
    "company_overview",
    "business_dynamics",
    "recent_public_updates",
    "risk_attention",
    "sales_opportunity",
    "recommended_actions",
  ]);
  assert.doesNotMatch(JSON.stringify(result), /risks_and_attention/);
});

test("missing URLs remain null and are never fabricated", () => {
  const result = compile([source({ url: "" })]);

  assert.ok(result.atoms.length > 0);
  assert.ok(result.atoms.every((atom) => atom.url === null));
});

test("source hashes and atoms exclude credentials paths raw refs and runtime randomness", () => {
  const item = source({
    url: "https://evidence.example.com/item?api_key=fake-url-secret&utm_source=test&view=1#token",
    raw_ref: `Bearer fake-secret-value ${macosProviderPath}`,
    provider_response: { token: "fake-provider-token" },
    pid: 12345,
    runtime_log: "private runtime output",
  });
  const first = compile([item]);
  const second = compile([structuredClone(item)]);
  const serialized = JSON.stringify(first);

  assert.deepEqual(first, second);
  assert.doesNotMatch(serialized, /fake-secret|fake-provider|\/Users\/|12345|runtime output/);
  assert.ok(first.atoms.every((atom) => (
    atom.url === "https://evidence.example.com/item?view=1"
  )));
  assert.ok(first.atoms.every((atom) => /^[a-f0-9]{64}$/u.test(atom.source_hash)));
  assert.ok(first.atoms.every((atom) => /^E_[a-f0-9]{20}$/u.test(atom.id)));
});

test("sensitive source text is rejected without echoing the secret or machine path", () => {
  const item = source({
    id: "sensitive_summary",
    summary: `API_KEY=fake-secret-value-1234567890，配置位于${macosPrivatePath}。`,
  });
  const result = compile([item]);
  const serialized = JSON.stringify(result);

  assert.equal(result.atoms.length, 0);
  assert.ok(result.rejected.some((entry) => entry.reason === "sensitive_content"));
  assert.doesNotMatch(serialized, /fake-secret-value|\/Users\/example/);
});

test("local absolute paths adjacent to Chinese text are rejected without being echoed", () => {
  const result = compile([
    source({
      id: "local_users_path",
      summary: `配置位于${macosPrivatePath}。`,
    }),
    source({
      id: "local_home_path",
      summary: `文件保存在${linuxPrivatePath}。`,
    }),
    source({
      id: "local_windows_path",
      summary: `路径为${windowsPrivatePath}。`,
    }),
    source({
      id: "public_url",
      source_kind: "public",
      source_kind_label: "联网搜索",
      summary: "云岚矩阵科技有限公司发布公开资料，访问https://docs.example.com/home/public/info。",
      url: "https://docs.example.com/home/public/info",
    }),
  ]);
  const serialized = JSON.stringify(result);
  const sensitiveRejections = result.rejected.filter((entry) => (
    entry.reason === "sensitive_content"
  ));

  assert.equal(sensitiveRejections.length, 3);
  assert.doesNotMatch(serialized, /\/Users\/example|\/home\/example|C:\\\\Users\\\\example/);
  assert.ok(sensitiveRejections.every((entry) => (
    entry.reason === "sensitive_content"
    && !Object.hasOwn(entry, "quote")
  )));
  assert.ok(result.atoms.some((atom) => (
    atom.citation_id === "public_url"
    && atom.url === "https://docs.example.com/home/public/info"
  )));
});

test("compiler never mutates the input evidence pack", () => {
  const pack = evidencePack([source()]);
  const before = structuredClone(pack);

  compileDossierEvidenceAtoms({ evidencePack: pack });

  assert.deepEqual(pack, before);
});

test("organization and event-family metadata reuse grounding semantics", () => {
  const item = source({
    summary: "2026年7月30日，云海样例银行公示云岚矩阵科技有限公司入选软件采购项目。",
  });
  const result = compile([item]);
  const atom = result.atoms[0];

  assert.ok(atom.organizations.includes("云海样例银行"));
  assert.ok(atom.organizations.includes("云岚矩阵科技有限公司"));
  assert.ok(atom.event_families.includes("procurement"));
});

test("conflict fields are retained as diagnostics without deleting original evidence", () => {
  const item = source({
    summary: "云岚矩阵科技有限公司注册资本为1000万元。",
    conflict_fields: ["registered_capital"],
  });
  const result = compile([item], {
    conflicts: [{
      field: "registered_capital",
      field_label: "注册资本",
      values: [],
    }],
  });

  assert.equal(result.atoms.length, 1);
  assert.deepEqual(result.atoms[0].conflict_fields, ["registered_capital"]);
  assert.ok(result.diagnostics.some((entry) => entry.code === "source_conflict"));
});

test("section candidates are deterministic suggestions and may include multiple chapters", () => {
  const item = source({
    id: "multi_section",
    source_kind: "public",
    source_kind_label: "联网搜索",
    summary: "2026年7月30日，云岚矩阵科技有限公司发布软件产品并启动采购项目。",
    source_quality: "official",
    quality_tier: 1,
    official: true,
    url: "https://official.example.com/multi-section",
  });
  const result = compile([item]);
  const atom = result.atoms[0];

  assert.ok(atom.section_candidates.includes("business_dynamics"));
  assert.ok(atom.section_candidates.includes("recent_public_updates"));
  assert.ok(atom.section_candidates.includes("sales_opportunity"));
  assert.ok(atom.section_candidates.includes("recommended_actions"));
  assert.ok(atom.section_candidates.length > 1);
});

test("coverage does not impose source-count or distinct-source hard floors", () => {
  const result = compile([source({
    summary: [
      "公司名称：云岚矩阵科技有限公司；",
      "经营范围：企业软件技术服务；",
      "2026年7月30日发布虚构产品更新；",
      "项目团队将核验采购范围。",
    ].join(""),
  })]);

  assert.ok(result.atoms.length >= 3);
  assert.ok(Object.values(result.coverage).every((entry) => (
    ["supported", "partial", "missing"].includes(entry.status)
  )));
  assert.ok(result.diagnostics.every((entry) => entry.code !== "insufficient_source_count"));
});
