from typing import List, Any

from openai import BaseModel
from pydantic import Field

from models.planning import Planning


class DeepResearchState(BaseModel):
    # global planning
    planning: Planning = Field(default_factory=Planning)
    # searched references
    references: List[Any] = []

    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True
