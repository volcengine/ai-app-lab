const monitorSectionTitles = new Set([
  '市场异动',
  '公司事件',
  '外部风险',
  '后续观察',
]);

const unsafeReaderText = /DataPro字段|联网搜索返回|公开信息部分纳入|用于补充核对|达到权威性|交叉核验门槛|本条只证明|逐项列示|证据边界|资料覆盖|产业资源优势|投资逻辑|推荐逻辑|估值修复|绑定下游|当前风险观察以.{0,40}为主|当前简评围绕.{0,60}展开|尚未形成需要升级的确定性风险结论|构成当前个股观察的主要基础|近期公司动态出现新进展|后续应结合公司正式披露持续跟踪/;
const auditAbsencePattern = /(?:本轮|本次|当前|截至本次|截至当前|检查窗口(?:内)?|近(?:7|七)日|近期|尚|暂).{0,60}(?:未(?:发现|查到|检索到|形成|出现|触发|检出)|没有).{0,56}(?:新增|风险|信号|公告|事件|事项|信息|结论|证据|变化|提示)/;
const legacyBriefFiller = /^当前主要观察维持不变，正文列示本次可以确认的具体信息。?$/;

function stripAuditAbsence(text) {
  const chunks = String(text || '').match(/[^。！？!?；;]+[。！？!?；;]?/g) || [];
  return chunks
    .filter((chunk) => !auditAbsencePattern.test(chunk.replace(/\s+/g, ' ').trim()))
    .join('')
    .replace(/[；;]\s*$/, '。')
    .trim();
}

export function isCurrentMonitorAnalysis(analysis) {
  const sections = Array.isArray(analysis?.sections) ? analysis.sections : [];
  const titles = new Set(sections.map((section) => section?.title).filter(Boolean));
  return titles.size > 0
    && [...titles].every((title) => monitorSectionTitles.has(title))
    && sections.some((section) => (
      (section?.claims || []).some((claim) => String(claim?.text || '').trim())
    ));
}

export function reportHistoryItems(result) {
  return Array.isArray(result?.items) ? result.items : [];
}

function fallbackSourceExcerpt(source, stockName) {
  const lines = String(source?.content || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const contentLines = lines.filter((line, index) => {
    if (index === 0 && line === source?.title) return false;
    if (index <= 1 && /20\d{2}[-/.年]\d{1,2}/.test(line)) return false;
    return !/^(?:SZ|SH|HK|US|\d{6})$/.test(line);
  });
  const relevantLine = stockName
    ? contentLines.find((line) => line.includes(stockName) && line.length >= 35)
    : null;
  let body = relevantLine || contentLines.join(' ');
  const stockIndex = stockName ? body.indexOf(stockName) : -1;
  if (stockIndex > 80) {
    const sentenceStart = body.lastIndexOf('。', stockIndex);
    body = `${sentenceStart >= 0 ? '...' : ''}${body.slice(sentenceStart >= 0 ? sentenceStart + 1 : stockIndex)}`;
  }
  return body.length > 150 ? `${body.slice(0, 150).trimEnd()}...` : body;
}

export function sourceExcerpts(source, stockName) {
  const excerpts = [];
  const append = (text) => {
    const value = String(text || '').trim();
    const comparable = value.replace(/\s+/g, '').replace(/[：:“”"']/g, '');
    if (!value || excerpts.some((item) => {
      const existing = item.replace(/\s+/g, '').replace(/[：:“”"']/g, '');
      return existing.includes(comparable) || comparable.includes(existing);
    })) return;
    excerpts.push(value);
  };
  const citedExcerpt = String(source?.cited_excerpt || '').trim();
  append(citedExcerpt);
  for (const match of source?.semantic_matches || []) {
    const quote = String(match?.quote || '').trim();
    if (!quote) continue;
    const comparableQuote = quote.replace(/\s+/g, '').replace(/[：:“”"']/g, '');
    if (excerpts.some((item) => (
      item.replace(/\s+/g, '').replace(/[：:“”"']/g, '').includes(comparableQuote)
    ))) continue;
    const preference = String(match?.preference || '').trim();
    append(preference ? `围绕“${preference}”：${quote}` : quote);
  }
  if (excerpts.length) return excerpts;
  const fallback = fallbackSourceExcerpt(source, stockName);
  return fallback ? [fallback] : [];
}

export function sourceExcerpt(source, stockName) {
  const citedExcerpt = String(source?.cited_excerpt || '').trim();
  if (citedExcerpt) return citedExcerpt;
  const semanticQuote = (source?.semantic_matches || [])
    .map((match) => String(match?.quote || '').trim())
    .find(Boolean);
  return semanticQuote || fallbackSourceExcerpt(source, stockName);
}

export function readerVisibleAnalysis(analysis, evidence, type) {
  if (!analysis) return analysis;
  if (type === 'brief') {
    if (!legacyBriefFiller.test(String(analysis.summary || '').trim())) return analysis;
    return {
      ...analysis,
      summary: '',
      summary_evidence_ids: [],
    };
  }
  if (type !== 'monitor') return analysis;
  const coverageIds = new Set(
    (evidence || []).filter((item) => item.type === 'coverage').map((item) => item.id),
  );
  const sections = (analysis.sections || []).map((section) => {
    const originalClaims = section.claims || [];
    return {
      ...section,
      claims: originalClaims.map((claim) => ({
        ...claim,
        text: stripAuditAbsence(claim.text),
      })).filter((claim) => {
        if (!claim.text) return false;
        const ids = claim.evidence_ids || [];
        return !ids.length || !ids.every((id) => coverageIds.has(id));
      }),
      preserveEmpty: originalClaims.length === 0,
    };
  }).filter((section) => section.claims.length || section.preserveEmpty)
    .map(({ preserveEmpty: _preserveEmpty, ...section }) => section);
  const concreteClaims = sections.flatMap((section) => section.claims || []);
  const summary = stripAuditAbsence(analysis.summary)
    || stripAuditAbsence(concreteClaims[0]?.text);
  const conclusionText = stripAuditAbsence(analysis.conclusion?.text);
  const fallbackConclusion = concreteClaims.at(-1);
  return {
    ...analysis,
    summary,
    sections,
    conclusion: conclusionText
      ? { ...analysis.conclusion, text: conclusionText }
      : fallbackConclusion
        ? { text: fallbackConclusion.text, evidence_ids: fallbackConclusion.evidence_ids }
        : analysis.conclusion,
    limitations: (analysis.limitations || []).filter((item) => stripAuditAbsence(item)),
  };
}

export function isReaderSafeRecord(record, type) {
  const analysis = readerVisibleAnalysis(
    record?.report?.analysis,
    record?.report?.evidence,
    type,
  );
  const hasSubstantiveText = (analysis?.sections || []).some((section) => (
    (section.claims || []).some((claim) => String(claim?.text || '').trim())
  ));
  if (!analysis || !hasSubstantiveText || unsafeReaderText.test(JSON.stringify(analysis))) return false;
  return type !== 'monitor' || isCurrentMonitorAnalysis(analysis);
}

export function isDisplayableRecord(record, type) {
  if (!record?.report?.quality_controls?.review_required) return isReaderSafeRecord(record, type);
  const analysis = type === 'monitor'
    ? readerVisibleAnalysis(record.report.analysis, record.report.evidence, type)
    : record.report.analysis;
  return (analysis?.sections || []).some((section) => (
    (section.claims || []).some((claim) => String(claim?.text || '').trim())
  ));
}

export function visibleMonitorRuns(runs) {
  const items = Array.isArray(runs) ? runs : [];
  if (!items.length) return [];
  if (['failed', 'running', 'review_required'].includes(items[0].status)) return items.slice(0, 4);
  return items.filter((run) => ['completed', 'review_required'].includes(run.status)).slice(0, 4);
}
