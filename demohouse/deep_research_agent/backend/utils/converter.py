from typing import Optional, Any

from arkitect.core.component.context.model import State
from models.events import BaseEvent, FunctionCallEvent, FunctionCompletedEvent


def convert_pre_tool_call_to_event(
        function_name: str,
        function_parameter: str
) -> Optional[BaseEvent]:
    # TODO inner tool wrapper
    return FunctionCallEvent(
        function_name=function_name,
        function_parameter=function_parameter,
    )


def convert_post_tool_call_to_event(
        function_name: str,
        function_parameter: str,
        function_result: Any,
        exception: Optional[Exception] = None,
) -> Optional[BaseEvent]:
    # TODO inner tool wrapper
    return FunctionCompletedEvent(
        function_name=function_name,
        function_parameter=function_parameter,
        function_result=function_result,
        success=exception is None,
        error_msg='' if not exception else str(exception)
    )
