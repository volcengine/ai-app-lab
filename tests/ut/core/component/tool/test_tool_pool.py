# Copyright 2025 Bytedance Ltd. and/or its affiliates
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from arkitect.core.component.tool import ToolPool
from utils import check_server_working


async def test_custom_tool():
    pool = ToolPool()

    @pool.tool()
    async def adder(a: int, b: int) -> int:
        """Add two integer numbers
        Args:
            a (int): first number
            b (int): second number
        Returns:
            int: sum result
        """
        return a + b

    @pool.tool()
    async def greeting(name: str) -> str:
        """Greet a person
        Args:
            name (str): name of the person
        Returns:
            str: greeting message
        """
        return f"Hello, {name}!"

    await pool.initialize()
    await check_server_working(
        client=pool,
        expected_tools={
            "adder": {"input": {"a": 1, "b": 2}, "output": "3"},
            "greeting": {"input": {"name": "John"}, "output": "Hello, John!"},
        },
    )
    await check_server_working(
        client=pool,
        use_cache=True,
        expected_tools={
            "adder": {"input": {"a": 1, "b": 2}, "output": "3"},
            "greeting": {"input": {"name": "John"}, "output": "Hello, John!"},
        },
    )
