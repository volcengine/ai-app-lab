---
name: sales-intelligence-workbench
description: 从 0 到 1 搭建、配置、验收和维护真实数据驱动的销售智能工作台，覆盖需求澄清、Agent Plan 模型、专业数据集（DataPro）、豆包搜索（联网搜索）、AI Native 应用开发底座（Supabase）、Agent 记忆（OpenViking）、Codex CLI 调度飞书 CLI 导入资料，以及企业搜索、档案和资料问答闭环。用户要求搭建销售工作台、部署或继续开发该项目、导入销售资料、排查 Provider、迁移数据库、备份恢复或验收真实业务链路时使用。
---

# 销售智能工作台 Builder

这是一个 Builder Skill：先理解用户的销售目标，再安装经过测试的完整前后端模板，连接用户自己的 Agent Plan、AI Native 应用开发底座（Supabase）、Agent 记忆（OpenViking）和资料来源，最后用真实业务闭环验收。不得用演示企业、固定报告、Mock Provider 或静态来源冒充真实链路。

## 远程 Skill 入口

用户可能在 Codex 或 Claude Code 中直接通过公开的主 Skill URL 触发本流程，而不是预先克隆
仓库、安装 Skill 或准备本机配置。两端使用同一份 Skill 和同一套业务逻辑。独立发行仓库
使用以下版本化入口；其他发行位置也必须固定到已发布的 tag 或经过审核的 commit SHA：

```text
帮我初始化销售助手：https://github.com/3494036618-eng/sales-intelligence-workbench/blob/v0.10.0/skills/sales-intelligence-workbench/SKILL.md
```

如果当前环境中不存在 `{baseDir}/scripts/status.mjs`，说明本 Skill 是从远程 URL 打开的。
此时 Agent 必须：

1. 从用户提供的 Skill URL 解析同一个 GitHub 仓库和 `<ref>`，取得该版本的完整仓库，不能
   只下载 `SKILL.md`，也不能通过搜索结果猜测同名仓库。
2. 将 `{baseDir}` 设为仓库中的 `skills/sales-intelligence-workbench`，确认
   `{baseDir}/scripts/`、`{baseDir}/references/`、`{baseDir}/assets/app/` 及仓库根目录
   `package.json` 均存在。
3. 在仓库根目录执行 `node scripts/validate-skill-package.mjs` 和
   `node scripts/test-skill-installer.mjs`。两项都通过后按当前客户端安装：
   - Codex：`npm run skill:install:codex`
   - Claude Code：`npm run skill:install:claude`
   - 用户明确要求两端都安装：`npm run skill:install:all`
   已安装旧版时先说明影响，再为对应命令追加 `-- --force`。
4. 立即使用刚取得仓库中的本文件继续阶段 0，不要求用户重启当前客户端，也不让用户重复
   提供源码目录。后续重新打开时，Codex 使用 `$sales-intelligence-workbench`，Claude Code
   使用 `/sales-intelligence-workbench`。
5. 已有同名目录时先核对 Git remote、版本和工作区状态；不覆盖用户改动，不创建第二套
   运行时。下载、校验和安装阶段不创建云资源、不调用 Agent Plan 外部能力、不产生 AFP。

“什么也没配置”表示用户不需要预先准备本地项目、依赖或配置文件，不代表可以绕过云服务
账号、Agent Plan 套餐、AI Native 应用开发底座（Supabase）/Agent 记忆（OpenViking）权限、飞书登录或真实调用费用。用户侧只输入
一枚 Agent Plan Key；Agent 记忆（OpenViking）的内部访问凭证由初始化脚本自动获取和私密保存，
不得要求用户查找、粘贴或管理第二个 Key。

## Agent Plan 控制台名称约定

面向用户的引导必须优先使用 Agent Plan 控制台能力卡片中的名称，并在首次出现时补充
内部技术名或作用说明：

- `专业数据集（DataPro）`
- `豆包搜索（联网搜索）`
- `Agent 记忆（OpenViking）`
- `AI Native 应用开发底座（Supabase）`

引导用户在对应卡片确认“开启抵扣”，首次使用时按“配置使用”完成授权。不要只写
`DataPro`、`OpenViking`、`Supabase`、“联网搜索”“记忆库”或“业务数据库”而省略控制台
名称，否则用户无法判断应开启哪张能力卡片。Agent Plan 模型单独说明，不把它误写成上述
能力卡片。

## 执行原则

- 每完成一步，说明刚做了什么、为什么做、当前阶段、下一步和是否产生外部调用或费用。
- 密钥只通过隐藏终端输入、现有私密环境文件或部署平台 Secret 配置；不要要求用户把密钥发到聊天。
- 先做配置检查，再经用户知情执行 `--live`；真实 doctor 会产生少量 Agent Plan 模型、专业数据集（DataPro）和豆包搜索（联网搜索）用量。
- 工作台必须 fail closed。配置缺失时不启动；单个上游临时故障时允许工作台启动，但依赖该 Provider 的业务操作必须失败并报告原因，不生成假结果。
- 数据库迁移、恢复、删除和真实业务写入前明确影响；恢复只对独立目标执行。
- 读取 `references/evidence-policy.md` 后再修改事实、引用、档案或问答链路。

## 0. 先确认用户要搭建什么

先询问并复述以下信息，不要求用户先懂技术配置：

1. 工作台名称和最重要的销售目标。
2. 目标行业、区域或客户范围。
3. 历史资料来源：飞书云文档、飞书群聊/单聊，或本次暂不导入。
4. 运行方式：本机或受控内网。
5. 是否已经购买并配置 Agent Plan。

确认方案后记录不含密钥的业务范围：

```bash
node {baseDir}/scripts/setup.mjs --init \
  --workspace-name "<工作台名称>" \
  --sales-goal "<销售目标>" \
  --target-scope "<行业、区域或客户范围>" \
  --sources feishu_docs,feishu_chats \
  --deployment local
```

该命令不访问外部服务、不创建云资源、不产生 AFP。完整步骤和验收标准见 `references/cookbook-workflow.md`。

## 1. 判断当前阶段

确认业务范围后，优先运行安全编排器：

```bash
node {baseDir}/scripts/onboard.mjs
```

它会读取 `setup.mjs` 的阶段状态，自动执行本地安装、交互配置和启动等可恢复步骤；遇到 AI Native 应用开发底座（Supabase）写入、Agent 记忆（OpenViking）新资源创建、真实 Provider 调用、用户登录、飞书导入或付费业务验收时必须暂停并说明影响。只有用户明确确认后，才能追加相应的 `--apply-*`、`--yes` 或 `--confirm-live`。不得替用户自动创建、暂停或删除云资源。

需要只读查看阶段和唯一下一步时运行：

```bash
node {baseDir}/scripts/setup.mjs
```

Builder 按“业务范围 → 应用 → Agent Plan 模型与能力卡片 → AI Native 应用开发底座（Supabase）→ Agent 记忆（OpenViking）→ 飞书资料 → 真实诊断 → API/Worker → 首批导入 → 业务验收”推进。档案由受约束的单 Agent 使用强制严格函数提交完整六章节规划，服务端确定性组装正文并独立执行证据与展示质量门禁；必要时最多定点修订两次，失败时不保存本地拼接报告。所有阶段通过前，不要宣称工作台已经可直接使用。

需要查看进程、地址和 Provider 配置细节时再运行：

```bash
node {baseDir}/scripts/status.mjs
```

## 2. 安装应用

默认安装 Skill 自带的真实应用包：

```bash
node {baseDir}/scripts/install.mjs
```

继续开发当前仓库时，从用户确认的源码目录安装：

```bash
node {baseDir}/scripts/install.mjs --source /绝对路径/销售智能工作台开源版
```

安装先检查前端语法并执行后端全套测试，再原子替换运行时。路径和安装边界见 `references/setup.md`。

## 3. 配置真实资源

在交互式终端隐藏输入：

```bash
node {baseDir}/scripts/configure.mjs
```

已有私密 `.env.local` 时可迁移，不修改源文件，也不显示值：

```bash
node {baseDir}/scripts/configure.mjs --from-env-file /绝对路径/.env.local
```

工作台不提供运行方式选择，始终连接真实 Provider 和 AI Native 应用开发底座（Supabase）。Provider 与 Key 的对应关系见 `references/provider-configuration.md`。

## 4. 初始化数据库

目标必须是北京地域的 AI Native 应用开发底座（Supabase）Agent Plan Workspace，不能使用普通按量 Workspace。优先使用显式 profile：

```bash
byted-supabase-cli login --profile agent-plan --region cn-beijing --is-agent-plan
```

这里完成的是火山账号 OAuth 授权，不是要求用户输入另一枚 Key。需要新建时，先确认费用与休眠策略，再由具备 `aidap:CreateWorkspace` 权限的账号执行 `projects create --profile agent-plan --is-agent-plan`。

已有 AI Native 应用开发底座（Supabase）Workspace 时，先查看不会写入的初始化计划：

```bash
node {baseDir}/scripts/setup-supabase.mjs
```

只有一个 Agent Plan Workspace 时脚本会自动选择；存在多个时按计划输出的 ID 明确选择。确认目标后执行：

```bash
node {baseDir}/scripts/setup-supabase.mjs \
  --apply \
  --workspace-id <workspace-id> \
  --profile agent-plan \
  --yes
```

该命令先只读核验 Workspace 的 Agent Plan 属性与 Running 状态，再自动读取 Data API 地址和后端内部凭据、保存到本机私密配置、应用迁移、创建应用 Workspace 记录并回读验证。用户无需输入 Supabase Key、Data API 地址或火山 AK/SK；命令不会创建、暂停或删除 AI Native 应用开发底座（Supabase）Workspace。

已有完整 Data API 配置、只需检查迁移时运行：

```bash
node {baseDir}/scripts/migrate.mjs
```

用户确认将修改目标 AI Native 应用开发底座（Supabase）后再应用：

```bash
node {baseDir}/scripts/migrate.mjs --apply
```

不要对来源不明的现有生产库直接迁移。

## 5. 初始化 Agent 记忆（OpenViking）

先用 Agent Plan Key 只读列出当前账号的记忆库：

```bash
node {baseDir}/scripts/setup-openviking.mjs
```

复用已有记忆库时，按脚本返回的 ResourceID 执行：

```bash
node {baseDir}/scripts/setup-openviking.mjs --apply --resource-id <ov-资源ID>
```

没有可复用资源时，先让用户确认英文名称、持续计费和单账号最多 20 个的限制，再创建：

```bash
node {baseDir}/scripts/setup-openviking.mjs \
  --apply \
  --collection-name <英文名称> \
  --yes
```

脚本通过 Agent 记忆（OpenViking）官方控制面等待资源进入 `READY`，再自动获取该记忆库的内部访问凭证并
以 `0600` 写入本机私密配置。内部凭证不得显示到终端、聊天、前端或文档，也不得要求用户
输入。已有 Agent 记忆（OpenViking）官方 CLI 配置或已完成内部配置时直接复用，不重复创建资源。

## 6. 诊断并启动

配置检查不访问外部服务：

```bash
node {baseDir}/scripts/doctor.mjs
```

向用户说明会产生少量调用后，执行真实只读诊断：

```bash
node {baseDir}/scripts/doctor.mjs --live
```

排障时可用 `--only-provider model|datapro|web_search|openviking|supabase` 单独复测；单项结果不能代替全量启动验收。

首次正式使用前建议完成全量真实诊断；诊断失败会保留 Provider 级故障证据，但不会阻止其他独立能力启动。随后启动：

```bash
node {baseDir}/scripts/start.mjs
node {baseDir}/scripts/status.mjs
```

首次打开页面时设置唯一的本机管理员用户名和密码，无需邮箱、邮件确认或公开注册。设置完成后直接进入工作台；后续使用同一浏览器打开时自动恢复本机会话，只有主动退出或会话失效时才使用原用户名和密码再次登录。

当前版本支持单工作区、单管理员，以及本机或受控内网部署，没有成员或角色系统，也不提供公网托管 SaaS 或 SLA。密码不得放入命令行参数、日志、聊天或仓库。

后端和前端由同一进程、同一地址提供；不要另开静态前端。停止不会删除配置和数据：

```bash
node {baseDir}/scripts/stop.mjs
```

`start.mjs` 同时管理同源 API 和独立任务 Worker；`status.mjs` 中 `running` 与 `worker_running` 都应为 `true`。档案和 Agent 记忆（OpenViking）批量同步由 Worker 执行，不能只启动 API。运行中取消只登记请求，Worker 到达安全检查点后才释放付费预约并允许重试。

## 7. 导入飞书资料

本项目规定使用 **Codex CLI 调度飞书 CLI**，不以 Feishu MCP 或群机器人替代用户态读取。先阅读 `references/feishu-import.md`。

先为导入命令建立本机管理员会话（密码隐藏输入，令牌仅保存到本机 `0600` 状态文件）：

```bash
node {baseDir}/scripts/login.mjs
```

```bash
node {baseDir}/scripts/import-feishu.mjs \
  --company-id <企业ID> \
  --doc "https://example.feishu.cn/wiki/..."
```

会话导入可使用 `--p2p-user <联系人姓名>` 或 `--chat-id <oc_会话ID>`；云文档只接受完整链接。启用 `FEISHU_CLI_IMPORT_ENABLED=true` 后，本机管理员也可在“历史资料”模块使用“导入飞书资料”。两种入口都会先由 `lark-cli` 读取：正文只写入当前企业的 Agent 记忆（OpenViking）目录，AI Native 应用开发底座（Supabase）只保存来源、游标、内容指纹和 OpenViking 引用。
成功导入后，Builder 仅保存时间、企业 ID 和来源类型的脱敏回执，不复制飞书正文或凭证。

使用结束后可删除本机 CLI 会话：

```bash
node {baseDir}/scripts/logout.mjs
```

## 8. 验收真实链路

`verify-real-chain.mjs` 只做 Agent Plan 模型、专业数据集（DataPro）、豆包搜索（联网搜索）、Agent 记忆（OpenViking）和 AI Native 应用开发底座（Supabase）的最小只读诊断，不写业务数据，不能替代产品验收：

```bash
node {baseDir}/scripts/verify-real-chain.mjs
```

完整业务链路使用已授权测试企业，真实执行企业搜索、入池、异步档案和资料问答，并校验逐段引用、Provider Run 与 Token：

```bash
node {baseDir}/scripts/login.mjs
node {baseDir}/scripts/verify-business-chain.mjs \
  --goal-id <销售目标ID> \
  --company-query <完整企业名称> \
  --question "根据当前档案，下一步应优先确认什么？" \
  --confirm-live
```

该命令会产生 AFP/Token，并保留 AI Native 应用开发底座（Supabase）中的企业/档案/任务记录及 Agent 记忆（OpenViking）中的问答 Session，不会自动删除。完整产品验收还必须补充：飞书增量导入、从 Agent 记忆（OpenViking）重启恢复正文与问答、再次生成后的版本比较、备份恢复和浏览器端操作。任一步使用固定前端数据都不通过。
验收通过后，Builder 保存不含档案正文、问题答案和密钥的脱敏回执，供 `setup.mjs` 判断搭建是否完成。

应用队列迁移后，在不调用 Agent Plan 外部能力的情况下验证数据库原子语义：

```bash
node {baseDir}/scripts/smoke-paid-workflow.mjs
node {baseDir}/scripts/smoke-async-job-queue.mjs
```

两项检查都必须显示 `transaction: rolled_back` 和 `provider_calls: 0`。

## 9. 备份、恢复与升级

```bash
node {baseDir}/scripts/backup.mjs
node {baseDir}/scripts/export-workspace.mjs
node {baseDir}/scripts/restore.mjs --backup-dir /绝对路径/备份目录
node {baseDir}/scripts/upgrade.mjs --source /绝对路径/新源码
```

`backup.mjs` 是运维级完整备份；`export-workspace.mjs` 仅允许本机管理员使用，输出可迁移
的销售业务数据并排除密钥、Provider 原文和 OpenViking 内部 URI。两类文件都包含私密业务
数据，默认以 `0600` 保存，禁止提交到仓库。

关键业务写操作、Provider 探测和工作区导出会写入脱敏审计事件；本机管理员可通过
`/api/admin/audit-events` 查询。

恢复默认只预检；执行写入还需原恢复脚本要求的 `--apply`、独立目标和确认参数。升级前先停止服务并建议备份。

## 10. 卸载

保留配置、日志、备份和云端数据：

```bash
node {baseDir}/scripts/uninstall.mjs
```

只有用户明确要求清除本机私有配置和备份时才执行：

```bash
node {baseDir}/scripts/uninstall.mjs --purge --yes
```

两种方式都不删除 Supabase 或 OpenViking 云端数据。

## 维护 Skill 应用包

仓库源码通过测试后，由维护者同步到 Skill：

```bash
node {baseDir}/scripts/sync-assets.mjs
node {baseDir}/scripts/self-test.mjs
```

同步脚本排除密钥、依赖、日志、备份和临时文件；自测使用隔离目录和假凭证，不访问外部服务。

## 参考资料

- `references/cookbook-workflow.md`：从需求澄清到真实业务验收的 Cookbook 映射。
- `references/setup.md`：安装、目录、数据库初始化和首次启动。
- `references/architecture.md`：前后端、Provider、Supabase 和 OpenViking 边界。
- `references/provider-configuration.md`：配置项、凭证和生产门槛。
- `references/feishu-import.md`：Codex CLI + 飞书 CLI 导入链路。
- `references/evidence-policy.md`：事实、来源、档案和问答规则。
- `references/security.md`：密钥、权限、备份和开源边界。
- `references/troubleshooting.md`：常见故障和恢复步骤。
