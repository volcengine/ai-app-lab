from pydantic import BaseModel


class Film(BaseModel):
    url: str
