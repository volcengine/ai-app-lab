import path from "node:path";
import {
  assertInstalledApp,
  ensureDirectories,
  paths,
  readOption,
  resolveUserPath,
  run,
  runtimeEnvironment,
} from "./lib.mjs";

assertInstalledApp();
ensureDirectories();
const requestedOutput = readOption("--output-dir");
const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const outputDir = requestedOutput
  ? resolveUserPath(requestedOutput)
  : path.join(paths.backupDir, `supabase-${timestamp}`);

const result = run(process.execPath, [
  path.join(paths.installedApp, "backend", "scripts", "backup-supabase.mjs"),
  "--output-dir",
  outputDir,
], {
  cwd: path.join(paths.installedApp, "backend"),
  env: runtimeEnvironment(),
  allowFailure: true,
});
if (result.status !== 0) process.exitCode = result.status;
