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

import os
from arkitect.core.component.llm import BaseChatLanguageModel
from arkitect.types.llm.model import ArkChatResponse, ArkMessage
from util import MockAsyncArk, get_tool_call_reply

os.environ["ARK_API_KEY"] = "-"


def test_generate_prompts_with_additional_prompts() -> None:
    # Arrange
    messages = [
        ArkMessage(role="user", content="Hello"),
        ArkMessage(role="assistant", content="Hi there!"),
    ]
    additional_prompts = ["Welcome to the chat!", "How can I help you today?"]

    mock_chat_model = BaseChatLanguageModel(model="123", messages=messages)
    # Act
    result = mock_chat_model.generate_prompts(
        messages, additional_system_prompts=additional_prompts
    )

    # Assert
    assert len(result) == len(messages) + len(additional_prompts)
    assert all(msg.role == "system" for msg in result[: len(additional_prompts)])
    assert all(msg.role != "system" for msg in result[len(additional_prompts) :])


def test_generate_prompts_without_template():
    # Arrange
    messages = [
        ArkMessage(role="user", content="Hello"),
        ArkMessage(role="assistant", content="Hi there!"),
    ]
    mock_chat_model = BaseChatLanguageModel(model="123", messages=messages)
    mock_chat_model.template = None

    # Act
    result = mock_chat_model.generate_prompts(messages)

    # Assert
    assert len(result) == len(messages)


def test_generate_prompts_with_formatting() -> None:
    # Arrange
    messages = [
        ArkMessage(role="system", content="You are a helpful assistant."),
        ArkMessage(role="user", content="Hello"),
        ArkMessage(role="assistant", content="Hi there!"),
    ]
    mock_chat_model = BaseChatLanguageModel(model="123", messages=messages)
    additional_prompts = ["Welcome to the chat!", "How can I help you today?"]

    # Act
    result = mock_chat_model.generate_prompts(
        messages, additional_system_prompts=additional_prompts
    )

    # Assert
    assert result
    assert len(result) == len(messages) + len(additional_prompts)
    assert all(msg.role == "system" for msg in result[: len(additional_prompts) + 1])
    assert all(msg.role != "system" for msg in result[len(additional_prompts) + 1 :])


async def test_base_chat_llm_with_unseen_tools() -> None:
    llm = BaseChatLanguageModel(
        client=MockAsyncArk(message=get_tool_call_reply()),
        messages=[ArkMessage(role="user", content="hi")],
        model="abc",
    )
    resp = await llm.arun()
    assert isinstance(resp, ArkChatResponse)


async def test_base_chat_llm_with_registered_tools() -> None:

    async def adder(a: int, b: int) -> int:
        """Add two integer numbers
        Args:
            a (int): first number
            b (int): second number
        Returns:
            int: sum result
        """
        return a + b

    llm = BaseChatLanguageModel(
        client=MockAsyncArk(message=get_tool_call_reply()),
        messages=[ArkMessage(role="user", content="hi")],
        model="abc",
    )
    resp = await llm.arun(functions=[adder])
    assert isinstance(resp, ArkChatResponse)
    assert resp.choices[0].message.content == "tool call handled"


if __name__ == "__main__":
    import asyncio

    asyncio.run(test_base_chat_llm_with_registered_tools())
