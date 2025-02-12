# DeepDoubao
## 应用介绍
这是一款结合DeepSeek R1模型的强大推理能力与Doubao模型的高效对话能力的应用，为用户提供智能问答服务。通过Deepseek R1模型的推理能力与Doubao自然流畅的对话相结合，为用户带来精准、专业且具有互动性的智能体验。

### 相关模型
- 思考：DeepSeek-R1/250120

- 回答：不同场景可以选择不同的回答模型
   - 综合任务：Doubao-1.5-pro-32k/250115
   - 角色扮演：Doubao-pro-32k/character-241215


## 环境准备

- Python 版本要求大于等于 3.8，小于 3.12
- 已获取火山方舟 API Key [参考文档](https://www.volcengine.com/docs/82379/1298459#api-key-%E7%AD%BE%E5%90%8D%E9%89%B4%E6%9D%83)
- 已创建 DeepSeek-R1 的 endpoint  [参考文档](https://www.volcengine.com/docs/82379/1099522#594199f1)
- 已创建 Douba 的endpoint [参考文档](https://www.volcengine.com/docs/82379/1099522#594199f1)

## 快速开始

1. 下载代码库

   ```bash
    git clone https://github.com/volcengine/ai-app-lab.git
    cd demohouse/deepdoubao
   ```
2. 修改配置

   - 修改`backend/code/main.py` 中配置，填入
    ```text
     | 配置变量名                | 说明                            |
     | ------------------------ | -------------------------------|
     | DEEPSEEK_R1_ENDPOINT     | DeepSeek-R1 endpoint id        |
     | DOUBAO_ENDPOINT          | Doubao 模型 endpoint id         |
    ```

   - 修改 `backend/run.sh` 中配置，填入获取的API key
    ```text
     | 配置变量名    | 说明            |
     | ----------- | --------------- |
     | ARK_API_KEY | 火山方舟 API Key |
    ```


     
3. 安装后端依赖

   ```bash
   cd demohouse/deepdoubao/backend

   python -m venv .venv
   source .venv/bin/activate
   pip install poetry==1.6.1

   poetry install
   ```
4. 启动后端

   ```bash
   cd demohouse/deepdoubao/backend
   bash run.sh
   ```
   
5. 测试

   ```bash
   curl --location 'http://localhost:8888/api/v3/bots/chat/completions' \
    --header 'Content-Type: application/json' \
    --data '{
        "model": "test",
        "stream": true,
        "messages": [
            {
                "role": "user",
                "content": "写一个适合3岁宝宝的睡前故事"
            }
        ]
    }'
   ```

