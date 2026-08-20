import fs from "node:fs";
import {
  paths,
  processExists,
  readPid,
} from "./lib.mjs";

if (processExists(readPid())) {
  throw new Error("工作台仍在运行，请先执行 stop.mjs。卸载不会自动终止未知进程。");
}

const purge = process.argv.includes("--purge");
const confirmed = process.argv.includes("--yes");
if (purge && !confirmed) {
  throw new Error("--purge 会删除本机配置、日志和备份，必须同时提供 --yes。");
}

fs.rmSync(paths.installRoot, { recursive: true, force: true });
if (purge) {
  fs.rmSync(paths.configDir, { recursive: true, force: true });
  fs.rmSync(paths.stateDir, { recursive: true, force: true });
  process.stdout.write("应用、配置、日志和本地备份已删除；云端 Supabase/OpenViking 数据未删除。\n");
} else {
  process.stdout.write("应用运行时已删除；配置、日志、备份和云端数据均已保留。\n");
}
