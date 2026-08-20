# 购车决策助手 AI Native 应用开发底座配置

本目录保存购车决策助手的 PostgreSQL Schema 和可回滚烟测，目标平台是火山引擎“AI Native 应用开发底座”（基于 Supabase），命令行工具是 `byted-supabase-cli`，不是官方 Supabase CLI。

## 文件

- `001_initial_schema.sql`：10 张业务表、索引、外键、RLS、权限和原子保存函数。
- `002_smoke_test.sql`：创建、更新、城市数据关联和版本冲突烟测；最终 `rollback`，可以重复执行。

## 安全前提

1. 明确选择属于当前用户的 AI Native 应用开发底座 Workspace。
2. 先执行只读查询确认 Workspace ID、区域和运行状态。
3. 应用 Schema 前说明该操作会修改数据库并取得用户确认。
4. 应用后重新查询表、RLS、函数权限并执行 advisors。
5. `service_role` 只允许进入服务端环境，不能提交到仓库、前端变量或聊天。

本仓库不包含作者的账号、Profile、Workspace ID 或 API Key。

## 登录和选择 Workspace

```bash
byted-supabase-cli login \
  --profile agent-plan \
  --region cn-beijing \
  --is-agent-plan

byted-supabase-cli projects list \
  --profile agent-plan \
  --region cn-beijing \
  --limit 10 \
  -o json
```

存在多个 Workspace 时必须让用户选择，不能自动使用列表中的第一项。

## 应用 Schema

确认目标后执行：

```bash
byted-supabase-cli db query \
  --workspace-id <workspace-id> \
  --profile agent-plan \
  --region cn-beijing \
  --file supabase/001_initial_schema.sql
```

应用完成后执行可回滚烟测和安全巡检：

```bash
byted-supabase-cli db query \
  --workspace-id <workspace-id> \
  --profile agent-plan \
  --region cn-beijing \
  --file supabase/002_smoke_test.sql

byted-supabase-cli db advisors \
  --workspace-id <workspace-id> \
  --profile agent-plan \
  --region cn-beijing \
  --type all \
  --level warn \
  --fail-on error
```

## 运行时验证

```bash
export SUPABASE_WORKSPACE_ID="<workspace-id>"
export SUPABASE_CLI_PROFILE="agent-plan"
export SUPABASE_REGION="cn-beijing"
npm run test:supabase:live
```

该命令会在云端临时创建、读取、并发更新、恢复并删除测试项目。它是有写入的真实验收，执行前必须确认目标；成功后不应残留测试项目。

生产部署必须在服务端 Secret 中设置 `PROJECT_STORAGE_BACKEND=supabase`、`SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`，不能依赖开发机 CLI 登录态。
