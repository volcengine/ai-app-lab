from typing import List

from pydantic import BaseModel


class RoleImage(BaseModel):
    index: int
    images: List[str]
