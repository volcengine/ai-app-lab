import { ProviderError } from '../errors.js';

export async function fetchJson(url, options, { provider, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 1000) }; }
    if (!response.ok) {
      const providerError = body?.ResponseMetadata?.Error || body?.error || {};
      const upstreamCode = String(providerError.Code || providerError.code || '')
        .replace(/[^A-Za-z0-9_.-]/g, '_');
      throw new ProviderError(provider, providerError.Message || providerError.message || `${provider} 请求失败`, {
        code: upstreamCode ? `${provider.toUpperCase()}_${upstreamCode}` : `${provider.toUpperCase()}_HTTP_${response.status}`,
        details: {
          http_status: response.status,
          provider_code: upstreamCode || null,
          request_id: body?.ResponseMetadata?.RequestId || body?.request_id || null,
        },
      });
    }
    return body;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const timedOut = error.name === 'AbortError';
    throw new ProviderError(provider, timedOut ? `${provider} 请求超时` : `${provider} 请求失败`, {
      code: timedOut ? `${provider.toUpperCase()}_TIMEOUT` : `${provider.toUpperCase()}_NETWORK_ERROR`,
      cause: error,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function withTimeout(promise, timeoutMs, provider) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new ProviderError(provider, `${provider} 请求超时`, {
          code: `${provider.toUpperCase()}_TIMEOUT`,
        })), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
