from typing import List, AsyncIterable

from arkitect.core.component.llm.model import ArkChatParameters, ArkMessage, ArkChatResponse
from arkitect.utils import AsyncTimedIterable
from byteplussdkarkruntime import Ark
from byteplussdkarkruntime.types.chat import ChatCompletionChunk


class VLMClient:
    vlmclient: Ark
    endpoint: str

    def __init__(self, vlm_api_key: str, endpoint: str) -> None:
        self.vlmclient = Ark(api_key=vlm_api_key, region="cn-beijing")
        self.endpoint = endpoint

    def chat_generation(self, messages: List[ArkMessage]) -> AsyncIterable[ChatCompletionChunk]:
        messages = list(filter(lambda m: m.role in ["system", "assistant", "user"], messages))

        resp = self.vlmclient.chat.completions.create(
            model=self.endpoint,
            messages=messages,
            temperature=1.0,
            top_p=0.7,
            stream=True,
        )

        return AsyncTimedIterable(resp, timeout=5)
