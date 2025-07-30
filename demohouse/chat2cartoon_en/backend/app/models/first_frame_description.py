from typing import List

from pydantic import BaseModel


class FirstFrameDescription(BaseModel):
    description: str
    characters: List[str]

    def to_content(self, index: int) -> str:
        characters = "，".join(self.characters)
        return f"分镜{index}：\n角色：{characters}\n首帧描述：{self.description}"
