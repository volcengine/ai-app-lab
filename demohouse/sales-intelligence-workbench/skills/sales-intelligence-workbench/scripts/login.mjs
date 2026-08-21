import fs from "node:fs";
import { createInterface } from "node:readline/promises";

import {
  ensureDirectories,
  paths,
  readOption,
  serverAddress,
  writePrivateJson,
} from "./lib.mjs";

function hasFlag(name) {
  return process.argv.slice(2).includes(name);
}

async function promptLine(label) {
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return String(await reader.question(label)).trim();
  } finally {
    reader.close();
  }
}

async function promptSecret(label) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("当前终端不支持隐藏输入；请同时使用 --username 和 --password-stdin。");
  }
  return new Promise((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
    };
    const onData = (chunk) => {
      for (const character of String(chunk)) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("已取消登录。"));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          if (value) {
            value = [...value].slice(0, -1).join("");
            process.stdout.write("\b \b");
          }
          continue;
        }
        if (character >= " ") {
          value += character;
          process.stdout.write("*");
        }
      }
    };
    process.stdout.write(label);
    process.stdin.setEncoding("utf8");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

function parseResponse(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

async function main() {
  ensureDirectories();
  const apiUrl = readOption("--api-url") || serverAddress().url;
  let username = readOption("--username") || readOption("--email") || "";
  if (!username) username = await promptLine("工作台用户名：");
  const password = hasFlag("--password-stdin")
    ? fs.readFileSync(0, "utf8").replace(/[\r\n]+$/, "")
    : await promptSecret("工作台登录密码：");

  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/api/auth/cli-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const payload = parseResponse(await response.text());
  if (!response.ok) {
    throw new Error(payload?.error?.message || `工作台登录失败（HTTP ${response.status}）。`);
  }
  const session = payload.data || payload;
  if (!session.access_token || !session.refresh_token) {
    throw new Error("服务端未返回有效的 CLI 会话。");
  }
  const issuedAt = Date.now();
  writePrivateJson(paths.cliSessionFile, {
    api_url: apiUrl.replace(/\/$/, ""),
    token_type: "bearer",
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: Number(session.expires_in) || 3600,
    issued_at: new Date(issuedAt).toISOString(),
    expires_at: new Date(issuedAt + (Number(session.expires_in) || 3600) * 1000).toISOString(),
    user: {
      id: session.user?.id || "",
      username: session.user?.username || username,
      display_name: session.user?.display_name || username,
    },
  });
  console.log(`CLI 登录成功：${session.user?.display_name || username}`);
  console.log(`会话已以 0600 权限保存到：${paths.cliSessionFile}`);
}

main();
