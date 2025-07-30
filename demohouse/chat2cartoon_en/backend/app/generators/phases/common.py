import time

from arkitect.core.component.llm.model import ArkChatCompletionChunk, ArkMessage
from arkitect.utils.context import get_reqid, get_resource_id
from volcenginesdkarkruntime.types.chat.chat_completion_chunk import Choice, ChoiceDelta

from app.generators.phase import Phase


def get_correction_completion_chunk(message: ArkMessage, phase: Phase) -> ArkChatCompletionChunk:
    prefix = "CORRECTION "
    content = message.content
    if type(message.content) is str and message.content.startswith(prefix):
        content = message.content[len(prefix):]

    return ArkChatCompletionChunk(
        id=get_reqid(),
        choices=[
            Choice(
                index=0,
                delta=ChoiceDelta(
                    content=f"phase={phase.value}\n\n{content}",
                ),
            ),
        ],
        created=int(time.time()),
        model=get_resource_id(),
        object="chat.completion.chunk"
    )
