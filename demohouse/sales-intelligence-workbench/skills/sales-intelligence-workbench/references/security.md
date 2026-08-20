# 安全与开源边界

## 密钥

- 凭证存入 `~/.config/sales-intelligence-workbench/credentials.env`，权限 `0600`。
- 前端、仓库、日志、截图、测试夹具和 Provider Run 不得出现完整密钥。
- Skill 应用包同步时排除 `.env.local`、依赖、临时目录、日志、PID 和备份。
- 用户曾在聊天或公开文档粘贴的密钥应视为暴露并轮换。

## 数据

- Supabase service role 只存在于后端进程。
- 业务 API 必须启用 Supabase Auth；网页使用 HttpOnly、SameSite=Strict Cookie，写操作额外校验 CSRF。
- CLI 使用用户级短期 Bearer 会话，本机文件权限 `0600`；不得把令牌放入参数、日志或仓库。
- 所有业务、Provider 管理、运行追踪、任务管理和数据导出仅对唯一的本机管理员开放。
- 所有业务读取和写入按 `APP_WORKSPACE_ID` 隔离；底层账号归属记录只用于鉴权和数据隔离，不代表产品提供成员系统。
- OpenViking URI 按 Workspace、企业和来源分层。
- OpenViking URI、Provider raw reference、Service Role 和证据内部包不得通过业务 DTO 返回前端。
- 飞书导入只读取用户授权范围，避免把原始会话写入日志。
- 备份包含私有业务数据，目录权限 `0700`、文件 `0600`，不得提交。

## 运行与删除

- 运行时仅使用真实 Provider 和 Supabase，不提供测试数据或内存仓库配置入口。
- `uninstall.mjs` 默认保留配置、备份和云数据。
- `--purge --yes` 只删除本机配置、日志和备份，不删除云端数据。
- 云端删除必须使用各服务的独立管理流程，并再次确认范围。

## 发布检查

执行凭证模式扫描、依赖审计和真实客户资料清查。移除录屏、截图、历史日志、测试备份和任何无法公开授权的内容；仅保留虚构测试夹具并明确标注。
