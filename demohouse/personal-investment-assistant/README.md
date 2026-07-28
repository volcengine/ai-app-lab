# 个人投资助手

一个本地优先、来源可追溯的个人投资研究助手。完整前后端已经包含在仓库中：React 负责桌面端界面，Express 提供 API，SQLite 保存关注列表、报告、来源、监控设置和执行历史，内置调度器负责盘后自动检查。

应用通过 Agent Plan Harness 使用三类真实能力：

- DataPro：行情、财务和其他专业金融数据。
- 豆包搜索：最新公开网页信息。
- Agent Plan 模型：只基于本次证据生成并审校报告。

仓库不内置演示公司、固定报告或 Mock Provider。

## 使用一个 Skill 完成初始化

开源用户不需要讨论网站设计，也不需要自己搭前后端。可以直接把下面这句话发给支持联网和终端操作的 Codex 或 Claude Code：

```text
帮我初始化个人投资助手：https://github.com/volcengine/ai-app-lab/blob/main/demohouse/personal-investment-assistant/skills/investment-assistant/SKILL.md
```

该地址直接指向中文 Skill 入口。Codex 或 Claude Code 会获取完整仓库，安装与当前客户端匹配的 Skill，并进入同一套初始化流程。

需要固定版本时，也可以使用独立仓库中的 `v0.3.0` 入口：

```text
帮我初始化个人投资助手：https://github.com/3494036618-eng/personal-investment-assistant/blob/v0.3.0/skills/investment-assistant/SKILL.md
```

已经安装中文 Skill 后：

```text
# Codex
请使用 $investment-assistant 初始化我的个人投资助手。

# Claude Code
/investment-assistant 初始化我的个人投资助手
```

Skill 会先收集用户配置：

1. 真实证券名称、代码和市场。
2. 每只证券独立的关注偏好。
3. 是否启用盘后自动检查。
4. 启用时的时间、执行日和时区。

用户确认完整配置后，Skill 会安装仓库内的正式应用、私密配置 Agent Plan、真实探测三个 Provider、启动网站、导入关注列表，并为每只股票生成一份个股简评和一份盘后风险摘要。正常交付时，用户打开网站时已经有内容，而不是空首页。

## 前置条件

- Node.js 22.13 或更高版本。
- npm。
- 已开通并启用 DataPro、豆包搜索 Harness 的 Agent Plan。
- 一枚有效的 Agent Plan API Key。

默认只需要一枚 Agent Plan Key。应用使用同一 Key 调用 Agent Plan 模型、DataPro 和豆包搜索；`DATAPRO_API_KEY` 与 `WEB_SEARCH_API_KEY` 仅保留为明确需要独立覆盖凭证时的高级配置。

## 安装 Skill

Codex：

```bash
npm run skill:install:codex
```

Claude Code：

```bash
npm run skill:install:claude
```

同时安装到两个客户端：

```bash
npm run skill:install:all
```

更新已有 Skill 时在对应命令后追加 `-- --force`。Codex 安装位置为
`${CODEX_HOME:-~/.codex}/skills/investment-assistant`；Claude Code 安装位置为
`${CLAUDE_CONFIG_DIR:-~/.claude}/skills/investment-assistant`。Claude Code 通常会实时
检测已有 Skill 目录的变化；若当前会话没有出现 `/investment-assistant`，重新启动客户端。

## Skill 的实际流程

1. 检查应用和后端当前状态。
2. 逐只确认证券、代码、市场和关注偏好。
3. 确认盘后监控安排。
4. 展示结构化配置摘要，等待用户确认。
5. 安装并构建现成应用。
6. 通过隐藏输入配置 Agent Plan Key。
7. 真实探测 DataPro、豆包搜索和 Agent Plan 模型。
8. 导入个性化配置。
9. 为每只证券生成两类首批报告。
10. 检查来源、历史、调度和桌面端用户路径。

完整规则见 [SKILL.md](skills/investment-assistant/SKILL.md)。

## 手动初始化

Skill 会把用户确认的配置写入权限为 `0600` 的临时 JSON：

```json
{
  "stocks": [
    {
      "name": "贵州茅台",
      "code": "600519",
      "exchange": "CN",
      "focus": ["盈利能力", "品牌优势", "渠道库存", "行业动态"],
      "monitor": {
        "enabled": true,
        "schedule_time": "18:00",
        "schedule_days": ["Mon", "Tue", "Wed", "Thu", "Fri"],
        "timezone": "Asia/Shanghai"
      }
    }
  ]
}
```

随后执行：

```bash
node skills/investment-assistant/scripts/onboard.mjs \
  --profile /私密Profile绝对路径.json \
  --consume-profile
```

该命令默认完成安装、真实探测、启动、导入和全量首批报告生成。首批生成会调用真实服务并消耗套餐额度。只有用户明确要求暂不生成时才添加：

```bash
--skip-initial-reports
```

## 分步命令

```bash
# 安装、检查、测试和构建仓库内应用
node skills/investment-assistant/scripts/install.mjs

# 隐藏输入一枚 Agent Plan Key
node skills/investment-assistant/scripts/configure.mjs

# 真实探测三个 Provider
node skills/investment-assistant/scripts/doctor.mjs --live

# 启动网站
node skills/investment-assistant/scripts/start.mjs

# 导入关注偏好
node skills/investment-assistant/scripts/profile.mjs \
  --input /私密Profile绝对路径.json \
  --consume-profile

# 为全部证券生成首份简评和盘后摘要
node skills/investment-assistant/scripts/acceptance.mjs --all --seed
```

默认网站地址是 `http://127.0.0.1:8788`。

## 两类报告

### 个股简评

回答“这家公司当前怎么样”，固定结构为：

- 精简摘要。
- 市场表现。
- 经营与财务。
- 关注方向。
- 后续观察。

### 盘后风险摘要

回答“本次检查窗口内出现了什么变化”，固定结构为：

- 精简风险摘要。
- 市场异动。
- 公司事件。
- 外部风险。
- 后续观察。

两类报告使用不同检索意图、时间窗口、证据快照、正文结构和历史记录。首批验收会阻止两类报告复用同一联网 URL。

## 个性化偏好

偏好不是页面标签。它会进入真实检索、证据覆盖合同、报告栏目和盘后监控：

- 每只证券单独保存关注方向。
- 支持用户自然语言，不限制在预设关键词中。
- 复合偏好会被拆成可独立核验的子主题。
- 已有证据的主题才能进入对应正文。
- 没有证据的主题保留为内部待观察状态，不用无关材料凑正文。

## 真实可用的判断

以下三项缺一不可：

1. `doctor.mjs --live` 中 `datapro`、`web_search`、`agent_plan_model` 均成功。
2. `acceptance.mjs --all --seed` 为每只证券生成两类报告并验证来源与历史。
3. 浏览器实际走通首页、两个报告详情、来源跳转、监控设置和立即执行。

`/api/health/live` 只表示进程存活；`/api/health/ready` 还要求最近一次真实 Provider 探测有效。

## 日常运维

```bash
node skills/investment-assistant/scripts/status.mjs
node skills/investment-assistant/scripts/doctor.mjs --live
node skills/investment-assistant/scripts/usage.mjs
node skills/investment-assistant/scripts/stop.mjs
node skills/investment-assistant/scripts/backup.mjs
node skills/investment-assistant/scripts/restore.mjs /备份文件.sqlite --yes
```

凭证保存在 `~/.config/investment-assistant/credentials.env`，权限为 `0600`。应用运行时、SQLite、日志和备份位于 `~/.local/share/investment-assistant`。更新应用不会主动删除数据库或凭证。

## 本地开发

```bash
npm run app:install
npm run app:check
npm run app:test
npm run app:build
npm run app:dev
```

开发模式前端默认是 `http://127.0.0.1:5174`，API 是 `http://127.0.0.1:8788`。生产模式由 API 进程直接提供构建后的静态页面。

## 目录结构

```text
app/
├── src/server/
├── src/web/
└── tests/

skills/
└── investment-assistant/
    ├── SKILL.md
    ├── agents/openai.yaml
    ├── scripts/
    └── references/

scripts/
├── Codex 与 Claude Code 安装器
└── 仓库级 Skill 验证脚本
```

## 安全与免责声明

默认服务只监听本机回环地址。公网部署需要额外配置 TLS、认证、授权、Secret Manager、备份和审计。详见 [SECURITY.md](SECURITY.md)、[PRIVACY.md](PRIVACY.md) 和 [SUPPORT.md](SUPPORT.md)。

本项目仅用于信息整理和研究辅助，不构成证券投资建议、收益承诺、目标价、仓位或交易指令。数据、网页和模型输出可能存在延迟、缺失和错误，使用者仍需核对交易所公告、公司披露及其他一手资料。

本项目是独立开源项目，不代表火山引擎、DataPro、豆包搜索或其他第三方的官方立场。文档中出现的产品名称和商标仅用于说明兼容能力，相关权利归各自权利人所有。

## 许可证

Apache License 2.0，详见 [LICENSE](LICENSE)。第三方数据与网页内容仍受对应服务条款、许可和著作权约束。
