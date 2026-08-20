import { runFeishuImport } from "../../scripts/import-feishu-cli.mjs";
import { HttpError } from "../utils/http.js";
import { makeId } from "../utils/ids.js";
import { nowIso } from "../utils/time.js";

const ACTIVE_STATUSES = new Set(["queued", "running"]);
const ALLOWED_DOCUMENT_HOSTS = [
  "feishu.cn",
  "larkoffice.com",
  "larksuite.com",
];

function enabledValue(value, fallback) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return fallback;
  return ["1", "true", "yes", "on"].includes(text);
}

function compact(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function validateDate(value, field) {
  const text = compact(value, 80);
  if (!text) return "";
  if (!Number.isFinite(Date.parse(text))) {
    throw new HttpError(400, "bad_request", `${field}不是有效日期。`);
  }
  return text;
}

function validDocumentTarget(value) {
  try {
    const url = new URL(value);
    const allowedHost = ALLOWED_DOCUMENT_HOSTS.some((host) => (
      url.hostname === host || url.hostname.endsWith(`.${host}`)
    ));
    return (
      url.protocol === "https:"
      && allowedHost
      && /^\/(?:wiki|docx)\//.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function validConversationTarget(value) {
  if (/^ou_[A-Za-z0-9_-]+$/i.test(value)) return false;
  if (value.startsWith("oc_")) return /^oc_[A-Za-z0-9]+$/.test(value);
  return value.length <= 100;
}

function publicImport(imported) {
  return {
    source_type: imported.source_type || "",
    title: imported.title || "",
    action: imported.action || "",
    status: imported.status || "",
    material_id: imported.material_id || imported.imported_material_id || null,
    duration_ms: Number(imported.duration_ms || 0),
    error: imported.error?.message
      ? { message: compact(imported.error.message, 300) }
      : null,
  };
}

function publicTask(task) {
  return {
    id: task.id,
    company_id: task.company_id,
    source_kind: task.source_kind,
    source_label: task.source_label,
    status: task.status,
    summary: task.summary,
    created_at: task.created_at,
    started_at: task.started_at,
    completed_at: task.completed_at,
    result: task.result
      ? {
        ok: Boolean(task.result.ok),
        summary: { ...task.result.summary },
        imports: (task.result.imports || []).map(publicImport),
      }
      : null,
    error: task.error ? { message: task.error.message } : null,
  };
}

export class FeishuImportTaskService {
  constructor(options = {}) {
    this.env = options.env;
    this.salesService = options.salesService;
    this.runner = options.runner || runFeishuImport;
    this.tasks = new Map();
    this.enabled = enabledValue(
      this.env?.value?.("FEISHU_CLI_IMPORT_ENABLED", "")
        || this.env?.value?.("FEISHU_SYNC_ENABLED", ""),
      false,
    );
    this.maxTasks = Math.max(20, Number(this.env?.value?.("FEISHU_CLI_IMPORT_TASK_LIMIT", "100")) || 100);
  }

  status() {
    return {
      available: this.enabled,
      supported_sources: ["conversation", "document"],
    };
  }

  normalizeRequest(companyId, body = {}) {
    if (!this.enabled) {
      throw new HttpError(
        503,
        "feishu_import_unavailable",
        "当前部署未启用飞书资料导入。",
      );
    }
    this.salesService.requireCompany(companyId);
    const sourceKind = compact(body.source_kind, 40);
    if (!["conversation", "document"].includes(sourceKind)) {
      throw new HttpError(400, "bad_request", "资料类型必须是飞书会话或云文档。");
    }
    const target = compact(body.target, sourceKind === "document" ? 1000 : 200);
    if (!target) throw new HttpError(400, "bad_request", "请输入要导入的飞书资料。");
    if (/[\u0000-\u001f]/.test(target)) {
      throw new HttpError(400, "bad_request", "飞书资料标识包含无效字符。");
    }
    if (sourceKind === "document" && !validDocumentTarget(target)) {
      throw new HttpError(400, "bad_request", "请输入完整的 https:// 飞书云文档或知识库链接。");
    }
    if (sourceKind === "conversation" && !validConversationTarget(target)) {
      throw new HttpError(400, "bad_request", "飞书会话请填写联系人姓名或 oc_ 开头的会话 ID，不支持 Open ID。");
    }

    const start = validateDate(body.start, "开始时间");
    const end = validateDate(body.end, "结束时间");
    if (start && end && Date.parse(start) > Date.parse(end)) {
      throw new HttpError(400, "bad_request", "开始时间不能晚于结束时间。");
    }
    const pageLimit = Math.min(10, Math.max(1, Number(body.page_limit || 3) || 3));
    return {
      companyId,
      sourceKind,
      target,
      start,
      end,
      pageLimit,
    };
  }

  pruneTasks() {
    if (this.tasks.size < this.maxTasks) return;
    const removable = [...this.tasks.values()]
      .filter((task) => !ACTIVE_STATUSES.has(task.status))
      .sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)));
    while (this.tasks.size >= this.maxTasks && removable.length) {
      this.tasks.delete(removable.shift().id);
    }
  }

  async start(companyId, body = {}) {
    const request = this.normalizeRequest(companyId, body);
    const active = [...this.tasks.values()].find((task) => (
      task.company_id === companyId && ACTIVE_STATUSES.has(task.status)
    ));
    if (active) {
      throw new HttpError(409, "feishu_import_in_progress", "该企业已有飞书资料正在导入。", {
        task_id: active.id,
      });
    }

    this.pruneTasks();
    const task = {
      id: makeId("feishu_import"),
      company_id: companyId,
      source_kind: request.sourceKind,
      source_label: request.sourceKind === "document" ? "云文档" : "飞书会话",
      status: "queued",
      summary: "导入任务已创建。",
      created_at: nowIso(),
      started_at: null,
      completed_at: null,
      result: null,
      error: null,
    };
    this.tasks.set(task.id, task);
    queueMicrotask(() => {
      this.run(task, request).catch(() => {
        // run() records a public-safe terminal error on the task.
      });
    });
    return publicTask(task);
  }

  async run(task, request) {
    task.status = "running";
    task.summary = "正在从飞书读取并写入企业资料库。";
    task.started_at = nowIso();
    try {
      const options = {
        apiUrl: "",
        companyId: request.companyId,
        docs: request.sourceKind === "document" ? [request.target] : [],
        p2pUser: request.sourceKind === "conversation" && !request.target.startsWith("oc_")
          ? request.target
          : "",
        chatId: request.sourceKind === "conversation" && request.target.startsWith("oc_")
          ? request.target
          : "",
        messageQuery: "",
        start: request.start,
        end: request.end,
        pageSize: 50,
        pageLimit: request.pageLimit,
        titlePrefix: "",
        maxAttempts: 3,
        retryDelayMs: 800,
        incremental: true,
        resumeSource: false,
        dryRun: false,
        authSession: "",
        syncStateLoader: async (source) => this.salesService.getMaterialSyncState(
          request.companyId,
          {
            title: source.display_name || request.target,
            source,
          },
        ),
        materialImporter: async (material) => this.salesService.importMaterial(
          request.companyId,
          material,
        ),
      };
      const result = await this.runner(options);
      task.result = {
        ok: Boolean(result.ok),
        summary: { ...(result.summary || {}) },
        imports: (result.imports || []).map(publicImport),
      };
      task.status = result.ok ? "succeeded" : "failed";
      task.summary = result.ok
        ? "飞书资料已导入，可在历史资料中查看。"
        : "部分或全部飞书资料导入失败。";
      if (!result.ok) {
        const firstError = result.imports?.find((item) => item.error?.message)?.error?.message;
        task.error = { message: compact(firstError || "飞书资料导入失败。", 300) };
      }
    } catch (error) {
      task.status = "failed";
      task.summary = "飞书资料导入失败。";
      task.error = {
        message: compact(
          error?.code === "ENOENT"
            ? "本机未安装或无法找到飞书 CLI。"
            : error?.message || "飞书资料导入失败。",
          300,
        ),
      };
    } finally {
      task.completed_at = nowIso();
    }
    return publicTask(task);
  }

  get(companyId, taskId) {
    this.salesService.requireCompany(companyId);
    const task = this.tasks.get(taskId);
    if (!task || task.company_id !== companyId) {
      throw new HttpError(404, "feishu_import_not_found", "未找到该飞书导入任务。");
    }
    return publicTask(task);
  }
}
