# mobile_agent 会话接口安全修复

## 目标与范围

未授权请求不得签发 STS、修改会话或执行云手机操作；合法调用方仍可完成创建、续用、重置、SSE 执行和取消。缺少、伪造或过期凭证返回 HTTP 401，越权设备/会话返回 HTTP 403，拒绝发生在敏感副作用之前。

范围包括四个现役 Python 路由、Next.js 代理与客户端错误处理、部署配置及回归测试。复用现有 Bearer 转发，不增加公网发证接口或完整登录系统。

## main 分支根因

基线：更新后的 `main=origin/main=5299813c89238dcf9fa7b845f6c2006843051028`。工单引用的 `88c983d` 之后，相邻 ECS 服务已有鉴权修复，mobile_agent 仍缺少鉴权。

| 路径 | 实际问题 |
| --- | --- |
| `app.py` | 只有 CORS 和响应中间件；监听 127.0.0.1 不会阻止 veFaaS/反向代理入口转发请求。CORS 无法鉴权 HTTP 客户端。 |
| `web/src/app/api/_utils/middleware.ts` | 仅检查 query token 非空，身份硬编码，任意字符串可转发。 |
| `routers/session.py` | 所有调用方使用 LOCAL_ACCOUNT_ID；续用只检查 thread_id 存在，并可重新绑定请求提供的设备。 |
| `routers/agent.py` | 固定身份使归属校验无效；stream 在归属检查之前已修改 SSE 状态。 |
| `service/pod/manager.py` | MCP STS 策略为 ACEP:*、iPaaS:*、tos:* 和 Resource:*，但实际 MCP 授权包放的是长期 AK/SK，SessionToken 为空。 |
| `service/pod/manager.py` | SDK 的 sign_sts2(expire) 使用秒，现有代码传入 1,800,000，所谓 30 分钟实际约 20.8 天。 |

工单需校正：当前执行路由是 `/mobile-use/api/v1/agent/stream`，没有 `/agent/run`；响应中的浏览器 STS 权限是 `ACEP:PodStart`，宽权限策略属于单独的 MCP STS 路径。匿名签发和会话重放风险仍成立。

原 Pydantic Credentials/ServiceInfo 也不满足 `volcengine==1.0.190` 的初始化接口。修复改用 SDK 原生类型并显式固定 ACEP 配置，避免 SDK 从本机凭证文件选中其他账号。

## 凭证配置与调用契约

在 mobile_agent 的 `.env` 或 veFaaS 运行环境中设置 `MOBILE_AGENT_ACCESS_GRANTS`，值为 JSON 数组，每项包含以下字段：

```json
[
  {
    "token": "<独立随机访问凭证>",
    "account_id": "<业务用户稳定唯一 ID>",
    "product_id": "<该用户获准访问的 Product ID>",
    "pod_id": "<该用户获准访问的 Pod ID>",
    "expires_at": 0
  }
]
```

上面是占位示例，不能直接使用。管理员执行 `python -c 'import secrets; print(secrets.token_urlsafe(32))'` 生成每个独立凭证，用 `python -c 'import time; print(int(time.time()) + 3600)'` 获取一小时后的 Unix 秒级到期时间，替换示例字段。在 dotenv 中可以单引号包裹完整 JSON。

配置仅留在服务端，不提交仓库或设置为 NEXT_PUBLIC_*。每项只授权一台设备；同一稳定用户可以配置多个不同凭证。管理员必须依据实际归属配置，不向不同用户共享凭证或私人云手机。token 为 43–128 个 URL 安全字符，身份/产品/设备 ID 禁止通配符；不允许重复 token 或超过两小时的未来有效期。空/非法配置拒绝启动，过期凭证逐请求拒绝。

直接调用使用 `Authorization: Bearer <token>`；现有前端继续通过 `?token=<token>` 转发调用方自己的凭证，后端决定身份和设备范围。X-Account-Id 及请求体身份字段不参与授权，旧 token=123 示例失效。部署须通过 HTTPS 访问，并对访问日志的 token 参数脱敏，避免分享含 token 的 URL。

指定 thread_id 时仅可续用同一身份及产品/设备绑定的现存会话；不存在或归属不匹配返回 403。新会话省略 thread_id。前端保留真实 401/403，并兼容原有业务错误及新 HTTP 403 的会话重建行为。

浏览器 STS 仅允许指定 pod 的 PodStart。MCP STS 只允许指定 pod 的 RunSyncCommand、AutoInstallApp、LaunchApp、CloseApp、GetPodAppList；TOS 仅允许指定截图桶的 PutObject/GetObject，无 iPaaS、全动作、全账号资源或删除权限。会话及 MCP 授权包只保存临时凭证，不再保存长期 AK/SK 副本。

STS 最多 1800 秒且不超过访问凭证剩余时间。SDK 最短签发 60 秒，因此剩余不足 60 秒时创建/续用返回 401。pod 会话生命周期与 STS 一致，敏感响应加 Cache-Control: no-store。

## 验证与部署边界

```bash
cd demohouse/mobile-use/mobile_agent
python -m pytest -c pyproject.toml tests/test_security.py -q
```

测试使用 Python 3.13、requirements.txt 依赖及锁文件中的 langgraph-prebuilt==0.1.8；显式指定子项目 pytest 配置，避免根仓 snapshot 插件参数。修复前漏洞断言为 5 failed：四路由无鉴权拒绝和 MCP 临时凭证断言失败。基线仅绕过原 SDK 初始化类型不兼容，真实路由、会话、STS 签发逻辑未替换；最终测试没有此绕过。

回归覆盖无凭证/错误/过期凭证、伪造账号头、匿名 thread_id 重放、四路由跨用户/跨设备拒绝及无副作用、合法创建/续用/reset/SSE/cancel、未知会话、非法配置和启动失败、STS 动作/资源/真实有效期、全路径保护及 CORS 预检。全部凭证为本地占位值，STS 使用真实 SDK 本地签名；合法 SSE 测试仅替换云端 Agent/LLM 执行。

2026-11-20 验证：后端 **48/48 passed**；启动真实 Uvicorn 与生产构建的 Next.js，通过直接 HTTP 和前端代理验证 **13/13 passed**（匿名/伪造请求 401、四路由跨用户重放 403、合法创建/续用/reset/cancel 200）。全部临时服务已退出，真实进程自检脚本是当次 `/tmp` 产物，不作为后续复验入口。前端 `npm run build` 与构建生成声明后的 `npx tsc --noEmit` 通过；Python 语法/未定义符号检查和 `git diff --check` 通过。veFaaS 发布包已检查包含鉴权模块与安全说明，排除 `.env` 和字节码。

2026-11-23 提交前复验：恢复隔离 Python 环境，重新运行仓库中的回归测试，**48/48 passed**；前端生产构建、TypeScript 类型检查、Python 语法/未定义符号检查和补丁格式检查通过。本轮未重复真实进程 HTTP 验证或云端调用。

另外，2026-11-20 对当次安装的前端依赖快照执行 npm audit，报告 10 项告警（1 critical、4 high、5 moderate），涉及 protobufjs、@volcengine/openapi 的传递依赖等；未评估这些告警在业务路径中的可利用性，未自动升级依赖。原始报告是当次 `/tmp` 产物，后续应针对实际部署依赖重新扫描。这是独立的依赖安全待办，不代表本次会话鉴权回归失败，也不能据本次修复宣称整个项目已无其他安全问题。

发布前先配置访问凭证，同步部署后端与前端，并重启实例清除旧会话及长期凭证副本。veFaaS 打包入口包含新增 middleware/auth.py，运行环境仍须注入凭证配置。验收需用专门测试实例确认浏览器推流、五个 MCP 动作及截图上传正常，替换实例/访问其他桶被云端拒绝；不能为通过测试恢复 Resource:*。

长期 ACEP AK/SK 仍作为服务端 STS 签发源，未改造为实例角色。使用仅授权必要实例/截图桶的子账号，并将密钥存入部署密钥配置。截图对象键由云手机 cap_tos 程序决定，当前 TOS 权限限于部署截图桶，应使用独立截图桶；按会话目录隔离需配合该程序变更。

若历史凭证可能暴露，账号管理员应轮换 ACEP AK/SK 并审计历史 STS 使用；旧 STS 有效期约 20.8 天，不能只等待自然过期。本次未执行云端发布、密钥轮换或工单状态操作。本地测试不证明真实云 API 的授权结果。

兼容故障时先关闭公网入口、修正授权配置再部署；不要直接撤回匿名可访问的旧版本。观测 401/403、STS 权限拒绝及截图失败定位配置问题。

官方资料：[云手机 STS 资源限制](https://www.volcengine.com/docs/6394/1262151)、[TOS STS PutObject/GetObject](https://www.volcengine.com/docs/6349/127695)。秒级单位和最短 60 秒规则以安装的 volcengine==1.0.190 的 Service.sign_sts2 源码为准。
