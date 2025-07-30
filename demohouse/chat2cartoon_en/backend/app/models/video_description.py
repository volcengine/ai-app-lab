from typing import List

from pydantic import BaseModel


class VideoDescription(BaseModel):
    description: str
    characters: List[str]

    def to_content(self, index: int) -> str:
        characters = "，".join(self.characters)
        return f"视频{index}：\n角色：{characters}\n描述：{self.description}"
