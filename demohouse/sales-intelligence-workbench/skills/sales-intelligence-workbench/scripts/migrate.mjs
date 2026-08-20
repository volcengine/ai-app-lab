import path from "node:path";
import {
  assertAppSource,
  assertInstalledApp,
  readOption,
  resolveUserPath,
  run,
  runtimeEnvironment,
} from "./lib.mjs";

const sourceValue = readOption("--source");
const appRoot = sourceValue ? assertAppSource(resolveUserPath(sourceValue)) : assertInstalledApp();
const apply = process.argv.includes("--apply");
const args = [path.join(appRoot, "backend", "scripts", "migrate-supabase.mjs")];
if (apply) args.push("--apply");

process.stdout.write(apply
  ? `正在从 ${appRoot} 应用版本化数据库迁移；不会执行未登记的临时 SQL。\n`
  : `正在从 ${appRoot} 只读检查数据库迁移版本；添加 --apply 才会写入。\n`);
const result = run(process.execPath, args, {
  cwd: path.join(appRoot, "backend"),
  env: runtimeEnvironment(),
  allowFailure: true,
});
if (result.status !== 0) process.exitCode = result.status;
