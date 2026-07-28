import test from 'node:test';
import assert from 'node:assert/strict';
import { DataProProvider, dataProInternals } from '../../src/server/providers/datapro.js';
import { webSearchInternals } from '../../src/server/providers/web-search.js';
import { WebSearchProvider } from '../../src/server/providers/web-search.js';
import { agentPlanModelInternals } from '../../src/server/providers/agent-plan-model.js';

test('parses DataPro structured content and nested items', () => {
  const payload = dataProInternals.parsePayload({ structuredContent: { data: { items: [{ table: { 收盘价: [10] } }] } } });
  assert.equal(dataProInternals.extractItems(payload)[0].table.收盘价[0], 10);
});

test('parses DataPro JSON text fallback', () => {
  const payload = dataProInternals.parsePayload({ content: [{ type: 'text', text: '{"items":[{"name":"数据集"}]}' }] });
  assert.equal(dataProInternals.extractItems(payload)[0].name, '数据集');
});

test('retries a transient DataPro timeout', async () => {
  let calls = 0;
  let closes = 0;
  const provider = new DataProProvider({
    dataPro: { apiKey: 'test-key', url: 'https://example.com/mcp' },
    providerTimeoutMs: 1000,
    providerRetryCount: 1,
  });
  provider.connect = async () => ({
    callTool: async () => {
      calls += 1;
      if (calls === 1) {
        const error = new Error('temporary timeout');
        error.code = 'DATAPRO_TIMEOUT';
        throw error;
      }
      return { structuredContent: { items: [{ table: { 收盘价: [10] } }] } };
    },
    close: async () => { closes += 1; },
  });

  const result = await provider.search('测试查询');
  assert.equal(result.items[0].table.收盘价[0], 10);
  assert.equal(calls, 2);
  assert.equal(closes, 2);
});

test('retries an intermittent DataPro 4003 business error', async () => {
  let calls = 0;
  const provider = new DataProProvider({
    dataPro: { apiKey: 'test-key', url: 'https://example.com/mcp' },
    providerTimeoutMs: 1000,
    providerRetryCount: 1,
  });
  provider.connect = async () => ({
    callTool: async () => {
      calls += 1;
      return calls === 1
        ? { structuredContent: { code: 4003, message: 'temporary processing failure' } }
        : { structuredContent: { items: [{ table: { 最新价: [101] } }] } };
    },
    close: async () => {},
  });

  const result = await provider.search('测试查询');
  assert.equal(result.items[0].table.最新价[0], 101);
  assert.equal(calls, 2);
});

test('normalizes Doubao Search fields without renaming the title', () => {
  const parsed = webSearchInternals.parseSearchResponse({
    Result: {
      ResultCount: 1,
      WebResults: [{
        Title: '公告原始标题',
        SiteName: '交易所网站',
        Url: 'https://example.com/a',
        Summary: '公告摘要',
        PublishTime: '2026-07-21',
      }],
    },
  });
  assert.deepEqual(parsed.items[0], {
    title: '公告原始标题',
    publisher: '交易所网站',
    url: 'https://example.com/a',
    summary: '公告摘要',
    published_at: '2026-07-21',
  });
});

test('prefers an explicit full page timestamp over conflicting search metadata', () => {
  const result = webSearchInternals.normalizeResult({
    Title: '茅台股东大会划重点',
    SiteName: '第一财经',
    Url: 'https://www.yicai.com/news/example.html',
    Summary: '茅台股东大会划重点\n第一财经 2026-06-11 19:53:13\n文章正文。',
    PublishTime: '2026-07-26T22:00:29+08:00',
  });
  assert.equal(result.published_at, '2026-06-11T19:53:13+08:00');
});

test('uses the provider year for a standalone month-day timestamp in the page header', () => {
  const result = webSearchInternals.normalizeResult({
    Title: '茅台股东大会划重点',
    SiteName: '第一财经',
    Url: 'https://www.yicai.com/news/example.html',
    Summary: '茅台股东大会划重点\n第一财经\n06-11 19:53\n文章正文。',
    PublishTime: '2026-07-26T22:00:29+08:00',
  });
  assert.equal(result.published_at, '2026-06-11T19:53:00+08:00');
});

test('uses an explicit article attribution while preserving a distinct hosting site', () => {
  const parsed = webSearchInternals.parseSearchResponse({
    Result: {
      ResultCount: 1,
      WebResults: [{
        Title: '转载文章标题',
        SiteName: '证券时报',
        Url: 'https://www.stcn.com/article/detail/1.html',
        Summary: '转载文章标题\n来源：期货日报 作者：张某 2026-07-23 14:25\n正文内容。',
        PublishTime: '2026-07-23T14:25:00+08:00',
      }],
    },
  });
  assert.equal(parsed.items[0].publisher, '期货日报');
  assert.equal(parsed.items[0].hosting_site, '证券时报');
});

test('extracts an original publisher after a timestamp on an official hosting page', () => {
  const result = webSearchInternals.normalizeResult({
    Title: '关于发布相关备案信息的公告',
    SiteName: '江苏网信网',
    Url: 'https://www.jswx.gov.cn/example.html',
    Summary: '关于发布相关备案信息的公告\n2026-07-15 17:12:00 来源：中国网信网\n公告正文。',
  });
  assert.equal(result.publisher, '中国网信网');
  assert.equal(result.hosting_site, '江苏网信网');
});

test('removes official-page font controls from an attributed publisher', () => {
  const result = webSearchInternals.normalizeResult({
    Title: '关于调整新能源汽车车船税优惠政策的公告',
    SiteName: '国家税务总局广西壮族自治区税务局',
    Url: 'https://guangxi.chinatax.gov.cn/example.html',
    Summary: '公告标题\n发布时间：2026-07-08 14:20 来源：财政部,国家税务总局,工业和信息化部 字号： [大][中][小] [打印]\n公告正文。',
  });
  assert.equal(result.publisher, '财政部,国家税务总局,工业和信息化部');
  assert.equal(result.hosting_site, '国家税务总局广西壮族自治区税务局');
});

test('uses a trailing original-newsroom credit while preserving the reprint host', () => {
  const result = webSearchInternals.normalizeResult({
    Title: '转载文章标题',
    SiteName: '新浪财经',
    Url: 'https://finance.sina.cn/stock/example.html',
    Summary: '文章摘要第一段。\n更多正文节选。\n本文作者：界面新闻',
  });
  assert.equal(result.publisher, '界面新闻');
  assert.equal(result.hosting_site, '新浪财经');
});

test('does not label a same-brand site name as a reprint host', () => {
  const result = webSearchInternals.normalizeResult({
    Title: '原发文章标题',
    SiteName: '证券时报',
    Url: 'https://www.stcn.com/article/detail/2.html',
    Summary: '原发文章标题\n来源：证券时报网 作者：王某 2026-07-16 20:09\n正文内容。',
  });
  assert.equal(result.publisher, '证券时报网');
  assert.equal('hosting_site' in result, false);
});

test('extracts Responses API output text', () => {
  assert.equal(agentPlanModelInternals.extractOutputText({ output_text: '{"ok":true}' }), '{"ok":true}');
  assert.equal(agentPlanModelInternals.extractOutputText({
    output: [{ content: [{ type: 'output_text', text: '{"ok":true}' }] }],
  }), '{"ok":true}');
});

test('repairs a syntax-only missing object terminator from structured output', () => {
  const malformed = '{"ok":true';
  const parsed = agentPlanModelInternals.parseJsonOutput(malformed);
  assert.equal(parsed.repaired, true);
  assert.equal(parsed.data.ok, true);
});

test('retries a transient Doubao Search 10500 response', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify(calls === 1 ? {
      ResponseMetadata: { Error: { Code: '10500', Message: 'temporary' } },
    } : {
      Result: { ResultCount: 1, WebResults: [{ Title: '重试成功', SiteName: '来源', Url: 'https://example.com' }] },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const provider = new WebSearchProvider({
      webSearch: { apiKey: 'test-key', url: 'https://example.com/search' },
      providerTimeoutMs: 1000,
      providerRetryCount: 1,
    });
    const result = await provider.search('测试查询', { count: 1 });
    assert.equal(result.items[0].title, '重试成功');
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sends Harness query rewrite for precision follow-up searches', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ Result: { ResultCount: 0, WebResults: [] } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const provider = new WebSearchProvider({
      webSearch: { apiKey: 'test-key', url: 'https://example.com/search' },
      providerTimeoutMs: 1000,
      providerRetryCount: 0,
    });
    await provider.search('具体文章标题', {
      count: 8,
      timeRange: 'OneWeek',
      authLevel: 1,
      queryRewrite: true,
    });
    assert.deepEqual(requestBody.QueryControl, { QueryRewrite: true });
    assert.deepEqual(requestBody.Filter, { AuthInfoLevel: 1 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('allows the Agent Plan key to authenticate web search', async () => {
  const originalFetch = globalThis.fetch;
  let authorization;
  globalThis.fetch = async (_url, options) => {
    authorization = options.headers.Authorization;
    return new Response(JSON.stringify({ Result: { ResultCount: 0, WebResults: [] } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const provider = new WebSearchProvider({
    webSearch: { apiKey: 'shared-key', url: 'https://example.com/search' },
    providerTimeoutMs: 1000,
    providerRetryCount: 0,
  });
  try {
    const result = await provider.probe({ live: true });
    assert.equal(result.ok, true);
    assert.equal(authorization, 'Bearer shared-key');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
