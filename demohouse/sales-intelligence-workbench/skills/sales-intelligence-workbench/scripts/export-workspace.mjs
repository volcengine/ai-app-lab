import path from "node:path";

import { assertInstalledApp, paths, run, serverAddress } from "./lib.mjs";

assertInstalledApp();
const userArgs = process.argv.slice(2);
const args = [
  path.join(paths.installedApp, "backend", "scripts", "export-workspace.mjs"),
];
if (!userArgs.includes("--api-url")) args.push("--api-url", serverAddress().url);
if (!userArgs.includes("--auth-session")) args.push("--auth-session", paths.cliSessionFile);
args.push(...userArgs);

const result = run(process.execPath, args, { allowFailure: true });
if (result.status !== 0) process.exitCode = result.status;
