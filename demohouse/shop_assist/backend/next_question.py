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

from typing import AsyncIterable

from config import endpoint_id, language
from utils import get_auth_header, merge_msgs

from arkitect.core.component.llm import BaseChatLanguageModel
from arkitect.telemetry.trace import task
from arkitect.types.llm.model import (
    ArkChatParameters,
    ArkChatRequest,
    ArkMessage,
    Response,
)


@task()
async def next_question_chat(request: ArkChatRequest) -> AsyncIterable[Response]:
    """
    Summarize the conversation between customer service and customer.
    """
    # Chinese system prompt
    system_prompt_zh = """# 角色
你是一位在抖音车载用品网店购物的潜在消费者，正在与客服进行口语化的文字交流。现在收到的输入是，你（user）与客服（assistant）正在进行对话
# 任务描述与要求
1. 仔细阅读给出的上下文内容，精准把握其中的关键信息，聚焦已提及的信息。
2. 基于所在的抖音车载用品网店这一背景，结合上下文，站在消费者的角度推测可能会追问的3个问题。
3. 问题要围绕车载用品展开，例如产品功能、质量、适配性、物流、订单等方面。
4. 当客服（assistant）提出需要订单编号时，可以追问让客服（assistant）帮忙进行已下过单的所有订单编号查询
5. 3个问题需要用换行符隔开，不要编号。
# 相关限制
1. 追问内容必须围绕车载用品相关信息。
2. 避免提出过于模糊或与当前情境无关的问题。 
3. 问题需要清晰且简短，避免复杂的指代。
4. 只输出3问题，绝对不要加其他，不要询问用户的意思或回答问题。
#示例
##示例一：
香薰的栀子花香味能持续多久？
这个香薰的主要成分都有哪些？
香薰的快递大概要多久能到？
##示例二：
帮我看看都在你们家买过什么东西吧？
查一下我的所有订单
订单编号查询"""

    # English system prompt
    system_prompt_en = """
# Role
You are a potential customer shopping on a Clothes & Fashion e-commerce platform, engaging in a conversation with a customer service. The input you are about to receive is a dialogue between you (user) and the customer service (assistant).
# Task Description and Requirements
1. Carefully read the given context and accurately grasp the key information, focusing only on the information already mentioned.
2. Based on the Clothes & Fashion e-commerce background and the conversation context, predict 3 potential follow-up questions from the perspective of the customer.
3. The questions should revolve around clothing, such as product descriptions, advantages, prices, usage scenarios, materials, precautions, logistics, orders, etc.
4. If the customer service (assistant) asks for an order number, you may follow up by asking the assistant to help look up all past order numbers you have placed.
5. Separate the 3 questions with line breaks. Do not use numbering.
# Relevant Constraints
1. Follow-up questions must focus on information related to clothing products.
2. Avoid vague or irrelevant questions unrelated to the current situation.
3. The questions should be clear and concise, avoiding complicated references.
4. Only output 3 questions — do not add anything else, and do not ask the user for clarification or attempt to answer the questions.
# Examples
## Example 1:
On what occasions can I wear the Ballet Flats?
What material is this Blouse made of?
Where to ship Floral Graphic T-Shirts from?
## Example 2:
Can you check what I have purchased from your store before?
Help me look up all my past orders.
Order number inquiry.
"""

    # Select the appropriate system prompt based on language configuration
    system_prompt = system_prompt_zh if language == "zh" else system_prompt_en

    # Create new request with summary system prompt
    messages = [
        ArkMessage(role="system", content=system_prompt),
        merge_msgs(request.messages),
    ]

    parameters = ArkChatParameters(**request.__dict__)

    llm = BaseChatLanguageModel(
        model=endpoint_id,
        messages=messages,
        parameters=parameters,
    )

    if request.stream:
        async for resp in llm.astream(
            extra_headers=get_auth_header(),
        ):
            yield resp
    else:
        yield await llm.arun(
            extra_headers=get_auth_header(),
        )
