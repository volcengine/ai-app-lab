# 故障排查

## install 失败

- Node 版本不足：升级到 Node 20+。
- 测试失败：修复源码后再安装，不使用 `--skip-tests` 作为正式发布手段。
- 服务仍运行：先 `stop.mjs`；不要删除 PID 后强行覆盖。
- 端口被占用：修改私有 `runtime.env` 的 `PORT`，再运行 doctor。

## doctor 配置失败

- 查看 `local.blockers` 和 `backend.blockers`，只补对应资源。
- `credentials.env 权限过宽`：执行 `chmod 600`。
- Supabase 缺配置：Data API 需要 URL、service role 和应用 Workspace ID；控制面优先使用 `SUPABASE_CLI_PROFILE`，目标必须是 Agent Plan Workspace。
- OpenViking 缺配置：运行 `setup-openviking.mjs` 只读查看可复用记忆库，再用
  `--apply --resource-id` 连接；没有资源时确认计费影响后用
  `--apply --collection-name <英文名称> --yes` 创建。不要让用户输入第二个 Key。
- 飞书导入缺 CLI：安装并登录 `lark-cli`，或明确设置 `FEISHU_CLI_IMPORT_ENABLED=false`。

## live doctor 失败

- DataPro 超时：记录 request/error 和发生时间，检查权限与平台状态；不要改用静态工商数据。
- 豆包搜索平台错误：确认 Agent Plan 套餐为 Running，控制台“豆包搜索”能力卡片已“开启抵扣”并按需完成“配置使用”，Key 为当前 Agent Plan 专属 API Key；保留错误码和 request ID，并用 `doctor.mjs --live --only-provider web_search` 单项复测。`10500` 在重试后仍出现时按上游服务异常反馈，不得改用静态新闻兜底。
- 模型鉴权失败：检查 Key、Base URL 和套餐；不要在日志打印 Key。
- OpenViking 健康成功但检索失败：检查命名空间和 CLI/API 配置。
- Supabase 控制面失败：Data API 可用不代表 CLI 控制面权限可用；`aidap:CreateWorkspace` 被拒绝时，需要账号管理员授权或代为创建 Agent Plan Workspace。

## 启动后部分功能不可用

配置 doctor 不通过时工作台拒绝启动。live doctor 失败或过期时仍可进入工作台查看已有数据、导入资料和检查状态；依赖异常 Provider 的操作会明确失败，不会生成替代数据。

重新告知会产生最小调用后，可执行 `doctor.mjs --live`；`--only-provider` 用于定位单项故障。不要手工伪造 `doctor-live.json`。

## 页面打不开

1. 运行 `status.mjs` 查看 PID、URL 和健康检查。
2. 查看 `~/.local/state/sales-intelligence-workbench/logs/server.log`。
3. 确认 URL 使用 status 给出的地址，不直接打开 Skill 内 HTML。
4. `/api/health` 正常而页面 404 时，重新安装应用包并检查 `frontend/index.html`。

## 飞书导入失败

- 先运行同一命令加 `--dry-run`，区分飞书读取失败和后端写入失败。
- 401/403：重新登录或确认用户权限。
- 双人会话不需要机器人；使用 `--p2p-user` 的用户态 CLI 路线。
- 来源暂停：添加 `--resume-source`，确认后再继续。
- 重复导入显示 skipped：说明内容哈希未变化，不是失败。
