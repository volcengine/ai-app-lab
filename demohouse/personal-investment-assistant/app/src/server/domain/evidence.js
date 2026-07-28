import { createHash } from 'node:crypto';
import { EvidenceValidationError } from '../errors.js';
import { generatedReportSchema } from './report-schema.js';

const datePattern = /(20\d{2}[-年/.]\d{1,2}(?:[-月/.]\d{1,2})?日?|20\d{2}\s*年?\s*(?:Q[1-4]|第?[一二三四1-4]季度|半年报|年报))/i;
const compactDatePattern = /\b(20\d{2})(0[1-9]|1[0-2])([0-2]\d|3[01])\b/;
const numberPattern = /(?<![A-Za-z])[-+]?\d[\d,]*(?:\.\d+)?%?/g;
const companyMetricPattern = /(?:营业收入|营收|归母净利润|净利润|毛利率|净利率|销量|销售量|累计销量|海外销量|产量|累计产量|交付量|市场份额|市占率|研发费用|销售费用|管理费用)/;
const materialRiskPattern = /(?:处罚|罚款|立案|调查|监管问询|召回|诉讼|事故|违约|禁令)/;
const productFactPattern = /(?:售价|价格区间|尺寸|长宽高|轴距|电机|功率|续航|储能时长|能量密度|充电速度|循环寿命|配置|参数|百公里|零百加速|预售价)/;
const broadFinancialPattern = /(?:整体|综合|总体|最新一期)?(?:财务表现|财务状况|经营表现|盈利表现)/;
const unverifiedRiskPattern = /(?:单一|一则)媒体.*(?:尚待|有待).*(?:核实|确认)|未获(?:官方|独立).*(?:核实|确认)/;
const marketMetricFieldPattern = /^(?:最新价|收盘价|盘后价|前收盘价|开盘价|最高价|最低价|涨跌|涨跌额|涨跌幅|涨幅|成交量|总成交量|成交额|换手率|open|high|low|close|volume)$/i;
const explicitMarketDateFieldPattern = /^(?:实际交易日期|最近交易日|最新交易日|交易日期|行情日期|数据日期)$/;
const explicitMarketTimeFieldPattern = /^(?:实际交易时间|最近交易时间|最新交易时间|交易时间)$/;

function compact(value, limit = 8000) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function tableRows(table, maxRows = 20) {
  if (!table || typeof table !== 'object') return [];
  const columns = Object.keys(table);
  const rowCount = Math.min(maxRows, Math.max(0, ...columns.map((key) => Array.isArray(table[key]) ? table[key].length : 1)));
  const rows = [];
  for (let index = 0; index < rowCount; index += 1) {
    const row = {};
    for (const column of columns) {
      const value = Array.isArray(table[column]) ? table[column][index] : table[column];
      if (value !== undefined && value !== null && value !== '') row[column] = value;
    }
    if (Object.keys(row).length) rows.push(row);
  }
  return rows;
}

function selectTableColumns(table, preferredColumns = 12, maxColumns = 16) {
  if (!table || typeof table !== 'object') return {};
  const allColumns = Object.keys(table);
  const selected = allColumns.slice(0, preferredColumns);
  for (const column of allColumns) {
    if (selected.length >= maxColumns) break;
    if (/报告期|截止日期|统计日期|交易日期|披露日期|公告日期|时间/.test(column)
      && !selected.includes(column)) selected.push(column);
  }
  return Object.fromEntries(selected.map((column) => [column, table[column]]));
}

const statementFamilyPatterns = [
  ['general', /^一般企业\/利润表/],
  ['bank', /^商业银行\/利润表/],
  ['insurance', /^保险(?:公司)?\/利润表/],
  ['securities', /^证券(?:公司)?\/利润表/],
];

function statementFamily(field) {
  return statementFamilyPatterns.find(([, pattern]) => pattern.test(field))?.[0] || null;
}

function hasPopulatedValue(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.some((item) => item !== null && item !== undefined && item !== '');
}

function selectDominantStatementFamily(table) {
  if (!table || typeof table !== 'object') return {};
  const scores = new Map(statementFamilyPatterns.map(([family]) => [family, 0]));
  for (const [field, value] of Object.entries(table)) {
    const family = statementFamily(field);
    if (family && hasPopulatedValue(value)) scores.set(family, scores.get(family) + 1);
  }
  const ranked = [...scores.entries()].filter(([, score]) => score > 0)
    .sort((left, right) => right[1] - left[1]);
  if (ranked.length < 2 || ranked[0][1] < 2 || ranked[0][1] === ranked[1][1]) return table;
  const selectedFamily = ranked[0][0];
  return Object.fromEntries(Object.entries(table)
    .filter(([field]) => !statementFamily(field) || statementFamily(field) === selectedFamily));
}

function selectRelevantFinancialColumns(table) {
  if (!table || typeof table !== 'object') return {};
  const columns = Object.keys(table);
  if (!columns.some((field) => statementFamily(field))) return table;
  const selected = columns.filter((field) => (
    statementFamily(field)
      || field === '财务分析/盈利能力/销售毛利率'
      || /(?:定期报告最新报告期|定期报告实际披露日期)$/.test(field)
      || /^(?:报告期|截止日期|统计日期|实际披露日期)$/.test(field)
  ));
  return Object.fromEntries(selected.map((field) => [field, table[field]]));
}

function selectFieldMetadata(fieldMetadata, columns) {
  if (!fieldMetadata || typeof fieldMetadata !== 'object') return null;
  return Object.fromEntries(columns
    .filter((column) => fieldMetadata[column] !== undefined)
    .map((column) => [column, fieldMetadata[column]]));
}

function fieldMetadataValue(fieldMetadata, field, key) {
  const root = fieldMetadata?.[field];
  if (!root || typeof root !== 'object') return null;
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (!Array.isArray(node) && node[key] !== undefined && node[key] !== null) return node[key];
    stack.push(...(Array.isArray(node) ? node : Object.values(node)));
  }
  return null;
}

function normalizeProviderNumber(field, value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Number.isInteger(value)) return value;
  const precision = /(?:价格|价|涨跌|涨跌幅)$/.test(field)
    ? 4
    : /(?:率|比|振幅)/.test(field) ? 6 : 8;
  return Number(value.toFixed(precision));
}

function decorateTableRows(rows, fieldMetadata, stock = null) {
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([field, value]) => {
    const normalizedValue = normalizeProviderNumber(field, value);
    const rawUnit = fieldMetadataValue(fieldMetadata, field, '单位')
      || (/^(?:涨跌幅|涨幅)$/.test(field) ? '%' : null);
    const currencyCaliber = fieldMetadataValue(fieldMetadata, field, '货币币种');
    const unit = stock?.exchange !== 'CN' && rawUnit === '元' && currencyCaliber === '原始币种'
      ? '原始币种'
      : rawUnit;
    if (!unit || normalizedValue === null || normalizedValue === undefined || normalizedValue === '') {
      return [field, normalizedValue];
    }
    const displayValue = typeof normalizedValue === 'number'
      ? new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 20 }).format(normalizedValue)
      : String(normalizedValue);
    return [field, displayValue.endsWith(String(unit)) ? displayValue : `${displayValue} ${unit}`];
  })));
}

function flatItemRows(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
  const ignored = new Set([
    'table', 'Table', 'records', 'Records', 'metadata', 'meta',
    'field_meta', 'fieldMeta', 'FieldMeta', 'title', 'name', 'dataset_name',
  ]);
  const row = {};
  for (const [field, value] of Object.entries(item)) {
    if (ignored.has(field) || value === null || value === undefined || value === '') continue;
    if (typeof value !== 'object') {
      row[field] = normalizeProviderNumber(field, value);
      continue;
    }
    if (Array.isArray(value)
      || value.value === null
      || value.value === undefined
      || typeof value.value === 'object') continue;
    const normalizedValue = normalizeProviderNumber(field, value.value);
    const unit = String(value.unit || '').trim();
    if (!unit) {
      row[field] = normalizedValue;
      continue;
    }
    const displayValue = typeof normalizedValue === 'number'
      ? new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 20 }).format(normalizedValue)
      : String(normalizedValue);
    row[field] = displayValue.endsWith(unit) ? displayValue : `${displayValue} ${unit}`;
  }
  return Object.keys(row).length ? [row] : [];
}

function contextualItemFields(item) {
  const row = flatItemRows(item)[0] || {};
  return Object.fromEntries(Object.entries(row).filter(([field]) => (
    securityCodeFields.includes(field)
      || /(?:报告期|披露日期|实际交易日期|最近交易日|最新交易日|交易日期|行情日期|统计日期|截止日期|公告日期|数据日期)$/.test(field)
  )));
}

function recordRows(records, maxRows = 40) {
  if (!Array.isArray(records)) return [];
  return records
    .filter((record) => record && typeof record === 'object')
    .filter((record) => record.value !== null && record.value !== undefined && record.value !== '')
    .slice(0, maxRows)
    .map((record) => {
      const rawValue = String(record.value);
      const unit = String(record.unit || '');
      return {
        ...record,
        display_value: unit && !rawValue.endsWith(unit) ? `${rawValue}${unit}` : rawValue,
      };
    });
}

function inferRecordAsOf(records) {
  for (const record of records) {
    const caliber = record?.caliber && typeof record.caliber === 'object' ? record.caliber : {};
    const directValues = [
      record?.period,
      caliber['交易日期'],
      caliber['截止日期'],
      caliber['报告期'],
      caliber['日期'],
    ];
    for (const value of directValues) {
      const matched = inferAsOf(String(value || ''));
      if (matched) return matched;
    }
    if (caliber['年度'] && caliber['季度']) {
      const matched = inferAsOf(`${caliber['年度']}年${caliber['季度']}`);
      if (matched) return matched;
    }
  }
  return null;
}

function inferAsOf(text) {
  return text.match(datePattern)?.[1] || null;
}

function inferCompactCalendarDate(value) {
  const matched = String(value || '').match(compactDatePattern);
  if (!matched) return null;
  const [, year, month, day] = matched;
  const candidate = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (Number.isNaN(candidate.getTime())
    || candidate.getUTCFullYear() !== Number(year)
    || candidate.getUTCMonth() + 1 !== Number(month)
    || candidate.getUTCDate() !== Number(day)) return null;
  return `${year}-${month}-${day}`;
}

function inferDirectAsOf(value) {
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const matched = inferDirectAsOf(value[index]);
      if (matched) return matched;
    }
    return null;
  }
  if (value === null || value === undefined || typeof value === 'object') return null;
  return inferCompactCalendarDate(value) || inferAsOf(String(value));
}

function dateCandidates(value) {
  if (Array.isArray(value)) return value.flatMap(dateCandidates);
  const matched = inferDirectAsOf(value);
  return matched ? [matched] : [];
}

function calendarDateSortKey(value) {
  const compact = inferCompactCalendarDate(value);
  if (compact) return compact;
  const matched = String(value || '').match(/(20\d{2})[-年/.]\s*(\d{1,2})(?:[-月/.]\s*(\d{1,2}))?/);
  if (!matched) return '';
  return `${matched[1]}-${String(matched[2]).padStart(2, '0')}-${String(matched[3] || 0).padStart(2, '0')}`;
}

function newestNamedDate(containers, fieldPattern) {
  const candidates = [];
  for (const container of containers) {
    if (!container || typeof container !== 'object' || Array.isArray(container)) continue;
    for (const [field, value] of Object.entries(container)) {
      if (!fieldPattern.test(field)) continue;
      candidates.push(...dateCandidates(value));
    }
  }
  return candidates
    .map((value) => ({ value, key: calendarDateSortKey(value) }))
    .filter((item) => item.key)
    .sort((left, right) => left.key.localeCompare(right.key))
    .at(-1)?.value || null;
}

function containerHasMarketMetric(container) {
  if (!container || typeof container !== 'object' || Array.isArray(container)) return false;
  return Object.entries(container).some(([field, value]) => (
    (marketMetricFieldPattern.test(field) && hasPopulatedValue(value))
      || (
        /^(?:indicator_name|name)$/i.test(field)
        && marketMetricFieldPattern.test(String(value || ''))
      )
  ));
}

function inferExplicitMarketAsOf(item, table, rows, metadata) {
  const containers = [item, table, metadata, ...(rows || [])];
  if (!containers.some(containerHasMarketMetric)) return null;
  return newestNamedDate(containers, explicitMarketDateFieldPattern)
    || newestNamedDate(containers, explicitMarketTimeFieldPattern);
}

function inferTableAsOf(table) {
  const entries = Object.entries(table || {});
  const dateFieldPriorities = [
    /报告期|截止日期|统计日期/,
    /实际交易日期|最近交易日|最新交易日|交易日期|行情日期|数据日期/,
    /披露日期|公告日期|日期|时间/,
  ];
  for (const fieldPattern of dateFieldPriorities) {
    for (const [field, value] of entries) {
      if (!fieldPattern.test(field)) continue;
      const matched = inferDirectAsOf(value);
      if (matched) return matched;
    }
  }
  return null;
}

function fieldMetadataRecords(fieldMetadata) {
  const records = [];
  const stack = [fieldMetadata];
  while (stack.length && records.length < 80) {
    const node = stack.pop();
    if (!node) continue;
    if (Array.isArray(node)) {
      stack.push(...node);
      continue;
    }
    if (typeof node !== 'object') continue;
    const caliberValues = Array.isArray(node.caliber) ? node.caliber : [node.caliber];
    for (const caliber of caliberValues) {
      if (caliber && typeof caliber === 'object') records.push({ ...node, caliber });
    }
    if (['交易日期', '截止日期', '报告期', '日期', '年度', '季度']
      .some((field) => node[field] !== undefined)) {
      records.push({ caliber: node });
    }
    for (const [key, value] of Object.entries(node)) {
      if (key !== 'caliber' && value && typeof value === 'object') stack.push(value);
    }
  }
  return records;
}

function inferFieldMetadataAsOf(fieldMetadata) {
  return inferRecordAsOf(fieldMetadataRecords(fieldMetadata));
}

function inferItemAsOf(item) {
  for (const value of [
    item?.as_of_date,
    item?.asOfDate,
    item?.trade_date,
    item?.date,
    item?.period,
    item?.time,
    item?.['实际交易日期'],
    item?.['交易日期'],
    item?.['数据日期'],
    item?.['实际披露日期'],
    item?.['披露日期'],
    item?.['日期'],
    item?.['报告期'],
  ]) {
    const matched = inferDirectAsOf(value);
    if (matched) return matched;
  }
  return null;
}

function providerFields(item) {
  return Object.fromEntries(Object.entries(item || {}).filter(([key, value]) => (
    !['table', 'Table', 'metadata', 'meta'].includes(key)
      && value !== null
      && value !== undefined
      && typeof value !== 'object'
  )));
}

function alignedTemporalRows(item, rowCount) {
  if (!rowCount) return [];
  const candidates = [
    ['实际交易日期', item?.['实际交易日期']],
    ['最近交易日', item?.['最近交易日']],
    ['最新交易日', item?.['最新交易日']],
    ['交易日期', item?.['交易日期']],
    ['行情日期', item?.['行情日期']],
    ['数据日期', item?.['数据日期']],
    ['交易日期', item?.trade_date],
    ['交易日期', item?.time],
  ];
  for (const [field, value] of candidates) {
    if (!Array.isArray(value) || value.length !== rowCount) continue;
    if (!value.every((entry) => inferDirectAsOf(entry))) continue;
    return value.map((entry) => ({ [field]: entry }));
  }
  return Array.from({ length: rowCount }, () => ({}));
}

function canonicalSecurityCode(value) {
  const compactCode = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  const withoutVenuePrefix = compactCode.replace(/^(?:NASDAQ|NYSE|AMEX)[:.]/i, '');
  const withoutSuffix = withoutVenuePrefix.replace(/\.(?:SH|SZ|BJ|HK|US|OQ|O|N|NYS|NASDAQ|NYSE|AMEX)$/i, '');
  const withoutPrefix = withoutSuffix.replace(/^(?:SH|SZ|BJ|HK)(?=\d)/, '');
  if (/^\d+$/.test(withoutPrefix)) return withoutPrefix.replace(/^0+(?=\d)/, '');
  return withoutPrefix;
}

const securityCodeFields = [
  '证券代码',
  '股票代码',
  'security_code',
  'stock_code',
  'ticker',
  'symbol',
  'code',
];

function firstScalar(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const scalar = firstScalar(item);
      if (scalar) return scalar;
    }
    return null;
  }
  if (value === null || value === undefined || typeof value === 'object') return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function securityCodeFrom(container) {
  if (!container || typeof container !== 'object') return null;
  for (const field of securityCodeFields) {
    const value = firstScalar(container[field]);
    if (value) return value;
  }
  return null;
}

function inferSecurityCode(item, table, rows, metadata) {
  const rowContainers = (rows || []).flatMap((row) => [row, row?.caliber]);
  for (const container of [item, metadata, table, ...rowContainers]) {
    const code = securityCodeFrom(container);
    if (code) return code;
  }
  return null;
}

export function evidenceMatchesStockCode(evidence, stockCode) {
  if (!evidence.security_code || !stockCode) return false;
  return canonicalSecurityCode(evidence.security_code) === canonicalSecurityCode(stockCode);
}

export function normalizeDataProEvidence(stock, searchResult, retrievedAt) {
  return (searchResult.items || []).slice(0, 8).map((item, index) => {
    const table = item?.table || item?.Table || {};
    const curatedTable = selectRelevantFinancialColumns(selectDominantStatementFamily(table));
    const fieldMetadata = item?.field_meta || item?.fieldMeta || item?.FieldMeta || null;
    const selectedTable = selectTableColumns(curatedTable);
    const selectedColumns = Object.keys(selectedTable);
    const selectedFieldMetadata = selectFieldMetadata(fieldMetadata, selectedColumns);
    const records = recordRows(item?.records || item?.Records);
    const selectedTableRows = decorateTableRows(
      tableRows(selectedTable),
      selectedFieldMetadata,
      stock,
    );
    const contextFields = contextualItemFields(item);
    const temporalRows = alignedTemporalRows(item, selectedTableRows.length);
    const rows = records.length
      ? records
      : selectedTableRows.length
        ? selectedTableRows.map((row, rowIndex) => ({
          ...contextFields,
          ...temporalRows[rowIndex],
          ...row,
        }))
        : flatItemRows(item);
    const columns = selectedColumns;
    const fields = providerFields(item);
    const providerMetadata = item?.metadata || item?.meta;
    const metadata = {
      ...fields,
      ...(providerMetadata && typeof providerMetadata === 'object' ? providerMetadata : {}),
    };
    const content = compact({
      provider_fields: fields,
      rows,
      field_meta: selectedFieldMetadata,
      metadata: providerMetadata || null,
    });
    const providerTitle = item?.title || item?.name || item?.dataset_name;
    const recordFields = records.map((record) => record.indicator_name || record.name).filter(Boolean);
    const flatFields = !columns.length && rows.length
      ? Object.keys(rows[0]).filter((field) => !securityCodeFields.includes(field))
      : [];
    const fieldTitle = [...recordFields, ...columns, ...flatFields].slice(0, 4).join('、') || '专业数据';
    return {
      id: `D${index + 1}`,
      type: 'datapro',
      title: String(providerTitle || `${stock.name} · ${fieldTitle}`),
      publisher: 'DataPro',
      url: null,
      retrieved_at: retrievedAt,
      published_at: null,
      as_of_date: inferExplicitMarketAsOf(item, table, rows, metadata)
        || inferTableAsOf(table)
        || inferFieldMetadataAsOf(fieldMetadata)
        || inferRecordAsOf(rows)
        || inferItemAsOf(item)
        || inferAsOf(content),
      freshness: 'unknown',
      content,
      rows,
      metadata,
      security_code: inferSecurityCode(item, table, rows, metadata),
    };
  });
}

export function normalizeWebEvidence(searchResult, retrievedAt) {
  return (searchResult.items || []).slice(0, 8).map((item, index) => ({
    id: item.evidence_id || `W${index + 1}`,
    type: 'web_search',
    title: item.title,
    publisher: item.publisher || '公开网页',
    ...(item.hosting_site ? { hosting_site: item.hosting_site } : {}),
    url: item.url,
    retrieved_at: retrievedAt,
    published_at: item.published_at,
    as_of_date: item.published_at || inferAsOf(`${item.title} ${item.summary}`),
    freshness: item.published_at ? 'current_or_recent' : 'unknown',
    source_tier: item.source_tier || 'open_web',
    content: compact(item.summary || item.title, 3000),
    rows: [],
    ...(Array.isArray(item.semantic_matches) && item.semantic_matches.length
      ? { semantic_matches: item.semantic_matches }
      : {}),
    ...(item.semantic_binding_checked ? { semantic_binding_checked: true } : {}),
  }));
}

function canonicalizeFingerprintValue(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalizeFingerprintValue)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort()
      .map((key) => [key, canonicalizeFingerprintValue(value[key])]));
  }
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value;
}

export function fingerprintEvidence(evidence) {
  const stable = evidence.map(({ id: _id, retrieved_at: _retrievedAt, ...item }) => {
    const projected = { ...item };
    if (projected.type === 'datapro') {
      delete projected.title;
      delete projected.content;
    }
    return canonicalizeFingerprintValue(projected);
  }).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

function normalizedNumbers(text) {
  const compactDates = String(text)
    .replace(/(\d)\s+%/g, '$1%')
    .replace(
      /\b(20\d{2})(0[1-9]|1[0-2])([0-2]\d|3[01])\b/g,
      (_match, year, month, day) => `${year}年${month.replace(/^0+(?=\d)/, '')}月${day.replace(/^0+(?=\d)/, '')}日`,
    );
  const normalizedDates = compactDates.replace(
    /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g,
    (_match, year, month, day) => `${year}年${month.replace(/^0+(?=\d)/, '')}月${day.replace(/^0+(?=\d)/, '')}日`,
  );
  return new Set((normalizedDates.match(numberPattern) || []).map((value) => {
    const compactNumber = value.replaceAll(',', '').replace(/^\+/, '');
    const match = compactNumber.match(/^(-?)(\d+)(.*)$/);
    if (!match) return compactNumber;
    return `${match[1]}${match[2].replace(/^0+(?=\d)/, '')}${match[3]}`;
  }));
}

function companyMetricNumbers(text) {
  const metricSentences = String(text).split(/[。；;！!？?\n]/)
    .filter((sentence) => companyMetricPattern.test(sentence));
  const withoutPeriods = metricSentences.join(' ')
    .replace(/\b20\d{2}-\d{1,2}-\d{1,2}(?:T\d{1,2}:\d{2}(?::\d{2})?(?:[+-]\d{2}:?\d{2}|Z)?)?/gi, ' ')
    .replace(/20\d{2}年\d{1,2}月\d{1,2}日/g, ' ')
    .replace(/20\d{2}年(?:Q[1-4]|第?[一二三四1-4]季度|半年报|年报)/gi, ' ')
    .replace(/(?:^|\D)\d{1,2}月(?=\D|$)/g, ' ');
  return normalizedNumbers(withoutPeriods);
}

const marketMetricSpecs = [
  { label: '前收盘价', fields: /^(?:前收盘价|previous_?close|prev_?close)$/i },
  { label: '当日最高价', fields: /^(?:当日最高价|最高价|high)$/i },
  { label: '当日最低价', fields: /^(?:当日最低价|最低价|low)$/i },
  { label: '最新价', fields: /^(?:最新价|last_?price|price)$/i },
  { label: '盘后价', fields: /^(?:盘后价|after_?hours(?:_?price)?)$/i },
  { label: '收盘价', fields: /^(?:收盘价|close)$/i },
  { label: '开盘价', fields: /^(?:开盘价|open)$/i },
  { label: '最高价', fields: /^(?:最高价|high)$/i },
  { label: '最低价', fields: /^(?:最低价|low)$/i },
  { label: '涨跌幅', fields: /^(?:涨跌幅|涨幅|change_?percent|pct_?change)$/i },
  { label: '成交量', fields: /^(?:成交量|总成交量|volume)$/i },
];

function marketMetricIssues(claim, evidenceById, location) {
  const issues = [];
  const expression = /(前收盘价|当日最高价|当日最低价|最新价|盘后价|收盘价|开盘价|最高价|最低价|涨跌幅|成交量)(?:为|是|：|:)?\s*([-+]?\d[\d,]*(?:\.\d+)?(?:\s*%)?)/g;
  for (const match of String(claim.text).matchAll(expression)) {
    const spec = marketMetricSpecs.find((item) => item.label === match[1]);
    const matchingValues = claim.evidence_ids.flatMap((id) => {
      const item = evidenceById.get(id);
      if (item?.type !== 'datapro') return [];
      return (item.rows || []).flatMap((row) => Object.entries(row)
        .filter(([field]) => spec.fields.test(field))
        .map(([, value]) => value));
    });
    if (!matchingValues.length) continue;
    const claimedNumbers = normalizedNumbers(match[2]);
    const supportedNumbers = normalizedNumbers(matchingValues.join(' '));
    if ([...claimedNumbers].some((number) => !supportedNumbers.has(number))) {
      issues.push({
        location,
        type: 'market_metric_field_mismatch',
        metric: spec.label,
        value: match[2],
        evidence_ids: claim.evidence_ids,
      });
    }
  }
  return issues;
}

function validateClaim(claim, evidenceById, location) {
  if (!claim.evidence_ids.length) {
    return [{ location, type: 'missing_evidence', evidence_ids: [] }];
  }
  const missingIds = claim.evidence_ids.filter((id) => !evidenceById.has(id));
  if (missingIds.length) return [{ location, type: 'missing_evidence', evidence_ids: missingIds }];
  const issues = [];
  if (materialRiskPattern.test(claim.text) && !unverifiedRiskPattern.test(claim.text)) {
    const boundWebSources = claim.evidence_ids.map((id) => evidenceById.get(id))
      .filter((item) => item?.type === 'web_search');
    const hasOfficialSource = boundWebSources.some((item) => item.source_tier === 'official');
    const independentMedia = new Set(boundWebSources
      .filter((item) => item.source_tier === 'media')
      .map((item) => item.publisher)
      .filter(Boolean));
    if (!hasOfficialSource && independentMedia.size < 2) {
      issues.push({
        location,
        type: 'insufficient_material_risk_corroboration',
        evidence_ids: claim.evidence_ids,
      });
    }
  }
  if (productFactPattern.test(claim.text) && !unverifiedRiskPattern.test(claim.text)) {
    const boundWebSources = claim.evidence_ids.map((id) => evidenceById.get(id))
      .filter((item) => item?.type === 'web_search');
    const hasOfficialSource = boundWebSources.some((item) => item.source_tier === 'official');
    const independentMedia = new Set(boundWebSources
      .filter((item) => item.source_tier === 'media')
      .map((item) => item.publisher)
      .filter(Boolean));
    if (boundWebSources.length && !hasOfficialSource && independentMedia.size < 2) {
      issues.push({
        location,
        type: 'insufficient_product_fact_corroboration',
        evidence_ids: claim.evidence_ids,
      });
    }
  }
  if (broadFinancialPattern.test(claim.text)) {
    issues.push({
      location,
      type: 'overbroad_financial_characterization',
      evidence_ids: claim.evidence_ids,
    });
  }
  issues.push(...marketMetricIssues(claim, evidenceById, location));
  const claimNumbers = normalizedNumbers(claim.text);
  if (!claimNumbers.size) return issues;
  const supportText = claim.evidence_ids.map((id) => {
    const item = evidenceById.get(id);
    return `${item?.title || ''} ${item?.published_at || ''} ${item?.as_of_date || ''} ${item?.content || ''}`;
  }).join(' ');
  const supportNumbers = normalizedNumbers(supportText);
  const unsupported = [...claimNumbers].filter((number) => !supportNumbers.has(number));
  if (unsupported.length) issues.push({ location, type: 'unsupported_numbers', numbers: unsupported });
  const metricNumbers = companyMetricNumbers(claim.text);
  if (metricNumbers.size) {
    const authoritativeText = claim.evidence_ids.map((id) => evidenceById.get(id))
      .filter((item) => item?.type === 'datapro' || item?.source_tier === 'official')
      .map((item) => `${item.title || ''} ${item.published_at || ''} ${item.as_of_date || ''} ${item.content || ''}`)
      .join(' ');
    const authoritativeNumbers = companyMetricNumbers(authoritativeText);
    const mediaOnlyNumbers = [...metricNumbers].filter((number) => !authoritativeNumbers.has(number));
    if (mediaOnlyNumbers.length) {
      issues.push({
        location,
        type: 'unsupported_authoritative_metric_numbers',
        numbers: mediaOnlyNumbers,
      });
    }
  }
  return issues;
}

function normalizedClaimText(text) {
  return String(text || '').replace(/[^\p{L}\p{N}]+/gu, '');
}

function commonSuffixLength(left, right) {
  let length = 0;
  while (
    length < left.length
    && length < right.length
    && left[left.length - length - 1] === right[right.length - length - 1]
  ) {
    length += 1;
  }
  return length;
}

function repeatedSectionClaimIssues(sections) {
  const issues = [];
  sections.forEach((section, sectionIndex) => {
    section.claims.forEach((claim, claimIndex) => {
      const current = normalizedClaimText(claim.text);
      for (let previousIndex = 0; previousIndex < claimIndex; previousIndex += 1) {
        const previous = normalizedClaimText(section.claims[previousIndex].text);
        const sharedSuffix = commonSuffixLength(current, previous);
        const shorterLength = Math.min(current.length, previous.length);
        if (
          current === previous
          || (sharedSuffix >= 24 && sharedSuffix / shorterLength >= 0.4)
        ) {
          issues.push({
            location: `sections.${sectionIndex}.claims.${claimIndex}`,
            type: 'repeated_claim_text',
            duplicate_of: `sections.${sectionIndex}.claims.${previousIndex}`,
          });
          break;
        }
      }
    });
  });
  return issues;
}

export function validateGeneratedReport(report, evidence) {
  const parsed = generatedReportSchema.parse(report);
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const issues = [];
  issues.push(...repeatedSectionClaimIssues(parsed.sections));
  issues.push(...validateClaim({
    text: parsed.summary,
    evidence_ids: parsed.summary_evidence_ids,
  }, evidenceById, 'summary'));
  parsed.sections.forEach((section, sectionIndex) => {
    section.claims.forEach((claim, claimIndex) => {
      issues.push(...validateClaim(claim, evidenceById, `sections.${sectionIndex}.claims.${claimIndex}`));
    });
  });
  issues.push(...validateClaim(parsed.conclusion, evidenceById, 'conclusion'));
  if (parsed.change_evidence_ids.length) {
    issues.push(...validateClaim({
      text: parsed.change_summary,
      evidence_ids: parsed.change_evidence_ids,
    }, evidenceById, 'change_summary'));
  }
  if (issues.length) throw new EvidenceValidationError('报告包含无法由引用证据支持的内容', issues);
  return parsed;
}

export const evidenceInternals = {
  tableRows,
  selectTableColumns,
  selectDominantStatementFamily,
  selectRelevantFinancialColumns,
  selectFieldMetadata,
  fieldMetadataValue,
  normalizeProviderNumber,
  decorateTableRows,
  recordRows,
  inferRecordAsOf,
  inferAsOf,
  inferCompactCalendarDate,
  inferDirectAsOf,
  inferTableAsOf,
  fieldMetadataRecords,
  inferFieldMetadataAsOf,
  inferItemAsOf,
  canonicalizeFingerprintValue,
  normalizedNumbers,
  companyMetricNumbers,
  normalizedClaimText,
  commonSuffixLength,
  providerFields,
  canonicalSecurityCode,
};
