
# Continue
## 简介

https://www.continue.dev/
利用其开源 IDE 扩展和模型、规则、提示、文档和其他构建块的中心，来创建、共享和使用自定义 AI 代码助手。

## 方舟上的准备


1. 获取 API Key 点击[这里](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey)。
2. 开通方舟模型点击[这里](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement)。
3. 获取模型 ID 点击[这里](https://www.volcengine.com/docs/82379/1330310#%E6%96%87%E6%9C%AC%E7%94%9F%E6%88%90)。


## 调用方舟
### 调用模型服务
配置模型服务，需在配置文件`config.json`的`models`字段里直接添加配置：

```
{
    "title": "<自定义服务点名称>",
    "provider": "openai",
    "apiKey": "<ARK_API_KEY>",
    "model": "<你所需模型的Model ID>",
    "apiBase": "https://ark.cn-beijing.volces.com/api/v3"
}
```
>

* `model`：获取您创建的模型推理服务的接入点 ID，点击[这里](https://console.volcengine.com/ark/region:ark+cn-beijing/endpoint?config=%7B%7D)
* `apiKey`：填写API Key。获取方舟的API Key，点击[这里](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey)


