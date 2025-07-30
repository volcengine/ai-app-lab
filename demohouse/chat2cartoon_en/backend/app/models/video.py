from typing import Optional

from pydantic import BaseModel


class Video(BaseModel):
    index: int
    video_gen_task_id: str
    video_data: Optional[bytes] = None
