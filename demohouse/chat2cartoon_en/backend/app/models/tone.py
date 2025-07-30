from pydantic import BaseModel


class Tone(BaseModel):
    index: int
    line: str
    line_en: str
    tone: str
