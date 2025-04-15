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

import logging
import os
from fastapi import HTTPException
from tools.computer import generate_request
from tools.computer_pyautogui import PyAutoGUIComputerTool
from tools.computer_xdotool import XDOComputerTool
from tools.base import camel_to_snake, BaseError


def new_computer_tool(*args, **kwargs):
    if os.name == "nt":
        return PyAutoGUIComputerTool(*args, **kwargs)
    else:
        return XDOComputerTool(*args, **kwargs)


computer_tool = new_computer_tool()
logger = logging.getLogger(__name__)


async def handle_20200401(action: str, params: dict):
    try:
        snake_action = camel_to_snake(action)
        if not hasattr(computer_tool, snake_action):
            raise HTTPException(status_code=404, detail="Action not found")
        return await action_route(computer_tool, snake_action, params)
    except BaseError as e:
        raise e


def action_route(obj, method, params):
    request = generate_request(method, params)
    try:
        return getattr(obj, method)(request)
    except BaseError as e:
        raise e
