# Workflow A/B 离线联合验收

该示例在不依赖 Agent、外部科学数据服务或付费 API 的条件下，对两个内置
Workflow 各运行两次：

- `compound-evidence-v1`：化合物身份、标准化、二维特征和证据包；
- `route-evidence-review-v1`：反应整理、逐步骤先例检索、路线复核和专家包。

运行：

```bash
python examples/workflow-a-b-e2e/run_acceptance.py \
  --output-dir /tmp/workflow-a-b-acceptance \
  --network-disabled
```

Runner 会为四个运行目录分别执行独立 Workflow Validator，并比较 Request、
Definition、公开 Skill 结果指纹及归一化 Evidence/Claim 语义。任何子进程尝试联网
都会被网络守卫阻断并使验收失败。

输出中的 `technically reproducible` 只表示工程合同可重复，不表示化学结论、
实验可行性、路线安全性或生产适用性已经通过专家评审。
