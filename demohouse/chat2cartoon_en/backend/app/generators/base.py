from typing import AsyncIterable, Union

from arkitect.core.component.llm import ArkChatCompletionChunk, ArkChatRequest, ArkChatResponse

from app.mode import Mode


class Generator:
    request: ArkChatRequest
    mode: Mode

    def __init__(self, request: ArkChatRequest, mode: Mode = Mode.NORMAL):
        self.request = request
        self.mode = mode

    def generate(self) -> AsyncIterable[Union[ArkChatCompletionChunk, ArkChatResponse]]:
        raise NotImplementedError
