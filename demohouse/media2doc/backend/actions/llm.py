# -*- coding: UTF-8 -*-
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

from arkitect.core.component.context.context import Context
from arkitect.core.component.llm import ArkChatRequest
from arkitect.types.llm.model import ArkChatParameters

from env import MODEL_ID
from .dispatcher import ActionDispatcher


@ActionDispatcher.register("generate_markdown_text")
async def generate_markdown_text(request: ArkChatRequest):
    parameters = ArkChatParameters(**request.__dict__)
    ctx = Context(model=MODEL_ID, parameters=parameters)
    await ctx.init()
    messages = [
        {"role": message.role, "content": message.content}
        for message in request.messages
    ]
    resp = await ctx.completions.create(messages=messages, stream=request.stream)

    if request.stream:
        async for chunk in resp:
            yield chunk
    else:
        yield resp


@ActionDispatcher.register("default")
async def default_llm_action(request: ArkChatRequest):
    parameters = ArkChatParameters(**request.__dict__)
    ctx = Context(model=MODEL_ID, parameters=parameters)
    await ctx.init()
    messages = [
        {"role": message.role, "content": message.content}
        for message in request.messages
    ]
    resp = await ctx.completions.create(messages=messages, stream=request.stream)
    if request.stream:
        async for chunk in resp:
            yield chunk
    else:
        yield resp
