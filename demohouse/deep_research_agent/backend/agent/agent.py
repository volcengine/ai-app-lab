import abc
from typing import AsyncIterable, Union, List, Literal

from openai import BaseModel

from arkitect.types.llm.model import ArkMessage
from demohouse.deep_research_agent.backend.planning.planning import PlanningItem

"""
AgentStepOutputResponse is the non-stream response for agent run
"""


class AgentStepOutputResponse(BaseModel):
    pass


"""
AgentStepOutputChunk is the stream chunk for agent run
"""


class AgentStepOutputChunk(BaseModel):
    pass


"""
Agent is the core interface for all runnable agents
"""


class Agent(abc.ABC):
    def __init__(self,
                 instruction: Union[str, List[ArkMessage]],
                 task: Union[str, PlanningItem]) -> None:
        pass

    # non-stream run step
    @abc.abstractmethod
    async def arun_step(self, **kwargs) -> AgentStepOutputResponse:
        pass

    # stream run step
    @abc.abstractmethod
    async def astream_step(self, **kwargs) -> AsyncIterable[AgentStepOutputChunk]:
        pass

    # returns if the agent task finished
    @abc.abstractmethod
    def finished(self) -> bool:
        pass


class SearchAgent(Agent, BaseModel):
    mcp_server: List['remote.yaml']

    def __init__(self):
        self.mcp_clients = init_mcp_client(self.mcp_server)

    def _step(self):
        llm.astream(
            functions=self.mcp_clients,
        )
