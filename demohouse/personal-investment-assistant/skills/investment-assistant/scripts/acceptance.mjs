import {
  assertInstalledApp,
  requestLocalApi,
  serverAddress,
} from './lib.mjs';
import {
  assertPreferenceCoverage,
  assertReportSourcePolicy,
  canonicalSecurityCode,
  preferenceKey,
} from './acceptance-validators.mjs';

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} 缺少参数值。`);
  return value;
}

function normalizedPublisher(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/(?:官方网站|官方站点|官网|网站|客户端|网)$/u, '');
}

function reportParagraphs(analysis) {
  return [
    analysis?.summary,
    ...(analysis?.sections || []).flatMap((section) => section.claims.map((claim) => claim.text)),
  ].map((value) => String(value || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function assertReportEvidence(item, expectedType, stock, expectedPreferences) {
  if (!item?.id || item.type !== expectedType) throw new Error(`${expectedType} 报告结构无效。`);
  const reviewRequired = item.status === 'review_required'
    && item.report?.quality_controls?.review_required === true;
  if ((!reviewRequired && item.status !== 'completed')
    || item.report?.analysis?.status !== 'sufficient') {
    throw new Error(`${expectedType} 报告未达到可交付状态。`);
  }
  const semanticReviewIssues = (item.report?.quality_controls?.review_issues || [])
    .filter((issue) => !/^(?:DataPro|联网搜索)$/u.test(String(issue?.location || '').trim()));
  if (semanticReviewIssues.length) {
    throw new Error(
      `${expectedType} 报告仍有正文与来源语义问题：${semanticReviewIssues
        .map((issue) => `${issue.location || '正文'}：${issue.reason || '需要人工核对'}`)
        .join('；')}`,
    );
  }
  const evidence = item.report?.evidence || [];
  const ids = new Set(evidence.map((entry) => entry.id));
  assertReportSourcePolicy(item, expectedType);
  const analysis = item.report?.analysis;
  const referenced = [
    ...(analysis?.summary_evidence_ids || []),
    ...(analysis?.change_evidence_ids || []),
    ...(analysis?.sections || []).flatMap((section) => section.claims.flatMap((claim) => claim.evidence_ids)),
    ...(analysis?.conclusion?.evidence_ids || []),
  ];
  if (!referenced.length || referenced.some((id) => !ids.has(id))) {
    throw new Error(`${expectedType} 正文存在缺失或无效的证据引用。`);
  }
  const referencedIds = new Set(referenced);
  const unreferenced = evidence
    .filter((entry) => entry.type !== 'coverage' && !referencedIds.has(entry.id))
    .map((entry) => entry.id);
  if (unreferenced.length) {
    throw new Error(`${expectedType} 有来源展示在引用区但未被正文使用：${unreferenced.join('、')}`);
  }
  for (const source of evidence.filter((entry) => entry.type === 'datapro')) {
    if (!source.security_code
      || canonicalSecurityCode(source.security_code) !== canonicalSecurityCode(stock.code)) {
      throw new Error(`${expectedType} DataPro 来源 ${source.id} 无法确认属于 ${stock.code}。`);
    }
  }
  for (const source of evidence.filter((entry) => entry.type === 'web_search')) {
    if (!source.title || !source.publisher || !source.url || String(source.content || '').trim().length < 20) {
      throw new Error(`${expectedType} 联网来源 ${source.id} 缺少真实标题、发布方、链接或检索摘要。`);
    }
    let sourcePath = '';
    try {
      sourcePath = new URL(source.url).pathname;
    } catch {
      throw new Error(`${expectedType} 联网来源 ${source.id} 的链接无效。`);
    }
    if (sourcePath === '/'
      || source.title === source.publisher
      || /(?:行情走势|股票行情|个股行情|官方网站首页|^首页$|^国家市场监督管理总局$|^装备工业一司$|政声传递_新闻动态)/i.test(source.title)) {
      throw new Error(`${expectedType} 联网来源 ${source.id} 是首页、行情页或栏目页，不是可核验的具体内容：${source.title}`);
    }
    const attributed = (String(source.content || '')
      .split(/\r?\n/)
      .slice(0, 6)
      .join('\n')
      .match(/(?:来源|文章来源|稿源)[：:]\s*([^\n\r|｜]{1,40})/u)?.[1] || '')
      .replace(/\s+(?:作者|记者|编辑|责任编辑|发布时间)[：:]?.*$/u, '')
      .replace(/\s+\d{4}(?:[-/.年]\d{1,2})?.*$/u, '')
      .replace(/[|｜].*$/u, '')
      .trim();
    if (attributed && normalizedPublisher(attributed) !== normalizedPublisher(source.publisher)) {
      throw new Error(`${expectedType} 联网来源 ${source.id} 的发布方与正文署名不一致。`);
    }
  }
  const paragraphs = reportParagraphs(analysis);
  if (paragraphs.some((text) => text.length < 12)) {
    throw new Error(`${expectedType} 正文包含没有实质信息的过短段落。`);
  }
  const normalizedParagraphs = paragraphs.map((text) => text.replace(/[，。；：！？、\s]/g, ''));
  if (new Set(normalizedParagraphs).size !== normalizedParagraphs.length) {
    throw new Error(`${expectedType} 正文存在逐字重复段落。`);
  }
  if (/公开信息部分纳入|用于补充核对|达到权威性|交叉核验门槛|查询次数|命中条数|Provider|trace|证据边界|资料覆盖|出现新进展。该事项与公司近期经营重点|未提供.{0,24}(?:股价|行情|成交)|无法对.{0,24}(?:市场表现|行情).{0,12}(?:陈述|判断)|没有形成可展示的事实段落|本轮检查区间为.{0,80}后续仍需围绕|下一步以正式公告、经营数据和新增事件作为更新依据|今天|今日|昨天|昨日|\btoday\b|\byesterday\b/i.test(paragraphs.join('\n'))) {
    throw new Error(`${expectedType} 正文包含检索过程、审校话术或空泛模板。`);
  }
  if (expectedType === 'monitor') {
    const substantiveSections = (analysis?.sections || []).filter((section) => (
      ['市场异动', '公司事件', '外部风险'].includes(section.title)
        && section.claims.some((claim) => (
          claim.evidence_ids.some((id) => !String(id).startsWith('C'))
        ))
    ));
    if (!substantiveSections.length) {
      throw new Error('monitor 报告没有形成市场异动、公司事件或外部风险的实质正文。');
    }
  }
  const preferenceCoverage = item.report?.preference_coverage || [];
  for (const preference of expectedPreferences) {
    const coverage = preferenceCoverage.find((entry) => (
      preferenceKey(entry.preference) === preferenceKey(preference)
    ));
    try {
      assertPreferenceCoverage(coverage, preference, ids);
    } catch (error) {
      throw new Error(`${expectedType} ${error.message}`);
    }
  }
  if (!item.model_usage?.verification || !Object.keys(item.model_usage.verification).length) {
    throw new Error(`${expectedType} 缺少独立语义审校记录。`);
  }
}

async function generateReport(stockId, type) {
  const response = await requestLocalApi('/api/reports/generate', {
    method: 'POST',
    body: { stock_id: stockId, type },
    allowFailure: true,
  });
  if (response.ok) return response.body;
  const code = response.body?.error?.code || `HTTP_${response.status}`;
  const message = response.body?.error?.message || `HTTP ${response.status}`;
  const details = response.body?.error?.details;
  throw new Error(`本地 API 请求失败（${code}）：${message}${details ? `；详情：${JSON.stringify(details)}` : ''}`);
}

function webUrls(report) {
  return new Set((report?.report?.evidence || [])
    .filter((item) => item.type === 'web_search' && item.url)
    .map((item) => item.url));
}

function assertBriefHasFinancialData(brief, stock) {
  const briefDataText = JSON.stringify(brief.report.evidence
    .filter((entry) => entry.type === 'datapro')
    .flatMap((entry) => entry.rows || []));
  if (!/(?:营业收入|营业总收入|净利润|毛利率|研发费用|利息净收入|手续费及佣金净收入|保险服务收入|总资产|净资产|每股收益|现金流)/.test(briefDataText)) {
    throw new Error(`${stock.code} 的个股简评未保留可核验的核心财务 DataPro 证据。`);
  }
}

function assertReportTypesAreIndependent(brief, monitor, stock) {
  if (brief.id === monitor.id || brief.evidence_fingerprint === monitor.evidence_fingerprint) {
    throw new Error(`${stock.code} 的个股简评与盘后风险摘要没有形成相互独立的结果和证据快照。`);
  }
  const briefUrls = webUrls(brief);
  const overlappingUrls = [...webUrls(monitor)].filter((url) => briefUrls.has(url));
  if (overlappingUrls.length) {
    throw new Error(`${stock.code} 的个股简评与盘后风险摘要重复使用联网来源：${overlappingUrls.join('、')}`);
  }
}

assertInstalledApp();
const address = serverAddress();
let frontend;
try { frontend = await fetch(address.url); } catch (error) {
  throw new Error(`网站未启动：${error.message}`);
}
const html = await frontend.text();
if (!frontend.ok || !/<div\s+id=["']root["']/.test(html)) throw new Error('已安装前端未能正常返回。');

const readiness = await requestLocalApi('/api/health/ready', { allowFailure: true });
if (!readiness.ok) {
  const failures = Object.entries(readiness.body?.live_check?.providers || {})
    .filter(([, value]) => !value?.ok)
    .map(([provider, value]) => `${provider}:${value?.code || 'NOT_READY'}`);
  throw new Error(`真实后端未就绪${failures.length ? `（${failures.join(', ')}）` : ''}。请先运行 doctor.mjs --live。`);
}

const stocks = (await requestLocalApi('/api/stocks')).body.items || [];
if (!stocks.length) throw new Error('关注列表为空，请先导入用户 Profile。');
const selector = readOption('--stock');
const selectedStocks = selector
  ? stocks.filter((item) => item.id === selector || item.code.toUpperCase() === selector.toUpperCase())
  : process.argv.includes('--all') ? stocks : [stocks[0]];
if (!selectedStocks.length) throw new Error(`未找到验收标的：${selector}`);

async function acceptStock(stock, generate, seed) {
  const encodedId = encodeURIComponent(stock.id);
  const before = {
    brief: (await requestLocalApi(`/api/reports/history?stock_id=${encodedId}&type=brief&limit=50`)).body.items,
    monitor: (await requestLocalApi(`/api/reports/history?stock_id=${encodedId}&type=monitor&limit=50`)).body.items,
    settings: (await requestLocalApi(`/api/monitor/settings/${encodedId}`)).body,
    runs: (await requestLocalApi(`/api/monitor/runs/${encodedId}?limit=50`)).body.items,
  };
  const item = {
    stock: { name: stock.name, code: stock.code, exchange: stock.exchange },
    history: { brief: before.brief.length, monitor: before.monitor.length, runs: before.runs.length },
    monitor_enabled: before.settings.enabled,
    monitor_preferences: stock.focus,
    next_run: before.settings.next_run,
    generated: false,
  };
  if (!generate) return item;

  if (seed) {
    const brief = await generateReport(stock.id, 'brief');
    const monitor = await generateReport(stock.id, 'monitor');
    try {
      assertReportEvidence(brief, 'brief', stock, stock.focus);
      assertReportEvidence(monitor, 'monitor', stock, stock.focus);
      assertReportTypesAreIndependent(brief, monitor, stock);
      assertBriefHasFinancialData(brief, stock);
    } catch (error) {
      throw new Error(`${stock.name}（${stock.code}）：${error.message}`);
    }
    const after = {
      brief: (await requestLocalApi(`/api/reports/history?stock_id=${encodedId}&type=brief&limit=50`)).body.items,
      monitor: (await requestLocalApi(`/api/reports/history?stock_id=${encodedId}&type=monitor&limit=50`)).body.items,
    };
    if (!after.brief.some((entry) => entry.id === brief.id)
      || !after.monitor.some((entry) => entry.id === monitor.id)) {
      throw new Error(`${stock.code} 首批报告生成成功，但两类历史记录没有分别保存。`);
    }
    return {
      ...item,
      generated: true,
      report_ids: { brief: brief.id, monitor: monitor.id },
      evidence: {
        brief: brief.report.evidence.length,
        monitor: monitor.report.evidence.length,
      },
      history_after: { brief: after.brief.length, monitor: after.monitor.length },
    };
  }

  const firstBrief = await generateReport(stock.id, 'brief');
  const brief = await generateReport(stock.id, 'brief');
  const monitor = await generateReport(stock.id, 'monitor');
  try {
    assertReportEvidence(firstBrief, 'brief', stock, stock.focus);
    assertReportEvidence(brief, 'brief', stock, stock.focus);
    assertReportEvidence(monitor, 'monitor', stock, stock.focus);
  } catch (error) {
    throw new Error(`${stock.name}（${stock.code}）：${error.message}`);
  }
  if (firstBrief.id === brief.id || firstBrief.id === monitor.id) {
    throw new Error(`${stock.code} 的个股简评与盘后风险摘要没有形成相互独立的结果和证据快照。`);
  }
  assertReportTypesAreIndependent(brief, monitor, stock);
  if (firstBrief.report.analysis.summary.trim() === brief.report.analysis.summary.trim()) {
    throw new Error(`${stock.code} 连续两次个股简评的摘要逐字相同。`);
  }
  const expectedBriefChange = firstBrief.evidence_fingerprint === brief.evidence_fingerprint
    ? 'no_material_change'
    : 'new_evidence';
  if (brief.change_status !== expectedBriefChange) {
    throw new Error(`${stock.code} 第二次个股简评变化状态错误：证据关系要求 ${expectedBriefChange}，实际为 ${brief.change_status}。`);
  }
  assertBriefHasFinancialData(brief, stock);
  const after = {
    brief: (await requestLocalApi(`/api/reports/history?stock_id=${encodedId}&type=brief&limit=50`)).body.items,
    monitor: (await requestLocalApi(`/api/reports/history?stock_id=${encodedId}&type=monitor&limit=50`)).body.items,
  };
  if (!after.brief.some((entry) => entry.id === firstBrief.id)
    || !after.brief.some((entry) => entry.id === brief.id)
    || !after.monitor.some((entry) => entry.id === monitor.id)) {
    throw new Error(`${stock.code} 报告生成成功，但两类历史记录没有分别保存。`);
  }
  return {
    ...item,
    generated: true,
    report_ids: { brief_previous: firstBrief.id, brief: brief.id, monitor: monitor.id },
    evidence: {
      brief_previous: firstBrief.report.evidence.length,
      brief: brief.report.evidence.length,
      monitor: monitor.report.evidence.length,
    },
    history_after: { brief: after.brief.length, monitor: after.monitor.length },
  };
}

const checkedStocks = [];
const seedMode = process.argv.includes('--seed');
const generateRequested = seedMode || process.argv.includes('--generate');
for (const stock of selectedStocks) {
  checkedStocks.push(await acceptStock(stock, generateRequested, seedMode));
}

const usage = (await requestLocalApi('/api/usage-summary')).body;
const result = {
  ok: true,
  url: address.url,
  ready: true,
  scope: process.argv.includes('--all') ? 'all_stocks' : 'single_stock',
  mode: seedMode ? 'seed' : generateRequested ? 'full' : 'read_only',
  generated: generateRequested,
  stocks: checkedStocks,
  local_usage: usage.totals,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
