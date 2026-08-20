import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { scanReleaseTree, scanTextForSecrets } from "../scripts/check-release-secrets.mjs";

test("release secret scan accepts empty examples and does not expose matched values", () => {
  assert.deepEqual(scanTextForSecrets("AGENT_PLAN_API_KEY=\nSUPABASE_SERVICE_ROLE_KEY=<your-key>\n", ".env.example"), []);

  const synthetic = ["ark", "aaaaaaaa", "bbbb", "cccc", "dddd", "eeeeeeeeeeee", "ffff"].join("-");
  const findings = scanTextForSecrets(`AGENT_PLAN_API_KEY=${synthetic}\n`, "unsafe.env");
  assert.ok(findings.some((finding) => finding.rule === "agent_plan_api_key"));
  assert.ok(findings.some((finding) => finding.rule === "configured_agent_plan_api_key"));
  assert.equal(JSON.stringify(findings).includes(synthetic), false);
});

test("release tree scan catches private config files and skips ignored dependency folders", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sales-release-secret-scan-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));

  await fs.mkdir(path.join(root, "node_modules"));
  await fs.writeFile(path.join(root, ".env.example"), "AGENT_PLAN_API_KEY=<your-key>\n");
  await fs.writeFile(path.join(root, ".env"), "AGENT_PLAN_API_KEY=synthetic-secret-value\n");
  await fs.writeFile(path.join(root, "node_modules", ".env"), "ignored=true\n");

  const findings = await scanReleaseTree(root);
  assert.deepEqual(findings, [{ rule: "forbidden_secret_file", path: ".env" }]);
});
