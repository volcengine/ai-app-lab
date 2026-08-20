# Chemistry Research Skills

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.11%20%7C%203.12-blue.svg)](pyproject.toml)
[![Status](https://img.shields.io/badge/status-public%20alpha-blue.svg)](#项目状态)

Auditable chemistry skills and research workflows for AI agents.

面向科研 Agent 的可审计化学能力集合，提供 7 个独立科学 Skill、2 条多步骤
Workflow，以及来源绑定、人工复核和确定性路由机制。

[中文](#中文) | [English](#english)

---

## 中文

### 这个项目解决什么问题

通用 Agent 可以生成化学代码，但科研任务还需要可追溯来源、固定输入输出合同、
失败状态保留、科学边界和人工复核。本项目将这些要求封装为可独立安装的 Agent
Skills，并为多步骤任务提供确定性的 Workflow 和 Router。

```text
用户自然语言
→ Agent 语义理解
→ 来源绑定的 ResearchIntent
→ Policy Guard
→ 确定性 Router
→ 单个 Skill / 受控 Skill 链 / Workflow
→ Validator 与人工复核
```

### 包含内容

#### 7 个科学 Skill

| Skill | 用途 | 不负责 |
|---|---|---|
| `resolve-chemical-identities` | 解析名称、SMILES、InChI、CID、ChEMBL ID 和 CAS RN，保留候选、歧义与冲突 | 不把单一数据库命中当作身份定论 |
| `standardize-chemical-structures` | 解析、标准化、去盐、提取 parent 并执行结构质量检查 | 不确认物理样品、活性或安全性 |
| `compute-molecular-features` | 确定性计算二维描述符和 Morgan、RDKit、MACCS 指纹 | 不生成实验测量值或活性结论 |
| `search-and-curate-chemical-libraries` | 相似性、子结构、聚类、多样性选择和只读治理 | 不自动删除或改写原始化合物库 |
| `curate-reactions` | 非破坏性整理 reaction SMILES、ORD 和反应表格 | 不证明反应正确或可实验 |
| `search-reactions` | 按 ID、组分、SMARTS 或整体反应相似度检索先例 | 不把先例升级为路线推荐 |
| `review-routes` | 审查已有路线拓扑、逐步证据、库存声明和证据缺口 | 不生成逆合成路线或实验安全批准 |

#### 1 个编排 Router

`chemistry-research-router` 位于标准 `skills/` 目录中，但不计入 7 个科学
Skill。它负责将 Agent 生成的语义草稿转换为可验证的 `ResearchIntent`，再路由到：

- 单个科学 Skill；
- 4 条受控 Skill 链；
- Workflow A 或 Workflow B；
- 澄清、确认或不支持状态。

Router 不使用关键词匹配替代 Agent 的语义理解，也不会自动补充用户未提供的科学参数。

#### 2 条 Workflow

Workflow A：`compound-evidence-v1`

```text
身份解析
→ 身份确认门
→ 结构标准化
→ 计算视图确认门
→ 二维特征
→ 可选分子库操作
→ 证据包
```

Workflow B：`route-evidence-review-v1`

```text
反应整理
→ 路线步骤发现
→ 逐步骤先例检索
→ 步骤证据组装
→ 已有路线复核
→ 专家复核包
```

两条 Workflow 都保留 Event Ledger、Artifact Registry、Evidence Index、
Claim Ledger、校验和及 Human Gate 状态。

### 项目结构

```text
chemistry-research-skills/
├── plugin.json                     # Agent Plugins 元数据
├── skills/
│   ├── chemistry-research-router/  # 编排入口
│   └── <7 scientific skills>/      # 独立科学能力
├── workflows/                      # Workflow 定义与运行时
├── orchestration/                  # Bundle、chain 定义与认证合同
├── examples/                       # 可复现离线示例
├── tests/                          # 单元、合同、集成与发布边界测试
├── scripts/                        # 仓库验证工具
└── .github/                        # CI 与贡献模板
```

每个 Skill 至少包含 `SKILL.md`；确定性代码位于 `scripts/`，详细合同位于
`references/`，模板或静态资源位于 `assets/`，Host 元数据位于 `agents/`。

### 环境准备

要求：

- Python 3.11 或 3.12
- macOS 或 Linux
- `uv`

```bash
uv sync --frozen --all-groups
uv run python scripts/validate_repository.py
uv run python -m pytest -q
```

依赖通过 `pyproject.toml`、`requirements-dev.txt` 和 `uv.lock` 固定。

### 使用方式

#### 只安装一个科学 Skill

将目标 `skills/<skill-name>/` 复制到 Agent 支持的项目级或用户级 Skills
目录。不同 Host 的发现路径和扩展字段可能不同，请以目标 Host 的当前文档为准。

#### 安装完整 Router Bundle

当前经过离线安装测试的 Host 为 TRAE、Codex 和 Claude Code：

```bash
npx github:3494036618-eng/chemistry-research-skills install \
  --host trae \
  --target-root /path/to/existing-project
```

该 Node 入口只负责调用仓库内的 Python 安装器，并自动为目标项目同步
`.chemistry-agent-bundle/runtime` 环境；科学计算仍由 Python Skill 执行。

备用的显式 Python 安装命令：

```bash
uv run python skills/chemistry-research-router/scripts/install_bundle.py \
  --host trae \
  --scope project \
  --source-root . \
  --target-root /path/to/existing-project
```

`--host` 还可使用 `codex` 或 `claude-code`。安装器会：

1. 校验 canonical Bundle manifest；
2. 复制 7 个科学 Skill、Router 和完整 Runtime；
3. 运行 12 条离线 smoke；
4. 生成 installation receipt；
5. 拒绝 symlink、路径逃逸、校验和漂移和冲突覆盖。

安装不会修改模型、provider、API Key 或 MCP。目标 Runtime 首次使用前仍需创建环境：

```bash
uv sync --frozen --all-groups \
  --project /path/to/existing-project/.chemistry-agent-bundle/runtime
```

根目录 `plugin.json` 提供 Agent Plugins 1.0.0 元数据。各 Plugin Host 的真实加载
兼容性仍需分别验证，不能仅凭目录存在声称已经认证。

### 示例

7 个科学 Skill 的离线阿司匹林示例：

```bash
uv run python examples/aspirin-seven-skill-e2e/run_case.py \
  --output-dir /tmp/aspirin-seven-skill
```

Workflow A/B 联合验收：

```bash
uv run python examples/workflow-a-b-e2e/run_acceptance.py \
  --output-dir /tmp/workflow-a-b-acceptance \
  --network-disabled
```

### 网络与数据

大部分能力可以离线运行。以下功能可访问第三方服务：

- `resolve-chemical-identities`：OPSIN、PubChem、ChEMBL、UniChem；
- `search-reactions`：Open Reaction Database 官方 API。

不要向第三方服务发送保密、敏感或未公开的名称、结构和反应数据。仓库不包含商业
数据库导出、真实用户数据、内部验收 Trace、模型密钥或运行凭证。

### 科学与安全边界

本项目用于科研数据整理、确定性计算和证据准备，不提供：

- 实验安全批准；
- 临床或医疗建议；
- 路线生成和最优性结论；
- 结构相似即活性相同的结论；
- 数据库命中即科学事实的自动升级；
- 无人工复核的实验执行建议。

`ready_for_expert_review` 只表示证据包可交给专家检查，不表示
`ready_for_experiment`。

### 项目状态

- 版本：`0.1.0-alpha.2`
- 发布阶段：Public Alpha；公开源代码，不作生产可用声明
- 7 个科学 Skill：离线代码与合同测试已实现
- Workflow A/B：离线运行、Human Gate、resume 和完整性校验已实现
- Router：确定性核心、安装器和离线 smoke 已实现
- 真实 Host 端到端验证：代表性自然语言链路已通过。Host 自动选择并执行
  `standardize-chemical-structures` → `compute-molecular-features`，
  两步输出均通过公开 Validator
- 化学专家验收与真实用户验收：尚未完成
- 生产可用声明：无

测试通过只能证明已覆盖代码合同在指定环境中可复现，不证明化学结论、实验可行性、
安全性或业务适用性。

### 贡献、安全与许可证

- [贡献指南](CONTRIBUTING.md)
- [安全策略](SECURITY.md)
- [行为准则](CODE_OF_CONDUCT.md)
- [第三方声明](THIRD_PARTY_NOTICES.md)
- [引用信息](CITATION.cff)

原创代码和文档使用 [Apache License 2.0](LICENSE)。

---

## English

### Overview

Chemistry Research Skills is a portable collection of auditable chemistry
capabilities for AI research agents. It combines seven scientific Skills with
a deterministic Router, four bounded Skill chains, and two resumable research
workflows.

The project focuses on provenance, explicit contracts, deterministic
computation, preserved failure states, human review gates, and conservative
scientific claims.

### Included Skills

| Skill | Purpose |
|---|---|
| `resolve-chemical-identities` | Resolve names and identifiers while preserving candidates, provenance, ambiguity, and conflicts |
| `standardize-chemical-structures` | Parse, standardize, desalt, derive parent structures, and report quality issues |
| `compute-molecular-features` | Compute controlled 2D descriptors and Morgan, RDKit, and MACCS fingerprints |
| `search-and-curate-chemical-libraries` | Run similarity, substructure, clustering, diversity selection, and read-only library governance |
| `curate-reactions` | Curate reaction SMILES, ORD records, and reaction tables without overwriting source records |
| `search-reactions` | Search structured reaction precedents by identifiers, components, SMARTS, or reaction similarity |
| `review-routes` | Review existing synthesis routes, step evidence, inventory claims, and evidence gaps |

`chemistry-research-router` is an orchestration Skill, not an eighth scientific
Skill. It validates source-bound intents and selects a direct Skill, bounded
chain, workflow, clarification, confirmation, or unsupported result.

### Quick Start

Requirements: Python 3.11 or 3.12, macOS or Linux, and `uv`.

```bash
uv sync --frozen --all-groups
uv run python scripts/validate_repository.py
uv run python -m pytest -q
```

Install the complete project-scoped bundle:

```bash
npx github:3494036618-eng/chemistry-research-skills install \
  --host trae \
  --target-root /path/to/existing-project
```
The Node entrypoint delegates to the Python installer and runs the target
runtime `uv sync` step automatically. Supported installer values are
`claude-code`, `codex`, and `trae`.

Equivalent explicit Python installer:

```bash
uv run python skills/chemistry-research-router/scripts/install_bundle.py \
  --host trae \
  --scope project \
  --source-root . \
  --target-root /path/to/existing-project
```

### Reproducible Examples

```bash
uv run python examples/aspirin-seven-skill-e2e/run_case.py \
  --output-dir /tmp/aspirin-seven-skill

uv run python examples/workflow-a-b-e2e/run_acceptance.py \
  --output-dir /tmp/workflow-a-b-acceptance \
  --network-disabled
```

### Scientific Boundary

This project prepares research evidence and deterministic chemical artifacts.
It does not provide experimental safety approval, clinical advice,
retrosynthesis generation, automatic feasibility claims, or authorization to
run an experiment.

### Status

- Version: `0.1.0-alpha.2`
- Stage: public alpha; open source under Apache-2.0, not production-ready
- Scientific Skills: seven
- Orchestration Skill: one
- Offline workflows: two
- Representative live-host acceptance: passed. The host selected and executed
  `standardize-chemical-structures` followed by
  `compute-molecular-features` from a natural-language request; both outputs
  passed the public validators
- Chemistry expert and real-user acceptance: pending

### License

Original code and documentation are licensed under the
[Apache License 2.0](LICENSE). Third-party software, services, and runtime data
remain subject to their own terms. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
