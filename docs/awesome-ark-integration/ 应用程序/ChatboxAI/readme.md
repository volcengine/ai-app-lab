<!-- 软件名称 -->
# Chatbox AI
## 简介
<!-- 软件网址 -->
https://chatboxai.app/zh
<!-- 软件简介 -->
Chatbox AI 是一款 AI 客户端应用和智能助手，支持众多先进的 AI 模型和 API，可在 Windows、MacOS、Android、iOS、Linux 和网页版上使用。
## 方舟上的准备
<!-- 调用方舟需要准备的步骤，无需更改 -->
1. 获取 API Key 点击[这里](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey)。
2. 开通方舟模型点击[这里](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement)。
3. 获取模型 ID 点击[这里](https://www.volcengine.com/docs/82379/1330310#%E6%96%87%E6%9C%AC%E7%94%9F%E6%88%90)。
4. 如果要联网能力或者知识库检索能力，参考[零代码应用操作指南](https://www.volcengine.com/docs/82379/1267885)创建应用，点击[这里](https://console.volcengine.com/ark/region:ark+cn-beijing/assistant)获取 Bot ID。

## 调用方舟
<!-- 支持集成的方式，包括关键配置，以及配置步骤 -->
### 调用模型服务
配置模型服务，下面是几个核心配置：

![image](asset/Chatbox%20AI.png)

- `API模式`：OpenAI兼容
- `API域名`：https://ark.cn-beijing.volces.com/api/v3
- `API路径`：/chat/completions
- `模型`：您需要模型对应的Model ID，点击[这里](https://www.volcengine.com/docs/82379/1330310#%E6%96%87%E6%9C%AC%E7%94%9F%E6%88%90)可查询。
- `API密钥`：获取方舟的API Key，点击[这里](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey)。

## 使用技巧
<!-- 软件使用技巧，可选 -->
### 使用 Chatbox 生成可视化图表
可以使用 Chatbox 的“图表”助手生成各种图表，可以更方便地让你理解一些数据。
> 为了更好的效果，请选择更聪明更强大的模型。模型能力将直接决定图表的效果。

