# 标准化 Artifact 消费合同

## 正式上游

`curate-reactions` 的标准化证据只接受：

```text
schema_version = 1.0.0
workflow = chemical-structure-standardization-qc
```

请求形态：

```json
{
  "upstream_artifacts": [
    {
      "schema_version": "1.0.0",
      "workflow": "chemical-structure-standardization-qc",
      "records": [
        {
          "id": "participant-1",
          "record_index": 0
        }
      ],
      "result_fingerprint": "64 位小写 SHA-256"
    }
  ]
}
```

上例只展示 envelope。正式 Artifact 必须包含 standardize v1 的完整记录字段，
且 `records` 不得为空。

不接受：

```json
{"artifact": {"workflow": "chemical-structure-standardization-qc"}}
```

`upstream_artifacts=[]` 表示不使用上游结构证据，direct reaction 输入继续按
自身结构执行。

## Artifact 校验

消费前独立校验：

- Schema、workflow、tool versions 和 profile；
- 顶层 `result_fingerprint`；
- parse、standardization 和 disposition 状态；
- `qc_findings` 与 `human_review_required`；
- record index、结构字段和 InChIKey 类型；
- 单 Artifact 内及本批全部 Artifact 之间的 ID 唯一性。

fingerprint 复现 standardize v1 规则：删除顶层 `generated_at_utc` 和
`result_fingerprint` 后，对 canonical JSON 计算 SHA-256。

fingerprint 不是数字签名，不能证明 Artifact 来源身份，也不能识别内容完全自洽
但由其他执行环境重新生成的文档。

## Participant 绑定

participant 未声明 `upstream_record_id` 时，保留 direct 输入行为。

一旦字段存在：

- 必须是非空字符串；
- 必须精确命中一条已验证记录；
- missing、null、错误类型不得回退到 participant 自报结构；
- 不按数组位置、大小写或 Artifact 顺序猜测；
- 重复 ID 不采用最后写入覆盖。

输出显式记录：

```text
upstream_binding_status =
  not_requested | bound | failed
```

因此显式 `upstream_record_id: null` 不能在输出篡改后伪装成“未请求绑定”。

participant 同时提供 `original_structure` 时，使用 RDKit canonical isomeric
representation 与 upstream `original_structure` 比较。upstream 的 SMILES、
SDF 和 MolBlock 使用对应 parser。

standardized 或 parent 相等不能替代 original form 绑定，避免盐型、对离子、
同位素、立体化学或形式电荷差异被静默掩盖。

## 状态传播

```text
ready_for_downstream
→ 允许继续执行 reaction 自身规则

review_required
→ reaction 最多为 review_required

rejected
→ reaction 必须 error/rejected
```

上游 ready 不保证反应 ready。反应仍需独立通过结构、角色、产率、守恒、重复和
来源检查。

## 失败语义

Artifact 级错误：

```text
错误 schema/workflow/fingerprint
malformed record
Artifact 内或跨 Artifact 重复 ID
```

结果：

```text
整批 reaction records = error/rejected
ready_for_search = 0
duplicate_groups = []
review_queue = []
CLI exit = 1
```

participant 级错误：

```text
missing upstream_record_id
original structure mismatch
upstream record rejected
```

结果仅拒绝受影响 reaction record，同批其他合法记录继续。CLI 是否成功写出
审计 Artifact 与科学 disposition 分开表达。

## 输出审计

输出只保留每个上游 Artifact 的 metadata：

```text
workflow
schema_version
result_fingerprint
record_count
contract_status = valid | invalid
```

非法、可枚举的 Artifact 不得从 metadata 静默消失。输出 Validator 会拒绝：

- contract error 被改成 ready；
- invalid metadata 被改成 valid；
- upstream review 被改成 ready；
- upstream rejected 被改成 review；
- 修改后重算 curate fingerprint 的上述语义篡改。

## 科学边界

合同通过只证明结构化数据满足冻结的工程和状态规则，不证明：

- 参与物身份已经实验确证；
- 反应正确、成功或可复现；
- 产率、条件、机理或选择性合理；
- 实验安全、可执行或适合建模。

parent 只用于候选重复分组，不代表盐型、游离形式或实物样品相同。
