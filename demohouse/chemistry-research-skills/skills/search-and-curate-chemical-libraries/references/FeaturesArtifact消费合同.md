# Features Artifact 消费合同

本合同适用于：

```text
compute-molecular-features schema_version=1.0.0
→ search-and-curate-chemical-libraries schema_version=1.0.0
```

library 的唯一正式上游是 `molecular-feature-computation`。audit、
similarity、substructure、cluster 和 diversity selection 均使用同一合同。

## 不再支持的正式入口

以下路径不再是 library 的正式输入：

```text
standardize-chemical-structures
→ search-and-curate-chemical-libraries
```

audit 和 substructure 也必须先经过 features。这样 workflow、视图、状态、
profile、fingerprint 和 provenance 只有一个来源。

## 顶层合同

features Artifact 必须包含：

```text
schema_version = "1.0.0"
workflow = "molecular-feature-computation"
tool_versions = object
options.calculation_view = standardized | parent
fingerprint_profiles = object
records = non-empty object array
result_fingerprint = 64-character lowercase SHA-256
```

## Artifact fingerprint

library 独立复现 features v1 算法：

```text
SHA-256(
  sorted compact canonical JSON(
    递归删除：
      generated_at_utc
      retrieved_at_utc
      requested_at_utc
      runtime_seconds
      result_fingerprint
  )
)
```

fingerprint 是确定性完整性校验，不是数字签名或来源认证。

## Profile 合同

v1 必须同时包含：

```text
morgan
rdkit_topological
maccs
```

每个 profile 必须记录：

```text
profile_id
algorithm
method_family
representation
parameters
known_limitations
profile_fingerprint
```

要求：

- `representation=bit_vector_on_bits`；
- 三个 `profile_id` 是非空且互不相同的字符串；
- `profile_fingerprint` 与删除自身后的 canonical JSON SHA-256 相同；
- `parameters.fpSize` 为正整数；
- MACCS `fpSize=167` 且 `bit0Unused=true`。

## 逐记录合同

每条记录至少包含：

```text
id
record_index
standardized_structure
parent_structure
source_structure
calculation_canonical_smiles
calculation_view
calculation_status
descriptors
fingerprints
missing_features
disposition
human_review_required
```

`record_index` 必须等于数组位置，`id` 必须是非空字符串。

## 结构视图绑定

```text
calculation_view=standardized
→ source_structure=standardized_structure

calculation_view=parent
→ source_structure=parent_structure
```

逐记录 `calculation_view` 必须和顶层选项一致。

对 completed/partial 记录，library 用固定 RDKit 重新解析
`source_structure`；得到的 canonical isomeric SMILES 必须等于
`calculation_canonical_smiles`。

该步骤只核对已有结构，不重新标准化、不修改结构。

## 状态不变量

### completed

- `missing_features` 为空；
- descriptors 和三类 fingerprints 完整。

### partial

- `missing_features` 非空；
- 不能标 `ready_for_downstream`。

### not_run/error

- descriptors 和 fingerprints 为空；
- 永不 indexed；
- error 必须为 rejected。

### ready_for_downstream

- `calculation_status=completed`；
- `human_review_required` 为空。

有复核原因的记录不能伪装成 ready。

## Fingerprint 绑定

逐记录每类 fingerprint 必须包含：

```text
profile_id
representation
size
on_bits
bit_count
density
bitvector_sha256
hash_encoding
```

要求：

- `profile_id` 匹配顶层 profile；
- `size=profile.parameters.fpSize`；
- `on_bits` 排序、唯一且不越界；
- `bit_count=len(on_bits)`；
- `density=bit_count/size`，误差不超过 `1e-12`；
- `hash_encoding=ascii_bitstring_index_0_to_n_minus_1`；
- `bitvector_sha256` 与完整 ASCII bitstring 一致。

library 不重新计算或替换上游 fingerprint。

## Contract-invalid 行为

任一合同错误都必须：

```text
operation_status = not_run
library_status = blocked
indexed_records = 0
error code = E-FEATURE-ARTIFACT-CONTRACT
```

每条输入记录保留在 manifest：

```text
index_status = incompatible
reason = upstream_artifact_contract_invalid
```

不创建 bit vector，不执行任何 operation，不截断记录。

CLI 写出可审计失败结果并返回 `2`。这和请求文件无法读取的输入错误
`exit 3` 不同。

canonical mismatch 使用错误码：

```text
E-CANONICAL-STRUCTURE-MISMATCH
```

同样必须 blocked、0 indexed。

## 合法 operation

合法 Artifact 继续支持：

- `audit_library`；
- `similarity_search`；
- `substructure_search`；
- `cluster_library`；
- `select_diverse_subset`。

review 记录默认排除，显式纳入时传播风险。rejected/not_run/error 永不
indexed。资源超限不截断、不切换后端。

## CLI

```bash
python scripts/search_and_curate.py \
  --request request.json \
  --output result.json

python scripts/validate_output.py result.json
```

## 科学边界

- 指纹相似不证明活性、功能、机制或可合成性；
- 子结构命中不证明性质；
- cluster 不自动表示化学系列或 SAR；
- diversity selection 不是实验优先级；
- parent 相同不表示相同盐型或物理样品；
- 本 Skill 不删除、合并、覆盖或写回用户化合物库。

## 版本规则

以下变化必须升级 Schema：

- 修改 features fingerprint 算法；
- 修改 calculation status/disposition 语义；
- 删除必需 profile/fingerprint 字段；
- 恢复多个正式上游 workflow；
- 修改 contract-invalid blocked 语义。
