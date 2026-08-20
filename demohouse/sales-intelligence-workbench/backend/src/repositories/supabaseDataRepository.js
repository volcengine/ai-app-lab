import { createSupabaseDataProvider } from "../providers/supabaseDataProvider.js";
import { makeId } from "../utils/ids.js";
import { nowIso } from "../utils/time.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const clone = (value) => JSON.parse(JSON.stringify(value));

function payload(row) {
  const value = row?.payload_json;
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value;
}

function groupBy(rows, key) {
  const groups = new Map();
  for (const row of rows || []) {
    const value = row[key] || "";
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(row);
  }
  return groups;
}

function updateBody(row) {
  const body = { ...row };
  delete body.id;
  delete body.workspace_id;
  delete body.created_at;
  return body;
}

function boundedLimit(value, fallback = 20) {
  const parsed = Number(value || fallback);
  return Math.max(1, Math.min(Number.isFinite(parsed) ? parsed : fallback, 100));
}

function salesMaterialMetadata(material = {}) {
  return {
    id: material.id,
    company_id: material.company_id,
    title: material.title || "",
    source_type: material.source_type || "",
    source_url: material.source_url || "",
    source_id: material.source_id || null,
    source_external_id: material.source_external_id || "",
    source_version: material.source_version || "",
    content_hash: material.content_hash || null,
    occurred_at: material.occurred_at || null,
    last_synced_at: material.last_synced_at || null,
    openviking_uri: material.openviking_uri || material.openviking_ref || "",
    openviking_status: material.openviking_status || (material.openviking_uri ? "indexed" : "pending"),
    created_at: material.created_at || null,
    updated_at: material.updated_at || null,
  };
}

export class SupabaseDataRepository {
  constructor(options = {}) {
    this.provider = options.supabaseDataProvider || createSupabaseDataProvider({ env: options.env });
    this.workspaceId = String(options.workspaceId || this.provider.env?.value?.("APP_WORKSPACE_ID") || "").trim();
    if (!UUID_PATTERN.test(this.workspaceId)) {
      throw new Error("APP_WORKSPACE_ID must be a valid UUID.");
    }
    this.readyPromise = null;
  }

  async ensureSalesReady() {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = (async () => {
      if (!this.provider.isConfigured()) throw new Error("Supabase Data API is not configured.");
      const [migrations, workspaces] = await Promise.all([
        this.provider.select("schema_migrations", {
          select: "version",
          filters: { version: "eq.202607300001" },
          limit: 1,
        }),
        this.provider.select("app_workspaces", {
          select: "id",
          filters: { id: `eq.${this.workspaceId}` },
          limit: 1,
        }),
      ]);
      if (!migrations.length) throw new Error("Supabase security boundary migration is not applied.");
      if (!workspaces.length) throw new Error(`Application workspace is not initialized: ${this.workspaceId}`);
      return true;
    })().catch((error) => {
      this.readyPromise = null;
      throw error;
    });
    return this.readyPromise;
  }

  async upsertScoped(table, id, row) {
    await this.ensureSalesReady();
    const existing = await this.provider.update(table, updateBody(row), {
      workspace_id: `eq.${this.workspaceId}`,
      id: `eq.${id}`,
    });
    if (Array.isArray(existing) && existing.length) return existing[0];
    const inserted = await this.provider.insert(table, row);
    return Array.isArray(inserted) ? inserted[0] : inserted;
  }

  async getSalesState(seed = {}) {
    await this.ensureSalesReady();
    const workspaceFilter = { workspace_id: `eq.${this.workspaceId}` };
    const activeFilter = { ...workspaceFilter, deleted_at: "is.null" };
    const [
      goalRows,
      companyRows,
      targetRows,
      progressRows,
      dossierRows,
      citationRows,
      materialRows,
      refRows,
      syncSourceRows,
      syncCheckpointRows,
      jobRows,
    ] = await Promise.all([
      this.provider.select("sales_goals", { filters: activeFilter, order: "created_at.asc" }),
      this.provider.select("sales_companies", { filters: activeFilter, order: "created_at.asc" }),
      this.provider.select("sales_target_enterprises", { filters: activeFilter, order: "created_at.asc" }),
      this.provider.select("sales_progress_snapshots", { filters: workspaceFilter, order: "created_at.desc" }),
      this.provider.select("sales_dossier_records", { filters: activeFilter, order: "created_at.desc" }),
      this.provider.select("sales_dossier_citations", { filters: workspaceFilter, order: "created_at.asc" }),
      this.provider.select("sales_materials", { filters: activeFilter, order: "updated_at.desc" }),
      this.provider.select("sales_openviking_refs", { filters: workspaceFilter, order: "created_at.asc" }),
      this.provider.select("sync_sources", { filters: workspaceFilter, order: "updated_at.desc" }),
      this.provider.select("sync_checkpoints", { filters: workspaceFilter, order: "updated_at.desc" }),
      this.provider.select("jobs", { filters: workspaceFilter, order: "created_at.desc" }),
    ]);

    const progressByCompany = new Map();
    for (const row of progressRows) {
      if (!progressByCompany.has(row.company_id)) {
        progressByCompany.set(row.company_id, {
          label: row.label,
          summary: row.summary,
          evidence: row.evidence,
          updated_at: row.created_at,
        });
      }
    }

    const companies = {};
    for (const row of companyRows) {
      const saved = payload(row);
      companies[row.id] = {
        ...saved,
        id: row.id,
        name: row.name,
        initial: row.initial,
        industry: row.industry,
        location: row.location,
        tags: Array.isArray(row.tags) ? row.tags : saved.tags || [],
        progress: progressByCompany.get(row.id) || saved.progress || null,
        dossier_ids: [],
        material_ids: [],
        qa_session_id: saved.qa_session_id || `sales-${row.id}`,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    }

    const targetCompanyIdsByGoal = groupBy(targetRows, "goal_id");
    const seedGoalOrder = new Map((seed?.goals || []).map((goal, index) => [goal.id, index]));
    const goals = goalRows.map((row) => {
      const saved = payload(row);
      return {
        ...saved,
        id: row.id,
        name: row.name,
        description: row.description,
        keywords: Array.isArray(row.keywords) ? row.keywords : saved.keywords || [],
        company_ids: (targetCompanyIdsByGoal.get(row.id) || []).map((target) => target.company_id).filter((id) => companies[id]),
        candidate_ids: saved.candidate_ids || [],
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    }).sort((a, b) => {
      const aOrder = seedGoalOrder.has(a.id) ? seedGoalOrder.get(a.id) : Number.MAX_SAFE_INTEGER;
      const bOrder = seedGoalOrder.has(b.id) ? seedGoalOrder.get(b.id) : Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });

    const citationsByDossier = groupBy(citationRows, "dossier_id");
    const dossiers = {};
    for (const row of dossierRows) {
      const saved = payload(row);
      const citations = (citationsByDossier.get(row.id) || []).map((citationRow) => ({
        ...payload(citationRow),
        id: citationRow.citation_no,
        label: citationRow.label,
        source_kind: citationRow.source_kind,
        url: citationRow.url || "",
      })).sort((a, b) => Number(a.id) - Number(b.id));
      dossiers[row.id] = {
        ...saved,
        id: row.id,
        company_id: row.company_id,
        title: row.title,
        summary: row.summary,
        memory_summary: row.memory_summary,
        provider_run_id: row.provider_run_id || saved.provider_run_id || null,
        version_no: Number(row.version_no || saved.version_no || 1),
        previous_dossier_id: row.previous_dossier_id || saved.previous_dossier_id || null,
        evidence_hash: row.evidence_hash || saved.evidence_hash || null,
        dossier_fingerprint: row.dossier_fingerprint || saved.dossier_fingerprint || null,
        change_status: row.change_status || saved.change_status || "initial",
        data_as_of: row.data_as_of || saved.data_as_of || row.created_at,
        generated_at: row.generated_at || saved.generated_at || row.created_at,
        evidence_pack: Array.isArray(row.evidence_pack_json)
          ? row.evidence_pack_json
          : saved.evidence_pack || [],
        created_at: row.created_at,
        body: saved.body || [],
        citations: citations.length ? citations : saved.citations || [],
      };
      if (companies[row.company_id]) companies[row.company_id].dossier_ids.push(row.id);
    }

    const materials = {};
    for (const row of materialRows) {
      const saved = payload(row);
      materials[row.id] = {
        id: row.id,
        company_id: row.company_id,
        title: row.title,
        source_type: row.source_type || saved.source_type || "",
        source_url: row.source_url || saved.source_url || "",
        source_id: row.source_id || saved.source_id || null,
        source_external_id: saved.source_external_id || "",
        source_version: row.source_version || saved.source_version || "",
        content_hash: row.content_hash || saved.content_hash || null,
        summary: "",
        text: "",
        source_items: [],
        occurred_at: row.occurred_at || saved.occurred_at || null,
        last_synced_at: row.last_synced_at || saved.last_synced_at || null,
        updated_at: row.updated_at,
        created_at: row.created_at,
        openviking_uri: row.openviking_uri || saved.openviking_uri || "",
        openviking_status: row.openviking_status || saved.openviking_status || (row.openviking_uri ? "indexed" : "pending"),
      };
      if (companies[row.company_id] && !companies[row.company_id].material_ids.includes(row.id)) {
        companies[row.company_id].material_ids.push(row.id);
      }
    }

    for (const row of refRows.filter((item) => item.related_type === "material")) {
      const saved = payload(row);
      const id = row.related_id || saved.id || row.id;
      const seedMaterial = seed?.materials?.[id] || {};
      const existing = materials[id] || {};
      const memoryImported = row.ref_kind === "memory_import";
      materials[id] = {
        ...existing,
        id,
        company_id: row.company_id,
        title: saved.title || existing.title || seedMaterial.title || row.summary,
        source_type: saved.source_type || existing.source_type || seedMaterial.source_type || "",
        source_url: saved.source_url || existing.source_url || seedMaterial.source_url || "",
        source_id: saved.source_id || existing.source_id || seedMaterial.source_id || null,
        source_external_id: saved.source_external_id || existing.source_external_id || "",
        source_version: saved.source_version || existing.source_version || "",
        content_hash: saved.content_hash || existing.content_hash || null,
        summary: "",
        text: "",
        source_items: [],
        updated_at: saved.updated_at || existing.updated_at || seedMaterial.updated_at || row.created_at,
        openviking_uri: memoryImported ? row.uri : existing.openviking_uri || row.uri,
        openviking_status: memoryImported ? "indexed" : existing.openviking_status || (row.uri ? "indexed" : "pending"),
      };
      if (companies[row.company_id] && !companies[row.company_id].material_ids.includes(id)) {
        companies[row.company_id].material_ids.push(id);
      }
    }

    const qa_messages = {};

    const sync_sources = Object.fromEntries(syncSourceRows.map((row) => [row.id, {
      ...payload(row),
      id: row.id,
      source_type: row.source_type,
      external_id: row.external_id,
      display_name: row.display_name || "",
      status: row.status,
      config: row.config_json || {},
      last_synced_at: row.last_synced_at || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }]));
    const sync_checkpoints = Object.fromEntries(syncCheckpointRows.map((row) => [row.id, {
      ...payload(row),
      id: row.id,
      source_id: row.source_id,
      checkpoint_key: row.checkpoint_key,
      checkpoint_value: row.checkpoint_value || "",
      content_hash: row.content_hash || null,
      last_success_at: row.last_success_at || null,
      error: row.error_json || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }]));

    const jobs = Object.fromEntries(jobRows.map((row) => [row.id, this.jobView(row)]));

    return { goals, companies, dossiers, materials, qa_messages, sync_sources, sync_checkpoints, jobs };
  }

  async persistSalesGoal(goal) {
    const row = {
      id: goal.id,
      workspace_id: this.workspaceId,
      name: goal.name,
      description: goal.description || "",
      keywords: goal.keywords || [],
      deleted_at: null,
      created_at: goal.created_at || nowIso(),
      updated_at: goal.updated_at || nowIso(),
      payload_json: goal,
    };
    return this.upsertScoped("sales_goals", goal.id, row);
  }

  async persistSalesCompany(company) {
    const row = {
      id: company.id,
      workspace_id: this.workspaceId,
      name: company.name,
      initial: company.initial || "",
      industry: company.industry || "",
      location: company.location || "",
      tags: company.tags || [],
      deleted_at: null,
      created_at: company.created_at || nowIso(),
      updated_at: company.updated_at || nowIso(),
      payload_json: company,
    };
    const saved = await this.upsertScoped("sales_companies", company.id, row);
    if (company.progress) await this.persistSalesProgress(company.id, company.progress);
    return saved;
  }

  async persistSalesProgress(companyId, progress) {
    const createdAt = progress.updated_at || nowIso();
    const id = `${companyId}:${createdAt}`;
    return this.upsertScoped("sales_progress_snapshots", id, {
      id,
      workspace_id: this.workspaceId,
      company_id: companyId,
      label: progress.label || "",
      summary: progress.summary || "",
      evidence: progress.evidence || "",
      created_at: createdAt,
      payload_json: progress,
    });
  }

  async persistSalesTargetEnterprise(goalId, company) {
    await this.persistSalesCompany(company);
    const now = nowIso();
    const filters = {
      workspace_id: `eq.${this.workspaceId}`,
      goal_id: `eq.${goalId}`,
      company_id: `eq.${company.id}`,
    };
    const status = company.progress?.label || "新商机";
    const payload_json = { goal_id: goalId, company_id: company.id, status };
    const existing = await this.provider.update("sales_target_enterprises", {
      status,
      deleted_at: null,
      updated_at: now,
      payload_json,
    }, filters);
    if (Array.isArray(existing) && existing.length) return existing[0];
    const inserted = await this.provider.insert("sales_target_enterprises", {
      id: `${goalId}:${company.id}`,
      workspace_id: this.workspaceId,
      goal_id: goalId,
      company_id: company.id,
      status,
      created_at: now,
      updated_at: now,
      payload_json,
    });
    return Array.isArray(inserted) ? inserted[0] : inserted;
  }

  async persistSalesSearchResults(goalId, query, companies) {
    await this.ensureSalesReady();
    const rows = (companies || []).map((company) => ({
      id: makeId("sales_search"),
      workspace_id: this.workspaceId,
      goal_id: goalId,
      company_id: company.id || null,
      query,
      reason: company.reason || "",
      created_at: nowIso(),
      payload_json: company,
    }));
    if (!rows.length) return [];
    return this.provider.insert("sales_company_search_results", rows);
  }

  async persistSalesDossier(dossier) {
    await this.ensureSalesReady();
    await this.provider.rpc("persist_sales_dossier", {
      p_workspace_id: this.workspaceId,
      p_dossier: dossier,
    });
    return clone(dossier);
  }

  async persistSalesMaterial(material) {
    const metadata = salesMaterialMetadata(material);
    const row = {
      id: material.id,
      workspace_id: this.workspaceId,
      company_id: material.company_id,
      title: material.title,
      source_type: material.source_type || "",
      source_url: material.source_url || "",
      source_id: material.source_id || null,
      source_version: material.source_version || "",
      content_hash: material.content_hash || null,
      summary: "",
      occurred_at: material.occurred_at || null,
      openviking_uri: material.openviking_uri || material.openviking_ref || "",
      openviking_status: material.openviking_status || (material.openviking_uri ? "indexed" : "pending"),
      last_synced_at: material.last_synced_at || null,
      deleted_at: null,
      created_at: material.created_at || material.updated_at || nowIso(),
      updated_at: material.updated_at || nowIso(),
      payload_json: metadata,
    };
    return this.upsertScoped("sales_materials", material.id, row);
  }

  async softDeleteSalesMaterial(materialId, deletedAt = nowIso()) {
    await this.ensureSalesReady();
    return this.provider.update("sales_materials", {
      deleted_at: deletedAt,
      updated_at: deletedAt,
    }, {
      workspace_id: `eq.${this.workspaceId}`,
      id: `eq.${materialId}`,
    });
  }

  async persistSyncSource(source) {
    const row = {
      id: source.id,
      workspace_id: this.workspaceId,
      source_type: source.source_type,
      external_id: source.external_id,
      display_name: source.display_name || "",
      status: source.status || "active",
      config_json: source.config || source.config_json || {},
      last_synced_at: source.last_synced_at || null,
      created_at: source.created_at || nowIso(),
      updated_at: source.updated_at || nowIso(),
    };
    return this.upsertScoped("sync_sources", source.id, row);
  }

  async persistSyncCheckpoint(checkpoint) {
    const id = checkpoint.id || `${checkpoint.source_id}:${checkpoint.checkpoint_key || "latest"}`;
    const row = {
      id,
      workspace_id: this.workspaceId,
      source_id: checkpoint.source_id,
      checkpoint_key: checkpoint.checkpoint_key || "latest",
      checkpoint_value: checkpoint.checkpoint_value || "",
      content_hash: checkpoint.content_hash || null,
      last_success_at: checkpoint.last_success_at || null,
      error_json: checkpoint.error || checkpoint.error_json || null,
      created_at: checkpoint.created_at || nowIso(),
      updated_at: checkpoint.updated_at || nowIso(),
    };
    return this.upsertScoped("sync_checkpoints", id, row);
  }

  async persistSalesOpenVikingRef(record) {
    const id = record.id || (record.related_id
      ? `${record.company_id || "global"}:${record.related_type || "ref"}:${record.related_id}:${record.ref_kind || "ref"}`
      : makeId("sales_ov"));
    const row = {
      id,
      workspace_id: this.workspaceId,
      company_id: record.company_id || null,
      related_type: record.related_type,
      related_id: record.related_id || null,
      ref_kind: record.ref_kind,
      uri: record.uri || "",
      summary: record.summary || "",
      created_at: record.created_at || nowIso(),
      payload_json: record.payload_json || record,
    };
    return this.upsertScoped("sales_openviking_refs", id, row);
  }

  async persistProviderRun(run) {
    await this.ensureSalesReady();
    await this.provider.rpc("persist_provider_run", {
      p_workspace_id: this.workspaceId,
      p_run: run,
    });
    return clone(run);
  }

  async persistJob(job) {
    const row = {
      id: job.id,
      workspace_id: this.workspaceId,
      job_type: job.job_type,
      status: job.status || "queued",
      entity_type: job.entity_type || null,
      entity_id: job.entity_id || null,
      idempotency_key: job.idempotency_key || null,
      attempt_count: Number(job.attempt_count || 0),
      max_attempts: Number(job.max_attempts || 3),
      scheduled_at: job.scheduled_at || null,
      started_at: job.started_at || null,
      finished_at: job.finished_at || null,
      error_json: job.error || job.error_json || null,
      payload_json: job,
      is_paid: Boolean(job.is_paid),
      stage: job.stage || job.status || "queued",
      progress: Math.max(0, Math.min(Number(job.progress || 0), 100)),
      worker_id: job.worker_id || null,
      lease_expires_at: job.lease_expires_at || null,
      heartbeat_at: job.heartbeat_at || null,
      cancel_requested_at: job.cancel_requested_at || null,
      checkpoint_json: job.checkpoint || job.checkpoint_json || {},
      progress_detail_json: job.progress_detail || job.progress_detail_json || {},
      created_by: job.created_by || null,
      created_at: job.created_at || nowIso(),
      updated_at: job.updated_at || nowIso(),
    };
    await this.upsertScoped("jobs", job.id, row);
    return clone(job);
  }

  async enqueueJob(job) {
    await this.ensureSalesReady();
    const result = await this.provider.rpc("enqueue_sales_job", {
      p_workspace_id: this.workspaceId,
      p_job: job,
    });
    return this.jobView(result);
  }

  async claimNextJob(workerId, jobTypes, leaseSeconds) {
    await this.ensureSalesReady();
    const result = await this.provider.rpc("claim_sales_job", {
      p_workspace_id: this.workspaceId,
      p_worker_id: workerId,
      p_job_types: Array.isArray(jobTypes) ? jobTypes : [],
      p_lease_seconds: Number(leaseSeconds || 600),
    });
    return result ? this.jobView(result) : null;
  }

  async heartbeatJob(jobId, workerId, stage, progress, leaseSeconds) {
    await this.ensureSalesReady();
    const result = await this.provider.rpc("heartbeat_sales_job", {
      p_workspace_id: this.workspaceId,
      p_job_id: jobId,
      p_worker_id: workerId,
      p_stage: stage,
      p_progress: Number(progress || 1),
      p_lease_seconds: Number(leaseSeconds || 600),
    });
    return this.jobView(result);
  }

  async saveJobCheckpoint(jobId, workerId, checkpointPatch = {}, options = {}) {
    await this.ensureSalesReady();
    const result = await this.provider.rpc("checkpoint_sales_job", {
      p_workspace_id: this.workspaceId,
      p_job_id: jobId,
      p_worker_id: workerId,
      p_stage: options.stage || "running",
      p_progress: Number(options.progress || 1),
      p_progress_detail: options.detail || {},
      p_checkpoint_patch: checkpointPatch || {},
      p_lease_seconds: Number(options.lease_seconds || 600),
    });
    return this.jobView(result);
  }

  async releaseJobClaim(jobId, workerId, error, options = {}) {
    await this.ensureSalesReady();
    const result = await this.provider.rpc("release_sales_job_claim", {
      p_workspace_id: this.workspaceId,
      p_job_id: jobId,
      p_worker_id: workerId,
      p_error: error || null,
      p_retry: Boolean(options.retry),
      p_delay_seconds: Number(options.delay_seconds || 0),
    });
    return result ? this.jobView(result) : null;
  }

  async requestJobCancellation(jobId) {
    await this.ensureSalesReady();
    const result = await this.provider.rpc("request_cancel_sales_job", {
      p_workspace_id: this.workspaceId,
      p_job_id: jobId,
    });
    return this.jobView(result);
  }

  async acknowledgeJobCancellation(jobId, workerId) {
    await this.ensureSalesReady();
    const result = await this.provider.rpc("acknowledge_cancel_sales_job", {
      p_workspace_id: this.workspaceId,
      p_job_id: jobId,
      p_worker_id: workerId,
    });
    return this.jobView(result);
  }

  async retryQueuedJob(jobId) {
    await this.ensureSalesReady();
    const result = await this.provider.rpc("retry_sales_job", {
      p_workspace_id: this.workspaceId,
      p_job_id: jobId,
    });
    return this.jobView(result);
  }

  async reservePaidWorkflow(job, reservationId, limits) {
    await this.ensureSalesReady();
    const result = await this.provider.rpc("reserve_paid_workflow", {
      p_workspace_id: this.workspaceId,
      p_job: job,
      p_reservation_id: reservationId,
      p_max_concurrent: limits.max_concurrent,
      p_daily_limit: limits.daily_limit,
      p_budget_timezone: limits.timezone,
      p_stale_after_seconds: limits.stale_after_seconds,
    });
    return {
      job: result?.job || job,
      budget: result?.budget || null,
    };
  }

  async finishPaidWorkflow(job, reservationId) {
    await this.ensureSalesReady();
    const result = await this.provider.rpc("finish_paid_workflow", {
      p_workspace_id: this.workspaceId,
      p_job: job,
      p_reservation_id: reservationId,
    });
    return result || clone(job);
  }

  async getPaidWorkflowUsage(timezone) {
    await this.ensureSalesReady();
    return this.provider.rpc("get_paid_workflow_usage", {
      p_workspace_id: this.workspaceId,
      p_budget_timezone: timezone,
    });
  }

  async listJobs(filters = {}) {
    await this.ensureSalesReady();
    const queryFilters = { workspace_id: `eq.${this.workspaceId}` };
    if (filters.job_type) queryFilters.job_type = `eq.${filters.job_type}`;
    if (filters.status) queryFilters.status = `eq.${filters.status}`;
    if (filters.entity_id) queryFilters.entity_id = `eq.${filters.entity_id}`;
    const rows = await this.provider.select("jobs", {
      filters: queryFilters,
      order: "created_at.desc",
      limit: boundedLimit(filters.limit),
    });
    return rows.map((row) => this.jobView(row));
  }

  async getJob(jobId) {
    await this.ensureSalesReady();
    const rows = await this.provider.select("jobs", {
      filters: { workspace_id: `eq.${this.workspaceId}`, id: `eq.${jobId}` },
      limit: 1,
    });
    return rows.length ? this.jobView(rows[0]) : null;
  }

  jobView(row) {
    const saved = payload(row);
    return {
      ...saved,
      id: row.id,
      job_type: row.job_type,
      status: row.status,
      entity_type: row.entity_type || "",
      entity_id: row.entity_id || "",
      idempotency_key: row.idempotency_key || null,
      attempt_count: Number(row.attempt_count || 0),
      max_attempts: Number(row.max_attempts || 3),
      scheduled_at: row.scheduled_at || null,
      started_at: row.started_at || null,
      finished_at: row.finished_at || null,
      error: row.error_json || saved.error || null,
      is_paid: Boolean(row.is_paid || saved.is_paid),
      stage: row.stage || saved.stage || row.status,
      progress: Number(row.progress ?? saved.progress ?? (row.status === "succeeded" ? 100 : 0)),
      worker_id: row.worker_id || saved.worker_id || null,
      lease_expires_at: row.lease_expires_at || saved.lease_expires_at || null,
      heartbeat_at: row.heartbeat_at || saved.heartbeat_at || null,
      cancel_requested_at: row.cancel_requested_at || saved.cancel_requested_at || null,
      checkpoint: row.checkpoint_json || saved.checkpoint || {},
      progress_detail: row.progress_detail_json || saved.progress_detail || {},
      created_by: row.created_by || saved.created_by || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async listProviderRuns(filters = {}) {
    await this.ensureSalesReady();
    const limit = boundedLimit(filters.limit);
    const queryFilters = { workspace_id: `eq.${this.workspaceId}` };
    if (filters.operation) queryFilters.operation = `eq.${filters.operation}`;
    if (filters.entity_id) queryFilters.entity_id = `eq.${filters.entity_id}`;
    const runs = await this.provider.select("provider_runs", {
      filters: queryFilters,
      order: "started_at.desc",
      limit,
    });
    if (!runs.length) return [];
    const runIds = runs.map((run) => run.id);
    const steps = await this.provider.select("provider_run_steps", {
      filters: {
        workspace_id: `eq.${this.workspaceId}`,
        provider_run_id: `in.(${runIds.join(",")})`,
      },
      order: "sequence.asc",
    });
    const stepsByRun = groupBy(steps, "provider_run_id");
    return runs.map((row) => this.providerRunView(row, stepsByRun.get(row.id) || []));
  }

  async getProviderRun(runId) {
    await this.ensureSalesReady();
    const rows = await this.provider.select("provider_runs", {
      filters: { workspace_id: `eq.${this.workspaceId}`, id: `eq.${runId}` },
      limit: 1,
    });
    if (!rows.length) return null;
    const steps = await this.provider.select("provider_run_steps", {
      filters: { workspace_id: `eq.${this.workspaceId}`, provider_run_id: `eq.${runId}` },
      order: "sequence.asc",
    });
    return this.providerRunView(rows[0], steps);
  }

  providerRunView(row, stepRows = []) {
    const saved = payload(row);
    return {
      ...saved,
      id: row.id,
      operation: row.operation,
      status: row.status,
      app_mode: row.app_mode,
      entity_type: row.entity_type || "",
      entity_id: row.entity_id || "",
      job_id: row.job_id || saved.job_id || null,
      started_at: row.started_at,
      finished_at: row.finished_at,
      duration_ms: row.duration_ms,
      result_ref: row.result_ref,
      error: row.error_json || saved.error || null,
      steps: stepRows.map((step) => ({
        id: step.id,
        sequence: step.sequence,
        provider: step.provider,
        operation: step.operation,
        status: step.status,
        input_summary: step.input_summary || "",
        output_summary: step.output_summary || "",
        request_id: step.request_id,
        raw_ref: step.raw_ref,
        usage: step.usage_json,
        attempts: step.attempts,
        started_at: step.started_at,
        finished_at: step.finished_at,
        latency_ms: step.latency_ms,
        error: step.error_json,
      })),
    };
  }
}
