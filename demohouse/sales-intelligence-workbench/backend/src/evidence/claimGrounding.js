const EVENT_FAMILIES = Object.freeze([
  ["procurement", /中标|招标|采购|成交|候选|公示|入选|供应商/u],
  ["cooperation", /合作|签署|协议|合同|战略伙伴/u],
  ["delivery", /部署|上线|交付|投产|量产|扩产|建设|落地/u],
  ["product", /发布|推出|升级|更新|研发|产品|解决方案/u],
  ["finance", /融资|投资|回购|营收|收入|利润|估值/u],
  ["risk", /处罚|诉讼|失信|异常|召回|事故|整改|监管/u],
]);

const COMMON_UPPERCASE_TOKENS = new Set([
  "AI",
  "API",
  "B2B",
  "CRM",
  "ERP",
  "HTTP",
  "HTTPS",
  "IT",
  "RAG",
  "SaaS",
  "SQL",
]);

function compact(value, maxLength = 4000) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

function comparable(value) {
  return compact(value, 8000)
    .toLowerCase()
    .replace(/\s+/gu, "");
}

function validCalendarDate(year, month, day) {
  const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day));
  if (!Number.isFinite(timestamp)) return "";
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() + 1 !== Number(month)
    || date.getUTCDate() !== Number(day)
  ) {
    return "";
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function extractGroundingDates(value) {
  const input = compact(value, 12000);
  const dates = new Set();
  const patterns = [
    /(?<!\d)(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/gu,
    /(20\d{2})年(\d{1,2})月(\d{1,2})日/gu,
  ];
  for (const pattern of patterns) {
    for (const match of input.matchAll(pattern)) {
      const normalized = validCalendarDate(match[1], match[2], match[3]);
      if (normalized) dates.add(normalized);
    }
  }
  return [...dates];
}

export function extractGroundingNumbers(value) {
  const input = compact(value, 12000);
  const dates = new Set(
    extractGroundingDates(input).flatMap((date) => date.split("-").map((part) => String(Number(part)))),
  );
  const numbers = new Set();
  const matches = input.matchAll(/(?<![A-Za-z0-9])\d[\d,.]*(?![A-Za-z0-9])/gu);
  for (const match of matches) {
    const raw = match[0];
    const normalized = raw.replace(/,/gu, "");
    const digits = normalized.replace(/\D/gu, "");
    const tail = input.slice((match.index || 0) + raw.length, (match.index || 0) + raw.length + 8);
    const head = input.slice(Math.max(0, (match.index || 0) - 8), match.index || 0);
    const hasMaterialUnit = /^(?:\s*(?:%|％|人民币|美元|元|万元|亿元|万|亿|MW|MWh|GWh|GW|kW|kWh|套|项|家|台|辆|人|股|吨|亩|平方米|号))/iu.test(tail)
      || /(?:价格|金额|数量|比例|占比|容量|功率)\s*[(:（：]?\s*$/u.test(head);
    if (digits.length >= 3 || hasMaterialUnit) {
      if (!dates.has(String(Number(digits)))) numbers.add(normalized);
    }
  }
  return [...numbers];
}

function extractUppercaseAnchors(value) {
  return [...new Set(
    compact(value, 12000)
      .match(/\b[A-Z][A-Z0-9-]{2,}\b/gu) || [],
  )].filter((token) => !COMMON_UPPERCASE_TOKENS.has(token));
}

function extractOrganizationAnchorGroups(value) {
  const input = compact(value, 12000);
  const groups = [];
  const suffixPattern = /(银行|大学|学院|研究院|委员会|法院|交易所|政府|集团)/gu;
  for (const match of input.matchAll(suffixPattern)) {
    const suffix = match[0];
    const start = match.index || 0;
    const prefix = input
      .slice(Math.max(0, start - 10), start)
      .match(/[\p{Script=Han}]{2,10}$/u)?.[0] || "";
    if (prefix.length < 2) continue;
    if (
      /(?:可能|或将|预计|将|会|易|可|仍)?(?:受|受到|影响|面向|针对|涉及|属于|依赖于|服务于|联系|核验|确认|关注|评估|建议|跟进|通过|基于|来自|进入|覆盖|支持|帮助|推动)$/u.test(prefix)
      || /^(?:相关|所属|目标|客户|企业|公司|业务|产业|上述)$/u.test(prefix)
    ) {
      continue;
    }
    const candidates = [];
    for (let length = 2; length <= Math.min(prefix.length, 8); length += 1) {
      candidates.push(`${prefix.slice(-length)}${suffix}`);
    }
    groups.push([...new Set(candidates)]);
  }
  return groups;
}

function eventFamilies(value) {
  const input = compact(value, 12000);
  return EVENT_FAMILIES
    .filter(([, pattern]) => pattern.test(input))
    .map(([name]) => name);
}

export function extractGroundingOrganizations(value) {
  return [...new Set(
    extractOrganizationAnchorGroups(value)
      .map((candidates) => candidates.at(-1))
      .filter(Boolean),
  )];
}

export function extractGroundingEventFamilies(value) {
  return eventFamilies(value);
}

function eventFamilyTerm(value, family) {
  const input = compact(value, 12000);
  const entry = EVENT_FAMILIES.find(([name]) => name === family);
  return entry ? input.match(entry[1])?.[0] || "" : "";
}

function withoutIgnoredEntityNames(value, entityNames = []) {
  let output = compact(value, 12000);
  const names = [...new Set(entityNames.map((item) => compact(item, 200)).filter(Boolean))]
    .sort((left, right) => right.length - left.length);
  for (const name of names) output = output.split(name).join(" ");
  return output;
}

function appearsInSupport(anchor, supportTexts) {
  const normalized = comparable(anchor);
  return Boolean(normalized && supportTexts.some((value) => comparable(value).includes(normalized)));
}

function numericAppearsInSupport(anchor, supportTexts) {
  const normalized = comparable(anchor).replace(/[,，]/gu, "");
  return Boolean(normalized && supportTexts.some((value) => (
    comparable(value).replace(/[,，]/gu, "").includes(normalized)
  )));
}

/**
 * Deterministic claim-level guardrail.
 *
 * It does not pretend to solve full natural-language entailment. Instead it
 * blocks the highest-risk forms of unsupported expansion that can be checked
 * without another model call: new dates, material numbers, named uppercase
 * entities, organization names and event-family changes.
 */
export function groundedTextErrors({
  text,
  evidenceTexts = [],
  path = "内容",
  requireEventFamily = false,
  checkOrganizations = true,
  ignoredEntityNames = [],
} = {}) {
  const content = compact(text, 12000);
  const support = evidenceTexts.map((item) => compact(item, 12000)).filter(Boolean);
  const errors = [];
  if (!content || !support.length) return [`${path}缺少可核验的证据片段`];

  for (const date of extractGroundingDates(content)) {
    if (!appearsInSupport(date, support)) {
      const chineseDate = date.replace(/^(\d{4})-(\d{2})-(\d{2})$/u, (_, year, month, day) => (
        `${year}年${Number(month)}月${Number(day)}日`
      ));
      if (!appearsInSupport(chineseDate, support)) errors.push(`${path}中的日期 ${date} 未出现在证据片段中`);
    }
  }
  for (const number of extractGroundingNumbers(content)) {
    if (!numericAppearsInSupport(number, support)) {
      errors.push(`${path}中的数值 ${number} 未出现在证据片段中`);
    }
  }
  for (const token of extractUppercaseAnchors(content)) {
    if (!appearsInSupport(token, support)) errors.push(`${path}中的实体 ${token} 未出现在证据片段中`);
  }
  if (checkOrganizations) {
    for (const candidates of extractOrganizationAnchorGroups(content)) {
      if (!candidates.some((candidate) => appearsInSupport(candidate, support))) {
        const label = candidates[0] || "";
        errors.push(label
          ? `${path}中的机构名称“${label}”未出现在证据片段中`
          : `${path}中的机构名称未出现在证据片段中`);
      }
    }
  }
  if (requireEventFamily) {
    const eventContent = withoutIgnoredEntityNames(content, ignoredEntityNames);
    const eventSupport = support.map((item) => withoutIgnoredEntityNames(item, ignoredEntityNames));
    const requiredFamilies = eventFamilies(eventContent);
    const supportedFamilies = new Set(eventSupport.flatMap(eventFamilies));
    for (const family of requiredFamilies) {
      if (!supportedFamilies.has(family)) {
        const term = eventFamilyTerm(eventContent, family);
        errors.push(term
          ? `${path}中的事件表述“${term}”未出现在证据片段中`
          : `${path}包含证据片段未支持的事件类型`);
      }
    }
  }
  return [...new Set(errors)];
}

export function evidenceSpanErrors(span = {}, citation = {}, path = "证据片段") {
  const quote = compact(span.quote, 500);
  const summary = compact(citation.summary || citation.excerpt, 4000);
  if (!quote) return [`${path}缺少原文摘录`];
  if (quote.length < 8) return [`${path}的原文摘录少于 8 个字符`];
  if (!summary || !comparable(summary).includes(comparable(quote))) {
    return [`${path}不是对应来源摘要中的连续原文`];
  }
  return [];
}

function validIso(value) {
  const raw = compact(value, 100);
  if (!raw) return "";
  const timestamp = new Date(raw).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

export function deriveEvidenceDataAsOf(evidence = [], generatedAt = new Date().toISOString()) {
  const generatedTimestamp = new Date(generatedAt).getTime();
  const upperBound = Number.isFinite(generatedTimestamp)
    ? generatedTimestamp + 24 * 60 * 60 * 1000
    : Number.POSITIVE_INFINITY;
  const candidates = [];
  for (const item of evidence || []) {
    candidates.push(validIso(item?.published_at), validIso(item?.source_updated_at));
    if (/^(?:public|联网搜索)$/u.test(String(item?.source_kind || ""))) {
      for (const date of extractGroundingDates(item?.summary || item?.excerpt || "")) {
        candidates.push(`${date}T00:00:00.000Z`);
      }
    }
  }
  return candidates
    .filter(Boolean)
    .filter((value) => new Date(value).getTime() <= upperBound)
    .sort()
    .at(-1) || null;
}
