# -*- coding: UTF-8 -*-
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

import time
import tos
from arkitect.core.component.llm import ArkChatRequest
from arkitect.types.llm.model import ArkChatResponse

from .dispatcher import ActionDispatcher
from env import TOS_ACCESS_KEY, TOS_SECRET_KEY, TOS_REGION, TOS_BUCKET, TOS_ENDPOINT


@ActionDispatcher.register("generate_upload_url")
async def generate_upload_url(request: ArkChatRequest):
    file_name = request.messages[0].content
    tos_client = tos.TosClient(
        tos.Auth(TOS_ACCESS_KEY, TOS_SECRET_KEY, TOS_REGION), TOS_ENDPOINT
    )
    url = tos_client.generate_presigned_url(
        Method="PUT", Bucket=TOS_BUCKET, Key=file_name, ExpiresIn=3600
    )

    yield ArkChatResponse(
        id="upload_url",
        choices=[],
        created=int(time.time()),
        model="",
        object="chat.completion",
        usage=None,
        bot_usage=None,
        metadata={"upload_url": url},
    )


def generate_download_url(file_name: str):
    tos_client = tos.TosClient(
        tos.Auth(TOS_ACCESS_KEY, TOS_SECRET_KEY, TOS_REGION), TOS_ENDPOINT
    )
    return tos_client.generate_presigned_url(
        Method="GET", Bucket=TOS_BUCKET, Key=file_name, ExpiresIn=3600
    )
