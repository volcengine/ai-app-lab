process.stderr.write([
  "此旧脚本已停用：它曾使用内存仓库和 Mock Provider，不能作为真实链路验收证据。",
  "最小只读 Provider 诊断请运行：npm run doctor:live",
  "完整业务链路验收请运行：npm run verify:business -- --help",
  "",
].join("\n"));
process.exitCode = 1;
