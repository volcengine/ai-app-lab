import path from "node:path";

import {
  assertInstalledApp,
  paths,
  run,
  serverAddress,
  writePrivateJson,
} from "./lib.mjs";

assertInstalledApp();
const userArgs = process.argv.slice(2);
const args = [
  path.join(paths.installedApp, "backend", "scripts", "verify-business-chain.mjs"),
];
if (!userArgs.includes("--api-url")) args.push("--api-url", serverAddress().url);
if (!userArgs.includes("--auth-session")) args.push("--auth-session", paths.cliSessionFile);
args.push(...userArgs);

const result = run(process.execPath, args, {
  allowFailure: true,
  encoding: "utf8",
  stdio: "pipe",
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) {
  process.exitCode = result.status;
} else {
  try {
    const report = JSON.parse(String(result.stdout || "").trim());
    if (report.ok) {
      writePrivateJson(paths.businessAcceptanceFile, {
        schema_version: 1,
        ok: true,
        accepted_at: report.finished_at || new Date().toISOString(),
        enterprise_id: report.enterprise?.id || null,
        checks: {
          company_search: report.company_search?.status || "succeeded",
          dossier: report.dossier?.provider_run?.status || null,
          qa: report.qa?.provider_run?.status || null,
        },
        usage: report.usage || null,
      });
    }
  } catch {
    process.stderr.write("提示：真实业务验收已执行，但未能写入 Builder 脱敏回执。\n");
  }
}
