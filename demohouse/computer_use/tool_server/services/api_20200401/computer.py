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
