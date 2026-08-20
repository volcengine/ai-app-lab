import { createHash } from "node:crypto";

import {
  extractGroundingDates,
  extractGroundingEventFamilies,
  extractGroundingNumbers,
  extractGroundingOrganizations,
} from "./claimGrounding.js";

const SECTION_KEYS = Object.freeze([
  "company_overview",
  "business_dynamics",
  "recent_public_updates",
  "risk_attention",
  "sales_opportunity",
  "recommended_actions",
]);

const ENTITY_MATCHES = new Set([
  "verified",
  "alias_scoped",
  "query_bound",
  "company_scoped",
  "unverified",
]);

const MAX_ATOM_CHARS = 360;
const MIN_ATOM_CHARS = 8;

const NAVIGATION_OR_STATUS_PATTERNS = Object.freeze([
  /^(?:首页|当前位置|导航|菜单|产品中心)(?:\s*[>›»/|~-]\s*.*)+$/iu,
  /^(?:正在|开始)?搜索(?:中|相关结果)?|请稍候|加载更多|暂无结果|点击查看|查看更多|返回首页/iu,
  /(?:人机验证|安全验证|访问验证|验证码页面|页面不存在|内容已下线)/iu,
]);

const SENSITIVE_CONTENT_PATTERNS = Object.freeze([
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/iu,
  /\b(?:api[_ -]?key|service[_ -]?role(?:[_ -]?key)?|access[_ -]?token|refresh[_ -]?token|password|cookie|authorization|client[_ -]?secret)\s*[:=]\s*[^\s，。；;]{8,}/iu,
  /[A-Za-z]:\\Users\\[^\s"'，。；;)]+/iu,
  /\bviking:\/\/[^\s"'，。；;)]+/iu,
]);

const PREDICATE_PATTERN = /公司名称|统一社会信用代码|法定代表人|注册资本|成立日期|经营范围|主营|是|为|于|在|由|有|提供|负责|发布|推出|完成|启动|计划|确认|记录|入选|中标|招标|采购|成交|候选|公示|供应|合作|签署|协议|合同|交付|部署|上线|投产|量产|扩产|建设|落地|融资|投资|回购|营收|收入|利润|估值|处罚|诉讼|失信|异常|召回|事故|整改|监管|受到|存在|显示|披露|增长|下降|达到|进入|核验|说明|通过/iu;
const ENGLISH_PREDICATE_PATTERN = /\b(?:is|are|was|were|has|have|will|remains|released|announced|provides|reported)\b/iu;

const PROTECTED_VALUE_PATTERNS = Object.freeze([
  /20\d{2}年\d{1,2}月\d{1,2}日/gu,
  /\b20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/gu,
  /(?:人民币|美元)?\s*\d[\d,.]*(?:\.\d+)?\s*(?:%|％|亿元|万元|元|亿|万|MW|MWh|GWh|GW|kW|kWh|套|项|个|条|份|家|台|辆|人|股|吨|亩|平方米|座|次)/giu,
  /[0-9A-Z]{18}/gu,
  /[\p{Script=Han}A-Za-z0-9（）()·]{2,40}(?:股份有限公司|有限责任公司|集团有限公司|有限公司)/gu,
]);

function digest(value) {
  return createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function stringValue(value, maxLength = 12000) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, " ")
    .slice(0, maxLength);
}

function normalizedText(value, maxLength = 12000) {
  return stringValue(value, maxLength * 2)
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

function uniqueSorted(values = []) {
  return [...new Set(values.filter(Boolean).map(String))].sort((left, right) => (
    left.localeCompare(right, "zh-CN")
  ));
}

function unixPathIsInsideHttpUrl(input, pathIndex) {
  const prefix = input.slice(0, pathIndex);
  return /https?:\/\/[^\s，。！？；;（）()"'<>]*$/iu.test(prefix);
}

function containsLocalAbsolutePath(value) {
  const input = stringValue(value, 20000);
  for (const marker of ["/Users/", "/home/"]) {
    let index = input.indexOf(marker);
    while (index >= 0) {
      if (!unixPathIsInsideHttpUrl(input, index)) return true;
      index = input.indexOf(marker, index + marker.length);
    }
  }
  return /[A-Za-z]:\\Users\\[^\s"'，。；;)]+/iu.test(input);
}

function hasSensitiveContent(value) {
  const input = stringValue(value, 20000);
  return containsLocalAbsolutePath(input)
    || SENSITIVE_CONTENT_PATTERNS.some((pattern) => pattern.test(input));
}

function safeIdentifier(value) {
  const input = normalizedText(value, 240);
  if (!input || hasSensitiveContent(input)) return "";
  return /^[A-Za-z0-9_.:-]+$/u.test(input) ? input : "";
}

function safeTitle(value) {
  const input = normalizedText(value, 240);
  if (!input || hasSensitiveContent(input)) return "";
  return input;
}

function normalizedIso(value) {
  const input = normalizedText(value, 100);
  if (!input) return null;
  const timestamp = new Date(input).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function safeUrl(value) {
  const input = normalizedText(value, 1200);
  if (!/^https?:\/\//iu.test(input)) return null;
  try {
    const url = new URL(input);
    if (/^(?:localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)$/iu.test(url.hostname)) return null;
    url.username = "";
    url.password = "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (
        /^(?:utm_.*|spm|from|source)$/iu.test(key)
        || /(?:token|key|secret|signature|credential|auth)/iu.test(key)
      ) {
        url.searchParams.delete(key);
      }
    }
    return url.toString().replace(/\/$/u, "");
  } catch {
    return null;
  }
}

function safeHostname(value) {
  const url = safeUrl(value);
  if (!url) return "";
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./u, "");
  } catch {
    return "";
  }
}

function normalizedSourceKind(value) {
  const input = normalizedText(value, 80).toLowerCase();
  if (input === "professional" || input.includes("专业数据")) return "professional";
  if (input === "public" || input.includes("联网搜索") || input.includes("公开")) return "public";
  if (input === "internal" || input.includes("内部") || input.includes("飞书")) return "internal";
  return "unknown";
}

function sourceType(item = {}, sourceKind = "unknown") {
  const explicit = normalizedText(item.source_type, 80).toLowerCase();
  if (["datapro", "web", "internal"].includes(explicit)) return explicit;
  if (sourceKind === "professional") return "datapro";
  if (sourceKind === "public") return "web";
  if (sourceKind === "internal") return "internal";
  return "unknown";
}

function reliability(item = {}, sourceKind = "unknown") {
  const quality = normalizedText(item.source_quality, 80).toLowerCase();
  if (quality === "official" || item.official === true) return "primary";
  if (quality === "professional" || sourceKind === "professional") return "professional";
  if (quality === "internal" || sourceKind === "internal") return "internal";
  if (quality === "traceable" || sourceKind === "public") return "public";
  return "limited";
}

function sourceTextSelection(item = {}) {
  const summary = stringValue(item.summary, 20000);
  if (summary.trim()) return { field: "summary", text: summary };
  const excerpt = stringValue(item.excerpt, 20000);
  if (excerpt.trim()) return { field: "excerpt", text: excerpt };
  return { field: null, text: "" };
}

function sourceHash(item = {}, sourceTextField = "", sourceText = "") {
  return digest(JSON.stringify({
    citation_id: normalizedText(item.id || item.evidence_id, 240),
    source_key: normalizedText(item.source_key, 500),
    source_kind: normalizedSourceKind(item.source_kind || item.source_kind_label),
    title: safeTitle(item.label || item.title),
    url: safeUrl(item.url),
    published_at: normalizedIso(item.published_at),
    source_updated_at: normalizedIso(item.source_updated_at),
    source_text_field: sourceTextField,
    source_text: sourceText,
  }));
}

function sourceIndependenceHash(item = {}, citationId = "") {
  const explicit = normalizedText(item.independence_key, 1000).toLowerCase();
  if (explicit) return digest(`explicit:${explicit}`);
  const host = safeHostname(item.url);
  if (host) return digest(`host:${host}`);
  const sourceKey = normalizedText(item.source_key, 1000).toLowerCase();
  if (sourceKey) return digest(`source_key:${sourceKey}`);
  return digest(`citation_id:${citationId}`);
}

function trimRange(sourceText, start, end) {
  let nextStart = start;
  let nextEnd = end;
  while (nextStart < nextEnd && /\s/u.test(sourceText[nextStart])) nextStart += 1;
  while (nextEnd > nextStart && /\s/u.test(sourceText[nextEnd - 1])) nextEnd -= 1;
  return nextStart < nextEnd ? { start: nextStart, end: nextEnd } : null;
}

function isListMarkerPeriod(sourceText, lineStart, index) {
  return /^\s*\d+\.$/u.test(sourceText.slice(lineStart, index + 1));
}

function naturalRanges(sourceText) {
  const ranges = [];
  let lineStart = 0;
  while (lineStart <= sourceText.length) {
    const newline = sourceText.indexOf("\n", lineStart);
    const rawLineEnd = newline === -1 ? sourceText.length : newline;
    const lineEnd = rawLineEnd > lineStart && sourceText[rawLineEnd - 1] === "\r"
      ? rawLineEnd - 1
      : rawLineEnd;
    let segmentStart = lineStart;
    for (let index = lineStart; index < lineEnd; index += 1) {
      const character = sourceText[index];
      const alwaysBoundary = /[。！？!?；;]/u.test(character);
      const periodBoundary = character === "."
        && !isListMarkerPeriod(sourceText, lineStart, index)
        && (index + 1 === lineEnd || /\s/u.test(sourceText[index + 1]))
        && !(/\d/u.test(sourceText[index - 1] || "") && /\d/u.test(sourceText[index + 1] || ""));
      if (!alwaysBoundary && !periodBoundary) continue;
      const range = trimRange(sourceText, segmentStart, index + 1);
      if (range) ranges.push(range);
      segmentStart = index + 1;
    }
    const remaining = trimRange(sourceText, segmentStart, lineEnd);
    if (remaining) ranges.push(remaining);
    if (newline === -1) break;
    lineStart = newline + 1;
  }
  return ranges;
}

function protectedRanges(sourceText, start, end) {
  const input = sourceText.slice(start, end);
  const ranges = [];
  for (const pattern of PROTECTED_VALUE_PATTERNS) {
    const expression = new RegExp(pattern.source, pattern.flags);
    for (const match of input.matchAll(expression)) {
      const matchStart = start + Number(match.index || 0);
      ranges.push({ start: matchStart, end: matchStart + match[0].length });
    }
  }
  return ranges.sort((left, right) => left.start - right.start || left.end - right.end);
}

function boundaryInsideProtectedRange(boundary, ranges) {
  return ranges.find((range) => boundary > range.start && boundary < range.end) || null;
}

function boundedRanges(sourceText, range) {
  if (range.end - range.start <= MAX_ATOM_CHARS) return [range];
  const protectedValues = protectedRanges(sourceText, range.start, range.end);
  const ranges = [];
  let cursor = range.start;
  while (range.end - cursor > MAX_ATOM_CHARS) {
    const minimum = cursor + Math.floor(MAX_ATOM_CHARS * 0.55);
    const target = cursor + MAX_ATOM_CHARS;
    let boundary = -1;
    for (let index = target; index >= minimum; index -= 1) {
      if (/[，,、：:\s]/u.test(sourceText[index - 1] || "")) {
        boundary = index;
        break;
      }
    }
    if (boundary < 0) boundary = target;
    const protectedValue = boundaryInsideProtectedRange(boundary, protectedValues);
    if (protectedValue) boundary = protectedValue.end;
    if (boundary <= cursor) boundary = Math.min(range.end, cursor + MAX_ATOM_CHARS);
    const next = trimRange(sourceText, cursor, boundary);
    if (next) ranges.push(next);
    cursor = boundary;
    while (cursor < range.end && /\s/u.test(sourceText[cursor])) cursor += 1;
  }
  const remaining = trimRange(sourceText, cursor, range.end);
  if (remaining) ranges.push(remaining);
  return ranges;
}

function segmentRanges(sourceText) {
  return naturalRanges(sourceText).flatMap((range) => {
    const bounded = range.end - range.start > MAX_ATOM_CHARS;
    return boundedRanges(sourceText, range).map((item) => ({ ...item, bounded }));
  });
}

function rejectionReason(quote, { bounded = false } = {}) {
  const normalized = normalizedText(quote, MAX_ATOM_CHARS * 2);
  if (!normalized) return "empty_content";
  if (hasSensitiveContent(quote)) return "sensitive_content";
  if (NAVIGATION_OR_STATUS_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "navigation_or_search_status";
  }
  if (normalized.length < MIN_ATOM_CHARS) return "non_substantive_fragment";
  const hasPredicate = PREDICATE_PATTERN.test(normalized)
    || ENGLISH_PREDICATE_PATTERN.test(normalized);
  const hasGroundingSignal = extractGroundingDates(normalized).length > 0
    || extractGroundingNumbers(normalized).length > 0
    || extractGroundingEventFamilies(normalized).length > 0;
  return hasPredicate || hasGroundingSignal || bounded ? "" : "non_substantive_fragment";
}

function entityAliases(entity = {}) {
  const values = [
    entity.canonical_name,
    ...(Array.isArray(entity.strict_aliases) ? entity.strict_aliases : []),
    ...(Array.isArray(entity.contextual_aliases) ? entity.contextual_aliases : []),
    ...(Array.isArray(entity.aliases) ? entity.aliases : []),
  ];
  return uniqueSorted(values.map((value) => normalizedText(value, 200)))
    .sort((left, right) => right.length - left.length || left.localeCompare(right, "zh-CN"));
}

function extractedCompanyOrganizations(quote) {
  const organizations = [];
  const suffixExpression = /股份有限公司|有限责任公司|集团有限公司|有限公司/gu;
  for (const suffixMatch of quote.matchAll(suffixExpression)) {
    const suffixStart = Number(suffixMatch.index || 0);
    const contextStart = Math.max(0, suffixStart - 40);
    const context = quote.slice(contextStart, suffixStart);
    const boundaries = [
      ...context.matchAll(/[，。！？；;、：:\s]|关注|涉及|关联|关于|公示|披露|显示|入选|中标|处罚|诉讼|与|和|对|由|及/gu),
    ];
    const boundary = boundaries.at(-1);
    const prefixSource = boundary
      ? context.slice(Number(boundary.index || 0) + boundary[0].length)
      : context;
    const prefix = prefixSource.match(/[\p{Script=Han}A-Za-z0-9（）()·]{2,30}$/u)?.[0] || "";
    if (prefix) organizations.push(`${prefix}${suffixMatch[0]}`);
  }
  return organizations;
}

function companyOrganizations(quote, entity = {}) {
  const values = [...extractedCompanyOrganizations(quote)];
  const canonicalName = normalizedText(entity.canonical_name, 200);
  if (canonicalName && normalizedText(quote, 2000).includes(canonicalName)) {
    values.push(canonicalName);
  }
  return uniqueSorted(values);
}

function riskSubjectStronglyAnchored(quote, entity = {}) {
  const canonicalName = normalizedText(entity.canonical_name, 200);
  const eventIndex = quote.search(/处罚|诉讼|失信|异常|召回|事故|整改|监管/iu);
  if (!canonicalName || eventIndex < 0) return false;
  const organizations = uniqueSorted([
    ...extractGroundingOrganizations(quote),
    ...companyOrganizations(quote, entity),
  ]);
  const preceding = organizations
    .map((organization) => ({
      organization,
      index: quote.lastIndexOf(organization, eventIndex),
    }))
    .filter((item) => item.index >= 0)
    .sort((left, right) => right.index - left.index);
  return preceding[0]?.organization === canonicalName;
}

function entityMetadata(item = {}, quote = "", entity = {}, eventFamilies = []) {
  const normalizedQuote = normalizedText(quote, 2000);
  const canonicalName = normalizedText(entity.canonical_name, 200);
  const creditCode = normalizedText(entity?.identifiers?.unified_social_credit_code, 80);
  const aliases = entityAliases(entity);
  const anchors = [];
  if (canonicalName && normalizedQuote.includes(canonicalName)) anchors.push(canonicalName);
  if (creditCode && normalizedQuote.includes(creditCode)) anchors.push(creditCode);
  for (const alias of aliases) {
    if (
      alias
      && alias !== canonicalName
      && normalizedQuote.includes(alias)
      && !anchors.includes(alias)
    ) {
      anchors.push(alias);
    }
  }

  const provided = ENTITY_MATCHES.has(String(item.entity_match))
    ? String(item.entity_match)
    : "unverified";
  const strongAnchor = Boolean(
    (canonicalName && normalizedQuote.includes(canonicalName))
    || (creditCode && normalizedQuote.includes(creditCode))
  );
  if (eventFamilies.includes("risk")) {
    if (provided === "company_scoped") {
      return { entity_match: "company_scoped", entity_anchors: anchors };
    }
    return {
      entity_match: strongAnchor && riskSubjectStronglyAnchored(quote, entity)
        ? "verified"
        : "unverified",
      entity_anchors: anchors,
    };
  }
  if (strongAnchor) return { entity_match: "verified", entity_anchors: anchors };
  if (anchors.length) return { entity_match: "alias_scoped", entity_anchors: anchors };
  if (provided === "verified" && normalizedSourceKind(item.source_kind) === "professional") {
    return { entity_match: "verified", entity_anchors: [] };
  }
  return { entity_match: provided, entity_anchors: [] };
}

function sectionCandidates({
  quote,
  sourceContext,
  sourceKind,
  dates,
  eventFamilies,
  conflictFields,
} = {}) {
  const text = normalizedText(quote, 2000);
  const context = normalizedText(sourceContext, 500);
  const selected = new Set();
  const overview = /公司名称|统一社会信用代码|法定代表人|注册资本|成立日期|注册地址|经营范围|主营业务|主营|企业简介/iu.test(text)
    || /企业工商数据库|工商信息|business/iu.test(context);
  const business = /经营|业务|项目|产品|产能|供应链|招标|中标|采购|成交|合作|签署|合同|交付|部署|上线|发布|推出|营收|收入|利润|融资|投资|回购/iu.test(text)
    || eventFamilies.some((family) => family !== "risk")
    || /产品|项目|合作|交付|经营|业务|更新/iu.test(context);
  const recent = sourceKind === "public"
    && (
      dates.length > 0
      || eventFamilies.length > 0
      || /近日|近期|公告|动态|进展/iu.test(text)
      || /公告|动态|更新|进展/iu.test(context)
    );
  const risk = eventFamilies.includes("risk")
    || eventFamilies.includes("delivery")
    || conflictFields.length > 0
    || /企业风险数据库|风险数据|风险记录|risk/iu.test(context)
    || /风险|处罚|诉讼|失信|异常|召回|事故|整改|监管|争议/iu.test(text);

  if (overview) selected.add("company_overview");
  if (business) selected.add("business_dynamics");
  if (recent) selected.add("recent_public_updates");
  if (risk) selected.add("risk_attention");
  if (business && !risk) selected.add("sales_opportunity");
  if (business || risk || overview) selected.add("recommended_actions");

  if (!selected.size && sourceKind === "professional") selected.add("company_overview");
  if (!selected.size && sourceKind === "public") selected.add("recent_public_updates");

  return SECTION_KEYS.filter((key) => selected.has(key));
}

function atomScore({
  entityMatch,
  reliabilityLabel,
  url,
  dates,
  numbers,
  organizations,
  eventFamilies,
  conflictFields,
} = {}) {
  const entityScores = {
    verified: 35,
    company_scoped: 24,
    alias_scoped: 18,
    query_bound: 12,
    unverified: -15,
  };
  const reliabilityScores = {
    primary: 30,
    professional: 28,
    internal: 20,
    public: 18,
    limited: 6,
  };
  const value = Number(entityScores[entityMatch] || 0)
    + Number(reliabilityScores[reliabilityLabel] || 0)
    + (url ? 5 : 0)
    + Math.min(8, dates.length * 4)
    + Math.min(8, numbers.length * 2)
    + Math.min(6, organizations.length * 2)
    + Math.min(8, eventFamilies.length * 4)
    - Math.min(12, conflictFields.length * 6);
  return Math.max(0, Math.min(100, value));
}

function candidateOrder(left, right) {
  return Number(right.score || 0) - Number(left.score || 0)
    || String(left.source_hash).localeCompare(String(right.source_hash))
    || Number(left.quote_start || 0) - Number(right.quote_start || 0)
    || String(left.id).localeCompare(String(right.id));
}

function rejectedOrder(left, right) {
  return String(left.source_hash || "").localeCompare(String(right.source_hash || ""))
    || Number(left.quote_start ?? -1) - Number(right.quote_start ?? -1)
    || String(left.reason || "").localeCompare(String(right.reason || ""))
    || String(left.citation_id || "").localeCompare(String(right.citation_id || ""));
}

function diagnosticOrder(left, right) {
  return String(left.code || "").localeCompare(String(right.code || ""))
    || String(left.field || "").localeCompare(String(right.field || ""))
    || String(left.citation_id || "").localeCompare(String(right.citation_id || ""))
    || String(left.atom_id || "").localeCompare(String(right.atom_id || ""));
}

function compileSource(item = {}, packEntity = {}) {
  const citationId = safeIdentifier(item.id || item.evidence_id);
  const selectedText = sourceTextSelection(item);
  const computedSourceHash = sourceHash(item, selectedText.field || "", selectedText.text);
  const rejected = [];
  const diagnostics = [];
  if (!citationId) {
    rejected.push({
      citation_id: null,
      source_hash: computedSourceHash,
      source_text_field: selectedText.field,
      quote_start: null,
      quote_end: null,
      reason: "unsafe_citation_id",
    });
    return { candidates: [], rejected, diagnostics };
  }
  if (!selectedText.field) {
    rejected.push({
      citation_id: citationId,
      source_hash: computedSourceHash,
      source_text_field: null,
      quote_start: null,
      quote_end: null,
      reason: "missing_source_text",
    });
    return { candidates: [], rejected, diagnostics };
  }

  const sourceKind = normalizedSourceKind(item.source_kind || item.source_kind_label);
  const sourceTypeValue = sourceType(item, sourceKind);
  const reliabilityLabel = reliability(item, sourceKind);
  const title = safeTitle(item.label || item.title);
  const url = safeUrl(item.url);
  const publishedAt = normalizedIso(item.published_at);
  const sourceUpdatedAt = normalizedIso(item.source_updated_at);
  const independenceHash = sourceIndependenceHash(item, citationId);
  const conflictFields = uniqueSorted(
    Array.isArray(item.conflict_fields) ? item.conflict_fields.map((field) => (
      safeIdentifier(field)
    )) : [],
  );
  const candidates = [];

  for (const range of segmentRanges(selectedText.text)) {
    const quote = selectedText.text.slice(range.start, range.end);
    const reason = rejectionReason(quote, range);
    if (reason) {
      rejected.push({
        citation_id: citationId,
        source_hash: computedSourceHash,
        source_text_field: selectedText.field,
        quote_start: range.start,
        quote_end: range.end,
        reason,
      });
      continue;
    }

    const dates = uniqueSorted(extractGroundingDates(quote));
    const numbers = uniqueSorted(extractGroundingNumbers(quote));
    const eventFamilies = uniqueSorted(extractGroundingEventFamilies(quote));
    const entityResult = entityMetadata(item, quote, packEntity, eventFamilies);
    const organizations = uniqueSorted([
      ...extractGroundingOrganizations(quote),
      ...companyOrganizations(quote, packEntity),
    ]);
    const sections = sectionCandidates({
      quote,
      sourceContext: `${title} ${item.purpose || ""} ${item.source_group || ""}`,
      sourceKind,
      dates,
      eventFamilies,
      conflictFields,
    });
    const score = atomScore({
      entityMatch: entityResult.entity_match,
      reliabilityLabel,
      url,
      dates,
      numbers,
      organizations,
      eventFamilies,
      conflictFields,
    });
    const atomHash = digest(JSON.stringify({
      citation_id: citationId,
      source_hash: computedSourceHash,
      independence_hash: independenceHash,
      source_text_field: selectedText.field,
      quote_start: range.start,
      quote_end: range.end,
      quote,
    }));
    const atom = {
      id: `E_${atomHash.slice(0, 20)}`,
      citation_id: citationId,
      source_hash: computedSourceHash,
      independence_hash: independenceHash,
      source_kind: sourceKind,
      source_type: sourceTypeValue,
      title,
      url,
      published_at: publishedAt,
      source_updated_at: sourceUpdatedAt,
      source_text_field: selectedText.field,
      quote,
      quote_start: range.start,
      quote_end: range.end,
      normalized_text: normalizedText(quote, MAX_ATOM_CHARS * 2),
      entity_match: entityResult.entity_match,
      entity_anchors: uniqueSorted(entityResult.entity_anchors),
      section_candidates: sections,
      dates,
      numbers,
      organizations,
      event_families: eventFamilies,
      conflict_fields: conflictFields,
      reliability: reliabilityLabel,
      score,
    };
    if (
      eventFamilies.includes("risk")
      && !["verified", "company_scoped"].includes(entityResult.entity_match)
    ) {
      diagnostics.push({
        level: "warning",
        code: "risk_subject_not_strongly_anchored",
        citation_id: citationId,
        atom_id: atom.id,
      });
    }
    candidates.push(atom);
  }

  return { candidates, rejected, diagnostics };
}

function deduplicateCandidates(candidates = []) {
  const accepted = [];
  const rejected = [];
  const byContent = new Map();
  for (const candidate of [...candidates].sort(candidateOrder)) {
    const key = [
      normalizedText(candidate.normalized_text, MAX_ATOM_CHARS * 2).toLowerCase(),
      candidate.independence_hash,
    ].join("\n");
    const duplicate = byContent.get(key);
    if (duplicate) {
      rejected.push({
        citation_id: candidate.citation_id,
        source_hash: candidate.source_hash,
        source_text_field: candidate.source_text_field,
        quote_start: candidate.quote_start,
        quote_end: candidate.quote_end,
        reason: "duplicate_content",
        duplicate_of: duplicate.id,
      });
      continue;
    }
    byContent.set(key, candidate);
    accepted.push(candidate);
  }
  return { atoms: accepted.sort(candidateOrder), rejected };
}

function buildCoverage(atoms = []) {
  return Object.fromEntries(SECTION_KEYS.map((section) => {
    const candidates = atoms.filter((atom) => atom.section_candidates.includes(section));
    const strong = candidates.filter((atom) => {
      if (section === "company_overview") return atom.entity_match === "verified";
      if (section === "risk_attention") {
        return ["verified", "company_scoped"].includes(atom.entity_match);
      }
      return atom.entity_match !== "unverified";
    });
    if (strong.length) {
      return [section, {
        status: "supported",
        atom_ids: strong.map((atom) => atom.id),
        reasons: [],
      }];
    }
    if (candidates.length) {
      return [section, {
        status: "partial",
        atom_ids: candidates.map((atom) => atom.id),
        reasons: ["only_weak_entity_matches"],
      }];
    }
    return [section, {
      status: "missing",
      atom_ids: [],
      reasons: ["no_relevant_atoms"],
    }];
  }));
}

function uniqueDiagnostics(diagnostics = []) {
  const byIdentity = new Map();
  for (const diagnostic of diagnostics) {
    const identity = JSON.stringify(diagnostic);
    if (!byIdentity.has(identity)) byIdentity.set(identity, diagnostic);
  }
  return [...byIdentity.values()].sort(diagnosticOrder);
}

export function compileDossierEvidenceAtoms({ evidencePack = {} } = {}) {
  const pack = evidencePack && typeof evidencePack === "object" ? evidencePack : {};
  const entity = pack.entity && typeof pack.entity === "object" ? pack.entity : {};
  const items = Array.isArray(pack.items) ? pack.items : [];
  const compiled = items.map((item) => compileSource(item, entity));
  const deduplicated = deduplicateCandidates(compiled.flatMap((entry) => entry.candidates));
  const atoms = deduplicated.atoms;
  const coverage = buildCoverage(atoms);
  const diagnostics = [
    ...compiled.flatMap((entry) => entry.diagnostics),
    ...(Array.isArray(pack.conflicts) ? pack.conflicts : [])
      .map((conflict) => safeIdentifier(conflict?.field))
      .filter(Boolean)
      .map((field) => ({
        level: "warning",
        code: "source_conflict",
        field,
      })),
    ...atoms.flatMap((atom) => atom.conflict_fields.map((field) => ({
      level: "warning",
      code: "source_conflict",
      field,
      citation_id: atom.citation_id,
      atom_id: atom.id,
    }))),
    ...Object.entries(coverage)
      .filter(([, value]) => value.status !== "supported")
      .map(([section, value]) => ({
        level: "info",
        code: "coverage_gap",
        section,
        status: value.status,
      })),
  ];

  return {
    atoms,
    rejected: [
      ...compiled.flatMap((entry) => entry.rejected),
      ...deduplicated.rejected,
    ].sort(rejectedOrder),
    coverage,
    diagnostics: uniqueDiagnostics(diagnostics),
  };
}
