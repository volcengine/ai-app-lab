---
name: resolve-chemical-identities
description: "保守解析化学名称、SMILES、InChI、InChIKey、PubChem CID、ChEMBL ID 或 CAS RN，保留多源证据、相关形式、歧义和冲突。用于确认化学记录是谁、对齐开放数据库，或在结构标准化前选择候选。"
---

# 化学身份解析与来源对齐

把名称、结构或编号转换为可审计的化学候选记录。默认失败关闭：不投票选优、不让模型猜结构、不把数据库记录当作用户实物样品。

## 执行流程

1. 接收一个 `query`；只有纯数字等无法安全判断的输入才追问 `input_type`。
2. 阅读[身份判定契约与来源边界](references/身份判定契约与来源边界.md)，确认 `exact`、`related_forms`、`ambiguous`、`conflict` 和样品边界。
3. 阅读[标准化交接合同](references/标准化交接合同.md)。只有
   `standardization_handoff.status=ready` 时，才允许 Adapter 将其中唯一
   record 转成 `standardize-chemical-structures` 的通用输入。
4. 在隔离环境安装固定依赖：

```bash
python -m pip install -r scripts/requirements.txt
```

5. 运行解析器。单条名称示例：

```bash
python scripts/resolve_identities.py \
  --query 'aspirin' \
  --output identity-result.json
```

明确结构类型示例：

```bash
python scripts/resolve_identities.py \
  --query 'CCO' \
  --input-type smiles \
  --output identity-result.json
```

批量或带上下文时使用 JSON：

```json
{
  "requests": [
    {
      "id": "q1",
      "query": "aspirin",
      "input_type": "name"
    },
    {
      "id": "q2",
      "query": "CC(=O)OC1=CC=CC=C1C(=O)[O-].[Na+]",
      "input_type": "smiles",
      "expected_form": "salt"
    }
  ]
}
```

```bash
python scripts/resolve_identities.py \
  --request requests.json \
  --include-related \
  --output identity-result.json
```

6. 校验输出：

```bash
python scripts/validate_output.py identity-result.json
```

7. 只有 `standardization_handoff.status=ready` 时，才把其中唯一 record
   交给 `standardize-chemical-structures`。禁止读取 candidates 作为交接
   兜底；其他状态先向用户展示候选和确认问题。

## 来源选择

- `OPSIN`：系统名称解析；`WARNING` 必须人工复核。
- `PubChem`：名称、结构、InChIKey 和 CID 记录。
- `ChEMBL`：精确 preferred name/同义词、ChEMBL ID 和完整 InChIKey。
- `UniChem`：完整结构跨库映射；`--include-related` 才执行 connectivity 查询。
- 敏感名称不得发送到外部服务；使用 `--sources ''` 只做本地结构检查。

任何 500、503、超时、限流或坏 JSON 都是 `source_error`，不得写成 `not_found`。

## 强制规则

- 原始 `query`、来源记录 ID、URL、响应哈希和错误必须保留。
- 普通名称至少需要两个独立证据家族支持同一完整 InChIKey，才可标记记录层 `exact`。
- `exact` 只表示当前数字记录结构一致；`sample_identity_status` 自动流程始终为 `not_assessed`。
- 多候选不得按来源数、得分、热度、首选名称或字符串顺序自动选一个。
- 同一 parent 只能标记 `related_forms`，不能标记相同物理样品。
- 纯数字在 `auto` 模式下不得直接猜成 PubChem CID。
- CAS RN 只验证格式和校验位；不得声称已由 CAS 官方确认。
- 无法解析的结构必须 `rejected`，不得生成伪结构。
- `ambiguous`、`related_forms` 和 `conflict` 必须阻止自动 handoff。
- 不输出 API Key、Authorization、Cookie、Token。
- 不判断活性、药效、毒性、可合成性、实验安全或结构确证。

## 退出码

- `0`：流程完成且没有 `rejected` 请求；
- `2`：已写出完整结果，但至少一条请求 `rejected`；
- `3`：依赖、请求文件或命令行输入加载失败。

退出码不是身份或科学结论；始终检查五类状态、候选证据和人工确认问题。
