---
name: "curate-reactions"
description: "整理和审查结构化化学反应，保留原始记录并检查参与物、角色、产率、重复、守恒和 ORD 合同。用于清洗 reaction SMILES、ORD 或反应表格。"
---

# 化学反应数据整理与质量审查

## 能力

使用固定 ORD Schema 和 RDKit 对结构化单步反应执行非破坏性整理：

- 读取 ORD Reaction/Dataset、reaction SMILES、CSV/JSON；
- 校验来源、记录 ID、ORD 官方 errors/warnings；
- 复用前序结构标准化 artifact 的结构、盐型、parent 和状态；
- 检查参与物结构、报告角色与参与性冲突；
- 检查产率范围、分析关联、重复反应、元素和形式电荷差；
- 保留 rejected、partial 和 review 记录；
- 输出稳定 reason code、人工复核队列和确定性结果指纹。

适用于：

- “整理这批 reaction SMILES”；
- “检查这些 ORD 反应记录的质量”；
- “找出反应数据中的重复、角色冲突和异常产率”；
- “把标准化化合物状态传播到反应参与物”；
- “为反应检索准备可审计数据”。

## 执行流程

1. 确认输入是单步结构化反应，不接收 PDF、图片或自然语言实验步骤。
2. 对 JSON/CSV/ORD 输入保存来源标识和 SHA-256。
3. 如提供 standardize Artifact，先独立验证 v1 envelope、fingerprint、
   逐记录状态和全局唯一 ID，再允许 participant 精确绑定。
4. 运行：

```bash
python scripts/curate_reactions.py \
  --input reactions.json \
  --output curated-reactions.json
```

5. 校验：

```bash
python scripts/validate_output.py curated-reactions.json
```

6. 报告 `ready_for_search/review_required/rejected` 计数、规则命中、重复组、未解决项和人工复核原因。

## 强制边界

- 核心固定 `ord-schema==0.8.3` 和 `rdkit==2025.9.2`；
- 首版最多 5000 条，单条 JSON 最多 2 MiB，总输入最多 100 MiB；
- reported/standardized form 用于审查；parent 只作候选分组；
- 不自动覆盖来源角色，不自动补反应物、副产物或化学计量数；
- 不静默删除、合并或写回任何记录；
- 元素、电荷和原子映射只提供诊断，不证明反应正确；
- 缺失产率不填 0，0.5 不自动解释为 50%，超过 100 不裁剪；
- 不输出“适合建模”、反应成功、可复现、安全或可执行结论；
- 不进行反应搜索、逆合成、条件推荐、性质预测、实验执行或知识图谱；
- 不访问网络，不调用 DataPro、豆包搜索或远程化学数据库。

## 与其他 Skill 的关系

```text
resolve-chemical-identities
名称/ID → 唯一候选（条件前缀）

standardize-chemical-structures
参与物结构 → reported/standardized/parent、QC 和状态

curate-reactions
多个参与物 → 非破坏性反应记录、QC、重复组和复核队列

search-reactions / review-routes
后续反应检索与路线评审
```

详细合同、规则 ID、状态和科学边界见
`references/输入输出与科学边界.md` 和
`references/标准化Artifact消费合同.md`。
