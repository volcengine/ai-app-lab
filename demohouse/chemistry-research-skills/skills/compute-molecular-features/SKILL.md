---
name: compute-molecular-features
description: "对已标准化化合物确定性计算受控二维描述符、Morgan/RDKit/MACCS 指纹和数据集质量画像。用于准备分子特征、生成指纹，或检查特征缺失、常数、异常和分布。"
---

# 分子二维特征与数据集质量画像

消费已经通过结构标准化契约的化合物，使用固定版本 RDKit 生成可复验特征。始终区分结构计算、经验描述符、数据集统计、实验测量和模型预测。

## 执行流程

1. 确认输入来自 `standardize-chemical-structures` JSON，或直接 CSV/JSON 中明确提供 `standardized_structure`。
2. 阅读[标准化 Artifact 消费合同](references/标准化Artifact消费合同.md)。
   带 `workflow` 或 `result_fingerprint` 的 JSON 必须作为正式 Artifact
   独立验证，失败时不得降级为 direct JSON；direct JSON/CSV 不具有正式
   standardize provenance。
3. 确认计算视图：
   - 默认 `standardized`，保留用户选择的盐型、组分和电荷表示；
   - 只有用户明确要求时才用 `parent`，且必须说明 parent 不是物理样品。
4. 在隔离环境安装固定依赖：

```bash
python -m pip install -r scripts/requirements.txt
```

5. 运行确定性计算：

```bash
python scripts/compute_features.py \
  --input standardized-structures.json \
  --calculation-view standardized \
  --output molecular-features.json \
  --csv-matrix molecular-features.csv
```

6. 校验输出：

```bash
python scripts/validate_output.py molecular-features.json
```

7. 阅读[输入输出与科学边界](references/输入输出与科学边界.md)，向用户报告计算视图、成功/部分/失败数量、缺失值、统计异常、指纹 profile 和人工复核项。

## 固定首版能力

- RDKit `2025.9.2`，不调用模型、数据库或网络；
- 受控二维描述符集 `rdkit-2d-core-v1`；
- Morgan bit fingerprint：默认 radius 2、2048 bit、启用手性和键类型；
- RDKit topological bit fingerprint：默认 path 1–7、2048 bit、每特征 2 bit；
- RDKit 公共 MACCS 166 keys 兼容表示；
- 每个指纹输出 profile、参数、`on_bits`、bit count、density 和确定性哈希；
- 数据集级缺失率、非有限值、常数/近常数、范围、分位数、IQR 异常、重复结构和指纹密度。

## 上游状态规则

- 上游 `rejected`、解析失败或标准化失败：保留记录，`calculation_status=not_run`，不得生成特征。
- 上游 `review_required`：允许对明确视图生成审计特征，但结果继续为 `review_required`，并完整传播上游原因。
- `parent_structure` 为空且选择 parent 视图：保留记录并 `not_run/review_required`。
- 非法、空或不可解析的选定结构：不自动修复，不补立体化学，不生成伪特征。
- 描述符异常、NaN 或 Inf：转换为 `null`，列入 `missing_features`，结果为 `partial/review_required`。

## 与其他化学 Skill 的边界

- 第一个 `standardize-chemical-structures` 负责解析、标准化、parent、结构 QC 和重复分组；本 Skill 不重复这些规则。
- 第二个 `resolve-chemical-identities` 负责名称/标识符到候选记录及来源对齐；本 Skill 不联网、不做身份解析。
- 本 Skill 只产出特征和描述性统计，不计算结构间相似度，不设阈值，不做子结构检索、聚类、索引或库治理。
- 第四个 `search-and-curate-chemical-libraries` 才消费本 Skill 的固定 profile，执行相似性、子结构、聚类和化合物库治理。

## 强制科学边界

- 二维描述符不是实验测量值。
- `MolLogP`、TPSA、HBD/HBA 等是基于结构规则或经验片段的计算量。
- 指纹相同或相近不表示功能、活性、机制、毒性或可合成性相同。
- 数据集画像只描述当前输入，不能自动给出模型适用性结论。
- 盐型与 parent 的特征必须保留为不同计算视图，不得覆盖或解释为同一物理样品。
- 不预测药效、活性、毒性、可合成性、实验安全或临床效果。
- 不训练模型，不生成分子，不做对接、逆合成、知识图谱或真实实验。
- 不输出 API Key、Authorization、Cookie、Token 或其他凭证。

## 退出码

- `0`：结果已写出且没有 rejected 记录；
- `2`：结果已写出，但至少一条记录 rejected；
- `3`：依赖、输入或参数错误，未形成有效结果。

退出码仅表示软件流程状态；必须检查逐记录状态、数据画像和人工复核项。
