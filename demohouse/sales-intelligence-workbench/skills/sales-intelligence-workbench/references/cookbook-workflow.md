# Cookbook 搭建流程

## 目标

帮助用户把自己的销售目标、企业数据和授权资料接入一个真实可用的销售团队工作台。最终交付物必须是可登录、可持续写入、可追溯引用、重启后数据仍存在的完整应用，不是方案文档、静态页面或演示数据。

## Cookbook 与 Builder 的对应关系

在 Agent Plan 控制台的能力列表中找到`专业数据集`、`豆包搜索`、`Agent 记忆`和
`AI Native 应用开发底座`，确认“开启抵扣”，首次使用时按“配置使用”完成授权。本文统一写成
`专业数据集（DataPro）`、`豆包搜索（联网搜索）`、`Agent 记忆（OpenViking）` 和
`AI Native 应用开发底座（Supabase）`，避免只看内部技术名却找不到对应能力卡片。

| Cookbook 阶段 | Builder 动作 | 完成标准 |
| --- | --- | --- |
| 描述销售痛点 | 询问销售目标、客户范围、资料来源和部署方式 | `setup.mjs` 已记录业务范围 |
| 配置 Agent Plan | 用户只输入统一 Key，配置 Agent Plan 模型，并开启专业数据集（DataPro）、豆包搜索（联网搜索）、Agent 记忆（OpenViking）和 AI Native 应用开发底座（Supabase） | 套餐与能力卡片配置完整 |
| 连接 Agent 记忆（OpenViking） | 自动复用或经确认创建记忆库，等待 READY 并私密保存内部连接信息 | 用户未输入第二个 Key，Agent 记忆（OpenViking）live doctor 通过 |
| 准备 AI Native 应用开发底座（Supabase） | 用户完成火山账号 OAuth，脚本自动发现 Agent Plan Workspace、获取内部连接并应用版本化迁移 | 用户未输入 Supabase Key/AK-SK，AI Native 应用开发底座（Supabase）Workspace 属性、表结构和回读验证通过 |
| 获取历史资料 | 由 Codex CLI 调度用户态飞书 CLI 读取获授权资料 | 至少一次真实资料写入 AI Native 应用开发底座（Supabase）与 Agent 记忆（OpenViking） |
| 搭建工作台 | 安装随 Skill 发布、经过测试的完整前后端模板 | API 与独立 Worker 同时健康 |
| 生成最新档案 | 专业数据集（DataPro）与豆包搜索（联网搜索）有界并发采集、逐查询检查点 → 档案 Agent 六章节事实规划、服务端确定性组装与质量门禁 → AI Native 应用开发底座（Supabase） | 六章完整档案、逐段引用、Agent 三次以内的规划轨迹和版本记录可回读；可重试故障只继续未完成查询；飞书资料和 Agent 记忆（OpenViking）不作为外部事实来源；失败不保存或模板重建替代报告 |
| 资料问答 | 只基于企业档案、历史资料和实际引用检索后回答 | 回答有逐段引用，且问答与用量记录持久化 |
| 持续迭代 | 增量导入、重新生成、版本比较、备份恢复 | 重启后可读，增量和恢复验收通过 |

## 为什么安装标准模板

Skill 的职责是让不同用户基于自己的真实数据快速得到同一套可靠产品能力，而不是每次临时生成一套无法维护的前端。默认安装仓库内经过测试的前后端模板；企业字段、销售阶段、资料来源和部署方式通过业务配置完成。确需改变产品交互时，应修改源码、补测试并重新安装，不能直接改运行时目录。

## 执行顺序

1. 复述用户需求，确认工作台范围。
2. 运行 `setup.mjs --init` 保存不含密钥的业务范围。
3. 安装应用并检查离线测试。
4. 交互式配置 Agent Plan 模型，并在控制台能力列表为专业数据集、豆包搜索、Agent 记忆和 AI Native 应用开发底座确认“开启抵扣”及“配置使用”状态。
5. 在用户知情后创建或连接 AI Native 应用开发底座（Supabase）。
6. 由 `setup-openviking.mjs` 自动连接 Agent 记忆（OpenViking）；需要飞书资料时准备 `lark-cli`。
7. 执行全量 `doctor.mjs --live`，逐项修复数据面。
8. 启动 API 与 Worker，在浏览器创建首位管理员。
9. 导入首批获授权历史资料。
10. 使用获授权测试企业执行搜索、入池、档案和问答验收。
11. 补做重启读取、增量导入、版本比较与备份恢复。

任何创建计费资源、真实 Provider 调用、业务写入、迁移或恢复，都要先说明影响并获得用户确认。

## 进度命令

```bash
node {baseDir}/scripts/setup.mjs
node {baseDir}/scripts/setup.mjs --json
```

进度状态只保存业务范围和脱敏回执，不保存 API Key、飞书正文、企业档案正文或问答内容。缺少阶段时，按 `next_action` 执行，不要跳过失败项。

## 不得宣称完成的情况

- 只安装了页面，没有真实 API 或 Worker。
- 使用了普通按量 Workspace，而不是 AI Native 应用开发底座（Supabase）的 Agent Plan Workspace。
- 配置存在，但没有做全量真实诊断。
- Agent 记忆（OpenViking）只写未搜，或只搜未写。
- 飞书资料没有经过用户授权。
- 档案或问答使用固定数据、静态引用或不可核验来源。
- 没有执行真实企业搜索、档案、问答和持久化回读。
