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

"""
会话相关路由
"""

from fastapi import APIRouter, Request
import logging
import uuid
from mobile_agent.middleware.middleware import APIException
from mobile_agent.service.session.manager import session_manager
from pydantic import BaseModel, Field
from typing import Optional

logger = logging.getLogger(__name__)
# 创建路由
router = APIRouter(
    prefix="/mobile-use/api/v1/session",
    tags=["session"],
)


class CreateSessionRequest(BaseModel):
    thread_id: Optional[str] = Field(None, description="线程ID，如果不提供则自动生成")
    product_id: str = Field(..., description="产品ID")
    pod_id: str = Field(..., description="Pod ID")


@router.post("/create")
async def create_session(body: CreateSessionRequest, request: Request):
    grant = request.state.access_grant
    account_id = grant.account_id
    thread_id = body.thread_id
    product_id = body.product_id
    pod_id = body.pod_id
    grant.authorize_device(product_id, pod_id)

    if thread_id:
        session_manager.get_authorized_thread_state(thread_id, grant)
        response_json = await session_manager.validate(
            device_id=pod_id,
            product_id=product_id,
            expires_at=grant.expires_at,
        )

        logger.info(
            "更新会话状态: thread_id=%s, product_id=%s, pod_id=%s",
            thread_id,
            product_id,
            pod_id,
        )
        session = session_manager.update_thread_state(
            thread_id,
            device_info=response_json["device_info"],
            auth_info=response_json["auth_info"],
        )
    else:
        thread_id = str(uuid.uuid4())
        response_json = await session_manager.validate(
            device_id=pod_id,
            product_id=product_id,
            expires_at=grant.expires_at,
        )
        logger.info(
            "创建会话成功: thread_id=%s, product_id=%s, pod_id=%s",
            thread_id,
            product_id,
            pod_id,
        )
        session = session_manager.create_thread(
            account_id,
            thread_id,
            device_info=response_json["device_info"],
            auth_info=response_json["auth_info"],
        )
    return {
        "thread_id": thread_id,
        "chat_thread_id": session.chat_thread_id,
        "pod": {
            "token": session.sts_token.model_dump(),
            "size": session.pod_size.model_dump(),
            "product_id": session.product_id,
            "pod_id": session.pod_id,
            "expired_time": session.pod_session_expired_time,
            "account_id": session.pod_account_id,
        },
    }


class ResetSessionRequest(BaseModel):
    thread_id: str = Field(..., description="需要重置的线程ID")


@router.post("/reset")
async def reset_session(body: ResetSessionRequest, request: Request):
    """
    重置会话，保持同一个 pod 但切换到新的 chat_thread_id
    """
    thread_id = body.thread_id

    if not thread_id:
        raise APIException(code=400, message="参数不正确")

    old_session = session_manager.get_authorized_thread_state(
        thread_id, request.state.access_grant
    )

    # 生成新的 threadId
    new_chat_thread_id = str(uuid.uuid4())

    logger.info(f"重置会话: {old_session.chat_thread_id} -> {new_chat_thread_id}")

    # session 修改 chat_thread_id
    session_manager.reset_thread(thread_id, new_chat_thread_id)

    return {"thread_id": thread_id, "chat_thread_id": new_chat_thread_id}
