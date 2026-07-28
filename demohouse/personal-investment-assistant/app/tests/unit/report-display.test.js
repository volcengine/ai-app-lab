import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isCurrentMonitorAnalysis,
  isDisplayableRecord,
  isReaderSafeRecord,
  readerVisibleAnalysis,
  reportHistoryItems,
  sourceExcerpt,
  sourceExcerpts,
  visibleMonitorRuns,
} from '../../src/web/report-display.js';

test('accepts a current monitor article when evidence-free sections are omitted', () => {
  assert.equal(isCurrentMonitorAnalysis({
    sections: [
      { title: '市场异动', claims: [{ text: '行情变化。', evidence_ids: ['D1'] }] },
      { title: '外部风险', claims: [{ text: '原材料价格变化。', evidence_ids: ['W1'] }] },
    ],
  }), true);
});

test('rejects legacy or malformed monitor article structures', () => {
  assert.equal(isCurrentMonitorAnalysis({
    sections: [{ title: '市场表现', claims: [] }, { title: '后续观察', claims: [] }],
  }), false);
  assert.equal(isCurrentMonitorAnalysis({
    sections: [{ title: '市场异动', claims: [] }],
  }), false);
  assert.equal(isCurrentMonitorAnalysis(null), false);
});

test('keeps every generated backend report in history without content filtering', () => {
  const items = [
    {
      id: 'monitor-without-follow-up',
      status: 'completed',
      report: {
        analysis: {
          summary: '当日行情和公司事件摘要。',
          sections: [{ title: '公司事件', claims: [{ text: '公司事件。' }] }],
        },
      },
    },
    {
      id: 'manual-review',
      status: 'review_required',
      report: { analysis: { summary: '待复核报告。', sections: [] } },
    },
    {
      id: 'legacy-monitor',
      status: 'completed',
      report: { analysis: { summary: '历史报告。', sections: [] } },
    },
  ];

  assert.deepEqual(reportHistoryItems({ items }), items);
  assert.deepEqual(reportHistoryItems({}), []);
});

test('shows the verified preference quote in a cited web-source card', () => {
  const excerpt = sourceExcerpt({
    title: '宏观政策展望',
    content: '文章开头先讨论市场估值和资金流向。\n后文讨论宏观政策方向。',
    semantic_matches: [{
      preference: '宏观',
      quote: '7月中央政治局会议定调下半年宏观政策与产业发展方向。',
    }],
  }, '示例公司');

  assert.equal(excerpt, '7月中央政治局会议定调下半年宏观政策与产业发展方向。');
  assert.doesNotMatch(excerpt, /市场估值/);
});

test('shows the exact reader-facing cited excerpt before unrelated page content', () => {
  const excerpt = sourceExcerpt({
    title: '示例公司启动招聘计划',
    content: '页面开头介绍了与本次结论无关的历史运输安排。',
    cited_excerpt: '公开信息报道“示例公司启动招聘计划”。',
  }, '示例公司');

  assert.equal(excerpt, '公开信息报道“示例公司启动招聘计划”。');
});

test('shows every distinct verified preference excerpt from one cited source', () => {
  const excerpts = sourceExcerpts({
    title: '示例公司业务进展',
    cited_excerpt: '围绕“云业务”：示例公司云业务收入保持增长。',
    semantic_matches: [{
      preference: '云业务',
      quote: '示例公司云业务收入保持增长。',
    }, {
      preference: '资本开支',
      quote: '示例公司继续建设算力网络基础设施。',
    }],
  }, '示例公司');

  assert.deepEqual(excerpts, [
    '围绕“云业务”：示例公司云业务收入保持增长。',
    '围绕“资本开支”：示例公司继续建设算力网络基础设施。',
  ]);
});

test('quarantines legacy reports containing superseded filler or editorial text', () => {
  const safeRecord = {
    report: {
      analysis: {
        summary: '当日行情上涨，碳酸锂期价涨超4%。',
        sections: [
          { title: '市场异动', claims: [{ text: '最新价上涨3%。', evidence_ids: ['D1'] }] },
          { title: '外部风险', claims: [{ text: '碳酸锂价格上涨。', evidence_ids: ['W1'] }] },
          { title: '后续观察', claims: [{ text: '继续观察价格传导。', evidence_ids: ['W1'] }] },
        ],
      },
    },
  };
  assert.equal(isReaderSafeRecord(safeRecord, 'monitor'), true);
  assert.equal(isReaderSafeRecord({
    report: {
      analysis: {
        ...safeRecord.report.analysis,
        summary: '产业资源优势持续显现，投资逻辑得到强化。',
      },
    },
  }, 'monitor'), false);
  assert.equal(isReaderSafeRecord({
    report: {
      analysis: {
        summary: '最新行情与已披露经营数据构成当前个股观察的主要基础。',
        sections: [{ title: '市场表现', claims: [] }],
      },
    },
  }, 'brief'), false);
  assert.equal(isReaderSafeRecord({
    report: {
      analysis: {
        summary: '当前简评围绕当日行情、已披露经营指标和近期公司进展展开。',
        sections: [{ title: '市场表现', claims: [] }],
      },
    },
  }, 'brief'), false);
});

test('omits the superseded first-generation brief filler while keeping factual sections', () => {
  const visible = readerVisibleAnalysis({
    summary: '当前主要观察维持不变，正文列示本次可以确认的具体信息。',
    summary_evidence_ids: ['D1', 'W1'],
    sections: [{
      title: '市场表现',
      claims: [{ text: '最新价为38.88元。', evidence_ids: ['D1'] }],
    }],
  }, [
    { id: 'D1', type: 'datapro' },
    { id: 'W1', type: 'web_search' },
  ], 'brief');

  assert.equal(visible.summary, '');
  assert.deepEqual(visible.summary_evidence_ids, []);
  assert.equal(visible.sections[0].claims[0].text, '最新价为38.88元。');
});

test('keeps unresolved latest monitor failures visible and folds resolved ones', () => {
  const resolved = [
    { id: '3', status: 'completed' },
    { id: '2', status: 'failed' },
    { id: '1', status: 'completed' },
  ];
  assert.deepEqual(visibleMonitorRuns(resolved).map((item) => item.id), ['3', '1']);
  const unresolved = [
    { id: '4', status: 'failed' },
    ...resolved,
  ];
  assert.deepEqual(visibleMonitorRuns(unresolved).map((item) => item.id), ['4', '3', '2', '1']);
});

test('keeps a report with audit warnings visible for manual review', () => {
  const record = {
    status: 'review_required',
    report: {
      quality_controls: { review_required: true },
      analysis: {
        summary: '当日行情上涨，外部事件需要核对。',
        sections: [{
          title: '外部风险',
          claims: [{ text: '外部事件需要核对。', evidence_ids: ['W1'] }],
        }],
      },
      evidence: [{ id: 'W1', type: 'web_search' }],
    },
  };
  assert.equal(isDisplayableRecord(record, 'monitor'), true);
});

test('keeps internal monitor coverage out of the reader-facing article', () => {
  const analysis = readerVisibleAnalysis({
    summary: '当日行情上涨，原材料价格出现波动。',
    sections: [{
      title: '外部风险',
      claims: [{ text: '碳酸锂期价上涨。', evidence_ids: ['W1'] }],
    }, {
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
  assert.deepEqual(analysis.sections[1].claims, [
    { text: '继续观察原材料成本传导。', evidence_ids: ['W1'] },
  ]);
  assert.doesNotMatch(JSON.stringify(analysis), /用户监控配置/);
});

test('removes unsupported audit-absence wording from existing monitor reports', () => {
  const analysis = {
    summary: '当日行情上涨，原材料价格出现波动。本轮未发现公司层面新增公告或财务事项触发风险升级。',
    sections: [
      {
        title: '市场异动',
        claims: [{ text: '最新价上涨3%。', evidence_ids: ['D1'] }],
      },
      {
        title: '公司事件',
        claims: [{ text: '本轮未查到需要升级的新增公司事件。', evidence_ids: ['C1'] }],
      },
      {
        title: '后续观察',
        claims: [{ text: '继续观察原材料价格变化。', evidence_ids: ['W1'] }],
      },
    ],
    conclusion: {
      text: '当前未形成需要升级的新增风险信号。',
      evidence_ids: ['C1'],
    },
    limitations: ['本次未发现新增公告信息。'],
  };
  const visible = readerVisibleAnalysis(analysis, [
    { id: 'D1', type: 'datapro' },
    { id: 'W1', type: 'web' },
    { id: 'C1', type: 'coverage' },
  ], 'monitor');

  assert.equal(visible.summary, '当日行情上涨，原材料价格出现波动。');
  assert.deepEqual(visible.sections.map((section) => section.title), ['市场异动', '后续观察']);
  assert.equal(visible.conclusion.text, '继续观察原材料价格变化。');
  assert.deepEqual(visible.limitations, []);

  const legacyVisible = readerVisibleAnalysis({
    ...analysis,
    summary: '当前风险观察以当日市场变化和近期公司事件为主，尚未形成需要升级的确定性风险结论。',
  }, [
    { id: 'D1', type: 'datapro' },
    { id: 'W1', type: 'web' },
    { id: 'C1', type: 'coverage' },
  ], 'monitor');
  assert.equal(legacyVisible.summary, '最新价上涨3%。');
});
