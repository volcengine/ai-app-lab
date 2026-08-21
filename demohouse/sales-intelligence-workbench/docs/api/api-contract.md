# 销售智能工作台 API 合约

更新时间：2026-07-29

本文只记录当前销售智能工作台的公开 API。早期原型接口不属于公开合约，相关路由已删除。

## 1. 基础约定

### Base URL

本地安装默认地址：

```text
http://127.0.0.1:8787/api
```

通过 HTTP(S) 打开前端时，前端调用同源 `/api`。对外部署应由 HTTPS 反向代理同时
代理前端和 API，不应把后端端口直接暴露到公网。

### 运行边界

项目仅连接真实 Provider 与 Supabase 持久化。配置、安全保护或依赖不完整时失败关闭，
不提供可切换的开发或演示运行方式。`GET /api/health` 返回 `provider_mode` 和
`runtime_ready`。

### 响应格式

成功响应：

```json
{
  "data": {},
  "meta": {
    "request_id": "req_...",
    "provider_mode": "real"
  }
}
```

错误响应：

```json
{
  "error": {
    "code": "bad_request",
    "message": "请求字段不合法。",
    "details": {}
  },
  "meta": {
    "request_id": "req_..."
  }
}
```

HTTP API 字段统一使用 `snake_case`，时间统一使用 ISO 8601。

## 2. 认证与授权

### 浏览器会话

浏览器登录成功后使用 HttpOnly、`SameSite=Strict` Cookie。所有经过 Cookie 认证的
非 GET 请求必须携带 `GET /api/auth/status` 返回的 CSRF Token：

```http
X-CSRF-Token: <csrf_token>
```

### CLI 会话

CLI 使用 `POST /api/auth/cli-login` 获取本机管理员的 Bearer 会话。不要把 Supabase
Service Role Key 当作登录令牌。推荐使用随 Skill 分发的登录脚本，将会话保存为
仅当前用户可读的 `0600` 文件。

```http
Authorization: Bearer <user_access_token>
```

Bearer 请求不依赖浏览器 Cookie，因此不要求 CSRF Header。

### 访问边界

当前版本只有一个本机管理员。首次使用通过 bootstrap 设置用户名和密码，之后 bootstrap
永久关闭；设置成功后浏览器保存长期会话，并在短期访问令牌过期时自动续期。产品只提供
首次设置、登录和退出，不提供注册、邮箱确认或成员管理。数据库中的账号归属记录只用于
鉴权与数据隔离，不构成额外的用户账号能力。

## 3. 接口清单

### 公共与认证

| Method | Path | 用途 |
| --- | --- | --- |
| GET | `/api/health` | 健康状态与运行就绪度 |
| GET | `/api/auth/status` | 登录状态、bootstrap 状态和 CSRF Token |
| POST | `/api/auth/bootstrap` | 首次设置本机管理员用户名和密码；完成后不再开放 |
| POST | `/api/auth/login` | 浏览器用户名密码登录 |
| POST | `/api/auth/refresh` | 刷新浏览器会话 |
| POST | `/api/auth/logout` | 退出浏览器会话 |
| POST | `/api/auth/cli-login` | 创建 CLI 管理员会话 |
| POST | `/api/auth/cli-refresh` | 刷新 CLI 用户会话 |

### 运维管理

| Method | Path | 身份 | 用途 |
| --- | --- | --- | --- |
| GET | `/api/admin/status` | 本机管理员 | 脱敏的系统与持久化状态 |
| GET | `/api/admin/usage-budget` | 本机管理员 | 当前并发和当日付费工作流尝试次数 |
| GET | `/api/admin/audit-events` | 本机管理员 | 查询关键操作和敏感导出的脱敏审计记录 |
| GET | `/api/admin/workspace-export` | 本机管理员 | 导出排除运行时内部字段的私密业务数据包 |
| GET | `/api/providers/status` | 本机管理员 | 只读配置状态，不调用外部服务 |
| GET | `/api/provider-runs` | 本机管理员 | 按条件查询 Provider 运行记录 |
| GET | `/api/provider-runs/:provider_run_id` | 本机管理员 | 查询单次运行与步骤 |

以下探针均要求本机管理员登录，并可能调用外部服务、产生额度或费用：

```text
POST /api/providers/web-search/probe
POST /api/providers/datapro/probe
POST /api/providers/model/probe
POST /api/providers/openviking/probe
POST /api/providers/supabase/probe
```

### 销售业务

| Method | Path | 身份 | 用途 |
| --- | --- | --- | --- |
| GET | `/api/sales-goals` | 本机管理员 | 查询销售目标 |
| POST | `/api/sales-goals` | 本机管理员 | 创建销售目标 |
| GET | `/api/sales-goals/:goal_id/target-enterprises` | 本机管理员 | 查询目标企业池 |
| POST | `/api/sales-goals/:goal_id/company-search` | 本机管理员 | 通过专业数据和公开来源检索企业 |
| POST | `/api/sales-goals/:goal_id/target-enterprises` | 本机管理员 | 将已核验候选企业加入目标池 |
| GET | `/api/target-enterprises/:enterprise_id` | 本机管理员 | 企业、档案、资料和问答聚合详情 |
| GET | `/api/target-enterprises/:enterprise_id/progress` | 本机管理员 | 查询销售进展 |
| GET | `/api/target-enterprises/:enterprise_id/dossiers` | 本机管理员 | 查询企业档案版本 |
| POST | `/api/target-enterprises/:enterprise_id/dossiers` | 本机管理员 | 创建异步档案 Agent 任务；严格函数提交和服务端质量门禁均通过后才保存新版本 |
| GET | `/api/dossiers/:dossier_id` | 本机管理员 | 查询档案正文和公开引用 |
| GET | `/api/target-enterprises/:enterprise_id/materials` | 本机管理员 | 查询已导入资料 |
| GET | `/api/target-enterprises/:enterprise_id/materials/sources` | 本机管理员 | 查询资料同步源 |
| GET | `/api/target-enterprises/:enterprise_id/materials/sync-state` | 本机管理员 | 查询同步游标与索引状态 |
| POST | `/api/target-enterprises/:enterprise_id/materials/import` | 本机管理员 | 导入一份获授权资料 |
| GET | `/api/feishu-import/status` | 本机管理员 | 查询本机飞书 CLI 导入能力状态 |
| POST | `/api/target-enterprises/:enterprise_id/materials/feishu-import` | 本机管理员 | 创建受控的飞书会话或云文档导入任务 |
| GET | `/api/target-enterprises/:enterprise_id/materials/feishu-import/:task_id` | 本机管理员 | 查询当前后端进程中的导入任务进度 |
| POST | `/api/target-enterprises/:enterprise_id/materials/source-action` | 本机管理员 | 暂停、恢复或删除同步源 |
| POST | `/api/target-enterprises/:enterprise_id/materials/sync-openviking` | 本机管理员 | 创建异步 OpenViking 同步任务 |
| GET | `/api/target-enterprises/:enterprise_id/qa` | 本机管理员 | 查询企业问答历史 |
| POST | `/api/target-enterprises/:enterprise_id/qa` | 本机管理员 | 基于已保存证据问答 |
| POST | `/api/target-enterprises/:enterprise_id/qa/commit-memory` | 本机管理员 | 将当前问答会话提交到长期记忆 |

### 后台任务

| Method | Path | 身份 | 用途 |
| --- | --- | --- | --- |
| GET | `/api/jobs` | 本机管理员 | 按 `job_type`、`status`、`entity_id` 查询任务 |
| GET | `/api/jobs/:job_id` | 本机管理员 | 查询公开任务状态 |
| POST | `/api/jobs/:job_id/cancel` | 本机管理员 | 请求安全取消 |
| POST | `/api/jobs/:job_id/retry` | 本机管理员 | 显式重试允许重试的任务 |

## 4. 主要请求体

创建销售目标：

```json
{
  "name": "华东新能源客户拓展",
  "description": "跟进已授权范围内的目标企业",
  "keywords": ["新能源汽车", "供应链"]
}
```

企业检索与加入：

```json
{ "query": "企业完整名称" }
```

```json
{ "company_id": "company_..." }
```

工作台不会根据一个未核验名称虚构企业主体；专业数据未返回可确认主体时，请求失败
或返回待确认状态，不能把该结果当成真实企业档案。

生成档案和同步 OpenViking 可传幂等键：

```json
{ "idempotency_key": "client-generated-stable-key" }
```

导入资料至少需要标题和正文。调用方应同时提供稳定来源标识，保证增量导入和去重：

```json
{
  "title": "获授权的客户沟通纪要",
  "source_type": "feishu_chat",
  "source_external_id": "stable-source-id",
  "source_version": "source-version",
  "source_url": "",
  "raw_text": "已获得处理授权的正文",
  "occurred_at": "2026-07-23T10:00:00.000Z"
}
```

`source_type`、稳定外部 ID 和版本的具体生成方式由飞书导入脚本负责。API 不负责绕过飞书
权限，也不接受调用方导入无权处理的内容。

前端飞书导入只接受两类请求：

```json
{ "source_kind": "document", "target": "https://example.feishu.cn/wiki/..." }
```

```json
{
  "source_kind": "conversation",
  "target": "联系人姓名或 oc_ 开头的会话 ID",
  "start": "2026-07-01",
  "end": "2026-07-26"
}
```

云文档目标必须是完整的 `https://` 飞书或 Lark 云文档/知识库链接；会话目标不接受
Open ID。该任务调用本机已授权的 `lark-cli`，不会接收或返回飞书令牌。启用前必须显式设置
`FEISHU_CLI_IMPORT_ENABLED=true`。任务进度当前只保存在 API 进程内存中，服务重启后
无法继续查询旧任务；已经完成的 OpenViking 正文与 Supabase 同步元数据不受影响。

资料源操作：

```json
{
  "action": "pause",
  "source_id": "sync_source_..."
}
```

`action` 仅允许 `pause`、`resume` 或 `delete`。删除会同时尝试删除对应 OpenViking
资源；长期记忆删除失败时整体失败关闭。

资料问答：

```json
{ "question": "根据已保存资料，客户最近关注的事项是什么？" }
```

问答只使用 Supabase 中当前企业已保存的档案，以及 OpenViking 中该企业的飞书资料召回结果和 Session 上下文，不在问答阶段新增联网事实。问答正文不重复写入 Supabase。

## 5. 异步任务语义

档案生成和 OpenViking 批量同步返回 `202 Accepted` 和公开 Job DTO：

```json
{
  "id": "job_...",
  "job_type": "sales_dossier_generation",
  "status": "running",
  "stage": "collecting_evidence",
  "stage_label": "正在收集可信资料",
  "stage_detail": "正在核验专业资料 2/4",
  "progress": 8,
  "entity_id": "company_...",
  "attempt_count": 1,
  "max_attempts": 3,
  "retryable": false,
  "error": null,
  "result": null
}
```

任务由独立 Worker 原子领取并持有租约。运行中取消先进入 `cancelling`；只有 Worker 在
当前外部调用返回后的安全检查点确认，任务才变为 `cancelled` 并释放付费并发名额。
任务只对超时、限流、网络和上游临时故障执行有界退避重试。档案任务逐项保存已完成的只读
查询和证据包，重试时只继续未完成查询，不重复已经成功的 Provider 调用；鉴权、配置、请求
校验和内容门禁错误不会自动重放。`stage_detail` 只包含用户可理解的当前动作和完成计数，不
暴露 Provider 请求、检查点、Worker、租约或错误栈。

`PAID_WORKFLOW_MAX_CONCURRENCY` 和 `PAID_WORKFLOW_DAILY_LIMIT` 控制的是工作流并发和
尝试次数，不等于 AFP、Token 或金额预算。

## 6. 引用与隐私边界

档案和问答以段落关联 `citation_ids`。公开 `citations` 只包含可展示的来源标题、链接、
日期和质量标签；以下字段不得出现在业务 DTO：

- Agent Plan Key、Supabase Service Role Key 或 Authorization Header；
- Provider 原始响应和完整提示词；
- OpenViking 内部 URI、资源引用和 namespace；
- Worker ID、租约、付费预约编号；
- 仅供运维使用的 `raw_ref` 和内部冲突明细。

档案生成要求专业/官方证据、可追溯公开链接和时效证据。注册资本、营收、净利润、融资、
估值以及明确司法或处罚事实必须满足高风险双来源规则；证据不足或相互冲突时任务失败，
不能生成无引用结论。

## 7. 常用错误

| HTTP | `error.code` | 含义 |
| --- | --- | --- |
| 400 | `bad_request` | JSON 或字段不合法 |
| 401 | `authentication_required` | 未登录或 CLI 会话过期 |
| 403 | `insufficient_role` / `csrf_failed` | 管理员身份状态异常或 CSRF 校验失败 |
| 404 | `not_found` / `*_not_found` | 路由或当前工作区对象不存在 |
| 409 | `already_exists` | 状态冲突 |
| 422 | `job_type_unsupported` | 不支持的任务或动作 |
| 429 | `paid_workflow_*` / `*_rate_limit_exceeded` | 工作流保护或请求限流 |
| 503 | `runtime_not_ready` / `*_unavailable` | 生产配置、队列或 Provider 不可用 |
| 500 | `internal_error` | 未预期服务错误 |

客户端应记录 `meta.request_id`，并优先根据 HTTP 状态和 `error.code` 处理，不应解析错误文案。

## 8. 数据导出边界

`GET /api/admin/workspace-export` 只允许本机管理员调用，并通过 `Cache-Control: no-store`
返回当前工作区的目标、企业、公开档案、资料正文、资料消息项、同步游标和问答。
响应不包含身份令牌、Provider 原文、完整提示词、OpenViking 内部 URI、Job、Worker、
租约或付费预约。该数据包仍包含客户沟通等私密业务内容，应使用 Skill 的
`export-workspace.mjs` 写入 `0600` 私有文件，禁止提交到公开仓库。

## 9. 审计边界

`GET /api/admin/audit-events` 只允许本机管理员调用，支持按 `action`、
`entity_type`、`entity_id` 精确筛选和 `limit` 限制。关键业务写操作、Provider 探测
和工作区导出会记录操作者、动作、业务实体、请求编号与结果状态；审计事件不记录请求
正文、密码、Token、API Key、Provider 原文或 OpenViking 内部引用。
