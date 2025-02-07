# Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from __future__ import annotations

import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple, Union

import jinja2
import pytz
from jinja2 import Template
from langchain.prompts.chat import BaseChatPromptTemplate
from langchain.schema.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    get_buffer_string,
)
from pydantic.v1 import validator

from arkitect.core.component.llm.model import ArkChatRequest


class CustomPromptTemplate(BaseChatPromptTemplate):
    input_variables: List[str] = ["messages"]
    """List of input variables in template messages. Used for validation."""

    template: Template
    """
    Jinja2 template for prompt generation. Variables available in the context are:
    - time_info, string, formatted datetime. e.g., "2022年10月25日15时星期一".
    - location_info, string, if not provided use empty string. e.g., "北京市海淀区".
    - systems, list of string, system prompts.
    - questions, list of string, human prompts, including the current question.
    - answers, list of string, AI answers.
    - query, the current question.
    """

    keep_history_systems: bool = False
    keep_history_answers: bool = False
    keep_history_questions: bool = False
    chat_history_keep_human: bool = False
    chat_history_keep_ai: bool = False
    chat_history_len_limit: int = 0

    @classmethod
    @validator("template", pre=True)
    def validate_template(cls, v: Union[str, Template]) -> Template:
        if isinstance(v, str):
            env = jinja2.Environment()

            def _datetime_format(
                value: Union[str, datetime], format: Optional[str] = None
            ) -> str:
                def _gen_time_info(t: datetime) -> str:
                    weekdays = [
                        "星期一",
                        "星期二",
                        "星期三",
                        "星期四",
                        "星期五",
                        "星期六",
                        "星期日",
                    ]  # `tm_wday` 0~6, 6 means Sunday
                    return f'{t.strftime("%Y年%m月%d日%H时")}{weekdays[t.weekday()]}'

                if isinstance(value, str):
                    value = datetime.fromisoformat(value)

                if not format:
                    return _gen_time_info(value)

                return value.strftime(format)

            env.filters["datetime_format"] = _datetime_format
            return env.from_string(v)
        return v

    def _gen_location_info(
        self, location_info: Optional[Tuple[str, str]] = None
    ) -> str:
        city, district = location_info if location_info else ("", "")
        return city + district

    def _must_str(self, content: Union[str, List[Union[str, Dict]], Dict]) -> str:
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            return "\n".join([self._must_str(c) for c in content])
        if isinstance(content, dict):
            return ""

    def _validate_and_fetch_questions_and_answers(
        self, messages: List[BaseMessage]
    ) -> Tuple[List[str], List[str], List[str]]:
        systems: List[str] = [
            self._must_str(msg.content) for msg in messages if msg.type == "system"
        ]
        questions: List[BaseMessage] = [msg for msg in messages if msg.type == "human"]
        answers: List[BaseMessage] = [msg for msg in messages if msg.type == "ai"]

        return (
            systems,
            [self._must_str(msg.content) for msg in questions],
            [self._must_str(msg.content) for msg in answers],
        )

    def _build_chat_history(self, messages: List[BaseMessage]) -> str:
        histories: List[Union[AIMessage, HumanMessage]] = []
        if len(messages) == 0:
            raise ValueError("No user question found in the request")
        elif len(messages) > 1:
            for msg in messages[:-1]:
                if isinstance(msg, HumanMessage) and self.chat_history_keep_human:
                    histories.append(msg)
                elif isinstance(msg, AIMessage) and self.chat_history_keep_ai:
                    histories.append(msg)

        if self.chat_history_len_limit > 0:
            history_len = sum([len(msg.content) for msg in histories])
            while history_len > self.chat_history_len_limit:
                history_len -= len(histories.pop(0).content)

        if len(histories) > 0:
            chat_history = get_buffer_string(
                histories, human_prefix="User", ai_prefix="Assistant"
            )
        else:
            chat_history = "无"
        return chat_history

    def format_messages(self, **kwargs: Any) -> List[BaseMessage]:
        """Format original messages into a single Human message.

        Args:
            messages: list of original messages.
            time_info: datetime, if not provided use current time.
            user_info: dict, some user info, e.g., {"city": "北京", "district": "海淀"}

        Returns:
            Formatted message
        """
        if "messages" not in kwargs:
            raise ValueError("Must provide messages: List[BaseMessage]")

        messages: List[BaseMessage] = kwargs.pop("messages")
        systems, questions, answers = self._validate_and_fetch_questions_and_answers(
            messages
        )
        time_info = kwargs.pop("time_info", datetime.now())

        user_info = kwargs.pop("user_info", {})
        city, district = (
            user_info.get("city", ""),
            user_info.get("district", ""),
        )
        location_info = self._gen_location_info(location_info=(city, district))
        chat_history = self._build_chat_history(messages)

        final_prompt = self.template.render(
            time_info=time_info,
            location_info=location_info,
            systems=systems,
            questions=questions,
            answers=answers,
            query=questions[-1] if len(questions) > 0 else "",
            user_info=user_info,
            chat_history=chat_history,
            **kwargs,  # for extra variables
        )

        if (
            not self.keep_history_systems
            and not self.keep_history_answers
            and not self.keep_history_questions
        ):
            return [HumanMessage(content=final_prompt)]
        elif (
            not self.keep_history_answers and not self.keep_history_questions
        ):  # keep system messages
            return [SystemMessage(content=system) for system in systems] + [
                HumanMessage(content=final_prompt)
            ]
        else:  # keep human or ai messages
            final_messages = []
            for message in messages:
                if message.type == "system" and not self.keep_history_systems:
                    continue
                elif message.type == "human":
                    if not self.keep_history_questions:
                        message = message.copy(update={"content": ""})
                elif message.type == "ai" and not self.keep_history_answers:
                    message = message.copy(update={"content": ""})
                final_messages.append(message)
            return final_messages


def format_current_meta_info(request: ArkChatRequest) -> str:
    user_info = request.get_user_info_extra()
    meta_info = f"当前时间：{format_time_info(int(time.time()))}"
    if user_info:
        meta_info += f"\n当前位置：{user_info.city or ''}{user_info.district or ''}"
    return meta_info


def format_time_info(timestamp: int, zone: str = "Asia/Shanghai") -> str:
    dt = datetime.fromtimestamp(timestamp)
    cst = pytz.timezone(zone)
    dt_cst = dt.astimezone(cst)
    weekdays = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]
    _time_info = dt_cst.strftime("%Y年%m月%d日 %H:%M:%S")
    _time_info += "(CST) "
    _time_info += weekdays[dt_cst.weekday()]
    return _time_info
