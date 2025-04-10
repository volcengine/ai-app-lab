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

# recommend to use DeepSeek-R1 model
REASONING_MODEL_ENDPOINT_ID = (
    os.getenv("REASONING_MODEL_ENDPOINT_ID") or "{YOUR_REASONING_MODEL_ENDPOINT_ID}"
)
# optional, if you select tavily as search engine, please configure this
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY") or "{YOUR_TAVILY_API_KEY}"

"""
for webui
"""

# ark api key
ARK_API_KEY = os.getenv("ARK_API_KEY") or "{YOUR_ARK_API_KEY}"
# api server address for web ui
API_ADDR = os.getenv("API_ADDR") or "http://localhost:8888/api/v3/bots"
