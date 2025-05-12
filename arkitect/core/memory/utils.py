from openai.types.responses import Response
from volcenginesdkarkruntime.types.chat.chat_completion_message import (
    ChatCompletionMessage,
)

from arkitect.types.llm.model import ArkMessage


def _ark_message_to_string(messages: list[ArkMessage | dict]) -> str:
    content = ""
    for message in messages:
        if isinstance(message, ArkMessage):
            content += f"{message.role}: {message.content}\n"
        elif isinstance(message, dict):
            content += f"{message['role']}: {message['content']}\n"
    return content


def get_user_input_str(user_input: list[ArkMessage | dict]) -> str:
    return _ark_message_to_string(user_input)


def get_response_str(assistant_response: Response | ChatCompletionMessage) -> str:
    if isinstance(assistant_response, Response):
        return assistant_response.choices[0].message.content
    elif isinstance(assistant_response, ChatCompletionMessage):
        return assistant_response.content
    else:
        raise ValueError("Invalid assistant response type")
