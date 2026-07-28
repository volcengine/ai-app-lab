import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ProviderError } from '../errors.js';
import { withTimeout } from './utils.js';

function parsePayload(result) {
  if (result?.structuredContent && Object.keys(result.structuredContent).length) {
    return result.structuredContent;
  }
  const text = result?.content?.find((item) => item.type === 'text')?.text;
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw_text: text }; }
}

function extractItems(payload) {
  const candidates = [
    payload?.items,
    payload?.data?.items,
    payload?.result?.items,
    payload?.Result?.Items,
  ];
  return candidates.find(Array.isArray) || [];
}

function isTransientDataProError(error) {
  return /(?:10500|4003|429|TIMEOUT|NETWORK_ERROR|FlowLimit)/i.test(error?.code || '');
}

export class DataProProvider {
  constructor(config) {
    this.config = config;
    this.name = 'datapro';
  }

  get configured() {
    return Boolean(this.config.dataPro.apiKey);
  }

  async connect() {
    if (!this.config.dataPro.apiKey) {
      throw new ProviderError(this.name, '未配置 DataPro 凭证', { code: 'DATAPRO_NOT_CONFIGURED' });
    }
    const client = new Client({ name: 'investment-assistant', version: '0.1.0' });
    const transport = new StreamableHTTPClientTransport(new URL(this.config.dataPro.url), {
      requestInit: {
        headers: { 'X-Agent-Plan-Key': this.config.dataPro.apiKey },
      },
    });
    await withTimeout(client.connect(transport), this.config.providerTimeoutMs, this.name);
    return client;
  }

  async probe({ live = false } = {}) {
    const client = await this.connect();
    try {
      const listed = await withTimeout(client.listTools(), this.config.providerTimeoutMs, this.name);
      const hasSearch = listed.tools?.some((tool) => tool.name === 'dataPro_search');
      if (!hasSearch) {
        throw new ProviderError(this.name, 'DataPro 未暴露 dataPro_search 工具', {
          code: 'DATAPRO_TOOL_MISSING',
        });
      }
      if (!live) return { ok: true, live: false, tool: 'dataPro_search' };
      const result = await this.search('沪深300指数 最新可用交易日 收盘点位');
      return { ok: true, live: true, tool: 'dataPro_search', result_count: result.items.length };
    } finally {
      await client.close().catch(() => {});
    }
  }

  async search(query) {
    let lastError;
    for (let attempt = 0; attempt <= this.config.providerRetryCount; attempt += 1) {
      let client;
      try {
        client = await this.connect();
        const result = await withTimeout(client.callTool({
          name: 'dataPro_search',
          arguments: { query },
        }), this.config.providerTimeoutMs, this.name);
        const payload = parsePayload(result);
        const code = Number(payload?.code ?? payload?.Code ?? 0);
        const message = payload?.msg || payload?.message || payload?.Message;
        if (result?.isError || code !== 0 || payload?.error) {
          throw new ProviderError(this.name, message || 'DataPro 返回业务错误', {
            code: code ? `DATAPRO_${code}` : 'DATAPRO_TOOL_ERROR',
            details: { provider_code: code || null },
          });
        }
        return { query, items: extractItems(payload), payload };
      } catch (error) {
        lastError = error;
        if (!isTransientDataProError(error) || attempt >= this.config.providerRetryCount) throw error;
      } finally {
        await client?.close().catch(() => {});
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
    }
    throw lastError;
  }
}

export const dataProInternals = { parsePayload, extractItems, isTransientDataProError };
