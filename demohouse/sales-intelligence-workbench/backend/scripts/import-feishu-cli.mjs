import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_API_URL = "http://127.0.0.1:8787";
const DEFAULT_PAGE_SIZE = 20;

function usage() {
  return `
Usage:
  npm run feishu:import -- --company-id <id> [sources]

Sources:
  --doc <url_or_token>                 Import a Feishu/Lark doc as markdown.
  --p2p-user <name_or_open_id>         Import direct messages with a person.
  --chat-id <oc_xxx>                   Import messages from a chat.
  --message-query <keyword>            Import message search results.

Options:
  --api-url <url>                      Backend URL. Default: ${DEFAULT_API_URL}
  --auth-session <path>                Local 0600 CLI session created by the Skill login command.
  --start <date_or_iso>                Explicit message start time.
  --end <date_or_iso>                  Message end time.
  --page-size <n>                      Message page size, max 50. Default: ${DEFAULT_PAGE_SIZE}
  --page-limit <n>                     Page limit for chat pagination. Default: 1
  --title-prefix <text>                Prefix imported material titles.
  --max-attempts <n>                   Retry attempts for transient failures. Default: 3
  --retry-delay-ms <n>                 Initial retry delay. Default: 800
  --no-incremental                     Ignore the saved backend checkpoint.
  --resume-source                      Resume a paused source before importing.
  --dry-run                            Fetch from Feishu but do not import to backend.

Examples:
  npm run feishu:import -- --company-id company_1 --p2p-user "联系人姓名" --start 2026-06-01
  npm run feishu:import -- --company-id company_1 --doc "https://example.feishu.cn/wiki/..."
`;
}

function parseArgs(argv) {
  const args = {
    apiUrl: DEFAULT_API_URL,
    companyId: "",
    docs: [],
    p2pUser: "",
    chatId: "",
    messageQuery: "",
    start: "",
    end: "",
    pageSize: DEFAULT_PAGE_SIZE,
    pageLimit: 1,
    titlePrefix: "",
    maxAttempts: 3,
    retryDelayMs: 800,
    incremental: true,
    resumeSource: false,
    dryRun: false,
    authSession: process.env.SALES_WORKBENCH_AUTH_SESSION || "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[i];
    };

    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--api-url") args.apiUrl = next();
    else if (arg === "--auth-session") args.authSession = next();
    else if (arg === "--company-id") args.companyId = next();
    else if (arg === "--doc") args.docs.push(next());
    else if (arg === "--p2p-user") args.p2pUser = next();
    else if (arg === "--chat-id") args.chatId = next();
    else if (arg === "--message-query") args.messageQuery = next();
    else if (arg === "--start") args.start = next();
    else if (arg === "--end") args.end = next();
    else if (arg === "--page-size") args.pageSize = Number(next());
    else if (arg === "--page-limit") args.pageLimit = Number(next());
    else if (arg === "--title-prefix") args.titlePrefix = next();
    else if (arg === "--max-attempts") args.maxAttempts = Number(next());
    else if (arg === "--retry-delay-ms") args.retryDelayMs = Number(next());
    else if (arg === "--no-incremental") args.incremental = false;
    else if (arg === "--resume-source") args.resumeSource = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.help) return args;
  if (!args.companyId) throw new Error("--company-id is required.");
  if (!args.docs.length && !args.p2pUser && !args.chatId && !args.messageQuery) {
    throw new Error("At least one source is required: --doc, --p2p-user, --chat-id, or --message-query.");
  }
  if (!Number.isFinite(args.pageSize) || args.pageSize < 1 || args.pageSize > 50) {
    throw new Error("--page-size must be a number between 1 and 50.");
  }
  if (!Number.isFinite(args.pageLimit) || args.pageLimit < 1 || args.pageLimit > 40) {
    throw new Error("--page-limit must be a number between 1 and 40.");
  }
  if (!Number.isFinite(args.maxAttempts) || args.maxAttempts < 1 || args.maxAttempts > 8) {
    throw new Error("--max-attempts must be a number between 1 and 8.");
  }
  if (!Number.isFinite(args.retryDelayMs) || args.retryDelayMs < 0 || args.retryDelayMs > 30000) {
    throw new Error("--retry-delay-ms must be a number between 0 and 30000.");
  }
  return args;
}

function readAuthSession(filePath) {
  if (!filePath) return null;
  try {
    const session = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return session?.access_token ? session : null;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error(`Unable to read auth session: ${error.message}`);
  }
}

function writeAuthSession(filePath, session, apiUrl) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true, mode: 0o700 });
  const issuedAt = Date.now();
  const current = readAuthSession(filePath) || {};
  const value = {
    ...current,
    api_url: apiUrl.replace(/\/$/, ""),
    token_type: "bearer",
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: Number(session.expires_in) || 3600,
    issued_at: new Date(issuedAt).toISOString(),
    expires_at: new Date(issuedAt + (Number(session.expires_in) || 3600) * 1000).toISOString(),
    user: session.user || current.user || null,
  };
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

async function refreshAuthSession(options, current) {
  if (!current?.refresh_token) return null;
  const response = await fetch(`${options.apiUrl.replace(/\/$/, "")}/api/auth/cli-refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: current.refresh_token }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  const session = payload.data || payload;
  if (!session.access_token || !session.refresh_token) return null;
  writeAuthSession(options.authSession, session, options.apiUrl);
  return session;
}

async function backendFetch(url, init, options, allowRefresh = true) {
  const session = readAuthSession(options.authSession);
  const headers = new Headers(init?.headers || {});
  if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
  let response = await fetch(url, { ...init, headers });
  if (response.status !== 401 || !allowRefresh || !session?.refresh_token) return response;
  const refreshed = await refreshAuthSession(options, session);
  if (!refreshed?.access_token) return response;
  const retryHeaders = new Headers(init?.headers || {});
  retryHeaders.set("Authorization", `Bearer ${refreshed.access_token}`);
  response = await fetch(url, { ...init, headers: retryHeaders });
  return response;
}

function retryable(error) {
  const message = String(error?.message || error || "");
  return /timeout|timed out|network|fetch failed|temporar|connection reset|econn/i.test(message)
    || /\b429\b|\b5\d\d\b/.test(message);
}

async function withRetry(operation, options) {
  let lastError;
  let attempts = 0;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    attempts = attempt;
    try {
      return { value: await operation(), attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt >= options.maxAttempts || !retryable(error)) break;
      await delay(options.retryDelayMs * (2 ** (attempt - 1)));
    }
  }
  const failure = lastError instanceof Error ? lastError : new Error(String(lastError));
  failure.attempts = attempts;
  throw failure;
}

async function runLark(args) {
  const { stdout, stderr } = await execFileAsync("lark-cli", args, {
    maxBuffer: 20 * 1024 * 1024,
  });
  const text = stdout.trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error(`lark-cli returned non-JSON output: ${stderr || stdout}`);
  }
}

function textOf(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function compact(value, max = 240) {
  const text = textOf(value).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
}

function extractTitleFromDoc(content, fallback) {
  const text = textOf(content);
  const xmlTitle = text.match(/<title[^>]*>(.*?)<\/title>/i)?.[1];
  if (xmlTitle) return compact(xmlTitle, 80);
  const mdTitle = text.split(/\r?\n/).find((line) => /^#\s+/.test(line))?.replace(/^#\s+/, "");
  return mdTitle ? compact(mdTitle, 80) : fallback;
}

function docExternalId(doc) {
  return String(doc || "").match(/\/(?:wiki|docx)\/([^/?#]+)/i)?.[1] || String(doc || "").trim();
}

function extractDocUrl(doc) {
  if (/^https?:\/\//.test(doc)) return doc;
  return "";
}

function syncStateUrl(source, options) {
  const url = new URL(`${options.apiUrl}/api/target-enterprises/${encodeURIComponent(options.companyId)}/materials/sync-state`);
  url.searchParams.set("source_type", source.type);
  url.searchParams.set("external_id", source.external_id);
  url.searchParams.set("checkpoint_key", source.checkpoint_key || "latest");
  url.searchParams.set("display_name", source.display_name || source.external_id);
  return url;
}

async function getSyncState(source, options) {
  if (!options.incremental) return null;
  if (typeof options.syncStateLoader === "function") {
    const state = await options.syncStateLoader(source);
    if (state?.source?.status === "paused" && !options.resumeSource) {
      throw new Error(`Sync source is paused: ${state.source_id}. Resume the source before importing.`);
    }
    return state;
  }
  const response = await backendFetch(syncStateUrl(source, options), {}, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Backend sync-state failed (${response.status}): ${JSON.stringify(payload)}`);
  const state = payload.data || payload;
  if (state.source?.status === "paused" && !options.resumeSource) {
    throw new Error(`Sync source is paused: ${state.source_id}. Use --resume-source to continue.`);
  }
  return state;
}

function checkpointStart(options, state) {
  if (options.start) return options.start;
  const value = String(state?.checkpoint?.checkpoint_value || "").trim();
  return /^\d{4}-\d{2}-\d{2}T/.test(value) ? value : "";
}

async function fetchDocMaterial(doc, options) {
  const source = {
    type: "feishu_doc",
    external_id: docExternalId(doc),
    display_name: `飞书云文档：${compact(docExternalId(doc), 60)}`,
    checkpoint_key: "revision_id",
  };
  await getSyncState(source, options);
  const result = await runLark([
    "docs", "+fetch", "--api-version", "v2", "--as", "user", "--doc", doc,
    "--doc-format", "markdown", "--format", "json",
  ]);
  if (!result.ok) throw new Error(`docs +fetch failed: ${JSON.stringify(result.error || result)}`);

  const document = result.data?.document || result.document || {};
  const content = document.content || result.data?.content || "";
  const title = extractTitleFromDoc(content, `飞书云文档：${compact(source.external_id, 40)}`);
  source.display_name = title;
  source.checkpoint_value = String(document.revision_id ?? result.data?.revision_id ?? "");
  source.version = source.checkpoint_value;
  source.url = extractDocUrl(doc);
  source.config = {
    document_id: document.document_id || "",
    revision_id: document.revision_id ?? null,
    format: "markdown",
  };
  return {
    title: `${options.titlePrefix || ""}飞书云文档：${title}`,
    source,
    source_type: "feishu_doc",
    source_url: source.url,
    sync_mode: "full",
    raw_text: content,
    resume_source: options.resumeSource,
  };
}

function normalizeUserId(value) {
  return /^ou_[a-zA-Z0-9]+$/.test(value) ? value : "";
}

async function resolveUser(query) {
  const direct = normalizeUserId(query);
  if (direct) return { open_id: direct, localized_name: query, p2p_chat_id: "" };
  const result = await runLark([
    "contact", "+search-user", "--query", query, "--has-chatted", "--as", "user", "--format", "json",
  ]);
  const users = result.data?.users || result.users || [];
  if (!users.length) throw new Error(`No Feishu user found for: ${query}`);
  return users[0];
}

function senderName(message, targetUser) {
  const sender = message.sender || {};
  if (sender.name) return sender.name;
  if (targetUser?.open_id && sender.id === targetUser.open_id) return targetUser.localized_name || "对方";
  return "当前用户";
}

function messageItem(message, targetUser) {
  return {
    id: message.message_id || "",
    occurred_at: message.create_time || null,
    sender: senderName(message, targetUser),
    content: textOf(message.content),
    source_url: message.message_app_link || "",
    deleted: Boolean(message.deleted),
  };
}

function messageTimestamp(message) {
  const raw = String(message?.create_time || "").trim();
  if (/^\d+$/.test(raw)) {
    const value = Number(raw);
    return raw.length <= 10 ? value * 1000 : value;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function listChatMessages({ chatId, userId, start, end, pageSize, pageLimit }) {
  const messages = [];
  let pageToken = "";
  for (let page = 0; page < pageLimit; page += 1) {
    const args = [
      "im", "+chat-messages-list", chatId ? "--chat-id" : "--user-id", chatId || userId,
      "--as", "user", "--order", "asc", "--page-size", String(pageSize), "--format", "json",
    ];
    if (start) args.push("--start", start);
    if (end) args.push("--end", end);
    if (pageToken) args.push("--page-token", pageToken);
    const result = await runLark(args);
    if (!result.ok) throw new Error(`im +chat-messages-list failed: ${JSON.stringify(result.error || result)}`);
    const data = result.data || result;
    messages.push(...(data.messages || []));
    if (!data.has_more || !data.page_token) break;
    pageToken = data.page_token;
  }
  return messages;
}

function messageMaterial({ title, source, messages, targetUser, options, sourceUrl = "" }) {
  if (!messages.length) return { skipped: true, reason: "no_new_messages", source };
  const orderedMessages = [...messages].sort((left, right) => {
    const byTime = messageTimestamp(left) - messageTimestamp(right);
    if (byTime) return byTime;
    return String(left.message_id || "").localeCompare(String(right.message_id || ""));
  });
  const first = orderedMessages[0];
  const last = orderedMessages[orderedMessages.length - 1];
  source.checkpoint_value = last.create_time || "";
  source.version = last.message_id || last.create_time || "";
  source.url = sourceUrl || first.message_app_link || "";
  source.config = { message_count: messages.length };
  return {
    title: `${options.titlePrefix || ""}${title}`,
    source,
    source_type: source.type,
    source_url: source.url,
    sync_mode: "incremental",
    occurred_at: first.create_time || null,
    summary: `通过飞书 CLI 读取 ${messages.length} 条消息，时间范围 ${first.create_time || "未知"} 至 ${last.create_time || "未知"}。`,
    source_items: orderedMessages.map((message) => messageItem(message, targetUser)),
    resume_source: options.resumeSource,
  };
}

async function fetchP2PMaterial(query, options) {
  const user = await resolveUser(query);
  const source = {
    type: "feishu_p2p",
    external_id: user.p2p_chat_id || user.open_id,
    display_name: `飞书单聊：${user.localized_name || query}`,
    checkpoint_key: "last_message_time",
  };
  const state = await getSyncState(source, options);
  const messages = await listChatMessages({
    chatId: user.p2p_chat_id || "",
    userId: user.open_id,
    start: checkpointStart(options, state),
    end: options.end,
    pageSize: options.pageSize,
    pageLimit: options.pageLimit,
  });
  return messageMaterial({
    title: `飞书单聊：${user.localized_name || query}`,
    source,
    messages,
    targetUser: user,
    options,
  });
}

async function fetchChatMaterial(chatId, options) {
  const source = {
    type: "feishu_chat",
    external_id: chatId,
    display_name: `飞书群聊：${chatId}`,
    checkpoint_key: "last_message_time",
  };
  const state = await getSyncState(source, options);
  const messages = await listChatMessages({
    chatId,
    userId: "",
    start: checkpointStart(options, state),
    end: options.end,
    pageSize: options.pageSize,
    pageLimit: options.pageLimit,
  });
  return messageMaterial({ title: `飞书群聊：${chatId}`, source, messages, targetUser: null, options });
}

async function fetchMessageSearchMaterial(query, options) {
  const source = {
    type: "feishu_search",
    external_id: query,
    display_name: `飞书消息搜索：${query}`,
    checkpoint_key: "last_message_time",
  };
  const state = await getSyncState(source, options);
  const args = [
    "im", "+messages-search", "--query", query, "--as", "user",
    "--page-size", String(options.pageSize), "--page-limit", String(options.pageLimit), "--format", "json",
  ];
  const start = checkpointStart(options, state);
  if (start) args.push("--start", start);
  if (options.end) args.push("--end", options.end);
  const result = await runLark(args);
  if (!result.ok) throw new Error(`im +messages-search failed: ${JSON.stringify(result.error || result)}`);
  const data = result.data || result;
  const messages = data.messages || data.items || [];
  return messageMaterial({ title: `飞书消息搜索：${query}`, source, messages, targetUser: null, options });
}

async function importMaterial(material, options) {
  if (options.dryRun) {
    return {
      action: "dry_run",
      material: { title: material.title },
      source: material.source,
    };
  }
  if (typeof options.materialImporter === "function") {
    return options.materialImporter(material);
  }
  const response = await backendFetch(`${options.apiUrl}/api/target-enterprises/${encodeURIComponent(options.companyId)}/materials/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(material),
  }, options);
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) throw new Error(`Backend import failed (${response.status}): ${JSON.stringify(payload)}`);
  return payload.data || payload;
}

function descriptors(options) {
  return [
    ...options.docs.map((doc) => ({ type: "feishu_doc", label: doc, fetch: () => fetchDocMaterial(doc, options) })),
    ...(options.p2pUser ? [{ type: "feishu_p2p", label: options.p2pUser, fetch: () => fetchP2PMaterial(options.p2pUser, options) }] : []),
    ...(options.chatId ? [{ type: "feishu_chat", label: options.chatId, fetch: () => fetchChatMaterial(options.chatId, options) }] : []),
    ...(options.messageQuery ? [{ type: "feishu_search", label: options.messageQuery, fetch: () => fetchMessageSearchMaterial(options.messageQuery, options) }] : []),
  ];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage().trim());
    return;
  }

  const result = await runFeishuImport(options);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

async function runFeishuImport(options) {
  const imports = [];
  for (const descriptor of descriptors(options)) {
    const startedAt = Date.now();
    try {
      const fetched = await withRetry(descriptor.fetch, options);
      if (fetched.value.skipped) {
        imports.push({
          source_type: descriptor.type,
          source: descriptor.label,
          action: "unchanged",
          status: "skipped",
          reason: fetched.value.reason,
          fetch_attempts: fetched.attempts,
          duration_ms: Date.now() - startedAt,
        });
        continue;
      }
      const imported = await withRetry(() => importMaterial(fetched.value, options), options);
      imports.push({
        source_type: descriptor.type,
        source: descriptor.label,
        title: fetched.value.title,
        action: imported.value.action || "imported",
        status: imported.value.openviking_record?.status || imported.value.material?.openviking_status || "ready",
        imported_material_id: imported.value.material?.id || null,
        source_id: imported.value.source?.id || fetched.value.source?.external_id || null,
        content_hash: imported.value.material?.content_hash || null,
        provider_run_id: imported.value.provider_run_id || null,
        openviking_ref: imported.value.openviking_record?.raw_ref || null,
        fetch_attempts: fetched.attempts,
        import_attempts: imported.attempts,
        duration_ms: Date.now() - startedAt,
      });
    } catch (error) {
      imports.push({
        source_type: descriptor.type,
        source: descriptor.label,
        action: "failed",
        status: "failed",
        attempts: error.attempts || 1,
        duration_ms: Date.now() - startedAt,
        error: { message: compact(error.message, 500) },
      });
    }
  }

  const failed = imports.filter((item) => item.status === "failed").length;
  return {
    ok: failed === 0,
    company_id: options.companyId,
    source_count: imports.length,
    summary: {
      created: imports.filter((item) => item.action === "created").length,
      updated: imports.filter((item) => item.action === "updated").length,
      unchanged: imports.filter((item) => item.action === "unchanged").length,
      failed,
    },
    imports,
  };
}

export {
  backendFetch,
  checkpointStart,
  docExternalId,
  extractDocUrl,
  messageMaterial,
  parseArgs,
  readAuthSession,
  retryable,
  runFeishuImport,
  withRetry,
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: { message: error.message },
    }, null, 2));
    process.exit(1);
  });
}
