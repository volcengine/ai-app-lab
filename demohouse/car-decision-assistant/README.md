# 购车决策助手

一个面向个人购车者的开源全栈应用。用户用自然语言说明真实用车需求，选择 1–3 款候选车；系统核验精确车型、配置和城市车系月度数据，并把每项要求标为“已确认 / 不符合 / 待确认”。

它不是车型推荐榜单，也不会用模型常识补齐汽车事实。主观体验、真实落地价和销售承诺由用户本人记录，专业事实保留来源时间与 trace/request ID。

> 本项目用于整理购车条件和核验依据，不构成购买、价格、保险、金融或安全建议。

## 最快使用方式

可把下面一句话交给支持联网和终端操作的 Codex 或 Claude Code：

```text
帮我初始化购车决策助手：https://github.com/3494036618-eng/car-decision-assistant/blob/v0.1.0/skills/car-decision-assistant/SKILL.md
```

Skill 会下载同一版本的完整仓库，检查本机环境，引导用户选择自己的 AI Native 应用开发底座 Workspace，私密配置 Agent Plan Key，安装依赖、启动网站并执行真实验收。Skill 不会把密钥写入仓库或聊天，也不会未经确认创建、暂停或删除云资源。

本地已有仓库时，也可以安装 Skill：

```bash
npm ci
npm run skill:install:codex
# 或 npm run skill:install:claude
```

## 前置条件

- Node.js `>=22.15.0`
- 已购买并可使用 Agent Plan
- 已在“配置 Harness”中开启并授权“专业数据集”
- 一个属于当前用户的“AI Native 应用开发底座”Workspace
- `byted-supabase-cli` 已安装并完成火山账号登录

项目不会内置公共演示账号、共享 Key 或作者的 Workspace ID。

## 产品边界

- 支持 1–3 款候选车；每款车只进行一次精确车型确认。
- Agent Plan 模型只负责结构化用户需求，不生成车型事实。
- 专业数据集负责精确车型配置和城市车系月度数据。
- 专业数据集返回原生车型 code 时冻结该 code；未返回 code 时冻结“来源 + 精确版本名”的名称标识，并明确标注，不伪造上游 ID。
- 指导价只能作为参考，不能替代包含保险、税费和服务费的真实落地报价。
- 晕车、舒适度、空间感受、异味、补能便利性等由用户本人确认。
- 当前版本不接入豆包搜索，不自动核验口碑、保值率、保险成本或公开网页信息。
- 单个专业数据步骤失败时保留其他已返回结果，并显示缺失原因；不借用其他版本数据。

完整事实边界见 [数据与证据规则](./docs/data-and-evidence-policy.md)，自然语言需求的拆分、追踪和扩展方式见 [需求工程说明](./docs/requirements-engineering.md)。

## 技术结构

- Vinext + React 19 + TypeScript
- 火山引擎 AI Native 应用开发底座（基于 Supabase）：PostgreSQL、RLS、匿名项目和恢复码
- Agent Plan：自然语言需求结构化
- 专业数据集：车型配置和城市车系月度数据

主要目录：

- `app/`：单页前端与 API Routes
- `lib/decision/`：确定性决策规则和三态聚合
- `lib/harness/`：Agent Plan、专业数据集客户端、超时和重试
- `lib/storage/`、`lib/supabase/`：项目存储与 AI Native 应用开发底座客户端
- `supabase/`：Schema、RLS 和原子保存函数
- `skills/car-decision-assistant/`：安装、配置、启动和验收 Skill
- `tests/`：页面、规则、车型、销量、存储和 Harness 测试

## 手动配置与运行

先在用户明确选择的 Workspace 中执行 [supabase/001_initial_schema.sql](./supabase/001_initial_schema.sql)。具体命令和安全边界见 [supabase/README.md](./supabase/README.md)。

随后显式设置当前用户自己的 Workspace 信息：

```bash
export SUPABASE_WORKSPACE_ID="<workspace-id>"
export SUPABASE_CLI_PROFILE="agent-plan"
export SUPABASE_REGION="cn-beijing"
npm run dev:supabase -- --host 127.0.0.1 --port 3003
```

`dev:supabase` 会从 `byted-supabase-cli` 登录态读取服务端地址和 Key，并在交互式终端隐藏读取 Agent Plan Key。凭证只注入服务端子进程，不写入项目文件。

不接入真实云服务、只调试页面和构建时运行：

```bash
npm run dev -- --host 127.0.0.1 --port 3003
```

## 验证

```bash
npm run verify
npm run release:verify
```

`verify` 执行 ESLint、TypeScript、生产构建和单元测试。`release:verify` 额外检查公开文件、Skill 包与隔离安装流程，不调用真实 Harness 能力。

以下命令会访问真实云资源，执行前必须确认当前 Workspace 和额度：

```bash
npm run test:supabase:live
npm run test:scenarios:live
```

- `test:supabase:live`：创建、读取、并发冲突、恢复轮换、匿名隔离和删除。
- `test:scenarios:live`：杭州、上海、成都三组真实场景，调用 Agent Plan 与专业数据集，并清理验收项目。

HTTP 200、进程存活或 `npm run verify` 通过都不等于真实业务可用。正式交付必须同时通过依赖安装、真实 Harness 能力、AI Native 应用开发底座、三场景和浏览器验收。

## 隐私与安全

- 浏览器通过 HttpOnly Cookie 关联匿名项目。
- 数据库只保存编辑令牌和恢复码的 SHA-256 摘要。
- 恢复项目后轮换编辑令牌，旧 Cookie 失效。
- 项目默认在最后一次更新后保存 90 天，用户可以删除项目及关联记录。
- `SUPABASE_SERVICE_ROLE_KEY` 和 `AGENT_PLAN_API_KEY` 只能存在于服务端私密环境。
- V1 不保存完整专业数据原始响应，只保存必要摘要和来源追踪字段。

开源使用前请阅读 [SECURITY.md](./SECURITY.md)、[PRIVACY.md](./PRIVACY.md) 和 [SUPPORT.md](./SUPPORT.md)。

## 项目状态

当前版本是自托管开源应用，适合本机或受控环境使用，不承诺公网 SaaS、持续可用性、完整车型覆盖或数据源 SLA。已知限制记录在 [CHANGELOG.md](./CHANGELOG.md)。

## 许可证

本项目采用 [Apache License 2.0](./LICENSE)。第三方服务、数据和商标分别受其提供方条款约束；本仓库不包含第三方汽车数据库。
