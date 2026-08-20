import { createEnvReader } from "../config/runtimeEnv.js";
import { collectCitationContext, filterCitationIds, hasAnyCitation, sourceLabelsForIds } from "./citationValidator.js";
import {
  executeProviderCall,
  providerFailure,
  providerSuccess,
} from "./providerResult.js";

const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/plan/v3";
const DEFAULT_MODEL_NAME = "ark-code-latest";
const DEFAULT_TIMEOUT_MS = 90000;
const MAX_INVALID_JSON_CONTENT_LENGTH = 30000;

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function stripJsonFence(content) {
  const text = String(content || "").trim();
  const unfenced = text.startsWith("```")
    ? text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim()
    : text;

  for (let start = 0; start < unfenced.length; start += 1) {
    const opening = unfenced[start];
    if (opening !== "{" && opening !== "[") continue;
    const stack = [opening];
    let inString = false;
    let escaped = false;
    for (let index = start + 1; index < unfenced.length; index += 1) {
      const character = unfenced[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === "\"") inString = false;
        continue;
      }
      if (character === "\"") {
        inString = true;
        continue;
      }
      if (character === "{" || character === "[") {
        stack.push(character);
        continue;
      }
      if (character !== "}" && character !== "]") continue;
      const expected = character === "}" ? "{" : "[";
      if (stack.at(-1) !== expected) break;
      stack.pop();
      if (!stack.length) return unfenced.slice(start, index + 1);
    }
  }

  if (unfenced.startsWith("{") || unfenced.startsWith("[")) return unfenced;
  return unfenced;
}

function normalizeError(payload) {
  const error = payload?.error || payload?.ResponseMetadata?.Error || payload?.Error || null;
  if (!error) return null;
  return {
    code: error.code || error.Code || "provider_error",
    message: error.message || error.Message || "Model provider returned an error.",
  };
}

function conciseSource(source) {
  return {
    id: source.id,
    type: source.type,
    label: source.label,
    url: source.url,
    snippet: source.snippet || "",
    summary: source.summary || "",
    provider: source.provider,
    provider_mode: source.provider_mode,
  };
}

function baselineForPrompt(baseline) {
  return {
    id: baseline.id,
    dimension: baseline.dimension || baseline.title,
    title: baseline.title || baseline.dimension,
    value: baseline.value,
    source_ids: baseline.source_ids || [],
  };
}

function asString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function stripAndParseJson(content) {
  return JSON.parse(stripJsonFence(content));
}

function invalidJsonContent(content) {
  return String(content || "")
    .trim()
    .slice(0, MAX_INVALID_JSON_CONTENT_LENGTH);
}

function extractResponseText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const texts = [];
  for (const output of payload?.output || []) {
    if (typeof output?.text === "string") texts.push(output.text);
    for (const content of output?.content || []) {
      if (typeof content?.text === "string") texts.push(content.text);
      else if (typeof content?.text?.value === "string") texts.push(content.text.value);
    }
  }
  return texts.join("");
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  const promptTokens = Number(usage.prompt_tokens ?? usage.input_tokens);
  const completionTokens = Number(usage.completion_tokens ?? usage.output_tokens);
  const explicitTotal = Number(usage.total_tokens);
  const totalTokens = Number.isFinite(explicitTotal)
    ? explicitTotal
    : (Number.isFinite(promptTokens) && Number.isFinite(completionTokens)
      ? promptTokens + completionTokens
      : NaN);
  const reasoningTokens = Number(
    usage.reasoning_tokens
      ?? usage.output_tokens_details?.reasoning_tokens
      ?? usage.completion_tokens_details?.reasoning_tokens,
  );
  const normalized = {};
  if (Number.isFinite(promptTokens)) normalized.prompt_tokens = promptTokens;
  if (Number.isFinite(completionTokens)) normalized.completion_tokens = completionTokens;
  if (Number.isFinite(totalTokens)) normalized.total_tokens = totalTokens;
  if (Number.isFinite(reasoningTokens)) normalized.reasoning_tokens = reasoningTokens;
  return Object.keys(normalized).length ? normalized : null;
}

function responseStatusFailure(payload) {
  const status = String(payload?.status || "").trim().toLowerCase();
  if (!status || status === "completed") return null;
  if (status === "incomplete") {
    const reason = String(payload?.incomplete_details?.reason || "unknown").trim();
    return {
      code: "incomplete_response",
      message: `Model response was incomplete (${reason}).`,
      retryable: reason === "max_output_tokens",
    };
  }
  if (status === "failed") {
    return {
      code: "response_failed",
      message: String(payload?.error?.message || "Model response failed."),
      retryable: false,
    };
  }
  return {
    code: "unexpected_response_status",
    message: `Model response ended with unexpected status: ${status}.`,
    retryable: false,
  };
}

function matchingFunctionCalls(payload, functionName) {
  return (Array.isArray(payload?.output) ? payload.output : [])
    .filter((item) => ["function_call", "function_tool_call"].includes(String(item?.type || "")))
    .filter((item) => String(item?.name || "") === functionName);
}

export class ModelProvider {
  constructor(options = {}) {
    this.env = options.env || createEnvReader();
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.sleep = options.sleep;
  }

  get apiKey() {
    return this.env.value("MODEL_API_KEY")
      || this.env.value("AGENT_PLAN_API_KEY")
      || this.env.value("ARK_API_KEY")
      || this.env.value("VOLCENGINE_ARK_API_KEY");
  }

  get baseUrl() {
    return this.env.value("MODEL_BASE_URL", DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  get modelName() {
    return this.env.value("MODEL_NAME", DEFAULT_MODEL_NAME);
  }

  get runEnabled() {
    return enabled(this.env.value("MODEL_RUN_ENABLED", "false"));
  }

  get maxCards() {
    return Math.max(1, Math.min(this.env.number("MODEL_MAX_CARDS", 2), 5));
  }

  get maxTokens() {
    return Math.max(200, Math.min(this.env.number("MODEL_MAX_TOKENS", 700), 2000));
  }

  get timeoutMs() {
    return Math.max(5000, Math.min(this.env.number("MODEL_TIMEOUT_MS", DEFAULT_TIMEOUT_MS), 300000));
  }

  get maxRetries() {
    return Math.max(0, Math.min(this.env.number("MODEL_MAX_RETRIES", 1), 2));
  }

  isConfigured() {
    return Boolean(this.apiKey && this.baseUrl && this.modelName);
  }

  isRunEnabled() {
    return this.isConfigured() && this.runEnabled;
  }

  async generateChangeCards(input) {
    if (!this.isConfigured()) {
      return providerFailure("model", { code: "missing_config", message: "AGENT_PLAN_API_KEY, MODEL_BASE_URL or MODEL_NAME is not configured." });
    }

    const allowedSourceIds = new Set((input.sources || []).map((source) => source.id).filter(Boolean));
    if (!allowedSourceIds.size) {
      return providerFailure("model", { code: "missing_sources", message: "At least one source is required for model generation." });
    }

    const result = await this.callJson({
      operation: "change_cards",
      maxTokens: this.maxTokens,
      system: [
        "你是竞争变化卡生成器。只输出 JSON，不要输出 Markdown。",
        "只能根据用户提供的 baseline 和 sources 判断，不能补充外部事实。",
        "如果证据足以和 baseline 对比，输出候选变化卡。",
        "如果证据相关但不足以确定变化，也输出低置信度候选卡，并在 after 中写明需要人工核验。",
        "只有 sources 明显与对象无关时，才返回空 cards，并写 note。",
        "每张 card 必须引用至少一个给定 source id。",
      ].join("\n"),
      payload: {
        task: "基于真实来源生成候选变化卡",
        output_schema: {
          cards: [
            {
              dimension: "变化维度，例如 价格页 / 官网新闻 / 文档站 / 企业主体 / 知识产权",
              title: "一句话标题",
              before: "历史基线或未知状态",
              after: "基于 sources 可支持的候选变化描述",
              confidence: "高/中/低",
              source_ids: ["必须来自 sources[].id"],
            },
          ],
          note: "证据不足或补充说明",
        },
        rules: [
          `最多输出 ${this.maxCards} 张 card`,
          "不要使用未提供的 source_id",
          "不要把搜索结果标题直接当作确定事实，无法确认时写成候选变化或待核验",
          "如果 sources 与 baseline 无法比较，但来源与对象相关，可以输出低置信度候选卡",
        ],
        object: {
          id: input.object.id,
          name: input.object.name,
          object_type: input.object.object_type,
          summary: input.object.summary,
        },
        baseline: (input.object.baseline || []).map(baselineForPrompt),
        sources: (input.sources || []).map(conciseSource),
      },
    });
    if (!result.ok) return result;

    const validation = this.validateCards(result.parsed, allowedSourceIds);
    return providerSuccess("model", {
      request_id: result.request_id,
      model: this.modelName,
      latency_ms: result.latency_ms,
      raw_ref: result.raw_ref,
      cards: validation.cards,
      note: asString(result.parsed.note),
      validation_errors: validation.errors,
      usage: result.usage,
    });
  }

  async callJson({ system, payload, maxTokens, operation = "model" }) {
    if (!this.isConfigured()) {
      return providerFailure("model", { code: "missing_config", message: "AGENT_PLAN_API_KEY, MODEL_BASE_URL or MODEL_NAME is not configured." });
    }

    const body = {
      model: this.modelName,
      instructions: system,
      input: JSON.stringify(payload),
      max_output_tokens: maxTokens || this.maxTokens,
      thinking: { type: "disabled" },
      text: { format: { type: "json_object" } },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();
    let response;
    let providerPayload;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/responses`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      providerPayload = text ? JSON.parse(text) : {};
    } catch (error) {
      return providerFailure("model", {
          code: error.name === "AbortError" ? "timeout" : "network_error",
          message: error.name === "AbortError" ? `${operation} request timed out.` : error.message,
      }, { latency_ms: Date.now() - startedAt });
    } finally {
      clearTimeout(timeout);
    }

    const providerError = normalizeError(providerPayload);
    const requestId = providerPayload?.id || providerPayload?.ResponseMetadata?.RequestId || null;
    if (!response.ok || providerError) {
      return providerFailure("model", providerError || { code: "http_error", message: `HTTP ${response.status}` }, {
        http_status: response.status,
        request_id: requestId,
        latency_ms: Date.now() - startedAt,
      });
    }

    const content = extractResponseText(providerPayload);
    try {
      return providerSuccess("model", {
        request_id: requestId,
        model: this.modelName,
        latency_ms: Date.now() - startedAt,
        raw_ref: requestId ? `model:${requestId}` : null,
        parsed: stripAndParseJson(content),
        usage: normalizeUsage(providerPayload?.usage),
      });
    } catch (error) {
      return providerFailure("model", { code: "invalid_json", message: `Model returned invalid JSON: ${error.message}` }, {
        request_id: requestId,
        raw_ref: requestId ? `model:${requestId}` : null,
        latency_ms: Date.now() - startedAt,
        invalid_content: invalidJsonContent(content),
      });
    }
  }

  async callRequiredFunction(request = {}) {
    return executeProviderCall(
      () => this.callRequiredFunctionOnce(request),
      {
        max_retries: this.maxRetries,
        base_delay_ms: 1200,
        sleep: this.sleep,
      },
    );
  }

  async callRequiredFunctionOnce({
    system,
    payload,
    functionName,
    functionDescription,
    parameters,
    maxTokens,
    operation = "model_function",
  }) {
    if (!this.isConfigured()) {
      return providerFailure("model", {
        code: "missing_config",
        message: "AGENT_PLAN_API_KEY, MODEL_BASE_URL or MODEL_NAME is not configured.",
      });
    }

    const body = {
      model: this.modelName,
      instructions: system,
      input: JSON.stringify(payload),
      max_output_tokens: maxTokens || this.maxTokens,
      thinking: { type: "disabled" },
      store: false,
      tools: [{
        type: "function",
        name: functionName,
        description: functionDescription,
        strict: true,
        parameters,
      }],
      tool_choice: "required",
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();
    let response;
    let providerPayload;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/responses`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      providerPayload = text ? JSON.parse(text) : {};
    } catch (error) {
      return providerFailure("model", {
        code: error.name === "AbortError" ? "timeout" : "network_error",
        message: error.name === "AbortError" ? `${operation} request timed out.` : error.message,
      }, { latency_ms: Date.now() - startedAt });
    } finally {
      clearTimeout(timeout);
    }

    const providerError = normalizeError(providerPayload);
    const requestId = providerPayload?.id || providerPayload?.ResponseMetadata?.RequestId || null;
    if (!response.ok || providerError) {
      return providerFailure("model", providerError || {
        code: "http_error",
        message: `HTTP ${response.status}`,
      }, {
        http_status: response.status,
        request_id: requestId,
        latency_ms: Date.now() - startedAt,
      });
    }

    const statusFailure = responseStatusFailure(providerPayload);
    if (statusFailure) {
      return providerFailure("model", statusFailure, {
        request_id: requestId,
        raw_ref: requestId ? `model:${requestId}` : null,
        latency_ms: Date.now() - startedAt,
        usage: normalizeUsage(providerPayload?.usage),
      });
    }

    const calls = matchingFunctionCalls(providerPayload, functionName);
    if (!calls.length) {
      const anyFunctionCall = (Array.isArray(providerPayload?.output) ? providerPayload.output : [])
        .some((item) => ["function_call", "function_tool_call"].includes(String(item?.type || "")));
      return providerFailure("model", {
        code: anyFunctionCall ? "unexpected_function_call" : "missing_function_call",
        message: anyFunctionCall
          ? `Model called a function other than ${functionName}.`
          : `Model did not call required function ${functionName}.`,
      }, {
        request_id: requestId,
        raw_ref: requestId ? `model:${requestId}` : null,
        latency_ms: Date.now() - startedAt,
        usage: normalizeUsage(providerPayload?.usage),
      });
    }
    if (calls.length !== 1) {
      return providerFailure("model", {
        code: "unexpected_function_call",
        message: `Model called required function ${functionName} ${calls.length} times.`,
      }, {
        request_id: requestId,
        raw_ref: requestId ? `model:${requestId}` : null,
        latency_ms: Date.now() - startedAt,
        usage: normalizeUsage(providerPayload?.usage),
      });
    }

    try {
      return providerSuccess("model", {
        request_id: requestId,
        model: providerPayload?.model || this.modelName,
        latency_ms: Date.now() - startedAt,
        raw_ref: requestId ? `model:${requestId}` : null,
        parsed: JSON.parse(String(calls[0].arguments || "")),
        function_call_id: calls[0].call_id || calls[0].id || null,
        usage: normalizeUsage(providerPayload?.usage),
      });
    } catch (error) {
      return providerFailure("model", {
        code: "invalid_function_arguments",
        message: `Model returned invalid function arguments: ${error.message}`,
      }, {
        request_id: requestId,
        raw_ref: requestId ? `model:${requestId}` : null,
        latency_ms: Date.now() - startedAt,
        usage: normalizeUsage(providerPayload?.usage),
      });
    }
  }

  async generateReport({ scope, object, cards, sources, visualAsset = null }) {
    const result = await this.callJson({
      operation: "report",
      maxTokens: Math.max(this.maxTokens, 1000),
      system: [
        "你是竞争变化报告生成器。只输出 JSON，不要输出 Markdown。",
        "你只能基于 confirmed_cards、sources 和 visual_asset 生成报告。",
        "每个实质性结论都必须引用 citation_card_ids 或 citation_source_ids。",
        "证据不足时写入 risks 或 uncertainty，不能补编事实。",
      ].join("\n"),
      payload: {
        task: "生成竞争变化追踪报告",
        output_schema: {
          summary: "一句话到三句话摘要",
          sections: [
            {
              title: "章节标题",
              items: [
                {
                  text: "结论或说明",
                  citation_card_ids: ["必须来自 confirmed_cards[].id"],
                  citation_source_ids: ["必须来自 sources[].id"],
                },
              ],
            },
          ],
          risks: [
            {
              text: "风险或不确定性",
              citation_card_ids: [],
              citation_source_ids: [],
            },
          ],
          next_steps: ["后续建议"],
        },
        scope,
        object,
        confirmed_cards: cards,
        sources,
        visual_asset: visualAsset ? {
          id: visualAsset.id,
          type: visualAsset.type,
          title: visualAsset.title,
          provider: visualAsset.provider,
          provider_mode: visualAsset.provider_mode,
        } : null,
      },
    });
    if (!result.ok) return result;
    const validation = this.validateReport(result.parsed, cards, sources);
    return {
      ...result,
      content_json: validation.content_json,
      validation_errors: validation.errors,
    };
  }

  validateReport(parsed, cards, sources) {
    const { cardIds, sourceIds } = collectCitationContext(cards, sources);
    const errors = [];
    const sections = [];
    for (const [sectionIndex, section] of (Array.isArray(parsed?.sections) ? parsed.sections : []).entries()) {
      const items = [];
      for (const [itemIndex, item] of (Array.isArray(section?.items) ? section.items : []).entries()) {
        const normalized = {
          text: asString(item.text).slice(0, 420),
          citation_card_ids: filterCitationIds(item.citation_card_ids, cardIds),
          citation_source_ids: filterCitationIds(item.citation_source_ids, sourceIds),
        };
        if (!normalized.text) {
          errors.push(`sections[${sectionIndex}].items[${itemIndex}].text 缺失`);
          continue;
        }
        if (!hasAnyCitation(normalized)) {
          errors.push(`sections[${sectionIndex}].items[${itemIndex}] 缺少有效引用`);
          continue;
        }
        items.push(normalized);
      }
      if (items.length) {
        sections.push({
          title: asString(section.title, "报告章节").slice(0, 48),
          items,
        });
      }
    }

    const risks = (Array.isArray(parsed?.risks) ? parsed.risks : [])
      .map((risk) => ({
        text: asString(risk.text || risk).slice(0, 240),
        citation_card_ids: filterCitationIds(risk.citation_card_ids, cardIds),
        citation_source_ids: filterCitationIds(risk.citation_source_ids, sourceIds),
      }))
      .filter((risk) => risk.text);

    return {
      errors,
      content_json: {
        summary: asString(parsed?.summary, "基于已确认变化生成报告。").slice(0, 600),
        sections,
        risks,
        next_steps: (Array.isArray(parsed?.next_steps) ? parsed.next_steps : []).map((item) => asString(item).slice(0, 180)).filter(Boolean).slice(0, 5),
      },
    };
  }

  async generateQaAnswer({ scope, question, cards, sources, assets = [], excerpts = [] }) {
    const result = await this.callJson({
      operation: "qa",
      maxTokens: Math.max(this.maxTokens, 700),
      system: [
        "你是资料问答助手。只输出 JSON，不要输出 Markdown。",
        "你只能基于 confirmed_cards、sources、reports 和 excerpts 回答。",
        "如果资料不足，answer 里明确说当前资料不足。",
        "回答必须引用有效 citation_card_ids 或 citation_source_ids，资料不足回答也要引用相关资料或留空并说明原因。",
      ].join("\n"),
      payload: {
        task: "基于当前范围已确认资料回答问题",
        output_schema: {
          answer: "回答文本",
          citation_card_ids: ["必须来自 confirmed_cards[].id"],
          citation_source_ids: ["必须来自 sources[].id"],
          insufficient: false,
        },
        question,
        scope,
        confirmed_cards: cards,
        sources,
        reports: assets.filter((asset) => asset.type === "report").map((asset) => ({
          id: asset.id,
          title: asset.title,
          summary: asset.content_json?.summary || "",
        })),
        excerpts,
      },
    });
    if (!result.ok) return result;
    const validation = this.validateQaAnswer(result.parsed, cards, sources);
    return {
      ...result,
      answer: validation.answer,
      validation_errors: validation.errors,
    };
  }

  validateQaAnswer(parsed, cards, sources) {
    const { cardIds, sourceIds } = collectCitationContext(cards, sources);
    const answer = {
      text: asString(parsed?.answer).slice(0, 900),
      citation_card_ids: filterCitationIds(parsed?.citation_card_ids, cardIds),
      citation_source_ids: filterCitationIds(parsed?.citation_source_ids, sourceIds),
      insufficient: Boolean(parsed?.insufficient),
    };
    answer.citations = sourceLabelsForIds(sources, answer.citation_source_ids);
    const errors = [];
    if (!answer.text) errors.push("answer 缺失");
    if (!answer.insufficient && !hasAnyCitation(answer)) errors.push("answer 缺少有效引用");
    return { answer, errors };
  }

  validateCards(parsed, allowedSourceIds) {
    const cards = Array.isArray(parsed?.cards) ? parsed.cards : Array.isArray(parsed) ? parsed : [];
    const errors = [];
    const normalized = [];
    for (const [index, card] of cards.slice(0, this.maxCards).entries()) {
      const sourceIds = Array.isArray(card?.source_ids)
        ? card.source_ids.map((id) => String(id).trim()).filter((id) => allowedSourceIds.has(id))
        : [];
      if (!sourceIds.length) {
        errors.push(`cards[${index}].source_ids 缺失或不在允许来源内`);
        continue;
      }
      const title = asString(card.title);
      const after = asString(card.after);
      if (!title || !after) {
        errors.push(`cards[${index}].title/after 缺失`);
        continue;
      }
      const confidence = ["高", "中", "低"].includes(asString(card.confidence)) ? asString(card.confidence) : "中";
      normalized.push({
        dimension: asString(card.dimension, "公开来源"),
        title: title.slice(0, 80),
        before: asString(card.before, "历史基线未记录该候选变化。").slice(0, 240),
        after: after.slice(0, 320),
        confidence,
        source_ids: [...new Set(sourceIds)],
      });
    }
    return { cards: normalized, errors };
  }
}

export function createModelProvider(options = {}) {
  return new ModelProvider(options);
}
