import assert from "node:assert/strict";
import test from "node:test";
import { resolveAgentPlanKey } from "../scripts/agent-plan-key.mjs";

test("secure dev runtime reuses an injected Agent Plan key", async () => {
  let prompted = false;
  const key = await resolveAgentPlanKey(
    { AGENT_PLAN_API_KEY: " test-key " },
    async () => {
      prompted = true;
      return "unexpected";
    },
  );

  assert.equal(key, "test-key");
  assert.equal(prompted, false);
});

test("secure dev runtime prompts only when the key is absent", async () => {
  const key = await resolveAgentPlanKey({}, async () => " prompted-key ");
  assert.equal(key, "prompted-key");
});
