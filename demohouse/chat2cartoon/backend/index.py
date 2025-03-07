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

import logging
import os
from typing import AsyncIterable, Union

from app.generators.factory import GeneratorFactory
from app.generators.phase import PhaseFinder, get_phase_from_message
from app.message_utils import get_last_message
from app.mode import Mode

from arkitect.core.component.llm.model import (
    ArkChatCompletionChunk,
    ArkChatRequest,
    ArkChatResponse,
)
from arkitect.launcher.local.serve import launch_serve
from arkitect.launcher.vefaas import bot_wrapper
from arkitect.telemetry.logger import INFO
from arkitect.telemetry.trace import task

logging.basicConfig(
    level=logging.INFO, format="[%(asctime)s][%(levelname)s] %(message)s"
)
LOGGER = logging.getLogger(__name__)


@task()
async def main(
    request: ArkChatRequest,
) -> AsyncIterable[Union[ArkChatCompletionChunk, ArkChatResponse]]:
    """
    Determines the phase and mode based on the last message in the
    current request and executes the corresponding response generator.
    """

    last_user_message = get_last_message(request.messages, "user")

    mode = Mode.CONFIRMATION
    if type(last_user_message.content) is str and last_user_message.content.startswith(
        Mode.REGENERATION.value
    ):
        mode = Mode.REGENERATION

    INFO(f"mode: {mode.value}")

    phase = PhaseFinder(request).get_next_phase()
    if mode == Mode.REGENERATION:
        phase = get_phase_from_message(last_user_message.content)

    INFO(f"phase: {phase.value}")

    generator = GeneratorFactory(phase).get_generator(request, mode)

    async for chunk in generator.generate():
        yield chunk


@bot_wrapper(trace_on=True)
@task(custom_attributes={"input": None, "output": None})
async def handler(
    request: ArkChatRequest,
) -> AsyncIterable[Union[ArkChatCompletionChunk, ArkChatResponse]]:
    async for resp in main(request):
        yield resp


if __name__ == "__main__":
    port = os.getenv("_FAAS_RUNTIME_PORT")
    launch_serve(
        package_path="index",
        port=int(port) if port else 8888,
        health_check_path="/v1/ping",
        endpoint_path="/api/v3/bots/chat/completions",
        clients={},
    )
