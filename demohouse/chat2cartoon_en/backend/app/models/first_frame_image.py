from typing import List

from pydantic import BaseModel


class FirstFrameImage(BaseModel):
    index: int
    images: List[str]
