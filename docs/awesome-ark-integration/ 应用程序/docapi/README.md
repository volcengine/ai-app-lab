# docapi
## 简介

https://github.com/NewToolAI/docapi
一款基于大型语言模型（LLM）的 API 文档生成工具，目前支持 Flask、Django 框架。通过 DocAPI，您可以快速生成、更新和展示 API 文档，大幅提升开发效率。


## **方舟**上的准备


1. 获取 API Key 点击[这里](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey)。
2. 开通方舟模型点击[这里](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement)。
3. 获取模型 ID 点击[这里](https://www.volcengine.com/docs/82379/1330310#%E6%96%87%E6%9C%AC%E7%94%9F%E6%88%90)。


## 调用方舟

### 调用模型服务
配置模型服务，下面是几个核心配置：
![Image](asset/img.png "docapi")

* DOUBAO_API_KEY：获取方舟的API Key，点击[这里](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey)。
* DOCAPI_MODEL：您需要模型对应的Model ID，点击[这里](https://www.volcengine.com/docs/82379/1330310#%E6%96%87%E6%9C%AC%E7%94%9F%E6%88%90)可查询。
