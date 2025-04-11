# Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
# Licensed under the 【火山方舟】原型应用软件自用许可协议
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#     https://www.volcengine.com/docs/82379/1433703
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import os

"""
for server
"""

# recommend to use DeepSeek-R1 model or doubao model
VLM_MODEL_NAME = os.getenv('VLM_MODEL_NAME') or "{YOUR_VLM_MODEL_NAME}"
VLM_MODEL_ENDPOINT_ID = os.getenv('VLM_MODEL_ENDPOINT_ID') or "{YOUR_VLM_MODEL_ENDPOINT_ID}"

LLM_MODEL_NAME = os.getenv('LLM_MODEL_NAME') or "{YOUR_LLM_MODEL_NAME}"
LLM_MODEL_ENDPOINT_ID = os.getenv('LLM_MODEL_ENDPOINT_ID') or "{YOUR_LLM_MODEL_ENDPOINT_ID}"

# ark api key
ARK_API_KEY = os.getenv('ARK_API_KEY') or "{YOUR_ARK_API_KEY}"
# api server address for web ui

AI_SERVER_IP = os.getenv('AI_SERVER_IP') or "{YOUR_AI_SERVER_IP}"
AI_SERVER_PORT = os.getenv('AI_SERVER_PORT') or "{YOUR_AI_SERVER_PORT}"


"""
for webui
"""
ARK_API_ADDR = f"http://{AI_SERVER_IP}:{AI_SERVER_PORT}/api/v1/bots"

WEB_SERVER_IP = os.getenv('WEB_SERVER_IP') or "{YOUR_WEB_SERVER_IP}"
WEB_SERVER_PORT = os.getenv('WEB_SERVER_PORT') or "{YOUR_WEB_SERVER_PORT}"

# while using remote api, maybe need bot id
API_BOT_ID = os.getenv("API_BOT_ID") or "{YOUR_API_BOT_ID}"
