import { repoRoot, run } from "./lib.mjs";

console.log(`正在安装购车决策助手：${repoRoot}`);
run("npm", ["ci"]);
run("npm", ["run", "release:verify"]);
console.log(JSON.stringify({ status: "ok", installed: true, external_calls: 0 }));
