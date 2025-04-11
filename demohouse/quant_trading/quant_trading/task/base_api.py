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
import pdb
import json
import time
import base64

from openai import OpenAI

from config import VLM_MODEL_NAME, LLM_MODEL_NAME, ARK_API_KEY, ARK_API_ADDR


DIR_PATH = os.path.dirname(__file__)
HISTORY_DIR_PATH = os.path.join(DIR_PATH, "history_data")


class BaseAPI(object):
    def __init__(self,):
        self.vlm_model_name = VLM_MODEL_NAME
        self.llm_model_name = LLM_MODEL_NAME
        self.client = OpenAI(
            base_url=ARK_API_ADDR,
            api_key=ARK_API_KEY)

    @staticmethod
    def _read_image_2_base64(image_path):
        with open(image_path, "rb") as image_file:
            image_data = image_file.read()
            base64_image = base64.b64encode(image_data).decode("utf-8")

        return base64_image

    def call_vlm(self, image_base64, prompt):

        final_content = ""
        for rsp in self.client.chat.completions.create(
            model=self.vlm_model_name,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": '详细描述一下图片',
                        },
                        {
                            "type": 'image_url',
                            "image_url": {
                                "url": f"data:image/png;base64,{image_base64}",
                            },
                        },
                    ]
                }
            ],
            stream=True,
        ):
            # round vars
            reasoning_content = rsp.choices[0].delta.reasoning_content \
                if hasattr(rsp.choices[0].delta, 'reasoning_content') else ''
            content = rsp.choices[0].delta.content if hasattr(rsp.choices[0].delta, 'content') else ''
            metadata = getattr(rsp, 'metadata', {})
            # print(content, end='', flush=True)
            final_content += content
            # yield content
        return final_content

    def call_llm(self, message):
        for rsp in self.client.chat.completions.create(
            model="doubao-1-5-pro-32k-250115",
            messages=[
                {
                    "role": "user",
                    "content": message,
                }
            ],
            stream=True,
        ):
            # round vars
            reasoning_content = rsp.choices[0].delta.reasoning_content \
                if hasattr(rsp.choices[0].delta, 'reasoning_content') else ''
            content = rsp.choices[0].delta.content if hasattr(rsp.choices[0].delta, 'content') else ''
            metadata = getattr(rsp, 'metadata', {})
            # print(content, end='', flush=True)
            yield content



