from pydantic import BaseModel

"""
common parent class
"""


class MessageChunk(BaseModel):
    pass


"""
for normal text output
"""


class OutputTextChunk(MessageChunk):
    delta: str


"""
fro reasoning output
"""


class ReasoningChunk(MessageChunk):
    delta: str
