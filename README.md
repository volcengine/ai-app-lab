# 高代码 Python SDK Arkitect
[English](./README_en.md)

## SDK 介绍

### 概述

高代码 Python SDK Arkitect，面向具有专业开发能力的企业开发者，提供大模型应用开发需要用到的工具集和流程集。借助高代码 SDK Arkitect 和 AI 原型应用代码示例，您能够快速开发和扩展匹配您业务场景的大模型相关应用。

> https://github.com/volcengine/ai-app-lab/tree/main/arkitect  


@task()
async def main(request: ArkChatRequest) -> AsyncIterable[Response]:
    async for resp in default_model_calling(request):
        yield resp


if __name__ == "__main__":
    port = os.getenv("_FAAS_RUNTIME_PORT")
    launch_serve(
        package_path="main",
        port=int(port) if port else 8080,
        health_check_path="/v1/ping",
        endpoint_path="/api/v3/bots/chat/completions",
        clients={},
    )

```

5. 设置 APIKEY 并启动后端

```bash
export ARK_API_KEY=<YOUR APIKEY>
python3 main.py
```

6. 发起请求

- [创建火山方舟高代码应用](https://console.volcengine.com/ark/region:ark+cn-beijing/assistant)，快速部署你的云上智能体应用  

预期返回如下：

- `./arkitect` 目录下代码遵循 [Apache 2.0](./APACHE_LICENSE) 许可.  

## 常见问题

### arkitect 和 volcenginesdkarkruntime 的区别?

- arkitect 是方舟高代码智能体 SDK，面向具有专业开发能力的企业开发者，提供智能体开发需要用到的工具集和流程集。
- volcenginesdkarkruntime 是对方舟的 API 进行封装，方便用户通过 API 创建、管理和调用大模型相关服务。

## LICENSE说明
- ```./arkitect``` 目录下代码遵循 [Apache 2.0](./APACHE_LICENSE) 许可.
- ```./demohouse``` 目录下代码遵循[【火山方舟】原型应用软件自用许可协议](ARK_LICENSE.md) 许可。