from __future__ import annotations
import re

from dataclasses import dataclass, replace


@dataclass(kw_only=True, frozen=True)
class BaseResult:
    """Represents the result of a tool execution."""
    output: str | None = None
    error: str | None = None

    def replace(self, **kwargs):
        """Returns a new ToolResult with the given fields replaced."""
        return replace(self, **kwargs)


class BaseError(Exception):
    """Represents the result of a tool execution."""

    def __init__(self, message):
        self.message = message


def camel_to_snake(name: str) -> str:
    name = re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1_\2', name)

    name = re.sub(r'([a-z\d])([A-Z])', r'\1_\2', name)

    return name.lower()


def snake_to_camel(s: str) -> str:
    return s[0].upper() + s.title().replace('_', '')[1:] if s else ""

def wrap_pyautogui_async(fn):
    async def wrapper(*args, **kwargs):
        try:
            result = fn(*args, **kwargs)
            if isinstance(result, (BaseResult, BaseError)):
                return result
            elif result is None:
                return BaseResult(output="", error="")
            else:
                return BaseResult(output=f"{result}", error="")
        except Exception as e:
            raise BaseError(f"pyautogui error: {e}")

    return wrapper


