# 路由边界

## 原子 Skill

以下目标只处理各自公共合同内的单步任务：

- `resolve-chemical-identities`：解析名称、结构或公开标识符，保留歧义和来源；
- `standardize-chemical-structures`：离线标准化结构并输出质量状态；
- `compute-molecular-features`：消费标准化 Artifact 计算受控二维特征；
- `search-and-curate-chemical-libraries`：消费 Features Artifact 做只读库操作；
- `curate-reactions`：整理结构化单步反应；
- `search-reactions`：在明确 provider 与查询定义下检索反应先例；
- `review-routes`：评审已有路线，不生成路线。

明确离线、无费用、无外发、输入完备的单步任务可直接进入原子 Skill。名称解析、公开数据库查询和其他可能联网的单步任务仍进入 Router。

## 固定 chain

Router 只允许四条版本化 chain：

- `identity-standardization-v1`：身份解析后标准化；
- `structure-features-v1`：结构标准化后计算特征；
- `structure-library-v1`：标准化、特征和一次受控分子库操作；
- `reaction-precedent-v1`：反应整理后检索先例。

Agent 不得增加、删除、重排节点，也不得提供 Definition、Adapter ID 或命令。

## Workflow

- `compound-evidence-v1`：身份、标准化、特征和可选库操作的完整证据链；
- `route-evidence-review-v1`：反应整理、逐步骤先例检索、已有路线评审和专家包。

Workflow 的 Human Gate、checkpoint、resume、Artifact Registry 和独立 Validator 始终生效。

## 必须停止

当前版本不支持：

- 毒性或活性预测；
- 逆合成路线生成或自动实验；
- 实验安全、放大或合规审批；
- 蛋白质或复合物结构预测；
- 用缺失数据、模型猜测或 Agent 解释补成科学证据。

命中这些目标时返回 `unsupported`，不生成替代实验方案或虚假数据需求。
