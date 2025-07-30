import logging
import os
from typing import AsyncIterable, Union

from arkitect.core.client import Client
from arkitect.core.component.llm import ArkChatCompletionChunk, ArkChatResponse, ArkChatRequest
from arkitect.launcher.local.serve import launch_serve
from arkitect.launcher.vefaas import bot_wrapper
from arkitect.telemetry.trace import task

from app.generators.factory import GeneratorFactory
from app.generators.phase import PhaseFinder, get_phase_from_message
from app.logger import INFO
from app.message_utils import get_last_message
from app.mode import Mode

logging.basicConfig(
    level=logging.INFO, format="[%(asctime)s][%(levelname)s] %(message)s"
)
LOGGER = logging.getLogger(__name__)


@task()
async def main(request: ArkChatRequest) -> AsyncIterable[Union[ArkChatCompletionChunk, ArkChatResponse]]:
    mode = Mode.NORMAL
    last_user_message = get_last_message(request.messages, "user")
    for m in [Mode.REGENERATION, Mode.CORRECTION, Mode.CONFIRMATION]:
        if type(last_user_message.content) is str and last_user_message.content.startswith(m.value):
            mode = m
            break

    INFO(f"mode: {mode.value}")

    pf = PhaseFinder(request)
    if mode in [Mode.REGENERATION, Mode.CORRECTION]:
        phase = get_phase_from_message(last_user_message.content)
    else:
        phase = pf.get_next_phase()

    INFO(f"phase: {phase.value}")
    gfc = GeneratorFactory(phase)
    generator = gfc.get_generator(request, mode)

    async for chunk in generator.generate():
        yield chunk


@bot_wrapper(trace_on=True)
@task(custom_attributes={"input": None, "output": None})
async def handler(
        request: ArkChatRequest,
) -> AsyncIterable[Union[ArkChatCompletionChunk, ArkChatResponse]]:
    """
    vefaas handler
    """
    async for resp in main(request):
        yield resp


if __name__ == "__main__":
    port = os.getenv("_FAAS_RUNTIME_PORT")
    launch_serve(
        package_path="index",
        port=int(port) if port else 8080,
        health_check_path="/v1/ping",
        endpoint_path="/api/v3/bots/chat/completions",
        clients={
            "chat": (
                Client,
                {
                    "auto_refresh_apikey": True,
                    "region": "ap-southeast-1",
                },
            )
        },
    )
