import path from "node:path";
import { paths, run } from "./lib.mjs";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  process.stdout.write(`用法：
  node verify-real-chain.mjs

执行模型、DataPro、豆包搜索、OpenViking 和 Supabase 的最小真实连通性检查。
该命令会产生少量 AFP/Token；查看本帮助不会发起任何 Provider 请求。
`);
  process.exit(0);
}

process.stdout.write("将发起模型、DataPro、联网搜索、OpenViking 和 Supabase 的最小只读真实请求，可能产生少量 AFP/Token。\n");
const result = run(process.execPath, [path.join(paths.skillRoot, "scripts", "doctor.mjs"), "--live"], {
  allowFailure: true,
});
if (result.status !== 0) process.exitCode = result.status;
