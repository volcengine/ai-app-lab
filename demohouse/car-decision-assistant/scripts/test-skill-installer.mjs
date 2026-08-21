import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sandbox = await mkdtemp(join(tmpdir(), "car-skill-install-"));
const targetRoot = join(sandbox, "skills");

try {
  const result = spawnSync(
    process.execPath,
    [
      join(root, "scripts", "install-agent-skill.mjs"),
      "--target",
      "codex",
      "--target-dir",
      targetRoot,
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const installed = join(targetRoot, "car-decision-assistant");
  await Promise.all([
    access(join(installed, "SKILL.md")),
    access(join(installed, "agents", "openai.yaml")),
    access(join(installed, "scripts", "status.mjs")),
  ]);
  assert.match(
    await readFile(join(installed, "SKILL.md"), "utf8"),
    /name: car-decision-assistant/,
  );
  console.log(JSON.stringify({ status: "ok", isolated_install: true }));
} finally {
  await rm(sandbox, { recursive: true, force: true });
}
