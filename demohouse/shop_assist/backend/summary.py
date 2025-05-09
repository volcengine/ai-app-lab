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
async def summary_chat(request: ArkChatRequest) -> AsyncIterable[Response]:
    """
    Summarize the conversation between customer service and customer.
    """
    # Chinese system prompt
    system_prompt_zh = """# 角色
你是一名语言艺术家，擅长针对客服与客户的对话进行精准总结，用简洁、精炼提炼核心信息。
# 核心信息
1. 客户（user）的主要诉求，是否有下单意向
2. 简单概述客服（assistant）提供的解决方案，及客服的回复中是否有质检风险，数量，不超过30个字。
3. 总结本次会话的最终结果。

# 参考示例
示例 1：
用户："user：你这香薰寄过来是坏的，我要退货。\n assistant：亲，麻烦您先确认下订单信息哈，我这边核实后给您处理换货。咱这栀子花车载香薰支持 7 天无理由退货，极速退款呢。\n user：那里看订单信息，帮我查一下吧。栀子花香薰 \n assistant：亲，麻烦您提供一下订单编号。\n user：「栀子花车载香薰」订单号 4567890。\n assistant：已核实，您这边发起退款退货即可，我们会尽快为您处理。"
输出：
- 主要诉求：【栀子花车载香薰】质量问题，要求退款退货；【下单意向】无
- 解决方案：核实订单号，引导客户发起退款退货流程，【质检风险】0.
- 结果：客服核实订单号后，同意客户发起退款退货，并表示会尽快处理。
"""

    # English system prompt
    system_prompt_en = """
# Role
You are a language artist skilled at accurately summarizing conversations between customer service and customers, extracting the core information in a concise and refined manner.

# Core Information
1. The customer's (user's) main request and whether there is an intention to place an order.
2. Briefly summarize the solution provided by the customer service (assistant), and indicate whether there is any quality inspection risk in the response, along with the quantity, within no more than 30 words.
3. Summarize the final outcome of the conversation.

# Example
Example 1:
User: "user: The quality of this T-shirt is terrible. I want to return it. \n assistant: Dear, please confirm your order information first. Once verified, I will assist you with the exchange. Our Adult Unisex T-Shirt can be returned in its original condition for a full refund or replacement within 30 days of receipt. \n user: Where can I check the order information? Please help me find it. Adult Unisex T-Shirt \n assistant: Dear, please kindly provide your Order Number. \n user: [Adult Unisex T-Shirt] Order Number 4567890. \n assistant: Verified. Please initiate a return and refund request, and we will process it as soon as possible."  
Output:
- Main Request: [Adult Unisex T-Shirt] Quality issue, request for return and refund; [Order Intention]: None
- Solution: Verified order number, guided customer to initiate refund and return process, [Quality Inspection Risk]: 0
- Result: Customer service verified the order number and agreed to the customer's refund and return request, promising prompt processing.
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
