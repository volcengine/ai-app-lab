import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evidenceMatchesStockCode,
  fingerprintEvidence,
  normalizeDataProEvidence,
  normalizeWebEvidence,
  validateGeneratedReport,
} from '../../src/server/domain/evidence.js';

// All security identifiers and financial values in this file are synthetic.

const evidence = [
  {
    id: 'D1',
    type: 'datapro',
    title: '示例科技 · 财务指标',
    publisher: 'DataPro',
    url: null,
    retrieved_at: '2026-07-21T10:00:00.000Z',
    published_at: null,
    as_of_date: '2026年6月30日',
    freshness: 'unknown',
    content: '报告期2026年6月30日，营业收入100.00亿元。',
    rows: [],
  },
  {
    id: 'W1',
    type: 'web_search',
    title: '示例科技发布经营公告',
    publisher: '示例交易所',
    url: 'https://example.com/notice',
    retrieved_at: '2026-07-21T10:00:00.000Z',
    published_at: '2026-07-21',
    as_of_date: '2026-07-21',
    freshness: 'current_or_recent',
    content: '示例科技发布经营公告。',
    rows: [],
  },
];

function report(overrides = {}) {
  return {
    status: 'sufficient',
    summary: '营业收入为100.00亿元。',
    summary_evidence_ids: ['D1'],
    change_summary: '本次公开信息包含经营公告。',
    change_evidence_ids: ['W1'],
    risk_level: 'low',
    sections: [{
      title: '经营数据',
      claims: [{ text: '报告期为2026年6月30日。', evidence_ids: ['D1'] }],
    }],
    conclusion: { text: '公开信息显示已发布经营公告。', evidence_ids: ['W1'] },
    limitations: [],
    ...overrides,
  };
}

test('validates summary, claims, and conclusion against bound evidence', () => {
  assert.equal(validateGeneratedReport(report(), evidence).summary, '营业收入为100.00亿元。');
});

test('rejects a number in the summary that is absent from its evidence', () => {
  assert.throws(
    () => validateGeneratedReport(report({ summary: '营业收入为101.00亿元。' }), evidence),
    (error) => error.code === 'EVIDENCE_VALIDATION_FAILED'
      && error.details.some((issue) => issue.location === 'summary'),
  );
});

test('rejects missing evidence ids', () => {
  assert.throws(
    () => validateGeneratedReport(report({ summary_evidence_ids: ['D9'] }), evidence),
    (error) => error.details.some((issue) => issue.type === 'missing_evidence'),
  );
});

test('rejects repeated boilerplate paragraphs inside the same section', () => {
  const repeated = report({
    sections: [{
      title: '公司事件',
      claims: [
        {
          text: '第一项公司动态是近7日公司层面的观察重点。当前作为近期背景持续跟踪，是否影响经营仍取决于后续正式披露。',
          evidence_ids: ['W1'],
        },
        {
          text: '第二项产能进展是近7日公司层面的观察重点。当前作为近期背景持续跟踪，是否影响经营仍取决于后续正式披露。',
          evidence_ids: ['W1'],
        },
      ],
    }],
  });
  assert.throws(
    () => validateGeneratedReport(repeated, evidence),
    (error) => error.details.some((issue) => (
      issue.type === 'repeated_claim_text'
      && issue.location === 'sections.0.claims.1'
    )),
  );
});

test('accepts ISO and Chinese representations of the same calendar date', () => {
  const datedEvidence = evidence.map((item, index) => index === 0 ? {
    ...item,
    as_of_date: '2026-07-21',
    content: '实际交易日期为2026-07-21。',
  } : item);
  const datedReport = report({
    summary: '实际交易日期为2026年7月21日。',
    summary_evidence_ids: ['D1'],
    sections: [{ title: '行情日期', claims: [{ text: '该证据包含实际交易日期。', evidence_ids: ['D1'] }] }],
  });
  assert.equal(validateGeneratedReport(datedReport, datedEvidence).summary, '实际交易日期为2026年7月21日。');
});

test('accepts compact and ISO representations of the same calendar date', () => {
  const datedEvidence = evidence.map((item, index) => index === 0 ? {
    ...item,
    content: '定期报告实际披露日期为20260429。',
  } : item);
  const datedReport = report({
    summary: '定期报告实际披露日期为2026-04-29。',
    summary_evidence_ids: ['D1'],
    sections: [{ title: '披露日期', claims: [{ text: '该证据包含实际披露日期。', evidence_ids: ['D1'] }] }],
  });
  assert.equal(validateGeneratedReport(datedReport, datedEvidence).summary, '定期报告实际披露日期为2026-04-29。');
});

test('treats percentage whitespace as presentation-only', () => {
  const percentEvidence = evidence.map((item, index) => index === 0 ? {
    ...item,
    content: '最新涨跌幅为3.6883 %。',
  } : item);
  const percentReport = report({
    summary: '最新涨跌幅为3.6883%。',
    summary_evidence_ids: ['D1'],
    sections: [{
      title: '市场表现',
      claims: [{ text: '最新涨跌幅为3.6883%。', evidence_ids: ['D1'] }],
    }],
  });
  assert.equal(validateGeneratedReport(percentReport, percentEvidence).summary, '最新涨跌幅为3.6883%。');
});

test('evidence fingerprint ignores retrieval time and local ids', () => {
  const changedMetadata = evidence.map((item, index) => ({
    ...item,
    id: index === 0 ? 'D7' : 'W7',
    retrieved_at: '2026-07-21T11:00:00.000Z',
  }));
  assert.equal(fingerprintEvidence(evidence), fingerprintEvidence(changedMetadata));
});

test('evidence fingerprint ignores provider ordering and generated DataPro labels', () => {
  const first = [{
    id: 'D1',
    type: 'datapro',
    title: '示例科技 · 营业收入、研发费用',
    publisher: 'DataPro',
    retrieved_at: '2026-07-21T10:00:00.000Z',
    as_of_date: '2026-03-31',
    content: '{"rows":[{"营业收入":100,"研发费用":10}]}',
    rows: [{ 营业收入: 100, 研发费用: 10 }],
    metadata: { 证券代码: 'TEST1.CN', 报告期: '20260331' },
  }];
  const reordered = [{
    id: 'D9',
    type: 'datapro',
    title: '示例科技 · 研发费用、营业收入',
    publisher: 'DataPro',
    retrieved_at: '2026-07-21T11:00:00.000Z',
    as_of_date: '2026-03-31',
    content: '{"rows":[{"研发费用":10,"营业收入":100}]}',
    rows: [{ 研发费用: 10, 营业收入: 100 }],
    metadata: { 报告期: '20260331', 证券代码: 'TEST1.CN' },
  }];
  assert.equal(fingerprintEvidence(first), fingerprintEvidence(reordered));
});

test('web evidence preserves the provider title, publisher, and URL', () => {
  const [item] = normalizeWebEvidence({ items: [{
    title: '接口返回的原始标题',
    publisher: '原始站点',
    url: 'https://example.com/original',
    summary: '原始摘要',
    published_at: '2026-07-21',
  }] }, '2026-07-21T10:00:00.000Z');
  assert.deepEqual(
    { title: item.title, publisher: item.publisher, url: item.url },
    { title: '接口返回的原始标题', publisher: '原始站点', url: 'https://example.com/original' },
  );
});

test('web evidence preserves a distinct reprint hosting site', () => {
  const [item] = normalizeWebEvidence({ items: [{
    title: '转载文章标题',
    publisher: '期货日报',
    hosting_site: '证券时报',
    url: 'https://www.stcn.com/article/detail/1.html',
    summary: '来源：期货日报',
    published_at: '2026-07-23',
  }] }, '2026-07-23T10:00:00.000Z');
  assert.equal(item.publisher, '期货日报');
  assert.equal(item.hosting_site, '证券时报');
});

test('DataPro evidence keeps provider identity fields and requires an explicit as-of value upstream', () => {
  const [item] = normalizeDataProEvidence(
    { name: '示例科技' },
    {
      query: '查询',
      items: [{ 证券代码: 'TEST1.CN', table: { 交易日期: ['2026-07-21'], 最新价: [10] } }],
    },
    '2026-07-21T10:00:00.000Z',
  );
  assert.equal(item.security_code, 'TEST1.CN');
  assert.equal(item.as_of_date, '2026-07-21');
  assert.equal(item.metadata['证券代码'], 'TEST1.CN');
  assert.equal(evidenceMatchesStockCode(item, 'TEST1.CN'), true);
  assert.equal(evidenceMatchesStockCode(item, 'OTHER.CN'), false);
});

test('DataPro evidence reads a security code from table columns and rejects another company', () => {
  const [item] = normalizeDataProEvidence(
    { name: '目标公司' },
    {
      items: [{
        table: {
          证券代码: ['OTHER.US'],
          交易日期: ['2026-07-21'],
          最新价: [10],
        },
      }],
    },
    '2026-07-21T10:00:00.000Z',
  );
  assert.equal(item.security_code, 'OTHER.US');
  assert.equal(evidenceMatchesStockCode(item, 'TARGET.US'), false);
});

test('DataPro evidence without a verifiable security code never matches a stock', () => {
  const [item] = normalizeDataProEvidence(
    { name: '目标公司' },
    { items: [{ table: { 交易日期: ['2026-07-21'], 最新价: [10] } }] },
    '2026-07-21T10:00:00.000Z',
  );
  assert.equal(item.security_code, null);
  assert.equal(evidenceMatchesStockCode(item, 'TARGET.US'), false);
});

test('security-code matching accepts market suffixes and Hong Kong leading-zero variants', () => {
  assert.equal(evidenceMatchesStockCode({ security_code: '700.HK' }, '00700'), true);
  assert.equal(evidenceMatchesStockCode({ security_code: 'HK00700' }, '700.HK'), true);
  assert.equal(evidenceMatchesStockCode({ security_code: 'SZ002594' }, '002594.SZ'), true);
  assert.equal(evidenceMatchesStockCode({ security_code: 'BRK.B.US' }, 'BRK.B'), true);
  assert.equal(evidenceMatchesStockCode({ security_code: 'AAPL.O' }, 'AAPL'), true);
  assert.equal(evidenceMatchesStockCode({ security_code: 'NASDAQ:MSFT' }, 'MSFT'), true);
});

test('DataPro evidence normalizes a flat overseas market response', () => {
  const [item] = normalizeDataProEvidence(
    { name: 'Example Inc.', exchange: 'US' },
    {
      items: [{
        证券名称: 'Example Inc.',
        证券代码: 'EXMPL.O',
        上市市场: 'NASDAQ',
        实际交易日期: '2026-07-27',
        交易时间: '2026-07-27 05:05:51 (UTC+8)',
        最新价: { value: 123.45, unit: 'USD' },
        涨跌幅: '+0.14%',
        成交量: { value: 47.49, unit: '百万股' },
      }],
    },
    '2026-07-27T03:00:00.000Z',
  );
  assert.equal(item.security_code, 'EXMPL.O');
  assert.equal(evidenceMatchesStockCode(item, 'EXMPL'), true);
  assert.equal(item.as_of_date, '2026-07-27');
  assert.equal(item.rows.length, 1);
  assert.equal(item.rows[0]['最新价'], '123.45 USD');
  assert.equal(item.rows[0]['成交量'], '47.49 百万股');
});

test('market evidence prefers the actual recent trading day over the query date', () => {
  const [item] = normalizeDataProEvidence(
    { name: 'Example Inc.', exchange: 'US' },
    {
      items: [{
        证券代码: 'EXMPL.O',
        查询日期: '2026-07-27',
        当日交易状态: '休市',
        最近交易日: '2026-07-24',
        最近交易时间: '2026-07-24 16:00 (EDT)',
        最新价: 123.45,
        收盘价: 123.45,
      }],
    },
    '2026-07-27T03:00:00.000Z',
  );
  assert.equal(item.as_of_date, '2026-07-24');
  assert.equal(item.rows[0].最近交易日, '2026-07-24');
});

test('overseas original-currency financial fields are not mislabeled as renminbi', () => {
  const [item] = normalizeDataProEvidence(
    { name: 'Example Inc.', exchange: 'US' },
    {
      items: [{
        证券代码: 'EXMPL.O',
        table: {
          '一般企业/利润表/营业收入': [12345000000],
          '财务报表/最新报告期': ['20260630'],
        },
        field_meta: {
          '一般企业/利润表/营业收入': {
            caliber: { 报告期: '最新一期(MRQ)', 货币币种: '原始币种', 单位: '元' },
          },
        },
      }],
    },
    '2026-07-27T03:00:00.000Z',
  );
  assert.equal(item.rows[0]['一般企业/利润表/营业收入'], '12,345,000,000 原始币种');
  assert.doesNotMatch(item.content, /12,345,000,000 元/);
});

test('top-level financial dates remain visible beside selected statement rows', () => {
  const [item] = normalizeDataProEvidence(
    { name: 'Apple', code: 'AAPL', exchange: 'US' },
    {
      items: [{
        证券代码: 'AAPL.O',
        定期报告最新报告期: '20260630',
        定期报告实际披露日期: '20260724',
        table: {
          '一般企业/利润表/营业收入': [254940000000],
          '一般企业/利润表/研发费用': [22306000000],
        },
        field_meta: {
          '一般企业/利润表/营业收入': {
            caliber: { 货币币种: '原始币种', 单位: '元' },
          },
        },
      }],
    },
    '2026-07-27T04:00:00.000Z',
  );
  assert.equal(item.rows[0].定期报告最新报告期, '20260630');
  assert.equal(item.rows[0].定期报告实际披露日期, '20260724');
  assert.match(item.content, /20260630/);
  assert.match(item.content, /20260724/);
});

test('DataPro evidence normalizes the records response shape', () => {
  const [item] = normalizeDataProEvidence(
    { name: '示例科技' },
    {
      query: '查询',
      items: [{
        security_code: '123456.SZ',
        records: [{
          indicator_name: '收盘价',
          value: 12.34,
          unit: '元',
          caliber: { 交易日期: '2026-07-20' },
        }],
      }],
    },
    '2026-07-21T10:00:00.000Z',
  );
  assert.equal(item.security_code, '123456.SZ');
  assert.equal(item.as_of_date, '2026-07-20');
  assert.equal(item.rows[0].indicator_name, '收盘价');
  assert.equal(item.rows[0].display_value, '12.34元');
  assert.match(item.title, /收盘价/);
  assert.match(item.content, /12\.34/);
  assert.equal(evidenceMatchesStockCode(item, '123456'), true);
});

test('DataPro evidence reads the actual date from the top-level time array', () => {
  const [item] = normalizeDataProEvidence(
    { name: '示例科技' },
    {
      items: [{
        证券代码: '123456.SZ',
        time: ['2026-07-18', '2026-07-20'],
        table: {
          开盘价: [10.10, 10.30],
          收盘价: [10.20, 10.40],
        },
      }],
    },
    '2026-07-21T10:00:00.000Z',
  );
  assert.equal(item.security_code, '123456.SZ');
  assert.equal(item.as_of_date, '2026-07-20');
  assert.equal(item.rows.length, 2);
  assert.equal(item.rows[0]['交易日期'], '2026-07-18');
  assert.equal(item.rows[1]['交易日期'], '2026-07-20');
  assert.equal(evidenceMatchesStockCode(item, '123456'), true);
});

test('DataPro evidence removes binary floating-point tails from displayed provider values', () => {
  const [item] = normalizeDataProEvidence(
    { name: '示例科技' },
    { items: [{
      证券代码: 'TEST1.CN',
      table: {
        交易日期: ['2026-07-21'],
        涨跌: [0.37999999999999545],
        涨跌幅: [0.40459965928449254],
      },
    }] },
    '2026-07-21T10:00:00.000Z',
  );
  assert.equal(item.rows[0]['涨跌'], 0.38);
  assert.equal(item.rows[0]['涨跌幅'], '0.4046 %');
});

test('DataPro evidence preserves field metadata and prefers the actual report period', () => {
  const [item] = normalizeDataProEvidence(
    { name: '示例科技' },
    {
      items: [{
        证券代码: 'TEST1.CN',
        table: {
          营业收入: [12345000000],
          归母净利润: [678900000],
          毛利率: [15.25],
          研发费用: [456700000],
          定期报告最新报告期: ['20260331'],
          实际披露日期: ['20260429'],
        },
        field_meta: {
          营业收入: { caliber: { 年度: '2026', 季度: '第一季度', 单位: '元' } },
          毛利率: { caliber: { 年度: '2026', 季度: '第一季度', 单位: '%' } },
        },
      }],
    },
    '2026-07-21T10:00:00.000Z',
  );
  assert.equal(item.security_code, 'TEST1.CN');
  assert.equal(item.as_of_date, '2026-03-31');
  assert.equal(item.rows[0]['营业收入'], '12,345,000,000 元');
  assert.equal(item.rows[0]['毛利率'], '15.25 %');
  assert.equal(item.metadata['证券代码'], 'TEST1.CN');
  assert.match(item.content, /field_meta/);
  assert.match(item.content, /第一季度/);
});

test('DataPro evidence keeps the dominant statement family and drops conflicting statement fields', () => {
  const [item] = normalizeDataProEvidence(
    { name: '示例科技' },
    {
      items: [{
        证券代码: 'TEST1.CN',
        table: {
          '一般企业/利润表/营业收入': [12345000000],
          '一般企业/利润表/研发费用': [456700000],
          '商业银行/利润表/归属于母公司所有者的净利润': [678900000],
          '财务分析/盈利能力/销售毛利率': [15.25],
          '盈利能力/盈利能力指标评价/毛利率评价': ['本期毛利率15.25%,上期为16.00%'],
          定期报告最新报告期: ['20260331'],
        },
      }],
    },
    '2026-07-21T10:00:00.000Z',
  );
  assert.equal(item.rows[0]['一般企业/利润表/营业收入'], 12345000000);
  assert.equal(item.rows[0]['一般企业/利润表/研发费用'], 456700000);
  assert.equal(item.rows[0]['商业银行/利润表/归属于母公司所有者的净利润'], undefined);
  assert.equal(item.rows[0]['盈利能力/盈利能力指标评价/毛利率评价'], undefined);
  assert.doesNotMatch(item.content, /商业银行\/利润表/);
  assert.doesNotMatch(item.content, /去年同期/);
  assert.match(item.content, /销售毛利率/);
});

test('DataPro evidence derives a quarter from field metadata when no report date column exists', () => {
  const [item] = normalizeDataProEvidence(
    { name: '示例科技' },
    {
      items: [{
        证券代码: 'TEST1.CN',
        table: { 营业收入: [100] },
        field_meta: {
          营业收入: { caliber: { 年度: '2026', 季度: '第一季度', 单位: '亿元' } },
        },
      }],
    },
    '2026-07-21T10:00:00.000Z',
  );
  assert.equal(item.as_of_date, '2026年第一季度');
  assert.equal(item.rows.length, 1);
});

test('DataPro records drop empty values and derive a structured quarter', () => {
  const [item] = normalizeDataProEvidence(
    { name: '示例科技' },
    {
      items: [{
        security_code: 'TEST1.CN',
        records: [
          { indicator_name: '营业收入', value: null, caliber: { 年度: '2026', 季度: '第二季度' } },
          { indicator_name: '归母净利润', value: 20, unit: '亿元', caliber: { 年度: '2026', 季度: '第一季度' } },
        ],
      }],
    },
    '2026-07-21T10:00:00.000Z',
  );
  assert.equal(item.rows.length, 1);
  assert.equal(item.rows[0].indicator_name, '归母净利润');
  assert.equal(item.as_of_date, '2026年第一季度');
  assert.doesNotMatch(item.content, /营业收入/);
});

test('rejects company operating metrics supported only by secondary media', () => {
  const metricEvidence = [
    {
      ...evidence[0],
      title: '示例科技 · 实时行情',
      as_of_date: '2026-07-21',
      content: '2026-07-21 最新价14.3元。',
    },
    {
      ...evidence[1],
      source_tier: 'media',
      content: '媒体报道示例科技2026年一季度营收123.45亿元。',
    },
  ];
  const metricReport = report({
    summary: '媒体报道示例科技2026年一季度营收123.45亿元。',
    summary_evidence_ids: ['D1', 'W1'],
    sections: [{
      title: '经营数据',
      claims: [{ text: '示例科技营收123.45亿元。', evidence_ids: ['W1'] }],
    }],
  });
  assert.throws(
    () => validateGeneratedReport(metricReport, metricEvidence),
    (error) => error.details.some((issue) => issue.type === 'unsupported_authoritative_metric_numbers'),
  );
});

test('accepts company operating metrics from an official source', () => {
  const officialEvidence = evidence.map((item, index) => index === 1 ? {
    ...item,
    source_tier: 'official',
    content: '公司公告披露2026年一季度营收123.45亿元。',
  } : item);
  const officialReport = report({
    summary: '公司公告披露2026年一季度营收123.45亿元。',
    summary_evidence_ids: ['W1'],
    sections: [{
      title: '经营数据',
      claims: [{ text: '公司营收123.45亿元。', evidence_ids: ['W1'] }],
    }],
  });
  assert.equal(validateGeneratedReport(officialReport, officialEvidence).summary, officialReport.summary);
});

test('does not treat a report date as a company operating metric value', () => {
  const datedMediaEvidence = evidence.map((item, index) => index === 1 ? {
    ...item,
    source_tier: 'media',
    content: '截至2026-07-21，媒体未提供可核验的公司销量数值。',
  } : item);
  const datedReport = report({
    summary: '截至2026-07-21，现有媒体证据未提供可核验的公司销量数值。',
    summary_evidence_ids: ['W1'],
  });
  assert.equal(validateGeneratedReport(datedReport, datedMediaEvidence).summary, datedReport.summary);
});

test('requires official or independently corroborated evidence for material risk events', () => {
  const riskEvidence = evidence.map((item, index) => index === 1 ? {
    ...item,
    source_tier: 'media',
    publisher: '媒体甲',
    content: '媒体报道称示例科技受到监管处罚。',
  } : item);
  const riskReport = report({
    sections: [{
      title: '风险事件',
      claims: [{ text: '示例科技受到监管处罚。', evidence_ids: ['W1'] }],
    }],
  });
  assert.throws(
    () => validateGeneratedReport(riskReport, riskEvidence),
    (error) => error.details.some((issue) => issue.type === 'insufficient_material_risk_corroboration'),
  );
});

test('allows an explicitly unverified single-media risk lead without presenting it as confirmed', () => {
  const riskEvidence = evidence.map((item, index) => index === 1 ? {
    ...item,
    source_tier: 'media',
    publisher: '媒体甲',
    content: '一则媒体线索提及示例科技可能受到监管处罚。',
  } : item);
  const riskReport = report({
    sections: [{
      title: '待核线索',
      claims: [{ text: '单一媒体提及监管处罚，有待官方核实确认。', evidence_ids: ['W1'] }],
    }],
  });
  assert.equal(validateGeneratedReport(riskReport, riskEvidence).sections[0].title, '待核线索');
});

test('treats production volume as an operating metric requiring authoritative evidence', () => {
  const metricEvidence = evidence.map((item, index) => index === 1 ? {
    ...item,
    source_tier: 'media',
    content: '媒体报道称示例科技产量为7.65万辆。',
  } : item);
  const metricReport = report({
    sections: [{ title: '生产', claims: [{ text: '示例科技产量为7.65万辆。', evidence_ids: ['W1'] }] }],
  });
  assert.throws(
    () => validateGeneratedReport(metricReport, metricEvidence),
    (error) => error.details.some((issue) => issue.type === 'unsupported_authoritative_metric_numbers'),
  );
});

test('requires product specifications to be official or independently corroborated', () => {
  const productEvidence = evidence.map((item, index) => index === 1 ? {
    ...item,
    source_tier: 'media',
    content: '媒体报道称新车型纯电续航超过680公里。',
  } : item);
  const productReport = report({
    sections: [{ title: '产品', claims: [{ text: '新车型纯电续航超过680公里。', evidence_ids: ['W1'] }] }],
  });
  assert.throws(
    () => validateGeneratedReport(productReport, productEvidence),
    (error) => error.details.some((issue) => issue.type === 'insufficient_product_fact_corroboration'),
  );
});

test('allows an attributed media report about product production progress', () => {
  const productEvidence = evidence.map((item, index) => index === 1 ? {
    ...item,
    source_tier: 'media',
    publisher: '中国经济网',
    content: '中国经济网报道，苹果iPhone 18系列手机已在量产，正处于产能爬坡阶段。',
  } : item);
  const productReport = report({
    sections: [{
      title: '产品进展',
      claims: [{
        text: '中国经济网报道，苹果iPhone 18系列手机已在量产，正处于产能爬坡阶段。',
        evidence_ids: ['W1'],
      }],
    }],
  });

  assert.doesNotThrow(() => validateGeneratedReport(productReport, productEvidence));
});

test('rejects broad financial characterizations unsupported by a complete financial statement', () => {
  const broadReport = report({
    conclusion: { text: '现有证据可确认公司最新一期财务表现。', evidence_ids: ['D1'] },
  });
  assert.throws(
    () => validateGeneratedReport(broadReport, evidence),
    (error) => error.details.some((issue) => issue.type === 'overbroad_financial_characterization'),
  );
});

test('rejects a latest-price claim that actually uses the close-price field', () => {
  const marketEvidence = [{
    id: 'D1',
    type: 'datapro',
    title: '示例科技 · 最新行情',
    publisher: 'DataPro',
    url: null,
    retrieved_at: '2026-07-27T06:00:00.000Z',
    published_at: null,
    as_of_date: '2026-07-24',
    freshness: 'current_or_recent',
    content: '收盘价99，最新价101，涨跌幅2%。',
    rows: [{ 收盘价: 99, 最新价: 101, 涨跌幅: '2%' }],
  }];
  const marketReport = report({
    summary: '示例科技最新价为99，涨跌幅为2%。',
    summary_evidence_ids: ['D1'],
    sections: [{
      title: '市场表现',
      claims: [{ text: '示例科技最新价为99，涨跌幅为2%。', evidence_ids: ['D1'] }],
    }],
    conclusion: { text: '继续观察最新行情。', evidence_ids: ['D1'] },
    change_summary: '行情数据已更新。',
    change_evidence_ids: ['D1'],
  });
  assert.throws(
    () => validateGeneratedReport(marketReport, marketEvidence),
    (error) => error.details.some((issue) => (
      issue.type === 'market_metric_field_mismatch'
      && issue.metric === '最新价'
    )),
  );
});

test('accepts market metric claims when each number matches its named field', () => {
  const marketEvidence = [{
    id: 'D1',
    type: 'datapro',
    title: '示例科技 · 最新行情',
    publisher: 'DataPro',
    url: null,
    retrieved_at: '2026-07-27T06:00:00.000Z',
    published_at: null,
    as_of_date: '2026-07-24',
    freshness: 'current_or_recent',
    content: '收盘价99，最新价101，涨跌幅2%。',
    rows: [{ 收盘价: 99, 最新价: 101, 涨跌幅: '2%' }],
  }];
  const marketReport = report({
    summary: '示例科技最新价为101，涨跌幅为2%。',
    summary_evidence_ids: ['D1'],
    sections: [{
      title: '市场表现',
      claims: [{ text: '示例科技最新价为101，收盘价为99，涨跌幅为2%。', evidence_ids: ['D1'] }],
    }],
    conclusion: { text: '继续观察最新行情。', evidence_ids: ['D1'] },
    change_summary: '行情数据已更新。',
    change_evidence_ids: ['D1'],
  });
  assert.doesNotThrow(() => validateGeneratedReport(marketReport, marketEvidence));
});
