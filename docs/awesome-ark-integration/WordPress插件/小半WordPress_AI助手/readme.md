# 小半 WordPress ai助手
## 简介
https://github.com/suqicloud/wp-ai-chat
WordPress ai助手插件，可实现：ai对话聊天(文字、图片、文件分析)、ai对话语音播放、ai文章生成、ai文章总结、ai文章翻译、ai生成PPT、ai文档分析、文章内容语音播放。

## 方舟上的准备

1. 获取 API Key 点击[这里](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey)。
2. 开通方舟模型点击[这里](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement)。
3. 获取模型 ID 点击[这里](https://www.volcengine.com/docs/82379/1330310#%E6%96%87%E6%9C%AC%E7%94%9F%E6%88%90)。


## 调用方舟
### 调用模型服务
配置模型服务，下面是几个核心配置：
<img src="../小半WordPress_AI助手/asset/xiaoban.png" width="500" ></img>

* `自定义模型 API Key`：获取方舟的API Key，点击[这里](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey)。
* `自定义模型参数`：获取您创建的模型推理服务的接入点 ID，点击[这里](https://console.volcengine.com/ark/region:ark+cn-beijing/endpoint?config=%7B%7D)。`鉴权方式`：API Key
* `自定义模型请求 URL`：https://ark.cn-beijing.volces.com/api/v3

