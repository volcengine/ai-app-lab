# 第三方组件与外部服务说明

## 随应用分发的代码

当前 `backend/package.json` 没有 npm 运行时或开发依赖。应用前端使用浏览器原生能力，后端使用 Node.js 标准库；仓库没有打包第三方 JavaScript、字体、图片或 CSS 资源。

GitHub Actions 工作流引用 `actions/checkout` 和 `actions/setup-node`。它们只在 CI 环境中运行，不进入应用安装包，其许可与使用条款以各自项目为准。

## 不随应用分发的外部能力

以下能力由用户自行开通、授权和配置，项目只通过公开接口或本机命令调用，不复制或再分发其服务端代码：

- 火山方舟 Agent Plan 模型服务
- 专业数据集（DataPro）
- 豆包搜索（联网搜索）
- Agent 记忆（OpenViking）
- AI Native 应用开发底座（Supabase）
- 飞书 CLI
- 火山引擎 Supabase CLI

使用这些能力产生的费用、数据处理范围、服务可用性和许可约束，以用户账号对应的最新服务协议为准。

## 发布者责任

源码的使用与分发遵循根目录 [LICENSE](LICENSE)。贡献者和发布者应确保有权提交、分发相关
代码与素材；外部服务仍受各自服务协议、数据处理条款和费用规则约束。
