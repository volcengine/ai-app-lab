from typing import Union, List, Any

from pydantic import BaseModel

from models.events import BaseEvent


class GlobalState(BaseModel):
    # all the events
    events: List[BaseEvent] = []

    # custom global state
    custom_state: Any

    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True
