
# meet-libai
## 简介

https://github.com/BinNong/meet-libai
遇见李白（meet-libai）通过构建李白知识图谱，结合大模型训练出专业的AI智能体，以生成式对话应用的形式，推动李白文化的普及与推广。

## 方舟上的准备

1. 获取 API Key 点击[这里](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey)。
2. 开通方舟模型点击[这里](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement)。
3. 获取模型 ID 点击[这里](https://www.volcengine.com/docs/82379/1330310#%E6%96%87%E6%9C%AC%E7%94%9F%E6%88%90)。


## 调用方舟

### 调用模型服务
在项目根目录下**新建**`.env`文件作为环境变量配置，并在文件中指定启用哪个环境配置，下面给出`.env`内容的核心配置：
```Shell
#LLM_BASE_URL=https://ark.cn-beijing.volces.com/api/v3/
#LLM_API_KEY=YOUR API-KEY
#MODEL_NAME=
```


* LLM_BASE_URL：https://ark.cn-beijing.volces.com/api/v3
* LLM_API-KEY：获取方舟的API Key，点击[这里](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey)。
* MODEL_NAME：您需要模型对应的Model ID，点击[这里](https://www.volcengine.com/docs/82379/1330310#%E6%96%87%E6%9C%AC%E7%94%9F%E6%88%90)可查询。

