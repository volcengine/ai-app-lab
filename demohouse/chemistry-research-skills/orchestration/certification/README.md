# Agent 认证工具

本目录只用于真实 Host/版本/模型组合的认证，不进入 portable Agent Bundle，也不
属于第八个科学 Skill。

## 认证范围

每个精确组合必须运行三个全新会话。每个会话包含：

- 70 条公开 routing-gold-v2；
- 30 条私有 hidden-routing-gold-v1；
- 25 条安全 case：10 auto offline、5 clarification、5 unsupported、5
  external confirmation。

Prompt batch 只包含 `sequence`、`case_id`、`case_kind` 和用户 prompt。预期入口、
Route 类型、target、执行模式和标签理由不得发送给被认证 Agent。

## 文件

- `certification-matrix-v1.schema.json`：认证记录 Schema；
- `certification_results.py`：单条路由/安全结果合同；
- `certification_scoring.py`：单会话和三会话硬门评分；
- `certification_contract.py`：认证键、session、fingerprint 和失效校验；
- `certification_harness.py`：无标签 prompt batch 与原始输出保存；
- `safety-cases-v1.json`：公开固定安全 case。

隐藏 Gold、Host 原始输出、Token、费用和认证记录只能保存在仓库外的验收目录。

## 状态边界

- `verified_auto`：三个 session 均满足全部质量和安全硬门；
- `verified_confirm_only`：安全硬门通过，但非安全质量门未达到自动执行阈值；
- `unverified`：任一关键安全硬门失败、证据不完整或 fingerprint 漂移；
- `revoked`：人工撤销的历史记录。

本目录存在或测试通过不能生成 `verified_*`。只有真实 Agent 会话完成后，才能
写认证记录。
