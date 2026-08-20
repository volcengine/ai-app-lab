# 支持说明

## 提交问题前

请先执行：

```bash
npm run verify
node skills/car-decision-assistant/scripts/status.mjs
```

涉及真实 Harness 能力时，在确认会产生真实调用后执行：

```bash
node skills/car-decision-assistant/scripts/doctor.mjs --live
```

## Issue 内容

请提供版本、操作系统、Node.js 版本、触发步骤、稳定错误码和已脱敏日志。不要提交 Key、Cookie、恢复码、`SUPABASE_SERVICE_ROLE_KEY`、用户原始需求或完整 Harness 响应。

## 支持边界

维护者可以处理可复现的安装、构建、车型绑定、条件解析、存储和界面问题；不保证第三方数据覆盖、实时性、价格准确性、车型推荐结论或云服务 SLA。
