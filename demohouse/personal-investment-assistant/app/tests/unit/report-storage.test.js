import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reportStorageInternals,
  sanitizeReportForStorage,
} from '../../src/server/domain/report-storage.js';

function sampleReport() {
  return {
    analysis: {
      summary: '示例公司本轮经营表现与渠道库存均有新的可核验信息。',
      summary_evidence_ids: ['D1', 'W1'],
      change_summary: '渠道库存信息发生更新。',
      change_evidence_ids: ['W1'],
      sections: [
        {
          title: '关注方向',
          claims: [{
            text: '公司披露的渠道动销安排显示，渠道库存仍是本轮需要持续跟踪的重点。',
            evidence_ids: ['W1'],
          }],
        },
      ],
      conclusion: {
        text: '后续继续核对渠道库存变化与正式披露。',
        evidence_ids: ['W1'],
      },
    },
    preference_coverage: [{
      preference: '渠道库存',
      expected_section: '关注方向',
      status: 'covered',
      evidence_ids: ['W1'],
    }],
    evidence: [
      {
        id: 'D1',
        type: 'datapro',
        title: '最新财务指标',
        content: 'DATAPRO_DUPLICATED_CONTENT_SENTINEL',
        rows: [{ 营业收入: '100 亿元' }],
        metadata: { dataset: 'financial' },
      },
      {
        id: 'W1',
        type: 'web_search',
        title: '示例公司渠道动销安排',
        publisher: '示例媒体',
        url: 'https://example.com/article',
        published_at: '2026-07-27',
        content: 'RAW_PROVIDER_CONTENT_SENTINEL：这是搜索服务返回的完整原始摘要。',
        cited_excerpt: 'RAW_PROVIDER_CITED_EXCERPT_SENTINEL',
        semantic_binding_checked: true,
        semantic_matches: [{
          preference: '渠道库存',
          scope: 'company',
          quote: 'RAW_PROVIDER_SEMANTIC_QUOTE_SENTINEL',
        }],
      },
    ],
  };
}

test('stores generated claim summaries instead of raw web-search content', () => {
  const original = sampleReport();
  const stored = sanitizeReportForStorage(original);
  const serialized = JSON.stringify(stored);
  const source = stored.evidence.find((item) => item.id === 'W1');

  assert.doesNotMatch(serialized, /RAW_PROVIDER_/);
  assert.equal(source.title, '示例公司渠道动销安排');
  assert.equal(source.publisher, '示例媒体');
  assert.equal(source.url, 'https://example.com/article');
  assert.equal(source.content_origin, reportStorageInternals.WEB_CONTENT_ORIGIN);
  assert.match(source.content, /渠道库存仍是本轮需要持续跟踪的重点/);
  assert.equal(source.semantic_matches[0].preference, '渠道库存');
  assert.match(source.semantic_matches[0].quote, /渠道库存仍是本轮需要持续跟踪的重点/);
  assert.equal(original.evidence[1].content.includes('RAW_PROVIDER_CONTENT_SENTINEL'), true);
});

test('keeps structured DataPro facts without its duplicated content blob', () => {
  const stored = sanitizeReportForStorage(sampleReport());
  const source = stored.evidence.find((item) => item.id === 'D1');

  assert.equal(Object.hasOwn(source, 'content'), false);
  assert.deepEqual(source.rows, [{ 营业收入: '100 亿元' }]);
  assert.deepEqual(source.metadata, { dataset: 'financial' });
});

test('storage sanitization is idempotent', () => {
  const once = sanitizeReportForStorage(sampleReport());
  const twice = sanitizeReportForStorage(once);
  assert.deepEqual(twice, once);
});
