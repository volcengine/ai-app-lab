from pydantic import BaseModel


class CreateSessionRequest(BaseModel):
    task: str


class RunSessionRequest(BaseModel):
    session_id: str
