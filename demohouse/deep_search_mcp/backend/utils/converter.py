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
import time
from typing import Optional, Any, Union, List

from volcenginesdkarkruntime.types.bot_chat import BotChatCompletion
from volcenginesdkarkruntime.types.bot_chat.bot_reference import Reference
from volcenginesdkarkruntime.types.chat.chat_completion_chunk import Choice, ChoiceDelta

from arkitect.types.llm.model import ArkChatCompletionChunk, ArkChatRequest
from arkitect.utils.context import get_reqid
from models.events import BaseEvent, FunctionCallEvent, FunctionCompletedEvent, WebSearchToolCallEvent, \
    WebSearchToolCompletedEvent, PythonExecutorToolCompletedEvent, PythonExecutorToolCallEvent, \
    LinkReaderToolCompletedEvent, LinkReaderToolCallEvent, OutputTextEvent, ReasoningEvent, PlanningEvent, ErrorEvent, \
    EOFEvent, KnowledgeBaseSearchToolCompletedEvent, KnowledgeBaseSearchToolCallEvent


def convert_pre_tool_call_to_event(
        function_name: str,
        function_parameter: str
) -> Optional[BaseEvent]:
    if function_name == 'web_search':
        return WebSearchToolCallEvent(
            query=json.loads(function_parameter).get('message')
        )
    elif function_name == 'run_python':
        return PythonExecutorToolCallEvent(
            code=json.loads(function_parameter).get('pyCode')
        )
    elif function_name == 'link_reader':
        return LinkReaderToolCallEvent(
            urls=json.loads(function_parameter).get('url_list', [])
        )
    elif function_name == 'search_knowledge':
        args = json.loads(function_parameter)
        return KnowledgeBaseSearchToolCallEvent(
            query=args.get('query', ''),
            limit=args.get('limit', 3),
            collection_name=args.get('collection_name', ''),
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
    elif function_name == 'run_python':
        return convert_python_execute_result_to_event(
            function_parameter, function_result
        )
    elif function_name == 'link_reader':
        return convert_link_reader_result_to_event(
            function_result
        )
    elif function_name == 'search_knowledge':
        return convert_knowledge_base_result_to_event(
            function_parameter, function_result
        )

    # TODO inner tool wrapper
    return FunctionCompletedEvent(
        function_name=function_name,
        function_parameter=function_parameter,
        function_result=function_result if isinstance(function_result, str) else json.dumps(function_result),
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
            references=bot_response.references if bot_response.references else []
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


def convert_link_reader_result_to_event(raw_response: str) -> LinkReaderToolCompletedEvent:
    try:
        results: dict = json.loads(raw_response)
        error_msg: str = results.get('error', '')
        if error_msg:
            return LinkReaderToolCompletedEvent(
                success=False,
                error_msg=error_msg
            )
        ark_web_data_list: list = results.get('ark_web_data_list', [])
        return LinkReaderToolCompletedEvent(
            results=ark_web_data_list
        )
    except Exception as e:
        return LinkReaderToolCompletedEvent(
            success=False,
            error_msg=str(e)
        )


def convert_knowledge_base_result_to_event(raw_args: str, raw_response: str) -> KnowledgeBaseSearchToolCompletedEvent:
    try:
        args = json.loads(raw_args)
        results: List = json.loads(raw_response) if isinstance(raw_response, str) else raw_response
        event = KnowledgeBaseSearchToolCompletedEvent()
        for result in results:
            if result.get('type', '') == 'text':
                text_item = json.loads(result.get('text', '{}'))
                doc_info = text_item.get('doc_info', {})
                event.references.append(
                    Reference(
                        summary=text_item.get('content', ''),
                        doc_id=doc_info.get('doc_id', ''),
                        doc_name=doc_info.get('doc_name', ''),
                        doc_type=doc_info.get('doc_type', ''),
                        chunk_title=text_item.get('chunk_title', ''),
                        chunk_id=str(text_item.get('chunk_id', '')),
                        collection_name=args.get('collection_name', ''),
                    )
                )
        return event
    except Exception as e:
        return KnowledgeBaseSearchToolCompletedEvent(
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


def convert_event_to_bot_chunk(event: BaseEvent, ark_request: ArkChatRequest) -> ArkChatCompletionChunk:
    # for error, we can just raise and let error handler to handle it.
    if isinstance(event, ErrorEvent):
        raise event.api_exception

    # for eof
    if isinstance(event, EOFEvent):
        return ArkChatCompletionChunk(
            id=event.id,
            choices=[Choice(
                index=0,
                delta=ChoiceDelta(
                    content='',
                    reasoning_content='',
                    role='assistant'
                ),
                finish_reason='stop',
            )],
            created=int(time.time()),
            model=ark_request.model,
            references=event.references,
            object="chat.completion.chunk",
        )

    # build base chunk
    chunk = ArkChatCompletionChunk(
        id=event.id,
        choices=[
            Choice(
                index=0,
                delta=ChoiceDelta(
                    content=(event.delta if isinstance(event, OutputTextEvent) else ''),
                    reasoning_content=(event.delta if isinstance(event, ReasoningEvent) else ''),
                    role='assistant'
                )
            )
        ],
        created=int(time.time()),
        model=ark_request.model,
        usage=event.usage if isinstance(event, PlanningEvent) else None,
        object="chat.completion.chunk",
    )

    # build metadata
    metadata = {}
    if ark_request.metadata:
        metadata.update(ark_request.metadata)
    metadata.update({
        'session_id': event.session_id,
    })
    # only dump the non-text events
    if not isinstance(event, (OutputTextEvent, ReasoningEvent)):
        metadata.update({
            'event': event.model_dump_json(exclude_none=True, exclude={'id', 'session_id'})
        })
    chunk.metadata = metadata

    return chunk


def convert_references_to_markdown(refs: List[Reference]) -> str:
    mds = []
    for (i, ref) in enumerate(refs):
        mds.append(f"{i + 1}. [{ref.title}]({ref.url})")
    return '\n'.join(mds)
