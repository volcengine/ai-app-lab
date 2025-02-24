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
import asyncio
import time
from datetime import datetime
from typing import List, AsyncIterable, Generator

import volcenginesdkarkruntime.types.chat.chat_completion_chunk as completion_chunk

from arkitect.core.component.llm.model import ArkMessage, ArkChatCompletionChunk


def cast_content_to_reasoning_content(
        chunk: ArkChatCompletionChunk,
) -> ArkChatCompletionChunk:
    new_chunk = ArkChatCompletionChunk(**chunk.__dict__)
    new_chunk.choices[0].delta.reasoning_content = chunk.choices[0].delta.content
    new_chunk.choices[0].delta.content = ""
    return new_chunk


def cast_reference_to_chunks(keyword: str, raw_content: str) -> ArkChatCompletionChunk:
    new_chunk = ArkChatCompletionChunk(
        id="",
        object="chat.completion.chunk",
        created=0,
        model="",
        choices=[],
        metadata={
            "reference": raw_content,
            "keyword": keyword,
        },
    )
    return new_chunk


def get_last_message(messages: List[ArkMessage], role: str):
    """Finds the last ArkMessage of a specific role, given the role."""
    for message in reversed(messages):
        if message.role == role:
            return message
    return None


def get_current_date() -> str:
    return datetime.now().strftime("%Y年%m月%d日")


def gen_metadata_chunk(metadata: dict) -> ArkChatCompletionChunk:
    return ArkChatCompletionChunk(
        id='',
        created=int(time.time()),
        model='',
        object='chat.completion.chunk',
        choices=[completion_chunk.Choice(
            index=0,
            delta=completion_chunk.ChoiceDelta(
                content="",
                reasoning_content=""
            ),
        )],
        metadata=metadata,
    )


def sync_wrapper(async_generator: AsyncIterable) -> Generator:
    loop = asyncio.new_event_loop()
    try:
        gen = async_generator
        _aiter = gen.__aiter__()
        while True:
            try:
                item = loop.run_until_complete(_aiter.__anext__())
                yield item
            except StopAsyncIteration:
                break
    finally:
        loop.close()
