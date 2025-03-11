import json
from volcenginesdkarkruntime import AsyncArk
from volcenginesdkarkruntime import resources
from volcenginesdkarkruntime.resources.chat.completions import (
    AsyncCompletions,
    ChatCompletion,
)
from volcenginesdkarkruntime.types.chat.chat_completion import (
    Choice,
    ChatCompletionMessage,
)
from volcenginesdkarkruntime.types.chat.chat_completion_message_tool_call import (
    ChatCompletionMessageToolCall,
    Function,
)


def get_tool_call_reply():
    return [
        ChatCompletion(
            id="test_id",
            choices=[
                Choice(
                    index=0,
                    message=ChatCompletionMessage(
                        role="assistant",
                        tool_calls=[
                            ChatCompletionMessageToolCall(
                                id="abc",
                                function=Function(
                                    name="adder",
                                    arguments=json.dumps({"a": "123", "b": "321"}),
                                ),
                                type="function",
                            )
                        ],
                    ),
                    finish_reason="tool_calls",
                )
            ],
            created=0,
            model="test_model",
            object="chat.completion",
        ),
        ChatCompletion(
            id="test_id2",
            choices=[
                Choice(
                    index=0,
                    message=ChatCompletionMessage(
                        role="assistant", content="tool call handled"
                    ),
                    finish_reason="stop",
                )
            ],
            created=0,
            model="test_model",
            object="chat.completion",
        ),
    ]


class MockAsyncCompletions(AsyncCompletions):
    def __init__(self, message: list[ChatCompletion], client):
        super().__init__(client)
        self.message: list[ChatCompletion] = message
        self.index = 0

    async def create(self, *args, **kwargs):
        msg = self.message[self.index]
        self.index += 1
        return msg


class MockAsyncChat(resources.AsyncChat):
    completions = MockAsyncCompletions(message=[], client=AsyncArk())

    def __init__(self, message, client):
        self.completions = MockAsyncCompletions(message, client)


class MockAsyncArk(AsyncArk):
    def __init__(self, message: list[ChatCompletion], *args, **kwargs):
        self.chat = MockAsyncChat(message, self)
