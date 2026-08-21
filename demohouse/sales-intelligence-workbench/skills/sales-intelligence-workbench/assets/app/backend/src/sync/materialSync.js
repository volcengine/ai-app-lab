import { createHash } from "node:crypto";

const SOURCE_TYPE_ALIASES = new Map([
  ["feishu_doc", "feishu_doc"],
  ["feishu_document", "feishu_doc"],
  ["飞书云文档", "feishu_doc"],
  ["feishu_p2p", "feishu_p2p"],
  ["飞书单聊", "feishu_p2p"],
  ["feishu_chat", "feishu_chat"],
  ["飞书群聊", "feishu_chat"],
  ["飞书会话", "feishu_chat"],
  ["feishu_search", "feishu_search"],
  ["飞书消息搜索", "feishu_search"],
  ["manual", "manual"],
  ["手工导入", "manual"],
]);
const MATERIAL_SNAPSHOT_PATTERN = /<!--\s*sales-workbench-material-v1:([A-Za-z0-9+/=]+)\s*-->/;

function normalizedText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function digest(value) {
  return createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function canonicalUrl(value) {
  const raw = String(value || "").trim();
  if (!/^https?:\/\//i.test(raw)) return raw;
  try {
    const url = new URL(raw);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return raw;
  }
}

function feishuDocumentToken(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/\/(?:wiki|docx)\/([^/?#]+)/i);
  return match?.[1] || raw;
}

function safeSourceConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (/secret|token|api.?key|authorization|cookie|password|credential/i.test(key)) continue;
    if (["string", "number", "boolean"].includes(typeof item) || item === null) result[key] = item;
  }
  return result;
}

export function normalizeMaterialSourceType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return SOURCE_TYPE_ALIASES.get(normalized)
    || SOURCE_TYPE_ALIASES.get(String(value || "").trim())
    || normalized.replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "")
    || "manual";
}

export function normalizeExternalId(sourceType, value) {
  const type = normalizeMaterialSourceType(sourceType);
  const raw = String(value || "").trim();
  if (type === "feishu_doc") return feishuDocumentToken(raw);
  if (/^https?:\/\//i.test(raw)) return canonicalUrl(raw);
  return raw;
}

export function makeSyncSourceId(sourceType, externalId) {
  const type = normalizeMaterialSourceType(sourceType);
  const external = normalizeExternalId(type, externalId);
  if (!external) throw new Error("external_id is required to build a stable sync source id.");
  return `sync_${digest(`${type}\n${external}`).slice(0, 32)}`;
}

export function makeMaterialId(companyId, sourceId) {
  const company = String(companyId || "").trim();
  const source = String(sourceId || "").trim();
  if (!company || !source) throw new Error("company_id and source_id are required to build a material id.");
  return `mat_${digest(`${company}\n${source}`).slice(0, 32)}`;
}

export function normalizeSourceItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const content = normalizedText(item?.content || item?.text);
      const occurredAt = String(item?.occurred_at || item?.create_time || "").trim();
      const sender = normalizedText(item?.sender || item?.sender_name);
      const sourceUrl = canonicalUrl(item?.source_url || item?.message_app_link);
      const fallbackIdentity = `${occurredAt}\n${sender}\n${content}\n${sourceUrl}`;
      const id = String(item?.id || item?.message_id || `item_${digest(fallbackIdentity).slice(0, 24)}`).trim();
      return {
        id,
        occurred_at: occurredAt || null,
        sender,
        content,
        source_url: sourceUrl,
        deleted: Boolean(item?.deleted),
      };
    })
    .filter((item) => item.id && (item.content || item.deleted));
}

export function mergeSourceItems(existingItems = [], incomingItems = []) {
  const merged = new Map(normalizeSourceItems(existingItems).map((item) => [item.id, item]));
  for (const item of normalizeSourceItems(incomingItems)) {
    if (item.deleted) merged.delete(item.id);
    else merged.set(item.id, item);
  }
  return [...merged.values()].sort((a, b) => {
    const timeOrder = String(a.occurred_at || "").localeCompare(String(b.occurred_at || ""));
    return timeOrder || a.id.localeCompare(b.id);
  });
}

export function renderSourceItems(items = []) {
  return normalizeSourceItems(items)
    .filter((item) => !item.deleted)
    .map((item) => [
      `[${item.occurred_at || "时间未知"}] ${item.sender || "未知发送者"}：${item.content}`,
      item.source_url ? `消息链接：${item.source_url}` : "",
    ].filter(Boolean).join("\n"))
    .join("\n\n");
}

export function encodeMaterialSnapshot(input = {}) {
  const snapshot = {
    title: normalizedText(input.title),
    source_type: normalizeMaterialSourceType(input.source_type),
    source_url: canonicalUrl(input.source_url),
    source_id: String(input.source_id || "").trim(),
    source_external_id: String(input.source_external_id || "").trim(),
    source_version: String(input.source_version || "").trim(),
    summary: normalizedText(input.summary),
    text: normalizedText(input.text || input.raw_text || input.content),
    source_items: normalizeSourceItems(input.source_items || input.items),
    occurred_at: String(input.occurred_at || "").trim() || null,
  };
  return `<!-- sales-workbench-material-v1:${Buffer.from(JSON.stringify(snapshot), "utf8").toString("base64")} -->`;
}

export function decodeMaterialSnapshot(content) {
  const text = String(content || "");
  const encoded = text.match(MATERIAL_SNAPSHOT_PATTERN)?.[1];
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return {
      title: normalizedText(parsed.title),
      source_type: normalizeMaterialSourceType(parsed.source_type),
      source_url: canonicalUrl(parsed.source_url),
      source_id: String(parsed.source_id || "").trim(),
      source_external_id: String(parsed.source_external_id || "").trim(),
      source_version: String(parsed.source_version || "").trim(),
      summary: normalizedText(parsed.summary),
      text: normalizedText(parsed.text),
      source_items: normalizeSourceItems(parsed.source_items),
      occurred_at: String(parsed.occurred_at || "").trim() || null,
    };
  } catch {
    return null;
  }
}

export function makeMaterialContentHash(input = {}) {
  const canonical = {
    title: normalizedText(input.title),
    source_url: canonicalUrl(input.source_url),
    summary: normalizedText(input.summary),
    text: normalizedText(input.text || input.raw_text || input.content),
    occurred_at: String(input.occurred_at || "").trim() || null,
    source_items: normalizeSourceItems(input.source_items || input.items),
  };
  return digest(JSON.stringify(canonical));
}

export function buildMaterialSyncIdentity(companyId, body = {}) {
  const source = body.source && typeof body.source === "object" ? body.source : {};
  const sourceType = normalizeMaterialSourceType(source.type || body.source_type);
  const title = normalizedText(body.title);
  const sourceUrl = canonicalUrl(source.url || body.source_url || body.url);
  const suppliedExternalId = source.external_id || body.external_id || sourceUrl;
  const externalId = normalizeExternalId(
    sourceType,
    suppliedExternalId || `manual:${digest(title || normalizedText(body.raw_text || body.text)).slice(0, 24)}`,
  );
  const sourceId = makeSyncSourceId(sourceType, externalId);
  return {
    source_id: sourceId,
    material_id: makeMaterialId(companyId, sourceId),
    source_type: sourceType,
    external_id: externalId,
    display_name: normalizedText(source.display_name || title || externalId).slice(0, 160),
    source_url: sourceUrl,
    checkpoint_key: normalizedText(source.checkpoint_key || body.checkpoint_key || "latest").slice(0, 120),
    checkpoint_value: normalizedText(source.checkpoint_value || body.checkpoint_value).slice(0, 500),
    source_version: normalizedText(source.version || body.source_version || source.checkpoint_value || body.checkpoint_value).slice(0, 200),
    config: safeSourceConfig(source.config),
  };
}
