from typing import List, AsyncIterable

from arkitect.core.component.llm import BaseChatLanguageModel
from  arkitect.core.component.llm.model import ArkChatResponse,ArkChatParameters,ArkMessage
from arkitect.utils import AsyncTimedIterable
from volcenginesdkarkruntime import AsyncArk

from app.constants import REGION, BASE_URL


class LLMClient:
    endpoint_id: str

    def __init__(self, endpoint_id: str):
        self.endpoint_id = endpoint_id

    def chat_generation(self, messages: List[ArkMessage]) -> AsyncIterable[ArkChatResponse]:
        messages = list(filter(lambda m: m.role in ["system", "assistant", "user"], messages))

        llm_chat = BaseChatLanguageModel(
            endpoint_id=self.endpoint_id,
            messages=messages,
            parameters=ArkChatParameters(temperature=1.0, top_p=0.7),
            client=AsyncArk(
                base_url=BASE_URL,
                region=REGION,
            ),
        )

        return AsyncTimedIterable(llm_chat.astream(extra_body={
            "thinking": {
                "type": "disabled"
            }
        }), timeout=5)
