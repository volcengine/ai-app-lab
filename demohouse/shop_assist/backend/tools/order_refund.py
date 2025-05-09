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

from typing import Callable

from data import orders
from data.orders import OrderStatus
from pydantic import Field


def get_order_refund_fn(account_id: str) -> Callable:
    async def order_refund(
        order_id: str = Field(
            description="Order ID, must be provided by user", default=""
        ),
        reason: str = Field(
            description="Refund reason, summarized from context", default=""
        ),
    ):
        """
        Use this function when a refund is needed. User must provide the order ID.
        """
        order = await orders.get_order(account_id, order_id)
        if not order:
            return "Order does not exist"

        if order["status"] == OrderStatus.REFUNDED.value:
            return "Order has already been refunded, cannot refund again"

        success = await orders.update_order_status(
            account_id, order_id, OrderStatus.REFUNDED, reason
        )
        if not success:
            return "Refund failed"
        return "Refund successful"

    return order_refund
