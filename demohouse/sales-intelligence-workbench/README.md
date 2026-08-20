# 销售智能工作台

销售智能工作台把企业专业数据、公开信息、飞书资料和长期记忆组织成可追溯的企业档案与资料问答。项目包含完整前后端、AI Native 应用开发底座（Supabase）数据层、Agent 记忆（OpenViking）链路，以及可在 Codex 和 Claude Code 中安装并运维应用的同一份 Skill。

> 当前为 `0.10.0` 自托管开源版，支持单工作区、单管理员，以及本机或受控内网部署。已支持 Supabase Auth、工作区数据隔离、安全请求边界、工作区级付费任务保护、持久化异步任务队列和独立 Worker。当前版本不提供公网托管 SaaS、多人协作或 SLA；不要把 Node.js 服务端口直接暴露到公网。

## 核心能力

- 通过专业数据集（DataPro）解析真实企业主体并加入目标企业池。
- 由受约束的档案 Agent 仅使用专业数据集（DataPro）和豆包搜索（联网搜索）的已核验证据生成最新档案，避免内部资料混入外部事实报告。
- 使用 Codex CLI 调度飞书 CLI，增量导入云文档、群聊、单聊或消息搜索结果。
- 将飞书资料正文和资料问答会话按 Workspace、企业隔离写入 Agent 记忆（OpenViking），并在问答前真实检索和恢复。
- 使用 AI Native 应用开发底座（Supabase）保存企业、档案版本、引用、任务、工作区归属、Provider 运行记录，以及资料与会话的同步元数据。
- 后端记录任务状态、失败原因、模型 Token 和 Provider 调用证据，供诊断接口与日志审计；正式业务前端不展示后台配置和运维信息。
- 通过 Supabase Auth 保护业务与付费调用；首次使用设置一个本机管理员用户名和密码，不需要邮箱、邮件确认或用户注册。
- 企业搜索、档案、问答、资料导入、Agent 记忆（OpenViking）同步/提交和资源删除统一经过工作区级并发与每日次数保护。
- 连续可重试的 Provider 故障达到阈值后会临时熔断；冷却结束只放行一次恢复探测，避免持续超时拖垮工作台。
- 档案生成和 Agent 记忆（OpenViking）批量同步通过 AI Native 应用开发底座（Supabase）持久化队列交给独立 Worker；页面可恢复任务进度。运行中取消采用“请求取消—安全检查点确认”机制，不会在 Provider 调用尚未结束时提前释放付费预约或允许并行重试。
- 档案证据按专业、官方公开、可追溯公开和内部授权资料分级，并校验公开来源时效、关键数字冲突及高风险事实双来源一致性；验证码、访问拦截和无实质内容页面不会进入报告证据。
- 提供安装、配置、诊断、启停、迁移、备份、恢复、升级和卸载命令。

## 真实性原则

- 项目只连接真实 Provider 和 AI Native 应用开发底座（Supabase）。配置或依赖不完整时明确失败，不生成演示数据、固定档案或静态替代结果。
- 档案必须用专业数据集（DataPro）锚定法定主体，并只使用专业数据集与豆包搜索（联网搜索）的直接证据。引用按相关性和独立性去重，不为凑数量引入弱来源；高风险事实和关键数字继续执行双来源规则。
- 档案 Agent 固定生成六个章节，服务端负责确定性组装、事实与引用校验、有界重试、检查点恢复和重复版本抑制。成功结果必须结构完整且可核验，详细协议见 [档案 Agent 工程设计](docs/architecture/dossier-agent.md)。

## 架构

```text
浏览器
  -> 同源 Node.js 服务
     -> /api
        -> 销售业务编排
           -> AI Native 应用开发底座（Supabase）持久化任务队列
独立 Worker
  -> 原子领取任务与续租
  -> 专业数据集（DataPro）/ 豆包搜索（联网搜索）
  -> 档案 Agent（Agent Plan 模型 + 强制函数提交 + 服务端质量门禁）
  -> Agent 记忆（OpenViking）/ AI Native 应用开发底座（Supabase）Data API

Codex CLI / 前端导入入口
  -> 飞书 CLI
  -> 受控导入任务
     -> Agent 记忆（OpenViking）保存资料正文
     -> AI Native 应用开发底座（Supabase）保存来源、游标和业务索引
```

AI Native 应用开发底座（Supabase）是结构化业务事实库；Agent 记忆（OpenViking）是飞书资料正文、资料问答 Session 和长期记忆的唯一内容存储。两者通过稳定的企业、来源、资料和会话 ID 关联，不重复保存正文或问答内容。

## 使用 Skill 从 0 搭建

### 面向最终用户：一句话初始化

当前独立发行仓库的版本化初始化入口为：

> 帮我初始化销售助手：`https://github.com/3494036618-eng/sales-intelligence-workbench/blob/v0.10.0/skills/sales-intelligence-workbench/SKILL.md`

该 URL 直接指向唯一的正式 Skill。即使用户本机没有仓库、依赖和配置文件，当前 Agent 也会
先解释下载与本机写入影响，再从 URL 指定的版本取得完整仓库，执行离线校验，并把同一份
Skill 安装到当前客户端后立即衔接下面的 Cookbook 搭建流程。读取 URL、下载仓库和离线校验
不会创建云资源或产生 AFP。

初始化入口必须固定到已发布的 tag 或经过审核的 commit SHA。也可以用仓库脚本生成口令：

```bash
npm run skill:command -- \
  --repository https://github.com/3494036618-eng/sales-intelligence-workbench \
  --ref v0.10.0
```

这里的“从 0 搭建”不等于绕过第三方服务授权：用户仍需拥有 Agent Plan，并在控制台开启
专业数据集（DataPro）、豆包搜索（联网搜索）、Agent 记忆（OpenViking）和
AI Native 应用开发底座（Supabase），再按需完成飞书资料授权。用户侧只输入一枚
Agent Plan Key；Agent 记忆（OpenViking）与 AI Native 应用开发底座（Supabase）的内部连接信息由 Skill 自动获取和私密保存，不要求
第二个 Key、Supabase Key 或火山 AK/SK。Skill 负责识别缺项、逐步引导、写入本机私密配置和验收。

不同账号授权、资料范围和部署环境会影响真实链路结果；安装和部署时必须运行当前版本的
自动验证，并在目标环境完成配置、权限和业务链路检查。

### 面向维护者：本地安装

克隆仓库后，在仓库根目录按使用的客户端安装同一份 Skill：

```bash
npm run skill:install:codex
npm run skill:install:claude
```

同时使用两个客户端时可以一次安装：

```bash
npm run skill:install:all
```

`npm run skill:install` 保留为 Codex 安装别名。安装目录分别是
`${CODEX_HOME:-~/.codex}/skills/sales-intelligence-workbench` 和
`${CLAUDE_CONFIG_DIR:-~/.claude}/skills/sales-intelligence-workbench`，两端不共享或覆盖配置目录。

重新启动对应客户端后直接描述业务目标：

> 按 Cookbook 步骤帮我搭建销售团队工作台。目标是服务新能源汽车企业客户，历史资料来自飞书云文档和会话，部署在本机。

也可以明确输入：

> 请使用 $sales-intelligence-workbench 搭建我的销售团队工作台。

在 Claude Code 中也可以输入：

> /sales-intelligence-workbench

Skill 会先确认销售目标和资料范围，再通过可恢复的安全编排器安装经过测试的完整前后端模板，依次连接 Agent Plan 模型、专业数据集（DataPro）、豆包搜索（联网搜索）、Agent 记忆（OpenViking）、AI Native 应用开发底座（Supabase）和授权资料，最后运行真实企业搜索、档案及资料问答验收。它不会为每位用户临时拼一套静态前端，也不会用演示数据冒充完成；云资源写入、真实调用、登录和业务验收都会停下来取得用户确认。

继续上次搭建或让 Skill 自动推进安全步骤：

```bash
node skills/sales-intelligence-workbench/scripts/onboard.mjs
```

只读查看当前阶段和唯一下一步：

```bash
node skills/sales-intelligence-workbench/scripts/setup.mjs
```

更新已安装 Skill：

```bash
npm run skill:install:codex -- --force
npm run skill:install:claude -- --force
```

完整阶段与验收标准见 [Cookbook 搭建流程](skills/sales-intelligence-workbench/references/cookbook-workflow.md)。下面的手工命令适合排障或不通过 Agent 运行时使用。

## 前置条件

- Node.js 20 或更高版本。
- 可用的 Agent Plan 模型。
- 可选：已安装并以用户身份登录的 `lark-cli`。
- 数据库初始化、迁移和备份需要 `byted-supabase-cli` 及相应控制面权限。

在 Agent Plan 控制台的能力列表找到以下卡片，确认“开启抵扣”；首次使用时按卡片中的“配置使用”完成授权。本文后续始终使用“控制台名称（内部技术名或作用说明）”的写法：

| Agent Plan 控制台名称 | 本项目中的作用 | 要求 |
| --- | --- | --- |
| 专业数据集（DataPro） | 企业主体识别、工商、经营和风险等专业事实 | 必需 |
| 豆包搜索（联网搜索） | 近期公开动态、公告、报道和可追溯网页来源 | 必需 |
| Agent 记忆（OpenViking） | 飞书资料正文、资料检索、问答 Session 和长期记忆 | 必需 |
| AI Native 应用开发底座（Supabase） | 企业、档案、引用、任务、权限和同步元数据 | 必需；使用北京地域 Agent Plan Workspace |

密钥只能写入本机私密配置或部署平台 Secret，不要粘贴到 Issue、日志、截图或提交记录。

## 安装

```bash
node skills/sales-intelligence-workbench/scripts/install.mjs
node skills/sales-intelligence-workbench/scripts/configure.mjs
```

已有私密环境文件时可迁移，脚本不会修改或打印源文件：

```bash
node skills/sales-intelligence-workbench/scripts/configure.mjs \
  --from-env-file /absolute/path/to/backend/.env.local
```

### 初始化 Agent 记忆（OpenViking）

先只读查看已有记忆库：

```bash
node skills/sales-intelligence-workbench/scripts/setup-openviking.mjs
```

脚本会给出复用已有记忆库的准确命令。没有资源时，确认名称、持续计费和数量上限后再使用
`--apply --collection-name <英文名称> --yes` 创建。用户不输入第二个 Key；内部连接信息
由官方控制面返回并以 `0600` 保存。

### 初始化 AI Native 应用开发底座（Supabase）

先用 Agent Plan 身份登录 Supabase CLI。这里完成的是火山账号 OAuth 授权，不是输入另一枚 Key：

```bash
byted-supabase-cli login --profile agent-plan --region cn-beijing --is-agent-plan
```

需要新建 Workspace 时，先确认持续计费与休眠策略，再由有 `aidap:CreateWorkspace` 权限的账号执行：

```bash
byted-supabase-cli projects create <workspace-name> --profile agent-plan --is-agent-plan
```

先查看计划，不写资源：

```bash
node skills/sales-intelligence-workbench/scripts/setup-supabase.mjs
```

只有一个 Agent Plan Workspace 时脚本会自动选择；存在多个时按计划输出的 ID 明确选择。确认目标后执行：

```bash
node skills/sales-intelligence-workbench/scripts/setup-supabase.mjs \
  --apply \
  --workspace-id <workspace-id> \
  --profile agent-plan \
  --yes
```

该命令会先确认目标是 Agent Plan Workspace，再自动获取 Data API 地址和后端内部凭据、写入本机 `0600` 配置、应用版本化迁移、创建应用 Workspace 记录并回读验证。用户无需输入或查看内部凭据。普通按量 Workspace 会被拒绝；命令不会创建、暂停或删除云 Workspace。

### 诊断与启动

配置检查不调用外部服务：

```bash
node skills/sales-intelligence-workbench/scripts/doctor.mjs
```

在用户知情会产生少量 Agent Plan 模型、专业数据集（DataPro）和豆包搜索（联网搜索）用量后，执行真实只读检查：

```bash
node skills/sales-intelligence-workbench/scripts/doctor.mjs --live
```

单个上游临时故障不会阻止查看已有数据或使用无关能力；依赖故障 Provider 的操作仍会严格失败。启动并查看地址：

```bash
node skills/sales-intelligence-workbench/scripts/start.mjs
node skills/sales-intelligence-workbench/scripts/status.mjs
```

`start.mjs` 会同时启动同源 API 和独立 Worker；`status.mjs` 分别报告两个进程。缺少队列迁移或 Worker 配置时会失败关闭，不会退回同步假成功。

首次打开页面时设置唯一的本机管理员用户名和密码，无需填写邮箱或确认邮件。设置完成后会直接进入工作台；后续使用同一浏览器打开时会自动恢复本机会话，默认最长保持一年。只有主动退出或本机会话失效时才需要再次输入原用户名和密码。匿名请求无法读取业务数据，付费 Provider 和运维接口仅对该管理员开放；当前版本只允许这一套管理员账号。

## 导入飞书资料

项目规定由 Codex CLI 调度飞书 CLI，使用当前用户授权读取，不依赖群机器人：

```bash
node skills/sales-intelligence-workbench/scripts/login.mjs --username <工作台用户名>
```

上述命令会在终端隐藏输入密码，并把用户级短期会话保存为权限 `0600` 的本机文件。随后执行：

```bash
node skills/sales-intelligence-workbench/scripts/import-feishu.mjs \
  --company-id <company-id> \
  --doc "https://example.feishu.cn/wiki/..."
```

会话导入支持 `--p2p-user <联系人姓名>` 或 `--chat-id <oc_会话ID>`；云文档只接受完整链接。启用 `FEISHU_CLI_IMPORT_ENABLED=true` 后，登录用户也可以在“历史资料”模块点击“导入飞书资料”，选择会话或云文档并查看本机任务进度。两种入口调用同一条受控链路：正文只写入 Agent 记忆（OpenViking），AI Native 应用开发底座（Supabase）只保存来源、内容指纹、增量游标和 OpenViking 引用。详见 [飞书导入说明](skills/sales-intelligence-workbench/references/feishu-import.md)。

## 运维

```bash
node skills/sales-intelligence-workbench/scripts/backup.mjs
node skills/sales-intelligence-workbench/scripts/stop.mjs
node skills/sales-intelligence-workbench/scripts/upgrade.mjs --source /absolute/path/to/new-source
node skills/sales-intelligence-workbench/scripts/uninstall.mjs
```

恢复默认只预检，并要求独立空目标、显式 `--apply` 和确认参数。卸载默认保留私密配置、备份和云端数据。

公网自托管需要 HTTPS 反向代理，并分别托管 API 与 Worker。配置和 systemd/Nginx 示例见 [单工作区自托管部署](docs/deployment/self-hosting.md)。

包含数据库迁移的升级应先在服务仍运行时检查待发布源码，再应用向后兼容迁移，最后短暂停机替换运行时：

```bash
node skills/sales-intelligence-workbench/scripts/migrate.mjs --source /absolute/path/to/new-source
node skills/sales-intelligence-workbench/scripts/migrate.mjs --source /absolute/path/to/new-source --apply
node skills/sales-intelligence-workbench/scripts/smoke-paid-workflow.mjs --source /absolute/path/to/new-source
node skills/sales-intelligence-workbench/scripts/smoke-async-job-queue.mjs --source /absolute/path/to/new-source
node skills/sales-intelligence-workbench/scripts/stop.mjs
node skills/sales-intelligence-workbench/scripts/upgrade.mjs --source /absolute/path/to/new-source
node skills/sales-intelligence-workbench/scripts/start.mjs
```

## 开发与验证

```bash
npm ci
npm run verify
```

`npm ci` 使用仓库锁文件建立可复现的 Node.js 环境。根目录总验收会先检查 Skill 结构和隔离安装生命周期，再执行后端离线发布验收。整个流程依次覆盖前端语法、后端测试、发布密钥、Skill 分发包一致性和隔离安装生命周期，不访问外部 Provider，也不会产生 AFP。需要单独执行时可使用：

```bash
cd backend && npm test
cd backend && npm run release:secrets
node skills/sales-intelligence-workbench/scripts/sync-assets.mjs
node skills/sales-intelligence-workbench/scripts/sync-assets.mjs --check
node skills/sales-intelligence-workbench/scripts/self-test.mjs
```

真实业务链路可使用 Skill 的 `verify-business-chain.mjs --confirm-live` 验证企业搜索与加入、
带引用档案、Agent 记忆（OpenViking）召回/写入、资料问答、Provider Run 和 Token。该命令会产生
AFP/Token 并保留业务记录。飞书增量导入、运行中重启、版本比较、备份与隔离恢复需要在
获授权环境中分别验证；任何一步使用固定前端数据都不能作为真实验收结果。

## 已知限制

- 当前是单工作区、单管理员自托管架构；没有公开注册、成员或角色系统，也尚未支持企业 SSO、MFA 和多工作区管理。
- 本机默认使用 HTTP；公网部署需自行配置 HTTPS 反向代理，并启用 Secure Cookie。
- 已有 IP/用户级限流、请求体上限、Workspace 付费任务保护、Provider 熔断、独立异步 Worker 和档案采集检查点；目标数据库必须应用到 `202607300001`。当前仍没有精确 AFP/金额预算。
- 持久化异步队列覆盖档案生成和 Agent 记忆（OpenViking）批量同步。前端飞书导入由后端进程内的受控任务执行；服务重启后不恢复进度，已成功写入的 Agent 记忆（OpenViking）正文和 AI Native 应用开发底座（Supabase）同步元数据会保留。
- 飞书读取范围受当前用户权限和飞书 CLI 能力限制，不能绕过平台权限。
- 新建 AI Native 应用开发底座（Supabase）Workspace 可能持续计费，因此 Skill 不会未经确认自动创建。
- 上游 Provider 可用性由服务方决定，诊断成功不代表长期 SLA。

## 支持与安全

当前版本只支持单工作区、单用户、本机或受控内网自托管，不提供公网生产 SaaS、多人协作
或 SLA。源码使用、分发和贡献应遵守 [LICENSE](LICENSE)；第三方服务及数据仍受各自条款
约束。

安全问题请参阅 [SECURITY.md](SECURITY.md)，部署要求见
[单工作区自托管部署](docs/deployment/self-hosting.md)，贡献流程见
[CONTRIBUTING.md](CONTRIBUTING.md)，版本变化见 [CHANGELOG.md](CHANGELOG.md)。
