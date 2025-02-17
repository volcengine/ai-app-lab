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

"""
DeepSeek Teacher
"""

import logging
import os
from typing import AsyncIterable, Union

from volcenginesdkarkruntime.types.completion_usage import (
    CompletionUsage,
    PromptTokensDetails,
    CompletionTokensDetails,
)

from arkitect.core.component.llm import BaseChatLanguageModel
from arkitect.core.component.llm.model import (
    ArkChatCompletionChunk,
    ArkChatParameters,
    ArkChatRequest,
    ArkChatResponse,
    Response,
    ArkMessage,
    BotUsage,
)
from arkitect.launcher.local.serve import launch_serve
from arkitect.telemetry.trace import task
from prompts import (
    VLM_PROMPT_SOLVE,
    DEEPSEEK_R1_PROMPT_SOLVE,
    VLM_PROMPT_CORRECT,
    DEEPSEEK_R1_PROMPT_CORRECT,
    DEEPSEEK_R1_PROMPT_CHAT,
)

logger = logging.getLogger(__name__)


DOUBAO_VLM_ENDPOINT = "doubao-1-5-vision-pro-32k-250115"
DEEPSEEK_R1_ENDPOINT = "deepseek-r1-250120"


def merge_usage(usage1: CompletionUsage, usage2: CompletionUsage) -> CompletionUsage:
    usage = CompletionUsage(
        prompt_tokens=usage1.prompt_tokens + usage2.prompt_tokens,
        completion_tokens=usage1.completion_tokens + usage2.completion_tokens,
        total_tokens=usage1.total_tokens + usage2.total_tokens,
    )
    if usage1.prompt_tokens_details or usage2.prompt_tokens_details:
        usage.prompt_tokens_details = PromptTokensDetails(
            cached_tokens=usage1.prompt_tokens_details.cached_tokens
            + usage2.prompt_tokens_details.cached_tokens
        )
    if usage1.completion_tokens_details or usage2.completion_tokens_details:
        r1 = usage1.completion_tokens_details.reasoning_tokens
        r2 = usage2.completion_tokens_details.reasoning_tokens
        usage.completion_tokens_details = CompletionTokensDetails(
            reasoning_tokens=r1 if r2 is None else r2 if r1 is None else r1 + r2
        )
    return usage


@task()
async def default_model_calling(
    request: ArkChatRequest,
) -> AsyncIterable[Union[ArkChatCompletionChunk, ArkChatResponse]]:
    parameters = ArkChatParameters(**request.__dict__)
    if request.metadata and request.metadata.get("mode") == "chat":
        parameters.temperature = 0
        deepseek = BaseChatLanguageModel(
            endpoint_id=DEEPSEEK_R1_ENDPOINT,
            messages=[
                ArkMessage(
                    role="user",
                    content=DEEPSEEK_R1_PROMPT_CHAT,
                ),
            ]
            + request.messages,
            parameters=parameters,
        )
        async for chunk in deepseek.astream():
            yield chunk
        return
    elif request.metadata and request.metadata.get("mode") == "correct":
        vlm_prompt, r1_prompt = VLM_PROMPT_CORRECT, DEEPSEEK_R1_PROMPT_CORRECT
    else:
        vlm_prompt, r1_prompt = VLM_PROMPT_SOLVE, DEEPSEEK_R1_PROMPT_SOLVE
    doubao_vlm = BaseChatLanguageModel(
        endpoint_id=DOUBAO_VLM_ENDPOINT,
        messages=[
            ArkMessage(
                role="system",
                content=vlm_prompt,
            )
        ]
        + request.messages,
        parameters=parameters,
    )
    vlm_usage_chunk = None
    vlm_content = ""
    async for chunk in doubao_vlm.astream():
        if chunk.usage:
            vlm_usage_chunk = chunk
        if len(chunk.choices) > 0 and chunk.choices[0].delta.content:
            yield chunk
            vlm_content += chunk.choices[0].delta.content
    # for math problems set temperature to zero https://api-docs.deepseek.com/quick_start/parameter_settings
    parameters.temperature = 0
    deepseek = BaseChatLanguageModel(
        endpoint_id=DEEPSEEK_R1_ENDPOINT,
        messages=[
            ArkMessage(
                role="user",
                content=r1_prompt + vlm_content,
            ),
        ],
        parameters=parameters,
    )
    async for chunk in deepseek.astream():
        if chunk.usage and vlm_usage_chunk:
            chunk.bot_usage = BotUsage(model_usage=[vlm_usage_chunk.usage, chunk.usage])
            chunk.usage = merge_usage(chunk.usage, vlm_usage_chunk.usage)
        yield chunk


@task()
async def main(request: ArkChatRequest) -> AsyncIterable[Response]:
    async for resp in default_model_calling(request):
        yield resp


if __name__ == "__main__":
    port = os.getenv("_FAAS_RUNTIME_PORT")
    launch_serve(
        package_path="main",
        port=int(port) if port else 8888,
        health_check_path="/v1/ping",
        endpoint_path="/api/v3/bots/chat/completions",
    )
