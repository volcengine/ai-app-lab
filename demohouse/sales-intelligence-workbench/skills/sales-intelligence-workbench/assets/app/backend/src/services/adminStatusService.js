import fs from "node:fs/promises";
import path from "node:path";

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeCode(value) {
  return String(value || "").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 80) || null;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function inspectBackups(backupDir) {
  if (!backupDir) {
    return {
      configured: false,
      status: "unavailable",
      backup_count: 0,
      invalid_package_count: 0,
      latest: null,
    };
  }

  try {
    const entries = await fs.readdir(backupDir, { withFileTypes: true });
    const packages = [];
    let invalidPackageCount = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const manifest = await readJson(path.join(backupDir, entry.name, "manifest.json"));
        if (!manifest?.backup_id || !manifest?.created_at || !manifest?.row_counts) {
          invalidPackageCount += 1;
          continue;
        }
        packages.push({
          backup_id: String(manifest.backup_id).slice(0, 160),
          created_at: String(manifest.created_at),
          format_version: finiteNumber(manifest.format_version, 0),
          table_count: Object.keys(manifest.row_counts || {}).length,
          row_count: Object.values(manifest.row_counts || {})
            .reduce((total, value) => total + finiteNumber(value, 0), 0),
          file_count: Array.isArray(manifest.files) ? manifest.files.length : 0,
          checksums_declared: Array.isArray(manifest.files)
            && manifest.files.length > 0
            && manifest.files.every((file) => /^[a-f0-9]{64}$/i.test(String(file?.sha256 || ""))),
        });
      } catch {
        invalidPackageCount += 1;
      }
    }
    packages.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return {
      configured: true,
      status: packages.length ? "ready" : "not_created",
      backup_count: packages.length,
      invalid_package_count: invalidPackageCount,
      latest: packages[0] || null,
    };
  } catch (error) {
    return {
      configured: true,
      status: error?.code === "ENOENT" ? "not_created" : "unreadable",
      backup_count: 0,
      invalid_package_count: 0,
      latest: null,
    };
  }
}

async function inspectLiveDoctor(filePath, ttlMs) {
  if (!filePath) return { configured: false, status: "unavailable", checked_at: null, fresh: false, checks: [] };
  try {
    const report = await readJson(filePath);
    const checkedAt = report.checked_at || report.backend?.finished_at || null;
    const ageMs = checkedAt ? Math.max(0, Date.now() - new Date(checkedAt).getTime()) : null;
    const fresh = ageMs !== null && Number.isFinite(ageMs) && ageMs <= ttlMs;
    const checks = Object.entries(report.backend?.checks || {}).map(([provider, check]) => {
      const normalized = check?.health && check?.find
        ? { called: Boolean(check.health.called || check.find.called), ok: Boolean(check.ok), provider_mode: check.health.provider_mode }
        : check || {};
      return {
        provider,
        called: Boolean(normalized.called),
        ok: Boolean(normalized.ok),
        provider_mode: String(normalized.provider_mode || "unknown").slice(0, 40),
        error_code: safeCode(normalized.error?.code),
      };
    });
    return {
      configured: true,
      status: !fresh ? "stale" : report.ok ? "passed" : "failed",
      check_type: String(report.check_type || report.backend?.check_type || "read_only_live").slice(0, 80),
      selected_provider: safeCode(report.selected_provider || report.backend?.selected_provider),
      checked_at: checkedAt,
      fresh,
      age_ms: ageMs,
      ttl_ms: ttlMs,
      runtime_ready: Boolean(report.backend?.runtime_ready),
      blocker_count: Array.isArray(report.backend?.blockers) ? report.backend.blockers.length : 0,
      checks,
    };
  } catch (error) {
    return {
      configured: true,
      status: error?.code === "ENOENT" ? "not_run" : "unreadable",
      checked_at: null,
      fresh: false,
      checks: [],
    };
  }
}

export class AdminStatusService {
  constructor(options = {}) {
    this.env = options.env;
    this.runtimePolicy = options.runtimePolicy;
    this.getProviderStatus = options.getProviderStatus || (() => ({ providers: [], repository: {} }));
  }

  async getStatus() {
    const value = (name, fallback = "") => this.env?.value?.(name, fallback) ?? fallback;
    const host = String(value("HOST", "127.0.0.1"));
    const ttlMs = Math.max(60_000, finiteNumber(value("LIVE_DOCTOR_TTL_MS", "900000"), 900_000));
    const [backup, liveDoctor] = await Promise.all([
      inspectBackups(String(value("SALES_WORKBENCH_BACKUP_DIR", "")).trim()),
      inspectLiveDoctor(String(value("SALES_WORKBENCH_LIVE_DOCTOR_FILE", "")).trim(), ttlMs),
    ]);
    const providerStatus = this.getProviderStatus();
    return {
      schema_version: 1,
      read_only: true,
      deployment: {
        repository_mode: providerStatus.repository?.active || value("REPOSITORY_MODE", "supabase"),
        fail_closed: Boolean(this.runtimePolicy.fail_closed),
        host,
        port: finiteNumber(value("PORT", "8787"), 8787),
        loopback_only: ["127.0.0.1", "::1", "localhost"].includes(host),
        http_auth_enabled: Boolean(this.runtimePolicy.http_auth_enabled),
      },
      workspace: {
        slug: String(value("APP_WORKSPACE_SLUG", "default")).slice(0, 120),
        name: String(value("APP_WORKSPACE_NAME", "Sales Workbench")).slice(0, 160),
      },
      providers: (providerStatus.providers || [])
        .map((provider) => ({
          id: provider.id,
          label: provider.label,
          status: provider.status,
          configured: !["missing_config", "disabled"].includes(provider.status),
          run_enabled: provider.safe_config?.run_enabled !== false,
          missing: provider.missing || [],
        })),
      backup,
      live_doctor: liveDoctor,
    };
  }
}
