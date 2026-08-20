(function () {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const defaultApiBase = ["http:", "https:"].includes(window.location.protocol)
    ? `${window.location.origin}/api`
    : "http://127.0.0.1:8787/api";
  const API_BASE = (window.SALES_WORKBENCH_API_BASE || defaultApiBase).replace(/\/$/, "");
  const TARGET_STATUS_FILTERS = ["全部", "新商机", "初步接触", "需求确认", "商务推进", "成交归档"];
  const MATERIAL_FILTERS = ["全部", "档案", "飞书会话", "云文档"];
  const DOSSIER_SECTION_TITLES = [
    "企业与业务概览",
    "经营与业务动态",
    "近期公开动态",
    "风险与关注事项",
    "销售机会判断",
    "建议行动",
  ];
  const QA_SECTION_HEADING_SOURCE = "结论|依据(?:[（(][^）)]+[）)])?|当前情况|关键发现|风险|建议|下一步|行动(?:项)?|资料缺口|补充说明";
  const QA_SECTION_HEADING_PATTERN = new RegExp(`^(${QA_SECTION_HEADING_SOURCE})[：:]\\s*([\\s\\S]+)$`);
  const {
    collapseRepeatedCitationRuns,
    dedupeCitationEntries,
    normalizeChineseTypography,
    splitReadableBlocks,
  } = window.SalesTextFormat;

  let goals = [];
  let companies = {};

  const state = {
    activeGoalId: "",
    activeCompanyId: "",
    selectedDossierId: "",
    targetStatusFilter: "全部",
    materialFilter: "全部",
    supportView: "library",
    query: "",
    hasSearched: false,
    showNewGoal: false,
    bootLoading: true,
    bootError: "",
    auth: {
      checked: false,
      enabled: false,
      authenticated: false,
      bootstrapRequired: false,
      user: null,
    },
    authBusy: "",
    authError: "",
    authNotice: "",
    feishuImportOpen: false,
    feishuImportAvailable: null,
    feishuImportKind: "conversation",
    feishuImportDraft: { target: "", start: "", end: "" },
    feishuImportTask: null,
    feishuImportError: "",
    busy: "",
    qaPendingCompanyId: "",
    notice: "",
    sidebarNotice: "",
    jobsByCompany: {},
    mobileNavigationOpen: false,
    qaMessages: [],
    qaMessagesByCompany: {},
  };
  let bootGeneration = 0;
  let feishuImportPollToken = 0;
  const jobPollTokens = new Map();

  function resetConnectedState() {
    goals = [];
    companies = {};
    state.activeGoalId = "";
    state.activeCompanyId = "";
    state.selectedDossierId = "";
    state.qaMessages = [];
    state.qaMessagesByCompany = {};
    state.jobsByCompany = {};
    state.feishuImportOpen = false;
    state.feishuImportAvailable = null;
    state.feishuImportTask = null;
    state.feishuImportError = "";
  }

  function cookieValue(name) {
    const prefix = `${name}=`;
    for (const item of String(document.cookie || "").split(";")) {
      const trimmed = item.trim();
      if (!trimmed.startsWith(prefix)) continue;
      try {
        return decodeURIComponent(trimmed.slice(prefix.length));
      } catch {
        return trimmed.slice(prefix.length);
      }
    }
    return "";
  }

  async function api(path, options = {}) {
    const method = options.method || "GET";
    const headers = { ...(options.headers || {}) };
    if (options.body) headers["Content-Type"] = "application/json";
    if (!["GET", "HEAD"].includes(method)) {
      const csrfToken = cookieValue("siw_csrf");
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
    }
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: "same-origin",
      headers: Object.keys(headers).length ? headers : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error?.message || `请求失败：${response.status}`);
      error.status = response.status;
      error.code = payload.error?.code || "api_error";
      error.details = payload.error?.details || null;
      error.requestId = payload.meta?.request_id || "";
      if (response.status === 401 && !options.skipAuthRedirect) {
        state.auth.checked = true;
        state.auth.enabled = true;
        state.auth.authenticated = false;
        state.auth.user = null;
        queueMicrotask(render);
      }
      throw error;
    }
    return payload.data;
  }

  function goalPlaceholder(goal) {
    const keyword = (goal.keywords || [])[0] || "行业、区域或公司";
    return `输入${keyword}关键词`;
  }

  function mapCompanyFromApi(item) {
    if (!item) return null;
    return {
      id: item.id,
      name: item.name,
      initial: item.initial || item.name?.slice(0, 1) || "企",
      location: item.location || "",
      industry: item.industry || "企业",
      tags: item.tags || [item.industry, item.location].filter(Boolean),
      status: item.status,
      progress: item.progress,
      evidence: item.evidence,
      progressLevel: item.progress_level || progressLevelFromStatus(item.status),
      updatedAt: formatTime(item.updated_at, item.updatedAt || "尚未更新"),
      updates: item.updates || [],
      library: item.library || [],
      qaAnswer: item.qaAnswer || "",
    };
  }

  function mapDossierFromApi(item, options = {}) {
    return {
      id: item.id,
      title: item.title,
      summary: item.summary || "",
      body: "",
      bodyParagraphs: (Array.isArray(item.body) ? item.body : []).map((paragraph) => ({
        text: paragraph.text,
        citationIds: paragraph.citation_ids || [],
        segments: (paragraph.segments || []).map((segment) => ({
          text: segment.text || "",
          citationIds: segment.citation_ids || [],
        })),
      })),
      citations: (item.citations || []).map((source) => ({
        id: source.id,
        label: source.label,
        kind: source.source_kind,
        url: isPlaceholderUrl(source.url) ? "" : source.url || "",
        summary: source.summary || source.excerpt || "",
        siteName: source.site_name || "",
        publishedAt: source.published_at || null,
      })),
      versionNo: Number(item.version_no || 1),
      previousDossierId: item.previous_dossier_id || null,
      changeStatus: item.change_status || "initial",
      dataAsOf: item.data_as_of ?? null,
      generatedAt: item.generated_at || item.created_at || null,
      date: formatTime(item.generated_at || item.created_at, item.date || ""),
      detailLoadError: Boolean(options.detailLoadError),
    };
  }

  function mapMaterialFromApi(item) {
    return {
      id: item.id,
      title: item.title,
      summary: item.summary || "",
      time: formatTime(item.updated_at, ""),
      sourceType: inferMaterialType(item.title, item.source_type),
    };
  }

  function mapQaMessage(message) {
    const citationEntries = (message.citations || [])
      .map((item) => (typeof item === "string"
        ? { id: "", label: item }
        : { id: String(item.id || ""), label: item.label || "" }))
      .filter((item) => item.label);
    return {
      role: message.role,
      text: message.text,
      paragraphs: (message.paragraphs || [])
        .map((paragraph) => ({
          text: paragraph.text || "",
          citationIds: (paragraph.citation_ids || paragraph.citationIds || []).map(String),
        }))
        .filter((paragraph) => paragraph.text),
      citations: citationEntries.map((item) => item.label),
      citationEntries,
    };
  }

  function apiErrorMessage(_error, fallback) {
    return fallback || "操作没有完成，请稍后重试。";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function isPlaceholderUrl(value) {
    return /(^https?:\/\/)?(www\.)?example\.(com|test)\b/i.test(String(value || ""));
  }

  function splitDisplayParagraphs(value, maxLength = 180) {
    return splitReadableBlocks(value, maxLength);
  }

  function formatTime(value, fallback = "") {
    if (!value) return fallback;
    const text = String(value);
    const normalized = text
      .replace(" ", "T")
      .replace(/([+-]\d{2})$/, "$1:00");
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return fallback || text;
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).replace(/\//g, "-");
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function dossierJobForCompany(companyId) {
    return state.jobsByCompany[companyId] || null;
  }

  function isActiveJob(job) {
    return ["queued", "running"].includes(String(job?.status || ""));
  }

  function rememberDossierJob(job, companyId = job?.entity_id) {
    if (!job?.id || !companyId || job.job_type !== "sales_dossier_generation") return null;
    state.jobsByCompany[companyId] = job;
    return job;
  }

  function makeIdempotencyKey(action, entityId) {
    const random = window.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${action}:${entityId}:${random}`;
  }

  function dossierRequestStorageKey(companyId) {
    return `sales-workbench:dossier-request:${companyId}`;
  }

  function dossierRequestIdempotencyKey(companyId) {
    const storageKey = dossierRequestStorageKey(companyId);
    try {
      const existing = window.sessionStorage.getItem(storageKey);
      if (existing) return existing;
      const created = makeIdempotencyKey("dossier", companyId);
      window.sessionStorage.setItem(storageKey, created);
      return created;
    } catch {
      return makeIdempotencyKey("dossier", companyId);
    }
  }

  function clearDossierRequestIdempotencyKey(companyId) {
    try {
      window.sessionStorage.removeItem(dossierRequestStorageKey(companyId));
    } catch {
      // Storage can be unavailable in hardened browser contexts.
    }
  }

  async function loadLatestDossierJob(companyId) {
    if (!companyId) return null;
    const jobs = await api(`/jobs?job_type=sales_dossier_generation&entity_id=${encodeURIComponent(companyId)}&limit=1`);
    const latest = Array.isArray(jobs) ? jobs[0] || null : null;
    if (latest) {
      clearDossierRequestIdempotencyKey(companyId);
      rememberDossierJob(latest, companyId);
      if (isActiveJob(latest)) monitorDossierJob(latest, companyId);
    }
    return latest;
  }

  function stopJobMonitor(jobId) {
    const token = jobPollTokens.get(jobId);
    if (token) token.active = false;
    jobPollTokens.delete(jobId);
  }

  function monitorDossierJob(initialJob, companyId) {
    if (!initialJob?.id || !isActiveJob(initialJob) || jobPollTokens.has(initialJob.id)) return;
    const token = { active: true };
    jobPollTokens.set(initialJob.id, token);

    void (async () => {
      let job = initialJob;
      let failures = 0;
      try {
        while (token.active && isActiveJob(job)) {
          await wait(1200);
          if (!token.active) return;
          try {
            job = await api(`/jobs/${encodeURIComponent(job.id)}`);
            failures = 0;
          } catch (error) {
            failures += 1;
            if (failures < 5) continue;
            if (state.activeCompanyId === companyId) {
              state.notice = apiErrorMessage(error, "任务仍在后台执行，但暂时无法更新进度。");
              render();
            }
            return;
          }
          rememberDossierJob(job, companyId);
          if (state.activeCompanyId === companyId) render();
        }

        if (!token.active) return;
        if (job.status === "succeeded") {
          await hydrateCompany(companyId, { loadJob: false }).catch(() => null);
          if (state.activeCompanyId === companyId) {
            if (job.result?.dossier_id) state.selectedDossierId = job.result.dossier_id;
            state.notice = job.result?.action === "no_material_change"
              ? "证据未变化，保留当前版本"
              : job.result?.version_no
                ? `已生成档案 V${job.result.version_no}`
                : "已生成最新档案";
            render();
          }
          return;
        }
        if (state.activeCompanyId === companyId) {
          state.notice = job.status === "cancelled"
            ? "档案生成任务已取消"
            : "档案生成失败，可在此重试。";
          render();
        }
      } finally {
        if (jobPollTokens.get(initialJob.id) === token) jobPollTokens.delete(initialJob.id);
      }
    })();
  }

  function progressLevelFromStatus(status) {
    const text = String(status || "");
    if (/签约|成交|已确认|方案|推进/.test(text)) return 78;
    if (/需求确认/.test(text)) return 58;
    if (/初步|接触/.test(text)) return 34;
    if (/暂无|不足/.test(text)) return 12;
    if (/新商机/.test(text)) return 22;
    return 42;
  }

  function salesStatus(status) {
    const text = String(status || "");
    if (/签约|成交|归档|已成交/.test(text)) return "成交归档";
    if (/方案|报价|商务|推进/.test(text)) return "商务推进";
    if (/需求确认|需求/.test(text)) return "需求确认";
    if (/初步|接触/.test(text)) return "初步接触";
    return "新商机";
  }

  function conciseProgressText(item) {
    const status = salesStatus(item.status);
    const text = String(item.progress || "").replace(/\s+/g, " ").trim();
    if (text && text.length <= 28 && !/最近档案|企业情况|近期动态|销售判断|下一步建议|专业数据库|联网搜索|但|需要/.test(text)) {
      return text;
    }
    const fallback = {
      新商机: "已加入目标企业池，当前无历史资料，待生成最新档案。",
      初步接触: "已完成基础信息了解，尚未形成明确采购计划。",
      需求确认: "已识别数据安全与私有化部署需求，待确认预算和排期。",
      商务推进: "已进入方案沟通阶段，待确认商务条件和决策流程。",
      成交归档: "已完成合作归档，后续关注续约和扩展机会。",
    };
    return fallback[status] || "当前进度待补充。";
  }

  function goalStats(count) {
    return `${Number(count) || 0} 家企业`;
  }

  function sourceRank(source) {
    const text = `${source.kind || ""} ${source.label || ""}`;
    if (/专业数据|专业数据库|工商|招投标/.test(text)) return 0;
    if (/联网搜索|公开|新闻|公告|媒体|官网/.test(text)) return 1;
    return 2;
  }

  function displaySourceKind(kind) {
    return /专业数据|专业数据库|工商|招投标/.test(String(kind || ""))
      ? "专业数据集（DataPro）"
      : /联网搜索|公开|新闻|公告|媒体|官网/.test(String(kind || ""))
        ? "联网搜索"
        : kind || "来源";
  }

  function sourceSiteName(source) {
    if (source.siteName) return String(source.siteName).trim();
    try {
      return new URL(source.url).hostname.replace(/^www\./i, "");
    } catch {
      return "公开网页";
    }
  }

  function sourcePublishLabel(source) {
    const publishedAt = formatTime(source.publishedAt, "");
    return publishedAt ? `发布于 ${publishedAt}` : "未标注发布时间";
  }

  function professionalSourceDetails(source) {
    const knownFieldPattern = /^(?:公司名称|企业名称|统一社会信用代码|注册号|法定代表人|法人姓名|公司组织类型|企业类型|注册地址|成立日期|注册资本|实缴资本|经营状态|登记状态|经营范围|所属行业|参保人数|核准日期|营业期限|自身风险|关联风险|司法案件|涉诉关系|立案信息|开庭公告|法院公告|行政处罚|经营异常|失信被执行人|被执行人|知识产权|专利|商标|著作权|分支机构|股东|主要人员)$/;
    const details = [];
    const parts = String(source.summary || "")
      .split(/[;；]\s*/)
      .map((item) => item.trim())
      .filter(Boolean);
    for (const item of parts) {
      const match = item.match(/^([^:：]{1,28})[:：]\s*(.+)$/);
      const label = match?.[1]?.trim() || "";
      if (match && knownFieldPattern.test(label)) {
        details.push({ label, value: match[2].trim() });
      } else if (details.length) {
        details[details.length - 1].value += `；${item}`;
      } else {
        details.push({ label: "数据项", value: item });
      }
    }
    return details.map((item) => {
      const cleanValue = item.value.replace(/[（(]\s*$/, "").trim();
      return {
        ...item,
        value: /日期|时间/.test(item.label) ? formatTime(cleanValue, cleanValue) : cleanValue,
      };
    });
  }

  function inferMaterialType(title, explicitType = "") {
    const explicit = String(explicitType || "").trim();
    const identity = `${explicit} ${title || ""}`.toLowerCase();
    if (/feishu_(?:p2p|chat|search)|单聊|群聊|消息|会话|沟通|摘录/.test(identity)) {
      return "飞书会话";
    }
    if (/feishu_doc|云文档|文档|会议|纪要|方案|草案/.test(identity)) {
      return "云文档";
    }
    return "云文档";
  }

  function normalizeDossierDisplay(sources, paragraphs) {
    const orderedSources = [...sources]
      .map((source, index) => ({ ...source, oldId: String(source.id || index + 1) }))
      .sort((a, b) => sourceRank(a) - sourceRank(b));
    const idMap = new Map(orderedSources.map((source, index) => [source.oldId, String(index + 1)]));
    return {
      sources: orderedSources.map((source, index) => ({
        ...source,
        id: String(index + 1),
        kind: displaySourceKind(source.kind),
        oldId: undefined,
      })),
      paragraphs: paragraphs.map((paragraph) => ({
        ...paragraph,
        citationIds: (paragraph.citationIds || [])
          .map((id) => idMap.get(String(id)) || null)
          .filter(Boolean),
        segments: (paragraph.segments || []).map((segment) => ({
          ...segment,
          citationIds: (segment.citationIds || [])
            .map((id) => idMap.get(String(id)) || null)
            .filter(Boolean),
        })),
      })),
    };
  }

  function materialRecords(item) {
    return item.library || [];
  }

  function historicalDossierRecords(item) {
    return (item.updates || []).map((dossier) => ({
      id: dossier.id,
      title: dossier.title,
      time: dossier.date,
      sourceType: "档案",
      versionNo: dossier.versionNo || 1,
      isDossier: true,
    }));
  }

  async function loadSalesData() {
    const apiGoals = await api("/sales-goals");
    const enriched = [];
    for (const goal of apiGoals) {
      const targets = await api(`/sales-goals/${encodeURIComponent(goal.id)}/target-enterprises`);
      targets.forEach((item) => {
        const mapped = mapCompanyFromApi(item);
        if (mapped) companies[mapped.id] = { ...(companies[mapped.id] || {}), ...mapped };
      });
      enriched.push({
        id: goal.id,
        name: goal.name,
        stats: goalStats(targets.length),
        placeholder: goalPlaceholder(goal),
        related: [],
        pool: targets.map((item) => item.id),
      });
    }
    if (enriched.length) goals = enriched;
    if (!goals.some((goal) => goal.id === state.activeGoalId)) state.activeGoalId = goals[0]?.id || "";
    await hydrateVisibleCompany();
  }

  async function loadGoalCompanies(goalId, query = "") {
    const goal = goals.find((item) => item.id === goalId);
    if (!goal) return;
    const normalizedQuery = query.trim();
    const [targets, candidates] = await Promise.all([
      api(`/sales-goals/${encodeURIComponent(goalId)}/target-enterprises`),
      normalizedQuery
        ? api(`/sales-goals/${encodeURIComponent(goalId)}/company-search`, { method: "POST", body: { query: normalizedQuery } })
        : Promise.resolve([]),
    ]);
    [...targets, ...candidates].forEach((item) => {
      const mapped = mapCompanyFromApi(item);
      if (mapped) companies[mapped.id] = { ...(companies[mapped.id] || {}), ...mapped };
    });
    goal.pool = targets.map((item) => item.id);
    goal.related = candidates.map((item) => item.id);
    goal.stats = goalStats(goal.pool.length);
  }

  async function loadDossierDetail(record, attempts = 3) {
    let lastError = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return mapDossierFromApi(await api(`/dossiers/${encodeURIComponent(record.id)}`));
      } catch (error) {
        lastError = error;
        if (attempt + 1 < attempts) await wait(350 * (attempt + 1));
      }
    }
    throw lastError;
  }

  async function hydrateCompany(companyId, options = {}) {
    if (!companyId) return null;
    const detail = await api(`/target-enterprises/${encodeURIComponent(companyId)}`);
    const mapped = mapCompanyFromApi(detail);
    if (!mapped) return null;
    const existingUpdates = companies[companyId]?.updates || [];
    let dossierDetailFailures = 0;
    const dossierDetails = await Promise.all((detail.dossiers || []).map(async (record) => {
      try {
        return await loadDossierDetail(record);
      } catch (error) {
        dossierDetailFailures += 1;
        return existingUpdates.find((item) => item.id === record.id && item.bodyParagraphs?.length)
          || mapDossierFromApi(record, { detailLoadError: true });
      }
    }));
    mapped.updates = dossierDetails;
    mapped.library = (detail.materials || []).map(mapMaterialFromApi);
    mapped.qaAnswer = detail.qa?.messages?.find((message) => message.role === "assistant")?.text || mapped.qaAnswer || "";
    companies[mapped.id] = { ...(companies[mapped.id] || {}), ...mapped };
    rememberCompanyQa(mapped.id, (detail.qa?.messages || qaMessagesForCompany(mapped)).map(mapQaMessage));
    if (state.activeCompanyId === mapped.id
      && (!state.selectedDossierId || !mapped.updates.some((item) => item.id === state.selectedDossierId))) {
      state.selectedDossierId = mapped.updates[0]?.id || "";
    }
    if (state.activeCompanyId === mapped.id && dossierDetailFailures) {
      state.notice = "部分档案详情暂时未加载，系统已自动重试；请稍后刷新页面。";
    }
    if (options.loadJob !== false) await loadLatestDossierJob(mapped.id).catch(() => null);
    return mapped;
  }

  async function hydrateVisibleCompany() {
    const current = visibleCompany();
    if (current?.id) await hydrateCompany(current.id).catch(() => null);
  }

  function activeGoal() {
    return goals.find((goal) => goal.id === state.activeGoalId) || goals[0] || {
      id: "",
      name: "",
      stats: "0 家企业",
      placeholder: "请先创建销售目标",
      related: [],
      pool: [],
    };
  }

  function company(id) {
    return companies[id] || null;
  }

  function visibleCompany() {
    const goal = activeGoal();
    if (!goal.pool.includes(state.activeCompanyId)) {
      state.activeCompanyId = goal.pool[0] || "";
    }
    return company(state.activeCompanyId);
  }

  function qaMessagesForCompany(item) {
    if (!item?.id) return [];
    if (!state.qaMessagesByCompany[item.id]) {
      state.qaMessagesByCompany[item.id] = [];
    }
    return state.qaMessagesByCompany[item.id];
  }

  function rememberCompanyQa(companyId, messages) {
    if (!companyId) return;
    state.qaMessagesByCompany[companyId] = messages || [];
    if (state.activeCompanyId === companyId) {
      state.qaMessages = state.qaMessagesByCompany[companyId];
    }
  }

  function activateCompanyQa(companyId) {
    const item = company(companyId);
    state.qaMessages = qaMessagesForCompany(item);
  }

  function activePool() {
    return activeGoal().pool
      .map(company)
      .filter(Boolean)
      .filter((item) => state.targetStatusFilter === "全部" || salesStatus(item.status) === state.targetStatusFilter);
  }

  function relatedCompanies() {
    const goal = activeGoal();
    const normalizedQuery = state.query.trim().toLowerCase();
    return goal.related
      .map(company)
      .filter(Boolean)
      .filter((item) => {
        if (!normalizedQuery) return true;
        return [item.name, item.industry, item.location].join(" ").toLowerCase().includes(normalizedQuery);
      });
  }

  function render() {
    if (state.auth.checked && state.auth.enabled && !state.auth.authenticated) {
      $("#app").innerHTML = renderAuthScreen();
      bindAuthEvents();
      return;
    }
    if (state.bootLoading || state.bootError) {
      $("#app").innerHTML = `
        <div class="sales-platform">
          ${renderTopbar()}
          <main class="connection-state" role="status">
            <h1>${state.bootLoading ? "正在连接销售工作台" : "销售工作台暂不可用"}</h1>
            <p>${escapeHtml(state.bootLoading ? "正在加载工作台数据。" : state.bootError)}</p>
            ${state.bootError ? `<button class="primary-button connection-retry" id="retryBoot" type="button">重新连接</button>` : ""}
          </main>
        </div>
      `;
      bindConnectionEvents();
      return;
    }
    const goal = activeGoal();
    const selected = visibleCompany();
    $("#app").innerHTML = `
      <div class="sales-platform">
        ${renderTopbar()}
        <main class="sales-layout ${state.mobileNavigationOpen ? "is-mobile-navigation-open" : ""}">
          ${renderSidebar(goal)}
          ${renderWorkspace(goal, selected)}
        </main>
        ${renderFeishuImportModal(selected)}
      </div>
    `;
    bindEvents();
  }

  function renderTopbar() {
    const user = state.auth.user;
    const displayName = user?.display_name || "本地用户";
    const avatar = String(displayName || "工").slice(0, 1).toUpperCase();
    return `
      <header class="sales-topbar">
        <div class="brand">
          <span class="brand-icon">客</span>
          <strong>销售智能工作台</strong>
        </div>
        <div class="topbar-right">
          ${state.auth.authenticated && !state.bootLoading ? `
            <button class="mobile-navigation-toggle" id="mobileNavigationToggle" type="button" aria-label="${state.mobileNavigationOpen ? "返回工作区" : "打开企业列表"}" title="${state.mobileNavigationOpen ? "返回工作区" : "打开企业列表"}">
              <span aria-hidden="true">${state.mobileNavigationOpen ? "×" : "☰"}</span>
            </button>
          ` : ""}
          <span class="user-avatar">${escapeHtml(avatar)}</span>
          <span class="user-name">${escapeHtml(displayName)}</span>
          ${state.auth.enabled ? `<button class="logout-button" id="logoutButton" type="button" aria-label="退出登录" title="退出登录"><span class="logout-label">退出</span><span class="logout-icon" aria-hidden="true">↪</span></button>` : ""}
        </div>
      </header>
    `;
  }

  function renderAuthScreen() {
    const bootstrap = state.auth.bootstrapRequired;
    const content = `
      <div class="auth-heading">
        <h1 id="authTitle">${bootstrap ? "设置本机管理员" : "登录工作台"}</h1>
        <p>${bootstrap ? "首次使用只需设置一个用户名和密码。" : "使用本机管理员账号继续。"}</p>
      </div>
      <form id="authForm" class="auth-form">
        <label>
          <span>用户名</span>
          <input name="username" autocomplete="username" minlength="2" maxlength="40" required placeholder="${bootstrap ? "设置用户名" : "输入用户名"}" />
        </label>
        <label>
          <span>密码</span>
          <input name="password" type="password" autocomplete="${bootstrap ? "new-password" : "current-password"}" minlength="10" maxlength="256" required placeholder="至少 10 个字符" />
        </label>
        ${state.authError ? `<p class="auth-error" role="alert">${escapeHtml(state.authError)}</p>` : ""}
        ${state.authNotice ? `<p class="auth-notice" role="status">${escapeHtml(state.authNotice)}</p>` : ""}
        <button class="auth-submit" type="submit" ${state.authBusy ? "disabled" : ""}>
          ${state.authBusy ? "请稍候..." : bootstrap ? "设置并进入工作台" : "登录"}
        </button>
      </form>
    `;
    return `
      <div class="auth-shell">
        <header class="auth-brand">
          <span class="brand-icon">客</span>
          <strong>销售智能工作台</strong>
        </header>
        <main class="auth-main">
          <section class="auth-panel" aria-labelledby="authTitle">
            ${content}
          </section>
        </main>
      </div>
    `;
  }

  function renderFeishuImportModal(item) {
    if (!state.feishuImportOpen || !item?.id) return "";
    const task = state.feishuImportTask;
    const active = ["queued", "running"].includes(task?.status);
    const completed = task?.status === "succeeded";
    const draft = state.feishuImportDraft;
    const conversation = state.feishuImportKind === "conversation";
    return `
      <div class="dialog-backdrop" id="feishuImportBackdrop">
        <section class="dialog-modal feishu-import-modal" role="dialog" aria-modal="true" aria-labelledby="feishuImportTitle">
          <header class="dialog-modal-header">
            <div>
              <h2 id="feishuImportTitle">导入飞书资料</h2>
              <p>${escapeHtml(item.name)}</p>
            </div>
            <button class="dialog-modal-close" id="closeFeishuImport" type="button" aria-label="关闭" title="关闭">×</button>
          </header>
          <form class="feishu-import-form" id="feishuImportForm">
            <div class="feishu-import-kind" role="group" aria-label="资料类型">
              <button class="${conversation ? "is-active" : ""}" data-feishu-kind="conversation" type="button">飞书会话</button>
              <button class="${!conversation ? "is-active" : ""}" data-feishu-kind="document" type="button">云文档</button>
            </div>
            <label>
              <span>${conversation ? "联系人姓名或会话 ID" : "飞书云文档链接"}</span>
              <input name="target" value="${escapeHtml(draft.target)}" maxlength="${conversation ? "200" : "1000"}" required
                ${conversation ? "" : `type="url" inputmode="url"`}
                placeholder="${conversation ? "输入联系人姓名或 oc_ 开头的会话 ID" : "粘贴完整的飞书云文档或知识库链接"}"
                ${active || state.feishuImportAvailable === false ? "disabled" : ""} />
              <small>${conversation
                ? "单聊可输入联系人姓名；群聊请输入 oc_ 开头的会话 ID。"
                : "仅支持以 https:// 开头的飞书或 Lark 云文档、知识库链接。"}</small>
            </label>
            ${conversation ? `
              <div class="feishu-import-dates">
                <label><span>开始时间</span><input name="start" type="datetime-local" value="${escapeHtml(draft.start)}" ${active ? "disabled" : ""} /></label>
                <label><span>结束时间</span><input name="end" type="datetime-local" value="${escapeHtml(draft.end)}" ${active ? "disabled" : ""} /></label>
              </div>
            ` : ""}
            ${state.feishuImportAvailable === false
              ? `<p class="feishu-import-status is-error">当前部署未启用飞书资料导入。</p>`
              : state.feishuImportError
                ? `<p class="feishu-import-status is-error" role="alert">${escapeHtml(state.feishuImportError)}</p>`
                : task
                  ? `<p class="feishu-import-status ${completed ? "is-success" : task.status === "failed" ? "is-error" : ""}" role="status">${escapeHtml(task.status === "failed" ? "资料导入没有完成，请检查输入后重试。" : task.summary || "正在处理")}</p>`
                  : ""}
            <div class="feishu-import-actions">
              <button class="secondary-button" id="cancelFeishuImport" type="button">关闭</button>
              <button class="primary-button" type="submit" ${active || state.feishuImportAvailable === false ? "disabled" : ""}>
                ${active ? "导入中" : task?.status === "failed" ? "重新导入" : "开始导入"}
              </button>
            </div>
          </form>
        </section>
      </div>
    `;
  }

  function renderSidebar(goal) {
    return `
      <aside class="sales-sidebar">
        ${renderPageNotice()}
        <section class="side-section">
          <div class="side-heading">
            <h2>销售目标</h2>
            <button class="text-action" id="toggleNewGoal" type="button" ${state.busy ? "disabled" : ""}>+ 新增销售目标</button>
          </div>
          <div class="goal-list">
            ${goals.map(renderGoalItem).join("")}
          </div>
          ${
            state.showNewGoal
              ? `<form class="new-goal" id="newGoalForm">
                  <input id="newGoalInput" placeholder="输入新的销售目标" />
                  <button type="submit" ${state.busy === "createGoal" ? "disabled" : ""}>
                    ${state.busy === "createGoal" ? "创建中" : "创建"}
                  </button>
                </form>`
              : ""
          }
        </section>

        <section class="side-section">
          <h2>查找企业</h2>
          <form class="company-search" id="companySearch">
            <input id="companyQuery" value="${escapeHtml(state.query)}" placeholder="${escapeHtml(goal.placeholder)}" ${state.busy === "search" || !goal.id ? "disabled" : ""} />
            <button type="submit" ${state.busy === "search" || !goal.id ? "disabled" : ""}>
              ${state.busy === "search" ? "搜索中" : "搜索"}
            </button>
          </form>
          ${!goal.id ? `<p class="side-tip">先创建销售目标，再查找并加入目标企业。</p>` : ""}
          ${state.sidebarNotice ? `<p class="side-tip">${escapeHtml(state.sidebarNotice)}</p>` : ""}
        </section>

        <section class="side-section">
          <h2>搜索结果</h2>
          <div class="company-list">
            ${renderSearchResults()}
          </div>
        </section>

        <section class="side-section">
          <div class="side-heading">
            <h2>目标企业池</h2>
          </div>
          ${renderTargetStatusFilters()}
          <div class="target-list">
            ${activePool().length ? activePool().map(renderTargetCompany).join("") : `<div class="empty">暂无目标企业</div>`}
          </div>
        </section>
      </aside>
    `;
  }

  function renderPageNotice() {
    if (state.bootLoading) return `<div class="page-notice">正在加载销售资料...</div>`;
    if (state.bootError) return `<div class="page-notice is-error">${escapeHtml(state.bootError)}</div>`;
    return "";
  }

  function renderSideLoading(text) {
    return `<div class="side-loading"><span></span>${escapeHtml(text)}</div>`;
  }

  function renderSearchResults() {
    if (state.busy === "search") return renderSideLoading("正在查找企业");
    if (!state.hasSearched) return `<div class="empty">输入关键词搜索后显示企业</div>`;
    const items = relatedCompanies();
    return items.length
      ? items.map(renderRelatedCompany).join("")
      : `<div class="empty">没有找到匹配企业</div>`;
  }

  function renderGoalItem(goal) {
    const active = goal.id === state.activeGoalId;
    return `
      <button class="goal-item ${active ? "is-active" : ""}" data-goal="${escapeHtml(goal.id)}" type="button">
        <span class="dot"></span>
        <span>
          <strong>${escapeHtml(goal.name)}</strong>
          <em>${escapeHtml(goal.stats)}</em>
        </span>
      </button>
    `;
  }

  function renderTargetStatusFilters() {
    return `
      <div class="filter-row target-status-filter" aria-label="目标企业状态筛选">
        ${TARGET_STATUS_FILTERS.map((status) => `
          <button class="${state.targetStatusFilter === status ? "is-active" : ""}" data-status-filter="${escapeHtml(status)}" type="button">
            ${escapeHtml(status)}
          </button>
        `).join("")}
      </div>
    `;
  }

  function renderRelatedCompany(item) {
    const goal = activeGoal();
    const inPool = goal.pool.includes(item.id);
    const adding = state.busy === `add:${item.id}`;
    return `
      <div class="related-row">
        <span class="company-token">${escapeHtml(item.initial)}</span>
        <span class="company-meta">
          <strong>${escapeHtml(item.name)}</strong>
          <em>${escapeHtml(item.industry)} · ${escapeHtml(item.location)}</em>
        </span>
        <button class="link-action" data-add="${escapeHtml(item.id)}" type="button" ${inPool || adding || state.busy ? "disabled" : ""}>
          ${adding ? "加入中" : inPool ? "已加入" : "加入目标企业池"}
        </button>
      </div>
    `;
  }

  function renderTargetCompany(item) {
    const selected = item.id === state.activeCompanyId;
    return `
      <button class="target-row ${selected ? "is-selected" : ""}" data-company="${escapeHtml(item.id)}" type="button">
        <span class="company-token">${escapeHtml(item.initial)}</span>
        <span class="company-meta">
          <strong>${escapeHtml(item.name)}</strong>
          <span class="mini-progress"><i style="width:${Math.max(8, Math.min(100, Number(item.progressLevel || progressLevelFromStatus(item.status))))}%"></i></span>
        </span>
        <span class="status-pill">${escapeHtml(salesStatus(item.status))}</span>
      </button>
    `;
  }

  function renderWorkspace(goal, item) {
    if (!item) {
      return `
        <section class="workspace empty-workspace">
          <div class="workspace-empty-message">
            <h1>选择一个目标企业</h1>
            <p>先在左侧查找公司并加入目标企业池。</p>
            <button class="primary-button mobile-navigation-empty-action" id="emptyOpenMobileNavigation" type="button">打开企业列表</button>
          </div>
        </section>
      `;
    }

    return `
      <section class="workspace">
        ${renderCompanyHeader(goal, item)}
        ${renderProgress(item)}
        ${renderRecentDossier(item)}
        ${renderSupportArea(item)}
      </section>
    `;
  }

  function renderCompanyHeader(goal, item) {
    const job = dossierJobForCompany(item.id);
    return `
      <div class="company-header">
        <div class="company-title">
          <span class="company-logo">${escapeHtml(item.initial)}</span>
          <div>
            <h1>${escapeHtml(item.name)}</h1>
            <p>目标企业 · ${escapeHtml(goal.name)}</p>
            <div class="chip-row">
              ${(item.tags || [item.industry, item.location]).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
            </div>
          </div>
        </div>
        <div class="header-actions">
          ${renderDossierJobControl(job)}
          <em class="${state.notice ? "is-notice" : ""}">${state.notice ? escapeHtml(state.notice) : `更新于：${escapeHtml(item.updatedAt || "尚未更新")}`}</em>
        </div>
      </div>
    `;
  }

  function compactDossierStageLabel(job) {
    const detailMessage = String(job?.stage_detail?.message || "").replace(/\s+/g, " ").trim();
    if (detailMessage) return detailMessage;
    const labels = {
      queued: "正在准备档案",
      retry_wait: "正在等待自动重试",
      starting: "正在准备档案",
      collecting_evidence: "正在查找资料",
      collecting_professional: "正在核验专业资料",
      collecting_public: "正在检索公开资料",
      building_evidence: "正在整理可信资料",
      validating_evidence: "正在核验资料",
      generating_dossier: "正在整理档案",
      validating_dossier: "正在核验档案",
      persisting_result: "正在保存结果",
      cancelling: "正在取消",
    };
    return labels[job?.stage] || "正在生成档案";
  }

  function renderDossierJobControl(job) {
    if (!job || job.status === "succeeded") {
      return `
        <button class="primary-button" id="refreshCompany" type="button" ${state.busy ? "disabled" : ""}>
          ${state.busy === "refresh" ? "正在提交" : "获取最新档案"}
        </button>
      `;
    }

    const active = isActiveJob(job);
    const retry = !active && job.retryable
      ? `<button class="primary-button dossier-job-retry" data-retry-dossier-job="${escapeHtml(job.id)}" type="button" ${state.busy ? "disabled" : ""}>${job.status === "cancelled" ? "重新生成档案" : "生成失败，重试"}</button>`
      : "";
    const cancel = active && job.stage !== "cancelling"
      ? `<button class="job-inline-action" data-cancel-dossier-job="${escapeHtml(job.id)}" type="button">取消</button>`
      : "";

    if (!active) {
      return retry || `
        <button class="primary-button" id="refreshCompany" type="button" ${state.busy ? "disabled" : ""}>
          重新生成档案
        </button>
      `;
    }

    return `
      <div class="dossier-job-control" role="status" aria-live="polite">
        <button class="primary-button dossier-job-running" type="button" disabled>
          <span class="dossier-job-spinner" aria-hidden="true"></span>
          <span>${escapeHtml(compactDossierStageLabel(job))}</span>
          <span class="dossier-job-flow" aria-hidden="true"></span>
        </button>
        ${cancel}
      </div>
    `;
  }

  function renderProgress(item) {
    return `
      <div class="progress-card">
        <div>
          <h2>当前进度</h2>
          <span class="progress-status">${escapeHtml(salesStatus(item.status))}</span>
        </div>
        <p>${escapeHtml(conciseProgressText(item))}</p>
      </div>
    `;
  }

  function renderRecentDossier(item) {
    const updates = item.updates || [];
    const selected = selectedDossier(updates);
    return `
      <section class="recent-section">
        <div class="section-title">
          <h2>最近档案</h2>
          ${updates.length ? `
            <div class="version-tabs" aria-label="档案版本">
              ${updates.map((update, index) => `
                <button class="${update.id === selected?.id ? "is-active" : ""}" data-dossier="${escapeHtml(update.id)}" type="button">
                  V${escapeHtml(update.versionNo || Math.max(1, updates.length - index))}
                </button>
              `).join("")}
            </div>
          ` : ""}
        </div>
        ${selected ? renderDossierDetail(selected) : `<div class="empty large">暂无最近档案。</div>`}
      </section>
    `;
  }

  function renderSupportArea(item) {
    const libraryActive = state.supportView !== "qa";
    return `
      <section class="support-grid">
        <div class="support-tabs" role="tablist" aria-label="企业资料与问答">
          <button
            id="supportTabLibrary"
            class="${libraryActive ? "is-active" : ""}"
            data-support-view="library"
            type="button"
            role="tab"
            aria-selected="${libraryActive}"
            aria-controls="supportLibraryPanel"
          >历史资料</button>
          <button
            id="supportTabQa"
            class="${libraryActive ? "" : "is-active"}"
            data-support-view="qa"
            type="button"
            role="tab"
            aria-selected="${!libraryActive}"
            aria-controls="supportQaPanel"
          >资料问答</button>
        </div>
        <div
          id="supportLibraryPanel"
          class="support-tab-panel"
          role="tabpanel"
          aria-labelledby="supportTabLibrary"
          ${libraryActive ? "" : "hidden"}
        >
          ${renderLibrary(item)}
        </div>
        <div
          id="supportQaPanel"
          class="support-tab-panel"
          role="tabpanel"
          aria-labelledby="supportTabQa"
          ${libraryActive ? "hidden" : ""}
        >
          ${renderQa(item)}
        </div>
      </section>
    `;
  }

  function selectedDossier(updates) {
    if (!updates.length) return null;
    return updates.find((update) => update.id === state.selectedDossierId) || updates[0];
  }

  function dossierSources(update) {
    if (!update) return [];
    if (update.citations?.length) return update.citations;
    return [];
  }

  function renderDossierDetail(update) {
    if (!update) return "";
    const sources = dossierSources(update);
    const rawParagraphs = update.bodyParagraphs?.length
      ? update.bodyParagraphs
      : update.body
        ? [{ text: update.body, citationIds: [] }]
        : [];
    const { sources: orderedSources, paragraphs } = normalizeDossierDisplay(sources, rawParagraphs);
    return `
      <article class="dossier-detail">
        <div class="detail-head">
          <span>档案详情 · V${escapeHtml(update.versionNo || 1)}</span>
          <span class="detail-meta">
            <em>${escapeHtml(update.date)}</em>
          </span>
        </div>
        <h2>${escapeHtml(update.title)}</h2>
        <p class="dossier-timing">资料截至 ${escapeHtml(formatTime(update.dataAsOf, "未知"))} · 生成于 ${escapeHtml(formatTime(update.generatedAt, update.date || "未知"))}</p>
        <div class="dossier-body">
          ${paragraphs.length
            ? paragraphs.map(renderDossierParagraph).join("")
            : `<div class="inline-empty">${update.detailLoadError
              ? "档案详情暂时无法加载，请稍后刷新页面重试。系统不会用摘要冒充正文。"
              : "档案正文暂未加载，请稍后重新打开该企业。"}</div>`}
        </div>
        <div class="citation-block">
          <div class="citation-block-head">
            <strong>资料来源</strong>
            <span>正文中的编号对应下列来源</span>
          </div>
          ${orderedSources.length
            ? renderCitationGroups(orderedSources)
            : `<span class="citation-plain">${update.detailLoadError ? "档案详情尚未加载，暂不能展示引用。" : "暂无可验证的引用来源。"}</span>`}
        </div>
      </article>
    `;
  }

  function renderDossierParagraph(paragraph) {
    const raw = String(paragraph.text || "");
    const sectionMatch = raw.match(/^([^：:\n]{1,24})[：:]\s*([\s\S]*)$/);
    const heading = normalizeChineseTypography(sectionMatch?.[1] || "");
    const content = sectionMatch?.[2] || raw;
    const renderTextWithCitations = (text, citationIds) => {
      const citations = (citationIds || [])
        .map((id) => `<sup>[${escapeHtml(id)}]</sup>`)
        .join("");
      const displayParagraphs = splitDisplayParagraphs(text);
      return displayParagraphs.map((displayText, index) => {
        const references = index === displayParagraphs.length - 1 && citations ? ` ${citations}` : "";
        return `<p>${escapeHtml(displayText)}${references}</p>`;
      }).join("");
    };
    const paragraphHtml = paragraph.segments?.length
      ? paragraph.segments
        .map((segment) => renderTextWithCitations(segment.text, segment.citationIds))
        .join("")
      : renderTextWithCitations(content, paragraph.citationIds);
    if (DOSSIER_SECTION_TITLES.includes(heading)) {
      return `
        <section class="dossier-report-section">
          <h3>${escapeHtml(heading)}</h3>
          <div class="dossier-report-content">
            ${paragraphHtml}
          </div>
        </section>
      `;
    }
    return paragraphHtml;
  }

  function renderCitationGroups(sources) {
    const groups = [
      {
        kind: "professional",
        title: "专业数据集（DataPro）",
        items: sources.filter((source) => displaySourceKind(source.kind) === "专业数据集（DataPro）"),
      },
      {
        kind: "web",
        title: "联网搜索",
        items: sources.filter((source) => displaySourceKind(source.kind) === "联网搜索"),
      },
    ].filter((group) => group.items.length);
    return groups.map((group) => `
      <section class="citation-group citation-group-${group.kind}">
        <div class="citation-group-head">
          <strong>${escapeHtml(group.title)}</strong>
          <span>${group.items.length} 条</span>
        </div>
        <div class="citation-list">
          ${group.items.map((source) => renderCitation(source, group.kind)).join("")}
        </div>
      </section>
    `).join("");
  }

  function renderCitation(source, groupKind) {
    const title = source.label || displaySourceKind(source.kind);
    if (groupKind === "professional") {
      const details = professionalSourceDetails(source);
      return `
        <div class="citation-source-row citation-source-professional">
          <b>[${escapeHtml(source.id)}]</b>
          <div>
            <strong>${escapeHtml(title)}</strong>
            ${details.length
              ? `<details class="professional-source-details">
                  <summary>查看数据明细</summary>
                  <dl>
                    ${details.map((item) => `
                      <div>
                        <dt>${escapeHtml(item.label)}</dt>
                        <dd>${escapeHtml(item.value)}</dd>
                      </div>
                    `).join("")}
                  </dl>
                </details>`
              : `<span>当前记录没有可展示的字段明细</span>`}
          </div>
        </div>
      `;
    }
    const siteName = sourceSiteName(source);
    const publishLabel = sourcePublishLabel(source);
    return `
      <div class="citation-source-row citation-source-web">
        <b>[${escapeHtml(source.id)}]</b>
        <div>
          ${source.url && !isPlaceholderUrl(source.url)
            ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(title)} ↗</a>`
            : `<strong>${escapeHtml(title)}</strong>`}
          <span>${escapeHtml(siteName)} · ${escapeHtml(publishLabel)}</span>
        </div>
      </div>
    `;
  }

  function renderLibrary(item) {
    const materialRows = materialRecords(item);
    const dossierRows = historicalDossierRecords(item);
    const allRecords = [...dossierRows, ...materialRows];
    const records = allRecords.filter((record) => {
      if (state.materialFilter === "全部") return true;
      if (state.materialFilter === "档案") return record.isDossier;
      if (record.isDossier) return false;
      return inferMaterialType(record.title, record.sourceType).includes(state.materialFilter);
    });
    return `
      <section class="library-panel">
        <div class="support-heading library-heading">
          <div class="library-heading-row">
            <h2>历史资料 <span>${allRecords.length}</span></h2>
          </div>
          <div class="library-control-row">
            <div class="filter-row material-filter" aria-label="历史资料筛选">
              ${MATERIAL_FILTERS.map((type) => `
                <button class="${state.materialFilter === type ? "is-active" : ""}" data-material-filter="${escapeHtml(type)}" type="button">
                  ${escapeHtml(type)}
                </button>
              `).join("")}
            </div>
            <div class="library-tools">
              <button class="secondary-button library-import-button" id="openFeishuImport" type="button" ${state.busy ? "disabled" : ""}>导入飞书资料</button>
            </div>
          </div>
        </div>
        ${
          records.length
            ? `<div class="library-table">
                <div class="library-head"><span>资料名称</span><span>来源</span><span>更新时间</span></div>
                ${records.map((record) => `
                  <div class="library-row">
                    ${record.isDossier
                      ? `<button class="library-dossier-link" data-dossier="${escapeHtml(record.id)}" type="button">${escapeHtml(record.title)}</button>`
                      : `<strong>${escapeHtml(record.title)}</strong>`}
                    <span>${record.isDossier ? `档案 V${escapeHtml(record.versionNo)}` : escapeHtml(inferMaterialType(record.title, record.sourceType))}</span>
                    <span>${escapeHtml(record.time)}</span>
                  </div>
                `).join("")}
              </div>`
            : `<div class="empty large">${state.materialFilter === "档案" ? "暂无历史档案。" : "暂无历史资料。"}</div>`
        }
      </section>
    `;
  }

  function renderQa(item) {
    const hasMaterials = materialRecords(item).length > 0;
    const messages = qaMessagesForCompany(item);
    const qaNote = hasMaterials
      ? "仅根据当前企业档案和用户导入的飞书资料回答。"
      : "当前企业暂无飞书资料；问答仅根据当前企业档案回答。";
    const qaPlaceholder = hasMaterials ? "询问历史沟通、当前进展或资料缺口" : "询问当前进展或资料缺口";
    return `
      <section class="qa-panel">
        <div class="support-heading">
          <h2>资料问答</h2>
        </div>
        <p class="qa-note">${escapeHtml(qaNote)}</p>
        <div class="chat-area" aria-live="polite">
          ${messages.length ? messages.map(renderMessage).join("") : `<div class="empty large">暂无历史问答。</div>`}
          ${state.busy === "qa" && state.qaPendingCompanyId === item.id
            ? `<article class="chat-message assistant is-pending" role="status"><span>正在检索档案与飞书资料</span></article>`
            : ""}
        </div>
        <form class="qa-input" id="qaForm">
          <input id="qaQuestion" placeholder="${escapeHtml(qaPlaceholder)}" ${state.busy === "qa" ? "disabled" : ""} />
          <button type="submit" ${state.busy === "qa" ? "disabled" : ""}>
            ${state.busy === "qa" ? "发送中" : "发送"}
          </button>
        </form>
      </section>
    `;
  }

  function renderMessage(message) {
    const rawCitationEntries = message.citationEntries?.length
      ? message.citationEntries
      : (message.citations || []).map((label) => ({ id: "", label }));
    const citationDisplay = dedupeCitationEntries(rawCitationEntries);
    const citationEntries = citationDisplay.entries;
    const citationNumbers = new Map(Object.entries(citationDisplay.citationNumbers));
    const paragraphs = collapseRepeatedCitationRuns(qaAnswerParagraphs(message));
    return `
      <article class="chat-message ${message.role}">
        ${message.role === "assistant"
          ? `<div class="qa-answer-body">${paragraphs.map((paragraph) => renderQaAnswerParagraph(paragraph, citationNumbers)).join("")}</div>`
          : `<p>${escapeHtml(message.text)}</p>`}
        ${citationEntries.length
          ? `<div class="citation-row">${citationEntries.map((item, index) => `<span><b>[${index + 1}]</b>${escapeHtml(item.label)}</span>`).join("")}</div>`
          : ""}
      </article>
    `;
  }

  function qaAnswerParagraphs(message) {
    const source = message.paragraphs?.length
      ? message.paragraphs
      : [{ text: message.text || "", citationIds: [] }];
    return source.flatMap((paragraph, citationGroup) => splitQaAnswerText(paragraph.text).map((text) => ({
      text,
      citationIds: paragraph.citationIds || [],
      citationGroup,
    })));
  }

  function splitQaAnswerText(value) {
    const normalized = normalizeChineseTypography(value);
    if (!normalized) return [];
    const afterSentence = new RegExp(`([。；！？])\\s*(?=(?:${QA_SECTION_HEADING_SOURCE})[：:])`, "g");
    const afterWhitespace = new RegExp(`[ \\t\\n]+(?=(?:${QA_SECTION_HEADING_SOURCE})[：:])`, "g");
    const structured = normalized
      .replace(afterSentence, "$1\n\n")
      .replace(afterWhitespace, "\n\n");
    return splitReadableBlocks(structured, 220);
  }

  function renderQaAnswerParagraph(paragraph, citationNumbers) {
    const match = paragraph.text.match(QA_SECTION_HEADING_PATTERN);
    const heading = match?.[1] || "";
    const body = match?.[2] || paragraph.text;
    const references = [...new Set(
      (paragraph.displayCitationIds || [])
        .map((id) => citationNumbers.get(String(id)))
        .filter(Boolean),
    )];
    return `
      <section class="qa-answer-paragraph">
        ${heading ? `<h3>${escapeHtml(heading)}</h3>` : ""}
        <p>${escapeHtml(body).replace(/\n/g, "<br>")}${references.length ? `<span class="qa-citation-anchor">&#8288;<sup class="qa-answer-refs">${references.map((number) => `<span>[${number}]</span>`).join("")}</sup></span>` : ""}</p>
      </section>
    `;
  }

  function scrollQaToBottom() {
    queueMicrotask(() => {
      const chatArea = $(".chat-area");
      if (chatArea) chatArea.scrollTop = chatArea.scrollHeight;
    });
  }

  function bindConnectionEvents() {
    $("#retryBoot")?.addEventListener("click", () => {
      if (state.bootLoading) return;
      boot();
    });
  }

  function bindAuthEvents() {
    $("#authForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (state.authBusy) return;
      const form = new FormData(event.currentTarget);
      const bootstrap = state.auth.bootstrapRequired;
      const body = {
        username: String(form.get("username") || "").trim(),
        password: String(form.get("password") || ""),
      };
      state.authBusy = bootstrap ? "bootstrap" : "login";
      state.authError = "";
      state.authNotice = "";
      render();
      try {
        const result = await api(bootstrap ? "/auth/bootstrap" : "/auth/login", {
          method: "POST",
          body,
          skipAuthRedirect: true,
        });
        state.auth.checked = true;
        state.auth.enabled = true;
        state.auth.authenticated = true;
        state.auth.bootstrapRequired = false;
        state.auth.user = result.user || null;
        state.authBusy = "";
        await boot();
      } catch (error) {
        state.authBusy = "";
        state.authError = apiErrorMessage(error, bootstrap ? "管理员设置失败，请重试。" : "登录失败，请检查用户名和密码。");
        render();
      }
    });
  }

  function closeFeishuImport() {
    state.feishuImportOpen = false;
    state.feishuImportError = "";
    render();
  }

  async function monitorFeishuImport(initialTask, companyId) {
    const token = ++feishuImportPollToken;
    let task = initialTask;
    try {
      while (token === feishuImportPollToken && ["queued", "running"].includes(task?.status)) {
        await wait(900);
        if (token !== feishuImportPollToken) return;
        task = await api(`/target-enterprises/${encodeURIComponent(companyId)}/materials/feishu-import/${encodeURIComponent(task.id)}`);
        state.feishuImportTask = task;
        render();
      }
      if (token !== feishuImportPollToken || !task) return;
      if (task.status === "succeeded") {
        await hydrateCompany(companyId, { loadJob: false });
        state.notice = "飞书资料已导入";
        state.materialFilter = task.source_kind === "document" ? "云文档" : "飞书会话";
      } else {
        state.feishuImportError = "飞书资料导入没有完成，请检查输入后重试。";
      }
    } catch (error) {
      if (token !== feishuImportPollToken) return;
      state.feishuImportError = apiErrorMessage(error, "暂时无法获取飞书资料导入进度。");
    }
    render();
  }

  function bindEvents() {
    const setMobileNavigation = (open) => {
      state.mobileNavigationOpen = Boolean(open);
      render();
    };
    $("#mobileNavigationToggle")?.addEventListener("click", () => {
      setMobileNavigation(!state.mobileNavigationOpen);
    });
    $("#emptyOpenMobileNavigation")?.addEventListener("click", () => {
      setMobileNavigation(true);
    });
    $("#openFeishuImport")?.addEventListener("click", async () => {
      const current = visibleCompany();
      if (!current?.id) return;
      state.feishuImportOpen = true;
      state.feishuImportAvailable = null;
      state.feishuImportError = "";
      if (!["queued", "running"].includes(state.feishuImportTask?.status)) {
        state.feishuImportTask = null;
      }
      render();
      try {
        const status = await api("/feishu-import/status");
        state.feishuImportAvailable = Boolean(status.available);
      } catch (error) {
        state.feishuImportAvailable = false;
        state.feishuImportError = apiErrorMessage(error, "暂时无法确认飞书资料导入状态。");
      }
      render();
    });
    $("#closeFeishuImport")?.addEventListener("click", closeFeishuImport);
    $("#cancelFeishuImport")?.addEventListener("click", closeFeishuImport);
    $("#feishuImportBackdrop")?.addEventListener("click", (event) => {
      if (event.target.id === "feishuImportBackdrop") closeFeishuImport();
    });
    $$("[data-feishu-kind]").forEach((button) => {
      button.addEventListener("click", () => {
        if (["queued", "running"].includes(state.feishuImportTask?.status)) return;
        state.feishuImportKind = button.dataset.feishuKind;
        state.feishuImportDraft = { target: "", start: "", end: "" };
        state.feishuImportTask = null;
        state.feishuImportError = "";
        render();
      });
    });
    $("#feishuImportForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const current = visibleCompany();
      if (!current?.id || ["queued", "running"].includes(state.feishuImportTask?.status)) return;
      const form = new FormData(event.currentTarget);
      state.feishuImportDraft = {
        target: String(form.get("target") || "").trim(),
        start: String(form.get("start") || ""),
        end: String(form.get("end") || ""),
      };
      state.feishuImportError = "";
      if (state.feishuImportKind === "conversation"
        && /^ou_[A-Za-z0-9_-]+$/i.test(state.feishuImportDraft.target)) {
        state.feishuImportError = "飞书会话请填写联系人姓名或 oc_ 开头的会话 ID，不支持 Open ID。";
        render();
        return;
      }
      if (state.feishuImportKind === "document"
        && !/^https:\/\/\S+$/i.test(state.feishuImportDraft.target)) {
        state.feishuImportError = "请粘贴完整的 https:// 飞书云文档链接。";
        render();
        return;
      }
      state.feishuImportTask = {
        status: "queued",
        summary: "正在创建导入任务。",
        source_kind: state.feishuImportKind,
      };
      render();
      try {
        const task = await api(`/target-enterprises/${encodeURIComponent(current.id)}/materials/feishu-import`, {
          method: "POST",
          body: {
            source_kind: state.feishuImportKind,
            target: state.feishuImportDraft.target,
            start: state.feishuImportDraft.start,
            end: state.feishuImportDraft.end,
          },
        });
        state.feishuImportTask = task;
        render();
        monitorFeishuImport(task, current.id);
      } catch (error) {
        state.feishuImportTask = null;
        state.feishuImportError = apiErrorMessage(error, "飞书资料导入任务创建失败。");
        render();
      }
    });
    $("#logoutButton")?.addEventListener("click", async () => {
      if (state.authBusy) return;
      state.authBusy = "logout";
      try {
        await api("/auth/logout", { method: "POST", skipAuthRedirect: true });
      } catch {
        // Local session is cleared by the server whenever it can be reached.
      }
      resetConnectedState();
      state.auth = {
        checked: true,
        enabled: true,
        authenticated: false,
        bootstrapRequired: false,
        user: null,
      };
      state.authBusy = "";
      state.authError = "";
      state.authNotice = "";
      render();
    });
    $("#toggleNewGoal")?.addEventListener("click", () => {
      if (state.busy) return;
      state.showNewGoal = !state.showNewGoal;
      render();
    });

    $("#newGoalForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (state.busy) return;
      const name = $("#newGoalInput").value.trim();
      if (!name) return;
      state.busy = "createGoal";
      state.notice = "";
      state.sidebarNotice = "";
      render();
      try {
        const created = await api("/sales-goals", { method: "POST", body: { name } });
        goals.unshift({
          id: created.id,
          name: created.name,
          stats: goalStats(0),
          placeholder: goalPlaceholder(created),
          related: [],
          pool: [],
        });
        state.activeGoalId = created.id;
        state.activeCompanyId = "";
        state.showNewGoal = false;
        state.notice = "已新增销售目标";
      } catch (error) {
        state.showNewGoal = false;
        state.sidebarNotice = apiErrorMessage(error, "暂时没能创建销售目标，请稍后再试。");
      } finally {
        state.busy = "";
      }
      render();
    });

    $$("[data-goal]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (state.busy) return;
        state.activeGoalId = button.dataset.goal;
        state.activeCompanyId = "";
        state.targetStatusFilter = "全部";
        state.materialFilter = "全部";
        state.query = "";
        state.hasSearched = false;
        state.notice = "";
        state.sidebarNotice = "";
        state.busy = `goal:${state.activeGoalId}`;
        render();
        try {
          await loadGoalCompanies(state.activeGoalId);
          await hydrateVisibleCompany();
        } catch {
          state.sidebarNotice = "暂时没能加载这个销售目标，请稍后再试。";
        } finally {
          state.busy = "";
        }
        render();
      });
    });

    $("#companySearch")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (state.busy) return;
      state.query = $("#companyQuery").value.trim();
      state.hasSearched = Boolean(state.query);
      if (!state.query) {
        const goal = activeGoal();
        goal.related = [];
        state.sidebarNotice = "请输入行业、区域或企业关键词后搜索。";
        render();
        return;
      }
      state.busy = "search";
      state.sidebarNotice = "";
      state.notice = "";
      render();
      try {
        await loadGoalCompanies(state.activeGoalId, state.query);
        state.sidebarNotice = state.query ? "已更新相关公司" : "";
      } catch {
        state.sidebarNotice = "暂时没能查到相关公司，可以换个关键词再试。";
      } finally {
        state.busy = "";
      }
      render();
    });

    $$("[data-add]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (state.busy) return;
        const goal = activeGoal();
        const id = button.dataset.add;
        state.busy = `add:${id}`;
        state.sidebarNotice = "";
        state.notice = "";
        render();
        try {
          const detail = await api(`/sales-goals/${encodeURIComponent(goal.id)}/target-enterprises`, { method: "POST", body: { company_id: id } });
          const mapped = mapCompanyFromApi(detail);
          if (mapped) companies[mapped.id] = { ...(companies[mapped.id] || {}), ...mapped };
          if (!goal.pool.includes(id)) goal.pool.push(id);
          goal.stats = goalStats(goal.pool.length);
          state.activeCompanyId = id;
          state.mobileNavigationOpen = false;
          await hydrateCompany(id);
          state.notice = "已加入目标企业池";
        } catch {
          state.sidebarNotice = "暂时没能加入目标企业池，请稍后再试。";
        } finally {
          state.busy = "";
        }
        render();
      });
    });

    $$("[data-company]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (state.busy) return;
        state.activeCompanyId = button.dataset.company;
        state.mobileNavigationOpen = false;
        state.materialFilter = "全部";
        activateCompanyQa(state.activeCompanyId);
        state.selectedDossierId = company(state.activeCompanyId)?.updates?.[0]?.id || "";
        state.notice = "";
        state.sidebarNotice = "";
        state.busy = `company:${state.activeCompanyId}`;
        render();
        try {
          await hydrateCompany(state.activeCompanyId);
        } catch {
          state.notice = "暂时没能刷新企业资料，已保留当前档案。";
        } finally {
          state.busy = "";
        }
        render();
      });
    });

    $$('[data-dossier]').forEach((button) => {
      button.addEventListener("click", () => {
        if (state.busy) return;
        state.selectedDossierId = button.dataset.dossier;
        render();
      });
    });

    $$("[data-status-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        if (state.busy) return;
        state.targetStatusFilter = button.dataset.statusFilter;
        const pool = activePool();
        if (pool.length && !pool.some((item) => item.id === state.activeCompanyId)) {
          state.activeCompanyId = pool[0].id;
          state.selectedDossierId = company(state.activeCompanyId)?.updates?.[0]?.id || "";
        }
        render();
      });
    });

    $$("[data-material-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        if (state.busy) return;
        state.materialFilter = button.dataset.materialFilter;
        render();
      });
    });

    $$("[data-support-view]").forEach((button) => {
      button.addEventListener("click", () => {
        const nextView = button.dataset.supportView;
        if (!["library", "qa"].includes(nextView) || state.supportView === nextView) return;
        state.supportView = nextView;
        render();
        if (nextView === "qa") scrollQaToBottom();
      });
    });

    $("#refreshCompany")?.addEventListener("click", async () => {
      if (state.busy) return;
      const current = visibleCompany();
      if (isActiveJob(dossierJobForCompany(current?.id))) return;
      state.busy = "refresh";
      state.notice = "";
      render();
      try {
        if (current?.id) {
          const created = await api(`/target-enterprises/${encodeURIComponent(current.id)}/dossiers`, {
            method: "POST",
            body: { idempotency_key: dossierRequestIdempotencyKey(current.id) },
          });
          clearDossierRequestIdempotencyKey(current.id);
          if (created?.job_type === "sales_dossier_generation" && created?.id) {
            rememberDossierJob(created, current.id);
            state.notice = "任务已提交，可继续浏览其他企业。";
            state.busy = "";
            render();
            monitorDossierJob(created, current.id);
            return;
          }
          state.selectedDossierId = created?.record?.id || created?.detail?.id || state.selectedDossierId;
          await hydrateCompany(current.id);
          const version = created?.record?.version_no || created?.detail?.version_no;
          state.notice = created?.action === "no_material_change"
            ? "证据未变化，保留当前版本"
            : version ? `已生成档案 V${version}` : "已生成最新档案";
        }
      } catch (error) {
        state.notice = apiErrorMessage(error, "暂时没能获取最新档案，已保留当前档案。");
      } finally {
        state.busy = "";
        render();
      }
    });

    $$('[data-cancel-dossier-job]').forEach((button) => {
      button.addEventListener("click", async () => {
        if (state.busy) return;
        const current = visibleCompany();
        const jobId = button.dataset.cancelDossierJob;
        if (!current?.id || !jobId) return;
        state.busy = `cancel-job:${jobId}`;
        render();
        try {
          const job = await api(`/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
          rememberDossierJob(job, current.id);
          if (isActiveJob(job)) {
            state.notice = "正在等待当前步骤安全结束后取消";
            monitorDossierJob(job, current.id);
          } else {
            stopJobMonitor(jobId);
            state.notice = "档案生成任务已取消";
          }
        } catch (error) {
          state.notice = apiErrorMessage(error, "暂时无法取消任务，请稍后重试。");
        } finally {
          state.busy = "";
          render();
        }
      });
    });

    $$('[data-retry-dossier-job]').forEach((button) => {
      button.addEventListener("click", async () => {
        if (state.busy) return;
        const current = visibleCompany();
        const jobId = button.dataset.retryDossierJob;
        if (!current?.id || !jobId) return;
        state.busy = `retry-job:${jobId}`;
        state.notice = "";
        render();
        try {
          const job = await api(`/jobs/${encodeURIComponent(jobId)}/retry`, { method: "POST" });
          rememberDossierJob(job, current.id);
          state.notice = "任务已重新提交";
          state.busy = "";
          render();
          monitorDossierJob(job, current.id);
          return;
        } catch (error) {
          state.notice = apiErrorMessage(error, "暂时无法重试任务，请稍后再试。");
        } finally {
          state.busy = "";
          render();
        }
      });
    });

    $("#qaForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (state.busy) return;
      const question = $("#qaQuestion").value.trim();
      if (!question) return;
      const current = visibleCompany();
      if (!current?.id) return;
      const pendingMessages = [
        ...qaMessagesForCompany(current),
        { role: "user", text: question },
      ];
      rememberCompanyQa(current.id, pendingMessages);
      state.busy = "qa";
      state.qaPendingCompanyId = current.id;
      state.notice = "";
      render();
      scrollQaToBottom();
      try {
        const result = await api(`/target-enterprises/${encodeURIComponent(current.id)}/qa`, { method: "POST", body: { question } });
        const resolvedMessages = (result.messages || []).map(mapQaMessage);
        const includesSubmittedQuestion = resolvedMessages.some(
          (message) => message.role === "user" && message.text === question,
        );
        rememberCompanyQa(
          current.id,
          resolvedMessages.length
            ? (includesSubmittedQuestion ? resolvedMessages : [...pendingMessages, ...resolvedMessages])
            : pendingMessages,
        );
      } catch (error) {
        state.notice = apiErrorMessage(error, "问答服务暂不可用，本次问题没有生成回答。");
      } finally {
        state.busy = "";
        state.qaPendingCompanyId = "";
      }
      render();
      scrollQaToBottom();
    });
  }

  async function boot() {
    const generation = ++bootGeneration;
    state.bootLoading = true;
    state.bootError = "";
    render();
    let settled = false;
    const loadTask = (async () => {
      const authStatus = await api("/auth/status", { skipAuthRedirect: true });
      if (generation !== bootGeneration) return;
      state.auth = {
        checked: true,
        enabled: Boolean(authStatus.enabled),
        authenticated: Boolean(authStatus.authenticated),
        bootstrapRequired: Boolean(authStatus.bootstrap_required),
        user: authStatus.user || null,
      };
      if (state.auth.enabled && !state.auth.authenticated) {
        settled = true;
        state.bootLoading = false;
        state.bootError = "";
        render();
        return;
      }
      await loadSalesData();
    })()
      .then(() => {
        if (generation !== bootGeneration) return;
        settled = true;
        state.bootLoading = false;
        state.bootError = "";
        render();
      })
      .catch((error) => {
        if (generation !== bootGeneration) return;
        settled = true;
        state.bootLoading = false;
        state.bootError = "工作台暂时无法加载，请确认服务正在运行后重试。";
        render();
      });
    await Promise.race([
      loadTask,
      wait(6000).then(() => {
        if (settled || generation !== bootGeneration) return;
        state.bootLoading = false;
        state.bootError = "工作台加载时间较长，请稍后重试。";
        render();
      }),
    ]);
  }

  boot();
})();
