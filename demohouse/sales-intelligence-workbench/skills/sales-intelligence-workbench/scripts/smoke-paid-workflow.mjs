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

process.stdout.write("正在事务内验证付费工作流预约与释放；验证结束后会回滚测试数据。\n");
run(process.execPath, [path.join(appRoot, "backend", "scripts", "smoke-paid-workflow-guard.mjs")], {
  cwd: path.join(appRoot, "backend"),
  env: runtimeEnvironment(),
});
