import path from "node:path";
import {
  assertInstalledApp,
  commandExists,
  paths,
  run,
  runtimeEnvironment,
  serverAddress,
  writePrivateJson,
} from "./lib.mjs";

assertInstalledApp();
if (!commandExists("lark-cli")) throw new Error("找不到 lark-cli，请先安装并完成用户登录。");

const userArgs = process.argv.slice(2);
const valueAfter = (name) => {
  const index = userArgs.indexOf(name);
  return index >= 0 ? String(userArgs[index + 1] || "").trim() : "";
};
const documentTarget = valueAfter("--doc");
const p2pTarget = valueAfter("--p2p-user");
const chatTarget = valueAfter("--chat-id");
if (documentTarget && !/^https:\/\/\S+$/i.test(documentTarget)) {
  throw new Error("--doc 只接受完整的 https:// 飞书云文档或知识库链接。");
}
if (p2pTarget && /^ou_/i.test(p2pTarget)) {
  throw new Error("--p2p-user 只接受联系人姓名，不接受 Open ID。");
}
if (chatTarget && !/^oc_[A-Za-z0-9]+$/.test(chatTarget)) {
  throw new Error("--chat-id 必须是 oc_ 开头的飞书会话 ID。");
}
if (userArgs.includes("--message-query")) {
  throw new Error("销售工作台只提供按联系人姓名、会话 ID 或云文档链接导入。");
}
const args = [path.join(paths.installedApp, "backend", "scripts", "import-feishu-cli.mjs")];
if (!userArgs.includes("--api-url")) args.push("--api-url", serverAddress().url);
if (!userArgs.includes("--auth-session")) args.push("--auth-session", paths.cliSessionFile);
args.push(...userArgs);

const result = run(process.execPath, args, {
  cwd: path.join(paths.installedApp, "backend"),
  env: runtimeEnvironment(),
  allowFailure: true,
});
if (result.status !== 0) {
  process.exitCode = result.status;
} else if (!userArgs.includes("--dry-run")) {
  const sourceKind = userArgs.includes("--doc")
    ? "feishu_doc"
    : userArgs.includes("--p2p-user")
      ? "feishu_p2p"
      : userArgs.includes("--chat-id")
        ? "feishu_chat"
        : "feishu";
  writePrivateJson(paths.historyImportReceiptFile, {
    schema_version: 1,
    ok: true,
    imported_at: new Date().toISOString(),
    company_id: valueAfter("--company-id") || null,
    source_kind: sourceKind,
  });
}
