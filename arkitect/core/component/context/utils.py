from arkitect.core.component.context.model import ToolChunk
from volcenginesdkarkruntime.types.chat import ChatCompletion, ChatCompletionChunk
from typing import Union

from arkitect.telemetry import logger
from arkitect.types.llm.model import (
    ActionDetail,
    ArkChatCompletionChunk,
    ArkChatResponse,
    BotUsage,
    ToolDetail,
)


def convert_chunk(
    chunk: Union[ChatCompletionChunk, ToolChunk, ChatCompletion],
) -> ArkChatCompletionChunk | ArkChatResponse | None:
    if isinstance(chunk, ChatCompletionChunk):
        return ArkChatCompletionChunk(**chunk.model_dump())
    elif isinstance(chunk, ToolChunk):
        if chunk.tool_response:
            return ArkChatCompletionChunk(
                id="",
                choices=[],
                created=0,
                model="",
                references=[],
                bot_usage=BotUsage(
                    action_details=[
                        ActionDetail(
                            name=chunk.tool_name,
                            tool_details=[
                                ToolDetail(
                                    name=chunk.tool_name,
                                    input=chunk.tool_arguments,
                                    output=chunk.tool_response,
                                )
                            ],
                        )
                    ]
                ),
                object="chat.completion.chunk",
            )
        else:
            logger.INFO(
                f"Calling tool {chunk.tool_name} with {chunk.tool_arguments}..."
            )
    elif isinstance(chunk, ChatCompletion):
        return ArkChatResponse(**chunk.model_dump())
