import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createEnvReader } from "../config/runtimeEnv.js";
import { providerFailure, providerSuccess } from "./providerResult.js";

const execFileAsync = promisify(execFile);

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function truncate(text, maxLength = 12000) {
  const value = String(text || "");
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function parseJsonOutput(stdout) {
  const output = String(stdout || "").trim();
  if (!output) return null;
  try {
    return JSON.parse(output);
  } catch {
    return null;
  }
}

function resultRows(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.rows)) return parsed.rows;
  return parsed;
}

function isReadOnlySql(query) {
  const normalized = String(query || "")
    .replace(/^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/g, "")
    .trim()
    .toLowerCase();
  return /^(select|with|show|explain)\b/.test(normalized);
}

export class SupabaseProvider {
  constructor(options = {}) {
    this.env = options.env || createEnvReader();
    this.execFile = options.execFile || execFileAsync;
    this.command = this.env.value("SUPABASE_CLI_BIN", "byted-supabase-cli");
    this.timeoutMs = this.env.number("SUPABASE_TIMEOUT_MS", 30000);
    this.workspaceId = this.env.value("SUPABASE_WORKSPACE_ID") || this.env.value("DEFAULT_WORKSPACE_ID");
    this.branchId = this.env.value("SUPABASE_BRANCH_ID");
    this.readOnly = truthy(this.env.value("SUPABASE_READ_ONLY", "true"));
  }

  isConfigured() {
    return Boolean(
      this.workspaceId
      && this.env.value("VOLCENGINE_ACCESS_KEY")
      && this.env.value("VOLCENGINE_SECRET_KEY")
      && this.command
    );
  }

  isRunEnabled() {
    return truthy(this.env.value("SUPABASE_RUN_ENABLED", "false"));
  }

  async executeSql(query) {
    if (!this.isConfigured()) {
      return providerFailure("supabase", { code: "missing_config", message: "Supabase control-plane SQL is not configured." });
    }
    if (this.readOnly && !isReadOnlySql(query)) {
      return providerFailure("supabase", { code: "read_only", message: "Supabase writes are disabled by SUPABASE_READ_ONLY." });
    }

    const tempDir = await mkdtemp(join(tmpdir(), "ccc-supabase-"));
    const queryFile = join(tempDir, "query.sql");
    await writeFile(queryFile, query, "utf8");
    const startedAt = Date.now();
    try {
      const args = [
        "db",
        "query",
        "--file",
        queryFile,
        "--workspace-id",
        this.workspaceId,
      ];
      if (this.branchId) args.push("--branch-id", this.branchId);
      const { stdout, stderr } = await this.execFile(this.command, args, {
        timeout: this.timeoutMs,
        maxBuffer: 1024 * 1024,
        env: {
          ...process.env,
          VOLCENGINE_ACCESS_KEY: this.env.value("VOLCENGINE_ACCESS_KEY"),
          VOLCENGINE_SECRET_KEY: this.env.value("VOLCENGINE_SECRET_KEY"),
          VOLCENGINE_REGION: this.env.value("VOLCENGINE_REGION", "cn-beijing"),
        },
      });
      const parsed = parseJsonOutput(stdout);
      const providerError = parsed && !Array.isArray(parsed) && parsed.error;
      if (providerError) {
        return providerFailure("supabase", { code: "provider_error", message: truncate(providerError, 2000) }, {
          stdout: truncate(stdout, 2000),
          stderr: truncate(stderr, 2000),
          latency_ms: Date.now() - startedAt,
        });
      }
      return providerSuccess("supabase", {
        rows: resultRows(parsed),
        stdout: truncate(stdout, 2000),
        stderr: truncate(stderr, 2000),
        latency_ms: Date.now() - startedAt,
      });
    } catch (error) {
      return providerFailure("supabase", {
          code: error.code === "ENOENT" ? "missing_cli" : "cli_error",
          message: truncate(error.message, 2000),
      }, {
        stdout: truncate(error.stdout, 2000),
        stderr: truncate(error.stderr, 2000),
        latency_ms: Date.now() - startedAt,
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  executeSqlSync(query) {
    if (!this.isConfigured()) {
      return providerFailure("supabase", { code: "missing_config", message: "Supabase control-plane SQL is not configured." });
    }
    if (this.readOnly && !isReadOnlySql(query)) {
      return providerFailure("supabase", { code: "read_only", message: "Supabase writes are disabled by SUPABASE_READ_ONLY." });
    }

    const tempDir = mkdtempSync(join(tmpdir(), "ccc-supabase-"));
    const queryFile = join(tempDir, "query.sql");
    writeFileSync(queryFile, query, "utf8");
    const startedAt = Date.now();
    try {
      const args = [
        "db",
        "query",
        "--file",
        queryFile,
        "--workspace-id",
        this.workspaceId,
      ];
      if (this.branchId) args.push("--branch-id", this.branchId);
      const stdout = execFileSync(this.command, args, {
        timeout: this.timeoutMs,
        maxBuffer: 1024 * 1024,
        encoding: "utf8",
        env: {
          ...process.env,
          VOLCENGINE_ACCESS_KEY: this.env.value("VOLCENGINE_ACCESS_KEY"),
          VOLCENGINE_SECRET_KEY: this.env.value("VOLCENGINE_SECRET_KEY"),
          VOLCENGINE_REGION: this.env.value("VOLCENGINE_REGION", "cn-beijing"),
        },
      });
      const parsed = parseJsonOutput(stdout);
      const providerError = parsed && !Array.isArray(parsed) && parsed.error;
      if (providerError) {
        return providerFailure("supabase", { code: "provider_error", message: truncate(providerError, 2000) }, {
          stdout: truncate(stdout, 2000),
          latency_ms: Date.now() - startedAt,
        });
      }
      return providerSuccess("supabase", {
        rows: resultRows(parsed),
        stdout: truncate(stdout, 2000),
        latency_ms: Date.now() - startedAt,
      });
    } catch (error) {
      return providerFailure("supabase", {
          code: error.code === "ENOENT" ? "missing_cli" : "cli_error",
          message: truncate(error.message, 2000),
      }, {
        stdout: truncate(error.stdout, 2000),
        stderr: truncate(error.stderr, 2000),
        latency_ms: Date.now() - startedAt,
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  async probe() {
    const result = await this.executeSql("select 1 as supabase_probe;");
    if (!result.ok) return result;
    return providerSuccess("supabase", {
      rows: result.rows,
      raw_ref: "supabase:execute-sql:probe",
      latency_ms: result.latency_ms,
    });
  }

}

export function createSupabaseProvider(options = {}) {
  return new SupabaseProvider(options);
}
