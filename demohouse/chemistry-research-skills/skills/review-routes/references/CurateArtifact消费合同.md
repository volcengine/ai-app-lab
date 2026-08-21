# Curate Artifact 消费合同

## 版本

```text
consumer = review-routes ruleset 1.1.0
producer = curate-reactions schema 1.0.0 / ruleset 1.1.0
```

`review-routes` 只消费通过独立合同校验的正式 `curate-reactions`
Artifact。直接 JSON、CSV、旧 ruleset 或仅有 reaction SMILES 的对象不能冒充
正式上游 Artifact。

## Step 绑定

每个 step entry 必须显式提供：

```json
{
  "route_id": "route-1",
  "step_id": "step-abcd",
  "step_reaction_hash": "64-char-sha256",
  "curation_record_id": "curate-record-17",
  "curation_artifact": {}
}
```

规则：

- `curation_artifact` 非 null 时，`curation_record_id` 必须是非空字符串；
- `curation_artifact` 为 null 时，`curation_record_id` 必须为 null；
- record 只按 `curation_record_id` 精确选择；
- 禁止按 records 数组位置或 reaction hash first-match 猜测；
- 相同 reaction hash 的多条 record 可以共存，但 ID 必须全局唯一；
- 重复 `(route_id, step_id)` 属于该 step 的 binding error。

## Artifact 校验

消费前必须校验：

```text
schema_version = 1.0.0
workflow = curate-reactions
ruleset_version = 1.1.0
tool_versions object
options object
source_record object
records array
result_fingerprint
```

fingerprint 按 curate v1 规则重算：顶层排除
`generated_at_utc/runtime_seconds/result_fingerprint` 后，对排序紧凑 JSON
计算 SHA-256。

fingerprint 只证明内容完整性，不是签名，也不证明来源身份。

## Record 校验

每条 record 至少校验：

```text
record_id
original_record_hash
reaction_smiles
participant_assessments
curation_status
findings
disposition
human_review_required
```

状态不变量：

```text
error finding       -> error/rejected
非 error finding    -> partial/review_required
无 finding          -> completed/ready_for_search
```

ready/review record 还必须满足：

1. reported 和 canonical reaction 都可解析；
2. reported 重算 canonical 等于 record canonical；
3. canonical SHA-256 等于路线 step hash。

合法 rejected record 可保留不可解析原始反应，但必须阻断对应路线。

## 状态传播

| 上游情况 | Step finding | Route 结果 |
|---|---|---|
| 未提供 | `W-CURATION-NOT-RUN-001` | `partial/review_required` |
| valid ready | 无新增 finding | 继续评审 |
| valid review | `W-CURATION-REVIEW-001` | `partial/review_required` |
| valid rejected | `E-CURATION-REJECTED-001` | `error/blocked` |
| Artifact invalid | `E-CURATION-ARTIFACT-CONTRACT-001` | 对应路线 blocked |
| ID/binding invalid | `E-CURATION-BINDING-001` | 对应路线 blocked |
| reaction/hash mismatch | `E-STEP-HASH-MISMATCH-001` | 对应路线 blocked |

Artifact、ID 或 hash 错误只影响包含该 step 的路线，不得阻断其他路线。

## 输出 Provenance

每个 `step_review.curation` 固定输出：

```text
status
disposition
findings
artifact_fingerprint
curation_record_id
original_record_hash
binding_status
```

`binding_status` 仅限：

```text
not_provided
bound
failed
```

这些字段进入 `review-routes` 的 `result_fingerprint`，并由独立 Validator
检查状态、provenance、route findings 和 review queue 的内部一致性。
