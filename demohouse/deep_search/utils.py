from datetime import datetime
from typing import List

from arkitect.core.component.llm.model import ArkMessage


def get_last_message(messages: List[ArkMessage], role: str):
    """Finds the last ArkMessage of a specific role, given the role."""
    for message in reversed(messages):
        if message.role == role:
            return message
    return None


def get_current_date() -> str:
    return datetime.now().strftime("%Y年%m月%d日")
