import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AdminStatusService } from "../src/services/adminStatusService.js";

function envReader(values = {}) {
  return {
    value(name, fallback = "") {
      return Object.hasOwn(values, name) ? values[name] : fallback;
    },
  };
}

const strictRuntimePolicy = Object.freeze({
  fail_closed: true,
  http_auth_enabled: true,
});

test("admin status reports only safe deployment, backup and live-doctor metadata", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sales-admin-status-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const backupDir = path.join(root, "backups");
  const packageDir = path.join(backupDir, "supabase-test");
  await fs.mkdir(packageDir, { recursive: true });
  await fs.writeFile(path.join(packageDir, "manifest.json"), JSON.stringify({
    format_version: 1,
    backup_id: "backup-safe-1",
    created_at: "2026-07-22T01:00:00.000Z",
    row_counts: { companies: 2, dossiers: 3 },
    files: [{ path: "data.json", sha256: "a".repeat(64) }],
  }));
  const doctorFile = path.join(root, "doctor-live.json");
  await fs.writeFile(doctorFile, JSON.stringify({
    checked_at: new Date().toISOString(),
    ok: false,
    backend: {
      runtime_ready: false,
      blockers: ["web search failed"],
      checks: {
        model: { called: true, ok: true, provider_mode: "real" },
        web_search: { called: true, ok: false, provider_mode: "real", error: { code: "10500", message: "private detail" } },
      },
    },
  }));

  const service = new AdminStatusService({
    env: envReader({
      HOST: "127.0.0.1",
      PORT: "8787",
      APP_WORKSPACE_SLUG: "default",
      APP_WORKSPACE_NAME: "Sales Workbench",
      SALES_WORKBENCH_BACKUP_DIR: backupDir,
      SALES_WORKBENCH_LIVE_DOCTOR_FILE: doctorFile,
      AGENT_PLAN_API_KEY: "must-not-appear",
    }),
    runtimePolicy: strictRuntimePolicy,
    getProviderStatus: () => ({
      repository: { active: "supabase" },
      providers: [{ id: "model", label: "Model", status: "configured", safe_config: { run_enabled: true } }],
    }),
  });

  const status = await service.getStatus();
  assert.equal(status.read_only, true);
  assert.equal(status.deployment.loopback_only, true);
  assert.equal(status.deployment.http_auth_enabled, true);
  assert.equal(status.backup.latest.backup_id, "backup-safe-1");
  assert.equal(status.backup.latest.row_count, 5);
  assert.equal(status.backup.latest.checksums_declared, true);
  assert.equal(status.live_doctor.status, "failed");
  assert.equal(status.live_doctor.checks[1].error_code, "10500");
  assert.doesNotMatch(JSON.stringify(status), /must-not-appear|private detail/);
});

test("admin status handles installations without a backup or doctor state path", async () => {
  const service = new AdminStatusService({
    env: envReader(),
    runtimePolicy: strictRuntimePolicy,
    getProviderStatus: () => ({ providers: [], repository: { active: "memory" } }),
  });

  const status = await service.getStatus();
  assert.equal(status.backup.configured, false);
  assert.equal(status.backup.status, "unavailable");
  assert.equal(status.live_doctor.status, "unavailable");
});
