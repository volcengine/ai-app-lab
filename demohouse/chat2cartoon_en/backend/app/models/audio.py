from typing import Optional

from pydantic import BaseModel


class Audio(BaseModel):
    index: int
    url: str
    audio_data: Optional[bytes] = None
