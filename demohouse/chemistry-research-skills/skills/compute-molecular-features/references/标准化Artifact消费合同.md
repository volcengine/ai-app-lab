# 标准化 Artifact 消费合同

本合同适用于：

```text
standardize-chemical-structures schema_version=1.0.0
→ compute-molecular-features schema_version=1.0.0
```

它规定 features 如何识别、验证和记录正式 standardize Artifact，不改变
结构标准化或特征计算的科学规则。

## 输入分类

### 正式 standardize Artifact

JSON 顶层包含以下任一字段时，视为声称自己是正式 Artifact：

```text
workflow
result_fingerprint
```

只要命中一个标记，就必须完整通过本合同，不得自动降级成 direct JSON。

### Direct JSON

同时不含 `workflow` 和 `result_fingerprint` 的 JSON 是直接输入：

- 必须包含非空 `records` object 数组；
- 可计算记录必须明确给出 `standardized_structure`；
- 调用方对“结构已经标准化”的声明负责；
- features 不保留记录自报的正式 upstream provenance。

### Direct CSV

CSV 必须包含 `standardized_structure` 列。其他结构和状态字段可以缺失，但
不得借助自报字段伪装成已验证 standardize Artifact。

## 正式 Artifact 顶层字段

必须满足：

```text
schema_version = "1.0.0"
workflow = "chemical-structure-standardization-qc"
tool_versions = object
options.profile = non-empty string
records = non-empty object array
duplicate_groups = array
result_fingerprint = 64-character lowercase SHA-256 hex
```

## Fingerprint

standardize v1 的 fingerprint 是：

```text
SHA-256(
  sorted compact canonical JSON(
    顶层删除 generated_at_utc 和 result_fingerprint 后的完整 Artifact
  )
)
```

只删除顶层字段，不递归删除嵌套时间字段。

consumer 在本 Skill 内独立实现该算法，不导入 standardize 的 Processor 或
Validator。

## 逐记录字段

正式 Artifact 的每条记录必须包含：

```text
id
record_index
source
original_structure
standardized_structure
parent_structure
inchikey
parent_inchikey
parse_status
standardization_status
disposition
human_review_required
```

允许状态：

```text
parse_status
  success | error

standardization_status
  completed | not_run | error

disposition
  ready_for_downstream | review_required | rejected
```

## 状态不变量

### Parse error

```text
parse_status = error
standardization_status = not_run
disposition = rejected
standardized_structure = null
parent_structure = null
inchikey = null
parent_inchikey = null
```

### Standardization failure

`standardization_status=error/not_run` 时必须为 `rejected`。

### Ready

`ready_for_downstream` 必须同时满足：

- `parse_status=success`；
- `standardization_status=completed`；
- `standardized_structure` 为非空字符串；
- `human_review_required` 为空。

### Review

`human_review_required` 非空时不得标为 `ready_for_downstream`。

### Parent

`parent_inchikey` 非空时，`parent_structure` 必须非空。

## 状态传播

| 上游状态 | 是否计算 | features 最低处置 |
|---|---|---|
| `rejected` | 否 | `rejected` |
| `parse_status=error` | 否 | `rejected` |
| `standardization_status=error/not_run` | 否 | `rejected` |
| `review_required` | 可以 | `review_required` |
| `ready_for_downstream` | 可以 | 由计算结果决定 |

选择 `parent` 视图但 `parent_structure` 为空时，不得回退到
`standardized_structure`。

## Provenance 绑定

正式 Artifact 通过验证后，features 顶层 `upstream` 记录：

```text
schema_version
workflow
result_fingerprint
tool_versions
profile
source
input_format
```

每条 features 记录必须与顶层一致：

```text
record.upstream_workflow
  = upstream.workflow

record.upstream_fingerprint
  = upstream.result_fingerprint

record.upstream_tool_versions
  = upstream.tool_versions

record.upstream_profile
  = upstream.profile
```

正式 Artifact 记录内额外自报的同名字段不能覆盖顶层值。

## Direct input provenance

Direct JSON/CSV 经文件 Adapter 进入时固定为：

```text
upstream.workflow = null
upstream.result_fingerprint = null
upstream.tool_versions = null
upstream.profile = null

record.upstream_workflow = null
record.upstream_fingerprint = null
record.upstream_tool_versions = null
record.upstream_profile = null
```

Direct input 可以计算明确结构，但不得描述为“已通过 standardize Artifact
合同”。

## 失败行为

正式 Artifact 合同失败时：

```text
InputFailure
CLI exit code = 3
不运行 RDKit 特征计算
不写 features 输出
```

失败信息必须指出合同字段或 fingerprint 问题，不输出凭证内容。

## CLI 示例

正式 Artifact：

```bash
python scripts/compute_features.py \
  --input standardized.json \
  --input-format json \
  --calculation-view standardized \
  --output features.json
```

验证 features 输出：

```bash
python scripts/validate_output.py features.json
```

## 安全与科学边界

- fingerprint 是确定性完整性校验，不是数字签名；
- 若攻击者同时伪造完整 Artifact 和 fingerprint，v1 不提供身份认证；
- direct JSON/CSV 不证明输入真正经过标准化；
- review 状态下生成特征不表示风险已经解除；
- parent 特征不代表真实盐型、制剂或物理样品；
- 描述符和指纹不证明活性、药效、毒性、可合成性或实验安全。

## 版本规则

以下变化必须升级 Artifact Schema：

- 修改 standardize fingerprint 算法；
- 改变记录状态含义；
- 删除本合同必需字段；
- 允许正式 Artifact 校验失败后自动降级；
- 改变 rejected/review 状态传播规则。
