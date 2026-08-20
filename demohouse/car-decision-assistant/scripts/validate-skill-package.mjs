import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skill = join(root, "skills", "car-decision-assistant");
const required = [
  "SKILL.md",
  "agents/openai.yaml",
  "scripts/status.mjs",
  "scripts/install.mjs",
  "scripts/configure.mjs",
  "scripts/setup-supabase.mjs",
  "scripts/start.mjs",
  "scripts/stop.mjs",
  "scripts/doctor.mjs",
  "scripts/acceptance.mjs",
  "references/setup.md",
  "references/acceptance.md",
  "references/evidence-policy.md",
  "references/troubleshooting.md",
];

for (const relative of required) await stat(join(skill, relative));

const [skillText, agentText] = await Promise.all([
  readFile(join(skill, "SKILL.md"), "utf8"),
  readFile(join(skill, "agents", "openai.yaml"), "utf8"),
]);
assert.match(skillText, /^---\nname: car-decision-assistant\n/m);
assert.match(skillText, /description: .+初始化与验收 Skill/);
assert.doesNotMatch(skillText, /\[TODO|TODO:/);
assert.match(agentText, /display_name: ["']购车决策助手["']/);
assert.match(agentText, /\$car-decision-assistant/);
assert.doesNotMatch(
  `${skillText}\n${agentText}`,
  new RegExp(
    [
      ["/Users", "bytedance"].join("/"),
      ["pious", "rose"].join("-"),
      ["agent", "plan", `${"212"}${"5089412"}`].join("-"),
      "ark-[A-Za-z0-9_-]{12,}",
    ].join("|"),
  ),
);

console.log(JSON.stringify({ status: "ok", skill: "car-decision-assistant", files: required.length }));
