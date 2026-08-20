import fs from "node:fs";

import { paths } from "./lib.mjs";

let removed = false;
try {
  fs.unlinkSync(paths.cliSessionFile);
  removed = true;
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

console.log(removed ? "已删除本机 CLI 登录会话。" : "本机没有已保存的 CLI 登录会话。");
