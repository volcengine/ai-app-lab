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

from typing import Dict, Callable, AsyncIterable
from functools import wraps

from arkitect.types.runtime.model import Response


class ActionDispatcher:
    _instance = None
    _actions: Dict[str, Callable] = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ActionDispatcher, cls).__new__(cls)
        return cls._instance

    @classmethod
    def register(cls, action_name: str):
        def decorator(func):
            cls._actions[action_name] = func

            @wraps(func)
            def wrapper(*args, **kwargs):
                return func(*args, **kwargs)

            return wrapper

        return decorator

    async def dispatch(
        self, action_name: str, *args, **kwargs
    ) -> AsyncIterable[Response]:
        if action_name not in self._actions:
            raise ValueError(f"Action {action_name} not found")
        action = self._actions[action_name]
        async for response in action(*args, **kwargs):
            yield response
