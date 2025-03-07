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
from prompt import SUMMARY_PROMPT

os.environ['VOLC_ACCESSKEY'] = '<ACCESSKEY_FOR_VOLCENGINE>'
os.environ['VOLC_SECRETKEY'] = '<SECRETKEY_FOR_VOLCENGINE>'

CHAT_ENDPOINT = "<ENDPOINT_ID_FOR_DOUBAO>"
EMBEDDING_ENDPOINT = "<ENDPOINT_ID_FOR_DOUBAO_EMBEDDING>"
SUMMARY_ENDPOINT = "<ENDPOINT_ID_FOR_DEEPSEEK>"  
COLLECTION_NAME = "demohouse_mem0"

mem0_config = {
    "vector_store": {
        "provider": "vikingdb",
        "config": {
            "collection_name": COLLECTION_NAME,
        }
    }, 
    "llm": {
        "provider": "doubao",
        "config": {
            "model": SUMMARY_ENDPOINT,
        }
    },
    "embedder": {
        "provider": "doubao",
        "config": {
            "model": EMBEDDING_ENDPOINT,
        }
    },
    "custom_prompt": SUMMARY_PROMPT,
}
