# 阿司匹林七 Skill 端到端验收 Case

这个 Case 用同一个阿司匹林科研场景验证七个化学 Skill 的真实 CLI 和
Artifact 交接。七个 Skill 属于两条职责链，不应伪装成一条线性流程：

```text
阶段 A：小分子数据处理
resolve-chemical-identities
→ standardize-chemical-structures
→ compute-molecular-features
→ search-and-curate-chemical-libraries

阶段 B：已有合成路线证据处理
curate-reactions
→ search-reactions
→ review-routes
```

## Case 内容

- 离线解析阿司匹林 SMILES，并核对 InChIKey；
- 标准化阿司匹林、阿司匹林钠、水杨酸、乙酸酐和乙酸；
- 保留一个非法结构，验证 `rejected` 记录不会生成伪特征；
- 计算 14 个二维描述符和 Morgan、RDKit、MACCS 指纹；
- 用阿司匹林执行本地 Morgan/Tanimoto 相似性检索；
- 整理“水杨酸 + 乙酸酐 → 阿司匹林 + 乙酸”结构化反应；
- 在本地整理结果中检索精确反应记录；
- 按 `route_id + step_id + step_reaction_hash` 绑定路线步骤证据；
- 完整流程运行两遍，比较七个 `result_fingerprint`。

阿司匹林钠按盐型和金属规则进入 `review_required`；非法结构进入
`rejected`。二者均保留在 Artifact 中，不会被静默删除。

## 运行

先按仓库 `requirements-dev.txt` 建立 Python 3.11 或 3.12 隔离环境，
然后执行：

```bash
python examples/aspirin-seven-skill-e2e/run_case.py \
  --output-dir /tmp/aspirin-seven-skill-acceptance
```

输出目录必须为空。成功时生成：

- `gold_report.json`：机器可读金标报告；
- `gold_report.md`：简要验收摘要；
- `run-1/`、`run-2/`：两次运行的输入、七个结果 Artifact、Validator
  结果和命令审计。

预期顶层结果：

```json
{
  "case_id": "aspirin-seven-skill-e2e",
  "status": "passed",
  "skills": 7,
  "repeatability": true
}
```

## 验收边界

本 Case 验证：

- 固定依赖下的 CLI 可执行性；
- 七个输出合同和独立 Validator；
- Artifact 指纹、状态传播和步骤精确绑定；
- 离线、无 API、无 GPU、无外部数据库费用；
- 相同输入、版本和参数下的结果指纹一致性。

本 Case 不验证：

- 化学专家验收和真实用户验收；
- 反应实验可行性、条件合理性、安全性或可复现性；
- 路线最优性或实验执行批准；
- 生产环境性能、并发和服务可用性。
