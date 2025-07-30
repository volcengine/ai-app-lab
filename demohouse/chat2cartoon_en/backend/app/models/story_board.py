from typing import List

from pydantic import BaseModel


class StoryBoard(BaseModel):
    characters: List[str]
    scene: str
    lines: str
    lines_en: str
