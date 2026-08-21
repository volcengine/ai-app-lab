import { createEnvReader } from "../config/runtimeEnv.js";
import { executeProviderCall, providerFailure, providerSuccess } from "./providerResult.js";

const DEFAULT_MCP_URL = "https://datapro.hqd.cn-beijing.volces.com/mcp";
const DEFAULT_TIMEOUT_MS = 45000;

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function companyContext(object = {}) {
  return [
    object.name,
    object.industry,
    object.location,
    object.business_scope,
    object.businessScope,
    ...(Array.isArray(object.tags) ? object.tags : []),
  ].filter(Boolean).join(" ");
}

function appendUniqueQuery(target, item) {
  if (!item?.label || !item?.query) return;
  if (target.some((existing) => existing.label === item.label)) return;
  target.push(item);
}

function parseMcpPayload(text) {
  if (!text) return {};
  if (text.startsWith("event:")) {
    const line = text.split(/\r?\n/).find((item) => item.startsWith("data:"));
    return line ? JSON.parse(line.slice(5).trim()) : {};
  }
  return JSON.parse(text);
}

function extractTextContent(result) {
  const content = result?.content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (typeof item?.text === "string") return item.text;
      if (item?.type === "json" || item?.json) return JSON.stringify(item.json || item);
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function firstJsonObject(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

function summarizeText(text, maxLength = 4000) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function isPrimitiveValue(value) {
  return ["string", "number", "boolean"].includes(typeof value);
}

function cleanValue(value, maxLength = 160) {
  if (value === undefined || value === null || value === "") return "";
  if (!isPrimitiveValue(value)) return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function summarizeDataItem(item) {
  if (!item || typeof item !== "object") return "";
  const preferredKeys = [
    "公司名称",
    "企业名称",
    "统一社会信用代码",
    "注册号",
    "法人姓名",
    "法定代表人",
    "公司组织类型",
    "注册资本",
    "注册地址",
    "成立日期",
    "经营状态",
    "经营范围",
    "业务范围",
    "主营业务",
    "风险类型",
    "案件类型",
    "案件名称",
    "案号",
    "案由",
    "涉案金额",
    "立案日期",
    "开庭日期",
    "处罚决定日期",
    "处罚事由",
    "处罚结果",
    "被执行人",
    "原告",
    "被告",
    "标题",
    "公告名称",
    "发布时间",
    "发布日期",
    "中标金额",
    "招标人",
    "中标人",
    "项目名称",
  ];
  const parts = [];
  for (const key of preferredKeys) {
    const value = cleanValue(
      item[key],
      /经营范围|业务范围|主营业务|案由|处罚事由|处罚结果/.test(key) ? 360 : 180,
    );
    if (value) parts.push(`${key}：${value}`);
    if (parts.length >= 12) break;
  }
  if (!parts.length) {
    for (const [key, value] of Object.entries(item)) {
      if (/^(?:id|trace[_-]?id|request[_-]?id|企业ID|关联主键)$/i.test(key)) continue;
      const itemText = cleanValue(value, 180);
      if (!itemText) continue;
      parts.push(`${key}：${itemText}`);
      if (parts.length >= 12) break;
    }
  }
  return parts.join("；");
}

function summarizeParsedResult(parsed, fallbackText) {
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  if (items.length) {
    return items
      .slice(0, 5)
      .map(summarizeDataItem)
      .filter(Boolean)
      .join("\n")
      .slice(0, 4000);
  }
  const message = cleanValue(parsed?.msg || parsed?.message, 160);
  if (message && Number(parsed?.code ?? 0) === 0) return `DataPro 返回成功：${message}`;
  return summarizeText(fallbackText);
}

export class DataProProvider {
  constructor(options = {}) {
    this.env = options.env || createEnvReader();
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
  }

  get apiKey() {
    return this.env.value("DATAPRO_API_KEY") || this.env.value("AGENT_PLAN_API_KEY");
  }

  get mcpUrl() {
    return this.env.value("DATAPRO_MCP_URL", DEFAULT_MCP_URL);
  }

  get runEnabled() {
    return enabled(this.env.value("DATAPRO_RUN_ENABLED", "false"));
  }

  get maxSources() {
    return Math.max(1, Math.min(this.env.number("DATAPRO_MAX_SOURCES", 4), 5));
  }

  get timeoutMs() {
    return Math.max(1000, this.env.number("DATAPRO_TIMEOUT_MS", DEFAULT_TIMEOUT_MS));
  }

  get maxRetries() {
    return Math.max(0, Math.min(this.env.number("DATAPRO_MAX_RETRIES", 1), 2));
  }

  isConfigured() {
    return Boolean(this.apiKey && this.mcpUrl);
  }

  isRunEnabled() {
    return this.isConfigured() && this.runEnabled;
  }

  buildCompanyQuery(object) {
    return [
      object.name,
      "企业工商信息",
      "统一社会信用代码",
      "注册资本",
      "经营范围",
      "知识产权",
      "软件著作权",
    ].join(" ");
  }

  planDossierQueries(object, options = {}) {
    const name = cleanValue(object?.name, 200);
    if (!name) return [];
    const context = companyContext(object);
    const maxSources = Math.max(
      1,
      Math.min(Number(options.maxSources || this.maxSources) || this.maxSources, 5),
    );
    const queries = [];
    const businessQuery = {
      label: "企业工商数据库",
      purpose: "主体、经营与知识产权核验",
      query: `${name} 企业工商数据 基本信息 经营状况 经营范围 知识产权 专利`,
    };

    appendUniqueQuery(queries, businessQuery);

    appendUniqueQuery(queries, {
      label: "企业风险数据库",
      purpose: "风险与关注事项核验",
      query: `${name} 企业风险数据 司法诉讼 行政处罚 失信被执行 经营异常 限制高消费`,
    });

    if (/整车|汽车制造|新能源汽车|乘用车|商用车|车企/.test(context)) {
      appendUniqueQuery(queries, {
        label: "汽车销量数据库",
        purpose: "汽车市场与销量变化核验",
        query: `${name} 汽车销量数据库 最新月度销量 品牌 车系 厂商 同比 环比`,
      });
    }

    if (/股份有限公司|上市|证券|银行|金融|保险|基金|期货|信托/.test(context)) {
      appendUniqueQuery(queries, {
        label: "金融数据库",
        purpose: "上市与财务信息核验",
        query: `${name} 金融数据库 证券代码 最新财务指标 营业收入 净利润 市值 公告`,
      });
    }

    if (/科研|研究院|高校|生物医药|制药|医疗器械|半导体|人工智能/.test(context)) {
      appendUniqueQuery(queries, {
        label: "科研学术数据搜索服务",
        purpose: "技术与科研能力核验",
        query: `${name} 科研学术数据 论文 专利 技术方向 研发成果`,
      });
    }

    return queries.slice(0, maxSources);
  }

  async callTool(query) {
    if (!this.isConfigured()) {
      return providerFailure("datapro", { code: "missing_config", message: "AGENT_PLAN_API_KEY or DATAPRO_MCP_URL is not configured." });
    }

    return executeProviderCall(
      () => this.callToolOnce(query),
      { max_retries: this.maxRetries },
    );
  }

  async callToolOnce(query) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    let payload;
    try {
      response = await this.fetchImpl(this.mcpUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
          "X-Agent-Plan-Key": this.apiKey,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `datapro-${Date.now()}`,
          method: "tools/call",
          params: {
            name: "dataPro_search",
            arguments: { query },
          },
        }),
        signal: controller.signal,
      });
      payload = parseMcpPayload(await response.text());
    } catch (error) {
      return providerFailure("datapro", {
          code: error.name === "AbortError" ? "timeout" : "network_error",
          message: error.name === "AbortError" ? "DataPro request timed out." : error.message,
      }, { latency_ms: Date.now() - startedAt });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok || payload?.error) {
      return providerFailure("datapro", {
        code: payload?.error?.code || "provider_error",
        message: payload?.error?.message || `HTTP ${response.status}`,
      }, {
        http_status: response.status,
        latency_ms: Date.now() - startedAt,
      });
    }

    const result = payload.result || {};
    const text = extractTextContent(result);
    const parsed = firstJsonObject(text);
    const traceId = parsed?.trace_id || parsed?.traceId || parsed?.data?.trace_id || null;
    const parsedCode = parsed?.code ?? parsed?.Code ?? parsed?.data?.code;
    const isError = Boolean(result.isError || parsed?.isError || (parsedCode !== undefined && Number(parsedCode) !== 0));
    if (isError) {
      return providerFailure("datapro", {
        code: parsedCode !== undefined ? String(parsedCode) : "tool_error",
        message: parsed?.msg || parsed?.message || summarizeText(text, 240) || "DataPro tool returned an error.",
      }, {
        request_id: traceId,
        raw_ref: traceId ? `datapro:${traceId}` : null,
        latency_ms: Date.now() - startedAt,
      });
    }

    return providerSuccess("datapro", {
      query,
      request_id: traceId,
      raw_ref: traceId ? `datapro:${traceId}` : null,
      latency_ms: Date.now() - startedAt,
      text,
      parsed,
      item_summaries: (Array.isArray(parsed?.items) ? parsed.items : [])
        .slice(0, 5)
        .map(summarizeDataItem)
        .filter(Boolean),
      summary: summarizeParsedResult(parsed, text),
    });
  }

  async queryCompanyFacts(object) {
    const query = this.buildCompanyQuery(object);
    return this.callTool(query);
  }
}

export function createDataProProvider(options = {}) {
  return new DataProProvider(options);
}
