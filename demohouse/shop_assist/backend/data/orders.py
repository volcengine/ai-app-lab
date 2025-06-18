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

from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass
from enum import Enum
from typing import Dict, List, Optional

from .cache import LRUCache
import sys
import os

# Add the parent directory to sys.path to import config
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import language


class OrderStatus(str, Enum):
    SHIPPED = "已发货" if language == "zh" else "Shipped"
    PENDING = "未发货" if language == "zh" else "Not Shipped"
    REFUNDED = "已退款" if language == "zh" else "Refunded"


@dataclass
class Order:
    order_id: str
    status: OrderStatus
    product: str
    account_id: str
    tracking_number: Optional[str] = None
    reason: Optional[str] = None

    def to_dict(self) -> Dict[str, str]:
        data = asdict(self)
        # Convert OrderStatus enum to its value
        if data.get("status"):
            data["status"] = data["status"].value
        return {k: str(v) for k, v in data.items() if v is not None}


class OrderStorage(ABC):
    """
    Abstract base class for order storage.
    Implement this class to create new storage backends (e.g. SQLite, PostgreSQL)
    """

    @abstractmethod
    async def get_order(self, account_id: str, order_id: str) -> Optional[Order]:
        """
        Retrieve a specific order

        Args:
            account_id: Account ID associated with the order
            order_id: Order ID to retrieve

        Returns:
            Order if found, None otherwise
        """
        pass

    @abstractmethod
    async def get_orders_by_product(self, account_id: str, product: str) -> List[Order]:
        """
        Get all orders for a specific product

        Args:
            account_id: Account ID to search orders for
            product: Product name to filter by

        Returns:
            List of matching orders
        """
        pass

    @abstractmethod
    async def get_all_orders(self, account_id: str) -> List[Order]:
        """
        Get all orders for an account

        Args:
            account_id: Account ID to get orders for

        Returns:
            List of all orders for the account
        """
        pass

    @abstractmethod
    async def update_order(self, order: Order) -> bool:
        """
        Update order information

        Args:
            order: Updated order object

        Returns:
            True if update successful, False otherwise
        """
        pass


class InMemoryOrderStorage(OrderStorage):
    """In-memory implementation of order storage with LRU caching"""

    def __init__(self, cache_capacity: int = 1000):
        self._orders = LRUCache[Dict[str, Order]](cache_capacity)

    async def _initialize_account_orders(self, account_id: str) -> None:
        """
        Initialize demo orders for an account if not exists

        Args:
            account_id: Account ID to initialize orders for
        """
        # Get cached orders or initialize new ones
        orders = self._orders.get(account_id)
        if orders is None:
            # Product names based on language setting

            orders = {
                f"{account_id}_1": Order(
                    order_id=f"{account_id}_1",
                    status=OrderStatus.SHIPPED,
                    product="车载收纳盒"
                    if language == "zh"
                    else "Women's Floral Graphic T-Shirts",
                    account_id=account_id,
                    tracking_number=f"SF{account_id}10001",  # Fake tracking number for shipped order
                ),
                f"{account_id}_2": Order(
                    order_id=f"{account_id}_2",
                    status=OrderStatus.PENDING,
                    product="汽车遮阳挡"
                    if language == "zh"
                    else "Long Sleeve V Neck Blouses",
                    account_id=account_id,
                ),
                f"{account_id}_3": Order(
                    order_id=f"{account_id}_3",
                    status=OrderStatus.PENDING,
                    product="可爱风腰靠垫"
                    if language == "zh"
                    else "Unisex Vintage Baseball Cap",
                    account_id=account_id,
                ),
            }
            self._orders.put(account_id, orders)

    async def get_order(self, account_id: str, order_id: str) -> Optional[Order]:
        await self._initialize_account_orders(account_id)
        orders = self._orders.get(account_id)
        return orders.get(order_id) if orders else None

    async def get_orders_by_product(self, account_id: str, product: str) -> List[Order]:
        await self._initialize_account_orders(account_id)
        orders = self._orders.get(account_id)
        if not orders:
            return []
        return [order for order in orders.values() if order.product == product]

    async def get_all_orders(self, account_id: str) -> List[Order]:
        await self._initialize_account_orders(account_id)
        orders = self._orders.get(account_id)
        return list(orders.values()) if orders else []

    async def update_order(self, order: Order) -> bool:
        await self._initialize_account_orders(order.account_id)
        orders = self._orders.get(order.account_id)
        if not orders or order.order_id not in orders:
            return False
        orders[order.order_id] = order
        self._orders.put(order.account_id, orders)
        return True


# Global order storage instance
_storage = InMemoryOrderStorage()


async def get_order(account_id: str, order_id: str) -> Optional[Dict[str, str]]:
    """
    Get a specific order

    Args:
        account_id: Account ID associated with the order
        order_id: Order ID to retrieve

    Returns:
        Order information as dictionary if found, None otherwise
    """
    order = await _storage.get_order(account_id, order_id)
    return order.to_dict() if order else None


async def get_orders_by_product(account_id: str, product: str) -> List[Dict[str, str]]:
    """
    Get all orders for a specific product

    Args:
        account_id: Account ID to search orders for
        product: Product name to filter by

    Returns:
        List of order dictionaries matching the product
    """
    orders = await _storage.get_orders_by_product(account_id, product)
    return [order.to_dict() for order in orders]


async def get_all_orders(account_id: str) -> List[Dict[str, str]]:
    """
    Get all orders for an account

    Args:
        account_id: Account ID to get orders for

    Returns:
        List of all order dictionaries for the account
    """
    orders = await _storage.get_all_orders(account_id)
    return [order.to_dict() for order in orders]


async def update_order_status(
    account_id: str, order_id: str, status: OrderStatus, reason: Optional[str] = None
) -> bool:
    """
    Update order status

    Args:
        account_id: Account ID associated with the order
        order_id: Order ID to update
        status: New status to set
        reason: Optional reason for status change

    Returns:
        True if update successful, False otherwise
    """
    order = await _storage.get_order(account_id, order_id)
    if not order:
        return False

    order.status = status
    if reason:
        order.reason = reason

    return await _storage.update_order(order)
