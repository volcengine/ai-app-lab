import { cp, mkdir, rename, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "skills", "car-decision-assistant");
const args = process.argv.slice(2);

function option(name, fallback = null) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

const target = option("--target", "codex");
const explicitTargetDir = option("--target-dir");
const force = args.includes("--force");

if (!new Set(["codex", "claude", "all"]).has(target)) {
  throw new Error("--target 只支持 codex、claude 或 all");
}
if (explicitTargetDir && target === "all") {
  throw new Error("--target-dir 不能与 --target all 同时使用");
}

await stat(join(source, "SKILL.md"));
await stat(join(source, "agents", "openai.yaml"));

function roots() {
  if (explicitTargetDir) return [[target, resolve(explicitTargetDir)]];
  const codexRoot = process.env.CODEX_HOME
    ? join(resolve(process.env.CODEX_HOME), "skills")
    : join(homedir(), ".codex", "skills");
  const claudeRoot = join(homedir(), ".claude", "skills");
  if (target === "all") return [["codex", codexRoot], ["claude", claudeRoot]];
  return target === "codex"
    ? [["codex", codexRoot]]
    : [["claude", claudeRoot]];
}

const installed = [];
for (const [client, targetRoot] of roots()) {
  await mkdir(targetRoot, { recursive: true });
  const destination = join(targetRoot, "car-decision-assistant");
  const temporary = join(targetRoot, `.car-decision-assistant-${process.pid}.tmp`);
  let exists = false;
  try {
    await stat(destination);
    exists = true;
  } catch {
    // 目标不存在是首次安装时的正常状态。
  }
  if (exists && !force) {
    throw new Error(
      `${destination} 已存在；先核对内容，确认覆盖时显式添加 --force`,
    );
  }
  await rm(temporary, { recursive: true, force: true });
  await cp(source, temporary, { recursive: true, force: false });
  if (exists) await rm(destination, { recursive: true, force: true });
  await rename(temporary, destination);
  installed.push({ client, destination });
}

console.log(JSON.stringify({ status: "ok", installed }, null, 2));
