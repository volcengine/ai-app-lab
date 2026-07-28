import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft,
  ExternalLink,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { api } from './api.js';
import {
  isCurrentMonitorAnalysis,
  readerVisibleAnalysis,
  reportHistoryItems,
  sourceExcerpt,
  sourceExcerpts,
  visibleMonitorRuns,
} from './report-display.js';
import './styles.css';

const dayOptions = [
  ['Mon', '周一'], ['Tue', '周二'], ['Wed', '周三'], ['Thu', '周四'],
  ['Fri', '周五'], ['Sat', '周六'], ['Sun', '周日'],
];

const timezoneOptions = [
  ['Asia/Shanghai', '北京时间'],
  ['Asia/Hong_Kong', '香港时间'],
  ['America/New_York', '美东时间'],
];

const monitorRunLabels = {
  running: '执行中',
  completed: '已完成',
  review_required: '已生成待审核',
  failed: '执行失败',
};

function formatDate(value, includeTime = true) {
  if (!value) return '未知';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', includeTime
    ? { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function Navbar({ onHome, isDetail }) {
  return (
    <nav className="navbar">
      <button className="navbar-logo" onClick={onHome} type="button">
        <div className="navbar-logo-icon">投</div>
        <span>我的投资助手</span>
      </button>
      <div className="navbar-right">
        {isDetail ? (
          <button className="nav-back-btn" onClick={onHome} type="button">
            <ArrowLeft size={16} /> 返回首页
          </button>
        ) : <span className="navbar-date">{formatDate(new Date(), false)}</span>}
      </div>
    </nav>
  );
}

function EmptyState({ onAdd }) {
  return (
    <div className="home-empty">
      <div className="home-empty-icon">投</div>
      <h3>建立你的关注列表</h3>
      <button className="btn-primary compact-command" onClick={onAdd} type="button">
        <Plus size={17} /> 添加标的
      </button>
    </div>
  );
}

function StockCard({ stock, onOpen, onEdit, onDelete }) {
  return (
    <article className="stock-card">
      <div className="card-header">
        <span className="card-name">{stock.name}</span>
        <span className="card-code">{stock.code}</span>
      </div>
      <div className="focus-tags" aria-label="关注方向">
        {stock.focus.map((item) => <span className="focus-chip" key={item}>{item}</span>)}
      </div>
      <div className="card-actions">
        <button className="btn-primary" onClick={() => onOpen(stock, 'brief')} type="button">个股简评</button>
        <button className="btn-secondary" onClick={() => onOpen(stock, 'monitor')} type="button">盘后风险摘要</button>
        <button className="icon-button" onClick={() => onEdit(stock)} title="编辑标的" type="button">
          <Pencil size={16} />
        </button>
        <button className="icon-button danger-icon" onClick={() => onDelete(stock)} title="移除关注" type="button">
          <Trash2 size={17} />
        </button>
      </div>
    </article>
  );
}

function StockDialog({ stock, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: stock?.name || '',
    code: stock?.code || '',
    exchange: stock?.exchange || 'CN',
    focus: stock?.focus?.join('、') || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const input = {
        name: form.name,
        code: form.code,
        exchange: form.exchange,
        focus: form.focus.split(/[，,、]/).map((item) => item.trim()).filter(Boolean),
      };
      const saved = stock ? await api.updateStock(stock.id, input) : await api.createStock(input);
      onSaved(saved);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="modal-panel" onSubmit={submit}>
        <div className="modal-header">
          <div>
            <h3>{stock ? '编辑关注标的' : '添加关注标的'}</h3>
          </div>
          <button className="icon-button" onClick={onClose} title="关闭" type="button"><X size={18} /></button>
        </div>
        <label className="form-field">
          <span>证券名称</span>
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required maxLength={80} />
        </label>
        <div className="form-grid">
          <label className="form-field">
            <span>证券代码</span>
            <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} required maxLength={20} />
          </label>
          <label className="form-field">
            <span>市场</span>
            <select value={form.exchange} onChange={(event) => setForm({ ...form, exchange: event.target.value })}>
              <option value="CN">A 股</option>
              <option value="HK">港股</option>
              <option value="US">美股</option>
            </select>
          </label>
        </div>
        <label className="form-field">
          <span>关注方向</span>
          <input value={form.focus} onChange={(event) => setForm({ ...form, focus: event.target.value })} placeholder="例如：收入、毛利率、海外业务" required />
        </label>
        {error && <div className="inline-error">{error}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} type="button">取消</button>
          <button className="btn-primary compact-command" disabled={saving} type="submit">
            {saving ? <RefreshCw className="spin" size={17} /> : stock ? <Save size={17} /> : <Plus size={17} />}
            {stock ? '保存' : '添加'}
          </button>
        </div>
      </form>
    </div>
  );
}

function HomePage({ stocks, loading, error, onOpen, onAdd, onEdit, onDelete }) {
  return (
    <main className="page">
      <div className="section-head">
        <h2>我的关注</h2>
        <button className="btn-add-stock" onClick={onAdd} type="button"><Plus size={17} /> 添加标的</button>
      </div>
      <ErrorPanel error={error} />
      {loading ? <div className="detail-loading"><RefreshCw className="spin" size={18} /> 正在载入</div> : null}
      {!loading && stocks.length === 0 ? <EmptyState onAdd={onAdd} /> : null}
      <div className="stock-grid">
        {stocks.map((stock) => (
          <StockCard key={stock.id} stock={stock} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    </main>
  );
}

function CitationLinks({ ids, evidence }) {
  const byId = new Map(evidence.map((item, index) => [item.id, { source: item, number: index + 1 }]));
  return (
    <span className="claim-citations">
      {ids.map((id) => {
        const entry = byId.get(id);
        const source = entry?.source;
        if (!entry) return null;
        return source?.url ? (
          <a className="cite-link" href={source.url} target="_blank" rel="noreferrer" title={sourceDisplayTitle(source)} key={id}>[{entry.number}]</a>
        ) : <span className="cite-ref" title={sourceDisplayTitle(source)} key={id}>[{entry.number}]</span>;
      })}
    </span>
  );
}

function evidenceField(evidence, pattern) {
  for (const source of evidence.filter((item) => item.type === 'datapro')) {
    for (const row of source.rows || []) {
      const match = Object.entries(row).find(([key]) => pattern.test(key));
      if (match) return { source, value: match[1] };
    }
  }
  return null;
}

function displayValue(value) {
  if (Array.isArray(value)) return value.map(displayValue).filter(Boolean).join('、');
  if (value && typeof value === 'object') return Object.values(value).map(displayValue).filter(Boolean).join('、');
  return String(value ?? '').trim();
}

function evidenceIds(matches) {
  return [...new Set(matches.filter(Boolean).map((match) => match.source.id))];
}

function legacyBriefAnalysis(analysis, evidence, stock, changeStatus) {
  const quote = {
    date: evidenceField(evidence, /^交易日期$/),
    time: evidenceField(evidence, /^交易时间$/),
    latest: evidenceField(evidence, /^(?:最新价|收盘价)$/),
    previous: evidenceField(evidence, /^前收盘价$/),
    high: evidenceField(evidence, /^(?:最高价|当日最高)$/),
    low: evidenceField(evidence, /^(?:最低价|当日最低)$/),
    change: evidenceField(evidence, /^(?:涨跌幅|涨幅)$/),
  };
  const financial = {
    revenue: evidenceField(evidence, /^(?:(?:一般企业|商业银行|保险公司|证券公司)\/利润表(?:\/|\(单季度\)\/单季度\.)?)?营业(?:总)?收入$/),
    profit: evidenceField(evidence, /^(?:一般企业|商业银行|保险公司|证券公司)\/利润表(?:\/|\(单季度\)\/单季度\.)归属于母公司所有者的净利润$/),
    margin: evidenceField(evidence, /销售毛利率$/),
    research: evidenceField(evidence, /^(?:一般企业|商业银行|保险公司|证券公司)\/利润表(?:\/|\(单季度\)\/单季度\.)研发费用$/),
  };
  const sections = [];
  const quoteMatches = Object.values(quote).filter(Boolean);
  if (quoteMatches.length) {
    const when = [quote.date && displayValue(quote.date.value), quote.time && displayValue(quote.time.value)]
      .filter(Boolean).join(' ');
    const changeValue = quote.change && displayValue(quote.change.value);
    const lead = quote.latest
      ? `${when ? `截至${when}，` : ''}${stock.name}最新价为${displayValue(quote.latest.value)}${changeValue?.includes('%') ? `，涨跌幅为${changeValue}` : ''}。`
      : `${when ? `最新专业行情记录对应${when}` : '本次已取得最新可用的专业行情记录'}。`;
    const ranges = [
      quote.previous ? `前收盘价为${displayValue(quote.previous.value)}` : '',
      quote.high ? `当日最高价为${displayValue(quote.high.value)}` : '',
      quote.low ? `最低价为${displayValue(quote.low.value)}` : '',
    ].filter(Boolean);
    sections.push({
      title: '市场表现',
      claims: [{
        text: `${lead}${ranges.length ? `同一份行情记录还显示，${ranges.join('，')}。` : ''}`,
        evidence_ids: evidenceIds(quoteMatches),
      }],
    });
  }
  const financialMatches = Object.values(financial).filter(Boolean);
  if (financialMatches.length) {
    const period = financialMatches.find((item) => item.source.as_of_date)?.source.as_of_date;
    const metrics = [
      financial.revenue ? `营业收入为${displayValue(financial.revenue.value)}` : '',
      financial.profit ? `归属于母公司所有者的净利润为${displayValue(financial.profit.value)}` : '',
      financial.margin ? `销售毛利率为${displayValue(financial.margin.value)}` : '',
      financial.research ? `研发费用为${displayValue(financial.research.value)}` : '',
    ].filter(Boolean);
    sections.push({
      title: '经营与财务',
      claims: [{
        text: `${period ? `最新可核验的已披露指标对应${period}，` : ''}${metrics.join('，')}。这些指标按已披露口径原样列示，不据此延伸为整体判断。`,
        evidence_ids: evidenceIds(financialMatches),
      }],
    });
  }
  const webEvidence = evidence.filter((item) => item.type === 'web_search');
  if (webEvidence.length) {
    const claims = webEvidence.map((source) => ({
      text: sourceExcerpt(source, stock.name) || source.title,
      evidence_ids: [source.id],
    })).filter((claim) => claim.text);
    sections.push({
      title: '关注方向',
      claims,
    });
  }
  const allEvidenceIds = evidence.filter((item) => item.type !== 'coverage').map((item) => item.id);
  if (allEvidenceIds.length) {
    sections.push({
      title: '后续观察',
      claims: [{
        text: `后续重点观察${stock.focus.join('、')}是否出现新的正式数据、公司公告或行业变化。`,
        evidence_ids: allEvidenceIds.slice(0, 8),
      }],
    });
  }
  return {
    ...analysis,
    summary: '当前观察重点集中在最新市场变化、已披露经营指标和用户设定的关注方向。',
    summary_evidence_ids: evidence.filter((item) => item.type === 'datapro').map((item) => item.id),
    change_summary: changeStatus === 'no_material_change'
      ? '与上次相比，本次重新核验后没有发现新的实质性证据。'
      : analysis.change_summary,
    sections: sections.length ? sections : analysis.sections,
    conclusion: {
      text: `下一步重点观察${stock.focus.join('、')}是否出现新的可验证变化。`,
      evidence_ids: evidence.filter((item) => item.type === 'datapro').map((item) => item.id),
    },
    limitations: [],
  };
}

function monitorArticleAnalysis(analysis, evidence, outcome, changeStatus) {
  const coverage = evidence.find((item) => item.type === 'coverage');
  const isCurrentReport = Object.hasOwn(outcome || {}, 'market_signal_count');
  if (!coverage || outcome?.status !== 'no_new_signal' || isCurrentReport) return analysis;
  const row = coverage.rows?.[0] || {};
  const items = displayValue(row['关注方向'] || row['监控内容']);
  const marketSources = evidence.filter((item) => item.type === 'datapro');
  const marketSections = marketSources.length ? legacyBriefAnalysis({
    change_summary: '',
    sections: [],
  }, marketSources, { name: '该标的', focus: [] }, changeStatus).sections
    .filter((section) => section.title === '市场表现')
    .map((section) => ({ ...section, title: '市场异动' })) : [];
  return {
    ...analysis,
    summary: '本轮未发现需要升级的新增风险信号，当前维持原有风险观察级别。',
    summary_evidence_ids: marketSources.length ? [coverage.id, ...marketSources.map((item) => item.id)] : [coverage.id],
    change_summary: changeStatus === 'initial'
      ? '这是首次盘后检查，暂无可比较的历史结果。'
      : '与上次盘后检查相比，本轮没有形成新的实质性事件证据。',
    change_evidence_ids: [],
    sections: [...marketSections, {
      title: '公司事件',
      claims: [{
        text: '本轮没有出现需要升级提示的公司公告、监管或经营事件，既有风险状态维持不变。',
        evidence_ids: [coverage.id],
      }],
    }, {
      title: '外部风险',
      claims: [{
        text: '近期行业与政策信息未形成需要升级提示的新增外部风险。',
        evidence_ids: [coverage.id],
      }],
    }, {
      title: '后续观察',
      claims: [{
        text: items
          ? `下一轮重点核对${items}相关的正式公告、监管披露与可量化变化。`
          : '下一轮重点核对公司公告、监管披露和行业政策是否出现新的可量化变化。',
        evidence_ids: [coverage.id],
      }],
    }],
    conclusion: {
      text: '当前维持原有风险观察级别，本轮无新增信号不代表公司不存在其他风险。',
      evidence_ids: [coverage.id],
    },
    limitations: [],
  };
}

function displayAnalysis(record, type, stock) {
  const report = record?.report;
  const analysis = report?.analysis;
  const evidence = report?.evidence || [];
  if (!analysis) return null;
  const technicalNarration = /DataPro字段|联网搜索返回|公开信息部分纳入|用于补充核对|达到权威性|交叉核验门槛|本条只证明|逐项列示|证据边界|资料覆盖/;
  if (type === 'monitor') {
    if (isCurrentMonitorAnalysis(analysis) && !technicalNarration.test(JSON.stringify(analysis))) {
      return readerVisibleAnalysis(analysis, evidence, type);
    }
    return readerVisibleAnalysis(
      monitorArticleAnalysis(analysis, evidence, report.monitor_outcome, record.change_status),
      evidence,
      type,
    );
  }
  const technicalText = JSON.stringify(analysis);
  const visible = technicalNarration.test(technicalText)
    ? legacyBriefAnalysis(analysis, evidence, stock, record.change_status)
    : analysis;
  return readerVisibleAnalysis(visible, evidence, type);
}

function citedEvidence(record, type, stock) {
  const analysis = displayAnalysis(record, type, stock);
  const evidence = record?.report?.evidence || [];
  if (!analysis) return [];
  const citedExcerpts = new Map();
  for (const section of analysis.sections || []) {
    for (const claim of section.claims || []) {
      const excerpt = String(claim.text || '').trim();
      if (!excerpt) continue;
      for (const id of claim.evidence_ids || []) {
        if (!citedExcerpts.has(id)) citedExcerpts.set(id, excerpt);
      }
    }
  }
  const citedIds = new Set([
    ...(analysis.summary_evidence_ids || []),
    ...analysis.sections.flatMap((section) => section.claims.flatMap((claim) => claim.evidence_ids || [])),
  ]);
  return evidence
    .filter((item) => item.type !== 'coverage' && citedIds.has(item.id))
    .map((item) => ({
      ...item,
      // Keep the card preview aligned with the exact sentence cited by the article.
      cited_excerpt: item.type === 'web_search' ? citedExcerpts.get(item.id) : null,
    }));
}

function ReportContent({ record, type, stock, evidence }) {
  const report = record?.report;
  const analysis = displayAnalysis(record, type, stock);
  if (!analysis) return <div className="detail-empty">还没有生成报告。</div>;
  const isMonitor = type === 'monitor';
  const monitorOutcome = report.monitor_outcome;
  const outcomeStatus = monitorOutcome?.status || 'legacy';
  const statusLabel = {
    no_new_signal: '未触发新增风险告警',
    market_review: '市场异动待跟踪',
    review: '新增线索待核验',
    triggered: '触发新增风险告警',
    legacy: '历史检查记录',
  }[outcomeStatus];
  const statusLevel = {
    no_new_signal: 'low',
    market_review: 'medium',
    review: 'medium',
    triggered: 'high',
    legacy: 'medium',
  }[outcomeStatus];
  const qualityControls = report?.quality_controls || {};
  const reviewRequired = Boolean(qualityControls.review_required);

  return (
    <article className={`brief-report article-report ${isMonitor ? 'monitor-article' : 'brief-article'}`}>
      {reviewRequired && (
        <div className="article-review-notice">
          <ShieldAlert size={16} />
          <div>
            <strong>报告已生成，待人工审核</strong>
            <span>
              {qualityControls.review_summary?.length
                ? qualityControls.review_summary.join('；')
                : '请结合下方正文和引用来源核对关键事实。'}
            </span>
          </div>
        </div>
      )}
      {isMonitor && (
        <div className="article-heading-row">
          <span className={`article-status level-${statusLevel}`}><ShieldAlert size={14} /> {statusLabel}</span>
        </div>
      )}
      {analysis.summary && (
        <p className="article-lead">
          {analysis.summary} <CitationLinks ids={analysis.summary_evidence_ids || []} evidence={evidence} />
        </p>
      )}
      {analysis.sections.map((section) => (
        <section className="article-section" key={section.title}>
          <h3>{section.title}</h3>
          <div className="article-section-body">
            {section.claims.map((claim, index) => (
              <p className="article-paragraph" key={`${section.title}-${index}`}>
                {claim.text}
                <CitationLinks ids={claim.evidence_ids} evidence={evidence} />
              </p>
            ))}
          </div>
        </section>
      ))}
      <footer className="article-meta">
        <span>{isMonitor ? '检查于' : '生成于'} {formatDate(report.generated_at)}</span>
        <span>{isMonitor ? '检查截至' : '数据截至'} {report.data_as_of || '来源未提供明确日期'}</span>
      </footer>
    </article>
  );
}

function formatSourceValue(value) {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.map(formatSourceValue).join('、');
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, nestedValue]) => `${key}：${formatSourceValue(nestedValue)}`)
      .join(' · ');
  }
  return String(value);
}

const sourceFactRules = [
  ['交易日期', /^交易日期$/],
  ['最新价', /^(?:最新价|收盘价)$/],
  ['涨跌幅', /^(?:涨跌幅|涨幅)$/],
  ['开盘价', /^(?:开盘价|open)$/i],
  ['最高价', /^(?:最高价|当日最高|high)$/i],
  ['最低价', /^(?:最低价|当日最低|low)$/i],
  ['成交量', /^(?:成交量|总成交量|volume)$/i],
  ['报告期', /(?:定期报告最新报告期|报告期)$/],
  ['披露日期', /(?:定期报告实际披露日期|实际披露日期)$/],
  ['营业收入', /(?:^|\/)营业(?:总)?收入$/],
  ['归母净利润', /归属于母公司所有者的净利润$/],
  ['销售毛利率', /销售毛利率$/],
  ['研发费用', /研发费用$/],
  ['检查区间', /^检查区间$/],
  ['关注方向', /^(?:关注方向|监控内容)$/],
];

function sourceFacts(source) {
  const entries = (source.rows || []).flatMap((row) => Object.entries(row));
  const facts = [];
  for (const [label, pattern] of sourceFactRules) {
    const match = entries.find(([key]) => pattern.test(key));
    if (match) {
      const rawValue = formatSourceValue(match[1]);
      const compactDate = /^(?:报告期|披露日期)$/.test(label)
        ? rawValue.match(/^(20\d{2})(0[1-9]|1[0-2])([0-2]\d|3[01])$/)
        : null;
      facts.push({
        label,
        value: compactDate
          ? `${compactDate[1]}-${compactDate[2]}-${compactDate[3]}`
          : rawValue,
      });
    }
  }
  return facts.slice(0, 3);
}

function SourceFacts({ source }) {
  const facts = sourceFacts(source);
  if (!facts.length) return null;
  return (
    <p className="source-facts">
      {facts.map((fact) => `${fact.label} ${fact.value}`).join(' · ')}
    </p>
  );
}

function SourceExcerpt({ source, stockName }) {
  const excerpts = sourceExcerpts(source, stockName);
  if (!excerpts.length) return null;
  return excerpts.map((text, index) => (
    <p className="source-excerpt" key={`${source.id}-excerpt-${index}`}>{text}</p>
  ));
}

function sourceDisplayTitle(source) {
  if (source.type === 'coverage') return '本次盘后检查范围';
  if (source.type !== 'datapro') return source.title;
  const keys = (source.rows || []).flatMap((row) => Object.keys(row));
  if (keys.some((key) => /^(?:交易日期|最新价|收盘价|前收盘价|开盘价|最高价|最低价|涨跌幅|涨幅|成交量|总成交量|open|high|low|close|volume)$/i.test(key))) return '最新交易行情';
  if (keys.some((key) => /营业收入|净利润|毛利率|研发费用/.test(key))) return '最新披露财务指标';
  return '专业数据记录';
}

function SourceList({ evidence = [], stockName }) {
  return (
    <div className="source-list">
      {evidence.map((source, index) => (
        <article className="source-item" key={source.id}>
          <div className="source-item-row">
            <span className="source-item-num">{index + 1}</span>
            <div className="source-item-content">
              {source.url ? (
                <a className="source-item-title source-link" href={source.url} target="_blank" rel="noreferrer">
                  {sourceDisplayTitle(source)} <ExternalLink className="link-icon" size={13} />
                </a>
              ) : <div className="source-item-title">{sourceDisplayTitle(source)}</div>}
              <div className="source-item-meta">
                <span>{source.type === 'datapro' ? 'Data MCP' : source.publisher || '公开信息'}</span>
                {source.type === 'web_search' && source.hosting_site && (
                  <span>转载于{source.hosting_site}</span>
                )}
                {(source.published_at || source.as_of_date) && <span>{formatDate(source.published_at || source.as_of_date, false)}</span>}
              </div>
              {source.type === 'datapro' && source.rows?.length
                ? <SourceFacts source={source} />
                : <SourceExcerpt source={source} stockName={stockName} />}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function HistoryList({ items, selectedId, onSelect, type }) {
  if (!items.length) return <div className="detail-empty">暂无历史记录。</div>;
  const historyChangeLabel = (item) => {
    if (type === 'monitor') {
      const status = item.report?.monitor_outcome?.status;
      return ({
        no_new_signal: '无新增事件',
        market_review: '市场异动',
        review: '线索待核验',
        triggered: '新增风险事件',
      })[status] || '旧版检查';
    }
    return ({
      initial: '首次生成',
      new_evidence: '新证据',
      no_material_change: '无实质变化',
    })[item.change_status] || (item.status === 'review_required' ? '待审核' : '状态未知');
  };
  const historySummary = (item) => {
    const actualSummary = String(readerVisibleAnalysis(
      item.report?.analysis,
      item.report?.evidence,
      type,
    )?.summary || '').trim();
    const technicalNarration = /DataPro字段|联网搜索返回|公开信息部分纳入|用于补充核对|达到权威性|交叉核验门槛|查询次数|命中条数|Provider|trace|证据边界|资料覆盖/;
    if (actualSummary && !technicalNarration.test(actualSummary)) return actualSummary;
    if (item.status === 'review_required') return '报告已生成，待人工审核引用和事实。';
    if (type === 'monitor') {
      const status = item.report?.monitor_outcome?.status;
      return ({
        no_new_signal: '本次盘后检查未触发新增风险告警。',
        market_review: '本次盘后检查发现需要持续跟踪的市场异动。',
        review: '本次盘后检查发现需要继续核验的新线索。',
        triggered: '本次盘后检查形成了新增风险提示。',
      })[status] || '盘后检查结果已保存。';
    }
    return ({
      initial: '首次个股简评已完成。',
      new_evidence: '个股简评已根据新增证据更新。',
      no_material_change: '本次复核未发现新的实质性证据。',
    })[item.change_status] || '个股简评已保存。';
  };
  return (
    <div className="history-list">
      {items.map((item) => (
        <button className={`history-item history-button ${selectedId === item.id ? 'selected' : ''}`} onClick={() => onSelect(item)} key={item.id} type="button">
          <span className="history-item-time">{formatDate(item.generated_at)}</span>
          <span className="history-item-text">{historySummary(item)}</span>
          <span className="history-change">{historyChangeLabel(item)}</span>
        </button>
      ))}
    </div>
  );
}

function MonitorSettings({
  stockId,
  settings,
  runs,
  schedulerStatus,
  onSaved,
  onRun,
  running,
}) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const scheduleTimeRef = useRef(null);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);
  if (!draft) return null;
  const lastTickAt = schedulerStatus?.last_tick_at ? Date.parse(schedulerStatus.last_tick_at) : NaN;
  const schedulerAlive = Boolean(
    schedulerStatus?.enabled
    && Number.isFinite(lastTickAt)
    && Date.now() - lastTickAt < 90_000,
  );
  const latestScheduledRun = runs.find((run) => run.trigger === 'schedule');
  const scheduleErrorMessage = latestScheduledRun
    ? (latestScheduledRun.status === 'failed' ? latestScheduledRun.error_message : null)
    : draft.last_error_message;
  const displayedRuns = visibleMonitorRuns(runs);

  function toggleDay(day) {
    const selected = draft.schedule_days.includes(day);
    const next = selected ? draft.schedule_days.filter((item) => item !== day) : [...draft.schedule_days, day];
    if (next.length) setDraft({ ...draft, schedule_days: next });
  }

  async function save() {
    setSaving(true);
    setMessage('');
    try {
      const scheduleTime = scheduleTimeRef.current?.value || draft.schedule_time;
      const saved = await api.saveMonitorSettings(stockId, {
        enabled: draft.enabled,
        schedule_time: scheduleTime,
        schedule_days: draft.schedule_days,
        timezone: draft.timezone,
      });
      setDraft(saved);
      setMessage('设置已保存');
      onSaved(saved);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="detail-card monitor-config-card">
      <div className="detail-card-title">盘后监控设置</div>
      <div className="monitor-config-list">
        <label className="config-row toggle-row">
          <span>自动执行</span>
          <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />
        </label>
        <label className="config-row">
          <span>执行时间</span>
          <input
            className="monitor-time-inline"
            type="time"
            ref={scheduleTimeRef}
            value={draft.schedule_time}
            onChange={(event) => setDraft({ ...draft, schedule_time: event.target.value })}
          />
        </label>
        <label className="config-row">
          <span>时区</span>
          <select
            className="monitor-timezone-inline"
            value={draft.timezone}
            onChange={(event) => setDraft({ ...draft, timezone: event.target.value })}
          >
            {timezoneOptions.map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </select>
        </label>
        <div className="config-row-block">
          <span>执行日期</span>
          <div className="day-picker">
            {dayOptions.map(([key, label]) => (
              <button className={`day-btn ${draft.schedule_days.includes(key) ? 'active' : ''}`} onClick={() => toggleDay(key)} key={key} type="button">{label}</button>
            ))}
          </div>
        </div>
        <div className="config-row"><span>下次执行</span><strong className="next-run">{draft.enabled ? (draft.next_run || '保存后计算') : '未启用'}</strong></div>
        {draft.enabled && (
          <div className="config-row">
            <span>调度服务</span>
            <strong className={schedulerAlive ? 'scheduler-alive' : 'scheduler-unavailable'}>
              {schedulerAlive ? '运行中' : '未检测到运行'}
            </strong>
          </div>
        )}
        {scheduleErrorMessage && (
          <div className="monitor-schedule-error">
            自动任务已触发但执行失败：{scheduleErrorMessage}
            {draft.next_retry_at && '，系统将自动重试'}
          </div>
        )}
      </div>
      {message && <div className="monitor-save-status">{message}</div>}
      <div className="settings-actions">
        <button className="btn-secondary compact-command" onClick={save} disabled={saving} type="button">
          {saving ? <RefreshCw className="spin" size={16} /> : <Save size={16} />} 保存设置
        </button>
        <button className="btn-run-once compact-command" onClick={onRun} disabled={running} type="button">
          <RefreshCw className={running ? 'spin' : ''} size={16} /> 立即执行一次
        </button>
      </div>
      {displayedRuns.length > 0 && (
        <div className="monitor-runs">
          <div className="monitor-runs-title">执行记录</div>
          {displayedRuns.map((run) => (
            <div className="monitor-run" key={run.id}>
              <span>{formatDate(run.started_at)}</span>
              <small className="run-trigger">{run.trigger === 'schedule' ? '自动' : run.trigger === 'manual' ? '手动' : '历史'}</small>
              <strong className={`run-${run.status}`}>{monitorRunLabels[run.status] || run.status}</strong>
              {run.error_message && <small>{run.error_message}</small>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ErrorPanel({ error }) {
  if (!error) return null;
  return (
    <div className="detail-error provider-error">
      <strong>{error.message}</strong>
    </div>
  );
}

function DetailPage({ stock, type, onBack }) {
  const [record, setRecord] = useState(null);
  const [history, setHistory] = useState([]);
  const [settings, setSettings] = useState(null);
  const [monitorRuns, setMonitorRuns] = useState([]);
  const [schedulerStatus, setSchedulerStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [historyResult, settingsResult, runsResult, schedulerResult] = await Promise.all([
        api.reportHistory(stock.id, type),
        type === 'monitor' ? api.monitorSettings(stock.id) : Promise.resolve(null),
        type === 'monitor' ? api.monitorRuns(stock.id) : Promise.resolve({ items: [] }),
        type === 'monitor' ? api.monitorStatus() : Promise.resolve(null),
      ]);
      const records = reportHistoryItems(historyResult);
      setHistory(records);
      setRecord(records[0] || null);
      setSettings(settingsResult);
      setMonitorRuns(runsResult.items || []);
      setSchedulerStatus(schedulerResult);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [stock.id, type]);

  useEffect(() => {
    if (type !== 'monitor' || !settings?.enabled) return undefined;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const [historyResult, settingsResult, runsResult, schedulerResult] = await Promise.all([
          api.reportHistory(stock.id, type),
          api.monitorSettings(stock.id),
          api.monitorRuns(stock.id),
          api.monitorStatus(),
        ]);
        if (cancelled) return;
        const records = reportHistoryItems(historyResult);
        setHistory(records);
        setRecord(records[0] || null);
        setSettings(settingsResult);
        setMonitorRuns(runsResult.items || []);
        setSchedulerStatus(schedulerResult);
      } catch {
        // A visible error from a user-triggered action remains authoritative.
      }
    }, 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [stock.id, type, settings?.enabled]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const next = await api.generateReport(stock.id, type);
      setRecord(next);
      const historyResult = await api.reportHistory(stock.id, type);
      setHistory(reportHistoryItems(historyResult));
      if (type === 'monitor') {
        const [nextSettings, runsResult] = await Promise.all([
          api.monitorSettings(stock.id),
          api.monitorRuns(stock.id),
        ]);
        setSettings(nextSettings);
        setMonitorRuns(runsResult.items || []);
      }
    } catch (requestError) {
      setError(requestError);
    } finally {
      setGenerating(false);
    }
  }

  const displaySources = citedEvidence(record, type, stock);
  const visibleHistory = history;
  return (
    <main className="page detail-page">
      <div className="detail-stock-header">
        <div className="detail-title-group">
          <h1 className="detail-stock-name">{stock.name} · {type === 'brief' ? '个股简评' : '盘后风险摘要'}</h1>
          <div className="detail-stock-subtitle">
            {stock.code} · {type === 'brief' ? '关注' : '监控'}：
            {stock.focus.join('、')}
          </div>
        </div>
        <button className="btn-generate compact-command" onClick={generate} disabled={generating} type="button">
          <RefreshCw className={generating ? 'spin' : ''} size={17} />
          {type === 'brief' ? '生成最新简评' : '立即执行盘后检查'}
        </button>
      </div>
      <ErrorPanel error={error} />
      <div className="detail-layout-3col">
        <section className="detail-card detail-main">
          <div className="detail-card-title">{type === 'brief' ? '最新简评' : '本次盘后摘要'}</div>
          {loading || generating ? (
            <div className="detail-loading"><RefreshCw className="spin" size={18} /> {generating
              ? type === 'brief' ? '正在更新公司快照' : '正在扫描新增风险事件'
              : '正在载入'}</div>
          ) : <ReportContent record={record} type={type} stock={stock} evidence={displaySources} />}
        </section>
        <aside className="detail-card detail-sources-col">
          <div className="detail-card-title">引用来源</div>
          {loading || generating ? (
            <div className="detail-loading">
              <RefreshCw className="spin" size={18} />
              {generating ? '正在检索并核验引用来源' : '正在载入引用来源'}
            </div>
          ) : displaySources.length ? (
            <SourceList evidence={displaySources} stockName={stock.name} />
          ) : (
            <div className="detail-empty">生成报告后显示来源。</div>
          )}
        </aside>
        <aside className="detail-history-col">
          <div className="detail-card">
            <div className="detail-card-title">历史记录</div>
            <HistoryList items={visibleHistory} selectedId={record?.id} onSelect={setRecord} type={type} />
          </div>
          {type === 'monitor' && (
            <MonitorSettings
              stockId={stock.id}
              settings={settings}
              runs={monitorRuns}
              schedulerStatus={schedulerStatus}
              onSaved={setSettings}
              onRun={generate}
              running={generating}
            />
          )}
        </aside>
      </div>
    </main>
  );
}

function App() {
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStock, setEditingStock] = useState(null);
  const [page, setPage] = useState({ name: 'home' });
  const [error, setError] = useState(null);

  useEffect(() => {
    api.stocks()
      .then((result) => setStocks(result.items || []))
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  const selectedStock = useMemo(() => stocks.find((stock) => stock.id === page.stockId), [stocks, page.stockId]);

  async function removeStock(stock) {
    if (!window.confirm(`确认移除 ${stock.name}？历史报告也会一并删除。`)) return;
    setError(null);
    try {
      await api.deleteStock(stock.id);
      setStocks((current) => current.filter((item) => item.id !== stock.id));
    } catch (requestError) {
      setError(requestError);
    }
  }

  function goHome() { setPage({ name: 'home' }); }

  return (
    <>
      <Navbar onHome={goHome} isDetail={page.name === 'detail'} />
      {page.name === 'detail' && selectedStock ? (
        <DetailPage stock={selectedStock} type={page.type} onBack={goHome} />
      ) : (
        <HomePage
          stocks={stocks}
          loading={loading}
          error={error}
          onAdd={() => { setEditingStock(null); setDialogOpen(true); }}
          onEdit={(stock) => { setEditingStock(stock); setDialogOpen(true); }}
          onDelete={removeStock}
          onOpen={(stock, type) => setPage({ name: 'detail', stockId: stock.id, type })}
        />
      )}
      {dialogOpen && (
        <StockDialog
          stock={editingStock}
          onClose={() => setDialogOpen(false)}
          onSaved={(stock) => {
            setStocks((current) => editingStock
              ? current.map((item) => item.id === stock.id ? stock : item)
              : [...current, stock]);
            setDialogOpen(false);
            setEditingStock(null);
          }}
        />
      )}
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
