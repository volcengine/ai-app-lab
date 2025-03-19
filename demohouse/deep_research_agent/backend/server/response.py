from typing import Literal, Optional, Union

from pydantic import BaseModel

from demohouse.deep_research_agent.backend.planning.planning import Planning


class WorkFlowResponse(BaseModel):
    id: str
    type: Literal['planning', 'message', 'function_call']
    status: Optional[Literal['pending', 'completed']]

    """
    for planning
    """
    planning: Optional[Planning]

    """
    for agent run
    """
    task_id: Optional[str]

    """
    for message type
    """
    role: Optional[str]
    reasoning_content: Optional[str]
    content: Optional[str]

    """
    for tool call
    """
    function_name: Optional[str]
    function_args: Optional[str]
    function_result: Optional[dict]
