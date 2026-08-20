# 安装与配置

## 目录

- 仓库根目录：`{baseDir}/../../..`
- 私密配置：`${CAR_DECISION_ASSISTANT_HOME}`；未设置时使用系统用户配置目录下的 `car-decision-assistant`
- 凭证文件：`credentials.env`，权限 `0600`
- 运行日志：私密配置目录中的 `logs/app.log`
- PID：私密配置目录中的 `app.pid`

## 前置检查

```bash
node --version
npm --version
byted-supabase-cli --version
```

Node.js 必须满足根 `package.json` 的 `engines`。CLI 必须是 `byted-supabase-cli`，不能替换成官方 Supabase CLI。

## 配置字段

- `AGENT_PLAN_API_KEY`：隐藏输入，不接受命令行明文参数。
- `SUPABASE_WORKSPACE_ID`：用户明确选择的 Workspace。
- `SUPABASE_CLI_PROFILE`：默认 `agent-plan`。
- `SUPABASE_REGION`：默认 `cn-beijing`。
- `CAR_DECISION_PORT`：默认 `3003`。

## 远程 Skill

远程 URL 必须固定到 tag 或审核过的 commit。下载完整仓库后先执行：

```bash
npm ci
npm run release:verify
```

不要把 Skill 安装成功误报为网站可用。网站可用还要求 AI Native 应用开发底座、真实 Harness 能力、业务验收和浏览器路径通过。
