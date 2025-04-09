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
from typing import Any, Optional

from pydantic import BaseModel

from arkitect.core.component.context.hooks import PostToolCallHook
from arkitect.core.component.context.model import State
from state.global_state import GlobalState
from utils.converter import (
    convert_bot_search_result_to_event,
    convert_python_execute_result_to_event,
    convert_references_to_format_str,
    convert_link_reader_result_to_event,
    convert_knowledge_base_result_to_event,
)


class SearcherPostToolCallHook(BaseModel, PostToolCallHook):
    global_state: GlobalState

    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True

    async def post_tool_call(
        self,
        name: str,
        arguments: str,
        response: Any,
        exception: Optional[Exception],
        state: State,
    ) -> State:
        if name == "web_search":
            return await self._web_search_post_tool_call(
                arguments, response, exception, state
            )
        elif name == "link_reader":
            return await self._link_reader_post_tool_call(
                arguments, response, exception, state
            )
        return state

    async def _web_search_post_tool_call(
        self,
        arguments: str,
        response: Any,
        exception: Optional[Exception],
        state: State,
    ) -> State:

        event = convert_bot_search_result_to_event(arguments, response)

        if event.success:
            state.messages[-1].update(
                {
                    "content": f"""
                    [搜索总结]

                    {event.summary}

                    [参考资料]
                    {convert_references_to_format_str(event.references)}
                    """
                }
            )
            # save references
            self.global_state.custom_state.references += event.references
        else:
            state.messages[-1].update({"content": f"执行工具错误：{event.error_msg}"})

        return state

    async def _link_reader_post_tool_call(
        self,
        arguments: str,
        response: Any,
        exception: Optional[Exception],
        state: State,
    ) -> State:

        event = convert_link_reader_result_to_event(response)

        if not event.success:
            state.messages[-1].update({"content": f"执行工具错误：{event.error_msg}"})
        else:
            # format the link reader
            texts = []
            for result in event.results:
                url = result.get("url", "")
                text = result.get("content", "")
                texts.append(
                    f"读取到{url}网页的内容为：{text[:2000]}"
                )  # avoid too much contents

            state.messages[-1].update({"content": "\n".join(texts)})

        return state


class KnowledgeBasePostToolCallHook(BaseModel, PostToolCallHook):
    global_state: GlobalState

    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True

    async def post_tool_call(
        self,
        name: str,
        arguments: str,
        response: Any,
        exception: Optional[Exception],
        state: State,
    ) -> State:
        if name == "search_knowledge":
            event = convert_knowledge_base_result_to_event(
                arguments, json.dumps(response)
            )
            if event:
                texts = ["检索到以下内容："]
                for ref in event.references:
                    texts.append(
                        f"- [文件名：{ref.doc_name}](分块名：{ref.chunk_title})"
                    )
                    texts.append(f"\n{ref.summary}")
                state.messages[-1]["content"] = "\n".join(texts)
                self.global_state.custom_state.references += event.references

        return state


class PythonExecutorPostToolCallHook(BaseModel, PostToolCallHook):
    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True

    async def post_tool_call(
        self,
        name: str,
        arguments: str,
        response: Any,
        exception: Optional[Exception],
        state: State,
    ) -> State:
        if name != "run_python":
            return state

        event = convert_python_execute_result_to_event(arguments, response)

        if event.success:
            state.messages[-1].update({"content": event.stdout})
        else:
            state.messages[-1].update({"content": f"执行工具错误：{event.error_msg}"})

        return state


class TLSPostToolCallHook(BaseModel, PostToolCallHook):
    class Config:
        """Configuration for this pydantic object."""

        arbitrary_types_allowed = True

    async def post_tool_call(
        self,
        name: str,
        arguments: str,
        response: Any,
        exception: Optional[Exception],
        state: State,
    ) -> State:
        if name != "get_recent_logs" and name != "search_logs":
            return state

        tool_resp = state.messages[-1].get("content", [])
        print(tool_resp)
        if not isinstance(tool_resp, list):
            return state
        content = ""
        for part in tool_resp:
            content += part["text"]
        state.messages[-1].update({"content": content})
        return state
