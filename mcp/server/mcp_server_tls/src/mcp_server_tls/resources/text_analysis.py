# Copyright 2025 Bytedance Ltd. and/or its affiliates
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import json
import logging
from typing import Optional

import httpx
from volcengine.tls.tls_exception import TLSException

from mcp_server_tls.resources.tls import TlsResource

logger = logging.getLogger(__name__)


class TlsTextAnalysisResource(TlsResource):
    """
    火山引擎日志管理资源类
    """

    def create_app_instance(
            self, instance_name: str, instance_type: str, description: Optional[str] = None
    ) -> dict:
        """
        创建app实例
        """
        body = {
            "InstanceName": instance_name,
            "InstanceType": instance_type,
        }

        if description is not None:
            body["Description"] = description

        return self.custom_api_call("/CreateAppInstance", body=body)

    def describe_app_instances(
            self,
            instance_id: Optional[str] = None,
            instance_type: Optional[str] = None,
            instance_name: Optional[str] = None,
            description: Optional[str] = None,
            page_number: int = 1,
            page_size: int = 10,
    ) -> dict:
        """
        查询app实例
        """
        params = {
            "PageNumber": page_number,
            "PageSize": page_size,
        }

        if instance_id is not None:
            params["InstanceId"] = instance_id

        if instance_type is not None:
            params["InstanceType"] = instance_type

        if instance_name is not None:
            params["InstanceName"] = instance_name

        if description is not None:
            params["Description"] = description

        return self.custom_api_call("/DescribeAppInstances", params=params)

    def create_app_scene_meta(
            self,
            instance_id: str,
            app_meta_type: str,
            id: Optional[str] = None,
            record: Optional[dict] = None,
    ) -> dict:
        """
        创建ai会话
        """
        body = {
            "InstanceId": instance_id,
            "CreateAPPMetaType": app_meta_type,
        }

        if id is not None:
            body["Id"] = id

        if record is not None:
            body["Record"] = record

        return self.custom_api_call("/CreateAppSceneMeta", body=body)

    def describe_session_answer(
            self,
            instance_id: str,
            topic_id: str,
            session_id: str,
            question: str,
            parent_message_id: Optional[str] = None,
            question_id: Optional[str] = None,
            intent: Optional[int] = None,
    ) -> httpx.Response:
        """
        查询ai语句返回
        """
        body = {
            "InstanceId": instance_id,
            "Question": question,
            "SessionId": session_id,
            "TopicId": topic_id,
        }

        if parent_message_id is not None:
            body["ParentMessageId"] = parent_message_id

        if question_id is not None:
            body["QuestionId"] = question_id

        if intent is not None:
            body["Intent"] = intent

        return self.custom_api_sse_call("/DescribeSessionAnswer", body=body)


# 实例化资源
test_analysis_resource = TlsTextAnalysisResource()


async def create_app_instance_resource(
        instance_name: str, instance_type: str, description: Optional[str] = None
) -> dict:
    try:
        result = test_analysis_resource.create_app_instance(
            instance_name, instance_type, description
        )
        return result
    except TLSException as e:
        logger.error(f"create app instance error: {e}")
        raise e


async def describe_app_instances_resource(
        instance_name: str, instance_type: Optional[str] = None
) -> dict:
    try:
        result = test_analysis_resource.describe_app_instances(
            instance_name=instance_name, instance_type=instance_type
        )
        return result
    except TLSException as e:
        logger.error(f"Describe app instance error: {e}")
        raise e


async def create_app_scene_meta_resource(
        instance_id: str,
        app_meta_type: str,
        topic_id: Optional[str] = None,
        record: Optional[dict] = None,
) -> dict:
    try:
        result = test_analysis_resource.create_app_scene_meta(
            instance_id, app_meta_type, topic_id, record
        )
        return result
    except TLSException as e:
        logger.error(f"Describe app instance error: {e}")
        raise e


async def describe_session_answer_resource(
        instance_id: str,
        topic_id: str,
        session_id: str,
        question: str,
        parent_message_id: Optional[str] = None,
        question_id: Optional[str] = None,
        intent: Optional[int] = None,
) -> str:
    answers = []
    suggestions = []
    data_prefix = "data:"

    try:
        response_sse = await test_analysis_resource.describe_session_answer(
            instance_id,
            topic_id,
            session_id,
            question,
            parent_message_id,
            question_id,
            intent,
        )

        for line in response_sse.iter_lines():
            if not line.startswith(data_prefix):
                continue

            try:
                data = json.loads(line.removeprefix(data_prefix).strip())
                answer = data.get("Message", {}).get("Answer", "")
                # 判断返回的回答类型
                rsp_msg_type = data.get("RspMsgType", None)
                match rsp_msg_type:
                    # 推理
                    case 2:
                        answers.append(answer)
                    # 建议
                    case 3:
                        suggestions = data.get("Suggestions", [])
                    case _:
                        continue
            except json.JSONDecodeError as e:
                logger.error(
                    f"Describe seesion answer error, response json decode failed: {e}"
                )

        return {
            "answer": "".join(answers),
            "suggestions": suggestions,
            "session_id": session_id,
        }
    except TLSException as e:
        logger.error(f"Describe seesion answer error: {e}")
        raise e
