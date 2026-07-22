import asyncio
import sys
import unittest
from unittest.mock import AsyncMock, Mock, patch
from pathlib import Path

from fastapi import HTTPException


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from tools.computer import PressKeyRequest
from tools.computer_xdotool import XDOComputerTool, normalize_key


class NormalizeKeyTests(unittest.TestCase):
    def test_maps_existing_named_key_combination(self):
        self.assertEqual(normalize_key("ctrl c"), "Control_L+c")
        self.assertEqual(normalize_key("alt+tab"), "Alt_L+Tab")

    def test_accepts_single_alphanumeric_key(self):
        self.assertEqual(normalize_key("a"), "a")
        self.assertEqual(normalize_key("7"), "7")

    def test_rejects_shell_metacharacters(self):
        with self.assertRaises(HTTPException) as context:
            normalize_key("a;id>/tmp/poc")

        self.assertEqual(context.exception.status_code, 400)


class PressKeyExecutionTests(unittest.IsolatedAsyncioTestCase):
    async def test_uses_exec_with_key_as_a_separate_argument(self):
        process = type("Process", (), {"communicate": AsyncMock(return_value=(b"", b""))})()
        tool = XDOComputerTool(display=":99")

        with patch(
            "tools.computer_xdotool.asyncio.create_subprocess_exec",
            new=AsyncMock(return_value=process),
        ) as create_process:
            result = await tool.press_key(PressKeyRequest(key="ctrl c"))

        create_process.assert_awaited_once()
        args, kwargs = create_process.call_args
        self.assertEqual(args, ("xdotool", "key", "--", "Control_L+c"))
        self.assertEqual(kwargs["env"]["DISPLAY"], ":99")
        self.assertEqual(result.output, "")
        self.assertEqual(result.error, "")

    async def test_kills_subprocess_when_press_key_times_out(self):
        process = type(
            "Process",
            (),
            {
                "communicate": AsyncMock(side_effect=asyncio.TimeoutError),
                "kill": Mock(),
            },
        )()
        tool = XDOComputerTool(display=":99")

        with patch(
            "tools.computer_xdotool.asyncio.create_subprocess_exec",
            new=AsyncMock(return_value=process),
        ):
            with self.assertRaises(TimeoutError):
                await tool.press_key(PressKeyRequest(key="enter"))

        process.kill.assert_called_once()

    async def test_returns_error_when_xdotool_is_unavailable(self):
        tool = XDOComputerTool(display=":99")

        with patch(
            "tools.computer_xdotool.asyncio.create_subprocess_exec",
            new=AsyncMock(side_effect=FileNotFoundError("xdotool not found")),
        ):
            result = await tool.press_key(PressKeyRequest(key="enter"))

        self.assertEqual(result.output, "")
        self.assertIn("xdotool not found", result.error)


if __name__ == "__main__":
    unittest.main()
