# Supabase Schema 说明

更新时间：2026-07-26

正式 Schema 的唯一事实来源是：

```text
supabase/migrations/
```

不要手工拼接历史 SQL 文件。安装、升级和回滚检查均应使用 Skill 中的版本化迁移脚本。

## 数据域

| 数据域 | 表 |
| --- | --- |
| 身份与数据归属 | `app_workspaces`、`app_users`、`app_workspace_members`（底层表名沿用历史命名，仅用于单管理员鉴权与隔离） |
| Provider 配置 | `provider_connections` |
| 销售业务 | `sales_goals`、`sales_companies`、`sales_target_enterprises`、`sales_company_search_results`、`sales_progress_snapshots` |
| 档案与引用 | `sales_dossier_records`、`sales_dossier_citations` |
| 资料同步索引 | `sales_materials`、`sales_openviking_refs` |
| 隔离迁移归档 | `sales_qa_messages_legacy`（不参与运行、备份或恢复） |
| 任务与调用记录 | `jobs`、`paid_workflow_reservations`、`provider_runs`、`provider_run_steps` |
| 同步与审计 | `sync_sources`、`sync_checkpoints`、`audit_events` |
| 迁移历史 | `schema_migrations` |

## 工作区边界

- 每张业务表都有 `workspace_id`。
- Repository 的每次读取、更新和删除都强制带 `workspace_id`。
- 数据库启用并强制执行 RLS；本机管理员只能访问所属工作区。
- `service_role` 只允许后端使用，永远不能进入浏览器构建产物。
- 文本主键虽然全局唯一，跨工作区写入仍会显式检查 ID 冲突，避免 service role 误覆盖其他租户。

## 事务写入

以下 RPC 由 `service_role` 调用，均在单个数据库事务中完成：

- `persist_sales_dossier(workspace_id, dossier)`：写入档案及全部引用。
- `persist_provider_run(workspace_id, run)`：写入 Provider 运行记录、关联 Job 及全部步骤。
- `reserve_paid_workflow(...)`：在工作区级数据库锁内清理过期预约、校验并发/每日次数并创建任务。
- `finish_paid_workflow(...)`：在一个事务中结束任务并释放对应并发名额。
- `get_paid_workflow_usage(...)`：返回当前并发、当日尝试次数和任务类型分布，不包含密钥或 Provider 原文。
- `enqueue_sales_job(...)`：按工作区和幂等键创建等待任务，不提前占用付费并发。
- `claim_sales_job(...)`：使用 `FOR UPDATE SKIP LOCKED` 原子领取任务并建立 Worker 租约。
- `heartbeat_sales_job(...)`：更新业务阶段和进度，同时延长 Worker 租约及已有付费预约。
- `release_sales_job_claim(...)`：仅在尚未建立付费预约时自动重排；预约后的中断必须显式确认重试。
- `request_cancel_sales_job(...)`：等待任务立即结束；运行任务只记录取消请求并保留 Worker 租约和付费预约。
- `acknowledge_cancel_sales_job(...)`：由持有租约的 Worker 在安全检查点确认取消，并原子释放付费预约。
- `retry_sales_job(...)`：把符合条件的失败/取消任务重新放回队列。

非法企业、跨工作区 ID 冲突或子记录错误会使整笔事务回滚，不留下半截档案或半截调用链。

档案记录还保存 `version_no`、`previous_dossier_id`、`evidence_hash`、`dossier_fingerprint`、`change_status`、`data_as_of`、`generated_at` 和 `evidence_pack_json`。同一企业的有效版本号在工作区内唯一，上一版本只能指向同一工作区中的档案。

## Supabase 与 OpenViking 边界

- Supabase 保存企业、销售目标、档案、公开引用、任务、权限、审计，以及飞书来源/游标/内容指纹/OpenViking URI 等同步元数据。
- 飞书会话与云文档正文只保存在 OpenViking；`sales_materials` 不重复保存正文。
- 资料问答消息和长期上下文由 OpenViking Session 保存；Supabase 只保存会话索引与 Provider Run。
- `202607280001` 会把旧版 `sales_qa_messages` 改名为只允许 `service_role` 访问的
  `sales_qa_messages_legacy`。迁移不删除历史数据，但当前运行、备份和恢复均不会读取或写入该归档。
- `202607280002` 为项目自有的 `schema_migrations` 启用 RLS，并撤销普通角色权限。
- `202607290001` 在 Job 失败或取消时同步结束仍处于运行中的 Provider Run 与步骤，并自动修复旧的悬挂记录。
- `202607300001` 为 Job 增加内部检查点与安全进度明细，允许可重试故障退避重排并只继续未完成的档案采集查询。
- `health_check` 是火山引擎 Supabase 的平台保留表，不属于项目迁移；验收脚本只核验它未向
  `anon` 或 `authenticated` 开放，不尝试修改其所有权或 RLS。

## 迁移历史

| 版本 | 作用 |
| --- | --- |
| `202607210001` | 多租户核心表、约束、索引和更新时间触发器 |
| `202607210002` | RLS、成员权限函数与 Data API grants |
| `202607210003` | 复合外键删除行为及 Provider 运行引用修正 |
| `202607210004` | Data API 事务持久化 RPC |
| `202607210005` | 修复档案引用 RPC 的列映射 |
| `202607210006` | 补齐 public schema 外键覆盖索引 |
| `202607210007` | 资料同步来源、内容版本和 OpenViking 映射工程化 |
| `202607210008` | 档案证据版本字段、版本约束和 Job 关联的原子调用记录 |
| `202607230001` | 付费工作流原子预约、并发保护、每日次数保护和过期名额回收 |
| `202607230002` | 持久化异步队列、Worker 领取/租约/心跳、进度与安全重试 |
| `202607230003` | 运行任务安全取消检查点、取消期间租约续期与付费预约原子释放 |
| `202607280001` | 隔离旧问答正文表，确立 OpenViking 为资料问答内容的唯一运行时存储 |
| `202607280002` | 项目迁移元数据表启用 RLS，并仅授权后端 `service_role` |
| `202607290001` | Job 终止时自动闭合 Provider Run 与运行中步骤，并修复历史悬挂记录 |
| `202607300001` | 持久化 Job 检查点与进度明细，可重试故障退避重排且保留已完成采集结果 |

迁移器会读取远端 `schema_migrations`，只执行未应用文件；任何已应用迁移都不应被就地改写，应新增后续修正迁移。

运行前必须把迁移应用到 `202607300001`。后端找不到该迁移时会返回 `503`，不会在缺少任务检查点、重试与调用记录一致性保护时继续处理业务。

应用迁移后可执行 `smoke-paid-workflow.mjs`。该检查会在数据库事务中调用预约和释放 RPC，
验证 Job/预约状态后回滚，不留下测试记录，也不调用 Agent Plan 外部能力。

再执行 `smoke-async-job-queue.mjs`，在事务内验证入队、领取、心跳、预约前安全重排、付费预约、完成释放，以及“请求取消时不提前释放、Worker 确认后释放”；检查结束同样回滚且 Provider 调用数为零。

## 备份与恢复

项目的标准备份与恢复流程不依赖数据库直连权限或 `db dump`，统一采用“版本化迁移 +
Data API JSON 数据包”方案：

- `npm run db:backup` 导出工作区数据、已应用迁移、行数和 SHA-256。
- `npm run db:restore -- --backup-dir <path>` 默认只验证。
- 实际恢复只能指向另一套空云工作区，且不会迁移 Auth 用户或 Provider 密钥值。

具体命令见根目录 `README.md` 和
`skills/sales-intelligence-workbench/SKILL.md`。恢复必须指向隔离的空工作区，禁止覆盖
正在运行的生产库。
