# Curate Artifact 消费合同

## 正式上游

```text
schema_version = 1.0.0
workflow = curate-reactions
ruleset_version = 1.1.0
```

`corpus_artifact` 和 `corpus_artifact_path` 只是同一 Artifact 的两种传输方式，
必须进入同一 consumer contract。两者不得并存，路径不得写入输出。

## 严格 Artifact、宽容记录

以下是合法记录状态：

```text
ready_for_search
review_required
rejected
```

它们可以出现在同一 Artifact：

- ready 正常检索；
- review 仅在 `include_review_required=true` 时检索；
- rejected 始终进入 excluded manifest；
- review/rejected 不会导致整批 blocked。

合法空 `records=[]` 也可交接，结果为 `completed_zero_hits`。

以下属于合同损坏，整批 blocked：

- schema/workflow/ruleset/fingerprint 错误；
- record ID 重复；
- status/disposition/findings 自相矛盾；
- `upstream_binding_status` 未正确传播；
- ready/review 的 reported 与 canonical reaction 不一致；
- ready/review reaction 无法解析。

旧 ruleset 1.0 不静默迁移，应重新运行当前 curate Processor。

## 状态传播

```text
ready_for_search
→ searchable

review_required + include=false
→ review_required_excluded

review_required + include=true
→ searchable + review_queue

rejected
→ rejected excluded
```

malformed record 不是合法 rejected，不能通过改 disposition 掩盖合同错误。

## 合同失败

```text
provider_status = blocked
results = []
searchable_records = 0
excluded_records = input_records
error = E-CURATED-ARTIFACT-CONTRACT-001
```

对可枚举 records，excluded manifest 逐条保留 index、可用 reaction ID 和
`upstream_artifact_contract_invalid` reason。

合同失败不执行 lookup、component、SMARTS 或 similarity，也不降级到 ORD。

## Corpus provenance

local search 输出：

```text
provider
workflow
schema_version
ruleset_version
artifact_fingerprint
record_count
contract_status = valid | invalid | not_assessed
```

ORD 使用 `contract_status=not_applicable`，其 curate 字段为 null。

必须使用 `artifact_fingerprint` 字段名。search 的 fingerprint 归一化会递归排除
所有名为 `result_fingerprint` 的字段，使用该名称会导致上游 hash 没有真正进入
search fingerprint。

## 边界

合同通过不证明：

- 反应可行；
- 条件可以迁移；
- 先例不存在或充分；
- 反应安全、可执行或可复现；
- fingerprint 具有签名或来源认证能力。
