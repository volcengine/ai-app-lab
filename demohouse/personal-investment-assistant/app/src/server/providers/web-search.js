import { ProviderError } from '../errors.js';
import { fetchJson } from './utils.js';

export function publisherIdentity(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/(?:官方网站|官方站点|官网|网站|客户端|网)$/u, '')
    .toLowerCase();
}

export function extractAttributedPublisher(summary) {
  const text = String(summary || '').replace(/\r/g, '');
  const header = text.split('\n').slice(0, 6).join('\n');
  // Search summaries frequently append the original newsroom credit after the
  // excerpt. Keep that attribution while preserving the clickable host URL.
  const attributedByline = header.match(
    /(?:本文作者|来源|文章来源|稿源)[：:]\s*([^\n\r|｜]{1,40})/u,
  )?.[1] || text.match(
    /(?:^|\n)\s*本文作者[：:]\s*([^\n\r|｜]{1,40})/mu,
  )?.[1] || '';
  const candidate = attributedByline
    .replace(/\s+(?:作者|记者|编辑|责任编辑|发布时间|字号|打印)[：:]?.*$/u, '')
    .replace(/\s+\d{4}(?:[-/.年]\d{1,2})?.*$/u, '')
    .replace(/[|｜].*$/u, '')
    .replace(/[，,；;。]+\s*$/u, '')
    .trim();
  if (!candidate || candidate.length > 40 || /https?:\/\//i.test(candidate)) return '';
  return candidate;
}

function validCalendarParts(year, month, day, hour, minute, second) {
  const value = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return value.getUTCFullYear() === year
    && value.getUTCMonth() === month - 1
    && value.getUTCDate() === day
    && value.getUTCHours() === hour
    && value.getUTCMinutes() === minute
    && value.getUTCSeconds() === second;
}

export function extractPagePublishedAt(summary, providerPublishedAt) {
  const fallback = String(providerPublishedAt || '').trim();
  const header = String(summary || '').replace(/\r/g, '').split('\n').slice(0, 10).join('\n');
  const full = header.match(
    /(?:^|\n)[^\n]{0,40}?(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/mu,
  );
  const fallbackYear = Number(fallback.match(/^(20\d{2})/u)?.[1] || 0);
  const short = full || (fallbackYear
    ? header.match(/(?:^|\n)\s*(\d{1,2})[-/.](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?=\s|$)/mu)
    : null);
  if (!short) return fallback || null;

  let year;
  let month;
  let day;
  let hour;
  let minute;
  let second;
  if (full) {
    [, year, month, day, hour, minute, second = '0'] = full;
  } else {
    year = String(fallbackYear);
    [, month, day, hour, minute, second = '0'] = short;
    const candidate = Date.UTC(Number(year), Number(month) - 1, Number(day));
    const fallbackTime = Date.parse(fallback);
    if (Number.isFinite(fallbackTime) && candidate - fallbackTime > 31 * 86400000) {
      year = String(Number(year) - 1);
    }
  }

  const parts = [year, month, day, hour, minute, second].map(Number);
  if (!validCalendarParts(...parts)) return fallback || null;
  const offset = fallback.match(/([+-]\d{2}:\d{2}|Z)$/u)?.[1] || '+08:00';
  const pad = (value) => String(value).padStart(2, '0');
  return `${parts[0]}-${pad(parts[1])}-${pad(parts[2])}T${pad(parts[3])}:${pad(parts[4])}:${pad(parts[5])}${offset}`;
}

function normalizeResult(item) {
  const siteName = String(item?.SiteName || item?.site_name || '').trim();
  const providerSource = String(item?.Source || item?.source || '').trim();
  const summary = String(item?.Summary || item?.Snippet || item?.summary || item?.snippet || '').trim();
  const providerPublishedAt = item?.PublishTime || item?.publish_time || item?.DatePublished || null;
  const attributedPublisher = extractAttributedPublisher(summary);
  const publisher = attributedPublisher || providerSource || siteName;
  const hostingSite = attributedPublisher
    && siteName
    && publisherIdentity(attributedPublisher) !== publisherIdentity(siteName)
    ? siteName
    : '';
  return {
    title: String(item?.Title || item?.title || '').trim(),
    publisher,
    ...(hostingSite ? { hosting_site: hostingSite } : {}),
    url: String(item?.Url || item?.url || '').trim(),
    summary,
    published_at: extractPagePublishedAt(summary, providerPublishedAt),
  };
}

function parseSearchResponse(body) {
  const error = body?.ResponseMetadata?.Error;
  if (error) {
    throw new ProviderError('web_search', error.Message || '豆包搜索返回业务错误', {
      code: error.Code ? `WEB_SEARCH_${error.Code}` : 'WEB_SEARCH_API_ERROR',
      details: { provider_code: error.Code || error.CodeN || null },
    });
  }
  const result = body?.Result || body?.result || {};
  const rawItems = result?.WebResults || result?.web_results || [];
  const items = rawItems.map(normalizeResult).filter((item) => item.title && item.url);
  return { items, resultCount: Number(result?.ResultCount ?? items.length), timeCost: result?.TimeCost ?? null };
}

export class WebSearchProvider {
  constructor(config) {
    this.config = config;
    this.name = 'web_search';
  }

  get configured() {
    return Boolean(this.config.webSearch.apiKey);
  }

  assertConfigured() {
    if (!this.config.webSearch.apiKey) {
      throw new ProviderError(this.name, '未配置豆包搜索凭证', { code: 'WEB_SEARCH_NOT_CONFIGURED' });
    }
  }

  async probe({ live = false } = {}) {
    this.assertConfigured();
    if (!live) return { ok: true, live: false };
    const result = await this.search('中国证券监督管理委员会 官方网站', {
      count: 1,
      timeRange: null,
      authLevel: 1,
    });
    return { ok: true, live: true, result_count: result.items.length };
  }

  async search(query, {
    count = 8,
    timeRange = 'OneMonth',
    authLevel = 0,
    queryRewrite = false,
  } = {}) {
    this.assertConfigured();
    const normalizedQuery = Array.from(String(query).trim()).slice(0, 100).join('');
    const requestBody = {
      Query: normalizedQuery,
      SearchType: 'web',
      Count: Math.min(Math.max(count, 1), 20),
      NeedSummary: true,
    };
    if (timeRange) requestBody.TimeRange = timeRange;
    if (authLevel > 0) requestBody.Filter = { AuthInfoLevel: authLevel };
    if (queryRewrite) requestBody.QueryControl = { QueryRewrite: true };

    let lastError;
    for (let attempt = 0; attempt <= this.config.providerRetryCount; attempt += 1) {
      try {
        const body = await fetchJson(this.config.webSearch.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.webSearch.apiKey}`,
            'X-Traffic-Tag': 'investment_assistant_oss',
          },
          body: JSON.stringify(requestBody),
        }, { provider: this.name, timeoutMs: this.config.providerTimeoutMs });
        return { query: normalizedQuery, ...parseSearchResponse(body) };
      } catch (error) {
        lastError = error;
        const transient = /(?:10500|429|TIMEOUT|NETWORK_ERROR|FlowLimit)/i.test(error?.code || '');
        if (!transient || attempt >= this.config.providerRetryCount) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
      }
    }
    throw lastError;
  }
}

export const webSearchInternals = {
  extractAttributedPublisher,
  extractPagePublishedAt,
  normalizeResult,
  parseSearchResponse,
  publisherIdentity,
};
