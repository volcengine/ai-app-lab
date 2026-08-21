---
name: car-decision-assistant
description: 中文购车决策助手初始化与验收 Skill。用于安装、配置、启动、恢复或诊断仓库内完整前后端，引导用户选择自己的 AI Native 应用开发底座 Workspace，私密配置 Agent Plan Key，真实调用专业数据集核验 1–3 款候选车型、配置与城市车系月度数据，并完成应用开发底座和浏览器验收。用户提出“初始化购车决策助手”“安装选车网站”“配置汽车专业数据”“启动购车助手”或排查该应用时使用。
---

# 购车决策助手初始化

本 Skill 配置并验收仓库内现成的全栈应用，不重新设计页面，也不替用户直接推荐车型。产品允许用户用自然语言表达需求，确认最多 3 款精确车型，并基于汽车专业数据与本人记录形成逐项对比。

## 远程入口

用户可能直接通过版本化 URL 触发，而不是预先克隆仓库：

```text
帮我初始化购车决策助手：https://github.com/3494036618-eng/car-decision-assistant/blob/v0.1.0/skills/car-decision-assistant/SKILL.md
```

如果 `{baseDir}/scripts/status.mjs` 不存在，必须：

1. 从用户提供的 URL 解析同一 GitHub 仓库和 ref，下载该版本完整仓库，不能只下载 `SKILL.md`。
2. 将 `{baseDir}` 设为仓库中的 `skills/car-decision-assistant`。
3. 确认仓库根目录存在 `package.json`、`app/`、`supabase/` 和本 Skill 的 `scripts/`。
4. 运行根目录的 `npm run skill:validate` 与 `npm run skill:test`。
5. Codex 执行 `npm run skill:install:codex`；Claude Code 执行 `npm run skill:install:claude`。
6. 已有同名目录时先检查 Git remote 和工作区，不覆盖用户改动，不创建第二套应用。

下载、校验和安装阶段不得创建云资源、修改数据库或调用真实 Harness 能力。

## 完成标准

只有以下事项全部完成，才可以说“购车决策助手可以使用”：

1. 完整仓库依赖安装、类型检查、测试和生产构建通过。
2. 用户明确选择自己的 AI Native 应用开发底座 Workspace；仓库没有作者资源 ID。
3. Agent Plan Key 通过隐藏终端输入或私密环境配置，未出现在聊天、源码和日志。
4. AI Native 应用开发底座的 Schema、RLS、原子保存函数和回滚烟测通过。
5. Agent Plan 与专业数据集当前真实探测成功。
6. 网站启动，首页/API 属于本次安装的进程。
7. 至少用一组用户需求完成车型一次确认、完整生成、重新加载恢复和删除。
8. 正式交付前，三组固定真实场景全部通过。
9. 浏览器检查无阻断错误，专业事实、待确认项和证据状态可见。

任一项未完成，都要说明具体阶段和下一步，不能用 HTTP 200、进程存活、Mock、旧截图或历史测试代替。

## 安全原则

- 不要求用户把 Key 发到聊天；只使用隐藏终端输入、进程环境或权限为 `0600` 的本机凭证文件。
- AI Native 应用开发底座写入前展示目标 Workspace ID、区域和操作内容，并取得用户确认。
- 不自动创建、暂停、删除 Workspace，不使用作者或共享 Workspace。
- `doctor --live` 和真实验收会消耗 Agent Plan/专业数据集额度，执行前说明影响并确认。
- 不把模型输出当汽车事实；车型配置和城市车系数据只能来自本次专业数据集返回。
- 用户选择精确车型后冻结标识；无精确数据时标记缺失，不重新猜版本。
- 当前版本不调用豆包搜索。

## 阶段 0：检查状态

```bash
node {baseDir}/scripts/status.mjs
```

判断是首次安装、已有配置未启动、正在运行还是需要诊断。不要要求用户重新提供源码目录。

## 阶段 1：确认用户配置

在任何真实调用前确认：

1. 火山账号和 Agent Plan 是否已购买可用。
2. 是否已在“配置 Harness”中开启并授权“专业数据集”。
3. 用户要复用的 AI Native 应用开发底座 Workspace；多个 Workspace 时必须让用户选择。
4. Workspace 所在区域和本机 CLI Profile。
5. 本机端口，默认 `3003`。

先运行 AI Native 应用开发底座的只读计划：

```bash
node {baseDir}/scripts/setup-supabase.mjs \
  --workspace-id <workspace-id> \
  --profile agent-plan \
  --region cn-beijing
```

该步骤不得写数据库。

## 阶段 2：安装与私密配置

```bash
node {baseDir}/scripts/install.mjs
node {baseDir}/scripts/configure.mjs \
  --workspace-id <workspace-id> \
  --profile agent-plan \
  --region cn-beijing
```

`configure.mjs` 隐藏读取一枚 Agent Plan Key，并将配置保存到本机私密目录，文件权限必须为 `0600`。不得把 Key 写进 `.env.example`、Profile JSON 或命令参数。

## 阶段 3：初始化 AI Native 应用开发底座

向用户说明将对所选 Workspace 应用仓库 Schema。用户明确确认后执行：

```bash
node {baseDir}/scripts/setup-supabase.mjs \
  --workspace-id <workspace-id> \
  --profile agent-plan \
  --region cn-beijing \
  --apply \
  --yes
```

脚本必须应用 `supabase/001_initial_schema.sql`，执行 `002_smoke_test.sql`，再运行数据库 advisors。任何一步失败都停止，不尝试其他 Workspace。

## 阶段 4：启动与诊断

```bash
node {baseDir}/scripts/start.mjs
node {baseDir}/scripts/status.mjs
```

说明真实诊断会产生少量调用，用户确认后运行：

```bash
node {baseDir}/scripts/doctor.mjs --live --confirm-live
```

必须分别看到 Agent Plan 和专业数据集为 `ok`。只看到 `configured=true`、页面打开或进程存在都不算通过。

停止服务不会删除 AI Native 应用开发底座中的数据或本机私密配置：

```bash
node {baseDir}/scripts/stop.mjs
```

## 阶段 5：真实业务验收

真实验收会写入并清理测试项目、调用 Agent Plan 与专业数据集。用户确认当前 Workspace 和额度后执行：

```bash
node {baseDir}/scripts/acceptance.mjs --confirm-live
```

验收至少检查：

- 三组场景都只选择一次精确车型。
- 选定 ID 在配置和销量查询中保持不变。
- 每款车本次可返回的配置与城市月份进入项目。
- 单车缺失不让整个项目失败。
- 原始需求、报价和本人确认刷新后保留。
- 恢复后旧 Cookie 失效。
- 测试项目最终删除。
- evidence 具有时间和可用的 trace/request ID。

详细检查见 `references/acceptance.md`。

## 阶段 6：浏览器交付

打开 `status.mjs` 输出的本地地址，完成一组真实用户路径：

1. 输入城市、预算、1–3 个品牌或车系及自然语言需求。
2. 从专业数据候选中确认一次精确版本。
3. 等待首次生成完成，不使用“刷新待补数据”。
4. 检查专业数据已核验、冲突和本人确认的视觉区分。
5. 检查城市车系数据的城市、月份、口径和来源。
6. 录入一项本人体验和完整落地报价，刷新后仍存在。
7. 查看证据时间与 trace/request ID。
8. 使用恢复码恢复，再删除测试项目。

## 数据边界

- 无法自动核验：真实落地价、保值率、保险成本、车主口碑、充电便利性和主观乘坐体验。
- 有条件核验：精确车型配置、指导价、城市车系月度数据和明确的辅助驾驶配置字段。
- 专业数据集不返回原生 code 时，内部允许绑定带 `datapro-name:` 的精确版本名，但必须标明这不是原生数值 ID。

修改车型解析、证据或判断逻辑前阅读 `references/evidence-policy.md`。安装和排障见 `references/setup.md`、`references/troubleshooting.md`。

## 最终交付说明

最终回复必须列出：

1. 安装路径、网站地址、PID 和当前状态。
2. 用户选择的 Workspace ID、Profile 和区域；不输出任何 Key。
3. Agent Plan、专业数据集、AI Native 应用开发底座的当前验证结果。
4. 实际执行的安装、构建、测试、真实验收和浏览器检查。
5. 真实场景是否全部通过以及是否清理测试数据。
6. 未完成事项、第三方数据缺口和仍需人工核验的风险。

不要只说“初始化完成”。
