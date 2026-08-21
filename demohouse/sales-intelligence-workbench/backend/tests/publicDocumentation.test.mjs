import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDir, "../..");
const docsRoot = path.join(projectRoot, "docs");
const hasPublicDocs = fs.existsSync(path.join(docsRoot, "api", "api-contract.md"));

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

test("public API contract documents the current sales workbench only", {
  skip: !hasPublicDocs,
}, () => {
  const contract = read("docs/api/api-contract.md");
  assert.match(contract, /\/api\/sales-goals/);
  assert.match(contract, /\/api\/target-enterprises/);
  assert.doesNotMatch(contract, /\/api\/change-cards/);
  assert.doesNotMatch(contract, /competitive-change-card/i);
});

test("public documentation points to versioned migrations and current authentication", {
  skip: !hasPublicDocs,
}, () => {
  const index = read("docs/README.md");
  const schema = read("docs/database/supabase-schema.md");
  const security = read("SECURITY.md");

  assert.doesNotMatch(index, /supabase-schema\.sql/);
  assert.match(schema, /supabase\/migrations\//);
  assert.doesNotMatch(schema, /docs\/open-source\//);
  assert.match(security, /Supabase Auth/);
  assert.doesNotMatch(security, /does not yet include HTTP user authentication/i);
});
