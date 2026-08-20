import path from "node:path";
import { paths, run } from "./lib.mjs";

const result = run(process.execPath, [
  path.join(paths.skillRoot, "scripts", "install.mjs"),
  ...process.argv.slice(2),
], { allowFailure: true });
if (result.status !== 0) process.exitCode = result.status;
