# Search Artifact 消费合同

## 版本

```text
consumer = review-routes ruleset 1.1.0
producer = search-reactions schema 1.0.0 / ruleset 1.1.0
```

`review-routes` 只消费通过独立合同和 step binding 的正式 Search Artifact。
fingerprint 正确但 query/results 属于其他反应的 Artifact 不得作为当前 step
证据。

## 验证顺序

```text
Search envelope
→ query/options/corpus provenance
→ result/result_hash/profile/state
→ query 与 route step 化学绑定
→ precedent provenance
→ route disposition
```

fingerprint 是内容完整性 hash，不是签名或来源认证。

## Operation Binding

| Search operation | 当前 step 绑定 | Match level |
|---|---|---|
| `lookup_reaction` | result canonical reaction hash 等于 step hash | `exact_record` |
| `search_transformations` | step 满足 query reaction SMARTS | `exact_transformation` |
| `search_similar_reactions` | query reaction 或 exact-target result 绑定 step | `similar_reaction` |
| `search_components` | 所有 component predicates 对 step 使用 AND | `component_only` |

match level 只由 operation 决定。result 自报的 retrieval mode、score=1 或
exact-target 标记不能把 similarity/component 升级为 exact。

ID-only `completed_zero_hits` 没有结构证明 ID 属于当前 step，首版按 binding
error 失败关闭。timeout/source error 不声称不存在先例，只进入人工复核。

## Result Contract

每条 result 必须验证：

```text
rank
reaction_id
provider
reaction_smiles
retrieval_mode
fingerprint_profile
raw_score
score_scope
matched_constraints
curation_disposition
quality_findings
result_hash
```

`rejected` result 禁止出现。任一 result 为 `review_required` 时，route 必须保留
`W-PRECEDENT-RESULT-REVIEW-001`。

## Output Provenance

每个 `step_review.precedent` 固定输出：

```text
provider_status
match_level
operation
provider
query_fingerprint
profile_ids
reported_condition_evidence
reported_yield_evidence
sources
licenses
artifact_fingerprint
corpus_artifact_fingerprint
result_ids
result_hashes
review_required_result_ids
binding_status
```

`binding_status` 仅限：

```text
not_provided
bound
failed
```

## 状态传播

| Search 状态 | Route 结果 |
|---|---|
| 未提供 | `partial/review_required` |
| exact lookup/transformation | 继续判断 |
| similarity/component | `review_required` |
| result review | `review_required` |
| zero hit | `review_required` |
| partial/timeout/source error | `partial/review_required` |
| blocked | `error/blocked` |
| contract/query/result 不绑定 | `error/blocked` |

错误只影响包含该 step 的 route。其他 route 必须继续独立评审。

## 科学边界

合同通过只证明：

- Search Artifact 内部一致；
- query/results 与当前 route step 结构化绑定；
- provenance 可审计。

它不证明：

- 反应可行；
- 条件或产率可迁移；
- 机理相同；
- 安全、可放大或可直接实验。
