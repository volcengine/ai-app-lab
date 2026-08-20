import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  BACKUP_FORMAT_VERSION,
  prepareRowsForRestore,
  validateBackupPackage,
} from "../src/backup/supabaseBackup.js";

test("restore preparation remaps tenancy and removes environment-bound fields", () => {
  const rows = prepareRowsForRestore("sales_companies", [{
    id: "company-1",
    workspace_id: "source-workspace",
    name: "Example",
    normalized_name: "example",
    created_by: "source-user",
    updated_by: "source-user",
  }], "target-workspace");

  assert.equal(rows[0].workspace_id, "target-workspace");
  assert.equal(rows[0].created_by, null);
  assert.equal(rows[0].updated_by, null);
  assert.equal(Object.hasOwn(rows[0], "normalized_name"), false);
});

test("restore preparation never carries provider secret references", () => {
  const rows = prepareRowsForRestore("provider_connections", [{
    id: "provider-1",
    workspace_id: "source-workspace",
    status: "configured",
    secret_ref: "secret://source/provider",
  }], "target-workspace");

  assert.equal(rows[0].secret_ref, null);
  assert.equal(rows[0].status, "needs_reconfiguration");
});

test("backup validation checks row counts and file hashes", () => {
  const directory = mkdtempSync(join(tmpdir(), "sales-backup-test-"));
  const dataPath = join(directory, "data.json");
  const data = {
    format_version: BACKUP_FORMAT_VERSION,
    backup_id: "backup-1",
    tables: { sales_goals: [{ id: "goal-1" }] },
  };
  const content = `${JSON.stringify(data)}\n`;
  writeFileSync(dataPath, content);
  const manifest = {
    format_version: BACKUP_FORMAT_VERSION,
    backup_id: "backup-1",
    row_counts: { sales_goals: 1 },
    files: [{
      path: "data.json",
      sha256: createHash("sha256").update(content).digest("hex"),
    }],
  };

  assert.equal(validateBackupPackage(directory, manifest, data), true);
  manifest.row_counts.sales_goals = 2;
  assert.throws(() => validateBackupPackage(directory, manifest, data), /row count mismatch/i);
});
