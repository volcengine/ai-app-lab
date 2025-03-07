# Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from arkitect.types.llm.model import (
    ArkChatRequest,
    ArkMessage,
)
from volcenginesdkarkruntime.types.chat.chat_completion_content_part_image_param import (
    ChatCompletionContentPartImageParam,
    ImageURL,
)
from arkitect.utils import dump_json_truncate


def test_dump_json():
    obj = ArkChatRequest(
        messages=[
            ArkMessage(
                role="user",
                content=[
                    ChatCompletionContentPartImageParam(
                        type="image_url",
                        image_url=ImageURL(
                            url="fake-b64-url",
                        ),
                    )
                ],
            )
        ],
        model="fake-model",
    )
    obj_copied = dump_json_truncate(obj, 1)
    assert obj_copied["messages"][0]["content"][0]["image_url"]["url"] == "f"
    obj_copied = dump_json_truncate(obj, 100)
    assert obj_copied["messages"][0]["content"][0]["image_url"]["url"] == "fake-b64-url"
