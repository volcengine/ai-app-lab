# Security Policy

## Supported Versions

| Version | Security updates |
|---|---|
| `0.1.x` | Supported |
| Earlier development snapshots | Not supported |

## Reporting a Vulnerability

请不要在公开 Issue 中披露未修复的漏洞、凭证或敏感化学数据。

优先在本仓库的 **Security** 页面选择 **Report a vulnerability**，
使用 GitHub Private Vulnerability Reporting 私密提交。

报告应尽量包含：

- 受影响的 Skill、文件和版本；
- 最小复现输入；
- 实际行为和预期行为；
- 影响范围；
- 已知缓解措施；
- 日志中的凭证和敏感结构应先脱敏。

维护者会确认报告并评估修复与披露方式。尚未确认修复时间前，不承诺固定响应时限。

## Security Boundaries

- 本项目处理不可信 JSON、CSV、SDF、MolBlock、reaction SMILES 和路线文件，但不提供操作系统级沙箱。
- 在受信任的隔离环境中运行第三方输入，限制文件大小、记录数、CPU、内存和网络。
- 在线身份解析与 ORD 检索会把查询发送给第三方服务；保密内容应禁用在线 provider。
- 输出中的来源、许可证和内容哈希不构成数字签名。
- 化学 QC、结构可解析或先例命中不构成实验安全审查。
