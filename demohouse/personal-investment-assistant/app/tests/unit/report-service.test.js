import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ReportService, reportServiceInternals } from '../../src/server/services/report-service.js';

function createFixture({
  dataFailure = false,
  unsupportedClaim = false,
  duplicateSummary = false,
  dataDates = null,
  monitorEvent = false,
  previousMonitor = null,
  focus = ['收入', '公告'],
  webSummary = '示例科技发布经营公告。',
  webItems = null,
  marketChange = 1.01,
  dataCode = 'TEST1',
  verifierResults = null,
  semanticPreferenceEnabled = false,
  semanticQueryPlan = null,
  semanticEvidenceBindings = null,
  dataSearch = null,
} = {}) {
  const stock = {
    id: randomUUID(),
    name: '示例科技',
    code: 'TEST1',
    exchange: 'CN',
    focus,
  };
  const latestByType = new Map();
  const reportsByType = new Map();
  if (previousMonitor) latestByType.set('monitor', structuredClone(previousMonitor));
  let savedCount = 0;
  const usageEvents = [];
  const callOrder = [];
  const repository = {
    getStock: () => stock,
    getMonitorSettings: () => ({}),
    getLatestReport: (_stockId, type) => latestByType.get(type) || null,
    listReports: (_stockId, type, limit = null) => {
      const items = reportsByType.get(type) || [];
      return limit === null ? items : items.slice(0, limit);
    },
    saveReport: (record) => {
      savedCount += 1;
      const saved = structuredClone(record);
      latestByType.set(record.type, saved);
      reportsByType.set(record.type, [saved, ...(reportsByType.get(record.type) || [])]);
      return saved;
    },
    recordUsageEvent: (event) => usageEvents.push(structuredClone(event)),
  };
  let dataCalls = 0;
  const dataPro = {
    search: async (query) => {
      callOrder.push('datapro');
      if (dataSearch) {
        const callIndex = dataCalls;
        dataCalls += 1;
        return dataSearch(query, callIndex);
      }
      if (dataFailure) {
        const error = new Error('DataPro unavailable');
        error.code = 'DATAPRO_UNAVAILABLE';
        throw error;
      }
      const dataDate = dataDates?.[Math.floor(dataCalls / 2)] || '2026年6月30日';
      dataCalls += 1;
      if (query.includes('风险观察区间')) return { query, items: [] };
      if (query.includes('当日最新行情') || query.includes('当日最新实时行情')) {
        const today = reportServiceInternals.localIsoDate('Asia/Shanghai');
        return {
          query,
          items: [{
            title: '最新交易行情',
            证券代码: dataCode,
            table: {
              交易日期: [today],
              最新价: [100],
              前收盘价: [99],
              涨跌幅: [marketChange],
              成交量: [10000],
            },
          }],
        };
      }
      return {
        query,
        items: [{
          title: '财务指标',
          证券代码: dataCode,
          table: { 报告期: [dataDate], 营业收入: ['100.00亿元'] },
        }],
      };
    },
  };
  let webCalls = 0;
  const webSearch = {
    search: async (query) => {
      callOrder.push('web_search');
      webCalls += 1;
      return {
        query,
        items: webItems ?? [{
          title: '示例科技发布经营公告',
          publisher: '新浪财经',
          url: 'https://finance.sina.cn/notice',
          summary: webSummary,
          published_at: monitorEvent ? new Date(Date.now() - 60_000).toISOString() : '2026-07-21',
        }],
      };
    },
  };
  const webQueries = [];
  const originalWebSearch = webSearch.search;
  webSearch.search = async (query, options) => {
    webQueries.push({ query, options });
    return originalWebSearch(query, options);
  };
  let modelCalls = 0;
  let generationCalls = 0;
  let verificationCalls = 0;
  let semanticBindingCalls = 0;
  const model = {
    generateJson: async ({ schemaName }) => {
      callOrder.push(schemaName === 'investment_report_verification'
        ? 'model_verify'
        : schemaName === 'investment_preference_query_plan'
          ? 'model_query_plan'
          : schemaName === 'investment_preference_source_binding'
            ? 'model_source_binding'
            : 'model_generate');
      modelCalls += 1;
      if (schemaName === 'investment_preference_query_plan') {
        return {
          data: semanticQueryPlan || { queries: [] },
          usage: { total_tokens: 20 },
        };
      }
      if (schemaName === 'investment_preference_source_binding') {
        const bindingData = Array.isArray(semanticEvidenceBindings)
          ? semanticEvidenceBindings[semanticBindingCalls++] || { matches: [] }
          : semanticEvidenceBindings || { matches: [] };
        return {
          data: bindingData,
          usage: { total_tokens: 20 },
        };
      }
      if (schemaName === 'investment_report_verification') {
        const configured = verifierResults?.[verificationCalls];
        verificationCalls += 1;
        return {
          data: configured === false
            ? {
              valid: false,
              issues: [{ location: 'sections.0', reason: '正文与引用语义不对应' }],
            }
            : configured && typeof configured === 'object'
              ? configured
              : { valid: true, issues: [] },
          usage: { total_tokens: 20 },
        };
      }
      generationCalls += 1;
      if (schemaName === 'after_hours_risk_report') {
        return {
          data: {
            status: 'insufficient',
            summary: '本轮形成一条公司公告线索，尚需结合权威原文判断是否触发风险告警。',
            summary_evidence_ids: ['W1'],
            change_summary: '本轮形成新的公司公告线索。',
            change_evidence_ids: ['W1'],
            risk_level: 'unknown',
            claims: [{
              section_title: '新增风险事件',
              text: '检查窗口内出现一条公司经营公告线索。',
              evidence_ids: ['W1'],
            }],
            conclusion: { text: '该线索尚不足以形成确定风险结论。', evidence_ids: ['W1'] },
            limitations: ['当前仅有单一媒体线索。'],
          },
          usage: { total_tokens: 100 },
        };
      }
      return {
        data: {
          status: 'sufficient',
          summary: duplicateSummary
            ? '营业收入为100.00亿元。'
            : generationCalls === 1
              ? '营业收入为100.00亿元。'
              : '专业数据列示营业收入100.00亿元。',
          summary_evidence_ids: ['D2'],
          change_summary: '公开信息包含经营公告。',
          change_evidence_ids: ['W1'],
          risk_level: 'low',
          claims: [
            { section_title: '经营与财务', text: '报告期为2026年6月30日。', evidence_ids: ['D2'] },
            ...(unsupportedClaim ? [{
              section_title: '经营与财务',
              text: '该指标为18.97%。',
              evidence_ids: ['D2'],
            }] : []),
          ],
          conclusion: { text: '公开信息显示已发布经营公告。', evidence_ids: ['W1'] },
          limitations: [],
        },
        usage: { total_tokens: 100 },
      };
    },
  };
  const service = new ReportService({
    repository,
    dataPro,
    webSearch,
    model,
    config: { reportRetryCount: 1, semanticPreferenceEnabled },
  });
  return {
    service,
    stock,
    getModelCalls: () => modelCalls,
    getVerificationCalls: () => verificationCalls,
    getWebCalls: () => webCalls,
    getWebQueries: () => webQueries,
    getSavedCount: () => savedCount,
    usageEvents,
    callOrder,
  };
}

test('calls DataPro before web search and freshly verifies identical evidence', async () => {
  const fixture = createFixture();
  const first = await fixture.service.generate({ stockId: fixture.stock.id, type: 'brief' });
  assert.equal(first.change_status, 'initial');
  assert.equal(first.report.analysis.change_summary, '这是首次生成的报告，暂无可比较的历史结果。');
  assert.equal(fixture.getModelCalls(), 2);
  assert.deepEqual(fixture.callOrder.slice(0, 4), ['datapro', 'datapro', 'web_search', 'web_search']);

  const second = await fixture.service.generate({ stockId: fixture.stock.id, type: 'brief' });
  assert.equal(second.change_status, 'no_material_change');
  assert.notEqual(second.report.analysis.summary, first.report.analysis.summary);
  assert.equal(second.report.analysis.change_summary, '与上次相比，本次检索未发现新的实质性证据。');
  assert.equal(fixture.getModelCalls(), 4);
  assert.equal(fixture.usageEvents.filter((event) => event.provider === 'datapro').length, 4);
  assert.equal(fixture.usageEvents.filter((event) => event.provider === 'web_search').length, 7);
  assert.equal(fixture.usageEvents.filter((event) => event.provider === 'ark_model').length, 4);
});

test('rewrites a repeated model summary without inventing new evidence', async () => {
  const fixture = createFixture({ duplicateSummary: true });
  const first = await fixture.service.generate({ stockId: fixture.stock.id, type: 'brief' });
  const second = await fixture.service.generate({ stockId: fixture.stock.id, type: 'brief' });
  assert.equal(second.change_status, 'no_material_change');
  assert.notEqual(second.report.analysis.summary, first.report.analysis.summary);
  assert.ok(second.report.analysis.summary_evidence_ids.length > 0);
  assert.ok(second.report.analysis.summary_evidence_ids.some((id) => id.startsWith('D')));
  assert.match(second.report.analysis.summary, /与上次相比，本次可核验事实未发生实质变化/);
  assert.equal(second.report.analysis.summary.length <= 180, true);
  assert.doesNotMatch(second.report.analysis.summary, /市场方面|经营与财务方面|关注方向方面/);
});

test('treats a broad financial focus as a monitoring topic instead of an unsupported conclusion', async () => {
  const fixture = createFixture({
    focus: ['财务表现', '原材料价格'],
    webSummary: '示例科技财务表现相关经营公告。',
  });
  const report = await fixture.service.generate({ stockId: fixture.stock.id, type: 'brief' });
  const analysisText = JSON.stringify(report.report.analysis);
  assert.equal(report.status, 'completed');
  assert.match(analysisText, /营业收入/);
  assert.doesNotMatch(analysisText, /财务表现/);
});

test('keeps searching and saves a review-required report when DataPro is unavailable', async () => {
  const fixture = createFixture({
    dataFailure: true,
    monitorEvent: true,
    semanticPreferenceEnabled: true,
    semanticQueryPlan: {
      queries: [{ preference: '公告', scope: 'company', query: '示例科技 经营公告' }],
    },
    semanticEvidenceBindings: {
      matches: [{
        candidate_id: 'S1', preference: '公告', scope: 'company', quote: '示例科技发布经营公告，披露智能终端业务最新进展。',
      }],
    },
    focus: ['公告'],
    webSummary: '示例科技发布经营公告，披露智能终端业务最新进展。',
  });
  const report = await fixture.service.generate({ stockId: fixture.stock.id, type: 'monitor' });
  assert.equal(fixture.getWebCalls() > 0, true);
  assert.equal(fixture.getSavedCount(), 1);
  assert.equal(report.status, 'review_required');
  assert.equal(report.provider_status.datapro.ok, false);
  assert.match(report.report.quality_controls.review_summary.join(' '), /DataPro/);
  assert.equal(
    fixture.usageEvents.filter((event) => event.provider === 'datapro').every((event) => event.status === 'failed'),
    true,
  );
});

test('does not display mismatched DataPro rows and continues with verified public evidence', async () => {
  const fixture = createFixture({
    dataCode: 'OTHER.US',
    monitorEvent: true,
    semanticPreferenceEnabled: true,
    semanticQueryPlan: {
      queries: [{ preference: '公告', scope: 'company', query: '示例科技 经营公告' }],
    },
    semanticEvidenceBindings: {
      matches: [{
        candidate_id: 'S1', preference: '公告', scope: 'company', quote: '示例科技发布经营公告，披露智能终端业务最新进展。',
      }],
    },
    focus: ['公告'],
    webSummary: '示例科技发布经营公告，披露智能终端业务最新进展。',
  });
  const report = await fixture.service.generate({ stockId: fixture.stock.id, type: 'monitor' });
  assert.equal(fixture.getWebCalls() > 0, true);
  assert.equal(fixture.getSavedCount(), 1);
  assert.equal(report.status, 'review_required');
  assert.equal(report.provider_status.datapro.code, 'INSUFFICIENT_DATAPRO_EVIDENCE');
  assert.ok(report.report.evidence.every((item) => item.type !== 'datapro' || item.security_code === 'TEST1'));
});

test('monitor retries the canonical market query when initial DataPro evidence is unavailable', async () => {
  const fixture = createFixture({
    focus: ['股价走势'],
    dataSearch: async (query, callIndex) => {
      if (callIndex === 0) {
        const today = reportServiceInternals.localIsoDate('Asia/Shanghai');
        return {
          query,
          items: [{
            title: '风险观察区间',
            证券代码: 'TEST1',
            table: {
              日期: [today],
              公司名称: ['示例科技'],
              风险观察区间: [`${today} 至 ${today}`],
            },
          }],
        };
      }
      if (callIndex === 1) {
        const error = new Error('temporary DataPro query failure');
        error.code = 'DATAPRO_4003';
        throw error;
      }
      const today = reportServiceInternals.localIsoDate('Asia/Shanghai');
      return {
        query,
        items: [{
          title: '最新交易行情',
          证券代码: 'TEST1',
          table: {
            交易日期: [today],
            最新价: [100],
            前收盘价: [99],
            涨跌幅: [1.01],
            成交量: [10000],
          },
        }],
      };
    },
    webItems: [],
  });

  const report = await fixture.service.generate({ stockId: fixture.stock.id, type: 'monitor' });
  const dataEvidence = report.report.evidence.filter((item) => item.type === 'datapro');
  const dataUsage = fixture.usageEvents.filter((event) => event.provider === 'datapro');

  assert.equal(dataEvidence.length, 1);
  assert.equal(dataEvidence[0].security_code, 'TEST1');
  assert.equal(dataEvidence[0].rows.some((row) => '公司名称' in row), false);
  assert.equal(dataUsage.length, 3);
  assert.equal(dataUsage[2].metadata.fallback, true);
  assert.equal(dataUsage[2].status, 'succeeded');
});

test('brief retries the canonical market query when financial evidence exists but market data failed', async () => {
  const fixture = createFixture({
    dataSearch: async (query, callIndex) => {
      if (callIndex === 0) {
        const error = new Error('temporary market query failure');
        error.code = 'DATAPRO_4003';
        throw error;
      }
      if (callIndex === 1) {
        return {
          query,
          items: [{
            title: '财务指标',
            证券代码: 'TEST1',
            table: {
              报告期: ['2026年6月30日'],
              营业收入: ['100.00亿元'],
            },
          }],
        };
      }
      const today = reportServiceInternals.localIsoDate('Asia/Shanghai');
      return {
        query,
        items: [{
          title: '最新交易行情',
          证券代码: 'TEST1',
          table: {
            交易日期: [today],
            最新价: [100],
            前收盘价: [99],
            涨跌幅: [1.01],
            成交量: [10000],
          },
        }],
      };
    },
  });

  const report = await fixture.service.generate({ stockId: fixture.stock.id, type: 'brief' });
  const dataEvidence = report.report.evidence.filter((item) => item.type === 'datapro');
  const dataUsage = fixture.usageEvents.filter((event) => event.provider === 'datapro');

  assert.equal(dataEvidence.some((item) => item.rows.some((row) => '最新价' in row)), true);
  assert.equal(dataEvidence.some((item) => item.rows.some((row) => '营业收入' in row)), true);
  assert.equal(dataUsage.length, 3);
  assert.equal(dataUsage[2].metadata.fallback, true);
  assert.doesNotMatch(report.report.analysis.summary, /未提供.{0,24}(?:股价|行情)|无法对/);
});

test('brief retries the canonical market query again after a transient fallback failure', async () => {
  const fixture = createFixture({
    dataSearch: async (query, callIndex) => {
      if (callIndex === 0) return { query, items: [] };
      if (callIndex === 1) {
        return {
          query,
          items: [{
            title: '财务指标',
            证券代码: 'TEST1',
            table: { 报告期: ['2026年6月30日'], 营业收入: ['100.00亿元'] },
          }],
        };
      }
      if (callIndex === 2) {
        const error = new Error('temporary fallback failure');
        error.code = 'DATAPRO_4003';
        throw error;
      }
      const today = reportServiceInternals.localIsoDate('Asia/Shanghai');
      return {
        query,
        items: [{
          title: '最新交易行情',
          证券代码: 'TEST1',
          table: {
            交易日期: [today],
            最新价: [100],
            前收盘价: [99],
            涨跌幅: [1.01],
            成交量: [10000],
          },
        }],
      };
    },
  });

  const report = await fixture.service.generate({ stockId: fixture.stock.id, type: 'brief' });
  const dataUsage = fixture.usageEvents.filter((event) => event.provider === 'datapro');
  assert.equal(
    report.report.evidence.some((item) => (
      item.type === 'datapro' && item.rows.some((row) => '最新价' in row)
    )),
    true,
  );
  assert.equal(dataUsage.length, 4);
  assert.equal(dataUsage[2].metadata.fallback_attempt, 1);
  assert.equal(dataUsage[2].status, 'failed');
  assert.equal(dataUsage[3].metadata.fallback_attempt, 2);
  assert.equal(dataUsage[3].status, 'succeeded');
});

test('brief uses a returned trading-date hint to request complete market fields', async () => {
  const fixture = createFixture({
    dataSearch: async (query, callIndex) => {
      if (callIndex === 0) {
        return {
          query,
          items: [{
            title: '最近交易日说明',
            证券代码: 'TEST1',
            table: {
              查询日期: ['2026-07-27'],
              实际交易日期: ['2026-07-24'],
              是否有交易数据: [false],
            },
          }],
        };
      }
      if (callIndex === 1) {
        return {
          query,
          items: [{
            title: '财务指标',
            证券代码: 'TEST1',
            table: { 报告期: ['2026年6月30日'], 营业收入: ['100.00亿元'] },
          }],
        };
      }
      assert.match(query, /最近实际交易日期为 2026-07-24/);
      assert.match(query, /不得只返回休市说明/);
      return {
        query,
        items: [{
          title: '完整交易行情',
          证券代码: 'TEST1',
          table: {
            交易日期: ['2026-07-24'],
            最新价: [100],
            前收盘价: [99],
            涨跌幅: [1.01],
            成交量: [10000],
          },
        }],
      };
    },
  });

  const report = await fixture.service.generate({ stockId: fixture.stock.id, type: 'brief' });
  assert.equal(
    report.report.evidence.some((item) => (
      item.type === 'datapro' && item.rows.some((row) => row.最新价 === 100)
    )),
    true,
  );
});

test('shows the latest generated article when semantic verification fails', async () => {
  const fixture = createFixture({ verifierResults: [false, false, false, false] });
  const report = await fixture.service.generate({ stockId: fixture.stock.id, type: 'brief' });
  assert.equal(fixture.getVerificationCalls(), 4);
  assert.equal(fixture.getSavedCount(), 1);
  assert.equal(report.status, 'review_required');
  assert.equal(report.report.quality_controls.review_required, true);
  assert.ok(report.report.quality_controls.review_summary.length > 0);
  assert.equal(report.model_usage.verification.total_tokens, 20);
  assert.match(report.report.analysis.summary, /营业收入|专业数据/);
  const decisions = fixture.usageEvents.filter((event) => (
    event.operation.endsWith('_decision')
  ));
  assert.equal(decisions.length, 4);
  assert.equal(decisions[0].error_code, 'EVIDENCE_VALIDATION_FAILED');
  assert.equal(decisions[0].metadata.issues[0].reason, '正文与引用语义不对应');
});

test('saves a deterministic fallback only after its own semantic verification passes', async () => {
  const fixture = createFixture({ verifierResults: [false, false, true] });
  const report = await fixture.service.generate({ stockId: fixture.stock.id, type: 'brief' });
  assert.equal(fixture.getVerificationCalls(), 3);
  assert.equal(fixture.getSavedCount(), 1);
  assert.equal(report.report.quality_controls.fallback_rewritten_fields.includes('authoritative_only'), true);
});

test('repairs a semantic summary issue and verifies the stabilized report before saving', async () => {
  const fixture = createFixture({
    verifierResults: [{
      valid: false,
      issues: [{ location: 'summary', reason: '摘要没有完整概括正文事实' }],
    }, true],
  });
  const report = await fixture.service.generate({ stockId: fixture.stock.id, type: 'brief' });
  assert.equal(fixture.getVerificationCalls(), 2);
  assert.equal(fixture.getSavedCount(), 1);
  assert.equal(report.status, 'completed');
  assert.equal(report.report.quality_controls.review_required, false);
  assert.equal(
    report.report.quality_controls.fallback_rewritten_fields.includes('summary'),
    true,
  );
});

test('uses distinct public-information queries for brief and after-hours reports', () => {
  const stock = { name: '示例科技', code: 'TEST1', focus: ['风险公告', '行业政策'] };
  const options = { now: new Date('2026-07-21T08:00:00.000Z'), timezone: 'Asia/Shanghai' };
  const brief = reportServiceInternals.reportQueries(stock, 'brief', null, options);
  const monitor = reportServiceInternals.reportQueries(stock, 'monitor', null, options);
  assert.equal(brief.data.length, 2);
  assert.equal(monitor.data.length, 2);
  assert.equal(brief.web.length, 3);
  assert.equal(monitor.web.length, 4);
  assert.match(brief.data[0], /2026-07-21/);
  assert.match(brief.data[1], /定期报告最新报告期/);
  assert.match(brief.data[1], /一般企业不得返回商业银行/);
  assert.match(brief.web[0].query, /最新公告/);
  assert.match(monitor.data[0], /风险观察区间/);
  assert.match(monitor.data[1], /盘后异动检查/);
  assert.match(monitor.web[0].query, /公司动态/);
  assert.match(monitor.web[1].query, /风险公告/);
  assert.match(monitor.web[2].query, /行业政策/);
  assert.equal(monitor.window.start_label, '2026-07-21 00:00');
  assert.equal(monitor.window.review_start_at, '2026-07-14T08:00:00.000Z');
  assert.equal(monitor.window.review_start_date, '2026-07-14');
  assert.equal(brief.web.every((query) => query.authLevel === 1), true);
  assert.equal(monitor.web.every((query) => query.authLevel === 1), true);
  assert.notEqual(brief.web[0].timeRange, monitor.web[0].timeRange);
});

test('normalizes mixed source timestamps to one report-level calendar date', () => {
  assert.equal(reportServiceInternals.maxAsOf([
    { as_of_date: '2026-07-23' },
    { as_of_date: '2026-07-23T14:25:00+08:00' },
    { as_of_date: '2026年7月22日' },
    { type: 'coverage', as_of_date: '2026-07-24' },
  ]), '2026-07-23');
});

test('keeps a previous trading-day quote out of the current-day market signal count', () => {
  const window = {
    end_date: '2026-07-27',
    start_date: '2026-07-27',
    initial: true,
  };
  const previousTradingDay = {
    type: 'datapro',
    as_of_date: '2026-07-24',
    rows: [{ 交易日期: '2026-07-24', 最新价: 31.51, 涨跌幅: '-4.6884 %' }],
  };
  const currentTradingDay = {
    ...previousTradingDay,
    as_of_date: '2026-07-27',
    rows: [{ 交易日期: '2026-07-27', 最新价: 31.51, 涨跌幅: '-4.6884 %' }],
  };

  assert.equal(
    reportServiceInternals.monitorEvidenceRole(previousTradingDay, window),
    'market_history',
  );
  assert.equal(
    reportServiceInternals.monitorEvidenceRole(currentTradingDay, window),
    'market_signal',
  );
});

test('builds one source-backed coverage item for every user preference', () => {
  const stock = {
    name: '示例科技',
    code: 'TEST1',
    exchange: 'CN',
    focus: ['财务表现', '原材料价格', '海外业务'],
  };
  const contract = reportServiceInternals.buildPreferenceContract(stock, 'brief', null, [{
    id: 'D1',
    type: 'datapro',
    title: '最新财务指标',
    rows: [{
      营业收入: '100亿元',
      归属于母公司所有者的净利润: '8亿元',
      销售毛利率: '18%',
    }],
  }, {
    id: 'W1',
    type: 'web_search',
    title: '碳酸锂价格近期变化',
    content: '原材料成本变化',
  }]);

  assert.deepEqual(contract.filter((item) => !item.is_system_core).map((item) => ({
    preference: item.preference,
    status: item.status,
    evidence_ids: item.evidence_ids,
  })), [
    { preference: '财务表现', status: 'covered', evidence_ids: ['D1'] },
    { preference: '原材料价格', status: 'covered', evidence_ids: ['W1'] },
    { preference: '海外业务', status: 'watch', evidence_ids: [] },
  ]);
});

test('keeps a profitability preference covered by disclosed financial metrics', () => {
  const stock = {
    name: '示例消费',
    code: 'TEST1',
    exchange: 'CN',
    focus: ['盈利能力'],
  };
  const evidence = [{
    id: 'D1',
    type: 'datapro',
    title: '最新披露财务指标',
    rows: [{
      营业收入: '100亿元',
      销售毛利率: '89%',
      归属于母公司所有者的净利润: '50亿元',
    }],
  }];
  const [contract] = reportServiceInternals.buildPreferenceContract(
    stock,
    'brief',
    null,
    evidence,
  );
  const [aligned] = reportServiceInternals.alignPreferenceContractWithReport(
    [contract],
    {
      sections: [{
        title: '经营与财务',
        claims: [{
          text: '最新报告期营业收入为100亿元，销售毛利率为89%。',
          evidence_ids: ['D1'],
        }],
      }],
    },
    evidence,
  );

  assert.equal(contract.category, 'financial');
  assert.equal(aligned.status, 'covered');
  assert.deepEqual(aligned.evidence_ids, ['D1']);
});

test('authorizes fixed brief sections and supplemental company context without treating them as user preferences', () => {
  const stock = {
    name: '示例汽车',
    code: 'TEST1',
    exchange: 'CN',
    focus: ['行业政策'],
  };
  const evidence = [{
    id: 'D1',
    type: 'datapro',
    as_of_date: '2026-07-27',
    rows: [{ 交易日期: '2026-07-27', 最新价: 20.1, 涨跌幅: '1.2%' }],
  }, {
    id: 'D2',
    type: 'datapro',
    as_of_date: '2026-03-31',
    rows: [{
      定期报告最新报告期: '2026-03-31',
      营业收入: '100亿元',
      销售毛利率: '18%',
    }],
  }, {
    id: 'W1',
    type: 'web_search',
    source_tier: 'official',
    title: '新能源汽车行业政策实施通知',
    publisher: '行业主管部门',
    content: '新能源汽车行业政策于本月正式实施。',
    semantic_matches: [{
      preference: '行业政策',
      scope: 'external',
      quote: '新能源汽车行业政策于本月正式实施。',
    }],
  }, {
    id: 'W2',
    type: 'web_search',
    source_tier: 'media',
    title: '示例汽车发布6月新能源汽车产销快报',
    publisher: '第一财经',
    content: '第一财经报道，示例汽车发布6月新能源汽车产销快报。',
  }];

  const contract = reportServiceInternals.buildPreferenceContract(stock, 'brief', null, evidence);
  const userPreference = contract.find((item) => item.preference === '行业政策');
  const marketCore = contract.find((item) => item.preference === '__core_brief_market__');
  const financialCore = contract.find((item) => item.preference === '__core_brief_financial__');
  const companyCore = contract.find((item) => item.preference === '__core_brief_company_context__');

  assert.deepEqual(userPreference.evidence_ids, ['W1']);
  assert.deepEqual(marketCore.evidence_ids, ['D1']);
  assert.equal(marketCore.expected_section, '市场表现');
  assert.deepEqual(financialCore.evidence_ids, ['D2']);
  assert.equal(financialCore.expected_section, '经营与财务');
  assert.deepEqual(companyCore.evidence_ids, ['W2']);
  assert.equal(companyCore.expected_section, '关注方向');
  assert.match(
    reportServiceInternals.modelPreferenceContract([companyCore])[0].evidence_usage_rule,
    /不能冒充用户关注偏好/,
  );
});

test('tells the model that preference evidence ids are alternatives, not all required', () => {
  const [contract] = reportServiceInternals.modelPreferenceContract([{
    preference: '原材料价格',
    display_label: '原材料价格',
    category: 'raw_material',
    expected_section: '关注方向',
    status: 'covered',
    evidence_ids: ['W1', 'W2', 'W3'],
  }]);
  assert.deepEqual(contract.allowed_evidence_ids, ['W1', 'W2', 'W3']);
  assert.equal('evidence_ids' in contract, false);
  assert.match(contract.evidence_usage_rule, /至少引用其中一条/);
  assert.match(contract.evidence_usage_rule, /不要求全部引用/);
});

test('keeps an unsupported preference out of the reader-facing brief', () => {
  const stock = { name: '星河消费', code: '600001.SH', focus: ['渠道库存'] };
  const evidence = [{
    id: 'D1',
    type: 'datapro',
    as_of_date: '2026-07-23',
    rows: [{ 交易日期: '2026-07-23', 最新价: 88 }],
    content: '交易日期2026-07-23，最新价88。',
  }];
  const [preference] = reportServiceInternals.buildPreferenceContract(
    stock,
    'brief',
    null,
    evidence,
  );
  assert.equal(preference.status, 'watch');
  assert.equal(preference.expected_section, null);
  assert.match(
    reportServiceInternals.modelPreferenceContract([preference])[0].evidence_usage_rule,
    /不得让该偏好进入正文/,
  );

  const merged = reportServiceInternals.mergeDeterministicCore({
    sections: [{
      title: '后续观察',
      claims: [{
        text: '后续重点核对渠道库存。',
        evidence_ids: ['D1'],
      }],
    }],
    conclusion: {
      text: '后续重点核对渠道库存。',
      evidence_ids: ['D1'],
    },
    limitations: ['本轮没有可用于陈述渠道库存偏好的可靠证据。'],
  }, evidence, 'brief', stock).report;
  assert.deepEqual(merged.sections.map((section) => section.title), ['市场表现', '后续观察']);
  assert.doesNotMatch(JSON.stringify(merged), /渠道库存|关注方向/);
  assert.match(JSON.stringify(merged), /下一交易日行情/);
});

test('requires semantic evidence for a technical-trend preference instead of treating one quote as coverage', () => {
  const stock = { name: '中航西飞', code: '000768.SZ', focus: ['技术面走势'] };
  const evidence = [
    {
      id: 'D1',
      type: 'datapro',
      as_of_date: '2026-07-24',
      rows: [{ 交易日期: '2026-07-24', 最新价: 20.31, 涨跌幅: '-2.3088 %' }],
      content: '交易日期2026-07-24，最新价20.31，涨跌幅-2.3088%。',
    },
    {
      id: 'W1',
      type: 'web_search',
      source_tier: 'media',
      title: '中航西飞震荡强于大盘',
      publisher: '经济观察网',
      content: '中航西飞近5日处于震荡行情中，表现强于大盘，强于行业平均水平。',
      semantic_matches: [{
        preference: '技术面走势',
        scope: 'company',
        quote: '中航西飞近5日处于震荡行情中，表现强于大盘，强于行业平均水平。',
      }],
      semantic_binding_checked: true,
    },
  ];

  const [preference] = reportServiceInternals.buildPreferenceContract(
    stock,
    'brief',
    null,
    evidence,
  );
  assert.equal(preference.category, 'market');
  assert.equal(preference.expected_section, '关注方向');
  assert.deepEqual(preference.evidence_ids, ['W1']);

  const section = reportServiceInternals.deterministicWebSection(evidence, stock, 'brief');
  assert.equal(section.title, '关注方向');
  assert.deepEqual(section.claims[0].evidence_ids, ['W1']);
  assert.match(section.claims[0].text, /近5日处于震荡行情/);

  const fallback = reportServiceInternals.deterministicAuthoritativeReport(
    evidence,
    'brief',
    'no_material_change',
    stock,
  );
  const marketSection = fallback.sections.find((item) => item.title === '市场表现');
  const focusSection = fallback.sections.find((item) => item.title === '关注方向');
  assert.match(fallback.summary, /近5日处于震荡行情/);
  assert.equal(fallback.summary_evidence_ids.includes('W1'), true);
  assert.equal(
    marketSection.claims.some((claim) => claim.evidence_ids.includes('D1')),
    true,
  );
  assert.equal(
    focusSection.claims.some((claim) => claim.evidence_ids.includes('W1')),
    true,
  );
});

test('binds varied preferences to substantive evidence instead of broad category matches', () => {
  const stock = {
    name: '示例航空',
    code: '000001.SZ',
    focus: ['技术面走势', '宏观', '关键价位', '估值水平', '利润变化', '研发费用', '低空物流节点'],
  };
  const semanticSource = (id, preference, quote) => ({
    id,
    type: 'web_search',
    source_tier: 'media',
    title: `示例航空${preference}进展`,
    publisher: `来源${id}`,
    content: quote,
    semantic_matches: [{ preference, scope: 'company', quote }],
    semantic_binding_checked: true,
  });
  const evidence = [
    {
      id: 'D1',
      type: 'datapro',
      rows: [{ 交易日期: '2026-07-24', 最新价: 20.31, 涨跌幅: '-2.3088 %' }],
    },
    {
      id: 'D2',
      type: 'datapro',
      rows: [{ 营业收入: '70亿元', 销售毛利率: '8.7%', 研发费用: '0.18亿元' }],
    },
    {
      id: 'D3',
      type: 'datapro',
      rows: [{ 市盈率: 45.2, 市净率: 3.1 }],
    },
    semanticSource('W1', '技术面走势', '示例航空近20个交易日价格重心上移，但短期波动有所扩大。'),
    semanticSource('W2', '宏观', '宏观流动性环境变化可能影响航空制造企业的融资成本。'),
    semanticSource('W3', '关键价位', '示例航空近期交易区间的关键价位仍需结合后续成交确认。'),
    semanticSource('W4', '低空物流节点', '示例航空披露了低空物流节点项目的阶段性建设安排。'),
  ];

  const contracts = reportServiceInternals.buildPreferenceContract(stock, 'brief', null, evidence);
  const byPreference = new Map(contracts.map((item) => [item.preference, item]));
  assert.deepEqual(byPreference.get('技术面走势').evidence_ids, ['W1']);
  assert.deepEqual(byPreference.get('宏观').evidence_ids, ['W2']);
  assert.deepEqual(byPreference.get('关键价位').evidence_ids, ['W3']);
  assert.deepEqual(byPreference.get('估值水平').evidence_ids, ['D3']);
  assert.equal(byPreference.get('利润变化').status, 'watch');
  assert.deepEqual(byPreference.get('研发费用').evidence_ids, ['D2']);
  assert.deepEqual(byPreference.get('低空物流节点').evidence_ids, ['W4']);
});

test('uses the stock focus instead of legacy monitor items', () => {
  const stock = { name: '示例科技', code: 'TEST1', focus: ['原材料价格', '海外政策'] };
  const options = { now: new Date('2026-07-21T08:00:00.000Z'), timezone: 'Asia/Shanghai' };
  const monitor = reportServiceInternals.reportQueries(stock, 'monitor', {
    check_items: ['销量'],
  }, options);

  assert.equal(monitor.web.some((item) => item.query.includes('原材料价格')), true);
  assert.equal(monitor.web.some((item) => item.query.includes('锂矿')), true);
  assert.equal(monitor.web.some((item) => item.query.includes('海外政策')), true);
  assert.equal(monitor.web.some((item) => item.query.includes('销量 最新风险变化')), false);
});

test('keeps arbitrary company names and custom preferences in generic search queries', () => {
  const cases = [
    { name: '星河精密', code: '688888', preference: '海底数据中心订单' },
    { name: '远山医药', code: '123456', preference: '海外临床试验入组节奏' },
    { name: '晨风消费', code: '09876', preference: '门店同店客流' },
  ];
  for (const item of cases) {
    const monitor = reportServiceInternals.reportQueries({
      name: item.name,
      code: item.code,
      focus: [item.preference],
    }, 'monitor', null, {
      now: new Date('2026-07-21T08:00:00.000Z'),
      timezone: 'Asia/Shanghai',
    });
    assert.equal(monitor.web.some((query) => (
      query.query.includes(item.name)
      && query.query.includes(item.code)
      && query.query.includes(item.preference)
    )), true);
    if (!/汽车|新能源/.test(item.preference)) {
      assert.equal(
        reportServiceInternals.monitorTitleTerms({
          name: item.name, code: item.code, focus: [item.preference],
        }).some((term) => /汽车|新能源/.test(term)),
        false,
      );
    }
  }
});

test('splits compound preferences into independently verifiable subtopics', () => {
  assert.deepEqual(
    reportServiceInternals.preferenceSubtopics('股价走势和行业动态'),
    ['股价走势', '行业动态'],
  );
  assert.deepEqual(
    reportServiceInternals.preferenceSubtopics('盈利能力、品牌优势、规模效应'),
    ['盈利能力', '品牌优势', '规模效应'],
  );
  assert.deepEqual(
    reportServiceInternals.preferenceSubtopics('参与式治理'),
    ['参与式治理'],
  );
});

test('treats a current quote as stock-price trend evidence but keeps technical analysis strict', () => {
  const quote = {
    id: 'D1',
    type: 'datapro',
    rows: [{
      交易日期: '2026-07-27',
      最新价: 91.87,
      前收盘价: 91.89,
      涨跌幅: '-0.0218 %',
    }],
  };

  assert.equal(
    reportServiceInternals.dataProDirectlyMatchesPreference(quote, '股价走势'),
    true,
  );
  assert.equal(
    reportServiceInternals.dataProDirectlyMatchesPreference(quote, '技术面走势'),
    false,
  );
});

test('collectively covers a compound preference without forcing one source to answer every subtopic', () => {
  const stock = {
    name: '示例科技',
    code: 'TEST1',
    focus: ['股价走势和行业动态'],
  };
  const contract = reportServiceInternals.buildPreferenceContract(stock, 'brief', null, [
    {
      id: 'D1',
      type: 'datapro',
      rows: [
        { 交易日期: '2026-07-23', 收盘价: 90 },
        { 交易日期: '2026-07-24', 收盘价: 92 },
        { 交易日期: '2026-07-27', 收盘价: 91 },
      ],
    },
    {
      id: 'W1',
      type: 'web_search',
      source_tier: 'official',
      title: '人工智能产业政策实施通知',
      publisher: '行业主管部门',
      content: '人工智能行业近期实施新的产业政策。',
      semantic_binding_checked: true,
      semantic_matches: [{
        preference: '行业动态',
        scope: 'external',
        quote: '人工智能行业近期实施新的产业政策。',
      }],
    },
  ])[0];
  const units = reportServiceInternals.preferenceContractUnits([contract]);

  assert.equal(contract.status, 'covered');
  assert.deepEqual(contract.evidence_ids, ['D1', 'W1']);
  assert.equal(units.find((item) => item.preference === '股价走势').status, 'covered');
  assert.equal(units.find((item) => item.preference === '行业动态').status, 'covered');
});

test('does not use generic company news to fill an uncovered brief preference', () => {
  const stock = {
    name: '示例消费',
    code: '600001.SH',
    focus: ['渠道库存'],
  };
  const evidence = [{
    id: 'W1',
    type: 'web_search',
    source_tier: 'media',
    title: '示例消费启动总部招聘',
    publisher: '界面新闻',
    content: '示例消费近日启动总部招聘计划。',
  }];

  assert.deepEqual(
    reportServiceInternals.deterministicContextSections(evidence, stock, 'brief'),
    [],
  );
  assert.equal(reportServiceInternals.readerSafeWebItem(evidence[0], stock, 'brief'), false);
});

test('adds a safe company operating source without claiming it covers another preference', () => {
  const stock = {
    name: '示例汽车',
    code: '000001.SZ',
    exchange: 'CN',
    focus: ['行业政策'],
  };
  const evidence = [{
    id: 'W1',
    type: 'web_search',
    source_tier: 'official',
    title: '新能源汽车行业管理政策发布',
    publisher: '行业主管部门',
    url: 'https://example.gov.cn/policy.html',
    content: '新能源汽车行业管理政策发布新的安全要求。',
    semantic_binding_checked: true,
    semantic_matches: [{
      preference: '行业政策',
      scope: 'external',
      quote: '新能源汽车行业管理政策发布新的安全要求。',
    }],
  }, {
    id: 'W2',
    type: 'web_search',
    source_tier: 'media',
    title: '示例汽车：6月新能源汽车产量403246辆',
    publisher: '第一财经',
    url: 'https://www.yicai.com/brief/example.html',
    content: '示例汽车公告称，6月新能源汽车产量403246辆，销量403472辆。',
  }];

  assert.equal(
    reportServiceInternals.readerSafeWebItem(evidence[1], stock, 'brief'),
    true,
  );
  const contract = reportServiceInternals.buildPreferenceContract(
    stock,
    'brief',
    null,
    evidence,
  );
  assert.deepEqual(contract[0].evidence_ids, ['W1']);

  const section = reportServiceInternals.deterministicContextSections(
    evidence,
    stock,
    'brief',
  ).find((item) => item.title === '关注方向');
  assert.ok(section);
  assert.deepEqual(section.claims.map((claim) => claim.evidence_ids), [['W1'], ['W2']]);
  assert.match(section.claims[1].text, /6月新能源汽车月度业务进展/);
  assert.doesNotMatch(section.claims[1].text, /403246|403472/);
});

test('requires every semantic facet of a compound preference to be present', () => {
  const cases = [
    {
      preference: '海外政策',
      matching: '欧洲市场监管政策发布新的合规要求',
      partial: '欧洲客户新增一笔订单',
    },
    {
      preference: '海外临床试验入组节奏',
      matching: '美国临床试验本周更新受试者入组节奏',
      partial: '美国市场销售团队完成调整',
    },
    {
      preference: '门店同店客流',
      matching: '公司披露核心门店同店客流出现变化',
      partial: '公司计划新增十家门店',
    },
    {
      preference: '海底数据中心订单',
      matching: '海底数据中心项目新增设备订单',
      partial: '数据中心行业需求上升',
    },
    {
      preference: '原材料价格',
      matching: '碳酸锂期价与原材料成本出现波动',
      partial: '钠电技术降低对部分材料的依赖',
    },
    {
      preference: '大模型技术迭代',
      matching: '公司持续推进大模型底座迭代升级，并同步优化相关技术能力。',
      partial: '人工智能行业需求保持活跃。',
    },
    {
      preference: '近期公告信息',
      matching: '公司披露2026年半年度业绩预告，并发布相关公告。',
      partial: '公司发布新一代智能体产品并推进商业化落地。',
    },
  ];
  for (const item of cases) {
    assert.equal(
      reportServiceInternals.preferenceTextMatches(item.preference, item.matching),
      true,
      `${item.preference} should match the complete evidence`,
    );
    assert.equal(
      reportServiceInternals.preferenceTextMatches(item.preference, item.partial),
      false,
      `${item.preference} must reject partial evidence`,
    );
  }
});

test('does not mark a preference covered when the article only matches a broad category', () => {
  const stock = {
    name: '星河能源',
    code: '688889',
    exchange: 'CN',
    focus: ['原材料价格', '海外政策'],
  };
  const contract = reportServiceInternals.buildPreferenceContract(stock, 'brief', null, [{
    id: 'W1',
    type: 'web_search',
    source_tier: 'media',
    title: '星河能源欧洲订单取得进展',
    publisher: '第一财经',
    content: '星河能源与欧洲客户签署设备订单，钠电技术降低对部分材料的依赖。',
  }]);
  assert.deepEqual(contract.filter((item) => !item.is_system_core).map(({
    preference,
    status,
    evidence_ids: evidenceIds,
  }) => ({
    preference,
    status,
    evidence_ids: evidenceIds,
  })), [
    { preference: '原材料价格', status: 'watch', evidence_ids: [] },
    { preference: '海外政策', status: 'watch', evidence_ids: [] },
  ]);
});

test('does not combine unrelated sentences into one preference match', () => {
  const evidence = {
    id: 'W1',
    type: 'web_search',
    source_tier: 'media',
    title: '星河能源钠电项目取得进展',
    publisher: '第一财经',
    content: '公司介绍了新的材料技术路线。另一业务板块公布了产品销售价格。',
  };
  assert.equal(
    reportServiceInternals.evidenceDirectlyMatchesPreference(evidence, '原材料价格'),
    false,
  );
});

test('uses a verified semantic source binding when the source omits the user wording', async () => {
  const fixture = createFixture({
    focus: ['大模型技术迭代'],
    semanticPreferenceEnabled: true,
    semanticQueryPlan: {
      queries: [{
        preference: '大模型技术迭代',
        scope: 'company',
        query: '示例科技 TEST1 大模型技术迭代 基座模型 智能体 AIPC 最新进展',
      }],
    },
    semanticEvidenceBindings: {
      matches: [{
        candidate_id: 'S1',
        preference: '大模型技术迭代',
        scope: 'company',
        quote: '讯飞星火大模型面向智能终端提供多模态交互能力，并支持行业智能体落地。',
      }],
    },
    webItems: [{
      title: '示例科技发布星火智能终端最新进展',
      publisher: '新华网',
      url: 'https://www.xinhuanet.com/tech/example-ai.html',
      summary: '讯飞星火大模型面向智能终端提供多模态交互能力，并支持行业智能体落地。',
      published_at: '2026-07-21',
    }],
  });

  const report = await fixture.service.generate({ stockId: fixture.stock.id, type: 'brief' });
  const focusSection = report.report.analysis.sections.find((section) => section.title === '关注方向');

  assert.ok(focusSection);
  assert.match(focusSection.claims[0].text, /围绕“大模型技术迭代”/);
  assert.match(focusSection.claims[0].text, /多模态交互能力/);
  assert.equal(report.report.preference_coverage[0].status, 'covered');
  assert.equal(report.report.evidence.find((item) => item.id === 'W1').semantic_matches[0].quote,
    '讯飞星火大模型面向智能终端提供多模态交互能力，并支持行业智能体落地。');
  assert.equal(fixture.getWebQueries().some(({ query, options }) => (
    query.includes('大模型技术迭代') && options.queryRewrite === true
  )), true);
  assert.deepEqual(fixture.callOrder.slice(0, 2), ['model_query_plan', 'datapro']);
  assert.ok(fixture.callOrder.includes('model_source_binding'));
});

test('semantic bindings preserve an official source tier through final curation', () => {
  const stock = {
    name: '示例汽车',
    code: '000001.SZ',
    exchange: 'CN',
    focus: ['行业动态'],
  };
  const rawItem = {
    title: '关于调整新能源汽车车船税优惠政策的公告',
    publisher: '财政部、税务总局、工业和信息化部',
    url: 'https://example.chinatax.gov.cn/policy/notice.html',
    summary: '自2027年1月1日起，新能源汽车车船税优惠政策将按公告进行调整。',
    published_at: '2026-07-08T14:20:00+08:00',
  };
  const candidates = reportServiceInternals.semanticCandidateItems(
    [rawItem],
    stock,
    {},
  );
  assert.equal(candidates[0].source_tier, 'official');
  const bound = reportServiceInternals.attachSemanticBindings(
    [rawItem],
    candidates,
    new Map([['S1', [{
      preference: '行业动态',
      scope: 'external',
      quote: '自2027年1月1日起，新能源汽车车船税优惠政策将按公告进行调整。',
    }]]]),
  );
  assert.equal(bound[0].source_tier, 'official');

  const curated = reportServiceInternals.curateWebItems(bound, stock, {
    requireStockInTitle: true,
    requireSubstantiveBusiness: true,
    semanticBindingRequired: true,
    preferenceBindingRequired: true,
  });
  assert.equal(curated.length, 1);
  assert.equal(curated[0].source_tier, 'official');
});

test('drops semantic bindings whose quote is not present in the source text', () => {
  const candidates = [{
    semantic_candidate_id: 'S1',
    title: '示例科技技术进展',
    publisher: '新华网',
    source_tier: 'media',
    content: '示例科技披露智能终端产品进展。',
  }];
  const bindings = reportServiceInternals.validateSemanticEvidenceBindings({
    matches: [{
      candidate_id: 'S1',
      preference: '大模型技术迭代',
      scope: 'company',
      quote: '不存在于来源中的模型升级事实。',
    }],
  }, { focus: ['大模型技术迭代'] }, candidates);
  assert.equal(bindings.size, 0);
});

test('does not bind a non-official media metric as a reader-facing preference fact', () => {
  const bindings = reportServiceInternals.validateSemanticEvidenceBindings({
    matches: [{
      candidate_id: 'S1', preference: '算力投入', scope: 'external',
      quote: '上半年新增智能算力2.2万P，供给规模达8.2万P。',
    }],
  }, { focus: ['算力投入'] }, [{
    semantic_candidate_id: 'S1', source_tier: 'media',
    content: '上半年新增智能算力2.2万P，供给规模达8.2万P。',
  }]);
  assert.equal(bindings.size, 0);
});

test('requires industry-level context before binding an industry-dynamics preference', () => {
  const stock = { focus: ['行业动态'] };
  const companyOnly = [{
    semantic_candidate_id: 'S1',
    source_tier: 'media',
    content: '比亚迪公告称，6月公司新能源汽车产量403246辆。',
  }];
  const industryContext = [{
    semantic_candidate_id: 'S2',
    source_tier: 'media',
    content: '新能源乘用车市场竞争加剧，插混车型市场份额结构继续变化。',
  }];

  assert.equal(reportServiceInternals.validateSemanticEvidenceBindings({
    matches: [{
      candidate_id: 'S1',
      preference: '行业动态',
      scope: 'company',
      quote: companyOnly[0].content,
    }],
  }, stock, companyOnly).size, 0);
  assert.equal(reportServiceInternals.validateSemanticEvidenceBindings({
    matches: [{
      candidate_id: 'S2',
      preference: '行业动态',
      scope: 'external',
      quote: industryContext[0].content,
    }],
  }, stock, industryContext).size, 1);
});

test('rejects sales activity as proof of channel inventory or brand advantage', () => {
  const quote = '53度500ml飞天贵州茅台酒等核心产品陆续在“i茅台”App上架销售，已连续6个月“秒空”。';
  const candidates = [{
    semantic_candidate_id: 'S1',
    title: '贵州茅台回应市场热点',
    publisher: '第一财经',
    source_tier: 'media',
    content: quote,
  }];
  const bindings = reportServiceInternals.validateSemanticEvidenceBindings({
    matches: [{
      candidate_id: 'S1',
      preference: '渠道库存',
      scope: 'company',
      quote,
    }, {
      candidate_id: 'S1',
      preference: '品牌优势',
      scope: 'company',
      quote,
    }],
  }, {
    name: '贵州茅台',
    code: '600519',
    exchange: 'CN',
    focus: ['渠道库存', '品牌优势'],
  }, candidates);

  assert.equal(bindings.size, 0);
});

test('rejects an AI-product binding to an unrelated supply-chain product quote', () => {
  const stock = {
    name: 'Apple',
    code: 'AAPL',
    exchange: 'US',
    focus: ['AI 产品进展'],
  };
  const candidates = [{
    semantic_candidate_id: 'S1',
    title: '机构密集调研 苹果产业链公司',
    publisher: '中国经济网',
    source_tier: 'media',
    content: '公司面向全球客户提供AI终端一体化热管理解决方案，产品矩阵覆盖多种散热材料。',
  }];
  const bindings = reportServiceInternals.validateSemanticEvidenceBindings({
    matches: [{
      candidate_id: 'S1',
      preference: 'AI产品进展',
      scope: 'external',
      quote: candidates[0].content,
    }],
  }, stock, candidates);

  assert.equal(bindings.size, 0);
});

test('accepts company-anchored AI progress and branded iPhone demand evidence', () => {
  const stock = {
    name: 'Apple',
    code: 'AAPL',
    exchange: 'US',
    focus: ['AI 产品进展', 'iPhone 需求'],
  };
  const candidates = [{
    semantic_candidate_id: 'S1',
    title: 'Apple智能服务完成备案',
    publisher: '财联社',
    source_tier: 'media',
    content: 'Apple智能提供手机端侧生成式人工智能服务并完成备案，相关AI能力已集成至苹果智能。',
  }, {
    semantic_candidate_id: 'S2',
    title: '机构密集调研 苹果产业链公司',
    publisher: '中国经济网',
    source_tier: 'media',
    content: '进入7月，苹果iPhone 18系列手机已在量产，正处于产能爬坡阶段。',
  }];
  const bindings = reportServiceInternals.validateSemanticEvidenceBindings({
    matches: [{
      candidate_id: 'S1',
      preference: 'AI产品进展',
      scope: 'company',
      quote: candidates[0].content,
    }, {
      candidate_id: 'S2',
      preference: 'iPhone需求',
      scope: 'external',
      quote: candidates[1].content,
    }],
  }, stock, candidates);

  assert.equal(bindings.size, 2);
});

test('recovers a source-backed preference when a mixed semantic batch returns no matches', async () => {
  const quote = '示例科技发布新一代大模型能力，并推进智能体在行业场景落地。';
  const fixture = createFixture({
    focus: ['大模型技术迭代'],
    semanticPreferenceEnabled: true,
    semanticQueryPlan: { queries: [] },
    semanticEvidenceBindings: [
      { matches: [] },
      {
        matches: [{
          candidate_id: 'S1',
          preference: '大模型技术迭代',
          scope: 'company',
          quote,
        }],
      },
    ],
    webItems: [{
      title: '示例科技披露智能体业务进展',
      publisher: '新华网',
      url: 'https://www.xinhuanet.com/tech/example-ai-recovery.html',
      summary: quote,
      published_at: '2026-07-21',
    }],
  });
  const report = await fixture.service.generate({ stockId: fixture.stock.id, type: 'brief' });
  const focusSection = report.report.analysis.sections.find((section) => section.title === '关注方向');

  assert.equal(report.report.quality_controls.semantic_source_binding, 'ready');
  assert.equal(report.report.preference_coverage[0].status, 'covered');
  assert.ok(focusSection);
  assert.match(focusSection.claims[0].text, /围绕“大模型技术迭代”/);
  assert.ok(fixture.callOrder.filter((item) => item === 'model_source_binding').length >= 2);
});

test('falls back to conservative lexical matching when semantic binding accepts no source', async () => {
  const fixture = createFixture({
    focus: ['近期公告'],
    semanticPreferenceEnabled: true,
    semanticQueryPlan: { queries: [] },
    semanticEvidenceBindings: [
      { matches: [] },
      { matches: [] },
    ],
    webItems: [{
      title: '示例科技发布近期经营公告',
      publisher: '上海证券交易所',
      url: 'https://www.sse.com.cn/example-notice.html',
      summary: '示例科技发布近期经营公告，披露智能终端业务最新进展。',
      published_at: '2026-07-21',
    }],
  });
  const report = await fixture.service.generate({ stockId: fixture.stock.id, type: 'brief' });

  assert.equal(report.report.quality_controls.semantic_source_binding, 'fallback');
  assert.equal(report.report.evidence.some((item) => item.type === 'web_search'), true);
});
test('monitor reader report drops an unbound public source even when the model cited it', () => {
  const report = reportServiceInternals.restrictMonitorReaderReport({
    summary: '新浪财经报道物流行业竞争变化。',
    summary_evidence_ids: ['W1'],
    sections: [
      {
        title: '市场异动',
        claims: [{ text: '示例科技最新价为100。', evidence_ids: ['D1'] }],
      },
      {
        title: '外部风险',
        claims: [{ text: '新浪财经报道物流行业竞争变化。', evidence_ids: ['W1'] }],
      },
    ],
    conclusion: { text: '新浪财经报道物流行业竞争变化。', evidence_ids: ['W1'] },
  }, [
    { id: 'D1', type: 'datapro', rows: [{ 最新价: 100, 涨跌幅: 1.01 }] },
    {
      id: 'W1', type: 'web_search', title: '物流行业报道',
      content: '物流行业竞争变化。', semantic_matches: [],
    },
  ], { focus: ['大模型技术迭代'] });
  assert.deepEqual(report.sections.map((section) => section.title), ['市场异动']);
  assert.match(report.summary, /示例科技最新价为100/);
  assert.deepEqual(report.summary_evidence_ids, ['D1']);
  assert.match(report.conclusion.text, /示例科技最新价为100/);
  assert.deepEqual(report.conclusion.evidence_ids, ['D1']);
});

test('monitor reader report rejects a company-related source that cannot support its cited section', () => {
  const quote = '示例科技要求供应链企业协商下调零部件采购价格。';
  const report = reportServiceInternals.restrictMonitorReaderReport({
    summary: quote,
    summary_evidence_ids: ['W1'],
    sections: [
      {
        title: '市场异动',
        claims: [
          { text: '示例科技最新价为100。', evidence_ids: ['D1'] },
          { text: quote, evidence_ids: ['W1'] },
        ],
      },
    ],
    conclusion: { text: quote, evidence_ids: ['W1'] },
  }, [
    {
      id: 'D1',
      type: 'datapro',
      rows: [{ 最新价: 100, 涨跌幅: 1.01 }],
    },
    {
      id: 'W1',
      type: 'web_search',
      source_tier: 'media',
      title: '示例科技与供应链企业协商采购价格',
      content: quote,
      semantic_matches: [{
        preference: '供应链成本',
        scope: 'company',
        quote,
      }],
    },
  ], { name: '示例科技', code: 'TEST1', focus: ['供应链成本'] });

  assert.equal(report.sections.length, 1);
  assert.deepEqual(report.sections[0].claims.map((claim) => claim.evidence_ids), [['D1']]);
  assert.match(report.summary, /最新价为100/);
  assert.deepEqual(report.summary_evidence_ids, ['D1']);
});

test('monitor rejects a semantically matched media article that does not concern the tracked company', () => {
  const genericIndustryArticle = {
    id: 'W1',
    type: 'web_search',
    source_tier: 'media',
    title: '大模型行业技术迭代加速',
    publisher: '新浪财经',
    content: '大模型行业技术迭代加速，行业竞争格局仍在变化。',
    semantic_matches: [{
      preference: '大模型技术迭代',
      scope: 'external',
      quote: '大模型行业技术迭代加速，行业竞争格局仍在变化。',
    }],
  };
  const stock = { name: '示例科技', code: 'TEST1', focus: ['大模型技术迭代'] };

  assert.equal(reportServiceInternals.hasVerifiedMonitorBinding(genericIndustryArticle, stock), false);
  assert.equal(reportServiceInternals.deterministicWebSection([genericIndustryArticle], stock, 'monitor'), null);
});

test('monitor permits an authoritative external policy source with a verified preference match', () => {
  const officialPolicy = {
    id: 'W1',
    type: 'web_search',
    source_tier: 'official',
    title: '人工智能产业政策实施通知',
    publisher: '工业和信息化主管部门',
    content: '人工智能产业政策于本月起实施，涉及大模型服务的安全评估要求。',
    semantic_matches: [{
      preference: '行业政策与竞争环境',
      scope: 'external',
      quote: '人工智能产业政策于本月起实施，涉及大模型服务的安全评估要求。',
    }],
  };
  const stock = { name: '示例科技', code: 'TEST1', focus: ['行业政策与竞争环境'] };

  assert.equal(reportServiceInternals.hasVerifiedMonitorBinding(officialPolicy, stock), true);
});

test('monitor classifies a semantically bound external preference as external risk', () => {
  const [preference] = reportServiceInternals.buildPreferenceContract({
    name: '示例科技', code: 'TEST1', focus: ['大模型技术迭代'],
  }, 'monitor', null, [{
    id: 'W1',
    type: 'web_search',
    title: '大模型行业技术迭代加速',
    semantic_matches: [{
      preference: '大模型技术迭代',
      scope: 'external',
      quote: '大模型行业技术迭代加速，行业竞争格局仍在变化。',
    }],
  }]);
  assert.equal(preference.status, 'covered');
  assert.equal(preference.expected_section, '外部风险');
});

test('monitor separates its base company-event coverage from the user preference', () => {
  const contracts = reportServiceInternals.buildPreferenceContract({
    name: '示例科技', code: 'TEST1', focus: ['股价走势和行业动态'],
  }, 'monitor', null, [{
    id: 'W1',
    type: 'web_search',
    source_tier: 'media',
    title: '示例科技启动新产线招聘',
    publisher: '界面新闻',
    content: '界面新闻报道，示例科技启动新产线招聘。',
    semantic_binding_checked: true,
  }]);
  const core = contracts.find((item) => item.is_system_core);
  assert.equal(contracts[0].status, 'watch');
  assert.deepEqual(core, {
    preference: '__core_company_events__',
    display_label: '公司事件',
    category: 'core_monitor',
    expected_section: '公司事件',
    status: 'covered',
    evidence_ids: ['W1'],
    is_system_core: true,
  });
});

test('monitor does not force a core company event from recent background', () => {
  const contracts = reportServiceInternals.buildPreferenceContract({
    name: '示例科技', code: 'TEST1', focus: ['行业动态'],
  }, 'monitor', null, [{
    id: 'W1',
    type: 'web_search',
    source_tier: 'media',
    title: '示例科技上周业务进展回顾',
    publisher: '界面新闻',
    content: '界面新闻回顾示例科技上周业务进展。',
    monitor_role: 'recent_context',
  }]);
  assert.equal(
    contracts.some((item) => item.preference === '__core_company_events__'),
    false,
  );
});

test('monitor routes company events separately when a compound preference also has external context', () => {
  const stock = { name: '示例科技', code: 'TEST1', focus: ['股价走势和行业动态'] };
  const sections = reportServiceInternals.deterministicContextSections([
    {
      id: 'W1',
      type: 'web_search',
      source_tier: 'official',
      title: '新能源汽车产业政策实施通知',
      publisher: '工业和信息化主管部门',
      content: '动力电池供应链相关产业政策实施。',
      semantic_matches: [{
        preference: '行业动态',
        scope: 'external',
        quote: '动力电池供应链相关产业政策实施。',
      }],
    },
    {
      id: 'W2',
      type: 'web_search',
      source_tier: 'media',
      title: '示例科技启动新产线招聘',
      publisher: '界面新闻',
      content: '界面新闻报道，示例科技启动新产线招聘。',
    },
  ], stock, 'monitor');
  const company = sections.find((section) => section.title === '公司事件');
  const external = sections.find((section) => section.title === '外部风险');
  assert.deepEqual(company.claims.map((claim) => claim.evidence_ids), [['W2']]);
  assert.deepEqual(external.claims.map((claim) => claim.evidence_ids), [['W1']]);
});

test('monitor contracts separate base market, company events, and external preference evidence', () => {
  const stock = { name: '示例科技', code: 'TEST1', focus: ['股价走势和行业动态'] };
  const contracts = reportServiceInternals.buildPreferenceContract(stock, 'monitor', null, [
    {
      id: 'D1',
      type: 'datapro',
      rows: [{ 交易日期: '2026-07-27', 最新价: 91.89, 涨跌幅: '0 %' }],
    },
    {
      id: 'W1',
      type: 'web_search',
      source_tier: 'official',
      title: '新能源汽车产业政策实施通知',
      publisher: '工业和信息化主管部门',
      content: '动力电池供应链相关产业政策实施。',
      semantic_matches: [{
        preference: '行业动态',
        scope: 'external',
        quote: '动力电池供应链相关产业政策实施。',
      }],
    },
    {
      id: 'W2',
      type: 'web_search',
      source_tier: 'media',
      title: '示例科技启动新产线招聘',
      publisher: '界面新闻',
      content: '界面新闻报道，示例科技启动新产线招聘。',
    },
  ]);
  const userPreference = contracts.find((item) => !item.is_system_core);
  const userPreferenceUnits = reportServiceInternals.preferenceContractUnits([userPreference]);
  const industryPreference = userPreferenceUnits.find((item) => item.preference === '行业动态');
  const marketPreference = userPreferenceUnits.find((item) => item.preference === '股价走势');
  const companyCore = contracts.find((item) => item.preference === '__core_company_events__');
  const marketCore = contracts.find((item) => item.preference === '__core_market_context__');
  assert.equal(userPreference.status, 'covered');
  assert.deepEqual(userPreference.evidence_ids, ['D1', 'W1']);
  assert.equal(industryPreference.expected_section, '外部风险');
  assert.deepEqual(industryPreference.evidence_ids, ['W1']);
  assert.equal(marketPreference.status, 'covered');
  assert.deepEqual(marketPreference.evidence_ids, ['D1']);
  assert.deepEqual(companyCore.evidence_ids, ['W2']);
  assert.deepEqual(marketCore.evidence_ids, ['D1']);
});

test('does not let a generic keyword bypass a completed semantic binding pass', () => {
  const [preference] = reportServiceInternals.buildPreferenceContract({
    name: '示例科技',
    code: 'TEST1',
    focus: ['近期公告信息'],
  }, 'brief', null, [{
    id: 'W1',
    type: 'web_search',
    title: '某政府采购公告',
    publisher: '政府采购网',
    source_tier: 'official',
    semantic_binding_checked: true,
    content: '公告期限自本公告发布之日起三个工作日。地址中出现示例科技园区。',
  }]);
  assert.equal(preference.status, 'watch');
});

test('rejects generic exchange disclosure directories as reader-facing sources', () => {
  const items = reportServiceInternals.curateWebItems([{
    title: '深市主板 - 资本市场电子化信息披露平台-9630',
    publisher: '资本市场电子化信息披露平台',
    url: 'http://eid.csrc.gov.cn/201011/dtl-184.html',
    summary: '科大讯飞临时报告目录。',
    published_at: '2026-07-25',
  }], { name: '科大讯飞', code: '002230.SZ', exchange: 'CN' }, {
    requireStockInTitle: true,
  });
  assert.deepEqual(items, []);
});

test('creates exact follow-up searches for preferences that remain uncovered', () => {
  const queries = reportServiceInternals.preferenceRefinementQueries({
    name: '星河医药',
    code: '688889',
    focus: ['海外临床试验入组节奏', '财务表现'],
  }, 'brief', null, [{
    id: 'D1',
    type: 'datapro',
    title: '最新财务指标',
    content: '营业收入100亿元',
  }]);
  assert.equal(queries.length, 1);
  assert.match(queries[0].query, /星河医药 688889 海外临床试验入组节奏/);
  assert.equal(queries[0].queryRewrite, false);
});

test('locally rejects a preference paragraph that cites the right source but answers another topic', () => {
  assert.throws(() => reportServiceInternals.validatePreferenceCoverage({
    sections: [{
      title: '关注方向',
      claims: [{
        text: '第一财经报道，公司新增一笔欧洲设备订单。',
        evidence_ids: ['W1'],
      }],
    }, {
      title: '后续观察',
      claims: [{
        text: '后续继续观察公司公告。',
        evidence_ids: ['D1'],
      }],
    }],
  }, [{
    preference: '原材料价格',
    display_label: '原材料价格',
    expected_section: '关注方向',
    status: 'covered',
    evidence_ids: ['W1'],
  }]), (error) => (
    error.name === 'EvidenceValidationError'
    && error.details?.[0]?.type === 'preference_not_substantively_covered'
  ));
});

test('monitor preferences without evidence stay in audit metadata instead of forcing filler text', () => {
  assert.doesNotThrow(() => reportServiceInternals.validatePreferenceCoverage({
    sections: [{
      title: '后续观察',
      claims: [{
        text: '后续继续核对已引用的原材料价格变化。',
        evidence_ids: ['W1'],
      }],
    }],
  }, [{
    preference: '财务表现',
    display_label: '财务表现',
    expected_section: '公司事件',
    status: 'watch',
    evidence_ids: [],
  }], 'monitor'));

  const cleaned = reportServiceInternals.stripInternalCoverageClaims({
    sections: [{
      title: '后续观察',
      claims: [
        { text: '继续观察原材料成本传导。', evidence_ids: ['W1'] },
        { text: '用户监控配置包含财务表现。', evidence_ids: ['C1'] },
      ],
    }],
  }, [
    { id: 'C1', type: 'coverage' },
    { id: 'W1', type: 'web_search' },
  ], 'monitor');
  assert.deepEqual(cleaned.sections[0].claims, [
    { text: '继续观察原材料成本传导。', evidence_ids: ['W1'] },
  ]);
});

test('keeps a one-character preference in queries and evidence coverage', () => {
  const stock = { name: '星河材料', code: '688889', focus: ['锂'] };
  const monitor = reportServiceInternals.reportQueries(
    stock,
    'monitor',
    null,
    { now: new Date('2026-07-21T08:00:00.000Z'), timezone: 'Asia/Shanghai' },
  );
  assert.equal(monitor.web.some((item) => item.query.includes('锂')), true);
  const contract = reportServiceInternals.buildPreferenceContract(
    stock,
    'monitor',
    null,
    [{
      id: 'W1',
      type: 'web_search',
      title: '锂矿供应出现变化',
      content: '锂矿供应出现变化。',
    }],
  );
  assert.deepEqual(contract[0], {
    preference: '锂',
    display_label: '锂',
    category: 'raw_material',
    expected_section: '外部风险',
    status: 'covered',
    evidence_ids: ['W1'],
  });
});

test('starts an after-hours scan at the previous monitor generation time', () => {
  const stock = { name: '示例科技', code: 'TEST1', focus: ['监管问询'] };
  const monitor = reportServiceInternals.reportQueries(stock, 'monitor', null, {
    now: new Date('2026-07-22T10:00:00.000Z'),
    timezone: 'Asia/Shanghai',
    previous: { generated_at: '2026-07-21T10:15:00.000Z' },
  });
  assert.equal(monitor.window.start_at, '2026-07-21T10:15:00.000Z');
  assert.equal(monitor.window.start_label, '2026-07-21 18:15');
  assert.equal(monitor.window.end_label, '2026-07-22 18:00');
  assert.match(monitor.data[0], /2026-07-21 18:15 至 2026-07-22 18:00/);
});

test('saves a no-alert monitor result with an auditable coverage record', async () => {
  const fixture = createFixture({
    focus: ['海外客户合作'],
    semanticPreferenceEnabled: true,
    semanticQueryPlan: { queries: [] },
    webItems: [{
      title: '示例科技签署海外储能合作协议',
      publisher: '新浪财经',
      url: 'https://finance.sina.cn/notice',
      summary: '示例科技与海外客户签署储能合作协议，双方计划推进后续项目交付。',
      published_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    }],
    semanticEvidenceBindings: {
      matches: [{
        candidate_id: 'S1',
        preference: '海外客户合作',
        scope: 'company',
        quote: '示例科技与海外客户签署储能合作协议，双方计划推进后续项目交付。',
      }],
    },
    webSummary: '示例科技与海外客户签署储能合作协议，双方计划推进后续项目交付。',
  });
  const report = await fixture.service.generate({ stockId: fixture.stock.id, type: 'monitor' });
  assert.equal(report.report.monitor_outcome.status, 'no_new_signal');
  assert.equal(report.report.monitor_outcome.event_evidence_count, 0);
  assert.equal(report.report.analysis.risk_level, 'unknown');
  assert.match(report.report.analysis.summary, /最新价为100/);
  assert.match(report.report.analysis.summary, /签署储能合作协议/);
  assert.doesNotMatch(report.report.analysis.summary, /未发现需要升级|维持原有风险/);
  assert.deepEqual(report.report.evidence.map((item) => item.id), ['C1', 'D1', 'W1']);
  assert.deepEqual(report.report.analysis.sections.map((section) => section.title), [
    '市场异动', '公司事件',
  ]);
  assert.doesNotMatch(
    JSON.stringify(report.report.analysis),
    /DataPro字段|联网搜索返回|本条只证明|查询次数|本轮没有出现需要升级提示|近期行业与政策信息未形成/,
  );
  assert.match(JSON.stringify(report.report.analysis), /签署储能合作协议/);
  assert.deepEqual(fixture.callOrder.slice(0, 2), ['model_query_plan', 'datapro']);
  const generationIndex = fixture.callOrder.indexOf('model_generate');
  assert.ok(generationIndex > 3);
  assert.ok(fixture.callOrder.slice(3, generationIndex).every((call) => (
    call === 'web_search' || call === 'model_source_binding'
  )));
});

test('saves a market-only monitor result instead of presenting an unrelated web source', async () => {
  const fixture = createFixture({ webItems: [] });
  const report = await fixture.service.generate({ stockId: fixture.stock.id, type: 'monitor' });
  assert.equal(report.report.monitor_outcome.status, 'no_new_signal');
  assert.deepEqual(report.report.evidence.map((item) => item.id), ['C1', 'D1']);
  assert.ok(report.report.analysis.sections.some((section) => section.title === '市场异动'));
  assert.doesNotMatch(JSON.stringify(report.report.analysis), /新浪财经|物流行业/);
  assert.equal(fixture.getSavedCount(), 1);
});

test('labels a quote-only signal separately from a new company event', async () => {
  const fixture = createFixture({ marketChange: 4.2 });
  const report = await fixture.service.generate({ stockId: fixture.stock.id, type: 'monitor' });
  assert.equal(report.report.monitor_outcome.status, 'market_review');
  assert.equal(report.report.monitor_outcome.event_evidence_count, 0);
  assert.equal(report.report.monitor_outcome.market_signal_count, 1);
});

test('does not label an empty monitor window as new evidence after a legacy report', async () => {
  const fixture = createFixture({
    previousMonitor: {
      id: randomUUID(),
      generated_at: new Date(Date.now() - 3_600_000).toISOString(),
      evidence_fingerprint: 'legacy-snapshot-fingerprint',
      report: { analysis: { summary: '旧版盘后报告包含行情快照。' } },
    },
  });
  const report = await fixture.service.generate({ stockId: fixture.stock.id, type: 'monitor' });
  assert.equal(report.change_status, 'no_material_change');
  assert.equal(report.report.monitor_outcome.status, 'no_new_signal');
  assert.match(report.report.analysis.change_summary, /增量窗口内没有形成新的实质性公司事件证据/);
});

test('monitor event reports stay event-focused and exclude snapshot sections', async () => {
  const fixture = createFixture({
    monitorEvent: true,
    focus: ['近期公告信息'],
    semanticPreferenceEnabled: true,
    semanticQueryPlan: { queries: [] },
    semanticEvidenceBindings: {
      matches: [{
        candidate_id: 'S1',
        preference: '近期公告信息',
        scope: 'company',
        quote: '示例科技发布经营公告，披露智能终端业务最新进展。',
      }],
    },
    webSummary: '示例科技发布经营公告，披露智能终端业务最新进展。',
  });
  const report = await fixture.service.generate({ stockId: fixture.stock.id, type: 'monitor' });
  assert.equal(report.report.monitor_outcome.status, 'review');
  assert.equal(report.report.monitor_outcome.event_evidence_count, 1);
  assert.deepEqual(report.report.evidence.map((item) => item.id), ['C1', 'D1', 'W1']);
  const sectionTitles = report.report.analysis.sections.map((section) => section.title);
  assert.deepEqual(sectionTitles, ['市场异动', '公司事件']);
  assert.doesNotMatch(JSON.stringify(report.report.analysis), /行情快照|交易行情|市场表现|基本面快照|基本面观察|财务指标/);
});

test('omits only the regressed DataPro category and preserves current market evidence', async () => {
  const fixture = createFixture({ dataDates: ['2026年6月30日', '2026-06-29'] });
  await fixture.service.generate({ stockId: fixture.stock.id, type: 'brief' });
  const report = await fixture.service.generate({ stockId: fixture.stock.id, type: 'brief' });
  assert.equal(report.status, 'review_required');
  assert.equal(report.provider_status.datapro.code, 'STALE_PROVIDER_DATA');
  assert.equal(fixture.getWebCalls() > 3, true);
  const dataEvidence = report.report.evidence.filter((item) => item.type === 'datapro');
  assert.equal(dataEvidence.some((item) => (
    item.rows.some((row) => Object.hasOwn(row, '最新价'))
  )), true);
  assert.equal(dataEvidence.some((item) => (
    item.rows.some((row) => Object.hasOwn(row, '营业收入'))
  )), false);
});

test('prunes only unsupported section claims before semantic verification', async () => {
  const fixture = createFixture({ unsupportedClaim: true });
  const report = await fixture.service.generate({ stockId: fixture.stock.id, type: 'brief' });
  assert.equal(report.report.analysis.sections[0].claims.length, 1);
  assert.equal(report.report.quality_controls.pruned_unsupported_claims, 1);
  assert.equal(fixture.getModelCalls(), 2);
  const diagnostic = fixture.usageEvents.find((event) => (
    event.provider === 'local_validation'
    && event.operation === 'generated_report_validation'
  ));
  assert.equal(diagnostic.status, 'failed');
  assert.equal(diagnostic.metadata.issues[0].type, 'unsupported_numbers');
});

test('curates official and current media sources ahead of UGC and stale republishes', () => {
  const items = reportServiceInternals.curateWebItems([
    {
      title: '用户分析', publisher: '财富号', url: 'https://caifuhao.eastmoney.com/news/1',
      summary: '分析内容', published_at: '2026-07-20',
    },
    {
      title: '旧稿重发', publisher: '媒体', url: 'https://auto.sina.cn/a.html',
      summary: '2024年上半年数据', published_at: '2026-07-21',
    },
    {
      title: '最新公告', publisher: '示例科技集团', url: 'https://example-company.com/notices',
      summary: '公告目录', published_at: '2026-07-01',
    },
    {
      title: '当日新闻', publisher: '新浪财经', url: 'https://finance.sina.cn/a.html',
      summary: '2026年当日新闻', published_at: '2026-07-21',
    },
    {
      title: '开放网页传闻', publisher: '个人观察', url: 'https://example.net/rumor',
      summary: '未经权威来源确认的传闻', published_at: '2026-07-21',
    },
    {
      title: 'English market report', publisher: 'Global Media', url: 'https://finance.sina.cn/english',
      summary: 'English-only report', published_at: '2026-07-21',
    },
    {
      title: '新浪看点用户文章', publisher: '新浪看点', url: 'https://k.sina.cn/article_123.html',
      summary: '用户发布内容', published_at: '2026-07-21',
    },
  ], { name: '示例科技', exchange: 'CN' });
  assert.deepEqual(items.map((item) => item.title), ['最新公告', '当日新闻']);
  assert.deepEqual(items.map((item) => item.source_tier), ['official', 'media']);
});

test('monitor curation keeps both company and external context sources', () => {
  const items = reportServiceInternals.curateWebItems([
    {
      title: '新能源汽车安全标准正式实施', publisher: '中国经济网',
      url: 'https://www.ce.cn/article/standard', summary: '行业标准变化', published_at: '2026-07-22',
    },
    {
      title: '新能源汽车消费政策持续落地', publisher: '中证网',
      url: 'https://www.cs.com.cn/article/policy', summary: '行业政策变化', published_at: '2026-07-21',
    },
    {
      title: '示例科技海外工厂迎来新进展', publisher: '新浪财经',
      url: 'https://finance.sina.cn/article/company', summary: '公司产能动态', published_at: '2026-07-18',
    },
  ], { name: '示例科技', code: '000001', exchange: 'CN' }, {
    diversifyByStock: true,
    maxItems: 3,
  });
  assert.equal(items[0].title, '示例科技海外工厂迎来新进展');
  assert.equal(items[1].title, '新能源汽车安全标准正式实施');
  assert.equal(items.length, 3);
});

test('curation prefers fresh sources while retaining reused sources as a fallback', () => {
  const reused = {
    title: '示例科技发布经营进展', publisher: '新浪财经',
    url: 'https://finance.sina.cn/article/reused', summary: '公司经营进展', published_at: '2026-07-22',
  };
  const fresh = {
    title: '示例科技披露海外业务动态', publisher: '第一财经',
    url: 'https://www.yicai.com/brief/fresh', summary: '公司海外业务动态', published_at: '2026-07-21',
  };
  const items = reportServiceInternals.curateWebItems([reused, fresh], {
    name: '示例科技', code: '000001', exchange: 'CN',
  }, {
    deprioritizeSources: [reused],
    maxItems: 2,
  });
  assert.deepEqual(items.map((item) => item.title), [fresh.title, reused.title]);
});

test('brief curation prioritizes operating disclosures over generic company stories', () => {
  const items = reportServiceInternals.curateWebItems([{
    title: '示例科技海外工厂迎来新进展', publisher: '新浪财经',
    url: 'https://finance.sina.cn/article/factory', summary: '海外工厂动态', published_at: '2026-07-22',
  }, {
    title: '示例科技发布月度产销公告', publisher: '第一财经',
    url: 'https://www.yicai.com/brief/production', summary: '月度产销数据', published_at: '2026-07-21',
  }], { name: '示例科技', code: '000001', exchange: 'CN' }, {
    preferredTitleTerms: ['公告', '产销', '销量', '产量', '业绩', '财报', '经营'],
    maxItems: 2,
  });
  assert.deepEqual(items.map((item) => item.title), [
    '示例科技发布月度产销公告',
    '示例科技海外工厂迎来新进展',
  ]);
});

test('brief curation rejects exchange search and stock profile pages as article sources', () => {
  const items = reportServiceInternals.curateWebItems([
    {
      title: '深圳证券交易所-搜索页面', publisher: '深圳证券交易所',
      url: 'https://www.szse.cn/application/search/index.html?keyword=示例科技',
      summary: '搜索结果 示例科技：2026年半年度业绩预告', published_at: '2026-07-21',
    },
    {
      title: '示例科技股份有限公司 000001', publisher: '深圳证券交易所',
      url: 'https://www.szse.cn/company/000001',
      summary: '公司概况和历史监管记录', published_at: '2026-07-21',
    },
    {
      title: '示例科技：2026年半年度业绩预告', publisher: '深圳证券交易所',
      url: 'https://www.szse.cn/disclosure/example',
      summary: '示例科技发布2026年半年度业绩预告。', published_at: '2026-07-15',
    },
  ], { name: '示例科技', code: '000001', exchange: 'CN', focus: ['近期公告信息'] }, {
    requireStockInTitle: true,
    requireSubstantiveBusiness: true,
    maxItems: 3,
  });
  assert.deepEqual(items.map((item) => item.title), ['示例科技：2026年半年度业绩预告']);
});

test('curation excludes a single-media product-price article with no reader-safe fact', () => {
  const stock = { name: '示例白酒', code: '600001.SH', exchange: 'CN', focus: ['品牌优势'] };
  const items = reportServiceInternals.curateWebItems([
    {
      title: '示例白酒公布渠道升级计划',
      publisher: '第一财经',
      url: 'https://www.yicai.com/news/100001.html',
      content: '示例白酒披露渠道升级计划，重点优化直营网点服务与经销商协同机制。',
      published_at: '2026-07-24',
    },
    {
      title: '示例白酒500ml产品价格调整为1599元',
      publisher: '新华网',
      url: 'https://www.xinhuanet.com/enterprise/100002.html',
      content: '示例白酒500ml产品价格调整为1599元。责任编辑：李明。',
      published_at: '2026-07-24',
    },
  ], stock, {
    requireStockInTitle: true,
    requireSubstantiveBusiness: true,
  });
  assert.deepEqual(items.map((item) => item.title), ['示例白酒公布渠道升级计划']);
});

test('excludes web articles already used by the other report type', () => {
  const repeated = {
    title: '示例科技发布经营公告',
    publisher: '新浪财经',
    url: 'https://finance.sina.cn/article/1?utm_source=feed',
    summary: '经营公告内容',
    published_at: '2026-07-21',
  };
  const items = reportServiceInternals.curateWebItems([
    repeated,
    {
      title: '行业主管部门发布新规',
      publisher: '示例监管部门',
      url: 'https://www.gov.cn/policy/2',
      summary: '行业政策内容',
      published_at: '2026-07-21',
    },
  ], { name: '示例科技', exchange: 'CN' }, {
    excludeSources: [{ ...repeated, url: 'https://finance.sina.cn/article/1?utm_source=other' }],
  });
  assert.deepEqual(items.map((item) => item.title), ['行业主管部门发布新规']);
});

test('rejects self-media, generic quote pages, and untrusted aggregators', () => {
  const items = reportServiceInternals.curateWebItems([
    {
      title: '自媒体风险爆料', publisher: '网易新闻客户端', url: 'https://c.m.163.com/news/a/1.html',
      summary: '未经核验的内容', published_at: '2026-07-21',
    },
    {
      title: '示例科技(sz000001)行情走势', publisher: '证券时报', url: 'https://www.stcn.com/quotes/1',
      summary: '行情页面', published_at: '2026-07-21',
    },
    {
      title: '示例科技资讯公告-PC_HSF10资料', publisher: '东方财富', url: 'https://emweb.eastmoney.com/1',
      summary: '聚合目录', published_at: '2026-07-21',
    },
    {
      title: '示例科技发布月度经营数据', publisher: '第一财经', url: 'https://www.yicai.com/brief/1',
      summary: '经营数据报道', published_at: '2026-07-21',
    },
  ], { name: '示例科技', exchange: 'CN' });
  assert.deepEqual(items.map((item) => item.title), ['示例科技发布月度经营数据']);
});

test('requires brief source titles to name the tracked stock and rejects stock-only quote titles', () => {
  const items = reportServiceInternals.curateWebItems([
    {
      title: '从新与旧看产业动能', publisher: '中国新闻网', url: 'https://www.chinanews.com.cn/a',
      summary: '正文提到示例科技', published_at: '2026-07-21',
    },
    {
      title: '示例科技（sz000001）', publisher: '证券时报', url: 'https://www.stcn.com/quotes/1',
      summary: '行情页', published_at: '2026-07-21',
    },
    {
      title: '示例科技发布经营进展', publisher: '第一财经', url: 'https://www.yicai.com/brief/1',
      summary: '经营进展', published_at: '2026-07-21',
    },
  ], { name: '示例科技', code: '000001', exchange: 'CN' }, { requireStockInTitle: true });
  assert.deepEqual(items.map((item) => item.title), ['示例科技发布经营进展']);
});

test('brief curation accepts a trusted external article that directly answers a preference', () => {
  const stock = {
    name: '星河能源',
    code: '688889',
    exchange: 'CN',
    focus: ['原材料价格'],
  };
  const items = reportServiceInternals.curateWebItems([{
    title: '碳酸锂期价本周出现波动',
    publisher: '证券时报',
    url: 'https://www.stcn.com/article/123',
    summary: '碳酸锂期价本周上涨，现货价格同步变化。',
    published_at: '2026-07-23',
  }], stock, {
    requireStockInTitle: true,
    requireSubstantiveBusiness: true,
  });
  assert.deepEqual(items.map((item) => item.title), ['碳酸锂期价本周出现波动']);
});

test('brief keeps distinct facts from the same publisher for the same covered preference', () => {
  const section = reportServiceInternals.deterministicWebSection([
    {
      id: 'W1', type: 'web_search', source_tier: 'media',
      title: '示例科技披露行业政策应对安排', publisher: '第一财经',
      content: '示例科技披露了行业政策变化后的供应链应对安排。',
      published_at: '2026-07-20',
    },
    {
      id: 'W2', type: 'web_search', source_tier: 'media',
      title: '示例科技更新行业政策执行进展', publisher: '证券时报',
      content: '示例科技披露了行业政策执行进展和相关业务调整。',
      published_at: '2026-07-21',
    },
    {
      id: 'W3', type: 'web_search', source_tier: 'media',
      title: '示例科技回应行业政策影响', publisher: '第一财经',
      content: '示例科技回应行业政策对经营安排的影响。',
      published_at: '2026-07-22',
    },
  ], { name: '示例科技', code: '000001', focus: ['行业政策'] }, 'brief');
  assert.equal(section.title, '关注方向');
  assert.deepEqual(section.claims.map((claim) => claim.evidence_ids[0]), ['W1', 'W2', 'W3']);
});

test('brief curation removes different URLs that repeat the same verified semantic fact', () => {
  const stock = {
    name: '示例汽车',
    code: 'TEST1',
    exchange: 'CN',
    focus: ['行业动态'],
  };
  const sharedQuote = '新能源汽车行业政策明确，自2027年1月1日起，取消对节能汽车减半征收车船税政策，取消对新能源汽车免征车船税政策。';
  const items = [{
    title: '新能源汽车车船税优惠政策调整问答',
    publisher: '财政主管部门',
    url: 'https://example.gov.cn/policy/answer.html',
    published_at: '2026-07-13T10:00:00+08:00',
    source_tier: 'official',
    content: `政策问答明确，${sharedQuote}`,
    semantic_matches: [{
      preference: '行业动态',
      scope: 'external',
      quote: sharedQuote,
    }],
  }, {
    title: '关于调整新能源汽车车船税优惠政策的公告',
    publisher: '税务主管部门',
    url: 'https://example.gov.cn/policy/notice.html',
    published_at: '2026-07-08T10:00:00+08:00',
    source_tier: 'official',
    content: sharedQuote,
    semantic_matches: [{
      preference: '行业动态',
      scope: 'external',
      quote: sharedQuote,
    }],
  }];

  const curated = reportServiceInternals.curateWebItems(items, stock, {
    maxItems: 3,
    semanticBindingRequired: true,
    preferenceBindingRequired: true,
  });
  assert.equal(curated.length, 1);
  assert.equal(
    reportServiceInternals.sourcesRepeatSemanticClaim(items[0], items[1]),
    true,
  );
});

test('brief curation rejects company lifestyle content unrelated to business or preferences', () => {
  const stock = { name: '晨星科技', code: '000999', exchange: 'CN', focus: ['海底数据中心订单'] };
  const items = reportServiceInternals.curateWebItems([
    {
      title: '晨星科技举办员工运动会',
      publisher: '第一财经',
      url: 'https://www.yicai.com/news/sports',
      summary: '晨星科技员工参加趣味运动会，现场气氛热烈。',
      published_at: '2026-07-21',
    },
    {
      title: '晨星科技披露海底数据中心项目订单',
      publisher: '第一财经',
      url: 'https://www.yicai.com/news/order',
      summary: '公司披露海底数据中心项目新增设备订单。',
      published_at: '2026-07-21',
    },
  ], stock, {
    requireStockInTitle: true,
    requireSubstantiveBusiness: true,
  });
  assert.deepEqual(items.map((item) => item.title), ['晨星科技披露海底数据中心项目订单']);
});

test('US curation accepts a trusted English source from a ticker-bound company query', () => {
  const stock = { name: '苹果', code: 'AAPL', exchange: 'US', focus: ['产品收入'] };
  const items = reportServiceInternals.curateWebItems([
    {
      title: 'Apple reports quarterly product revenue',
      publisher: 'Reuters',
      url: 'https://www.reuters.com/technology/apple-results',
      summary: 'Apple disclosed quarterly product revenue and demand trends.',
      published_at: '2026-07-21',
      search_query: '苹果 AAPL 最新公告 定期报告 经营进展',
    },
    {
      title: 'Apple newsroom update',
      publisher: 'Apple',
      url: 'https://www.apple.com/newsroom/update',
      summary: 'Apple published a product update.',
      published_at: '2026-07-21',
      search_query: '苹果 AAPL 最新公告 定期报告 经营进展',
    },
  ], stock, {
    requireStockInTitle: true,
    requireSubstantiveBusiness: true,
  });
  assert.deepEqual(items.map((item) => item.publisher), ['Reuters']);
});

test('rejects generic official directories and keeps monitor article pages matching the tracked topic', () => {
  const stock = { name: '示例科技', code: '000001', exchange: 'CN', focus: ['新能源汽车竞争'] };
  const terms = reportServiceInternals.monitorTitleTerms(stock);
  const items = reportServiceInternals.curateWebItems([
    {
      title: '国家市场监督管理总局', publisher: '国家市场监督管理总局',
      url: 'https://www.samr.gov.cn/', summary: '网站首页', published_at: '2026-07-21',
    },
    {
      title: '政声传递_新闻动态_某市人民政府', publisher: '某市人民政府',
      url: 'https://www.example.gov.cn/news', summary: '新能源汽车维修安全国标将实施', published_at: '2026-07-21',
    },
    {
      title: '新能源汽车维修安全国标将实施', publisher: '某省司法厅',
      url: 'https://sft.example.gov.cn/article/1', summary: '国家标准将实施。', published_at: '2026-07-21',
    },
  ], stock, { requiredTitleTerms: terms });
  assert.deepEqual(items.map((item) => item.title), ['新能源汽车维修安全国标将实施']);
});

test('rejects a publisher homepage even when query parameters and page text mention the stock', () => {
  const items = reportServiceInternals.curateWebItems([{
    title: '财联社-主流财经新闻集团和财经通讯社-cls.cn',
    publisher: '财联社',
    url: 'https://www.cls.cn/?rid=6003',
    summary: '示例科技供应链价格变化，页面同时包含其他公司涨幅榜和市场排行。',
    published_at: '2026-07-21',
  }], {
    name: '示例科技',
    code: 'TEST1',
    exchange: 'CN',
    focus: ['供应链成本'],
  });

  assert.deepEqual(items, []);
});

test('rejects policy-directory pages even when their host is official', () => {
  const items = reportServiceInternals.curateWebItems([{
    title: '外地政策_ 政策法规_信用中国(河北博野县)',
    publisher: '信用中国(河北保定)',
    url: 'http://xy.baoding.gov.cn/boyexian/news/index/468959880045133824?pageNum=1',
    summary: '政策法规目录', published_at: '2026-07-20',
  }], { name: '示例科技', exchange: 'CN' });
  assert.deepEqual(items, []);
});

test('monitor curation only keeps event-like sources published inside its delta window', () => {
  const stock = { name: '示例科技', code: '000001', exchange: 'CN', focus: ['经营风险'] };
  const items = reportServiceInternals.curateWebItems([
    {
      title: '示例科技发布日常品牌活动', publisher: '第一财经',
      url: 'https://www.yicai.com/brief/old', summary: '品牌活动', published_at: '2026-07-22T10:00:00+08:00',
    },
    {
      title: '示例科技收到监管问询', publisher: '证券时报',
      url: 'https://www.stcn.com/article/new', summary: '监管问询公告', published_at: '2026-07-22T17:00:00+08:00',
    },
    {
      title: '示例科技历史风险提示', publisher: '第一财经',
      url: 'https://www.yicai.com/brief/before', summary: '风险提示', published_at: '2026-07-21T17:00:00+08:00',
    },
  ], stock, {
    requiredTitleTerms: reportServiceInternals.monitorTitleTerms(stock),
    requiredEventTerms: reportServiceInternals.monitorEventTerms(stock),
    publishedWindow: {
      start_at: '2026-07-21T10:00:00.000Z',
      start_date: '2026-07-21',
      end_at: '2026-07-22T10:00:00.000Z',
      end_date: '2026-07-22',
      timezone: 'Asia/Shanghai',
    },
  });
  assert.deepEqual(items.map((item) => item.title), ['示例科技收到监管问询']);
});

test('monitor keeps distinct recent company events when semantic preference binding is unavailable', () => {
  const stock = { name: '示例科技', code: '000001', exchange: 'CN', focus: ['股价走势和行业动态'] };
  const items = reportServiceInternals.curateWebItems([
    {
      title: '示例科技发布新款产品并披露上市计划', publisher: '第一财经',
      url: 'https://www.yicai.com/brief/product',
      summary: '示例科技发布新款产品，并披露后续上市计划。', published_at: '2026-07-22T10:00:00+08:00',
    },
    {
      title: '示例科技启动新产线招聘，项目建设进入新阶段', publisher: '证券时报',
      url: 'https://www.stcn.com/article/hiring',
      summary: '示例科技启动新产线招聘，项目建设进入新阶段。', published_at: '2026-07-23T10:00:00+08:00',
    },
  ], stock, {
    requiredTitleTerms: reportServiceInternals.monitorTitleTerms(stock),
    requiredEventTerms: reportServiceInternals.monitorEventTerms(stock),
    publishedWindow: {
      start_at: '2026-07-20T00:00:00.000Z',
      start_date: '2026-07-20',
      end_at: '2026-07-27T00:00:00.000Z',
      end_date: '2026-07-27',
      timezone: 'Asia/Shanghai',
    },
  });
  assert.deepEqual(items.map((item) => item.title), [
    '示例科技启动新产线招聘，项目建设进入新阶段',
    '示例科技发布新款产品并披露上市计划',
  ]);
});

test('brief curation retains a semantic source bound to a subtopic of a compound preference', () => {
  const stock = {
    name: '示例汽车',
    code: '000001',
    exchange: 'CN',
    focus: ['股价走势和行业动态'],
  };
  const items = reportServiceInternals.curateWebItems([{
    title: '新能源汽车行业竞争格局出现新变化',
    publisher: '财联社',
    url: 'https://www.cls.cn/detail/compound-preference',
    summary: '新能源汽车市场竞争加剧，车企产品结构持续调整。',
    published_at: '2026-07-26T10:00:00+08:00',
    semantic_matches: [{
      preference: '行业动态',
      scope: 'external',
      quote: '新能源汽车市场竞争加剧，车企产品结构持续调整。',
    }],
  }], stock, {
    requireStockInTitle: true,
    requireSubstantiveBusiness: true,
    semanticBindingRequired: true,
    preferenceBindingRequired: true,
  });
  assert.deepEqual(items.map((item) => item.title), ['新能源汽车行业竞争格局出现新变化']);
});

test('monitor review curation uses an exact rolling 168-hour window', () => {
  const stock = { name: '星河电池', code: '688888', exchange: 'CN', focus: ['原材料价格'] };
  const items = reportServiceInternals.curateWebItems([
    {
      title: '星河电池锂矿项目环评获受理', publisher: '证券时报',
      url: 'https://www.stcn.com/article/inside', summary: '锂矿项目环评进展',
      published_at: '2026-07-16T08:30:00.000Z',
    },
    {
      title: '星河电池披露历史锂矿项目进展', publisher: '第一财经',
      url: 'https://www.yicai.com/brief/outside', summary: '锂矿项目历史进展',
      published_at: '2026-07-16T07:30:00.000Z',
    },
  ], stock, {
    requiredTitleTerms: reportServiceInternals.monitorTitleTerms(stock),
    requiredEventTerms: reportServiceInternals.monitorEventTerms(stock),
    publishedWindow: {
      start_at: '2026-07-16T08:00:00.000Z',
      start_date: '2026-07-16',
      end_at: '2026-07-23T08:00:00.000Z',
      end_date: '2026-07-23',
      timezone: 'Asia/Shanghai',
    },
  });
  assert.deepEqual(items.map((item) => item.title), ['星河电池锂矿项目环评获受理']);
});

test('extracts concrete monitor article titles from low-information directory summaries for refinement', () => {
  const stock = { name: '示例科技', code: '000001', exchange: 'CN', focus: ['新能源汽车竞争'] };
  const queries = reportServiceInternals.refinementQueries([{
    title: '政声传递_新闻动态_某市人民政府',
    publisher: '某市人民政府',
    url: 'https://www.example.gov.cn/news',
    summary: '2026-07-21 新能源汽车维修安全国标将实施\n2026-07-21 家政服务业发布新举措',
  }], stock, null);
  assert.deepEqual(queries.map((item) => item.query), ['新能源汽车维修安全国标将实施']);
  assert.equal(queries[0].queryRewrite, true);
  assert.equal(queries[0].refinement, true);
});

test('uses a concrete rejected result title to seek trusted corroboration', () => {
  const stock = { name: '星河电池', code: '688888', exchange: 'CN', focus: ['原材料价格'] };
  const queries = reportServiceInternals.refinementQueries([{
    title: '星河电池锂矿项目环评获受理',
    publisher: '资讯客户端',
    url: 'https://c.m.163.com/news/a/1.html',
    summary: '锂矿项目环评已进入受理环节。',
    published_at: '2026-07-22T08:00:00.000Z',
  }], stock, null);
  assert.deepEqual(queries.map((item) => item.query), ['星河电池锂矿项目环评获受理']);
});

test('extracts stock-specific article titles from a rejected quote page for brief refinement', () => {
  const stock = { name: '示例科技', code: '000001', exchange: 'CN', focus: ['销量'] };
  const queries = reportServiceInternals.refinementQueries([{
    title: '示例科技(sz000001)行情走势',
    publisher: '证券时报',
    url: 'https://www.stcn.com/quotes/1',
    summary: '示例科技（sz000001） 2026-07-21 01:05（北京时间） +添加自选\n示例科技海外工厂迎来新进展\n行业新闻',
  }], stock, null, 'brief');
  assert.deepEqual(queries.map((item) => item.query), ['示例科技海外工厂迎来新进展']);
  assert.equal(queries[0].timeRange, 'OneMonth');
});

test('conservatively stabilizes invalid top-level text after strict retries', () => {
  const report = {
    status: 'sufficient',
    summary: '营业收入被错误换算为101亿元。',
    summary_evidence_ids: ['D1'],
    change_summary: '这是首次生成的报告，暂无可比较的历史结果。',
    change_evidence_ids: [],
    risk_level: 'low',
    sections: [{ title: '经营数据', claims: [{ text: '营业收入为100元。', evidence_ids: ['D1'] }] }],
    conclusion: { text: '当前结论仍需持续跟踪。', evidence_ids: ['D1'] },
    limitations: [],
  };
  const evidence = [{ id: 'D1', type: 'datapro' }, { id: 'W1', type: 'web_search' }];
  const stabilized = reportServiceInternals.stabilizeInvalidReport(report, [{
    location: 'summary', type: 'unsupported_numbers', numbers: ['101'],
  }], evidence, 'initial');
  assert.equal(stabilized.report.status, 'sufficient');
  assert.equal(stabilized.report.risk_level, 'unknown');
  assert.equal(stabilized.report.summary, '营业收入为100元。');
  assert.deepEqual(stabilized.report.summary_evidence_ids, ['D1']);
  assert.deepEqual(stabilized.rewrittenFields, ['summary']);
});

test('stabilizes semantic issues that identify claims by section title', () => {
  const report = {
    status: 'sufficient',
    summary: '外部环境：据政府网站报道，政府网站发布的信息显示。',
    summary_evidence_ids: ['W2'],
    change_summary: '这是首次生成的报告，暂无可比较的历史结果。',
    change_evidence_ids: [],
    risk_level: 'low',
    sections: [{
      title: '市场异动',
      claims: [{
        text: '2026-07-27，示例公司最新价为100元，涨跌幅为1%。',
        evidence_ids: ['D1'],
      }, {
        text: '媒体报道的未经权威核验持仓数字。',
        evidence_ids: ['W1'],
      }],
    }, {
      title: '外部风险',
      claims: [{
        text: '围绕“行业动态”，政府网站发布的信息显示，行业主管部门启动专项治理行动。',
        evidence_ids: ['W2'],
      }],
    }],
    conclusion: {
      text: '外部环境：据政府网站报道，政府网站发布的信息显示。',
      evidence_ids: ['W2'],
    },
    limitations: [],
  };
  const evidence = [
    { id: 'D1', type: 'datapro', monitor_role: 'market_signal' },
    { id: 'W1', type: 'web_search', publisher: '财经媒体', monitor_role: 'recent_context' },
    { id: 'W2', type: 'web_search', publisher: '政府网站', monitor_role: 'new_event' },
  ];
  const stabilized = reportServiceInternals.stabilizeInvalidReport(
    report,
    [
      { location: 'sections[市场异动].claims[1]', type: 'semantic_mismatch' },
      { location: 'summary', type: 'semantic_mismatch' },
      { location: 'conclusion', type: 'semantic_mismatch' },
    ],
    evidence,
    'initial',
    { type: 'monitor' },
  );
  assert.equal(stabilized.prunedCount, 1);
  assert.equal(stabilized.report.sections[0].claims.length, 1);
  assert.doesNotMatch(JSON.stringify(stabilized.report), /未经权威核验持仓数字/);
  assert.match(stabilized.report.summary, /行业主管部门启动专项治理行动/);
  assert.doesNotMatch(stabilized.report.summary, /发布的信息显示。/);
  assert.match(stabilized.report.conclusion.text, /行业主管部门启动专项治理行动/);
});

test('stabilizes semantic issues that identify claims by bracketed section index', () => {
  const report = {
    status: 'sufficient',
    summary: '市场摘要。',
    summary_evidence_ids: ['D1'],
    change_summary: '这是首次生成的报告，暂无可比较的历史结果。',
    change_evidence_ids: [],
    risk_level: 'unknown',
    sections: [{
      title: '市场异动',
      claims: [{
        text: '示例公司最新价为100元。',
        evidence_ids: ['D1'],
      }, {
        text: '媒体披露了未经权威核验的持仓金额。',
        evidence_ids: ['W1'],
      }],
    }],
    conclusion: { text: '示例公司最新价为100元。', evidence_ids: ['D1'] },
    limitations: [],
  };
  const stabilized = reportServiceInternals.stabilizeInvalidReport(
    report,
    [{ location: 'sections[0].claims[1]', type: 'semantic_mismatch' }],
    [{ id: 'D1', type: 'datapro' }, { id: 'W1', type: 'web_search' }],
    'initial',
    { type: 'monitor' },
  );
  assert.equal(stabilized.prunedCount, 1);
  assert.deepEqual(stabilized.report.sections[0].claims.map((claim) => claim.evidence_ids), [['D1']]);
});

test('replaces an invalid conclusion with a cited factual claim instead of generic filler', () => {
  const report = {
    status: 'sufficient',
    summary: '示例科技发布经营公告。',
    summary_evidence_ids: ['W1'],
    change_summary: '这是首次生成的报告，暂无可比较的历史结果。',
    change_evidence_ids: [],
    risk_level: 'low',
    sections: [{
      title: '关注方向',
      claims: [{ text: '新浪财经报道，示例科技发布经营公告。', evidence_ids: ['W1'] }],
    }],
    conclusion: { text: '没有证据支持的宽泛结论。', evidence_ids: ['W1'] },
    limitations: [],
  };
  const stabilized = reportServiceInternals.stabilizeInvalidReport(
    report,
    [{ location: 'conclusion', type: 'semantic_mismatch' }],
    [{ id: 'W1', type: 'web_search' }],
    'initial',
  );
  assert.equal(stabilized.report.conclusion.text, '新浪财经报道，示例科技发布经营公告。');
  assert.deepEqual(stabilized.report.conclusion.evidence_ids, ['W1']);
  assert.doesNotMatch(
    JSON.stringify(stabilized.report),
    /下一步以正式公告、经营数据和新增事件作为更新依据/,
  );
});

test('does not create a reader-facing section when every factual claim is invalid', () => {
  const report = {
    status: 'sufficient',
    summary: '示例科技发布经营公告。',
    summary_evidence_ids: ['W1'],
    change_summary: '这是首次生成的报告，暂无可比较的历史结果。',
    change_evidence_ids: [],
    risk_level: 'low',
    sections: [{
      title: '关注方向',
      claims: [{ text: '没有证据支持的宽泛表述。', evidence_ids: ['W1'] }],
    }],
    conclusion: { text: '没有证据支持的宽泛结论。', evidence_ids: ['W1'] },
    limitations: [],
  };
  const stabilized = reportServiceInternals.stabilizeInvalidReport(
    report,
    [
      { location: 'sections.0.claims.0', type: 'semantic_mismatch' },
      { location: 'conclusion', type: 'semantic_mismatch' },
    ],
    [{ id: 'W1', type: 'web_search' }],
    'initial',
  );
  assert.equal(stabilized, null);
});

test('builds a concise brief summary instead of concatenating every section', () => {
  const summary = reportServiceInternals.briefComprehensiveSummary({
    sections: [{
      title: '市场表现',
      claims: [{ text: '最新价为100元，涨跌幅为1%。', evidence_ids: ['D1'] }],
    }, {
      title: '经营与财务',
      claims: [{ text: '最新报告期为2026年一季度。营业收入为100亿元。', evidence_ids: ['D2'] }],
    }, {
      title: '关注方向',
      claims: [{ text: '公司发布新一代行业大模型。', evidence_ids: ['W1'] }],
    }, {
      title: '后续观察',
      claims: [{ text: '后续继续跟踪行业大模型进展。', evidence_ids: ['W1', 'D2'] }],
    }],
  }, 'new_evidence', null, [{
    preference: '行业大模型',
    status: 'covered',
    evidence_ids: ['W1'],
  }]);

  assert.match(summary.text, /最新价为100元/);
  assert.match(summary.text, /行业大模型/);
  assert.doesNotMatch(summary.text, /最新报告期|营业收入|后续继续跟踪|市场方面|关注方向方面/);
  assert.equal(summary.text.length <= 120, true);
  assert.deepEqual(summary.evidence_ids, ['D1', 'W1']);
});

test('brief summary keeps the substantive end of an attributed preference fact', () => {
  const summary = reportServiceInternals.briefComprehensiveSummary({
    sections: [{
      title: '关注方向',
      claims: [{
        text: '围绕“iPhone需求”，中国经济网报道，日前，中国证券报记者从产业链人士处获悉，进入7月，苹果iPhone 18系列手机已在量产，正处于产能爬坡阶段。',
        evidence_ids: ['W1'],
      }],
    }],
  }, 'new_evidence', null, [{
    preference: 'iPhone需求',
    status: 'covered',
    evidence_ids: ['W1'],
  }]);

  assert.match(summary.text, /苹果iPhone 18系列手机已在量产/);
  assert.match(summary.text, /产能爬坡阶段/);
  assert.match(summary.text, /据中国经济网报道/);
  assert.doesNotMatch(summary.text, /进入7月。$/);
  assert.equal(summary.text.length <= 120, true);
});

test('brief summary does not stop at an official-source relative-time lead', () => {
  const summary = reportServiceInternals.briefComprehensiveSummary({
    sections: [{
      title: '关注方向',
      claims: [{
        text: '围绕“行业动态”，贵州省商务厅发布的信息显示，近日，省人民政府办公厅印发《贵州省打造“卖酒向卖生活方式”转变升级版行动方案（2026—2030年）》（以下简称《行动方案》），并对未来五年的重点任务作出安排。',
        evidence_ids: ['W1'],
      }],
    }],
  }, 'new_evidence', null, [{
    preference: '行业动态',
    status: 'covered',
    evidence_ids: ['W1'],
  }]);

  assert.match(summary.text, /省人民政府办公厅印发/);
  assert.doesNotMatch(summary.text, /近日。$/);
  assert.equal(summary.text.length <= 120, true);
});

test('brief summary keeps at most two core information points', () => {
  const summary = reportServiceInternals.briefComprehensiveSummary({
    sections: [{
      title: '市场表现',
      claims: [{ text: '最新价为100元，涨跌幅为1%。', evidence_ids: ['D1'] }],
    }, {
      title: '关注方向',
      claims: [
        { text: '据媒体甲报道，公司发布新产品。', evidence_ids: ['W1'] },
        { text: '据媒体乙报道，公司新项目投产。', evidence_ids: ['W2'] },
      ],
    }],
  }, 'new_evidence', null, [
    { preference: '产品进展', status: 'covered', evidence_ids: ['W1'] },
    { preference: '项目进展', status: 'covered', evidence_ids: ['W2'] },
  ]);

  assert.match(summary.text, /最新价为100元/);
  assert.match(summary.text, /发布新产品/);
  assert.doesNotMatch(summary.text, /新项目投产/);
  assert.equal(summary.text.length <= 120, true);
  assert.deepEqual(summary.evidence_ids, ['D1', 'W1']);
});

test('brief summary does not select an unrelated paragraph only because it shares a source id', () => {
  const summary = reportServiceInternals.briefComprehensiveSummary({
    sections: [{
      title: '市场表现',
      claims: [{ text: '最新价为100元，涨跌幅为1%。', evidence_ids: ['D1'] }],
    }, {
      title: '关注方向',
      claims: [{
        text: '围绕“原材料价格”，媒体报道，铜价近期出现波动。',
        evidence_ids: ['W1'],
      }],
    }],
  }, 'new_evidence', null, [{
    preference: '宏观趋势',
    display_label: '宏观趋势',
    expected_section: '关注方向',
    status: 'covered',
    evidence_ids: ['W1'],
  }]);

  assert.equal(summary.text, '最新价为100元，涨跌幅为1%。');
  assert.deepEqual(summary.evidence_ids, ['D1']);
});

test('reuses only recent semantically verified brief sources when fresh search is empty', () => {
  const record = {
    report: {
      analysis: {
        summary_evidence_ids: ['W1'],
        sections: [{
          title: '关注方向',
          claims: [{ text: '公司发布行业大模型。', evidence_ids: ['W1'] }],
        }],
      },
      evidence: [{
        id: 'W1',
        type: 'web_search',
        title: '示例科技发布行业大模型',
        publisher: '央广网',
        url: 'https://www.cnr.cn/example/model',
        content: '示例科技发布行业大模型并用于公共服务场景。',
        published_at: '2026-07-20T10:00:00+08:00',
        source_tier: 'media',
        semantic_binding_checked: true,
        semantic_matches: [{
          preference: '大模型技术迭代',
          scope: 'company',
          quote: '示例科技发布行业大模型并用于公共服务场景。',
        }],
      }],
    },
  };
  const items = reportServiceInternals.carriedForwardBriefWebItems(
    [record],
    {
      name: '示例科技',
      code: 'TEST1',
      exchange: 'CN',
      focus: ['大模型技术迭代'],
    },
    new Date('2026-07-26T12:00:00+08:00'),
  );

  assert.deepEqual(items.map((item) => item.title), ['示例科技发布行业大模型']);
  assert.equal(items[0].semantic_matches[0].preference, '大模型技术迭代');
});

test('does not reuse an external industry source as a company AI product update', () => {
  const stock = {
    name: '示例平台',
    code: 'TEST1',
    exchange: 'CN',
    focus: ['AI产品进展'],
  };
  const quote = '本届大会集中展示了300余款首发AI产品，人工智能产业生态持续扩展。';
  const record = {
    report: {
      analysis: {
        summary_evidence_ids: ['W1'],
        sections: [{
          title: '关注方向',
          claims: [{ text: quote, evidence_ids: ['W1'] }],
        }],
      },
      evidence: [{
        id: 'W1',
        type: 'web_search',
        title: '人工智能大会展示300余款首发产品',
        publisher: '新华网',
        url: 'https://www.news.cn/tech/ai-event.html',
        content: quote,
        published_at: '2026-07-21T10:00:00+08:00',
        source_tier: 'media',
        semantic_binding_checked: true,
        semantic_matches: [{
          preference: 'AI产品进展',
          scope: 'external',
          quote,
        }],
      }],
    },
  };

  const items = reportServiceInternals.carriedForwardBriefWebItems(
    [record],
    stock,
    new Date('2026-07-27T12:00:00+08:00'),
  );
  assert.deepEqual(items, []);
});

test('reuses a distinct recent monitor source when fresh monitor search is sparse', () => {
  const record = {
    report: {
      analysis: {
        summary_evidence_ids: ['W1'],
        sections: [{
          title: '公司事件',
          claims: [{ text: '界面新闻报道“示例科技启动新产线招聘”。', evidence_ids: ['W1'] }],
        }],
      },
      evidence: [{
        id: 'W1',
        type: 'web_search',
        title: '示例科技启动新产线招聘',
        publisher: '界面新闻',
        url: 'https://www.jiemian.com/article/example.html',
        content: '界面新闻报道，示例科技启动新产线招聘。',
        published_at: '2026-07-24T10:00:00+08:00',
        source_tier: 'media',
      }],
    },
  };
  const stock = {
    name: '示例科技', code: 'TEST1', exchange: 'CN', focus: ['股价走势和行业动态'],
  };
  const items = reportServiceInternals.carriedForwardMonitorWebItems(
    [record],
    stock,
    new Date('2026-07-27T12:00:00+08:00'),
  );

  assert.deepEqual(items.map((item) => item.title), ['示例科技启动新产线招聘']);
  assert.equal(items[0].type, 'web_search');
});

test('authoritative fallback deterministically copies structured DataPro fields', () => {
  const evidence = [
    {
      id: 'D1', type: 'datapro', as_of_date: '2026-07-21',
      rows: [{ 交易日期: '2026-07-21', 最新价: 94.3 }],
    },
    {
      id: 'D2', type: 'datapro', as_of_date: '2026-03-31',
      rows: [{
        '财务报表(新准则)/定期报告最新报告期': '20260331',
        '财务报表(新准则)/定期报告实际披露日期': '20260429',
        '一般企业/利润表/营业收入': '150,225,314,000 元',
        '一般企业/利润表/归属于母公司所有者的净利润': '4,084,551,000 元',
        '财务分析/盈利能力/销售毛利率': '18.8062 %',
        '一般企业/利润表/研发费用': '11,343,566,000 元',
      }],
    },
    {
      id: 'W1', type: 'web_search', source_tier: 'media',
      title: '示例科技发布月度数据100辆', publisher: '第一财经',
    },
  ];
  const fallback = reportServiceInternals.deterministicAuthoritativeReport(
    evidence,
    'brief',
    'initial',
    { name: '示例科技' },
  );
  assert.equal(fallback.status, 'sufficient');
  assert.equal(fallback.risk_level, 'unknown');
  assert.deepEqual(fallback.summary_evidence_ids, ['D1', 'W1']);
  assert.match(fallback.summary, /示例科技最新价为94\.3/);
  assert.doesNotMatch(fallback.summary, /营业收入为150,225,314,000 元/);
  assert.equal(fallback.summary.length <= 120, true);
  assert.match(fallback.sections[1].claims[0].text, /150,225,314,000 元/);
  assert.match(fallback.sections[1].claims[0].text, /最新已披露定期报告期为2026-03-31/);
  assert.match(fallback.sections[1].claims[0].text, /实际披露日期为2026-04-29/);
  assert.deepEqual(fallback.sections.map((section) => section.title), [
    '市场表现', '经营与财务', '关注方向', '后续观察',
  ]);
  assert.deepEqual(fallback.sections[2].claims[0].evidence_ids, ['W1']);
  assert.doesNotMatch(JSON.stringify(fallback), /公开信息部分纳入|用于补充核对|达到权威性|DataPro字段|联网搜索返回|本条只证明/);
});

test('does not present an inferred DataPro as-of date as the disclosed report period', () => {
  const fallback = reportServiceInternals.deterministicAuthoritativeReport([{
    id: 'D1',
    type: 'datapro',
    as_of_date: '2026-06-30',
    rows: [{
      证券代码: 'AAPL.O',
      '一般企业/利润表/营业收入': '254,940,000,000 原始币种',
      '财务分析/盈利能力/销售毛利率': '48.6436 %',
    }],
  }], 'brief', 'initial', { name: 'Apple' });
  const financial = fallback.sections.find((section) => section.title === '经营与财务');

  assert.match(financial.claims[0].text, /以下为最新已披露定期报告数据/);
  assert.doesNotMatch(financial.claims[0].text, /最新已披露定期报告期为2026-06-30/);
});

test('brief web section summarizes the cited monthly operating article', () => {
  const section = reportServiceInternals.deterministicWebSection([{
    id: 'W1', type: 'web_search', source_tier: 'media',
    title: '示例科技：2026年6月新能源汽车产量403246辆',
    publisher: '第一财经',
    content: '示例科技公告称，2026年6月披露新能源汽车产量和销量，本年累计产量同比下降，本年累计销量同比下降，本月同时披露出口新能源汽车情况。',
  }], { name: '示例科技', code: '000001', focus: ['销量', '海外业务'] }, 'brief');
  assert.equal(section.title, '关注方向');
  assert.deepEqual(section.claims[0].evidence_ids, ['W1']);
  assert.match(section.claims[0].text, /第一财经发布了关于示例科技6月新能源汽车月度业务进展的报道/);
  assert.doesNotMatch(section.claims[0].text, /403246|当月产量和销量|累计产销|出口情况/);
  assert.doesNotMatch(section.claims[0].text, /值得关注|用于补充核对|公开信息部分纳入/);
});

test('official monthly operating material can retain its disclosed coverage', () => {
  const section = reportServiceInternals.deterministicWebSection([{
    id: 'W1', type: 'web_search', source_tier: 'official',
    title: '示例科技2026年6月产销快报',
    publisher: '示例科技',
    content: '示例科技公告称，2026年6月披露新能源汽车产量和销量，本年累计产量同比下降，本年累计销量同比下降，本月同时披露出口新能源汽车情况。',
  }], { name: '示例科技', code: '000001', focus: ['销量', '海外业务'] }, 'brief');
  assert.match(section.claims[0].text, /新能源汽车当月产量和销量、累计产销、出口情况/);
  assert.match(section.claims[0].text, /累计产量与累计销量同比下降/);
});

test('monitor drops a single-media product or policy claim before report generation', () => {
  const source = {
    id: 'W1',
    type: 'web_search',
    source_tier: 'media',
    title: '马来西亚调整整车进口门槛',
    publisher: '界面新闻',
    content: '新的整车进口门槛实施后，示例汽车A车型和B车型将无法继续进口。',
    semantic_matches: [{
      preference: '海外政策',
      scope: 'external',
      quote: '新的整车进口门槛实施后，示例汽车A车型和B车型将无法继续进口。',
    }],
  };
  const stock = { name: '示例汽车', code: '000001', focus: ['海外政策'] };
  assert.equal(reportServiceInternals.readerSafeWebItem(source, stock, 'monitor'), false);
  assert.equal(reportServiceInternals.monitorExternalSummary(source, stock, '海外政策'), '');
});

test('brief web section does not turn a factory recruitment article into a monthly sales disclosure', () => {
  const section = reportServiceInternals.deterministicWebSection([{
    id: 'W1', type: 'web_search', source_tier: 'media',
    title: '深汕示例科技再度启动大规模招聘，今年已提供超万个岗位',
    publisher: '新浪财经',
    content: '深汕示例科技主要生产出口车型，去年整车年产量超30万辆。2025年海外销量增长。2023年12月22日，公司宣布在欧洲建设乘用车生产基地。',
  }], { name: '示例科技', code: '000001', focus: ['销量', '海外业务'] }, 'brief');
  assert.equal(section.title, '关注方向');
  assert.deepEqual(section.claims[0].evidence_ids, ['W1']);
  assert.match(section.claims[0].text, /主要生产出口车型|欧洲建设乘用车生产基地/);
  assert.doesNotMatch(section.claims[0].text, /12月披露了|当月产量和销量|累计产销/);
});

test('brief fallback excludes single-media product specifications', () => {
  const section = reportServiceInternals.deterministicWebSection([{
    id: 'W1',
    type: 'web_search',
    source_tier: 'media',
    title: '示例科技新车型纯电续航超800km',
    publisher: '第一财经',
    content: '该车型轴距为3米，电机功率为300kW，预计下月上市。',
  }], { name: '示例科技', code: '000001', focus: ['产品竞争'] }, 'brief');
  assert.equal(section, null);

  const storageDurationSection = reportServiceInternals.deterministicWebSection([{
    id: 'W2',
    type: 'web_search',
    source_tier: 'media',
    title: '示例科技储能系统支持1小时至8小时储能时长',
    publisher: '第一财经',
    content: '该系统支持1小时至8小时储能时长，循环寿命达到12000次。',
  }], { name: '示例科技', code: '000001', focus: ['产品竞争'] }, 'brief');
  assert.equal(storageDurationSection, null);
});

test('brief excludes a single-media product import or access restriction', () => {
  const stock = {
    name: '示例汽车',
    code: '000001.SZ',
    focus: ['海外业务'],
  };
  const item = {
    id: 'W1',
    type: 'web_search',
    source_tier: 'media',
    title: '示例汽车新车型面临进口准入限制',
    publisher: '界面新闻',
    content: '报道提到，示例汽车一款新车型面临当地进口准入限制。',
    semantic_binding_checked: true,
    semantic_matches: [{
      preference: '海外业务',
      scope: 'company',
      quote: '报道提到，示例汽车一款新车型面临当地进口准入限制。',
    }],
  };

  assert.equal(reportServiceInternals.briefWebSummary(item, stock, '海外业务'), '');
  assert.equal(reportServiceInternals.readerSafeWebItem(item, stock, 'brief'), false);
});

test('source summaries keep decimal amounts intact and remove attribution metadata', () => {
  const section = reportServiceInternals.deterministicWebSection([{
    id: 'W1',
    type: 'web_search',
    source_tier: 'media',
    title: '先惠技术累计收到宁德时代合同金额约9.2亿元',
    publisher: '证券时报',
    content: [
      '先惠技术累计收到宁德时代合同金额约9.2亿元',
      '来源：人民财讯 作者：任丽珺 2026-07-16 17:46',
      '先惠技术公告，公司累计收到宁德时代及其控股子公司合同及定点通知单金额约为9.2亿元（不含税）。',
    ].join('\n'),
  }], { name: '宁德时代', code: '300750.SZ', focus: ['合同进展'] }, 'brief');
  assert.equal(section.title, '关注方向');
  assert.match(section.claims[0].text, /9\.2亿元/);
  assert.doesNotMatch(section.claims[0].text, /2亿元 来源|9。2亿元|9\.$/);
  assert.doesNotMatch(section.claims[0].text, /作者：任丽珺/);
});

test('model evidence projection removes forecasts and editorial commentary from media excerpts', () => {
  const input = JSON.parse(reportServiceInternals.buildInput({
    stock: {
      name: '星河电池',
      code: '688888',
      exchange: 'CN',
      focus: ['海外订单'],
    },
    type: 'monitor',
    evidence: [{
      id: 'W1',
      type: 'web_search',
      title: '星河电池签下欧洲5GWh储能订单',
      publisher: '经济观察网',
      source_tier: 'media',
      monitor_role: 'recent_context',
      content: '星河电池近期已签下欧洲5GWh储能订单。机构预估二季度净利润同比增长30%。产业资源优势持续显现，投资逻辑得到强化。',
    }],
    previous: null,
    changeStatus: 'initial',
    monitorSettings: null,
    window: null,
  }));
  assert.match(input.evidence[0].content, /签下欧洲5GWh储能订单/);
  assert.doesNotMatch(input.evidence[0].content, /预估|净利润|产业资源优势|投资逻辑/);
});

test('brief source summaries omit analyst forecasts but keep reported completed events', () => {
  const section = reportServiceInternals.deterministicWebSection([{
    id: 'W1',
    type: 'web_search',
    source_tier: 'media',
    title: '机构看好星河电池季度业绩',
    publisher: '经济观察网',
    content: [
      '高盛认为星河电池盈利能力更强，季度业绩有望超预期。',
      '星河电池与欧洲客户签署储能系统合作协议。',
    ].join('\n'),
  }], { name: '星河电池', code: '688888', focus: ['欧洲客户合作'] }, 'brief');
  assert.equal(section.title, '关注方向');
  assert.match(section.claims[0].text, /签署储能系统合作协议/);
  assert.doesNotMatch(section.claims[0].text, /高盛认为|有望超预期/);
});

test('verification contract does not apply risk and product thresholds to ordinary attributed events', () => {
  const instructions = reportServiceInternals.verificationInstructions('brief');
  assert.match(instructions, /普通合作协议、项目进展、供应商合同/);
  assert.match(instructions, /同一栏目允许同时存在回答其他偏好的段落/);
  assert.match(instructions, /不得把该门槛扩展到普通合作、项目、订单/);
});

test('brief fallback refuses unrelated company lifestyle content', () => {
  const section = reportServiceInternals.deterministicWebSection([{
    id: 'W1',
    type: 'web_search',
    source_tier: 'media',
    title: '晨星科技举办员工运动会',
    publisher: '第一财经',
    content: '晨星科技员工参加趣味运动会，现场气氛热烈。',
  }], { name: '晨星科技', code: '000999', focus: ['海底数据中心订单'] }, 'brief');
  assert.equal(section, null);
});

test('authoritative fallback changes wording for repeated identical evidence', () => {
  const evidence = [{
    id: 'D1', type: 'datapro', as_of_date: '2026-07-21',
    rows: [{ 交易日期: '2026-07-21', 最新价: 94.3 }],
  }];
  const previous = {
    report: { analysis: { summary: '本次已重新核验当前可核验的专业数据；未发现新的实质性证据，具体边界见下方。' } },
  };
  const fallback = reportServiceInternals.deterministicAuthoritativeReport(
    evidence, 'brief', 'no_material_change', { name: '示例科技' }, previous,
  );
  assert.notEqual(fallback.summary, previous.report.analysis.summary);
  assert.match(fallback.change_summary, /未发现新的实质性证据/);
});

test('authoritative fallback never repeats the previous summary after new evidence', () => {
  const evidence = [{
    id: 'D1', type: 'datapro', as_of_date: '2026-07-21',
    rows: [{ 交易日期: '2026-07-21', 最新价: 94.3 }],
  }, {
    id: 'W1', type: 'web_search', source_tier: 'media',
    title: '示例科技海外工厂迎来新进展', publisher: '新浪财经',
  }];
  const previous = {
    report: { analysis: { summary: '最新行情与已披露经营数据构成当前个股观察的主要基础，关注方向仍需结合后续公开进展持续更新。' } },
  };
  const fallback = reportServiceInternals.deterministicAuthoritativeReport(
    evidence, 'brief', 'new_evidence', { name: '示例科技', focus: ['海外业务'] }, previous,
  );
  assert.notEqual(fallback.summary, previous.report.analysis.summary);
  assert.deepEqual(fallback.sections.map((section) => section.title), [
    '市场表现', '关注方向', '后续观察',
  ]);
});

test('deterministic financial fields do not mistake a ratio path for absolute net profit', () => {
  const sections = reportServiceInternals.deterministicCoreSections([{
    id: 'D1', type: 'datapro', as_of_date: '2026-03-31',
    rows: [{
      '一般企业/利润表/营业收入': '150,225,314,000 元',
      '财务分析/盈利能力/归属于母公司所有者的净利润': '8.4 %',
    }],
  }], 'brief');
  const claimText = sections.flatMap((section) => section.claims)
    .map((claim) => claim.text).join('\n');
  assert.match(claimText, /营业收入/);
  assert.doesNotMatch(claimText, /归属于母公司所有者的净利润/);
  assert.doesNotMatch(claimText, /8\.4 %/);
});

test('deterministic fallback omits a source that has no substantive event detail', () => {
  const section = reportServiceInternals.deterministicWebSection([
    { id: 'W1', type: 'web_search', source_tier: 'official', title: '行业政策发布', publisher: '监管部门' },
    { id: 'W2', type: 'web_search', source_tier: 'media', title: '示例科技经营线索', publisher: '第一财经' },
  ], { name: '示例科技' }, 'monitor');
  assert.equal(section, null);
});

test('monitor fallback rejects editorial characterization as company evidence', () => {
  const section = reportServiceInternals.deterministicWebSection([{
    id: 'W1',
    type: 'web_search',
    source_tier: 'media',
    title: '机构文章讨论星河电池产业资源优势',
    publisher: '经济观察网',
    monitor_role: 'recent_context',
    content: '产业资源优势：持续通过投资绑定下游，并受益于相关赛道估值修复。',
  }], { name: '星河电池', code: '688888', focus: ['经营风险'] }, 'monitor');
  assert.equal(section, null);
});

test('monitor keeps distinct technical-market sources out of company events', () => {
  const stock = { name: '示例航空', code: '000768.SZ', focus: ['技术面走势'] };
  const evidence = [
    {
      id: 'W1', type: 'web_search', source_tier: 'media', publisher: '经济观察网',
      title: '示例航空震荡强于大盘，7月23日主力资金净流入',
      content: '示例航空近5日处于震荡行情中，表现强于大盘，强于行业平均水平。7月23日主力资金净流入。',
      published_at: '2026-07-24T13:01:00+08:00', monitor_role: 'recent_context',
      semantic_matches: [{ preference: '技术面走势', scope: 'company', quote: '示例航空近5日处于震荡行情中，表现强于大盘，强于行业平均水平。' }],
    },
    {
      id: 'W2', type: 'web_search', source_tier: 'media', publisher: '经济观察网',
      title: '示例航空近5日震荡行情，7月17日主力资金净流出，融资融券差额占比4.14%',
      content: '示例航空近5日处于震荡行情中，7月17日主力资金净流出，融资融券差额占比4.14%。',
      published_at: '2026-07-20T10:31:00+08:00', monitor_role: 'recent_context',
      semantic_matches: [{ preference: '技术面走势', scope: 'company', quote: '示例航空近5日处于震荡行情中，7月17日主力资金净流出，融资融券差额占比4.14%。' }],
    },
  ];

  const contract = reportServiceInternals.buildPreferenceContract(stock, 'monitor', null, evidence);
  assert.equal(contract[0].expected_section, '市场异动');
  const section = reportServiceInternals.deterministicWebSection(evidence, stock, 'monitor');
  assert.equal(section.title, '市场异动');
  assert.deepEqual(section.claims.map((claim) => claim.evidence_ids[0]), ['W1', 'W2']);
  assert.notEqual(section.claims[0].text, section.claims[1].text);
  assert.match(section.claims[0].text, /7月23日主力资金净流入/);
  assert.match(section.claims[1].text, /7月17日主力资金净流出/);
});

test('monitor does not classify an incidental fund-holdings article as a market-movement source', () => {
  const stock = { name: '示例白酒', code: '600000', focus: ['行业动态'] };
  const section = reportServiceInternals.deterministicWebSection([{
    id: 'W1',
    type: 'web_search',
    source_tier: 'media',
    publisher: '证券日报',
    title: '示例白酒退出基金重仓股前十',
    content: '基金持有的示例白酒总市值下降，相关持仓比例有所调整，文章同时讨论估值空间。',
    published_at: '2026-07-24T08:06:00+08:00',
    monitor_role: 'recent_context',
  }], stock, 'monitor');
  assert.equal(section, null);
});

test('monitor summary keeps distinct web context ahead of routine market data and does not copy section text', () => {
  const summary = reportServiceInternals.monitorComprehensiveSummary({
    sections: [{
      title: '市场异动',
      claims: [{
        text: '2026-07-24，示例航空最新价为20.31，涨跌幅为-2.3088%，开盘价为20.65，最高价为21.1。',
        evidence_ids: ['D1'],
      }],
    }, {
      title: '公司事件',
      claims: [{
        text: '证券时报报道“示例航空披露新增设备订单”。',
        evidence_ids: ['W1'],
      }],
    }, {
      title: '外部风险',
      claims: [{
        text: '行业主管部门发布了相关供应链政策调整。',
        evidence_ids: ['W2'],
      }],
    }],
  }, [
    { id: 'D1', type: 'datapro', monitor_role: 'market_context' },
    { id: 'W1', type: 'web_search', publisher: '证券时报', title: '示例航空披露新增设备订单', monitor_role: 'new_event' },
    { id: 'W2', type: 'web_search', publisher: '行业主管部门', monitor_role: 'recent_context' },
  ]);

  assert.match(summary.text, /新增设备订单/);
  assert.match(summary.text, /供应链政策调整/);
  assert.doesNotMatch(summary.text, /最新价为20\.31/);
  assert.doesNotMatch(summary.text, /^证券时报报道“示例航空披露新增设备订单”。/);
  assert.equal(summary.text.length <= 160, true);
  assert.deepEqual(summary.evidence_ids, ['W1', 'W2']);
});

test('monitor summary removes an attribution-only lead before compressing an official fact', () => {
  const summary = reportServiceInternals.monitorComprehensiveSummary({
    sections: [{
      title: '外部风险',
      claims: [{
        text: '围绕“行业动态”，贵州省人民政府发布的信息显示，活动以拓展区域市场、推动产业融合为目标。',
        evidence_ids: ['W1'],
      }],
    }],
  }, [{
    id: 'W1',
    type: 'web_search',
    publisher: '贵州省人民政府',
    monitor_role: 'new_event',
  }]);
  assert.match(summary.text, /活动以拓展区域市场、推动产业融合为目标/);
  assert.doesNotMatch(summary.text, /发布的信息显示。$/);
});

test('monitor summary distinguishes a web trading lead from the market snapshot', () => {
  const summary = reportServiceInternals.monitorComprehensiveSummary({
    sections: [{
      title: '市场异动',
      claims: [{
        text: '2026-07-27，示例矿业最新价为31.77，涨跌幅为0.8251%。',
        evidence_ids: ['D1'],
      }, {
        text: '证券时报网报道，示例矿业大宗交易平台出现一笔成交。',
        evidence_ids: ['W1'],
      }],
    }],
  }, [
    { id: 'D1', type: 'datapro', monitor_role: 'market_signal' },
    {
      id: 'W1',
      type: 'web_search',
      publisher: '证券时报网',
      monitor_role: 'market_signal',
    },
  ]);

  assert.match(summary.text, /^市场：/);
  assert.match(summary.text, /交易线索：据证券时报网报道/);
  assert.equal((summary.text.match(/市场：/g) || []).length, 1);
  assert.deepEqual(summary.evidence_ids, ['D1', 'W1']);
});

test('monitor company-event fallback writes source-specific paragraphs without repeated boilerplate', () => {
  const section = reportServiceInternals.deterministicWebSection([
    {
      id: 'W1', type: 'web_search', source_tier: 'media',
      title: '深汕示例科技再度启动大规模招聘，今年已提供超万个岗位',
      publisher: '新浪财经', monitor_role: 'recent_context',
      semantic_matches: [{
        preference: '经营风险', scope: 'company', quote: '深汕示例科技再度启动大规模招聘，今年已提供超万个岗位',
      }],
    },
    {
      id: 'W2', type: 'web_search', source_tier: 'media',
      title: '汽车早报｜示例科技巴西工厂第10万辆新能源汽车下线',
      publisher: '第一财经', monitor_role: 'recent_context',
      semantic_matches: [{
        preference: '海外业务', scope: 'company', quote: '示例科技巴西工厂第10万辆新能源汽车下线',
      }],
    },
  ], { name: '示例科技', focus: ['经营风险', '海外业务'] }, 'monitor');
  assert.equal(section.title, '公司事件');
  assert.equal(section.claims.length, 2);
  assert.match(section.claims[0].text, /大规模招聘/);
  assert.match(section.claims[1].text, /巴西工厂第10万辆新能源汽车下线/);
  assert.notEqual(section.claims[0].text, section.claims[1].text);
  assert.doesNotMatch(
    section.claims.map((claim) => claim.text).join('\n'),
    /是近7日公司层面的观察重点。当前作为近期背景持续跟踪/,
  );
});

test('monitor keeps a concrete media company event but omits its unverified operating metric', () => {
  const item = {
    id: 'W1', type: 'web_search', source_tier: 'media', publisher: '新浪财经',
    title: '示例科技启动新产线招聘，项目建设进入新阶段',
    content: '示例科技启动新产线招聘，项目建设进入新阶段。去年公司海外累计销量达104.96万辆，同比大幅增长。',
  };
  const text = reportServiceInternals.monitorCompanySummary(item, { name: '示例科技' });
  assert.equal(text, '新浪财经关于示例科技的报道提到，示例科技启动新产线招聘，项目建设进入新阶段。');
  assert.doesNotMatch(text, /104\.96|销量/);
});

test('monitor market paragraph only states sourced quote facts', () => {
  const sections = reportServiceInternals.deterministicCoreSections([{
    id: 'D1',
    type: 'datapro',
    as_of_date: '2026-07-27',
    monitor_role: 'market_context',
    rows: [{
      交易日期: '2026-07-27',
      最新价: 91.89,
      涨跌幅: '0 %',
      开盘价: 91.53,
      最高价: 93.08,
    }],
  }], 'monitor', { name: '示例科技' });
  const text = sections[0].claims[0].text;
  assert.match(text, /2026-07-27.*最新价为91\.89.*涨跌幅为0 %/);
  assert.doesNotMatch(text, /需要升级|风险信号|未单独形成|结合公司公告/);
});

test('market paragraphs prefer an explicit latest price over an earlier close field', () => {
  const evidence = [{
    id: 'D1',
    type: 'datapro',
    as_of_date: '2026-07-27',
    rows: [{
      交易日期: '2026-07-27',
      收盘价: 99,
      最新价: 101,
      涨跌幅: '2%',
    }],
  }];
  const briefText = reportServiceInternals.deterministicCoreSections(
    evidence, 'brief', { name: '示例科技' },
  )[0].claims[0].text;
  const monitorText = reportServiceInternals.deterministicCoreSections(
    evidence, 'monitor', { name: '示例科技' },
  )[0].claims[0].text;
  assert.match(briefText, /最新价为101/);
  assert.match(monitorText, /最新价为101/);
  assert.doesNotMatch(`${briefText}\n${monitorText}`, /最新价为99/);
});

test('market paragraphs bind every field to the latest dated row', () => {
  const evidence = [{
    id: 'D1',
    type: 'datapro',
    as_of_date: '2026-07-24',
    rows: [
      {
        交易日期: '2026-07-13',
        收盘价: 317.31,
        开盘价: 317.015,
        最高价: 323.45,
      },
      {
        交易日期: '2026-07-24',
        收盘价: 333.02,
        开盘价: 321.79,
        最高价: 334.37,
      },
    ],
  }];
  const briefText = reportServiceInternals.deterministicCoreSections(
    evidence, 'brief', { name: 'Example Inc.' },
  )[0].claims[0].text;
  const monitorText = reportServiceInternals.deterministicCoreSections(
    evidence, 'monitor', { name: 'Example Inc.' },
  )[0].claims[0].text;
  assert.match(briefText, /2026-07-24.*最新价为333\.02.*最高价为334\.37/);
  assert.match(monitorText, /2026-07-24.*最新价为333\.02.*开盘价为321\.79.*最高价为334\.37/);
  assert.doesNotMatch(`${briefText}\n${monitorText}`, /317\.31|317\.015|323\.45/);
});

test('legacy market evidence uses its explicit recent trading day for regression checks', () => {
  assert.equal(reportServiceInternals.dataEvidenceCalendarDate({
    id: 'D1',
    type: 'datapro',
    as_of_date: '2026-07-27',
    rows: [{
      查询日期: '2026-07-27',
      最近交易日: '2026-07-24',
      最新价: 333.02,
    }],
  }), '2026-07-24');
});

test('monitor fallback summarizes substantive facts from each cited source body', () => {
  const companySection = reportServiceInternals.deterministicWebSection([{
    id: 'W1',
    type: 'web_search',
    source_tier: 'media',
    title: '星河电池欧洲储能订单取得进展',
    publisher: '证券时报',
    monitor_role: 'recent_context',
    content: '记者7月16日获悉，星河电池与欧洲能源企业签署5GWh储能合作协议，双方计划在欧洲市场推进系统部署。',
    semantic_matches: [{
      preference: '海外订单', scope: 'company', quote: '星河电池与欧洲能源企业签署5GWh储能合作协议',
    }],
  }], { name: '星河电池', code: '688888', focus: ['海外订单'] }, 'monitor');
  assert.equal(companySection.title, '公司事件');
  assert.match(companySection.claims[0].text, /证券时报关于星河电池的报道提到/);
  assert.match(companySection.claims[0].text, /签署5GWh储能合作协议/);
  assert.doesNotMatch(companySection.claims[0].text, /近期背景|对应监控项|实际影响/);

  const externalSection = reportServiceInternals.deterministicWebSection([{
    id: 'W2',
    type: 'web_search',
    source_tier: 'official',
    title: '碳酸锂市场价格出现波动',
    publisher: '行业主管部门',
    monitor_role: 'recent_context',
    content: '截至上午收盘，碳酸锂期价涨超4%，原料端供应偏紧，市场仍在观察后续供需变化。',
    semantic_matches: [{
      preference: '原材料价格', scope: 'external', quote: '碳酸锂期价涨超4%，原料端供应偏紧，市场仍在观察后续供需变化。',
    }],
  }], { name: '远山能源', code: '123456', focus: ['原材料价格'] }, 'monitor');
  assert.equal(externalSection.title, '外部风险');
  assert.match(externalSection.claims[0].text, /碳酸锂期价涨超4%/);
  assert.doesNotMatch(externalSection.claims[0].text, /近期背景|对应监控项|合规要求/);
});

test('monitor fallback keeps an arbitrary custom preference grounded in the source text', () => {
  const section = reportServiceInternals.deterministicWebSection([{
    id: 'W1',
    type: 'web_search',
    source_tier: 'media',
    title: '晨星科技披露海底数据中心项目订单',
    publisher: '第一财经',
    monitor_role: 'new_event',
    content: '晨星科技披露，其海底数据中心项目新增一笔设备订单，交付安排仍以公司后续公告为准。',
    semantic_matches: [{
      preference: '海底数据中心订单', scope: 'company', quote: '晨星科技披露，其海底数据中心项目新增一笔设备订单，交付安排仍以公司后续公告为准。',
    }],
  }], { name: '晨星科技', code: '000999', focus: ['海底数据中心订单'] }, 'monitor');
  assert.match(section.claims[0].text, /新增一笔设备订单/);
  assert.doesNotMatch(section.claims[0].text, /本轮没有出现|未形成需要升级/);
});

test('merges deterministic DataPro sections ahead of model-generated sections', () => {
  const evidence = [{
    id: 'D1', type: 'datapro', as_of_date: '2026-07-21',
    rows: [{ 交易日期: '2026-07-21', 最新价: 94.3 }],
  }];
  const merged = reportServiceInternals.mergeDeterministicCore({
    sections: [
      { title: '交易行情', claims: [{ text: '模型行情。', evidence_ids: ['D1'] }] },
      { title: '其他', claims: [{ text: '其他内容。', evidence_ids: ['D1'] }] },
    ],
  }, evidence, 'brief');
  assert.deepEqual(merged.coreTitles, ['市场表现']);
  assert.match(merged.report.sections[0].claims[0].text, /最新价为94.3/);
  assert.doesNotMatch(merged.report.sections[0].claims[0].text, /DataPro字段/);
  assert.equal(merged.report.sections[1].title, '关注方向');
});

test('keeps one deterministic preference paragraph per cited public source', () => {
  const evidence = [{
    id: 'W1',
    type: 'web_search',
    source_tier: 'media',
    title: '示例航空近期走势强于大盘',
    publisher: '经济观察网',
    content: '示例航空近5日处于震荡行情中，表现强于大盘。',
    semantic_matches: [{
      preference: '技术面走势',
      scope: 'company',
      quote: '示例航空近5日处于震荡行情中，表现强于大盘。',
    }],
    semantic_binding_checked: true,
  }];
  const merged = reportServiceInternals.mergeDeterministicCore({
    sections: [{
      title: '关注方向',
      claims: [{
        text: '模型重复描述了示例航空近期走势强于大盘。',
        evidence_ids: ['W1'],
      }],
    }],
    conclusion: {
      text: '后续继续跟踪该项走势。',
      evidence_ids: ['W1'],
    },
  }, evidence, 'brief', {
    name: '示例航空',
    code: '000001.SZ',
    focus: ['技术面走势'],
  }).report;

  const focusSection = merged.sections.find((section) => section.title === '关注方向');
  assert.equal(focusSection.claims.length, 1);
  assert.match(focusSection.claims[0].text, /经济观察网/);
  assert.doesNotMatch(focusSection.claims[0].text, /模型重复描述/);
  assert.deepEqual(focusSection.claims[0].evidence_ids, ['W1']);
});

test('monitor deterministic sections contain coverage but never repeat quote fields', () => {
  const coverage = reportServiceInternals.monitorCoverageEvidence({
    stock: { name: '示例科技', focus: ['经营风险'] },
    window: {
      start_label: '2026-07-21 18:00', end_label: '2026-07-22 18:00',
      start_date: '2026-07-21', end_date: '2026-07-22', timezone: 'Asia/Shanghai',
    },
    providerStatus: {
      datapro: { successful_query_count: 1, query_count: 1 },
      web_search: { successful_query_count: 3, query_count: 3 },
    },
    eventEvidenceCount: 0,
    retrievedAt: '2026-07-22T10:00:00.000Z',
  });
  const sections = reportServiceInternals.deterministicCoreSections([
    coverage,
    { id: 'D1', type: 'datapro', rows: [{ 最新价: 100 }] },
  ], 'monitor');
  assert.deepEqual(sections.map((section) => section.title), ['市场异动']);
  assert.match(JSON.stringify(sections), /最新价/);
  assert.doesNotMatch(JSON.stringify(sections), /财务|基本面/);
});

test('strips audit-absence filler from monitor reader fields', () => {
  const report = reportServiceInternals.stripInternalCoverageClaims({
    status: 'sufficient',
    summary: '最新行情上涨。本轮未发现公司层面新增公告或财务事项触发风险升级。',
    summary_evidence_ids: ['D1', 'C1'],
    change_summary: '这是首次生成的报告，暂无可比较的历史结果。',
    change_evidence_ids: [],
    risk_level: 'unknown',
    sections: [
      {
        title: '市场异动',
        claims: [{ text: '最新行情上涨。', evidence_ids: ['D1'] }],
      },
      {
        title: '公司事件',
        claims: [{ text: '本轮未发现新增公司事件。', evidence_ids: ['C1'] }],
      },
      {
        title: '后续观察',
        claims: [{ text: '继续观察原材料价格。', evidence_ids: ['W1'] }],
      },
    ],
    conclusion: {
      text: '当前未形成需要升级的新增风险结论。',
      evidence_ids: ['C1'],
    },
    limitations: ['本次未查到新增公告信息。'],
  }, [
    { id: 'D1', type: 'datapro' },
    { id: 'W1', type: 'web' },
    { id: 'C1', type: 'coverage' },
  ], 'monitor');

  assert.equal(report.summary, '最新行情上涨。');
  assert.deepEqual(report.sections.map((section) => section.title), ['市场异动', '后续观察']);
  assert.equal(report.conclusion.text, '继续观察原材料价格。');
  assert.deepEqual(report.limitations, []);
});

test('monitor keeps its market section when DataPro returns English market fields', () => {
  const sections = reportServiceInternals.deterministicCoreSections([{
    id: 'D1', type: 'datapro', as_of_date: '2026-07-22',
    rows: [{ open: 92.63, high: 93, low: 90.51, close: 94.3, volume: 603549 }],
  }], 'monitor', { name: '示例科技' });
  assert.deepEqual(sections.map((section) => section.title), ['市场异动']);
  const text = sections[0].claims[0].text;
  assert.match(text, /开盘价为92\.63/);
  assert.match(text, /最高价为93/);
  assert.match(text, /最低价为90\.51/);
  assert.doesNotMatch(text, /收盘价为94\.3|最新价为94\.3/);
});

test('brief and monitor fallbacks use different reader-facing article structures', () => {
  const brief = reportServiceInternals.deterministicCoreSections([{
    id: 'D1', type: 'datapro', as_of_date: '2026-07-22',
    rows: [{ 交易日期: '2026-07-22', 最新价: 101 }],
  }], 'brief', { name: '示例科技' });
  const coverage = reportServiceInternals.monitorCoverageEvidence({
    stock: { name: '示例科技', focus: ['经营风险'] },
    window: {
      start_label: '2026-07-21 18:00', end_label: '2026-07-22 18:00',
      start_date: '2026-07-21', end_date: '2026-07-22', timezone: 'Asia/Shanghai',
    },
    providerStatus: {
      datapro: { successful_query_count: 1, query_count: 1 },
      web_search: { successful_query_count: 3, query_count: 3 },
    },
    eventEvidenceCount: 0,
    retrievedAt: '2026-07-22T10:00:00.000Z',
  });
  const monitor = reportServiceInternals.deterministicCoreSections([
    coverage,
    { id: 'D2', type: 'datapro', as_of_date: '2026-07-22', rows: [{ 交易日期: '2026-07-22', 最新价: 101 }] },
  ], 'monitor', { name: '示例科技' });
  assert.deepEqual(brief.map((section) => section.title), ['市场表现']);
  assert.deepEqual(monitor.map((section) => section.title), ['市场异动']);
  assert.doesNotMatch(JSON.stringify(brief), /检查窗口|风险告警/);
  assert.doesNotMatch(JSON.stringify(monitor), /市场表现|经营与财务|基本面/);
});

test('does not present a unitless change value as a percentage in article text', () => {
  const sections = reportServiceInternals.deterministicCoreSections([{
    id: 'D1', type: 'datapro', as_of_date: '2026-07-22',
    rows: [{ 交易日期: '2026-07-22', 最新价: 101, 涨跌幅: 0.42 }],
  }], 'brief', { name: '示例科技' });
  const text = sections.flatMap((section) => section.claims).map((claim) => claim.text).join('\n');
  assert.match(text, /最新价为101/);
  assert.doesNotMatch(text, /涨跌幅为0\.42/);
});

test('brief marks a single-media litigation item as pending verification', () => {
  const summary = reportServiceInternals.briefWebSummary({
    id: 'W1',
    type: 'web_search',
    source_tier: 'media',
    title: '示例科技商标诉讼一审判决公开',
    publisher: '中国经济网',
    content: '示例科技商标诉讼一审判决公开，相关事项仍需以法院文书和公司披露为准。',
  }, { name: '示例科技', focus: ['近期公告信息'] }, '近期公告信息');
  assert.match(summary, /单一媒体线索尚待公司公告、法院文书或独立来源核实确认/);
  assert.doesNotMatch(summary, /后续应结合公司正式披露判断/);
});

test('change summary is a cited reader-facing fact rather than internal evidence wording', () => {
  const change = reportServiceInternals.readerSafeChangeSummary([{
    id: 'W1',
    type: 'web_search',
    source_tier: 'media',
    title: '示例科技商标诉讼一审判决公开',
    publisher: '中国经济网',
    content: '示例科技商标诉讼一审判决公开，相关事项仍需以法院文书和公司披露为准。',
    semantic_matches: [{ preference: '近期公告信息', quote: '示例科技商标诉讼一审判决公开' }],
  }], 'brief', { name: '示例科技', focus: ['近期公告信息'] });
  assert.deepEqual(change.evidence_ids, ['W1']);
  assert.match(change.text, /单一媒体线索尚待/);
  assert.doesNotMatch(change.text, /证据集合|正文已据此更新|检索|审校/);
});

test('semantic web evidence is condensed into a short literal summary', () => {
  const detail = reportServiceInternals.sourceDetailText({
    id: 'W1', type: 'web_search', source_tier: 'media',
    content: '人工智能行业政策持续推进。相关市场数据显示，调用需求增长明显。多家企业正在进行下一步布局。',
    semantic_matches: [{
      preference: '人工智能行业政策',
      quote: '人工智能行业政策持续推进。相关市场数据显示，调用需求增长明显。多家企业正在进行下一步布局。',
    }],
  }, { name: '示例科技' }, '人工智能行业政策');
  assert.match(detail, /人工智能行业政策持续推进|相关市场数据显示/);
  assert.equal(detail.length < 100, true);
});

test('official notices omit policy boilerplate and use publication attribution', () => {
  const item = {
    id: 'W1',
    type: 'web_search',
    source_tier: 'official',
    title: '关于发布相关备案信息的公告',
    publisher: '中国网信网',
    content: '促进生成式人工智能服务创新发展和规范应用，网信部门按照有关办法要求开展备案工作，现将新增的“示例智能”等7款提供手机端侧生成式人工智能服务备案信息予以公告。',
    semantic_matches: [{
      preference: '大模型技术迭代',
      scope: 'company',
      quote: '促进生成式人工智能服务创新发展和规范应用，网信部门按照有关办法要求开展备案工作，现将新增的“示例智能”等7款提供手机端侧生成式人工智能服务备案信息予以公告。',
    }],
  };
  const summary = reportServiceInternals.briefWebSummary(
    item,
    { name: '示例科技', focus: ['大模型技术迭代'] },
    '大模型技术迭代',
  );
  assert.equal(
    summary,
    '中国网信网发布的信息显示，新增的“示例智能”等7款提供手机端侧生成式人工智能服务备案信息已予以公告。',
  );
  assert.doesNotMatch(summary, /促进生成式人工智能服务创新发展和规范应用|中国网信网报道/);
});

test('web summaries replace relative article dates with the source publication date', () => {
  const summary = reportServiceInternals.briefWebSummary({
    id: 'W1',
    type: 'web_search',
    source_tier: 'media',
    title: '示例音乐上线订阅服务',
    publisher: '城市日报',
    published_at: '2026-07-18T08:40:00+08:00',
    content: '示例科技今天上线示例音乐订阅服务。',
    semantic_matches: [{
      preference: '订阅服务',
      scope: 'company',
      quote: '示例科技今天上线示例音乐订阅服务。',
    }],
  }, { name: '示例科技', focus: ['订阅服务'] }, '订阅服务');
  assert.match(summary, /示例科技2026年7月18日上线示例音乐订阅服务/);
  assert.doesNotMatch(summary, /今天|今日/);
});

test('single-media filing parameters and definite future integrations are not reader-safe facts', () => {
  const media = { source_tier: 'media' };
  const official = { source_tier: 'official' };
  const filingFact = '示例智能大模型已于2026年7月8日备案，适用场景为示例手机。';
  const integrationFact = '示例云将作为人工智能能力集成至示例终端。';
  assert.equal(reportServiceInternals.semanticQuoteIsSafe(filingFact, media), false);
  assert.equal(reportServiceInternals.semanticQuoteIsSafe(integrationFact, media), false);
  assert.equal(reportServiceInternals.semanticQuoteIsSafe(filingFact, official), true);
  assert.equal(
    reportServiceInternals.semanticQuoteIsSafe(
      '示例科技7月15日发布了新一代企业服务平台。',
      media,
    ),
    true,
  );
});

test('semantic binding rejects a bare stock-table row even when media numbers are allowed', () => {
  const quote = '601899 紫金矿业 -4.69 1.95 -116688.70';
  const item = {
    source_tier: 'media',
    content: `金属锌概念下跌，相关个股资金数据如下。${quote}。`,
  };
  assert.equal(
    reportServiceInternals.semanticQuoteIsSafe(
      quote,
      item,
      { allowMediaNumbers: true },
    ),
    false,
  );
  assert.equal(reportServiceInternals.conciseSemanticQuote(quote, '市场情况', item), '');
});

test('semantic binding rejects a quote truncated at the end of a search excerpt', () => {
  const quote = '端侧人工智能产业进程加快，示例智能提供手机端侧生成式人工智能服务';
  assert.equal(reportServiceInternals.semanticQuoteIsSafe(quote, {
    source_tier: 'media',
    content: `行业观察文章正文。${quote}`,
  }), false);
  assert.equal(reportServiceInternals.semanticQuoteIsSafe(quote, {
    source_tier: 'media',
    content: `行业观察文章正文。${quote}，相关服务已正式发布。`,
  }), true);
});

test('semantic binding rejects a dependent sentence fragment', () => {
  const quote = '而部分传统消费行业仍处于需求修复阶段。';
  assert.equal(reportServiceInternals.semanticQuoteIsSafe(quote, {
    source_tier: 'media',
    content: `机构调整了行业配置。${quote}后续仍需观察消费需求。`,
  }), false);
});

test('a truncated semantic binding cannot populate a preference paragraph', () => {
  const quote = '端侧AI产业进程将提速 日前，示例智能等7款提供手机端侧生成式人工智能服务';
  const detail = reportServiceInternals.sourceDetailText({
    source_tier: 'media',
    content: `行业观察文章正文。${quote}`,
    semantic_matches: [{
      preference: 'AI产品进展',
      scope: 'external',
      quote,
    }],
  }, {
    name: '示例科技',
    focus: ['AI产品进展'],
  }, 'AI产品进展');
  assert.equal(detail, '');
});

test('carried-forward sources discard incomplete semantic matches while preserving complete matches', () => {
  const stock = {
    name: 'Apple',
    code: 'AAPL',
    exchange: 'US',
    focus: ['iPhone需求', 'AI产品进展'],
  };
  const completeQuote = '近期，苹果iPhone 18系列量产，正处于产能爬坡阶段。';
  const truncatedQuote = '端侧AI产业进程将提速，Apple智能等7款提供手机端侧生成式人工智能服务';
  const records = [{
    report: {
      analysis: {
        summary_evidence_ids: ['W1'],
        sections: [],
      },
      evidence: [{
        id: 'W1',
        type: 'web_search',
        title: 'Apple产业链公司迎来新进展',
        publisher: '中证网',
        url: 'https://www.cs.com.cn/apple-update',
        published_at: '2026-07-24T07:54:00+08:00',
        as_of_date: '2026-07-24',
        source_tier: 'media',
        content: `产业链观察。${completeQuote}${truncatedQuote}`,
        semantic_binding_checked: true,
        semantic_matches: [
          { preference: 'iPhone需求', scope: 'external', quote: completeQuote },
          { preference: 'AI产品进展', scope: 'external', quote: truncatedQuote },
        ],
      }],
    },
  }];

  const items = reportServiceInternals.carriedForwardMonitorWebItems(
    records,
    stock,
    new Date('2026-07-27T07:38:57.137Z'),
  );
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].semantic_matches, [{
    preference: 'iPhone需求',
    scope: 'external',
    quote: completeQuote,
  }]);
});

test('one source can produce distinct paragraphs for distinct verified preferences', () => {
  const stock = {
    name: '示例科技',
    code: 'TEST1',
    exchange: 'CN',
    focus: ['新一代产品发布', '海外服务中心'],
  };
  const sections = reportServiceInternals.deterministicContextSections([{
    id: 'W1',
    type: 'web_search',
    source_tier: 'official',
    title: '示例科技发布两项业务进展',
    publisher: '示例科技',
    url: 'https://example.com/official-update',
    published_at: '2026-07-26T10:00:00+08:00',
    content: '示例科技完成新一代产品发布。示例科技海外服务中心正式投入运营。',
    semantic_binding_checked: true,
    semantic_matches: [
      {
        preference: '新一代产品发布',
        scope: 'company',
        quote: '示例科技完成新一代产品发布。',
      },
      {
        preference: '海外服务中心',
        scope: 'company',
        quote: '示例科技海外服务中心正式投入运营。',
      },
    ],
    rows: [],
  }], stock, 'brief');
  const claims = sections
    .find((section) => section.title === '关注方向')
    ?.claims || [];
  assert.equal(claims.length, 2);
  assert.deepEqual(claims.map((claim) => claim.evidence_ids), [['W1'], ['W1']]);
  assert.match(claims[0].text, /新一代产品发布/);
  assert.match(claims[1].text, /海外服务中心正式投入运营/);
  assert.notEqual(claims[0].text, claims[1].text);
});

test('preference coverage requires a distinct matching paragraph, not only a shared evidence id', () => {
  const evidence = [{
    id: 'W1',
    type: 'web_search',
    source_tier: 'media',
    semantic_binding_checked: true,
    content: '受供需变化影响，铜价近期出现明显波动。海外主要经济体利率政策仍在调整。',
    semantic_matches: [{
      preference: '原材料价格',
      scope: 'external',
      quote: '受供需变化影响，铜价近期出现明显波动。',
    }, {
      preference: '宏观趋势',
      scope: 'external',
      quote: '海外主要经济体利率政策仍在调整。',
    }],
  }];
  const aligned = reportServiceInternals.alignPreferenceContractWithReport([
    {
      preference: '原材料价格',
      display_label: '原材料价格',
      expected_section: '关注方向',
      status: 'covered',
      evidence_ids: ['W1'],
    },
    {
      preference: '宏观趋势',
      display_label: '宏观趋势',
      expected_section: '关注方向',
      status: 'covered',
      evidence_ids: ['W1'],
    },
  ], {
    sections: [{
      title: '关注方向',
      claims: [{
        text: '围绕“原材料价格”，媒体报道，受供需变化影响，铜价近期出现明显波动。',
        evidence_ids: ['W1'],
      }],
    }],
  }, evidence);

  assert.equal(aligned[0].status, 'covered');
  assert.deepEqual(aligned[0].evidence_ids, ['W1']);
  assert.equal(aligned[1].status, 'watch');
  assert.deepEqual(aligned[1].evidence_ids, []);
});

test('independent verification receives the retrieved web text hidden from generation', () => {
  const evidence = [{
    id: 'W1',
    type: 'web_search',
    source_tier: 'media',
    title: '示例汽车：6月新能源汽车产量403246辆',
    publisher: '第一财经',
    content: '示例汽车公告称，2026年6月新能源汽车产量403246辆；销量403472辆；本年累计销量1808511辆；本月出口新能源汽车175349辆。',
  }];
  const generation = JSON.parse(reportServiceInternals.buildInput({
    stock: { name: '示例汽车', code: '000001', exchange: 'CN', focus: ['行业动态'] },
    type: 'brief',
    evidence,
    previous: null,
    changeStatus: 'initial',
    monitorSettings: null,
    window: null,
  }));
  const verification = JSON.parse(reportServiceInternals.verificationInput(
    { status: 'sufficient' },
    evidence,
    'initial',
    [],
  ));

  assert.doesNotMatch(generation.evidence[0].content, /销量403472辆/);
  assert.match(verification.evidence[0].content, /销量403472辆/);
  assert.match(verification.evidence[0].content, /累计销量1808511辆/);
});

test('monitor change summary keeps an externally bound source in external-risk wording', () => {
  const change = reportServiceInternals.readerSafeChangeSummary([{
    id: 'W1',
    type: 'web_search',
    source_tier: 'media',
    title: '碳酸锂市场价格出现波动',
    publisher: '中国工信新闻网',
    content: '截至上午收盘，碳酸锂期价涨超4%，原料端供应偏紧，市场仍在观察后续供需变化。',
    semantic_matches: [{
      preference: '原材料价格',
      scope: 'external',
      quote: '碳酸锂期价涨超4%，原料端供应偏紧，市场仍在观察后续供需变化。',
    }],
  }], 'monitor', { name: '远山能源', focus: ['原材料价格'] });
  assert.deepEqual(change.evidence_ids, ['W1']);
  assert.match(change.text, /碳酸锂期价涨超4%/);
  assert.doesNotMatch(change.text, /远山能源.*公司事件|公司层面/);
});

test('semantic company binding classifies a source without the stock name in its title as a company event', () => {
  const section = reportServiceInternals.deterministicWebSection([{
    id: 'W1',
    type: 'web_search',
    source_tier: 'media',
    title: '新一代海底数据中心项目公布交付安排',
    publisher: '第一财经',
    content: '晨星科技披露，其海底数据中心项目新增一笔设备订单，交付安排仍以公司后续公告为准。',
    semantic_matches: [{
      preference: '海底数据中心订单',
      scope: 'company',
      quote: '晨星科技披露，其海底数据中心项目新增一笔设备订单，交付安排仍以公司后续公告为准。',
    }],
  }], 'monitor', { name: '晨星科技', code: '000999', focus: ['海底数据中心订单'] });
  assert.equal(section.title, '公司事件');
  assert.match(section.claims[0].text, /新增一笔设备订单/);
});
