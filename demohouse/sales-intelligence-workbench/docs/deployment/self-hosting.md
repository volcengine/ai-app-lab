# 单工作区自托管部署

本文说明 `0.10.0` 自托管开源版的支持边界和推荐部署方式。当前版本支持单工作区、单管理员，以及本机或受控内网部署；不提供公网托管 SaaS、多人协作或 SLA。公网开放前必须完成正式域名、HTTPS 和真实链路验收。

## 1. 进程与网络边界

应用包含两个长期进程：

- API：同源提供前端和 `/api`。
- Worker：领取 Supabase 持久化任务并调用 Provider。

推荐让 API 只监听 `127.0.0.1:8787`，由 Nginx、Caddy 或云负载均衡器终止 TLS。不要把 Node.js HTTP 端口直接暴露到公网。Worker 不开放网络端口。

## 2. 公网配置

私密配置默认位于：

```text
~/.config/sales-intelligence-workbench/credentials.env
~/.config/sales-intelligence-workbench/runtime.env
```

公网反向代理至少需要在 `runtime.env` 中设置：

```dotenv
HOST="127.0.0.1"
PORT="8787"
HTTP_AUTH_ENABLED="true"
AUTH_COOKIE_SECURE="true"
ALLOWED_ORIGINS="https://sales.example.com"
TRUST_PROXY="true"
ASYNC_JOBS_ENABLED="true"
JOB_WORKER_LEASE_SECONDS="600"
PROVIDER_CIRCUIT_BREAKER_ENABLED="true"
PROVIDER_CIRCUIT_BREAKER_FAILURE_THRESHOLD="5"
PROVIDER_CIRCUIT_BREAKER_COOLDOWN_SECONDS="60"
```

工作台会拒绝非 HTTPS 来源或缺少明确来源白名单的代理部署配置。

## 3. Nginx 示例

证书路径和域名由部署者替换：

```nginx
server {
    listen 443 ssl http2;
    server_name sales.example.com;

    ssl_certificate /etc/letsencrypt/live/sales.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sales.example.com/privkey.pem;
    client_max_body_size 1m;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;
    }
}
```

同时关闭公网对 `8787` 端口的访问，只允许反向代理访问回环地址。

## 4. 进程托管

本机体验可使用 Skill 的 `start.mjs` 和 `stop.mjs`。长期运行建议由 systemd、容器编排器或等价进程管理器分别托管 API 和 Worker，并加载同一组 `runtime.env` 与 `credentials.env`。

以下为 API 单元的核心结构，路径和运行用户必须替换为部署机实际值：

```ini
[Unit]
Description=Sales Intelligence Workbench API
After=network-online.target

[Service]
Type=simple
User=sales
WorkingDirectory=/home/sales/.local/share/sales-intelligence-workbench/app/backend
Environment=NODE_ENV=production
EnvironmentFile=/home/sales/.config/sales-intelligence-workbench/runtime.env
EnvironmentFile=/home/sales/.config/sales-intelligence-workbench/credentials.env
ExecStart=/usr/bin/node src/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Worker 单元使用相同配置，把 `ExecStart` 改为：

```ini
ExecStart=/usr/bin/node src/worker.js
```

不要同时使用 systemd 和 `start.mjs` 启动同一套进程，否则会出现端口或任务领取冲突。

## 5. 健康与发布

部署后依次检查：

```bash
node skills/sales-intelligence-workbench/scripts/doctor.mjs
node skills/sales-intelligence-workbench/scripts/doctor.mjs --live
curl --fail --silent https://sales.example.com/api/health
```

`doctor --live` 会真实访问 Provider，可能产生少量用量；应在管理员知情时执行。健康接口只表示 API 进程可响应，不能代替 Worker、数据库迁移和完整业务验收。

升级顺序为：备份、只读迁移计划、应用向后兼容迁移、队列 smoke、停止旧进程、替换应用、启动 API 与 Worker、真实只读检查。若新版本失败，先停止 Worker，再恢复上一应用版本；数据库仅使用项目提供的前向迁移或经过验证的独立恢复包，不执行破坏性手工回滚。

## 6. 当前不支持

- 本项目当前不提供多租户 SaaS 托管边界。
- 未提供内置 TLS、企业 SSO、MFA 或高可用 Worker。
- 未完成容量压测和告警配置前，不应对外承诺生产 SLA。
