# Provider 配置

## Agent Plan 控制台名称

在 Agent Plan 控制台的能力列表按控制台名称确认以下卡片已“开启抵扣”；首次使用时按
卡片中的“配置使用”完成授权：

| 控制台名称 | 本文作用说明 |
| --- | --- |
| 专业数据集 | DataPro |
| 豆包搜索 | 联网搜索 |
| Agent 记忆 | OpenViking |
| AI Native 应用开发底座 | Supabase |

面向用户时统一写成“控制台名称（内部技术名或作用说明）”，不要只写内部技术名。

## 凭证对应关系

| 能力 | 私密配置 | 说明 |
| --- | --- | --- |
| 模型、专业数据集（DataPro）、豆包搜索（联网搜索）、Agent 记忆（OpenViking）控制面 | `AGENT_PLAN_API_KEY` | 用户只输入这一枚 Agent Plan 专属 API Key；对应能力仍需在套餐和控制台能力卡片中开通 |
| Agent 记忆（OpenViking） | 初始化脚本自动管理 | 脚本自动选择或创建记忆库，并获取内部访问凭证；不得要求用户输入、查看或管理第二个 Key |
| 能力专用覆盖（可选） | `MODEL_API_KEY`、`DATAPRO_API_KEY`、`WEB_SEARCH_API_KEY` | 仅用于独立轮换或排障；未设置时回退到 `AGENT_PLAN_API_KEY` |
| OpenViking 连接信息 | `OPENVIKING_BASE_URL` | 也可复用 `~/.openviking/ovcli.conf`；`OPENVIKING_AGENT_ID` 默认 `default` |
| AI Native 应用开发底座（Supabase）Data API | 初始化脚本自动管理 | 脚本从已登录的官方 CLI 获取内部 `service_role`，只供后端使用；不得要求用户粘贴 |
| AI Native 应用开发底座（Supabase）控制面 | `SUPABASE_CLI_PROFILE` | 用户完成一次火山账号 OAuth 登录；这是账号授权，不是另一枚业务 Key |

不要把这些值放入前端、README、日志、截图、Provider Run 或 Git。

模型、专业数据集（DataPro）、豆包搜索（联网搜索）和 Agent 记忆（OpenViking）控制面统一使用 `AGENT_PLAN_API_KEY`。专业数据集、豆包搜索、Agent 记忆和 AI Native 应用开发底座必须先在 Agent Plan 控制台确认“开启抵扣”，并按卡片提示完成“配置使用”。`setup-openviking.mjs` 会优先复用已有配置或记忆库；需要新建时取得用户对名称和计费影响的确认，等待资源就绪，再把内部连接信息保存到本机 `0600` 私密配置。用户全程只输入一枚 Agent Plan Key。

Supabase 初始化需要用户在官方 CLI 完成一次火山账号 OAuth 登录。Skill 自动发现 Agent Plan Workspace，并从控制面取得 Data API 地址和内部 `service_role` 后写入本机 `0600` 配置；这些是后端运行细节，不向用户索取或展示。用户不需要手工输入 Supabase Key、火山 AK/SK 或 Data API 地址。

## 运行必需配置

- `REPOSITORY_MODE=supabase`
- `SUPABASE_READ_ONLY=false`
- `SUPABASE_API_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`APP_WORKSPACE_ID`
- `HTTP_AUTH_ENABLED=true`；本地回环 HTTP 使用 `AUTH_COOKIE_SECURE=false`，非回环部署必须使用 HTTPS 并设为 `true`
- `ALLOWED_ORIGINS` 只列出实际部署来源，不使用 `*`
- `PAID_WORKFLOW_MAX_CONCURRENCY` 和 `PAID_WORKFLOW_DAILY_LIMIT` 必须为正整数；默认分别为 `2` 和 `100`
- `PAID_WORKFLOW_BUDGET_TIMEZONE` 默认 `Asia/Shanghai`；`PAID_WORKFLOW_STALE_AFTER_SECONDS` 默认 `1800`
- `ASYNC_JOBS_ENABLED=true`；`JOB_WORKER_LEASE_SECONDS` 不低于 `60`，默认 `600`
- `SUPABASE_CLI_PROFILE` 指向已用 `--is-agent-plan` 登录的 profile，目标 Workspace 具备 Agent Plan 属性
- 模型、专业数据集（DataPro）、豆包搜索（联网搜索）和 Agent 记忆（OpenViking）已配置且各自 `*_RUN_ENABLED=true`
- `MODEL_MAX_RETRIES` 默认 `1`、上限 `2`，只重试超时、限流、网络和上游临时故障；设为 `0` 可关闭模型传输层重试
- `DOSSIER_AGENT_MAX_CALLS` 默认 `3`、范围 `1-3`，限制单次档案任务的六章节规划与定点修订总预算；首次完整规划合格后立即停止，否则最多再局部修订两次。六章正文由服务端确定性组装，不另行调用模型自由成稿
- `DOSSIER_CHECKPOINT_TTL_MS` 默认 `1800000`（30 分钟），控制失败重试可复用的内部证据检查点时效；新刷新任务不继承旧任务检查点
- `DOSSIER_DATAPRO_CONCURRENCY` 默认 `2`、`DOSSIER_WEB_CONCURRENCY` 默认 `3`，限制同一档案任务的只读采集并发；增大并发会提高上游限流和瞬时失败风险
飞书 CLI 导入由 `FEISHU_CLI_IMPORT_ENABLED` 控制；旧配置
`FEISHU_SYNC_ENABLED` 仍兼容。启用时 doctor 必须检测到 `lark-cli`。任务数量上限可用
`FEISHU_CLI_IMPORT_TASK_LIMIT` 调整；该任务状态当前只在 API 进程内保存。

OpenViking 保存飞书正文，并按官方“确认或创建会话 → 逐条添加消息 → 提交会话”流程保存资料问答记忆。提交频率和保留的近期消息数可分别用 `OPENVIKING_QA_AUTO_COMMIT_EVERY`、`OPENVIKING_QA_KEEP_RECENT_MESSAGES` 调整。自动取得的内部凭证只供后端读取，不会复制到前端、日志或用户引导。

首次使用只设置唯一的本机管理员用户名和密码，不需要邮箱或邮件服务。设置完成后浏览器保存长期会话，短期访问令牌过期时由服务端自动续期；只有主动退出或长期会话失效时才再次使用原账号登录。`SUPABASE_SERVICE_ROLE_KEY` 始终留在后端；任何用户密码都不得写入命令行参数、日志、截图或前端持久化存储。

## doctor 语义

- 默认 doctor：检查本机目录、权限、配置结构和运行门槛，不调用外部服务。
- `--live`：发起最小只读 Agent Plan 模型、专业数据集（DataPro）、豆包搜索（联网搜索）、Agent 记忆（OpenViking）和 AI Native 应用开发底座（Supabase）检查，可能产生少量 AFP/Token。
- 启动要求配置 doctor 通过。live doctor 结果会按 `LIVE_DOCTOR_TTL_MS`（默认 15 分钟）标记新鲜度并展示在运维状态中，但上游临时故障不会阻止其他独立能力启动。

`--live` 默认以 `北京火山引擎科技有限公司` 做只读 DataPro/Web Search 探针；如组织策略要求使用其他公开主体，可设置 `LIVE_PROBE_COMPANY`。该值只用于诊断，不会写入目标企业池。

配置存在不代表权限、余额、网络和上游服务正常；只有 live doctor 能证明当时的可达性。
业务操作仍按 Provider 严格失败：例如联网搜索故障时不能生成声称包含最新公开动态的档案，也不会退回静态替代来源。

## 付费工作流保护

企业搜索、档案生成、资料问答、资料导入、OpenViking 批量同步、问答记忆提交和同步源删除在调用对应 Provider 前，先在 Supabase 中原子预约名额。任务成功或失败会释放并发名额；等待任务可立即取消，运行任务则在 Worker 到达安全检查点后确认取消并释放，避免尚未结束的 Provider 调用与重试并行。超过时限的遗留预约会自动标记过期，暂停/恢复等纯数据库状态修改不占用付费名额。

`PAID_WORKFLOW_DAILY_LIMIT` 统计的是付费工作流尝试次数。一次档案生成可能包含 DataPro、豆包搜索和模型多个步骤；一次资料问答还会包含 OpenViking 召回与 Session 写入。因此该值用于防止失控调用，不能作为 AFP 或金额报表。精确用量应结合 Provider Run 的 Token/调用记录与官方账单。

数据库必须依次应用到 `202607300001_durable_job_checkpoints.sql`。迁移缺失时应用会返回 `503`，不会退化为单进程内存队列或请求内假成功。内部元数据表只允许后端 `service_role` 访问；Job 失败或取消时，数据库会同步结束关联的 Provider Run 和运行中步骤，避免留下“任务已失败、调用仍运行”的悬挂状态。档案和 OpenViking 批量同步先持久化入队，Worker 原子领取后才建立付费预约。仅超时、限流、网络和上游临时故障进入有界退避重试；档案任务逐项保存已完成的只读查询和证据包，重试只继续未完成查询，不重复已经成功的 Provider 调用。鉴权、配置、请求校验和内容门禁错误不自动重试。问答正文由 OpenViking 保存和检索，Supabase 仅保存业务结构与 OpenViking 会话引用。
