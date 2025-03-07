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

from typing import AsyncIterable, Union

from app.mode import Mode
from arkitect.core.component.llm.model import (
    ArkChatCompletionChunk,
    ArkChatRequest,
    ArkChatResponse,
)


class Generator:
    request: ArkChatRequest
    mode: Mode

    def __init__(self, request: ArkChatRequest, mode: Mode = Mode.CONFIRMATION):
        self.request = request
        self.mode = mode

    def generate(self) -> AsyncIterable[Union[ArkChatCompletionChunk, ArkChatResponse]]:
        raise NotImplementedError
