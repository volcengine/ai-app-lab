import { ProviderError } from '../errors.js';
import { jsonrepair } from 'jsonrepair';
import { fetchJson } from './utils.js';

function extractOutputText(body) {
  if (typeof body?.content === 'string') return body.content;
  if (typeof body?.output_text === 'string') return body.output_text;
  const chunks = [];
  for (const output of body?.output || []) {
    for (const content of output?.content || []) {
      if (typeof content?.text === 'string') chunks.push(content.text);
    }
  }
  return chunks.join('');
}

function parseJsonOutput(text) {
  try {
    return { data: JSON.parse(text), repaired: false };
  } catch (initialError) {
    try {
      return { data: JSON.parse(jsonrepair(text)), repaired: true };
    } catch (repairError) {
      throw new ProviderError('ark_model', '模型返回了无效 JSON', {
        code: 'ARK_MODEL_INVALID_JSON',
        details: {
          output_length: text.length,
          initial_parse_error: initialError.message,
          repair_parse_error: repairError.message,
        },
        cause: repairError,
      });
    }
  }
}

export class AgentPlanModelProvider {
  constructor(config) {
    this.config = config;
    this.name = 'ark_model';
  }

  get configured() {
    return Boolean(this.config.ark.apiKey);
  }

  async probe({ live = false } = {}) {
    if (!this.config.ark.apiKey) {
      throw new ProviderError(this.name, '未配置 Agent Plan 模型凭证', { code: 'ARK_MODEL_NOT_CONFIGURED' });
    }
    if (!live) return { ok: true, live: false, model: this.config.ark.model };
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: { ok: { type: 'boolean' } },
      required: ['ok'],
    };
    const result = await this.generateJson({
      instructions: '你是服务健康检查器。只按给定 JSON Schema 返回结果。',
      input: '将 ok 设为 true。',
      schema,
      schemaName: 'health_check',
      maxOutputTokens: 128,
    });
    return { ok: result.data.ok === true, live: true, model: result.model, usage: result.usage };
  }

  async generateJson({ instructions, input, schema, schemaName = 'investment_report', maxOutputTokens }) {
    if (!this.config.ark.apiKey) {
      throw new ProviderError(this.name, '未配置 Agent Plan 模型凭证', { code: 'ARK_MODEL_NOT_CONFIGURED' });
    }
    const body = await fetchJson(`${this.config.ark.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.ark.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.ark.model,
        instructions,
        input,
        temperature: 0.1,
        max_output_tokens: maxOutputTokens || this.config.ark.maxOutputTokens,
        thinking: { type: 'disabled' },
        text: {
          format: {
            type: 'json_schema',
            name: schemaName,
            schema,
            strict: true,
          },
        },
      }),
    }, { provider: this.name, timeoutMs: Math.max(this.config.providerTimeoutMs, 60000) });

    if (body?.error) {
      throw new ProviderError(this.name, body.error.message || '模型返回错误', {
        code: body.error.code || 'ARK_MODEL_API_ERROR',
      });
    }
    if (body?.status && body.status !== 'completed') {
      throw new ProviderError(this.name, '模型输出不完整', {
        code: 'ARK_MODEL_INCOMPLETE',
        details: { status: body.status, reason: body?.incomplete_details?.reason || null },
      });
    }
    const text = extractOutputText(body);
    if (!text) {
      throw new ProviderError(this.name, '模型没有返回正文', { code: 'ARK_MODEL_EMPTY' });
    }
    const parsed = parseJsonOutput(text);
    return {
      data: parsed.data,
      jsonRepaired: parsed.repaired,
      usage: body.usage || {},
      model: body.model || this.config.ark.model,
      responseId: body.id || null,
    };
  }
}

export const agentPlanModelInternals = { extractOutputText, parseJsonOutput };
