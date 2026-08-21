---
name: "search-and-curate-chemical-libraries"
description: "对已标准化化合物库执行可审计的相似性、子结构、聚类、多样性选择和只读治理。用于查找结构邻居、筛选子结构、整理分子库或选择代表分子。"
---

# 本地结构检索与化合物库治理

## 能力

使用固定 RDKit 对前三个化学 Skill 的产物执行：

- 化合物库可检索性审查；
- Tanimoto 相似性检索；
- 非递归 SMILES/SMARTS 完整子结构匹配；
- Butina 聚类；
- 固定 seed 的 MaxMin 多样性选择；
- exact structure 和风险记录的只读治理复核队列。

适合以下请求：

- “找出与这个分子结构最相似的 20 个记录”；
- “筛选包含这个 SMARTS 子结构的化合物”；
- “按 Morgan 指纹给这批分子聚类”；
- “从化合物库中选择 100 个结构多样的代表”；
- “检查库里哪些记录重复、不可检索或需要人工复核”。

## 执行流程

1. 确认输入来自 `compute-molecular-features`，并阅读
   [Features Artifact 消费合同](references/FeaturesArtifact消费合同.md)。
   audit、相似性、子结构、聚类和多样性选择都不得绕过该合同直接读取
   `standardize-chemical-structures`。
2. 要求用户显式选择 `standardized` 或 `parent` 视图，禁止跨视图比较。
3. 相似性、聚类和多样性选择要求显式 `fingerprint_profile_id`；不得自行重算或替换指纹。
4. 根据任务创建 request JSON，显式记录阈值、top-k、手性、seed 和是否纳入 review 记录。
5. 运行：

```bash
python scripts/search_and_curate.py \
  --request request.json \
  --output result.json
```

6. 校验：

```bash
python scripts/validate_output.py result.json
```

7. 向用户报告 indexed/excluded/error 计数、查询结果、参数、复核队列和未验证边界。

## 五个 operation

- `audit_library`：审查 profile、结构视图、上游状态、重复结构和排除记录；
- `similarity_search`：固定 Tanimoto，`top_k`、`threshold` 至少提供一个；
- `substructure_search`：`query_type`、query、`use_chirality` 和 `max_results` 必填；
- `cluster_library`：固定 Butina，要求显式 `similarity_threshold`；
- `select_diverse_subset`：固定 MaxMin，要求显式 `pick_size` 和非负 `seed`。

## 强制边界

- 首版唯一引擎为 `rdkit==2025.9.2`；
- 相似性、子结构、审查和 MaxMin 最多 5000 个可检索记录，Butina 最多 2000 个；
- 无全局默认相似度或聚类阈值；
- review 记录默认不索引；显式纳入时风险继续传播；
- rejected、not_run 和 error 记录永不索引，但必须保留在输出 manifest；
- fingerprint/pattern 只可预过滤，子结构最终命中必须经过完整子图匹配；
- 首版拒绝所有 recursive SMARTS；
- 不自动删除、合并、覆盖或写回用户化合物库；
- 不预测或声称活性、功能、机制、药效、毒性、安全、可合成性或实验优先级；
- parent 相同不表示相同盐型、制剂、批次或物理样品；
- 不访问网络，不调用远程化学数据库；
- 不训练模型，不执行对接、逆合成、生成、真实实验或知识图谱；
- 不修改平台、MCP、数据库、前端或 Agent runtime。

## 与其他 Skill 的边界

```text
resolve-chemical-identities
名称/标识符 → 候选化学记录与来源状态

standardize-chemical-structures
已知结构 → standardized/parent、结构 QC 和重复组

compute-molecular-features
明确结构视图 → 二维描述符和固定指纹

search-and-curate-chemical-libraries
固定结构/指纹 → 只读检索、分组、选择和治理复核队列
```

本 Skill 不解析名称或数据库 ID，不标准化结构，不重新计算第三 Skill 指纹，也不执行性质预测和模型训练。

输入输出合同、算法参数、状态、Gold、性能边界和科学解释规则见
`references/输入输出与科学边界.md`。
