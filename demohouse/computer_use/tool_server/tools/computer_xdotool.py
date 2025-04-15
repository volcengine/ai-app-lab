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

import base64
import asyncio
from typing import Optional
from pathlib import Path
from fastapi import HTTPException
from common.config import get_settings
from uuid import uuid4
from .base import camel_to_snake
from .constants import KEYS, CLICK_BUTTONS, SCROLL_BUTTONS
from .computer import *

XDOTOOL_DELAY = 50
class XDOComputerTool(IComputerTool):
    def __init__(
            self,
            display: Optional[str] = None,
    ):
        super().__init__()
        self._display = display or get_settings().display
        self._display_prefix = f"DISPLAY={self._display}"
        self._xrandr = f"{self._display_prefix} xrandr"
        self._xdotool = f"{self._display_prefix} xdotool"
        self.logger = logging.getLogger(__name__)

    async def shell(self, command: str, timeout: float = 10) -> BaseResult:
        """Run a shell command and return the output, error, and optionally a screenshot."""
        process = await asyncio.create_subprocess_shell(
            command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )

        try:
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout)
            return BaseResult(output=stdout, error=stderr)
        except asyncio.TimeoutError as exc:
            try:
                process.kill()
            except ProcessLookupError:
                pass
            raise TimeoutError(
                f"Command '{command}' timed out after {timeout} seconds"
            ) from exc

    async def move_mouse(self, request: MoveMouseRequest):
        command_parts = [self._xdotool, f"mousemove --sync {request.x} {request.y}"]
        return await self.shell(" ".join(command_parts))

    async def click_mouse(self, r: ClickMouseRequest):
        self.logger.debug(f"click_mouse, {r}")
        button = r.button
        press = r.press
        release = r.release
        x, y = r.x, r.y
        if button is None or button == "":
            button = "left"
        button = camel_to_snake(button)
        if button not in ["left", "right", "middle", "double_left"]:
            raise HTTPException(status_code=400, detail=f"Invalid button")
        if press and not release:
            return await self.press_mouse(PressMouseRequest(x=x, y=y, button=button))
        elif release and not press:
            return await self.release_mouse(ReleaseMouseRequest(x=x, y=y, button=button))
        else:
            await self.move_mouse(MoveMouseRequest(x=r.x, y=r.y))
            command_parts = [self._xdotool, f"click {CLICK_BUTTONS[button]}"]
            return await self.shell(" ".join(command_parts))

    async def press_mouse(self, r: PressMouseRequest):
        await self.move_mouse(MoveMouseRequest(x=r.x, y=r.y))
        command_parts = [self._xdotool, f"mousedown {CLICK_BUTTONS[r.button]}"]
        return await self.shell(" ".join(command_parts))

    async def release_mouse(self, r: ReleaseMouseRequest):
        await self.move_mouse(MoveMouseRequest(x=r.x, y=r.y))
        command_parts = [self._xdotool, f"mouseup {CLICK_BUTTONS[r.button]}"]
        return await self.shell(" ".join(command_parts))

    async def drag_mouse(self, r: DragMouseRequest):
        drag_path = gen_path(r.source_x, r.source_y, r.target_x, r.target_y)
        if drag_path is None or len(drag_path) < 2:
            raise BaseException(f"drag_path is required for drag")
        command_parts = []
        first_x, first_y = drag_path[0]
        command_parts.append(f"mousemove --sync {first_x} {first_y}")
        command_parts.append(f"mousedown 1")
        for x, y in drag_path[1:]:
            command_parts.append(f"sleep 0.2 mousemove {x} {y}")
        command_parts.append(f"mouseup 1")
        cmd = " ".join(command_parts)
        return await self.shell(f"{self._xdotool} {cmd}")

    async def scroll(self, r: ScrollRequest):
        await self.move_mouse(MoveMouseRequest(x=r.x, y=r.y))
        scroll_button = SCROLL_BUTTONS[r.scroll_direction]
        command_parts = [
            self._xdotool,
            f"click --repeat {r.scroll_amount} {scroll_button}",
        ]
        return await self.shell(" ".join(command_parts))

    async def press_key(self, r: PressKeyRequest):
        self.logger.debug(f"press_key, {r}")
        keys = [x for x in r.key.split(' ') if x]
        if isinstance(keys, list):
            key = "+".join(
                KEYS[k.lower()] if k.lower() in KEYS else k.lower() for k in keys
            )
        else:
            key = KEYS[r.key.lower()] if r.key.lower() in KEYS else r.key.lower()
        command_parts = [self._xdotool, f"key -- {key}"]
        return await self.shell(" ".join(command_parts))

    async def type_text(self, r: TypeTextRequest):
        results: list[BaseResult] = []
        for chunk in chunks(r.text, 50):
            command_parts = [
                self._xdotool,
                f"type --delay {XDOTOOL_DELAY} -- '{chunk}'",
            ]
            results.append(await self.shell(" ".join(command_parts)))
        return BaseResult(
            output="".join(result.output or "" for result in results),
            error="".join(result.error or "" for result in results),
        )

    def wait(self, r: WaitRequest):
        self.shell(f"sleep {r.duration / 1000}")

    async def take_screenshot(self, r: TakeScreenshotRequest):
        output_dir = Path(get_settings().screenshot_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        path = output_dir / f"screenshot_{uuid4()}.png"
        screenshot_cmd = f"{self._display_prefix} scrot -p {path}"
        result = await self.shell(screenshot_cmd)
        if path.exists():
            return {"Screenshot": base64.b64encode(path.read_bytes()).decode()}
        raise BaseError(f"Failed to take screenshot: {result.error}")

    async def get_cursor_position(self, r: GetCursorPositionRequest):
        command_parts = [self._xdotool, "getmouselocation --shell"]
        result = await self.shell(" ".join(command_parts))
        x = int(result.output.split("X=")[1].split("\n")[0])
        y = int(result.output.split("Y=")[1].split("\n")[0])
        return {"PositionX": x, "PositionY": y}

    async def get_screen_size(self, r: GetScreenSizeRequest):
        command_parts = [self._xrandr, " | grep '*' | awk '{print $1}'"]
        result = await self.shell(" ".join(command_parts))
        x = int(result.output.split("x")[0])
        y = int(result.output.split("x")[1])
        return {"Width": x, "Height": y}

    async def change_password(self, r: ChangePasswordRequest):
        return BaseResult(output="", error="Change password not supported")
