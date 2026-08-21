---
name: standardize-chemical-structures
description: "离线批量解析、标准化、去盐、提取 parent、检查异常并按原始/标准化/parent 结构分组。用于清洗 SMILES、CSV、SDF、MolBlock，检查价态/立体化学/混合物，或为描述符、相似性检索和建模准备结构数据。"
---

# 化学结构标准化与质量检查

把本地结构数据转换为可审计的标准化结果。始终保留原始结构，显式展示失败、派生 parent、重复关系和人工复核点。

## 执行流程

1. 确认用户目标、输入文件/结构和期望 profile。未指定时使用 `chembl-pipeline`。
2. 检查本地依赖：

```bash
python -c "import rdkit, chembl_structure_pipeline; print(rdkit.__version__, chembl_structure_pipeline.__version__)"
```

3. 运行确定性脚本。文件输入示例：

```bash
python scripts/standardize_structures.py \
  --input compounds.csv \
  --input-format csv \
  --structure-column structure \
  --id-column id \
  --profile chembl-pipeline \
  --output structures-qc.json \
  --csv-summary structures-qc.csv
```

直接输入示例：

```bash
python scripts/standardize_structures.py \
  --smiles 'CCO' --record-id ethanol \
  --smiles 'CO(C)C' --record-id invalid \
  --profile rdkit-basic \
  --output structures-qc.json
```

4. 校验 JSON：

```bash
python scripts/validate_output.py structures-qc.json
```

5. 读取[输入输出与标准化边界](references/输入输出与标准化边界.md)，解释 `disposition`、QC、重复分组和 parent 边界。
6. 向用户总结总数、ready/review/rejected、关键失败、重复组和人工确认项，并提供输出路径。

## Profile 选择

- `rdkit-basic`：处理步骤仅使用 RDKit Cleanup 与 ChargeParent，适合轻量本地清洗；当前发布环境仍按 `requirements.txt` 同时安装两个固定依赖，以便显式切换 profile。
- `chembl-pipeline`：使用 ChEMBL Checker、Standardizer、GetParent；该 Pipeline 本身基于 RDKit，不得称为独立引擎交叉验证。
- 一次运行只选择一个 profile。不得无条件串联并覆盖结果。

## 强制规则

- 原始 `id`、来源和 `original_structure` 必须逐条保留。
- 空文件或零条记录必须失败关闭；不得生成“0 条成功”的结果。
- 无法解析的记录必须输出并标为 `rejected`；不得生成伪 canonical SMILES。
- 对混合物/复杂多组分和聚合物不生成单一 parent。
- parent 是派生表示；同一 parent 不代表盐型、游离形式或实物样品相同。
- 未知立体化学、金属、同位素、混合物、聚合物/V3000 必须显式进入人工复核。
- ChEMBL GetParent 返回排除标记时必须进入人工复核，不得标为 `ready_for_downstream`。
- `ready_for_downstream` 只表示通过当前数据规则，不表示身份、活性、安全性或科学结论已确认。
- 不查询公共数据库，不抓取 ChEMBL 活性；需要身份补充时单独使用 `resolve-chemical-identities`。
- 不输出 API Key、Authorization、Cookie、Token 或其他凭证。
- 不自动判断药效、毒性、活性、可合成性、实验安全或结构确证。

## 退出码

- `0`：完成且没有 rejected 记录；
- `2`：已写出完整结果，但至少一条记录 rejected；
- `3`：依赖或输入加载失败。

退出码不是科学结论；始终查看 JSON 记录和人工复核项。
