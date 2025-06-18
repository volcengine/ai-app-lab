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

ak = os.getenv("VOLC_ACCESSKEY", "")
sk = os.getenv("VOLC_SECRETKEY", "")
collection_name = os.getenv("COLLECTION_NAME", "")
faq_collection_name = os.getenv("FAQ_COLLECTION_NAME", "")
endpoint_id = os.getenv("LLM_ENDPOINT_ID", "doubao-1-5-pro-32k-250115")
bucket_name = os.getenv("BUCKET_NAME", "")
use_server_auth = os.getenv("USE_SERVER_AUTH", "False").lower() in ("true", "1", "t")
language = os.getenv("LANGUAGE", "zh")  # 'zh' for Chinese, 'en' for English
