import { randomUUID } from 'node:crypto';
import { AppError, EvidenceValidationError } from '../errors.js';
import {
  fingerprintEvidence,
  evidenceMatchesStockCode,
  normalizeDataProEvidence,
  normalizeWebEvidence,
  validateGeneratedReport,
} from '../domain/evidence.js';
import {
  generatedReportJsonSchema,
  materializeGeneratedReport,
  reportVerificationJsonSchema,
  semanticEvidenceBindingJsonSchema,
  semanticEvidenceBindingSchema,
  semanticQueryPlanJsonSchema,
  semanticQueryPlanSchema,
} from '../domain/report-schema.js';
import {
  extractAttributedPublisher,
  publisherIdentity,
} from '../providers/web-search.js';

function providerFailure(provider, error) {
  return {
    provider,
    ok: false,
    code: error?.code || 'PROVIDER_ERROR',
    message: error?.message || 'Provider failed',
  };
}

function usageTokens(usage = {}) {
  return {
    input_tokens: Number(usage.input_tokens || 0),
    output_tokens: Number(usage.output_tokens || 0),
    total_tokens: Number(usage.total_tokens || 0),
  };
}

function recordUsage(repository, event) {
  try {
    repository.recordUsageEvent?.(event);
  } catch {
    // Usage telemetry must never alter the report result.
  }
}

function normalizeReviewIssues(error) {
  const issues = Array.isArray(error?.details) ? error.details : [];
  return issues.slice(0, 12).map((issue) => ({
    location: String(issue?.location || 'report').slice(0, 160),
    reason: String(issue?.reason || issue?.type || '正文与引用来源需要人工核对').slice(0, 400),
  }));
}

function mergeReviewIssues(...groups) {
  const seen = new Set();
  return groups.flat().filter((issue) => {
    if (!issue) return false;
    const key = `${issue.location || 'report'}|${issue.reason || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function reviewSummaries(issues) {
  const summaries = new Set();
  for (const issue of issues) {
    const text = `${issue.location} ${issue.reason}`;
    if (/allowed_evidence_ids|证据集合|集合外|引用.*不匹配/.test(text)) {
      summaries.add('部分正文段落的引用来源与关注方向需要人工核对');
    }
    if (/单一media|交叉|official|权威|重大事实|金额|数字/.test(text)) {
      summaries.add('部分新闻事实或数字需要结合原文和独立来源核对');
    }
    if (/change_summary|审校|检索话术|否定性|元数据/.test(text)) {
      summaries.add('变化说明需要人工确认是否只保留了事实变化');
    }
    if (/DataPro/.test(text)) {
      summaries.add('DataPro 本次未完整返回，正文仅展示本次已核验来源');
    }
    if (/联网搜索/.test(text)) {
      summaries.add('联网搜索本次未返回，正文仅展示本次已核验来源');
    }
  }
  return [...summaries].slice(0, 4).length
    ? [...summaries].slice(0, 4)
    : ['部分正文与引用来源需要人工核对'];
}

function displayCandidate(candidate, evidence, type) {
  if (!candidate) return null;
  try {
    const materialized = candidate.sections ? candidate : materializeGeneratedReport(candidate);
    return stripInternalCoverageClaims(materialized, evidence, type);
  } catch {
    return candidate;
  }
}

function maxAsOf(evidence) {
  return evidence
    .filter((item) => item?.type !== 'coverage')
    .map((item) => calendarDate(item.as_of_date) || item.as_of_date)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
}

function localIsoDate(timezone, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function localDateTimeLabel(timezone, value = new Date()) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(value).replaceAll('/', '-');
}

function monitorWindow(previous, options = {}) {
  const timezone = options.timezone || 'Asia/Shanghai';
  const now = options.now || new Date();
  const endAt = now.toISOString();
  const endDate = localIsoDate(timezone, now);
  const reviewStartAt = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
  const reviewStartDate = localIsoDate(timezone, reviewStartAt);
  const previousAt = previous?.generated_at || previous?.report?.generated_at || null;
  const parsedPrevious = previousAt ? new Date(previousAt) : null;
  const hasValidPrevious = parsedPrevious && !Number.isNaN(parsedPrevious.getTime());
  return {
    start_at: hasValidPrevious ? parsedPrevious.toISOString() : null,
    start_date: hasValidPrevious ? localIsoDate(timezone, parsedPrevious) : endDate,
    start_label: hasValidPrevious ? localDateTimeLabel(timezone, parsedPrevious) : `${endDate} 00:00`,
    end_at: endAt,
    end_date: endDate,
    end_label: localDateTimeLabel(timezone, now),
    review_start_at: reviewStartAt.toISOString(),
    review_start_date: reviewStartDate,
    review_end_date: endDate,
    timezone,
    initial: !hasValidPrevious,
  };
}

function monitorReviewWindow(window) {
  return {
    ...window,
    start_at: window.review_start_at,
    start_date: window.review_start_date,
  };
}

function calendarDate(value) {
  const matched = String(value || '').match(/\b(20\d{2})[-年/.](\d{1,2})[-月/.](\d{1,2})日?/);
  if (!matched) return null;
  return `${matched[1]}-${matched[2].padStart(2, '0')}-${matched[3].padStart(2, '0')}`;
}

function dataEvidenceCalendarDate(item) {
  if (isMarketEvidence(item)) {
    const rowDates = (item.rows || [])
      .flatMap((row) => Object.entries(row || {})
        .filter(([field]) => /^(?:实际交易日期|最近交易日|最新交易日|交易日期|行情日期|数据日期)$/.test(field))
        .map(([, value]) => calendarDate(value)))
      .filter(Boolean)
      .sort();
    if (rowDates.length) return rowDates.at(-1);
  }
  return calendarDate(item.as_of_date);
}

function newestDataDate(evidence) {
  return evidence
    .filter((item) => item.type === 'datapro')
    .map(dataEvidenceCalendarDate)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
}

function dataEvidenceKind(item) {
  if (isMarketEvidence(item)) return 'market';
  const fields = (item?.rows || []).flatMap((row) => Object.keys(row));
  return fields.some((field) => /营业收入|净利润|毛利率|研发费用|报告期/.test(field))
    ? 'financial'
    : 'other';
}

function newestDataDatesByKind(evidence) {
  const dates = {};
  for (const item of evidence.filter((entry) => entry.type === 'datapro')) {
    const date = dataEvidenceCalendarDate(item);
    if (!date) continue;
    const kind = dataEvidenceKind(item);
    if (!dates[kind] || date > dates[kind]) dates[kind] = date;
  }
  return dates;
}

function currentMarketDataQuery(stock, currentDate, purpose = 'brief') {
  const fields = purpose === 'monitor'
    ? '最新价、前收盘价、涨跌幅和成交量'
    : '最新价、收盘价、涨跌幅和成交量';
  const purposeText = purpose === 'monitor' ? '，用于盘后异动检查' : '';
  return `${stock.name} ${stock.code} 查询 ${currentDate} 当日最新实时行情${purposeText}。需要${fields}，并返回证券代码、实际交易日期和交易时间；仅当 ${currentDate} 确实无交易数据时才返回最近交易日。`;
}

function marketDateHint(evidence) {
  return (evidence || [])
    .filter((item) => item.type === 'datapro')
    .flatMap((item) => item.rows || [])
    .flatMap((row) => Object.entries(row || {})
      .filter(([field]) => /^(?:实际交易日期|最近交易日|最新交易日|交易日期|行情日期|数据日期)$/u.test(field))
      .map(([, value]) => calendarDate(value)))
    .filter(Boolean)
    .sort()
    .at(-1) || null;
}

function completeMarketDataQuery(stock, currentDate, purpose = 'brief', hintedDate = null) {
  const fields = purpose === 'monitor'
    ? '最新价、前收盘价、涨跌额、涨跌幅和成交量'
    : '最新价、收盘价、前收盘价、涨跌额、涨跌幅和成交量';
  const dateInstruction = hintedDate
    ? `已有结果确认最近实际交易日期为 ${hintedDate}，请直接查询该交易日`
    : `查询截至 ${currentDate} 当前时点最近一个已有价格数据的交易日`;
  return `${stock.name} ${stock.code} ${dateInstruction}的完整行情。必须返回${fields}、证券代码、实际交易日期、交易时间和计价货币；不得只返回休市说明、查询日期、是否有交易数据或证券基础信息。`;
}

function reportQueries(stock, type, monitorSettings, options = {}) {
  const currentDate = localIsoDate(options.timezone || 'Asia/Shanghai', options.now || new Date());
  const focus = stock.focus || [];
  const semanticWebQueries = semanticQuerySpecs(stock, type, options.semanticQueries || []);
  const focusWebQueries = semanticWebQueries.length
    ? semanticWebQueries
    : focusSpecificWebQueries(stock, focus, type);
  if (type === 'brief') {
    return {
      data: [
        currentMarketDataQuery(stock, currentDate, 'brief'),
        `${stock.name} ${stock.code} 截至${currentDate}最新已披露财务报告的营业收入、归属于母公司所有者的净利润、销售毛利率和研发费用。只返回与证券所属公司类型一致的一套利润表口径；一般企业不得返回商业银行、保险公司或证券公司利润表字段，匹配字段缺失时直接省略。必须同时返回证券代码、定期报告最新报告期（YYYYMMDD）、实际披露日期和单位；不要只返回MRQ或季度标签，不要返回空值期次。`,
        ...focusSpecificDataQueries(stock, focus, currentDate),
      ],
      web: [
        { query: `${stock.name} ${stock.code} 最新公告 定期报告 产销快报 经营进展`, timeRange: 'OneMonth', authLevel: 1 },
        ...focusWebQueries,
      ],
    };
  }
  const window = monitorWindow(options.previous, options);
  const windowText = `${window.start_label} 至 ${window.end_label}（${window.timezone}）`;
  const reviewText = `${window.review_start_date} 至 ${window.review_end_date}`;
  const externalTopics = uniqueStrings(focus.flatMap((item) => {
    const profile = focusProfile(item);
    if (['market', 'financial', 'sales', 'company_event'].includes(profile.key)) return [];
    return focusSearchTerms(item).slice(0, 5);
  }));
  const externalQuerySubject = externalTopics.join(' ') || `${stock.name} 所属行业`;
  return {
    data: [
      `${stock.name} ${stock.code} 风险观察区间为${reviewText}，增量检查区间为${windowText}。查询区间内公司公告、监管问询、处罚、诉讼、召回、事故、违约、停产、重大减持、质押及${focus.join('、') || '经营与行业政策'}相关风险事项。必须返回证券代码、事件名称和YYYY-MM-DD实际事件或披露日期；不要返回无明确日期的项目。没有符合条件的记录时返回空结果。`,
      currentMarketDataQuery(stock, currentDate, 'monitor'),
    ],
    web: [
      {
        query: `${stock.name} ${stock.code} 最新公告 监管 公司动态 经营风险`,
        timeRange: 'OneWeek',
        authLevel: 1,
        queryRewrite: true,
      },
      ...focusWebQueries,
      {
        query: `${externalQuerySubject} 最新价格变化 行业政策 监管要求 供应链 竞争格局`.trim(),
        timeRange: 'OneWeek',
        authLevel: 1,
        queryRewrite: true,
      },
    ],
    window,
  };
}

function uniqueWebItems(results) {
  const byUrl = new Map();
  for (const result of results) {
    for (const item of result.items || []) {
      if (!byUrl.has(item.url)) {
        byUrl.set(item.url, {
          ...item,
          search_query: item.search_query || result.query || '',
        });
      }
    }
  }
  return [...byUrl.values()];
}

function parsedUrl(value) {
  try { return new URL(value); } catch { return null; }
}

function sourceIdentityKeys(item) {
  const keys = [];
  const url = parsedUrl(item?.url);
  if (url) {
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|from|source|spm|share_.+|u_atoken|u_asig)$/i.test(key)) url.searchParams.delete(key);
    }
    keys.push(`url:${url.toString()}`);
  }
  const title = String(item?.title || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN');
  const publisher = String(item?.publisher || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN');
  if (title) keys.push(`title:${publisher}|${title}`);
  return keys;
}

function normalizedSemanticClaim(value) {
  return String(value || '')
    .toLocaleLowerCase('zh-CN')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function semanticClaimOverlap(left, right) {
  const leftValue = normalizedSemanticClaim(left);
  const rightValue = normalizedSemanticClaim(right);
  const shorterLength = Math.min(leftValue.length, rightValue.length);
  if (shorterLength < 20) return false;
  if (leftValue.includes(rightValue) || rightValue.includes(leftValue)) return true;
  const bigrams = (value) => new Set(
    Array.from({ length: Math.max(0, value.length - 1) }, (_, index) => (
      value.slice(index, index + 2)
    )),
  );
  const leftBigrams = bigrams(leftValue);
  const rightBigrams = bigrams(rightValue);
  const smallerSize = Math.min(leftBigrams.size, rightBigrams.size);
  if (!smallerSize) return false;
  const overlap = [...leftBigrams].filter((value) => rightBigrams.has(value)).length;
  return overlap / smallerSize >= 0.82;
}

function sourcesRepeatSemanticClaim(left, right) {
  const leftMatches = left?.semantic_matches || [];
  const rightMatches = right?.semantic_matches || [];
  return leftMatches.some((leftMatch) => rightMatches.some((rightMatch) => (
    String(leftMatch?.preference || '').trim() === String(rightMatch?.preference || '').trim()
    && semanticClaimOverlap(leftMatch?.quote, rightMatch?.quote)
  )));
}

function isLikelyUgc(item) {
  const url = parsedUrl(item.url);
  if (!url) return true;
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  return host === 'caifuhao.eastmoney.com'
    || host === 'k.sina.cn'
    || (host === 'cj.sina.cn' && path.startsWith('/articles/view/'))
    || /(?:^|\.)163\.com$/.test(host);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isLowInformationPage(item, stock) {
  const title = String(item.title || '').trim();
  const publisher = String(item.publisher || '').trim();
  const path = parsedUrl(item.url)?.pathname.toLowerCase() || '';
  const code = String(stock?.code || '').trim().replace(/\.[A-Z]{2}$/i, '');
  const companyProfileTitle = Boolean(stock?.name && code)
    && new RegExp(`^${escapeRegex(stock.name)}(?:酒)?(?:股份)?有限公司\\s+${escapeRegex(code)}(?:\\.[A-Z]{2})?$`, 'i').test(title);
  const stockOnlyTitle = stock?.name
    ? new RegExp(`^${escapeRegex(stock.name)}[（(][^）)]+[）)]$`, 'i').test(title)
    : false;
  return companyProfileTitle
    || stockOnlyTitle
    || path === '/'
    || (title && publisher && title === publisher)
    || /(?:行情走势|股票行情|个股行情|公司资料|个股资料|搜索页面|搜索结果|证券产品推荐|资讯公告-PC_HSF10资料|官方网站首页|^首页$|ETF|基金)/i.test(title)
    || /^\d{6}(?:\.[A-Z]{2})?\s+/.test(title)
    || /^(?:汽车资讯|新闻动态|政声传递|产业市场)(?:[-_丨|].*)?$/i.test(title)
    || /^(?:外地政策|政策法规)(?:[-_丨|].*)?$/i.test(title)
    || /\/(?:news|article)\/index\//.test(path)
    || /^(?:深市主板|沪市主板|创业板|科创板).{0,50}(?:信息披露平台|证券交易所)/.test(title)
    || /^(?:装备工业一司|商务部业务系统统一平台|国家市场监督管理总局)$/i.test(title);
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function preferenceSubtopics(value) {
  const original = String(value || '').replace(/\s+/g, '').trim();
  if (!original) return [];
  const punctuationParts = original.split(/[、，,；;|/]+/).filter(Boolean);
  const subtopics = punctuationParts.flatMap((part) => {
    const conjunctionParts = part.split(/(?:和|与|及)/).filter(Boolean);
    return conjunctionParts.length > 1 && conjunctionParts.every((item) => item.length >= 2)
      ? conjunctionParts
      : [part];
  });
  return uniqueStrings(subtopics);
}

function expandedPreferences(values) {
  return uniqueStrings((values || []).flatMap((value) => preferenceSubtopics(value)));
}

function readerFacingFocusItems(values) {
  return uniqueStrings(uniqueStrings(values || []).map((value) => value
    .replace(/财务表现|财务状况/g, '财务指标')
    .replace(/经营表现/g, '经营指标')
    .replace(/盈利表现/g, '盈利指标')));
}

const focusProfiles = [
  {
    key: 'market',
    pattern: /股价|行情|走势|成交|估值|市盈率|市净率/,
    terms: ['股价', '行情', '涨跌', '成交', '估值', '市盈率', '市净率'],
    briefSection: '市场表现',
    monitorSection: '市场异动',
  },
  {
    key: 'financial',
    pattern: /财务|营收|收入|利润|盈利|毛利|净利|研发|费用|现金流|负债|业绩/,
    terms: ['营业收入', '营收', '利润', '毛利率', '研发费用', '现金流', '负债', '业绩'],
    briefSection: '经营与财务',
    monitorSection: '公司事件',
  },
  {
    key: 'sales',
    pattern: /销量|产量|交付|产销|市场份额|市占率/,
    terms: ['销量', '产量', '交付', '产销', '市场份额', '市占率'],
    briefSection: '关注方向',
    monitorSection: '公司事件',
  },
  {
    key: 'raw_material',
    pattern: /原材料|碳酸锂|锂价|锂矿|电池材料|锂|镍|钴|供应链|材料成本/,
    terms: ['原材料', '碳酸锂', '锂价', '锂矿', '电池材料', '镍价', '钴价', '供应链', '材料成本'],
    briefSection: '关注方向',
    monitorSection: '外部风险',
  },
  {
    key: 'overseas',
    pattern: /海外|出口|全球|欧洲|美国|东南亚|巴西|关税/,
    terms: ['海外', '出口', '全球', '欧洲', '美国', '东南亚', '巴西', '关税'],
    briefSection: '关注方向',
    monitorSection: '外部风险',
  },
  {
    key: 'competition',
    pattern: /竞争|行业|价格战|新能源|市场格局/,
    terms: ['竞争', '行业', '价格战', '新能源汽车', '市场格局'],
    briefSection: '关注方向',
    monitorSection: '外部风险',
  },
  {
    key: 'policy',
    pattern: /政策|监管|合规|标准|补贴/,
    terms: ['政策', '监管', '合规', '标准', '补贴'],
    briefSection: '关注方向',
    monitorSection: '外部风险',
  },
  {
    key: 'company_event',
    pattern: /公告|减持|质押|诉讼|召回|安全|治理|经营风险/,
    terms: ['公告', '减持', '质押', '诉讼', '召回', '安全', '治理', '经营风险'],
    briefSection: '关注方向',
    monitorSection: '公司事件',
  },
];

function focusProfile(value) {
  return focusProfiles.find((profile) => profile.pattern.test(String(value || '')))
    || {
      key: 'custom',
      terms: [String(value || '')],
      briefSection: '关注方向',
      monitorSection: '公司事件',
    };
}

const preferenceFacets = [
  { preference: /海外|出口|全球|欧洲|美国|东南亚|巴西|关税/, evidence: /海外|出口|全球|欧洲|美国|东南亚|巴西|关税/ },
  { preference: /价格|成本|报价|期价/, evidence: /价格|成本|报价|期价|涨价|降价|价格战/ },
  { preference: /政策|监管|合规|标准|补贴/, evidence: /政策|监管|合规|标准|补贴|法规|条例|办法/ },
  { preference: /公告|公告信息/, evidence: /公告|公告书|披露|定期报告|业绩预告|权益分派|问询函/ },
  { preference: /订单|合同|中标|定点/, evidence: /订单|合同|中标|定点/ },
  { preference: /临床|试验/, evidence: /临床|试验/ },
  { preference: /入组/, evidence: /入组/ },
  { preference: /门店/, evidence: /门店/ },
  { preference: /同店/, evidence: /同店/ },
  { preference: /客流/, evidence: /客流/ },
  { preference: /销量|产量|交付|产销|市占率|市场份额/, evidence: /销量|产量|交付|产销|市占率|市场份额/ },
  { preference: /竞争|格局|价格战/, evidence: /竞争|格局|价格战|份额/ },
  { preference: /安全|质量|召回|事故/, evidence: /安全|质量|召回|事故|故障/ },
  { preference: /利润|盈利|毛利|净利/, evidence: /利润|盈利|毛利|净利/ },
  { preference: /收入|营收/, evidence: /收入|营收/ },
  { preference: /研发|技术/, evidence: /研发|技术/ },
];

function simplifiedFocusValue(value) {
  return String(value || '')
    .replace(/^(?:近期|行业|经营)/, '')
    .replace(/(?:变化|风险|动态|进展|跟踪|竞争|表现|节奏|情况)$/g, '')
    .trim();
}

function customFocusSubject(value) {
  return simplifiedFocusValue(value)
    .replace(/(?:海外|出口|全球|价格|成本|报价|期价|政策|监管|合规|标准|补贴|订单|合同|中标|定点|临床|试验|入组|门店|同店|客流|销量|产量|交付|产销|市占率|市场份额|竞争|格局|价格战|安全|质量|召回|事故|利润|盈利|毛利|净利|收入|营收|研发|技术)/g, '')
    .trim();
}

function customFocusTokens(value) {
  const normalized = simplifiedFocusValue(value)
    .replace(/[与及和、，,\s]/g, '')
    .trim();
  if (!normalized) return [];
  const tokens = [];
  for (let index = 0; index < normalized.length - 1; index += 1) {
    const token = normalized.slice(index, index + 2);
    if (!/^(?:近期|行业|经营|相关|变化|情况|信息|动态|进展|表现|环境)$/.test(token)) {
      tokens.push(token);
    }
  }
  return uniqueStrings(tokens);
}

function preferenceTextMatches(value, text) {
  const preference = String(value || '').trim();
  const searchable = String(text || '').replace(/\s+/g, '');
  if (!preference || !searchable) return false;
  if (!preferenceContextIsSubstantive(preference, searchable)) return false;
  const normalizedPreference = preference.replace(/\s+/g, '');
  if (searchable.includes(normalizedPreference)) return true;

  const requiredFacets = preferenceFacets.filter((facet) => facet.preference.test(preference));
  if (requiredFacets.some((facet) => !facet.evidence.test(searchable))) return false;

  const profile = focusProfile(preference);
  const simplified = simplifiedFocusValue(preference).replace(/\s+/g, '');
  const subject = customFocusSubject(preference).replace(/\s+/g, '');
  if (profile.key === 'custom') {
    if (subject.length >= 2 && searchable.includes(subject)) return true;
    const tokens = customFocusTokens(preference);
    const matchedTokens = tokens.filter((token) => searchable.includes(token)).length;
    const minimumMatches = Math.min(3, Math.max(1, Math.ceil(tokens.length * 0.45)));
    return Boolean(tokens.length && matchedTokens >= minimumMatches)
      && requiredFacets.every((facet) => facet.evidence.test(searchable));
  }
  if (simplified.length >= 2 && searchable.includes(simplified)) return true;
  return profile.terms.some((term) => term && searchable.includes(String(term).replace(/\s+/g, '')));
}

function preferenceEvidenceTerms(value) {
  const profile = focusProfile(value);
  return uniqueStrings([
    value,
    simplifiedFocusValue(value),
    customFocusSubject(value),
    ...profile.terms,
  ]);
}

function dataProFieldNames(item) {
  return uniqueStrings((item?.rows || []).flatMap((row) => (
    Object.keys(row || {}).map((field) => String(field).split('/').at(-1))
  )));
}

function dataProDirectlyMatchesPreference(item, value) {
  if (item?.type !== 'datapro') return false;
  const preference = String(value || '').replace(/\s+/g, '');
  const fields = dataProFieldNames(item);
  const fieldText = fields.join(' ').replace(/\s+/g, '');
  if (!preference || !fieldText) return false;

  if (/股价走势|行情走势|股价表现|市场表现/.test(preference)) {
    return /最新价|收盘价|前收盘价|开盘价|最高价|最低价|涨跌|涨跌幅/.test(fieldText);
  }

  const analyticalMarketPreference = /技术面|技术走势|趋势|均线|支撑|压力|关键价位|波动率|动量|形态|MACD|KDJ|RSI/i;
  if (analyticalMarketPreference.test(preference)) {
    const hasExplicitTechnicalField = /技术指标|趋势|均线|支撑位|压力位|关键价位|波动率|动量|MACD|KDJ|RSI/i.test(fieldText);
    const hasPriceSeries = (item.rows || []).length >= 3
      && /最新价|收盘价|前收盘价|开盘价|最高价|最低价/.test(fieldText);
    return hasExplicitTechnicalField || hasPriceSeries;
  }

  const requiredFacets = preferenceFacets.filter((facet) => facet.preference.test(preference));
  if (requiredFacets.some((facet) => !facet.evidence.test(fieldText))) return false;

  const simplified = simplifiedFocusValue(preference).replace(/\s+/g, '');
  if (preference.length >= 2 && fieldText.includes(preference)) return true;
  if (simplified.length >= 2 && fieldText.includes(simplified)) return true;

  if (/股价|行情|涨跌/.test(preference)) {
    return /最新价|收盘价|前收盘价|涨跌|涨跌幅/.test(fieldText);
  }
  if (/成交/.test(preference)) {
    return /成交量|成交额|总成交量|现量|现额/.test(fieldText);
  }
  if (/估值|市盈率|市净率|市值/.test(preference)) {
    return /估值|市盈率|市净率|总市值|流通市值/.test(fieldText);
  }
  if (/盈利能力/.test(preference)) {
    return /净利润|毛利率|利润率|净资产收益率|ROE/i.test(fieldText);
  }
  if (/财务表现|财务状况/.test(preference)) {
    const metricFamilies = [
      /收入|营收/,
      /净利润|毛利率|利润率/,
      /现金流/,
      /负债/,
      /研发费用|销售费用|管理费用/,
    ];
    return metricFamilies.filter((pattern) => pattern.test(fieldText)).length >= 2;
  }
  return false;
}

function evidenceDirectlyMatchesPreference(item, value) {
  if (hasSemanticPreferenceMatch(item, value)) return true;
  if (item?.type === 'web_search' && item.semantic_binding_checked) return false;
  if (item?.type === 'datapro') return dataProDirectlyMatchesPreference(item, value);
  if (item?.type !== 'web_search') {
    return preferenceTextMatches(value, evidencePreferenceText(item));
  }
  const segments = [
    item?.title,
    ...String(item?.content || item?.summary || '')
      .split(/\r?\n|(?<=[。！？；])\s*/)
      .map((segment) => segment.trim()),
  ].filter(Boolean);
  return segments.some((segment) => preferenceTextMatches(value, segment));
}

function evidenceMatchesPreferenceUnit(item, unit, parentPreference = unit) {
  if (evidenceDirectlyMatchesPreference(item, unit)) return true;
  if (unit === parentPreference) return false;
  const parentMatch = safeSemanticMatchForPreference(item, parentPreference);
  return Boolean(parentMatch?.quote && preferenceTextMatches(unit, parentMatch.quote));
}

function focusSearchTerms(value) {
  const original = String(value || '').trim();
  const subtopics = preferenceSubtopics(original);
  return uniqueStrings([
    original,
    ...subtopics,
    ...subtopics.flatMap((item) => [
      simplifiedFocusValue(item),
      ...focusProfile(item).terms,
    ]),
  ])
    .filter(Boolean);
}

function focusSpecificDataQueries(stock, focus, currentDate) {
  const categories = new Set();
  const queries = [];
  for (const item of expandedPreferences(focus).slice(0, 8)) {
    const profile = focusProfile(item);
    if (categories.has(profile.key)) continue;
    categories.add(profile.key);
    if (profile.key === 'sales') {
      queries.push(`${stock.name} ${stock.code} 截至${currentDate}最新已披露的月度或季度销量、产量、交付量、累计产销和市场份额。只返回实际披露值及其统计期、披露日期和单位；预测值与机构估算不要返回。`);
    } else if (profile.key === 'financial' && /现金流|负债/.test(item)) {
      queries.push(`${stock.name} ${stock.code} 截至${currentDate}最新已披露财务报告中与“${item}”直接相关的结构化字段。必须返回证券代码、报告期、实际披露日期和单位，只返回已披露实际值。`);
    } else if (profile.key === 'market' && /估值|市盈率|市净率/.test(item)) {
      queries.push(`${stock.name} ${stock.code} 查询${currentDate}当日或最近交易日的市盈率、市净率和总市值，并返回证券代码、实际交易日期和单位。`);
    }
    if (queries.length >= 2) break;
  }
  return queries;
}

function focusSpecificWebQueries(stock, focus, type) {
  return expandedPreferences(focus).map((item) => {
    const expandedFocus = focusSearchTerms(item).slice(0, 5).join(' ');
    return {
      query: type === 'brief'
        ? `${stock.name} ${stock.code} ${expandedFocus} 最新公告 官方披露 权威报道`
        : `${stock.name} ${stock.code} ${expandedFocus} 最新公告 风险变化 监管 经营进展`,
      timeRange: type === 'brief' ? 'OneMonth' : 'OneWeek',
      authLevel: 1,
      queryRewrite: type === 'monitor',
      focus_item: item,
    };
  });
}

function semanticQueryPlanInput(stock, type, options = {}) {
  const currentDate = localIsoDate(options.timezone || 'Asia/Shanghai', options.now || new Date());
  const window = type === 'monitor'
    ? monitorWindow(options.previous, options)
    : null;
  const originalPreferences = uniqueStrings(stock.focus || []);
  return JSON.stringify({
    task: type,
    current_date: currentDate,
    stock: { name: stock.name, code: stock.code, exchange: stock.exchange },
    original_preferences: originalPreferences,
    preferences: expandedPreferences(originalPreferences),
    time_boundary: type === 'brief'
      ? '个股简评优先最近一个月的公司披露、权威报道与行业材料。'
      : `${window.start_label} 至 ${window.end_label}为增量检查窗口；近7日只可作为外部背景。`,
  });
}

function semanticQueryPlanInstructions(type) {
  const taskRule = type === 'brief'
    ? '为每项偏好最多设计一条公司查询和一条必要的外部行业查询。'
    : '为每项偏好设计面向新增公司事件或外部风险背景的查询，不能把近7日背景表述成公司新事件。';
  return `你是中文金融信息检索规划器。只输出查询计划，不输出事实、结论、新闻标题或投资建议。\n
original_preferences 是用户原始输入，preferences 是程序从中拆出的检索子关注点。preference 字段必须逐字使用 preferences 中的一项，query 必须包含该子关注点；可以补充语义上等价的检索概念，不能替换或扩大用户意图。每条 query 必须包含公司名称或证券代码。scope=company 表示公司自身披露、经营或事件；scope=external 只用于会影响该偏好的行业、政策、供应链或竞争背景。${taskRule}\n
每项偏好最多两条查询，总数不超过 8 条。严格按 JSON Schema 输出。`;
}

function validateSemanticQueryPlan(value, stock, type) {
  const parsed = semanticQueryPlanSchema.safeParse(value);
  if (!parsed.success) return [];
  const preferences = new Set(expandedPreferences(stock.focus || []));
  const identity = [stock.name, stock.code].filter(Boolean);
  const seen = new Set();
  const perPreference = new Map();
  const accepted = [];
  for (const item of parsed.data.queries) {
    const preference = String(item.preference || '').trim();
    const query = String(item.query || '').replace(/\s+/g, ' ').trim();
    if (!preferences.has(preference) || !query.includes(preference)) continue;
    if (!identity.some((value) => query.includes(value))) continue;
    const key = `${preference}|${item.scope}|${query}`;
    if (seen.has(key) || (perPreference.get(preference) || 0) >= 2) continue;
    seen.add(key);
    perPreference.set(preference, (perPreference.get(preference) || 0) + 1);
    accepted.push({
      preference,
      scope: item.scope,
      query,
      timeRange: type === 'brief' ? 'OneMonth' : 'OneWeek',
      authLevel: 1,
      queryRewrite: true,
      semantic: true,
    });
    if (accepted.length >= 8) break;
  }
  return accepted;
}

function semanticQuerySpecs(stock, type, semanticQueries) {
  return uniqueStrings((semanticQueries || []).map((item) => JSON.stringify(item)))
    .map((item) => JSON.parse(item))
    .filter((item) => item.preference && item.query)
    .map((item) => ({
      query: item.query,
      timeRange: item.timeRange || (type === 'brief' ? 'OneMonth' : 'OneWeek'),
      authLevel: item.authLevel || 1,
      queryRewrite: true,
      semantic: true,
      semantic_scope: item.scope,
      focus_item: item.preference,
    }));
}

function evidencePreferenceText(item) {
  return `${item?.title || ''}\n${item?.content || ''}\n${JSON.stringify(item?.rows || [])}`;
}

function normalizeComparableText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

const semanticPreferenceAnchorProfiles = [
  {
    preference: /(?:\bAI\b|人工智能|大模型|智能模型|生成式|智能体|\bAgent\b)/i,
    evidence: [/(?:\bAI\b|人工智能|大模型|智能模型|生成式|智能体|\bAgent\b)/i],
  },
  {
    preference: /iPhone.{0,12}(?:需求|销量|销售|订单|出货|产量|量产|产能|供应|份额)/i,
    evidence: [/iPhone/i, /需求|销量|销售|订单|出货|产量|量产|产能|供应|份额|爬坡/i],
  },
  {
    preference: /(?:Services|服务业务|订阅业务)/i,
    evidence: [/(?:Services|服务业务|订阅|App Store|iCloud|Apple Music|广告服务|云服务)/i],
  },
  {
    preference: /Azure|微软云/i,
    evidence: [/(?:Azure|微软云|云业务|cloud)/i],
  },
  {
    preference: /(?:资本开支|资本支出|算力投入|基础设施投入)/,
    evidence: [/(?:资本开支|资本支出|CapEx|数据中心|服务器|算力|基础设施投入|芯片投入)/i],
  },
  {
    preference: /(?:净息差|息差)/,
    evidence: [/(?:净息差|息差|净利息收益率)/],
  },
  {
    preference: /(?:资本充足率|核心一级资本)/,
    evidence: [/(?:资本充足率|核心一级资本|一级资本)/],
  },
  {
    preference: /(?:股东回报|分红|回购|派息)/,
    evidence: [/(?:股东回报|分红|回购|派息|股息)/],
  },
  {
    preference: /(?:渠道库存|经销商库存|社会库存|库存水平|库存周转|库存天数|动销)/,
    evidence: [/(?:渠道库存|经销商库存|社会库存|库存水平|库存周转|库存天数|库存量|去库存|动销)/],
  },
  {
    preference: /(?:品牌优势|品牌力|品牌壁垒|品牌价值|品牌地位|品牌影响力|定价权)/,
    evidence: [/(?:品牌|稀缺性|定价权|高端定位|消费者心智|品牌价值|品牌地位|品牌影响力|品牌溢价)/],
  },
  {
    preference: /(?:利润率|毛利率|净利率|盈利能力)/,
    evidence: [/(?:利润率|毛利率|净利率|盈利能力|ROE|净资产收益率)/i],
  },
  {
    preference: /(?:估值|市盈率|市净率|市值)/,
    evidence: [/(?:估值|市盈率|市净率|市值|PE|PB)/i],
  },
  {
    preference: /(?:技术面|技术走势|均线|支撑|压力|关键价位|波动率|动量|形态|MACD|KDJ|RSI)/i,
    evidence: [/(?:技术面|走势|趋势|震荡|强于大盘|弱于大盘|主力资金|融资融券|均线|支撑|压力|关键价位|波动率|动量|形态|MACD|KDJ|RSI|交易区间|价格重心)/i],
  },
  {
    preference: /(?:产品|技术).{0,12}(?:进展|迭代|升级|发布)|(?:进展|迭代|升级).{0,12}(?:产品|技术)/,
    evidence: [/(?:产品|服务|模型|功能|系统|技术|能力|备案|发布|推出|上线|升级|迭代|量产|投产)/],
  },
  {
    preference: /(?:海外项目|海外业务|国际业务|海外进展)/,
    evidence: [/(?:海外|国际|境外|出口|全球|欧洲|美国|东南亚|拉美|非洲)/],
  },
  {
    preference: /(?:铜|黄金|金价|铜价|贵金属)/,
    evidence: [/(?:铜|黄金|金价|铜价|贵金属)/],
  },
];

function semanticPreferenceAnchorsMatch(preference, text) {
  const value = String(preference || '').replace(/\s+/g, '');
  const searchable = String(text || '').replace(/\s+/g, '');
  if (!value || !searchable) return false;
  const profiles = semanticPreferenceAnchorProfiles.filter((profile) => (
    profile.preference.test(value)
  ));
  if (profiles.length) {
    return profiles.every((profile) => profile.evidence.every((pattern) => (
      pattern.test(searchable)
    )));
  }
  // Unknown preferences still rely on the semantic matcher. The deterministic
  // guard only vetoes concepts whose required evidence anchors are known.
  return true;
}

function preferenceContextIsSubstantive(preference, text) {
  const value = String(preference || '').replace(/\s+/g, '');
  const searchable = String(text || '').replace(/\s+/g, '');
  if (!value || !searchable) return false;
  if (/行业动态|行业趋势|行业竞争|竞争格局|市场格局/.test(value)) {
    return /行业|市场|竞争|价格战|市占率|市场份额|同业|车企|企业总体|政策|监管|供应链/.test(searchable);
  }
  return true;
}

function semanticMatchForPreference(item, preference) {
  const value = String(preference || '').trim();
  return (item?.semantic_matches || []).find((match) => (
    String(match?.preference || '').trim() === value
    && typeof match?.quote === 'string'
    && match.quote.trim().length >= 12
    && preferenceContextIsSubstantive(value, match.quote)
    && semanticPreferenceAnchorsMatch(value, match.quote)
  )) || null;
}

function safeSemanticMatchForPreference(item, preference) {
  const match = semanticMatchForPreference(item, preference);
  const allowMediaNumbers = focusProfile(preference).key === 'competition';
  return match?.quote && semanticQuoteIsSafe(match.quote, item, { allowMediaNumbers })
    ? match
    : null;
}

function safeSemanticMatches(item, stock = null) {
  return (item?.semantic_matches || []).filter((match) => {
    const preference = String(match?.preference || '').trim();
    const quote = String(match?.quote || '').trim();
    const allowMediaNumbers = focusProfile(preference).key === 'competition';
    return preference
      && quote
      && preferenceContextIsSubstantive(preference, quote)
      && semanticPreferenceAnchorsMatch(preference, quote)
      && semanticQuoteIsSafe(quote, item, { allowMediaNumbers })
      && (!stock || semanticPreferenceBindingIsSubstantive(
        preference,
        quote,
        item,
        stock,
        match?.scope,
      ));
  });
}

function hasSemanticPreferenceMatch(item, preference) {
  return Boolean(safeSemanticMatchForPreference(item, preference));
}

function preferenceClaimMatchesEvidence(preference, claim, evidenceById) {
  return (claim?.evidence_ids || []).some((id) => (
    evidenceDirectlyMatchesPreference(evidenceById.get(id), preference)
  ));
}

function contractClaimMatchesEvidence(contract, claim, evidenceById) {
  if (contract?.is_system_core) {
    const allowedEvidenceIds = new Set(contract.evidence_ids || []);
    return (claim?.evidence_ids || []).some((id) => (
      allowedEvidenceIds.has(id) && evidenceById.has(id)
    ));
  }
  return preferenceClaimMatchesEvidence(contract?.preference, claim, evidenceById);
}

function semanticQuoteLooksLikeTableRow(quote) {
  const text = normalizeComparableText(quote);
  if (!text) return false;
  const numericTokens = text.match(/[+-]?\d[\d,.]*(?:\s?(?:%|亿元|万元|元|亿|万|倍))?/g) || [];
  const hasSentenceBoundary = /[，。；：！？!?]/u.test(text);
  const hasNarrativePredicate = /(?:为|达|同比|环比|增长|下降|上涨|下跌|净流入|净流出|披露|显示|报道|表示|发布|完成|实现|截至|收于)/u.test(text);
  const hasTableSpacing = /\S+\s{1,}\S+\s{1,}\S+/u.test(text);
  return numericTokens.length >= 3
    && !hasSentenceBoundary
    && !hasNarrativePredicate
    && hasTableSpacing;
}

function semanticQuoteIsSafe(quote, item, { allowMediaNumbers = false } = {}) {
  const text = normalizeComparableText(quote);
  const sourceTier = item?.source_tier || 'open_web';
  return text.length >= 12
    && text.length <= 360
    && !/^(?:而|但|且|同时|此外|其中|对此|因此|不过|另一方面|与此同时)[，,\s]*/u.test(text)
    && !semanticQuoteLooksLikeTableRow(text)
    && !nonInvestmentContentPattern.test(text)
    && !speculativeStatementPattern.test(text)
    && !editorialCharacterizationPattern.test(text)
    && !(sourceTier !== 'official' && !allowMediaNumbers && materialNumericFactPattern.test(text))
    && !(sourceTier !== 'official' && unsupportedMediaProductFactPattern.test(text))
    && !(sourceTier !== 'official' && singleMediaProductRestrictionPattern.test(text))
    && !(sourceTier !== 'official' && singleMediaPolicyFactPattern.test(text))
    && !(sourceTier !== 'official' && singleMediaDefiniteTechnologyFactPattern.test(text))
    && semanticQuoteHasCompleteBoundary(text, item);
}

function semanticQuoteHasCompleteBoundary(quote, item) {
  const text = normalizeComparableText(quote);
  const content = normalizeComparableText(item?.content || item?.summary || '');
  if (!text || !content) return true;
  const index = content.indexOf(text);
  if (index < 0) return false;
  const trailing = content.slice(index + text.length).trim();
  return /[。！？；.!?]$/u.test(text) || trailing.length > 0;
}

function semanticEvidenceBindingInput(stock, type, candidates, preferences = null) {
  const originalPreferences = uniqueStrings(preferences || stock.focus || []);
  return JSON.stringify({
    task: type,
    stock: { name: stock.name, code: stock.code, exchange: stock.exchange },
    original_preferences: originalPreferences,
    preferences: expandedPreferences(originalPreferences),
    candidates: candidates.map((item) => ({
      candidate_id: item.semantic_candidate_id,
      title: item.title,
      publisher: item.publisher,
      url: item.url,
      published_at: item.published_at || null,
      source_tier: item.source_tier || null,
      content: modelEvidenceContent(item),
    })),
  });
}

function semanticEvidenceBindingInstructions(type) {
  const taskRule = type === 'brief'
    ? '只绑定能直接帮助理解公司当前状态或用户关注方向的资料。'
    : 'company 只绑定检查窗口内可能构成公司事件的资料；external 只绑定近7日外部背景，不能把外部背景说成公司新增事件。';
  return `你是金融来源与用户偏好匹配器。判断每一条候选资料是否实质回答某一项检索子关注点。不要根据标题猜测，不要补充常识，不要输出未在候选 content 中逐字出现的内容。\n
original_preferences 是用户原始输入，preferences 是程序拆出的子关注点。仅返回确实相关的 matches。每一项 quote 必须是对应 candidate.content 中连续出现的一段原文，长度 12 至 360 字；quote 是后续程序核验和正文引用的唯一依据。preference 必须逐字等于输入 preferences 中的一项。scope=company 表示公司自身资料，scope=external 表示行业、政策、供应链或竞争等外部背景。${taskRule}\n
没有能支持某偏好的资料时不要输出该偏好。严格按 JSON Schema 输出。`;
}

function semanticSourceHasCompanyAnchor(preference, quote, candidate, stock) {
  const name = String(stock?.name || '').replace(/\s+/g, '');
  const code = String(stock?.code || '').replace(/\s+/g, '').toUpperCase();
  if (!name && !code) return true;
  const normalizedQuote = String(quote || '').replace(/\s+/g, '');
  const normalizedTitle = String(candidate?.title || '').replace(/\s+/g, '');
  if ((name && normalizedQuote.includes(name))
    || (code && normalizedQuote.toUpperCase().includes(code))) return true;
  if (name && normalizedTitle.includes(name)
    && !new RegExp(`${escapeRegex(name)}.{0,6}(?:产业链|概念|供应商|相关公司)`).test(normalizedTitle)) {
    return true;
  }
  const latinAnchors = String(preference || '').match(/[A-Za-z][A-Za-z0-9+.-]{3,}/g) || [];
  return latinAnchors
    .filter((token) => !/^(?:product|demand|market|profit|margin|capital|agent)$/i.test(token))
    .some((token) => new RegExp(escapeRegex(token), 'i').test(quote));
}

function semanticPreferenceBindingIsSubstantive(preference, quote, candidate, stock, scope) {
  if (!preferenceContextIsSubstantive(preference, quote)
    || !semanticPreferenceAnchorsMatch(preference, quote)) return false;
  const allowsExternalContext = /行业|宏观|政策|监管|竞争|供应链|原材料|价格|利率|汇率|关税|市场格局|外部环境|铜|黄金|油价/.test(
    String(preference || ''),
  );
  if (scope === 'external' && allowsExternalContext) return true;
  return semanticSourceHasCompanyAnchor(preference, quote, candidate, stock);
}

function validateSemanticEvidenceBindings(value, stock, candidates) {
  const parsed = semanticEvidenceBindingSchema.safeParse(value);
  if (!parsed.success) return new Map();
  const byCandidate = new Map(candidates.map((item) => [item.semantic_candidate_id, item]));
  const preferences = new Set(expandedPreferences(stock.focus || []));
  const accepted = new Map();
  const seen = new Set();
  for (const item of parsed.data.matches) {
    const candidate = byCandidate.get(item.candidate_id);
    const preference = String(item.preference || '').trim();
    const quote = conciseSemanticQuote(normalizeComparableText(item.quote), preference, candidate);
    const content = normalizeComparableText(modelEvidenceContent(candidate));
    const key = `${item.candidate_id}|${preference}|${quote}`;
    if (!candidate || !preferences.has(preference) || seen.has(key)) continue;
    const allowMediaNumbers = focusProfile(preference).key === 'competition';
    if (!content.includes(quote)
      || !semanticPreferenceBindingIsSubstantive(
        preference,
        quote,
        candidate,
        stock,
        item.scope,
      )
      || !semanticQuoteIsSafe(quote, candidate, { allowMediaNumbers })) continue;
    seen.add(key);
    const matches = accepted.get(item.candidate_id) || [];
    matches.push({ preference, scope: item.scope, quote });
    accepted.set(item.candidate_id, matches);
  }
  return accepted;
}

function mergeSemanticEvidenceBindings(...bindingMaps) {
  const merged = new Map();
  for (const bindings of bindingMaps) {
    for (const [candidateId, matches] of bindings || []) {
      const current = merged.get(candidateId) || [];
      const existing = new Set(current.map((match) => (
        `${match.preference}|${match.scope}|${match.quote}`
      )));
      for (const match of matches || []) {
        const key = `${match.preference}|${match.scope}|${match.quote}`;
        if (!existing.has(key)) {
          current.push(match);
          existing.add(key);
        }
      }
      if (current.length) merged.set(candidateId, current);
    }
  }
  return merged;
}

function semanticCandidateItems(items, stock, curationOptions) {
  return curateWebItems(items, stock, {
    ...curationOptions,
    requireStockInTitle: false,
    // Semantic binding, not a keyword list, decides whether a trusted candidate answers a preference.
    requireSubstantiveBusiness: false,
    requiredTitleTerms: [],
    requiredEventTerms: [],
    maxItems: 24,
    diversifyByStock: false,
    semanticBindingRequired: false,
    preferenceBindingRequired: false,
  }).map((item, index) => ({
    ...item,
    semantic_candidate_id: `S${index + 1}`,
  }));
}

function attachSemanticBindings(items, candidates, bindings) {
  const bindingsByIdentity = new Map();
  const candidatesByIdentity = new Map();
  for (const candidate of candidates) {
    const matches = bindings.get(candidate.semantic_candidate_id) || [];
    for (const key of sourceIdentityKeys(candidate)) {
      candidatesByIdentity.set(key, candidate);
      if (matches.length) bindingsByIdentity.set(key, matches);
    }
  }
  return items.map((item) => {
    const identityKeys = sourceIdentityKeys(item);
    const matchedCandidate = identityKeys
      .map((key) => candidatesByIdentity.get(key))
      .find(Boolean);
    const matches = identityKeys
      .map((key) => bindingsByIdentity.get(key))
      .find(Boolean) || [];
    return {
      ...item,
      ...(matchedCandidate?.source_tier
        ? { source_tier: matchedCandidate.source_tier }
        : {}),
      semantic_binding_checked: true,
      ...(matches.length ? { semantic_matches: matches } : {}),
    };
  });
}

function buildPreferenceContract(stock, type, monitorSettings, evidence) {
  const values = stock.focus || [];
  const contracts = uniqueStrings(values).map((value) => {
    const subtopics = preferenceSubtopics(value);
    const facetCoverage = subtopics.map((subtopic) => {
      const profile = focusProfile(subtopic);
      const matchedEvidence = evidence.filter((item) => {
        if (item.type === 'coverage') return false;
        if (!evidenceMatchesPreferenceUnit(item, subtopic, value)) return false;
        if (item.type !== 'web_search') return true;
        return Boolean(sourceDetailText(item, stock, subtopic)
          || safeReaderFacingHeadline(item, stock, subtopic));
      }).slice(0, 4);
      const hasPreferenceWebEvidence = matchedEvidence.some((item) => (
        item.type === 'web_search'
      ));
      const companySpecificEvent = matchedEvidence.some((item) => (
        isMonitorCompanyEventEvidence(item, stock)
      ));
      const externalPreferenceEvidence = matchedEvidence.some((item) => (
        (item.semantic_matches || []).some((match) => (
          match.preference === subtopic && match.scope === 'external'
        ))
      ));
      const expectedSection = matchedEvidence.length
        ? type === 'brief'
          ? hasPreferenceWebEvidence ? '关注方向' : profile.briefSection
          : externalPreferenceEvidence
            ? '外部风险'
            : isMonitorMarketPreference(subtopic)
              ? '市场异动'
              : companySpecificEvent ? '公司事件' : profile.monitorSection
        : null;
      const scopedEvidence = type !== 'monitor' || !expectedSection
        ? matchedEvidence
        : matchedEvidence.filter((item) => {
          if (item.type === 'web_search') {
            return (monitorSectionForEvidence(item, stock, subtopic) || profile.monitorSection) === expectedSection;
          }
          if (isMarketEvidence(item)) return expectedSection === '市场异动';
          return expectedSection === profile.monitorSection;
        });
      const evidenceIds = scopedEvidence.map((item) => item.id);
      return {
        preference: subtopic,
        display_label: readerFacingFocusItems([subtopic])[0] || subtopic,
        category: profile.key,
        expected_section: evidenceIds.length ? expectedSection : null,
        status: evidenceIds.length ? 'covered' : 'watch',
        evidence_ids: evidenceIds,
      };
    });
    if (facetCoverage.length === 1) return facetCoverage[0];
    const coveredFacets = facetCoverage.filter((item) => item.status === 'covered');
    return {
      preference: value,
      display_label: readerFacingFocusItems([value])[0] || value,
      category: 'compound',
      expected_section: null,
      status: coveredFacets.length === facetCoverage.length
        ? 'covered'
        : coveredFacets.length ? 'partial' : 'watch',
      evidence_ids: uniqueStrings(coveredFacets.flatMap((item) => item.evidence_ids)),
      facets: facetCoverage,
    };
  });
  if (type === 'brief') {
    const fixedSections = deterministicCoreSections(evidence, 'brief', stock);
    const fixedSectionContracts = [
      {
        title: '市场表现',
        preference: '__core_brief_market__',
        displayLabel: '基础行情',
      },
      {
        title: '经营与财务',
        preference: '__core_brief_financial__',
        displayLabel: '经营与财务',
      },
    ];
    for (const definition of fixedSectionContracts) {
      const section = fixedSections.find((item) => item.title === definition.title);
      const evidenceIds = uniqueStrings(
        (section?.claims || []).flatMap((claim) => claim.evidence_ids || []),
      );
      if (!evidenceIds.length) continue;
      contracts.push({
        preference: definition.preference,
        display_label: definition.displayLabel,
        category: 'core_brief',
        expected_section: definition.title,
        status: 'covered',
        evidence_ids: evidenceIds,
        is_system_core: true,
      });
    }

    const userWebEvidenceIds = new Set(
      preferenceContractUnits(contracts)
        .filter((item) => !item.is_system_core)
        .flatMap((item) => item.evidence_ids || [])
        .filter((id) => evidence.some((item) => item.id === id && item.type === 'web_search')),
    );
    const supplementalSlots = Math.max(0, 3 - userWebEvidenceIds.size);
    const supplementalEvidenceIds = evidence
      .filter((item) => (
        item.type === 'web_search'
        && !userWebEvidenceIds.has(item.id)
        && isBriefSupplementalCompanySource(item, stock)
      ))
      .slice(0, supplementalSlots)
      .map((item) => item.id);
    if (supplementalEvidenceIds.length) {
      contracts.push({
        preference: '__core_brief_company_context__',
        display_label: '公司动态',
        category: 'core_brief',
        expected_section: '关注方向',
        status: 'covered',
        evidence_ids: supplementalEvidenceIds,
        is_system_core: true,
      });
    }
    return contracts;
  }
  if (type !== 'monitor') return contracts;

  // Company events are a base responsibility of an after-hours monitor. They
  // remain separate from user preferences, which determine report emphasis.
  // Only the incremental window can create this contract; recent context must
  // never force a company-event paragraph when no new event exists.
  const coreCompanyEventIds = evidence
    .filter((item) => (
      isMonitorCompanyEventEvidence(item, stock)
      && (!item.monitor_role || item.monitor_role === 'new_event')
    ))
    .map((item) => item.id);
  if (coreCompanyEventIds.length) {
    contracts.push({
      preference: '__core_company_events__',
      display_label: '公司事件',
      category: 'core_monitor',
      expected_section: '公司事件',
      status: 'covered',
      evidence_ids: coreCompanyEventIds,
      is_system_core: true,
    });
  }
  const coreMarketEvidenceIds = evidence
    .filter((item) => item.type === 'datapro' && isMarketEvidence(item))
    .map((item) => item.id);
  if (coreMarketEvidenceIds.length) {
    contracts.push({
      preference: '__core_market_context__',
      display_label: '基础行情',
      category: 'core_monitor',
      expected_section: '市场异动',
      status: 'covered',
      evidence_ids: coreMarketEvidenceIds,
      is_system_core: true,
    });
  }
  return contracts;
}

function preferenceContractUnits(contract) {
  return (contract || []).flatMap((item) => (
    item.facets?.length
      ? item.facets.map((facet) => ({
        ...facet,
        parent_preference: item.preference,
      }))
      : [item]
  ));
}

function reportReferencedEvidenceIds(report) {
  return new Set([
    ...(report?.summary_evidence_ids || []),
    ...(report?.change_evidence_ids || []),
    ...(report?.sections || []).flatMap((section) => (
      (section.claims || []).flatMap((claim) => claim.evidence_ids || [])
    )),
    ...(report?.conclusion?.evidence_ids || []),
  ]);
}

function claimSubstantivelyCoversPreference(item, claim, evidenceById) {
  if (!contractClaimMatchesEvidence(item, claim, evidenceById)) return false;
  if (item?.is_system_core) return true;
  const claimText = normalizeComparableText(claim?.text || '');
  const labels = uniqueStrings([item?.preference, item?.display_label]).filter(Boolean);
  if (labels.some((label) => (
    claimText.includes(`围绕“${label}”`)
    || claimText.includes(`围绕"${label}"`)
    || preferenceTextMatches(label, claimText)
  ))) return true;
  return (claim?.evidence_ids || []).some((id) => {
    const evidenceItem = evidenceById.get(id);
    const match = safeSemanticMatchForPreference(evidenceItem, item?.preference);
    const detail = normalizeComparableText(
      conciseSemanticQuote(match?.quote || '', item?.preference, evidenceItem),
    );
    return detail.length >= 12
      && (claimText.includes(detail) || detail.includes(claimText));
  });
}

function alignPreferenceContractWithReport(contract, report, evidence = []) {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const claims = (report?.sections || []).flatMap((section) => (
    (section.claims || []).map((claim) => ({
      ...claim,
      section_title: canonicalSectionTitle(section.title, 'brief'),
    }))
  ));
  const alignUnit = (item) => {
    const expectedSection = item.expected_section
      ? canonicalSectionTitle(item.expected_section, 'brief')
      : null;
    const matchingClaims = claims.filter((claim) => (
      (!expectedSection || claim.section_title === expectedSection)
      && claimSubstantivelyCoversPreference(item, claim, evidenceById)
    ));
    const claimEvidenceIds = new Set(
      matchingClaims.flatMap((claim) => claim.evidence_ids || []),
    );
    const ids = uniqueStrings(
      (item.evidence_ids || []).filter((id) => claimEvidenceIds.has(id)),
    );
    return {
      ...item,
      expected_section: ids.length ? item.expected_section : null,
      status: ids.length ? 'covered' : 'watch',
      evidence_ids: ids,
    };
  };
  return (contract || []).map((item) => {
    if (!item.facets?.length) return alignUnit(item);
    const facets = item.facets.map(alignUnit);
    const covered = facets.filter((facet) => facet.status === 'covered');
    return {
      ...item,
      expected_section: null,
      status: covered.length === facets.length
        ? 'covered'
        : covered.length ? 'partial' : 'watch',
      evidence_ids: uniqueStrings(covered.flatMap((facet) => facet.evidence_ids)),
      facets,
    };
  });
}

function modelPreferenceContract(contract) {
  return preferenceContractUnits(contract).map(({ evidence_ids: evidenceIds, ...item }) => ({
    ...item,
    allowed_evidence_ids: evidenceIds,
    evidence_usage_rule: item.is_system_core
      ? item.category === 'core_brief'
        ? `这是个股简评的固定${item.display_label}范围，只能在指定栏目引用 allowed_evidence_ids 中的来源，不要求匹配用户偏好措辞，也不能冒充用户关注偏好。`
        : `这是盘后监控的${item.display_label}范围，只能在指定栏目引用 allowed_evidence_ids 中的来源，不要求匹配用户偏好措辞。`
      : evidenceIds.length
      ? '正文至少引用其中一条，并且不得引用集合外证据；这些来源是可选集合，不要求全部引用。'
      : '本轮没有可用于陈述该偏好的证据，不得让该偏好进入正文；仅保留在偏好审计元数据中。',
  }));
}

function monitorTopicTerms(stock) {
  const focus = stock.focus || [];
  const derived = focus.flatMap((item) => {
    const value = String(item || '').trim();
    const trimmed = value
      .replace(/^(?:近期|行业|经营)/, '')
      .replace(/(?:变化|竞争|风险|政策|公告|动态|进展|表现|跟踪)$/g, '')
      .trim();
    return [
      value,
      trimmed,
      ...focusSearchTerms(value),
      value.includes('新能源汽车') ? '新能源汽车' : '',
      value.includes('汽车') ? '汽车安全' : '',
    ];
  });
  return uniqueStrings([stock.name, stock.code, ...derived]);
}

function monitorTitleTerms(stock) {
  return uniqueStrings([
    ...monitorTopicTerms(stock),
    '召回',
    '处罚',
    '监管问询',
    '诉讼',
    '调查',
    '安全',
    '国标',
    '标准',
    '政策',
    '监管',
    '新规',
    '公告',
  ]);
}

function monitorEventTerms(stock) {
  const configured = stock?.focus || [];
  return uniqueStrings([
    ...configured,
    ...configured.flatMap((item) => focusSearchTerms(item)),
    ...configured.map((item) => String(item)
      .replace(/^(?:近期|行业|经营)/, '')
      .replace(/(?:变化|风险|动态|进展|跟踪)$/g, '')
      .trim()),
    '公告',
    '风险提示',
    '监管问询',
    '处罚',
    '立案',
    '调查',
    '诉讼',
    '召回',
    '事故',
    '违约',
    '停产',
    '减持',
    '质押',
    '政策',
    '标准',
    '安全',
    '价格战',
    '公司动态',
    '经营进展',
    '订单',
    '合作',
    '项目',
    '环评',
    '锂矿',
    '专利',
    '扩产',
    '销量',
    '交付',
    '产能',
    '工厂',
    '海外',
    '竞争',
    '行业',
    '发布',
    '上市',
    '产品',
    '车型',
    '新品',
    '招聘',
    '投资',
    '建设',
    '开工',
    '投产',
    '下线',
    '产销',
    '业绩',
    '分红',
    '回购',
    '股份',
  ]);
}

function titleMatchesTerms(title, terms) {
  const normalized = String(title || '').toLocaleLowerCase('zh-CN');
  return !terms.length || terms.some((term) => normalized.includes(String(term).toLocaleLowerCase('zh-CN')));
}

function publishedWithinWindow(item, window) {
  if (!window) return true;
  const publishedAt = item?.published_at;
  const publishedTime = Date.parse(publishedAt || '');
  if (!Number.isFinite(publishedTime)) return false;
  const endTime = Date.parse(window.end_at);
  if (publishedTime > endTime) return false;
  if (window.start_at) return publishedTime > Date.parse(window.start_at);
  return localIsoDate(window.timezone, new Date(publishedTime)) >= window.start_date;
}

function dataEvidenceWithinWindow(item, window) {
  if (!window) return true;
  const evidenceDate = calendarDate(item.as_of_date);
  if (!evidenceDate || evidenceDate > window.end_date) return false;
  return evidenceDate >= (window.review_start_date || window.start_date);
}

function isMarketEvidence(item) {
  return item?.type === 'datapro' && (item.rows || []).some((row) => (
    Object.keys(row).some((field) => /^(?:最新价|收盘价|前收盘价|开盘价|最高价|最低价|涨跌幅|涨幅|成交量|总成交量|open|high|low|close|volume)$/i.test(field))
  ));
}

function isMonitorDataEventEvidence(item) {
  if (item?.type !== 'datapro' || isMarketEvidence(item)) return false;
  return (item.rows || []).some((row) => Object.entries(row).some(([field, value]) => (
    /事件|事项|公告(?:标题|名称)?|披露(?:事项|标题)?|处罚|诉讼|监管|问询|召回|事故|违约|停产|减持|质押|调查|event|announcement|penalty|lawsuit|investigation|recall/i.test(field)
      && String(value ?? '').trim().length >= 4
  )));
}

function marketChangeValue(item) {
  const snapshot = latestMarketSnapshot([item]);
  const entry = marketSnapshotField(snapshot, /^(?:涨跌幅|涨幅)$/);
  const parsed = Number.parseFloat(String(entry?.value ?? '').replaceAll(',', '').replace('%', ''));
  if (Number.isFinite(parsed)) return parsed;
  return null;
}

function monitorEvidenceRole(item, window) {
  if (isMarketEvidence(item)) {
    const evidenceDate = calendarDate(item.as_of_date);
    if (window && (!evidenceDate || evidenceDate !== window.end_date)) {
      return 'market_history';
    }
    const change = marketChangeValue(item);
    return change !== null && Math.abs(change) >= 3 ? 'market_signal' : 'market_context';
  }
  if (item.type === 'web_search') {
    return publishedWithinWindow(item, window) ? 'new_event' : 'recent_context';
  }
  const evidenceDate = calendarDate(item.as_of_date);
  if (!evidenceDate) return 'recent_context';
  if (window.initial) return evidenceDate >= window.start_date ? 'new_event' : 'recent_context';
  return evidenceDate > window.start_date ? 'new_event' : 'recent_context';
}

function refinementQueries(items, stock, monitorSettings, type = 'monitor') {
  const terms = (type === 'brief'
    ? [stock.name, stock.code]
    : monitorTopicTerms(stock))
    .filter(Boolean);
  const eventTerms = type === 'monitor' ? monitorEventTerms(stock) : [];
  const tierRank = { official: 0, media: 1, open_web: 2 };
  const candidates = [];
  const addCandidate = (value) => {
    const line = String(value || '').replace(/\s+/g, ' ').trim();
    if (line.length < 8 || line.length > 100) return;
    if (!/\p{Script=Han}/u.test(line)) return;
    if (!titleMatchesTerms(line, terms)) return;
    if (eventTerms.length && !titleMatchesTerms(line, eventTerms)) return;
    if (/(?:更多|点击进入|查询平台|统一平台|栏目|北京时间|添加自选|开盘价|五档|媒体舆情|信披公告|融资追击)/.test(line)) return;
    if (isLowInformationPage({ title: line, publisher: '' }, stock)) return;
    candidates.push(line);
  };
  const rankedItems = [...items].sort((left, right) => (
    tierRank[sourceTier(left, stock)] - tierRank[sourceTier(right, stock)]
  ));
  for (const item of rankedItems.filter((entry) => (
    sourceTier(entry, stock) === 'open_web' || isLikelyUgc(entry)
  ))) {
    addCandidate(item.title);
  }
  for (const item of rankedItems.filter((entry) => isLowInformationPage(entry, stock))) {
    for (const rawLine of String(item.summary || item.content || '').split(/\r?\n/)) {
      const line = rawLine
        .replace(/^\s*20\d{2}[-年/.]\d{1,2}(?:[-月/.]\d{1,2})?日?\s*/, '')
        .trim();
      addCandidate(line);
    }
  }
  return uniqueStrings(candidates).slice(0, 2).map((query) => ({
    query,
    timeRange: type === 'brief' ? 'OneMonth' : 'OneWeek',
    authLevel: 1,
    queryRewrite: true,
    refinement: true,
  }));
}

function preferenceRefinementQueries(stock, type, monitorSettings, evidence) {
  const contract = preferenceContractUnits(
    buildPreferenceContract(stock, type, monitorSettings, evidence),
  );
  return contract
    .filter((item) => (
      item.status === 'watch'
      && (
        !['market', 'financial'].includes(item.category)
        || /技术面|走势|趋势|均线|支撑|压力|关键价位|波动率|动量|形态|MACD|KDJ|RSI/i.test(item.preference)
      )
    ))
    .map((item) => ({
      query: type === 'brief'
        ? `${stock.name} ${stock.code} ${item.preference} 最新数据 官方披露 权威报道`
        : `${stock.name} ${stock.code} ${item.preference} 最新变化 公告 监管 权威报道`,
      timeRange: type === 'brief' ? 'OneMonth' : 'OneWeek',
      authLevel: 1,
      queryRewrite: false,
      refinement: true,
      preference_refinement: true,
      focus_item: item.preference,
    }));
}

function isLikelyStaleRepublish(item) {
  const publishedYear = Number(String(item.published_at || '').slice(0, 4));
  if (!Number.isInteger(publishedYear)) return false;
  const years = [...String(item.summary || '').matchAll(/\b(20\d{2})年?/g)].map((match) => Number(match[1]));
  return years.length > 0 && Math.max(...years) <= publishedYear - 2;
}

function sourceTier(item, stock) {
  const url = parsedUrl(item.url);
  const host = url?.hostname.toLowerCase() || '';
  const publisher = String(item.publisher || '');
  const hostingSite = String(item.hosting_site || '');
  const title = String(item.title || '');
  const officialHost = /(?:^|\.)(?:gov\.cn|cninfo\.com\.cn|sse\.com\.cn|szse\.cn|hkexnews\.hk|hkex\.com\.hk|sec\.gov|ftc\.gov|justice\.gov|fda\.gov|epa\.gov|federalregister\.gov)$/.test(host);
  const companyOfficial = publisher === stock.name
    || publisher.startsWith(`${stock.name}股份`)
    || publisher.startsWith(`${stock.name}集团`)
    || publisher.startsWith(`${stock.name}官方`);
  if (officialHost || companyOfficial) return 'official';
  const trustedMediaHost = /(?:^|\.)(?:stcn\.com|cnstock\.com|cs\.com\.cn|cls\.cn|yicai\.com|21jingji\.com|xinhuanet\.com|news\.cn|people\.com\.cn|chinanews\.com\.cn|cctv\.com|cqn\.com\.cn|jiemian\.com|thepaper\.cn|eeo\.com\.cn|cnr\.cn|ce\.cn|cnii\.com\.cn|zgswcn\.com|reuters\.com|apnews\.com|cnbc\.com|bloomberg\.com|wsj\.com|ft\.com|marketwatch\.com)$/.test(host);
  const trustedSinaFinance = /(?:^|\.)finance\.sina\.cn$/.test(host)
    && (publisher === '新浪财经' || hostingSite === '新浪财经');
  const trustedEastmoney = /(?:^|\.)finance\.eastmoney\.com$/.test(host) && /^(?:东方财富网|东方财富)$/.test(publisher);
  if (trustedMediaHost || trustedSinaFinance || trustedEastmoney) {
    return 'media';
  }
  return 'open_web';
}

function sourceLanguageMatches(item, stock) {
  if (stock.exchange === 'US') return true;
  return /\p{Script=Han}/u.test(String(item.title || ''));
}

const substantiveBusinessPattern = /公告|披露|月度数据|经营数据|签署|合同|订单|中标|合作|客户|项目|政策|监管|问询|处罚|调查|诉讼|召回|事故|违约|停产|减持|质押|融资|并购|重组|价格|供应|需求|产能|投产|交付|销量|产量|营收|收入|利润|业绩|研发|产品|临床|门店|出口|海外|市场份额|竞争格局|filing|disclos|contract|order|customer|project|policy|regulat|investigat|lawsuit|recall|acquisition|merger|price|supply|demand|capacity|delivery|sales|revenue|profit|earnings|research|product|clinical|export|market share|competition/i;
const materialNumericFactPattern = /\d[\d,.]*(?:\s?%|万?P\b|万亿|亿(?:元)?|万(?:元|台|辆|吨|家|份|套)?|倍)/i;
const nonInvestmentContentPattern = /文脉|文明对话|文化之旅|丝路|公益活动|慈善活动|体育赛事|足球赛|篮球赛|马拉松|演唱会|音乐节|粉丝活动|员工运动会|团建活动|品牌盛典|颁奖典礼|旅游打卡|游记|filming|concert|marathon|football match|basketball match|charity gala/i;
const unsupportedMediaProductFactPattern = /售价|价格区间|(?:产品|商品|车型|药品|酒).{0,20}价格|价格.{0,20}(?:调整|上调|下调|元)|尺寸|长宽高|轴距|电机|功率|续航|储能时长|能量密度|充电速度|循环寿命|配置|参数|百公里|零百加速|上市时间|预售价|price range|dimensions?|wheelbase|motor|horsepower|range|duration|energy density|charging speed|cycle life|configuration|specifications?/i;
const singleMediaProductRestrictionPattern = /(?:车型|新车|产品).{0,120}(?:进口门槛|准入|禁售|禁止|拒之门外|无法.{0,12}进口)|(?:进口门槛|准入|禁售|禁止|拒之门外).{0,120}(?:车型|新车|产品)/i;
const unsupportedMediaOperatingMetricPattern = /(?:销量|产量|营收|营业收入|净利润|毛利率|市占率|市场份额|产值|交付量|出口量|海外(?:累计)?销量|订单金额|投资额).{0,48}\d|\d.{0,48}(?:销量|产量|营收|营业收入|净利润|毛利率|市占率|市场份额|产值|交付量|出口量|海外(?:累计)?销量|订单金额|投资额)/i;
const speculativeStatementPattern = /机构看好|分析师看好|上调评级|下调评级|目标价|有望超|有望达到|预计|预期|预估|预测|或将|可能达到|业绩指引|计划(?:在|于)|拟于|将于|将在|年底实现|明年(?:开始|实现)|未来.{0,12}(?:实现|交付)|股价.{0,12}(?:支撑|上涨|下跌|承压)|支撑因素|关键在于|这(?:意味着|表明)|标志着|反映出|彰显|体现出|(?:机构|分析师|券商|投行|高盛|摩根|瑞银|花旗|研报).{0,36}(?:认为|看好|评级|目标价|指出|称|表示|判断)|长期.{0,16}(?:压缩|承压)|analysts?\s+(?:expect|forecast)|price target|rating/i;
const editorialCharacterizationPattern = /(?:产业资源优势|技术优势|竞争优势|核心优势|投资逻辑|推荐逻辑)(?:[：:]|持续|显现|突出|明显)?|^风险提示[：:]|绑定下游|(?:明显|持续)?受益于|(?:构成|形成).{0,12}(?:利好|催化)|估值修复|值得下注|谁将被淘汰|前瞻性(?:极强)?|提振市场信心|格局收敛|混战未停|重资产投入压力/i;
const concreteEventHeadlinePattern = /\d|公告|披露|签署|合同|订单|中标|获批|审核|投产|下线|交付|召回|事故|处罚|立案|调查|问询|诉讼|停产|减持|质押|融资|并购|重组|招聘|岗位|工厂|产能|销量|产量|营收|收入|利润|业绩|研发|临床|门店|出口|价格|供应|需求|关税|补贴|禁令|制裁/i;
const monitorMarketPreferencePattern = /股价|行情|走势|技术面|均线|支撑|压力|关键价位|波动率|动量|形态|MACD|KDJ|RSI|成交|估值|市盈率|市净率|资金流|融资融券|机构持仓|基金持仓|重仓股/i;
const monitorMarketContextPattern = /行情|走势|震荡|大盘|行业平均|主力资金|资金净(?:流入|流出)|融资融券|两融|技术面|均线|支撑|压力|关键价位|涨跌|收盘价|开盘价|最高价|最低价|成交量|换手率|估值|持仓比例|股价变化/i;
const monitorCompanyEventPattern = /公告|披露|签署|合同|订单|中标|获批|审核|环评|受理|许可|备案|投产|下线|交付|召回|事故|处罚|立案|调查|问询|诉讼|停产|减持|质押|并购|重组|回购|分红|权益分派|业绩预告|业绩快报|营业收入|净利润|产能|招聘|岗位|(?:发布|推出|上市|亮相).{0,12}(?:产品|车型|新品|新车)|(?:产品|车型|新品|新车).{0,12}(?:发布|推出|上市|亮相)|扩产|建设|开工/i;
const singleMediaPolicyFactPattern = /(?:政策|监管|新规|法规|条例|办法|税率|关税|补贴).{0,60}(?:发布|出台|实施|生效|上调|下调|调整|征收)|(?:发布|出台|实施|生效|上调|下调|调整|征收).{0,60}(?:政策|监管|新规|法规|条例|办法|税率|关税|补贴)/i;
const exactCalendarDatePattern = String.raw`(?:20\d{2}年)?\d{1,2}月\d{1,2}日`;
const singleMediaDefiniteTechnologyFactPattern = new RegExp(
  [
    `(?:备案|获批|审批|许可|认证|注册).{0,80}(?:${exactCalendarDatePattern}|适用场景|适用范围|备案编号|许可编号|认证编号)`,
    `(?:${exactCalendarDatePattern}|适用场景|适用范围|备案编号|许可编号|认证编号).{0,80}(?:备案|获批|审批|许可|认证|注册)`,
    '(?:将作为|将由|拟由|确定由|合作方包括|合作伙伴包括).{0,80}(?:集成|接入|合作|供应|提供|承建|运营)',
    '(?:集成|接入|合作|供应|提供|承建|运营).{0,80}(?:将作为|将由|拟由|确定由|合作方包括|合作伙伴包括)',
  ].join('|'),
  'i',
);
const monitorNoMaterialChangeStatement = '与上次盘后检查相比，本轮增量窗口内没有形成新的实质性公司事件证据。';

function modelEvidenceContent(item) {
  if (item?.type && item.type !== 'web_search') return item?.content;
  const sourceTier = item?.source_tier || 'open_web';
  const sourceText = String(item?.content || item?.summary || item?.title || '');
  const sentences = sourceText
    .replace(/\s+/g, ' ')
    .split(/(?<=[。！？；])\s*|(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => (
      sentence
      && !nonInvestmentContentPattern.test(sentence)
      && !speculativeStatementPattern.test(sentence)
      && !editorialCharacterizationPattern.test(sentence)
      && !(sourceTier !== 'official' && unsupportedMediaOperatingMetricPattern.test(sentence))
      && !(sourceTier !== 'official' && unsupportedMediaProductFactPattern.test(sentence))
      && !(sourceTier !== 'official' && singleMediaProductRestrictionPattern.test(sentence))
      && !(sourceTier !== 'official' && singleMediaPolicyFactPattern.test(sentence))
      && !(sourceTier !== 'official' && singleMediaDefiniteTechnologyFactPattern.test(sentence))
    ));
  return sentences.join(' ').slice(0, 1800) || String(item?.title || '').slice(0, 300);
}

function verificationEvidenceContent(item) {
  if (item?.type && item.type !== 'web_search') return item?.content;
  return String(item?.content || item?.summary || item?.title || '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, 2400);
}

function isSubstantiveBusinessSource(item, stock) {
  const text = `${item?.title || ''} ${item?.summary || item?.content || ''}`;
  if (nonInvestmentContentPattern.test(text)) return false;
  const focusMatched = expandedPreferences(stock?.focus || []).some((value) => (
    focusSearchTerms(value).some((term) => term && text.includes(term))
  ));
  return focusMatched || substantiveBusinessPattern.test(text);
}

function curateWebItems(items, stock, {
  excludeSources = [],
  requireStockInTitle = false,
  requireSubstantiveBusiness = false,
  requiredTitleTerms = [],
  requiredEventTerms = [],
  publishedWindow = null,
  maxItems = 3,
  diversifyByStock = false,
  deprioritizeSources = [],
  preferredTitleTerms = [],
  semanticBindingRequired = false,
  preferenceBindingRequired = false,
} = {}) {
  const tierRank = { official: 0, media: 1, open_web: 2 };
  const trackedPreferences = expandedPreferences(stock?.focus || []);
  const trackedPreferenceSet = new Set(trackedPreferences);
  const excludedKeys = new Set(excludeSources.flatMap((item) => sourceIdentityKeys(item)));
  const deprioritizedKeys = new Set(deprioritizeSources.flatMap((item) => sourceIdentityKeys(item)));
  const isDeprioritized = (item) => sourceIdentityKeys(item).some((key) => deprioritizedKeys.has(key));
  const directlyMatchesTrackedPreference = (item) => trackedPreferences.some((value) => {
    const profile = focusProfile(value);
    if (['market', 'financial'].includes(profile.key)) return false;
    return evidenceDirectlyMatchesPreference({
      ...item,
      type: 'web_search',
      content: item.content || item.summary || '',
    }, value);
  });
  const allowsExternalBriefSource = (item) => trackedPreferences.some((value) => {
    const profile = focusProfile(value);
    if (hasSemanticPreferenceMatch(item, value)) return true;
    if (semanticBindingRequired) return false;
    return !['competition', 'custom', 'market', 'financial'].includes(profile.key)
      && evidenceDirectlyMatchesPreference({
        ...item,
        type: 'web_search',
        content: item.content || item.summary || '',
      }, value);
  });
  const matchesStockIdentity = (item) => {
    const title = String(item.title || '');
    const name = String(stock.name || '').trim();
    const code = String(stock.code || '').trim().toUpperCase();
    if ((name && title.includes(name)) || (code && title.toUpperCase().includes(code))) return true;
    if (stock.exchange !== 'US' || sourceTier(item, stock) === 'open_web') return false;
    const query = String(item.search_query || '');
    return Boolean(
      code
      && query.toUpperCase().includes(code)
      && (!name || query.includes(name)),
    );
  };
  const hasSemanticBinding = (item) => (item.semantic_matches || []).some((match) => (
    trackedPreferenceSet.has(String(match?.preference || '').trim())
      && hasSemanticPreferenceMatch(item, match?.preference)
  ));
  const ranked = items
    .filter((item) => item.title
      && item.url
      && sourceLanguageMatches(item, stock)
      && (!requireStockInTitle
        || matchesStockIdentity(item)
        || allowsExternalBriefSource(item))
      && (!requireSubstantiveBusiness
        || isSubstantiveBusinessSource(item, stock)
        || directlyMatchesTrackedPreference(item))
      && (!semanticBindingRequired || hasSemanticBinding(item))
      && (hasSemanticBinding(item) || titleMatchesTerms(item.title, requiredTitleTerms))
      && (hasSemanticBinding(item)
        || titleMatchesTerms(`${item.title} ${item.summary || ''}`, requiredEventTerms))
      && (!requiredEventTerms.length
        || hasSemanticBinding(item)
        || isMonitorConcreteEventSource(item, stock))
      && publishedWithinWindow(item, publishedWindow)
      && (!preferenceBindingRequired || hasSemanticBinding(item))
      && !isLikelyUgc(item)
      && !isLikelyStaleRepublish(item)
      && !isLowInformationPage(item, stock)
      && !sourceIdentityKeys(item).some((key) => excludedKeys.has(key)))
    .map((item) => ({ ...item, source_tier: sourceTier(item, stock) }))
    .filter((item) => item.source_tier !== 'open_web')
    // A source cannot be cited unless the reader-safe projection retains a concrete fact or headline.
    .filter((item) => Boolean(
      sourceDetailText(item, stock)
      || safeReaderFacingHeadline(item, stock),
    ))
    .sort((left, right) => {
      const tierDifference = tierRank[left.source_tier] - tierRank[right.source_tier];
      if (tierDifference) return tierDifference;
      const preferenceDifference = Number(!directlyMatchesTrackedPreference(left))
        - Number(!directlyMatchesTrackedPreference(right));
      if (preferenceDifference) return preferenceDifference;
      const preferredDifference = Number(!titleMatchesTerms(left.title, preferredTitleTerms))
        - Number(!titleMatchesTerms(right.title, preferredTitleTerms));
      if (preferredTitleTerms.length && preferredDifference) return preferredDifference;
      const reuseDifference = Number(isDeprioritized(left)) - Number(isDeprioritized(right));
      if (reuseDifference) return reuseDifference;
      if (requiredEventTerms.length) {
        const riskPattern = /监管|政策|标准|安全|召回|处罚|诉讼|风险|新规|调查|事故|违约|停产|减持|质押|竞争|分化|价格/;
        const riskDifference = Number(riskPattern.test(String(right.title || '')))
          - Number(riskPattern.test(String(left.title || '')));
        if (riskDifference) return riskDifference;
      }
      return String(right.published_at || '').localeCompare(String(left.published_at || ''));
    });
  const deduplicated = [];
  const seenKeys = new Set();
  for (const item of ranked) {
    const keys = sourceIdentityKeys(item);
    if (keys.some((key) => seenKeys.has(key))) continue;
    if (deduplicated.some((selected) => sourcesRepeatSemanticClaim(selected, item))) continue;
    keys.forEach((key) => seenKeys.add(key));
    deduplicated.push(item);
  }
  if (!diversifyByStock) return deduplicated.slice(0, maxItems);
  const referencesStock = (item) => {
    const name = String(stock.name || '').trim();
    const code = String(stock.code || '').trim().toUpperCase();
    const title = String(item.title || '');
    return (name && title.includes(name)) || (code && title.toUpperCase().includes(code));
  };
  const selected = [];
  const companyItem = deduplicated.find(referencesStock);
  const externalItem = deduplicated.find((item) => !referencesStock(item));
  if (companyItem) selected.push(companyItem);
  if (externalItem) selected.push(externalItem);
  for (const item of deduplicated) {
    if (selected.includes(item)) continue;
    selected.push(item);
    if (selected.length >= maxItems) break;
  }
  return selected.slice(0, maxItems);
}

function correctionInstructions(error) {
  const details = error?.details || error?.issues || [];
  const serialized = JSON.stringify(details);
  if (details.some((issue) => issue.type === 'insufficient_material_risk_corroboration')) {
    return `\n上次输出把未经充分交叉验证的处罚、召回、诉讼或其他重大风险写成了确定事实：${serialized}。此类事实必须绑定 official 来源，或至少两个不同 publisher 的 media 来源；否则删除该事件，或明确写成“单一媒体线索，有待官方核实确认”，不得下确定结论。`;
  }
  if (details.some((issue) => issue.type === 'insufficient_product_fact_corroboration')) {
    return `\n上次输出把单一媒体中的车型参数或产品事实写成了确定事实：${serialized}。车型、售价、尺寸、轴距、电机、功率、续航、配置、上市或申报参数必须由 official 证据支持，或同时绑定至少两个不同发布方的 media 证据；否则删除，或明确标为有待官方核实的单一媒体线索。`;
  }
  if (details.some((issue) => issue.type === 'overbroad_financial_characterization')) {
    return `\n上次输出用“财务表现”“财务状况”“经营表现”或“盈利表现”概括了局部指标：${serialized}。不得作整体性概括，只能逐项写出证据明确提供的营业收入、归母净利润、销售毛利率、研发费用等具体字段。`;
  }
  if (details.some((issue) => issue.type === 'unsupported_authoritative_metric_numbers')) {
    return `\n上次输出把二手媒体中的公司经营或财务数字当成了可采信事实：${serialized}。销量、营收、利润、毛利率、净利率、市占率、费用等公司指标数字只能由 type=datapro 或 source_tier=official 的绑定证据支持；必须删除媒体独有数字，不得通过换算或改写保留。媒体只能作为行业背景。若核心关注缺少权威证据，status 必须为 insufficient、risk_level 必须为 unknown。`;
  }
  const numericOnly = details.length > 0 && details.every((issue) => Array.isArray(issue.numbers));
  if (numericOnly) {
    return `\n上次输出未通过校验：${serialized}。必须删除这些不受支持的数字，或改为所绑定 evidence 中完全相同的数字字符串；禁止换算单位、四舍五入、截断小数和计算派生值。如无法确认，改成不含数字的定性句。只能重组已有证据，不得增加事实。`;
  }
  return `\n上次输出未通过语义证据审校：${serialized}。逐项删除或重写冲突表述；优先使用 source_tier=official 的已披露实际值，不得把“预计”、“目标”、“有望”写成已发生事实；数据冲突时不得把冲突来源绑定在同一事实 claim 上，无法澄清就省略该结论。只能重组已有证据，不得增加事实。`;
}

function buildInstructions(type) {
  const task = type === 'brief' ? '个股简评' : '盘后风险摘要';
  const taskContract = type === 'brief'
    ? `\n个股简评固定结构：\n
20. 这是截至当前的公司状态短评，不是告警。summary 用二至三句直接给出当前最重要的观察，不写数据来源、检索过程或证据规则。\n
21. claims 的 section_title 只能使用“市场表现”“经营与财务”“关注方向”“后续观察”，并按此顺序组织。每节一至两个完整自然段，先写事实，再解释与用户关注方向的关系。\n
22. “市场表现”只写最新交易日的价格、涨跌或成交信息；“经营与财务”只写最新已披露口径；“关注方向”围绕 stock.focus 写近期公司进展、行业变化或竞争动态；“后续观察”写下一次应核对的具体指标、公告或事件。\n
23. preference_contract 已把复合偏好拆成可独立核验的子关注点。status=covered 的每个子关注点都必须在 expected_section 中被实质回答，并且至少引用 allowed_evidence_ids 中一条、不得引用集合外证据；allowed_evidence_ids 是可选集合，不要求全部引用。status=watch 的子关注点不得在“关注方向”等偏好专属段落中被写成已覆盖，也不得在摘要或结论中声称该子关注点已有结论。is_system_core=true 且 category=core_brief 表示固定基础栏目或经过筛选的公司动态补充，只能在 expected_section 使用其 allowed_evidence_ids，不属于用户偏好，也不能写成用户偏好已经得到回答。\n
24. 不得使用盘后告警、检查窗口、新增风险等监控话术。不得把“资料不足”当作正文主题；某个关注方向没有可靠事实时，直接省略该事实和对应栏目，不得用其他来源、泛化文字或待核对事项凑段落。`
    : `\n盘后风险摘要固定结构：\n
20. 这是盘后风险雷达，不是公司全景简评。summary 用二至三句直接说明本轮风险状态、最重要信号及可能影响，不描述检索过程。\n
21. claims 的 section_title 只能使用“市场异动”“公司事件”“外部风险”“后续观察”，并按此顺序组织。stock.focus 只改变各节关注重点，不改变栏目骨架。\n
22. “市场异动”只判断最新行情是否形成值得关注的价格或交易信号，不复述完整行情；“公司事件”只写公告、监管、治理、经营、安全等公司层面事项；“外部风险”只写行业政策、竞争、供应链和宏观事项；“后续观察”必须给出与 stock.focus 对应的具体观察对象。\n
23. evidence.monitor_role=new_event 表示自上次检查后的新增事件；recent_context 表示近7日背景；market_signal 表示检查日达到异动阈值的行情；market_context 表示检查日行情背景；market_history 表示早于检查日的最近交易日行情，只能作为背景。不得把 recent_context 写成新增事件，也不得把 market_history 写成检查日异动。\n
24. preference_contract 已把复合偏好拆成可独立核验的子监控项。status=covered 的每个子监控项都必须在 expected_section 中被实质回答，并且至少引用 allowed_evidence_ids 中一条、不得引用集合外证据；allowed_evidence_ids 是可选集合，不要求全部引用。is_system_core=true 表示盘后监控的基础公司事件范围，它不属于用户偏好，但可以在“公司事件”栏目使用其 allowed_evidence_ids 中的来源。status=watch 的子监控项不得在偏好专属段落、摘要或结论中被写成已覆盖；但系统基础行情或公司事件栏目可以使用各自 is_system_core 契约中的证据。\n
25. 没有新增事件时，只写 market_context、market_signal、market_history 或 recent_context 中存在的具体事实，并直接省略没有证据的栏目。market_history 必须写明实际交易日期，不能使用“当日异动”措辞。不得用“未发现”“未查到”“未形成”“没有新增”等检查结论填充 summary、claims、conclusion 或 limitations。只有 new_event 或 market_signal 可触发 low、medium、high；否则 risk_level 必须为 unknown。coverage 仅用于后台审计，不得出现在用户可见措辞中。`;
  return `你是严谨的公开市场研究助手，正在生成${task}。\n
必须遵守：\n
1. 只能使用输入中的 evidence，不得使用模型记忆或补写未提供的事实。\n
2. 每个事实性 claim 都必须绑定一个或多个 evidence_ids。\n
3. summary、change_summary、claim 中的数字、百分比、日期必须存在于所绑定证据；日期仅允许 ISO 与中文同日等价转换。\n
4. DataPro 是专业数据来源，不把它描述成新闻库；网页信息只来自 web_search evidence。\n
5. 不给出买入、卖出、收益承诺、目标价或仓位指令。\n
6. “没有发现风险”和“证据不足”必须区分。证据覆盖不足时 risk_level 必须为 unknown。\n
7. summary_evidence_ids 必须支持摘要；存在新证据时 change_evidence_ids 必须支持变化说明。\n
8. 即使证据与上次相同，也要基于本次 evidence 独立组织正文，不得逐字复制 previous_summary；不得为了制造差异增加新事实。\n
9. claims 必须是扁平列表，每项用 section_title 指定所属栏目，不得输出嵌套 sections。\n
10. 不得换算单位、四舍五入、截断小数或根据多个数字自行计算；优先复制证据中可直接展示的数值，无法原样引用时使用不含数字的定性表述。\n
11. 来源优先级为 official > media > open_web；数据相互冲突时，优先已披露的实际值，不得把预测值当成实际值，不得用冲突来源共同支持一条结论。\n
12. 输出简体中文，严格遵守 JSON Schema，不输出 Markdown。\n
13. 公司销量、产量、交付量、营收、利润、毛利率、净利率、市占率和费用等经营财务数字，只能由 DataPro 或 source_tier=official 的证据支持。media 可用于有明确来源的定性进展或行业背景，但不得把媒体转述写成已经取得官方公告原文。\n
14. 处罚、罚款、立案、调查、监管问询、召回、诉讼、事故、违约或禁令等重大风险事实，必须由 official 证据支持，或同时绑定至少两个不同发布方的 media 证据；单一媒体线索只能明确标为“有待官方核实确认”，不得写成确定事实。\n
15. 售价、尺寸、轴距、电机、功率、续航、配置及其他可量化产品参数，必须由 official 证据支持，或同时绑定至少两个不同发布方的 media 证据；只有单一 media 时必须完全省略这些产品参数，即使写“有待核实”也不得复述。媒体明确报道的产品发布、备案、投产或量产进展不属于产品参数，可以保留，但必须写明发布方归因且不得扩大为公司正式公告。\n
16. 不得用“财务表现”“财务状况”“经营表现”或“盈利表现”概括局部指标，只能逐项描述证据明确提供的字段。\n
17. summary 和 conclusion 必须是投资者可直接阅读的实质内容，可以概括正文中已被引用支持的事实，但不得重复审校规则、来源门槛或“证据边界”。change_summary 只写与上一份报告相比发生了什么变化，页面不会把它当作正文主体。\n
18. 同一 DataPro 证据若出现一般企业、商业银行、保险公司或证券公司等不同利润表口径，不得混用；只能使用与证券所属公司类型一致且值非空的字段，无法确认时省略。\n
19. 输出必须是可直接阅读的研究短文，不得出现“DataPro字段”“联网搜索返回”“公开信息部分纳入”“用于补充核对”“达到权威性”“交叉核验门槛”“本条只证明”“查询次数”“命中条数”“Provider”“trace”“证据边界”“资料覆盖”等后台或审校话术。栏目内的 claim 是完整自然段，不是键值对、日志或接口说明。\n
20. 个股简评“关注方向”中的每一段都必须实质回答 preference_contract 中至少一个 status=covered 的用户子关注点，或忠实呈现 category=core_brief 的“公司动态”系统契约，并引用对应 allowed_evidence_ids 中至少一条；没有任何契约支持的泛公司新闻不得放入该栏目。status=watch 的用户子关注点不得被写成已覆盖；固定“市场表现”“经营与财务”基础栏目及系统公司动态不能冒充用户偏好。
21. evidence.semantic_matches 中的 quote 是程序逐字核验过的偏好关联原句。引用该 evidence 回答对应偏好时，只能忠实压缩 quote 的含义，不得把它扩展为未披露的公司事实。${taskContract}`;
}

function verificationInstructions(type) {
  const taskRule = type === 'monitor'
    ? '\n盘后风险摘要还必须满足：栏目只使用“市场异动”“公司事件”“外部风险”“后续观察”；new_event 才能写成新增事件，recent_context 只能写成近7日背景；market_context 不能单独升级风险；market_history 只能写成带实际交易日期的最近交易日背景，不能写成检查日异动；不得复述完整财务快照；coverage 不得写入用户可见措辞，也不得据此生成“未发现”“未查到”“未形成”或“没有新增”等否定性检查结论；没有证据的栏目必须省略。'
    : '\n个股简评还必须满足：栏目只使用“市场表现”“经营与财务”“关注方向”“后续观察”；内容是当前状态快照，不能伪装成盘后告警或把证据不足写成风险较低。';
  return `你是金融报告证据审校器。逐句核对报告与其绑定 evidence。\n
只有当所有事实性陈述均可由对应证据直接支持、没有引入外部知识、没有投资指令时，valid 才能为 true。\n
公司销量、产量、交付量、营收、利润、毛利率、净利率、市占率和费用等经营财务数字，必须由 type=datapro 或 source_tier=official 的证据直接支持；media 不可作为这些数字的权威依据，也不得从媒体转述反推已取得官方原文。普通合作协议、项目进展、供应商合同、客户拓展和技术布局不属于这组经营财务指标；若正文明确写成“某发布方报道/提及”，允许由一条可信 media 证据忠实支持，不得误套经营财务数字门槛。\n
处罚、罚款、立案、调查、监管问询、召回、诉讼、事故、违约或禁令等重大风险事实，必须由 official 证据支持，或同时绑定至少两个不同发布方的 media 证据；单一媒体线索不得作为确定事实。\n
售价、尺寸、轴距、电机、功率、续航、配置及其他可量化产品参数，必须由 official 证据支持，或同时绑定至少两个不同发布方的 media 证据；只有单一 media 时不得复述，即使附带“有待核实”也不合格。媒体明确报道的产品发布、备案、投产或量产进展不属于产品参数，只要正文保留发布方归因并忠实压缩原文即可。不得用“财务表现”“财务状况”“经营表现”或“盈利表现”概括局部指标。不得混用一般企业、商业银行、保险公司或证券公司的利润表字段。\n
YYYYMMDD、YYYY-MM-DD 和“YYYY年M月D日”仅是同一日历日期的展示格式差异，允许在不改变日期值时规范化，不应据此判为不支持。\n
preference_contract 中 status=covered 的每个子关注点都必须在指定栏目至少有一条实质回答，该条回答必须至少引用 allowed_evidence_ids 中一条且不得引用集合外证据；allowed_evidence_ids 是替代性可选集合，不要求一段正文把全部来源都引用。同一栏目允许同时存在回答其他偏好的段落，各段分别对应已覆盖的子关注点并引用各自证据。is_system_core=true 不是用户偏好：category=core_brief 表示个股简评固定基础栏目或经过筛选的公司动态补充，只要在 expected_section 忠实引用其 allowed_evidence_ids 即为合格，但不得冒充用户偏好；盘后监控的系统契约同理只能用于其指定基础栏目。个股简评“关注方向”中的每一段必须对应 covered 用户子关注点或 core_brief 公司动态契约，没有任何契约支持的泛公司新闻不合格。status=watch 的用户子关注点不得在偏好专属段落、摘要或结论中被写成已覆盖，也不得引用其他证据为它生成后续观察；有独立系统契约支持的固定市场、财务、公司动态及监控基础栏目可以正常保留。\n
“后续应观察”“仍需结合正式披露判断”等句子属于研究边界或观察动作，不是在陈述新的公司事实；只要没有夹带证据外事实，不应单独据此判为无效。以“某发布方报道/提及”开头的句子允许忠实压缩对应 evidence 的原意，不要求逐字复制，但不得扩大确定性或补入证据中没有的数字。\n
只有前文明确列出的重大风险事实和车型/产品参数适用 official 或两个独立 media 的交叉门槛；不得把该门槛扩展到普通合作、项目、订单、供应链和技术进展。媒体内容必须保留“报道/提及”归因，不能改写成公司已正式公告。\n
报告正文不得出现“公开信息部分纳入”“用于补充核对”“达到权威性”“交叉核验门槛”“查询次数”“命中条数”“Provider”“trace”“证据边界”“资料覆盖”等检索或审校话术。不得因为表述流畅而放宽标准；不确定时判定为 false。严格按 JSON Schema 输出。${taskRule}`;
}

function buildInput({ stock, type, evidence, previous, changeStatus, monitorSettings, window }) {
  const preferenceContract = buildPreferenceContract(stock, type, monitorSettings, evidence);
  return JSON.stringify({
    task: type,
    report_goal: type === 'brief'
      ? '生成截至当前的公司全景快照'
      : '生成盘后风险雷达，区分自上次检查后的新增信号、当日市场异动与近7日风险背景',
    stock: { name: stock.name, code: stock.code, exchange: stock.exchange, focus: stock.focus },
    monitor_settings: type === 'monitor' ? monitorSettings : null,
    monitor_window: type === 'monitor' ? window : null,
    preference_contract: modelPreferenceContract(preferenceContract),
    generation_contract: {
      change_status: changeStatus,
      previous_summary: previous?.report?.analysis?.summary || null,
      previous_evidence_fingerprint: previous?.evidence_fingerprint || null,
      if_no_material_change: 'change_summary 必须明确说明与上次相比未发现新的实质性证据。',
      freshness_rule: '本次必须重新综合当前 evidence；事实可以不变，但 summary 不得逐字复制 previous_summary。',
    },
    evidence: evidence.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      publisher: item.publisher,
      url: item.url,
      as_of_date: item.as_of_date,
      published_at: item.published_at,
      source_tier: item.source_tier || null,
      monitor_role: item.monitor_role || null,
      semantic_matches: item.semantic_matches || [],
      content: modelEvidenceContent(item),
    })),
  });
}

function monitorCoverageEvidence({ stock, window, providerStatus, eventEvidenceCount, retrievedAt }) {
  const rows = [{
    '增量检查区间': `${window.start_label} 至 ${window.end_label}`,
    '风险观察区间': `${window.review_start_date} 至 ${window.review_end_date}`,
    '关注方向': (stock.focus || []).join('、'),
  }];
  return {
    id: 'C1',
    type: 'coverage',
    title: `${stock.name} · 盘后检查范围`,
    publisher: '系统检查记录',
    url: null,
    retrieved_at: retrievedAt,
    published_at: null,
    as_of_date: window.end_date,
    freshness: 'current',
    content: JSON.stringify(rows[0]),
    rows,
    metadata: { window, event_evidence_count: eventEvidenceCount },
  };
}

function monitorNoAlertCandidate(changeStatus, evidence = [], stock = null, monitorSettings = null) {
  const marketSections = deterministicCoreSections(evidence, 'monitor', stock);
  const contextSections = deterministicContextSections(evidence, stock, 'monitor');
  const sections = [...marketSections, ...contextSections];
  const summary = monitorComprehensiveSummary({ sections }, evidence, changeStatus);
  const fallbackClaim = sections.flatMap((section) => section.claims || []).at(-1);
  const conclusion = summary || (fallbackClaim ? {
    text: fallbackClaim.text,
    evidence_ids: fallbackClaim.evidence_ids,
  } : null);
  const coverage = evidence.find((item) => item.type === 'coverage');
  return {
    status: 'sufficient',
    summary: summary?.text || fallbackClaim?.text || '本轮盘后检查没有形成可展示的事实段落。',
    summary_evidence_ids: summary?.evidence_ids?.length
      ? summary.evidence_ids
      : fallbackClaim?.evidence_ids || [coverage?.id].filter(Boolean),
    change_summary: changeStatus === 'initial'
      ? '这是首次盘后检查，暂无可比较的历史检查结果。'
      : monitorNoMaterialChangeStatement,
    change_evidence_ids: [],
    risk_level: 'unknown',
    claims: [
      ...marketSections.flatMap((section) => section.claims.map((claim) => ({
        section_title: section.title,
        ...claim,
      }))),
      ...contextSections.flatMap((section) => section.claims.map((claim) => ({
        section_title: section.title,
        ...claim,
      }))),
    ].filter((claim) => claim.evidence_ids?.length),
    conclusion: {
      text: conclusion?.text || '本轮盘后检查没有形成可展示的事实段落。',
      evidence_ids: conclusion?.evidence_ids?.length
        ? conclusion.evidence_ids
        : [coverage?.id].filter(Boolean),
    },
    limitations: [],
  };
}

function normalizeNoSignalMonitorCandidate(candidate, evidence, stock, monitorSettings, changeStatus) {
  const fallback = monitorNoAlertCandidate(changeStatus, evidence, stock, monitorSettings);
  const presentsNewSignal = (text) => {
    const value = String(text || '');
    if (/未(?:发现|形成|出现|触发).{0,10}新增/.test(value)) return false;
    return /检查窗口内出现|本轮形成.{0,12}(?:事件|线索|风险)|新增(?:风险|事件|信号|证据)|触发.{0,8}(?:风险|告警)/.test(value);
  };
  const fallbackByTitle = new Map(fallback.claims.map((claim) => [claim.section_title, claim]));
  const safeClaims = (candidate.claims || []).filter((claim) => {
    if (presentsNewSignal(claim.text)) return false;
    const onlyUsesCoverage = claim.evidence_ids?.length
      && claim.evidence_ids.every((id) => (
        evidence.find((item) => item.id === id)?.type === 'coverage'
      ));
    if (onlyUsesCoverage) return false;
    const title = canonicalSectionTitle(claim.section_title, 'monitor');
    const contextualFallback = fallbackByTitle.get(title);
    const fallbackHasPublicSource = contextualFallback?.evidence_ids?.some((id) => id !== 'C1');
    const candidateOnlyUsesCoverage = claim.evidence_ids?.length
      && claim.evidence_ids.every((id) => id === 'C1');
    return !(fallbackHasPublicSource && candidateOnlyUsesCoverage);
  });
  const safeTitles = new Set(safeClaims.map((claim) => canonicalSectionTitle(claim.section_title, 'monitor')));
  const fallbackClaims = fallback.claims.filter((claim) => !safeTitles.has(claim.section_title));
  return {
    ...candidate,
    status: 'sufficient',
    summary: fallback.summary,
    summary_evidence_ids: fallback.summary_evidence_ids,
    change_summary: fallback.change_summary,
    change_evidence_ids: [],
    risk_level: 'unknown',
    claims: [...safeClaims, ...fallbackClaims],
    conclusion: fallback.conclusion,
    limitations: [],
  };
}

function verificationInput(report, evidence, changeStatus, preferenceContract = []) {
  return JSON.stringify({
    verification_contract: {
      require_every_factual_statement_supported: true,
      reject_external_knowledge: true,
      reject_investment_instructions: true,
      allow_system_metadata_statements: [
        changeStatus === 'initial' ? '这是首次生成的报告，暂无可比较的历史结果。' : null,
        changeStatus === 'no_material_change' ? '与上次相比，本次检索未发现新的实质性证据。' : null,
        changeStatus === 'no_material_change' ? '本次重新检索未发现新的实质性证据。' : null,
        changeStatus === 'no_material_change' ? '与上次相比，本次可核验事实未发生实质变化。' : null,
        changeStatus === 'no_material_change' ? monitorNoMaterialChangeStatement : null,
        changeStatus === 'no_material_change' ? '本轮增量窗口内没有形成有别于上次的新增公司事件证据。' : null,
      ].filter(Boolean),
    },
    preference_contract: modelPreferenceContract(preferenceContract),
    report,
    evidence: evidence.map((item) => ({
      id: item.id,
      title: item.title,
      publisher: item.publisher,
      url: item.url,
      published_at: item.published_at,
      source_tier: item.source_tier || null,
      monitor_role: item.monitor_role || null,
      semantic_matches: item.semantic_matches || [],
      content: verificationEvidenceContent(item),
    })),
  });
}

function validatePreferenceCoverage(report, preferenceContract, type = 'brief', evidence = []) {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const issues = [];
  for (const item of preferenceContractUnits(preferenceContract)) {
    if (item.status === 'covered') {
      const allowedEvidenceIds = new Set(item.evidence_ids);
      const matched = report.sections.some((section) => (
        section.title === item.expected_section
        && section.claims.some((claim) => (
          claim.evidence_ids?.some((id) => allowedEvidenceIds.has(id))
          && contractClaimMatchesEvidence(item, claim, evidenceById)
        ))
      ));
      if (!matched) {
        issues.push({
          location: `preference_contract.${item.preference}`,
          type: 'preference_not_substantively_covered',
          expected_section: item.expected_section,
          evidence_ids: item.evidence_ids,
        });
      }
      continue;
    }
    if (item.status === 'watch') continue;
  }
  if (issues.length) {
    throw new EvidenceValidationError('报告未完整落实用户关注偏好', issues);
  }
  return report;
}

function stripInternalCoverageClaims(report, evidence, type) {
  const coverageIds = new Set(
    evidence.filter((item) => item.type === 'coverage').map((item) => item.id),
  );
  const auditAbsencePattern = /(?:本轮|本次|当前|截至本次|截至当前|检查窗口(?:内)?|近(?:7|七)日|近期|尚|暂).{0,60}(?:未(?:发现|查到|检索到|形成|出现|触发|检出)|没有).{0,56}(?:新增|风险|信号|公告|事件|事项|信息|结论|证据|变化|提示)/;
  const missingDataNarrationPattern = /(?:本轮|本次|当前)?(?:证据|资料|来源).{0,24}未(?:提供|包含|列示).{0,48}(?:股价|行情|涨跌|成交|财务|经营数据)|无法对.{0,36}(?:市场表现|行情|经营|财务).{0,20}(?:陈述|判断|评价)|没有形成可展示的事实段落/;
  const stripAuditAbsence = (text) => {
    const chunks = String(text || '').match(/[^。！？!?；;]+[。！？!?；;]?/g) || [];
    return chunks
      .filter((chunk) => {
        const normalized = chunk.replace(/\s+/g, ' ').trim();
        return !auditAbsencePattern.test(normalized)
          && !missingDataNarrationPattern.test(normalized);
      })
      .join('')
      .replace(/[；;]\s*$/, '。')
      .trim();
  };
  const sections = report.sections.map((section) => ({
    ...section,
    claims: section.claims.map((claim) => ({
      ...claim,
      text: stripAuditAbsence(claim.text),
    })).filter((claim) => {
      if (!claim.text) return false;
      const ids = claim.evidence_ids || [];
      return !ids.length || !ids.every((id) => coverageIds.has(id));
    }),
  })).filter((section) => section.claims.length);
  const concreteClaims = sections.flatMap((section) => section.claims);
  const fallbackClaim = concreteClaims.at(-1);
  let summary = stripAuditAbsence(report.summary);
  let summaryEvidenceIds = report.summary_evidence_ids;
  if (!summary && concreteClaims.length) {
    summary = leadingSentences(concreteClaims[0].text, 1);
    summaryEvidenceIds = concreteClaims[0].evidence_ids;
  }
  let conclusion = {
    ...report.conclusion,
    text: stripAuditAbsence(report.conclusion?.text),
  };
  if (!conclusion.text && fallbackClaim) {
    conclusion = {
      text: fallbackClaim.text,
      evidence_ids: fallbackClaim.evidence_ids,
    };
  }
  return {
    ...report,
    summary,
    summary_evidence_ids: summaryEvidenceIds,
    sections,
    conclusion,
    limitations: (report.limitations || []).filter((item) => stripAuditAbsence(item)),
  };
}

function sectionClaimIndexes(report, location) {
  const numericMatch = String(location || '').match(/^sections\.(\d+)\.claims\.(\d+)$/);
  if (numericMatch) {
    return {
      sectionIndex: Number(numericMatch[1]),
      claimIndex: Number(numericMatch[2]),
    };
  }
  const titleMatch = String(location || '').match(/^sections\[([^\]]+)\]\.claims\[(\d+)\]$/u);
  if (!titleMatch) return null;
  const sectionToken = titleMatch[1].trim();
  const sectionIndex = /^\d+$/.test(sectionToken)
    ? Number(sectionToken)
    : (report.sections || []).findIndex((section) => (
      String(section.title || '').trim() === sectionToken
    ));
  if (sectionIndex < 0) return null;
  return {
    sectionIndex,
    claimIndex: Number(titleMatch[2]),
  };
}

function pruneInvalidSectionClaims(report, issues) {
  const invalidClaims = new Map();
  for (const issue of issues || []) {
    const indexes = sectionClaimIndexes(report, issue.location);
    if (!indexes) return null;
    const { sectionIndex, claimIndex } = indexes;
    if (!report.sections?.[sectionIndex]?.claims?.[claimIndex]) return null;
    const claimIndexes = invalidClaims.get(sectionIndex) || new Set();
    claimIndexes.add(claimIndex);
    invalidClaims.set(sectionIndex, claimIndexes);
  }
  if (!invalidClaims.size) return null;
  let prunedCount = 0;
  const sections = report.sections.map((section, sectionIndex) => ({
    ...section,
    claims: section.claims.filter((_claim, claimIndex) => {
      const remove = invalidClaims.get(sectionIndex)?.has(claimIndex) || false;
      if (remove) prunedCount += 1;
      return !remove;
    }),
  })).filter((section) => section.claims.length);
  if (!sections.length) return null;
  return { report: { ...report, sections }, prunedCount };
}

function stabilizeInvalidReport(report, issues, evidence, changeStatus, context = {}) {
  const evidenceIds = evidence.map((item) => item.id).slice(0, 8);
  if (!evidenceIds.length) return null;
  const next = structuredClone(report);
  const invalidClaims = new Map();
  const rewrittenFields = new Set();
  let conclusionNeedsReplacement = false;
  for (const issue of issues || []) {
    const location = String(issue.location || '');
    const indexes = sectionClaimIndexes(next, location);
    if (indexes) {
      const { sectionIndex, claimIndex } = indexes;
      if (!next.sections?.[sectionIndex]?.claims?.[claimIndex]) return null;
      const claimIndexes = invalidClaims.get(sectionIndex) || new Set();
      claimIndexes.add(claimIndex);
      invalidClaims.set(sectionIndex, claimIndexes);
    } else if (location === 'summary') {
      next.summary = '';
      next.summary_evidence_ids = [];
      rewrittenFields.add('summary');
    } else if (location === 'conclusion') {
      next.conclusion = {
        text: '',
        evidence_ids: [],
      };
      conclusionNeedsReplacement = true;
      rewrittenFields.add('conclusion');
    } else if (location === 'change_summary' && changeStatus === 'new_evidence') {
      const readerSafeChange = readerSafeChangeSummary(
        evidence,
        context.type || 'brief',
        context.stock || null,
      );
      if (!readerSafeChange) return null;
      next.change_summary = readerSafeChange.text;
      next.change_evidence_ids = readerSafeChange.evidence_ids;
      rewrittenFields.add('change_summary');
    } else {
      return null;
    }
  }
  let prunedCount = 0;
  next.sections = next.sections.map((section, sectionIndex) => ({
    ...section,
    claims: section.claims.filter((_claim, claimIndex) => {
      const remove = invalidClaims.get(sectionIndex)?.has(claimIndex) || false;
      if (remove) prunedCount += 1;
      return !remove;
    }),
  })).filter((section) => section.claims.length);
  if (!next.sections.length) return null;
  if (conclusionNeedsReplacement) {
    const fallbackClaim = next.sections.flatMap((section) => section.claims || []).at(-1);
    if (!fallbackClaim?.text || !fallbackClaim?.evidence_ids?.length) return null;
    next.conclusion = {
      text: fallbackClaim.text,
      evidence_ids: fallbackClaim.evidence_ids,
    };
  }
  if (rewrittenFields.has('summary')) {
    const stabilizedSummary = context.type === 'monitor'
      ? monitorComprehensiveSummary(next, evidence, changeStatus)
      : briefComprehensiveSummary(
        next,
        changeStatus,
        evidenceIds,
        context.preferenceContract || [],
      );
    if (!stabilizedSummary) return null;
    next.summary = stabilizedSummary.text;
    next.summary_evidence_ids = stabilizedSummary.evidence_ids;
  }
  if (rewrittenFields.size) {
    const hasReaderFacingClaims = next.sections.some((section) => (
      section.claims.some((claim) => claim.evidence_ids?.length)
    ));
    next.status = hasReaderFacingClaims ? 'sufficient' : 'insufficient';
    next.risk_level = 'unknown';
    if (!hasReaderFacingClaims) {
      next.limitations = [...new Set([
        ...next.limitations,
        '本轮未形成可直接展示的事实内容。',
      ])].slice(0, 8);
    }
  }
  return { report: next, prunedCount, rewrittenFields: [...rewrittenFields] };
}

function firstDataField(evidence, fieldPattern) {
  for (const item of evidence.filter((entry) => entry.type === 'datapro')) {
    for (const row of item.rows || []) {
      const matched = Object.entries(row).find(([field]) => fieldPattern.test(field));
      if (matched) return { evidence: item, field: matched[0], value: matched[1] };
    }
  }
  return null;
}

function marketRowDate(row) {
  for (const [field, value] of Object.entries(row || {})) {
    if (!/^(?:实际交易日期|最近交易日|最新交易日|交易日期|行情日期|数据日期|实际交易时间|最近交易时间|最新交易时间|交易时间)$/.test(field)) continue;
    const date = calendarDate(value);
    if (date) return date;
  }
  return null;
}

function latestMarketSnapshot(evidence) {
  const market = [...(evidence || [])]
    .filter(isMarketEvidence)
    .sort((left, right) => (
      String(calendarDate(right.as_of_date) || '').localeCompare(
        String(calendarDate(left.as_of_date) || ''),
      )
    ))[0];
  if (!market) return null;
  const rows = market.rows || [];
  const datedRows = rows
    .map((row, index) => ({ row, index, date: marketRowDate(row) }))
    .filter((item) => item.date)
    .sort((left, right) => left.date.localeCompare(right.date) || left.index - right.index);
  return {
    evidence: market,
    row: datedRows.at(-1)?.row || rows.at(-1) || rows[0] || {},
  };
}

function marketSnapshotField(snapshot, fieldPattern) {
  if (!snapshot) return null;
  const matched = Object.entries(snapshot.row || {}).find(([field]) => fieldPattern.test(field));
  return matched
    ? {
      evidence: snapshot.evidence,
      field: matched[0],
      value: matched[1],
    }
    : null;
}

function marketSnapshotDate(snapshot) {
  return marketSnapshotField(
    snapshot,
    /^(?:实际交易日期|最近交易日|最新交易日|交易日期|行情日期|数据日期)$/,
  ) || (
    snapshot?.evidence?.as_of_date
      ? {
        evidence: snapshot.evidence,
        field: '交易日期',
        value: snapshot.evidence.as_of_date,
      }
      : null
  );
}

function readableEvidenceValue(value) {
  if (Array.isArray(value)) return value.map(readableEvidenceValue).filter(Boolean).join('、');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value ?? '').trim();
}

function readableCalendarValue(value) {
  const text = readableEvidenceValue(value);
  const compact = text.match(/^(20\d{2})(0[1-9]|1[0-2])([0-2]\d|3[01])$/);
  return compact ? `${compact[1]}-${compact[2]}-${compact[3]}` : text;
}

function uniqueEvidenceIds(matches) {
  return [...new Set(matches.filter(Boolean).map((match) => match.evidence.id))];
}

function deterministicCoreSections(evidence, type, stock = null) {
  if (type === 'monitor') {
    const snapshot = latestMarketSnapshot(evidence);
    if (!snapshot) return [];
    const market = snapshot.evidence;
    const date = marketSnapshotDate(snapshot);
    const latest = marketSnapshotField(snapshot, /^最新价$/)
      || marketSnapshotField(snapshot, /^收盘价$/);
    const change = marketSnapshotField(snapshot, /^(?:涨跌幅|涨幅)$/);
    const open = marketSnapshotField(snapshot, /^(?:开盘价|open)$/i);
    const high = marketSnapshotField(snapshot, /^(?:最高价|当日最高|high)$/i);
    const low = marketSnapshotField(snapshot, /^(?:最低价|当日最低|low)$/i);
    const volume = marketSnapshotField(snapshot, /^(?:成交量|总成交量|volume)$/i);
    const subject = stock?.name || '该标的';
    const when = date ? readableEvidenceValue(date.value) : market.as_of_date;
    const details = [
      latest ? `最新价为${readableEvidenceValue(latest.value)}` : '',
      change ? `涨跌幅为${readableEvidenceValue(change.value)}` : '',
      open ? `开盘价为${readableEvidenceValue(open.value)}` : '',
      high ? `最高价为${readableEvidenceValue(high.value)}` : '',
      low ? `最低价为${readableEvidenceValue(low.value)}` : '',
      volume ? `成交量为${readableEvidenceValue(volume.value)}` : '',
    ].filter(Boolean).slice(0, 4);
    return [{
      title: '市场异动',
      claims: [{
        text: `${when ? `${when}，` : ''}${subject}${details.join('，') || '已有最新行情记录'}。`,
        evidence_ids: [market.id],
      }],
    }];
  }
  const sections = [];
  const snapshot = latestMarketSnapshot(evidence);
  const quote = {
    date: marketSnapshotDate(snapshot),
    time: marketSnapshotField(snapshot, /^(?:实际交易时间|最近交易时间|最新交易时间|交易时间)$/),
    latest: marketSnapshotField(snapshot, /^最新价$/)
      || marketSnapshotField(snapshot, /^收盘价$/),
    previous: marketSnapshotField(snapshot, /^前收盘价$/),
    high: marketSnapshotField(snapshot, /^(?:最高价|当日最高)$/),
    low: marketSnapshotField(snapshot, /^(?:最低价|当日最低)$/),
    change: marketSnapshotField(snapshot, /^(?:涨跌幅|涨幅)$/),
    volume: marketSnapshotField(snapshot, /^(?:成交量|总成交量)$/),
  };
  const quoteMatches = Object.values(quote).filter(Boolean);
  if (quoteMatches.length) {
    const subject = stock?.name || '该标的';
    const when = [quote.date && readableEvidenceValue(quote.date.value), quote.time && readableEvidenceValue(quote.time.value)]
      .filter(Boolean).join(' ');
    const changeValue = quote.change && readableEvidenceValue(quote.change.value);
    const firstSentence = quote.latest
      ? `${when ? `截至${when}，` : ''}${subject}最新价为${readableEvidenceValue(quote.latest.value)}${changeValue?.includes('%') ? `，涨跌幅为${changeValue}` : ''}。`
      : `${when ? `专业行情数据的最新记录时间为${when}` : '本次已取得最新可用的专业行情记录'}。`;
    const rangeParts = [
      quote.previous ? `前收盘价为${readableEvidenceValue(quote.previous.value)}` : '',
      quote.high ? `当日最高价为${readableEvidenceValue(quote.high.value)}` : '',
      quote.low ? `最低价为${readableEvidenceValue(quote.low.value)}` : '',
      quote.volume ? `成交量为${readableEvidenceValue(quote.volume.value)}` : '',
    ].filter(Boolean);
    sections.push({
      title: '市场表现',
      claims: [{
        text: `${firstSentence}${rangeParts.length ? `同一份行情记录还显示，${rangeParts.join('，')}。` : ''}`,
        evidence_ids: uniqueEvidenceIds(quoteMatches),
      }],
    });
  }
  const financial = {
    period: firstDataField(evidence, /^(?:定期报告最新报告期|报告期|会计期间)$|\/定期报告最新报告期$/),
    disclosed: firstDataField(evidence, /^(?:定期报告实际披露日期|实际披露日期)$|\/定期报告实际披露日期$/),
    revenue: firstDataField(evidence, /^(?:(?:一般企业|商业银行|保险公司|证券公司)\/利润表(?:\/|\(单季度\)\/单季度\.)?)?营业(?:总)?收入$/),
    profit: firstDataField(evidence, /^(?:一般企业|商业银行|保险公司|证券公司)\/利润表(?:\/|\(单季度\)\/单季度\.)归属于母公司所有者的净利润$/),
    margin: firstDataField(evidence, /销售毛利率$/),
    research: firstDataField(evidence, /^(?:一般企业|商业银行|保险公司|证券公司)\/利润表(?:\/|\(单季度\)\/单季度\.)研发费用$/),
  };
  const financialMatches = Object.values(financial).filter(Boolean);
  const metricMatches = [financial.revenue, financial.profit, financial.margin, financial.research].filter(Boolean);
  if (metricMatches.length) {
    const period = financial.period
      ? readableCalendarValue(financial.period.value)
      : null;
    const disclosed = financial.disclosed
      ? readableCalendarValue(financial.disclosed.value)
      : null;
    const primary = [
      financial.revenue ? `营业收入为${readableEvidenceValue(financial.revenue.value)}` : '',
      financial.profit ? `归属于母公司所有者的净利润为${readableEvidenceValue(financial.profit.value)}` : '',
    ].filter(Boolean);
    const secondary = [
      financial.margin ? `销售毛利率为${readableEvidenceValue(financial.margin.value)}` : '',
      financial.research ? `研发费用为${readableEvidenceValue(financial.research.value)}` : '',
    ].filter(Boolean);
    sections.push({
      title: '经营与财务',
      claims: [{
        text: `${period ? `最新已披露定期报告期为${period}` : '以下为最新已披露定期报告数据'}${disclosed ? `，实际披露日期为${disclosed}` : ''}。${primary.join('，') || secondary.join('，')}。${primary.length && secondary.length ? `该报告期还列示，${secondary.join('，')}。` : ''}`,
        evidence_ids: uniqueEvidenceIds(financialMatches),
      }],
    });
  }
  return sections;
}

function articleTopicText(item, stock, external = false) {
  const title = String(item?.title || '');
  const companyIndex = stock?.name ? title.indexOf(stock.name) : -1;
  const relevantTitle = companyIndex >= 0 ? title.slice(companyIndex) : title;
  const subject = stock?.name || '该公司';
  if (external) {
    const industry = /新能源|汽车|造车|车辆/.test(title)
      ? '新能源汽车行业'
      : /人工智能|大模型|AI|算力/.test(title)
        ? '人工智能行业'
        : /电池|锂电/.test(title)
          ? '动力电池行业'
          : '相关行业';
    if (/安全|标准|新规|监管|合规/.test(relevantTitle)) return `${industry}的监管要求与安全标准变化`;
    if (/政策|补贴|消费|以旧换新/.test(relevantTitle)) return `${industry}政策与市场需求变化`;
    if (/价格|竞争|市场|销量/.test(relevantTitle)) return `${industry}竞争与市场变化`;
    if (/电池|供应链|材料|芯片/.test(relevantTitle)) return `${industry}供应链与关键零部件变化`;
    return `${industry}近期政策与竞争变化`;
  }
  if (/召回|事故|故障|安全|质量/.test(relevantTitle)) return `${subject}产品安全与质量动态`;
  if (/销量|交付|销售/.test(title) && /海外|出口|全球/.test(title)) return `${subject}国内外销量与海外业务变化`;
  if (/销量|交付|销售/.test(relevantTitle)) return `${subject}销量与交付变化`;
  if (/产量/.test(relevantTitle)) return `${subject}月度生产进展`;
  if (/工厂|产能|投产|下线|生产/.test(relevantTitle)) return `${subject}工厂与产能进展`;
  if (/业绩|利润|营收|财报|毛利/.test(relevantTitle)) return `${subject}最新业绩变化`;
  if (/车型|产品|发布|上市/.test(relevantTitle)) return `${subject}近期业务进展`;
  if (/海外|出口|全球|非洲|欧洲|巴西|东南亚/.test(relevantTitle)) return `${subject}海外业务进展`;
  return `${subject}近期公司动态`;
}

function readerFacingHeadline(item, stock, external = false) {
  const title = String(item?.title || '').replace(/\s+/g, ' ').trim();
  if (!title) return articleTopicText(item, stock, external);
  const companyIndex = !external && stock?.name ? title.indexOf(stock.name) : -1;
  const relevant = companyIndex >= 0 ? title.slice(companyIndex) : title;
  return relevant.slice(0, 96);
}

function safeReaderFacingHeadline(item, stock, preferredFocus = null, external = false) {
  const headline = normalizeRelativeSourceTime(
    readerFacingHeadline(item, stock, external),
    item,
  );
  if (
    !headline
    || speculativeStatementPattern.test(headline)
    || editorialCharacterizationPattern.test(headline)
  ) return '';
  if (item?.source_tier !== 'official' && (
    unsupportedMediaProductFactPattern.test(headline)
    || singleMediaProductRestrictionPattern.test(headline)
    || singleMediaPolicyFactPattern.test(headline)
    || singleMediaDefiniteTechnologyFactPattern.test(headline)
  )) return '';
  if (preferredFocus
    && !hasSemanticPreferenceMatch(item, preferredFocus)
    && !preferenceTextMatches(preferredFocus, `${item?.title || ''} ${item?.content || ''}`)) return '';
  return headline;
}

function explicitSourceDate(item, offsetDays = 0) {
  const date = calendarDate(item?.published_at || item?.as_of_date);
  if (!date) return '';
  const instant = new Date(`${date}T00:00:00.000Z`);
  instant.setUTCDate(instant.getUTCDate() + offsetDays);
  return `${instant.getUTCFullYear()}年${instant.getUTCMonth() + 1}月${instant.getUTCDate()}日`;
}

function normalizeRelativeSourceTime(text, item) {
  const value = String(text || '');
  if (!/(?:今天|今日|昨天|昨日|\btoday\b|\byesterday\b)/i.test(value)) return value;
  const publishedDate = explicitSourceDate(item);
  const previousDate = explicitSourceDate(item, -1);
  if (!publishedDate) {
    return value
      .replace(/(?:今天|今日|昨天|昨日)/gu, '')
      .replace(/\b(?:today|yesterday)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return value
    .replace(/今天|今日/gu, publishedDate)
    .replace(/昨天|昨日/gu, previousDate)
    .replace(/\btoday\b/gi, publishedDate)
    .replace(/\byesterday\b/gi, previousDate)
    .replace(/\s+/g, ' ')
    .trim();
}

function conciseSemanticQuote(quote, preferredFocus = null, item = null) {
  const relevanceTerms = preferenceEvidenceTerms(preferredFocus || '');
  const sourceTier = item?.source_tier || 'open_web';
  const normalizedQuote = sourceTier === 'official'
    ? trimOfficialNoticePreamble(quote)
    : String(quote || '');
  const candidates = normalizedQuote
    .replace(/([。！？；])\s*[”"]/g, '$1 ')
    .replace(/\s+/g, ' ')
    .split(/(?<=[。！？；])\s*|(?<=[.!?])\s+/)
    .map((text, index) => ({
      index,
      text: text.trim().replace(/^[“”"'\s]+|[“”"'\s]+$/g, ''),
    }))
    .filter(({ text }) => (
      text.length >= 12
      && text.length <= 240
      && !semanticQuoteLooksLikeTableRow(text)
      && !speculativeStatementPattern.test(text)
      && !editorialCharacterizationPattern.test(text)
      && (text.match(/“/g) || []).length === (text.match(/”/g) || []).length
      && !(sourceTier !== 'official' && materialNumericFactPattern.test(text))
      && !(sourceTier !== 'official' && singleMediaDefiniteTechnologyFactPattern.test(text))
    ))
    .map((item) => ({
      ...item,
      score: relevanceTerms.filter((term) => item.text.includes(term)).length * 4
        + Number(/\d/.test(item.text)) * 20
        + Number(/公告|披露|签署|订单|合作|项目|政策|监管|价格|供应|需求|产能|交付|竞争/.test(item.text)) * 2,
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const chosen = [];
  for (const candidate of candidates) {
    if (chosen.some((item) => item.index === candidate.index)) continue;
    chosen.push(candidate);
    if (chosen.length >= 1) break;
  }
  const selected = chosen
    .sort((left, right) => left.index - right.index)
    .map((item) => item.text)
    .join('');
  if (selected) return selected;
  const fallback = normalizedQuote.slice(0, 260).trim();
  if (semanticQuoteLooksLikeTableRow(fallback)) return '';
  if (sourceTier !== 'official' && materialNumericFactPattern.test(fallback)) return '';
  return fallback;
}

function trimOfficialNoticePreamble(quote) {
  const text = String(quote || '').replace(/\s+/g, ' ').trim();
  const marker = text.match(/[，；。]\s*现将(?<fact>[^。！？]{12,240}[。！？]?)/u);
  if (!marker?.groups?.fact) return text;
  const fact = marker.groups.fact
    .replace(/予以公告([。！？]?)$/u, '已予以公告$1')
    .trim();
  return fact;
}

function sourceAttributionLead(item, publisher, { companyName = '' } = {}) {
  if (item?.source_tier === 'official') {
    return companyName
      ? `${publisher}发布的关于${companyName}的信息显示，`
      : `${publisher}发布的信息显示，`;
  }
  return companyName
    ? `${publisher}关于${companyName}的报道提到，`
    : `${publisher}报道，`;
}

function sourceDetailText(item, stock, preferredFocus = null) {
  const sourceTier = item?.source_tier || 'open_web';
  const semanticMatch = preferredFocus
    ? safeSemanticMatchForPreference(item, preferredFocus)
    : null;
  if (semanticMatch?.quote) {
    return normalizeRelativeSourceTime(
      conciseSemanticQuote(semanticMatch.quote, preferredFocus, item),
      item,
    );
  }
  const relevanceTerms = preferredFocus
    ? preferenceEvidenceTerms(preferredFocus)
    : uniqueStrings([
      stock?.name,
      stock?.code,
      ...(stock?.focus || []).flatMap((focus) => focusSearchTerms(focus)),
    ]).filter(Boolean);
  const contentLines = String(item?.content || '')
    .replace(/（原标题：[^）]+）/g, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => (
      line
      && line !== String(item?.title || '').trim()
      && !/^(?:来源|文章来源|稿源|作者|责任编辑|编辑|记者署名)[：:]/.test(line)
    ));
  const sentences = contentLines.join(' ')
    .replace(/（原标题：[^）]+）/g, '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[。！？；])\s*|(?<=[.!?])\s+/)
    .map((sentence, index) => ({
      index,
      text: sentence
        .replace(/^记者[^，。]{0,24}(?:获悉|了解到)[，：]?/, '')
        .replace(/[，；]\s*(?:双方|公司|项目|其)?(?:计划|预计|预期|拟于|将于|将在|未来)[^。！？]*[。！？]?$/i, '。')
        .trim(),
    }))
    .filter(({ text }) => (
      text.length >= 12
      && text.length <= 220
      && !/责任编辑|版权|免责声明|仅供参考|不构成投资建议|下载.*客户端/.test(text)
      && !(sourceTier !== 'official' && unsupportedMediaOperatingMetricPattern.test(text))
      && !(sourceTier !== 'official' && unsupportedMediaProductFactPattern.test(text))
      && !(sourceTier !== 'official' && singleMediaProductRestrictionPattern.test(text))
      && !(sourceTier !== 'official' && singleMediaPolicyFactPattern.test(text))
      && !(sourceTier !== 'official' && singleMediaDefiniteTechnologyFactPattern.test(text))
      && !speculativeStatementPattern.test(text)
      && !editorialCharacterizationPattern.test(text)
      && semanticQuoteHasCompleteBoundary(text, item)
    ))
    .map((sentence) => ({
      ...sentence,
      score: relevanceTerms.filter((term) => sentence.text.includes(term)).length * 4
        + Number(preferredFocus && preferenceTextMatches(preferredFocus, sentence.text)) * 20
        + Number(/\d/.test(sentence.text))
        + Number(/(?:涨|跌|上涨|下跌|期价|价格).{0,18}\d|\d.{0,18}(?:%|元|吨)/.test(sentence.text)) * 5
        + Number(/公告|披露|签署|订单|合作|项目|政策|监管|价格|供应|需求|产能|交付/.test(sentence.text)) * 2,
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const selected = (sentences[0]?.text || '')
    .replace(/财务表现|财务状况/g, '财务指标')
    .replace(/经营表现/g, '经营指标')
    .replace(/盈利表现/g, '盈利指标');
  return normalizeRelativeSourceTime(selected, item);
}

function monitorCompanySummary(item, stock, preferredFocus = null) {
  const headline = safeReaderFacingHeadline(item, stock, preferredFocus);
  const publisher = item?.publisher && item.publisher !== '公开网页'
    ? item.publisher
    : '公开信息';
  const detail = sourceDetailText(item, stock, preferredFocus);
  if (detail) {
    const requiresConfirmation = item.source_tier !== 'official'
      && /处罚|罚款|立案|调查|监管问询|召回|诉讼|事故|违约|禁令/.test(`${headline} ${detail}`);
    const attribution = sourceAttributionLead(item, publisher, {
      companyName: stock?.name || '该公司',
    });
    return `${attribution}${detail}${/[。！？；]$/.test(detail) ? '' : '。'}${
      requiresConfirmation
        ? '该单一媒体线索尚待公司公告、监管披露或独立来源核实确认。'
        : ''
    }`;
  }
  if (!headline) return '';
  if (/招聘|岗位|用工/.test(headline)) {
    return `${publisher}报道“${headline}”。`;
  }
  if (/工厂|产能|投产|下线|生产基地/.test(headline)) {
    return `${publisher}报道“${headline}”。`;
  }
  if (/召回|事故|故障|安全|质量/.test(headline)) {
    return `${publisher}报道“${headline}”。该单一媒体线索尚待公司公告、监管披露或独立来源核实确认。`;
  }
  if (/业绩|利润|营收|财报|毛利/.test(headline)) {
    return item.source_tier === 'official' ? `${publisher}发布“${headline}”。` : '';
  }
  if (!concreteEventHeadlinePattern.test(headline)) return '';
  return `${publisher}报道“${headline}”。`;
}

function monitorMarketSummary(item, stock, preferredFocus = null) {
  const publisher = item?.publisher && item.publisher !== '公开网页'
    ? item.publisher
    : '公开信息';
  const headline = safeReaderFacingHeadline(item, stock, preferredFocus);
  if (headline && monitorMarketContextPattern.test(headline)) {
    return `${publisher}报道“${headline}”。`;
  }
  const detail = sourceDetailText(item, stock, preferredFocus);
  if (detail) {
    return `${sourceAttributionLead(item, publisher)}${detail}${
      /[。！？；]$/.test(detail) ? '' : '。'
    }`;
  }
  return headline ? `${publisher}报道“${headline}”。` : '';
}

function monitorExternalSummary(item, stock, preferredFocus = null) {
  const headline = safeReaderFacingHeadline(item, stock, preferredFocus, true);
  const publisher = item?.publisher && item.publisher !== '公开网页'
    ? item.publisher
    : '公开信息';
  const searchable = `${headline}\n${item?.content || item?.summary || ''}`;
  if (item?.source_tier !== 'official' && (
    unsupportedMediaProductFactPattern.test(searchable)
    || singleMediaProductRestrictionPattern.test(searchable)
    || singleMediaPolicyFactPattern.test(searchable)
    || singleMediaDefiniteTechnologyFactPattern.test(searchable)
  )) {
    return '';
  }
  const detail = sourceDetailText(item, stock, preferredFocus);
  if (detail) {
    return `${sourceAttributionLead(item, publisher)}${detail}${
      /[。！？；]$/.test(detail) ? '' : '。'
    }`;
  }
  if (!headline || !concreteEventHeadlinePattern.test(headline)) return '';
  return `${publisher}报道“${headline}”。`;
}

function focusRelation(item, stock) {
  const searchable = `${item?.title || ''} ${item?.content || ''}`;
  const matched = (stock?.focus || []).filter((focus) => (
    hasSemanticPreferenceMatch(item, focus) || preferenceTextMatches(focus, searchable)
  ));
  return readerFacingFocusItems(matched).slice(0, 2);
}

function briefWebSummary(item, stock, preferredFocus = null) {
  const title = String(item?.title || '').trim();
  const content = String(item?.content || '');
  const searchable = `${title}\n${content}`;
  const subject = stock?.name || '该公司';
  const publisher = item?.publisher && item.publisher !== '公开网页'
    ? item.publisher
    : '公开信息';
  const detail = sourceDetailText(item, stock, preferredFocus);
  const disclosureSentence = content
    .split(/[。\n]/)
    .find((sentence) => (
      /公告|披露|快报/.test(sentence)
      && /产量/.test(sentence)
      && /销量/.test(sentence)
    )) || '';
  const monthlyOperatingDisclosure = (
    (/产量/.test(title) && /销量/.test(title))
    || Boolean(disclosureSentence)
  );
  const monthlyDisclosureText = `${title}\n${disclosureSentence}`;
  const month = monthlyDisclosureText.match(/(?:^|[^\d])(\d{1,2})月/)?.[1];

  if (monthlyOperatingDisclosure) {
    if (item.source_tier !== 'official') {
      return `${publisher}发布了关于${subject}${month ? `${month}月` : '近期'}新能源汽车月度业务进展的报道。`;
    }
    const details = [
      '新能源汽车当月产量和销量',
      /累计产量|累计销量|累计产销/.test(searchable) ? '累计产销' : '',
      /出口|海外销量/.test(searchable) ? '出口情况' : '',
    ].filter(Boolean).join('、');
    const trend = item.source_tier === 'official' && (
      /累计[^。；\n]{0,160}(?:同比下降|下降)/.test(searchable)
      || /累计同比下降/.test(searchable)
    )
      ? '材料同时显示累计产量与累计销量同比下降。'
      : '';
    return `${publisher}报道提及${subject}${month ? `${month}月` : '最新月度材料'}的${details}。${trend}后续应持续观察公司正式披露的单月产销、累计趋势和出口结构。`;
  }
  if (item.source_tier !== 'official' && (
    unsupportedMediaProductFactPattern.test(`${title} ${detail}`)
    || singleMediaProductRestrictionPattern.test(`${title} ${detail}`)
    || singleMediaPolicyFactPattern.test(`${title} ${detail}`)
    || singleMediaDefiniteTechnologyFactPattern.test(`${title} ${detail}`)
  )) {
    return '';
  }
  if (!detail && speculativeStatementPattern.test(title)) return '';
  if (detail) {
    const requiresConfirmation = item.source_tier !== 'official'
      && /处罚|罚款|立案|调查|监管问询|召回|诉讼|事故|违约|禁令/.test(`${title} ${detail}`);
    return `${sourceAttributionLead(item, publisher)}${detail}${/[。！？；]$/.test(detail) ? '' : '。'}${
      requiresConfirmation
        ? '该单一媒体线索尚待公司公告、法院文书或独立来源核实确认。'
        : ''
    }`;
  }
  if (/工厂|产能|投产|下线|生产基地/.test(searchable)) {
    return `${publisher}发布了与${subject}工厂或产能建设相关的报道。后续应观察公司正式披露的产能利用、当地交付和海外经营节奏。`;
  }
  if (/海外|出口|全球|非洲|欧洲|巴西|东南亚/.test(searchable)) {
    return `${publisher}发布了与${subject}海外业务相关的报道。后续应观察公司正式披露的出口节奏、渠道建设和当地政策变化。`;
  }
  const headline = safeReaderFacingHeadline(item, stock, preferredFocus);
  if (!headline) return '';
  return `${publisher}报道“${headline}”。`;
}

function isBriefSupplementalCompanySource(item, stock) {
  const candidate = {
    ...item,
    type: 'web_search',
    source_tier: item?.source_tier || sourceTier(item, stock),
  };
  const title = String(candidate.title || '');
  return candidate.source_tier !== 'open_web'
    && sourceReferencesStock(candidate, stock)
    && isSubstantiveBusinessSource(candidate, stock)
    && concreteEventHeadlinePattern.test(title)
    && !/招聘|岗位|活动|盛典/.test(title)
    && Boolean(briefWebSummary(candidate, stock));
}

function readerSafeWebItem(item, stock, type) {
  const candidate = {
    ...item,
    type: 'web_search',
    source_tier: item?.source_tier || sourceTier(item, stock),
  };
  const matchedPreference = expandedPreferences(stock?.focus || []).find((value) => (
    evidenceDirectlyMatchesPreference(candidate, value)
  ));
  const legacySemanticPreference = uniqueStrings(stock?.focus || []).find((value) => (
    hasSemanticPreferenceMatch(candidate, value)
  ));
  const preference = matchedPreference || legacySemanticPreference
    || candidate.semantic_matches?.[0]?.preference || null;
  if (type === 'brief') {
    if ((stock?.focus || []).length && !matchedPreference && !legacySemanticPreference) {
      return isBriefSupplementalCompanySource(candidate, stock);
    }
    return Boolean(briefWebSummary(candidate, stock, preference));
  }
  if (!hasVerifiedMonitorBinding(candidate, stock)) return false;
  const sectionTitle = monitorSectionForEvidence(candidate, stock, preference);
  if (sectionTitle === '外部风险') {
    return Boolean(monitorExternalSummary(candidate, stock, preference));
  }
  if (sectionTitle === '市场异动') {
    return Boolean(monitorMarketSummary(candidate, stock, preference));
  }
  if (sectionTitle === '公司事件') {
    return Boolean(monitorCompanySummary(candidate, stock, preference));
  }
  return false;
}

function readerSafeChangeSummary(evidence, type, stock = null) {
  const items = Array.isArray(evidence) ? evidence.filter((item) => item?.type !== 'coverage') : [];
  const semanticWeb = items.filter((item) => (
    item.type === 'web_search' && (item.semantic_matches || []).length > 0
  ));
  const officialWeb = items.filter((item) => (
    item.type === 'web_search' && item.source_tier === 'official'
  ));
  const dataItems = items.filter((item) => item.type === 'datapro');
  const item = [...semanticWeb, ...officialWeb, ...dataItems, ...items]
    .find((candidate, index, all) => all.findIndex((entry) => entry.id === candidate.id) === index);
  if (!item) return null;
  if (item.type === 'web_search') {
    const preference = item.semantic_matches?.[0]?.preference || null;
    const sectionTitle = monitorSectionForEvidence(item, stock, preference);
    const summary = type === 'monitor'
      ? sectionTitle === '外部风险'
        ? monitorExternalSummary(item, stock, preference)
        : sectionTitle === '市场异动'
          ? monitorMarketSummary(item, stock, preference)
          : monitorCompanySummary(item, stock, preference)
      : briefWebSummary(item, stock, preference);
    if (!summary) return null;
    const sentenceCount = /单一媒体线索/.test(summary) ? 2 : 1;
    const text = leadingSentences(summary, sentenceCount);
    return text ? { text, evidence_ids: [item.id] } : null;
  }
  const sections = deterministicCoreSections([item], type, stock);
  const claim = sections.flatMap((section) => section.claims || [])[0];
  if (!claim?.text) return null;
  return {
    text: leadingSentences(claim.text, 1),
    evidence_ids: claim.evidence_ids?.length ? claim.evidence_ids : [item.id],
  };
}

function deterministicContextSections(evidence, stock, type) {
  const webEvidence = evidence.filter((item) => (
    item.type === 'web_search'
    && (type !== 'brief'
      || isSubstantiveBusinessSource(item, stock)
      || (item.semantic_matches || []).length > 0)
    && (type !== 'monitor' || hasVerifiedMonitorBinding(item, stock))
    && readerSafeWebItem(item, stock, type)
  ));
  if (!webEvidence.length) return [];
  const referencesStock = (item) => sourceReferencesStock(item, stock);
  const companyItems = type === 'monitor'
    ? webEvidence.filter((item) => isMonitorCompanyEventEvidence(item, stock))
    : webEvidence.filter(referencesStock).slice(0, 3);
  const marketItems = type === 'monitor'
    ? webEvidence.filter((item) => isMonitorMarketContextSource(item, stock))
    : [];
  const externalItems = type === 'monitor'
    ? webEvidence.filter((item) => !referencesStock(item))
    : webEvidence.filter((item) => !referencesStock(item)).slice(0, 2);
  const settings = null;
  const preferenceContract = preferenceContractUnits(
    buildPreferenceContract(stock, type, settings, evidence),
  );
  const usedEvidenceIds = new Set();
  const usedSemanticQuotesByEvidence = new Map();
  const preferredClaims = [];
  const coveredPreferences = preferenceContract
    .filter((item) => (
      item.status === 'covered'
      && item.evidence_ids.some((id) => webEvidence.some((entry) => entry.id === id))
    ))
    .sort((left, right) => Number(left.is_system_core) - Number(right.is_system_core));
  for (const preference of coveredPreferences) {
    const sortedCandidates = preference.evidence_ids
      .map((id) => webEvidence.find((entry) => entry.id === id))
      .filter(Boolean)
      .sort((left, right) => String(right.published_at || '').localeCompare(String(left.published_at || '')));
    // Distinct pages from one publisher can contain different company facts.
    // URL/content curation has already removed duplicates, so publisher-level
    // collapsing would leave valid displayed sources uncited.
    const candidates = sortedCandidates;
    for (const item of candidates) {
      const semanticMatch = semanticMatchForPreference(item, preference.preference);
      const usedQuotes = usedSemanticQuotesByEvidence.get(item.id) || [];
      if (usedEvidenceIds.has(item.id) && (
        preference.is_system_core
        || !semanticMatch?.quote
        || usedQuotes.includes(semanticMatch.quote)
      )) continue;
      // A compound preference can legitimately receive both a company event and
      // external context. The source determines its monitor section; the
      // contract only guarantees that at least one source answers the focus.
      const sectionTitle = type === 'monitor'
        ? monitorSectionForEvidence(item, stock, preference.preference) || preference.expected_section
        : preference.expected_section;
      const text = type === 'brief'
        ? briefWebSummary(item, stock, preference.preference)
        : sectionTitle === '外部风险'
          ? monitorExternalSummary(item, stock, preference.preference)
          : sectionTitle === '市场异动'
            ? monitorMarketSummary(item, stock, preference.preference)
            : monitorCompanySummary(item, stock, preference.preference);
      if (!text || !contractClaimMatchesEvidence(
        preference,
        { text, evidence_ids: [item.id] },
        new Map([[item.id, item]]),
      )) continue;
      const claimTextKey = text.replace(/\s+/g, '').replace(/[。！？；]/g, '');
      if (preferredClaims.some((claim) => (
        claim.sectionTitle === sectionTitle
        && claim.text.replace(/\s+/g, '').replace(/[。！？；]/g, '') === claimTextKey
      ))) continue;
      usedEvidenceIds.add(item.id);
      usedSemanticQuotesByEvidence.set(item.id, [...usedQuotes, semanticMatch?.quote || '']);
      preferredClaims.push({
        sectionTitle,
        text: hasSemanticPreferenceMatch(item, preference.preference)
          ? `围绕“${preference.display_label}”，${text}`
          : text,
        evidence_ids: [item.id],
        order: webEvidence.indexOf(item),
      });
      if (type === 'brief' && preferredClaims.filter((claim) => claim.sectionTitle === sectionTitle).length >= 3) break;
    }
  }
  if (type === 'brief') {
    const trackedWebPreferences = preferenceContract.filter((item) => (
      item.evidence_ids.some((id) => webEvidence.some((entry) => entry.id === id))
    ));
    const claimsBySection = new Map();
    for (const claim of preferredClaims) {
      const claims = claimsBySection.get(claim.sectionTitle) || [];
      claims.push({
        text: claim.text,
        evidence_ids: claim.evidence_ids,
        order: claim.order,
      });
      claimsBySection.set(claim.sectionTitle, claims);
    }
    const supplementalClaims = claimsBySection.get('关注方向') || [];
    for (const item of companyItems.filter((entry) => !usedEvidenceIds.has(entry.id))) {
      if (supplementalClaims.length >= 3) break;
      if (!isBriefSupplementalCompanySource(item, stock)) continue;
      const text = briefWebSummary(item, stock);
      const normalizedText = text.replace(/\s+/g, '').replace(/[。！？；]/g, '');
      if (!text || supplementalClaims.some((claim) => (
        claim.text.replace(/\s+/g, '').replace(/[。！？；]/g, '') === normalizedText
      ))) continue;
      supplementalClaims.push({
        text,
        evidence_ids: [item.id],
        order: webEvidence.indexOf(item),
      });
      usedEvidenceIds.add(item.id);
    }
    if (supplementalClaims.length) claimsBySection.set('关注方向', supplementalClaims);
    if (!preferenceContract.length) {
      const items = (companyItems.length ? companyItems : webEvidence)
        .filter((item) => !usedEvidenceIds.has(item.id));
      const claims = claimsBySection.get('关注方向') || [];
      for (const item of items) {
        if (claims.length >= 3) break;
        const text = briefWebSummary(item, stock);
        if (!text) continue;
        claims.push({ text, evidence_ids: [item.id], order: webEvidence.indexOf(item) });
      }
      if (claims.length) claimsBySection.set('关注方向', claims);
    }
    return ['市场表现', '经营与财务', '关注方向']
      .map((title) => {
        const claims = claimsBySection.get(title) || [];
        if (!claims.length) return null;
        return {
          title,
          claims: claims
            .sort((left, right) => left.order - right.order)
            .slice(0, 3)
            .map(({ text, evidence_ids: evidenceIds }) => ({ text, evidence_ids: evidenceIds })),
        };
      })
      .filter(Boolean);
  }
  const sections = [];
  const appendDistinctClaim = (claims, claim) => {
    const textKey = String(claim.text || '').replace(/\s+/g, '').replace(/[。！？；]/g, '');
    if (!textKey || claims.some((entry) => (
      String(entry.text || '').replace(/\s+/g, '').replace(/[。！？；]/g, '') === textKey
    ))) return;
    claims.push(claim);
  };
  const marketClaims = preferredClaims
    .filter((claim) => claim.sectionTitle === '市场异动')
    .map(({ text, evidence_ids: evidenceIds, order }) => ({ text, evidence_ids: evidenceIds, order }));
  for (const item of marketItems.filter((entry) => !usedEvidenceIds.has(entry.id))) {
    const text = monitorMarketSummary(item, stock);
    if (text) appendDistinctClaim(marketClaims, {
      text,
      evidence_ids: [item.id],
      order: webEvidence.indexOf(item),
    });
  }
  if (marketClaims.length) {
    sections.push({
      title: '市场异动',
      claims: marketClaims
        .sort((left, right) => left.order - right.order)
        .slice(0, 3)
        .map(({ text, evidence_ids: evidenceIds }) => ({ text, evidence_ids: evidenceIds })),
    });
  }
  const companyClaims = preferredClaims
    .filter((claim) => claim.sectionTitle === '公司事件')
    .map(({ text, evidence_ids: evidenceIds, order }) => ({ text, evidence_ids: evidenceIds, order }));
  for (const item of companyItems.filter((entry) => !usedEvidenceIds.has(entry.id))) {
    const text = monitorCompanySummary(item, stock);
    if (text) appendDistinctClaim(companyClaims, {
      text,
      evidence_ids: [item.id],
      order: webEvidence.indexOf(item),
    });
  }
  if (companyClaims.length) {
    sections.push({
      title: '公司事件',
      claims: companyClaims
        .sort((left, right) => left.order - right.order)
        .slice(0, 3)
        .map(({ text, evidence_ids: evidenceIds }) => ({ text, evidence_ids: evidenceIds })),
    });
  }
  const externalClaims = preferredClaims
    .filter((claim) => claim.sectionTitle === '外部风险')
    .map(({ text, evidence_ids: evidenceIds, order }) => ({ text, evidence_ids: evidenceIds, order }));
  for (const item of externalItems.filter((entry) => !usedEvidenceIds.has(entry.id))) {
    const text = monitorExternalSummary(item, stock);
    if (text) appendDistinctClaim(externalClaims, {
      text,
      evidence_ids: [item.id],
      order: webEvidence.indexOf(item),
    });
  }
  if (externalClaims.length) {
    sections.push({
      title: '外部风险',
      claims: externalClaims
        .sort((left, right) => left.order - right.order)
        .slice(0, 3)
        .map(({ text, evidence_ids: evidenceIds }) => ({ text, evidence_ids: evidenceIds })),
    });
  }
  return sections;
}

function deterministicWebSection(evidence, stock, type) {
  return deterministicContextSections(evidence, stock, type)[0] || null;
}

function canonicalSectionTitle(title, type) {
  const value = String(title || '').trim();
  if (type === 'brief') {
    if (/市场|行情|交易/.test(value)) return '市场表现';
    if (/经营|财务|基本面|业绩/.test(value)) return '经营与财务';
    if (/关注|进展|竞争|产品|业务|行业/.test(value)) return '关注方向';
    if (/后续|观察|展望|跟踪|催化/.test(value)) return '后续观察';
    return '关注方向';
  }
  if (/市场|行情|交易|价格|异动/.test(value)) return '市场异动';
  if (/公司|公告|监管|经营|治理|安全|事件/.test(value)) return '公司事件';
  if (/外部|行业|政策|竞争|供应链|宏观/.test(value)) return '外部风险';
  if (/后续|观察|展望|跟踪|触发/.test(value)) return '后续观察';
  return '公司事件';
}

function briefFollowUpClaim(sections, fallbackEvidenceIds = []) {
  const financialClaim = sections.find((section) => section.title === '经营与财务')?.claims?.[0];
  if (financialClaim) {
    return {
      text: '后续可继续核对下一期正式披露中的上述经营与财务指标是否发生变化。',
      evidence_ids: financialClaim.evidence_ids,
    };
  }
  const marketClaim = sections.find((section) => section.title === '市场表现')?.claims?.[0];
  if (marketClaim) {
    return {
      text: '后续可继续核对下一交易日行情是否出现有别于本次记录的变化。',
      evidence_ids: marketClaim.evidence_ids,
    };
  }
  const contextClaim = sections.find((section) => section.title === '关注方向')?.claims?.[0];
  if (contextClaim) {
    return {
      text: '后续可继续核对该项进展是否出现新的正式披露或可验证变化。',
      evidence_ids: contextClaim.evidence_ids,
    };
  }
  return fallbackEvidenceIds.length
    ? {
      text: '后续可继续核对相关正式披露是否出现可验证更新。',
      evidence_ids: fallbackEvidenceIds,
    }
    : null;
}

function mergeDeterministicCore(report, evidence, type, stock) {
  const coreSections = deterministicCoreSections(evidence, type, stock);
  const coreTitles = new Set(coreSections.map((section) => section.title));
  const sectionsByTitle = new Map(coreSections.map((section) => [section.title, structuredClone(section)]));
  const preferenceContract = buildPreferenceContract(
    stock || {},
    type,
    null,
    evidence,
  );
  const preferenceUnits = preferenceContractUnits(preferenceContract);
  const briefWebPreferences = type === 'brief'
    ? preferenceUnits.filter((item) => item.expected_section === '关注方向')
    : [];
  const watchPreferences = preferenceUnits.filter((item) => item.status === 'watch');
  for (const section of report.sections) {
    const title = canonicalSectionTitle(section.title, type);
    if (coreTitles.has(title)) continue;
    if (type === 'monitor' && title === '后续观察') continue;
    const current = sectionsByTitle.get(title) || { title, claims: [] };
    let claims = title === '关注方向' && briefWebPreferences.length
      ? section.claims.filter((claim) => briefWebPreferences.some((preference) => (
        preference.status === 'covered'
        && claim.evidence_ids?.some((id) => preference.evidence_ids.includes(id))
        && contractClaimMatchesEvidence(
          preference,
          claim,
          new Map(evidence.map((item) => [item.id, item])),
        )
      )))
      : section.claims;
    if (title === '后续观察' && watchPreferences.length) {
      claims = claims.filter((claim) => !watchPreferences.some((preference) => (
        preferenceTextMatches(preference.preference, claim.text)
      )));
    }
    if (!claims.length) continue;
    current.claims.push(...claims);
    sectionsByTitle.set(title, current);
  }
  for (const section of deterministicContextSections(evidence, stock, type)) {
    // Public-source sections are deterministic so a model cannot paraphrase a
    // source into a different company/event classification or omit attribution.
    const current = sectionsByTitle.get(section.title) || { title: section.title, claims: [] };
    const deterministicEvidenceIds = new Set(
      section.claims.flatMap((claim) => claim.evidence_ids || []),
    );
    current.claims = current.claims.filter((claim) => (
      !(claim.evidence_ids || []).some((id) => deterministicEvidenceIds.has(id))
    ));
    const seenClaims = new Set(current.claims.map((claim) => (
      `${(claim.evidence_ids || []).join(',')}|${claim.text}`
    )));
    for (const claim of section.claims) {
      const key = `${(claim.evidence_ids || []).join(',')}|${claim.text}`;
      if (!seenClaims.has(key)) {
        current.claims.push(claim);
        seenClaims.add(key);
      }
    }
    sectionsByTitle.set(section.title, current);
  }
  const conclusionMentionsWatchPreference = watchPreferences.some((preference) => (
    preferenceTextMatches(preference.preference, report.conclusion?.text || '')
  ));
  if (
    type !== 'monitor'
    &&
    !sectionsByTitle.has('后续观察')
    && report.conclusion?.text
    && !conclusionMentionsWatchPreference
  ) {
    sectionsByTitle.set('后续观察', {
      title: '后续观察',
      claims: [{
        text: report.conclusion.text,
        evidence_ids: report.conclusion.evidence_ids,
      }],
    });
  }
  if (type === 'brief') {
    const existingFollowUp = sectionsByTitle.get('后续观察');
    const hasActionableFollowUp = existingFollowUp?.claims?.some((claim) => (
      /后续|继续|下一|关注|核对|观察/.test(claim.text)
    ));
    if (!hasActionableFollowUp) {
      const followUp = briefFollowUpClaim(
        [...sectionsByTitle.values()],
        evidence.filter((item) => item.type !== 'coverage').map((item) => item.id).slice(0, 4),
      );
      if (followUp) {
        sectionsByTitle.set('后续观察', {
          title: '后续观察',
          claims: [followUp],
        });
      }
    }
  }
  const order = type === 'brief'
    ? ['市场表现', '经营与财务', '关注方向', '后续观察']
    : ['市场异动', '公司事件', '外部风险', '后续观察'];
  const orderedSections = order.map((title) => sectionsByTitle.get(title)).filter(Boolean);
  const briefConclusionClaim = type === 'brief'
    ? orderedSections.find((section) => section.title === '后续观察')?.claims?.[0]
      || orderedSections.at(-1)?.claims?.at(-1)
    : null;
  return {
    report: {
      ...report,
      sections: orderedSections,
      limitations: (report.limitations || []).filter((item) => (
        !watchPreferences.some((preference) => (
          preferenceTextMatches(preference.preference, item)
        ))
      )),
      conclusion: briefConclusionClaim
        ? {
          text: briefConclusionClaim.text,
          evidence_ids: briefConclusionClaim.evidence_ids,
        }
        : report.conclusion,
    },
    coreTitles: [...coreTitles],
  };
}

function hasVerifiedMonitorBinding(item, stock) {
  // Curation runs before web items receive their normalized `web_search` type.
  if (!item || (item.type && item.type !== 'web_search')) return false;
  // Directly attributable company material remains useful even when the semantic
  // classifier is unavailable. It has already passed the curation checks above.
  if (sourceReferencesStock(item, stock)) return true;
  const preferences = new Set([
    ...uniqueStrings(stock?.focus || []),
    ...expandedPreferences(stock?.focus || []),
  ]);
  const verifiedMatches = (item.semantic_matches || []).filter((match) => (
    preferences.has(String(match?.preference || '').trim())
      && typeof match?.quote === 'string'
      && match.quote.trim().length >= 12
  ));
  if (!verifiedMatches.length) return false;
  return item.source_tier === 'official' && verifiedMatches.some((match) => (
    match?.scope === 'external'
  ));
}

function sourceReferencesStock(item, stock) {
  const name = String(stock?.name || '').trim();
  const code = String(stock?.code || '').trim().toUpperCase();
  const searchable = `${item?.title || ''}\n${item?.summary || ''}\n${item?.content || ''}`;
  const semanticCompanyMatch = (item?.semantic_matches || []).some((match) => (
    match?.scope === 'company'
      && semanticSourceHasCompanyAnchor(match.preference, match.quote, item, stock)
  ));
  return semanticCompanyMatch
    || (name && searchable.includes(name))
    || (code && searchable.toUpperCase().includes(code));
}

function isMonitorConcreteEventSource(item, stock) {
  const searchable = `${item?.title || ''}\n${item?.summary || ''}\n${item?.content || ''}`;
  if (nonInvestmentContentPattern.test(searchable)) return false;
  // Price and technical-market articles are legitimate monitor context, but only
  // when they are explicitly about the tracked company.
  if (sourceReferencesStock(item, stock) && monitorMarketContextPattern.test(searchable)) return true;
  if (monitorCompanyEventPattern.test(searchable)) return true;
  return /(?:招聘|岗位).{0,24}(?:产线|工厂|项目|生产|制造|建设)|(?:产线|工厂|项目|生产|制造|建设).{0,24}(?:招聘|岗位)/i.test(searchable);
}

function isMonitorMarketPreference(preference) {
  return monitorMarketPreferencePattern.test(String(preference || ''));
}

function isMonitorMarketContextSource(item, stock, preference = null) {
  if (!item || item.type !== 'web_search') return false;
  const title = String(item.title || '');
  // A real company announcement can discuss share-price impact, but it remains
  // a company event. Market commentary without such an event stays in market.
  if (monitorCompanyEventPattern.test(title)) return false;
  const explicitlyMarketFocused = monitorMarketContextPattern.test(title);
  const preferenceMatch = preference
    && isMonitorMarketPreference(preference)
    && hasSemanticPreferenceMatch(item, preference);
  return sourceReferencesStock(item, stock)
    && (explicitlyMarketFocused || preferenceMatch);
}

function isMonitorCompanyEventEvidence(item, stock) {
  if (!item || item.type !== 'web_search' || !sourceReferencesStock(item, stock)) return false;
  if (isMonitorMarketContextSource(item, stock)) return false;
  const detail = sourceDetailText(item, stock);
  return isMonitorConcreteEventSource(item, stock)
    && monitorCompanyEventPattern.test(`${item.title || ''}\n${detail}`);
}

function monitorSectionForEvidence(item, stock, preference = null) {
  if ((item.semantic_matches || []).some((match) => (
    match.preference === preference && match.scope === 'external'
  ))) return '外部风险';
  if (isMonitorMarketContextSource(item, stock, preference)) return '市场异动';
  if (isMonitorCompanyEventEvidence(item, stock)) return '公司事件';
  return null;
}

function restrictMonitorReaderReport(report, evidence, stock) {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const evidenceSections = (item) => {
    if (item.type === 'datapro') {
      return new Set([isMarketEvidence(item) ? '市场异动' : '公司事件']);
    }
    if (item.type !== 'web_search' || !hasVerifiedMonitorBinding(item, stock)) return new Set();
    const preferences = uniqueStrings((item.semantic_matches || []).map((match) => match.preference));
    const sections = [null, ...preferences]
      .map((preference) => monitorSectionForEvidence(item, stock, preference))
      .filter(Boolean);
    return new Set(sections);
  };
  const readerSafeIds = (ids, expectedSection = null) => (
    Array.isArray(ids) && ids.length > 0 && ids.every((id) => {
    const item = evidenceById.get(id);
    if (!item || item.type === 'coverage') return false;
    const sections = evidenceSections(item);
    return sections.size > 0 && (!expectedSection || sections.has(expectedSection));
  })
  );
  const sections = (report.sections || []).map((section) => ({
    ...section,
    claims: (section.claims || []).filter((claim) => (
      readerSafeIds(claim.evidence_ids, section.title)
    )),
  })).filter((section) => section.claims.length);
  const concreteClaims = sections.flatMap((section) => section.claims || []);
  const firstClaim = concreteClaims[0] || null;
  const lastClaim = concreteClaims.at(-1) || firstClaim;
  const summaryIsSafe = readerSafeIds(report.summary_evidence_ids);
  const conclusionIsSafe = readerSafeIds(report.conclusion?.evidence_ids);
  return {
    ...report,
    sections,
    summary: summaryIsSafe
      ? report.summary
      : firstClaim ? leadingSentences(firstClaim.text, 1) : report.summary,
    summary_evidence_ids: summaryIsSafe
      ? report.summary_evidence_ids
      : firstClaim?.evidence_ids || report.summary_evidence_ids,
    conclusion: conclusionIsSafe
      ? report.conclusion
      : lastClaim
        ? { text: lastClaim.text, evidence_ids: lastClaim.evidence_ids }
        : report.conclusion,
  };
}

const noMaterialChangeSummaries = {
  brief: [
    '当日行情、最新已披露经营指标和近期公司动态共同构成当前观察，核心关注方向继续保持不变。',
    '当前简评仍以市场表现、已披露经营指标和近期公司进展为主，后续继续跟踪设定的关注方向。',
  ],
  monitor: [
    '本轮未发现需要升级的新增风险信号，当日市场变化和近7日公司、行业事项继续按既定方向跟踪。',
    '当日价格与近期公司、行业背景未触发风险升级，后续仍需关注既定监控项。',
  ],
};

function selectNoMaterialChangeSummary(previous, type = 'brief') {
  const previousSummary = previous?.report?.analysis?.summary?.trim();
  const candidates = noMaterialChangeSummaries[type] || noMaterialChangeSummaries.brief;
  return candidates.find((summary) => summary !== previousSummary) || candidates[0];
}

function leadingSentences(text, count = 1) {
  const sentences = String(text || '').match(/[^。！？]+[。！？]?/g) || [];
  return sentences.slice(0, count).join('').trim();
}

function summarySentenceForClaim(claim) {
  const sentences = String(claim?.text || '').match(/[^。！？]+[。！？]?/g) || [];
  if (claim?.section_title === '经营与财务') {
    return sentences.find((sentence) => (
      /营业收入|营收|净利润|毛利率|净利率|研发费用|现金流|负债率|销量|产量|交付量/.test(sentence)
    ))?.trim() || sentences[0]?.trim() || '';
  }
  return sentences[0]?.trim() || '';
}

function stripSummaryAttribution(sentence, sectionTitle) {
  if (sectionTitle !== '关注方向') return sentence;
  const text = String(sentence || '')
    .replace(/^围绕“[^”]+”，/u, '')
    .trim();
  const official = text.match(/^([^，。]{1,40})发布(?:的[^，。]{0,20})?信息显示[，：]\s*(.+)$/u);
  if (official) {
    const detail = official[2]
      .replace(/^(?:日前|近日)[，,]\s*/u, '')
      .trim();
    return detail ? `据${official[1]}消息，${detail}` : text;
  }
  const attributed = text.match(/^([^，。]{1,40})(报道|提到|称)[，：]\s*(.+)$/u);
  if (!attributed) return text;
  const detail = attributed[3]
    .replace(/^(?:日前|近日)[，,]\s*/u, '')
    .replace(/^[^，。]{1,60}(?:获悉|了解到|消息显示)[，：]?\s*/u, '')
    .trim();
  if (!detail) return text;
  const attribution = attributed[2] === '报道'
    ? `据${attributed[1]}报道`
    : `据${attributed[1]}消息`;
  return `${attribution}，${detail}`;
}

function compactSummaryClaim(claim, maxChars = 60) {
  const sentence = stripSummaryAttribution(
    summarySentenceForClaim(claim),
    claim?.section_title,
  ).replace(/（以下简称[^）]+）/gu, '');
  if (!sentence || sentence.length <= maxChars) return sentence;
  const clauses = sentence.match(/[^，,；;。！？]+[，,；;。！？]?/g) || [];
  let compact = '';
  let hasSubstantivePredicate = false;
  for (const clause of clauses) {
    const next = compact + clause;
    const substantivePredicate = /(?:印发|发布|披露|实现|完成|签署|启动|上线|投产|量产|增长|下降|上调|下调|进入|退出|处于|达到|成为|保持|调整|回应|获批|通过)/u.test(clause)
      && !/^据[^，,]{1,40}(?:报道|消息)[，,]?$/u.test(clause);
    if (compact && next.length > maxChars && hasSubstantivePredicate) {
      if (/[，,；;]$/u.test(compact) && next.length <= Math.min(120, maxChars + 50)) {
        compact = next;
      }
      break;
    }
    compact += clause;
    hasSubstantivePredicate ||= substantivePredicate;
    if (hasSubstantivePredicate && /[。！？]$/u.test(compact)) break;
    if (hasSubstantivePredicate && compact.length >= maxChars && !/[，,；;]$/u.test(compact)) break;
  }
  if (!compact || !hasSubstantivePredicate) return sentence.slice(0, 120);
  return compact.replace(/[，,；;]\s*$/, '。').replace(/([^。！？])$/, '$1。');
}

function briefComprehensiveSummary(
  report,
  changeStatus = 'new_evidence',
  allowedEvidenceIds = null,
  preferenceContract = [],
) {
  const validEvidenceIds = allowedEvidenceIds ? new Set(allowedEvidenceIds) : null;
  const sectionItems = report.sections || [];
  const eligibleClaims = sectionItems.flatMap((section) => (
    (section.claims || []).map((claim) => ({
      ...claim,
      section_title: canonicalSectionTitle(section.title, 'brief'),
    }))
  )).filter((claim) => (
    ['市场表现', '经营与财务', '关注方向'].includes(claim.section_title)
    &&
    String(claim.text || '').trim()
    && (claim.evidence_ids || []).length
    && (!validEvidenceIds
      || (claim.evidence_ids || []).some((id) => validEvidenceIds.has(id)))
  ));
  const coveredPreferences = preferenceContractUnits(preferenceContract)
    .filter((item) => (
      item.status === 'covered'
      && !item.is_system_core
    ));
  const matchesCoveredPreference = (claim) => (
    coveredPreferences.some((item) => (
      (!item.expected_section
        || claim.section_title === canonicalSectionTitle(item.expected_section, 'brief'))
      && uniqueStrings([item.preference, item.display_label]).some((label) => (
        String(claim.text || '').includes(`围绕“${label}”`)
        || preferenceTextMatches(label, claim.text)
      ))
    ))
  );
  const claimKey = (claim) => (
    `${claim.section_title}|${[...(claim.evidence_ids || [])].sort().join(',')}`
  );
  const selectedClaims = [];
  const selectedKeys = new Set();
  const append = (claim) => {
    if (!claim || selectedKeys.has(claimKey(claim))) return;
    selectedClaims.push(claim);
    selectedKeys.add(claimKey(claim));
  };
  const baselineMarket = eligibleClaims.find((claim) => claim.section_title === '市场表现');
  append(baselineMarket);
  eligibleClaims
    .filter(matchesCoveredPreference)
    .forEach(append);

  const fallbackPriority = [
    ...eligibleClaims.filter((claim) => (
      claim.section_title === '关注方向'
      && (!coveredPreferences.length || matchesCoveredPreference(claim))
    )),
    ...eligibleClaims.filter((claim) => (
      claim.section_title === '市场表现' && claim !== baselineMarket
    )),
    ...eligibleClaims.filter((claim) => claim.section_title === '经营与财务'),
  ];
  fallbackPriority.forEach((claim) => {
    if (selectedClaims.length < 2) append(claim);
  });
  const maxClaims = 2;
  const conciseClaims = selectedClaims.slice(0, maxClaims);
  if (!conciseClaims.length) return null;
  const noChangePrefix = changeStatus === 'no_material_change'
    ? '与上次相比，本次可核验事实未发生实质变化。'
    : '';
  return {
    text: `${noChangePrefix}${conciseClaims
      .map((claim) => compactSummaryClaim(claim))
      .filter(Boolean)
      .join('')}`,
    evidence_ids: [...new Set(
      conciseClaims.flatMap((claim) => claim.evidence_ids || [])
        .filter((id) => !validEvidenceIds || validEvidenceIds.has(id)),
    )].slice(0, 8),
  };
}

function monitorSummarySentenceForClaim(claim) {
  const sentence = summarySentenceForClaim(claim);
  if (!sentence) return '';
  if (claim.section_title === '市场异动') {
    const priceFact = sentence.match(/(?:截至[^，。]+，)?[^。]*?最新价为[^，。]+，[^。]*?(?:涨跌幅|涨幅)为[^，。]+/);
    if (priceFact?.[0]) return `${priceFact[0].replace(/[，；;]\s*$/, '')}。`;
  }
  return compactSummaryClaim(claim, 72);
}

function compactMonitorDigestText(text, maxChars = 42) {
  const compact = String(text || '')
    .replace(/^围绕“[^”]+”，/, '')
    .replace(/^\s*[^，。]{1,40}(?:报道|提到)[，：]?\s*/, '')
    .replace(/^\s*[^，。]{1,50}发布(?:的)?(?:关于[^，。]{1,40})?信息显示[，：]?\s*/, '')
    .replace(/[“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!compact) return '';
  return compactSummaryClaim({ text: compact }, maxChars).replace(/[。！？]$/, '');
}

function monitorDigestSentenceForClaim(claim, evidenceById) {
  const section = claim.section_title;
  const source = (claim.evidence_ids || [])
    .map((id) => evidenceById.get(id))
    .find((item) => item?.type === 'web_search');
  const publisher = source?.publisher && source.publisher !== '公开网页'
    ? source.publisher
    : '公开信息';
  if (section === '市场异动') {
    if (source) {
      const digest = compactMonitorDigestText(monitorSummarySentenceForClaim(claim), 46);
      return digest ? `交易线索：据${publisher}报道，${digest}。` : '';
    }
    const marketSentence = monitorSummarySentenceForClaim(claim);
    return marketSentence ? `市场：${marketSentence.replace(/[。！？]$/, '')}。` : '';
  }
  if (section === '公司事件') {
    const headline = safeReaderFacingHeadline(source);
    const genericHeadline = /^(?:公司|经营|业务|相关|最新|重要)?(?:公告|新闻|报道|动态|信息|进展)$|^.+(?:发布)?经营公告$/;
    const digest = compactMonitorDigestText(
      monitorSummarySentenceForClaim(claim)
        || (headline && !genericHeadline.test(headline) ? headline : ''),
      38,
    );
    return digest ? `公司动态：据${publisher}报道，${digest}。` : '';
  }
  if (section === '外部风险') {
    const digest = compactMonitorDigestText(monitorSummarySentenceForClaim(claim), 46);
    return digest ? `外部环境：据${publisher}报道，${digest}。` : '';
  }
  return compactMonitorDigestText(monitorSummarySentenceForClaim(claim), 56);
}

function monitorComprehensiveSummary(report, evidence = [], changeStatus = 'new_evidence') {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const eligibleClaims = (report.sections || []).flatMap((section) => (
    (section.claims || []).map((claim) => ({
      ...claim,
      section_title: canonicalSectionTitle(section.title, 'monitor'),
    }))
  )).filter((claim) => (
    ['市场异动', '公司事件', '外部风险'].includes(claim.section_title)
    && String(claim.text || '').trim()
    && (claim.evidence_ids || []).some((id) => evidenceById.has(id))
  ));
  const hasRole = (claim, role) => (claim.evidence_ids || []).some((id) => (
    evidenceById.get(id)?.monitor_role === role
  ));
  const selectedClaims = [];
  const selectedKeys = new Set();
  const append = (claim) => {
    if (!claim || selectedClaims.length >= 2) return;
    const digest = monitorDigestSentenceForClaim(claim, evidenceById);
    const key = `${claim.section_title}|${(claim.evidence_ids || []).sort().join(',')}|${digest}`;
    if (!key || selectedKeys.has(key)) return;
    selectedClaims.push(claim);
    selectedKeys.add(key);
  };

  // The summary is a two-point cross-section digest. It first covers distinct
  // company/external web evidence, then uses market data only when fewer than
  // two meaningful event/context sources are available.
  eligibleClaims.filter((claim) => (
    ['公司事件', '外部风险'].includes(claim.section_title) && hasRole(claim, 'new_event')
  )).forEach(append);
  eligibleClaims.filter((claim) => ['公司事件', '外部风险'].includes(claim.section_title)).forEach(append);
  eligibleClaims.filter((claim) => (
    claim.section_title === '市场异动' && hasRole(claim, 'market_signal')
  )).forEach(append);
  eligibleClaims.filter((claim) => claim.section_title === '市场异动').forEach(append);
  if (!selectedClaims.length) return null;
  return {
    text: selectedClaims
      .map((claim) => monitorDigestSentenceForClaim(claim, evidenceById))
      .filter(Boolean)
      .join(''),
    evidence_ids: [...new Set(selectedClaims.flatMap((claim) => claim.evidence_ids || []))].slice(0, 8),
  };
}

function applyBriefComprehensiveSummary(report, changeStatus, preferenceContract = []) {
  const summary = briefComprehensiveSummary(report, changeStatus, null, preferenceContract);
  if (!summary) return report;
  return {
    ...report,
    summary: summary.text,
    summary_evidence_ids: summary.evidence_ids,
  };
}

function applyMonitorComprehensiveSummary(report, evidence, changeStatus) {
  const summary = monitorComprehensiveSummary(report, evidence, changeStatus);
  if (!summary) return report;
  return {
    ...report,
    summary: summary.text,
    summary_evidence_ids: summary.evidence_ids,
  };
}

function deterministicAuthoritativeReport(evidence, type, changeStatus, stock = null, previous = null) {
  const substantiveEvidence = evidence.filter((item) => item.type !== 'coverage');
  if (type === 'monitor' && !substantiveEvidence.length) {
    return materializeGeneratedReport(monitorNoAlertCandidate(changeStatus, evidence, stock));
  }
  const authoritativeIds = evidence
    .filter((item) => item.type === 'datapro'
      || item.source_tier === 'official'
      || (type === 'monitor' && item.type === 'coverage'))
    .map((item) => item.id)
    .slice(0, 8);
  if (!authoritativeIds.length) return null;
  const sections = deterministicCoreSections(evidence, type, stock);
  const contextSections = deterministicContextSections(evidence, stock, type);
  sections.push(...contextSections);
  if (!sections.length) return null;
  const summaryClaims = sections.flatMap((section) => (
    section.claims.map((claim) => ({
      ...claim,
      section_title: section.title,
    }))
  )).filter((claim) => (
    type === 'brief'
      ? ['市场表现', '经营与财务'].includes(claim.section_title)
      : ['市场异动', '公司事件', '外部风险'].includes(claim.section_title)
  )).slice(0, type === 'brief' ? 2 : 3);
  const substantiveSummary = summaryClaims.map((claim) => (
    leadingSentences(claim.text, claim.section_title === '经营与财务' ? 2 : 1)
  )).filter(Boolean).join('');
  const summaryEvidenceIds = [...new Set(
    summaryClaims.flatMap((claim) => claim.evidence_ids || []),
  )].slice(0, 8);
  let briefObservation = null;
  if (type === 'brief') {
    briefObservation = briefFollowUpClaim(sections, authoritativeIds);
    sections.push({
      title: '后续观察',
      claims: [briefObservation],
    });
  }
  const monitorConclusion = type === 'monitor'
    ? monitorComprehensiveSummary({ sections }, evidence, changeStatus)
    : null;
  const previousSummary = previous?.report?.analysis?.summary?.trim();
  const fallbackSummary = type === 'brief'
    ? '本次已取得可核验的最新行情和已披露经营数据，具体事实见正文。'
    : '本轮已完成当日市场与近7日风险信息检查，具体事实见正文。';
  const concreteSummary = substantiveSummary || fallbackSummary;
  const noChangePrefixes = type === 'brief'
    ? ['本次重新检索未发现新的实质性证据。', '截至本次更新，证据集合未发生实质变化。']
    : [monitorNoMaterialChangeStatement, '本轮增量窗口内没有形成有别于上次的新增公司事件证据。'];
  const noChangeSummary = noChangePrefixes
    .map((prefix) => `${prefix}${concreteSummary}`)
    .find((summary) => summary !== previousSummary)
    || `${noChangePrefixes[0]}${concreteSummary}`;
  const next = {
    status: 'sufficient',
    summary: changeStatus === 'no_material_change' ? noChangeSummary : concreteSummary,
    summary_evidence_ids: summaryEvidenceIds.length ? summaryEvidenceIds : authoritativeIds,
    change_summary: changeStatus === 'initial'
      ? '这是首次生成的报告，暂无可比较的历史结果。'
      : changeStatus === 'no_material_change'
        ? type === 'monitor'
          ? monitorNoMaterialChangeStatement
          : '与上次相比，本次检索未发现新的实质性证据。'
        : readerSafeChangeSummary(evidence, type, stock)?.text
          || '本次引用来源中包含新的可核验事实。',
    change_evidence_ids: changeStatus === 'new_evidence'
      ? readerSafeChangeSummary(evidence, type, stock)?.evidence_ids || authoritativeIds
      : [],
    risk_level: 'unknown',
    sections,
    conclusion: {
      text: type === 'brief'
        ? briefObservation.text
        : monitorConclusion?.text || substantiveSummary,
      evidence_ids: type === 'brief'
        ? briefObservation.evidence_ids
        : monitorConclusion?.evidence_ids?.length
          ? monitorConclusion.evidence_ids
          : summaryEvidenceIds.length ? summaryEvidenceIds : authoritativeIds,
    },
    limitations: [],
  };
  const merged = mergeDeterministicCore(next, evidence, type, stock).report;
  const fallbackPreferenceContract = type === 'brief' && stock
    ? buildPreferenceContract(stock, 'brief', null, evidence)
    : [];
  return type === 'brief'
    ? applyBriefComprehensiveSummary(merged, changeStatus, fallbackPreferenceContract)
    : applyMonitorComprehensiveSummary(merged, evidence, changeStatus);
}

function displayedWebEvidence(record) {
  const report = record?.report || {};
  const analysis = report.analysis || {};
  const citedIds = new Set([
    ...(analysis.summary_evidence_ids || []),
    ...(analysis.sections || []).flatMap((section) => (
      section.claims || []).flatMap((claim) => claim.evidence_ids || [])),
  ]);
  return (report.evidence || []).filter((item) => item.type === 'web_search' && citedIds.has(item.id));
}

function carriedForwardSourceMetadata(item) {
  const attributedPublisher = extractAttributedPublisher(item?.content);
  const previousPublisher = String(item?.publisher || '').trim();
  const publisher = attributedPublisher || previousPublisher;
  const hostingSite = item?.hosting_site || (
    attributedPublisher
      && previousPublisher
      && publisherIdentity(attributedPublisher) !== publisherIdentity(previousPublisher)
      ? previousPublisher
      : ''
  );
  return {
    publisher,
    ...(hostingSite ? { hosting_site: hostingSite } : {}),
  };
}

function carriedForwardBriefWebItems(records, stock, now = new Date(), options = {}) {
  const endTime = now.getTime();
  const startTime = endTime - 31 * 24 * 60 * 60 * 1000;
  const candidates = (records || []).flatMap(displayedWebEvidence)
    .filter((item) => {
      const publishedTime = Date.parse(item.published_at || item.as_of_date || '');
      return Number.isFinite(publishedTime)
        && publishedTime >= startTime
        && publishedTime <= endTime
        && Array.isArray(item.semantic_matches)
        && safeSemanticMatches(item, stock).length > 0;
    })
    .map((item) => ({
      title: item.title,
      ...carriedForwardSourceMetadata(item),
      url: item.url,
      summary: item.content,
      published_at: item.published_at || item.as_of_date,
      source_tier: item.source_tier,
      semantic_matches: safeSemanticMatches(item, stock),
      semantic_binding_checked: true,
    }));
  return curateWebItems(candidates, stock, {
    requireStockInTitle: true,
    requireSubstantiveBusiness: true,
    maxItems: options.maxItems || 2,
    excludeSources: options.excludeSources || [],
    semanticBindingRequired: true,
    preferenceBindingRequired: true,
  });
}

function carriedForwardMonitorWebItems(records, stock, now = new Date(), options = {}) {
  const endTime = now.getTime();
  const startTime = endTime - 7 * 24 * 60 * 60 * 1000;
  const candidates = (records || []).flatMap(displayedWebEvidence)
    .filter((item) => {
      const publishedTime = Date.parse(item.published_at || item.as_of_date || '');
      return Number.isFinite(publishedTime)
        && publishedTime >= startTime
        && publishedTime <= endTime;
    })
    .map((item) => ({
      type: 'web_search',
      title: item.title,
      ...carriedForwardSourceMetadata(item),
      url: item.url,
      summary: item.content,
      published_at: item.published_at || item.as_of_date,
      source_tier: item.source_tier,
      semantic_matches: safeSemanticMatches(item, stock),
      semantic_binding_checked: Boolean(item.semantic_binding_checked),
    }));
  return curateWebItems(candidates, stock, {
    maxItems: options.maxItems || 2,
    excludeSources: options.excludeSources || [],
    requiredTitleTerms: monitorTitleTerms(stock),
    requiredEventTerms: monitorEventTerms(stock),
  }).filter((item) => hasVerifiedMonitorBinding(item, stock));
}

export class ReportService {
  constructor({ repository, dataPro, webSearch, model, config }) {
    this.repository = repository;
    this.dataPro = dataPro;
    this.webSearch = webSearch;
    this.model = model;
    this.config = config;
  }

  async generate({ stockId, type, now = new Date(), trigger = null }) {
    if (!['brief', 'monitor'].includes(type)) {
      throw new AppError('未知报告类型', { code: 'INVALID_REPORT_TYPE', status: 400 });
    }
    const stock = this.repository.getStock(stockId);
    if (!stock) throw new AppError('关注标的不存在', { code: 'STOCK_NOT_FOUND', status: 404 });
    const reportId = randomUUID();
    const usageBase = { report_id: reportId, stock_id: stockId, report_type: type };
    const monitorSettings = this.repository.getMonitorSettings(stockId);
    const previous = this.repository.getLatestReport(stockId, type);
    const counterpart = this.repository.getLatestReport(stockId, type === 'brief' ? 'monitor' : 'brief');
    const recentSameTypeReports = this.repository.listReports?.(stockId, type, 8)
      || [previous].filter(Boolean);
    const callModel = async (operation, args, attempt = 0) => {
      try {
        const result = await this.model.generateJson(args);
        recordUsage(this.repository, {
          ...usageBase,
          provider: 'ark_model',
          operation,
          status: 'succeeded',
          request_count: 1,
          ...usageTokens(result.usage),
          metadata: {
            attempt: attempt + 1,
            model: result.model || null,
            json_repaired: Boolean(result.jsonRepaired),
          },
        });
        return result;
      } catch (error) {
        recordUsage(this.repository, {
          ...usageBase,
          provider: 'ark_model',
          operation,
          status: 'failed',
          request_count: 1,
          error_code: error?.code || 'MODEL_ERROR',
          metadata: { attempt: attempt + 1 },
        });
        throw error;
      }
    };
    let semanticQueries = [];
    let semanticQueryPlanningStatus = 'disabled';
    if (this.config.semanticPreferenceEnabled !== false && (stock.focus || []).length) {
      try {
        const planResult = await callModel('preference_query_plan', {
          instructions: semanticQueryPlanInstructions(type),
          input: semanticQueryPlanInput(stock, type, {
            timezone: this.config.timezone,
            previous,
            now,
          }),
          schema: semanticQueryPlanJsonSchema,
          schemaName: 'investment_preference_query_plan',
          maxOutputTokens: 1200,
        });
        semanticQueries = validateSemanticQueryPlan(planResult.data, stock, type);
        semanticQueryPlanningStatus = semanticQueries.length ? 'ready' : 'fallback';
      } catch {
        // The stable query path is retained when the planning step is temporarily unavailable.
        semanticQueryPlanningStatus = 'fallback';
      }
    }
    const queries = reportQueries(stock, type, monitorSettings, {
      timezone: this.config.timezone,
      previous,
      now,
      semanticQueries,
    });
    let dataResults = await Promise.allSettled(queries.data.map((query) => this.dataPro.search(query)));
    const retrievedAt = new Date().toISOString();
    const matchedDataEvidence = (results) => {
      const items = results
        .filter((result) => result.status === 'fulfilled')
        .flatMap((result) => result.value.items || []);
      return normalizeDataProEvidence(stock, { items }, retrievedAt)
        .filter((item) => evidenceMatchesStockCode(item, stock.code) && item.as_of_date && item.rows.length)
        .filter((item) => type !== 'monitor' || dataEvidenceWithinWindow(item, queries.window));
    };
    let dataEvidence = matchedDataEvidence(dataResults);
    if (!dataEvidence.some((item) => isMarketEvidence(item))) {
      const currentDate = localIsoDate(this.config.timezone, now);
      const fallbackAttemptLimit = Math.max(
        2,
        Number(this.config.providerRetryCount ?? 2) + 1,
      );
      for (let attempt = 0; attempt < fallbackAttemptLimit; attempt += 1) {
        const fallbackQuery = completeMarketDataQuery(
          stock,
          currentDate,
          type,
          marketDateHint(dataEvidence),
        );
        const fallbackResult = await Promise.allSettled([this.dataPro.search(fallbackQuery)]);
        dataResults = [...dataResults, ...fallbackResult];
        dataEvidence = matchedDataEvidence(dataResults);
        if (dataEvidence.some((item) => isMarketEvidence(item))) break;
      }
    }
    if (type === 'monitor') {
      dataEvidence = dataEvidence.filter((item) => (
        isMarketEvidence(item) || isMonitorDataEventEvidence(item)
      ));
    }
    dataResults.forEach((result, index) => {
      recordUsage(this.repository, {
        ...usageBase,
        provider: 'datapro',
        operation: 'search',
        status: result.status === 'fulfilled' ? 'succeeded' : 'failed',
        request_count: 1,
        error_code: result.status === 'rejected' ? result.reason?.code || 'PROVIDER_ERROR' : null,
        metadata: {
          query_index: index + 1,
          fallback: index >= queries.data.length,
          ...(index >= queries.data.length
            ? { fallback_attempt: index - queries.data.length + 1 }
            : {}),
          result_count: result.status === 'fulfilled' ? result.value.items.length : 0,
        },
      });
    });
    const successfulDataResults = dataResults.filter((result) => result.status === 'fulfilled');
    const failedDataResults = dataResults.filter((result) => result.status === 'rejected');
    const dataItems = successfulDataResults.flatMap((result) => result.value.items || []);
    let dataProviderIssue = null;
    if (!successfulDataResults.length) {
      const error = failedDataResults[0]?.reason;
      dataProviderIssue = {
        code: error?.code || 'DATAPRO_UNAVAILABLE',
        message: error?.message || 'DataPro 本次请求未返回结果',
      };
    } else if (!dataEvidence.length) {
      dataProviderIssue = {
        code: 'INSUFFICIENT_DATAPRO_EVIDENCE',
        message: 'DataPro 未返回可确认属于该证券的有效数据',
      };
    } else {
      const currentDates = newestDataDatesByKind(dataEvidence);
      const previousDates = newestDataDatesByKind(previous?.report?.evidence || []);
      const regressedKinds = Object.keys(currentDates)
        .filter((kind) => previousDates[kind] && currentDates[kind] < previousDates[kind]);
      if (regressedKinds.length) {
        dataEvidence = dataEvidence.filter((item) => !regressedKinds.includes(dataEvidenceKind(item)));
        dataProviderIssue = {
          code: 'STALE_PROVIDER_DATA',
          message: 'DataPro 本次部分数据早于同类上一份报告，仅省略倒退类别并保留其他已核验数据',
        };
      } else if (failedDataResults.length) {
        dataProviderIssue = {
          code: failedDataResults[0]?.reason?.code || 'DATAPRO_PARTIAL_FAILURE',
          message: 'DataPro 部分查询未返回，正文仅使用本次已核验的数据',
        };
      }
    }

    const executeWebQueries = (querySpecs) => Promise.allSettled(querySpecs.map((query) => this.webSearch.search(query.query, {
      count: 12,
      timeRange: query.timeRange,
      authLevel: query.authLevel,
      queryRewrite: query.queryRewrite,
    })));
    const activePreferences = stock.focus;
    const webPreferenceCount = expandedPreferences(activePreferences)
      .filter((item) => !['market', 'financial'].includes(focusProfile(item).key))
      .length;
    const previousWebEvidence = displayedWebEvidence(previous);
    const counterpartWebEvidence = displayedWebEvidence(counterpart);
    const excludedWebEvidence = [
      ...counterpartWebEvidence,
      ...(type === 'brief' ? previousWebEvidence : []),
    ];
    const curationOptions = {
      requireStockInTitle: type === 'brief',
      requireSubstantiveBusiness: type === 'brief',
      requiredTitleTerms: type === 'monitor' ? monitorTitleTerms(stock) : [],
      requiredEventTerms: type === 'monitor' ? monitorEventTerms(stock) : [],
      publishedWindow: type === 'monitor' ? monitorReviewWindow(queries.window) : null,
      maxItems: Math.max(3, Math.min(8, webPreferenceCount + 1)),
      diversifyByStock: type === 'monitor',
      preferredTitleTerms: type === 'brief'
        ? ['公告', '产销', '销量', '产量', '业绩', '财报', '经营']
        : [],
      excludeSources: excludedWebEvidence,
      // A monitor may retain a recent risk background when no fresher fact
      // exists, but it must still stay distinct from the latest brief.
      deprioritizeSources: type === 'monitor' ? previousWebEvidence : [],
      semanticBindingRequired: false,
      preferenceBindingRequired: false,
    };
    const webQuerySpecs = [...queries.web];
    let webResults = await executeWebQueries(webQuerySpecs);
    const initialSuccessful = webResults.filter((result) => result.status === 'fulfilled');
    const initialRawItems = uniqueWebItems(initialSuccessful.map((result) => result.value));
    const initialCuratedItems = curateWebItems(initialRawItems, stock, curationOptions);
    const initialWebEvidence = normalizeWebEvidence({ items: initialCuratedItems }, retrievedAt);
    const preferenceFollowUps = preferenceRefinementQueries(
      stock,
      type,
      monitorSettings,
      [...dataEvidence, ...initialWebEvidence],
    );
    if (initialCuratedItems.length < 2 || preferenceFollowUps.length) {
      const followUpQueries = [
        ...preferenceFollowUps,
        ...(initialCuratedItems.length < 2
          ? refinementQueries(initialRawItems, stock, monitorSettings, type)
          : []),
      ]
        .filter((candidate) => !webQuerySpecs.some((query) => query.query === candidate.query));
      if (followUpQueries.length) {
        const uniqueFollowUps = [...new Map(
          followUpQueries.map((query) => [query.query, query]),
        ).values()].slice(0, 4);
        webQuerySpecs.push(...uniqueFollowUps);
        webResults = [...webResults, ...await executeWebQueries(uniqueFollowUps)];
      }
    }
    webResults.forEach((result, index) => {
      recordUsage(this.repository, {
        ...usageBase,
        provider: 'web_search',
        operation: 'search',
        status: result.status === 'fulfilled' ? 'succeeded' : 'failed',
        request_count: 1,
        error_code: result.status === 'rejected' ? result.reason?.code || 'PROVIDER_ERROR' : null,
        metadata: {
          query_index: index + 1,
          result_count: result.status === 'fulfilled' ? result.value.items.length : 0,
          time_range: webQuerySpecs[index].timeRange,
          refinement: Boolean(webQuerySpecs[index].refinement),
          preference_refinement: Boolean(webQuerySpecs[index].preference_refinement),
          semantic: Boolean(webQuerySpecs[index].semantic),
        },
      });
    });
    const successfulWebResults = webResults.filter((result) => result.status === 'fulfilled');
    const failedWebResults = webResults.filter((result) => result.status === 'rejected');
    const rawWebItems = uniqueWebItems(successfulWebResults.map((result) => result.value));
    const dataCoveredPreferences = new Set(
      preferenceContractUnits(
        buildPreferenceContract(stock, type, monitorSettings, dataEvidence),
      )
        .filter((item) => item.status === 'covered' && !item.is_system_core)
        .map((item) => item.preference),
    );
    const semanticPreferences = expandedPreferences(stock.focus || [])
      .filter((preference) => !dataCoveredPreferences.has(preference));
    let semanticBindingStatus = 'disabled';
    let semanticBindingCount = 0;
    let boundWebItems = rawWebItems;
    if (this.config.semanticPreferenceEnabled !== false
      && rawWebItems.length
      && semanticPreferences.length) {
      const candidates = semanticCandidateItems(rawWebItems, stock, curationOptions);
      if (candidates.length) {
        try {
          const bindingResult = await callModel('preference_source_binding', {
            instructions: semanticEvidenceBindingInstructions(type),
            input: semanticEvidenceBindingInput(stock, type, candidates, semanticPreferences),
            schema: semanticEvidenceBindingJsonSchema,
            schemaName: 'investment_preference_source_binding',
            maxOutputTokens: 2200,
          });
          let bindings = validateSemanticEvidenceBindings(bindingResult.data, stock, candidates);
          // A mixed batch can cover one topic while overlooking another. Re-evaluate
          // every uncovered subtopic independently, retaining the same quote proof.
          const coveredPreferences = new Set(
            [...bindings.values()].flat().map((match) => match.preference),
          );
          const uncoveredPreferences = semanticPreferences
            .filter((preference) => !coveredPreferences.has(preference));
          if (uncoveredPreferences.length) {
            const recovered = [];
            for (const preference of uncoveredPreferences) {
              try {
                const recoveryResult = await callModel('preference_source_binding_recovery', {
                  instructions: semanticEvidenceBindingInstructions(type),
                  input: semanticEvidenceBindingInput(stock, type, candidates, [preference]),
                  schema: semanticEvidenceBindingJsonSchema,
                  schemaName: 'investment_preference_source_binding',
                  maxOutputTokens: 1200,
                });
                recovered.push(validateSemanticEvidenceBindings(
                  recoveryResult.data,
                  stock,
                  candidates,
                ));
              } catch {
                // One preference recovery must not suppress other source-backed preferences.
              }
            }
            bindings = mergeSemanticEvidenceBindings(bindings, ...recovered);
          }
          semanticBindingCount = [...bindings.values()].flat().length;
          if (semanticBindingCount) {
            boundWebItems = attachSemanticBindings(rawWebItems, candidates, bindings);
            semanticBindingStatus = 'ready';
          } else {
            // No semantic proof was accepted. Keep raw candidates unmarked so the
            // conservative lexical curation path can still evaluate them.
            boundWebItems = rawWebItems;
            semanticBindingStatus = 'fallback';
          }
        } catch {
          // Curation falls back to its conservative lexical checks if semantic binding is unavailable.
          semanticBindingStatus = 'fallback';
        }
      } else {
        semanticBindingStatus = 'no_candidates';
      }
    } else if (this.config.semanticPreferenceEnabled !== false
      && rawWebItems.length
      && !semanticPreferences.length) {
      semanticBindingStatus = 'not_needed';
    }
    const curatedWebItems = curateWebItems(boundWebItems, stock, {
      ...curationOptions,
      // Semantic binding improves preference ranking, but is not a publication gate for
      // a monitor. A trustworthy, recent company event must not disappear merely because
      // the optional binding pass misses a broad or newly written user preference.
      semanticBindingRequired: type === 'brief' && semanticBindingStatus === 'ready',
      preferenceBindingRequired: type === 'brief' && semanticBindingStatus === 'ready',
    });
    // A generic industry article may match a topic semantically, yet still say nothing
    // about the tracked company. Do not turn that into a company risk report. External
    // context without a company mention is reserved for first-party policy or regulator
    // material, where the source itself is authoritative.
    let webItems = type === 'monitor'
      ? curatedWebItems.filter((item) => hasVerifiedMonitorBinding(item, stock))
      : curatedWebItems;
    if (!webItems.length && type === 'brief' && previousWebEvidence.length) {
      // Prefer a fresh page, but do not erase a still-valid source when the
      // current search genuinely has no distinct alternative.
      webItems = curateWebItems(boundWebItems, stock, {
        ...curationOptions,
        excludeSources: counterpartWebEvidence,
        deprioritizeSources: previousWebEvidence,
        semanticBindingRequired: semanticBindingStatus === 'ready',
        preferenceBindingRequired: semanticBindingStatus === 'ready',
      });
    }
    let carriedForwardWebCount = 0;
    if (webItems.length < 2) {
      const carriedForwardItems = type === 'brief'
        ? carriedForwardBriefWebItems(
          recentSameTypeReports,
          stock,
          now,
          {
            maxItems: 2 - webItems.length,
            excludeSources: [...webItems, ...counterpartWebEvidence],
          },
        )
        : carriedForwardMonitorWebItems(
          recentSameTypeReports,
          stock,
          now,
          {
            maxItems: 2 - webItems.length,
            excludeSources: [...webItems, ...excludedWebEvidence],
          },
        );
      webItems = [...webItems, ...carriedForwardItems];
      carriedForwardWebCount = carriedForwardItems.length;
      if (carriedForwardWebCount) {
        semanticBindingStatus = 'carried_forward';
        semanticBindingCount += carriedForwardItems
          .flatMap((item) => item.semantic_matches || []).length;
      }
    }
    webItems = webItems.filter((item) => readerSafeWebItem(item, stock, type));
    if (type === 'brief' && webItems.length < 2) {
      const supplementalItems = curateWebItems(rawWebItems, stock, {
        ...curationOptions,
        excludeSources: [...webItems, ...excludedWebEvidence],
        maxItems: 8,
        semanticBindingRequired: false,
        preferenceBindingRequired: false,
      })
        .filter((item) => isBriefSupplementalCompanySource(item, stock))
        .slice(0, 2 - webItems.length);
      webItems = [...webItems, ...supplementalItems];
    }
    const rawWebIdentityKeys = new Set(rawWebItems.flatMap(sourceIdentityKeys));
    const currentSelectedWebCount = webItems.filter((item) => (
      sourceIdentityKeys(item).some((key) => rawWebIdentityKeys.has(key))
    )).length;
    const webProviderIssue = successfulWebResults.length
      ? null
      : {
        code: failedWebResults[0]?.reason?.code || 'WEB_SEARCH_UNAVAILABLE',
        message: failedWebResults[0]?.reason?.message || '联网搜索本次请求未返回结果',
      };
    const providerStatus = {
      datapro: {
        ok: dataEvidence.length > 0,
        degraded: Boolean(dataProviderIssue),
        code: dataProviderIssue?.code || null,
        message: dataProviderIssue?.message || null,
        query_count: dataResults.length,
        successful_query_count: successfulDataResults.length,
        failed_query_count: failedDataResults.length,
        result_count: dataItems.length,
        matched_result_count: dataEvidence.length,
      },
      web_search: successfulWebResults.length
        ? {
          ok: true,
          query_count: webQuerySpecs.length,
          successful_query_count: successfulWebResults.length,
          failed_query_count: failedWebResults.length,
          result_count: webItems.length,
          raw_result_count: rawWebItems.length,
          filtered_result_count: Math.max(0, rawWebItems.length - currentSelectedWebCount),
          carried_forward_result_count: carriedForwardWebCount,
        }
        : providerFailure('web_search', failedWebResults[0]?.reason),
    };
    const webEvidence = normalizeWebEvidence({ items: webItems }, retrievedAt);
    if (!dataEvidence.length && !webEvidence.length) {
      throw new AppError('本次没有取得可归属到目标标的的可核验事实，未生成报告', {
        code: 'REQUIRED_PROVIDER_UNAVAILABLE',
        status: 503,
        details: { providers: providerStatus },
      });
    }
    const monitorEvidence = type === 'monitor'
      ? [...dataEvidence, ...webEvidence].map((item) => ({
        ...item,
        monitor_role: monitorEvidenceRole(item, queries.window),
      }))
      : [];
    const newEventSignals = monitorEvidence.filter((item) => item.monitor_role === 'new_event');
    const marketSignals = monitorEvidence.filter((item) => item.monitor_role === 'market_signal');
    const monitorSignals = [...newEventSignals, ...marketSignals];
    const evidence = type === 'monitor'
      ? [monitorCoverageEvidence({
        stock,
        window: queries.window,
        providerStatus,
        eventEvidenceCount: newEventSignals.length,
        retrievedAt,
      }), ...monitorEvidence]
      : [...dataEvidence, ...webEvidence];
    const activeFocus = stock.focus;
    const analysisStock = { ...stock, focus: activeFocus };
    const preferenceContract = buildPreferenceContract(stock, type, monitorSettings, evidence);

    const fingerprint = fingerprintEvidence(type === 'monitor' ? monitorEvidence : evidence);
    const changeStatus = !previous
      ? 'initial'
      : type === 'monitor' && monitorSignals.length === 0
        ? 'no_material_change'
        : previous.evidence_fingerprint === fingerprint ? 'no_material_change' : 'new_evidence';
    const input = buildInput({
      stock,
      type,
      evidence,
      previous,
      changeStatus,
      monitorSettings,
      window: queries.window || null,
    });
    let generated;
    let modelResult;
    let verifierResult;
    let lastVerifierUsage = {};
    let lastError;
    let prunedClaimCount = 0;
    let fallbackRewrittenFields = [];
    let deterministicCoreTitles = [];
    let lastDisplayCandidate = null;
    const sourceReviewIssues = [
      dataProviderIssue
        ? { location: 'DataPro', reason: `DataPro 本次不可完整使用：${dataProviderIssue.message}` }
        : null,
      webProviderIssue
        ? { location: '联网搜索', reason: `联网搜索本次不可使用：${webProviderIssue.message}` }
        : null,
    ].filter(Boolean);
    let reviewIssues = [...sourceReviewIssues];
    let reviewRequired = sourceReviewIssues.length > 0;
    let accepted = false;

    const runSemanticVerification = async (
      candidate,
      attempt,
      operation,
      contract = preferenceContract,
      verificationEvidence = evidence,
    ) => {
      const result = await callModel(operation, {
        instructions: verificationInstructions(type),
        input: verificationInput(candidate, verificationEvidence, changeStatus, contract),
        schema: reportVerificationJsonSchema,
        schemaName: 'investment_report_verification',
        maxOutputTokens: 900,
      }, attempt);
      lastVerifierUsage = result.usage || {};
      if (result.data?.valid !== true || result.data?.issues?.length) {
        const issues = result.data?.issues?.length
          ? result.data.issues
          : [{ location: 'report', reason: '审校器未确认报告有效' }];
        recordUsage(this.repository, {
          ...usageBase,
          provider: 'ark_model',
          operation: `${operation}_decision`,
          status: 'failed',
          request_count: 0,
          error_code: 'EVIDENCE_VALIDATION_FAILED',
          metadata: {
            attempt: attempt + 1,
            issues: issues.slice(0, 8).map((issue) => ({
              location: String(issue?.location || 'report').slice(0, 120),
              reason: String(issue?.reason || '审校器未确认报告有效').slice(0, 300),
            })),
          },
        });
        throw new EvidenceValidationError('报告未通过语义证据审校', issues);
      }
      return result;
    };
    const verifyCandidate = async (
      candidate,
      attempt,
      operation = 'report_verification',
      contract = preferenceContract,
      verificationEvidence = evidence,
    ) => {
      try {
        validatePreferenceCoverage(candidate, contract, type, verificationEvidence);
      } catch (error) {
        if (error instanceof EvidenceValidationError) {
          recordUsage(this.repository, {
            ...usageBase,
            provider: 'local_validation',
            operation: `${operation}_preference_coverage`,
            status: 'failed',
            request_count: 0,
            error_code: error.code || 'EVIDENCE_VALIDATION_FAILED',
            metadata: {
              attempt: attempt + 1,
              issues: (error.details || []).slice(0, 12),
            },
          });
        }
        throw error;
      }
      return runSemanticVerification(
        candidate,
        attempt,
        operation,
        contract,
        verificationEvidence,
      );
    };
    const validateCandidate = (candidate, attempt, operation) => {
      try {
        return validateGeneratedReport(candidate, evidence);
      } catch (error) {
        if (error instanceof EvidenceValidationError) {
          recordUsage(this.repository, {
            ...usageBase,
            provider: 'local_validation',
            operation,
            status: 'failed',
            request_count: 0,
            error_code: error.code || 'EVIDENCE_VALIDATION_FAILED',
            metadata: {
              attempt: attempt + 1,
              issues: (error.details || []).slice(0, 12),
            },
          });
        }
        throw error;
      }
    };

    for (let attempt = 0; attempt <= this.config.reportRetryCount; attempt += 1) {
      try {
        const correction = attempt > 0
          ? correctionInstructions(lastError)
          : '';
        modelResult = await callModel('report_generation', {
            instructions: `${buildInstructions(type)}${correction}`,
            input,
            schema: generatedReportJsonSchema,
            schemaName: type === 'brief' ? 'stock_brief' : 'after_hours_risk_report',
        }, attempt);
        const monitorHasNoEvidence = type === 'monitor' && monitorEvidence.length === 0;
        let candidate = monitorHasNoEvidence
          ? monitorNoAlertCandidate(changeStatus, evidence, stock, monitorSettings)
          : structuredClone(modelResult.data);
        if (type === 'monitor' && monitorSignals.length === 0) {
          candidate = normalizeNoSignalMonitorCandidate(
            candidate,
            evidence,
            stock,
            monitorSettings,
            changeStatus,
          );
        }
        if (!monitorHasNoEvidence && changeStatus === 'initial') {
          candidate.change_summary = '这是首次生成的报告，暂无可比较的历史结果。';
          candidate.change_evidence_ids = [];
        } else if (!monitorHasNoEvidence && changeStatus === 'no_material_change') {
          candidate.change_summary = type === 'brief'
            ? '与上次相比，本次检索未发现新的实质性证据。'
            : monitorNoMaterialChangeStatement;
          candidate.change_evidence_ids = [];
          if (candidate.summary.trim() === previous.report.analysis.summary.trim()) {
            const noChangePrefix = type === 'brief'
              ? '本次重新检索未发现新的实质性证据。'
              : monitorNoMaterialChangeStatement;
            candidate.summary = `${noChangePrefix}${candidate.summary}`;
            fallbackRewrittenFields = [...new Set([
              ...fallbackRewrittenFields,
              'summary_non_duplicate',
            ])];
          }
        } else if (!monitorHasNoEvidence && !candidate.change_evidence_ids?.length) {
          throw new EvidenceValidationError('变化说明缺少对应证据', [{
            location: 'change_summary',
            type: 'missing_evidence',
            evidence_ids: [],
          }]);
        } else if (!monitorHasNoEvidence && changeStatus === 'new_evidence') {
          const changeEvidence = candidate.change_evidence_ids
            .map((id) => evidence.find((item) => item.id === id))
            .filter(Boolean);
          const readerSafeChange = readerSafeChangeSummary(
            changeEvidence.length ? changeEvidence : evidence,
            type,
            analysisStock,
          );
          if (!readerSafeChange) {
            throw new EvidenceValidationError('变化说明无法提取对应事实', [{
              location: 'change_summary',
              type: 'reader_safe_change_unavailable',
              evidence_ids: candidate.change_evidence_ids,
            }]);
          }
          candidate.change_summary = readerSafeChange.text;
          candidate.change_evidence_ids = readerSafeChange.evidence_ids;
        }
        const materialized = materializeGeneratedReport(candidate);
        lastDisplayCandidate = structuredClone(materialized);
        try {
          generated = validateCandidate(materialized, attempt, 'generated_report_validation');
          lastDisplayCandidate = structuredClone(generated);
        } catch (error) {
          if (!(error instanceof EvidenceValidationError)) throw error;
          const stabilized = stabilizeInvalidReport(materialized, error.details, evidence, changeStatus, {
            type,
            stock: analysisStock,
            preferenceContract,
          });
          if (!stabilized) throw error;
          generated = validateCandidate(stabilized.report, attempt, 'stabilized_report_validation');
          prunedClaimCount = stabilized.prunedCount;
          lastDisplayCandidate = structuredClone(generated);
          fallbackRewrittenFields = [...new Set([
            ...fallbackRewrittenFields,
            ...stabilized.rewrittenFields,
          ])];
        }
        const withCore = mergeDeterministicCore(generated, evidence, type, analysisStock);
        deterministicCoreTitles = withCore.coreTitles;
        const readerSafeReport = stripInternalCoverageClaims(
          type === 'monitor'
            ? restrictMonitorReaderReport(withCore.report, evidence, analysisStock)
            : withCore.report,
          evidence,
          type,
        );
        const finalizedReport = type === 'monitor'
          ? applyMonitorComprehensiveSummary(readerSafeReport, evidence, changeStatus)
          : applyBriefComprehensiveSummary(
            readerSafeReport,
            changeStatus,
            preferenceContract,
          );
        try {
          generated = validateCandidate(finalizedReport, attempt, 'merged_report_validation');
          lastDisplayCandidate = structuredClone(generated);
        } catch (error) {
          if (!(error instanceof EvidenceValidationError)) throw error;
          const conservative = deterministicAuthoritativeReport(evidence, type, changeStatus, analysisStock, previous);
          if (!conservative) throw error;
          const conservativeReaderReport = stripInternalCoverageClaims(conservative, evidence, type);
          generated = validateCandidate(
            type === 'monitor'
              ? applyMonitorComprehensiveSummary(conservativeReaderReport, evidence, changeStatus)
              : conservativeReaderReport,
            attempt,
            'authoritative_report_validation',
          );
          lastDisplayCandidate = structuredClone(generated);
          fallbackRewrittenFields = [...new Set([
            ...fallbackRewrittenFields,
            'authoritative_only',
          ])];
        }
        try {
          verifierResult = await verifyCandidate(generated, attempt);
        } catch (error) {
          if (!(error instanceof EvidenceValidationError)) throw error;
          const stabilized = stabilizeInvalidReport(generated, error.details, evidence, changeStatus, {
            type,
            stock: analysisStock,
            preferenceContract,
          });
          if (!stabilized) throw error;
          generated = validateCandidate(
            stabilized.report,
            attempt,
            'semantic_stabilized_report_validation',
          );
          lastDisplayCandidate = structuredClone(generated);
          prunedClaimCount += stabilized.prunedCount;
          fallbackRewrittenFields = [...new Set([
            ...fallbackRewrittenFields,
            ...stabilized.rewrittenFields,
          ])];
          verifierResult = await verifyCandidate(
            generated,
            attempt,
            'report_stabilized_verification',
          );
        }
        accepted = true;
        break;
      } catch (error) {
        lastError = error;
        const candidateIssues = normalizeReviewIssues(error);
        if (candidateIssues.length) {
          reviewIssues = mergeReviewIssues(sourceReviewIssues, candidateIssues);
        }
        if (generated) lastDisplayCandidate = structuredClone(generated);
        const retryable = error instanceof EvidenceValidationError
          || error?.name === 'ZodError'
          || [
            'ARK_MODEL_INVALID_JSON',
            'ARK_MODEL_INCOMPLETE',
            'ARK_MODEL_TIMEOUT',
            'ARK_MODEL_NETWORK_ERROR',
            'ARK_MODEL_EMPTY',
          ].includes(error?.code);
        if (retryable && attempt >= this.config.reportRetryCount && modelResult) {
          const conservative = deterministicAuthoritativeReport(evidence, type, changeStatus, analysisStock, previous);
          if (conservative) {
            try {
              const conservativeReaderReport = stripInternalCoverageClaims(conservative, evidence, type);
              generated = validateCandidate(
                type === 'monitor'
                  ? applyMonitorComprehensiveSummary(conservativeReaderReport, evidence, changeStatus)
                  : conservativeReaderReport,
                attempt,
                'fallback_report_validation',
              );
            } catch (fallbackError) {
              lastError = fallbackError;
              const fallbackIssues = normalizeReviewIssues(fallbackError);
              if (fallbackIssues.length) {
                reviewIssues = mergeReviewIssues(sourceReviewIssues, fallbackIssues);
              }
              const display = displayCandidate(conservative, evidence, type);
              generated = type === 'monitor'
                ? applyMonitorComprehensiveSummary(display, evidence, changeStatus)
                : display;
            }
            deterministicCoreTitles = deterministicCoreSections(evidence, type, analysisStock)
              .map((section) => section.title);
            lastDisplayCandidate = structuredClone(generated);
            fallbackRewrittenFields = [...new Set([
              ...fallbackRewrittenFields,
              'authoritative_only',
            ])];
            try {
              verifierResult = await verifyCandidate(
                generated,
                attempt,
                'report_fallback_verification',
              );
              accepted = true;
              break;
            } catch (fallbackVerificationError) {
              lastError = fallbackVerificationError;
              const fallbackIssues = normalizeReviewIssues(fallbackVerificationError);
              if (fallbackIssues.length) {
                reviewIssues = mergeReviewIssues(sourceReviewIssues, fallbackIssues);
              }
            }
          }
        }
        if (!retryable || attempt >= this.config.reportRetryCount) break;
      }
    }
    if (!accepted) {
      const fallback = lastDisplayCandidate
        || displayCandidate(generated, evidence, type)
        || displayCandidate(
          deterministicAuthoritativeReport(evidence, type, changeStatus, analysisStock, previous),
          evidence,
          type,
        );
      if (!fallback) throw lastError || new EvidenceValidationError('报告未形成可展示内容');
      generated = type === 'monitor'
        ? applyMonitorComprehensiveSummary(fallback, evidence, changeStatus)
        : fallback;
      lastDisplayCandidate = structuredClone(fallback);
    }
    const referencedEvidenceIds = reportReferencedEvidenceIds(generated);
    const finalEvidence = evidence.filter((item) => (
      item.type === 'coverage' || referencedEvidenceIds.has(item.id)
    ));
    const finalPreferenceContract = alignPreferenceContractWithReport(
      preferenceContract,
      generated,
      evidence,
    );
    if (!accepted) {
      let finalLocalError = null;
      try {
        validateGeneratedReport(generated, finalEvidence);
        validatePreferenceCoverage(generated, finalPreferenceContract, type, finalEvidence);
      } catch (error) {
        finalLocalError = error;
        const issues = normalizeReviewIssues(error);
        if (issues.length) reviewIssues = mergeReviewIssues(sourceReviewIssues, issues);
      }
      try {
        const displayVerifier = await runSemanticVerification(
          generated,
          this.config.reportRetryCount,
          'report_display_verification',
          finalPreferenceContract,
          finalEvidence,
        );
        verifierResult = displayVerifier;
        if (!finalLocalError) {
          accepted = true;
          reviewIssues = [...sourceReviewIssues];
        }
      } catch (error) {
        lastError = error;
        const issues = normalizeReviewIssues(error);
        if (issues.length) reviewIssues = mergeReviewIssues(sourceReviewIssues, issues);
      }
    }
    reviewRequired = sourceReviewIssues.length > 0 || !accepted;
    if (reviewRequired && !reviewIssues.length) {
      reviewIssues = [{
        location: 'report',
        reason: '报告未完成自动审校，请人工核对正文与引用来源',
      }];
    }
    const generatedAt = new Date().toISOString();
    const monitorOutcome = type === 'monitor' ? {
      status: ['medium', 'high'].includes(generated.risk_level)
        ? 'triggered'
        : newEventSignals.length > 0
          ? 'review'
          : marketSignals.length > 0 ? 'market_review' : 'no_new_signal',
      event_evidence_count: newEventSignals.length,
      market_signal_count: marketSignals.length,
      window: queries.window,
    } : null;
    const record = {
      id: reportId,
      stock_id: stockId,
      type,
      status: reviewRequired
        ? 'review_required'
        : generated.status === 'sufficient' ? 'completed' : 'insufficient',
      generated_at: generatedAt,
      data_as_of: maxAsOf(finalEvidence),
      evidence_fingerprint: fingerprint,
      change_status: changeStatus,
      provider_status: providerStatus,
      model_usage: {
        generation: modelResult?.usage || {},
        verification: verifierResult?.usage || lastVerifierUsage,
      },
        report: {
          stock,
          type,
          trigger,
          generated_at: generatedAt,
        data_as_of: maxAsOf(finalEvidence),
        change_status: changeStatus,
        analysis: generated,
        evidence: finalEvidence,
        preference_coverage: finalPreferenceContract,
        monitor_outcome: monitorOutcome,
        provider_status: providerStatus,
        quality_controls: {
          review_required: reviewRequired,
          review_issue_count: reviewRequired ? reviewIssues.length : 0,
          review_issues: reviewRequired ? reviewIssues : [],
          review_summary: reviewRequired ? reviewSummaries(reviewIssues) : [],
          pruned_unsupported_claims: prunedClaimCount,
          fallback_rewritten_fields: fallbackRewrittenFields,
          deterministic_core_sections: deterministicCoreTitles,
          semantic_query_planning: semanticQueryPlanningStatus,
          semantic_source_binding: semanticBindingStatus,
          semantic_source_binding_count: semanticBindingCount,
        },
      },
    };
    return this.repository.saveReport(record);
  }
}

export const reportServiceInternals = {
  reportQueries,
  dataEvidenceCalendarDate,
  focusSpecificDataQueries,
  focusSpecificWebQueries,
  preferenceSubtopics,
  expandedPreferences,
  semanticQueryPlanInput,
  semanticQuerySpecs,
  validateSemanticQueryPlan,
  semanticEvidenceBindingInput,
  validateSemanticEvidenceBindings,
  semanticMatchForPreference,
  safeSemanticMatches,
  preferenceContextIsSubstantive,
  semanticQuoteIsSafe,
  conciseSemanticQuote,
  semanticCandidateItems,
  attachSemanticBindings,
  dataProDirectlyMatchesPreference,
  buildPreferenceContract,
  preferenceContractUnits,
  alignPreferenceContractWithReport,
  modelPreferenceContract,
  preferenceTextMatches,
  evidenceDirectlyMatchesPreference,
  preferenceRefinementQueries,
  validatePreferenceCoverage,
  stripInternalCoverageClaims,
  localIsoDate,
  maxAsOf,
  monitorWindow,
  calendarDate,
  newestDataDate,
  buildInstructions,
  buildInput,
  verificationInput,
  verificationEvidenceContent,
  pruneInvalidSectionClaims,
  stabilizeInvalidReport,
  briefComprehensiveSummary,
  monitorComprehensiveSummary,
  carriedForwardBriefWebItems,
  carriedForwardMonitorWebItems,
  deterministicAuthoritativeReport,
  selectNoMaterialChangeSummary,
  deterministicCoreSections,
  deterministicContextSections,
  deterministicWebSection,
  briefWebSummary,
  monitorCompanySummary,
  monitorMarketSummary,
  monitorExternalSummary,
  readerSafeChangeSummary,
  readerSafeWebItem,
  isBriefSupplementalCompanySource,
  restrictMonitorReaderReport,
  sourceDetailText,
  mergeDeterministicCore,
  firstDataField,
  verificationInstructions,
  curateWebItems,
  monitorTopicTerms,
  monitorTitleTerms,
  monitorEventTerms,
  publishedWithinWindow,
  monitorCoverageEvidence,
  monitorNoAlertCandidate,
  hasVerifiedMonitorBinding,
  sourceReferencesStock,
  isMonitorCompanyEventEvidence,
  isMonitorMarketContextSource,
  monitorEvidenceRole,
  refinementQueries,
  sourceIdentityKeys,
  sourcesRepeatSemanticClaim,
  sourceLanguageMatches,
  isSubstantiveBusinessSource,
  correctionInstructions,
};
