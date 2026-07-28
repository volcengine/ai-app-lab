# 工程架构

## 目录与运行模型

1. 仓库根目录 `app/`：唯一的完整开源应用源码。
2. `skills/investment-assistant/`：符合 Agent Skills 规范的初始化 Skill，仅保存指令、编排脚本和参考规则。
3. Codex 个人 Skill：`${CODEX_HOME:-~/.codex}/skills/investment-assistant`。
4. Claude Code 个人 Skill：`${CLAUDE_CONFIG_DIR:-~/.claude}/skills/investment-assistant`。
5. 已安装 Skill 的 `assets/app/`：由仓库级安装器从根目录 `app/` 生成的自包含应用安装包，不是第二份源码。
6. `~/.local/share/investment-assistant/app`：经过依赖安装、检查、测试和构建后的生产运行时。
7. `~/.config/investment-assistant`：本机私密配置。
8. `~/.local/share/investment-assistant`：SQLite、日志、备份和运行状态。

Codex 与 Claude Code 安装器复制同一份 Skill，并在安装阶段生成相同的自包含应用包。
从克隆仓库执行时，`install.mjs` 读取根目录 `app/`；从任一客户端已安装 Skill
执行时读取随 Skill 生成的 `assets/app/`。所有方式都通过临时目录和原子替换更新
运行时，用户不需要创建第二份前后端项目。

## 数据流

1. 前端请求最新简评或盘后检查。
2. 个股简评构造当前行情、最新已披露财务和用户偏好查询。
3. 盘后摘要构造当日行情、上一份盘后报告之后的新增事件和近期外部风险查询。
4. 服务端调用 DataPro 获取专业数据，再调用豆包搜索补充公开信息。
5. 结果标准化为 `D*` 与 `W*` 证据；盘后另有仅供审计的检查范围证据。
6. 服务端校验证券归属、日期、来源类型和偏好覆盖。
7. Agent Plan 模型只接收本次证据快照，输出严格结构化报告。
8. 服务端校验引用存在性、数字支持关系和语义对应，再把报告、结构化专业数据及最小化网页来源记录保存到 SQLite；豆包搜索原始摘要不落盘。
9. 前端展示正文实际引用的来源与历史。

## 凭证流

正常初始化只配置 `ARK_API_KEY`：

- Agent Plan 模型直接使用 `ARK_API_KEY`。
- DataPro 使用 `DATAPRO_API_KEY || ARK_API_KEY`。
- 豆包搜索使用 `WEB_SEARCH_API_KEY || ARK_API_KEY`。

独立覆盖项仅用于高级兼容场景，不属于默认用户流程。

## 模块边界

- `src/server/providers/`：DataPro、豆包搜索和 Agent Plan 模型协议。
- `src/server/domain/`：报告 Schema、证据规范化、事实与时间校验。
- `src/server/services/`：报告生成、语义审校、监控和健康诊断。
- `src/server/db/`：关注列表、设置、报告历史、执行记录和调度租约。
- `src/web/`：React 单页应用，只通过 `/api` 使用后端。

## 报告边界

### 个股简评

使用当前行情、最新财务和关注方向相关材料，回答公司当前状态。固定栏目为市场表现、经营与财务、关注方向和后续观察。

### 盘后风险摘要

使用独立时间窗口，区分市场异动、新增公司事件和近期外部风险，回答本次检查窗口内发生的变化。静态财务快照不能冒充盘后事件。

两类报告拥有独立检索、证据快照、指纹、正文结构、变化状态和历史。首批验收要求两类报告不复用同一联网 URL。

## 可靠性约束

- DataPro 或豆包搜索失败时不让另一来源冒充成功。
- DataPro 证据必须能确认属于目标证券。
- 同类上一份报告已有更新日期时，本次专业数据不得回退。
- 公司经营数字只能由 DataPro 或合格一手来源支持。
- 用户偏好逐项形成 `covered`、`partial` 或 `watch` 状态。
- 只有已覆盖主题可以进入对应正文。
- 模型输出必须通过引用、数字和独立语义审校。
- 每次成功生成都保存最小化证据记录、指纹和历史记录；网页来源只保留引用元数据与正文派生摘要。
- SQLite 调度租约避免 API 进程与 Worker 重复执行同一任务。
- 自动失败保留错误原因；手动成功不清除最近一次自动失败。

## 部署

默认单进程同时提供 API、生产前端和调度器。需要拆分时可令 API 使用 `ENABLE_SCHEDULER=false`，再单独运行 Worker。两者共用同一 SQLite 时必须位于同一主机或可靠本地持久卷。
