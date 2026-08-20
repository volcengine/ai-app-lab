# Codex CLI + 飞书 CLI 资料导入

## 选择这条路线的原因

本项目需要读取用户有权访问的云文档、双人会话和群聊历史。官方 Feishu MCP 的消息读取通常依赖应用机器人可见范围，双人会话无法加入机器人；因此这里明确采用用户态 `lark-cli`。Codex CLI 负责理解任务、选择参数和调度命令，飞书 CLI 负责授权与读取。

```text
用户请求
  -> Codex CLI
     -> import-feishu.mjs
        -> lark-cli（用户身份、只读获取）
        -> 后端受控导入服务
           -> OpenViking 企业子树保存正文
           -> Supabase 保存同步状态与业务索引
```

## 前置条件

1. 安装 `lark-cli`。
2. 在用户终端完成飞书 OAuth 登录。
3. 用户本人对目标文档或会话有读取权限。
4. 工作台正在运行，目标企业已经存在。
5. 已在工作台页面设置本机管理员，并运行 `node {baseDir}/scripts/login.mjs` 建立 CLI 会话。
6. `FEISHU_CLI_IMPORT_ENABLED=true`（兼容旧配置 `FEISHU_SYNC_ENABLED=true`）时 doctor 能检测到 CLI。

工作台运行后，本机管理员也可在“历史资料”模块点击“导入飞书资料”，选择“飞书会话”或
“云文档”。会话只填写联系人姓名或 `oc_` 开头的会话 ID，云文档只粘贴完整链接。网页只提交来源参数并轮询本机任务状态，不显示 CLI 命令、授权令牌、
OpenViking URI 或 Supabase 内部字段。会议纪要按云文档展示。

## 支持来源

```bash
# 云文档
node {baseDir}/scripts/import-feishu.mjs --company-id <id> --doc <https-url>

# 双人会话
node {baseDir}/scripts/import-feishu.mjs --company-id <id> --p2p-user <联系人姓名> --start 2026-07-01

# 群聊
node {baseDir}/scripts/import-feishu.mjs --company-id <id> --chat-id <oc_xxx>
```

先用 `--dry-run` 验证飞书读取；该模式不写后端。正式导入使用稳定来源 ID、内容哈希和检查点，重复内容会跳过，消息按 ID 合并，暂停来源需先 `--resume-source`。

前端导入任务当前保存在 API 进程内存中，同一企业同一时间只允许一个任务。进程重启后
旧任务进度不可查询，但成功写入的正文仍由 OpenViking 保存，Supabase 中的来源、游标、
内容指纹和引用仍可恢复。正式多实例部署前应把该任务迁入持久化队列。

## 权限边界

- CLI 不能绕过用户权限；不可见内容必须报告无权限。
- 导入 API 使用当前本机管理员的 Bearer 会话并执行身份校验，不使用 Supabase Service Role 冒充用户。
- 访问令牌不放入命令行参数；仅保存到本机状态目录的 `cli-session.json`，权限为 `0600`，过期后自动刷新。
- 不自动扩大时间范围或导入整个组织消息。
- 不把会话原文写入日志或聊天回复。
- 每个来源必须绑定当前企业；跨企业 `source_id` 操作由后端拒绝。
- 删除同步源会删除应用内关联资料，并尝试清理对应 OpenViking 内容；执行前必须确认。
