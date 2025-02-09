# 联网深度思考

## 应用介绍

## 快速开始

1. 安装依赖

    ```
    poetry install
    ```

2. 修改`index.py`中相关密钥

    ```
   # 火山方舟APIKEY
   ARK_API_KEY = "{YOUR_ARK_API_KEY}"
   # 火山方舟推理模型接入点ID（推荐使用Deepseek-R1模型）
   REASONING_EP_ID = "{YOUR_ENDPOINT_ID}"
   # 可选，如果使用tavily作为联网引擎，填写对应的APIKEY
   TAVILY_API_KEY = "{YOUR_TAVILY_API_KEY}"
   # 可选，如果使用火山方舟零代码智能体作为联网引擎，填写对应的botId
   SEARCH_BOT_ID = "{YOUR_BOT_ID}"
    ```

3. 启动服务

    ```
    poetry run python -m index.py
    ```

4. 服务启动后将在`http://localhost:8888/api/v3/chat/completions`(默认地址端口)提供规范的chatAPI服务，可以使用http访问或火山官网SDK进行调用

   ```
   curl --location 'http://localhost:8888/api/v3/bots/chat/completions' \
   --header 'Content-Type: application/json' \
   --data '{
       
       "stream": false,
       "messages": [
           {
               "role": "user",
               "content": "北京12号线开通了吗"
           }
       ]
   }'
   ```
   
   ```python
   from volcenginesdkarkruntime import Ark

   client = Ark(base_url="http://localhost:8888/api/v3")
   
   # non-stream
   response = client.chat.completions.create(
       model="test",
       messages=[
           {
               "role": "user",
               "content": "北京今天天气怎么样？"
           }
       ],
       stream=False
   )
   
   print(response.choices[0].message.content)
   
   # stream
   response_stream = client.chat.completions.create(
       model="test",
       messages=[
           {
               "role": "user",
               "content": "北京今天天气怎么样？"
           }
       ],
       stream=True
   )
   
   for chunk in response_stream:
       print(chunk.choices[0].delta.content)
   ```