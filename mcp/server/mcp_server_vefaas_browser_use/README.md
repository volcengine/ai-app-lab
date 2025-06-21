# veFaaS Browser-Use MCP Server

veFaaS Browser-Use MCP server 可以让用户仅输入检索任务，就可以由大模型分析拆解任务，调用浏览器实时搜索任务，最后整合输出任务结果。

| | |
|------|------|
| 版本 | v0.0.3 |
| 描述 | veFaaS Browser-Use MCP server 自动化你的浏览器操作任务 |
| 分类 | 容器与中间件 |
| 标签 | veFaaS，函数服务，Browser-Use，浏览器 |

## Tools

本 MCP Server 产品提供以下 Tools (工具/能力):

### Tool 1: create_browser_use_task

#### 类型

实例

#### 详细描述

发起浏览器操作任务

输出：

- 返回任务结果

#### 最容易被唤起的 Prompt示例

```
查看今日北京天气
```

### Tool 2: get_browser_use_task_status

#### 类型

查询

#### 详细描述

查询浏览器操作任务的执行状态和结果。

输出：

- 返回任务当前状态（如进行中、已完成、失败等）
- 如已完成，返回任务结果

#### 最容易被唤起的 Prompt示例

```
查询刚才浏览器任务的执行状态
```

## 可适配平台  

Python, Cursor, Claude macOS App, Cline

## 服务开通链接 (整体产品)  

<https://console.volcengine.com/vefaas>

## 鉴权方式  

OAuth 2.0

## 在不同平台的配置

### 获取 veFaaS Browser-Use 服务的访问入口

参考火山引擎 veFaaS [一键部署 Browser Use Agent 应用](https://www.volcengine.com/docs/6662/1537697)，获取 veFaaS Browser Use Agent 服务的访问入口，如 `https://xxxxxxxxxxx.apigateway-cn-beijing.volceapi.com/tasks`，请去掉 URL 里的路径，获取 `https://xxxxxxxxxxx.apigateway-cn-beijing.volceapi.com`，用于下方的 `BROWSER_USE_ENDPOINT` 配置。

### Stdio

```json
{
  "mcpServers": {
    "vefaas-browser-use": {
      "command": "uvx",
      "args": [
        "--from",
        "git+https://github.com/volcengine/mcp-server#subdirectory=server/mcp_server_vefaas_browser_use",
        "mcp-server-vefaas-browser-use"
      ],
      "env": {
        "BROWSER_USE_ENDPOINT": "https://xxxxxxxxxxx.apigateway-cn-beijing.volceapi.com"
      }
    }
  }
}
```

### SSE

```json
{
  "mcpServers": {
    "vefaas-browser-use": {
      "command": "uvx",
      "args": [
        "--from",
        "git+https://github.com/volcengine/mcp-server#subdirectory=server/mcp_server_vefaas_browser_use",
        "mcp-server-vefaas-browser-use",
        "-t",
        "sse"
      ],
      "env": {
        "BROWSER_USE_ENDPOINT": "https://xxxxxxxxxxx.apigateway-cn-beijing.volceapi.com"
      }
    }
  }
}
```



## License

volcengine/mcp-server is licensed under the [MIT License](../../LICENSE).
