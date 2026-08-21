import path from "node:path";
import { assertInstalledApp, paths, run, runtimeEnvironment } from "./lib.mjs";

assertInstalledApp();
if (!process.argv.includes("--backup-dir")) {
  throw new Error("恢复必须显式提供 --backup-dir，并按脚本提示提供独立目标与确认值。");
}
if (!process.argv.includes("--apply")) {
  process.stdout.write("当前为恢复预检，不写入目标；添加 --apply 后才会执行恢复。\n");
}

const result = run(process.execPath, [
  path.join(paths.installedApp, "backend", "scripts", "restore-supabase.mjs"),
  ...process.argv.slice(2),
], {
  cwd: path.join(paths.installedApp, "backend"),
  env: runtimeEnvironment(),
  allowFailure: true,
});
if (result.status !== 0) process.exitCode = result.status;
