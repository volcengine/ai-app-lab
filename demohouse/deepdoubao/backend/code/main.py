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
DeepDoubao
"""

import logging
import os
from typing import AsyncIterable, Union

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
from volcenginesdkarkruntime.types.completion_usage import (
    CompletionUsage,
    PromptTokensDetails,
    CompletionTokensDetails,
)

logger = logging.getLogger(__name__)

DEEPSEEK_R1_ENDPOINT = "<ENDPOINT_ID_FOR_DEEPSEEK_R1>"
DOUBAO_ENDPOINT = "<ENDPOINT_ID_FOR_DOUBAO>"


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
    parameters_r1 = ArkChatParameters(**request.__dict__)
    parameters_r1.max_tokens = (
        1  # Set max_tokens to 1, so R1 model will only output reasoning content.
    )
    deepseek = BaseChatLanguageModel(
        endpoint_id=DEEPSEEK_R1_ENDPOINT,
        messages=request.messages,
        parameters=parameters_r1,
    )
    reasoning_content = ""
    reasoning_usage = CompletionUsage(
        completion_tokens=0,
        total_tokens=0,
        prompt_tokens=0,
    )
    if request.stream:
        async for chunk in deepseek.astream():
            if chunk.usage:
                reasoning_usage = chunk.usage
            if len(chunk.choices) > 0 and chunk.choices[0].delta.reasoning_content:
                yield chunk
                reasoning_content += chunk.choices[0].delta.reasoning_content
    else:
        response = await deepseek.arun()
        reasoning_content = response.choices[0].message.reasoning_content
        if response.usage:
            reasoning_usage = response.usage

    parameters_doubao = ArkChatParameters(**request.__dict__)
    doubao = BaseChatLanguageModel(
        endpoint_id=DOUBAO_ENDPOINT,
        messages=request.messages
        + [
            ArkMessage(
                role="assistant",
                content="思考过程如下：\n"
                + reasoning_content
                + "\n请根据以上思考过程，给出完整的回答：\n",
            )
        ],
        parameters=parameters_doubao,
    )
    if request.stream:
        async for chunk in doubao.astream():
            if chunk.usage:
                chunk.bot_usage = BotUsage(model_usage=[reasoning_usage, chunk.usage])
                chunk.usage = merge_usage(chunk.usage, reasoning_usage)
            yield chunk
    else:
        response = await doubao.arun()
        response.choices[0].message.reasoning_content = reasoning_content
        if response.usage:
            response.bot_usage = BotUsage(model_usage=[reasoning_usage, response.usage])
            response.usage = merge_usage(response.usage, reasoning_usage)
        yield response


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
