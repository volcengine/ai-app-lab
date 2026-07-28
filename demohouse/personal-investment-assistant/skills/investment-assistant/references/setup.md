# 安装与凭证配置

## 前置条件

- Node.js 22.13 或更高版本。
- npm。
- 已开通火山方舟 Agent Plan。
- Agent Plan 已启用 DataPro 和豆包搜索 Harness。
- 一枚有效的 Agent Plan API Key。

官方入口：

- Agent Plan 控制台：<https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement?LLM=%7B%7D&advancedActiveKey=agentPlan>
- 方舟 API Key：<https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey?apikey=%7B%7D>
- 豆包搜索：<https://console.volcengine.com/search-infinity/web-search>

默认使用同一枚 Agent Plan Key 调用模型、DataPro 和豆包搜索。用户不需要再为 Skill 准备第二枚搜索 Key。

## 本地目录

- 克隆仓库中的开源应用源码：仓库根目录 `app/`
- Codex 个人 Skill：`${CODEX_HOME:-~/.codex}/skills/investment-assistant`
- Claude Code 个人 Skill：`${CLAUDE_CONFIG_DIR:-~/.claude}/skills/investment-assistant`
- 已安装 Skill 中的应用安装包：`{baseDir}/assets/app`
- 生产运行时：`~/.local/share/investment-assistant/app`
- SQLite：`~/.local/share/investment-assistant/investment-assistant.sqlite`
- PID：`~/.local/share/investment-assistant/run`
- 日志：`~/.local/share/investment-assistant/logs`
- 凭证：`~/.config/investment-assistant/credentials.env`

凭证文件权限为 `0600`。可用 `INVESTMENT_ASSISTANT_HOME`、`INVESTMENT_ASSISTANT_CONFIG_HOME` 和 `INVESTMENT_ASSISTANT_CREDENTIALS_FILE` 覆盖默认位置。

## 安装到 Agent 客户端

在仓库根目录按实际客户端执行：

```bash
# Codex
npm run skill:install:codex

# Claude Code
npm run skill:install:claude
```

需要同时安装时执行 `npm run skill:install:all`。更新已有 Skill 时追加 `-- --force`。
两个客户端安装的是同一份 `SKILL.md`、脚本、参考规则和应用包，不存在两套业务逻辑。
Codex 使用 `$investment-assistant`，Claude Code 使用 `/investment-assistant` 触发。

## 一键初始化

先让用户确认股票、代码、市场、关注偏好和监控安排，再把确认结果写成权限为 `0600` 的 Profile。执行：

```bash
node {baseDir}/scripts/onboard.mjs \
  --profile /私密Profile绝对路径.json \
  --consume-profile
```

命令依次完成：

1. 停止旧实例。
2. 从仓库内正式应用安装依赖。
3. 执行静态检查、测试和生产构建。
4. 检查或隐藏输入 Agent Plan Key。
5. 真实探测 DataPro、豆包搜索和 Agent Plan 模型。
6. 启动网站。
7. 幂等导入 Profile。
8. 为每只股票生成一份个股简评和一份盘后风险摘要。
9. 检查来源、偏好覆盖和两类历史记录。

首批生成会产生真实服务用量。只有用户明确要求暂不生成时才添加 `--skip-initial-reports`。

## 分步安装

```bash
node {baseDir}/scripts/install.mjs
node {baseDir}/scripts/configure.mjs
node {baseDir}/scripts/doctor.mjs --live
node {baseDir}/scripts/start.mjs
node {baseDir}/scripts/profile.mjs --input /Profile绝对路径.json --consume-profile
node {baseDir}/scripts/acceptance.mjs --all --seed
```

`install.mjs` 默认安装随 Skill 分发的正式应用。维护者需要验证另一份兼容源码时才使用 `--source`。

`configure.mjs` 只询问一枚 Agent Plan Key，输入不回显。写入后：

- `ARK_API_KEY` 保存该 Key。
- DataPro 默认继承 `ARK_API_KEY`。
- 豆包搜索默认继承 `ARK_API_KEY`。

`DATAPRO_API_KEY` 与 `WEB_SEARCH_API_KEY` 仍可作为高级覆盖项，但不属于正常初始化要求。

## 健康语义

- `/api/health/live`：只表示进程存活。
- `/api/health/ready`：要求三个 Provider 最近一次真实探测均成功且未过期。
- `doctor.mjs --live`：当前连通性探测，会产生少量真实调用。

默认 Provider 健康证明有效 15 分钟，可用 `PROVIDER_HEALTH_TTL_MS` 调整。探测成功不代表套餐余量足够生成全部报告；可用 `arkcli usage plan --product agent-plan` 查看 Agent Plan 用量。

## 更新与恢复

```bash
node {baseDir}/scripts/backup.mjs
node {baseDir}/scripts/stop.mjs
node {baseDir}/scripts/install.mjs
node {baseDir}/scripts/doctor.mjs --live
node {baseDir}/scripts/start.mjs
```

安装使用临时目录和原子替换。失败时保留旧运行时；更新不会主动删除 SQLite 或凭证。

恢复数据库：

```bash
node {baseDir}/scripts/restore.mjs /备份文件.sqlite --yes
```

## 远程部署边界

默认只监听 `127.0.0.1`，定位为单用户本地应用。公网部署必须额外提供 TLS、身份认证、访问控制、密钥托管、备份、日志策略和速率限制。
