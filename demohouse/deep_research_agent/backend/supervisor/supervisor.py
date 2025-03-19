import abc
from typing import List, AsyncIterable, Dict, Type

from openai import BaseModel
from pydantic import Field

from demohouse.deep_research_agent.backend.agent.agent import Agent
from demohouse.deep_research_agent.backend.planning.planning import Planning, PlanningItem


class Supervisor(abc.ABC, BaseModel):
    planning: Planning = Field(default_factory=None)
    worker_agents: Dict[str, Type[Agent]] = {}

    @abc.abstractmethod
    async def assign_next_todo(self, **kwargs) -> (PlanningItem, Agent):
        pass

    @abc.abstractmethod
    async def receive_step(self, planning_item: PlanningItem) -> None:
        pass

    @abc.abstractmethod
    async def finished(self) -> bool:
        pass

    @abc.abstractmethod
    async def reload_planning(self, planning: Planning) -> None:
        pass

    @abc.abstractmethod
    async def dump_planning(self) -> Planning:
        pass
