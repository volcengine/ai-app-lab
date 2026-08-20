---
name: "search-reactions"
description: "检索和比较结构化化学反应先例，保留来源、质量状态、条件和相似度定义。用于按反应 ID、组分、SMARTS 或整体反应相似性查找先例。"
---

# 化学反应先例检索

## 能力

在明确 provider 和检索定义的前提下查找反应先例：

- 按 reaction ID 精确查找记录；
- 按输入/产物组分执行 exact、substructure、SMARTS 或 similarity 检索；
- 按 reaction SMARTS 查找转化模式；
- 用两套固定 RDKit reaction fingerprint 比较完整反应；
- 展示来源报告的参与物、条件、产率、许可和质量标记；
- 区分 zero hits、请求阻断、远程超时和远程错误；
- 保留 rejected/review 状态，不静默扩大查询或混排不可比分数。

适用于：

- “查找和这个反应相似的反应先例”；
- “ORD 里有没有这个 reaction ID”；
- “查产物含某个子结构的反应”；
- “按 reaction SMARTS 查相同转化”；
- “对比候选先例报告的条件和产率”。

## 执行流程

1. 确认输入是结构化单步反应，不从论文正文或图片抽取反应。
2. 显式确认 `provider`、`operation`、`top_k`、手性和 review 记录策略。
3. 相似反应检索还必须确认 `fingerprint_profile_id`，不得使用隐藏默认值。
4. 本地检索先独立验证 curate v1.1 Artifact 的 envelope、fingerprint、
   record state、binding、canonical 和全局 ID，再执行 eligibility 和 search；
   远程 ORD 只允许官方固定域名。
5. 运行：

```bash
python scripts/search_reactions.py \
  --input search-request.json \
  --output reaction-precedents.json
```

6. 校验：

```bash
python scripts/validate_output.py reaction-precedents.json
```

7. 报告 provider 状态、query interpretation、命中数、排除记录、review queue、来源和许可。

## 首版 Provider

```text
local_curated_corpus
  消费 curate-reactions artifact；最多 50,000 条；离线确定性检索

ord_public_api
  调用 https://open-reaction-database.org/api；最多召回 1,000 条候选
```

ORD 候选的结构相似度由本地固定 RDKit profile 重算。DataPro 或网页搜索只可
补论文元数据，不得参与结构召回或相似度。

## 强制边界

- 固定 `rdkit==2025.9.2`、`ord-schema==0.8.3`；
- operation 仅限 `lookup_reaction`、`search_components`、
  `search_transformations`、`search_similar_reactions`；
- 本地 rejected 记录永不排序，review 记录只按显式选项纳入；
- 多个 component predicate 按 AND，不自动放宽；
- 不同 fingerprint profile、component similarity 与 whole-reaction
  similarity 不可混排；
- 不设置默认 similarity threshold；
- score tie 按 provider、dataset ID、reaction ID 稳定排序；
- 条件和产率仅为来源报告证据，不进入相似度分数；
- 0 hit 只表示当前 provider/query 无命中，不能写成不存在先例；
- 不输出反应可行、条件最优、可安全执行或推荐条件；
- 不做 PDF 抽取、条件推荐、收率预测、产物预测、逆合成或路线批准；
- 不接受任意远程 URL、API Key、Cookie 或 Authorization。

## 与其他 Skill 的关系

```text
curate-reactions
结构化反应、质量状态和可检索语料
        ↓
search-reactions
候选召回、显式排序和条件证据表
        ↓
review-routes
后续逐步先例覆盖和路线人工评审
```

完整输入输出字段、profile、状态和科学边界见
`references/输入输出与科学边界.md` 和
`references/CurateArtifact消费合同.md`。
