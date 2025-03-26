# Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
# Licensed under the 【火山方舟】原型应用软件自用许可协议
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at 
#     https://www.volcengine.com/docs/82379/1433703
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
import json
from typing import Optional, Any, Union, List

from volcenginesdkarkruntime.types.bot_chat import BotChatCompletion
from volcenginesdkarkruntime.types.bot_chat.bot_reference import Reference

from arkitect.utils.context import get_reqid
from models.events import BaseEvent, FunctionCallEvent, FunctionCompletedEvent, WebSearchToolCallEvent, \
    WebSearchToolCompletedEvent, PythonExecutorToolCompletedEvent, PythonExecutorToolCallEvent


def convert_pre_tool_call_to_event(
        function_name: str,
        function_parameter: str
) -> Optional[BaseEvent]:
    if function_name == 'web_search':
        return WebSearchToolCallEvent(
            query=json.loads(function_parameter).get('message')
        )
    elif function_name == 'python_executor':
        return PythonExecutorToolCallEvent(
            code=json.loads(function_parameter).get('pyCode')
        )

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
    if function_name == 'web_search':
        return convert_bot_search_result_to_event(
            function_parameter, function_result
        )
    elif function_name == 'python_executor':
        return convert_python_execute_result_to_event(
            function_parameter, function_result
        )

    # TODO inner tool wrapper
    return FunctionCompletedEvent(
        function_name=function_name,
        function_parameter=function_parameter,
        function_result=function_result,
        success=exception is None,
        error_msg='' if not exception else str(exception)
    )


def convert_bot_search_result_to_event(raw_args: str, raw_response: str) -> WebSearchToolCompletedEvent:
    try:
        query = json.loads(raw_args).get('message')
        bot_response = BotChatCompletion.model_construct(**json.loads(raw_response))
        return WebSearchToolCompletedEvent(
            query=query,
            summary=bot_response.choices[0].message.content,
            references=bot_response.references
        )
    except Exception as e:
        return WebSearchToolCompletedEvent(
            success=False,
            error_msg=str(e)
        )


def convert_python_execute_result_to_event(raw_args: str, raw_response: str) -> PythonExecutorToolCompletedEvent:
    try:
        py_code: str = json.loads(raw_args).get('pyCode')
        body = json.loads(raw_response).get('body')
        run_result = json.loads(body).get('run_result')
        return PythonExecutorToolCompletedEvent(
            code=py_code,
            stdout=run_result,
        )
    except Exception as e:
        return PythonExecutorToolCompletedEvent(
            success=False,
            error_msg=str(e)
        )


def convert_references_to_format_str(refs: List[Reference]) -> str:
    formatted = []
    for ref in refs:
        formatted.append(f"- [{ref.title}]({ref.url})")
    return '\n'.join(formatted)


def convert_event_to_sse_response(event: BaseEvent) -> str:
    event.id = get_reqid()
    return f"data: {event.model_dump_json(exclude_none=True)}\n\n"
