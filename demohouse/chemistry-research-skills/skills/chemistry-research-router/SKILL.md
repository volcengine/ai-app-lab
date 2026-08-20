---
name: chemistry-research-router
description: "理解化学科研自然语言需求，生成带来源绑定的 ResearchIntent，并通过本地确定性校验路由到七个化学 Skill、受控 Skill 链或 Workflow A/B。用于复杂、多步、模糊、需要自动编排，或可能联网、产生费用和发送数据的化学身份、结构、特征、分子库、反应和已有路线任务；毒性预测、路线生成、实验安全和放大审批不支持。"
---

# 化学科研确定性路由

将用户的化学科研自然语言目标转换为带来源绑定的 `ResearchIntent V1`，再交给本地 Validator、Policy Guard、Catalog 和 Runtime。Agent 只负责语义识别，不决定执行命令、科学默认值或自由工作流。

## 何时使用

- 任务包含多个化学步骤，或用户要求完整证据链；
- 目标可能涉及联网、费用、附件外发或特殊科学参数；
- 用户目标、化学对象、输入 Artifact 或执行范围存在真实歧义；
- 需要在七个原子 Skill、四条固定 chain 和 Workflow A/B 之间确定唯一入口。

明确、离线、无风险的单步任务可以直接进入对应原子 Skill。边界见 [routing-boundaries.md](references/routing-boundaries.md)。

## Semantic draft

Draft 只包含 Agent 的语义判断和原文证据，固定形状如下：

```json
{
  "schema_version": "1.0.0",
  "language": "zh-CN",
  "goal": {
    "goal_type": "compute_molecular_features",
    "chain_requirement": "explicit_bounded_chain",
    "evidence_text": "用户原文中的完整目标"
  },
  "research_objects": [
    {
      "object_type": "compound_collection",
      "evidence": {
        "source_kind": "attachment",
        "attachment_id": "structures-csv"
      }
    }
  ],
  "requested_operations": [
    {
      "operation_type": "standardize_structure",
      "negated": false,
      "evidence_text": "用户原文中的唯一片段"
    },
    {
      "operation_type": "compute_fingerprint",
      "negated": false,
      "evidence_text": "用户原文中的指纹计算片段"
    }
  ],
  "input_artifacts": [
    {"attachment_id": "structures-csv", "role": "structure_input"}
  ],
  "user_parameters": [],
  "candidate_targets": ["structure-features-v1"],
  "ambiguities": [],
  "unsupported_goals": []
}
```

消息对象的 evidence 固定为
`{"source_kind":"message_span","text":"原文唯一片段"}`。操作顺序由数组顺序确定。
参数项只允许 `field_id`、`value`、`evidence_text`。

## 执行协议

1. 读取用户原始消息和附件 manifest，保留原文，不 trim、不改换行、不做 Unicode normalization。
2. 对完整语义做意图识别，只生成紧凑 semantic draft。Agent 负责选择受控语义枚举，并为 goal、操作和显式参数提供原文中唯一出现的 `evidence_text`；附件对象只引用 attachment ID。
3. 只记录用户明确给出的科学参数。没有原文证据的参数不得写入 draft；真实缺口进入 `ambiguities`。
4. 调用 `build_intent.py`。构建器生成稳定 ID、精确 span、附件绑定、SHA-256、`user_explicit` provenance 和 `intent_fingerprint`，并将 `--attachment-root` 中通过 hash/size 校验的附件复制到 Intent 同目录供 Request Builder 使用。禁止 Agent 手工生成机械字段或自行 staging。
5. 调用 `run_router.py route` 生成 `RouteDecision`，并在可执行时生成 `RouterExecutionRequest`。
6. 按 Decision 状态处理：
   - `auto_execute`：调用 `run_router.py execute`；
   - `confirmation_required`：展示受控原因，得到用户明确确认并生成绑定的 confirmation 后才执行；
   - `manual_target_required`：仅展示目标，不自动执行；
   - `clarification_required`：只提出模板指定的问题；
   - `unsupported`：明确当前能力不支持并停止。
7. 对 `awaiting_human` run 使用 `run_router.py resume` 和绑定当前 gate 的 HumanDecision。
8. 只报告 Validator、run 状态、Artifact 和 evidence package 中存在的事实。

## 禁止

- 禁止用关键词匹配作为主路由；
- 禁止 Agent 补充科学参数；
- 禁止绕过 Validator；
- 禁止自由拼接 Skill；
- 禁止用 semantic draft 构建器做关键词或正则语义识别；
- 禁止在 draft 中提供 ID、span、hash、fingerprint、provenance 或命令；
- 禁止从 Intent 接受 command、entrypoint、Validator path、URL 或凭据；
- 禁止把 Agent 解释、程序成功或文件生成当作科学结论。

## 文件接口

```bash
python scripts/build_intent.py \
  --draft semantic-draft.json \
  --source source.txt \
  --attachments attachments.json \
  --attachment-root inputs \
  --certificate certificate.json \
  --intent intent.json

python scripts/run_router.py route \
  --intent intent.json \
  --source source.txt \
  --attachments attachments.json \
  --certificate certificate.json \
  --decision decision.json \
  --request execution-request.json

python scripts/run_router.py execute \
  --request execution-request.json \
  --decision decision.json \
  --run-dir router-run \
  --installation-receipt .chemistry-agent-bundle/installation-receipt.json

python scripts/run_router.py resume \
  --run-dir router-run \
  --decision human-decision.json \
  --installation-receipt .chemistry-agent-bundle/installation-receipt.json
```

教学用语义例子见 [routing-examples.md](references/routing-examples.md)。不得将例子或历史测试标签写入用户请求。
