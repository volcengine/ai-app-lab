import json
from typing import List, Dict, Any

from arkitect.core.component.llm.model import ArkMessage
from arkitect.core.errors import InvalidParameter

from app.logger import ERROR


def get_last_message(messages: List[ArkMessage], role: str):
    for message in reversed(messages):
        if message.role == role:
            return message
    return None


def extract_dict_from_message(text: str) -> Dict[str, Any]:
    try:
        json_start_index = text.find("{")
        if json_start_index == -1:
            raise InvalidParameter("messages", "invalid json text in message")
        json_part = text[json_start_index:]
        parsed_json = json.loads(json_part)

        return parsed_json
    except json.JSONDecodeError:
        ERROR(f"unable to extract json, message: {text}")
        raise InvalidParameter("messages", "unable to extract json in message")
    except Exception as e:
        ERROR(f"unable to extract json, message: {text}, error: {e}")
        raise InvalidParameter("messages", "unable to extract json in message")
