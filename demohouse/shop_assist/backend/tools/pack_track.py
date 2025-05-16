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

from data import orders, tracking
from data.orders import OrderStatus
from pydantic import Field


def get_pack_track_fn(account_id: str) -> Callable:
    async def pack_track(
        order_id: str = Field(
            description="Order ID, must be provided by user", default=""
        ),
        tracking_number: str = Field(
            description="Tracking number, must be provided by user", default=""
        ),
    ):
        """
        Use this function to query shipping information. Returns tracking information.
        Either order ID or tracking number must be provided.
        """
        if order_id:
            order = await orders.get_order(account_id, order_id)
            if not order:
                return "Order information not found"
            if order["status"] == OrderStatus.REFUNDED.value:
                return "Order has been refunded, no shipping information available"
            if order["status"] == OrderStatus.PENDING.value:
                return (
                    "Order has not been shipped yet, no tracking information available"
                )
            tracking_number = order.get("tracking_number")

        if not tracking_number:
            return "Order has no tracking number"

        tracking_info = tracking.get_tracking_info(tracking_number)

        return tracking_info

    return pack_track
