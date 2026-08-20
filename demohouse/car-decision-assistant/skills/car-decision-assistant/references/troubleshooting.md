# 排障

## `SUPABASE_WORKSPACE_ID` 缺失

运行 `setup-supabase.mjs` 列出或核对用户自己的 AI Native 应用开发底座 Workspace，再运行 `configure.mjs --workspace-id ...`。不要使用仓库作者或其他用户的 ID。

## CLI 登录失败

执行 `byted-supabase-cli projects list --profile <profile> --region <region>`。若 OAuth 账号与目标 Profile 身份冲突，停止并让用户切换到正确账号；不要覆盖 Profile。

## 页面打开但 Harness 能力不可用

运行 `doctor.mjs` 检查配置。得到用户确认后运行 `doctor.mjs --live --confirm-live`。`configured=true` 不是 `ok`。

## 车型没有唯一版本

向用户展示专业数据集返回的可信候选；没有可信候选时请用户补充品牌、车系、年款或配置。用户已经选择后不得再次模糊匹配。

## 配置或城市数据缺失

检查项目 issue、查询主体、统计口径和 trace/request ID。无数据、主体不一致和结构异常不重试同一内容；网络、429 和 5xx 才有界重试。

## 启动后地址不可访问

运行 `status.mjs` 核对 PID、端口和健康状态，再查看私密日志目录。不要从日志复制 Key 到聊天。必要时先 `stop.mjs`，再 `start.mjs`。
