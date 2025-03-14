# akinterpreter
## 简介

https://github.com/wxy2ab/akinterpreter
akinterpreter 是一款借助 LLM API 搭建的金融市场查询分析工具，调用开源的 akshare（超 900 函数查多类金融数据且高频更新）与付费但数据优质稳定的 tushare，经简单配置，可用自然语言快速完成金融数据查询与分析 。

## **方舟**上的准备


1. 获取 API Key 点击[这里](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey)。
2. 开通方舟模型点击[这里](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement)。
3. 获取模型 ID 点击[这里](https://www.volcengine.com/docs/82379/1330310#%E6%96%87%E6%9C%AC%E7%94%9F%E6%88%90)。

## 调用方舟

### 调用模型服务
配置模型服务需要修改配置-配置模版`setting.ini`中的`llm_api`***，***并添加对应的llm api的`api_key`：
```Shell
[Default]
llm_api = DoubaoApiClient                
volcengine_api_key =            #火山引擎API 需要的key
```


* llm_api：填写 `DoubaoApiClient `  
* volcengine_api_key：获取方舟的API Key，点击[这里](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey)


