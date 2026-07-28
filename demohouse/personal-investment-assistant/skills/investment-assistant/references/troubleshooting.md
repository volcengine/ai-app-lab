# 故障排查

## 标准顺序

1. 运行 `node {baseDir}/scripts/status.mjs`。
2. 运行 `node {baseDir}/scripts/doctor.mjs --live`。
3. 根据失败的 Provider 处理。
4. 三项重新探测成功后再生成报告。

不要用一个来源冒充另一个来源成功，也不要把“Key 已填写”当成“后端可用”。

## Agent Plan 模型

### `ARK_MODEL_NOT_CONFIGURED` 或鉴权失败

重新运行 `configure.mjs`。确认 Agent Plan 套餐有效、Key 来自当前账号，`ARK_BASE_URL` 默认为：

```text
https://ark.cn-beijing.volces.com/api/plan/v3
```

默认模型为 `doubao-seed-evolving`。若当前套餐不提供该模型，使用 Agent Plan 当前可用的文本模型 ID 更新 `ARK_MODEL`。

## DataPro

### `DATAPRO_NOT_CONFIGURED`

正常情况下 DataPro 自动继承 `ARK_API_KEY`。检查凭证文件中 `ARK_API_KEY` 是否存在，再重新执行 doctor。

### `DATAPRO_TOOL_MISSING` 或业务错误

确认 Agent Plan 已启用专业数据集能力。DataPro 是专业数据 MCP，不能用静态财务数据或网页新闻替代。

### `DATAPRO_4011`

可能表示 Key 无效、短周期额度耗尽或账号没有专业数据集权限。先检查 Agent Plan 用量和重置时间，再检查权限与 Key。额度耗尽时停止生成，等待重置后重新探测。

## 豆包搜索

### `WEB_SEARCH_NOT_CONFIGURED`

正常情况下豆包搜索自动继承 `ARK_API_KEY`。检查 Agent Plan Harness 是否启用豆包搜索，并确认 Key 有对应权限。

### `10403`

通常表示鉴权或能力权限问题。重新确认 Agent Plan Key 与 Harness 开通状态，不要关闭鉴权检查。

### `10406`、`10408`、`10412`

表示额度、欠费或套餐不可用。处理账号状态后重新执行 doctor。

### `10500` 或超时

表示上游暂时不可用或网络超时。应用会按配置重试；持续失败时先确认 Agent Plan 中已开启豆包搜索 Harness，再记录 Provider、错误码和 request ID，稍后重试或联系对应服务支持。该错误不表示用户需要提供第二枚搜索 Key。

## 网站与报告

### 页面可以打开但不能生成

检查 `/api/health/ready`、live doctor 和服务日志。旧 doctor 记录过期会使 readiness 失败；重新探测后再试。

### 新股票导入后没有内容

确认 Profile 导入成功，然后执行：

```bash
node {baseDir}/scripts/acceptance.mjs --stock 证券代码 --seed
```

该命令会真实生成两类首批报告并检查历史。

### `EVIDENCE_VALIDATION_FAILED`

报告未通过引用、数字或语义审校。保留错误详情和 request ID，检查来源内容、证券归属、偏好覆盖与模型资源后重试。不要关闭证据校验，也不要手工伪造结论。

### Profile 导入失败

确认 Profile 是合法 JSON，使用绝对路径，包含 1 至 100 只证券；每只证券都必须有名称、代码、`CN/HK/US` 市场和至少一个关注方向。脚本按“市场 + 代码”幂等更新，不删除未列出的股票。

### 定时监控到点未执行

依次检查：

1. 监控开关是否启用。
2. 执行日是否包含当天。
3. 时间和 IANA 时区是否正确。
4. `status.mjs` 中调度服务是否运行。
5. 该股票的监控设置是否已保存。
6. 执行记录中是否存在失败及错误原因。

手动执行成功不能证明自动调度正常；需要实际创建近期测试时间并观察自动执行记录。

### 端口被占用

默认端口是 `8788`。停止占用端口的旧实例，或在凭证配置文件中设置 `APP_PORT`。

## 日志安全

日志默认位于 `~/.local/share/investment-assistant/logs/server.log`。提交 Issue 前人工删除股票关注信息、上游正文、请求标识和任何凭证。
