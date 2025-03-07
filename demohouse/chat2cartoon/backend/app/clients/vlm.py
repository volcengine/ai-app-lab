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

from typing import AsyncIterable, List

from arkitect.core.component.llm import BaseChatLanguageModel
from arkitect.core.component.llm.model import ArkChatParameters, ArkChatResponse, ArkMessage
from arkitect.utils import AsyncTimedIterable


class VLMClient:
    """
    Visual Language Model client for the chat2cartoon demo, mainly used in the FilmInteraction phase.
    """

    endpoint_id: str

    def __init__(self, endpoint_id: str):
        self.endpoint_id = endpoint_id

    def chat_generation(
        self, messages: List[ArkMessage]
    ) -> AsyncIterable[ArkChatResponse]:
        messages = list(
            filter(lambda m: m.role in ["system", "assistant", "user"], messages)
        )

        vlm_chat = BaseChatLanguageModel(
            endpoint_id=self.endpoint_id,
            messages=messages,
            parameters=ArkChatParameters(temperature=1.0, top_p=0.7),
        )

        return AsyncTimedIterable(vlm_chat.astream(), timeout=5)
