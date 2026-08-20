import assert from "node:assert/strict";

export async function readHiddenSecret({
  input = process.stdin,
  output = process.stdout,
  prompt = "请输入 Agent Plan API Key（输入不会显示）：",
} = {}) {
  assert.ok(
    input.isTTY && output.isTTY && typeof input.setRawMode === "function",
    "当前不是交互式终端，请先通过环境变量 AGENT_PLAN_API_KEY 注入 Key",
  );

  output.write(prompt);
  input.setEncoding("utf8");
  input.resume();
  input.setRawMode(true);

  return new Promise((resolve, reject) => {
    let secret = "";
    const cleanup = () => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
    };
    const onData = (chunk) => {
      for (const character of String(chunk)) {
        if (character === "\u0003") {
          cleanup();
          output.write("\n");
          reject(new Error("已取消输入 Agent Plan API Key"));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          output.write("\n");
          resolve(secret.trim());
          return;
        }
        if (character === "\u007f" || character === "\b") {
          secret = secret.slice(0, -1);
          continue;
        }
        if (character >= " " && character !== "\u007f") {
          secret += character;
        }
      }
    };
    input.on("data", onData);
  });
}

export async function resolveAgentPlanKey(
  environment = process.env,
  promptForSecret = readHiddenSecret,
) {
  const configured = environment.AGENT_PLAN_API_KEY?.trim();
  if (configured) {
    return configured;
  }
  const entered = (await promptForSecret()).trim();
  assert.ok(entered, "Agent Plan API Key 不能为空");
  return entered;
}
