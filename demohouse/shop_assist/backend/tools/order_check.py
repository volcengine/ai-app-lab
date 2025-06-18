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
from pydantic import Field


def get_order_check_fn(account_id: str) -> Callable:
    async def order_check(
        order_id: str = Field(description="Order ID", default=""),
        product: str = Field(description="Product name", default=""),
    ):
        """
        Use this function to query order details. Returns detailed order information.
        If both order ID and product name are empty, returns all order information.
        """
        if product:
            result = await orders.get_orders_by_product(account_id, product)

        if order_id:
            result = await orders.get_order(account_id, order_id)
        result = await orders.get_all_orders(account_id)
        return result

    return order_check
