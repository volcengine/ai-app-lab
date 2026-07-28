# 安全政策

## 报告安全漏洞

不要在公开 Issue 中发布凭证、利用细节或私密金融数据。请使用仓库的私密安全公告渠道，并提供受影响版本、复现步骤和影响说明。

## 凭证处理

- 不得提交 `.env` 文件或 API Key。
- 本地使用时，把凭证保存在 `~/.config/investment-assistant/credentials.env`，并将文件权限设为 `0600`。
- 凭证一旦出现在源码、日志、截图或 Issue 内容中，应立即轮换。
- 生产部署应使用托管平台提供的密钥管理服务。

## 支持版本

安全修复只面向最新发布的小版本提供。

## 依赖风险处理

项目将 `@modelcontextprotocol/sdk` 固定为 `1.29.0`，并把 `@hono/node-server` 覆盖为 `2.0.10`，用于处理 [GHSA-frvp-7c67-39w9](https://github.com/advisories/GHSA-frvp-7c67-39w9) 和 [GHSA-9mqv-5hh9-4cgg](https://github.com/advisories/GHSA-9mqv-5hh9-4cgg)。在 SDK 自身接受已修复的 Hono 版本范围前，不要移除该覆盖配置；任何调整后都必须重新执行完整验证、从公共仓库进行干净安装，并运行真实 DataPro 健康探测。
