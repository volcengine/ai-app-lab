# 股票交易量化程序 linux 安装、启动方法

### step 1: 拉取代码
```
$ git clone https://github.com/volcengine/ai-app-lab
$ cd ai-app-lab/demohouse/quant_trading/
```


### step 2: 安装浏览器依赖

从 chrome 浏览器官网拉取浏览器驱动并解压在对应位置。这里我选择 134 版本，你也可以登录官网下载别的版本。

```
$ wget https://storage.googleapis.com/chrome-for-testing-public/134.0.6998.88/linux64/chrome-linux64.zip
$ wget https://storage.googleapis.com/chrome-for-testing-public/134.0.6998.88/linux64/chromedriver-linux64.zip
$ unzip chromedriver-linux64.zip
```

- 注意 chromedriver-linux64 目录的位置，应该是 `quant_trading/chromedriver-linux64/chromedriver`


### step 3: 获取火山豆包 AI 引擎 api_key，开通模型服务

- 火山方舟 API KEY [参考文档](https://www.volcengine.com/docs/82379/1298459#api-key-签名鉴权)
- 火山引擎 AK SK [参考文档](https://www.volcengine.com/docs/6291/65568)

总之，可以登录火山引擎，从上面找到一个 api key，调用 LLM 或 VLM 都需要用到，执行以下操作：

```
$ export ARK_API_KEY={your api key}
```

并且在火山引擎模型广场上选择需要的模型，这里需要一个 LLM ，以及一个 VLM。
<p align="left">
    <a alt="jionlp logo">
        <img src="../../quant_trading/image/model_ground_pic.jpg?raw=true" style="width:auto;height:300px">
    </a>
</p>

在这里我默认选用 `doubao-1-5-vision-pro-32k-250115` 和 `doubao-1-5-pro-32k-250115`，模型均对应一个接入点 end_point_id，如图所示。
<p align="left">
    <a alt="jionlp logo">
        <img src="../../quant_trading/image/model_online_pic.jpg?raw=true" style="width:auto;height:300px">
    </a>
</p>

> 当然你也可以更换成 Deepseek-R1 等别的模型，我也做了一下测试，模型效果一致性还可以。

执行环境变量操作：
```
export VLM_MODEL_NAME={your vlm model}
export VLM_MODEL_ENDPOINT_ID={your vlm end point id}
export LLM_MODEL_NAME={your llm model}
export LLM_MODEL_ENDPOINT_ID={your llm end point id}
```

### step 4: 安装 python 与三方库依赖

- python 版本：推荐 3.9~3.12
- 安装第三方库

```
$ pip install -r requirements.txt
```

### step 5: 启动 AI server

为了正常运行程序，需要启动两个服务，一个是 ai server，主要用于模型稳定调用；另一个是 web server，主要用于前端界面访问。

- 指定 AI server 的参数
```
$ export AI_SERVER_IP={your ai server ip}
$ export AI_SERVER_PORT={your ai server port}
```

- 启动服务
```
$ python quant_trading/server.py
```

### step 6: 启动 web server

- 指定 web server 参数
```
$ export WEB_SERVER_IP={your web server ip}
$ export WEB_SERVER_PORT={your web server port}
```

- 启动服务
```
$ python quant_trading/webui.py
```

好了，可以在浏览器上访问 web server 地址了。访问地址是：`http://{WEB_SERVER_IP}:{WEB_SERVER_PORT}/`
