import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(scriptDir, "..");
const testsDir = path.join(backendDir, "tests");
const testFiles = fs.readdirSync(testsDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
  .map((entry) => path.join("tests", entry.name))
  .sort((left, right) => left.localeCompare(right, "en"));

if (!testFiles.length) throw new Error("未找到后端测试文件。");

const result = spawnSync(process.execPath, ["--test", ...testFiles], {
  cwd: backendDir,
  encoding: "utf8",
  env: process.env,
  maxBuffer: 4 * 1024 * 1024,
});
if (result.error) throw result.error;
if (result.status === 0) {
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
} else {
  const lines = String(result.stdout || "").split(/\r?\n/);
  const failureBlocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^not ok \d+ - /.test(lines[index])) continue;
    const start = index > 0 && lines[index - 1].startsWith("# Subtest:") ? index - 1 : index;
    let end = index + 1;
    while (end < lines.length && !lines[end].startsWith("# Subtest:") && !/^1\.\./.test(lines[end])) {
      end += 1;
    }
    failureBlocks.push(lines.slice(start, end).join("\n").trimEnd());
    index = end - 1;
  }
  const summary = lines.filter((line) => /^# (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b/.test(line));
  process.stdout.write([
    "后端测试未通过，仅显示失败项与汇总：",
    ...failureBlocks,
    ...summary,
    "",
  ].join("\n"));
  process.stderr.write(result.stderr);
  process.exitCode = result.status || 1;
}
